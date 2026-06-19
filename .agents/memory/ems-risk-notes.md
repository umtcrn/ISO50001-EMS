---
name: EMS Risk Notes feature
description: riskNotesTable stores timestamped, user-attributed notes per risk. Notes are embedded in GET /risks response. Admin-only PATCH/DELETE on individual notes.
---

## Schema
`riskNotesTable` in `lib/db/src/schema/energy.ts` — columns: id, riskId (FK → risksTable, onDelete cascade), companyId, userId, userName, content, createdAt. Defined AFTER risksTable (FK order constraint).

## API
- `GET /risks` → returns each risk with embedded `notes[]` array (joined from riskNotesTable)
- `POST /risks/:id/notes` → any authenticated user can add a note; uses `req.user.name` and `req.user.userId`
- `PATCH /risks/:id/notes/:noteId` → admin/superadmin only (requireAdmin middleware)
- `DELETE /risks/:id/notes/:noteId` → admin/superadmin only (requireAdmin middleware)

## Frontend pattern
Notes are fetched as part of the risk list (no separate query needed). Add/edit/delete uses raw `fetch()` with `Authorization: Bearer ${token}` (from `useAuth().token`). After mutation, call `qc.invalidateQueries({ queryKey: getListRisksQueryKey(...) })` to refresh.

## DB fields removed
`occurrenceNote` column was removed from `risksTable` — replaced entirely by the `riskNotesTable`.

## Auth context shape
`useAuth()` returns `{ user, token, ... }`. Role is at `user?.role`. UnitContext exposes `unitId` (not `activeUnitId`).

## MatrixGrade fields
`MatrixGrade` (from `matrixConfig.ts`) has `cellStyle` (for matrix cell background) and `badgeStyle` (for badge/span styling) — NOT `color`.
