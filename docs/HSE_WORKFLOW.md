# HSE Workflow Standard — Phase 20

Scope: the health, safety and environment module (`/api/hse`) built beside the
Phase 19 QA/QC surface. The legacy `safety_incidents` / `safety_inspections`
tables are converted to typed tables with the old names kept as compatibility
views (auto-updatable, so every existing reader/INSERT path keeps working
until each one has moved).

## Entities

| Entity | Table | Notes |
|---|---|---|
| Incidents | `incidents` | typed (`incident_category`: injury / environmental / property / vehicle / other), LTI flag + lost days, investigation + root cause; `safety_incidents` is a compatibility view |
| HSE inspections | `hse_inspections` | typed (`inspection_type`: site / equipment / housekeeping / ppe / permit_compliance / other), follow-up due; `safety_inspections` is a compatibility view |
| Permits to work | `permits` | typed: `work`, `hot_work`, `lifting`, `excavation`, `confined_space`; numbered `PTW/HW/LIF/EXC/CSE-YYYY-####` |
| JSA | `jsas` | hazards list with risk + control per line; draft → reviewed → approved / superseded |
| Risk assessment | `risk_assessments` | likelihood × severity → risk level (low/medium/high/critical), residual risk |
| Inductions | `inductions` | person, organization, type (site/general/visitor/refresher), valid-until |
| Toolbox talks | `toolbox_talks` | topic, attendees, notes, photos |
| Near misses | `near_misses` | numbered `NM-YYYY-####`, immediate action, open/closed |
| PPE | `ppe_records` | issuance register per person/item |
| Equipment inspections | `equipment_inspections` | pass/fail + defects + next due |
| Emergency drills | `emergency_drills` | type, participants, findings, improvements |

## Permit to work workflow (Phase 6 engine, `permit` template)

```
draft → HSE Review (role: engineer) → PM Approval → active
```

- **Draft/submit** — requester self-step (site/engineer roles; owner/admin
  bypass). Submission stamps the draft step done and opens the HSE review
  step with its action item.
- **HSE review** — role `engineer`. Approve advances to the PM stage; reject
  reopens the permit for correction (step stamped rejected in the audit log).
- **PM approval** — role `project_manager`. Approve activates the permit and
  stamps `approved_by` / `approved_at`; reject reopens for correction.
- **Lifecycle after approval** — active ⇄ suspended → closed (terminal, the
  workflow instance closes with it). Rejected permits reopen into
  `pending_approval`.

Sign-off-before-work types (`hot_work`, `confined_space`, `lifting`) cannot
be active without both workflow stages — the workflow instance is the
authoritative sign-off record.

**Expiry sweep** — `expireOverduePermits()` flips active/approved/suspended
permits past `valid_to` to `expired`. Runs hourly via the scheduler
(`initPermitExpiryScheduler`) and on demand.

## HSE dashboard (`GET /api/hse/dashboard?project_id=`)

- man-hours today (8h × present/late attendance rows for the day)
- days without LTI (today − last `is_lti` incident; null when none ever)
- open incidents, LTI count, open near misses
- permits: active, pending/active, expiring today, expired-but-active
- overdue corrective actions (Phase 19 CAPA)
- inspections count

Every widget renders with zero underlying records — never an error.

## HSE document set (branded PDFs)

Safety inspection · JSA · risk assessment · permit to work (with conditions
and precautions) · toolbox talk (attendee sheet, returned inline on create)
· incident report · near-miss report — all through the shared branded layout.

## Zero-record contract

Every HSE list endpoint returns an empty array for a project with no
records; the dashboard returns the zero state. Tested explicitly.
