import { sql } from './db';

/**
 * Scraper for sarkariresult.com.cm, ported from the Python version.
 *
 * The source is an unofficial ad-supported aggregator that states on its own
 * pages that it is not associated with government websites, so every row is a
 * lead to verify, never a fact. robots.txt allows all agents with no
 * crawl-delay; this runs once a day.
 */

const URL_SRC = 'https://sarkariresult.com.cm/';
const UA = 'Mozilla/5.0 (compatible; personal-job-tracker/1.0; 1 request/day)';

/** Sections that are actual vacancies; the rest are results, admit cards etc. */
const JOB_SECTIONS = new Set([
  'Latest Jobs',
  '10th/ITI Jobs',
  'Outsourcing Jobs',
  'Featured',
]);

/** Relevance tags. Stored so the reason a row was flagged stays visible. */
const TAGS: Record<string, RegExp> = {
  cse: /\b(computer|software|programmer|informatics|it officer|cyber|system)\b/,
  engineering: /\b(engineer|engineering|technical|junior engineer|\bje\b|\bae\b|scientist)\b/,
  graduate: /\b(graduate|degree|\bpo\b|\bso\b|officer|assistant|inspector|clerk|\bpcs\b|\bcgl\b)\b/,
  rajasthan: /\b(rajasthan|rpsc|rssb|rsmssb|rvunl|rrvunl|jvvnl|jaipur)\b/,
  banking: /\b(ibps|sbi|\brbi\b|nabard|sebi|bank|insurance|\blic\b|niacl)\b/,
  railway: /\b(railway|\brrb\b|\brpf\b|metro|\bntpc\b)\b/,
  defence: /\b(army|navy|air force|afcat|\bcds\b|coast guard|capf|\bbsf\b|\bcrpf\b|\bcisf\b)\b/,
};

const SUB_GRADUATE =
  /\b(10th|12th|10\+2|\biti\b|matric|safai|peon|sweeper|gds|gramin dak|chowkidar|helper)\b/;

const VACANCY = /\(\s*([\d,]{2,10})\s*(?:posts?|vacanc\w*)\s*\)/i;

const unescapeHtml = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#8211;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');

const clean = (frag: string) => unescapeHtml(frag.replace(/<[^>]+>/g, '')).trim();

export type Scraped = {
  url: string;
  title: string;
  sections: string[];
  vacancies: number | null;
  tags: string[];
  sub_graduate: boolean;
  is_job: boolean;
};

export function parse(page: string): Scraped[] {
  const heads = [...page.matchAll(/<p class="gb-headline[^"]*"[^>]*>([\s\S]*?)<\/p>/g)].map(
    (m) => [m.index!, clean(m[1])] as const
  );

  // Keyed by URL: the same posting is listed under several sections. Letting
  // one overwrite the others files real jobs under "Syllabus" and hides the
  // largest listings, so accumulate every section instead.
  const rows = new Map<string, Scraped>();

  const add = (url: string, title: string, section: string) => {
    const existing = rows.get(url);
    if (existing) {
      if (!existing.sections.includes(section)) existing.sections.push(section);
      return;
    }
    const low = title.toLowerCase();
    const vac = VACANCY.exec(title);
    rows.set(url, {
      url,
      title,
      sections: [section],
      vacancies: vac ? Number(vac[1].replace(/,/g, '')) : null,
      tags: Object.entries(TAGS)
        .filter(([, re]) => re.test(low))
        .map(([t]) => t)
        .sort(),
      sub_graduate: SUB_GRADUATE.test(low),
      is_job: false,
    });
  };

  for (const m of page.matchAll(/<ul class="wp-block-latest-posts__list[\s\S]*?<\/ul>/g)) {
    const prior = heads.filter(([pos]) => pos < m.index!);
    const section = (prior.length ? prior[prior.length - 1][1] : 'Unknown')
      .replace(/\s+/g, ' ')
      .trim();
    for (const a of m[0].matchAll(
      /<a class="wp-block-latest-posts__post-title" href="([^"]+)">([\s\S]*?)<\/a>/g
    )) {
      const title = clean(a[2]);
      if (title) add(a[1], title, section);
    }
  }

  // The top ticker carries the featured vacancies, and several never appear in
  // the lists below. Each headline can wrap SEVERAL anchors, the first ones
  // empty and pointing elsewhere, so take the anchor that holds the text.
  for (const head of page.matchAll(/<p class="gb-headline[^"]*"[^>]*>([\s\S]*?)<\/p>/g)) {
    for (const a of head[1].matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const title = clean(a[2]);
      if (!title || !a[1].includes('sarkariresult.com.cm')) continue;
      const existing = rows.get(a[1]);
      if (existing) {
        if (!existing.sections.includes('Featured')) existing.sections.unshift('Featured');
      } else {
        add(a[1], title, 'Featured');
      }
      break; // one posting per headline
    }
  }

  for (const r of rows.values()) r.is_job = r.sections.some((s) => JOB_SECTIONS.has(s));
  return [...rows.values()];
}

export type ScrapeResult = {
  ok: boolean;
  scraped: number;
  new_count: number;
  message: string;
};

export async function runScrape(): Promise<ScrapeResult> {
  let page: string;
  try {
    const res = await fetch(URL_SRC, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    page = await res.text();
  } catch (err) {
    const message = `fetch failed: ${(err as Error).message} — previous data kept`;
    await sql`insert into scrape_runs (ok, message) values (false, ${message})`;
    return { ok: false, scraped: 0, new_count: 0, message };
  }

  const scraped = parse(page);
  if (scraped.length === 0) {
    // A layout change lands here. Keep the existing rows and say so loudly
    // rather than wiping good data.
    const message = 'parsed 0 listings — site layout may have changed, previous data kept';
    await sql`insert into scrape_runs (ok, message) values (false, ${message})`;
    return { ok: false, scraped: 0, new_count: 0, message };
  }

  // One statement, not one per row. Looping 141 inserts over Neon's HTTP
  // driver took ~50s, which would trip the serverless function timeout.
  // `xmax = 0` is true only for rows this statement actually inserted, so it
  // distinguishes new postings from updated ones without extra count queries.
  const upserted = await sql`
    insert into listings (url, title, sections, vacancies, tags, sub_graduate, is_job, first_seen, last_seen)
    select x.url, x.title, x.sections, x.vacancies, x.tags, x.sub_graduate, x.is_job,
           current_date, current_date
    from jsonb_to_recordset(${JSON.stringify(scraped)}::jsonb) as x(
      url text, title text, sections text[], vacancies int,
      tags text[], sub_graduate boolean, is_job boolean
    )
    on conflict (url) do update set
      title = excluded.title,
      sections = excluded.sections,
      vacancies = excluded.vacancies,
      tags = excluded.tags,
      sub_graduate = excluded.sub_graduate,
      is_job = excluded.is_job,
      last_seen = current_date
    returning (xmax = 0) as inserted`;
  const new_count = (upserted as unknown as { inserted: boolean }[]).filter(
    (r) => r.inserted
  ).length;

  const message = `ok scraped=${scraped.length} new=${new_count}`;
  await sql`insert into scrape_runs (ok, scraped, new_count, message)
            values (true, ${scraped.length}, ${new_count}, ${message})`;
  return { ok: true, scraped: scraped.length, new_count, message };
}
