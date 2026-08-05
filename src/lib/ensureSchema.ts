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

      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_password_token" varchar;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_password_expiration" timestamp with time zone;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "salt" varchar;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hash" varchar;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_attempts" numeric DEFAULT 0;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lock_until" timestamp with time zone;

      CREATE TABLE IF NOT EXISTS "users_selected_trackers" (
        "id" serial PRIMARY KEY,
        "_order" integer NOT NULL,
        "_parent_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tracker_id" varchar NOT NULL
      );

      CREATE INDEX IF NOT EXISTS "users_selected_trackers_parent_id_idx" ON "users_selected_trackers" ("_parent_id");

      CREATE TABLE IF NOT EXISTS "users_sessions" (
        "id" serial PRIMARY KEY,
        "_order" integer NOT NULL,
        "_parent_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" timestamp with time zone,
        "expires_at" timestamp with time zone
      );

      CREATE INDEX IF NOT EXISTS "users_sessions_parent_id_idx" ON "users_sessions" ("_parent_id");

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

      CREATE TABLE IF NOT EXISTS "payload_locked_documents_rels" (
        "id" serial PRIMARY KEY,
        "order" integer,
        "parent_id" integer NOT NULL REFERENCES "payload_locked_documents"("id") ON DELETE CASCADE,
        "path" varchar NOT NULL,
        "users_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
        "trips_id" integer REFERENCES "trips"("id") ON DELETE CASCADE,
        "fuel_stations_id" integer REFERENCES "fuel_stations"("id") ON DELETE CASCADE,
        "osm_stations_id" integer REFERENCES "osm_stations"("id") ON DELETE CASCADE,
        "osm_queries_id" integer REFERENCES "osm_queries"("id") ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" ("order");
      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" ("parent_id");
      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" ("path");
      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" ("users_id");
      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trips_id_idx" ON "payload_locked_documents_rels" ("trips_id");
      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_fuel_stations_id_idx" ON "payload_locked_documents_rels" ("fuel_stations_id");
      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_osm_stations_id_idx" ON "payload_locked_documents_rels" ("osm_stations_id");
      CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_osm_queries_id_idx" ON "payload_locked_documents_rels" ("osm_queries_id");

      CREATE TABLE IF NOT EXISTS "payload_preferences" (
        "id" serial PRIMARY KEY,
        "key" varchar,
        "value" jsonb,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "payload_preferences_rels" (
        "id" serial PRIMARY KEY,
        "order" integer,
        "parent_id" integer NOT NULL REFERENCES "payload_preferences"("id") ON DELETE CASCADE,
        "path" varchar NOT NULL,
        "users_id" integer REFERENCES "users"("id") ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS "payload_preferences_rels_order_idx" ON "payload_preferences_rels" ("order");
      CREATE INDEX IF NOT EXISTS "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" ("parent_id");
      CREATE INDEX IF NOT EXISTS "payload_preferences_rels_path_idx" ON "payload_preferences_rels" ("path");
      CREATE INDEX IF NOT EXISTS "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" ("users_id");
    `;

    await pool.query(createTablesSQL);
    console.log('[Schema Auto-Init] PostgreSQL tables successfully verified and created!');
  } catch (err) {
    console.error('[Schema Auto-Init Error]: Failed to create PostgreSQL tables:', err);
  }
}
