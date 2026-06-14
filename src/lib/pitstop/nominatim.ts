interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const nominatimCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_24H = 24 * 60 * 60 * 1000;

export interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  boundingbox: string[];
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
}

export async function searchNominatim(query: string): Promise<NominatimResult[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const cached = nominatimCache.get(normalizedQuery);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_24H) {
    return cached.data;
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=fr,mc,de,es,at,it,ch,li`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'GeoRidePitStop/1.0 (contact@yourdomain.com)',
      },
    });

    if (!res.ok) {
      throw new Error(`Nominatim API returned HTTP ${res.status}`);
    }

    const data = (await res.json()) as NominatimResult[];
    nominatimCache.set(normalizedQuery, {
      data,
      timestamp: Date.now(),
    });
    return data;
  } catch (error) {
    console.error('Error in searchNominatim:', error);
    if (cached) {
      console.warn('Returning stale Nominatim cache after error');
      return cached.data;
    }
    throw error;
  }
}
