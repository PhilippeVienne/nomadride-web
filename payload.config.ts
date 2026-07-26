import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import path from 'path';
import { buildConfig } from 'payload';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { Users } from './src/collections/Users';
import { Trips } from './src/collections/Trips';
import { FuelStations } from './src/collections/FuelStations';
import { OsmStations } from './src/collections/OsmStations';
import { OsmQueries } from './src/collections/OsmQueries';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

export default buildConfig({
  admin: {
    user: 'users',
  },
  collections: [Users, Trips, FuelStations, OsmStations, OsmQueries],
  editor: lexicalEditor({}),
  secret: process.env.PAYLOAD_SECRET || 'a_very_secure_local_secret_key_for_payload_development_95',
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || 'postgres://payload:pl_password_local_95@localhost:5432/georide_tracker',
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_URI?.includes('sslmode=') || isProd
        ? { rejectUnauthorized: false }
        : false,
    },
    tablesFilter: [
      '!spatial_ref_sys',
      '!geography_columns',
      '!geometry_columns',
      '!raster_columns',
      '!raster_overviews',
    ],
  }),
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
});
