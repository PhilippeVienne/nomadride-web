import { NextRequest, NextResponse } from 'next/server';
import { getTopPopularZones, refreshOsmQueryCache } from '../../../../lib/pitstop/dbCache';
import { fetchFuelElementsFromOverpass } from '../../../../lib/pitstop/osmService';

// How many of the most-requested zones to refresh per run. Kept modest and
// throttled below so this daily job stays a "polite" Overpass client rather
// than becoming its own source of spam.
const MAX_ZONES_PER_RUN = 40;
// Delay between successive Overpass calls, matching OSM's fair-use guidance
// of not hammering the public instance with back-to-back requests.
const DELAY_BETWEEN_ZONES_MS = 1500;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Daily cron (EventBridge Scheduler, see infra/aws/cron.tf, 07:00 UTC ≈ 08:00 Europe/Paris in winter) that
 * proactively refreshes the OSM/Overpass cache for the zones users actually
 * search most often. Because it runs once a day for a bounded, popularity-
 * ranked set of zones — instead of on every user request — this is what
 * keeps live traffic from ever needing to call Overpass for a "hot" area:
 * `getFuelElementsAround` will find a same-day cache entry and skip the
 * network call entirely.
 */
export async function GET(req: NextRequest) {
  // Optional shared-secret check: Vercel automatically sends
  // `Authorization: Bearer <CRON_SECRET>` for scheduled invocations when
  // the CRON_SECRET env var is configured on the project. If it isn't set,
  // we don't enforce it (matches the other cron route in this repo).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
    }
  }

  return prewarm();
}

async function prewarm() {
  const zones = await getTopPopularZones(MAX_ZONES_PER_RUN);

  let refreshed = 0;
  let failed = 0;

  for (const zone of zones) {
    try {
      const elements = await fetchFuelElementsFromOverpass(zone.latitude, zone.longitude, zone.radius);
      await refreshOsmQueryCache(zone.id, zone.latitude, zone.longitude, zone.radius, elements);
      refreshed++;
    } catch (error) {
      failed++;
      console.error(`[Prewarm Cron] Failed to refresh zone ${zone.id}:`, error);
    }

    // Stay polite towards the public Overpass instances between zones.
    await delay(DELAY_BETWEEN_ZONES_MS);
  }

  return NextResponse.json({
    status: 'ok',
    zonesConsidered: zones.length,
    refreshed,
    failed,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Entry point for the scheduled Lambda function: the Lambda Web Adapter
 * forwards the EventBridge Scheduler event as a POST to this route (see
 * AWS_LWA_PASS_THROUGH_PATH in infra/aws/cron.tf). That function has no
 * public address, so no shared secret travels with the event; the public
 * function never sets CRON_PASS_THROUGH and answers 404 here.
 */
export async function POST() {
  if (process.env.CRON_PASS_THROUGH !== 'true') {
    return NextResponse.json({ status: 'error', message: 'Not found' }, { status: 404 });
  }
  return prewarm();
}
