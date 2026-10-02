The correct approach is a system-wide localization program, not a page-by-page Arabic patch. The plan below preserves database/API values while translating everything presented to the user.
Target behavior
When EN/AR is toggled:
- Every mounted component changes immediately without reloading.
- The choice persists across navigation, refresh and login/logout.
- <html lang> and dir switch between en/ltr and ar/rtl.
- Navigation, forms, dialogs, validation, API errors, statuses, dashboards and accessibility labels use the selected language.
- Dates, numbers and currency use the appropriate locale.
- Arabic record fields are preferred in Arabic, with sensible fallback to English.
- PDFs, CSV exports and generated reports use the requested language.
- Database enums and API payload values remain stable and untranslated internally.
Note on numbering: sub-phases are named L0-L11 so they do not clash with the Phase 0-11 numbering of ERP_CLOSEOUT_PLAN.md, where this program is Phase 10.

Corrections and additions after checking the plan against the code (apply these; they override the text below where they differ)
1. Locale values: keep the stored/API values `ar` and `en` (existing saved preferences use them). Use `ar-EG` only when calling Intl/toLocale* for formatting.
2. Namespaces: the code already uses `workorders`, `subcontractors` and `costing`; keep those key names rather than renaming to `workOrders`.
3. Scope of the inline-branch migration: the code has about 1,093 inline `locale === 'ar'` branches, mostly in core pages that L5 does not name: WorkOrders (86), HSE (81), ProjectDetail (74), ProjectDocuments (66), HR (66), QHSEExtended (65), QHSE (64), Invoices (57), Approvals (48), SiteManagement (46), UnitsSales (42), DocControlExtended (40), Suppliers (36), Clients (32), Assets (32), plus Login, the project wizard, BOQ, Items, Expenses, Payroll and Legal. Policy: record the current count per file as a CI baseline; the count may only go down; new inline branches are blocked; migrate a page to keys when it is next changed, and schedule the largest files explicitly. Without a baseline the L10 "no hard-coded English" rule fails on day one. Inline branches work correctly once the toggle is reactive (L1), so they are not a functional bug.
4. L7 error contract: the backend has about 482 `error: e.message` responses shaped `{ success:false, error:"text" }`. Do not change `error` into an object (it breaks every existing caller). Add `error_code` and `error_params` next to the existing `error` string, migrate endpoints gradually, and have the frontend prefer the code when present. This is the same change as the "Error leakage" item in Phase 1.6 of ERP_CLOSEOUT_PLAN.md; do it once.
5. L8 PDFs: the backend uses `pdfkit`. As far as I know it does not do Arabic shaping and right-to-left ordering by itself. Run a short spike first (pdfkit with an Arabic font and a shaping/bidi layer versus rendering HTML to PDF with headless Chromium) and decide before building. The choice affects every exported document.
6. Additional coverage:
   - Role names in the database (`roles.name`) are English only.
   - Seeded workflow templates, notification templates, document templates and report catalog titles are English.
   - Native date and number inputs follow the browser locale, not the app locale; decide how to handle them.
   - Bundle the Arabic font locally so the app works offline (ties to Phase 7.1 of ERP_CLOSEOUT_PLAN.md).
   - The server has no `Accept-Language` handling anywhere today.
7. Counts: PortalDashboard has about 40 `prompt(` calls (not 39); recount at L4C. These are replaced by real forms in Phase 6 of ERP_CLOSEOUT_PLAN.md, so translate their labels once, in the new forms.
8. Effort: roughly 4 weeks if existing inline branches are grandfathered (item 3), 6-8 weeks if all are migrated.

L0 — Localization contract and baseline
Before editing screens, define what is translated and what remains unchanged.
Work
- Establish supported locales: en and ar-EG.
- Define terminology for construction and ERP concepts:
  - BOQ, RFI, WIR, MIR, NCR, JSA, HSE, QA/QC.
  - Procurement, retention, variation, snag/punch, handover and DLP.
  - Roles, workflow actions and financial terms.
- Decide which acronyms remain Latin in Arabic.
- Establish content rules:
  - UI labels and system-generated text are translated.
  - User-entered text is never automatically translated.
  - IDs, document numbers, codes and route paths remain unchanged.
  - Database enum values remain English machine identifiers.
