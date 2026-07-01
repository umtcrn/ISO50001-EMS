import { Router } from "express";
import { db, energyUseGroupsTable, metersTable, unitsTable, subUnitsTable, energySourcesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

// GET /api/energy-use-groups
router.get("/energy-use-groups", requireAuth, async (req, res) => {
  try {
    const { role, companyId: sessionCompanyId, unitId: sessionUnitId } = req.user!;
    const { isActive, groupType, energySourceId, unitId, subUnitId, companyId: qCompanyId } = req.query;

    const isPrivileged = role === "superadmin" || role === "admin";

    // Standard users must have a unitId; without one return empty list
    if (!isPrivileged && sessionUnitId === null) {
      res.json([]); return;
    }

    const rows = await db.select().from(energyUseGroupsTable).orderBy(energyUseGroupsTable.name);

    const filtered = rows.filter(g => {
      // Company isolation
      if (role === "superadmin") {
        if (qCompanyId && g.companyId !== parseInt(qCompanyId as string)) return false;
      } else {
        if (g.companyId !== sessionCompanyId) return false;
      }

      // Unit isolation: standard users are always scoped to their own unitId
      if (!isPrivileged) {
        if (g.unitId !== sessionUnitId) return false;
      } else {
        // Admins can optionally filter by unitId query param
        if (unitId && g.unitId !== parseInt(unitId as string)) return false;
      }

      if (isActive !== undefined && g.isActive !== (isActive === "true")) return false;
      if (groupType && g.groupType !== groupType) return false;
      if (energySourceId && g.energySourceId !== parseInt(energySourceId as string)) return false;
      if (subUnitId && g.subUnitId !== parseInt(subUnitId as string)) return false;
      return true;
    });

    // Bağlı sayaç sayısını ekle
    const groupIds = filtered.map(g => g.id);
    const meterCounts: Record<number, number> = {};
    if (groupIds.length > 0) {
      const allMeters = await db.select({ energyUseGroupId: metersTable.energyUseGroupId })
        .from(metersTable)
        .where(eq(metersTable.companyId, sessionCompanyId));
      for (const m of allMeters) {
        if (m.energyUseGroupId !== null && m.energyUseGroupId !== undefined) {
          meterCounts[m.energyUseGroupId] = (meterCounts[m.energyUseGroupId] ?? 0) + 1;
        }
      }
    }

    const result = filtered.map(g => ({ ...g, meterCount: meterCounts[g.id] ?? 0 }));
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /api/energy-use-groups
router.post("/energy-use-groups", requireAuth, async (req, res) => {
  try {
    const { role, companyId: sessionCompanyId, name: userName } = req.user!;
    const { name, code, groupType, energySourceId, unitId, subUnitId, description, isSeuCandidate, isActive } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: "Grup adı zorunludur" }); return;
    }

    // Aynı companyId altında aynı name kontrolü (aktif kayıtlar)
    const existing = await db.select({ id: energyUseGroupsTable.id })
      .from(energyUseGroupsTable)
      .where(and(
        eq(energyUseGroupsTable.companyId, sessionCompanyId),
        eq(energyUseGroupsTable.name, name.trim()),
        eq(energyUseGroupsTable.isActive, true)
      ));
    if (existing.length > 0) {
      res.status(400).json({ error: "Bu isimde aktif bir grup zaten mevcut" }); return;
    }

    const [group] = await db.insert(energyUseGroupsTable).values({
      companyId: sessionCompanyId,
      name: name.trim(),
      code: code?.trim() || null,
      groupType: groupType ?? "other",
      energySourceId: energySourceId ? parseInt(energySourceId) : null,
      unitId: unitId ? parseInt(unitId) : null,
      subUnitId: subUnitId ? parseInt(subUnitId) : null,
      description: description?.trim() || null,
      isSeuCandidate: isSeuCandidate === true || isSeuCandidate === "true",
      isActive: isActive !== false && isActive !== "false",
      createdBy: userName ?? null,
    }).returning();

    res.status(201).json({ ...group, meterCount: 0 });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PUT /api/energy-use-groups/:id
router.put("/energy-use-groups/:id", requireAuth, async (req, res) => {
  try {
    const { companyId: sessionCompanyId } = req.user!;
    const id = parseInt(req.params.id as string);

    const [existing] = await db.select().from(energyUseGroupsTable).where(eq(energyUseGroupsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Grup bulunamadı" }); return; }
    if (existing.companyId !== sessionCompanyId) { res.status(403).json({ error: "Yetki yok" }); return; }

    const { name, code, groupType, energySourceId, unitId, subUnitId, description, isSeuCandidate, isActive } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: "Grup adı zorunludur" }); return;
    }

    // Mükerrer isim kontrolü (aynı isimde başka aktif grup var mı?)
    const duplicate = await db.select({ id: energyUseGroupsTable.id })
      .from(energyUseGroupsTable)
      .where(and(
        eq(energyUseGroupsTable.companyId, sessionCompanyId),
        eq(energyUseGroupsTable.name, name.trim()),
        eq(energyUseGroupsTable.isActive, true)
      ));
    if (duplicate.some(d => d.id !== id)) {
      res.status(400).json({ error: "Bu isimde aktif bir grup zaten mevcut" }); return;
    }

    const [updated] = await db.update(energyUseGroupsTable).set({
      name: name.trim(),
      code: code?.trim() || null,
      groupType: groupType ?? existing.groupType ?? "other",
      energySourceId: energySourceId ? parseInt(energySourceId) : null,
      unitId: unitId ? parseInt(unitId) : null,
      subUnitId: subUnitId ? parseInt(subUnitId) : null,
      description: description?.trim() || null,
      isSeuCandidate: isSeuCandidate === true || isSeuCandidate === "true",
      isActive: isActive !== false && isActive !== "false",
      updatedAt: new Date(),
    }).where(eq(energyUseGroupsTable.id, id)).returning();

    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PATCH /api/energy-use-groups/:id/status
router.patch("/energy-use-groups/:id/status", requireAuth, async (req, res) => {
  try {
    const { companyId: sessionCompanyId } = req.user!;
    const id = parseInt(req.params.id as string);

    const [existing] = await db.select().from(energyUseGroupsTable).where(eq(energyUseGroupsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Grup bulunamadı" }); return; }
    if (existing.companyId !== sessionCompanyId) { res.status(403).json({ error: "Yetki yok" }); return; }

    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      res.status(400).json({ error: "isActive boolean olmalıdır" }); return;
    }

    const [updated] = await db.update(energyUseGroupsTable).set({
      isActive,
      updatedAt: new Date(),
    }).where(eq(energyUseGroupsTable.id, id)).returning();

    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /api/energy-use-groups/:id/meters
router.get("/energy-use-groups/:id/meters", requireAuth, async (req, res) => {
  try {
    const { companyId: sessionCompanyId } = req.user!;
    const id = parseInt(req.params.id as string);

    const [group] = await db.select().from(energyUseGroupsTable).where(eq(energyUseGroupsTable.id, id));
    if (!group) { res.status(404).json({ error: "Grup bulunamadı" }); return; }
    if (group.companyId !== sessionCompanyId) { res.status(403).json({ error: "Yetki yok" }); return; }

    const meters = await db.select().from(metersTable)
      .where(and(
        eq(metersTable.energyUseGroupId, id),
        eq(metersTable.companyId, sessionCompanyId)
      ));

    res.json(meters);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /api/energy-use-groups/export — isim join'li export verisi
router.get("/energy-use-groups/export", requireAuth, async (req, res) => {
  try {
    const { role, companyId: sessionCompanyId, unitId: sessionUnitId } = req.user!;
    const { isActive, energySourceId, unitId, subUnitId } = req.query;
    const isPrivileged = role === "superadmin" || role === "admin";

    if (!isPrivileged && sessionUnitId === null) {
      res.json([]); return;
    }

    const rows = await db
      .select({
        id: energyUseGroupsTable.id,
        companyId: energyUseGroupsTable.companyId,
        name: energyUseGroupsTable.name,
        code: energyUseGroupsTable.code,
        groupType: energyUseGroupsTable.groupType,
        description: energyUseGroupsTable.description,
        isSeuCandidate: energyUseGroupsTable.isSeuCandidate,
        isActive: energyUseGroupsTable.isActive,
        unitId: energyUseGroupsTable.unitId,
        subUnitId: energyUseGroupsTable.subUnitId,
        energySourceId: energyUseGroupsTable.energySourceId,
        unitName: unitsTable.name,
        subUnitName: subUnitsTable.name,
        energySourceName: energySourcesTable.name,
      })
      .from(energyUseGroupsTable)
      .leftJoin(unitsTable, eq(energyUseGroupsTable.unitId, unitsTable.id))
      .leftJoin(subUnitsTable, eq(energyUseGroupsTable.subUnitId, subUnitsTable.id))
      .leftJoin(energySourcesTable, eq(energyUseGroupsTable.energySourceId, energySourcesTable.id))
      .orderBy(energyUseGroupsTable.name);

    const filtered = rows.filter(g => {
      if (role !== "superadmin" && g.companyId !== sessionCompanyId) return false;
      if (!isPrivileged && g.unitId !== sessionUnitId) return false;
      if (isPrivileged && unitId && g.unitId !== parseInt(unitId as string)) return false;
      if (isActive !== undefined && g.isActive !== (isActive === "true")) return false;
      if (energySourceId && g.energySourceId !== parseInt(energySourceId as string)) return false;
      if (subUnitId && g.subUnitId !== parseInt(subUnitId as string)) return false;
      return true;
    });

    res.json(filtered);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /api/energy-use-groups/batch — toplu içe aktarma
router.post("/energy-use-groups/batch", requireAuth, async (req, res) => {
  try {
    const { role, companyId: sessionCompanyId, unitId: sessionUnitId, name: userName } = req.user!;
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "Geçerli satır dizisi gerekli" }); return;
    }
    if (rows.length > 2000) {
      res.status(400).json({ error: "En fazla 2000 satır içe aktarılabilir" }); return;
    }

    const isPrivileged = role === "superadmin" || role === "admin";

    // Standard users without a unitId cannot import (no scope to write into)
    if (!isPrivileged && sessionUnitId === null) {
      res.status(403).json({ error: "Birim yetkisi olmayan kullanıcılar toplu içe aktarma yapamaz" }); return;
    }

    // Lookup tables: all units, subunits, energy sources for this company
    const allUnits = await db.select().from(unitsTable).where(eq(unitsTable.companyId, sessionCompanyId));
    const allSubUnits = await db.select().from(subUnitsTable);
    const allEnergySources = await db.select().from(energySourcesTable).where(eq(energySourcesTable.companyId, sessionCompanyId));

    let imported = 0;
    const errors: { row: number; message: string }[] = [];

    for (const [i, row] of rows.entries()) {
      const rowNum = i + 1;
      try {
        const groupName = String(row.group_name ?? row.groupName ?? "").trim();
        if (!groupName) {
          errors.push({ row: rowNum, message: "Grup adı boş olamaz" }); continue;
        }

        // Resolve unit
        let resolvedUnitId: number | null = null;
        const unitNameRaw = String(row.unit_name ?? row.unitName ?? "").trim();
        if (unitNameRaw) {
          const unit = allUnits.find(u => u.name.toLowerCase().trim() === unitNameRaw.toLowerCase());
          if (!unit) {
            errors.push({ row: rowNum, message: `Birim bulunamadı: "${unitNameRaw}"` }); continue;
          }
          // Standard user scoping
          if (!isPrivileged && sessionUnitId !== null && unit.id !== sessionUnitId) {
            errors.push({ row: rowNum, message: `Bu birim için yetkiniz yok: "${unitNameRaw}"` }); continue;
          }
          resolvedUnitId = unit.id;
        } else if (!isPrivileged && sessionUnitId !== null) {
          resolvedUnitId = sessionUnitId;
        }

        // Resolve sub_unit
        let resolvedSubUnitId: number | null = null;
        const subUnitNameRaw = String(row.sub_unit_name ?? row.subUnitName ?? "").trim();
        if (subUnitNameRaw) {
          const candidates = resolvedUnitId
            ? allSubUnits.filter(s => s.unitId === resolvedUnitId)
            : allSubUnits.filter(s => allUnits.some(u => u.id === s.unitId));
          const sub = candidates.find(s => s.name.toLowerCase().trim() === subUnitNameRaw.toLowerCase());
          if (!sub) {
            errors.push({ row: rowNum, message: `Alt birim bulunamadı: "${subUnitNameRaw}"` }); continue;
          }
          resolvedSubUnitId = sub.id;
        }

        // Resolve energy source
        let resolvedEnergySourceId: number | null = null;
        const esNameRaw = String(row.energy_source_name ?? row.energySourceName ?? "").trim();
        if (esNameRaw) {
          const es = allEnergySources.find(e => e.name.toLowerCase().trim() === esNameRaw.toLowerCase());
          if (!es) {
            errors.push({ row: rowNum, message: `Enerji kaynağı bulunamadı: "${esNameRaw}"` }); continue;
          }
          resolvedEnergySourceId = es.id;
        }

        // Duplicate check: same company + group_name + sub_unit + energy_source (null-safe)
        const { isNull: isNullDrizzle } = await import("drizzle-orm");
        const dupConditions: any[] = [
          eq(energyUseGroupsTable.companyId, sessionCompanyId),
          eq(energyUseGroupsTable.name, groupName),
          resolvedSubUnitId !== null
            ? eq(energyUseGroupsTable.subUnitId, resolvedSubUnitId)
            : isNullDrizzle(energyUseGroupsTable.subUnitId),
          resolvedEnergySourceId !== null
            ? eq(energyUseGroupsTable.energySourceId, resolvedEnergySourceId)
            : isNullDrizzle(energyUseGroupsTable.energySourceId),
        ];
        const [dup] = await db.select({ id: energyUseGroupsTable.id })
          .from(energyUseGroupsTable)
          .where(and(...dupConditions));
        if (dup) {
          errors.push({ row: rowNum, message: `"${groupName}" bu alt birim ve kaynak için zaten mevcut (atlandı)` }); continue;
        }

        const isActiveVal = String(row.is_active ?? row.isActive ?? "true").trim().toLowerCase();
        const isActiveBoolean = isActiveVal !== "false" && isActiveVal !== "0" && isActiveVal !== "hayır" && isActiveVal !== "pasif";

        await db.insert(energyUseGroupsTable).values({
          companyId: sessionCompanyId,
          name: groupName,
          code: null,
          groupType: "other",
          energySourceId: resolvedEnergySourceId,
          unitId: resolvedUnitId,
          subUnitId: resolvedSubUnitId,
          description: String(row.description ?? "").trim() || null,
          isSeuCandidate: false,
          isActive: isActiveBoolean,
          createdBy: userName ?? null,
        });
        imported++;
      } catch (rowErr: any) {
        errors.push({ row: rowNum, message: rowErr?.message ?? "Bilinmeyen hata" });
      }
    }

    res.json({ imported, total: rows.length, errors });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
