import { getPayload } from 'payload';
import config from '../../../payload.config';
import { BaseStation, FuelType } from './types';
import { haversineDistance } from './utils';

/**
 * Bounding Box helper for database query filtering.
 */
interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function getBBox(lat: number, lon: number, radiusKm: number): BBox {
  const degRadius = radiusKm / 111.12;
  return {
    minLat: lat - degRadius,
    maxLat: lat + degRadius,
    minLng: lon - degRadius,
    maxLng: lon + degRadius,
  };
}

export interface PopularZone {
  id: string | number;
  latitude: number;
  longitude: number;
  radius: number;
  hitCount: number;
}

/**
 * Returns the most-requested cached zones, ranked by how many times they
 * were served to users. Used by the daily pre-warm cron to decide which
 * areas are worth refreshing proactively from Overpass.
 */
export async function getTopPopularZones(limit: number): Promise<PopularZone[]> {
  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: 'osm-queries',
      where: { hitCount: { greater_than: 0 } },
      sort: '-hitCount',
      limit,
    });

    return result.docs.map((doc: any) => ({
      id: doc.id,
      latitude: doc.latitude,
      longitude: doc.longitude,
      radius: doc.radius,
      hitCount: doc.hitCount || 0,
    }));
  } catch (error) {
    console.error('Error fetching popular OSM zones:', error);
    return [];
  }
}

/**
 * Checks the database for cached fuel stations within a bounding box.
 * Returns the stations if the cache is hit and completely fresh (within TTL).
 */
export async function getCachedFuelStations(
  country: string,
  lat: number,
  lon: number,
  radiusKm: number,
  ttlMs: number
): Promise<BaseStation[] | null> {
  try {
    const payload = await getPayload({ config });
    const bbox = getBBox(lat, lon, radiusKm);

    const result = await payload.find({
      collection: 'fuel-stations',
      where: {
        and: [
          { country: { equals: country } },
          { latitude: { greater_than_equal: bbox.minLat } },
          { latitude: { less_than_equal: bbox.maxLat } },
          { longitude: { greater_than_equal: bbox.minLng } },
          { longitude: { less_than_equal: bbox.maxLng } },
        ],
      },
      limit: 1000,
    });

    const docs = result.docs;
    if (docs.length === 0) {
      return null;
    }

    // Check if the cache has expired
    // If any station in the searched area is older than the TTL, we invalidate the cache for safety.
    const now = Date.now();
    for (const doc of docs) {
      const cachedAt = new Date(doc.cachedAt).getTime();
      if (now - cachedAt > ttlMs) {
        return null; // Cache expired
      }
    }

    // Map DB documents back to BaseStation structure
    const stations: BaseStation[] = docs.map((doc: any) => ({
      id: doc.stationId,
      brand: doc.brand || undefined,
      name: doc.name || undefined,
      address: doc.address || '',
      city: doc.city || '',
      postCode: doc.postCode || '',
      latitude: doc.latitude,
      longitude: doc.longitude,
      country: doc.country as any,
      currency: doc.currency as any,
      prices: (doc.prices as BaseStation['prices']) || {},
      updatedAt: new Date(doc.stationUpdatedAt || doc.cachedAt),
    }));

    // Perform exact local Haversine distance filtering
    return stations.filter((s) => haversineDistance(lat, lon, s.latitude, s.longitude) <= radiusKm);
  } catch (error) {
    console.error(`Error retrieving cached fuel stations for ${country}:`, error);
    return null;
  }
}

/**
 * Saves/updates fuel stations in the database cache.
 */
