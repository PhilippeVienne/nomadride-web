import { CollectionConfig } from 'payload';
import { encrypt, isEncrypted } from '../utils/crypto';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'auth0Id',
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
              const secret = process.env.PAYLOAD_SECRET || 'a_very_secure_local_secret_key_for_payload_development_95';
              return encrypt(value, secret);
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
      defaultValue: 'sp95',
    },
    {
      name: 'searchRadius',
      type: 'number',
      defaultValue: 20,
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
