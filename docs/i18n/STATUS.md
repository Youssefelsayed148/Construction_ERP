# Phase 10 localization status

Updated: 2026-10-14 (Africa/Cairo). Authority: `docs/ERP_CLOSEOUT_PLAN.md` Phase 10 and the corrections in `docs/system_language_fix.md`.

This status is based on commands run in this continuation and checked source. It supersedes older Phase 10 summaries in `STATE.md`, `CLOSEOUT_PROGRESS.md`, and `CLOSEOUT_LOG.md` where counts differ. Phase 10 is **not complete**.

## L0-L11 exit criteria

| Sub-phase | Status | Current evidence | Remaining exit work |
|---|---|---|---|
| L0 Contract and baseline | **Partial** | Locale/content policy, glossary, route checklist, paired screenshot set, and refreshed [`baseline/inventory.json`](baseline/inventory.json). `npm run i18n:inventory` reports 1,127 inline branches, 59 hard-coded English matches, 2 raw-enum matches, 6 fixed-format matches, 68 prompts, 304 English literal server messages, and 479 exception-message responses. | Complete route-by-route current-state review and reconcile heuristic counts with explicit allow-lists and machine-readable missing-key inventory. |
| L1 Locale architecture | **Verified** | `LocaleContext.test.js` and Playwright locale tests pass in the current 31-suite frontend gate and 74-pass browser run. The E2E tests cover a mounted toggle, `lang`/`dir`, persistence across navigation/refresh, and logout/login. | No L1 exit item is known to remain open; role-specific UAT is tracked under L11. |
| L2 Catalog | **Verified** | `npm run i18n:parity`: 35 namespaces / 1,283 English keys; inventory reports no empty namespaces or literal missing EN keys; `npm run i18n:check` passes. | Replace baseline-ceiling check with hard gates for all L10 categories. |
| L3 Application shell | **Partial** | Existing shell and locale Playwright tests passed; `docs/i18n/baseline/screenshots/` has EN/AR principal-route captures. | Audit every shell label, notification/action title, accessible name, and system-generated value; complete role matrix and Arabic visible-text sweep. |
| L4 Expansion screens | **Partial** | Project Operations and Procurement Comparison have localized catalogs and focused coverage. PortalDashboard has partial catalog labels, enum/boolean/date/amount helpers, empty/setup keys, and record identifiers. | Portal forms/remaining dynamic fields and full four-portal Arabic review remain open. |
| L5 Partially localized modules and core pages | **Not done** | Inline-branch scan remains 1,127 across the frontend; hard-coded English heuristic remains 59; 2 raw-enum and 6 fixed-format matches remain. | Migrate the listed QA/QC, HSE, document control, schedule, reports, handover, agents, dashboard, and core screens; finish labels, statuses, inputs, errors, RTL, and route tests. |
| L6 Dynamic values and formatters | **Partial** | Shared enum/name/date/number/currency helpers exist and have unit tests. The current inventory still finds 2 raw-enum and 6 fixed-format expressions. | Migrate every caller, audit API values and all record names, and reach the planned zero counts except justified entries in an explicit allow-list. |
| L7 API errors and server content | **Not done** | Current inventory scan reports 479 `error: e.message` / exception-message response matches and 304 English literal error-message matches in backend route files. Some endpoints already use typed codes; this is not system-wide. | Add the compatibility contract and catalog coverage, migrate remaining errors, add request-locale propagation, bilingual seeded content/roles, and choose/implement localized native date/number inputs. |
| L8 Reports, CSV and PDF | **Partial** | [`PDF_SPIKE.md`](PDF_SPIKE.md) records the Chromium decision. Three representative samples were generated in EN/AR and PNGs rasterized from the PDFs; Arabic shapes and RTL layout were visually inspected. IBM Plex packages are installed and frontend offline font loading passed. | Migrate all PDF call sites to a production shared backend renderer, package Chromium/fonts in the backend image, pass locale through exports, localize CSV headers/rows with BOM, and add production-export text/visual assertions. |
| L9 RTL and accessibility | **Not done** | Existing route screenshots and a mocked mobile overflow sweep are available from earlier closeout work. | Systematic physical-to-logical CSS audit, mixed-direction isolation, accessibility labels/focus review, axe scans in both locales, contrast and major-route review remain open. |
| L10 Automated coverage | **Partial** | Current frontend: 31 suites / 128 tests; Playwright: 74 passed / 86 skipped (160 discovered); `i18n:check`, parity and production build pass. The new offline-font browser test passes. Backend mock: 54 suites / 1,013 tests. Fresh real PG: 68 suites / 635 tests after 126 migrations. | Replace ceiling-only scan with hard gates, add API error-code EN/AR coverage, route-visible Latin-string sweep/RTL snapshots, axe, and PDF/CSV integration tests. The real-backend Playwright journeys remain among skipped tests. |
| L11 Review and handoff | **Partial** | [`ARABIC_REVIEW_PACK.md`](../ARABIC_REVIEW_PACK.md) has the paired catalog inventory; this continuation adds sample export evidence. | Native Egyptian construction-domain terminology review and role-based Arabic UAT are human tasks and remain pending. Do not mark Arabic sign-off complete. |

