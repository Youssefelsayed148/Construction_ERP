# Procurement UAT pilot

## Purpose and limits

Run UAT against the local, seeded pilot project `PILOT-PTP-001` only. The scope is the browser procure-to-pay workflow: purchase request, approvals, RFQ and quotations, award recommendation, purchase order, receipt inspection, goods receipt, supplier invoice review, and payment preparation.

Finance posting is excluded. Do not post journals, create bank transfers, send a payment, use real supplier/client data, or trigger email, SMS, WhatsApp, or external webhooks. Any payment screen check must stop before an external transfer or general-ledger posting. The pilot uses fictional suppliers and seeded materials. It is not production approval.

Use [STAGING.md](STAGING.md) for exact local startup, health, seed, smoke, and shutdown commands. The generated account file is the ignored root `.staging-users.json`; use its account keys to identify accounts. Never paste passwords, tokens, or `.env.docker` contents into tickets, screenshots, or this document. Reseeding rotates the passwords and invalidates sessions.

## Before starting

- [ ] Confirm the browser is at `http://127.0.0.1:8090` and `/api/health` reports ready with a healthy database.
- [ ] Confirm the selected project is `PILOT-PTP-001` and all entries use fictional pilot data.
- [ ] Use separate requester and checker accounts. Never approve a record with its maker account.
- [ ] Agree on a UAT run ID and date. Record defects with the template below; attach screenshots only after removing personal or credential data.
- [ ] Stop immediately if the UI points to any host other than loopback, if real data appears, or if an action attempts an external send or payment.

## Role scripts

Use the account keys below in `.staging-users.json`. The current seeder defines 38 keys in `backend/src/scripts/seed-staging.js`: `owner_ceo`, `coo`, `projects_director`, `construction_manager`, `project_manager`, `site_manager`, `site_engineer`, `planning_engineer`, `technical_office_engineer`, `quantity_surveyor`, `commercial_manager`, `contracts_manager`, `procurement_manager`, `procurement_officer`, `finance_manager`, `accountant_ar`, `accountant_ap`, `storekeeper`, `qa_qc_manager`, `hse_manager`, `document_controller`, `equipment_manager`, `hr_manager`, `business_development`, `client_executive`, `client_reviewer`, `pmc_manager`, `consultant_coordinator`, `consultant_reviewer`, `subcontractor_manager`, `subcontractor_site_engineer`, `supplier_sales`, `testing_lab`, `unassigned`, `expired_assignment`, `workflow_owner`, `workflow_checker`, and `workflow_budget`. The keys identify seeded accounts and do not contain credentials.

| Account key / role | Script and expected result |
|---|---|
| `procurement_officer` — requester / maker | Open the pilot project procurement workspace. Create a material-backed PR with a clear title, quantity, unit, estimated price, and normal priority. Confirm it appears as Draft, submit it, and confirm the state advances to Budget Check. Create an RFQ linked to the PR, invite the two seeded fictional suppliers, enter one quotation for each, and verify both appear in comparison. Submit an award recommendation with a reason and confirm it awaits a different user's decision. After approval, create the PO from the selected quotation. |
| `workflow_budget` — accountant / budget checker | Open the pending PR and verify its project, lines, amount, and budget-check result. Approve or reject according to the assigned UAT case. Expected: the action is recorded once and the PR advances or becomes rejected. Do not override a budget exception without a separately documented UAT case and reason. |
| `workflow_checker` — purchasing manager / checker | Review the PR authority/procurement steps and award recommendation. Confirm the requester is a different account. Approve or reject using the assigned UAT case and verify the resulting status. For the PO, advance only the purchasing-manager workflow steps. Confirm status and audit history update once per decision. |
| `workflow_owner` — owner workflow actor | Start PO approval when the screen offers that action, then complete only the requester step assigned to this account. Use the account as a checker only where the seeded workflow explicitly assigns it. Do not use owner override to bypass a failed test. |
| `finance_manager` — financial authority reviewer | Review the PO financial-authority step and supplier invoice details, matching the invoice to the approved PO and accepted receipt. Record the UAT decision and confirm the invoice state. Stop before any journal posting, bank instruction, or external payment. Finance account mappings remain provisional. |
| `workflow_owner` — receiving maker | Record delivery against the approved PO and correct warehouse. Create the MIR and verify the delivered quantity and material. Do not create a GRN until a different checker accepts the inspection. The seeded `storekeeper` account lacks procurement-workspace view access, so do not use it to run this workspace script. |
| `workflow_checker` — inventory checker | Review the pending MIR, confirm the received quantity and material, then accept or reject the inspection. Verify the action and status are visible to the receiving maker. |
| `workflow_owner` — GRN and invoice actor | After the MIR is accepted, create the GRN. Confirm receipt lines and quantities match the delivery. Review and approve the supplier invoice only after checking its PO and GRN match. Do not create a second GRN for the same delivery. |
| `accountant_ap` — accounts payable reviewer | Review the supplier invoice/three-way-match queue if its AP screen is enabled for this pilot account. Record any discrepancy as a defect instead of forcing approval. Confirm the invoice is ready for payment preparation, then stop before finance posting or external payment. |
| `unassigned` — negative access check | Attempt to open the pilot procurement API/screen using the unassigned account. Expected: access is denied (HTTP 403 for the scoped procurement API), project data is not displayed, and no mutation succeeds. |
| `supplier_sales` — supplier-seat isolation check | Sign in only to the supplier portal if enabled for this pilot. Verify the account sees only its own supplier records and cannot read another supplier's quotation, project finance, or internal comparison values. Portal workflows are partially deferred; record unavailable portal journeys as blocked rather than substituting internal data. |

