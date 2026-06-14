import { BaseStation } from '../types';
import { getCachedFuelStations, saveFuelStationsToCache } from '../dbCache';

interface CacheEntry {
  data: BaseStation[];
  timestamp: number;
}

const germanyCache = new Map<string, CacheEntry>();
const CACHE_TTL_15M = 15 * 60 * 1000;
const GRID_CELL_SIZE = 0.018; // approx 2 km

const TANKERKOENIG_URL = 'https://creativecommons.tankerkoenig.de/json/list.php';

/**
 * GermanyProvider implementation.
 */
export async function getGermanStations(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<BaseStation[]> {
  const apiKey = process.env.TANKERKOENIG_API_KEY;
  if (!apiKey) {
    console.warn('TANKERKOENIG_API_KEY is not configured. German fuel stations will be skipped.');
    return [];
  }

  // 1. Calculate Grid Cell Key for Spatial Cache
  const cellLat = Math.floor(lat / GRID_CELL_SIZE);
  const cellLng = Math.floor(lon / GRID_CELL_SIZE);
  const cellKey = `${cellLat}_${cellLng}`;

  const cached = germanyCache.get(cellKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_15M) {
    return cached.data;
  }

  // 2. Check Database Cache
  try {
    const dbCached = await getCachedFuelStations('DE', lat, lon, radiusKm, CACHE_TTL_15M);
    if (dbCached !== null) {
      // Warm up memory cache
      germanyCache.set(cellKey, {
        data: dbCached,
        timestamp: Date.now(),
      });
      return dbCached;
    }
  } catch (error) {
    console.error('Error reading German stations database cache:', error);
  }

  // Tankerkoenig limits radius to maximum 25 km
  const clampedRadius = Math.min(25, radiusKm);

  // 2. Fetch from Tankerkoenig API
  const url = `${TANKERKOENIG_URL}?lat=${lat}&lng=${lon}&rad=${clampedRadius}&type=all&sort=dist&apikey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Tankerkoenig API returned HTTP ${res.status}`);
    }

    const payload = await res.json();
    if (!payload.ok) {
      throw new Error(`Tankerkoenig API error: ${payload.message || 'unknown error'}`);
    }

    const stations = (payload.stations || []) as any[];
    const parsedStations: BaseStation[] = [];

    for (const station of stations) {
      if (!station.id) continue;

      const prices: BaseStation['prices'] = {};
      
      const sp98 = typeof station.e5 === 'number' ? station.e5 : parseFloat(station.e5);
      const e10 = typeof station.e10 === 'number' ? station.e10 : parseFloat(station.e10);
      const gazole = typeof station.diesel === 'number' ? station.diesel : parseFloat(station.diesel);

      if (!isNaN(sp98) && sp98 > 0) prices.sp98 = sp98;
      if (!isNaN(e10) && e10 > 0) prices.e10 = e10;
      if (!isNaN(gazole) && gazole > 0) prices.gazole = gazole;

      // Extract postcode and city from 'place' (Format: "12345 CityName" or similar)
      let postCode = '';
      let city = station.place || '';
      const match = city.match(/^(\d{5})\s+(.+)$/);
      if (match) {
        postCode = match[1];
        city = match[2];
      }

      parsedStations.push({
        id: String(station.id),
        name: station.name || station.brand || `Station ${station.id}`,
        brand: station.brand || undefined,
        address: station.street || '',
        city,
        postCode,
        latitude: parseFloat(station.lat),
        longitude: parseFloat(station.lng),
        country: 'DE',
        currency: 'EUR',
        prices,
        updatedAt: new Date(), // Tankerkoenig list endpoint doesn't return update times per station
      });
    }

    // Cache the result
    germanyCache.set(cellKey, {
      data: parsedStations,
      timestamp: Date.now(),
    });

    try {
      await saveFuelStationsToCache(parsedStations);
    } catch (error) {
      console.error('Error saving German stations to database cache:', error);
    }

    return parsedStations;
  } catch (error) {
    console.error('Error fetching German stations:', error);
    if (cached) {
      console.warn('Returning stale Germany spatial cache due to API error');
      return cached.data;
    }
    return []; // Fail close/silently without crashing the whole merge request
  }
}
