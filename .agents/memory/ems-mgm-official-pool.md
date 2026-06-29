---
name: EMS MGM Official Pool
description: Migration 0014 — MGM resmi gün derece havuzu; station_key sistemi, official-only consumption lookup, admin sync endpoint.
---

## station_key sistemi

`toStationKey(il, ilce)` → Türkçe→ASCII slug, ilce varsa ilce bazlı, yoksa il bazlı:
- ("Van", null) → "van"
- ("Van", "Erciş") → "ercis"
- ("Ağrı", "Doğubeyazıt") → "dogubeyazit"

Exported from `mgm-sync.ts`.

## Migration 0014 (when=1783100000000)

`weather_degree_days` tablosuna eklenen kolonlar:
- `station_key` text (il+ilce slug)
- `hdd_days` integer nullable
- `cdd_days` integer nullable
- `annual_hdd` real nullable
- `annual_cdd` real nullable

Unique index: `(station_key, year, month)` WHERE `is_official = true`

Mevcut kayıtlar: UPDATE ile province/district'ten station_key türetildi.

## Lookup zinciri (consumption.ts autoLookupHddCdd)

1. ilce varsa → `lookupOfficialByStationKey(toStationKey(il, ilce), year, month)`
2. il merkezi → `lookupOfficialByStationKey(toStationKey(il, null), year, month)`
3. Province text match → `lookupOfficialWeatherDegreeDay(il, year, month)`
4. Bulunamazsa → null; **Open-Meteo/sentetik fallback YOK**

`null` döndüğünde consumption POST response:
- `weatherDataMethod = "no_official_data"`
- `weatherStationNote = "Bu dönem (...) için resmi MGM HDD/CDD verisi bulunamadı."`
- `hdd = null`, `cdd = null`

## Dosya listesi

- `lib/db/drizzle/0014_mgm_official_pool.sql` — Migration
- `lib/db/src/schema/energy.ts` — weatherDegreeDaysTable güncellendi
- `artifacts/api-server/src/services/mgm-official-sync.ts` — MGM scraper + upsert
- `artifacts/api-server/src/services/mgm-sync.ts` — toStationKey, lookupOfficialByStationKey eklendi
- `artifacts/api-server/src/routes/consumption.ts` — autoLookupHddCdd → official only
- `artifacts/api-server/src/routes/mgm.ts` — POST /api/admin/weather-degree-days/sync
- `scripts/src/sync-mgm-degree-days.ts` — CLI sync scripti
- `artifacts/api-server/src/data/mgm-degree-days/` — JSON dosya dizini

## Admin endpoint

`POST /api/admin/weather-degree-days/sync`
- Body: `{ year?: number, years?: number[] }` (default: mevcut + önceki yıl)
- MGM website GET/POST scraping dener; başarısız → graceful error + logs döner
- JSON dosyaları `src/data/mgm-degree-days/mgm-degree-days-YYYY.json` olarak kaydedilir

## CLI Script

```bash
pnpm --filter @workspace/scripts run sync:mgm-degree-days -- --last=10
pnpm --filter @workspace/scripts run sync:mgm-degree-days -- --year=2024
pnpm --filter @workspace/scripts run sync:mgm-degree-days -- --from-json=2024
```

## Önemli not: MGM web scraping

MGM sitesi (mgm.gov.tr) ASP.NET WebForms. GET params (`?g=yillik&yil=YYYY`) çalışmıyorsa POST+ViewState denenir. Site değişiklikleri veya ağ kısıtlamaları nedeniyle 0 kayıt dönebilir. Bu durumda `--from-json` ile önceden kaydedilmiş JSON import edilebilir.

**Why:** MGM resmi sitesinin yayımladığı tam sayı HDD/CDD değerleri (örn. Van Ocak 2024=528) Open-Meteo hesaplama ile gelen ondalıklı değerlerden (495.8 gibi) farklı; ISO 50001 regresyon analizi için resmi tam sayı değer gerekli.
