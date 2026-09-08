# Exam Atlas

A personal tracker of Indian government recruitment routes for a B.Tech CSE
graduate, plus a daily scrape of new job listings.

## What's here

| Path | Purpose |
|---|---|
| `index.html` | The site. 46 researched recruitment routes, filterable and sortable, plus a live listings panel. |
| `scrape.py` | Daily scraper for sarkariresult.com.cm → `data/listings.json`. |
| `data/listings.json` | Scraped listings, with `first_seen` tracking so new arrivals are flagged. |
| `serve.py` | Local static server on :3000 that sends an explicit UTF-8 charset. |
| `run-scrape.bat` | Wrapper for Windows Task Scheduler. |
| `.github/workflows/scrape.yml` | Runs the scraper daily at 02:00 UTC (07:30 IST) and commits changes. |

## Running locally

```bash
python serve.py          # then open http://localhost:3000
python scrape.py         # refresh listings by hand
```

## On the data

Two very different tiers of confidence live in this page, and they are kept
visually separate:

- **Researched rows** carry a source mark — ◆ read from an official site or
  notification PDF, ◇ corroborated across independent sources, ○ single
  source or background knowledge. 30 of the 46 routes were actually verified;
  the other 16 are catalogued but explicitly marked *Not researched*.
- **Live listings** are scraped from an unofficial, ad-supported aggregator
  that states on its own pages that it is not associated with government
  websites. They are leads to check against the issuing body's own
  notification — never a basis for paying an application fee.

Vacancy figures marked `°` are from a past cycle with no live advertisement.
Pay figures are **basic** (the 7th CPC entry cell for that level), never gross
or in-hand.

Dates move and corrigenda get issued. A notification PDF always overrides
anything here.
