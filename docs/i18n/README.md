# Localization contract (Phase 10, L0)

Source plan: `docs/system_language_fix.md` (its "Corrections and additions" section wins). Closeout plan: `docs/ERP_CLOSEOUT_PLAN.md`, Phase 10.

## Locales
- Supported: **English** and **Arabic (Egypt)**.
- Stored and sent as `en` and `ar` (existing saved preferences use them): `localStorage.locale`, `Accept-Language`, the `locale` request parameter.
- `ar-EG` is used **only** when calling `Intl` / `toLocale*String` for formatting. English formatting uses `en-EG` (falls back to `en`).
- Default for a first visit: `ar` (current behaviour). An invalid stored value falls back to the default.
- `<html lang>` is `en` or `ar`; `dir` is `ltr` or `rtl`.

## What is translated and what is not (content rules)

| Text category | Policy |
|---|---|
| UI labels, buttons, headings, tooltips, placeholders, `aria-label`, `title`, image `alt` | Translated through catalog keys |
| Validation and API error messages | Translated from a stable `error_code` + `error_params` (L7); the English `error` string stays for logs and old clients |
| Statuses, priorities, severities, roles, workflow actions, entity types | Stored and sent as English machine values (`pending_approval`); rendered through `enums.*` keys. Never `replace('_', ' ')` |
| System-generated notification and action titles | Stored as key + params (L7) |
| Records with two languages (`name_ar`, `name_en`) | Arabic UI prefers `name_ar`, then a neutral name, then `name_en`; English UI the reverse |
| User-entered text (notes, titles, descriptions, comments) | Never auto-translated |
| Supplier / client / consultant submitted content, historical text | Never translated |
| IDs, document numbers (`PR-00012`), codes, route paths, enum values, API field names | Unchanged; rendered left-to-right inside Arabic text |
| Dates, numbers, currency, percentages | Shared helpers with the active locale; currency `EGP` / `ج.م` |
| Reports, CSV, PDF | Follow the requested locale (L8); file names stay ASCII and predictable |
| Seeded DB text (`roles.name`, workflow/notification/document templates, report catalog titles) | Need EN and AR values (L7) |
| Native date/number inputs | Follow the browser locale; decision pending (L7) |

## Acronyms
Industry acronyms stay Latin in Arabic UI because site staff use them as words: BOQ, RFI, WIR, MIR, NCR, ITP, JSA, HSE, QA/QC, CAPA, DLP, PO, PR, GRN, EAC, SPI, CPI, PPE, PTW. Headings and first mentions use the Arabic expansion with the acronym in parentheses (see `GLOSSARY.md`); table headers and badges may use the acronym alone.

## Key rules
- Semantic keys: `procurement.comparison.noQuotations`, `enums.status.pendingApproval`, `errors.requestFailed`. Never English text as a key.
- Namespaces keep the existing names (`workorders`, `subcontractors`, `costing`), plus the rest in `docs/system_language_fix.md` L2.
- Dynamic values use interpolation: `t('projects.count', { count: 3 })`, never string concatenation.
- New UI uses keys and the shared enum/format helpers. No new inline `locale === 'ar'` branches (CI: `npm run i18n:check`).

## Baseline and tooling
- `npm run i18n:inventory` (frontend) rewrites `docs/i18n/baseline/inventory.json`: inline branches, hard-coded English, raw enum rendering, fixed-locale formatting, prompts, empty namespaces, keys used but missing, English server messages. Counts are heuristics (regex over source), good for ranking work and stopping regressions, not exact.
- `npm run i18n:check` fails if any per-file count goes up versus the committed baseline. Counts only go down; lower the baseline by re-running the inventory after migrating a file.
- Screenshots of the principal routes in both languages: `docs/i18n/baseline/screenshots/` (`npm run i18n:screenshots`, mocked API).
- `ROUTE_CHECKLIST.md`: per-route status.
