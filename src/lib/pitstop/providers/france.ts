import { BaseStation } from '../types';
import { haversineDistance } from '../utils';

interface CacheEntry {
  data: BaseStation[];
  timestamp: number;
}

let globalFranceCache: CacheEntry | null = null;
const CACHE_TTL_1H = 60 * 60 * 1000;

const FRANCE_API_URL =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/exports/json';

/**
 * Fetch and parse all French gas stations.
 */
async function fetchAllFrenchStations(): Promise<BaseStation[]> {
  try {
    const res = await fetch(FRANCE_API_URL);
    if (!res.ok) {
      throw new Error(`France API returned HTTP ${res.status}`);
    }

    const records = (await res.json()) as any[];
    const parsedStations: BaseStation[] = [];

    const parsePrice = (val: any): number | undefined => {
      if (val === undefined || val === null) return undefined;
      const num = typeof val === 'number' ? val : parseFloat(val);
      return isNaN(num) || num <= 0 ? undefined : num;
    };

    for (const record of records) {
      if (!record.id) continue;

      // Latitude and Longitude parsing with integer/large float conversion
      let lat = parseFloat(record.latitude);
      let lon = parseFloat(record.longitude);

      if (isNaN(lat) || isNaN(lon)) {
        // Fallback to geom if available
        if (record.geom && typeof record.geom.lat === 'number' && typeof record.geom.lon === 'number') {
          lat = record.geom.lat;
          lon = record.geom.lon;
        } else {
          continue; // Cannot map this station
        }
      } else {
        if (Math.abs(lat) > 1000) lat /= 100000;
        if (Math.abs(lon) > 1000) lon /= 100000;
      }

      // Fuel prices
      const prices: BaseStation['prices'] = {};
      const sp95 = parsePrice(record.sp95_prix);
      const sp98 = parsePrice(record.sp98_prix);
      const e10 = parsePrice(record.e10_prix);
      const gazole = parsePrice(record.gazole_prix);

      if (sp95 !== undefined) prices.sp95 = sp95;
      if (sp98 !== undefined) prices.sp98 = sp98;
      if (e10 !== undefined) prices.e10 = e10;
      if (gazole !== undefined) prices.gazole = gazole;

      // Extract update date
      const dates = [record.sp95_maj, record.sp98_maj, record.e10_maj, record.gazole_maj]
        .filter(Boolean)
        .map((d) => new Date(d).getTime());
      const updatedAt = dates.length > 0 ? new Date(Math.max(...dates)) : new Date();

      parsedStations.push({
        id: String(record.id),
        name: record.brand || record.name || `Station ${record.ville || record.id}`,
        brand: record.brand || undefined, // Often undefined in France API, resolved via OSM
        address: record.adresse || '',
        city: record.ville || '',
        postCode: record.cp || '',
        latitude: lat,
        longitude: lon,
        country: 'FR',
        currency: 'EUR',
        prices,
        updatedAt,
      });
    }

    return parsedStations;
  } catch (error) {
    console.error('Failed to fetch French stations:', error);
    throw error;
  }
}

/**
 * FranceProvider implementation.
 */
export async function getFrenchStations(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<BaseStation[]> {
  // 1. Manage Global In-Memory Cache
  if (!globalFranceCache || Date.now() - globalFranceCache.timestamp > CACHE_TTL_1H) {
    try {
      const data = await fetchAllFrenchStations();
      globalFranceCache = {
        data,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.warn('Using stale France cache due to fetch error');
      if (!globalFranceCache) throw error;
    }
  }

  const allStations = globalFranceCache.data;

  // 2. Local geographic filtering
  return allStations.filter((station) => {
    const dist = haversineDistance(lat, lon, station.latitude, station.longitude);
    return dist <= radiusKm;
  });
}
