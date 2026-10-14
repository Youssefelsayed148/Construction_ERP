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
Accrued Cost           = max(Committed Cost − Actual Cost, 0)   [informational]
ETC                    = approved ForecastVersion ETC, or remaining
                         commitments plus uncommitted current budget
EAC                    = Actual Cost + ETC
Forecast Revenue       = Revised Contract Value
Forecast Profit        = Forecast Revenue − EAC
Forecast Margin %      = Forecast Profit / Forecast Revenue × 100
```

The current Phase 8 plan requires new ForecastVersion lines to represent ETC by
cost code and defines EAC as actual cost plus ETC. The engine keeps historical
approved versions on the earlier total-EAC basis using `forecast_basis='eac'`;
new versions use `forecast_basis='etc'` (migration 0062). Without an approved
forecast, ETC is remaining commitments plus uncommitted current budget. Accrued
cost remains available as a separate booked-not-received indicator and is not
added a second time to EAC.

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