- Generate a baseline inventory of:
  - Hardcoded English.
  - Inline locale === 'ar' branches.
  - Empty/missing translation namespaces.
  - Raw enums rendered to the UI.
  - English server messages.
- Record screenshots of principal routes in both languages.
Deliverables
- Arabic terminology glossary.
- Route/module localization checklist.
- Machine-readable missing-key report.
- Baseline screenshots and test results.
Completion criteria
Every visible text category has an explicit localization policy.
L1 — Repair the global locale architecture
Replace independent component locale state with a single reactive source.
Work
- Create a global LocaleProvider mounted around the application.
- Make useLocale() consume that provider rather than creating local state.
- Preserve the current interface where practical:
  - locale
  - setLocale
  - t
  - isRTL
  - loading
- Ensure setLocale() immediately rerenders the entire application.
- Persist locale in localStorage.
- Apply document.documentElement.lang and dir.
- Validate stored locale values and fall back safely to Arabic or the configured default.
- Initialize direction before React renders to avoid an LTR/RTL flash.
- Optionally synchronize language changes between multiple browser tabs.
- Keep translation loading cached, but expose loading and failure states correctly.
- Provide interpolation and count/plural support instead of building sentences through concatenation.
Primary files
- frontend/src/hooks/useLocale.js
- frontend/src/index.js
- Possibly a new frontend/src/i18n/ or frontend/src/context/LocaleContext.js
- frontend/public/index.html
Tests
- Toggling from the sidebar updates an already-mounted page.
- Toggling on Login updates Login.
- Locale persists after navigation and refresh.
- Invalid stored locale falls back correctly.
- lang and dir are always correct.
Completion criteria
No page reload is required to switch language.
L2 — Build the translation catalog
Replace empty namespace files with a complete, maintainable structure.
Proposed namespaces
- common
- auth
- navigation
- dashboard
- projects
- projectWizard
- locations
- boq
- workorders (keep the existing key)
- subcontractors (exists in code today)
- costing (exists in code today)
- site
- inventory
- procurement
- commercial
- finance
- clients
- suppliers
- portals
- qhse
- hse
- documentControl
- schedule
- reports
- handover
- actions
- approvals
- agents
- hr
- payroll
- assets
- expenses
- legal
- errors
- enums
Key rules
Use semantic keys:
procurement.comparison.title
procurement.comparison.noQuotations
handover.actions.startProcess
errors.requestFailed
enums.status.pendingApproval
Avoid keys based on English text such as:
"Save view": "..."
Work
- Populate both EN and AR files for every namespace.
- Add interpolation for dynamic values:
  - Project number
  - Counts
  - Dates
  - Record identifiers
- Add a recursive parity checker:
  - Every English key exists in Arabic.
  - Every Arabic key exists in English.
  - No namespace is silently missing.
  - Empty namespace files fail validation.
- In development/test, make missing keys visible.
- In production, fall back safely without showing raw key paths.
Completion criteria
Translation parity is enforced automatically during tests or CI.
L3 — Localize the application shell
Fix text that appears throughout the system before individual modules.
Scope
- Sidebar navigation.
- Portal navigation.
- Agent Activity link.
- Procurement Comparison link.
- Language and logout tooltips.
- User fallback and role display.
- Mobile navigation accessibility labels.
- Offline banner.
- Settings placeholder page.
- File-unavailable messages.
- Loading and generic empty/error states.
- Confirmation dialogs and generic form actions.
Additional work
- Translate role names for display while preserving role codes.
- Ensure directional icons such as Back/Next behave correctly in RTL.
- Replace physical CSS properties such as margin-left with logical properties such as margin-inline-start.
Completion criteria
The shell contains no unconditional English when Arabic is active.
L4 — Fully localize the English-only expansion screens
Address the screens currently outside the locale system.
L4A — Project Operations
Localize:
- Page title and description.
- Tabs.
- Table headings.
- Commercial and financial metrics.
- Empty states and actions.
- Procurement stage names.
- Status values.
- Material and project names using Arabic-first selection.
Target: frontend/src/pages/ProjectOperations.js
L4B — Procurement Comparison
Localize:
- Navigation entry.
- Page content.
- RFQ form.
- Comparison columns.
- Boolean values.
- Document buttons.
- Recommendation and empty states.
- Request/download errors.
Target: frontend/src/pages/ProcurementReview.js
L4C — Portals
Cover all four portal variants:
- Consultant.
- Client.
- Subcontractor.
- Supplier.
Localize:
- Titles and descriptions.
- Widget names and record fields.
- Empty states.
- Boolean and status values.
- All quick actions.
- All 39 prompts.
- Preview controls.
- Action Center and My Reviews.
- Dynamic API field names such as open_rfqs.
- Backend setup notes and empty labels.
Target: frontend/src/pages/PortalDashboard.js
Completion criteria
These routes contain no hardcoded user-facing English except approved acronyms and user-entered data.
L5 — Complete partially localized expansion modules
Convert remaining inline branches and English leaks into translation keys.
Work packages
1. QA/QC
   - ITP, WIR, punch items, corrective/preventive actions, mock-ups and calibration.
   - Severity, result, stage and status values.
   - Cancel buttons, placeholders, overdue indicators and serial labels.
