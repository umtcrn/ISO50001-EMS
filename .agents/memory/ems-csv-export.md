---
name: EMS CSV Export pattern
description: Reusable CSV export helper and security rules for export endpoints
---

## CSV Helper
`artifacts/api-server/src/lib/csv-export.ts` — reusable module:
- `buildCsv(headers, rows)` — UTF-8 BOM + `;` delimiter + double-quote escape
- `sendCsvResponse(res, filename, csv)` — sets Content-Type/Disposition headers
- Enum translation maps: TARGET_STATUS_LABELS, ACTION_STATUS_LABELS, PRIORITY_LABELS, VAP_STATUS_LABELS, etc.

## Export Endpoints
- `GET /api/targets/export` — targets + action plans left join; one row per action (target with no actions → one row with empty action cols)
- `GET /api/vap-projects/export` — only `is_vap=true` action plans

## Auth Rule (Critical)
Non-admin users with `sessionUnitId === null` must get **403**, not company-wide data.
Pattern:
```typescript
if (role !== "admin" && role !== "superadmin" && sessionUnitId === null) {
  res.status(403).json({ error: "Export için birim yetkisi gerekli" });
  return;
}
```

**Why:** A non-admin with null unitId was falling through to company-wide export — cross-unit data leak.

## Frontend Download Pattern
Orval-generated hooks don't support file downloads. Use direct fetch + blob:
```typescript
const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const blob = await res.blob();
const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
```
