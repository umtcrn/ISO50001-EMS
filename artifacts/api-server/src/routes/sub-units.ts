import { Router } from "express";
import { db, subUnitsTable, unitsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

// GET /api/sub-units?unitId=1&companyId=1
router.get("/sub-units", requireAuth, async (req, res) => {
  try {
    const role = req.user!.role;
    const unitId = req.query.unitId ? parseInt(req.query.unitId as string) : undefined;
    const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;

    if (role !== "admin" && role !== "superadmin" && req.user!.unitId !== null) {
      const rows = await db.select().from(subUnitsTable)
        .where(eq(subUnitsTable.unitId, req.user!.unitId!))
        .orderBy(subUnitsTable.name);
      res.json(rows);
      return;
    }

    if (role === "superadmin" && companyId !== undefined) {
      const rows = await db.select().from(subUnitsTable)
        .where(and(
          eq(subUnitsTable.companyId, companyId),
          ...(unitId !== undefined ? [eq(subUnitsTable.unitId, unitId)] : [])
        ))
        .orderBy(subUnitsTable.name);
      res.json(rows);
      return;
    }

    if (unitId !== undefined) {
      const rows = await db.select().from(subUnitsTable)
        .where(eq(subUnitsTable.unitId, unitId))
        .orderBy(subUnitsTable.name);
      res.json(rows);
      return;
    }

    const rows = await db.select().from(subUnitsTable).orderBy(subUnitsTable.name);
    res.json(rows);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// POST /api/sub-units
router.post("/sub-units", requireAuth, async (req, res) => {
  try {
    const { unitId, name, city, description, active } = req.body;
    if (!unitId || !name) {
      res.status(400).json({ error: "Birim ve ad zorunludur" });
      return;
    }
    const parsedUnitId = parseInt(unitId);
    if (req.user!.role !== "admin" && req.user!.unitId !== parsedUnitId) {
      res.status(403).json({ error: "Yetki yok" });
      return;
    }
    const [row] = await db.insert(subUnitsTable).values({
      unitId: parsedUnitId,
      name,
      city: city || "Istanbul",
      description: description || null,
      active: active !== undefined ? Boolean(active) : true,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// GET /api/sub-units/:id
router.get("/sub-units/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const [row] = await db.select().from(subUnitsTable).where(eq(subUnitsTable.id, id));
    if (!row) { res.status(404).json({ error: "Alt birim bulunamadı" }); return; }
    if (req.user!.role !== "admin" && req.user!.unitId !== row.unitId) {
      res.status(403).json({ error: "Yetki yok" }); return;
    }
    res.json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// PATCH /api/sub-units/:id
router.patch("/sub-units/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const [existing] = await db.select().from(subUnitsTable).where(eq(subUnitsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Alt birim bulunamadı" }); return; }
    if (req.user!.role !== "admin" && req.user!.unitId !== existing.unitId) {
      res.status(403).json({ error: "Yetki yok" }); return;
    }
    const { name, city, description, active } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (city !== undefined) updates.city = city;
    if (description !== undefined) updates.description = description;
    if (active !== undefined) updates.active = Boolean(active);
    const [row] = await db.update(subUnitsTable).set(updates).where(eq(subUnitsTable.id, id)).returning();
    res.json(row);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// DELETE /api/sub-units/:id
router.delete("/sub-units/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const [existing] = await db.select().from(subUnitsTable).where(eq(subUnitsTable.id, id));
    if (!existing) { res.status(404).send(); return; }
    if (req.user!.role !== "admin" && req.user!.unitId !== existing.unitId) {
      res.status(403).json({ error: "Yetki yok" }); return;
    }
    await db.delete(subUnitsTable).where(eq(subUnitsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
