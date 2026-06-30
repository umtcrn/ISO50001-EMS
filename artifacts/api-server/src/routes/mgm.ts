import { Router } from "express";
import { db, mgmStationsTable, mgmDegreeDataTable, mgmSyncLogTable, weatherDegreeDaysTable, mgmStationMappingsTable } from "@workspace/db";
import { desc, eq, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import { syncCurrentMonthData, lookupDegreeData, lookupOfficialWeatherDegreeDay, lookupOfficialByStationKey, toStationKey } from "../services/mgm-sync.js";
import { MGM_STATIONS, findStationByCity, findStationByIlIlce, parseIlIlce, findNearestStation, haversineDistance } from "../services/mgm-stations-data.js";
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

// GET /api/mgm/lookup — Şehir/istasyon için HDD/CDD değerini getir
// Query: city | stationCode, year, month
router.get("/mgm/lookup", requireAuth, async (req, res) => {
  try {
    const { city, stationCode, year, month } = req.query;
    if (!year || !month) {
      res.status(400).json({ error: "year ve month zorunlu" });
      return;
    }

    const yr = parseInt(year as string);
    const mo = parseInt(month as string);

    if (isNaN(yr) || isNaN(mo) || mo < 1 || mo > 12) {
      res.status(400).json({ error: "Geçersiz yıl/ay" });
      return;
    }

    let targetCode: string | null = null;
    let stationName: string | null = null;
    let note: string | null = null;
    let usedNearest = false;
    const nearestKm: number | null = null;

    if (stationCode) {
      targetCode = stationCode as string;
      const st = MGM_STATIONS.find(s => s.stationCode === targetCode);
      stationName = st ? st.name : targetCode;
    } else if (city) {
      const requestedCity = city as string;
      const { il, ilce } = parseIlIlce(requestedCity);
      const lookup = findStationByIlIlce(il, ilce);
      if (lookup) {
        targetCode = lookup.station.stationCode;
        stationName = lookup.station.name;
        if (lookup.isFallback) {
          note = `"${requestedCity}" için birebir MGM istasyonu bulunamadı. ${il} iline ait "${lookup.station.name}" istasyonu kullanıldı.`;
        }
      } else {
        const nearest = findNearestStation(39.0, 35.0);
        targetCode = nearest.stationCode;
        stationName = nearest.name;
        usedNearest = true;
        note = `"${requestedCity}" için MGM istasyonu bulunamadı. En yakın varsayılan istasyon "${nearest.name}" kullanıldı.`;
      }
    } else {
      res.status(400).json({ error: "city veya stationCode gerekli" });
      return;
    }

    // 1. Resmi MGM aylık veriyi kontrol et (station_key öncelikli)
    if (city) {
      const { il, ilce } = parseIlIlce(city as string);

      // İlçe varsa station_key ile ara
      if (ilce) {
        const sk = toStationKey(il, ilce);
        const officialByKey = await lookupOfficialByStationKey(sk, yr, mo);
        if (officialByKey) {
          res.json({
            stationCode: targetCode,
            stationName: officialByKey.stationName ?? stationName,
            year: yr, month: mo,
            hdd: officialByKey.hdd, cdd: officialByKey.cdd,
            usedNearest, nearestKm,
            note: officialByKey.stationNote ?? note,
            dataMethod: "official_monthly",
          });
          return;
        }
      }

      // İl merkezi
      const ilKey = toStationKey(il, null);
      const officialByIl = await lookupOfficialByStationKey(ilKey, yr, mo);
      if (officialByIl) {
        const fallbackNote = ilce
          ? `"${ilce}" için özel MGM istasyonu resmi verisi bulunamadı. ${il} ili merkezi resmi verisi kullanıldı.`
          : null;
        res.json({
          stationCode: targetCode,
          stationName: officialByIl.stationName ?? stationName,
          year: yr, month: mo,
          hdd: officialByIl.hdd, cdd: officialByIl.cdd,
          usedNearest, nearestKm,
          note: officialByIl.stationNote ?? fallbackNote ?? note,
          dataMethod: "official_monthly",
        });
        return;
      }

      // Province text fallback
      const officialByProv = await lookupOfficialWeatherDegreeDay(il, yr, mo);
      if (officialByProv) {
        res.json({
          stationCode: targetCode,
          stationName: officialByProv.stationName ?? stationName,
          year: yr, month: mo,
          hdd: officialByProv.hdd, cdd: officialByProv.cdd,
          usedNearest, nearestKm,
          note: officialByProv.stationNote ?? note,
          dataMethod: "official_monthly",
        });
        return;
      }
    }

    // 2. Resmi veri yoksa → Open-Meteo havuzundan (hesaplanmış)
    const data = await lookupDegreeData(targetCode!, yr, mo);
    if (!data) {
      res.status(404).json({ error: "Bu dönem için MGM verisi bulunamadı" });
      return;
    }

    res.json({
      stationCode: targetCode,
      stationName,
      year: yr, month: mo,
      hdd: data.hdd, cdd: data.cdd,
      usedNearest, nearestKm,
      note,
      dataMethod: "calculated_daily",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /api/mgm/lookup-by-location — Lat/lon ile en yakın istasyonu bul + HDD/CDD getir
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
        note = `"${city}" için MGM verisi bulunamadı. Bu yüzden en yakın istasyon olan "${targetStation.name}" verisi otomatik olarak çekilmiştir.${nearestKm ? ` (${nearestKm} km uzaklıkta)` : ""}`;
      }
    }

    if (!targetStation) {
      res.status(400).json({ error: "Lokasyon belirlenemedi, lat/lon veya city gerekli" });
      return;
    }

    const data = await lookupDegreeData(targetStation.stationCode, yr, mo);
    if (!data) {
      res.status(404).json({ error: "Bu dönem için MGM verisi bulunamadı" });
      return;
    }

    res.json({
      stationCode: targetStation.stationCode,
      stationName: targetStation.name,
      il: targetStation.il,
      lat: targetStation.lat,
      lon: targetStation.lon,
      year: yr, month: mo,
      hdd: data.hdd, cdd: data.cdd,
      usedNearest, nearestKm, note,
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
