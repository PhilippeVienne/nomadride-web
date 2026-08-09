import { BaseStation } from './types';
import { haversineDistance } from './utils';
import {
  getCachedOsmStations,
  saveOsmQueryToCache,
  refreshOsmQueryCache,
  markOsmQueryHit,
} from './dbCache';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const brandCache = new Map<string, CacheEntry<string>>();
const CACHE_TTL_6H = 6 * 60 * 60 * 1000;

// Below this age, a cached OSM zone is trusted outright — no network call.
const FRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;
// Hard cutoff: past this age a zone is treated as a cache miss even if we
// still have rows for it (same value as before, now named for clarity).
const MAX_CACHE_AGE_MS = 90 * 24 * 60 * 60 * 1000;

// These are independent mirrors provided by the Overpass project specifically
// for client-side failover, not the same server hit repeatedly — querying
// them in parallel (see `queryOverpass` below) is the resilient pattern they
// exist for. It also matters in practice: from some networks one or two of
// these hostnames are simply unreachable (connection timeout, not a slow
// response), so trying them one after another can burn 2×5s before ever
// reaching the mirror that actually answers.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
];

interface OsmElement {
  type: 'node' | 'way';
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: {
    [key: string]: string;
  };
}

/**
 * Queries all Overpass mirrors in parallel (5-second timeout each) and
 * returns whichever answers first, cancelling the rest. Sequential failover
 * used to mean a single call could burn up to 3×5s when the earlier mirrors
 * in the list are unreachable rather than merely slow — racing them bounds
 * the worst case to ~5s and stops depending on list order for latency.
 */
