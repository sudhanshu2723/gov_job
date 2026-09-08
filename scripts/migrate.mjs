/**
 * Creates the schema. Safe to re-run: every statement is IF NOT EXISTS.
 *   npm run migrate
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

// .env.local is Next's convention; dotenv/config only reads .env
if (!process.env.DATABASE_URL) {
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const m = env.match(/DATABASE_URL\s*=\s*"?([^"\n]+)"?/);
    if (m) process.env.DATABASE_URL = m[1];
  } catch {
    /* fall through to the error below */
  }
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set. Put it in .env.local');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const statements = [
  // ---- scraped job postings -------------------------------------------
  `create table if not exists listings (
     url          text primary key,
     title        text        not null,
     sections     text[]      not null default '{}',
     vacancies    integer,
     tags         text[]      not null default '{}',
     sub_graduate boolean     not null default false,
     is_job       boolean     not null default false,
     first_seen   date        not null default current_date,
     last_seen    date        not null default current_date
   )`,
  `create index if not exists listings_job_idx   on listings (is_job, first_seen desc)`,
  `create index if not exists listings_first_idx on listings (first_seen desc)`,

  // ---- accept / reject triage -----------------------------------------
  // Deleting a decision returns the posting to the inbox, which is exactly
  // what "undo" and "back to inbox" do.
  `create table if not exists decisions (
     url        text primary key references listings(url) on delete cascade,
     status     text        not null check (status in ('applied','rejected')),
     decided_at timestamptz not null default now(),
     note       text
   )`,
  `create index if not exists decisions_status_idx on decisions (status, decided_at desc)`,

  // ---- scraper run history --------------------------------------------
  `create table if not exists scrape_runs (
     id        serial primary key,
     ran_at    timestamptz not null default now(),
     ok        boolean     not null,
     scraped   integer     not null default 0,
     new_count integer     not null default 0,
     message   text
   )`,

  // ---- the curated atlas ----------------------------------------------
  `create table if not exists routes (
     id         text primary key,
     name       text    not null,
     org        text    not null,
     sectors    text[]  not null default '{}',
     src        text    not null,
     verdict    text    not null,
     condition  text,
     status     text    not null,
     tag        text,
     facts      jsonb,
     kv         jsonb,
     why        text,
     warn       text,
     applicants jsonb,
     pattern    jsonb,
     syllabus   jsonb,
     ranks      jsonb,
     vacancies  integer,
     vac_cse    integer,
     vac_note   text,
     vac_stale  boolean not null default false,
     basic      integer,
     pay_level  integer,
     next_date  date,
     next_kind  text,
     next_act   boolean,
     next_est   boolean,
     sort_order integer not null default 0
   )`,
  `create index if not exists routes_vac_idx  on routes (vacancies desc nulls last)`,
  `create index if not exists routes_date_idx on routes (next_date asc nulls last)`,
];

for (const [i, stmt] of statements.entries()) {
  const label = stmt.slice(0, 60).replace(/\s+/g, ' ');
  try {
    await sql.query(stmt);
    console.log(`  ${String(i + 1).padStart(2)} ok   ${label}...`);
  } catch (err) {
    console.error(`  ${String(i + 1).padStart(2)} FAIL ${label}...`);
    console.error('       ', err.message);
    process.exit(1);
  }
}

const tables = await sql`
  select table_name, (select count(*) from information_schema.columns c
                      where c.table_name = t.table_name) as cols
  from information_schema.tables t
  where table_schema = 'public' order by table_name`;
console.log('\nSchema now:');
for (const t of tables) console.log(`  ${t.table_name.padEnd(14)} ${t.cols} columns`);
