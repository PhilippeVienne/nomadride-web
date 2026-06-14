import { BaseStation, FuelType, PitStopResponse, TripSettings } from '../types';
import { haversineDistance } from '../utils';
import { enrichBrands } from '../osmService';
import { getFrenchStations } from './france';
import { getSpanishStations } from './spain';
import { getGermanStations } from './germany';
import { getAustrianStations } from './austria';
import { getSwissStations } from './switzerland';

// Country Bounding Boxes for overlap checks
const FR_BBOX = { minLat: 41.0, maxLat: 51.5, minLng: -5.5, maxLng: 10.0 };
const ES_BBOX = { minLat: 27.0, maxLat: 44.5, minLng: -18.5, maxLng: 4.5 }; // Includes Canaries
const DE_BBOX = { minLat: 47.2, maxLat: 55.1, minLng: 5.8, maxLng: 15.2 };
const AT_BBOX = { minLat: 46.3, maxLat: 49.1, minLng: 9.5, maxLng: 17.2 };
const CH_BBOX = { minLat: 45.8, maxLat: 47.9, minLng: 5.9, maxLng: 10.5 }; // Bounding box strict CH from spec

/**
 * Checks if the search circle overlaps with a country's bounding box.
 */
function overlaps(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): boolean {
  // Approximate conversion: 1 degree latitude = 111.12 km
  const pad = radiusKm / 111.12;
  return (
    centerLat + pad >= bbox.minLat &&
    centerLat - pad <= bbox.maxLat &&
    centerLng + pad >= bbox.minLng &&
    centerLng - pad <= bbox.maxLng
  );
}

/**
 * Calculates the effective fuel cost, including freshness penalty and detour cost.
 */
export function calculateEffectiveCost(
  station: BaseStation,
  distanceKm: number,
  selectedFuelType: FuelType,
  settings: TripSettings
): PitStopResponse {
  const FX_CHF_TO_EUR = 0.95; // 1 CHF = 0.95 EUR (2026)
  const FX_EUR_TO_CHF = 1.05; // 1 EUR = 1.05 CHF

  const price = station.prices[selectedFuelType];
  const hasPrice = price !== undefined && price !== null;

  // 1. Normalization in EUR (default to 0 if price is missing to avoid JSON null serialization issues)
  const priceInEur = hasPrice
    ? (station.currency === 'CHF' ? price * FX_CHF_TO_EUR : price)
    : 0;

  // 2. Freshness penalty (+0.002 EUR/L per hour beyond 12 hours, capped at 0.15 EUR)
  const ageInHours = (Date.now() - new Date(station.updatedAt).getTime()) / 3600000;
  const freshnessPenalty = ageInHours > 12 
    ? Math.min(0.15, (ageInHours - 12) * 0.002) 
    : 0;

  const effectivePricePerLiterEur = priceInEur + (hasPrice ? freshnessPenalty : 0);

  // 3. Detour cost calculation (two-way trip, distanceKm * 2)
  const consumptionPerKm = settings.consumption / 100;
  const detourFuelUsed = settings.excludeDistance ? 0 : distanceKm * 2 * consumptionPerKm;

  const detourCostEur = hasPrice ? detourFuelUsed * effectivePricePerLiterEur : 0;
  const totalFuelCostEur = hasPrice ? settings.fillSize * effectivePricePerLiterEur : 0;
  const totalCostEur = totalFuelCostEur + detourCostEur;

  // 4. Convert back to original currency for display
  const totalCostOriginalCurrency = hasPrice
    ? (station.currency === 'CHF' ? totalCostEur * FX_EUR_TO_CHF : totalCostEur)
    : 0;

  return {
    ...station,
    distanceKm,
    detourCostEur: parseFloat(detourCostEur.toFixed(3)),
    totalFuelCostEur: parseFloat(totalFuelCostEur.toFixed(3)),
    totalCostOriginalCurrency: parseFloat(totalCostOriginalCurrency.toFixed(2)),
    freshnessPenaltyEur: parseFloat(freshnessPenalty.toFixed(4)),
  };
}

/**
 * Queries all overlapping providers, enriches brands, calculates costs and sorts the final list.
 */
export async function getStationsAround(
  lat: number,
  lon: number,
  radiusKm: number,
  selectedFuel: FuelType,
  settings: TripSettings
): Promise<PitStopResponse[]> {
  const promises: Promise<BaseStation[]>[] = [];

  // Determine overlapping countries
  if (overlaps(lat, lon, radiusKm, FR_BBOX)) promises.push(getFrenchStations(lat, lon, radiusKm));
  if (overlaps(lat, lon, radiusKm, ES_BBOX)) promises.push(getSpanishStations(lat, lon, radiusKm));
  if (overlaps(lat, lon, radiusKm, DE_BBOX)) promises.push(getGermanStations(lat, lon, radiusKm));
  if (overlaps(lat, lon, radiusKm, AT_BBOX)) promises.push(getAustrianStations(lat, lon, selectedFuel, radiusKm));
  if (overlaps(lat, lon, radiusKm, CH_BBOX)) promises.push(getSwissStations(lat, lon, radiusKm));

  // Execute in parallel
  const settles = await Promise.allSettled(promises);
  const stations: BaseStation[] = [];

  for (const settle of settles) {
    if (settle.status === 'fulfilled') {
      stations.push(...settle.value);
    } else {
      console.error('One of the country providers failed during lookup:', settle.reason);
    }
  }

  // Double-check distances to filter out edge cases and compute distances
  const stationsWithDistance = stations
    .map((station) => {
      const distance = haversineDistance(lat, lon, station.latitude, station.longitude);
      return { station, distance };
    })
    .filter((item) => item.distance <= radiusKm);

  const finalStationsBase = stationsWithDistance.map((item) => item.station);

  // Perform Brand Enrichment via OSM Overpass API in batch
  const enrichedStations = await enrichBrands(finalStationsBase, lat, lon, radiusKm);

  // Calculate costs
  const results = enrichedStations.map((station) => {
    const distItem = stationsWithDistance.find((item) => item.station.id === station.id && item.station.country === station.country);
    const distance = distItem ? distItem.distance : radiusKm;
    return calculateEffectiveCost(station, distance, selectedFuel, settings);
  });

  // Strict sorting
  results.sort((a, b) => {
    const aHasPrice = a.prices[selectedFuel] !== undefined;
    const bHasPrice = b.prices[selectedFuel] !== undefined;

    // Rule 1: Availability of the requested fuel type
    if (aHasPrice && !bHasPrice) return -1;
    if (!aHasPrice && bHasPrice) return 1;
    if (!aHasPrice && !bHasPrice) return 0; // Both are unavailable

    // Rule 2: Economic cost (total cost in EUR)
    const aTotalCostEur = a.totalFuelCostEur + a.detourCostEur;
    const bTotalCostEur = b.totalFuelCostEur + b.detourCostEur;
    if (Math.abs(aTotalCostEur - bTotalCostEur) > 0.0001) {
      return aTotalCostEur - bTotalCostEur;
    }

    // Rule 3: Distance proximity
    return a.distanceKm - b.distanceKm;
  });

  return results;
}
