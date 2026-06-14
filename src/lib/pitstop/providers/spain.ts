import { BaseStation } from '../types';
import { haversineDistance } from '../utils';
import { getCachedFuelStations, saveFuelStationsToCache } from '../dbCache';

interface CacheEntry {
  data: BaseStation[];
  timestamp: number;
}

let globalSpainCache: CacheEntry | null = null;
const CACHE_TTL_2H = 2 * 60 * 60 * 1000;

const SPAIN_API_URL =
  'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

/**
 * Parses Spanish dates in DD/MM/YYYY HH:MM:SS format.
 */
function parseSpanishDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const parts = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (parts) {
    return new Date(
      parseInt(parts[3], 10),
      parseInt(parts[2], 10) - 1, // 0-indexed month
      parseInt(parts[1], 10),
      parseInt(parts[4], 10),
      parseInt(parts[5], 10),
      parseInt(parts[6], 10)
    );
  }
  return new Date();
}

/**
 * Fetch and parse all Spanish gas stations.
 */
async function fetchAllSpanishStations(): Promise<BaseStation[]> {
  try {
    const res = await fetch(SPAIN_API_URL);
    if (!res.ok) {
      throw new Error(`Spain API returned HTTP ${res.status}`);
    }

    const payload = await res.json();
    const records = (payload.ListaEESSPrecio || []) as any[];
    const updatedAt = parseSpanishDate(payload.Fecha);
    
    const parsedStations: BaseStation[] = [];

    const parsePrice = (val?: string): number | undefined => {
      if (!val) return undefined;
      const cleanVal = val.replace(',', '.').trim();
      if (!cleanVal) return undefined;
      const parsed = parseFloat(cleanVal);
      return isNaN(parsed) || parsed <= 0 ? undefined : parsed;
    };

    for (const record of records) {
      const id = record.IDEESS;
      if (!id) continue;

      const latVal = record.Latitud;
      const lonVal = record['Longitud (WGS84)'];
      if (!latVal || !lonVal) continue;

      const lat = parsePrice(latVal);
      const lon = parsePrice(lonVal);
      if (lat === undefined || lon === undefined) continue;

      const prices: BaseStation['prices'] = {};
      const sp95 = parsePrice(record['Precio Gasolina 95 E5']);
      const sp98 = parsePrice(record['Precio Gasolina 98 E5']);
      const e10 = parsePrice(record['Precio Gasolina 95 E10']);
      const gazole = parsePrice(record['Precio Gasoleo A']);

      if (sp95 !== undefined) prices.sp95 = sp95;
      if (sp98 !== undefined) prices.sp98 = sp98;
      if (e10 !== undefined) prices.e10 = e10;
      if (gazole !== undefined) prices.gazole = gazole;

      const brand = record.Rótulo ? record.Rótulo.trim() : undefined;

      parsedStations.push({
        id: String(id),
        name: brand || `Station ${id}`,
        brand: brand || undefined,
        address: record.Dirección || '',
        city: record.Localidad || record.Municipio || '',
        postCode: record['C.P.'] || '',
        latitude: lat,
        longitude: lon,
        country: 'ES',
        currency: 'EUR',
        prices,
        updatedAt,
      });
    }

    return parsedStations;
  } catch (error) {
    console.error('Failed to fetch Spanish stations:', error);
    throw error;
  }
}

/**
 * SpainProvider implementation.
 */
export async function getSpanishStations(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<BaseStation[]> {
  // 1. Check Database Cache
  try {
    const cached = await getCachedFuelStations('ES', lat, lon, radiusKm, CACHE_TTL_2H);
    if (cached !== null) {
      return cached;
    }
  } catch (error) {
    console.error('Error reading Spanish stations database cache:', error);
  }

  // 2. Manage Global In-Memory Cache on Miss
  if (!globalSpainCache || Date.now() - globalSpainCache.timestamp > CACHE_TTL_2H) {
    try {
      const data = await fetchAllSpanishStations();
      globalSpainCache = {
        data,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.warn('Using stale Spain cache due to fetch error');
      if (!globalSpainCache) throw error;
    }
  }

  const allStations = globalSpainCache.data;

  // 3. Filter stations to the query area with a 10km buffer and save to cache
  const bufferKm = radiusKm + 10;
  const nearbyStations = allStations.filter((station) => {
    const dist = haversineDistance(lat, lon, station.latitude, station.longitude);
    return dist <= bufferKm;
  });

  try {
    await saveFuelStationsToCache(nearbyStations);
  } catch (error) {
    console.error('Error saving Spanish stations to database cache:', error);
  }

  // 4. Return exact filtered stations
  return nearbyStations.filter((station) => {
    const dist = haversineDistance(lat, lon, station.latitude, station.longitude);
    return dist <= radiusKm;
  });
}
