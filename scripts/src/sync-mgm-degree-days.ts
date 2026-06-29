/**
 * MGM Resmi Gün Derece Senkronizasyonu — CLI Scripti
 *
 * Kullanım:
 *   pnpm --filter @workspace/scripts run sync:mgm-degree-days
 *   pnpm --filter @workspace/scripts run sync:mgm-degree-days -- --year=2024
 *   pnpm --filter @workspace/scripts run sync:mgm-degree-days -- --years=2022,2023,2024
 *   pnpm --filter @workspace/scripts run sync:mgm-degree-days -- --last=5
 *   pnpm --filter @workspace/scripts run sync:mgm-degree-days -- --from-json=2024
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, weatherDegreeDaysTable, mgmStationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../artifacts/api-server/src/data/mgm-degree-days");
const SOURCE_URL = "https://mgm.gov.tr/veridegerlendirme/gun-derece.aspx?g=yillik";
const MGM_URL = "https://mgm.gov.tr/veridegerlendirme/gun-derece.aspx";

// ── Türkçe → ASCII slug ───────────────────────────────────────────
function toAsciiKey(s: string): string {
  return s.toLowerCase()
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u")
    .replace(/\s+/g, "-").replace(/[^\w-]/g, "")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function toStationKey(il: string, ilce: string | null): string {
  return toAsciiKey(ilce ?? il);
}

// ── İstasyon haritasını DB'den yükle ──────────────────────────────
interface StationInfo { il: string; ilce: string | null; stationKey: string; }

async function buildStationMap(): Promise<Map<string, StationInfo>> {
  const stations = await db.select().from(mgmStationsTable);
  const map = new Map<string, StationInfo>();
  for (const st of stations) {
    const sk = toStationKey(st.il, st.ilce ?? null);
    const info: StationInfo = { il: st.il, ilce: st.ilce ?? null, stationKey: sk };
    if (!st.ilce) map.set(toAsciiKey(st.il), info);
    else map.set(toAsciiKey(st.ilce), info);
    const parts = st.name.split("/").map((p: string) => p.trim());
    if (parts.length > 1) map.set(toAsciiKey(parts[parts.length - 1]), info);
    if (parts[0] && !map.has(toAsciiKey(parts[0]))) map.set(toAsciiKey(parts[0]), info);
  }
  return map;
}

// ── HTML yardımcıları ─────────────────────────────────────────────
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function extractRows(html: string): string[][] {
  const rows: string[][] = [];
  const tableMatches = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) ?? [];
  let tableHtml = "";
  for (const t of tableMatches) {
    if (t.split("<tr").length > 5) { tableHtml = t; break; }
  }
  if (!tableHtml) return rows;
  const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
  for (const row of rowMatches) {
    const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? []).map(c => stripTags(c));
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function parseNum(s: string | undefined): number | null {
  if (!s || s === "-" || s === "" || s.toLowerCase() === "null") return null;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

// ── MGM sayfasını çek ─────────────────────────────────────────────
async function fetchMgmHtml(year: number): Promise<string> {
  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; EnYS/1.0)",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "tr-TR,tr;q=0.9",
  };

  for (const url of [
    `${MGM_URL}?g=yillik&s=yillik&yil=${year}`,
    `${MGM_URL}?g=yillik&yil=${year}`,
  ]) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
      if (res.ok) {
        const html = await res.text();
        if (html.includes("<table") && html.length > 5000) return html;
      }
    } catch { /* dene */ }
  }

  // POST ile ViewState al
  const initRes = await fetch(`${MGM_URL}?g=yillik`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  const initHtml = await initRes.text();

  const vs = initHtml.match(/id="__VIEWSTATE"\s+value="([^"]*?)"/i)?.[1] ?? "";
  const vsg = initHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]*?)"/i)?.[1] ?? "";
  const ev = initHtml.match(/id="__EVENTVALIDATION"\s+value="([^"]*?)"/i)?.[1] ?? "";
  const ddlName = initHtml.match(/name="([^"]*?ddl[Yy]il[^"]*?)"/i)?.[1] ?? "ctl00$ContentPlaceHolder1$ddlYil";
  const btnName = initHtml.match(/name="([^"]*?btn[^"]*?)"[^>]*?type="submit"/i)?.[1] ?? "ctl00$ContentPlaceHolder1$btnSorgula";

  const params = new URLSearchParams({ __VIEWSTATE: vs, __VIEWSTATEGENERATOR: vsg, __EVENTVALIDATION: ev, __EVENTTARGET: "", __EVENTARGUMENT: "", [ddlName]: year.toString(), [btnName]: "Sorgula" });
  const postRes = await fetch(`${MGM_URL}?g=yillik`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(45_000),
  });
  if (!postRes.ok) throw new Error(`MGM POST HTTP ${postRes.status}`);
  return postRes.text();
}

