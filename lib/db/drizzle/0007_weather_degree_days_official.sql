-- Tabloyu oluştur (yoksa); tüm sütunlar (orijinal + yeni) dahil
CREATE TABLE IF NOT EXISTS "weather_degree_days" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer REFERENCES "companies"("id"),
  "province" text NOT NULL,
  "district" text,
  "station_code" text,
  "station_name" text,
  "date" text NOT NULL,
  "year" integer,
  "month" integer,
  "period_type" text NOT NULL DEFAULT 'monthly',
  "base_temperature_heating" real NOT NULL DEFAULT 18,
  "base_temperature_cooling" real NOT NULL DEFAULT 22,
  "hdd" real NOT NULL DEFAULT 0,
  "cdd" real NOT NULL DEFAULT 0,
  "avg_temperature" real,
  "source" text NOT NULL DEFAULT 'mgm',
  "source_url" text,
  "is_official" boolean NOT NULL DEFAULT false,
  "data_method" text NOT NULL DEFAULT 'calculated_daily',
  "station_note" text,
  "imported_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Tablo zaten varsa eksik sütunları ekle (idempotent)
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "station_code" text;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "station_name" text;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "year" integer;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "month" integer;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "is_official" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "data_method" text NOT NULL DEFAULT 'calculated_daily';--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "station_note" text;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "source_url" text;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "imported_at" timestamp;--> statement-breakpoint

-- Mevcut kayıtlarda year/month sütunlarını date'den doldur
UPDATE "weather_degree_days"
SET
  "year"  = CAST(SUBSTRING("date", 1, 4) AS integer),
  "month" = CAST(SUBSTRING("date", 6, 2) AS integer)
WHERE "year" IS NULL AND "date" ~ '^\d{4}-\d{2}$';
