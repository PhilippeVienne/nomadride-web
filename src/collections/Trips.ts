import { CollectionConfig } from 'payload';

export const Trips: CollectionConfig = {
  slug: 'trips',
  admin: {
    useAsTitle: 'title',
  },
  access: {
    // Trips carry GPS traces, so scope every operation to the owning user.
    // Creation/sync happens server-side via the Payload Local API, which
    // bypasses access control.
    read: ({ req }) => (req.user ? { user: { equals: req.user.id } } : false),
    create: () => false,
    update: ({ req }) => (req.user ? { user: { equals: req.user.id } } : false),
    delete: ({ req }) => (req.user ? { user: { equals: req.user.id } } : false),
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
