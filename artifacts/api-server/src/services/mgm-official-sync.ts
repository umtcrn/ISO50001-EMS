/**
 * MGM Resmi Gün Derece Havuzu — Veri Çekme & DB Upsert
 *
 * https://mgm.gov.tr/veridegerlendirme/gun-derece.aspx?g=yillik
 *
 * Her yıl için MGM resmi sayfasından tüm istasyonların aylık HDD/CDD
 * değerlerini çeker, JSON olarak kaydeder ve weather_degree_days tablosuna
 * upsert eder.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, weatherDegreeDaysTable, mgmStationsTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data/mgm-degree-days");

const MGM_URL = "https://mgm.gov.tr/veridegerlendirme/gun-derece.aspx";
const SOURCE_URL = "https://mgm.gov.tr/veridegerlendirme/gun-derece.aspx?g=yillik";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; EnYS/1.0; +https://github.com/)",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

// ── Türkçe → ASCII slug dönüşümü ──────────────────────────────────
export function toStationKey(il: string, ilce: string | null): string {
  const base = ilce ?? il;
  return base
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function toAsciiKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── İstasyon haritasını DB'den yükle ──────────────────────────────
interface StationInfo {
  il: string;
  ilce: string | null;
  stationKey: string;
}

async function buildStationMap(): Promise<Map<string, StationInfo>> {
  const stations = await db.select().from(mgmStationsTable);
  const map = new Map<string, StationInfo>();

  for (const st of stations) {
    const stationKey = toStationKey(st.il, st.ilce);
    const info: StationInfo = { il: st.il, ilce: st.ilce ?? null, stationKey };

    if (!st.ilce) {
      map.set(toAsciiKey(st.il), info);
    } else {
      map.set(toAsciiKey(st.ilce), info);
    }

    const nameParts = st.name.split("/").map((p: string) => p.trim());
    if (nameParts.length > 1) {
      map.set(toAsciiKey(nameParts[nameParts.length - 1]), info);
    }
    if (nameParts[0]) {
      const key = toAsciiKey(nameParts[0]);
      if (!map.has(key)) map.set(key, info);
    }
  }

  return map;
}

// ── HTML table parser (regex tabanlı) ─────────────────────────────
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function extractRows(html: string): string[][] {
  const rows: string[][] = [];
  const tableMatch = html.match(/<table[^>]*class="[^"]*tablo[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
    ?? html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi)?.find(t => t.includes("<td"));
  if (!tableMatch) return rows;
  const tableHtml = typeof tableMatch === "string" ? tableMatch : tableMatch[0] ?? "";

  const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
  for (const rowHtml of rowMatches) {
    const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [];
    const cells = cellMatches.map(c => stripTags(c));
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

// ── Sayısal değer parse ────────────────────────────────────────────
function parseNum(s: string | undefined): number | null {
  if (!s || s === "-" || s === "" || s.toLowerCase() === "null") return null;
  const clean = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

// ── MGM sayfasını çek ─────────────────────────────────────────────
async function fetchMgmHtml(year: number): Promise<string> {
  const tryUrls = [
    `${MGM_URL}?g=yillik&s=yillik&yil=${year}`,
    `${MGM_URL}?g=yillik&yil=${year}`,
  ];

  for (const url of tryUrls) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(30_000),
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (html.includes("<table") && html.length > 5000) return html;
    } catch {
      // deneye devam
    }
  }

  // GET başarısız → POST ile ViewState al ve gönder
  const initRes = await fetch(`${MGM_URL}?g=yillik`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
  const initHtml = await initRes.text();

  const vsMatch = initHtml.match(/id="__VIEWSTATE"\s+value="([^"]*?)"/i);
  const vsgMatch = initHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]*?)"/i);
  const evMatch = initHtml.match(/id="__EVENTVALIDATION"\s+value="([^"]*?)"/i);

  const ddlMatch = initHtml.match(/name="([^"]*?ddl[Yy]il[^"]*?)"/i)
    ?? initHtml.match(/id="([^"]*?ddl[Yy]il[^"]*?)"/i);
  const ddlName = ddlMatch?.[1] ?? "ctl00$ContentPlaceHolder1$ddlYil";

  const btnMatch = initHtml.match(/name="([^"]*?btn[^"]*?)"[^>]*?type="submit"/i);
  const btnName = btnMatch?.[1] ?? "ctl00$ContentPlaceHolder1$btnSorgula";

  const params = new URLSearchParams({
    __VIEWSTATE: vsMatch?.[1] ?? "",
    __VIEWSTATEGENERATOR: vsgMatch?.[1] ?? "",
    __EVENTVALIDATION: evMatch?.[1] ?? "",
    __EVENTTARGET: "",
    __EVENTARGUMENT: "",
    [ddlName]: year.toString(),
    [btnName]: "Sorgula",
  });

  const postRes = await fetch(`${MGM_URL}?g=yillik`, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": `${MGM_URL}?g=yillik`,
    },
    body: params.toString(),
    signal: AbortSignal.timeout(45_000),
  });

  if (!postRes.ok) throw new Error(`MGM POST HTTP ${postRes.status}`);
  return postRes.text();
}

// ── MGM sayfasını parse et ────────────────────────────────────────
export interface MgmStationRecord {
  stationName: string;
  stationKey: string;
  province: string;
  district: string | null;
  year: number;
  month: number;
  hdd: number;
  cdd: number;
  hddDays: number | null;
  cddDays: number | null;
  annualHdd: number | null;
  annualCdd: number | null;
}

function detectColumnMap(headerRow: string[]): {
  hddCols: number[];
  cddCols: number[];
  hddAnnualCol: number | null;
  cddAnnualCol: number | null;
  hddDaysCols: number[];
  cddDaysCols: number[];
} {
  const hddCols: number[] = [];
  const cddCols: number[] = [];
  let hddAnnualCol: number | null = null;
  let cddAnnualCol: number | null = null;
  const hddDaysCols: number[] = [];
  const cddDaysCols: number[] = [];

  let hddSection = false;
  let cddSection = false;
  let hddDaysSection = false;
  let cddDaysSection = false;
  let monthCount = 0;

  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i].toLowerCase();
    if (h.includes("isitma") || h.includes("ısıtma") || h.includes("hdd")) {
      hddSection = true; cddSection = false; hddDaysSection = false; cddDaysSection = false;
      monthCount = 0;
    } else if (h.includes("sogutma") || h.includes("soğutma") || h.includes("cdd")) {
      cddSection = true; hddSection = false; hddDaysSection = false; cddDaysSection = false;
      monthCount = 0;
    } else if ((h.includes("15") || h.includes("≤15") || h.includes("gun") || h.includes("gün")) && hddSection) {
      hddDaysSection = true; hddSection = false;
      monthCount = 0;
    } else if ((h.includes("22") || h.includes(">22") || h.includes("gun") || h.includes("gün")) && cddSection) {
      cddDaysSection = true; cddSection = false;
      monthCount = 0;
    } else if (h.includes("toplam") || h.includes("yillik") || h.includes("yıllık") || h.includes("annual")) {
      if (hddSection && hddAnnualCol === null) hddAnnualCol = i;
      else if (cddSection && cddAnnualCol === null) cddAnnualCol = i;
      monthCount = 0;
    } else if (i > 0) {
      monthCount++;
      if (hddSection && monthCount <= 12) hddCols.push(i);
      else if (cddSection && monthCount <= 12) cddCols.push(i);
      else if (hddDaysSection && monthCount <= 12) hddDaysCols.push(i);
      else if (cddDaysSection && monthCount <= 12) cddDaysCols.push(i);
    }
  }

  // Fallback: eğer sadece iki section bulunamazsa, basit pattern dene
  if (hddCols.length === 0 && cddCols.length === 0 && headerRow.length >= 25) {
    for (let i = 1; i <= 12; i++) { hddCols.push(i); }
    if (headerRow.length > 13) hddAnnualCol = 13;
    for (let i = 14; i <= 25 && i < headerRow.length; i++) { cddCols.push(i); }
    if (headerRow.length > 26) cddAnnualCol = 26;
  }

  return { hddCols, cddCols, hddAnnualCol, cddAnnualCol, hddDaysCols, cddDaysCols };
}

export function parseMgmHtml(
  html: string,
  year: number,
  stationMap: Map<string, StationInfo>
): MgmStationRecord[] {
  const rows = extractRows(html);
  if (rows.length < 3) return [];

  // Header satırını bul (en fazla sütun içereni)
  const maxCols = Math.max(...rows.map(r => r.length));
  const headerIdx = rows.findIndex(r => r.length === maxCols);
  if (headerIdx < 0) return [];

  const header = rows[headerIdx];
  const colMap = detectColumnMap(header);

  const records: MgmStationRecord[] = [];

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (row.length < 5) continue;
    const rawName = row[0];
    if (!rawName || rawName.length < 2) continue;

    const nameKey = toAsciiKey(rawName);
    const stInfo = stationMap.get(nameKey);
    if (!stInfo) continue;

    const stationKey = stInfo.stationKey;
    const province = stInfo.il;
    const district = stInfo.ilce;

    const annualHdd = colMap.hddAnnualCol !== null ? parseNum(row[colMap.hddAnnualCol]) : null;
    const annualCdd = colMap.cddAnnualCol !== null ? parseNum(row[colMap.cddAnnualCol]) : null;

    for (let m = 0; m < 12; m++) {
      const hddCol = colMap.hddCols[m];
      const cddCol = colMap.cddCols[m];
      const hddDaysCol = colMap.hddDaysCols[m];
      const cddDaysCol = colMap.cddDaysCols[m];

      const hdd = hddCol !== undefined ? parseNum(row[hddCol]) : null;
      const cdd = cddCol !== undefined ? parseNum(row[cddCol]) : null;

      if (hdd === null && cdd === null) continue;

      records.push({
        stationName: rawName.toUpperCase(),
        stationKey,
        province,
        district: district ?? null,
        year,
        month: m + 1,
        hdd: hdd ?? 0,
        cdd: cdd ?? 0,
        hddDays: hddDaysCol !== undefined ? (parseNum(row[hddDaysCol]) !== null ? Math.round(parseNum(row[hddDaysCol])!) : null) : null,
        cddDays: cddDaysCol !== undefined ? (parseNum(row[cddDaysCol]) !== null ? Math.round(parseNum(row[cddDaysCol])!) : null) : null,
        annualHdd,
        annualCdd,
      });
    }
  }

  return records;
}

// ── DB upsert ─────────────────────────────────────────────────────
export interface SyncResult {
  year: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  stationCount: number;
}

export async function upsertOfficialRecords(records: MgmStationRecord[]): Promise<Omit<SyncResult, "year">> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const stations = new Set<string>();

  for (const rec of records) {
    try {
      stations.add(rec.stationKey);
      const date = `${rec.year}-${String(rec.month).padStart(2, "0")}`;

      const existing = await db
        .select({ id: weatherDegreeDaysTable.id })
        .from(weatherDegreeDaysTable)
        .where(and(
          eq(weatherDegreeDaysTable.stationKey as any, rec.stationKey),
          eq(weatherDegreeDaysTable.year as any, rec.year),
          eq(weatherDegreeDaysTable.month as any, rec.month),
          eq(weatherDegreeDaysTable.isOfficial, true),
        ))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(weatherDegreeDaysTable)
          .set({
            hdd: rec.hdd,
            cdd: rec.cdd,
            hddDays: rec.hddDays as any,
            cddDays: rec.cddDays as any,
            annualHdd: rec.annualHdd as any,
            annualCdd: rec.annualCdd as any,
            stationName: rec.stationName,
            sourceUrl: SOURCE_URL,
            importedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(weatherDegreeDaysTable.id, existing[0].id));
        updated++;
      } else {
        await db.insert(weatherDegreeDaysTable).values({
          companyId: null,
          province: rec.province,
          district: rec.district,
          stationKey: rec.stationKey as any,
          stationCode: null,
          stationName: rec.stationName,
          date,
          year: rec.year,
          month: rec.month,
          periodType: "monthly",
          baseTemperatureHeating: 18,
          baseTemperatureCooling: 22,
          hdd: rec.hdd,
          cdd: rec.cdd,
          hddDays: rec.hddDays as any,
          cddDays: rec.cddDays as any,
          annualHdd: rec.annualHdd as any,
          annualCdd: rec.annualCdd as any,
          avgTemperature: null,
          source: "MGM",
          sourceUrl: SOURCE_URL,
          isOfficial: true,
          dataMethod: "official_monthly",
          stationNote: null,
          importedAt: new Date(),
        } as any);
        inserted++;
      }
    } catch {
      errors++;
    }
  }

  return { inserted, updated, skipped, errors, stationCount: stations.size };
}

// ── JSON dosyasına kaydet ──────────────────────────────────────────
export function saveJson(year: number, records: MgmStationRecord[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const filePath = path.join(DATA_DIR, `mgm-degree-days-${year}.json`);
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), "utf-8");
}

// ── Ana sync fonksiyonu ────────────────────────────────────────────
export async function syncOfficialDegreeDays(
  years: number[],
  onProgress?: (msg: string) => void
): Promise<SyncResult[]> {
  const log = onProgress ?? console.log;
  const stationMap = await buildStationMap();
  log(`[MGM-Official] ${stationMap.size} istasyon haritası yüklendi.`);

  const results: SyncResult[] = [];

  for (const year of years) {
    log(`[MGM-Official] ${year} yılı çekiliyor...`);
    try {
      const html = await fetchMgmHtml(year);
      const records = parseMgmHtml(html, year, stationMap);

      if (records.length === 0) {
        log(`[MGM-Official] ${year}: HTML parse edildi ama kayıt bulunamadı (site yapısı farklı olabilir).`);
        results.push({ year, inserted: 0, updated: 0, skipped: 0, errors: 1, stationCount: 0 });
        continue;
      }

      saveJson(year, records);
      log(`[MGM-Official] ${year}: ${records.length} kayıt parse edildi, JSON kaydedildi.`);

      const upsert = await upsertOfficialRecords(records);
      log(`[MGM-Official] ${year}: +${upsert.inserted} eklendi, ~${upsert.updated} güncellendi, !${upsert.errors} hata.`);

      results.push({ year, ...upsert });
    } catch (err: any) {
      log(`[MGM-Official] ${year} HATA: ${err?.message ?? err}`);
      results.push({ year, inserted: 0, updated: 0, skipped: 0, errors: 1, stationCount: 0 });
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  return results;
}

// ── JSON dosyasından DB'ye import ─────────────────────────────────
export async function importFromJson(year: number): Promise<Omit<SyncResult, "year">> {
  const filePath = path.join(DATA_DIR, `mgm-degree-days-${year}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`JSON dosyası bulunamadı: ${filePath}`);
  }
  const records: MgmStationRecord[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return upsertOfficialRecords(records);
}
