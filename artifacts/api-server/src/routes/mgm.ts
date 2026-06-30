import { Router } from "express";
import { db, mgmStationsTable, mgmDegreeDataTable, mgmSyncLogTable, weatherDegreeDaysTable, mgmStationMappingsTable } from "@workspace/db";
import { desc, eq, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { syncCurrentMonthData, lookupOfficialWeatherDegreeDay, lookupOfficialByStationKey, toStationKey, lookupStationKeyByLocation } from "../services/mgm-sync.js";
import { MGM_STATIONS, findStationByCity, parseIlIlce, findNearestStation, haversineDistance } from "../services/mgm-stations-data.js";
import { syncOfficialDegreeDays } from "../services/mgm-official-sync.js";
import { importStationMapping, importDegreeDays, DEFAULT_MAPPING_FILE, DEFAULT_DEGREE_DAYS_FILE } from "../services/mgm-excel-import.js";

const router = Router();

// GET /api/mgm/stations — Tüm MGM istasyonları
router.get("/mgm/stations", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(mgmStationsTable).orderBy(mgmStationsTable.il);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /api/mgm/lookup — Şehir için HDD/CDD değerini getir (YALNIZCA resmi MGM verisi)
// Query: city, year, month
router.get("/mgm/lookup", requireAuth, async (req, res) => {
  try {
    const { city, year, month } = req.query;
    if (!year || !month) {
      res.status(400).json({ error: "year ve month zorunlu" });
      return;
    }
    if (!city) {
      res.status(400).json({ error: "city gerekli" });
      return;
    }

    const yr = parseInt(year as string);
    const mo = parseInt(month as string);

    if (isNaN(yr) || isNaN(mo) || mo < 1 || mo > 12) {
      res.status(400).json({ error: "Geçersiz yıl/ay" });
      return;
    }

    const requestedCity = city as string;
    const { il, ilce } = parseIlIlce(requestedCity);

    // 1. mgm_station_mappings: ilçe bazlı eşleşme
    if (ilce) {
      const mapping = await lookupStationKeyByLocation(il, ilce);
      if (mapping) {
        const data = await lookupOfficialByStationKey(mapping.stationKey, yr, mo);
        if (data) {
          res.json({
            stationName: mapping.stationName ?? data.stationName ?? ilce,
            year: yr, month: mo,
            hdd: data.hdd, cdd: data.cdd,
            note: data.stationNote ?? null,
            dataMethod: "official_monthly",
          });
          return;
        }
      }
    }

    // 2. mgm_station_mappings: il merkezi eşleşmesi
    const mappingByIl = await lookupStationKeyByLocation(il, null);
    if (mappingByIl) {
      const data = await lookupOfficialByStationKey(mappingByIl.stationKey, yr, mo);
      if (data) {
        const note = ilce
          ? `"${ilce}" için özel MGM istasyonu resmi verisi bulunamadı. ${il} ili merkezi resmi verisi kullanıldı.`
          : null;
        res.json({
          stationName: mappingByIl.stationName ?? data.stationName ?? il,
          year: yr, month: mo,
          hdd: data.hdd, cdd: data.cdd,
          note: data.stationNote ?? note,
          dataMethod: "official_monthly",
        });
        return;
      }
    }

    // 3. station_key slug fallback (eski kayıtlar / demo verisi)
    if (ilce) {
      const sk = toStationKey(il, ilce);
      const official = await lookupOfficialByStationKey(sk, yr, mo);
      if (official) {
        res.json({
          stationName: official.stationName ?? ilce,
          year: yr, month: mo,
          hdd: official.hdd, cdd: official.cdd,
          note: official.stationNote ?? null,
          dataMethod: "official_monthly",
        });
        return;
      }
    }

    const ilKey = toStationKey(il, null);
    const officialByIl = await lookupOfficialByStationKey(ilKey, yr, mo);
    if (officialByIl) {
      const note = ilce
        ? `"${ilce}" için özel MGM istasyonu resmi verisi bulunamadı. ${il} ili merkezi resmi verisi kullanıldı.`
        : null;
      res.json({
        stationName: officialByIl.stationName ?? il,
        year: yr, month: mo,
        hdd: officialByIl.hdd, cdd: officialByIl.cdd,
        note: officialByIl.stationNote ?? note,
        dataMethod: "official_monthly",
      });
      return;
    }

    // 4. Province text match (eski kayıtlar için geriye uyum)
    const officialByProv = await lookupOfficialWeatherDegreeDay(il, yr, mo);
    if (officialByProv) {
      const note = ilce
        ? `"${ilce}" için özel MGM istasyonu resmi verisi bulunamadı. ${il} ili resmi verisi kullanıldı.`
        : null;
      res.json({
        stationName: officialByProv.stationName ?? il,
        year: yr, month: mo,
        hdd: officialByProv.hdd, cdd: officialByProv.cdd,
        note: officialByProv.stationNote ?? note,
        dataMethod: "official_monthly",
      });
      return;
    }

    // Resmi MGM verisi yok — Open-Meteo/sentetik fallback KULLANILMIYOR
    res.json({
      stationName: null,
      year: yr, month: mo,
      hdd: null, cdd: null,
      note: `Bu lokasyon ("${requestedCity}") ve dönem (${yr}/${mo}) için resmi MGM HDD/CDD verisi bulunamadı.`,
      dataMethod: "no_official_data",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /api/mgm/lookup-by-location — Lat/lon ile en yakın istasyonu bul + HDD/CDD getir (YALNIZCA resmi MGM verisi)
router.get("/mgm/lookup-by-location", requireAuth, async (req, res) => {
  try {
    const { lat, lon, city, year, month } = req.query;
    if (!year || !month) {
      res.status(400).json({ error: "year ve month zorunlu" });
      return;
    }

    const yr = parseInt(year as string);
    const mo = parseInt(month as string);

    let targetStation: (typeof MGM_STATIONS)[0] | null = null;
    let usedNearest = false;
    let note: string | null = null;
    let nearestKm: number | null = null;

    if (city) {
      const found = findStationByCity(city as string);
      if (found) targetStation = found;
    }

    if (!targetStation && lat && lon) {
      const latNum = parseFloat(lat as string);
      const lonNum = parseFloat(lon as string);
      targetStation = findNearestStation(latNum, lonNum);
      if (city) {
        usedNearest = true;
        nearestKm = Math.round(haversineDistance(latNum, lonNum, targetStation.lat, targetStation.lon));
        note = `"${city}" için MGM istasyonu bulunamadı. En yakın istasyon "${targetStation.name}" kullanıldı.${nearestKm ? ` (${nearestKm} km uzaklıkta)` : ""}`;
      }
    }

    if (!targetStation) {
      res.status(400).json({ error: "Lokasyon belirlenemedi, lat/lon veya city gerekli" });
      return;
    }

    // Resmi MGM verisi: station_key slug ile ara (YALNIZCA is_official=true)
    const stationKey = toStationKey(targetStation.il, targetStation.ilce ?? null);
    const officialData = await lookupOfficialByStationKey(stationKey, yr, mo);

    if (!officialData) {
      // Province text match fallback
      const officialByProv = await lookupOfficialWeatherDegreeDay(targetStation.il, yr, mo);
      if (officialByProv) {
        res.json({
          stationCode: targetStation.stationCode,
          stationName: officialByProv.stationName ?? targetStation.name,
          il: targetStation.il,
          lat: targetStation.lat,
          lon: targetStation.lon,
          year: yr, month: mo,
          hdd: officialByProv.hdd, cdd: officialByProv.cdd,
          usedNearest, nearestKm,
          note: officialByProv.stationNote ?? note,
          dataMethod: "official_monthly",
        });
        return;
      }

      // Resmi veri yok — Open-Meteo/sentetik fallback KULLANILMIYOR
      res.json({
        stationCode: targetStation.stationCode,
        stationName: targetStation.name,
        il: targetStation.il,
        lat: targetStation.lat,
        lon: targetStation.lon,
        year: yr, month: mo,
        hdd: null, cdd: null,
        usedNearest, nearestKm,
        note: `Bu istasyon ("${targetStation.name}") ve dönem (${yr}/${mo}) için resmi MGM HDD/CDD verisi bulunamadı.`,
        dataMethod: "no_official_data",
      });
      return;
    }

    res.json({
      stationCode: targetStation.stationCode,
      stationName: officialData.stationName ?? targetStation.name,
      il: targetStation.il,
      lat: targetStation.lat,
      lon: targetStation.lon,
      year: yr, month: mo,
      hdd: officialData.hdd, cdd: officialData.cdd,
      usedNearest, nearestKm,
      note: officialData.stationNote ?? note,
      dataMethod: "official_monthly",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /api/mgm/sync-log — Son sync logları
router.get("/mgm/sync-log", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(mgmSyncLogTable)
      .orderBy(desc(mgmSyncLogTable.startedAt))
      .limit(20);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /api/mgm/sync — Manuel Open-Meteo sync tetikle (admin only)
router.post("/mgm/sync", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await syncCurrentMonthData();
    res.json({
      message: "Open-Meteo sync tamamlandı",
      synced: result.synced,
      errors: result.errors,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sync hatası" });
  }
});

// POST /api/admin/weather-degree-days/sync — MGM Resmi Gün Derece Havuzu senkronizasyonu
// Admin/superadmin erişebilir. Body: { year?: number } veya { years?: number[] }
router.post("/admin/weather-degree-days/sync", requireAuth, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();

    let years: number[];
    if (req.body?.years && Array.isArray(req.body.years)) {
      years = req.body.years.map(Number).filter((y: number) => !isNaN(y));
    } else if (req.body?.year) {
      years = [parseInt(req.body.year)];
    } else {
      // Default: mevcut yıl ve önceki yıl
      years = [currentYear - 1, currentYear];
    }

    const logs: string[] = [];
    const onProgress = (msg: string) => {
      logs.push(msg);
      req.log.info(msg);
    };

    const results = await syncOfficialDegreeDays(years, onProgress);

    const summary = results.map(r =>
      `${r.year}: +${r.inserted} eklendi, ~${r.updated} güncellendi, ${r.stationCount} istasyon, ${r.errors} hata`
    );

    res.json({
      message: "MGM resmi gün derece senkronizasyonu tamamlandı",
      years,
      results,
      summary,
      logs,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "MGM resmi sync hatası" });
  }
});

// GET /api/mgm/degree-data — İstasyon bazlı HDD/CDD verileri
router.get("/mgm/degree-data", requireAuth, async (req, res) => {
  try {
    const { stationCode, year } = req.query;
    if (!stationCode) {
      res.status(400).json({ error: "stationCode zorunlu" });
      return;
    }

    const rows = await db.select().from(mgmDegreeDataTable)
      .where(eq(mgmDegreeDataTable.stationCode, stationCode as string))
      .orderBy(mgmDegreeDataTable.year, mgmDegreeDataTable.month);

    const filtered = year ? rows.filter(r => r.year === parseInt(year as string)) : rows;
    res.json(filtered);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /api/admin/mgm/station-mapping/import-excel
// Repo içindeki mgm_station_mapping_checked.xlsx dosyasını mgm_station_mappings tablosuna import eder
router.post("/admin/mgm/station-mapping/import-excel", requireAuth, requireAdmin, async (req, res) => {
  try {
    const filePath = req.body?.filePath ?? DEFAULT_MAPPING_FILE;
    const logs: string[] = [];
    const onProgress = (msg: string) => {
      logs.push(msg);
      req.log.info(msg);
    };

    const result = await importStationMapping(filePath, onProgress);
    res.json({
      message: "MGM istasyon eşleştirme import tamamlandı",
      filePath,
      ...result,
      logs,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: `Import hatası: ${String(err)}` });
  }
});

// POST /api/admin/weather-degree-days/import-excel
// Repo içindeki mgm_degree_days_last_10_years_final.xlsx dosyasını weather_degree_days tablosuna import eder
router.post("/admin/weather-degree-days/import-excel", requireAuth, requireAdmin, async (req, res) => {
  try {
    const filePath = req.body?.filePath ?? DEFAULT_DEGREE_DAYS_FILE;
    const logs: string[] = [];
    const onProgress = (msg: string) => {
      logs.push(msg);
      req.log.info(msg);
    };

    const result = await importDegreeDays(filePath, onProgress);
    res.json({
      message: "MGM gün derece import tamamlandı",
      filePath,
      ...result,
      logs,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: `Import hatası: ${String(err)}` });
  }
});

// GET /api/admin/mgm/station-mappings — İstasyon eşleştirme listesi (admin)
router.get("/admin/mgm/station-mappings", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { province, search } = req.query;
    let rows = await db.select().from(mgmStationMappingsTable)
      .orderBy(mgmStationMappingsTable.province, mgmStationMappingsTable.district);

    if (province) {
      rows = rows.filter(r => r.province?.toLowerCase().includes((province as string).toLowerCase()));
    }
    if (search) {
      const q = (search as string).toLowerCase();
      rows = rows.filter(r =>
        r.stationKey.toLowerCase().includes(q) ||
        r.stationName?.toLowerCase().includes(q) ||
        r.province?.toLowerCase().includes(q) ||
        r.district?.toLowerCase().includes(q)
      );
    }
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /api/admin/weather-degree-days — Resmi MGM veri listesi (admin)
router.get("/admin/weather-degree-days", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { year, province } = req.query;
    const rows = await db.select().from(weatherDegreeDaysTable)
      .where(eq(weatherDegreeDaysTable.isOfficial, true))
      .orderBy(weatherDegreeDaysTable.province, weatherDegreeDaysTable.year as any, weatherDegreeDaysTable.month as any);

    let filtered = rows;
    if (year) filtered = filtered.filter(r => r.year === parseInt(year as string));
    if (province) filtered = filtered.filter(r => r.province?.toLowerCase().includes((province as string).toLowerCase()));

    res.json(filtered);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
