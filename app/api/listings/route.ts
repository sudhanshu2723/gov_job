import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Listings with their triage decision joined on, newest first. */
export async function GET() {
  const rows = await sql`
    select l.url, l.title, l.sections, l.vacancies, l.tags, l.sub_graduate,
           l.is_job, l.first_seen::text as first_seen, l.last_seen::text as last_seen,
           d.status, d.decided_at
    from listings l
    left join decisions d on d.url = l.url
    order by l.first_seen desc, l.vacancies desc nulls last`;

  const run = await sql`
    select ran_at, ok, scraped, new_count, message
    from scrape_runs order by ran_at desc limit 1`;

  return Response.json({ listings: rows, lastRun: run[0] ?? null });
}
