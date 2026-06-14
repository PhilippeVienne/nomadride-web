import { BaseStation } from '../types';
import { queryOverpass } from '../osmService';
import { getCachedOsmStations, saveOsmQueryToCache } from '../dbCache';

interface CacheEntry {
  data: BaseStation[];
  timestamp: number;
}

const switzerlandCache = new Map<string, CacheEntry>();
const CACHE_TTL_30M = 30 * 60 * 1000;
const CACHE_TTL_90D = 90 * 24 * 60 * 60 * 1000;
const GRID_CELL_SIZE = 0.018; // approx 2 km

/**
 * Switzerland & Liechtenstein Provider implementation.
 */
export async function getSwissStations(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<BaseStation[]> {
  // 1. Manage Grid cell + radius cache key
  const cellLat = Math.floor(lat / GRID_CELL_SIZE);
  const cellLng = Math.floor(lon / GRID_CELL_SIZE);
  const cellKey = `${cellLat}_${cellLng}_${radiusKm}`;

  const cached = switzerlandCache.get(cellKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_30M) {
    return cached.data;
  }

  // 2. Check Database Cache
  let elements: any[] | null = null;
  try {
    elements = await getCachedOsmStations(lat, lon, radiusKm, CACHE_TTL_90D);
  } catch (error) {
    console.error('Error reading Swiss OSM stations from database cache:', error);
  }

  if (elements === null) {
    // 3. Query OSM Overpass API for amenity=fuel around coordinates
    const radiusMeters = Math.round(radiusKm * 1000);
    const overpassQuery = `[out:json][timeout:5];
(
  node["amenity"="fuel"](around:${radiusMeters},${lat},${lon});
  way["amenity"="fuel"](around:${radiusMeters},${lat},${lon});
);
out center tags;`;

    try {
      const response = await queryOverpass(overpassQuery);
      elements = (response?.elements || []) as any[];
      // Save to database cache
      try {
        await saveOsmQueryToCache(lat, lon, radiusKm, elements);
      } catch (dbError) {
        console.error('Error saving Swiss OSM query to database cache:', dbError);
      }
    } catch (error) {
      console.error('Error in SwitzerlandProvider Overpass fetching:', error);
      if (cached) {
        console.warn('Returning stale Swiss spatial cache due to API error');
        return cached.data;
      }
      return [];
    }
  }

  // 4. Map elements to simulated Swiss stations
  const parsedStations: BaseStation[] = [];
  let stationIndex = 0;
  for (const el of elements) {
    const tags = el.tags || {};
    const elLat = el.lat ?? el.center?.lat;
    const elLon = el.lon ?? el.center?.lon;

    if (elLat === undefined || elLon === undefined) continue;

    // Filter 1: Exclude if addr:country is not CH or LI
    const country = tags['addr:country'] ? tags['addr:country'].trim().toUpperCase() : '';
    if (country !== 'CH' && country !== 'LI') continue;

    // Filter 2: Exclude if postcode has 5 digits (anti-overflow filter)
    const postcode = tags['addr:postcode'] ? tags['addr:postcode'].trim() : '';
    if (postcode && /^\d{5}$/.test(postcode)) continue;

    // Filter 3: Bounding box validation: Lat [45.8, 47.9], Lon [5.9, 10.5]
    if (elLat < 45.8 || elLat > 47.9 || elLon < 5.9 || elLon > 10.5) continue;

    // Step B: Deterministic price simulation (CHF)
    const basePrice = 1.82 + (stationIndex % 5) * 0.03;
    const prices = {
      sp95: parseFloat(basePrice.toFixed(2)),
      sp98: parseFloat((basePrice + 0.08).toFixed(2)),
      e10: parseFloat((basePrice - 0.02).toFixed(2)),
      gazole: parseFloat((basePrice + 0.05).toFixed(2)),
    };

    // Mock update date (some fresh, some old to trigger freshness penalties)
    // Generates updatedAt date between 0 and 14 hours ago
    const hoursAgo = stationIndex % 15;
    const updatedAt = new Date(Date.now() - hoursAgo * 3600 * 1000);

    const brand = tags.brand || tags.operator || tags.name;

    parsedStations.push({
      id: String(el.id),
      name: brand || `Station ${el.id}`,
      brand: tags.brand || undefined,
      address: tags['addr:street']
        ? `${tags['addr:street']}${tags['addr:housenumber'] ? ' ' + tags['addr:housenumber'] : ''}`
        : tags['addr:full'] || '',
      city: tags['addr:city'] || '',
      postCode: postcode,
      latitude: elLat,
      longitude: elLon,
      country: country as 'CH' | 'LI',
      currency: 'CHF',
      prices,
      updatedAt,
    });

    stationIndex++;
  }

  // Cache the result in memory
  switzerlandCache.set(cellKey, {
    data: parsedStations,
    timestamp: Date.now(),
  });

  return parsedStations;
}
