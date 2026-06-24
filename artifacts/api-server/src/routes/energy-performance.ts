import { Router } from "express";
import {
  db,
  seuAssessmentItemsTable,
  seuAssessmentsTable,
  unitsTable,
  consumptionTable,
  metersTable,
  energySourcesTable,
  variablesTable,
  weatherDegreeDaysTable,
  energyUseGroupsTable,
} from "@workspace/db";
import { eq, and, inArray, desc, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

const MONTH_LABELS: Record<number, string> = {
  1: "Ocak", 2: "Şubat", 3: "Mart", 4: "Nisan", 5: "Mayıs", 6: "Haziran",
  7: "Temmuz", 8: "Ağustos", 9: "Eylül", 10: "Ekim", 11: "Kasım", 12: "Aralık",
};

// ── GET /api/energy-performance/seu-items ─────────────────
// Kabul edilmiş (accepted_as_seu) ÖEK kalemlerini döndürür
router.get("/energy-performance/seu-items", requireAuth, async (req, res) => {
  try {
    const { role, companyId: sessionCompanyId, unitId: sessionUnitId } = req.user!;
    const unitId = req.query.unitId ? parseInt(req.query.unitId as string) : null;

    const rows = await db
      .select({
        id: seuAssessmentItemsTable.id,
        assessmentId: seuAssessmentItemsTable.assessmentId,
        name: seuAssessmentItemsTable.name,
        energyTep: seuAssessmentItemsTable.energyTep,
        consumptionSharePercent: seuAssessmentItemsTable.consumptionSharePercent,
        priorityResult: seuAssessmentItemsTable.priorityResult,
        userDecision: seuAssessmentItemsTable.userDecision,
        decisionReason: seuAssessmentItemsTable.decisionReason,
        energySourceId: seuAssessmentItemsTable.energySourceId,
        energyUseGroupId: seuAssessmentItemsTable.energyUseGroupId,
        meterId: seuAssessmentItemsTable.meterId,
        unitId: seuAssessmentItemsTable.unitId,
        assessmentYear: seuAssessmentsTable.year,
        assessmentRecordType: seuAssessmentsTable.recordType,
        unitName: unitsTable.name,
        energySourceName: energySourcesTable.name,
        energyUseGroupName: energyUseGroupsTable.name,
      })
      .from(seuAssessmentItemsTable)
      .innerJoin(seuAssessmentsTable, eq(seuAssessmentItemsTable.assessmentId, seuAssessmentsTable.id))
      .leftJoin(unitsTable, eq(seuAssessmentItemsTable.unitId, unitsTable.id))
      .leftJoin(energySourcesTable, eq(seuAssessmentItemsTable.energySourceId, energySourcesTable.id))
      .leftJoin(energyUseGroupsTable, eq(seuAssessmentItemsTable.energyUseGroupId, energyUseGroupsTable.id))
      .where(
        and(
          eq(seuAssessmentsTable.companyId, sessionCompanyId),
          eq(seuAssessmentItemsTable.userDecision, "accepted_as_seu"),
          ...(role === "user" && sessionUnitId
            ? [eq(seuAssessmentItemsTable.unitId, sessionUnitId)]
            : unitId
              ? [eq(seuAssessmentItemsTable.unitId, unitId)]
              : []),
        )
      )
      .orderBy(desc(seuAssessmentsTable.year), asc(seuAssessmentItemsTable.priorityResult));

    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ── GET /api/energy-performance/dataset ───────────────────
// Seçilen ÖEK kalemi için geçmiş 12 aylık tüketim + HDD/CDD veri seti
router.get("/energy-performance/dataset", requireAuth, async (req, res) => {
  try {
    const { role, companyId: sessionCompanyId, unitId: sessionUnitId } = req.user!;
    const seuItemId = req.query.seuItemId ? parseInt(req.query.seuItemId as string) : null;
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

    if (!seuItemId) {
      res.status(400).json({ error: "seuItemId zorunludur" });
      return;
    }

    // SEU kalemini ve ilgili assessment'ı getir
    const [seuItem] = await db
      .select({
        id: seuAssessmentItemsTable.id,
        name: seuAssessmentItemsTable.name,
        unitId: seuAssessmentItemsTable.unitId,
        energySourceId: seuAssessmentItemsTable.energySourceId,
        meterId: seuAssessmentItemsTable.meterId,
        energyUseGroupId: seuAssessmentItemsTable.energyUseGroupId,
        assessmentCompanyId: seuAssessmentsTable.companyId,
        assessmentYear: seuAssessmentsTable.year,
      })
      .from(seuAssessmentItemsTable)
      .innerJoin(seuAssessmentsTable, eq(seuAssessmentItemsTable.assessmentId, seuAssessmentsTable.id))
      .where(
        and(
          eq(seuAssessmentItemsTable.id, seuItemId),
          eq(seuAssessmentsTable.companyId, sessionCompanyId),
        )
      );

    if (!seuItem) {
      res.status(404).json({ error: "ÖEK kalemi bulunamadı" });
      return;
    }

    // Tenant + rol güvenliği
    if (role === "user" && sessionUnitId && seuItem.unitId !== sessionUnitId) {
      res.status(403).json({ error: "Erişim yetkisi yok" });
      return;
    }

    const resolvedUnitId = seuItem.unitId;

    // 12 aylık tüketim verisi
    const periodStart = year - 1; // geçmiş 12 ay = önceki yıl + bu yılın başı
    const consumptionRows = await db
      .select({
        year: consumptionTable.year,
        month: consumptionTable.month,
        kwh: consumptionTable.kwh,
        tep: consumptionTable.tep,
        co2: consumptionTable.co2,
        hdd: consumptionTable.hdd,
        cdd: consumptionTable.cdd,
        meterId: consumptionTable.meterId,
        meterName: metersTable.name,
        energySourceId: metersTable.energySourceId,
        energySourceName: energySourcesTable.name,
      })
      .from(consumptionTable)
      .innerJoin(metersTable, eq(consumptionTable.meterId, metersTable.id))
      .leftJoin(energySourcesTable, eq(metersTable.energySourceId, energySourcesTable.id))
      .where(
        and(
          eq(consumptionTable.companyId, sessionCompanyId),
          ...(resolvedUnitId ? [eq(metersTable.unitId, resolvedUnitId)] : []),
          ...(seuItem.energySourceId ? [eq(metersTable.energySourceId, seuItem.energySourceId)] : []),
          ...(seuItem.meterId ? [eq(consumptionTable.meterId, seuItem.meterId)] : []),
        )
      )
      .orderBy(asc(consumptionTable.year), asc(consumptionTable.month));

    // Son 24 ay: (year-1) tüm aylar + (year) tüm aylar
    const filtered = consumptionRows.filter(r =>
      (r.year === periodStart) || (r.year === year)
    );

    // Aylık aggregation: aynı yıl+ay birden fazla sayaç olabilir
    const monthMap: Record<string, {
      year: number; month: number; totalKwh: number; totalTep: number;
      totalCo2: number; avgHdd: number | null; avgCdd: number | null;
      energySourceName: string | null; meters: string[];
    }> = {};

    for (const r of filtered) {
      const key = `${r.year}-${r.month}`;
      if (!monthMap[key]) {
        monthMap[key] = {
          year: r.year, month: r.month, totalKwh: 0, totalTep: 0,
          totalCo2: 0, avgHdd: null, avgCdd: null,
          energySourceName: r.energySourceName ?? null, meters: [],
        };
      }
      monthMap[key].totalKwh += r.kwh ?? 0;
      monthMap[key].totalTep += r.tep ?? 0;
      monthMap[key].totalCo2 += r.co2 ?? 0;
      if (r.hdd != null) monthMap[key].avgHdd = (monthMap[key].avgHdd ?? 0) + r.hdd;
      if (r.cdd != null) monthMap[key].avgCdd = (monthMap[key].avgCdd ?? 0) + r.cdd;
      if (r.meterName && !monthMap[key].meters.includes(r.meterName)) {
        monthMap[key].meters.push(r.meterName);
      }
    }

    const consumptionDataset = Object.values(monthMap)
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
      .map(r => ({
        year: r.year,
        month: r.month,
        monthLabel: MONTH_LABELS[r.month] ?? String(r.month),
        totalKwh: Math.round(r.totalKwh * 100) / 100,
        totalTep: Math.round(r.totalTep * 10000) / 10000,
        totalCo2: Math.round(r.totalCo2 * 100) / 100,
        hdd: r.avgHdd != null ? Math.round(r.avgHdd * 10) / 10 : null,
        cdd: r.avgCdd != null ? Math.round(r.avgCdd * 10) / 10 : null,
        energySourceName: r.energySourceName,
        meters: r.meters.join(", "),
      }));

    res.json({
      seuItem: {
        id: seuItem.id,
        name: seuItem.name,
        unitId: seuItem.unitId,
        energySourceId: seuItem.energySourceId,
        assessmentYear: seuItem.assessmentYear,
      },
      year,
      periodStart,
      consumptionDataset,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ── GET /api/energy-performance/variables ─────────────────
// Seçilebilir değişkenler (variablesTable + HDD/CDD sabit değişkenler)
router.get("/energy-performance/variables", requireAuth, async (req, res) => {
  try {
    const { companyId: sessionCompanyId } = req.user!;

    const dbVars = await db
      .select({
        id: variablesTable.id,
        name: variablesTable.name,
        code: variablesTable.code,
        category: variablesTable.category,
        unitLabel: variablesTable.unitLabel,
        sourceType: variablesTable.sourceType,
        isActive: variablesTable.isActive,
      })
      .from(variablesTable)
      .where(
        and(
          eq(variablesTable.companyId, sessionCompanyId),
          eq(variablesTable.isActive, true),
        )
      )
      .orderBy(asc(variablesTable.name));

    const systemVariables = [
      { id: null, name: "HDD (Isıtma Gün Derecesi)", code: "HDD", category: "climate", unitLabel: "°C·gün", sourceType: "weather_auto", isActive: true },
      { id: null, name: "CDD (Soğutma Gün Derecesi)", code: "CDD", category: "climate", unitLabel: "°C·gün", sourceType: "weather_auto", isActive: true },
      { id: null, name: "Üretim Miktarı", code: "PRODUCTION", category: "production", unitLabel: "birim", sourceType: "operation_manual", isActive: true },
      { id: null, name: "Çalışma Saati", code: "WORKING_HOURS", category: "operational", unitLabel: "saat", sourceType: "operation_manual", isActive: true },
      { id: null, name: "Personel Sayısı", code: "STAFF_COUNT", category: "operational", unitLabel: "kişi", sourceType: "operation_manual", isActive: true },
      { id: null, name: "Alan / m²", code: "AREA_M2", category: "operational", unitLabel: "m²", sourceType: "operation_manual", isActive: true },
      { id: null, name: "Misafir Sayısı", code: "GUEST_COUNT", category: "operational", unitLabel: "kişi", sourceType: "operation_manual", isActive: true },
      { id: null, name: "Kilometre", code: "KM", category: "operational", unitLabel: "km", sourceType: "operation_manual", isActive: true },
      { id: null, name: "Ekipman Çalışma Süresi", code: "EQUIP_HOURS", category: "operational", unitLabel: "saat", sourceType: "operation_manual", isActive: true },
      { id: null, name: "Arıza Sayısı", code: "FAULT_COUNT", category: "operational", unitLabel: "adet", sourceType: "operation_manual", isActive: true },
      { id: null, name: "Bakım Sayısı", code: "MAINTENANCE_COUNT", category: "operational", unitLabel: "adet", sourceType: "operation_manual", isActive: true },
      { id: null, name: "Anahtarlama Ekipmanları Açma/Kapama Sayısı", code: "SWITCH_COUNT", category: "operational", unitLabel: "adet", sourceType: "operation_manual", isActive: true },
      { id: null, name: "TM'lerde Aktarılan Enerji Miktarı", code: "TM_ENERGY", category: "operational", unitLabel: "kWh", sourceType: "operation_manual", isActive: true },
    ];

    res.json({
      systemVariables,
      userVariables: dbVars,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
