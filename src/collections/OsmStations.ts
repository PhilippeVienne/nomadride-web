import { CollectionConfig } from 'payload';

export const OsmStations: CollectionConfig = {
  slug: 'osm-stations',
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'osmId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'type',
      type: 'text',
      required: true,
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
      name: 'brand',
      type: 'text',
    },
    {
      name: 'operator',
      type: 'text',
    },
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'country',
      type: 'text',
    },
    {
      name: 'postcode',
      type: 'text',
    },
    {
      name: 'street',
      type: 'text',
    },
    {
      name: 'cachedAt',
      type: 'date',
      required: true,
      index: true,
    },
  ],
};
