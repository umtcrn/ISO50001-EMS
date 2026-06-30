---
name: EMS MGM Station Mapping
description: Migration 0015 — mgm_station_mappings tablosu; Excel import (254 istasyon + 30,552 satır degree days); ON CONFLICT kritik not.
---

## mgm_station_mappings tablosu (migration 0015, when=1783200000000)

254 istasyon, kolonlar:
- `station_key` (unique, TEXT)
- `station_name`, `province`, `district`, `confidence`, `note`
- `is_active` (boolean, default true)

Index: province, province+district

## Excel dosyaları

`artifacts/api-server/data/mgm-import/` içinde:
- `mgm_station_mapping_checked.xlsx` — sheet: Sheet1, 254 satır
- `mgm_degree_days_last_10_years_final.xlsx` — sheet: mgm_degree_days, 30,552 satır (2016-2025, 254 istasyon)

## ON CONFLICT kritik not

`weather_degree_days` tablosundaki partial unique index:
```
wdd_station_key_year_month_official_idx:
WHERE station_key IS NOT NULL AND year IS NOT NULL AND month IS NOT NULL AND is_official = true
```

ON CONFLICT predicate BU EXACT FORMÜLE UYGUN OLMALI:
```sql
ON CONFLICT (station_key, year, month)
  WHERE station_key IS NOT NULL AND year IS NOT NULL AND month IS NOT NULL AND is_official = true
DO UPDATE SET ...
```

`WHERE is_official = true` tek başına HATALI — PostgreSQL partial index predicate'i exact match gerektirir.

## Lookup zinciri (autoLookupHddCdd güncellendi)

1. `lookupStationKeyByLocation(il, ilce)` → mgm_station_mappings → station_key (ilçe tam eşleşme)
2. `lookupStationKeyByLocation(il, null)` → mgm_station_mappings → station_key (il merkezi)
3. station_key ile `lookupOfficialByStationKey` → weather_degree_days
4. `toStationKey` slug fallback (demo/eski veriler için)
5. Province text match fallback
6. null → no_official_data

## Admin endpoint'ler

- `POST /api/admin/mgm/station-mapping/import-excel` — body: `{ filePath? }` — mapping xlsx import
- `POST /api/admin/weather-degree-days/import-excel` — body: `{ filePath? }` — degree days xlsx import
- `GET /api/admin/mgm/station-mappings` — query: province, search

## Scripts CLI

```bash
pnpm --filter @workspace/scripts run import:mgm-excel
pnpm --filter @workspace/scripts run import:mgm-excel -- --mapping-only
pnpm --filter @workspace/scripts run import:mgm-excel -- --data-only
pnpm --filter @workspace/scripts run import:mgm-excel -- --mapping-file=path/to.xlsx
```

Scriptte `import.meta.url` + `fileURLToPath` ile `__dirname` türetilmeli; `process.cwd()` scripts paketinde workspace kökü DEĞİL `scripts/` dizinini işaret eder.

## Servis dosyaları

- `artifacts/api-server/src/services/mgm-excel-import.ts` — import service (exceljs)
- `artifacts/api-server/src/services/mgm-sync.ts` — `lookupStationKeyByLocation` eklendi
- `artifacts/api-server/src/routes/consumption.ts` — autoLookupHddCdd mapping-önce
- `artifacts/api-server/src/routes/mgm.ts` — yeni admin endpoint'ler
- `scripts/src/import-mgm-excel.ts` — CLI script

## @workspace/db rebuild notu

Schema'ya yeni tablo eklenince `lib/db/dist/` declaration dosyaları güncellenmez.
```bash
cd lib/db && npx tsc -p tsconfig.json
```
Bu komutla rebuild edince api-server typecheck çalışır.
