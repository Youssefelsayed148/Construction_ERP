# Phase 13 design note — the canonical profit/margin model

The codebase had **three disagreeing formulas** (found by the Phase 1 audit,
§3.4). Phase 13 replaces all three with one canonical model and snapshots the
legacy figures before switching.

## The canonical model: EAC / forecast margin

```
Revised Contract Value = Original Contract Value + Approved (Incorporated) Client Variations
Current Budget         = Original Budget + Approved Budget Changes
Committed Cost         = Σ approved commitments (issued/approved POs + active
                         subcontracts) net of cancellations
Actual Cost            = Σ project_costs (money actually booked)
Accrued Cost           = max(Committed Cost − Actual Cost, 0)   [booked-not-received]
ETC                    = max(Current Budget − Committed Cost, 0) [unplanned
                         remainder of budget as the estimate-to-complete]
EAC                    = Actual Cost + Accrued Cost + ETC
Forecast Revenue       = Revised Contract Value
Forecast Profit        = Forecast Revenue − EAC
Forecast Margin %      = Forecast Profit / Forecast Revenue × 100
```

Chosen because it is the only one of the three legacy formulas that models
performance rather than cash flow: it is forward-looking (variations,
commitments, remaining work), it reconciles with the commitment ledger built
in Phase 10/12, and it degrades gracefully when accrual data is absent.

## What replaces what

| Caller | Old formula | Replaced with |
|---|---|---|
| `costing.js` GET `/project/:id/profitability` | `contract_value − total_cost` (static contract, no variations, no commitments) | `commercialEngine.projectCommercial()` — `forecast_profit` / `forecast_margin_percent`; the old figures remain in the response under `legacy.*` and in the pre-phase-13 snapshot |
| `finance.js` GET `/project/:id` | `profit = paid − expenses` (a cash proxy mislabeled as profit) | the `profit` field now comes from `commercialEngine.projectCommercial()`; `total_paid`/`total_expenses` stay as explicitly-labeled cash figures |
| `dashboard.js` GET `/project/:id` | `budget_burn_percent = total_spent / budget × 100` against the static `projects.budget` | burn is now against `Current Budget` (original + approved changes) from the engine, and the dashboard also carries `forecast_margin_percent` |

## Snapshot rule

Before the switch, the migration writes one `commercial_snapshots` row per
project per legacy formula (`costing_legacy`, `finance_cash_proxy`,
`dashboard_burn`) with the figures computed from the live tables, so every
past report remains explainable and any number change after Phase 13 can be
diffed against exactly what the old formula would have said.
