import { runScrape } from '@/lib/scrape';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily scrape. Vercel Cron calls this with the CRON_SECRET bearer token;
 * without that guard a public endpoint could be hammered to hit the source
 * site repeatedly from our IP.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  const result = await runScrape();
  return Response.json(result, { status: result.ok ? 200 : 502 });
}

export const GET = handle;
export const POST = handle;