2. HSE
   - Permits, incidents, near misses, JSA/risk assessments and registers.
   - Incident categories, likelihood, severity and results.
   - Dates, placeholders, buttons and raw statuses.
3. Document control
   - Document register, transmittals and correspondence.
   - Direction, purpose, type, revision and superseded state.
4. Schedule
   - Activities, Gantt, CPM, lookaheads, baselines and S-curve.
   - KPI labels, alert types and project-finish text.
5. Reports
   - Catalog controls, saved views, schedules and project reports.
   - Backend-provided report titles and column labels.
6. Handover
   - Lifecycle stages.
   - Package and claim statuses.
   - Asset headings.
   - Document/PDF actions.
7. Agent Activity
   - Roles, risks, decisions and execution statuses.
   - Server-generated reasons and summaries where system-generated.
8. Dashboard
   - Role-widget titles.
   - Widget metric keys.
   - Alert values and scopes.
   - Arabic-first entity-name selection.
Completion criteria
No expansion module renders raw English enums or English-only controls in Arabic mode.
L6 — Normalize dynamic values and formatting
Introduce shared presentation helpers instead of translating values separately on every screen.
Shared helpers
- translateStatus(value, t)
- translateRole(value, t)
- translatePriority(value, t)
- translateSeverity(value, t)
- translateEntityType(value, t)
- translateWorkflowAction(value, t)
- localizedName(record, locale, fields)
- formatDate(value, locale)
- formatDateTime(value, locale)
- formatNumber(value, locale)
- formatCurrency(value, locale, currency)
- formatPercent(value, locale)
Rules
- Send API values such as pending_approval unchanged.
- Render them through enums.status.pendingApproval.
- Never use replaceAll('_', ' ') as the user-facing translation.
- Arabic selection order:
  - name_ar
  - Arabic-neutral name
  - name_en
- English selection order:
  - name_en
  - neutral name
  - name_ar
- Apply the same approach to descriptions, titles, project names and material names.
Formatting
Remove hardcoded en-US formatting from shared formatters. Use:
- ar-EG for Arabic.
- en-EG or the selected English convention for English.
- Configurable Arabic digit behavior if business users prefer Western numerals.
- EGP/ج.م based on locale.
Completion criteria
Statuses and system values are translated consistently everywhere, and number/date formatting follows the selected language.
L7 — Localize API errors, notifications and server content
Frontend translation cannot reliably translate arbitrary English sentences returned by the server.
Error contract
Replace responses such as:
{ "error": "Inspection not found" }
with:
{
  "error": {
    "code": "inspection_not_found",
    "params": {}
  }
}
The frontend translates:
errors.inspectionNotFound
Work
- Add stable error codes to API responses.
- Include parameters for dynamic data.
- Preserve an English diagnostic message for logs if necessary, but do not use it as the primary UI content.
- Create a compatibility layer for older endpoints during migration.
- Localize validation errors from Joi or map them to stable codes.
- Convert system-generated notification/action titles to:
  - Translation key.
  - Parameters.
  - Optional rendered snapshot when historically required.
- Translate dashboard and portal contracts using keys rather than English titles.
- Pass locale through Accept-Language or an explicit locale parameter where the server must render content.
Do not translate
- User-entered titles and notes.
- External supplier/client content.
- Historical text intentionally stored as submitted.
- Internal codes and identifiers.
Completion criteria
API errors and system-generated messages render correctly in both languages without parsing English sentences.
L8 — Localize reports, CSV and PDF documents
This is a separate workstream because PDF rendering needs Arabic typography and direction support.
Work
- Add locale to report/export requests.
- Define EN/AR labels for:
  - Report catalog names.
  - Report packs.
  - Column headings.
  - Metadata.
  - Section titles.
  - Empty states.
