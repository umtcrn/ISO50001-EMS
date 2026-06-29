-- Migration 0014: MGM Resmi Gün Derece Havuzu
-- weather_degree_days tablosuna station_key + HDD/CDD gün sayısı + yıllık toplamlar
-- Unique index: station_key + year + month (resmi kayıtlar için)
-- Performans indexleri

ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "station_key" text;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "hdd_days" integer;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "cdd_days" integer;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "annual_hdd" real;--> statement-breakpoint
ALTER TABLE "weather_degree_days" ADD COLUMN IF NOT EXISTS "annual_cdd" real;--> statement-breakpoint

-- Mevcut kayıtlarda station_key'i province/district'ten türet
UPDATE "weather_degree_days"
SET "station_key" = LOWER(
  REGEXP_REPLACE(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
      COALESCE("district", "province"),
      'ğ', 'g'), 'Ğ', 'g'),
      'ü', 'u'), 'Ü', 'u'),
      'ş', 's'), 'Ş', 's'),
      'ı', 'i'), 'İ', 'i'),
      'ö', 'o'), 'Ö', 'o'),
      'ç', 'c'), 'Ç', 'c'),
      'â', 'a'), 'Â', 'a'),
      'î', 'i'), 'Î', 'i'),
      'û', 'u'), 'Û', 'u'),
    '[^a-zA-Z0-9]+', '-', 'g'
  )
)
WHERE "station_key" IS NULL AND "province" IS NOT NULL;--> statement-breakpoint

-- Unique index: station_key + year + month (yalnızca resmi kayıtlar için)
CREATE UNIQUE INDEX IF NOT EXISTS "wdd_station_key_year_month_official_idx"
ON "weather_degree_days"("station_key", "year", "month")
WHERE "station_key" IS NOT NULL
  AND "year" IS NOT NULL
  AND "month" IS NOT NULL
  AND "is_official" = true;--> statement-breakpoint

-- Performans indexleri
CREATE INDEX IF NOT EXISTS "wdd_station_key_year_idx"
ON "weather_degree_days"("station_key", "year", "month");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "wdd_province_district_year_idx"
ON "weather_degree_days"("province", "district", "year", "month");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "wdd_station_name_year_month_idx"
ON "weather_degree_days"("station_name", "year", "month");--> statement-breakpoint
