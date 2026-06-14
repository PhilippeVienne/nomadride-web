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

/**
 * Checks if a search zone is fully covered by a previously completed OSM query.
 */
export async function getCachedOsmStations(
  lat: number,
  lon: number,
  radiusKm: number,
  maxAgeMs: number
): Promise<any[] | null> {
  try {
    const payload = await getPayload({ config });

    // Look for a query that contains our search circle
    const queries = await payload.find({
      collection: 'osm-queries',
      limit: 100,
    });

    const now = Date.now();
    let isCovered = false;

    for (const q of queries.docs) {
      const queriedAt = new Date(q.queriedAt).getTime();
      if (now - queriedAt > maxAgeMs) continue;

      const dist = haversineDistance(lat, lon, q.latitude, q.longitude);
      // If our search circle fits inside the cached query circle
      if (dist + radiusKm <= q.radius) {
        isCovered = true;
        break;
      }
    }

    if (!isCovered) {
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
    return elements.filter((el) => haversineDistance(lat, lon, el.lat, el.lon) <= radiusKm);
  } catch (error) {
    console.error('Error fetching cached OSM stations:', error);
    return null;
  }
}

/**
 * Saves OSM stations and logs the query zone in the database.
 */
export async function saveOsmQueryToCache(
  lat: number,
  lon: number,
  radiusKm: number,
  elements: any[]
): Promise<void> {
  try {
    const payload = await getPayload({ config });
    const cachedAt = new Date().toISOString();

    // 1. Save/Upsert elements
    for (const el of elements) {
      const osmId = String(el.id || el.osmId);
      if (!osmId) continue;

      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (elLat === undefined || elLon === undefined) continue;

      const tags = el.tags || {};

      const data = {
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
      };

      const existing = await payload.find({
        collection: 'osm-stations',
        where: { osmId: { equals: osmId } },
        limit: 1,
      });

      if (existing.docs.length > 0) {
        await payload.update({
          collection: 'osm-stations',
          id: existing.docs[0].id,
          data,
        });
      } else {
        await payload.create({
          collection: 'osm-stations',
          data,
        });
      }
    }

    // 2. Log query zone (with 1km buffer for coverage overlay)
    await payload.create({
      collection: 'osm-queries',
      data: {
        latitude: lat,
        longitude: lon,
        radius: radiusKm + 1.0, // Cache with 1km padding
        queriedAt: cachedAt,
      },
    });
  } catch (error) {
    console.error('Error saving OSM query to cache:', error);
  }
}
