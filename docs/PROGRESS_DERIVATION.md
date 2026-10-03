# Decision: progress is derived, not typed (Phase 3.5)

Date: 2026-10-04. Owner brief: project and phase progress must come from schedule tasks and measured
quantities, not from a free-typed percentage. The closeout plan's Phase 3 section does not give an exact
formula or weights, so per the owner's instruction the simplest defensible rule was chosen and is
recorded here.

## The rule (services/progressEngine.js — the only place it is computed)

1. **Quantity-weighted by BOQ value where quantities exist.** Reuses
   `quantityEngine.projectProgress(project, 'boq_value')`: every BOQ item contributes
   `min(100, approved_or_certified_measured / planned_quantity × 100)` — measured quantities in
   `approved` or `certified` review states (pending measurements do not count) — weighted by
   `planned_quantity × unit_rate` (BOQ value). When the total weight is greater than zero, this figure is
   the project progress.
2. **Otherwise duration-weighted from schedule tasks.** Where a project has no BOQ value weights, the
   figure is `Σ(original_duration × percent_complete) / Σ(original_duration)` over the project's (or the
   phase's) schedule activities. Milestones (`is_milestone`, zero duration) carry no weight and drop out
   by construction. The `percent_complete` of each activity is itself quantity-derived where the
   activity is `progress_source = 'quantity'` (scheduleEngine), and manual only where it says so.
3. **No source at all → nothing is written.** The stored `projects.completion_percentage` (and
   `project_phases.completion_percentage`) keep their old value so existing data stays readable. `sync`
   writes only a derived figure.

## Stored columns, overrides and audit

- The stored columns remain the read surface (project page, dashboards): they are rewritten at recompute
  points — a measurement insert or review (quantities routes), a schedule activity change — so the value
  read is the derived one without extra queries.
- **Manual overrides are blocked** unless the caller holds the explicit
  `('projects','override_progress')` permission (seeded by migration 0021; legacy blanket roles are
  unaffected, least-privilege roles do not get it by default). Overrides are audited to `activity_log`
  with action `override_progress` (before → after).
- Overrun quantities are capped at 100%; they never drag the figure past completion.

## Notes and limits

- `schedule_activities` has no `deleted_at` today (activities are hard-deleted); the duration-weighted
  walk excludes `deleted_at IS NOT NULL` rows anyway so soft delete can land later without touching the
  formula.
- The single tax amount of a mixed stocked/service supplier invoice cannot be split honestly across the
  two portions (see costAccrual.js) — that is a cost-accrual note, recorded in the Phase 3.1 PR.
- Site daily reports do not yet create measurements automatically (plan item 3.4 "daily-report
  measurements push to measurements" is a later slice); the derivation consumes measurements from any
  source, so that integration needs no change here.
