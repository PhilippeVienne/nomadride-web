import { CollectionConfig } from 'payload';

export const Trips: CollectionConfig = {
  slug: 'trips',
  admin: {
    useAsTitle: 'title',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'geoRideTripId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'title',
      type: 'text',
    },
    {
      name: 'startedAt',
      type: 'date',
      required: true,
    },
    {
      name: 'endedAt',
      type: 'date',
      required: true,
    },
    {
      name: 'distance',
      type: 'number', // Distance in km
    },
    {
      name: 'duration',
      type: 'number', // Duration in minutes
    },
    {
      name: 'path',
      type: 'json', // Array of coordinate points [lat, lng][]
      required: true,
    },
  ],
};
