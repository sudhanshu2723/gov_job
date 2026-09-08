import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Accept or reject a posting. */
export async function POST(req: Request) {
  const { url, status } = await req.json();

  if (typeof url !== 'string' || !url) {
    return Response.json({ error: 'url is required' }, { status: 400 });
  }
  if (status !== 'applied' && status !== 'rejected') {
    return Response.json({ error: "status must be 'applied' or 'rejected'" }, { status: 400 });
  }
  // The FK would reject an unknown url, but a clear message beats a 500.
  const known = await sql`select 1 from listings where url = ${url}`;
  if (known.length === 0) {
    return Response.json({ error: 'no such listing' }, { status: 404 });
  }

  await sql`
    insert into decisions (url, status) values (${url}, ${status})
    on conflict (url) do update set status = excluded.status, decided_at = now()`;

  return Response.json({ ok: true, url, status });
}

/** Undo: removing the decision returns the posting to the inbox. */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');
  const all = searchParams.get('all');

  if (all === 'rejected') {
    const r = await sql`delete from decisions where status = 'rejected' returning url`;
    return Response.json({ ok: true, restored: r.length });
  }
  if (!url) return Response.json({ error: 'url is required' }, { status: 400 });

  await sql`delete from decisions where url = ${url}`;
  return Response.json({ ok: true, url });
}
