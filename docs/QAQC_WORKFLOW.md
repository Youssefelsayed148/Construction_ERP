# QA/QC Workflow Standard — Phase 19

Scope: the quality control workflow over the existing QHSE base (`ncrs`,
`quality_tests`, `safety_inspections`). Nothing from the existing severity and
state progression was removed — only widened.

## Entities

| Entity | Table | Notes |
|---|---|---|
| ITP | `itps` | numbered `ITP-YYYY-####`, per project, discipline / work package / location |
| ITP point | `itp_points` | hold / witness / review, required documents, responsible party + user, consultant responsibility, acceptance criteria |
| WIR | `wirs` | numbered `WIR-YYYY-####`, links ITP/ITP point/BOQ item/location/subcontractor |
| MIR | `material_inspection_requests` (Phase 12) | widened with `project_id`, `material_submittal_id`, `grn_id`, `certificates`, `workflow_instance_id` — not duplicated |
| Checklists | `checklist_templates` / `checklist_instances` | template → instance per context (WIR/MIR/test/mock-up/general) |
| CAPA | `corrective_actions` / `preventive_actions` | open → in_progress → completed → verified, linked to any source |
| Mock-ups | `mock_ups` | proposed → under_review → approved / rejected / rework |
| Calibration | `calibration_records` | instrument, serial, dates, certificate ref, pass/fail |
| Punch items | `punch_items` | numbered `PCH-YYYY-####`; created in Phase 19, reused by Phase 25 handover |

## WIR workflow (Phase 6 engine, `wir` template)

States follow the catalog template exactly:

```
draft → QA/QC → PM (optional) → Consultant → final result
```

- **Draft/submit** — requester self-step (site/engineer roles; owner/admin
  bypass). Submission stamps the draft step done and opens the QA/QC step
  with its action item.
- **QA/QC stage** — role `engineer` (the template's resolver). Approve
  advances to PM; reject/return sends the WIR back to draft for correction
  (the step is stamped rejected in the audit trail).
- **PM stage** — role `project_manager`. Approve advances to Consultant;
  reject/return goes back to QA/QC.
- **Final result (consultant stage only)** — role `consultant` (owner/admin
  bypass):
  - `approved` — terminal
  - `approved_with_comments` — terminal
  - `rejected` — terminal
  - `reinspect` — loops back into a new QA/QC cycle on the same workflow
    instance (full decision log preserved)

Every transition is synced to the Phase 6 workflow instance
(`syncExternalState` + step re-opening helper) so the append-only decision
log, the action-item pipeline ("My Actions") and Phase 7 events
(`wir.submitted`, `wir.approved`, `wir.approved_with_comments`,
`wir.rejected`, `wir.reinspect`) stay authoritative.

## MIR routing

The MIR decision itself stays in the procurement module — its accepted
quantity already controls usable stock through the Phase 10 quarantine gate
(`quarantine` → accepted posts `quarantine_release`; rejected posts
`quarantine_reject`). Phase 19 adds the surface and the Phase 6 sync:

- `GET /api/qhse/mirs` — MIR list with supplier/delivery links
- `PUT /api/qhse/mirs/:id` — attach `material_submittal_id`, `grn_id`, `certificates`
- `POST /api/qhse/mirs/:id/workflow` — idempotent sync into the `mir` template
- `POST /api/qhse/mirs/:id/workflow/decision` — mirror the procurement
  decision (`accepted` → GRN eligibility step, `rejected`/`partial` →
  accepted/rejected/quarantine step)

## NCR widening

`ncrs` gained: exact location (`project_location_id` + `exact_location`),
responsible party (+ organization), root cause, corrective action,
preventive action, cost impact, schedule impact (days), verification notes,
closure authority. The legacy `open → in_progress → resolved → closed`
transitions are untouched; `POST /ncrs/:id/verify` closes with verification
evidence + closure authority in one audited step.

## Quality tests

`quality_tests` gained `itp_id` / `itp_point_id` / `checklist_instance_id`
links — a test can be tied to the ITP point it verifies.

## QA/QC document set (branded PDFs)

ITP · WIR (+ embedded checklist) · NCR · corrective/preventive action ·
test report · punch list · inspection checklist — all rendered through the
shared branded layout (`utils/qcPdf.js` over `utils/procurementPdf.js`),
downloadable per record.

## Zero-record contract

Every QA/QC list endpoint returns an empty array for a project with no
records — never an error. Tested explicitly.
