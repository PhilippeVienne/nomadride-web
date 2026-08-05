// Statements are run one at a time (not as a single multi-statement string)
// so that a failure repairing one table never rolls back fixes already
// applied to another table in the same pass.
const STATEMENTS: string[] = [
  // ---------------------------------------------------------------------
  // users
  // ---------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "users" (
    "id" serial PRIMARY KEY,
    "email" varchar NOT NULL,
    "password" varchar,
    "auth0_id" varchar,
    "geo_ride_email" varchar,
    "geo_ride_password" varchar,
    "last_sync_date" timestamp with time zone,
    "tracking_start_date" timestamp with time zone,
    "selected_fuel" varchar,
    "search_radius" numeric,
    "fill_size" numeric DEFAULT 15,
    "consumption" numeric DEFAULT 5,
    "exclude_distance" boolean DEFAULT false,
    "last_search_query" varchar,
    "last_search_lat" numeric,
    "last_search_lng" numeric,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_password_token" varchar`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_password_expiration" timestamp with time zone`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "salt" varchar`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hash" varchar`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_attempts" numeric DEFAULT 0`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lock_until" timestamp with time zone`,

  // users_selected_trackers (array field: id is a Payload-generated hex
  // string, NOT an auto-incrementing integer — this is the bug that broke
  // /settings inserts)
  `CREATE TABLE IF NOT EXISTS "users_selected_trackers" (
    "id" varchar PRIMARY KEY,
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "tracker_id" varchar NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "users_selected_trackers_parent_id_idx" ON "users_selected_trackers" ("_parent_id")`,
  // Repair tables created by an older, incorrect version of this script
  // where "id" was wrongly typed as serial/integer.
  `ALTER TABLE "users_selected_trackers" ALTER COLUMN "id" DROP DEFAULT`,
  `ALTER TABLE "users_selected_trackers" ALTER COLUMN "id" TYPE varchar USING "id"::varchar`,

  // users_sessions (same id caveat as above)
  `CREATE TABLE IF NOT EXISTS "users_sessions" (
    "id" varchar PRIMARY KEY,
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "created_at" timestamp with time zone,
    "expires_at" timestamp with time zone
  )`,
  `CREATE INDEX IF NOT EXISTS "users_sessions_parent_id_idx" ON "users_sessions" ("_parent_id")`,
  `ALTER TABLE "users_sessions" ALTER COLUMN "id" DROP DEFAULT`,
  `ALTER TABLE "users_sessions" ALTER COLUMN "id" TYPE varchar USING "id"::varchar`,

  // ---------------------------------------------------------------------
  // trips
  // ---------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "trips" (
    "id" serial PRIMARY KEY,
    "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
    "geo_ride_trip_id" varchar,
    "title" varchar,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "distance" numeric,
    "duration" numeric,
    "path" jsonb,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "geo_ride_trip_id" varchar`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "trips_geo_ride_trip_id_idx" ON "trips" ("geo_ride_trip_id")`,

  // ---------------------------------------------------------------------
  // fuel_stations — table name/shape changed (osm_id/lat/lng/last_updated
  // → station_id/latitude/longitude/currency/...). Relax legacy NOT NULL
  // constraints so current inserts (which don't populate those old
  // columns) don't fail.
  // ---------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "fuel_stations" (
    "id" serial PRIMARY KEY,
    "station_id" varchar,
    "country" varchar,
    "brand" varchar,
    "name" varchar,
    "address" varchar,
    "city" varchar,
    "post_code" varchar,
    "latitude" numeric,
    "longitude" numeric,
    "currency" varchar,
    "prices" jsonb,
    "station_updated_at" timestamp with time zone,
    "cached_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "fuel_stations" ADD COLUMN IF NOT EXISTS "station_id" varchar`,
  `ALTER TABLE "fuel_stations" ADD COLUMN IF NOT EXISTS "country" varchar`,
  `ALTER TABLE "fuel_stations" ADD COLUMN IF NOT EXISTS "address" varchar`,
  `ALTER TABLE "fuel_stations" ADD COLUMN IF NOT EXISTS "city" varchar`,
  `ALTER TABLE "fuel_stations" ADD COLUMN IF NOT EXISTS "post_code" varchar`,
  `ALTER TABLE "fuel_stations" ADD COLUMN IF NOT EXISTS "latitude" numeric`,
  `ALTER TABLE "fuel_stations" ADD COLUMN IF NOT EXISTS "longitude" numeric`,
  `ALTER TABLE "fuel_stations" ADD COLUMN IF NOT EXISTS "currency" varchar`,
  `ALTER TABLE "fuel_stations" ADD COLUMN IF NOT EXISTS "station_updated_at" timestamp with time zone`,
  `ALTER TABLE "fuel_stations" ADD COLUMN IF NOT EXISTS "cached_at" timestamp with time zone`,
  `ALTER TABLE "fuel_stations" ALTER COLUMN "osm_id" DROP NOT NULL`,
  `ALTER TABLE "fuel_stations" ALTER COLUMN "lat" DROP NOT NULL`,
  `ALTER TABLE "fuel_stations" ALTER COLUMN "lng" DROP NOT NULL`,

  // ---------------------------------------------------------------------
  // osm_stations — osm_id/type stayed, but lat/lng were renamed to
  // latitude/longitude and several columns (operator/country/postcode/
  // street) were added.
  // ---------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "osm_stations" (
    "id" serial PRIMARY KEY,
    "osm_id" varchar UNIQUE,
    "type" varchar,
    "latitude" numeric,
    "longitude" numeric,
    "brand" varchar,
    "operator" varchar,
    "name" varchar,
    "country" varchar,
    "postcode" varchar,
    "street" varchar,
    "cached_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "osm_stations" ADD COLUMN IF NOT EXISTS "type" varchar`,
  `ALTER TABLE "osm_stations" ADD COLUMN IF NOT EXISTS "latitude" numeric`,
  `ALTER TABLE "osm_stations" ADD COLUMN IF NOT EXISTS "longitude" numeric`,
  `ALTER TABLE "osm_stations" ADD COLUMN IF NOT EXISTS "operator" varchar`,
  `ALTER TABLE "osm_stations" ADD COLUMN IF NOT EXISTS "country" varchar`,
  `ALTER TABLE "osm_stations" ADD COLUMN IF NOT EXISTS "postcode" varchar`,
  `ALTER TABLE "osm_stations" ADD COLUMN IF NOT EXISTS "street" varchar`,
  `ALTER TABLE "osm_stations" ADD COLUMN IF NOT EXISTS "cached_at" timestamp with time zone`,
  `ALTER TABLE "osm_stations" ALTER COLUMN "lat" DROP NOT NULL`,
  `ALTER TABLE "osm_stations" ALTER COLUMN "lng" DROP NOT NULL`,
  `ALTER TABLE "osm_stations" ALTER COLUMN "osm_id" DROP NOT NULL`,

  // ---------------------------------------------------------------------
  // osm_queries — completely different shape (query_hash/bounds/fetched_at
  // → latitude/longitude/radius/queried_at).
  // ---------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "osm_queries" (
    "id" serial PRIMARY KEY,
    "latitude" numeric,
    "longitude" numeric,
    "radius" numeric,
    "queried_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "osm_queries" ADD COLUMN IF NOT EXISTS "latitude" numeric`,
  `ALTER TABLE "osm_queries" ADD COLUMN IF NOT EXISTS "longitude" numeric`,
  `ALTER TABLE "osm_queries" ADD COLUMN IF NOT EXISTS "radius" numeric`,
  `ALTER TABLE "osm_queries" ADD COLUMN IF NOT EXISTS "queried_at" timestamp with time zone`,
  `ALTER TABLE "osm_queries" ALTER COLUMN "query_hash" DROP NOT NULL`,
  `ALTER TABLE "osm_queries" ALTER COLUMN "fetched_at" DROP NOT NULL`,

  // ---------------------------------------------------------------------
  // payload core tables
  // ---------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "payload_migrations" (
    "id" serial PRIMARY KEY,
    "name" varchar,
    "batch" numeric,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS "payload_locked_documents" (
    "id" serial PRIMARY KEY,
    "global_slug" varchar,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "payload_locked_documents_rels" (
    "id" serial PRIMARY KEY,
    "order" integer,
    "parent_id" integer NOT NULL REFERENCES "payload_locked_documents"("id") ON DELETE CASCADE,
    "path" varchar NOT NULL,
    "users_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
    "trips_id" integer REFERENCES "trips"("id") ON DELETE CASCADE,
    "fuel_stations_id" integer REFERENCES "fuel_stations"("id") ON DELETE CASCADE,
    "osm_stations_id" integer REFERENCES "osm_stations"("id") ON DELETE CASCADE,
    "osm_queries_id" integer REFERENCES "osm_queries"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" ("order")`,
  `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" ("parent_id")`,
  `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" ("path")`,
  `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" ("users_id")`,
  `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trips_id_idx" ON "payload_locked_documents_rels" ("trips_id")`,
  `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_fuel_stations_id_idx" ON "payload_locked_documents_rels" ("fuel_stations_id")`,
  `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_osm_stations_id_idx" ON "payload_locked_documents_rels" ("osm_stations_id")`,
  `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_osm_queries_id_idx" ON "payload_locked_documents_rels" ("osm_queries_id")`,

  `CREATE TABLE IF NOT EXISTS "payload_preferences" (
    "id" serial PRIMARY KEY,
    "key" varchar,
    "value" jsonb,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "payload_preferences_rels" (
    "id" serial PRIMARY KEY,
    "order" integer,
    "parent_id" integer NOT NULL REFERENCES "payload_preferences"("id") ON DELETE CASCADE,
    "path" varchar NOT NULL,
    "users_id" integer REFERENCES "users"("id") ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "payload_preferences_rels_order_idx" ON "payload_preferences_rels" ("order")`,
  `CREATE INDEX IF NOT EXISTS "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" ("parent_id")`,
  `CREATE INDEX IF NOT EXISTS "payload_preferences_rels_path_idx" ON "payload_preferences_rels" ("path")`,
  `CREATE INDEX IF NOT EXISTS "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" ("users_id")`,
];

export async function ensurePayloadSchema(payload: any) {
  const pool = payload?.db?.pool;
  if (!pool || typeof pool.query !== 'function') {
    console.warn('[Schema Auto-Init] No pool available on payload.db');
    return;
  }

  console.log('[Schema Auto-Init] Verifying and repairing PostgreSQL schema in Supabase...');

  let succeeded = 0;
  let skipped = 0;
  for (const statement of STATEMENTS) {
    try {
      await pool.query(statement);
      succeeded++;
    } catch (err: any) {
      // Expected/benign: column already has the target type, constraint
      // already absent, etc. Log at debug level and move on to the next
      // statement — one repair failing must never block the others.
      skipped++;
      console.warn(`[Schema Auto-Init] Statement skipped (${err?.code || 'unknown'}): ${err?.message}`);
    }
  }

  console.log(`[Schema Auto-Init] Done. ${succeeded} statements applied, ${skipped} skipped.`);
}