export async function saveFuelStationsToCache(stations: BaseStation[]): Promise<void> {
  if (stations.length === 0) return;

  try {
    const payload = await getPayload({ config });
    const cachedAt = new Date().toISOString();

    for (const station of stations) {
      // Find if station already exists
      const existing = await payload.find({
        collection: 'fuel-stations',
        where: {
          and: [
            { stationId: { equals: station.id } },
            { country: { equals: station.country } },
          ],
        },
        limit: 1,
      });

      const mergedPrices = existing.docs.length > 0
        ? { ...(existing.docs[0].prices as object || {}), ...station.prices }
        : station.prices;

      const data = {
        stationId: station.id,
        country: station.country,
        brand: station.brand,
        name: station.name,
        address: station.address,
        city: station.city,
        postCode: station.postCode,
        latitude: station.latitude,
        longitude: station.longitude,
        currency: station.currency,
        prices: mergedPrices,
        stationUpdatedAt: station.updatedAt.toISOString(),
        cachedAt,
      };

      if (existing.docs.length > 0) {
        await payload.update({
          collection: 'fuel-stations',
          id: existing.docs[0].id,
          data,
        });
      } else {
        await payload.create({
          collection: 'fuel-stations',
          data,
        });
      }
    }
  } catch (error) {
    console.error('Error saving fuel stations to database cache:', error);
  }
}

export interface OsmCacheResult {
  elements: any[];
  /** Age (ms) of the freshest covering query — lets callers decide fresh vs. stale-but-usable. */
  ageMs: number;
  /** id of the covering osm-queries document, used to record popularity hits. */
  queryId: string | number;
}

/**
 * Checks if a search zone is fully covered by a previously completed OSM query.
 * Returns the freshest covering query's age so callers can implement
 * stale-while-revalidate instead of an all-or-nothing TTL.
 */
export async function getCachedOsmStations(
  lat: number,
  lon: number,
  radiusKm: number,
  maxAgeMs: number
): Promise<OsmCacheResult | null> {
  try {
    const payload = await getPayload({ config });

    // Look for queries that contain our search circle, sorted so the most
    // recent covering query wins (gives the most accurate freshness signal).
    const queries = await payload.find({
      collection: 'osm-queries',
      sort: '-queriedAt',
      limit: 100,
    });

    const now = Date.now();
    let bestMatch: { id: string | number; ageMs: number } | null = null;

    for (const q of queries.docs) {
      const queriedAt = new Date(q.queriedAt).getTime();
      const ageMs = now - queriedAt;
      if (ageMs > maxAgeMs) continue;

      const dist = haversineDistance(lat, lon, q.latitude, q.longitude);
      // If our search circle fits inside the cached query circle
      if (dist + radiusKm <= q.radius) {
        bestMatch = { id: q.id, ageMs };
        break; // docs are sorted by queriedAt desc, so the first hit is freshest
      }
    }

    if (!bestMatch) {
      return null;
    }

    // Query all osm-stations in the bounding box
    const bbox = getBBox(lat, lon, radiusKm);
    const result = await payload.find({
      collection: 'osm-stations',
      where: {
        and: [
          { latitude: { greater_than_equal: bbox.minLat } },
          { latitude: { less_than_equal: bbox.maxLat } },
          { longitude: { greater_than_equal: bbox.minLng } },
          { longitude: { less_than_equal: bbox.maxLng } },
        ],
      },
      limit: 2000,
    });

    // Map to OSM Element structure
    const elements = result.docs.map((doc: any) => ({
      id: parseInt(doc.osmId),
      type: doc.type,
      lat: doc.latitude,
      lon: doc.longitude,
      tags: {
        brand: doc.brand || '',
        operator: doc.operator || '',
        name: doc.name || '',
        'addr:country': doc.country || '',
        'addr:postcode': doc.postcode || '',
        'addr:street': doc.street || '',
      },
    }));

    // Filter by Haversine distance
    return {
      elements: elements.filter((el) => haversineDistance(lat, lon, el.lat, el.lon) <= radiusKm),
      ageMs: bestMatch.ageMs,
      queryId: bestMatch.id,
    };
  } catch (error) {
    console.error('Error fetching cached OSM stations:', error);
    return null;
  }
}

/**
 * Records that a cached zone was served to a user, without blocking the
 * caller. Feeds the popularity ranking used by the daily pre-warm cron.
 * Fire-and-forget by design: never await this from a request path.
 */
