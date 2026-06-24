---
name: EMS SEU Assessment Module
description: ÖEK/SEU analysis module — DB tables, API routes, role-based save logic, and tabbed frontend components.
---

## Tables (migration 0008, when=1782500000000)
- `seu_assessments`: header (unitId, year, period, analysisLevel, methodType, recordType, isOfficial, unitTotalTep)
- `seu_assessment_items`: line items (energyTep, consumptionSharePercent, hasOpportunity, priorityResult, systemRecommendation, userDecision, decisionReason, responsible, targetReductionPercent, notes)

## API Routes (`artifacts/api-server/src/routes/seu-assessment.ts`)
- `GET /seu/analyze` — Groups consumption by analysisLevel (energyUseGroup|meter|subUnit|energySource|unit), computes share%, applies priority matrix, returns items + unitTotalTep
- `GET/POST /seu/assessments` — List + create; POST deduplicates unit_official records (delete + recreate) but blocks admin from overwriting unit_official
- `GET /seu/assessments/:id` — Returns assessment with all items
- `PATCH /seu/assessments/:id/items/:itemId` — Updates item decisions; recalculates priority if hasOpportunity changes
- `DELETE /seu/assessments/:id` — Admin cannot delete unit_official records

## Priority Matrix (computePriority)
- share ≥ 20 + opp → 1; ≥ 20 no opp → 2
- share 10–20 + opp → 2; no opp → 3
- share 5–10 + opp → 3; no opp → 4
- share < 5 + opp → 4; no opp → null (not_seu)

## Role-based save
- Normal user: recordType=unit_official, isOfficial=true; can replace own record
- Admin: recordType=admin_review, isOfficial=false; cannot overwrite unit_official

## Frontend (`artifacts/ems-dashboard/src/components/seu/`)
- `SeuAnalysisTab.tsx` — Filters + "Analizi Çalıştır" → table with inline hasOpportunity toggle + ItemEditDialog → "Analizi Kaydet"
- `SeuAssessmentList.tsx` — Lists saved assessments; delete allowed per role rules
- `SeuMethodTab.tsx` — Static method documentation
- `SeuAdminTabs.tsx` — Admin: Birim ÖEK Kayıtları | Admin Kontrol Analizi | Tüm Birimler Özeti | Metot

**Why:** decisionReason validation: if userDecision !== impliedDecision(systemRecommendation), reason is required.
