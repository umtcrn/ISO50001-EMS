---
name: Drizzle Migration When Ordering
description: Drizzle's migrate() applies migrations only if folderMillis > max(created_at) in __drizzle_migrations; when values must be monotonically increasing.
---

## Rule

Drizzle's `migrate()` (node-postgres) applies a migration **only if** `migration.folderMillis > lastDbMigration.created_at`. The `folderMillis` is the `when` field in `meta/_journal.json`. The `created_at` stored in `__drizzle_migrations` equals the `when` value at apply time.

**Why:** When manually adding migrations to the journal with a small `when` timestamp (e.g., 1750000000000 ~2025) but older migrations have large timestamps (e.g., 1782000000000 ~2026), the new migration's `folderMillis < max(created_at)` so drizzle silently skips it — logs "Migrations complete" but never applies it.

**How to apply:**
- Always use a `when` value **strictly greater than** the largest existing `when` in the journal.
- Check the last `when` in `_journal.json` and add at least 1 to it.
- If a migration is stuck (not applying despite correct SQL), check if its `when` < max `created_at` in `__drizzle_migrations`. Fix by bumping the `when` in the journal.
- If the table doesn't exist yet and drizzle skips the migration, create it manually via `psql` then let the (now no-op) migration complete and register its hash.
- Do NOT change `when` values of already-applied migrations (those with `created_at` in DB) — it causes drizzle to try to re-apply them.