// ── HTML parse ────────────────────────────────────────────────────
interface StationRecord {
  stationName: string; stationKey: string; province: string; district: string | null;
  year: number; month: number; hdd: number; cdd: number;
  hddDays: number | null; cddDays: number | null; annualHdd: number | null; annualCdd: number | null;
}

function parseMgmHtml(html: string, year: number, stationMap: Map<string, StationInfo>): StationRecord[] {
  const rows = extractRows(html);
  if (rows.length < 3) return [];
  const maxCols = Math.max(...rows.map(r => r.length));
  const headerIdx = rows.findIndex(r => r.length === maxCols);
  if (headerIdx < 0) return [];
  const header = rows[headerIdx];

  // Kolon mapping: basit heuristic — ilk 13 non-name kolon = HDD, sonraki 13 = CDD
  let hddStart = 1, cddStart = -1;
  for (let i = 0; i < header.length; i++) {
    const h = header[i].toLowerCase();
    if (h.includes("sogutma") || h.includes("soğutma") || h.includes("cdd")) { cddStart = i + 1; break; }
    if (h.includes("isitma") || h.includes("ısıtma") || h.includes("hdd")) { hddStart = i + 1; }
  }
  if (cddStart < 0 && header.length >= 26) { hddStart = 1; cddStart = 14; }

  const records: StationRecord[] = [];
  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (!row[0] || row.length < 5) continue;
    const nameKey = toAsciiKey(row[0]);
    const stInfo = stationMap.get(nameKey);
    if (!stInfo) continue;

    const annualHdd = hddStart > 0 && row[hddStart + 12] ? parseNum(row[hddStart + 12]) : null;
    const annualCdd = cddStart > 0 && row[cddStart + 12] ? parseNum(row[cddStart + 12]) : null;

    for (let m = 0; m < 12; m++) {
      const hdd = parseNum(row[hddStart + m]);
      const cdd = cddStart > 0 ? parseNum(row[cddStart + m]) : null;
      if (hdd === null && cdd === null) continue;
      records.push({
        stationName: row[0].toUpperCase(),
        stationKey: stInfo.stationKey,
        province: stInfo.il,
        district: stInfo.ilce ?? null,
        year, month: m + 1,
        hdd: hdd ?? 0, cdd: cdd ?? 0,
        hddDays: null, cddDays: null, annualHdd, annualCdd,
      });
    }
  }
  return records;
}

// ── DB Upsert ─────────────────────────────────────────────────────
async function upsertRecords(records: StationRecord[]): Promise<{ inserted: number; updated: number; errors: number }> {
  let inserted = 0, updated = 0, errors = 0;
  for (const rec of records) {
    try {
      const date = `${rec.year}-${String(rec.month).padStart(2, "0")}`;
      const existing = await db.select({ id: weatherDegreeDaysTable.id }).from(weatherDegreeDaysTable)
        .where(and(
          eq(weatherDegreeDaysTable.stationKey as any, rec.stationKey),
          eq(weatherDegreeDaysTable.year as any, rec.year),
          eq(weatherDegreeDaysTable.month as any, rec.month),
          eq(weatherDegreeDaysTable.isOfficial, true),
        )).limit(1);

      if (existing.length > 0) {
        await db.update(weatherDegreeDaysTable).set({
          hdd: rec.hdd, cdd: rec.cdd,
          hddDays: rec.hddDays as any, cddDays: rec.cddDays as any,
          annualHdd: rec.annualHdd as any, annualCdd: rec.annualCdd as any,
          stationName: rec.stationName, sourceUrl: SOURCE_URL, importedAt: new Date(), updatedAt: new Date(),
        } as any).where(eq(weatherDegreeDaysTable.id, existing[0].id));
        updated++;
      } else {
        await db.insert(weatherDegreeDaysTable).values({
          companyId: null, province: rec.province, district: rec.district,
          stationKey: rec.stationKey as any, stationCode: null, stationName: rec.stationName,
          date, year: rec.year, month: rec.month, periodType: "monthly",
          baseTemperatureHeating: 18, baseTemperatureCooling: 22,
          hdd: rec.hdd, cdd: rec.cdd,
          hddDays: rec.hddDays as any, cddDays: rec.cddDays as any,
          annualHdd: rec.annualHdd as any, annualCdd: rec.annualCdd as any,
          avgTemperature: null, source: "MGM", sourceUrl: SOURCE_URL,
          isOfficial: true, dataMethod: "official_monthly", stationNote: null, importedAt: new Date(),
        } as any);
        inserted++;
      }
    } catch (e: any) { errors++; console.error(`  HATA ${rec.stationKey} ${rec.year}/${rec.month}: ${e?.message}`); }
  }
  return { inserted, updated, errors };
}

