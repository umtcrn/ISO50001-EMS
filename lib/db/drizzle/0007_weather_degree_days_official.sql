ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "station_code" text;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "station_name" text;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "year" integer;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "month" integer;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "is_official" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "data_method" text NOT NULL DEFAULT 'calculated_daily';--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "station_note" text;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "source_url" text;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "imported_at" timestamp;--> statement-breakpoint
UPDATE "weather_degree_days"
SET
  "year"  = CAST(SUBSTRING("date", 1, 4) AS integer),
  "month" = CAST(SUBSTRING("date", 6, 2) AS integer)
WHERE "year" IS NULL AND "date" ~ '^\d{4}-\d{2}$';
