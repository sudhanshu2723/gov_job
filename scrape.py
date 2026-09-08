"""Daily scraper for sarkariresult.com.cm -> data/listings.json

The source is an unofficial, ad-supported aggregator that states on its own
pages that it is "not associated with official or Government websites". So
everything written here is a LEAD, never a fact: the atlas renders these rows
at the lowest confidence tier and every one still needs checking against the
issuing body's own notification before you pay a fee.

Politeness: one request per day, identifying User-Agent, generous timeout.
robots.txt (checked 2026-09-08) allows all agents with no crawl-delay.

Safety: the JSON is only rewritten after a successful parse, and writes are
atomic, so a failed or half-served fetch leaves yesterday's data intact.
"""
import json
import os
import re
import sys
import html
import datetime
import tempfile

import requests

URL = "https://sarkariresult.com.cm/"
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data", "listings.json")
LOG = os.path.join(ROOT, "data", "scrape.log")
UA = "Mozilla/5.0 (compatible; personal-job-tracker/1.0; 1 request/day)"
TIMEOUT = 45

# Sections that are actual vacancies. The rest of the page is results,
# admit cards, answer keys, syllabus and admission notices.
JOB_SECTIONS = {"Latest Jobs", "10th/ITI Jobs", "Outsourcing Jobs", "Featured"}

# Relevance to a B.Tech CSE graduate. Tags are stored so the reason a row
# was flagged is always visible, rather than hidden in a score.
TAGS = {
    "cse": r"\b(computer|software|programmer|informatics|it officer|cyber|data entry operator|system)\b",
    "engineering": r"\b(engineer|engineering|technical|junior engineer|\bje\b|\bae\b|scientist)\b",
    "graduate": r"\b(graduate|degree|\bpo\b|\bso\b|officer|assistant|inspector|clerk|\bpcs\b|\bcgl\b)\b",
    "rajasthan": r"\b(rajasthan|rpsc|rssb|rsmssb|rvunl|rrvunl|jvvnl|jaipur)\b",
    "banking": r"\b(ibps|sbi|\brbi\b|nabard|sebi|bank|insurance|\blic\b|niacl)\b",
    "railway": r"\b(railway|\brrb\b|\brpf\b|metro|\bntpc\b)\b",
    "defence": r"\b(army|navy|air force|afcat|\bcds\b|coast guard|capf|\bbsf\b|\bcrpf\b|\bcisf\b)\b",
}
# Clearly below a graduate's level - flagged so they can be filtered out.
SUB_GRADUATE = r"\b(10th|12th|10\+2|\biti\b|matric|safai|peon|sweeper|gds|gramin dak|chowkidar|helper)\b"

VACANCY = re.compile(r"\(\s*([\d,]{2,10})\s*(?:posts?|vacanc\w*)\s*\)", re.I)


def log(msg):
    line = f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S}  {msg}"
    print(line)
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def clean(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def parse(page):
    """Pair each latest-posts list with its nearest preceding headline.

    The page carries more headlines than lists - the extras are scrolling
    ticker text - so walking forward from a headline mis-assigns most of
    them. Walking back from each list is what actually holds.
    """
    heads = [
        (m.start(), clean(m.group(1)))
        for m in re.finditer(r'<p class="gb-headline[^"]*"[^>]*>(.*?)</p>', page, re.S)
    ]
    # Keyed by URL: the same posting is listed under several sections (a
    # vacancy also appears under Syllabus, Admit Card and so on). Collect
    # every section it appears in - letting one overwrite the others files
    # real jobs under "Syllabus" and hides the largest listings.
    rows = {}
    for lst in re.finditer(r'<ul class="wp-block-latest-posts__list.*?</ul>', page, re.S):
        prior = [name for pos, name in heads if pos < lst.start()]
        section = re.sub(r"\s+", " ", prior[-1] if prior else "Unknown").strip()
        for url, raw in re.findall(
            r'<a class="wp-block-latest-posts__post-title" href="([^"]+)">(.*?)</a>',
            lst.group(0),
            re.S,
        ):
            title = clean(raw)
            if not title:
                continue
            if url in rows:
                if section not in rows[url]["sections"]:
                    rows[url]["sections"].append(section)
                continue
            low = title.lower()
            vac = VACANCY.search(title)
            rows[url] = {
                "title": title,
                "url": url,
                "sections": [section],
                "vacancies": int(vac.group(1).replace(",", "")) if vac else None,
                "tags": sorted(t for t, pat in TAGS.items() if re.search(pat, low)),
                "sub_graduate": bool(re.search(SUB_GRADUATE, low)),
            }
    # The scrolling ticker at the top carries the site's featured vacancies,
    # and they hold the largest counts - several never appear in the lists
    # below. Each ticker headline can wrap SEVERAL anchors, the first ones
    # empty and pointing elsewhere, so take the anchor that actually
    # contains the text rather than the first href in the block.
    for head in re.finditer(r'<p class="gb-headline[^"]*"[^>]*>(.*?)</p>', page, re.S):
        for url, raw in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', head.group(1), re.S):
            title = clean(raw)
            if not title or "sarkariresult.com.cm" not in url:
                continue                      # skips empty anchors and off-site links
            if url in rows:
                if "Featured" not in rows[url]["sections"]:
                    rows[url]["sections"].insert(0, "Featured")
            else:
                low = title.lower()
                vac = VACANCY.search(title)
                rows[url] = {
                    "title": title,
                    "url": url,
                    "sections": ["Featured"],
                    "vacancies": int(vac.group(1).replace(",", "")) if vac else None,
                    "tags": sorted(t for t, pat in TAGS.items() if re.search(pat, low)),
                    "sub_graduate": bool(re.search(SUB_GRADUATE, low)),
                }
            break                             # one posting per headline

    for row in rows.values():
        row["is_job"] = any(s in JOB_SECTIONS or s == "Featured" for s in row["sections"])
    return list(rows.values())


def load():
    try:
        with open(DATA, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {"listings": [], "runs": 0}


def save(payload):
    os.makedirs(os.path.dirname(DATA), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(DATA), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=1)
        os.replace(tmp, DATA)          # atomic - never a half-written file
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def main():
    today = datetime.date.today().isoformat()
    try:
        resp = requests.get(URL, headers={"User-Agent": UA}, timeout=TIMEOUT)
        resp.raise_for_status()
    except requests.RequestException as exc:
        log(f"FETCH FAILED: {exc} - keeping previous data")
        return 1

    scraped = parse(resp.text)
    if not scraped:
        # A layout change would land here. Better to keep stale data and
        # say so loudly than to overwrite good rows with nothing.
        log("PARSE FAILED: 0 listings found - site layout may have changed, keeping previous data")
        return 2

    store = load()
    known = {row["url"]: row for row in store.get("listings", [])}

    new = 0
    for row in scraped:
        prev = known.get(row["url"])
        if prev:
            prev.update(row)
            prev["last_seen"] = today
        else:
            row["first_seen"] = today
            row["last_seen"] = today
            known[row["url"]] = row
            new += 1

    listings = sorted(
        known.values(),
        key=lambda r: (r.get("first_seen", ""), r.get("vacancies") or 0),
        reverse=True,
    )
    save({
        "source": URL,
        "source_note": "Unofficial aggregator; self-declared as not associated with "
                       "government websites. Treat every row as an unverified lead.",
        "fetched_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "scraped_today": len(scraped),
        "new_today": new,
        "total_tracked": len(listings),
        "runs": store.get("runs", 0) + 1,
        "listings": listings,
    })
    log(f"OK  scraped={len(scraped)}  new={new}  tracked={len(listings)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
