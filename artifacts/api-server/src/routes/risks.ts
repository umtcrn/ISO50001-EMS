import { Router } from "express";
import { db, risksTable, riskNotesTable } from "@workspace/db";
import { eq, and, inArray, SQL } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";

const router = Router();

// ── GET /risks ─────────────────────────────────────────────
router.get("/risks", requireAuth, async (req, res) => {
  try {
    const { role, companyId: sessionCompanyId, unitId: sessionUnitId } = req.user!;
    const conditions: SQL[] = [];

    if (role !== "admin" && role !== "superadmin" && sessionUnitId !== null) {
      conditions.push(eq(risksTable.unitId, sessionUnitId));
    } else if (role === "admin") {
      conditions.push(eq(risksTable.companyId, sessionCompanyId));
      const unitId = req.query.unitId ? parseInt(req.query.unitId as string) : undefined;
      if (unitId !== undefined) conditions.push(eq(risksTable.unitId, unitId));
    } else {
      const unitId = req.query.unitId ? parseInt(req.query.unitId as string) : undefined;
      if (unitId !== undefined) conditions.push(eq(risksTable.unitId, unitId));
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      if (companyId !== undefined) conditions.push(eq(risksTable.companyId, companyId));
    }

    const items = conditions.length > 0
      ? await db.select().from(risksTable).where(conditions.length === 1 ? conditions[0] : and(...conditions)).orderBy(risksTable.createdAt)
      : await db.select().from(risksTable).orderBy(risksTable.createdAt);

    const riskIds = items.map(i => i.id);
    const notes = riskIds.length > 0
      ? await db.select().from(riskNotesTable).where(inArray(riskNotesTable.riskId, riskIds)).orderBy(riskNotesTable.createdAt)
      : [];

    const notesMap = new Map<number, typeof notes>();
    for (const n of notes) {
      if (!notesMap.has(n.riskId)) notesMap.set(n.riskId, []);
      notesMap.get(n.riskId)!.push(n);
    }

    res.json(items.map(i => ({
      id: i.id, unitId: i.unitId, type: i.type, title: i.title, description: i.description,
      foreseenImpact: i.foreseenImpact,
      probability: i.probability, severity: i.severity, score: i.score,
      responseType: i.responseType,
      mitigationPlan: i.mitigationPlan,
      targetProbability: i.targetProbability,
      targetSeverity: i.targetSeverity,
      targetScore: i.targetScore,
      owner: i.owner, status: i.status, createdAt: i.createdAt,
      notes: (notesMap.get(i.id) ?? []).map(n => ({
        id: n.id, riskId: n.riskId, userId: n.userId, userName: n.userName,
        content: n.content, createdAt: n.createdAt,
      })),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ── POST /risks ────────────────────────────────────────────
router.post("/risks", requireAuth, async (req, res) => {
  try {
    const { role, companyId: sessionCompanyId, unitId: sessionUnitId } = req.user!;
    const {
      type, title, description, foreseenImpact,
      probability, severity, responseType, mitigationPlan,
      targetProbability, targetSeverity,
      owner, status, unitId,
    } = req.body;
    if (!title || !probability || !severity) {
      res.status(400).json({ error: "Zorunlu alanlar eksik" }); return;
    }
    if (responseType === "aksiyon" && !mitigationPlan) {
      res.status(400).json({ error: "Aksiyon seçildiğinde eylem planı zorunludur" }); return;
    }
    const prob = parseInt(probability);
    const sev = parseInt(severity);
    const resolvedUnitId = role !== "admin" && role !== "superadmin" && sessionUnitId !== null
      ? sessionUnitId
      : (unitId ? parseInt(unitId) : null);

    const tProb = targetProbability ? parseInt(targetProbability) : null;
    const tSev = targetSeverity ? parseInt(targetSeverity) : null;

    const [item] = await db.insert(risksTable).values({
      type: type || "risk", title,
      description: description || null,
      foreseenImpact: foreseenImpact || null,
      probability: prob, severity: sev, score: prob * sev,
      responseType: responseType || "izleme",
      mitigationPlan: mitigationPlan || null,
      targetProbability: tProb,
      targetSeverity: tSev,
      targetScore: (tProb && tSev) ? tProb * tSev : null,
      owner: owner || null,
      status: status || "acik",
      unitId: resolvedUnitId,
      companyId: sessionCompanyId,
    }).returning();
    res.status(201).json({ ...item, notes: [] });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ── PATCH /risks/:id ───────────────────────────────────────
router.patch("/risks/:id", requireAuth, async (req, res) => {
  try {
    const { role, companyId: sessionCompanyId, unitId: sessionUnitId } = req.user!;
    const id = parseInt(req.params.id as string);
    const [existing] = await db.select().from(risksTable).where(eq(risksTable.id, id));
    if (!existing) { res.status(404).json({ error: "Bulunamadı" }); return; }
    if (role !== "admin" && role !== "superadmin" && sessionUnitId !== null && existing.unitId !== sessionUnitId) {
      res.status(403).json({ error: "Yetki yok" }); return;
    }
    if (role === "admin" && existing.companyId !== sessionCompanyId) {
      res.status(403).json({ error: "Bu kaydı düzenleme yetkiniz yok" }); return;
    }
    const {
      type, title, description, foreseenImpact,
      probability, severity, responseType, mitigationPlan,
      targetProbability, targetSeverity,
      owner, status, unitId,
    } = req.body;

    const resolvedResponseType = responseType ?? existing.responseType;
    if (resolvedResponseType === "aksiyon") {
      const resolvedPlan = mitigationPlan ?? existing.mitigationPlan;
      if (!resolvedPlan) {
        res.status(400).json({ error: "Aksiyon seçildiğinde eylem planı zorunludur" }); return;
      }
    }

    const updates: Record<string, unknown> = {};
    if (type !== undefined) updates.type = type;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (foreseenImpact !== undefined) updates.foreseenImpact = foreseenImpact;
    if (probability !== undefined) updates.probability = parseInt(probability);
    if (severity !== undefined) updates.severity = parseInt(severity);
    if (probability !== undefined && severity !== undefined) updates.score = parseInt(probability) * parseInt(severity);
    if (responseType !== undefined) updates.responseType = responseType;
    if (mitigationPlan !== undefined) updates.mitigationPlan = mitigationPlan;
    if (targetProbability !== undefined) updates.targetProbability = targetProbability ? parseInt(targetProbability) : null;
    if (targetSeverity !== undefined) updates.targetSeverity = targetSeverity ? parseInt(targetSeverity) : null;
    if (targetProbability !== undefined && targetSeverity !== undefined) {
      const tP = targetProbability ? parseInt(targetProbability) : null;
      const tS = targetSeverity ? parseInt(targetSeverity) : null;
      updates.targetScore = (tP && tS) ? tP * tS : null;
    }
    if (owner !== undefined) updates.owner = owner;
    if (status !== undefined) updates.status = status;
    if ((role === "admin" || role === "superadmin") && unitId !== undefined) {
      updates.unitId = unitId ? parseInt(unitId) : null;
    }
    const [item] = await db.update(risksTable).set(updates).where(eq(risksTable.id, id)).returning();
    const noteRows = await db.select().from(riskNotesTable).where(eq(riskNotesTable.riskId, id)).orderBy(riskNotesTable.createdAt);
    res.json({
      ...item,
      notes: noteRows.map(n => ({ id: n.id, riskId: n.riskId, userId: n.userId, userName: n.userName, content: n.content, createdAt: n.createdAt })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ── DELETE /risks/:id ──────────────────────────────────────
router.delete("/risks/:id", requireAuth, async (req, res) => {
  try {
    const { role, companyId: sessionCompanyId, unitId: sessionUnitId } = req.user!;
    const id = parseInt(req.params.id as string);
    const [existing] = await db.select().from(risksTable).where(eq(risksTable.id, id));
    if (!existing) { res.status(404).send(); return; }
    if (role !== "admin" && role !== "superadmin" && sessionUnitId !== null && existing.unitId !== sessionUnitId) {
      res.status(403).json({ error: "Yetki yok" }); return;
    }
    if (role === "admin" && existing.companyId !== sessionCompanyId) {
      res.status(403).json({ error: "Bu kaydı silme yetkiniz yok" }); return;
    }
    await db.delete(risksTable).where(eq(risksTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ── POST /risks/:id/notes ──────────────────────────────────
router.post("/risks/:id/notes", requireAuth, async (req, res) => {
  try {
    const { role, companyId: sessionCompanyId, unitId: sessionUnitId, userId, name } = req.user!;
    const riskId = parseInt(req.params.id as string);
    const { content } = req.body;
    if (!content?.trim()) {
      res.status(400).json({ error: "Açıklama içeriği boş olamaz" }); return;
    }
    const [existing] = await db.select().from(risksTable).where(eq(risksTable.id, riskId));
    if (!existing) { res.status(404).json({ error: "Risk bulunamadı" }); return; }
    if (role !== "admin" && role !== "superadmin" && sessionUnitId !== null && existing.unitId !== sessionUnitId) {
      res.status(403).json({ error: "Yetki yok" }); return;
    }
    const [note] = await db.insert(riskNotesTable).values({
      riskId, companyId: sessionCompanyId,
      userId, userName: name,
      content: content.trim(),
    }).returning();
    res.status(201).json({ id: note.id, riskId: note.riskId, userId: note.userId, userName: note.userName, content: note.content, createdAt: note.createdAt });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ── PATCH /risks/:id/notes/:noteId ────────────────────────
router.patch("/risks/:id/notes/:noteId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId: sessionCompanyId } = req.user!;
    const noteId = parseInt(req.params.noteId as string);
    const { content } = req.body;
    if (!content?.trim()) {
      res.status(400).json({ error: "Açıklama içeriği boş olamaz" }); return;
    }
    const [existing] = await db.select().from(riskNotesTable).where(eq(riskNotesTable.id, noteId));
    if (!existing) { res.status(404).json({ error: "Not bulunamadı" }); return; }
    if (existing.companyId !== sessionCompanyId) {
      res.status(403).json({ error: "Yetki yok" }); return;
    }
    const [note] = await db.update(riskNotesTable).set({ content: content.trim() }).where(eq(riskNotesTable.id, noteId)).returning();
    res.json({ id: note.id, riskId: note.riskId, userId: note.userId, userName: note.userName, content: note.content, createdAt: note.createdAt });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ── DELETE /risks/:id/notes/:noteId ───────────────────────
router.delete("/risks/:id/notes/:noteId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId: sessionCompanyId } = req.user!;
    const noteId = parseInt(req.params.noteId as string);
    const [existing] = await db.select().from(riskNotesTable).where(eq(riskNotesTable.id, noteId));
    if (!existing) { res.status(404).send(); return; }
    if (existing.companyId !== sessionCompanyId) {
      res.status(403).json({ error: "Yetki yok" }); return;
    }
    await db.delete(riskNotesTable).where(eq(riskNotesTable.id, noteId));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
