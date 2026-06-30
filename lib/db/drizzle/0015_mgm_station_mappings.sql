CREATE TABLE IF NOT EXISTS "mgm_station_mappings" (
  "id" serial PRIMARY KEY NOT NULL,
  "station_key" text NOT NULL,
  "station_name" text,
  "province" text,
  "district" text,
  "confidence" text DEFAULT 'unknown',
  "note" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "mgm_station_mappings_station_key_unique" UNIQUE("station_key")
);

CREATE INDEX IF NOT EXISTS "idx_mgm_station_mappings_province" ON "mgm_station_mappings" ("province");
CREATE INDEX IF NOT EXISTS "idx_mgm_station_mappings_province_district" ON "mgm_station_mappings" ("province", "district");
