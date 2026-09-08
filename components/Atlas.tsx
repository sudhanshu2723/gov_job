'use client';

import { useMemo, useState } from 'react';
import type { Route } from '@/lib/db';
import Nav from './Nav';

const fmt = (n: number) => n.toLocaleString('en-IN');
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dfmt(iso: string) {
  const p = iso.slice(0, 10).split('-');
  return `${+p[2]} ${MON[+p[1] - 1]} ${p[0].slice(2)}`;
}
const days = (iso: string) =>
  Math.ceil((new Date(`${iso.slice(0, 10)}T23:59:59`).getTime() - Date.now()) / 86400000);

const VERDICT: Record<string, [string, string]> = {
  go: ['p-go', 'Eligible'],
  cond: ['p-cond', 'Conditional'],
  no: ['p-no', 'Not eligible'],
};
const SRC: Record<string, [string, string]> = { p: ['t-p', '◆'], s: ['t-s', '◇'], u: ['t-u', '○'] };

const SECTORS = ['UPSC','SSC','Banking/Regulator','Defence','PSU/Science','Rajasthan',
  'Police/CAPF','Insurance','Railways','Postal/Telecom','Teaching','Courts','Municipal',
  'Other States','Overlooked','Gateway','CSE-native'];

const BIG = 8.64e15;
const SORTS: Record<string, ((a: Route, b: Route) => number) | null> = {
  default: null,
  vac: (a, b) => (b.vacancies ?? -1) - (a.vacancies ?? -1),
  pay: (a, b) => (b.basic ?? -1) - (a.basic ?? -1),
  date: (a, b) =>
    (a.next_date ? +new Date(a.next_date) : BIG) - (b.next_date ? +new Date(b.next_date) : BIG),
  act: (a, b) =>
    (a.next_act && a.next_date ? +new Date(a.next_date) : BIG) -
    (b.next_act && b.next_date ? +new Date(b.next_date) : BIG),
  elig: (a, b) =>
    ({ go: 0, cond: 1, no: 2 })[a.verdict] - ({ go: 0, cond: 1, no: 2 })[b.verdict] ||
    a.name.localeCompare(b.name),
  sector: (a, b) => (a.sectors[0] ?? '').localeCompare(b.sectors[0] ?? '') || a.name.localeCompare(b.name),
  name: (a, b) => strip(a.name).localeCompare(strip(b.name)),
};
const strip = (s: string) => s.replace(/<[^>]+>/g, '');

const H = (html: string) => <span dangerouslySetInnerHTML={{ __html: html }} />;

