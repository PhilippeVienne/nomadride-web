import { CollectionConfig } from 'payload';

export const FuelStations: CollectionConfig = {
  slug: 'fuel-stations',
  access: {
    // Shared, non-sensitive cache: safe to read publicly, but only the
    // server-side Local API (which bypasses access control) should write.
    read: () => true,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'stationId',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'country',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'brand',
      type: 'text',
    },
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'address',
      type: 'text',
    },
    {
      name: 'city',
      type: 'text',
    },
    {
      name: 'postCode',
      type: 'text',
    },
    {
      name: 'latitude',
      type: 'number',
      required: true,
    },
    {
      name: 'longitude',
      type: 'number',
      required: true,
    },
    {
      name: 'currency',
      type: 'text',
      required: true,
    },
    {
      name: 'prices',
      type: 'json',
    },
    {
      name: 'stationUpdatedAt',
      type: 'date',
    },
    {
      name: 'cachedAt',
      type: 'date',
      required: true,
      index: true,
    },
  ],
};
