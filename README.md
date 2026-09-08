# Exam Atlas

Government recruitment routes for a B.Tech CSE graduate, with a daily-scraped
job inbox. Next.js + Neon Postgres.

## Stack

| Piece | What |
|---|---|
| Next.js 16 (App Router) | server-rendered pages, API routes |
| Neon Postgres | 46 curated routes, scraped listings, triage decisions |
| `@neondatabase/serverless` | HTTP driver — no connection pool to exhaust on serverless |
| Vercel Cron | hits `/api/scrape` daily at 02:00 UTC (07:30 IST) |

## Pages

- `/` — the atlas: 46 routes, filterable and sortable, with vacancies, pay,
  paper pattern, syllabus and rank-to-post tables
- `/notifications` — inbox of scraped postings, accept or reject each
- `/applied` — everything accepted, with a way back to the inbox

Accept/reject decisions live in Postgres, so they follow you across devices.

## Setup

```bash
cp .env.example .env.local     # paste your Neon connection string
npm install
npm run migrate                # create the schema (safe to re-run)
npm run seed                   # load the 46 routes + any existing listings
npm run dev                    # http://localhost:3000
```

## API

| Route | Method | Purpose |
|---|---|---|
| `/api/listings` | GET | listings joined with their decision |
| `/api/decisions` | POST | `{url, status:'applied'\|'rejected'}` |
| `/api/decisions?url=…` | DELETE | undo — returns the posting to the inbox |
| `/api/decisions?all=rejected` | DELETE | restore every rejected posting |
| `/api/scrape` | GET/POST | run the scrape; guarded by `CRON_SECRET` |

## Deploying to Vercel

1. Import the repo at vercel.com
2. Add environment variables:
   - `DATABASE_URL` — the Neon string
   - `CRON_SECRET` — any long random string; Vercel sends it as a bearer token
     so the scrape endpoint is not publicly triggerable
3. Deploy. `vercel.json` registers the daily cron automatically.

## On the data

Two tiers of confidence, kept visually separate:

- **Curated routes** carry a source mark — ◆ read from an official site or
  notification PDF, ◇ corroborated across independent sources, ○ single
  source or background knowledge. 30 of 46 were actually verified; the other
  16 are catalogued but marked *Not researched*.
- **Scraped listings** come from an unofficial ad-supported aggregator that
  states it is not associated with government websites. They are leads to
  check against the issuing body's own notification — never grounds for
  paying a fee.

Vacancies marked `°` are from a past cycle. Pay figures are **basic** (the
7th CPC entry cell), never gross or in-hand. A notification PDF always
overrides anything here.

## Legacy

`index.html`, `notifications.html`, `applied.html`, `assets/` and `scrape.py`
are the previous static version, still served by GitHub Pages. `scripts/seed.mjs`
reads the route data out of `index.html`, so do not delete it before moving
that data elsewhere. The GitHub Actions workflow still runs the Python
scraper — see the note in the deployment section about picking one pipeline.

## Security

`.env*` is gitignored. Never commit the connection string; rotate it in the
Neon console if it is ever exposed.
