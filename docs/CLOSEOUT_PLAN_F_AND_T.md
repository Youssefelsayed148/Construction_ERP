# Closeout plan - Session F (fixes) and Session T (tests)

Written 2026-10-28. Supersedes the "next batches" section of `docs/CLOSEOUT_REMAINING_PLAN.md`. Batches 0-4 (environment, finance, security re-audit, test infra, first PG gate) are done on the cloud branch `claude/erp-closeout-batches-0-4-qvzg2x` and merged locally into `closeout/batch-a-to-6` (tip `c8242b5`); that merge must be pushed before a cloud session can see it. Verdict remains **NO-GO** until Batch 8 evidence exists.

## Two cloud sessions

| Session | Prompt | Owns | Full PG suite |
|---|---|---|---|
| F | `docs/prompts/REMOTE_SESSION_F_FIXES_PROMPT.md` | All product-code fixes (F1-F4) | NOT run; no suites at all, one focused file per slice |
| T | `docs/prompts/REMOTE_SESSION_T_TESTS_PROMPT.md` | All test authoring and verification (T1-T5) | Run ONCE, at the end |

Both sessions work on the SAME branch, `closeout/batch-a-to-6` (no new branches), strictly one after the other so there is never a concurrent writer: F first, then T.
Launch order: start F first. Start T when F has pushed (its `STATE.md` begins `F-SESSION COMPLETE`); T then merges F and runs the single full verification on the combined code. T can start earlier for authoring, but its final run would then exclude F's fixes and say so.
Test-run budget: fix batches run no suites; Session T runs the full PG suite, mock suite, lint/i18n and build exactly once, at the end; failures rerun by file only.

## Fix batches (Session F)
- F1 Hardening: denial-audit dedupe/rate cap; review of `fda42d4` procurement diff and loosened tests; type remaining business-rule throws (500 -> 4xx with codes); `documents.js` mutation audit coverage.
- F2 Error contract: convert the remaining 366 `error: e.message` route sites; lower the lint baseline; EN/AR keys; grouped contract tests.
- F3 Decisions applied: canonical external-role portal grants (migration `0072`, landing redirect, nav tests); minimal C-PROC-002 "rejected - supplier to collect" record; drop owner_ceo wait state from demo census; approval-limits decision sheet for the owner.
- F4 Localization/PDF: production Arabic PDF/CSV; shrink inline en/ar branches (53) and the Handover raw enum; regenerate the Arabic review pack (not a sign-off).

## Test batches (Session T)
- T1 Merge confirmation: single full PG + mock + lint/i18n/build run on the merged result.
- T2 Golden journey: tender-to-warranty PG test with GL/AR/AP/stock/retention/audit assertions vs `GOLDEN_VALUES.md` (provisional values marked).
- T3 Role-by-role lifecycle: permission/nav matrix for 26 canonical roles generated from seeded policy; maker-checker, approval limits, project scope, external cage; UI crawl scripts authored.
- T4 Pilot readiness: migration idempotency, backup/restore rehearsal, reconciliation, rollback runbook, smoke review.
- T5 UAT kit: per-role scripts, defect template, sign-off table (no sign-offs claimed).

## Decisions
| Decision | Status | Applied as |
|---|---|---|
| External-role portal access | Taken (recommended option) | Grant alias-family portal data access (F3) |
| C-PROC-002 rejected delivery | Taken | Minimal stock-neutral record, no return document (F3) |
| owner_ceo wait state | Taken | Drop from demo census |
| Production approval limits | OPEN - owner | Decision sheet produced; nothing seeded |
| Golden values / commercial assumptions | OPEN - owner/finance | T2 asserts provisional values and flags them |
| Merge to `main` | OPEN | Only after T1-T4 pass and UAT |

## After both sessions (human/operator work)
Review F and T branches and merge to `closeout/batch-a-to-6`; push and obtain a green remote CI run; native Egyptian Arabic review and visual/RTL review; fill the approval-limits sheet; approve golden values; stand up the pilot stack and run the UAT kit with real users per role; restore drill and rollback sign-off; audit-finding triage; update `docs/GO_NOGO.md`; GO/NO-GO decision; only then merge to `main` and deploy.