## Current measured inventory

The committed inventory snapshot was stale when work began. Refreshing it from current source changed the snapshot values as follows; these differences reflect code already present before this continuation, not screen/error migrations performed here.

| Heuristic | Previous snapshot | Current source | Current command |
|---|---:|---:|---|
| Inline locale branches | 1,167 | 1,127 | `npm run i18n:inventory` |
| Hard-coded English | 102 | 59 | `npm run i18n:inventory` |
| Raw enum rendering | 5 | 2 | `npm run i18n:inventory` |
| Fixed-locale formatting | 8 | 6 | `npm run i18n:inventory` |
| prompt/confirm/alert calls | 140 | 68 | `npm run i18n:inventory` |
| Exception-message responses | prior inventory did not provide a reliable baseline | 479 | `npm run i18n:inventory` |

These are regex heuristics, not proof of user-visible text. Backend route inventory also finds 304 literal English server-message matches. No route error migration was performed in this continuation, so the measured exception-message total remains 479.

## Verification run in this continuation

| Command / activity | Result |
|---|---|
| Frontend `npm run test:ci -- --silent` | PASS, 31 suites / 128 tests |
| Frontend `npm run i18n:check` | PASS, `i18n:check ok` |
| Frontend `npm run i18n:parity` | PASS, 35 namespaces / 1,283 English keys |
| Frontend `npm run build` | PASS, `Compiled successfully` |
| Backend `npm test -- --runInBand --silent` | PASS, 54 suites / 1,013 tests |
| Fresh disposable PostgreSQL 16, migration runner | PASS, 126 applied / 0 already applied |
| `TEST_PG=1 npm run test:pg -- --silent` | PASS, 68 suites / 635 tests |
| Full frontend Playwright | PASS, 74 passed / 86 skipped (160 discovered) |
| Focused local-font Playwright | PASS, 1/1; font requests were same-origin with all external requests blocked |
| `npm run i18n:pdf-spike` | PASS; six EN/AR PDFKit/Chromium pairs generated and rasterized; Arabic sample terms extracted and visually reviewed |

The disposable PostgreSQL container was loopback-only and removed after the run. Generated credentials were held in the PowerShell process. No `.env.docker` or `.staging-users.json` was read. The full E2E skips include seeded real-backend journeys. No remote CI job was run.

## Stop state and next work

The L8 spike and frontend font slice are reviewable; they do not close Phase 10. Next implement the selected Chromium renderer in the backend with runtime-packaged Chromium and IBM Plex assets, then migrate all exporters before doing the remaining CSV, L7, L4-L6, L9-L10, and L11 work. Arabic terminology review and role UAT require the owner/reviewer after technical evidence is complete.
