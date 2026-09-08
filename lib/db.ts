import { neon } from '@neondatabase/serverless';

/**
 * Neon's HTTP driver rather than a TCP pool: this app runs on serverless
 * functions where holding connections open across invocations is the usual
 * way to exhaust the connection limit.
 *
 * DATABASE_URL comes from .env.local locally and from the Vercel project's
 * environment variables in production. It is never committed.
 */
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env.local and paste your ' +
      'Neon connection string, or add it in the Vercel project settings.'
  );
}

export const sql = neon(process.env.DATABASE_URL);

/* ---------- row shapes ---------- */

export type Listing = {
  url: string;
  title: string;
  sections: string[];
  vacancies: number | null;
  tags: string[];
  sub_graduate: boolean;
  is_job: boolean;
  first_seen: string;
  last_seen: string;
  /** joined from decisions */
  status?: 'applied' | 'rejected' | null;
  decided_at?: string | null;
};

export type Route = {
  id: string;
  name: string;
  org: string;
  sectors: string[];
  src: 'p' | 's' | 'u';
  verdict: 'go' | 'cond' | 'no';
  condition: string | null;
  status: string;
  tag: string | null;
  facts: Record<string, string> | null;
  kv: [string, string][] | null;
  why: string | null;
  warn: string | null;
  applicants: { n: string; src: string } | null;
  pattern: { src: string; note?: string; rows: string[][] } | null;
  syllabus: { src: string; note?: string; items: [string, string][] } | null;
  ranks: { src: string; note?: string; rows: string[][] } | null;
  vacancies: number | null;
  vac_cse: number | null;
  vac_note: string | null;
  vac_stale: boolean;
  basic: number | null;
  pay_level: number | null;
  next_date: string | null;
  next_kind: string | null;
  next_act: boolean | null;
  next_est: boolean | null;
  sort_order: number;
};
