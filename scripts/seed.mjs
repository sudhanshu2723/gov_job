/**
 * Lifts the curated atlas out of the old static index.html and upserts it
 * into Postgres. Extracting rather than retyping keeps the 46 routes exactly
 * as researched - no transcription drift.
 *
 *   npm run seed
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const m = env.match(/DATABASE_URL\s*=\s*"?([^"\n]+)"?/);
  if (m) process.env.DATABASE_URL = m[1];
}
const sql = neon(process.env.DATABASE_URL);

/* ---------- pull EXAMS + METRICS out of the old page ---------- */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
// Stop before the render section: everything after it touches the DOM.
const dataPart = script.split('/* ---------- render ---------- */')[0];

const sandbox = { console, document: { getElementById: () => null } };
vm.createContext(sandbox);
vm.runInContext(dataPart + '\n;globalThis.__out = EXAMS;', sandbox);
const exams = sandbox.__out;

console.log(`extracted ${exams.length} routes from index.html`);

/* ---------- upsert ---------- */

let done = 0;
for (const [i, e] of exams.entries()) {
  const v = e.v ?? {};
  const pay = e.pay ?? {};
  const d = e.d ?? {};
  await sql`
    insert into routes (
      id, name, org, sectors, src, verdict, condition, status, tag,
      facts, kv, why, warn, applicants, pattern, syllabus, ranks,
      vacancies, vac_cse, vac_note, vac_stale,
      basic, pay_level, next_date, next_kind, next_act, next_est, sort_order
    ) values (
      ${e.id}, ${e.name}, ${e.org}, ${e.sector}, ${e.src}, ${e.verdict},
      ${e.condition ?? null}, ${e.status}, ${e.tag ?? null},
      ${JSON.stringify(e.facts ?? null)}, ${JSON.stringify(e.kv ?? null)},
      ${e.why ?? null}, ${e.warn ?? null},
      ${JSON.stringify(e.applicants ?? null)}, ${JSON.stringify(e.pattern ?? null)},
      ${JSON.stringify(e.syllabus ?? null)}, ${JSON.stringify(e.ranks ?? null)},
      ${v.n ?? null}, ${v.cse ?? null}, ${v.note ?? null}, ${v.stale ?? false},
      ${pay.basic ?? null}, ${pay.level ?? null},
      ${d.iso ?? null}, ${d.kind ?? null}, ${d.act ?? null}, ${d.est ?? null},
      ${i}
    )
    on conflict (id) do update set
      name=excluded.name, org=excluded.org, sectors=excluded.sectors,
      src=excluded.src, verdict=excluded.verdict, condition=excluded.condition,
      status=excluded.status, tag=excluded.tag, facts=excluded.facts,
      kv=excluded.kv, why=excluded.why, warn=excluded.warn,
      applicants=excluded.applicants, pattern=excluded.pattern,
      syllabus=excluded.syllabus, ranks=excluded.ranks,
      vacancies=excluded.vacancies, vac_cse=excluded.vac_cse,
      vac_note=excluded.vac_note, vac_stale=excluded.vac_stale,
      basic=excluded.basic, pay_level=excluded.pay_level,
      next_date=excluded.next_date, next_kind=excluded.next_kind,
      next_act=excluded.next_act, next_est=excluded.next_est,
      sort_order=excluded.sort_order`;
  done++;
}

/* ---------- carry over any previously scraped listings ---------- */

let carried = 0;
try {
  const feed = JSON.parse(readFileSync(new URL('../data/listings.json', import.meta.url), 'utf8'));
  for (const r of feed.listings) {
    await sql`
      insert into listings (url, title, sections, vacancies, tags, sub_graduate, is_job, first_seen, last_seen)
      values (${r.url}, ${r.title}, ${r.sections ?? []}, ${r.vacancies ?? null},
              ${r.tags ?? []}, ${r.sub_graduate ?? false}, ${r.is_job ?? false},
              ${r.first_seen}, ${r.last_seen})
      on conflict (url) do nothing`;
    carried++;
  }
} catch {
  console.log('no data/listings.json to carry over');
}

const [{ routes }] = await sql`select count(*)::int as routes from routes`;
const [{ listings }] = await sql`select count(*)::int as listings from listings`;
console.log(`upserted ${done} routes, carried ${carried} listings`);
console.log(`db now: ${routes} routes, ${listings} listings`);
