import { sql, type Route } from '@/lib/db';
import Atlas from '@/components/Atlas';

export const dynamic = 'force-dynamic';

export default async function Page() {
  // next_date is a Postgres `date`; the driver hands back a JS Date, which
  // survives the RSC boundary as a Date and breaks string handling in the
  // client. Cast it so the wire format matches the declared type.
  const routes = (await sql`
    select id, name, org, sectors, src, verdict, condition, status, tag,
           facts, kv, why, warn, applicants, pattern, syllabus, ranks,
           vacancies, vac_cse, vac_note, vac_stale, basic, pay_level,
           next_date::text as next_date, next_kind, next_act, next_est, sort_order
    from routes order by sort_order asc`) as unknown as Route[];

  const counts = await sql`
    select
      (select count(*)::int from listings l
        left join decisions d on d.url = l.url
        where l.is_job and d.url is null) as inbox,
      (select count(*)::int from decisions where status = 'applied') as applied`;

  return (
    <Atlas
      routes={routes}
      inbox={(counts[0] as { inbox: number }).inbox}
      applied={(counts[0] as { applied: number }).applied}
    />
  );
}
