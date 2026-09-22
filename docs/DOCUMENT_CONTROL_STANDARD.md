# Document Control Standard — Phase 21

Scope: enterprise document control over the existing library
(`document_categories`, `project_documents`, `document_versions` — which
already carried revision history and approval reset; both are kept and
upgraded, nothing removed). The multi-stage RFI/submittal work this phase
required was already delivered in Phase 16 (coordinator/reviewer stages,
A/B/C/D response codes, revision history) — no duplication.

## Controlled register

`project_documents` widened with the register dimension:

- `discipline`, `doc_type` (controlled type: drawing / specification /
  contract / report / method_statement / as_built / o_m), `doc_status`
  (draft / in-review / approved / superseded / void)
- `project_location_id`, `package`
- `originator_organization_id`, `recipient_organization_id`
- `doc_number` + `revision_code` (unique per project)
- `is_current`, `superseded_by_doc_id`, `review_due_date`, `registered_at`

`GET /api/docs/registers` lists the register filtered by type / discipline /
package / current-only.

## Revision rules

1. **Exactly one current revision** — enforced on every write.
2. **Previous revisions immutable and superseded** — a new version upload
   (`POST /documents/:id/versions`) marks every previous current version
   `is_current=false, status='superseded'` (with `superseded_at`), resets the
   document to draft pending re-approval (the existing approval-reset
   behavior), and bumps the revision code (`R0 → R1 → …`).
3. **Superseded warning** — the library renders a prominent red
   "SUPERSEDED — do not use for construction" banner (with the replacement
   pointer) on any document whose `doc_status` is superseded; the register
   and cross-search badge superseded rows too.
4. **Explicit supersede** — `POST /documents/:id/supersede` points an old
   document at its replacement (`superseded_by_doc_id`) and fires the
   `document.superseded` event.
5. New revisions may reset review/approval per the governing workflow — the
   existing draft-reset behavior is retained and the Phase 6 engine remains
   the approval path.

## Auto-numbering — `PROJECT-DISCIPLINE-TYPE-SEQ-REV`

- Format: `PREFIX-DISCIPLINE-TYPE-SEQ-REV`, e.g. `TWR-ARC-DWG-0001-R0`.
- Configurable per project (`GET/PUT /api/docs/numbering/:project_id`):
  prefix (defaults to the project code), include-discipline, include-type,
  sequence padding, revision prefix.
- Sequences are per `(project, discipline, type)`; registration is
  idempotent per document; duplicate numbers are refused.
- Discipline/type codes: ARC/STR/CIV/MEC/ELE/PLB/HVC/FIR/GEN ·
  DWG/SPE/CON/REP/MET/ASB/OM/OTH.

## Transmittals

`transmittals` (+ `transmittal_items`): incoming/outgoing, purpose,
sender/recipient organization + user, attention, response due,
acknowledgement (who/when/note). Lifecycle: `draft → sent → acknowledged →
closed` (illegal jumps refused). `GET /api/docs/transmittals/:id/pdf`
generates the branded transmittal PDF with the item table (document, ref,
rev, description, copies).

## Correspondence

`correspondence` (+ `correspondence_history`): letters / notices /
instructions / claims — unique number by type (LTR/NOT/INS/CLM-YYYY-####),
sender/recipient, linked contract/project record (`linked_entity_type` +
`linked_entity_id`, `contract_ref`), response due, audit-trailed lifecycle
`draft → sent → responded → closed` (received for incoming), **revision-safe
amendments** (`POST /correspondence/:id/amend`) that bump the revision with
an immutable history row. Branded PDF per letter with the revision shown.

## Cross-record search

`GET /api/docs/search?project_id=&q=` — searches documents (current **and**
historical revisions), transmittals, correspondence, RFIs and submittals,
permission-filtered (external portal roles only see documents flagged for
their portal visibility).

## Zero-record contract

Registers, transmittals, correspondence and the cross-search all render
their empty states on a fresh project — never an error.