// ── JSON'dan DB'ye import ─────────────────────────────────────────
async function importFromJson(year: number): Promise<void> {
  const file = path.join(DATA_DIR, `mgm-degree-days-${year}.json`);
  if (!fs.existsSync(file)) throw new Error(`Dosya bulunamadı: ${file}`);
  const records: StationRecord[] = JSON.parse(fs.readFileSync(file, "utf-8"));
  console.log(`[import-json] ${year}: ${records.length} kayıt okundu.`);
  const r = await upsertRecords(records);
  console.log(`[import-json] ${year}: +${r.inserted} eklendi, ~${r.updated} güncellendi, !${r.errors} hata.`);
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const now = new Date();
  const currentYear = now.getFullYear();

  const fromJsonArg = args.find(a => a.startsWith("--from-json="))?.split("=")[1];
  if (fromJsonArg) {
    await importFromJson(parseInt(fromJsonArg));
    process.exit(0);
  }

  const stationMap = await buildStationMap();
  console.log(`[MGM-Official] ${stationMap.size} istasyon haritası yüklendi.`);

  let years: number[];
  const yearArg = args.find(a => a.startsWith("--year="))?.split("=")[1];
  const yearsArg = args.find(a => a.startsWith("--years="))?.split("=")[1];
  const lastArg = args.find(a => a.startsWith("--last="))?.split("=")[1];

  if (yearArg) {
    years = [parseInt(yearArg)];
  } else if (yearsArg) {
    years = yearsArg.split(",").map(Number);
  } else if (lastArg) {
    const n = parseInt(lastArg);
    years = Array.from({ length: n }, (_, i) => currentYear - (n - 1) + i);
  } else {
    years = Array.from({ length: 10 }, (_, i) => currentYear - 9 + i);
  }

  console.log(`[MGM-Official] Yıllar: ${years.join(", ")}`);

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  let totalInserted = 0, totalUpdated = 0, totalErrors = 0;

  for (const year of years) {
    console.log(`\n[MGM-Official] ${year} çekiliyor...`);
    try {
      const html = await fetchMgmHtml(year);
      const records = parseMgmHtml(html, year, stationMap);
      if (records.length === 0) {
        console.log(`  ${year}: Kayıt bulunamadı (site yapısı farklı olabilir).`);
        continue;
      }
      const jsonPath = path.join(DATA_DIR, `mgm-degree-days-${year}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2), "utf-8");
      console.log(`  ${year}: ${records.length} kayıt parse edildi → ${jsonPath}`);

      const r = await upsertRecords(records);
      totalInserted += r.inserted;
      totalUpdated += r.updated;
      totalErrors += r.errors;
      console.log(`  ${year}: +${r.inserted} eklendi, ~${r.updated} güncellendi, !${r.errors} hata.`);
    } catch (err: any) {
      console.error(`  ${year} HATA: ${err?.message ?? err}`);
      totalErrors++;
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n[MGM-Official] Tamamlandı: +${totalInserted} eklendi, ~${totalUpdated} güncellendi, !${totalErrors} hata.`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