export async function queryOverpass(qlQuery: string): Promise<any> {
  const controllers = OVERPASS_ENDPOINTS.map(() => new AbortController());

  const attempts = OVERPASS_ENDPOINTS.map((endpoint, i) =>
    (async () => {
      const controller = controllers[i];
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // overpass-api.de's fair-use policy rejects/deprioritizes requests
            // without an identifying User-Agent (seen in practice as 406/429
            // responses). This must stay a real, stable identifier per their
            // usage guidelines — not a browser-spoofed string.
            'User-Agent': 'NomadRide-PitStop/1.0 (+https://ride.vienne.me)',
          },
          body: `data=${encodeURIComponent(qlQuery)}`,
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Overpass returned status ${res.status}`);
        }
        return await res.json();
      } catch (err) {
        console.warn(`Overpass query failed for ${endpoint}:`, err);
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    })()
  );

  try {
    const result = await Promise.any(attempts);
    // We have a winner — stop the other mirrors from doing unnecessary work.
    for (const controller of controllers) controller.abort();
    return result;
  } catch {
    throw new Error('All Overpass API endpoints failed');
  }
}

// De-duplicates concurrent identical Overpass fetches within this process
// instance. In practice the Swiss provider and the brand-enrichment step
// below both query amenity=fuel for the *same* lat/lon/radius within the
// same request — without this, a single user search could fire two
// redundant Overpass calls for virtually the same data.
const inFlightOverpassFetches = new Map<string, Promise<OsmElement[]>>();

/**
 * Exported so the daily pre-warm cron (`/api/cron/prewarm-pitstops`) can
 * reuse the same in-flight de-duplication as live user requests.
 */
export async function fetchFuelElementsFromOverpass(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<OsmElement[]> {
  const key = `${lat}_${lon}_${radiusKm}`;
  const existing = inFlightOverpassFetches.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const radiusMeters = Math.round(radiusKm * 1000);
    const overpassQuery = `[out:json][timeout:5];
(
  node["amenity"="fuel"](around:${radiusMeters},${lat},${lon});
  way["amenity"="fuel"](around:${radiusMeters},${lat},${lon});
);
out center tags;`;
    const response = await queryOverpass(overpassQuery);
    return (response?.elements || []) as OsmElement[];
  })();

  inFlightOverpassFetches.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightOverpassFetches.delete(key);
  }
}

// Minimum gap between two background revalidations of the *same* zone.
// Deliberately much shorter than FRESH_THRESHOLD_MS: the daily pre-warm cron
// keeps a popular zone under 24h old, but real traffic should still be able
// to nudge it fresher throughout the day — this cooldown only exists so a
// burst of requests for the same zone within a few minutes doesn't each
// trigger their own Overpass call.
const BACKGROUND_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

export interface OsmFuelResult {
  elements: OsmElement[];
  /** True if this data came from a cache entry older than FRESH_THRESHOLD_MS — drives the UI's "stale" indicator. */
  stale: boolean;
  /** Present whenever a background refresh is due (see BACKGROUND_REFRESH_COOLDOWN_MS), independent of `stale`. */
  revalidate?: () => Promise<void>;
}

/**
 * Resolves amenity=fuel OSM elements around a point, backed by the 90-day DB
 * cache, with stale-while-revalidate semantics: cached data is always served
 * immediately, and — unless it was refreshed within the last
 * BACKGROUND_REFRESH_COOLDOWN_MS — paired with a `revalidate()` callback the
 * caller schedules via `after()` so the cache keeps nudging itself fresher
 * from real traffic, even on days/zones the daily pre-warm cron already
 * covered. No user request ever blocks on Overpass once a zone has been
 * seen once. The `stale` flag (shown to the user) stays on the much longer
 * FRESH_THRESHOLD_MS so routine background refreshes stay invisible.
 */
export async function getFuelElementsAround(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<OsmFuelResult> {
  const cached = await getCachedOsmStations(lat, lon, radiusKm, MAX_CACHE_AGE_MS);

  if (cached) {
    // Popularity tracking must never block or fail the request.
    void markOsmQueryHit(cached.queryId);

    const uiStale = cached.ageMs >= FRESH_THRESHOLD_MS;

    if (cached.ageMs < BACKGROUND_REFRESH_COOLDOWN_MS) {
      return { elements: cached.elements as OsmElement[], stale: uiStale };
    }

    return {
      elements: cached.elements as OsmElement[],
      stale: uiStale,
      revalidate: async () => {
        try {
          const elements = await fetchFuelElementsFromOverpass(lat, lon, radiusKm);
          await refreshOsmQueryCache(cached.queryId, lat, lon, radiusKm, elements);
        } catch (error) {
          console.warn('Background OSM revalidation failed:', error);
        }
      },
    };
  }

  // True cache miss: nothing to show the user, so we have no choice but to
  // block on Overpass once. This should become rare once the daily pre-warm
  // cron has covered the popular zones.
  try {
    const elements = await fetchFuelElementsFromOverpass(lat, lon, radiusKm);
    // Awaited (not fire-and-forget): the serverless function may be torn
    // down as soon as the response is sent, so a detached write here could
    // silently be lost.
    await saveOsmQueryToCache(lat, lon, radiusKm, elements);
    return { elements, stale: false };
  } catch (error) {
    console.error('Failed to fetch OSM fuel data from Overpass:', error);
    return { elements: [], stale: false };
  }
}

/**
 * Checks if any OSM tag's value matches the official station ID.
 */
function matchNationalIdentifier(osmTags: { [key: string]: string }, officialId: string): boolean {
  const cleanId = String(officialId).trim();
  for (const key of Object.keys(osmTags)) {
    if (key.startsWith('ref:') && String(osmTags[key]).trim() === cleanId) {
      return true;
    }
  }
  return false;
}

export interface StaleTracker {
  stale: boolean;
  revalidations: Array<() => Promise<void>>;
}

/**
 * Enriches a batch of stations with brand names from OpenStreetMap.
 */
export async function enrichBrands(
  stations: BaseStation[],
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  tracker?: StaleTracker
): Promise<BaseStation[]> {
  // 1. Identify which stations need brand enrichment
  const stationsToEnrich = stations.filter((station) => {
    // Check if brand is already set in the provider output
    if (station.brand && station.brand.trim()) {
      return false;
    }

    // Check if we have a cached brand mapping
    const cacheKey = `${station.country}_${station.id}`;
    const cached = brandCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_6H) {
      if (cached.data) {
        station.brand = cached.data;
      }
      return false;
    }

    return true;
  });

  if (stationsToEnrich.length === 0) {
    return stations;
  }

  // 2. Resolve amenity=fuel OSM elements for the search radius (cache-first,
  // stale-while-revalidate — see getFuelElementsAround).
  const { elements: osmElements, stale, revalidate } = await getFuelElementsAround(
    centerLat,
    centerLng,
    radiusKm
  );
  if (tracker && stale) {
    tracker.stale = true;
    if (revalidate) tracker.revalidations.push(revalidate);
  }

  // 3. Match and enrich each target station
  for (const station of stationsToEnrich) {
    const cacheKey = `${station.country}_${station.id}`;

    // Find best match in OSM elements
    let bestMatch: OsmElement | null = null;
    let bestDistance = Infinity;

    // Rule 1: National Identifier Match
    const idMatch = osmElements.find((el) => el.tags && matchNationalIdentifier(el.tags, station.id));
    if (idMatch) {
      bestMatch = idMatch;
    } else {
      // Rule 2: Haversine Distance < 150 meters (0.150 km)
      for (const el of osmElements) {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat === undefined || lon === undefined) continue;

        const distance = haversineDistance(station.latitude, station.longitude, lat, lon);
        if (distance < 0.150 && distance < bestDistance) {
          bestDistance = distance;
          bestMatch = el;
        }
      }
    }

    // 4. Resolve name and update cache
    if (bestMatch && bestMatch.tags) {
      const tags = bestMatch.tags;
      const brandName = tags.brand || tags.operator || tags.name;
      if (brandName && brandName.trim()) {
        const cleanBrand = brandName.trim();
        station.brand = cleanBrand;
        brandCache.set(cacheKey, {
          data: cleanBrand,
          timestamp: Date.now(),
        });
        continue;
      }
    }

    // Cache negative results so we don't query repeatedly
    brandCache.set(cacheKey, {
      data: '',
      timestamp: Date.now(),
    });
  }

  return stations;
}