For each positive script, capture the record reference, final status, account key (not email/password), and pass/fail. Use separate browser sessions or sign out before switching accounts. Do not share a session token between testers.

## Seeded UAT checklist

### Access and navigation

- [ ] Procurement officer sees the pilot procurement workspace and its allowed actions.
- [ ] Purchasing, finance, inventory, and owner actors see only actions assigned to their workflow stage.
- [ ] Unassigned account is denied project procurement access.
- [ ] A user assigned to the pilot project cannot view another project's procurement register.
- [ ] English and Arabic labels render; Arabic layout remains usable at desktop and mobile widths.

### Purchase request and sourcing

- [ ] Create and submit a PR with a seeded material and a positive quantity.
- [ ] Verify budget checker and purchasing-manager approvals are performed by different accounts.
- [ ] Create an RFQ linked to the PR and invite both seeded fictional suppliers.
- [ ] Enter two quotations and compare the prices/terms; supplier comparison visibility follows policy.
- [ ] Submit an award recommendation with a reason; a different checker approves or rejects it.

### Order, receipt, and invoice

- [ ] Create a PO from the chosen quotation and follow each configured approval step.
- [ ] Record a delivery to the pilot warehouse and create an MIR.
- [ ] Have the inventory checker accept or reject the MIR from a different account.
- [ ] Create a GRN only after MIR acceptance and confirm inventory/receipt quantities.
- [ ] Enter a supplier invoice and confirm the PO/GRN three-way-match result.
- [ ] Confirm AP review does not trigger a general-ledger posting or external payment.

### Closeout checks

- [ ] Confirm no user can see another supplier's confidential quote unless the policy grants comparison access.
- [ ] Confirm no external notification, webhook, bank transfer, or payment was sent.
- [ ] Record all defects and retest results below.
- [ ] Run the read-only reconciliation using the approved local procedure after all UAT records are complete.

## Known deferred items and limits

- Finance chart/account mapping is provisional and requires owner confirmation before finance signoff or production use.
- UAT does not authorize production use, finance posting, real supplier communication, bank activity, or external notification delivery.
- Supplier/client portal registers and several Phase 5.6–6 screens are incomplete; supplier-seat isolation can be checked only where a portal surface is enabled.
- UAT is human work. This repository preparation does not claim that business users have accepted the workflow.
- The test environment is seeded and mutable. Re-running `seed:staging` rotates all generated passwords and clears/rebuilds seed-owned pilot assignments.

## Defect template

```text
UAT run ID:
Date/time and timezone:
Reporter role/account key (no email or password):
Project: PILOT-PTP-001
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

Never include passwords, bearer tokens, `.env` contents, real personal data, or unredacted payment/bank details in a defect report.

## Signoff

| Signoff | Name / role | Result | Date | Notes / linked defects |
|---|---|---|---|---|
| Procurement process owner |  | Pending |  |  |
| Project/site receiving owner |  | Pending |  |  |
| Finance owner (mapping confirmation) |  | Blocked — account mappings are provisional |  | Confirm chart accounts before finance signoff |
| Security/access reviewer |  | Pending |  |  |
| UAT coordinator |  | Pending |  |  |

No production go decision is implied by completed UAT rows. Production remains blocked until the required human signoffs and finance account confirmation are recorded.
