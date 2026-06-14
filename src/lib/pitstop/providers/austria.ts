import { BaseStation, FuelType } from '../types';
import { getCachedFuelStations, saveFuelStationsToCache } from '../dbCache';

interface CacheEntry {
  data: BaseStation[];
  timestamp: number;
}

const austriaCache = new Map<string, CacheEntry>();
const CACHE_TTL_15M = 15 * 60 * 1000;
const GRID_CELL_SIZE = 0.018; // approx 2 km

const AUSTRIA_API_URL = 'https://api.e-control.at/sprit/1.0/search/gas-stations/by-address';

/**
 * AustriaProvider implementation.
 */
export async function getAustrianStations(
  lat: number,
  lon: number,
  selectedFuel: FuelType,
  radiusKm: number = 20
): Promise<BaseStation[]> {
  // Determine Austrian API fuel type parameter
  // DIE = Diesel, SUP = Super 95
  const austriaFuelType = selectedFuel === 'gazole' ? 'DIE' : 'SUP';

  // 1. Manage Grid Cell Cache Key
  const cellLat = Math.floor(lat / GRID_CELL_SIZE);
  const cellLng = Math.floor(lon / GRID_CELL_SIZE);
  const cellKey = `${cellLat}_${cellLng}_${austriaFuelType}`;

  const cached = austriaCache.get(cellKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_15M) {
    return cached.data;
  }

  // 2. Check Database Cache
  try {
    const dbCached = await getCachedFuelStations('AT', lat, lon, radiusKm, CACHE_TTL_15M);
    if (dbCached !== null) {
      // Verify that the cached stations have the requested fuel type
      const hasFuel = dbCached.some((s) => s.prices[selectedFuel] !== undefined);
      if (hasFuel) {
        // Warm up memory cache
        austriaCache.set(cellKey, {
          data: dbCached,
          timestamp: Date.now(),
        });
        return dbCached;
      }
    }
  } catch (error) {
    console.error('Error reading Austrian stations database cache:', error);
  }

  // 2. Fetch from E-Control API
  const url = `${AUSTRIA_API_URL}?latitude=${lat}&longitude=${lon}&fuelType=${austriaFuelType}&includeClosed=false`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Austria API returned HTTP ${res.status}`);
    }

    const stations = (await res.json()) as any[];
    const parsedStations: BaseStation[] = [];

    for (const station of stations) {
      const id = station.id;
      if (!id) continue;

      const loc = station.location;
      if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') continue;

      // Extract fuel prices
      const prices: BaseStation['prices'] = {};
      let priceUpdatedAt: Date | null = null;

      if (Array.isArray(station.prices)) {
        for (const pr of station.prices) {
          if (pr.amount === undefined || pr.amount === null || pr.amount <= 0) continue;
          
          if (pr.fuelType === 'DIE') {
            prices.gazole = pr.amount;
          } else if (pr.fuelType === 'SUP') {
            prices.sp95 = pr.amount;
          }

          if (pr.updatedAt) {
            const date = new Date(pr.updatedAt);
            if (!isNaN(date.getTime()) && (!priceUpdatedAt || date.getTime() > priceUpdatedAt.getTime())) {
              priceUpdatedAt = date;
            }
          }
        }
      }

      parsedStations.push({
        id: String(id),
        name: station.name || station.brand || `Station ${id}`,
        brand: station.brand || undefined,
        address: loc.address || '',
        city: loc.city || '',
        postCode: loc.postalCode || '',
        latitude: loc.latitude,
        longitude: loc.longitude,
        country: 'AT',
        currency: 'EUR',
        prices,
        updatedAt: priceUpdatedAt || new Date(),
      });
    }

    // Cache the parsed stations for this spatial query
    austriaCache.set(cellKey, {
      data: parsedStations,
      timestamp: Date.now(),
    });

    try {
      await saveFuelStationsToCache(parsedStations);
    } catch (error) {
      console.error('Error saving Austrian stations to database cache:', error);
    }

    return parsedStations;
  } catch (error) {
    console.error('Error fetching Austrian stations:', error);
    if (cached) {
      console.warn('Returning stale Austrian spatial cache due to API error');
      return cached.data;
    }
    return [];
  }
}
