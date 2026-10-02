# Planning Calculations — Phase 22

Scope: the scheduling module (`/api/schedule`) — activities, dependencies
(FS/SS/FF/SF + lag), calendars, baselines, the critical-path calculation,
progress/KPIs, S-curve, lookaheads, import/export and alerts.

Explicitly NOT a full enterprise CPM engine in this iteration (per the build
prompt) — a working critical-path calc over the activity/dependency graph is
the delivered scope.

## Critical Path Method (working CPM)

- **Forward pass** — day-based, over the relationship graph:
  - `FS`: ES(successor) ≥ ES(predecessor) + duration(pred) + lag
  - `SS`: ES(successor) ≥ ES(pred) + lag
  - `FF`: ES(successor) ≥ EF(pred) + lag − duration(successor)
  - `SF`: ES(successor) ≥ ES(pred) + lag − duration(successor)
  - Milestones have zero duration; project finish = max EF.
- **Backward pass** — LF/LS from the project finish, mirrored per
  relationship type.
- **Total float** = LS − ES (in days); **critical = total float ≤ 0**.
- Cycles do not crash the engine — the bounded iteration converges with the
  best achievable relaxation; cycle members simply stay constrained.
- Durations are calendar-day based in this iteration (working-day calendar
  refinement is a later pass; calendars are stored and displayed).

## Progress

- `percent_complete` — manual (permission-gated) or derived:
  - **Quantity-driven**: `% = approved physical quantity ÷ planned quantity × 100`
    (approved = `quantity_measurements.approval_state = 'approved'`; planned
    quantity from the activity, else the `boq_location_allocations.planned_quantity`
    for the allocated location). Clamped to 0–100.
- Progress updates stamp `actual_start` (first progress > 0) and
  `actual_finish` (progress ≥ 100), set the status, and fire the Phase 9
  demand hook (`schedule.activity.changed` — the dispatcher route landed in
  Phase 9, so the recomputation path exists with zero dispatcher changes).

## KPIs

- **Schedule Variance %** = Actual Progress % − Planned Progress % (per
  activity and project-aggregated). Planned progress is time-phased from the
  planned start/finish against the data date.
- **SPI = EV / PV** — only where the project has explicitly enabled
  earned-value management (`projects.earned_value_enabled`); activities are
  quantity-weighted (`planned_quantity`, default weight 1). Returns null
  otherwise — EV bookkeeping is never forced on every project.
- **CPI = EV / AC** — same opt-in; needs actual cost per activity.

## S-curve

Cumulative planned vs actual (quantity-weighted) over the planned window in
20 steps; actual points exist only up to the data date. Empty schedule →
empty curve.

## Views

- Gantt (bars positioned across the min/max window; critical in red,
  milestones flagged)
- 2/4/6-week lookahead (activities starting inside the window)
- delayed activities (planned finish in the past, not complete)
- critical activities (CPM float ≤ 0)
- location-based schedule (`?location_id=`), subcontractor schedule
  (`?subcontractor_organization_id=`)
- milestones integrated with the schedule (`project_milestones.
  schedule_activity_id`; milestone progress shown from its activity)

## Alerts (cross-module)

1. Activity starting within 2 weeks but Phase 9 material requirements still
   open (material not ready).
2. Inspection blocking an activity (open WIR on the activity's BOQ item);
   RFI blocking (open RFI on the activity's discipline).
3. Critical activity delayed (actual < planned progress on a float-0
   activity).
4. Milestone forecast late (target date past, not achieved).

## Import / export

- `GET /api/schedule/activities/export?project_id=` → CSV (activities
  section + relationships section keyed by activity code).
- `POST /api/schedule/activities/import` → creates/updates activities by
  code and creates relationships; `replace: true` clears the plan first.
  Import is role-gated (PM/planning).

## Zero-record contract

A project with no activities returns an empty Gantt, empty CPM, empty
lookahead, zeroed KPIs and an empty S-curve — never an error. Tested
explicitly.
