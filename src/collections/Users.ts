import { CollectionConfig } from 'payload';
import { encrypt, isEncrypted, getPayloadSecret } from '../utils/crypto';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
  },
  access: {
    // Every user record (including the encrypted GeoRide credentials) may
    // only be read/edited by the account it belongs to. Provisioning and
    // sync happen server-side via the Payload Local API, which bypasses
    // access control, so this only restricts the public REST/GraphQL API
    // and the admin panel.
    read: ({ req }) => (req.user ? { id: { equals: req.user.id } } : false),
    create: () => false,
    update: ({ req }) => (req.user ? { id: { equals: req.user.id } } : false),
    delete: () => false,
  },
  fields: [
    {
      name: 'googleId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'geoRideEmail',
      type: 'email',
    },
    {
      name: 'geoRidePassword',
      type: 'text',
      hooks: {
        beforeChange: [
          ({ value }) => {
            if (value && !isEncrypted(value)) {
              return encrypt(value, getPayloadSecret());
            }
            return value;
          },
        ],
      },
    },
    {
      name: 'lastSyncDate',
      type: 'date',
    },
    {
      name: 'trackingStartDate',
      type: 'date',
    },
    {
      name: 'selectedFuel',
      type: 'select',
      options: [
        { label: 'SP95', value: 'sp95' },
        { label: 'SP98', value: 'sp98' },
        { label: 'E10', value: 'e10' },
        { label: 'Gazole', value: 'gazole' },
      ],
      // No defaultValue: an unset field lets PitstopClient tell "never chosen"
      // apart from "explicitly sp95", which drives the mobile SP98 quick-start default.
    },
    {
      name: 'searchRadius',
      type: 'number',
      // No defaultValue: same reasoning as selectedFuel, for the mobile 10km quick-start default.
    },
    {
      name: 'fillSize',
      type: 'number',
      defaultValue: 15,
    },
    {
      name: 'consumption',
      type: 'number',
      defaultValue: 5.0,
    },
    {
      name: 'excludeDistance',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'lastSearchQuery',
      type: 'text',
    },
    {
      name: 'lastSearchLat',
      type: 'number',
    },
    {
      name: 'lastSearchLng',
      type: 'number',
    },
    {
      name: 'selectedTrackers',
      type: 'array',
      fields: [
        {
          name: 'trackerId',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
};
