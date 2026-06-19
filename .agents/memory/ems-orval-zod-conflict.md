---
name: EMS Orval Zod export conflict
description: Orval codegen creates duplicate exports when request body types appear in both api.ts (Zod schemas) and types/ directory — fix by only exporting from api.ts in api-zod index.
---

## Rule
`lib/api-zod/src/index.ts` must only contain `export * from "./generated/api"` — do NOT re-export from `"./generated/types"`.

## Why
Orval generates request body types (e.g. `AddRiskNoteBody`) both as Zod schema constants in `generated/api.ts` AND as TypeScript type aliases in `generated/types/<name>.ts`. When both are re-exported via `export *`, TypeScript raises TS2308 (ambiguous re-export). Even `export type *` doesn't resolve this because a `const` in the value space also occupies the type space.

## How to apply
After every `pnpm --filter @workspace/api-spec run codegen`, if TS2308 errors appear in api-zod, confirm `lib/api-zod/src/index.ts` has only the single-line export from `./generated/api`. Never add `export * from "./generated/types"` back.
