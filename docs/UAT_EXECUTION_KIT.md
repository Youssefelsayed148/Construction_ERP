# UAT execution kit — full lifecycle, all roles

Written 2026-10-28 by Session T (T5). This extends `docs/UAT_PILOT.md` (procure-to-pay only) to the full
tender-to-warranty lifecycle across the roles the closeout plan calls out: finance, procurement, site,
owner, plus the client/supplier/subcontractor/consultant portals. It does not replace `docs/UAT_PILOT.md`
— run both; this kit picks up where that one's scope ends (finance posting, site/quality, commercial
valuation, handover/warranty, and the four external portals).

**No sign-off in this document is complete.** Every row in the sign-off table at the end reads Pending
until a named human runs the script and records a result. This is human work; this repository preparation
does not constitute UAT.

## Scope and limits (same guardrails as UAT_PILOT.md)

- Run only against the local seeded pilot (`docs/STAGING.md`), project `PILOT-PTP-001`, or the
  `OSIRIS-RES-TOWERS-001` golden-demo fixture (`npm run seed:golden-demo`) if the pilot operator prefers a
  cleaner slate for the commercial/valuation steps. Never use real client, supplier, or subcontractor data.
- Finance posting that moves real money, external notifications, webhooks, bank transfers, and the legacy
  role switch are out of scope everywhere in this kit, same as `docs/UAT_PILOT.md`.
- Use the account *keys* in the ignored `.staging-users.json`, never paste passwords, tokens, or `.env`
  contents into a ticket, screenshot, or this document.
- Use separate maker/checker accounts for every approval step. Never approve a record with the account
  that created it.
- Stop immediately and record a Blocker defect if: the UI points to a non-loopback host, real data
  appears, an action attempts an external send or a real payment, or a role sees data outside its own
  project/organization.

## Role scripts

### 1. Owner / Projects Director (`owner_ceo` or `projects_director`) — whole-lifecycle oversight

