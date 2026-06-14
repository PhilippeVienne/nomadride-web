export type FuelType = 'sp95' | 'sp98' | 'e10' | 'gazole';

export interface BaseStation {
  id: string;
  brand?: string;
  name?: string;
  address: string;
  city: string;
  postCode: string;
  latitude: number;
  longitude: number;
  country: 'FR' | 'ES' | 'DE' | 'AT' | 'CH' | 'LI';
  currency: 'EUR' | 'CHF';
  prices: {
    [key in FuelType]?: number; // Price per liter
  };
  updatedAt: Date;
}

export interface PitStopResponse extends BaseStation {
  distanceKm: number;
  detourCostEur: number;
  totalFuelCostEur: number;
  totalCostOriginalCurrency: number;
  freshnessPenaltyEur: number;
}

export interface TripSettings {
  fillSize: number;       // Remaining capacity to fill in liters
  consumption: number;    // Consumption in L/100km of the motorcycle
  excludeDistance: boolean;
}
