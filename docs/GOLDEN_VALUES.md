# Golden values — Osiris Residential Towers (provisional)

Status: **calculation baseline only; not an executed Phase 9 scenario**. Spec 28 is
not present in the repository or `docs/legacy`; the assumptions below are explicit
so the seed and API/UI journeys can use one deterministic model. The missing
construction and finance owners must review the commercial assumptions before
these figures are used for pilot or production accounting.

## Project and quantity basis

The residential template in `project-wizard-migration.js` defines two towers, 12
floors per tower, and four units per floor: 2 × 12 × 4 = **96 units**. The pilot
procurement seed supplies the following material quantities and rates; its
calculation is used as the initial BOQ fixture basis:

| BOQ line | Quantity | Rate (EGP) | Extended value (EGP) |
|---|---:|---:|---:|
| Portland cement 50 kg | 120 bags | 185 | 22,200 |
| Rebar 12 mm | 35 tons | 36,500 | 1,277,500 |
| Ceramic floor tile | 240 m² | 320 | 76,800 |
| **BOQ total** | | | **1,376,500** |

Arithmetic: 120 × 185 + 35 × 36,500 + 240 × 320 = 22,200 + 1,277,500 +
76,800 = **1,376,500 EGP**. This is the current pilot seed's material BOQ, not a
complete residential BOQ. The project-specific C35 recipe is still to be attached
to the golden project; do not treat the shared standard recipe as proof that the
project seed is complete.

## Provisional commercial assumptions and expected values

These assumptions make the arithmetic deterministic. They are not a substitute for
finance approval:

- Base contract value: **1,600,000 EGP**; one approved variation: **100,000 EGP**;
  revised contract value = 1,600,000 + 100,000 = **1,700,000 EGP**.
- Approved project budget: **1,500,000 EGP**.
- All three BOQ lines are committed and delivered at the listed rates, with no tax,
  returns, or other costs. Actual cost is recognized once on receipt.
- A new contract without an explicit retention setting uses the configured 10%
  business-rule default. Retention is capped at 10% of revised contract value.
- Advance is 20% of revised contract value: 1,700,000 × 20% = **340,000 EGP**.
  Recovery is 10% of current certified gross work, limited by outstanding advance.
- The current certificate covers the full material BOQ amount. The advance is
  invoiced and collected separately; the certificate deductions are not taxed.

| Measure | Expected EGP | Hand calculation |
|---|---:|---|
| BOQ | 1,376,500 | 120×185 + 35×36,500 + 240×320 |
| Budget | 1,500,000 | Assumed approved budget |
| Committed | 1,376,500 | Three BOQ lines awarded at BOQ rates |
| Actual cost | 1,376,500 | One GRN accrual for all committed quantities |
| ETC | 123,500 | max(Committed − Actual, 0) + (Budget − Committed) = 0 + 123,500 |
| EAC | 1,500,000 | Actual + ETC = 1,376,500 + 123,500 |
| Retention | 137,650 | min(10% × 1,376,500, 10% × 1,700,000) |
| Advance recovery | 137,650 | min(10% × 1,376,500, 340,000 outstanding) |
| Current certificate net | 1,101,200 | 1,376,500 − 137,650 − 137,650 |
| Advance invoice and receipt | 340,000 | 20% × 1,700,000 |
| Certificate invoice and receipt | 1,101,200 | Net certificate value |
| Total client cash received | 1,441,200 | 340,000 + 1,101,200 |
| Supplier cash paid | 1,376,500 | One full payment against the supplier invoice |
| Cash contribution | 64,700 | 1,441,200 − 1,376,500 |
| AP / AR after settlement | 0 / 0 | Both invoices fully allocated and paid |

The retention check is below its contract cap: 137,650 < 170,000. Advance recovery
is below the 340,000 outstanding advance. All displayed money values are exact to
the cent for this fixture.

## Existing API-chain golden values

The committed `golden-chain.pg.test.js` independently verifies a 50-bag procurement
chain at 100 EGP per bag. Its return variant receives 50 bags, returns 10, then
invoices and pays for 40:

- PR = PO = gross GRN = 50 × 100 = **5,000 EGP**.
- Return reversal = 10 × 100 = **1,000 EGP**.
- Net stock = 50 − 10 = **40 bags**; net cost, invoice, payment, and ledger cost =
  40 × 100 = **4,000 EGP**.
- AP after payment = **0 EGP**; all referenced journal entries balance.

This test is a procurement-chain slice, not the full tender-to-warranty Phase 9
journey. It does not assert the provisional residential values above.

## Required follow-up

1. Attach a project-specific C35 recipe and schedule to the seeded residential
   project; then derive its material requirements from the recipe.
2. Implement and assert the whole Phase 9 API journey, including progress,
   approvals, notifications, audit rows, stock, cost, and balanced journals at
   each transition.
3. Implement a browser journey that uses the same fixture and expected values.
4. Replace or approve the budget, contract, variation, retention, advance, and
   recovery assumptions with owner/finance decisions. Until then, all values in
   the commercial table are **provisional and unverified against runtime output**.
