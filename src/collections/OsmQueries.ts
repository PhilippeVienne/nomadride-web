import { CollectionConfig } from 'payload';

export const OsmQueries: CollectionConfig = {
  slug: 'osm-queries',
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
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
      name: 'radius',
      type: 'number',
      required: true,
    },
    {
      name: 'queriedAt',
      type: 'date',
      required: true,
      index: true,
    },
  ],
};
