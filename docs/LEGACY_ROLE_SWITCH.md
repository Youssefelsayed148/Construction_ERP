# Legacy role switch: dry-run report (Phase 5.1b)

Status: **report only. No user, seat or grant has been changed.** The switch itself is a separate,
clearly labelled migration PR that is built and merged only after you have reviewed this report on a
restored copy of the real database.

## What it is

The 11 legacy role keys hold a blanket `('*','*')` grant. 5.1 seeded the 24 + 9 canonical roles with real
per-module grants and a compatibility table, `user_legacy_role_aliases`, that says which canonical role each
legacy key would become. Switching a user means moving their role seats (`user_project_roles.role_id`) to the
mapped role, which swaps the blanket for the canonical role's real grants.

`backend/src/services/legacyRoleDryRun.js` computes, for every legacy seat, the old role, the new role and the
exact `(module, action)` pairs the user would gain and lose. It expands wildcards against the permission
catalog, so a blanket grant counts as every catalog pair. It only runs SELECTs (the test runs it inside a
`READ ONLY` transaction).

## Run it (restored copy only)

```
cd backend
npm run report:legacy-roles                      # tables on the console
node src/scripts/legacy-role-dry-run.js --csv seats.csv --json report.json
```

CSV columns: `seat_id, user_id, name, email, is_active, users_role, project_id, old_role, new_role,
had_blanket_grant, permissions_before, permissions_after, gained_count, lost_count, lost`.

## Role-level result (seeded catalog: 137 permission pairs)

| Legacy role | Provisional canonical role | Before | After | Lost | Gained |
|---|---|---|---|---|---|
| owner | owner_ceo | 137 | 66 | 71 | 0 |
| admin | coo | 137 | 66 | 71 | 0 |
| manager | construction_manager | 137 | 32 | 105 | 0 |
| staff | site_engineer | 137 | 30 | 107 | 0 |
| engineer | site_engineer | 137 | 30 | 107 | 0 |
| site_supervisor | site_manager | 137 | 28 | 109 | 0 |
| accountant | accountant_ap | 137 | 21 | 116 | 0 |
| purchasing_mgr | procurement_manager | 137 | 23 | 114 | 0 |
| legal_mgr | contracts_manager | 137 | 21 | 116 | 0 |
| maintenance_mgr | equipment_manager | 137 | 19 | 118 | 0 |
| finance_manager | finance_manager (identity) | 137 | 137 | 0 | 0 |

Nothing is gained anywhere: a blanket role already has everything. The report shows, per module, what a
mapping would take away (`mappings[].lost_by_module` in the JSON), for example `owner -> owner_ceo` loses
`actions 1, assets 2, boq 2, commercial 4, consultant 6, docs 4, finance-ledger 2, invoices 4, payments 3,
payroll 2, qhse 4, team 1, ...` (full list in the JSON).

## What to review before any user moves

1. **owner and admin.** Both would lose 71 of 137 permissions. Decide whether they keep the blanket
   (recommended: owner and admin stay blanket by design, only the other nine roles move) or move to
   `owner_ceo` / `coo`.
2. **finance_manager is both a legacy key and a canonical key.** The identity mapping changes nothing:
   the canonical `finance_manager` role still carries the blanket today. Replacing it with real grants is a
   separate step of the same switch; say whether you want it in the first migration.
3. **The provisional map** (`user_legacy_role_aliases`): `staff` and `engineer` both map to `site_engineer`,
   `accountant` to `accountant_ap`, `legal_mgr` to `contracts_manager`, `manager` to `construction_manager`.
   These were picked, not confirmed. Correct any row with an UPDATE before the switch is built.
4. **users.role is a different thing.** The coarse role lists in the routes (`authorize('owner','admin',...)`)
   read `users.role`, not the seat. The switch moves seats; whether `users.role` changes too is part of the
   same decision, and every route list naming a legacy key would have to be re-checked if it does.
5. Seats keep their `expires_at`, project-bound seats stay project-bound, inactive users are listed
   (`is_active`) so they can be skipped.

## What the switch PR will contain (not built yet)

- a preflight that stops if any seat maps to a role that does not exist, or if an active user would be left
  with no seat;
- the seat update in one transaction, recorded in `schema_migrations`, with the old `role_id` kept in an
  audit table so it can be reversed;
- before/after counts by role, asserted in a test, and the blanket removed only from the roles you approved.