- Localize CSV headers while preserving UTF-8 BOM.
- Embed a licensed Arabic-capable font.
- Add Arabic shaping and RTL-aware alignment.
- Handle mixed Arabic/Latin content such as document numbers.
- Mirror table alignment appropriately.
- Localize:
  - Procurement documents.
  - QA/QC documents.
  - HSE reports.
  - Handover documents.
  - Project reports.
- Translate system statuses inside exported rows.
- Keep filenames safe and predictable; localized display names can differ from stored/download filenames.
PDF acceptance checks
- Arabic glyphs are connected correctly.
- Text order is correct.
- Numbers and codes remain readable.
- Headers, table cells and page footers align correctly.
- Multi-page documents preserve font and direction.
- English documents remain unchanged.
Completion criteria
Arabic exports are genuinely readable Arabic documents, not English PDFs with a translated filename.
L9 — RTL layout and accessibility verification
Text translation alone does not guarantee a correct Arabic interface.
Work
- Replace left/right spacing with logical CSS properties.
- Review drawers, tabs, tables, breadcrumbs and back buttons.
- Mirror directional arrows where appropriate.
- Do not mirror neutral icons such as download, calendar or check.
- Verify charts and timelines individually.
- Test long Arabic labels in cards and narrow screens.
- Ensure form labels remain associated with controls.
- Localize:
  - aria-label
  - title
  - image alt
  - screen-reader status messages
- Set proper text direction for mixed-content inputs:
  - Email, URLs, document numbers and codes should often remain LTR.
  - Arabic titles and descriptions should follow RTL.
Completion criteria
All supported pages work at desktop and mobile sizes without clipped or reversed content.
L10 — Automated test coverage
Unit tests
- Locale provider behavior.
- Translation lookup and fallback.
- Namespace parity.
- Enum translation.
- Localized entity-name selection.
- Dates, numbers and currency.
- Error-code mapping.
Integration tests
- Toggle language while a page is mounted.
- Navigate after toggling.
- Refresh and restore locale.
- Load translations asynchronously.
- Display API errors in the selected language.
- Confirm Arabic-first record fields.
End-to-end matrix
Test each important route in both languages for representative roles:
- Owner/admin.
- Project manager.
- Site engineer.
- Consultant.
- Client.
- Subcontractor.
- Supplier.
- Finance/procurement/QHSE roles.
Static checks
Fail CI when:
- A locale key is missing.
- A namespace is empty.
- New JSX contains obvious hardcoded user-facing English.
- Direct raw status rendering is introduced.
- A server endpoint returns an unmapped user-facing error.
- An export lacks localized labels.
Visual regression
Capture both EN and AR for:
- Login and shell.
- Dashboard.
- Project workspace.
- Portals.
- Large tables.
- Modals.
- Reports.
- PDF sample pages.
Completion criteria
Every major route has at least one Arabic E2E assertion, and the toggle itself is tested without reloading.
L11 — Translation review and rollout
Work
- Have a native Arabic construction-domain reviewer verify terminology.
- Review abbreviations and Egyptian accounting vocabulary.
- Run role-based user acceptance testing.
- Deploy behind a localization-complete feature flag if needed.
- Log missing translation keys in development and staging.
- Track unmapped backend error codes.
- Prevent new hardcoded strings through the PR checklist and CI.
- Document how developers add new keys and localized enums.
Completion criteria
- Zero missing keys in production builds.
- Zero known English-only system strings in Arabic mode.
- No raw workflow enum values in either language.
- Arabic PDFs pass human review.
- Switching language never requires reauthentication or page reload.
Recommended implementation sequence
The practical delivery order is:
1. Global locale provider.
2. Translation catalog and parity tooling.
3. Application shell.
4. English-only screens.
5. Partially translated expansion modules.
6. Shared enum/data/formatting helpers.
7. Backend errors and server-generated labels.
8. Reports, CSV and PDFs.
9. RTL/accessibility cleanup.
10. Full automated and human QA.
11. Production rollout controls.
Each sub-phase (L0-L11) should be delivered as a separate reviewable change. L1–L3 must come first; otherwise later translations would continue relying on the broken non-reactive toggle.