export async function markOsmQueryHit(queryId: string | number): Promise<void> {
  try {
    const payload = await getPayload({ config });
    const current = await payload.findByID({ collection: 'osm-queries', id: queryId as any });
    await payload.update({
      collection: 'osm-queries',
      id: queryId,
      data: {
        hitCount: (current?.hitCount || 0) + 1,
        lastHitAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.warn('Error recording OSM query hit (non-fatal):', error);
  }
}

/**
 * Upserts a batch of OSM elements with limited concurrency, to avoid opening
 * a huge number of simultaneous Postgres connections when Overpass returns
 * many results (Overpass responses for amenity=fuel over 100km can easily
 * contain several hundred elements).
 */
async function upsertOsmStationsBatch(payload: any, elements: any[], cachedAt: string): Promise<void> {
  const validElements = elements
    .map((el) => {
      const osmId = String(el.id || el.osmId || '');
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (!osmId || elLat === undefined || elLon === undefined) return null;
      const tags = el.tags || {};
      return {
        osmId,
        data: {
          osmId,
          type: el.type || 'node',
          latitude: elLat,
          longitude: elLon,
          brand: tags.brand || '',
          operator: tags.operator || '',
          name: tags.name || '',
          country: tags['addr:country'] || '',
          postcode: tags['addr:postcode'] || '',
          street: tags['addr:street'] || '',
          cachedAt,
        },
      };
    })
    .filter((v): v is { osmId: string; data: any } => v !== null);

  if (validElements.length === 0) return;

  // One bulk lookup instead of one `find` per element.
  const existing = await payload.find({
    collection: 'osm-stations',
    where: { osmId: { in: validElements.map((v) => v.osmId) } },
    limit: validElements.length,
  });
  const existingByOsmId = new Map(existing.docs.map((doc: any) => [doc.osmId, doc.id]));

  const CONCURRENCY = 10;
  for (let i = 0; i < validElements.length; i += CONCURRENCY) {
    const batch = validElements.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(({ osmId, data }) => {
        const existingId = existingByOsmId.get(osmId);
        return existingId
          ? payload.update({ collection: 'osm-stations', id: existingId, data })
          : payload.create({ collection: 'osm-stations', data });
      })
    );
  }
}

export async function saveOsmQueryToCache(
  lat: number,
  lon: number,
  radiusKm: number,
  elements: any[]
): Promise<void> {
  try {
    const payload = await getPayload({ config });
    const cachedAt = new Date().toISOString();

    // 1. Save/Upsert elements (batched, bounded concurrency)
    await upsertOsmStationsBatch(payload, elements, cachedAt);

    // 2. Log query zone (with 1km buffer for coverage overlay)
    await payload.create({
      collection: 'osm-queries',
      data: {
        latitude: lat,
        longitude: lon,
        radius: radiusKm + 1.0, // Cache with 1km padding
        queriedAt: cachedAt,
        hitCount: 0,
      },
    });
  } catch (error) {
    console.error('Error saving OSM query to cache:', error);
  }
}

/**
 * Same as saveOsmQueryToCache but updates an existing osm-queries document
 * in place (bumping queriedAt) instead of creating a new one. Used by the
 * daily pre-warm cron to refresh a popular zone without piling up duplicate
 * coverage circles for the same spot.
 */
export async function refreshOsmQueryCache(
  queryId: string | number,
  lat: number,
  lon: number,
  radiusKm: number,
  elements: any[]
): Promise<void> {
  try {
    const payload = await getPayload({ config });
    const cachedAt = new Date().toISOString();

    await upsertOsmStationsBatch(payload, elements, cachedAt);

    await payload.update({
      collection: 'osm-queries',
      id: queryId,
      data: {
        latitude: lat,
        longitude: lon,
        radius: radiusKm + 1.0,
        queriedAt: cachedAt,
      },
    });
  } catch (error) {
    console.error('Error refreshing OSM query cache:', error);
  }
}
