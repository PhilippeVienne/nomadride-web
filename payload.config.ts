import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import path from 'path';
import { buildConfig } from 'payload';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { Signer } from '@aws-sdk/rds-signer';

import { getPayloadSecret } from './src/utils/crypto';
import { Users } from './src/collections/Users';
import { Trips } from './src/collections/Trips';
import { FuelStations } from './src/collections/FuelStations';
import { OsmStations } from './src/collections/OsmStations';
import { OsmQueries } from './src/collections/OsmQueries';
import { ensurePayloadSchema } from './src/lib/ensureSchema';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const isProd = process.env.NODE_ENV === 'production';

const getDbConnectionString = () => {
  let connStr =
    process.env.DATABASE_URI ||
    'postgres://payload:pl_password_local_95@localhost:5432/georide_tracker';

  // Strip sslmode query parameter so pg-connection-string parser doesn't override pool SSL settings
  const hadSslMode = connStr.includes('sslmode=');
  if (hadSslMode) {
    connStr = connStr.replace(/[?&]sslmode=[^&]*/gi, '');
  }

  // Mask password for safe logging
  const maskedStr = connStr.replace(/(:[^:@]+@)/, ':****@');
  console.log(`[Payload DB Config] Had sslmode: ${hadSslMode} | ConnectionString: ${maskedStr}`);

  return connStr;
};

// `isProd` alone isn't a reliable signal for whether SSL is needed: it was a
// safe default when production always meant Supabase over the public
// internet (SSL required), but a self-hosted Postgres reachable only over
// the deployment platform's internal Docker network (Coolify) usually
// has no SSL listener at all, and forcing it makes the pg driver throw
// "The server does not support SSL connections". DATABASE_SSL lets the
// deployment be explicit; absent, it falls back to the old isProd behavior.
const shouldUseSsl = () => {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return true;
  return isProd;
};

console.log(`[Payload DB SSL Config] isProd: ${isProd} | useSsl: ${shouldUseSsl()}`);

// Aurora PostgreSQL created with "express configuration" (the AWS deployment,
// see infra/aws) has no password at all: its internet access gateway only
// accepts short-lived IAM tokens (15 min). pg calls `password` again for
// every new connection, so the pool never holds an expired token. The
// discrete host/user fields are required here — when a connectionString is
// given, pg takes the password from it and ignores the function.
const getDbPoolConfig = () => {
  const connectionString = getDbConnectionString();
  if (process.env.DATABASE_IAM_AUTH !== 'true') {
    return {
      connectionString,
      connectionTimeoutMillis: 10000,
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : false,
    };
  }

  const url = new URL(connectionString);
  const host = url.hostname;
  const port = Number(url.port || 5432);
  const user = decodeURIComponent(url.username);
  const signer = new Signer({ hostname: host, port, username: user });

  return {
    host,
    port,
    user,
    database: url.pathname.replace(/^\//, ''),
    password: () => signer.getAuthToken(),
    // An auto-paused cluster takes several seconds to resume on the first
    // connection after an idle period; 10s is not always enough.
    connectionTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: true },
  };
};

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
    pool: getDbPoolConfig(),
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
