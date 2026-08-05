import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import path from 'path';
import { buildConfig } from 'payload';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { getPayloadSecret } from './src/utils/crypto';
import { Users } from './src/collections/Users';
import { Trips } from './src/collections/Trips';
import { FuelStations } from './src/collections/FuelStations';
import { OsmStations } from './src/collections/OsmStations';
import { OsmQueries } from './src/collections/OsmQueries';
import { ensurePayloadSchema } from './src/lib/ensureSchema';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

const getDbConnectionString = () => {
  const source = process.env.POSTGRES_URL_NON_POOLING
    ? 'POSTGRES_URL_NON_POOLING'
    : process.env.POSTGRES_URL
    ? 'POSTGRES_URL'
    : process.env.DATABASE_URI
    ? 'DATABASE_URI'
    : 'LOCAL_FALLBACK';

  let connStr = (
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URI ||
    'postgres://payload:pl_password_local_95@localhost:5432/georide_tracker'
  );

  // Strip sslmode query parameter so pg-connection-string parser doesn't override pool SSL settings
  const hadSslMode = connStr.includes('sslmode=');
  if (hadSslMode) {
    connStr = connStr.replace(/[?&]sslmode=[^&]*/gi, '');
  }

  // Mask password for safe logging
  const maskedStr = connStr.replace(/(:[^:@]+@)/, ':****@');
  console.log(`[Payload DB Config] Source: ${source} | Had sslmode: ${hadSslMode} | ConnectionString: ${maskedStr}`);

  return connStr;
};

const getSslCa = () => {
  if (!process.env.POSTGRES_CA) return undefined;
  return process.env.POSTGRES_CA.replace(/\\n/g, '\n');
};

const hasCa = !!process.env.POSTGRES_CA;
console.log(`[Payload DB SSL Config] isProd: ${isProd} | hasPostgresCa: ${hasCa}`);

export default buildConfig({
  admin: {
    user: 'users',
  },
  // `push: true` (below) only syncs schema in development — in production
  // (this project has no migrations set up) it's a no-op, so tables/columns
  // must be created/patched here proactively at startup instead of relying
  // on reactive error handling scattered across route handlers.
  onInit: async (payload) => {
    await ensurePayloadSchema(payload);
  },
  collections: [Users, Trips, FuelStations, OsmStations, OsmQueries],
  editor: lexicalEditor({}),
  secret: getPayloadSecret(),
  db: postgresAdapter({
    pool: {
      connectionString: getDbConnectionString(),
      connectionTimeoutMillis: 10000,
      ssl: isProd
        ? {
            rejectUnauthorized: false,
            ...(getSslCa() ? { ca: getSslCa() } : {}),
          }
        : false,
    },
    push: true,
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