| # | Step | Expected result |
|---|---|---|
| 1 | Open the project list; confirm only assigned projects are visible | No other organization's project appears |
| 2 | Open a project's Overview tab | Summary cards, phases, milestones, team, "needs attention" list all render with data, not blank |
| 3 | Open Admin > Approval limits | The role/action/max-amount table is visible (values are an owner decision — confirm whatever is seeded, don't expect production values) |
| 4 | Approve a queued above-limit request (e.g. a PO issue over a configured ceiling) | Only an owner/admin can complete it; a non-owner account sees it refused |
| 5 | Open the Admin area generally | No "Settings is a placeholder" dead end — Settings shows real GL account mappings |

### 2. Procurement (`procurement_officer`, `procurement_manager`) — PR through payment

This is `docs/UAT_PILOT.md`'s script in full; also exercise the real screen directly (not just the API):

| # | Step | Expected result |
|---|---|---|
| 1 | Projects > Operations > Procurement tab > Requests | Create-PR form is a real form (title, material, quantity, unit, estimated price, priority) — not a `prompt()` |
| 2 | Submit the PR | Status advances to Budget Check, then (as `workflow_budget`/`workflow_checker`) to Procurement |
| 3 | RFQs tab | Create an RFQ linked to the PR, invite both seeded suppliers, enter a quotation for each |
| 4 | Awards tab | Comparison table renders; submit an award recommendation with a reason; a different account approves it |
| 5 | Orders tab | Create the PO from the selected quotation; issue it; step it through its approval chain as a different account each time |
| 6 | Receipts tab | Record a delivery, create the MIR from it, accept it (different account), create the GRN |
| 7 | Invoices tab | Enter the supplier invoice against the PO/GRN; confirm the three-way-match status is "matched" before approving; record the AP payment |
| 8 | Analytics tab | Spend-by-supplier and vendor-performance tables render (not empty, once the above has run) |

### 3. Site (`site_manager`, `site_engineer`) — daily report, quantities, progress

| # | Step | Expected result |
|---|---|---|
| 1 | Site Management / Site Workspace | Submit a daily report with manpower, equipment, and at least one quantity measurement against a BOQ item/location | Report saved; a second identical submission with the same idempotency key does not duplicate it |
| 2 | Locations & Quantities | The measurement appears, linked to its BOQ item and location |
| 3 | Project Overview | `completion_percentage` moves in the direction the new measurement implies (weighted by BOQ value or schedule duration — see `docs/PROGRESS_DERIVATION.md`) without a manual edit |
| 4 | Schedule | The linked activity's percent-complete reflects the same measurement, not only the project-level figure |
| 5 | QHSE | Raise a WIR/NCR against the work just reported; confirm it reaches the consultant's review inbox (see script 6) |

### 4. Finance (`finance_manager`, `accountant_ar`, `accountant_ap`) — valuation, invoice, receipt, retention

| # | Step | Expected result |
|---|---|---|
| 1 | Projects > Operations > Commercial / `ProjectFinanceWorkbench` | Applications tab: create a client payment application against certified quantities for the current period |
| 2 | Certificates tab | The application becomes a certificate; retention is held at the configured percentage, capped at the contract's cap |
| 3 | Issue the client invoice from the certificate | Invoice shows gross less retention (and less any advance recovery) as the net amount |
| 4 | Record the client receipt against the invoice | Invoice transitions to paid; AR subledger and GL receivable both move by the same amount (zero delta) |
| 5 | Retention release (if a release milestone is reached in this UAT run) | A separate retention-release posting appears; it does not touch the original invoice |
| 6 | Supplier side: AP review queue (inside the Procurement workspace's Invoices tab) | Three-way-match status and payment-ready state are visible before AP approves; no posting happens without this review |
| 7 | Variation | Raise a variation (cause, responsibility, linked RFI, days impact) through Commercial; route it through submitted -> recommended -> approved by three different accounts; confirm it changes the revised contract value used in step 1's next period |

### 5. Handover and warranty (`project_manager`, QA/QC role, or whichever role the pilot assigns to Handover)

| # | Step | Expected result |
|---|---|---|
| 1 | Handover tab | Start a handover process for a completed phase/unit |
| 2 | Add a package item and upload its document | File is retrievable, not a broken link |
| 3 | Register a warranty for an asset in the package | Warranty appears in the register with its term |
| 4 | File a warranty claim against it | Claim status is trackable; resolving it closes the claim without deleting the warranty record |

### 6. External portals — client, supplier, subcontractor, consultant

For each portal, sign in with the family's seeded account and confirm BOTH a positive and a negative case:

| Portal | Account key | Positive case | Negative case |
|---|---|---|---|
| Client | `client_executive` | Approve/respond to a variation; acknowledge a document; view the invoice/certificate issued in script 4 | Cannot see supplier/subcontractor rates or any other project's data |
| Client (read-only) | `client_reviewer` | View the same records as above | Cannot approve/reject (button absent or 403) |
| Consultant | `consultant_coordinator` | Perform a site visit record, inspect a WIR/MIR, issue an instruction, recommend a variation | Cannot see internal budget/cost figures |
| Consultant (read-only) | `consultant_reviewer` | View WIR/boq/docs/work-orders as granted by migration `0072` | Cannot write |
| Subcontractor | `subcontractor_manager` | View own sub-contract, certificates, verifications | Cannot see another subcontractor's commercial records; cannot see internal cost |
| Subcontractor (site) | `subcontractor_site_engineer` | View subcontractor records relevant to site | No write access beyond what's granted |
| Supplier | `supplier_sales` | View own quotations, PO status, invoice/payment status | Cannot see another supplier's quotation |
| Negative access | `unassigned` | — | Every portal and internal screen above refuses with 403, no data rendered |
| Negative access | `expired_assignment` | — | Confirm expired project assignment is treated as no access, not stale access |

## Known gaps to route around during this UAT (not blockers for running the script, but expect them)

Per `docs/CLOSEOUT_RECONCILIATION.md`: no admin roles/permission-matrix screen (use the seeded policy as-is,
don't try to edit it from the UI); no workflow-template editor or notification-rules UI (skip those steps);
no dedicated "AP review queue" screen by that name (use the Procurement workspace's Invoices tab instead,
per script 4 step 6); `/api/subcontractors` contract creation/verification has no screen (an operator must
use the API/SQL to set up a subcontract before script 6's subcontractor portal checks can be run); no
recipe-management or commercial-contracts screens (seed data or API/SQL only).

## Defect template

Use the same template as `docs/UAT_PILOT.md`:

```text
UAT run ID:
Date/time and timezone:
Reporter role/account key (no email or password):
Project: PILOT-PTP-001 or OSIRIS-RES-TOWERS-001
Browser/device and viewport:
Locale: EN / AR
Screen and record reference:
Severity: Blocker / High / Medium / Low
Preconditions:
Steps to reproduce:
Expected result:
Actual result:
Frequency: Always / Intermittent / Once
Evidence location (redacted screenshot or safe reference):
Workaround, if any:
Retest result and date:
Disposition: Open / Fixed / Deferred / Rejected
```

## Severity rubric (same as the closeout plan's own)

- **Blocker**: data loss/corruption, money or ledger wrong, a security hole, a cross-project leak, a core
  lifecycle step unusable, or a role locked out of its own job.
- **Major**: wrong behavior with a workaround, missing audit, missing localization on a core screen.
- **Minor**: cosmetic, polish, rare edge — goes to `docs/POST_LAUNCH_BACKLOG.md`, not blocking.

## Sign-off table

| Script | Role/account | Result | Date | Notes / linked defects |
|---|---|---|---|---|
| 1. Owner oversight | owner_ceo / projects_director |  Pending |  |  |
| 2. Procurement PR->payment | procurement_officer, procurement_manager, workflow_budget, workflow_checker | Pending |  |  |
| 3. Site report/progress | site_manager, site_engineer | Pending |  |  |
| 4. Finance valuation/invoice/receipt/variation | finance_manager, accountant_ar, accountant_ap | Pending |  |  |
| 5. Handover/warranty | project_manager (or assigned role) | Pending |  |  |
| 6. Client portal | client_executive, client_reviewer | Pending |  |  |
| 6. Consultant portal | consultant_coordinator, consultant_reviewer | Pending |  |  |
| 6. Subcontractor portal | subcontractor_manager, subcontractor_site_engineer | Pending |  |  |
| 6. Supplier portal | supplier_sales | Pending |  |  |
| 6. Negative access | unassigned, expired_assignment | Pending |  |  |
| Security/access reviewer | — | Pending |  |  |
| UAT coordinator | — | Pending |  |  |

No production go decision is implied by any completed row above. Production remains blocked until every
row is signed and `docs/GO_NOGO.md`'s criterion 7 has real human evidence.