export default function Atlas({
  routes, inbox, applied,
}: { routes: Route[]; inbox: number; applied: number }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState('default');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const filters = useMemo(
    () => [
      { k: 'open', label: 'Open now', test: (e: Route) => e.status === 'open' },
      { k: 'verified', label: 'Verified', test: (e: Route) => e.status !== 'gap' },
      { k: 'gap', label: 'Not researched', test: (e: Route) => e.status === 'gap' },
      { k: 'go', label: 'Eligible', test: (e: Route) => e.verdict === 'go' },
      { k: 'cond', label: 'Conditional', test: (e: Route) => e.verdict === 'cond' },
      { k: 'no', label: 'Not eligible', test: (e: Route) => e.verdict === 'no' },
      { k: 'cse', label: 'Uses your CSE', test: (e: Route) => e.sectors.includes('CSE-native') },
      ...SECTORS.filter((s) => s !== 'CSE-native').map((s) => ({
        k: `s:${s}`, label: s, test: (e: Route) => e.sectors.includes(s),
      })),
    ], []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = routes.filter((e) => {
      for (const k of active) {
        const f = filters.find((x) => x.k === k);
        if (f && !f.test(e)) return false;
      }
      return !needle || JSON.stringify(e).toLowerCase().includes(needle);
    });
    const cmp = SORTS[sortKey];
    if (cmp) out = [...out].sort(cmp);
    return out;
  }, [routes, active, q, sortKey, filters]);

  const openNow = routes.filter((e) => e.status === 'open' && e.next_date);
  const withV = shown.filter((e) => e.vacancies != null);
  const total = withV.reduce((s, e) => s + (e.vacancies ?? 0), 0);
  const live = withV.filter((e) => !e.vac_stale).reduce((s, e) => s + (e.vacancies ?? 0), 0);
  const cse = shown.reduce((s, e) => s + (e.vac_cse ?? 0), 0);
  const pays = shown.filter((e) => e.basic).map((e) => e.basic as number);

  const toggle = (k: string) =>
    setActive((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  return (
    <div className="wrap">
      <header className="mast">
        <div className="eyebrow">
          <span>For B.Tech CSE graduates · Rajasthan focus</span>
          <span><b>{openNow.length} open now</b></span>
        </div>
        <Nav inbox={inbox} applied={applied} />
        <h1>Exam Atlas for a CSE Graduate</h1>
        <p className="standfirst">
          Every route found, with vacancies, dates, paper pattern, syllabus and which post lands at
          which rank. Search it, filter it, open any row.
        </p>
      </header>

      <div className="strip">
        {openNow.map((e) => {
          const d = days(e.next_date as string);
          return (
            <div className="cell" key={e.id}>
              <div className="n">{d > 0 ? d : '—'}</div>
              <div className="lb">{d > 0 ? 'days left' : 'closed'}</div>
              <div className="nm">{H(e.name)}</div>
            </div>
          );
        })}
        <div className="cell">
          <div className="n">{routes.length}</div>
          <div className="lb">routes catalogued</div>
          <div className="nm">live from Postgres</div>
        </div>
      </div>

      <div className="legend">
        <div><b>◆ Primary</b>Read from the official site or notification PDF.</div>
        <div><b>◇ Corroborated</b>Several independent sources agreed.</div>
        <div><b>○ Single / knowledge</b>One aggregator or background knowledge. A lead, not a fact.</div>
        <div><b>° after a vacancy</b>From a past cycle with no live advertisement.</div>
        <div><b>Basic pay</b>7th CPC entry cell for that level. <b>Never in-hand.</b></div>
        <div><b>— in a column</b>No published figure found. Sorted last, never guessed.</div>
      </div>

      <div className="controls">
        <div className="searchrow">
          <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder='Search exam, organisation, post — try "IT officer", "Rajasthan"'
            aria-label="Search routes" />
          <label className="sortlab" htmlFor="sort">Sort</label>
          <select id="sort" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="default">Curated order</option>
            <option value="vac">Most vacancies</option>
            <option value="pay">Highest basic pay</option>
            <option value="date">Soonest date</option>
            <option value="act">Soonest I can apply</option>
            <option value="elig">Eligibility</option>
            <option value="sector">Sector</option>
            <option value="name">Name A–Z</option>
          </select>
          <span className="count">{shown.length} of {routes.length}</span>
        </div>
        <div className="tally">
          <span><b>{fmt(total)}</b> vacancies shown</span>
          <span>current-cycle <b>{fmt(live)}</b></span>
          {cse > 0 && <span>CS-specific <b>{fmt(cse)}</b></span>}
          {pays.length > 0 && (
            <span className="q">basic pay ₹{fmt(Math.min(...pays))}–₹{fmt(Math.max(...pays))}</span>
          )}
          {shown.length - withV.length > 0 && (
            <span className="q">{shown.length - withV.length} with no published count</span>
          )}
        </div>
        <div className="chips">
          {filters.map((f) => (
            <button key={f.k} className="chip" aria-pressed={active.has(f.k)}
              onClick={() => toggle(f.k)}>{f.label}</button>
          ))}
        </div>
      </div>

      <div className="list">
        {shown.length === 0 ? (
          <div className="empty">Nothing matches. Clear a filter or change the search.</div>
        ) : (
          shown.map((e) => {
            const [vc, vt] = VERDICT[e.verdict];
            const [sc, st] = SRC[e.src];
            const isOpen = open.has(e.id);
            const d = e.next_date && e.status === 'open' ? days(e.next_date) : null;
            return (
              <div className={`card${isOpen ? ' open' : ''}`} key={e.id}
                data-gap={e.status === 'gap' ? '1' : undefined}>
                <button className="head" aria-expanded={isOpen}
                  onClick={() => setOpen((p) => {
                    const n = new Set(p); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n;
                  })}>
                  <span className={`tick ${sc}`} title="source confidence">{st}</span>
                  <span>
                    <h3>{H(e.name)}</h3>
                    <div className="org">{H(e.org)}</div>
                    <div className="facts">
                      {Object.entries(e.facts ?? {}).map(([k, v]) => (
                        <span key={k}>{k}: <b>{H(String(v))}</b></span>
                      ))}
                    </div>
                  </span>
                  <span className="metrics">
                    <span className="met">
                      <span className={`mv ${e.vacancies != null ? (e.vac_stale ? 'stale' : '') : 'none'}`}>
                        {e.vacancies != null ? fmt(e.vacancies) + (e.vac_stale ? '°' : '') : '—'}
                      </span>
                      <span className="ml">vacancies</span>
                      {e.vac_cse ? <span className="sub">{e.vac_cse} in CS</span> : null}
                    </span>
                    <span className="met">
                      <span className={`mv ${e.basic ? '' : 'none'}`}>
                        {e.basic ? '₹' + fmt(e.basic) : '—'}
                      </span>
                      <span className="ml">basic pay</span>
                      {e.pay_level ? <span className="sub" style={{ color: 'var(--muted)' }}>Level {e.pay_level}</span> : null}
                    </span>
                    <span className="met">
                      <span className={`mv ${e.next_date ? '' : 'none'}`} style={{ fontSize: '.9rem' }}>
                        {e.next_date ? dfmt(e.next_date) : '—'}
                      </span>
                      <span className="ml">
                        {e.next_date ? (e.next_est ? '~ ' : '') + (e.next_kind ?? '') : 'next date'}
                      </span>
                    </span>
                  </span>
                  <span className="rt">
                    {d != null && <span className="pill p-open">{d > 0 ? `${d} days left` : 'closing'}</span>}
                    {e.status === 'gap' && <span className="pill p-gap">Not researched</span>}
                    <span className={`pill ${vc}`}>{vt}</span>
                    <span className="caret">▸</span>
                  </span>
                </button>

                {isOpen && (
                  <div className="body" style={{ display: 'block' }}>
                    {e.tag && <p style={{ margin: '14px 0 0', color: 'var(--ink)' }}><b>{H(e.tag)}</b></p>}
                    {e.condition && <div className="note"><b>Condition:</b> {H(e.condition)}</div>}
                    {e.warn && <div className="note warn">{H(e.warn)}</div>}
                    {e.why && <p style={{ fontSize: '.95rem', color: 'var(--ink-soft)', marginTop: 10 }}>{H(e.why)}</p>}

                    <div className="grid2">
                      <div className="blk">
                        <h4>Key facts</h4>
                        <dl className="kv">
                          {(e.kv ?? []).map(([k, v], i) => (
                            <div key={i} style={{ display: 'contents' }}>
                              <dt>{H(k)}</dt><dd>{H(v)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                      <div className="blk">
                        {e.applicants && (<>
                          <h4>Who you are up against</h4>
                          <p>{e.applicants.n}{' '}
                            <span className={`pill ${e.applicants.src === 'p' ? 'p-go' : 'p-cond'}`}
                              style={{ marginLeft: 4 }}>
                              {e.applicants.src === 'p' ? 'verified' : 'estimate'}
                            </span>
                          </p>
                        </>)}
                        {e.pattern && (<>
                          <h4 style={{ marginTop: e.applicants ? 18 : 0 }}>Paper pattern</h4>
                          {e.pattern.note && <p style={{ fontSize: '.88rem', color: 'var(--muted)' }}>{e.pattern.note}</p>}
                          <Table head={['Stage', 'Content', 'Marks', 'Notes']} rows={e.pattern.rows} mono={2} />
                        </>)}
                      </div>
                    </div>

                    {e.syllabus && (
                      <div className="blk" style={{ marginTop: 18 }}>
                        <h4>Syllabus</h4>
                        {e.syllabus.note && <p style={{ fontSize: '.88rem', color: 'var(--muted)' }}>{e.syllabus.note}</p>}
                        <div className="syl">
                          {e.syllabus.items.map(([h, b], i) => (
                            <div key={i}><b>{H(h)}</b> — {H(b)}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {e.ranks && (
                      <div className="blk" style={{ marginTop: 18 }}>
                        <h4>Which post, at what rank</h4>
                        {e.ranks.note && <p style={{ fontSize: '.88rem', color: 'var(--muted)' }}>{e.ranks.note}</p>}
                        <Table head={['Rank / merit', 'Post']} rows={e.ranks.rows} mono={1} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Table({ head, rows, mono }: { head: string[]; rows: string[][]; mono: number }) {
  return (
    <div className="tw">
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j >= mono ? 'mono' : undefined}>{H(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
