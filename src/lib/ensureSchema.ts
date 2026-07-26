export async function ensurePayloadSchema(payload: any) {
  try {
    const pool = payload?.db?.pool;
    if (!pool || typeof pool.query !== 'function') {
      console.warn('[Schema Auto-Init] No pool available on payload.db');
      return;
    }

    console.log('[Schema Auto-Init] Verifying and creating missing PostgreSQL tables in Supabase...');

    const createTablesSQL = `
      CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY,
        "email" varchar NOT NULL,
        "password" varchar,
        "auth0_id" varchar,
        "geo_ride_email" varchar,
        "geo_ride_password" varchar,
        "last_sync_date" timestamp with time zone,
        "selected_trackers" jsonb,
        "tracking_start_date" timestamp with time zone,
        "selected_fuel" varchar DEFAULT 'sp95',
        "search_radius" numeric DEFAULT 20,
        "fill_size" numeric DEFAULT 15,
        "consumption" numeric DEFAULT 5,
        "exclude_distance" boolean DEFAULT false,
        "last_search_query" varchar,
        "last_search_lat" numeric,
        "last_search_lng" numeric,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "trips" (
        "id" serial PRIMARY KEY,
        "title" varchar,
        "started_at" timestamp with time zone NOT NULL,
        "ended_at" timestamp with time zone NOT NULL,
        "distance" numeric,
        "duration" numeric,
        "path" jsonb,
        "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "fuel_stations" (
        "id" serial PRIMARY KEY,
        "osm_id" varchar UNIQUE NOT NULL,
        "name" varchar,
        "brand" varchar,
        "lat" numeric NOT NULL,
        "lng" numeric NOT NULL,
        "prices" jsonb,
        "last_updated" timestamp with time zone,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "osm_stations" (
        "id" serial PRIMARY KEY,
        "osm_id" varchar UNIQUE NOT NULL,
        "name" varchar,
        "brand" varchar,
        "lat" numeric NOT NULL,
        "lng" numeric NOT NULL,
        "raw_tags" jsonb,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "osm_queries" (
        "id" serial PRIMARY KEY,
        "query_hash" varchar UNIQUE NOT NULL,
        "bounds" jsonb,
        "fetched_at" timestamp with time zone NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "payload_migrations" (
        "id" serial PRIMARY KEY,
        "name" varchar,
        "batch" numeric,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "payload_locked_documents" (
        "id" serial PRIMARY KEY,
        "global_slug" varchar,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "payload_preferences" (
        "id" serial PRIMARY KEY,
        "key" varchar,
        "value" jsonb,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `;

    await pool.query(createTablesSQL);
    console.log('[Schema Auto-Init] PostgreSQL tables successfully verified and created!');
  } catch (err) {
    console.error('[Schema Auto-Init Error]: Failed to create PostgreSQL tables:', err);
  }
}
