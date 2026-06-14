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
  ],
};
