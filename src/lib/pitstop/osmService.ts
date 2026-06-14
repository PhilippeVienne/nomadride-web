import { BaseStation } from './types';
import { haversineDistance } from './utils';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const brandCache = new Map<string, CacheEntry<string>>();
const CACHE_TTL_6H = 6 * 60 * 60 * 1000;

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
 * Queries Overpass API with failovers and a strict 5-second timeout per attempt.
 */
export async function queryOverpass(qlQuery: string): Promise<any> {
  let lastError: any = null;
  
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(qlQuery)}`,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        return await res.json();
      } else {
        throw new Error(`Overpass returned status ${res.status}`);
      }
    } catch (err) {
      console.warn(`Overpass query failed for ${endpoint}, trying next failover:`, err);
      lastError = err;
    }
  }
  throw lastError || new Error('All Overpass API endpoints failed');
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

/**
 * Enriches a batch of stations with brand names from OpenStreetMap.
 */
export async function enrichBrands(
  stations: BaseStation[],
  centerLat: number,
  centerLng: number,
  radiusKm: number
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

  // 2. Perform Batch Fetch from Overpass for amenity=fuel in the search radius
  // Convert km radius to meters
  const radiusMeters = Math.round(radiusKm * 1000);
  const overpassQuery = `[out:json][timeout:5];
(
  node["amenity"="fuel"](around:${radiusMeters},${centerLat},${centerLng});
  way["amenity"="fuel"](around:${radiusMeters},${centerLat},${centerLng});
);
out center tags;`;

  let osmElements: OsmElement[] = [];
  try {
    const response = await queryOverpass(overpassQuery);
    if (response && response.elements) {
      osmElements = response.elements as OsmElement[];
    }
  } catch (error) {
    console.error('Failed to fetch brand enrichment data from Overpass:', error);
    // If OSM query fails, return stations with whatever brands we resolved so far
    return stations;
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
