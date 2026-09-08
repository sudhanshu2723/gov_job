'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from './Nav';

type Listing = {
  url: string;
  title: string;
  sections: string[];
  vacancies: number | null;
  tags: string[];
  sub_graduate: boolean;
  is_job: boolean;
  first_seen: string;
  status: 'applied' | 'rejected' | null;
  decided_at: string | null;
};

type LastRun = { ran_at: string; ok: boolean; scraped: number; new_count: number } | null;

const fmt = (n: number) => n.toLocaleString('en-IN');

function ago(iso: string) {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

export default function Triage({ mode }: { mode: 'inbox' | 'applied' }) {
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [lastRun, setLastRun] = useState<LastRun>(null);
  const [error, setError] = useState<string | null>(null);
  const [cseOnly, setCseOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [undo, setUndo] = useState<{ url: string; msg: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/listings', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setRows(d.listings);
      setLastRun(d.lastRun);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(url: string, status: 'applied' | 'rejected') {
    setBusy(url);
    // optimistic, but reconciled against the server response below
    setRows((r) => r?.map((x) => (x.url === url ? { ...x, status } : x)) ?? r);
    try {
      const res = await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, status }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'save failed');
      setUndo({
        url,
        msg: status === 'applied' ? 'Moved to Applied.' : 'Rejected and removed from the inbox.',
      });
    } catch (e) {
      setUndo({ url, msg: `Could not save: ${(e as Error).message}` });
      await load(); // roll the optimistic change back to server truth
    } finally {
      setBusy(null);
    }
  }

  async function clearDecision(url: string) {
    setBusy(url);
    setRows((r) => r?.map((x) => (x.url === url ? { ...x, status: null } : x)) ?? r);
    try {
      await fetch(`/api/decisions?url=${encodeURIComponent(url)}`, { method: 'DELETE' });
    } finally {
      setUndo(null);
      setBusy(null);
    }
  }

  async function restoreRejected() {
    await fetch('/api/decisions?all=rejected', { method: 'DELETE' });
    await load();
  }

  if (error) {
    return (
      <Shell mode={mode}>
        <div className="empty">
          <b>Could not reach the database</b>
          {error}. Check that <code>DATABASE_URL</code> is set and the dev server is running.
        </div>
      </Shell>
    );
  }
  if (!rows) {
    return (
      <Shell mode={mode}>
        <div className="empty">Loading…</div>
      </Shell>
    );
  }

  const jobs = rows.filter((r) => r.is_job);
  const latest = rows.reduce((m, r) => (r.first_seen > m ? r.first_seen : m), '');
  const pending = jobs.filter((r) => !r.status);
  const applied = rows.filter((r) => r.status === 'applied');
  const rejected = rows.filter((r) => r.status === 'rejected');

  let shown = mode === 'inbox' ? pending : applied;
  if (mode === 'inbox') {
    if (cseOnly) shown = shown.filter((r) => r.tags.length && !r.sub_graduate);
    if (newOnly) shown = shown.filter((r) => r.first_seen === latest);
    shown = [...shown].sort(
      (a, b) =>
        b.first_seen.localeCompare(a.first_seen) || (b.vacancies ?? 0) - (a.vacancies ?? 0)
    );
  } else {
    shown = [...shown].sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''));
  }

  return (
    <Shell mode={mode} inbox={pending.length} applied={applied.length}>
      {mode === 'inbox' && (
        <div className="controls">
          <button
            className="chip"
            aria-pressed={cseOnly}
            onClick={() => setCseOnly((v) => !v)}
          >
            CSE-relevant
          </button>
          <button className="chip" aria-pressed={newOnly} onClick={() => setNewOnly((v) => !v)}>
            New today
          </button>
          <span className="meta">
            {shown.length} shown · {pending.length} undecided · {applied.length} applied ·{' '}
            {rejected.length} rejected
          </span>
        </div>
      )}

      {lastRun && (
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Last scrape <b>{ago(lastRun.ran_at)}</b>
          {lastRun.ok ? ` · ${lastRun.scraped} listings, ${lastRun.new_count} new` : ' · FAILED'} ·
          runs daily
        </p>
      )}

      <div className="list">
        {shown.length === 0 ? (
          <div className="empty">
            <b>
              {mode === 'applied'
                ? 'Nothing accepted yet'
                : cseOnly || newOnly
                  ? 'Nothing matches these filters'
                  : 'Inbox clear'}
            </b>
            {mode === 'applied'
              ? 'Postings you accept in Notifications collect here.'
              : cseOnly || newOnly
                ? 'Turn off a filter to see the rest.'
                : 'Every current posting has been decided. New ones appear after the next scrape.'}
          </div>
        ) : (
          shown.map((r) => (
            <div className="item" key={r.url}>
              <span className={`vac${r.vacancies ? '' : ' none'}`}>
                {r.vacancies ? fmt(r.vacancies) : '—'}
              </span>
              <span>
                <h3>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.title}
                  </a>
                </h3>
                <span className="tags">
                  {mode === 'inbox' && r.first_seen === latest && (
                    <span className="tag new">new today</span>
                  )}
                  {mode === 'applied' && r.decided_at && (
                    <span className="tag">accepted {ago(r.decided_at)}</span>
                  )}
                  {r.tags.map((t) => (
                    <span className={`tag ${t}`} key={t}>
                      {t}
                    </span>
                  ))}
                  {r.sub_graduate && <span className="tag sub">below graduate</span>}
                </span>
              </span>
              <span className="acts">
                {mode === 'inbox' ? (
                  <>
                    <button
                      className="btn btn-yes"
                      disabled={busy === r.url}
                      onClick={() => decide(r.url, 'applied')}
                    >
                      Accept
                    </button>
                    <button
                      className="btn btn-no"
                      disabled={busy === r.url}
                      onClick={() => decide(r.url, 'rejected')}
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-plain"
                    disabled={busy === r.url}
                    onClick={() => clearDecision(r.url)}
                  >
                    Back to inbox
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      {mode === 'inbox' && rejected.length > 0 && (
        <p className="footnote">
          {rejected.length} rejected posting{rejected.length > 1 ? 's are' : ' is'} hidden.{' '}
          <button onClick={restoreRejected}>Restore all</button>
        </p>
      )}

      {undo && (
        <div className="undo">
          <span>{undo.msg}</span>
          <button onClick={() => clearDecision(undo.url)}>Undo</button>
        </div>
      )}
    </Shell>
  );
}

function Shell({
  mode,
  inbox,
  applied,
  children,
}: {
  mode: 'inbox' | 'applied';
  inbox?: number;
  applied?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="wrap">
      <header className="mast">
        <div className="eyebrow">Job triage · updated daily</div>
        <h1>{mode === 'inbox' ? 'Notifications' : 'Applied'}</h1>
        <p className="standfirst">
          {mode === 'inbox'
            ? 'New postings from the daily scrape land here. Accept one and it moves to Applied; reject it and it leaves the inbox.'
            : 'Everything you accepted, newest first. Send one back to the inbox if you change your mind.'}
        </p>
        <Nav inbox={inbox} applied={applied} />
      </header>
      {children}
      <div className="note warn">
        <b>Unverified leads.</b> Scraped from an ad-supported aggregator that states it is not
        associated with government websites. Treat each as a prompt to check the issuing body&apos;s
        own notification — never as grounds for paying a fee.
      </div>
    </div>
  );
}
