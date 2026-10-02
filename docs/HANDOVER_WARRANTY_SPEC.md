# Handover, Closeout & Warranty Specification — Phase 25

Scope: §79 Handover and §80 Warranty/DLP — the project's last mile, built
net-new end to end (there is no existing handover path to migrate away from).
Punch items reuse Phase 19's register and its `handover_punch` workflow.

## Handover workflow (Phase 6 engine, `handover` template)

The exact state chain — no state may be skipped:

```
Pre-Handover → Punch/Snag → Rectification → Final Inspection →
Testing & Commissioning → As-Builts → O&M → Training → Taking Over →
DLP/Warranty → Final Completion
```

Gate: the process cannot leave the Punch/Snag stage while punch items
(Phase 19's `punch_items`) are open — the rectification evidence gate is the
register itself. `final_completion` stamps `completed_at`.

## Entities

| Entity | Table | Notes |
|---|---|---|
| Handover process | `handover_processes` | one per project, lifecycle status machine |
| Package register | `handover_package_items` | the 9 standard package items: as-built drawings, O&M manuals, warranties, test/commissioning results, certificates, asset register, keys/access, training records, authority approvals |
| Asset register | `asset_register` | asset code, location, model/serial, supplier + subcontractor organizations, commissioning date, warranty start/end |
| Warranty claims | `warranty_claims` | linked to asset/location, routed to PM/subcontractor, SLA tracking, rectification evidence, acceptance |

## Handover package checklist

`GET /api/handover/process/:projectId` returns the process + readiness;
`GET /api/handover/assets?project_id=` lists the asset register. Package items
carry document uploads per item and a completion percentage computed from
`status = 'complete'` items over the total. A project with zero punch items
renders the handover screen at a correct 0%/clean state — never an error.

## Warranty / DLP claim flow

1. A client or authorized user raises a claim linked to an asset or a
   location (`POST /api/handover/claims`) with an SLA window (default 30
   days) → the Phase 6 `warranty_claim` workflow instance opens.
2. Assignment routes the claim to the responsible party (organization/user).
3. Rectification progress; rectification evidence is attached when the claim
   is submitted for acceptance.
4. The verifier accepts (closing on accepted rectification evidence) or
   rejects (the claim reopens into rectification with a full audit trail).

`GET /api/handover/claims/:id/sla` reports the SLA status (overdue flag +
days remaining).

## Handover readiness surfaced

- The client portal dashboard exposes `handover_readiness` (percent of
  package items complete) — computed from the handover package register.
- The PM dashboard (Phase 23 role resolver) carries the same readiness strip.

## Branded document set

Handover checklist · testing & commissioning sheet · asset register ·
as-built register · O&M register · warranty register · handover certificate —
all rendered as branded PDFs through the shared layout.

## Zero-record contract

A project with zero punch items and no handover process still renders the
handover screen with a correct 0%-complete state, not an error. Tested
explicitly.
