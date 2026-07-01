/**
 * MGM Referans Veri Bootstrap Scripti
 *
 * Bu script MGM istasyon eşleştirme ve gün derece verilerini
 * veritabanına idempotent (tekrar çalıştırılabilir) şekilde yükler.
 *
 * MGM verileri sistem referans verisidir — demo/internal veri DEĞİLDİR.
 * Internal demo importu bağımsız ve manuel çalıştırılır.
 *
 * Davranış:
 *   - Eksik indexleri CREATE INDEX IF NOT EXISTS ile oluşturur
 *   - mgm_station_mappings tablosu boşsa mapping import eder, doluysa atlar
 *   - weather_degree_days'de resmi (is_official=true) kayıt yoksa import eder, varsa atlar
 *   - Veri silmez, truncate yapmaz, mevcut kayıtlara dokunmaz
 *   - ON CONFLICT / upsert ile güvenli; her zaman tekrar çalıştırılabilir
 *
 * Kullanım:
 *   pnpm --filter @workspace/scripts run import:mgm
 *   pnpm --filter @workspace/scripts run import:mgm -- --force
 *     (force: var olsa bile yeniden import et)
 */

import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
import { db, weatherDegreeDaysTable, mgmStationMappingsTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Excel dosyaları scripts/ içinden göreceli olarak bulunur
const DATA_DIR = path.resolve(__dirname, "../../artifacts/api-server/data/mgm-import");
const MAPPING_FILE = path.join(DATA_DIR, "mgm_station_mapping_checked.xlsx");
const DEGREE_DAYS_FILE = path.join(DATA_DIR, "mgm_degree_days_last_10_years_final.xlsx");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [import-mgm] ${msg}`);
}
function warn(msg: string) {
  console.warn(`[${new Date().toISOString()}] [import-mgm] ⚠️  ${msg}`);
}

// ── 1. Index Bootstrap ───────────────────────────────────────────────
async function ensureIndexes() {
  log("Indexler kontrol ediliyor...");

  // Partial unique index: station_key + year + month WHERE is_official=true
  // Bu index olmadan ON CONFLICT clause çalışmaz → import satırları sessizce başarısız olur
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "wdd_station_key_year_month_official_idx"
    ON "weather_degree_days"("station_key", "year", "month")
    WHERE "station_key" IS NOT NULL
      AND "year" IS NOT NULL
      AND "month" IS NOT NULL
      AND "is_official" = true
  `);

  // Performans indexleri
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "wdd_station_key_year_idx"
    ON "weather_degree_days"("station_key", "year", "month")
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "wdd_province_district_year_idx"
    ON "weather_degree_days"("province", "district", "year", "month")
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "wdd_station_name_year_month_idx"
    ON "weather_degree_days"("station_name", "year", "month")
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_mgm_station_mappings_province"
    ON "mgm_station_mappings"("province")
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_mgm_station_mappings_province_district"
    ON "mgm_station_mappings"("province", "district")
  `);

  log("Indexler hazır.");
}

// ── 2. Station Mapping Import ────────────────────────────────────────
async function importStationMapping(filePath: string) {
  log(`Mapping import başlıyor: ${filePath}`);
  if (!existsSync(filePath)) {
    warn(`Mapping Excel dosyası bulunamadı: ${filePath} — atlanıyor.`);
    return { totalRows: 0, inserted: 0, updated: 0, failed: 0 };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const ws = wb.getWorksheet("Sheet1") ?? wb.worksheets[0];
  if (!ws) throw new Error("Sheet1 sayfası bulunamadı");

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell) => { headers.push(String(cell.value ?? "").trim()); });

  const ci = {
    station_key: headers.indexOf("station_key"),
    station_name: headers.indexOf("station_name"),
    province: headers.indexOf("province"),
    district: headers.indexOf("district"),
    confidence: headers.indexOf("confidence"),
    note: headers.indexOf("note"),
  };
  if (ci.station_key < 0) throw new Error("station_key kolonu bulunamadı");

  log(`Kolonlar: ${headers.join(", ")}`);

  let totalRows = 0;
  ws.eachRow({ includeEmpty: false }, () => { totalRows++; });
  totalRows--; // header hariç

  let inserted = 0, updated = 0, failed = 0, rowNum = 0;

  const processRow = async (row: ExcelJS.Row, rowNumber: number) => {
    if (rowNumber === 1) return;
    const vals = row.values as (ExcelJS.CellValue | undefined)[];
    const get = (idx: number) => idx >= 0 ? (vals[idx + 1] ?? null) : null;
    const str = (v: ExcelJS.CellValue | null) => v != null ? String(v).trim() : null;

    const stationKey = str(get(ci.station_key));
    if (!stationKey) return;

    rowNum++;

    try {
      const existing = await db
        .select({ id: mgmStationMappingsTable.id })
        .from(mgmStationMappingsTable)
        .where(eq(mgmStationMappingsTable.stationKey, stationKey))
        .limit(1);

      if (existing.length > 0) {
        await db.update(mgmStationMappingsTable)
          .set({
            stationName: str(get(ci.station_name)),
            province: str(get(ci.province)),
            district: str(get(ci.district)) || null,
            confidence: str(get(ci.confidence)) ?? "unknown",
            note: str(get(ci.note)),
            updatedAt: new Date(),
          })
          .where(eq(mgmStationMappingsTable.id, existing[0].id));
        updated++;
      } else {
        await db.insert(mgmStationMappingsTable).values({
          stationKey,
          stationName: str(get(ci.station_name)),
          province: str(get(ci.province)),
          district: str(get(ci.district)) || null,
          confidence: str(get(ci.confidence)) ?? "unknown",
          note: str(get(ci.note)),
          isActive: true,
        });
        inserted++;
      }
    } catch (err) {
      failed++;
      console.error(`  Satır ${rowNumber} hatası: ${err}`);
    }

    if (rowNum % 50 === 0) log(`  ${rowNum}/${totalRows} işlendi...`);
  };

  const rowPromises: Promise<void>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    rowPromises.push(processRow(row, rowNumber));
  });
  await Promise.all(rowPromises);

  log(`[Mapping] Tamamlandı: +${inserted} eklendi, ~${updated} güncellendi, ${failed} hata | Toplam: ${totalRows}`);
  return { totalRows, inserted, updated, failed };
}

// ── 3. Degree Days Import ────────────────────────────────────────────
async function importDegreeDays(filePath: string) {
  log(`Degree Days import başlıyor: ${filePath}`);
  if (!existsSync(filePath)) {
    warn(`Degree Days Excel dosyası bulunamadı: ${filePath} — atlanıyor.`);
    return { totalRows: 0, processed: 0, failed: 0, uniqueStations: 0, years: [] as number[] };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const ws = wb.getWorksheet("mgm_degree_days") ?? wb.worksheets[0];
  if (!ws) throw new Error("mgm_degree_days sayfası bulunamadı");

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell) => { headers.push(String(cell.value ?? "").trim()); });

  const ci = {
    station_key: headers.indexOf("station_key"),
    station_name: headers.indexOf("station_name"),
    province: headers.indexOf("province"),
    district: headers.indexOf("district"),
    year: headers.indexOf("year"),
    month: headers.indexOf("month"),
    hdd: headers.indexOf("hdd"),
    cdd: headers.indexOf("cdd"),
    hdd_days: headers.indexOf("hdd_days"),
    cdd_days: headers.indexOf("cdd_days"),
    annual_hdd: headers.indexOf("annual_hdd"),
    annual_cdd: headers.indexOf("annual_cdd"),
    source: headers.indexOf("source"),
    source_url: headers.indexOf("source_url"),
    is_official: headers.indexOf("is_official"),
    mapping_note: headers.indexOf("mapping_note"),
  };

  if (ci.station_key < 0 || ci.year < 0 || ci.month < 0) {
    throw new Error("Zorunlu kolonlar (station_key, year, month) bulunamadı");
  }

  log(`Kolonlar: ${headers.join(", ")}`);

  const stationKeys = new Set<string>();
  const yearSet = new Set<number>();
  let totalRows = 0, processed = 0, failed = 0;

  const BATCH_SIZE = 500;
  interface RowData {
    stationKey: string; stationName: string | null; province: string; district: string | null;
    year: number; month: number; hdd: number; cdd: number;
    hddDays: number | null; cddDays: number | null; annualHdd: number | null; annualCdd: number | null;
    source: string; sourceUrl: string | null; isOfficial: boolean; stationNote: string | null;
  }
  const batch: RowData[] = [];

  const processBatch = async (rows: RowData[]) => {
    for (const row of rows) {
      const date = `${row.year}-${String(row.month).padStart(2, "0")}`;
      try {
        await db.execute(sql`
          INSERT INTO weather_degree_days (
            company_id, province, district, station_key, station_code, station_name,
            date, year, month, period_type,
            base_temperature_heating, base_temperature_cooling,
            hdd, cdd, hdd_days, cdd_days, annual_hdd, annual_cdd,
            avg_temperature, source, source_url, is_official, data_method,
            station_note, imported_at, created_at, updated_at
          )
          VALUES (
            NULL,
            ${row.province}, ${row.district}, ${row.stationKey}, NULL, ${row.stationName},
            ${date}, ${row.year}, ${row.month}, 'monthly',
            18, 22,
            ${row.hdd}, ${row.cdd}, ${row.hddDays}, ${row.cddDays}, ${row.annualHdd}, ${row.annualCdd},
            NULL, ${row.source}, ${row.sourceUrl}, ${row.isOfficial}, 'official_monthly',
            ${row.stationNote}, NOW(), NOW(), NOW()
          )
          ON CONFLICT (station_key, year, month)
            WHERE station_key IS NOT NULL AND year IS NOT NULL AND month IS NOT NULL AND is_official = true
          DO UPDATE SET
            hdd = EXCLUDED.hdd,
            cdd = EXCLUDED.cdd,
            hdd_days = EXCLUDED.hdd_days,
            cdd_days = EXCLUDED.cdd_days,
            annual_hdd = EXCLUDED.annual_hdd,
            annual_cdd = EXCLUDED.annual_cdd,
            province = EXCLUDED.province,
            district = EXCLUDED.district,
            station_name = EXCLUDED.station_name,
            source_url = EXCLUDED.source_url,
            station_note = EXCLUDED.station_note,
            imported_at = NOW(),
            updated_at = NOW()
        `);
        processed++;
      } catch (err) {
        failed++;
        console.error(`  Hata (${row.stationKey} ${row.year}/${row.month}): ${err}`);
      }
    }
  };

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const vals = row.values as (ExcelJS.CellValue | undefined)[];
    const get = (idx: number) => idx >= 0 ? (vals[idx + 1] ?? null) : null;
    const str = (v: ExcelJS.CellValue | null) => v != null ? String(v).trim() : null;
    const num = (v: ExcelJS.CellValue | null): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return isNaN(n) ? null : Math.round(n);
    };
    const numF = (v: ExcelJS.CellValue | null): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };

    const stationKey = str(get(ci.station_key));
    const year = num(get(ci.year));
    const month = num(get(ci.month));
    const province = str(get(ci.province));
    if (!stationKey || !year || !month || !province) return;

    totalRows++;
    stationKeys.add(stationKey);
    yearSet.add(year);

    // Bu bootstrap scripti yalnızca resmi MGM verisi içindir.
    // Excel sütunu ne söylerse söylesin is_official=true olarak işleniyor.
    // Bu, ON CONFLICT hedefiyle ve skip kontrolüyle tutarlı olmayı garanti eder.
    const isOfficial = true;

    batch.push({
      stationKey, stationName: str(get(ci.station_name)),
      province, district: str(get(ci.district)) || null,
      year, month,
      hdd: num(get(ci.hdd)) ?? 0,
      cdd: num(get(ci.cdd)) ?? 0,
      hddDays: num(get(ci.hdd_days)),
      cddDays: num(get(ci.cdd_days)),
      annualHdd: numF(get(ci.annual_hdd)),
      annualCdd: numF(get(ci.annual_cdd)),
      source: str(get(ci.source)) ?? "MGM",
      sourceUrl: str(get(ci.source_url)),
      isOfficial,
      stationNote: str(get(ci.mapping_note)),
    });
  });

  log(`${totalRows} satır okundu, ${stationKeys.size} istasyon, yıllar: ${[...yearSet].sort().join(", ")}`);

  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    await processBatch(batch.slice(i, i + BATCH_SIZE));
    log(`  ${Math.min(i + BATCH_SIZE, batch.length)}/${batch.length} satır işlendi...`);
  }

  log(`[DegreeDays] Tamamlandı: ${processed} başarılı, ${failed} hata | ${stationKeys.size} istasyon, ${[...yearSet].length} yıl`);
  return { totalRows, processed, failed, uniqueStations: stationKeys.size, years: [...yearSet].sort() };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  log("=== MGM Referans Veri Bootstrap Başlıyor ===");
  log(`Excel dizini: ${DATA_DIR}`);
  log(`Mapping dosyası: ${MAPPING_FILE} (${existsSync(MAPPING_FILE) ? "mevcut" : "YOK"})`);
  log(`Degree Days dosyası: ${DEGREE_DAYS_FILE} (${existsSync(DEGREE_DAYS_FILE) ? "mevcut" : "YOK"})`);
  if (FORCE) log("⚡ --force: mevcut veri kontrolü atlanıyor, her zaman import edilecek");

  try {
    // 1. Indexleri oluştur / doğrula
    await ensureIndexes();

    // 2. Station Mapping — tablo boşsa veya --force ise import et
    const [mappingRow] = await db.select({ n: count() }).from(mgmStationMappingsTable);
    const mappingCount = Number(mappingRow?.n ?? 0);
    if (FORCE || mappingCount === 0) {
      if (mappingCount > 0) {
        log(`Station mapping: ${mappingCount} kayıt var, --force ile yeniden import ediliyor...`);
      } else {
        log("Station mapping: tablo boş, import başlıyor...");
      }
      await importStationMapping(MAPPING_FILE);
    } else {
      log(`Station mapping: ${mappingCount} kayıt mevcut — atlanıyor. (--force ile zorla)`);
    }

    // 3. Degree Days — resmi kayıt yoksa veya --force ise import et
    const [ddRow] = await db
      .select({ n: count() })
      .from(weatherDegreeDaysTable)
      .where(eq(weatherDegreeDaysTable.isOfficial, true));
    const ddCount = Number(ddRow?.n ?? 0);
    if (FORCE || ddCount === 0) {
      if (ddCount > 0) {
        log(`Degree Days: ${ddCount} resmi kayıt var, --force ile yeniden import ediliyor...`);
      } else {
        log("Degree Days: resmi kayıt yok, import başlıyor...");
      }
      await importDegreeDays(DEGREE_DAYS_FILE);
    } else {
      log(`Degree Days: ${ddCount} resmi kayıt mevcut — atlanıyor. (--force ile zorla)`);
    }

    log("=== MGM Bootstrap Tamamlandı ===");
  } catch (err) {
    console.error("[import-mgm] HATA:", err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
