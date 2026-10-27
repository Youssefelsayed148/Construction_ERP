# Arabic construction terminology and export review pack

Status: **pending native Egyptian construction-domain reviewer and Arabic role UAT**. Generated on 2026-10-27 (closeout Session F) from the current final glossary and the paired catalogs. This is a review worksheet, not a sign-off.

## Review checklist

- [ ] Confirm Arabic terminology for construction, procurement, contracts, QS, finance, QA/QC, HSE, planning, handover, and warranty in Egyptian usage.
- [ ] Check abbreviations and mixed Arabic/Latin text: C35, BOQ, RFQ, PR, PO, GRN, MIR, WIR, NCR, EGP, dates, email addresses, URLs, and document numbers.
- [ ] Inspect EN/AR screenshots at desktop and mobile sizes; baseline images are in [docs/i18n/baseline/screenshots/](i18n/baseline/screenshots/).
- [ ] Review the representative Arabic PDF screenshots and PDFs listed in [PDF_SPIKE.md](i18n/PDF_SPIKE.md). The spike chose the renderer that production export now uses; real exported documents still need native review.
- [ ] Record each proposed correction in the term table with its screen/export context, reviewer, and date.
- [ ] Re-run `npm run i18n:check` and `npm run i18n:parity` after accepted terminology edits.

## Representative rendered PDF evidence

| Sample | Arabic Chromium PDF and rendered PNG | Arabic PDFKit comparison |
|---|---|---|
| Invoice | [PDF](i18n/pdf-spike/invoice-ar-chromium.pdf) · [PNG](i18n/pdf-spike/invoice-ar-chromium-pdf-page-1.png) | [PDF](i18n/pdf-spike/invoice-ar-pdfkit.pdf) · [PNG](i18n/pdf-spike/invoice-ar-pdfkit-page-1.png) |
| Payment certificate | [PDF](i18n/pdf-spike/certificate-ar-chromium.pdf) · [PNG](i18n/pdf-spike/certificate-ar-chromium-pdf-page-1.png) | [PDF](i18n/pdf-spike/certificate-ar-pdfkit.pdf) · [PNG](i18n/pdf-spike/certificate-ar-pdfkit-page-1.png) |
| WIR register page 1 | [PNG](i18n/pdf-spike/register-ar-chromium-pdf-page-1.png) | [PNG](i18n/pdf-spike/register-ar-pdfkit-page-1.png) |
| WIR register page 2 | [PNG](i18n/pdf-spike/register-ar-chromium-pdf-page-2.png) | [PNG](i18n/pdf-spike/register-ar-pdfkit-page-2.png) |

## Construction and finance terminology review

Generated from the full glossary (97 entries). “Where used” follows the glossary section and names the likely module; add specific screens/exports during review. Leave the correction cell empty until the native reviewer proposes a change.

| Arabic term | English term | Where used | Reviewer corrections |
|---|---|---|---|
| جدول الكميات | Bill of Quantities (BOQ) | Documents and site records | |
| طلب استيضاح | Request for Information (RFI) | Documents and site records | |
| مستند للاعتماد | Submittal | Documents and site records | |
| طلب فحص أعمال | Work Inspection Request (WIR) | Documents and site records | |
| طلب فحص مواد | Material Inspection Request (MIR) | Documents and site records | |
| تقرير عدم مطابقة | Non-Conformance Report (NCR) | Documents and site records | |
| خطة الفحص والاختبار | Inspection and Test Plan (ITP) | Documents and site records | |
| تحليل سلامة الوظيفة | Job Safety Analysis (JSA) | Documents and site records | |
| تصريح عمل | Permit to Work | Documents and site records | |
| حادث وشيك | Near miss | Documents and site records | |
| حادث | Incident | Documents and site records | |
| محاضرة سلامة قبل العمل | Toolbox talk | Documents and site records | |
| إجراء تصحيحي ووقائي | Corrective and preventive action (CAPA) | Documents and site records | |
| قائمة الملاحظات النهائية | Punch list / snag | Documents and site records | |
| نموذج تنفيذي | Mock-up | Documents and site records | |
| معايرة | Calibration | Documents and site records | |
| تقرير يومي | Daily report | Documents and site records | |
| تعليمات موقع | Site instruction | Documents and site records | |
| ملاحظة | Observation | Documents and site records | |
| مراسلة إرسال مستندات | Transmittal | Documents and site records | |
| مراسلات | Correspondence | Documents and site records | |
| رسم / مواصفات | Drawing / Specification | Documents and site records | |
| رسومات التنفيذ الفعلي | As-built | Documents and site records | |
| التسليم | Handover | Documents and site records | |
| فترة ضمان العيوب | Defects Liability Period (DLP) | Documents and site records | |
| مطالبة ضمان | Warranty claim | Documents and site records | |
| دليل التشغيل والصيانة | O&M manual | Documents and site records | |
| طلب شراء | Purchase Requisition (PR) | Procurement, inventory, commercial, finance | |
| طلب عروض أسعار | Request for Quotation (RFQ) | Procurement, inventory, commercial, finance | |
| عرض سعر | Quotation | Procurement, inventory, commercial, finance | |
| مقارنة العروض | Bid comparison | Procurement, inventory, commercial, finance | |
| توصية الترسية | Award recommendation | Procurement, inventory, commercial, finance | |
| أمر شراء | Purchase Order (PO) | Procurement, inventory, commercial, finance | |
| توريد | Delivery | Procurement, inventory, commercial, finance | |
| إذن استلام بضاعة | Goods Receipt Note (GRN) | Procurement, inventory, commercial, finance | |
| مرتجع مورد | Supplier return | Procurement, inventory, commercial, finance | |
| المطابقة الثلاثية | Three-way match | Procurement, inventory, commercial, finance | |
| مخزن / مخزون | Warehouse / Stock | Procurement, inventory, commercial, finance | |
| حجز | Reservation | Procurement, inventory, commercial, finance | |
| إعادة الطلب / التوريد التلقائي | Reorder / replenishment | Procurement, inventory, commercial, finance | |
| أمر تغيير | Variation order | Procurement, inventory, commercial, finance | |
| استقطاع الضمان (محتجز الضمان) | Retention | Procurement, inventory, commercial, finance | |
| دفعة مقدمة | Advance payment | Procurement, inventory, commercial, finance | |
| مستخلص | Payment certificate | Procurement, inventory, commercial, finance | |
| تقييم الأعمال | Valuation | Procurement, inventory, commercial, finance | |
| فاتورة | Invoice | Procurement, inventory, commercial, finance | |
| الإفراج عن محتجز الضمان | Retention release | Procurement, inventory, commercial, finance | |
| الموازنة / التوقعات | Budget / Forecast | Procurement, inventory, commercial, finance | |
| التكلفة المقدرة عند الإنجاز | Estimate at completion (EAC) | Procurement, inventory, commercial, finance | |
| التزام | Commitment | Procurement, inventory, commercial, finance | |
| كود التكلفة | Cost code | Procurement, inventory, commercial, finance | |
| قيد يومية | Journal entry | Procurement, inventory, commercial, finance | |
| ضريبة (القيمة المضافة) | Tax (VAT) | Procurement, inventory, commercial, finance | |
| مشروع | Project | Projects, planning, organisation | |
| مرحلة / معلم رئيسي | Phase / Milestone | Projects, planning, organisation | |
| حزمة أعمال | Work package | Projects, planning, organisation | |
| هيكل تجزئة العمل | WBS | Projects, planning, organisation | |
| الجدول الزمني / نشاط | Schedule / Activity | Projects, planning, organisation | |
| المسار الحرج | Critical path (CPM) | Projects, planning, organisation | |
| خط الأساس | Baseline | Projects, planning, organisation | |
| الجدول قصير المدى | Look-ahead | Projects, planning, organisation | |
| منحنى S | S-curve | Projects, planning, organisation | |
| نسبة الإنجاز | Progress | Projects, planning, organisation | |
| موقع / منطقة / دور | Location / Zone / Floor | Projects, planning, organisation | |
| عميل / مالك | Client | Projects, planning, organisation | |
| استشاري | Consultant | Projects, planning, organisation | |
| مقاول من الباطن | Subcontractor | Projects, planning, organisation | |
| مورد | Supplier | Projects, planning, organisation | |
| مهندس موقع | Site engineer | Projects, planning, organisation | |
| مدير مشروع | Project manager | Projects, planning, organisation | |
| مهندس حصر كميات | Quantity surveyor | Projects, planning, organisation | |
| أمين مخزن | Storekeeper | Projects, planning, organisation | |
| مراقب مستندات | Document controller | Projects, planning, organisation | |
| المالك | Owner | Projects, planning, organisation | |
| إرسال | Submit | Workflow actions | |
| اعتماد | Approve | Workflow actions | |
| رفض | Reject | Workflow actions | |
| for revision إعادة للتعديل | Return | Workflow actions | |
| إسناد | Assign | Workflow actions | |
| مراجعة | Review | Workflow actions | |
| إغلاق | Close | Workflow actions | |
| إعادة فتح | Reopen | Workflow actions | |
| إلغاء | Cancel | Workflow actions | |
| إبطال | Void | Workflow actions | |
| إصدار. | Issue | Workflow actions | |
| مسودة | draft | Statuses (excerpt; the full set lives in `enums.status.*`) | |
| قيد الانتظار | pending | Statuses (excerpt; the full set lives in `enums.status.*`) | |
| بانتظار الاعتماد | pending_approval | Statuses (excerpt; the full set lives in `enums.status.*`) | |
| معتمد | approved | Statuses (excerpt; the full set lives in `enums.status.*`) | |
| مرفوض | rejected | Statuses (excerpt; the full set lives in `enums.status.*`) | |
| قيد التنفيذ | in_progress | Statuses (excerpt; the full set lives in `enums.status.*`) | |
| مكتمل | completed | Statuses (excerpt; the full set lives in `enums.status.*`) | |
| مغلق | closed | Statuses (excerpt; the full set lives in `enums.status.*`) | |
| ملغي | cancelled | Statuses (excerpt; the full set lives in `enums.status.*`) | |
| معلق | on_hold | Statuses (excerpt; the full set lives in `enums.status.*`) | |
| متأخر | overdue | Statuses (excerpt; the full set lives in `enums.status.*`) | |
| مفتوح. | open | Statuses (excerpt; the full set lives in `enums.status.*`) | |

## Per-screen pass/fail worksheet

The current English mobile route smoke passed for each listed route. Arabic text correctness is **not verified** by that smoke. “Screenshot pair” means a current EN/AR baseline image exists; screenshots are evidence for review, not a reviewer pass.

| Route | Screen | EN route smoke | Current EN/AR screenshot pair | Arabic content result | Reviewer correction / defect |
|---|---|---|---|---|---|
| /login | Login | PASS (EN route render / mobile overflow only) | Yes; linked below where applicable | NOT VERIFIED | |
| (shell) | Layout, Sidebar | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /dashboard | Dashboard | PASS (EN route render / mobile overflow only) | Yes; linked below where applicable | NOT VERIFIED | |
| /consultant-portal, /client-portal, /subcontractor-portal, /supplier-portal | PortalDashboard | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /inventory | Items | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /procurement/comparison | ProcurementReview | PASS (EN route render / mobile overflow only) | Yes; linked below where applicable | NOT VERIFIED | |
| /suppliers, /clients | Suppliers, Clients | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /legal, /approvals, /my-actions | Legal, Approvals, MyActions | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /expenses, /invoices | Expenses, Invoices | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /assets, /hr, /hr/payroll | Assets, HR, Payroll | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects, /projects/new | Projects, ProjectWizard | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id | ProjectDetail | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id/boq | BOQ | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id/work-orders | WorkOrders | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id/site, /site-workspace | SiteManagement, SiteWorkspace | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id/operations | ProjectOperations | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id/locations | LocationDashboard | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id/qhse | QHSE, QHSEExtended | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id/hse | HSE | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id/schedule | Schedule | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id/reports | Reports | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id/handover | Handover | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id/documents | ProjectDocuments, DocControlExtended | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /projects/:id/units | UnitsSales | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |
| /agent-activity | AgentActivity | PASS (EN route render / mobile overflow only) | Yes; linked below where applicable | NOT VERIFIED | |
| /settings | placeholder | PASS (EN route render / mobile overflow only) | No | NOT VERIFIED | |

## Reviewer sign-off

- Native Egyptian construction-domain reviewer: **pending**
- Arabic role-based UAT: **pending owner**
- Arabic terminology corrections: **none recorded yet; review pending**
- Production Arabic PDF/CSV export review: **pending native visual review**. Production PDF export is now implemented (headless Chromium + bundled IBM Plex fonts, `backend/src/utils/htmlPdf.js`, closeout F4) and machine-checked for Arabic text presence only; CSV keeps the UTF-8 BOM and neutralises formula prefixes. The sample files in the spike folder remain spike samples. **This pack is NOT a native-review sign-off.**

## Current paired catalog inventory

Generated from 37 EN/AR namespaces. The reviewer should add corrections in the term table above and confirm contextual usage on the screens below.

### actions

| Catalog key | English | Arabic |
|---|---|---|
| `actions.empty` | You have no open actions. | ليس لديك مهام مفتوحة. |
| `actions.myActions.acknowledge` | Acknowledge | إقرار |
| `actions.myActions.all` | All | الكل |
| `actions.myActions.awaitingMe` | Awaiting Me | بانتظاري |
| `actions.myActions.complete` | Complete | إنجاز |
| `actions.myActions.delegated` | Delegated | مُوكلة |
| `actions.myActions.delegatedTo` | Delegated to | مُوكلة إلى |
| `actions.myActions.due` | Due | تستحق |
| `actions.myActions.dueSoon` | Due Soon | تستحق قريباً |
| `actions.myActions.dueToday` | Due Today | تستحق اليوم |
| `actions.myActions.empty` | Nothing here. | لا يوجد شيء هنا. |
| `actions.myActions.markRead` | Mark read | تحديد كمقروء |
| `actions.myActions.noDue` | No due date | بدون موعد |
| `actions.myActions.noNotifs` | No notifications. | لا إشعارات. |
| `actions.myActions.notifications` | Notifications | الإشعارات |
| `actions.myActions.overdue` | Overdue | متأخرة |
| `actions.myActions.priority` | Priority | الأولوية |
| `actions.myActions.recentlyCompleted` | Recently Completed | منجزة حديثاً |
| `actions.myActions.source` | Source | المصدر |
| `actions.myActions.status` | Status | الحالة |
| `actions.myActions.title` | My Actions | مهامي |
| `actions.system.displayFailed` | Unable to display actions. Please try again. | تعذر عرض المهام. يرجى المحاولة مرة أخرى. |
| `actions.system.loading` | Loading... | جار التحميل... |
| `actions.system.retry` | Try again | حاول مرة أخرى |
| `actions.title` | My actions | مهامي |

### admin

| Catalog key | English | Arabic |
|---|---|---|
| `admin.actions.alerts` | Alerts | التنبيهات |
| `admin.actions.confirmVoid` | Confirm void | تأكيد الإلغاء |
| `admin.actions.create` | Create record | إنشاء سجل |
| `admin.actions.deactivate` | Deactivate | تعطيل |
| `admin.actions.edit` | Edit record | تعديل السجل |
| `admin.actions.loadProject` | Load project | تحميل المشروع |
| `admin.actions.policies` | Policies | السياسات |
| `admin.actions.post` | Post | ترحيل |
| `admin.actions.rotateSecret` | Rotate secret | تغيير المفتاح السري |
| `admin.actions.runSweep` | Run replenishment sweep | تشغيل مراجعة إعادة التوريد |
| `admin.actions.viewSla` | View SLA | عرض اتفاقية مستوى الخدمة |
| `admin.actions.void` | Void | إلغاء |
| `admin.apiTokens.title` | API tokens | رموز واجهة البرمجة |
| `admin.approvalLimits.title` | Approval limits | حدود الموافقات |
| `admin.delegations.title` | Delegations | التفويضات |
| `admin.fields.action` | Action | الإجراء |
| `admin.fields.amount` | Amount | المبلغ |
| `admin.fields.cause` | Cause | السبب |
| `admin.fields.city` | City | المدينة |
| `admin.fields.claim_number` | Claim | المطالبة |
| `admin.fields.code` | Code | الرمز |
| `admin.fields.contact_person` | Contact person | الشخص المسؤول |
| `admin.fields.created_at` | Created | تاريخ الإنشاء |
| `admin.fields.currency` | Currency | العملة |
| `admin.fields.delegate_from_name` | Delegated by | المفوِّض |
| `admin.fields.delegate_name` | Delegate | المفوَّض إليه |
| `admin.fields.delegate_user_id` | Delegate user ID | معرّف المستخدم المفوَّض إليه |
| `admin.fields.department` | Department | القسم |
| `admin.fields.description` | Description | الوصف |
| `admin.fields.doc_number` | Document number | رقم المستند |
| `admin.fields.doc_prefix` | Document prefix | بادئة المستند |
| `admin.fields.doc_type` | Document type | نوع المستند |
| `admin.fields.due_date` | Due date | تاريخ الاستحقاق |
| `admin.fields.email` | Email | البريد الإلكتروني |
| `admin.fields.enabled` | Enabled | مفعّل |
| `admin.fields.events` | Events | الأحداث |
| `admin.fields.events_json` | Events (JSON array) | الأحداث (JSON) |
| `admin.fields.expires_at` | Expires | تاريخ الانتهاء |
| `admin.fields.expires_in_days` | Expires in (days) | ينتهي خلال (أيام) |
| `admin.fields.id` | ID | المعرّف |
| `admin.fields.include_discipline` | Include discipline | تضمين التخصص |
| `admin.fields.include_type` | Include document type | تضمين نوع المستند |
| `admin.fields.is_active` | Active | نشط |
| `admin.fields.job_title` | Job title | المسمى الوظيفي |
| `admin.fields.lines_json` | Lines (JSON array) | بنود المستند (JSON) |
| `admin.fields.max_amount` | Maximum amount | الحد الأقصى للمبلغ |
| `admin.fields.mode` | Policy mode | وضع السياسة |
| `admin.fields.module_scope` | Module scope | نطاق الوحدة |
| `admin.fields.name` | Name | الاسم |
| `admin.fields.name_ar` | Name (Arabic) | الاسم بالعربية |
| `admin.fields.name_en` | Name (English) | الاسم بالإنجليزية |
| `admin.fields.notes` | Notes | ملاحظات |
| `admin.fields.org_type` | Organization type | نوع المؤسسة |
| `admin.fields.phone` | Phone | الهاتف |
| `admin.fields.project_id` | Project ID | معرّف المشروع |
| `admin.fields.project_ids_json` | Project IDs (JSON array) | معرّفات المشاريع (JSON) |
| `admin.fields.reason` | Reason | السبب |
| `admin.fields.recommended_amount` | Recommended amount | المبلغ الموصى به |
| `admin.fields.ref` | Scope reference | مرجع النطاق |
| `admin.fields.responsibility` | Responsibility | المسؤولية |
| `admin.fields.rev_prefix` | Revision prefix | بادئة المراجعة |
| `admin.fields.revoked_at` | Revoked | تاريخ الإلغاء |
| `admin.fields.role` | Role | الدور |
| `admin.fields.rule_key` | Policy key | مفتاح السياسة |
| `admin.fields.rule_value` | Policy | السياسة |
| `admin.fields.scope` | Policy scope | نطاق السياسة |
| `admin.fields.scopes` | Scopes | النطاقات |
| `admin.fields.scopes_text` | Scopes (comma separated) | النطاقات (مفصولة بفواصل) |
| `admin.fields.seq_pad` | Sequence padding | طول الرقم التسلسلي |
| `admin.fields.sla_days` | SLA days | أيام الاستجابة |
| `admin.fields.status` | Status | الحالة |
| `admin.fields.time_impact_days` | Time impact (days) | تأثير الوقت (أيام) |
| `admin.fields.title` | Title | العنوان |
| `admin.fields.token_prefix` | Token prefix | بادئة الرمز |
| `admin.fields.type` | Document type | نوع المستند |
| `admin.fields.updated_at` | Last updated | آخر تحديث |
| `admin.fields.url` | Webhook URL | عنوان إشعار الويب |
| `admin.fields.valid_from` | Valid from | ساري من |
| `admin.fields.valid_to` | Valid to | ساري حتى |
| `admin.fields.variation_number` | Variation | التغيير |
| `admin.fields.warehouse_id` | Warehouse ID | معرّف المخزن |
| `admin.inventoryDocuments.title` | Inventory documents | مستندات المخزون |
| `admin.inventoryDocuments.types` | Inventory document type | نوع مستند المخزون |
| `admin.messages.deactivated` | Record deactivated. | تم تعطيل السجل. |
| `admin.messages.permissionDenied` | You do not have permission to view this administration screen. | ليست لديك صلاحية لعرض شاشة الإدارة هذه. |
| `admin.messages.posted` | Document posted. | تم ترحيل المستند. |
| `admin.messages.saved` | Changes saved. | تم حفظ التغييرات. |
| `admin.messages.secretShownOnce` | Copy this signing secret now. It will not be shown again. | انسخ مفتاح التوقيع الآن، فلن يظهر مرة أخرى. |
| `admin.messages.sweepComplete` | Replenishment sweep completed. | اكتملت مراجعة إعادة التوريد. |
| `admin.messages.tokenShownOnce` | Copy this API token now. It will not be shown again. | انسخ رمز واجهة البرمجة الآن، فلن يظهر مرة أخرى. |
| `admin.messages.unknownArea` | This administration screen is unavailable. | شاشة الإدارة هذه غير متاحة. |
| `admin.messages.voided` | Document voided. | تم إلغاء المستند. |
| `admin.nav.areas` | Administration areas | أقسام الإدارة |
| `admin.numbering.title` | Document numbering | ترقيم المستندات |
| `admin.options.accountant_ap` | AP accountant | محاسب الدائنين |
| `admin.options.adjustments` | Adjustments | تسويات |
| `admin.options.admin` | Administrator | مدير النظام |
| `admin.options.alert_only` | Alert only | تنبيه فقط |
| `admin.options.approve_payment_certificate` | Approve payment certificate | اعتماد شهادة دفع |
| `admin.options.approve_supplier_invoice` | Approve supplier invoice | اعتماد فاتورة مورد |
| `admin.options.auto_draft_po` | Draft purchase order | إنشاء مسودة أمر شراء |
| `admin.options.auto_draft_pr` | Draft purchase request | إنشاء مسودة طلب شراء |
| `admin.options.auto_issue_po` | Issue purchase order | إصدار أمر شراء |
| `admin.options.category` | Category | فئة |
| `admin.options.client` | Client | عميل |
| `admin.options.client_instruction` | Client instruction | تعليمات العميل |
| `admin.options.consultant` | Consultant | استشاري |
| `admin.options.contractor` | Contractor | المقاول |
| `admin.options.contractor_request` | Contractor request | طلب المقاول |
| `admin.options.coo` | COO | مدير العمليات |
| `admin.options.default` | Default | افتراضي |
| `admin.options.design_change` | Design change | تغيير التصميم |
| `admin.options.engineer` | Engineer | مهندس |
| `admin.options.force_majeure` | Force majeure | قوة قاهرة |
| `admin.options.hr_manager` | HR manager | مدير الموارد البشرية |
| `admin.options.issue_client_invoice` | Issue client invoice | إصدار فاتورة عميل |
| `admin.options.issue_purchase_order` | Issue purchase order | إصدار أمر شراء |
| `admin.options.issues` | Issues | صرف |
| `admin.options.material` | Material | مادة |
| `admin.options.omission` | Omission | حذف بند |
| `admin.options.other` | Other | أخرى |
| `admin.options.owner` | Owner | المالك |
| `admin.options.owner_ceo` | Owner / CEO | المالك / الرئيس التنفيذي |
| `admin.options.project_manager` | Project manager | مدير المشروع |
| `admin.options.record_payment` | Record payment | تسجيل دفعة |
| `admin.options.regulatory` | Regulatory | متطلبات تنظيمية |
| `admin.options.release_retention` | Release retention | صرف مبلغ محتجز |
| `admin.options.returns` | Returns | مرتجعات |
| `admin.options.shared` | Shared | مشترك |
| `admin.options.site_condition` | Site condition | ظروف الموقع |
| `admin.options.site_engineer` | Site engineer | مهندس موقع |
| `admin.options.staff` | Staff | موظف |
| `admin.options.storekeeper` | Storekeeper | أمين المخزن |
| `admin.options.subcontractor` | Subcontractor | مقاول من الباطن |
| `admin.options.supplier` | Supplier | مورد |
| `admin.options.third_party` | Third party | طرف ثالث |
| `admin.options.void_financial_record` | Void financial record | إلغاء سجل مالي |
| `admin.organizations.title` | Organizations | المؤسسات |
| `admin.replenishment.title` | Replenishment | إعادة التوريد |
| `admin.replenishment.views` | Replenishment views | طرق عرض إعادة التوريد |
| `admin.sla.title` | Warranty claim SLA | مدة استجابة مطالبات الضمان |
| `admin.users.title` | Users and roles | المستخدمون والأدوار |
| `admin.variations.title` | Project variations | تغييرات المشروع |
| `admin.webhooks.title` | Webhooks | إشعارات الويب |

### agents

| Catalog key | English | Arabic |
|---|---|---|
| `agents.decisions` | Decisions | القرارات |
| `agents.system.agentActivity` | Agent Activity | نشاط الوكلاء |
| `agents.system.agentRequests` | Agent requests | طلبات الوكلاء |
| `agents.system.apply` | Apply | تطبيق |
| `agents.system.approveExecute` | Approve & execute | اعتماد وتنفيذ |
| `agents.system.authorized` | Authorized | مصرح؟ |
| `agents.system.awaitingApproval` | awaiting approval | بانتظار الموافقة |
| `agents.system.commentOptional` | comment (optional) | تعليق (اختياري) |
| `agents.system.draft` | draft | مسودة |
| `agents.system.everyToolCallRunsTheSamePermissionEngineAsThe` | Every tool call runs the same permission engine as the UI; high-risk actions execute only after a human approval. | كل استدعاء أداة يمر بنفس محرك الصلاحيات الذي تستخدمه الواجهة؛ الإجراءات عالية المخاطر لا تُنفذ إلا بعد موافقة بشرية. |
| `agents.system.noAgentRequestsYet` | No agent requests yet. | لا توجد طلبات وكلاء بعد. |
| `agents.system.noToolCallsYet` | No tool calls yet. | لا توجد استدعاءات بعد. |
| `agents.system.pending` | pending | معلق |
| `agents.system.reason` | Reason | السبب |
| `agents.system.refresh` | Refresh | تحديث |
| `agents.system.reject` | Reject | رفض |
| `agents.system.requiredApprover` | Required approver | مطلوب موافقة |
| `agents.system.response` | Response | الاستجابة |
| `agents.system.risk` | Risk | النوع |
| `agents.system.session` | Session | الجلسة |
| `agents.system.status` | Status | الحالة |
| `agents.system.time` | Time | الوقت |
| `agents.system.tool` | Tool | الأداة |
| `agents.system.toolCallLog` | Tool call log | سجل استدعاءات الأدوات |
| `agents.system.tx` | tx # | معاملة رقم |
| `agents.system.user` | User | مستخدم |
| `agents.system.user2` | User | المستخدم |
| `agents.title` | Agent activity | نشاط الوكلاء |

### approvals

| Catalog key | English | Arabic |
|---|---|---|
| `approvals.pending` | Pending approvals | الموافقات المعلقة |
| `approvals.system.allModules` | All Modules | كل الوحدات |
| `approvals.system.allStatuses` | All Statuses | كل الحالات |
| `approvals.system.approvalTimeline` | Approval timeline | مسار الاعتماد |
| `approvals.system.approve` | Approve | اعتماد |
| `approvals.system.approver` | Approver | المعتمد |
| `approvals.system.auditLog` | Audit Log | سجل الموافقات |
| `approvals.system.awaiting` | Awaiting | قيد الانتظار |
| `approvals.system.close` | Close | إغلاق |
| `approvals.system.date` | Date | التاريخ |
| `approvals.system.decisionNotesOptional` | Decision notes (optional) | ملاحظات القرار (اختياري) |
| `approvals.system.done` | Done | تم |
| `approvals.system.egp` | EGP | ج.م |
| `approvals.system.manager` | Manager | المدير |
| `approvals.system.module` | Module | الوحدة |
| `approvals.system.myRequests` | My Requests | طلباتي |
| `approvals.system.noPendingRequests` | No pending requests | لا توجد طلبات معلقة |
| `approvals.system.noRecordsFound` | No records found | لا توجد سجلات |
| `approvals.system.noRequestsSubmitted` | No requests submitted | لا توجد طلبات مقدمة |
| `approvals.system.pendingApprovals` | Pending Approvals | الموافقات المعلقة |
| `approvals.system.reasonForApprovalOrRejection` | Reason for approval or rejection… | سبب الاعتماد أو الرفض… |
| `approvals.system.reject` | Reject | رفض |
| `approvals.system.rejected` | Rejected | مرفوض |
| `approvals.system.requestDetails` | Request details | تفاصيل الطلب |
| `approvals.system.requestNote` | Request note | ملاحظة الطلب |
| `approvals.system.requester` | Requester | مقدم الطلب |
| `approvals.system.requester2` | Requester: | مقدم الطلب: |
| `approvals.system.reviewAndApprovePendingRequests` | Review and approve pending requests | مراجعة واعتماد الطلبات المعلقة |
| `approvals.system.sourceRecordDeleted` | Source record deleted | السجل الأصلي محذوف |
| `approvals.system.stage` | Stage | المرحلة |
| `approvals.system.theUnderlyingRecordCouldNotBeLoadedForThisRequest` | The underlying record could not be loaded for this request type. | تعذّر العثور على السجل الأصلي لهذا النوع من الطلبات. |
| `approvals.system.type` | Type | النوع |
| `approvals.system.upcoming` | Upcoming | لاحقاً |
| `approvals.system.updated` | Updated | آخر تحديث |
| `approvals.system.viewOnly` | View only | للعرض فقط |
| `approvals.title` | Approvals | الموافقات |

### assets

| Catalog key | English | Arabic |
|---|---|---|
| `assets.inactiveProject` | Inactive project | مشروع غير نشط |
| `assets.maintenance` | Maintenance | الصيانة |
| `assets.system.addEquipment` | Add Equipment | إضافة معدة |
| `assets.system.addNewEquipment` | Add New Equipment | إضافة معدة جديدة |
| `assets.system.available` | Available | متاحة |
| `assets.system.dailyRate` | Daily Rate | سعر اليوم |
| `assets.system.edit` | Edit: {code} | تعديل: {code} |
| `assets.system.englishName` | English Name * | الاسم بالإنجليزية * |
| `assets.system.equipmentType` | Equipment Type | نوع المعدة |
| `assets.system.hourlyRate` | Hourly Rate | سعر الساعة |
| `assets.system.inUse` | In Use | قيد الاستخدام |
| `assets.system.inYardUnassigned` | In Yard (Unassigned) | في المخزن (غير مخصصة) |
| `assets.system.location` | Location | الموقع |
| `assets.system.maintenance` | Maintenance | صيانة |
| `assets.system.manufacturer` | Manufacturer | الشركة المصنعة |
| `assets.system.model` | Model | الموديل |
| `assets.system.noEquipmentFoundAddYourFirstEquipment` | No equipment found. Add your first equipment. | لا توجد معدات. أضف أول معدة. |
| `assets.system.operatorRequired` | Operator Required | تحتاج مشغل |
| `assets.system.owned` | Owned | مملوكة |
| `assets.system.projectEquipmentAssetManagement` | Project Equipment & Asset Management | إدارة معدات وأصول المشروع |
| `assets.system.purchaseCost` | Purchase Cost | تكلفة الشراء |
| `assets.system.purchaseDate` | Purchase Date | تاريخ الشراء |
| `assets.system.rented` | Rented | مستأجرة |
| `assets.system.searchEquipment` | Search equipment... | بحث عن معدة... |
| `assets.system.selectCategory` | Select Category | اختر الفئة |
| `assets.system.selectType` | Select Type | اختر النوع |
| `assets.system.serialNumber` | Serial Number | الرقم التسلسلي |
| `assets.system.type` | Type | النوع |
| `assets.title` | Equipment | المعدات |

### auth

| Catalog key | English | Arabic |
|---|---|---|
| `auth.login.email` | Email | البريد الإلكتروني |
| `auth.login.failed` | Login failed | فشل تسجيل الدخول |
| `auth.login.hidePassword` | Hide password | إخفاء كلمة المرور |
| `auth.login.password` | Password | كلمة المرور |
| `auth.login.showPassword` | Show password | إظهار كلمة المرور |
| `auth.login.submit` | Sign In | تسجيل الدخول |
| `auth.login.subtitle` | Construction Project Management System | نظام إدارة مشاريع الإنشاءات |
| `auth.login.switchLanguage` | التبديل إلى العربية | Switch to English |
| `auth.login.title` | Sign in | تسجيل الدخول |
| `auth.session.expired` | Your session has expired. Please sign in again. | انتهت جلستك. يرجى تسجيل الدخول مرة أخرى. |

### boq

| Catalog key | English | Arabic |
|---|---|---|
| `boq.delete.itemTitle` | Delete BOQ item | حذف بند جدول الكميات |
| `boq.delete.message` | This removes the entry from the BOQ. It is refused if measurements, allocations, recipes or other records use it. | سيتم حذف هذا الإدخال من جدول الكميات. يُرفض الحذف إذا كانت تستخدمه قياسات أو توزيعات أو وصفات أو سجلات أخرى. |
| `boq.delete.sectionTitle` | Delete BOQ section | حذف قسم جدول الكميات |
| `boq.empty` | No BOQ items yet. | لا توجد بنود في جدول الكميات بعد. |
| `boq.system.addItem` | Add Item | إضافة بند |
| `boq.system.addNewItem` | Add New Item | إضافة بند جديد |
| `boq.system.addNewSection` | Add New Section | إضافة قسم جديد |
| `boq.system.addSection` | Add Section | إضافة قسم |
| `boq.system.avgCompletion` | Avg. Completion | متوسط الإنجاز |
| `boq.system.billOfQuantitiesForProject` | Bill of Quantities for Project | حصر الكميات للمشروع |
| `boq.system.boqSummaryByType` | BOQ Summary by Type | ملخص التكاليف حسب النوع |
| `boq.system.completion` | Completion | إنجاز |
| `boq.system.editItem` | Edit Item | تعديل البند |
| `boq.system.editSection` | Edit Section | تعديل القسم |
| `boq.system.englishDescription` | English Description * | الوصف بالإنجليزية * |
| `boq.system.englishName` | English Name * | الاسم بالإنجليزية * |
| `boq.system.grandTotal` | Grand Total | الإجمالي الكلي |
| `boq.system.item` | Item | بند |
| `boq.system.items` | Items | البنود |
| `boq.system.items2` | items | بنود |
| `boq.system.masterItemOptional` | Master Item (optional) | المادة الرئيسية (اختياري) |
| `boq.system.noBoqSectionsYetAddYourFirstSection` | No BOQ sections yet. Add your first section. | لا توجد أقسام بعد. أضف أول قسم. |
| `boq.system.parentSection` | Parent Section | القسم الأب |
| `boq.system.rootSection` | — Root Section — | — بلا أب (قسم رئيسي) — |
| `boq.system.searchMasterItem` | Search master item... | ابحث عن مادة... |
| `boq.system.section` | Section | القسم |
| `boq.system.sections` | Sections | الأقسام |
| `boq.system.selectSection` | — Select Section — | — اختر القسم — |
| `boq.system.sortOrder` | Sort Order | ترتيب الفرز |
| `boq.system.unitRate` | Unit Rate | سعر الوحدة |
| `boq.title` | Bill of Quantities | جدول الكميات |

### clients

| Catalog key | English | Arabic |
|---|---|---|
| `clients.empty` | No clients yet. | لا يوجد عملاء بعد. |
| `clients.system.active` | Active | نشط |
| `clients.system.addClient` | Add Client | إضافة عميل |
| `clients.system.addNewClient` | Add New Client | إضافة عميل جديد |
| `clients.system.address` | Address | العنوان |
| `clients.system.balance` | Balance | الرصيد |
| `clients.system.city` | City | المدينة |
| `clients.system.clientDatabase` | Client Database | قاعدة بيانات العملاء |
| `clients.system.clientType` | Client Type | نوع العميل |
| `clients.system.contactPerson` | Contact Person | الشخص المسؤول |
| `clients.system.creditLimit` | Credit Limit | الحد الائتماني |
| `clients.system.edit` | Edit: {code} | تعديل: {code} |
| `clients.system.egp` | (EGP) | (ج.م.) |
| `clients.system.email` | Email | البريد الإلكتروني |
| `clients.system.englishName` | English Name * | الاسم بالإنجليزية * |
| `clients.system.inactive` | Inactive | غير نشط |
| `clients.system.noClientsFoundAddYourFirstClient` | No clients found. Add your first client. | لا يوجد عملاء. أضف أول عميل. |
| `clients.system.paymentTerms` | Payment Terms | شروط الدفع |
| `clients.system.phone` | Phone | الهاتف |
| `clients.system.searchClients` | Search clients... | بحث عن عملاء... |
| `clients.system.selectCity` | Select City | اختر المدينة |
| `clients.system.taxId` | Tax ID | الرقم الضريبي |
| `clients.system.totalClients` | Total Clients | إجمالي العملاء |
| `clients.system.totalCreditLimit` | Total Credit Limit | إجمالي الحد الائتماني |
| `clients.system.totalOutstandingBalance` | Total Outstanding Balance | إجمالي الأرصدة المستحقة |
| `clients.title` | Clients | العملاء |

### commercial

| Catalog key | English | Arabic |
|---|---|---|
| `commercial.budget` | Budget | الموازنة |
| `commercial.fields.actual_cost` | Actual cost | التكلفة الفعلية |
| `commercial.fields.approved_variations` | Approved variations | التغييرات المعتمدة |
| `commercial.fields.cash_contribution` | Cash contribution | صافي المساهمة النقدية |
| `commercial.fields.committed_cost` | Committed cost | التكلفة المرتبطة |
| `commercial.fields.current_budget` | Current budget | الميزانية الحالية |
| `commercial.fields.eac` | Estimate at completion (EAC) | التكلفة المقدرة عند الإكمال |
| `commercial.fields.forecast_profit` | Forecast profit | الربح المتوقع |
| `commercial.fields.original_contract` | Original contract | قيمة العقد الأصلية |
| `commercial.fields.revised_contract` | Revised contract | قيمة العقد المعدلة |
| `commercial.title` | Commercial | الشؤون التجارية |
| `commercial.variations` | Variations | أوامر التغيير |

### common

| Catalog key | English | Arabic |
|---|---|---|
| `common.actions` | Actions | الإجراءات |
| `common.active` | Active | نشط |
| `common.address` | Address | العنوان |
| `common.all` | All | الكل |
| `common.amount` | Amount | المبلغ |
| `common.appName` | Construction ERP | نظام إدارة الإنشاءات |
| `common.appShortName` | ConERP | ConERP |
| `common.back` | Back | رجوع |
| `common.buttons.add` | Add | إضافة |
| `common.buttons.apply` | Apply | تطبيق |
| `common.buttons.discard` | Discard | تجاهل |
| `common.buttons.download` | Download | تنزيل |
| `common.buttons.refresh` | Refresh | تحديث |
| `common.buttons.remove` | Remove | إزالة |
| `common.buttons.reset` | Reset | إعادة تعيين |
| `common.buttons.saveChanges` | Save changes | حفظ التغييرات |
| `common.buttons.upload` | Upload | رفع |
| `common.cancel` | Cancel | إلغاء |
| `common.category` | Category | الفئة |
| `common.close` | Close | إغلاق |
| `common.code` | Code | الكود |
| `common.confirm` | Confirm | تأكيد |
| `common.create` | Create | إنشاء |
| `common.createdAt` | Created | تاريخ الإنشاء |
| `common.currency` | EGP | ج.م |
| `common.date` | Date | التاريخ |
| `common.delete` | Delete | حذف |
| `common.description` | Description | الوصف |
| `common.details` | Details | تفاصيل |
| `common.dialogs.addInspectionPointTitle` | Add inspection point | إضافة نقطة فحص |
| `common.dialogs.amendCorrespondenceTitle` | Amend correspondence | تعديل المراسلة |
| `common.dialogs.amendedBodyLabel` | Amended body | المحتوى المعدل |
| `common.dialogs.approvalNotesLabel` | Notes (optional) | ملاحظات (اختياري) |
| `common.dialogs.approvalNotesTitle` | Approval decision | قرار الموافقة |
| `common.dialogs.closeInstructionTitle` | Close engineer instruction | إغلاق تعليمات المهندس |
| `common.dialogs.closingResponseLabel` | Closing response (optional) | ملاحظات الإغلاق (اختياري) |
| `common.dialogs.confirmDelete` | Delete this record? This cannot be undone. | هل تريد حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء. |
| `common.dialogs.confirmTitle` | Please confirm | يرجى التأكيد |
| `common.dialogs.contractUnitTitle` | Contract unit | تعاقد على الوحدة |
| `common.dialogs.handoverClaimLabel` | Claim title | عنوان المطالبة |
| `common.dialogs.handoverClaimTitle` | New warranty claim | مطالبة ضمان جديدة |
| `common.dialogs.inspectionCriteriaLabel` | Acceptance criteria | معايير القبول |
| `common.dialogs.inspectionPointTitleLabel` | Inspection point title | عنوان نقطة الفحص |
| `common.dialogs.inspectionPointTypeLabel` | Point type | نوع النقطة |
| `common.dialogs.reasonLabel` | Reason | السبب |
| `common.dialogs.reasonNotesLabel` | Reason or notes (optional) | السبب أو الملاحظات (اختياري) |
| `common.dialogs.reasonOptionalLabel` | Reason (optional) | السبب (اختياري) |
| `common.dialogs.reasonRequired` | Please enter a reason. | يرجى إدخال السبب. |
| `common.dialogs.resolveNcrLabel` | Resolution notes | ملاحظات الحل |
| `common.dialogs.resolveNcrTitle` | Resolve non-conformance | إغلاق حالة عدم المطابقة |
| `common.dialogs.saveViewLabel` | View name | اسم العرض |
| `common.dialogs.saveViewTitle` | Save view | حفظ العرض |
| `common.dialogs.sitePhotoCaption` | Photo caption | وصف الصورة |
| `common.dialogs.sitePhotoTitle` | Add site photo | إضافة صورة للموقع |
| `common.dialogs.soldAmountLabel` | Sold amount | قيمة البيع |
| `common.dialogs.submittalResponseTitle` | Respond to submittal | الرد على الاعتماد |
| `common.dialogs.typeToConfirm` | Type "{value}" to confirm. | اكتب "{value}" للتأكيد. |
| `common.dialogs.unsavedChanges` | You have unsaved changes. Leave without saving? | لديك تغييرات غير محفوظة. هل تريد المغادرة دون حفظ؟ |
| `common.edit` | Edit | تعديل |
| `common.email` | Email | البريد |
| `common.export` | Export | تصدير |
| `common.filter` | Filter | تصفية |
| `common.footer` | Construction ERP by Osiris Labs | نظام إدارة الإنشاءات من Osiris Labs |
| `common.inactive` | Inactive | غير نشط |
| `common.language.ar` | Arabic | العربية |
| `common.language.en` | English | English |
| `common.loading` | Loading... | جاري التحميل... |
| `common.name` | Name | الاسم |
| `common.nav.accounting` | Accounting | المحاسبة |
| `common.nav.approvals` | Approvals | الموافقات |
| `common.nav.assets` | Equipment | المعدات |
| `common.nav.boq` | Bill of Quantities | جدول الكميات |
| `common.nav.clients` | Clients | العملاء |
| `common.nav.dashboard` | Dashboard | لوحة التحكم |
| `common.nav.expenses` | Expenses | المصروفات |
| `common.nav.finance` | Finance | المالية |
| `common.nav.hr` | HR | الموارد البشرية |
| `common.nav.inventory` | Inventory | المخزون |
| `common.nav.invoices` | Invoices & Payments | الفواتير والمدفوعات |
| `common.nav.legal` | Legal | القسم القانوني |
| `common.nav.maintenance` | Maintenance | الصيانة |
| `common.nav.myActions` | My Actions | مهامي |
| `common.nav.payroll` | Payroll | الرواتب |
| `common.nav.projects` | Projects | المشاريع |
| `common.nav.settings` | Settings | الإعدادات |
| `common.nav.subcontractors` | Subcontractors | المقاولين الفرعيين |
| `common.nav.suppliers` | Suppliers | الموردين |
| `common.nav.workOrders` | Work Orders | أوامر العمل |
| `common.next` | Next | التالي |
| `common.no` | No | لا |
| `common.none` | None | لا شيء |
| `common.notes` | Notes | ملاحظات |
| `common.pagination.items.one` | {count} item | عنصر واحد |
| `common.pagination.items.other` | {count} items | {count} عنصر |
| `common.pagination.loadMore` | Load more | تحميل المزيد |
| `common.pagination.page` | Page {page} of {total} | صفحة {page} من {total} |
| `common.pagination.showing` | Showing {loaded} of {total} | عرض {loaded} من {total} |
| `common.phone` | Phone | الهاتف |
| `common.print` | Print | طباعة |
| `common.quantity` | Quantity | الكمية |
| `common.save` | Save | حفظ |
| `common.search` | Search | بحث |
| `common.select` | Select | اختر |
| `common.states.empty` | Nothing to show yet. | لا يوجد ما يمكن عرضه بعد. |
| `common.states.error` | Something went wrong. | حدث خطأ ما. |
| `common.states.fileUnavailable` | This file is not available. | هذا الملف غير متاح. |
| `common.states.loading` | Loading... | جارٍ التحميل... |
| `common.states.noResults` | No results match your search. | لا توجد نتائج مطابقة للبحث. |
| `common.states.retry` | Try again | إعادة المحاولة |
| `common.status` | Status | الحالة |
| `common.statuses.active` | Active | نشط |
| `common.statuses.approved` | Approved | معتمد |
| `common.statuses.cancelled` | Cancelled | ملغي |
| `common.statuses.certified` | Certified | معتمد ماليًا |
| `common.statuses.closed` | Closed | مغلق |
| `common.statuses.completed` | Completed | مكتمل |
| `common.statuses.draft` | Draft | مسودة |
| `common.statuses.in_progress` | In Progress | قيد التنفيذ |
| `common.statuses.inactive` | Inactive | غير نشط |
| `common.statuses.on_hold` | On Hold | متوقف |
| `common.statuses.overdue` | Overdue | متأخر |
| `common.statuses.paid` | Paid | مدفوع |
| `common.statuses.pending` | Pending | معلق |
| `common.statuses.planning` | Planning | تخطيط |
| `common.statuses.rejected` | Rejected | مرفوض |
| `common.statuses.unpaid` | Unpaid | غير مدفوع |
| `common.statuses.verified` | Verified | تم التحقق |
| `common.submit` | Submit | إرسال |
| `common.suppliers` | Suppliers | الموردون |
| `common.system.kb` | KB | كيلوبايت |
| `common.toast.dismiss` | Dismiss | إغلاق |
| `common.total` | Total | الإجمالي |
| `common.type` | Type | النوع |
| `common.unit` | Unit | الوحدة |
| `common.updatedAt` | Updated | آخر تحديث |
| `common.upload.attachments` | Attachments | المرفقات |
| `common.upload.choose` | Choose files to upload | اختر الملفات للرفع |
| `common.upload.limits` | Up to {count} files, {size} MB each. | بحد أقصى {count} ملفات، {size} ميجابايت لكل ملف. |
| `common.upload.remove` | Remove {name} | إزالة {name} |
| `common.upload.tooLarge` | Each file must be {size} MB or smaller. | يجب ألا يتجاوز حجم الملف {size} ميجابايت. |
| `common.upload.tooMany` | You can upload at most {count} files. | يمكنك رفع {count} ملفات كحد أقصى. |
| `common.upload.uploading` | Uploading... | جارٍ الرفع... |
| `common.validation.format` | Enter a valid value. | أدخل قيمة صحيحة. |
| `common.validation.invalid` | This field is invalid. | هذا الحقل غير صالح. |
| `common.validation.max` | The value is above the allowed maximum. | القيمة أعلى من الحد الأقصى المسموح. |
| `common.validation.maxLength` | This value is too long. | القيمة أطول من الحد المسموح. |
| `common.validation.min` | The value is below the allowed minimum. | القيمة أقل من الحد الأدنى المسموح. |
| `common.validation.required` | This field is required. | هذا الحقل مطلوب. |
| `common.view` | View | عرض |
| `common.welcome` | Welcome | مرحباً |
| `common.yes` | Yes | نعم |

### costing

| Catalog key | English | Arabic |
|---|---|---|
| `costing.empty` | No cost data yet. | لا توجد بيانات تكاليف بعد. |
| `costing.title` | Costing | التكاليف |

### dashboard

| Catalog key | English | Arabic |
|---|---|---|
| `dashboard.alerts.title` | Alerts | التنبيهات |
| `dashboard.noteScopes.company` | Company | الشركة |
| `dashboard.noteScopes.location` | Location | موقع |
| `dashboard.noteScopes.personal` | Personal | شخصي |
| `dashboard.noteScopes.project` | Project | مشروع |
| `dashboard.progressSources.none` | None | لا يوجد |
| `dashboard.progressSources.quantities` | Quantities | الكميات |
| `dashboard.progressSources.schedule` | Schedule | الجدول الزمني |
| `dashboard.roleTitle` | My role dashboard | لوحة دوري |
| `dashboard.stickyNotes` | Sticky notes | الملاحظات السريعة |
| `dashboard.system.active` | active | نشط |
| `dashboard.system.active2` | active | متاح |
| `dashboard.system.activeClients` | active clients | عملاء نشطون |
| `dashboard.system.activeProjects` | Active Projects | مشاريع نشطة |
| `dashboard.system.activeStaff` | active staff | موظفون نشطون |
| `dashboard.system.alerts` | Alerts | تنبيهات |
| `dashboard.system.atRisk` | at risk | متعثر |
| `dashboard.system.avgDone` | avg done | متوسط الإنجاز |
| `dashboard.system.awaitingOwner` | awaiting owner | بانتظار المالك |
| `dashboard.system.collected` | collected | محصّل |
| `dashboard.system.documents` | documents | مستندات |
| `dashboard.system.expenses` | expenses | مصروفات |
| `dashboard.system.expenses2` | Expenses | المصروفات |
| `dashboard.system.finance` | Finance | المالية |
| `dashboard.system.financeSummary` | Finance Summary | الملخص المالي |
| `dashboard.system.items` | items | أصناف |
| `dashboard.system.last` | last | آخر تقرير |
| `dashboard.system.lowStock` | low stock | مخزون منخفض |
| `dashboard.system.maintDue` | maint. due | صيانة مستحقة |
| `dashboard.system.milestoneOverdue` | milestone overdue | معلم متأخر |
| `dashboard.system.moduleSummary` | Module Summary | ملخص الوحدات |
| `dashboard.system.netProfit` | Net Profit | صافي الربح |
| `dashboard.system.noFinancialDataYet` | No financial data yet. | لا توجد بيانات مالية بعد. |
| `dashboard.system.noSiteReport` | no site report filed in 2+ days | لم يتم تقديم تقرير موقع منذ يومين أو أكثر |
| `dashboard.system.oldestDays` | oldest (days) | أقدم طلب (يوم) |
| `dashboard.system.openAlerts` | Open Alerts | تنبيهات |
| `dashboard.system.outstanding` | Outstanding | مستحقات غير محصلة |
| `dashboard.system.outstanding2` | outstanding | غير محصّل |
| `dashboard.system.outstanding3` | Outstanding | المستحقات |
| `dashboard.system.overBudget` | over budget | تجاوز الميزانية |
| `dashboard.system.overdue` | overdue | متأخرة |
| `dashboard.system.overdue2` | overdue | متأخر عن موعده |
| `dashboard.system.overdueInv` | overdue inv. | فواتير متأخرة |
| `dashboard.system.paid` | paid | مدفوعة |
| `dashboard.system.pending` | pending | بانتظار الاعتماد |
| `dashboard.system.pending2` | pending | قيد المراجعة |
| `dashboard.system.pending3` | pending | معلقة |
| `dashboard.system.pendingApprovals` | Pending Approvals | موافقات معلقة |
| `dashboard.system.pendingLeave` | pending leave | إجازات معلقة |
| `dashboard.system.planning` | planning | تخطيط |
| `dashboard.system.presentToday` | present today | حضور اليوم |
| `dashboard.system.projectsAtRisk` | Projects at Risk | مشاريع متعثرة |
| `dashboard.system.revenueCollected` | Revenue Collected | الإيرادات المحصلة |
| `dashboard.system.sent` | sent | مرسلة |
| `dashboard.system.subcontractors` | subcontractors | مقاولو الباطن |
| `dashboard.system.suppliers` | suppliers | موردون |
| `dashboard.system.thisMonth` | this month | هذا الشهر |
| `dashboard.system.total` | total | الكل |
| `dashboard.system.total2` | total | إجمالي |
| `dashboard.system.warehouses` | warehouses | مستودعات |
| `dashboard.title` | Dashboard | لوحة التحكم |
| `dashboard.welcome` | Welcome back, {name} | مرحبًا بعودتك، {name} |
| `dashboard.widgets.baseline_vs_actual.title` | Baseline vs actual | الخط الأساس مقابل الفعلي |
| `dashboard.widgets.boq_measurements.title` | BOQ & measurements | جدول الكميات والقياسات |
| `dashboard.widgets.budget_eac.title` | Budget & commitments | الميزانية والالتزامات |
| `dashboard.widgets.capa.title` | Corrective actions | الإجراءات التصحيحية |
| `dashboard.widgets.commercial_risk.title` | Commercial risk | المخاطر التجارية |
| `dashboard.widgets.consultant_comments.title` | Consultant observations | ملاحظات الاستشاري |
| `dashboard.widgets.cost_invoices.title` | Cost & invoices | التكاليف والفواتير |
| `dashboard.widgets.critical_activities.title` | Critical activities | الأنشطة الحرجة |
| `dashboard.widgets.delays.title` | Delays | التأخيرات |
| `dashboard.widgets.deliveries.title` | Deliveries pending MIR | توريدات بانتظار فحص المواد |
| `dashboard.widgets.fields.achieved` | achieved | المتحقق |
| `dashboard.widgets.fields.active` | active | النشط |
| `dashboard.widgets.fields.active_permits` | active permits | التصاريح النشطة |
| `dashboard.widgets.fields.alerts` | alerts | التنبيهات |
| `dashboard.widgets.fields.approved_measurements` | approved measurements | القياسات المعتمدة |
| `dashboard.widgets.fields.approved_qty` | approved qty | الكمية المعتمدة |
| `dashboard.widgets.fields.at_risk` | at risk | المعرض للخطر |
| `dashboard.widgets.fields.available` | available | المتاح |
| `dashboard.widgets.fields.avg_completion` | avg completion | متوسط الإنجاز |
| `dashboard.widgets.fields.avg_percent` | avg percent | متوسط نسبة الإنجاز |
| `dashboard.widgets.fields.avg_progress` | avg progress | متوسط التقدم |
| `dashboard.widgets.fields.awaiting` | awaiting | بانتظار الإجراء |
| `dashboard.widgets.fields.awaiting_rectification` | awaiting rectification | بانتظار التصحيح |
| `dashboard.widgets.fields.baselines` | baselines | خطوط الأساس |
| `dashboard.widgets.fields.budgets` | budgets | الميزانيات |
| `dashboard.widgets.fields.collected` | collected | المحصل |
| `dashboard.widgets.fields.commitments` | commitments | الالتزامات |
| `dashboard.widgets.fields.completed` | completed | المكتمل |
| `dashboard.widgets.fields.count` | count | العدد |
| `dashboard.widgets.fields.delayed` | delayed | المتأخر |
| `dashboard.widgets.fields.documents` | documents | المستندات |
| `dashboard.widgets.fields.due` | due | المستحق |
| `dashboard.widgets.fields.expiring_today` | expiring today | ينتهي اليوم |
| `dashboard.widgets.fields.failed` | failed | غير الناجح |
| `dashboard.widgets.fields.in_progress` | in progress | قيد التنفيذ |
| `dashboard.widgets.fields.incoming_open` | incoming open | الوارد المفتوح |
| `dashboard.widgets.fields.invoiced` | invoiced | المفوتر |
| `dashboard.widgets.fields.issued` | issued | الصادر |
| `dashboard.widgets.fields.issued_pos` | issued pos | أوامر الشراء الصادرة |
| `dashboard.widgets.fields.items` | items | البنود |
| `dashboard.widgets.fields.items_complete` | items complete | البنود المكتملة |
| `dashboard.widgets.fields.items_total` | items total | إجمالي البنود |
| `dashboard.widgets.fields.lines` | lines | البنود |
| `dashboard.widgets.fields.low_stock` | low stock | المخزون المنخفض |
| `dashboard.widgets.fields.measurements` | measurements | القياسات |
| `dashboard.widgets.fields.mirs_pending` | mirs pending | فحوصات المواد المعلقة |
| `dashboard.widgets.fields.open` | open | المفتوح |
| `dashboard.widgets.fields.open_commitment` | open commitment | الالتزام المفتوح |
| `dashboard.widgets.fields.open_incidents` | open incidents | الحوادث المفتوحة |
| `dashboard.widgets.fields.open_ncrs` | open ncrs | حالات عدم المطابقة المفتوحة |
| `dashboard.widgets.fields.open_punch` | open punch | ملاحظات الاستلام المفتوحة |
| `dashboard.widgets.fields.open_punch_items` | open punch items | بنود ملاحظات الاستلام المفتوحة |
| `dashboard.widgets.fields.open_rfis` | open rfis | طلبات المعلومات المفتوحة |
| `dashboard.widgets.fields.open_submittals` | open submittals | طلبات الاعتماد المفتوحة |
| `dashboard.widgets.fields.open_variations` | open variations | الأوامر التغييرية المفتوحة |
| `dashboard.widgets.fields.open_wirs` | open wirs | فحوصات الأعمال المفتوحة |
| `dashboard.widgets.fields.outgoing_open` | outgoing open | الصادر المفتوح |
| `dashboard.widgets.fields.outstanding` | outstanding | غير المحصل |
| `dashboard.widgets.fields.overdue` | overdue | المتأخر |
| `dashboard.widgets.fields.payable` | payable | المستحق للدفع |
| `dashboard.widgets.fields.pending` | pending | المعلق |
| `dashboard.widgets.fields.pending_mirs` | pending mirs | فحوصات المواد المعلقة |
| `dashboard.widgets.fields.percent` | percent | النسبة المئوية |
| `dashboard.widgets.fields.planned` | planned | المخطط |
| `dashboard.widgets.fields.projects` | projects | المشاريع |
| `dashboard.widgets.fields.quantity` | quantity | الكمية |
| `dashboard.widgets.fields.recent` | recent | الحديث |
| `dashboard.widgets.fields.rfis_to_answer` | rfis to answer | طلبات معلومات بانتظار الرد |
| `dashboard.widgets.fields.source` | source | مصدر الإنجاز |
| `dashboard.widgets.fields.superseded` | superseded | المستبدل |
| `dashboard.widgets.fields.total` | total | الإجمالي |
| `dashboard.widgets.fields.upcoming` | upcoming | القادم |
| `dashboard.widgets.fields.value` | value | القيمة |
| `dashboard.widgets.fields.wirs_open` | wirs open | فحوصات الأعمال المفتوحة |
| `dashboard.widgets.fields.wirs_to_decide` | wirs to decide | فحوصات أعمال بانتظار القرار |
| `dashboard.widgets.fields.work_orders` | work orders | أوامر العمل |
| `dashboard.widgets.financial_position.title` | Financial position | المركز المالي |
| `dashboard.widgets.handover_readiness.title` | Handover readiness | جاهزية التسليم |
| `dashboard.widgets.incidents.title` | Incidents | الحوادث |
| `dashboard.widgets.incoming_outgoing.title` | Transmittals | المراسلات |
| `dashboard.widgets.inspections.title` | Inspections | الفحوصات |
| `dashboard.widgets.low_stock.title` | Low stock | المخزون المنخفض |
| `dashboard.widgets.materials.title` | Materials | المواد |
| `dashboard.widgets.milestones.title` | Milestones | المعالم |
| `dashboard.widgets.my_actions.title` | My open actions | إجراءاتي المفتوحة |
| `dashboard.widgets.ncrs.title` | NCRs | حالات عدم المطابقة |
| `dashboard.widgets.near_misses.title` | Near misses | الحوادث الوشيكة |
| `dashboard.widgets.overdue.title` | Overdue invoices | الفواتير المتأخرة |
| `dashboard.widgets.overdue_actions.title` | Overdue corrective actions | الإجراءات التصحيحية المتأخرة |
| `dashboard.widgets.payables.title` | Payables (open commitments) | المستحقات الدائنة والالتزامات المفتوحة |
| `dashboard.widgets.pending_quantities.title` | Quantities pending review | كميات بانتظار المراجعة |
| `dashboard.widgets.permits.title` | Permits | التصاريح |
| `dashboard.widgets.photos.title` | Photos | الصور |
| `dashboard.widgets.pm_actions.title` | PM actions | إجراءات مدير المشروع |
| `dashboard.widgets.portfolio.title` | Portfolio | محفظة المشاريع |
| `dashboard.widgets.procurement_exposure.title` | Procurement exposure | التزامات المشتريات |
| `dashboard.widgets.progress.title` | Progress | الإنجاز |
| `dashboard.widgets.project_health.title` | Project health | حالة المشاريع |
| `dashboard.widgets.projects.title` | My projects | مشاريعي |
| `dashboard.widgets.purchase_orders.title` | Purchase orders | أوامر الشراء |
| `dashboard.widgets.quality_safety_risks.title` | Quality & safety risks | مخاطر الجودة والسلامة |
| `dashboard.widgets.receivables.title` | Receivables | المستحقات المدينة |
| `dashboard.widgets.receiving.title` | GRNs this week | إشعارات الاستلام هذا الأسبوع |
| `dashboard.widgets.requisitions.title` | Purchase requisitions | طلبات الشراء |
| `dashboard.widgets.reviews.title` | My reviews | مراجعاتي |
| `dashboard.widgets.reviews_due.title` | Reviews due | المراجعات المستحقة |
| `dashboard.widgets.revisions.title` | Revisions | المراجعات |
| `dashboard.widgets.rfis_submittals.title` | RFIs & submittals | طلبات المعلومات والاعتمادات |
| `dashboard.widgets.schedule_risk.title` | Schedule risk | مخاطر الجدول الزمني |
| `dashboard.widgets.scope.title` | My scope | نطاق أعمالي |
| `dashboard.widgets.stock.title` | Stock | المخزون |
| `dashboard.widgets.subcontracts.title` | Subcontracts | عقود الباطن |
| `dashboard.widgets.superseded_control.title` | Superseded control | ضبط المستندات المستبدلة |
| `dashboard.widgets.tests.title` | Tests | الاختبارات |
| `dashboard.widgets.title` | Overview | نظرة عامة |
| `dashboard.widgets.todays_work.title` | Today's work | أعمال اليوم |
| `dashboard.widgets.todays_works.title` | Works | الأعمال |
| `dashboard.widgets.valuations.title` | Valuations | المستخلصات |
| `dashboard.widgets.variations.title` | Variations | الأوامر التغييرية |
| `dashboard.widgets.wir_mir.title` | WIR / MIR | طلبات فحص الأعمال والمواد |

### documentControl

| Catalog key | English | Arabic |
|---|---|---|
| `documentControl.correspondence` | Correspondence | المراسلات |
| `documentControl.register.confidentiality` | Confidentiality | درجة السرية |
| `documentControl.register.confidentialityLevels.confidential` | Confidential | سري |
| `documentControl.register.confidentialityLevels.internal` | Internal | داخلي |
| `documentControl.register.confidentialityLevels.public` | Public | عام |
| `documentControl.register.confidentialityLevels.restricted` | Restricted | مقيد |
| `documentControl.register.controlledType` | Controlled document type | نوع المستند الخاضع للضبط |
| `documentControl.register.discipline` | Discipline | التخصص |
| `documentControl.register.disciplines.architectural` | Architectural | معماري |
| `documentControl.register.disciplines.civil` | Civil | مدني |
| `documentControl.register.disciplines.electrical` | Electrical | كهربائي |
| `documentControl.register.disciplines.fire` | Fire | حريق |
| `documentControl.register.disciplines.general` | General | عام |
| `documentControl.register.disciplines.hvac` | HVAC | تكييف وتهوية |
| `documentControl.register.disciplines.mechanical` | Mechanical | ميكانيكي |
| `documentControl.register.disciplines.plumbing` | Plumbing | سباكة |
| `documentControl.register.disciplines.structural` | Structural | إنشائي |
| `documentControl.register.issueDate` | Issue date | تاريخ الإصدار |
| `documentControl.register.locationId` | Project location ID | رقم موقع المشروع |
| `documentControl.register.locationPackage` | Location / package | الموقع / الحزمة |
| `documentControl.register.number` | Document number | رقم المستند |
| `documentControl.register.originatorId` | Originator organization ID | رقم الجهة المُصدرة |
| `documentControl.register.package` | Package | الحزمة |
| `documentControl.register.recipientId` | Recipient organization ID | رقم الجهة المستلمة |
| `documentControl.register.reviewDue` | Review due date | موعد المراجعة |
| `documentControl.register.status` | Status | الحالة |
| `documentControl.register.title` | Title | العنوان |
| `documentControl.register.type` | Type | النوع |
| `documentControl.register.types.as_built` | As-built | مخطط كما نُفذ |
| `documentControl.register.types.contract` | Contract | عقد |
| `documentControl.register.types.drawing` | Drawing | رسم |
| `documentControl.register.types.method_statement` | Method statement | بيان طريقة العمل |
| `documentControl.register.types.o_m` | O&M | التشغيل والصيانة |
| `documentControl.register.types.other` | Other | أخرى |
| `documentControl.register.types.report` | Report | تقرير |
| `documentControl.register.types.specification` | Specification | مواصفة |
| `documentControl.register.visibility` | Portal visibility | إمكانية الظهور في البوابة |
| `documentControl.register.visibilityLevels.all_external` | All external seats | جميع الحسابات الخارجية |
| `documentControl.register.visibilityLevels.client` | Client | العميل |
| `documentControl.register.visibilityLevels.consultant` | Consultant | الاستشاري |
| `documentControl.register.visibilityLevels.internal` | Internal only | داخلي فقط |
| `documentControl.register.visibilityLevels.subcontractor` | Subcontractor | مقاول الباطن |
| `documentControl.rfiImpacts.cost` | Estimated cost impact | الأثر المالي المتوقع |
| `documentControl.rfiImpacts.loading` | Loading project locations… | جارٍ تحميل مراجع المشروع |
| `documentControl.rfiImpacts.location` | Project location | موقع المشروع |
| `documentControl.rfiImpacts.locationsUnavailable` | Project locations could not be loaded. You can still raise the RFI without a location. | تعذر تحميل مواقع المشروع. أعد المحاولة قبل اختيار موقع. |
| `documentControl.rfiImpacts.none` | No location linked | لا يوجد مرجع مرتبط |
| `documentControl.rfiImpacts.schedule` | Schedule impact (days) | الأثر الزمني (أيام) |
| `documentControl.rfiImpacts.workPackage` | Work package | حزمة العمل |
| `documentControl.system.acknowledge` | Acknowledge | إقرار |
| `documentControl.system.allCategories` | All Categories | كل الفئات |
| `documentControl.system.allDisciplines` | All disciplines | كل التخصصات |
| `documentControl.system.allDocumentsAreAlreadyRegistered` | All documents are already registered. | كل المستندات مسجلة. |
| `documentControl.system.allRevisions` | All revisions | كل الإصدارات |
| `documentControl.system.allTypes` | All types | كل الأنواع |
| `documentControl.system.amend` | Amend | تعديل |
| `documentControl.system.answer` | Answer | إجابة |
| `documentControl.system.answer2` | Answer | الإجابة |
| `documentControl.system.approve` | Approve | اعتماد |
| `documentControl.system.body` | Body | المحتوى |
| `documentControl.system.cancel` | Cancel | إلغاء |
| `documentControl.system.category` | Category | الفئة |
| `documentControl.system.changeDescription` | Change Description | وصف التغيير |
| `documentControl.system.chooseAFileFirst` | Choose a file first | اختر ملفًا أولاً |
| `documentControl.system.close` | Close | إغلاق |
| `documentControl.system.controlledRegisters` | Controlled Registers | سجلات التحكم |
| `documentControl.system.crossSearch` | Cross-Search | بحث شامل |
| `documentControl.system.currentRevisions` | Current revisions | الإصدار الحالي |
| `documentControl.system.currentVersionVWillBecomeV` | Current version: v{version} — will become v{value} | الإصدار الحالي: v{version} — سيصبح v{value} |
| `documentControl.system.documentControl` | Document Control | التحكم في المستندات |
| `documentControl.system.documentLibrary` | Document Library | مكتبة المستندات |
| `documentControl.system.documentsVersionsRfisSubmittals` | Documents, versions, RFIs & submittals | المستندات والإصدارات وطلبات المعلومات والاعتمادات |
| `documentControl.system.download` | Download | تنزيل |
| `documentControl.system.due` | Due | الاستحقاق |
| `documentControl.system.dueDate` | Due Date | تاريخ الاستحقاق |
| `documentControl.system.file` | File | الملف |
| `documentControl.system.newCorrespondence` | New Correspondence | مراسلة جديدة |
| `documentControl.system.newFile` | New File | الملف الجديد |
| `documentControl.system.newSubmittal` | New Submittal | اعتماد جديد |
| `documentControl.system.newVersion` | New version | إصدار جديد |
| `documentControl.system.newVersion2` | New Version — {title} | إصدار جديد — {title} |
| `documentControl.system.noCorrespondence` | No correspondence. | لا توجد مراسلات. |
| `documentControl.system.noDocuments` | No documents. | لا توجد مستندات. |
| `documentControl.system.noResults` | No results. | لا نتائج. |
| `documentControl.system.noRfis` | No RFIs. | لا توجد طلبات معلومات. |
| `documentControl.system.noSubmittals` | No submittals. | لا توجد اعتمادات. |
| `documentControl.system.noTransmittals` | No transmittals. | لا توجد مذكرات إرسال. |
| `documentControl.system.number` | Number | الرقم |
| `documentControl.system.overdue` | Overdue | متأخر |
| `documentControl.system.pickADocumentToRegisterNumberFormatProjectDisciplineType` | Pick a document to register — number format PROJECT-DISCIPLINE-TYPE-SEQ-REV | اختر مستنداً لتسجيله — رقم مستند بصيغة PROJECT-DISCIPLINE-TYPE-SEQ-REV |
| `documentControl.system.priority` | Priority | الأولوية |
| `documentControl.system.question` | Question | السؤال |
| `documentControl.system.raiseRfi` | Raise RFI | طلب معلومات جديد |
| `documentControl.system.raisedBy` | Raised By | رفعه |
| `documentControl.system.record` | Record | النوع |
| `documentControl.system.ref` | Ref | المرجع |
| `documentControl.system.register` | Register | تسجيل |
| `documentControl.system.registerDocument` | Register document | تسجيل مستند |
| `documentControl.system.reject` | Reject | رفض |
| `documentControl.system.responded` | Responded | تم الرد |
| `documentControl.system.responseDue` | Response due | رد مستحق |
| `documentControl.system.rev` | Rev | الإصدار |
| `documentControl.system.review` | Review | مراجعة |
| `documentControl.system.rfis` | RFIs | طلبات المعلومات |
| `documentControl.system.save` | Save | حفظ |
| `documentControl.system.search` | Search | بحث |
| `documentControl.system.search2` | Search... | بحث... |
| `documentControl.system.searchDocumentsTransmittalsCorrespondenceRfisSubmittals` | Search documents, transmittals, correspondence, RFIs, submittals… | ابحث في المستندات والمذكرات والمراسلات وطلبات المعلومات والاعتمادات… |
| `documentControl.system.send` | Send | إرسال |
| `documentControl.system.structuralRevB` | structural, rev-b | إنشائي، إصدار ب |
| `documentControl.system.subject` | Subject | الموضوع |
| `documentControl.system.submittals` | Submittals | الاعتمادات |
| `documentControl.system.submittedTo` | Submitted To | مقدم إلى |
| `documentControl.system.superseded` | superseded | مستبدل |
| `documentControl.system.supersededDoNotUseForConstruction` | ⚠ SUPERSEDED — do not use for construction | ⚠ إصدار ملغي — لا يستخدم للبناء |
| `documentControl.system.tagsCommaSeparated` | Tags (comma-separated) | وسوم (مفصولة بفاصلة) |
| `documentControl.system.theControlledRegisterIsEmpty` | The controlled register is empty. | السجل فارغ. |
| `documentControl.system.transmittals` | Transmittals | مذكرات الإرسال |
| `documentControl.system.typeATermToSearchAcrossCurrentAndHistoricalRecords` | Type a term to search across current and historical records. | اكتب مصطلحاً للبحث عبر السجلات الحالية والتاريخية. |
| `documentControl.system.updated` | Updated | التحديث |
| `documentControl.system.uploadDocument` | Upload Document | رفع مستند |
| `documentControl.system.v` | v | الإصدار |
| `documentControl.system.ver` | Ver. | الإصدار |
| `documentControl.system.versionHistory` | Version history | سجل الإصدارات |
| `documentControl.system.versionHistory2` | Version History — {title} | سجل الإصدارات — {title} |
| `documentControl.title` | Document control | التحكم في المستندات |
| `documentControl.transmittalForm.attention` | Attention | عناية |
| `documentControl.transmittalForm.direction` | Direction | الاتجاه |
| `documentControl.transmittalForm.documents` | Documents | المستندات |
| `documentControl.transmittalForm.incoming` | Incoming | واردة |
| `documentControl.transmittalForm.loadError` | Could not load project recipients or documents. | تعذر تحميل جهات الاستلام أو مستندات المشروع. |
| `documentControl.transmittalForm.loading` | Loading project records... | جاري تحميل سجلات المشروع… |
| `documentControl.transmittalForm.new` | New transmittal | مذكرة إرسال جديدة |
| `documentControl.transmittalForm.number` | Transmittal number | رقم مذكرة الإرسال |
| `documentControl.transmittalForm.outgoing` | Outgoing | صادرة |
| `documentControl.transmittalForm.purpose` | Purpose | الغرض |
| `documentControl.transmittalForm.recipient` | Recipient organization | الجهة المستلمة |
| `documentControl.transmittalForm.responseDue` | Response due | موعد الرد |
| `documentControl.transmittalForm.selectRecipient` | Select a project participant | اختر طرفاً مشاركاً بالمشروع |
| `documentControl.transmittalForm.status` | Status | الحالة |
| `documentControl.transmittals` | Transmittals | مراسلات إرسال المستندات |

### enums

| Catalog key | English | Arabic |
|---|---|---|
| `enums.boolean.no` | No | لا |
| `enums.boolean.yes` | Yes | نعم |
| `enums.channel.email` | Email | البريد الإلكتروني |
| `enums.channel.inApp` | In app | داخل التطبيق |
| `enums.channel.push` | Push notification | إشعار فوري |
| `enums.channel.sms` | SMS | رسالة نصية |
| `enums.channel.whatsapp` | WhatsApp | واتساب |
| `enums.correspondenceType.claim` | Claim | مطالبة |
| `enums.correspondenceType.instruction` | Instruction | تعليمات |
| `enums.correspondenceType.letter` | Letter | خطاب |
| `enums.correspondenceType.notice` | Notice | إشعار |
| `enums.direction.incoming` | Incoming | وارد |
| `enums.direction.outgoing` | Outgoing | صادر |
| `enums.discipline.architectural` | Architectural | معماري |
| `enums.discipline.civil` | Civil | مدني |
| `enums.discipline.electrical` | Electrical | كهربائي |
| `enums.discipline.fire` | Fire | مكافحة حريق |
| `enums.discipline.hvac` | HVAC | تكييف وتهوية |
| `enums.discipline.mechanical` | Mechanical | ميكانيكي |
| `enums.discipline.plumbing` | Plumbing | سباكة |
| `enums.discipline.structural` | Structural | إنشائي |
| `enums.documentType.asBuilt` | As built | مخطط حسب التنفيذ |
| `enums.documentType.contract` | Contract | عقد |
| `enums.documentType.drawing` | Drawing | مخطط |
| `enums.documentType.methodStatement` | Method statement | بيان طريقة العمل |
| `enums.documentType.oM` | Operation & maintenance | التشغيل والصيانة |
| `enums.documentType.report` | Report | تقرير |
| `enums.documentType.specification` | Specification | مواصفات |
| `enums.entityType.asset` | Asset | أصل |
| `enums.entityType.boqChange` | BOQ change | تغيير جدول الكميات |
| `enums.entityType.document` | Document | مستند |
| `enums.entityType.invoice` | Invoice | فاتورة |
| `enums.entityType.ncr` | NCR | NCR |
| `enums.entityType.observation` | Observation | ملاحظة |
| `enums.entityType.paymentCertificate` | Payment certificate | مستخلص |
| `enums.entityType.permit` | Permit | تصريح |
| `enums.entityType.project` | Project | مشروع |
| `enums.entityType.purchaseOrder` | Purchase order | أمر شراء |
| `enums.entityType.purchaseRequest` | Purchase request | طلب شراء |
| `enums.entityType.rfi` | RFI | RFI |
| `enums.entityType.subContract` | Subcontract | عقد باطن |
| `enums.entityType.submittal` | Submittal | مستند للاعتماد |
| `enums.entityType.variation` | Variation | أمر تغيير |
| `enums.entityType.workOrder` | Work order | أمر عمل |
| `enums.entityType.workflowStep` | Workflow step | خطوة سير العمل |
| `enums.frequency.daily` | Daily | يومي |
| `enums.frequency.monthly` | Monthly | شهري |
| `enums.frequency.weekly` | Weekly | أسبوعي |
| `enums.handoverState.asBuilts` | As-built drawings | مخططات ما بعد التنفيذ |
| `enums.handoverState.dlpWarranty` | Defects liability / warranty | فترة ضمان العيوب |
| `enums.handoverState.finalCompletion` | Final completion | الإنجاز النهائي |
| `enums.handoverState.finalInspection` | Final inspection | الفحص النهائي |
| `enums.handoverState.oM` | O&M manuals | كتيبات التشغيل والصيانة |
| `enums.handoverState.preHandover` | Pre-handover | ما قبل التسليم |
| `enums.handoverState.punchSnag` | Punch / snag list | قائمة الملاحظات والعيوب |
| `enums.handoverState.rectification` | Rectification | التصحيح |
| `enums.handoverState.takingOver` | Taking over | الاستلام |
| `enums.handoverState.testingCommissioning` | Testing & commissioning | الاختبار والتشغيل |
| `enums.handoverState.training` | Training | التدريب |
| `enums.inspectionPointType.hold` | Hold | نقطة توقف |
| `enums.inspectionPointType.review` | Review | مراجعة |
| `enums.inspectionPointType.witness` | Witness | نقطة حضور |
| `enums.priority.critical` | Critical | حرجة |
| `enums.priority.high` | High | عالية |
| `enums.priority.low` | Low | منخفضة |
| `enums.priority.medium` | Medium | متوسطة |
| `enums.priority.urgent` | Urgent | عاجلة |
| `enums.result.fail` | Fail | غير ناجح |
| `enums.result.pass` | Pass | ناجح |
| `enums.result.pending` | Pending | معلق |
| `enums.risk.draft` | Draft | مسودة |
| `enums.risk.gated` | Needs approval | يتطلب موافقة |
| `enums.risk.read` | Read | قراءة |
| `enums.role.accountant` | Accountant | محاسب |
| `enums.role.accountantAp` | Payables Accountant | محاسب الموردين |
| `enums.role.accountantAr` | Receivables Accountant | محاسب العملاء |
| `enums.role.admin` | Administrator | مدير النظام |
| `enums.role.businessDevelopment` | Business Development | تطوير الأعمال |
| `enums.role.client` | Client | عميل |
| `enums.role.clientExecutive` | Client Executive | المسؤول التنفيذي للعميل |
| `enums.role.clientReviewer` | Client Reviewer | مراجع العميل |
| `enums.role.commercial` | Commercial | الشؤون التجارية |
| `enums.role.commercialManager` | Commercial Manager | المدير التجاري |
| `enums.role.constructionManager` | Construction Manager | مدير الإنشاءات |
| `enums.role.consultant` | Consultant | استشاري |
| `enums.role.consultantCoordinator` | Consultant Coordinator | منسق الاستشاري |
| `enums.role.consultantReviewer` | Consultant Reviewer | مراجع الاستشاري |
| `enums.role.contractsManager` | Contracts Manager | مدير العقود |
| `enums.role.coo` | Chief Operating Officer | الرئيس التنفيذي للعمليات |
| `enums.role.documentController` | Document Controller | مسؤول ضبط المستندات |
| `enums.role.engineer` | Engineer | مهندس |
| `enums.role.equipmentManager` | Equipment Manager | مدير المعدات |
| `enums.role.financeManager` | Finance Manager | مدير مالي |
| `enums.role.foreman` | Foreman | رئيس عمال |
| `enums.role.hrManager` | Human Resources Manager | مدير الموارد البشرية |
| `enums.role.hse` | Health, Safety & Environment | الصحة والسلامة والبيئة |
| `enums.role.hseManager` | Safety Manager | مدير السلامة |
| `enums.role.legalMgr` | Legal Manager | مدير قانوني |
| `enums.role.maintenanceMgr` | Maintenance Manager | مدير الصيانة |
| `enums.role.manager` | Manager | مدير |
| `enums.role.owner` | Owner | المالك |
| `enums.role.ownerCeo` | Owner / CEO | المالك / الرئيس التنفيذي |
| `enums.role.planning` | Planning | التخطيط |
| `enums.role.planningEngineer` | Planning Engineer | مهندس التخطيط |
| `enums.role.pmcManager` | Project Management Consultant Manager | مدير استشاري إدارة المشروع |
| `enums.role.procurement` | Procurement | المشتريات |
| `enums.role.procurementManager` | Procurement Manager | مدير المشتريات |
| `enums.role.procurementOfficer` | Procurement Officer | مسؤول المشتريات |
| `enums.role.projectManager` | Project Manager | مدير مشروع |
| `enums.role.projectsDirector` | Projects Director | مدير المشاريع |
| `enums.role.purchasingMgr` | Purchasing Manager | مدير المشتريات |
| `enums.role.qaQc` | Quality Assurance / Control | ضمان الجودة ومراقبتها |
| `enums.role.qaQcManager` | Quality Manager | مدير الجودة |
| `enums.role.qs` | Quantity Surveyor | مهندس حصر الكميات |
| `enums.role.quantitySurveyor` | Quantity Surveyor | مهندس حصر الكميات |
| `enums.role.safetyOfficer` | Safety Officer | مسؤول السلامة |
| `enums.role.siteEngineer` | Site Engineer | مهندس الموقع |
| `enums.role.siteManager` | Site Manager | مدير الموقع |
| `enums.role.siteSupervisor` | Site Supervisor | مشرف موقع |
| `enums.role.staff` | Staff | موظف |
| `enums.role.storekeeper` | Storekeeper | أمين المخزن |
| `enums.role.subcontractor` | Subcontractor | مقاول من الباطن |
| `enums.role.subcontractorManager` | Subcontractor Manager | مدير مقاول الباطن |
| `enums.role.subcontractorSiteEngineer` | Subcontractor Site Engineer | مهندس موقع مقاول الباطن |
| `enums.role.supervisor` | Supervisor | مشرف |
| `enums.role.supplier` | Supplier | مورد |
| `enums.role.supplierSales` | Supplier Sales | مبيعات المورد |
| `enums.role.technicalOfficeEngineer` | Technical Office Engineer | مهندس المكتب الفني |
| `enums.role.testingLab` | Testing Laboratory | مختبر الاختبارات |
| `enums.scope.company` | Company | الشركة |
| `enums.scope.location` | Location | موقع |
| `enums.scope.personal` | Personal | شخصي |
| `enums.scope.project` | Project | مشروع |
| `enums.severity.critical` | Critical | حرجة |
| `enums.severity.high` | High | عالية |
| `enums.severity.low` | Low | منخفضة |
| `enums.severity.major` | Major | كبيرة |
| `enums.severity.medium` | Medium | متوسطة |
| `enums.severity.minor` | Minor | بسيطة |
| `enums.severity.moderate` | Moderate | متوسطة |
| `enums.status.absent` | Absent | غائب |
| `enums.status.accepted` | Accepted | مقبول |
| `enums.status.acknowledged` | Acknowledged | تم الإقرار |
| `enums.status.active` | Active | نشط |
| `enums.status.all` | All | الكل |
| `enums.status.answered` | Answered | تمت الإجابة |
| `enums.status.approved` | Approved | مقبول |
| `enums.status.approvedWithComments` | Approved with comments | معتمد بملاحظات |
| `enums.status.archived` | Archived | مؤرشف |
| `enums.status.assigned` | Assigned | مسند |
| `enums.status.available` | Available | متاح |
| `enums.status.awaitingApproval` | Awaiting approval | بانتظار الموافقة |
| `enums.status.blocked` | Blocked | محظور |
| `enums.status.cancelled` | Cancelled | ملغي |
| `enums.status.certified` | Certified | معتمد (مستخلص) |
| `enums.status.closed` | Closed | مغلق |
| `enums.status.complete` | Complete | مكتمل |
| `enums.status.completed` | Completed | مكتمل |
| `enums.status.consultantReview` | Consultant review | مراجعة الاستشاري |
| `enums.status.contracted` | Contracted | متعاقد |
| `enums.status.delivered` | Delivered | مسلّم |
| `enums.status.dlp` | Defects liability period | فترة ضمان العيوب |
| `enums.status.draft` | Draft | مسودة |
| `enums.status.executed` | Executed | منفذ |
| `enums.status.expired` | Expired | منتهي |
| `enums.status.failed` | Failed | فشل |
| `enums.status.finalCompletion` | Final completion | الاستلام النهائي |
| `enums.status.halfDay` | Half Day | نصف يوم |
| `enums.status.implemented` | Implemented | منفذة |
| `enums.status.inProgress` | In Progress | قيد التنفيذ |
| `enums.status.inReview` | In review | قيد المراجعة |
| `enums.status.inactive` | Inactive | غير نشط |
| `enums.status.investigating` | Investigating | قيد التحقيق |
| `enums.status.issued` | Issued | صادرة |
| `enums.status.late` | Late | متأخر |
| `enums.status.leave` | Leave | إجازة |
| `enums.status.onHold` | On Hold | معلق |
| `enums.status.onLeave` | On Leave | إجازة |
| `enums.status.open` | Open | مفتوح |
| `enums.status.overdue` | Overdue | متأخرة |
| `enums.status.paid` | Paid | مدفوعة بالكامل |
| `enums.status.partiallyPaid` | Partially Paid | مدفوعة جزئياً |
| `enums.status.passed` | Passed | ناجح |
| `enums.status.pending` | Pending | معلق |
| `enums.status.pendingApproval` | Pending Approval | بانتظار الموافقة |
| `enums.status.planned` | Planned | مخطط |
| `enums.status.planning` | Planning | تخطيط |
| `enums.status.pmReview` | PM Review | مراجعة مدير المشروع |
| `enums.status.posted` | Posted | مُرحّل |
| `enums.status.practicalCompletion` | Practical completion | الاستلام الابتدائي |
| `enums.status.preHandover` | Pre-handover | ما قبل التسليم |
| `enums.status.present` | Present | حاضر |
| `enums.status.proposed` | Proposed | مقترح |
| `enums.status.qaQcReview` | QA/QC Review | مراجعة الجودة |
| `enums.status.raised` | Raised | مقدمة |
| `enums.status.ready` | Ready | جاهز |
| `enums.status.received` | Received | مستلم |
| `enums.status.rectificationInProgress` | Rectification in progress | قيد التصحيح |
| `enums.status.rectified` | Rectified | تم التصحيح |
| `enums.status.rejected` | Rejected | مرفوض |
| `enums.status.released` | Released | مُفلت |
| `enums.status.reserved` | Reserved | محجوز |
| `enums.status.resolved` | Resolved | تم الحل |
| `enums.status.responded` | Responded | تم الرد |
| `enums.status.returned` | Returned | معاد للتعديل |
| `enums.status.review` | In Review | قيد المراجعة |
| `enums.status.revised` | Revised | معدل |
| `enums.status.rework` | Rework | إعادة عمل |
| `enums.status.scheduled` | Scheduled | مجدول |
| `enums.status.sent` | Sent | مرسلة |
| `enums.status.submitted` | QA/QC Review | مراجعة الجودة |
| `enums.status.submittedForAcceptance` | Submitted for acceptance | مقدم للقبول |
| `enums.status.success` | Success | نجاح |
| `enums.status.suspended` | Suspended | معلق |
| `enums.status.terminated` | Terminated | منتهي |
| `enums.status.underConstruction` | Under Construction | تحت الإنشاء |
| `enums.status.underReview` | Under Review | قيد المراجعة |
| `enums.status.unpaid` | Unpaid | غير مدفوع |
| `enums.status.uploaded` | Uploaded | مرفوع |
| `enums.status.verified` | Verified | تم التحقق |
| `enums.status.void` | Void | ملغاة |
| `enums.workflowAction.approve` | Approve | اعتماد |
| `enums.workflowAction.assign` | Assign | إسناد |
| `enums.workflowAction.cancel` | Cancel | إلغاء |
| `enums.workflowAction.close` | Close | إغلاق |
| `enums.workflowAction.issue` | Issue | إصدار |
| `enums.workflowAction.reject` | Reject | رفض |
| `enums.workflowAction.reopen` | Reopen | إعادة فتح |
| `enums.workflowAction.return` | Return for revision | إعادة للتعديل |
| `enums.workflowAction.review` | Review | مراجعة |
| `enums.workflowAction.submit` | Submit | إرسال |
| `enums.workflowAction.void` | Void | إبطال |

### errors

| Catalog key | English | Arabic |
|---|---|---|
| `errors.advance_recovery_exceeds_balance` | Advance recovery cannot exceed the unrecovered contract advance. | لا يمكن أن يتجاوز استرداد الدفعة المقدمة رصيدها المتبقي. |
| `errors.agent_request_forbidden` | You are not authorized to view this request. | ليست لديك صلاحية لعرض هذا الطلب. |
| `errors.agent_request_not_found` | The request could not be found. | لم يتم العثور على الطلب. |
| `errors.amount_exceeds_limit` | The amount or quantity exceeds the permitted limit. | المبلغ أو الكمية يتجاوز الحد المسموح به. |
| `errors.apiRouteNotFound` | API route not found | مسار واجهة البرمجة غير موجود |
| `errors.approval_not_found` | The approval request could not be found. | لم يتم العثور على طلب الاعتماد. |
| `errors.attendance_duplicate` | Attendance has already been recorded for this date. | تم تسجيل الحضور لهذا التاريخ بالفعل. |
| `errors.authenticationUnavailable` | Authentication is temporarily unavailable. Please try again shortly. | خدمة تسجيل الدخول غير متاحة مؤقتًا. يرجى المحاولة بعد قليل. |
| `errors.award_decision_refused` | You are not authorized to decide this recommendation. | ليست لديك صلاحية اتخاذ قرار بشأن توصية الترسية. |
| `errors.award_not_draft` | Only draft award recommendations can be submitted. | يجب أن تكون توصية الترسية في حالة مسودة. |
| `errors.award_not_submitted` | This award recommendation is not waiting for a decision. | لم تُقدم توصية الترسية للاعتماد. |
| `errors.award_recommendation_exists` | An active award recommendation already exists for this request. | توجد توصية ترسية قائمة لهذا الطلب. |
| `errors.business_rule_violation` | This action cannot be completed in the current state. | لا يمكن إكمال هذا الإجراء في الحالة الحالية. |
| `errors.cancel_reason_required` | Enter a reason with at least three characters. | سبب الإلغاء مطلوب. |
| `errors.certified_quantity_amount_override` | Certified work is calculated from certified quantities and contract rates. | يتم احتساب قيمة الأعمال المعتمدة من الكميات المعتمدة والأسعار التعاقدية. |
| `errors.certified_quantity_invalid` | Certified quantities must be within the claimed amounts and measurements must remain certified. | يجب ألا تتجاوز الكميات المعتمدة المطالبة، ويجب أن تظل القياسات معتمدة. |
| `errors.certified_quantity_lines_required` | Enter the certified quantity for every claimed line. | أدخل الكمية المعتمدة لكل بند من المطالبة. |
| `errors.commitment_cancelled` | A cancelled commitment cannot be adjusted. | لا يمكن تعديل التزام ملغى. |
| `errors.commitment_not_found` | This commitment no longer exists. | هذا الالتزام لم يعد موجودًا. |
| `errors.commitment_unchanged` | The cancelled amount is unchanged. | المبلغ الملغى لم يتغير. |
| `errors.conflict` | This record was changed by someone else. | تم تعديل هذا السجل بواسطة شخص آخر. |
| `errors.contract_boq_rate_ambiguous` | Each BOQ item must have exactly one matching contract rate. | يجب أن يكون لكل بند في جدول الكميات سعر تعاقدي مطابق واحد فقط. |
| `errors.databaseTimeout` | The database operation timed out. Please retry. | انتهت مهلة عملية قاعدة البيانات. يرجى المحاولة مرة أخرى. |
| `errors.databaseUnavailable` | The database is temporarily unavailable. Please try again shortly. | قاعدة البيانات غير متاحة مؤقتًا. يرجى إعادة المحاولة بعد قليل. |
| `errors.database_check_violation` | The record violates a data rule. | السجل يخالف قاعدة بيانات. |
| `errors.database_conflict` | A record with these values already exists. | يوجد سجل بهذه القيم بالفعل. |
| `errors.database_reference_violation` | A referenced record does not exist or is still in use. | السجل المُشار إليه غير موجود أو لا يزال قيد الاستخدام. |
| `errors.delivery_not_found` | The delivery could not be found. | سجل التوريد غير موجود. |
| `errors.employee_not_found` | The employee could not be found. | لم يتم العثور على الموظف. |
| `errors.forbidden` | You do not have permission to do this. | ليس لديك صلاحية لتنفيذ هذا الإجراء. |
| `errors.grn_not_found` | The goods receipt could not be found. | إشعار استلام البضاعة غير موجود. |
| `errors.grn_requires_accepted_mir` | A delivery only becomes usable stock after an accepted inspection. Post it as quarantined stock or attach the accepted inspection reference. | لا يصبح التوريد مخزونًا قابلًا للاستخدام إلا بعد فحص مقبول. سجّله كمخزون محجوز أو أرفق مرجع الفحص المقبول. |
| `errors.insufficient_stock` | There is not enough usable stock for this request. | لا يوجد مخزون صالح للاستخدام يكفي لهذا الطلب. |
| `errors.internal_error` | The request could not be completed. | تعذر إكمال الطلب. |
| `errors.invalidProjectId` | Enter a valid project identifier. | أدخل معرّف مشروع صحيحًا. |
| `errors.invalid_activity_budgeted_cost` | Enter a non-negative activity budget with no more than two decimal places. | أدخل ميزانية نشاط غير سالبة وبحد أقصى منزلتين عشريتين. |
| `errors.invalid_document_id` | Enter a valid document identifier. | أدخل معرّف مستند صحيحًا. |
| `errors.invalid_input` | Some of the submitted values are missing or invalid. | بعض القيم المُدخلة ناقصة أو غير صحيحة. |
| `errors.invalid_notification_preference` | The notification preference values are invalid. | قيم تفضيلات الإشعارات غير صحيحة. |
| `errors.invalid_resource_load_range` | Choose a valid resource loading date range of up to 91 days. | اختر نطاقاً صحيحاً لتحميل الموارد لا يتجاوز 91 يوماً. |
| `errors.invalid_state` | This action is not allowed in the record's current state. | لا يمكن تنفيذ هذا الإجراء في الحالة الحالية للسجل. |
| `errors.invalid_status` | The provided status is not valid. | الحالة المقدمة غير صحيحة. |
| `errors.invoice_already_terminal` | This invoice is already voided or credited. | هذه الفاتورة ملغاة أو مضافة بالفعل. |
| `errors.invoice_has_live_payments` | This invoice has payments recorded against it. Void those payments first. | لدى هذه الفاتورة مدفوعات مسجلة. ألغِ تلك المدفوعات أولًا. |
| `errors.invoice_match_failed` | The invoice does not match the purchase order and accepted receipt quantities. | لم تنجح مطابقة الفاتورة مع أمر الشراء والاستلام. |
| `errors.invoice_not_found` | The invoice could not be found. | لم يتم العثور على الفاتورة. |
| `errors.invoice_not_issued` | Money can only be received against an issued invoice. | لا يمكن استلام مبالغ إلا مقابل فاتورة مُصدرة. |
| `errors.invoice_posted` | This invoice is already posted to the ledger. Void it and issue a new one instead of changing its amount. | تم ترحيل هذه الفاتورة إلى دفتر الأستاذ بالفعل. ألغِها وأصدر فاتورة جديدة بدلًا من تعديل مبلغها. |
| `errors.labor_payment_not_found` | The labor payment could not be found. | لم يتم العثور على دفعة العمالة. |
| `errors.labor_payment_posted` | Costed or posted labor payments cannot be deleted. | لا يمكن حذف دفعات العمالة التي تم احتساب تكلفتها أو ترحيلها. |
| `errors.laborer_not_found` | The laborer could not be found. | لم يتم العثور على العامل. |
| `errors.leave_request_not_found` | The leave request could not be found. | لم يتم العثور على طلب الإجازة. |
| `errors.ledger_account_not_mapped` | No ledger account is mapped for this posting. | لا يوجد حساب دفتر أستاذ مطابق لهذا القيد. |
| `errors.milestone_not_found` | The milestone could not be found. | لم يتم العثور على المحطة الرئيسية. |
| `errors.mir_not_found` | The inspection request could not be found. | طلب فحص المواد غير موجود. |
| `errors.movement_not_quarantined_receipt` | Only a quarantined receipt movement can be posted into stock this way. | يمكن ترحيل حركة استلام محجوزة فقط إلى المخزون بهذه الطريقة. |
| `errors.networkError` | Cannot reach the server. Check your connection. | تعذر الوصول إلى الخادم. تحقق من اتصالك. |
| `errors.no_compliant_quotation` | No compliant quotation is available to recommend. | لا يوجد عرض أسعار مطابق يمكن التوصية به. |
| `errors.notFound` | The requested record was not found. | لم يتم العثور على السجل المطلوب. |
| `errors.not_authorized_for_action` | You are not authorized to perform this action. | غير مصرّح لك بتنفيذ هذا الإجراء. |
| `errors.payment_already_void` | This payment is already void. | هذه الدفعة ملغاة بالفعل. |
| `errors.payment_not_found` | The payment could not be found. | لم يتم العثور على الدفعة. |
| `errors.phase_not_found` | The phase could not be found. | لم يتم العثور على المرحلة. |
| `errors.po_cannot_cancel` | This purchase order cannot be cancelled in its current state. | لا يمكن إلغاء أمر الشراء في حالته الحالية. |
| `errors.po_not_draft` | Only draft purchase orders can be edited. | يجب أن يكون أمر الشراء في حالة مسودة. |
| `errors.po_not_found` | The purchase order could not be found. | أمر الشراء غير موجود. |
| `errors.pr_cannot_cancel` | This purchase request cannot be cancelled in its current state. | لا يمكن إلغاء طلب الشراء في حالته الحالية. |
| `errors.pr_has_orders` | This purchase request already has a purchase order. | توجد أوامر شراء مرتبطة بهذا الطلب. |
| `errors.pr_not_draft` | Only draft purchase requests can be edited. | يجب أن يكون طلب الشراء في حالة مسودة. |
| `errors.pr_not_found` | The purchase request could not be found. | طلب الشراء غير موجود. |
| `errors.projectIdMismatch` | The supplied project identifiers do not match. | معرّفات المشروع المقدمة غير متطابقة. |
| `errors.project_not_found` | The project could not be found. | لم يتم العثور على المشروع. |
| `errors.project_provisioning_rolled_back` | Project provisioning failed and was rolled back. | فشل تجهيز المشروع وتم التراجع عنه. |
| `errors.project_template_not_found` | The project template could not be found. | لم يتم العثور على قالب المشروع. |
| `errors.purchase_order_not_found` | The purchase order could not be found. | لم يتم العثور على أمر الشراء. |
| `errors.purchase_request_not_found` | The purchase requisition could not be found. | لم يتم العثور على طلب الشراء. |
| `errors.quantity_already_claimed` | That quantity is already reserved or certified on another application. | هذه الكمية محجوزة أو معتمدة بالفعل في طلب آخر. |
| `errors.quantity_claim_invalid` | Claimed quantity must be positive and within the certified measurement quantity. | يجب أن تكون الكمية المطالب بها موجبة وألا تتجاوز كمية القياس المعتمد. |
| `errors.quantity_measurement_duplicate` | A measurement can appear only once in an application. | يمكن إدراج القياس مرة واحدة فقط في الطلب. |
| `errors.quantity_measurement_not_certified` | Only certified measurements from this project can be claimed. | يمكن المطالبة بالقياسات المعتمدة من هذا المشروع فقط. |
| `errors.quantity_measurement_not_found` | One or more quantity measurements could not be found. | تعذر العثور على قياس واحد أو أكثر للكميات. |
| `errors.quantity_valuation_other_amounts_unsupported` | Quantity-based applications cannot include separate variation or material amounts. | لا يمكن أن تتضمن طلبات الكميات مبالغ منفصلة للتغييرات أو المواد. |
| `errors.quotation_not_compliant` | A non-compliant quotation cannot be awarded. | عرض السعر غير مطابق للمتطلبات. |
| `errors.quotation_not_found` | The supplier quotation could not be found. | عرض السعر غير موجود. |
| `errors.rateLimitUnavailable` | The rate limit service is temporarily unavailable. Please try again shortly. | خدمة تحديد معدل الطلبات غير متاحة مؤقتًا. يُرجى المحاولة بعد قليل. |
| `errors.rateLimited` | Too many requests. Please wait a moment. | عدد الطلبات كبير جدًا. يرجى الانتظار قليلًا. |
| `errors.reason_required` | Enter a reason with at least three characters. | أدخل سببًا من ثلاثة أحرف على الأقل. |
| `errors.recordInUse` | This record is used by other records and cannot be deleted. | هذا السجل مستخدم في سجلات أخرى ولا يمكن حذفه. |
| `errors.record_not_found` | The requested record was not found. | لم يتم العثور على السجل المطلوب. |
| `errors.requestFailed` | The request could not be completed. | تعذر إكمال الطلب. |
| `errors.retryLater` | This service is temporarily unavailable. Please try again shortly. | هذه الخدمة غير متاحة مؤقتًا. يرجى المحاولة بعد قليل. |
| `errors.retryLaterTimeout` | This request took too long. Please try again. | استغرق هذا الطلب وقتًا طويلًا. يرجى المحاولة مرة أخرى. |
| `errors.rfq_line_not_found` | The selected request line could not be found. | بند طلب عرض السعر غير موجود. |
| `errors.rfq_not_found` | The request for quotation could not be found. | طلب عرض السعر غير موجود. |
| `errors.schedule_activity_budget_update_failed` | The activity budget could not be saved. | تعذر حفظ ميزانية النشاط. |
| `errors.schedule_activity_not_found` | The schedule activity could not be found. | تعذر العثور على نشاط الجدول. |
| `errors.schedule_kpis_failed` | Schedule performance indicators could not be retrieved. | تعذر تحميل مؤشرات أداء الجدول. |
| `errors.schedule_project_scope_denied` | You do not have access to this project schedule. | ليس لديك صلاحية الوصول إلى جدول هذا المشروع. |
| `errors.schedule_resource_load_failed` | Resource loading could not be retrieved. | تعذر تحميل بيانات الموارد. |
| `errors.serverError` | Something went wrong on our side. | حدث خطأ من جانبنا. |
| `errors.sessionExpired` | Your session has expired. | انتهت صلاحية الجلسة. |
| `errors.stock_movement_not_found` | The stock movement could not be found. | لم يتم العثور على حركة المخزون. |
| `errors.supplier_invoice_duplicate` | This supplier has already submitted that invoice number. | فاتورة المورد مسجلة مسبقاً. |
| `errors.supplier_invoice_not_approvable` | This supplier invoice cannot be approved in its current state. | لا يمكن اعتماد فاتورة المورد في حالتها الحالية. |
| `errors.supplier_return_not_found` | The supplier return could not be found. | لم يتم العثور على مرتجع المورد. |
| `errors.team_member_duplicate` | This employee is already a member of the project team. | هذا الموظف عضو في فريق المشروع بالفعل. |
| `errors.team_member_not_found` | The team member could not be found. | لم يتم العثور على عضو الفريق. |
| `errors.transfer_already_processed` | This stock transfer has already been processed. | تمت معالجة تحويل المخزون هذا بالفعل. |
| `errors.transfer_not_found` | The stock transfer could not be found. | لم يتم العثور على تحويل المخزون. |
| `errors.unauthorized` | Please sign in to continue. | يرجى تسجيل الدخول للمتابعة. |
| `errors.unit_cost_not_accepted` | Unit cost is not accepted on this movement type; it is valued at the current weighted average. | لا يُقبل سعر الوحدة على هذا النوع من الحركة؛ يتم التقييم بسعر المتوسط المرجح الحالي. |
| `errors.unknown` | An unexpected error occurred. | حدث خطأ غير متوقع. |
| `errors.unknown_approval_module` | Unknown approval module. | وحدة اعتماد غير معروفة. |
| `errors.unknown_document_type` | Unknown document type. | نوع مستند غير معروف. |
| `errors.upload_rejected` | This file could not be uploaded. Check its type and size and try again. | تعذر رفع هذا الملف. تحقق من نوعه وحجمه ثم أعد المحاولة. |
| `errors.validation` | Some fields are invalid. Please review and try again. | بعض الحقول غير صحيحة. يرجى المراجعة والمحاولة مرة أخرى. |
| `errors.validation_error` | Some required values are invalid. Review the highlighted fields. | تحقق من القيم المدخلة وحاول مرة أخرى. |
| `errors.void_reason_required` | Enter a reason to void this record. | أدخل سببًا لإلغاء هذا السجل. |
| `errors.warehouse_not_found` | The warehouse could not be found. | لم يتم العثور على المستودع. |
| `errors.warehouse_stock_not_found` | The warehouse or item could not be found. | لم يتم العثور على المستودع أو الصنف. |

### expenses

| Catalog key | English | Arabic |
|---|---|---|
| `expenses.system.addExpense` | Add Expense | إضافة مصروف |
| `expenses.system.addNewExpense` | Add New Expense | إضافة مصروف جديد |
| `expenses.system.amount` | Amount | المبلغ |
| `expenses.system.amountEgp` | Amount (EGP) | المبلغ (ج.م) |
| `expenses.system.approved` | Approved | معتمد |
| `expenses.system.date` | Date | التاريخ |
| `expenses.system.editExpense` | Edit Expense | تعديل المصروف |
| `expenses.system.expenseLedger` | Expense Ledger | سجل المصروفات |
| `expenses.system.noExpensesFoundAddYourFirstExpense` | No expenses found. Add your first expense. | لا توجد مصروفات. أضف أول مصروف. |
| `expenses.system.noProject` | No Project | بدون مشروع |
| `expenses.system.notes` | Notes | ملاحظات |
| `expenses.system.paidBy` | Paid By | مدفوع بواسطة |
| `expenses.system.pending` | Pending | معلق |
| `expenses.system.project` | Project | المشروع |
| `expenses.system.projectOptional` | Project (optional) | المشروع (اختياري) |
| `expenses.system.rejected` | Rejected | مرفوض |
| `expenses.system.searchExpenses` | Search expenses... | بحث عن مصروفات... |
| `expenses.system.thisMonthCount` | This Month Count | مصروفات هذا الشهر |
| `expenses.system.thisMonthTotal` | This Month Total | إجمالي هذا الشهر |
| `expenses.system.totalExpenses` | Total Expenses | إجمالي المصروفات |
| `expenses.title` | Expenses | المصروفات |

### finance

| Catalog key | English | Arabic |
|---|---|---|
| `finance.accountMappingPurposes.cash` | Cash / bank | النقدية والبنوك |
| `finance.accountMappingPurposes.client_advance_liability` | Client advances liability | التزامات دفعات العميل المقدمة |
| `finance.accountMappingPurposes.client_other_deductions` | Client certificate deductions | استقطاعات شهادة العميل |
| `finance.accountMappingPurposes.client_retention_receivable` | Client retention receivable | مستحقات ضمان العميل |
| `finance.accountMappingPurposes.inventory` | Inventory | المخزون |
| `finance.accountMappingPurposes.material_cost` | Material cost | تكلفة المواد |
| `finance.accountMappingPurposes.other_expense` | Other expense | مصروفات أخرى |
| `finance.accountMappingPurposes.payable` | Accounts payable | الذمم الدائنة |
| `finance.accountMappingPurposes.receivable` | Accounts receivable | الذمم المدينة |
| `finance.accountMappingPurposes.revenue` | Project revenue | إيرادات المشاريع |
| `finance.accountMappingPurposes.salary_expense` | Salaries expense | مصروف الرواتب |
| `finance.accountMappingPurposes.service_cost` | Service cost | تكلفة الخدمات |
| `finance.accountMappingPurposes.subcontractor_advance_receivable` | Subcontractor advance recovery | مستحقات استرداد دفعات المقاول |
| `finance.accountMappingPurposes.subcontractor_certificate_cost` | Subcontractor certified cost | تكلفة مستخلص المقاول |
| `finance.accountMappingPurposes.subcontractor_other_deductions` | Subcontractor certificate deductions | استقطاعات شهادة المقاول |
| `finance.accountMappingPurposes.subcontractor_retention_payable` | Subcontractor retention payable | مستحقات ضمان المقاول |
| `finance.accountMappingPurposes.vat_input` | Input VAT receivable | ضريبة القيمة المضافة المدخلة |
| `finance.accountMappingPurposes.vat_output` | Output VAT payable | ضريبة القيمة المضافة المستحقة |
| `finance.accountMappings.account` | Chart account | حساب دليل الحسابات |
| `finance.accountMappings.confirmAction` | Confirm mapping | تأكيد الربط |
| `finance.accountMappings.confirmError` | Could not confirm this account mapping. | تعذر تأكيد ربط الحساب. |
| `finance.accountMappings.confirmed` | Mapping confirmation recorded. | تم تسجيل تأكيد الربط. |
| `finance.accountMappings.confirmedStatus` | Owner confirmed | مؤكد من المالك |
| `finance.accountMappings.denied` | Only finance administrators can manage account mappings. | إدارة روابط الحسابات متاحة لمسؤولي المالية فقط. |
| `finance.accountMappings.key` | Mapping key | مفتاح الربط |
| `finance.accountMappings.loadError` | Could not load account mappings. | تعذر تحميل روابط الحسابات. |
| `finance.accountMappings.loading` | Loading account mappings… | جارٍ تحميل روابط الحسابات… |
| `finance.accountMappings.provisionalNotice` | All mappings are provisional until the finance owner confirms the correct chart accounts. Mapping changes clear the confirmation and remain provisional. | جميع عمليات الربط مؤقتة حتى يؤكد مسؤول المالية الحسابات الصحيحة. يؤدي تغيير الربط إلى إلغاء التأكيد وإعادته إلى الحالة المؤقتة. |
| `finance.accountMappings.purpose` | Posting purpose | الغرض المحاسبي |
| `finance.accountMappings.saveError` | Could not save this account mapping. | تعذر حفظ ربط الحساب. |
| `finance.accountMappings.saved` | Mapping saved and returned to provisional status. | تم حفظ الربط وإعادته إلى الحالة المؤقتة. |
| `finance.accountMappings.selectAccount` | Chart account for {key} | حساب دليل الحسابات للمفتاح {key} |
| `finance.accountMappings.status` | Confirmation | حالة التأكيد |
| `finance.accountMappings.title` | Chart of accounts mappings | ربط الحسابات بدليل الحسابات |
| `finance.accountMappings.unconfirmed` | Provisional / unconfirmed | مؤقت / غير مؤكد |
| `finance.cashFlow.apAging` | Payables aging (AP) | أعمار الذمم الدائنة |
| `finance.cashFlow.arAging` | Receivables aging (AR) | أعمار الذمم المدينة |
| `finance.cashFlow.bucket` | Aging bucket | الفترة العمرية |
| `finance.cashFlow.buckets.1_30` | 1-30 days | ١-٣٠ يومًا |
| `finance.cashFlow.buckets.31_60` | 31-60 days | ٣١-٦٠ يومًا |
| `finance.cashFlow.buckets.61_90` | 61-90 days | ٦١-٩٠ يومًا |
| `finance.cashFlow.buckets.90_plus` | 90+ days | أكثر من ٩٠ يومًا |
| `finance.cashFlow.buckets.current` | Current | غير مستحق |
| `finance.cashFlow.description` | Company-wide receivable and payable aging with retention balances. | أعمار الذمم المدينة والدائنة على مستوى الشركة مع أرصدة المحتجزات. |
| `finance.cashFlow.empty` | No outstanding receivables, payables or retention balances. | لا توجد ذمم مستحقة أو أرصدة محتجزات. |
| `finance.cashFlow.outstanding` | Outstanding | المستحق |
| `finance.cashFlow.refresh` | Refresh | تحديث |
| `finance.cashFlow.retentionPayable` | Retention held for subcontractors | محتجزات محتجزة للمقاولين من الباطن |
| `finance.cashFlow.retentionReceivable` | Retention held from clients | محتجزات محتجزة من العملاء |
| `finance.cashFlow.title` | Cash flow | التدفق النقدي |
| `finance.invoices` | Invoices | الفواتير |
| `finance.payments` | Payments | المدفوعات |
| `finance.system.addInvoice` | Add Invoice | إضافة فاتورة |
| `finance.system.addNewInvoice` | Add New Invoice | إضافة فاتورة جديدة |
| `finance.system.amountEgp` | Amount (EGP) | المبلغ (ج.م) |
| `finance.system.amountIsRequired` | Amount is required | المبلغ مطلوب |
| `finance.system.client` | Client: | العميل: |
| `finance.system.clientIsRequired` | Client is required | العميل مطلوب |
| `finance.system.date` | Date | التاريخ |
| `finance.system.dueDate` | Due Date | تاريخ الاستحقاق |
| `finance.system.dueDate2` | Due Date: | تاريخ الاستحقاق: |
| `finance.system.editInvoice` | Edit Invoice | تعديل الفاتورة |
| `finance.system.invoice` | Invoice # | رقم الفاتورة |
| `finance.system.invoiceAmount` | Invoice Amount | قيمة الفاتورة |
| `finance.system.invoiceDetail` | Invoice Detail | تفاصيل الفاتورة |
| `finance.system.invoiceManagementCollections` | Invoice Management & Collections | إدارة الفواتير وتحصيل المدفوعات |
| `finance.system.invoicesPayments` | Invoices & Payments | الفواتير والمدفوعات |
| `finance.system.issueDate` | Issue Date | تاريخ الإصدار |
| `finance.system.issueDate2` | Issue Date: | تاريخ الإصدار: |
| `finance.system.method` | Method | طريقة الدفع |
| `finance.system.noInvoicesAddYourFirstInvoice` | No invoices. Add your first invoice. | لا توجد فواتير. أضف أول فاتورة. |
| `finance.system.noPaymentsRecordedYet` | No payments recorded yet. | لا توجد دفعات مسجلة بعد. |
| `finance.system.overdueCount` | Overdue Count | عدد الفواتير المتأخرة |
| `finance.system.paid` | Paid | المدفوع |
| `finance.system.paymentDate` | Payment Date | تاريخ الدفع |
| `finance.system.paymentMethod` | Payment Method | طريقة الدفع |
| `finance.system.paymentRecords` | Payment Records | سجل المدفوعات |
| `finance.system.project` | Project | المشروع |
| `finance.system.project2` | Project: | المشروع: |
| `finance.system.projectIsRequired` | Project is required | المشروع مطلوب |
| `finance.system.recordNewPayment` | Record New Payment | تسجيل دفعة جديدة |
| `finance.system.recordPayment` | Record Payment | تسجيل دفعة |
| `finance.system.recordPayment2` | Record Payment | تسجيل الدفعة |
| `finance.system.reference` | Reference | رقم مرجعي |
| `finance.system.referenceNumber` | Reference Number | رقم مرجعي |
| `finance.system.remaining` | Remaining | المتبقي |
| `finance.system.searchInvoices` | Search invoices... | بحث عن فواتير... |
| `finance.system.selectClient` | Select Client | اختر العميل |
| `finance.system.selectProject` | Select Project | اختر المشروع |
| `finance.system.totalCollected` | Total Collected | إجمالي المحصل |
| `finance.system.totalOutstanding` | Total Outstanding | إجمالي المستحق |
| `finance.system.viewDetails` | View Details | عرض التفاصيل |
| `finance.title` | Finance | المالية |
| `finance.void.action` | Void | إلغاء |
| `finance.void.confirm` | Void | إلغاء |
| `finance.void.invoiceMessage` | Invoice {number} will be marked void and stop counting toward totals. It cannot be paid afterwards. The record is kept. | سيتم وسم الفاتورة {number} كملغاة ولن تُحتسب ضمن الإجماليات، ولا يمكن سدادها بعد ذلك. يتم الاحتفاظ بالسجل. |
| `finance.void.invoiceTitle` | Void invoice | إلغاء الفاتورة |
| `finance.void.paymentMessage` | This payment will be marked void and stop counting toward what the invoice has been paid. The record is kept. | سيتم وسم هذه الدفعة كملغاة ولن تُحتسب ضمن المبلغ المسدد للفاتورة. يتم الاحتفاظ بالسجل. |
| `finance.void.paymentTitle` | Void payment | إلغاء الدفعة |
| `finance.void.voidedBadge` | Void | ملغاة |
| `finance.workbench.actionError` | The finance action could not be completed. Check your access and the record status, then try again. | تعذر إتمام الإجراء المالي. تحقق من صلاحيتك وحالة السجل ثم أعد المحاولة. |
| `finance.workbench.addLine` | Add cost code | إضافة بند تكلفة |
| `finance.workbench.adjustCommitment` | Adjust a commitment | تعديل التزام |
| `finance.workbench.adjustHelp` | Records a manual cancellation (descope) with a reason; every change keeps a history row. | يسجل إلغاءً يدويًا (تخفيض نطاق) مع ذكر السبب؛ ويُحفظ سجل لكل تغيير. |
| `finance.workbench.amount` | Amount | المبلغ |
| `finance.workbench.applications` | Payment applications | طلبات المستخلصات |
| `finance.workbench.approve` | Approve | اعتماد |
| `finance.workbench.approved` | Approved | معتمد |
| `finance.workbench.batchHelp` | Use a supplier invoice ID and amount from the approved accounts payable record. | استخدم معرّف فاتورة المورد ومبلغها من سجل الحسابات الدائنة المعتمد. |
| `finance.workbench.batchScope` | Payment batches require a company-wide finance grant. | تتطلب دفعات الموردين صلاحية مالية على مستوى الشركة. |
| `finance.workbench.batches` | Payment batches | دفعات الموردين |
| `finance.workbench.budgets` | Budget versions | إصدارات الميزانية |
| `finance.workbench.cancelledAmount` | Cancelled amount | المبلغ الملغى |
| `finance.workbench.certificates` | Payment certificates | شهادات الدفع |
| `finance.workbench.certified` | Application certified. | تم اعتماد طلب المستخلص. |
| `finance.workbench.certify` | Certify claim | اعتماد المطالبة |
| `finance.workbench.claimed` | Claimed total | إجمالي المطالبة |
| `finance.workbench.claimed_materials` | Claimed materials | المواد المطالب بها |
| `finance.workbench.claimed_variations` | Claimed variations | التغييرات المطالب بها |
| `finance.workbench.claimed_work` | Claimed work | الأعمال المطالب بها |
| `finance.workbench.client` | Client | العميل |
| `finance.workbench.commitment` | Commitment | الالتزام |
| `finance.workbench.commitments` | Commitments (purchase orders and subcontracts) | الالتزامات (أوامر الشراء وعقود الباطن) |
| `finance.workbench.contractId` | Contract ID | معرّف العقد |
| `finance.workbench.costCodeId` | Cost code ID (optional) | معرّف بند التكلفة (اختياري) |
| `finance.workbench.create` | Create draft | إنشاء مسودة |
| `finance.workbench.created` | Draft created. | تم إنشاء المسودة. |
| `finance.workbench.creditNotes` | Credit notes | الإشعارات الدائنة |
| `finance.workbench.currency` | Currency | العملة |
| `finance.workbench.empty` | No records are available for this project. | لا توجد سجلات لهذا المشروع. |
| `finance.workbench.errors.certificate_lines_do_not_balance` | The certificate amounts do not balance. | مبالغ الشهادة غير متوازنة. |
| `finance.workbench.errors.maker_checker_violation` | The preparer cannot approve this record. | لا يمكن لمن أعد السجل اعتماده. |
| `finance.workbench.estimateToComplete` | Estimate to complete (ETC) | التكلفة المقدرة لإكمال العمل (ETC) |
| `finance.workbench.forecastAtCompletion` | Forecast at completion | التكلفة المتوقعة عند الإتمام |
| `finance.workbench.forecasts` | Forecast versions | إصدارات التوقعات |
| `finance.workbench.invoice` | Invoice | الفاتورة |
| `finance.workbench.issue` | Issue credit note | إصدار الإشعار الدائن |
| `finance.workbench.issued` | Credit note issued. | تم إصدار الإشعار الدائن. |
| `finance.workbench.net` | Net certified | صافي المستخلص |
| `finance.workbench.newApplication` | New payment application | طلب مستخلص جديد |
| `finance.workbench.newBatch` | New supplier payment batch | دفعة موردين جديدة |
| `finance.workbench.newBudget` | New budget version | إصدار ميزانية جديد |
| `finance.workbench.newCreditNote` | New credit note | إشعار دائن جديد |
| `finance.workbench.newForecast` | New forecast version | إصدار توقع جديد |
| `finance.workbench.newRetentionRelease` | Post retention release | تسجيل صرف الاستقطاع |
| `finance.workbench.number` | Number | الرقم |
| `finance.workbench.original` | Original amount | المبلغ الأصلي |
| `finance.workbench.party` | Party type | نوع الطرف |
| `finance.workbench.paymentDate` | Payment date | تاريخ الدفع |
| `finance.workbench.posted` | Posted | مسجل |
| `finance.workbench.projectDataUnavailable` | This project finance list could not be loaded. | تعذر تحميل قائمة السجلات المالية للمشروع. |
| `finance.workbench.provisionalNotice` | Posting account mappings remain provisional until the finance owner confirms them. | تظل روابط الحسابات مؤقتة حتى يؤكد مسؤول المالية صحتها. |
| `finance.workbench.reason` | Reason | السبب |
| `finance.workbench.refresh` | Refresh finance records | تحديث السجلات المالية |
| `finance.workbench.release` | Release | صرف |
| `finance.workbench.released` | Release posted. | تم تسجيل عملية الصرف. |
| `finance.workbench.removeLine` | Remove line | حذف البند |
| `finance.workbench.retentionHelp` | The release is checked against held retention, posted to the ledger, and can be reversed with a reason. | يتم التحقق من المبلغ مقابل الاستقطاع المحتجز، وتسجيل القيد، ويمكن عكسه مع ذكر السبب. |
| `finance.workbench.retentionReleases` | Retention release history | سجل صرف الاستقطاعات |
| `finance.workbench.saveAdjustment` | Save adjustment | حفظ التعديل |
| `finance.workbench.saved` | Changes saved. | تم حفظ التغييرات. |
| `finance.workbench.selectCommitment` | Select a commitment | اختر التزامًا |
| `finance.workbench.selectInvoice` | Select an invoice | اختر فاتورة |
| `finance.workbench.source` | Source | المصدر |
| `finance.workbench.startWorkflow` | Start approval | بدء الاعتماد |
| `finance.workbench.started` | Approval started. | بدأ مسار الاعتماد. |
| `finance.workbench.subcontractor` | Subcontractor | مقاول الباطن |
| `finance.workbench.submit` | Submit | إرسال |
| `finance.workbench.submitted` | Submitted for approval | مرسل للاعتماد |
| `finance.workbench.supplier` | Supplier | المورد |
| `finance.workbench.supplierInvoiceId` | Supplier invoice ID | معرّف فاتورة المورد |
| `finance.workbench.tabs.applications` | Applications and certificates | المستخلصات والشهادات |
| `finance.workbench.tabs.batches` | Payment batches | دفعات الموردين |
| `finance.workbench.tabs.commitments` | Commitments | الالتزامات |
| `finance.workbench.tabs.creditNotes` | Credit notes | الإشعارات الدائنة |
| `finance.workbench.tabs.retention` | Retention releases | صرف الاستقطاع |
| `finance.workbench.tabs.versions` | Budget and forecast | الميزانية والتوقعات |
| `finance.workbench.tabsLabel` | Finance record groups | مجموعات السجلات المالية |
| `finance.workbench.title` | Project finance records | سجلات مالية المشروع |
| `finance.workbench.version` | Version | الإصدار |
| `finance.workbench.void` | Void release | إلغاء الصرف |
| `finance.workbench.voidReason` | Reason to void a release | سبب إلغاء عملية الصرف |
| `finance.workbench.voided` | Voided | ملغى |

### handover

| Catalog key | English | Arabic |
|---|---|---|
| `handover.asset` | Asset | الأصل |
| `handover.assetCode` | Asset code | رمز الأصل |
| `handover.assetDocuments` | Asset documents | مستندات الأصل |
| `handover.assetName` | Asset name | اسم الأصل |
| `handover.commissioningDate` | Commissioning date | تاريخ التشغيل |
| `handover.coverage` | Coverage description | نطاق التغطية |
| `handover.documentAttached` | Controlled document attached | تم إرفاق مستند محمي |
| `handover.endDate` | Coverage ends | تاريخ النهاية |
| `handover.errors.asset_not_found` | The asset could not be found. | تعذر العثور على الأصل. |
| `handover.errors.handover_document_project_mismatch` | Choose a controlled document from this project. | اختر مستنداً مضبوطاً من هذا المشروع. |
| `handover.errors.handover_document_required` | Upload and attach evidence before marking this item uploaded. | ارفع وأرفق الدليل قبل تعليم البند بأنه مرفوع. |
| `handover.errors.internal_error` | The request could not be completed. Try again. | تعذر إكمال الطلب. حاول مرة أخرى. |
| `handover.errors.invalid_asset_document` | Check the asset document details and try again. | تحقق من بيانات مستند الأصل ثم حاول مرة أخرى. |
| `handover.errors.invalid_project_id` | Choose a valid project. | اختر مشروعاً صالحاً. |
| `handover.errors.invalid_warranty` | Check the warranty details and dates. | تحقق من بيانات الضمان وتواريخه. |
| `handover.errors.invalid_warranty_status` | Choose a valid warranty status. | اختر حالة ضمان صالحة. |
| `handover.errors.project_scope_denied` | You do not have access to this project. | ليس لديك صلاحية لهذا المشروع. |
| `handover.errors.warranty_asset_project_mismatch` | Choose an asset from this project. | اختر أصلاً من هذا المشروع. |
| `handover.errors.warranty_not_found` | The warranty could not be found. | تعذر العثور على الضمان. |
| `handover.errors.warranty_package_project_mismatch` | Choose a handover item from this project. | اختر بند تسليم من هذا المشروع. |
| `handover.legacyDocumentUrl` | Legacy URL; attach a controlled project document to protect access. | يوجد رابط مستند قديم؛ ارفع المستند للوصول المحمي. |
| `handover.model` | Model | الطراز |
| `handover.newAsset` | New project asset | إضافة أصل للتسليم |
| `handover.newWarranty` | New warranty | إضافة ضمان |
| `handover.noAsset` | No asset linked | لا يوجد أصل مرتبط |
| `handover.noWarranties` | No warranties registered. | لا توجد ضمانات مسجلة بعد. |
| `handover.notes` | Notes | ملاحظات |
| `handover.reactivateWarranty` | Reactivate | إعادة تفعيل |
| `handover.serialNumber` | Serial number | الرقم التسلسلي |
| `handover.startDate` | Coverage starts | تاريخ البداية |
| `handover.status` | Status | الحالة |
| `handover.system.advance` | Advance | تقديم |
| `handover.system.approve` | Approve | اعتماد |
| `handover.system.assetRegister` | Asset register | سجل الأصول |
| `handover.system.assetRegisterPdf` | Asset register PDF | سجل الأصول بصيغة مستند |
| `handover.system.checklistPdf` | Checklist PDF | قائمة الفحص بصيغة مستند |
| `handover.system.claim` | Claim | مطالبة |
| `handover.system.code` | Code | الرمز |
| `handover.system.commissioned` | Commissioned | التشغيل |
| `handover.system.complete` | Complete | مكتمل |
| `handover.system.documents` | Documents | المستندات |
| `handover.system.due` | Due | الاستحقاق |
| `handover.system.handoverCertificate` | Handover certificate | شهادة التسليم |
| `handover.system.handoverCloseout` | Handover & closeout | التسليم والإقفال |
| `handover.system.handoverPackage` | Handover package | حزمة التسليم |
| `handover.system.handoverReadiness` | Handover readiness | جاهزية التسليم |
| `handover.system.item` | Item | البند |
| `handover.system.lifecycle` | Lifecycle | دورة التسليم |
| `handover.system.lifecyclePackageChecklistAssetRegisterWarrantyClaims` | Lifecycle, package checklist, asset register & warranty claims | دورة التسليم والحزمة وسجل الأصول ومطالبات الضمان |
| `handover.system.name` | Name | الاسم |
| `handover.system.newAsset` | New asset | أصل جديد |
| `handover.system.newClaim` | New claim | مطالبة جديدة |
| `handover.system.noAssetsRegisteredYet` | No assets registered yet. | لا توجد أصول. |
| `handover.system.noHandoverProcessStartedYet` | No handover process started yet. | لم تبدأ دورة التسليم بعد. |
| `handover.system.noWarrantyClaimsTheDlpRegisterIsClean` | No warranty claims — the DLP register is clean. | لا مطالبات — السجل نظيف. |
| `handover.system.openPunchItems` | Open punch items | بنود PUNCH مفتوحة |
| `handover.system.packageItems` | Package items | بنود الحزمة |
| `handover.system.serial` | Serial | الرقم التسلسلي |
| `handover.system.startHandoverProcess` | Start handover process | بدء إجراءات التسليم |
| `handover.system.status` | Status | الحالة |
| `handover.system.theHandoverPackageIsEmpty0Complete` | The handover package is empty — 0% complete. | الحزمة فارغة (0% جاهزية). |
| `handover.system.title` | Title | العنوان |
| `handover.system.warrantyClaims` | Warranty claims | مطالبات الضمان |
| `handover.system.warrantyEnd` | Warranty end | نهاية الضمان |
| `handover.system.warrantyRegisterPdf` | Warranty register PDF | سجل الضمانات بصيغة مستند |
| `handover.title` | Handover | التسليم |
| `handover.uploadAssetDocument` | Upload asset document | رفع مستند للأصل |
| `handover.uploadEvidence` | Upload evidence | رفع مستند الإثبات |
| `handover.voidWarranty` | Void | إلغاء |
| `handover.warranties` | Warranty register | سجل الضمانات |
| `handover.warranty` | Warranty | الضمان |
| `handover.warrantyDocument` | Warranty document (optional) | مستند الضمان (اختياري) |
| `handover.warrantyIssuer` | Issuer | الجهة المصدرة |
| `handover.warrantyNumber` | Warranty number | رقم الضمان |
| `handover.warrantyStatuses.active` | Active | ساري |
| `handover.warrantyStatuses.expired` | Expired | منتهي |
| `handover.warrantyStatuses.void` | Void | ملغى |
| `handover.warrantyTitle` | Warranty | العنوان |

### hr

| Catalog key | English | Arabic |
|---|---|---|
| `hr.employees` | Employees | الموظفون |
| `hr.system.active` | Active | نشط |
| `hr.system.addEmployee` | Add Employee | إضافة موظف |
| `hr.system.addLaborPayment` | Add Labor Payment | إضافة دفعة عامل |
| `hr.system.addLaborer` | Add Laborer | إضافة عامل |
| `hr.system.addNewEmployee` | Add New Employee | إضافة موظف جديد |
| `hr.system.addNewLaborer` | Add New Laborer | إضافة عامل جديد |
| `hr.system.addPayment` | Add Payment | إضافة دفعة |
| `hr.system.basicSalary` | Basic Salary | الراتب الأساسي |
| `hr.system.checkIn` | Check In | وقت الحضور |
| `hr.system.checkOut` | Check Out | وقت الانصراف |
| `hr.system.dailyRate` | Daily Rate | سعر اليومية |
| `hr.system.date` | Date | التاريخ |
| `hr.system.day` | /day | /يوم |
| `hr.system.days` | Days | الأيام |
| `hr.system.days2` | Days | عدد الأيام |
| `hr.system.department` | Department | القسم |
| `hr.system.departmentManager` | Department Manager | مدير قسم |
| `hr.system.deptManager` | Dept. Manager | مدير قسم |
| `hr.system.designation` | Designation | المسمى الوظيفي |
| `hr.system.edit` | Edit: {code} | تعديل: {code} |
| `hr.system.email` | Email | البريد الإلكتروني |
| `hr.system.employee` | Employee | الموظف |
| `hr.system.englishName` | English Name * | الاسم بالإنجليزية * |
| `hr.system.fullName` | Full Name | الاسم |
| `hr.system.fullName2` | Full Name | الاسم الكامل |
| `hr.system.hireDate` | Hire Date | تاريخ التوظيف |
| `hr.system.humanResources` | Human Resources | الموارد البشرية |
| `hr.system.inactive` | Inactive | غير نشط |
| `hr.system.laborer` | Laborer | العامل |
| `hr.system.manageEmployeesLaborersAttendance` | Manage employees, laborers & attendance | إدارة الموظفين والعمال والحضور |
| `hr.system.noAttendanceRecordsForThisDate` | No attendance records for this date. | لا توجد سجلات حضور لهذا التاريخ. |
| `hr.system.noEmployeesFoundAddYourFirstEmployee` | No employees found. Add your first employee. | لا يوجد موظفين. أضف أول موظف. |
| `hr.system.noLaborersFoundAddYourFirstLaborer` | No laborers found. Add your first laborer. | لا يوجد عمال يومية. أضف أول عامل. |
| `hr.system.noPaymentsFoundAddYourFirstPayment` | No payments found. Add your first payment. | لا توجد مدفوعات. أضف أول دفعة. |
| `hr.system.notes` | Notes | ملاحظات |
| `hr.system.onLeave` | On Leave | في إجازة |
| `hr.system.phone` | Phone | الهاتف |
| `hr.system.project` | Project | المشروع |
| `hr.system.projectId` | Project ID | المشروع |
| `hr.system.recordAttendance` | Record Attendance | تسجيل حضور |
| `hr.system.salary` | Salary | الراتب |
| `hr.system.searchEmployees` | Search employees... | بحث عن موظف... |
| `hr.system.searchLaborers` | Search laborers... | بحث عن عامل... |
| `hr.system.select` | — Select — | — اختر — |
| `hr.system.skill` | Skill | المهارة |
| `hr.system.skillCategory` | Skill Category | المهارة |
| `hr.system.terminated` | Terminated | منتهي الخدمة |
| `hr.system.total` | Total | الإجمالي |
| `hr.title` | HR | الموارد البشرية |

### hse

| Catalog key | English | Arabic |
|---|---|---|
| `hse.incidents` | Incidents | الحوادث |
| `hse.permits` | Permits to work | تصاريح العمل |
| `hse.system.activePermitSPastValidityCloseOrRenewThem` | {expired_active} active permit(s) past validity — close or renew them. | {expired_active} تصريح نشط انتهت صلاحيته — يجب إغلاقه |
| `hse.system.activePermits` | Active permits | تصاريح سارية |
| `hse.system.activity` | Activity | النشاط |
| `hse.system.add` | Add | إضافة |
| `hse.system.approve` | Approve | موافقة |
| `hse.system.approve2` | Approve | اعتماد |
| `hse.system.attendees` | Attendees | عدد الحضور |
| `hse.system.attendees2` | Attendees | الحضور |
| `hse.system.cancel` | Cancel | إلغاء |
| `hse.system.category` | Category | التصنيف |
| `hse.system.close` | Close | إغلاق |
| `hse.system.conditions` | Conditions | الشروط |
| `hse.system.controls` | Controls | إجراءات التحكم |
| `hse.system.critical` | Critical | حرج |
| `hse.system.date` | Date | التاريخ |
| `hse.system.daysWithoutLti` | Days without LTI | أيام بدون حادث فقدان وقت |
| `hse.system.defects` | Defects | العيوب |
| `hse.system.description` | Description | الوصف |
| `hse.system.drillType` | Drill type | نوع التدريب |
| `hse.system.drills` | Drills | تدريبات |
| `hse.system.environmental` | Environmental | بيئي |
| `hse.system.equipment` | Equipment | فحص المعدات |
| `hse.system.equipment2` | Equipment | المعدة |
| `hse.system.equipmentName` | Equipment name | اسم المعدة |
| `hse.system.findings` | Findings | الملاحظات |
| `hse.system.hazards` | Hazards | المخاطر |
| `hse.system.hse` | HSE | الصحة والسلامة |
| `hse.system.hseDashboard` | HSE Dashboard | لوحة HSE |
| `hse.system.immediateAction` | Immediate action | الإجراء الفوري |
| `hse.system.inductions` | Inductions | التعريفات |
| `hse.system.injuredParty` | Injured party | المتضرر |
| `hse.system.injury` | Injury | إصابة |
| `hse.system.inspections` | Inspections | التفتيش |
| `hse.system.investigate` | Investigate | تحقيق |
| `hse.system.item` | Item | الصنف |
| `hse.system.jsa` | JSA | تحليل سلامة العمل |
| `hse.system.jsaRisk` | JSA / Risk | JSA والمخاطر |
| `hse.system.likelihood` | Likelihood | الاحتمالية |
| `hse.system.likelihoodHigh` | Likelihood: High | الاحتمالية: مرتفعة |
| `hse.system.likelihoodLow` | Likelihood: Low | الاحتمالية: منخفضة |
| `hse.system.likelihoodMedium` | Likelihood: Medium | الاحتمالية: متوسطة |
| `hse.system.lostDays` | Lost days | أيام العمل المفقودة |
| `hse.system.lostTimeInjuryLti` | Lost-time injury (LTI) | حادث فقدان وقت (LTI) |
| `hse.system.lti` | LTI | إصابة مهدرة للوقت |
| `hse.system.major` | Major | جسيم |
| `hse.system.manHoursToday` | Man-hours today | ساعات عمل (اليوم) |
| `hse.system.minor` | Minor | بسيط |
| `hse.system.nearMisses` | Near Misses | الأحداث الوشيكة |
| `hse.system.new` | New | جديد |
| `hse.system.newPermit` | New Permit | تصريح جديد |
| `hse.system.nm` | NM | حادث وشيك |
| `hse.system.noIncidentsReported` | No incidents reported. | لا توجد حوادث. |
| `hse.system.noNearMissesReported` | No near misses reported. | لا توجد أحداث وشيك. |
| `hse.system.noPermitsToWorkIssued` | No permits to work issued. | لا توجد تصاريح. |
| `hse.system.noRecordsInThisRegister` | No records in this register. | لا توجد سجلات. |
| `hse.system.noRecordsYet` | No records yet. | لا توجد سجلات. |
| `hse.system.openIncidents` | Open incidents | حوادث مفتوحة |
| `hse.system.openNearMisses` | Open near misses | حوادث شبه مفتوحة |
| `hse.system.organization` | Organization | الجهة |
| `hse.system.other` | Other | أخرى |
| `hse.system.overdueActions` | Overdue actions | إجراءات متأخرة |
| `hse.system.participants` | Participants | المشاركون |
| `hse.system.permit` | Permit | تصريح |
| `hse.system.permits` | Permits | تصاريح العمل |
| `hse.system.permitsExpiringToday` | Permits expiring today | تصاريح تنتهي اليوم |
| `hse.system.permitsIncidentsSafetyRegisters` | Permits, incidents & safety registers | التصاريح والحوادث والسجلات السلامة |
| `hse.system.person` | Person | الشخص |
| `hse.system.personName` | Person name | الشخص |
| `hse.system.personalProtectiveEquipment` | Personal protective equipment | معدات الوقاية الشخصية |
| `hse.system.ppeItem` | PPE item | الصنف |
| `hse.system.property` | Property | ممتلكات |
| `hse.system.qty` | Qty | الكمية |
| `hse.system.registers` | Registers | السجلات |
| `hse.system.reject` | Reject | رفض |
| `hse.system.reopen` | Reopen | إعادة |
| `hse.system.reportIncident` | Report Incident | حادث جديد |
| `hse.system.reportNearMiss` | Report Near Miss | حدث وشيك |
| `hse.system.result` | Result | النتيجة |
| `hse.system.resume` | Resume | استئناف |
| `hse.system.review` | Review | مراجعة |
| `hse.system.risk` | Risk | مستوى الخطر |
| `hse.system.riskAssessments` | Risk Assessments | تقييم المخاطر |
| `hse.system.save` | Save | حفظ |
| `hse.system.severity` | Severity | الخطورة |
| `hse.system.severityHigh` | Severity: High | الشدة: مرتفعة |
| `hse.system.severityLow` | Severity: Low | الشدة: منخفضة |
| `hse.system.severityMedium` | Severity: Medium | الشدة: متوسطة |
| `hse.system.site` | site | الموقع |
| `hse.system.status` | Status | الحالة |
| `hse.system.submit` | Submit | إرسال |
| `hse.system.suspend` | Suspend | إيقاف |
| `hse.system.title` | Title | العنوان |
| `hse.system.toolboxTalks` | Toolbox Talks | التوعية |
| `hse.system.topic` | Topic | الموضوع |
| `hse.system.type` | Type | النوع |
| `hse.system.validFrom` | Valid from | ساري من |
| `hse.system.validTo` | Valid to | ساري حتى |
| `hse.system.validTo2` | Valid to | صالح حتى |
| `hse.system.vehicle` | Vehicle | مركبة |
| `hse.title` | Health, safety & environment | الصحة والسلامة والبيئة |

### inventory

| Catalog key | English | Arabic |
|---|---|---|
| `inventory.empty` | No items yet. | لا توجد أصناف بعد. |
| `inventory.lowStock` | Low stock | مخزون منخفض |
| `inventory.record.deleteConfirm` | Delete | حذف |
| `inventory.record.deleteMessage` | {name} will be hidden from lists and pickers. Existing orders and stock history keep it, and you can restore it later. | سيتم إخفاء {name} من القوائم وقوائم الاختيار. تحتفظ بها الطلبات وسجل المخزون الحالي ويمكنك استعادتها لاحقًا. |
| `inventory.record.deleteTitle` | Delete item | حذف المادة |
| `inventory.record.deletedBadge` | Deleted | محذوفة |
| `inventory.record.restore` | Restore | استعادة |
| `inventory.record.showDeleted` | Show deleted items | عرض المواد المحذوفة |
| `inventory.reservations.createdAt` | Created | أُنشئ في |
| `inventory.reservations.description` | Reserved stock subtracts from available, never from physical. | المخزون المحجوز يُخصم من المتاح وليس من الرصيد الفعلي. |
| `inventory.reservations.empty` | No stock reservations match this filter. | لا توجد حجوزات مخزون مطابقة لهذا الفلتر. |
| `inventory.reservations.expiresAt` | Expires | ينتهي في |
| `inventory.reservations.footnote` | A reservation reserves availability until it is released or expires. | يبقى الحجز محتجزًا من المتاح حتى يُفلت أو ينتهي. |
| `inventory.reservations.material` | Material | المادة |
| `inventory.reservations.newReservation` | New reservation | حجز جديد |
| `inventory.reservations.noExpiry` | No expiry | بدون تاريخ انتهاء |
| `inventory.reservations.noProject` | Company-wide | على مستوى الشركة |
| `inventory.reservations.noWarehouse` | No warehouse scope | بدون مخزن محدد |
| `inventory.reservations.project` | Project | المشروع |
| `inventory.reservations.quantity` | Quantity | الكمية |
| `inventory.reservations.refresh` | Refresh | تحديث |
| `inventory.reservations.release` | Release | إفلات الحجز |
| `inventory.reservations.reserve` | Reserve | حجز |
| `inventory.reservations.statusFilter` | Status | الحالة |
| `inventory.reservations.title` | Stock reservations | حجوزات المخزون |
| `inventory.reservations.warehouse` | Warehouse (optional) | المخزن (اختياري) |
| `inventory.system.active` | Active | نشط |
| `inventory.system.addItem` | Add Item | إضافة مادة |
| `inventory.system.addNewItem` | Add New Item | إضافة مادة جديدة |
| `inventory.system.autoGenerated` | (auto-generated) | (سيتم توليده تلقائياً) |
| `inventory.system.category` | Category | الفئة الرئيسية |
| `inventory.system.code` | Code | الكود |
| `inventory.system.constructionMaterialsCatalog` | Construction Materials Catalog | كتالوج مواد الإنشاءات |
| `inventory.system.edit` | Edit: {code} | تعديل: {code} |
| `inventory.system.englishName` | English Name * | الاسم بالإنجليزية * |
| `inventory.system.noItemsFoundAddYourFirstItem` | No items found. Add your first item. | لا توجد مواد. أضف أول مادة. |
| `inventory.system.searchItems` | Search items... | بحث عن مواد... |
| `inventory.system.selectSubCategory` | Select Sub Category | اختر الفئة الفرعية |
| `inventory.system.subCategory` | Sub Category | الفئة الفرعية |
| `inventory.system.unit` | Unit | الوحدة |
| `inventory.title` | Inventory | المخزون |

### legal

| Catalog key | English | Arabic |
|---|---|---|
| `legal.system.addDocument` | Add Document | إضافة مستند |
| `legal.system.addNewDocument` | Add New Document | إضافة مستند جديد |
| `legal.system.date` | Date | التاريخ |
| `legal.system.documentType` | Document Type | نوع المستند |
| `legal.system.editDocument` | Edit Document | تعديل المستند |
| `legal.system.legalComplianceDocumentManagement` | Legal & Compliance Document Management | إدارة المستندات القانونية والتصاريح |
| `legal.system.legalDocuments` | Legal Documents | المستندات القانونية |
| `legal.system.noDocumentsFoundAddYourFirstDocument` | No documents found. Add your first document. | لا توجد مستندات. أضف أول مستند. |
| `legal.system.pending` | Pending | معلق |
| `legal.system.reject` | Reject | رفض |
| `legal.system.rejected` | Rejected | مرفوض |
| `legal.system.searchDocuments` | Search documents... | بحث عن مستندات... |
| `legal.system.submittedBy` | Submitted By | مقدم من |
| `legal.system.title` | Title | العنوان |
| `legal.system.verified` | Verified | معتمد |
| `legal.system.verify` | Verify | اعتماد |
| `legal.title` | Legal documents | المستندات القانونية |

### locations

| Catalog key | English | Arabic |
|---|---|---|
| `locations.empty` | No locations defined. | لم يتم تحديد مواقع. |
| `locations.title` | Locations & quantities | المواقع والكميات |

### navigation

| Catalog key | English | Arabic |
|---|---|---|
| `navigation.actions.logout` | Log out | تسجيل الخروج |
| `navigation.actions.switchLanguage` | Switch language | تغيير اللغة |
| `navigation.aria.closeNavigation` | Close navigation | إغلاق القائمة |
| `navigation.aria.mainNavigation` | Main navigation | القائمة الرئيسية |
| `navigation.aria.openNavigation` | Open navigation | فتح القائمة |
| `navigation.items.adminWorkspaces` | Administration | الإدارة |
| `navigation.items.agentActivity` | Agent Activity | نشاط الوكلاء |
| `navigation.items.approvals` | Approvals | الموافقات |
| `navigation.items.assets` | Equipment | المعدات |
| `navigation.items.cashFlow` | Cash flow | التدفق النقدي |
| `navigation.items.clients` | Clients | العملاء |
| `navigation.items.dashboard` | Dashboard | لوحة التحكم |
| `navigation.items.expenses` | Expenses | المصروفات |
| `navigation.items.hr` | HR | الموارد البشرية |
| `navigation.items.inventory` | Inventory | المخزون |
| `navigation.items.invoices` | Invoices & Payments | الفواتير والمدفوعات |
| `navigation.items.legal` | Legal | القسم القانوني |
| `navigation.items.myActions` | My Actions | مهامي |
| `navigation.items.notificationPreferences` | Notification preferences | تفضيلات الإشعارات |
| `navigation.items.procurementComparison` | Procurement comparison | مقارنة المشتريات |
| `navigation.items.projects` | Projects | المشاريع |
| `navigation.items.reservations` | Stock reservations | حجوزات المخزون |
| `navigation.items.settings` | Settings | الإعدادات |
| `navigation.items.suppliers` | Suppliers | الموردين |
| `navigation.offline.banner` | You are offline. Daily reports can be queued on this device; other changes need a connection. | أنت غير متصل بالإنترنت. تحتاج التغييرات المرسلة إلى اتصال. |
| `navigation.offline.updateAvailable` | A new version is ready. | تحديث جديد جاهز. |
| `navigation.offline.updateNow` | Update now | حدّث الآن |
| `navigation.portals.client` | Client Portal | بوابة العميل |
| `navigation.portals.consultant` | Consultant Portal | بوابة الاستشاري |
| `navigation.portals.subcontractor` | Subcontractor Portal | بوابة مقاول الباطن |
| `navigation.portals.supplier` | Supplier Portal | بوابة المورد |
| `navigation.settings.placeholder` | Settings will be available here. | ستتوفر الإعدادات هنا. |
| `navigation.settings.title` | Settings | الإعدادات |
| `navigation.user.fallbackName` | User | مستخدم |

### notifications

| Catalog key | English | Arabic |
|---|---|---|
| `notifications.preferences.defaultsNote` | No personal overrides yet: in-app notifications are on for every event and the other channels are off. | لا توجد تخصيصات شخصية بعد: الإشعارات داخل التطبيق مفعّلة لكل حدث والقنوات الأخرى معطّلة. |
| `notifications.preferences.description` | Choose how each notification event reaches you. | اختر كيفية وصول كل حدث إشعار إليك. |
| `notifications.preferences.event` | Event | الحدث |
| `notifications.preferences.events.actionOverdue` | Action item overdue | تجاوز موعد إجراء |
| `notifications.preferences.events.approvalRequested` | Approval requested | طلب اعتماد |
| `notifications.preferences.events.deliveryReceived` | Goods received | استلام بضاعة |
| `notifications.preferences.events.handoverAdvanced` | Handover advanced | تقدم التسليم |
| `notifications.preferences.events.invoiceCreated` | Invoice created | إنشاء فاتورة |
| `notifications.preferences.events.invoiceDue` | Invoice due | فاتورة مستحقة |
| `notifications.preferences.events.invoiceOverdue` | Invoice overdue | فاتورة متأخرة |
| `notifications.preferences.events.observationCreated` | Observation raised | رفع ملاحظة |
| `notifications.preferences.events.paymentReceived` | Payment received | استلام دفعة |
| `notifications.preferences.events.purchaseOrderApproved` | Purchase order approved | اعتماد أمر شراء |
| `notifications.preferences.events.purchaseOrderIssued` | Purchase order issued | إصدار أمر شراء |
| `notifications.preferences.events.purchaseOrderRejected` | Purchase order rejected | رفض أمر شراء |
| `notifications.preferences.events.purchaseRequisitionApproved` | Purchase requisition approved | اعتماد طلب شراء |
| `notifications.preferences.events.rfiSubmitted` | RFI submitted | إرسال طلب معلومات (RFI) |
| `notifications.preferences.events.variationApproved` | Variation approved | اعتماد أمر تغيير |
| `notifications.preferences.events.wirSubmitted` | Work inspection request submitted | إرسال طلب فحص أعمال |
| `notifications.preferences.footnote` | Channels without a personal switch follow the defaults: in-app on, everything else off until a provider is configured. | القنوات بدون تخصيص شخصي تتبع الافتراضي: داخل التطبيق مفعّل، وقنوات أخرى معطّلة حتى يُهيأ مزود لها. |
| `notifications.preferences.refresh` | Refresh | تحديث |
| `notifications.preferences.title` | Notification preferences | تفضيلات الإشعارات |
| `notifications.preferences.toggle` | Toggle preference | تبديل التفضيل |

### payroll

| Catalog key | English | Arabic |
|---|---|---|
| `payroll.system.approved` | Approved | معتمد |
| `payroll.system.basicSalary` | Basic Salary | الراتب الأساسي |
| `payroll.system.createPayroll` | Create Payroll | إنشاء دفعة رواتب |
| `payroll.system.createPayrollPeriod` | Create Payroll Period | إنشاء دفعة رواتب |
| `payroll.system.draft` | Draft | مسودة |
| `payroll.system.employee` | Employee | الموظف |
| `payroll.system.employees` | Employees | موظفين |
| `payroll.system.generate` | Generate | إنشاء |
| `payroll.system.month` | Month | الشهر |
| `payroll.system.monthlyPayrollManagement` | Monthly Payroll Management | إدارة دفعات الرواتب الشهرية |
| `payroll.system.netSalary` | Net Salary | صافي الراتب |
| `payroll.system.no` | No | لا |
| `payroll.system.noDetailsAvailable` | No details available. | لا توجد تفاصيل. |
| `payroll.system.noPayrollPeriodsFoundCreateYourFirstPayroll` | No payroll periods found. Create your first payroll. | لا توجد دفعات رواتب. أنشئ أول دفعة. |
| `payroll.system.paid` | Paid | مدفوع |
| `payroll.system.payrollGeneratedSuccessfully` | Payroll generated successfully! | تم إنشاء الدفعة بنجاح! |
| `payroll.system.period` | Period | الفترة |
| `payroll.system.posted` | Posted | مرحّل |
| `payroll.system.searchPayrollPeriod` | Search payroll period... | بحث عن فترة راتب... |
| `payroll.system.thisWillAutoGeneratePayrollForAllActiveEmployeesFor` | This will auto-generate payroll for all active employees for the selected month and year. | سيتم إنشاء دفعة رواتب لجميع الموظفين النشطين للشهر والسنة المحددين. |
| `payroll.system.totalNet` | Total Net | صافي الإجمالي |
| `payroll.system.year` | Year | السنة |
| `payroll.system.yes` | Yes | نعم |
| `payroll.title` | Payroll | الرواتب |

### portals

| Catalog key | English | Arabic |
|---|---|---|
| `portals.actionCenter` | Action center | مركز الإجراءات |
| `portals.clientActions.acknowledge` | Acknowledge document | تأكيد الاطلاع على المستند |
| `portals.clientActions.approve` | Approve variation | الموافقة على التغيير |
| `portals.clientActions.documentActions` | Document acknowledgement actions | إجراءات تأكيد المستندات |
| `portals.clientActions.empty` | No client actions are waiting for you. | لا توجد إجراءات عميل معلقة. |
| `portals.clientActions.project` | Project {{id}} | المشروع {{id}} |
| `portals.clientActions.reject` | Reject variation | رفض التغيير |
| `portals.clientActions.submitError` | The action could not be submitted. Refresh and try again. | تعذر إرسال الإجراء. حدّث الصفحة وحاول مجدداً. |
| `portals.clientActions.variationActions` | Variation response actions | إجراءات الرد على التغييرات |
| `portals.compliance.document` | Compliance document | مستند امتثال |
| `portals.compliance.empty` | No compliance documents need attention. | لا توجد مستندات امتثال تحتاج إلى إجراء. |
| `portals.compliance.expiry` | Expires {{date}} | ينتهي في {{date}} |
| `portals.compliance.status.expired` | Expired | منتهي الصلاحية |
| `portals.compliance.status.expires_soon` | Expires within 30 days | ينتهي خلال 30 يوماً |
| `portals.compliance.status.upcoming` | Expires within 90 days | ينتهي خلال 90 يوماً |
| `portals.compliance.title` | Supplier compliance alerts | تنبيهات امتثال المورد |
| `portals.dashboard.allProjects` | All projects | كل المشروعات |
| `portals.dashboard.empty.awarded_pos` | No awarded purchase orders | لا توجد أوامر شراء ممنوحة |
| `portals.dashboard.empty.deliveries` | No deliveries scheduled | لا توجد توريدات مجدولة |
| `portals.dashboard.empty.expiring_documents` | No compliance documents expire within 90 days | لا توجد مستندات امتثال تنتهي خلال 90 يوماً |
| `portals.dashboard.empty.inspections` | No material inspections pending | لا توجد فحوصات مواد معلقة |
| `portals.dashboard.empty.inspections_needed` | No inspections needed | لا توجد فحوصات مطلوبة |
| `portals.dashboard.empty.instructions_for_acknowledgement` | No instructions need acknowledgement | لا توجد تعليمات تحتاج إلى تأكيد |
| `portals.dashboard.empty.invoices` | No supplier invoices yet | لا توجد فواتير موردين بعد |
| `portals.dashboard.empty.latest_drawings` | No drawings are available yet | لا توجد مخططات متاحة بعد |
| `portals.dashboard.empty.mir_pending` | No MIRs pending your review | لا توجد طلبات فحص مواد بانتظار مراجعتك |
| `portals.dashboard.empty.ncr_closeouts_awaiting_review` | No NCR closeouts awaiting review | لا توجد إغلاقات عدم مطابقة بانتظار المراجعة |
| `portals.dashboard.empty.ncrs` | No open NCRs | لا توجد تقارير عدم مطابقة مفتوحة |
| `portals.dashboard.empty.observations` | No consultant observations open | لا توجد ملاحظات استشارية مفتوحة |
| `portals.dashboard.empty.observations_awaiting_verification` | No observations awaiting verification | لا توجد ملاحظات بانتظار التحقق |
| `portals.dashboard.empty.open_rfqs` | No open RFQs | لا توجد طلبات عروض أسعار مفتوحة |
| `portals.dashboard.empty.payment_applications` | No payment applications yet | لا توجد طلبات دفع بعد |
| `portals.dashboard.empty.personal_notes` | No personal notes | لا توجد ملاحظات شخصية |
| `portals.dashboard.empty.recent_daily_reports` | No daily reports yet | لا توجد تقارير يومية بعد |
| `portals.dashboard.empty.recent_photos` | No photos yet | لا توجد صور بعد |
| `portals.dashboard.empty.rfis` | No RFIs open | لا توجد طلبات معلومات مفتوحة |
| `portals.dashboard.empty.rfis_awaiting_response` | No RFIs require your response | لا توجد طلبات معلومات تتطلب ردك |
| `portals.dashboard.empty.submittals` | No submittals open | لا توجد مستندات مقدمة مفتوحة |
| `portals.dashboard.empty.submittals_awaiting_review` | No submittals awaiting review | لا توجد مستندات بانتظار المراجعة |
| `portals.dashboard.empty.submittals_for_resubmission` | No submittals need resubmission | لا توجد مستندات بحاجة إلى إعادة التقديم |
| `portals.dashboard.empty.todays_inspections` | No inspections scheduled today | لا توجد فحوصات مجدولة اليوم |
| `portals.dashboard.empty.todays_work` | No work assigned today | لا توجد أعمال مسندة اليوم |
| `portals.dashboard.empty.upcoming_visits` | No upcoming visits | لا توجد زيارات قادمة |
| `portals.dashboard.empty.variations` | No variations yet | لا توجد تغييرات بعد |
| `portals.dashboard.empty.wir_pending` | No WIRs pending your review | لا توجد طلبات فحص أعمال بانتظار مراجعتك |
| `portals.dashboard.empty.wirs` | No formal WIR records for your packages | لا توجد طلبات فحص أعمال رسمية لحزمك |
| `portals.dashboard.empty.work_ready_for_inspection` | No new work ready for inspection | لا توجد أعمال جديدة جاهزة للفحص |
| `portals.dashboard.exitPreview` | Exit client preview | إنهاء معاينة العميل |
| `portals.dashboard.extraTitles.actionCenter` | Action Center | مركز الإجراءات |
| `portals.dashboard.extraTitles.reviews` | My Reviews | مراجعاتي |
| `portals.dashboard.extraTitles.submissions` | My submissions | إرسالياتي |
| `portals.dashboard.fields.achieved` | Achieved | المتحقق |
| `portals.dashboard.fields.active` | Active | نشط |
| `portals.dashboard.fields.approved` | Approved | معتمد |
| `portals.dashboard.fields.completed` | Completed | مكتمل |
| `portals.dashboard.fields.count` | Count | العدد |
| `portals.dashboard.fields.executed_quantity` | Executed quantity | الكمية المنفذة |
| `portals.dashboard.fields.expiring` | Expiring | قارب على الانتهاء |
| `portals.dashboard.fields.overdue` | Overdue | متأخر |
| `portals.dashboard.fields.pending` | Pending | قيد الانتظار |
| `portals.dashboard.fields.percent` | Percent | النسبة المئوية |
| `portals.dashboard.fields.planned` | Planned | المخطط |
| `portals.dashboard.fields.planned_quantity` | Planned quantity | الكمية المخططة |
| `portals.dashboard.fields.started` | Started | بدأ |
| `portals.dashboard.fields.total` | Total | الإجمالي |
| `portals.dashboard.fields.work_orders_planned` | Work orders planned | أوامر العمل المخططة |
| `portals.dashboard.noRecords` | No records | لا توجد سجلات |
| `portals.dashboard.notes.noClientAccount` | No client is assigned to your account yet. | لا يوجد عميل مسند إلى حسابك بعد. |
| `portals.dashboard.notes.noClientProject` | No client is assigned to this project yet. | لا يوجد عميل مسند إلى هذا المشروع بعد. |
| `portals.dashboard.notes.noSubcontractPackage` | No subcontract package is assigned to your organization yet. | لا توجد حزمة مقاول باطن مسندة إلى مؤسستك بعد. |
| `portals.dashboard.notes.noSupplierAssignment` | No supplier assignment is active for your account. | لا يوجد تكليف مورد نشط لحسابك. |
| `portals.dashboard.portfolio` | Portfolio | محفظة المشروعات |
| `portals.dashboard.projectOption` | Project {{id}} | المشروع {{id}} |
| `portals.dashboard.recordNumber` | Record #{{id}} | السجل رقم {{id}} |
| `portals.dashboard.refresh` | Refresh | تحديث |
| `portals.dashboard.scopeDescription` | Live project records scoped to your organization and assignments. | سجلات المشروعات المباشرة ضمن مؤسستك والتكليفات المسندة إليك. |
| `portals.dashboard.setup.assignClient` | Assign a client to preview this portal | عيّن عميلاً لمعاينة هذه البوابة |
| `portals.dashboard.setup.noAwardedPackages` | You have no awarded packages on your account yet | لا توجد حزم أعمال ممنوحة لحسابك بعد |
| `portals.dashboard.setup.supplierProject` | Your supplier account is not linked to any project yet | حساب المورد غير مرتبط بأي مشروع بعد |
| `portals.dashboard.title` | Dashboard | لوحة المعلومات |
| `portals.dashboard.titles.client` | Client Portal | بوابة العميل |
| `portals.dashboard.titles.consultant` | Consultant Portal | بوابة الاستشاري |
| `portals.dashboard.titles.subcontractor` | Subcontractor Portal | بوابة مقاول الباطن |
| `portals.dashboard.titles.supplier` | Supplier Portal | بوابة المورد |
| `portals.dashboard.widgets.action_center` | Action Center | مركز الإجراءات |
| `portals.dashboard.widgets.approvals` | Approvals | الموافقات |
| `portals.dashboard.widgets.awarded_pos` | Awarded purchase orders | أوامر الشراء الممنوحة |
| `portals.dashboard.widgets.executed_quantities` | Executed quantities | الكميات المنفذة |
| `portals.dashboard.widgets.expiring_documents` | Expiring documents | المستندات قاربت على الانتهاء |
| `portals.dashboard.widgets.inspections` | Inspections | الفحوصات |
| `portals.dashboard.widgets.inspections_needed` | Inspections needed | الفحوصات المطلوبة |
| `portals.dashboard.widgets.instructions_for_acknowledgement` | Instructions to acknowledge | التعليمات المطلوب تأكيدها |
| `portals.dashboard.widgets.invoices` | Invoices | الفواتير |
| `portals.dashboard.widgets.latest_drawings` | Latest drawings | أحدث المخططات |
| `portals.dashboard.widgets.milestones` | Milestones | المعالم الرئيسية |
| `portals.dashboard.widgets.mir_pending` | MIRs pending review | طلبات فحص المواد قيد المراجعة |
| `portals.dashboard.widgets.my_reviews` | My Reviews | مراجعاتي |
| `portals.dashboard.widgets.ncr_closeouts_awaiting_review` | NCR closeouts awaiting review | إغلاقات عدم المطابقة بانتظار المراجعة |
| `portals.dashboard.widgets.ncrs` | Nonconformance reports | تقارير عدم المطابقة |
| `portals.dashboard.widgets.observations` | Observations | الملاحظات |
| `portals.dashboard.widgets.observations_awaiting_verification` | Observations awaiting verification | ملاحظات بانتظار التحقق |
| `portals.dashboard.widgets.open_rfqs` | Open RFQs | طلبات عروض الأسعار المفتوحة |
| `portals.dashboard.widgets.overall_progress` | Overall progress | التقدم الإجمالي |
| `portals.dashboard.widgets.overdue_inputs` | Overdue inputs | المدخلات المتأخرة |
| `portals.dashboard.widgets.packages` | Work packages | حزم الأعمال |
| `portals.dashboard.widgets.payment_applications` | Payment applications | طلبات الدفع |
| `portals.dashboard.widgets.personal_notes` | Personal notes | ملاحظاتي الشخصية |
| `portals.dashboard.widgets.planned_vs_actual` | Planned vs actual | المخطط مقابل الفعلي |
| `portals.dashboard.widgets.project_ids` | Projects | المشروعات |
| `portals.dashboard.widgets.projects` | Projects | المشروعات |
| `portals.dashboard.widgets.recent_daily_reports` | Recent daily reports | التقارير اليومية الأخيرة |
| `portals.dashboard.widgets.recent_photos` | Recent photos | الصور الأخيرة |
| `portals.dashboard.widgets.rfis` | RFIs | طلبات المعلومات |
| `portals.dashboard.widgets.rfis_awaiting_response` | RFIs awaiting response | طلبات معلومات بانتظار الرد |
| `portals.dashboard.widgets.submittals` | Submittals | المستندات المقدمة |
| `portals.dashboard.widgets.submittals_awaiting_review` | Submittals awaiting review | مستندات بانتظار المراجعة |
| `portals.dashboard.widgets.submittals_for_resubmission` | Submittals for resubmission | المستندات المطلوب إعادة تقديمها |
| `portals.dashboard.widgets.todays_inspections` | Today's inspections | فحوصات اليوم |
| `portals.dashboard.widgets.todays_work` | Today's work | أعمال اليوم |
| `portals.dashboard.widgets.upcoming_visits` | Upcoming visits | الزيارات القادمة |
| `portals.dashboard.widgets.variations` | Variations | التغييرات |
| `portals.dashboard.widgets.wir_pending` | WIRs pending review | طلبات فحص الأعمال قيد المراجعة |
| `portals.dashboard.widgets.wirs` | Work inspection requests | طلبات فحص الأعمال |
| `portals.dashboard.widgets.work_ready_for_inspection` | Work ready for inspection | أعمال جاهزة للفحص |
| `portals.formalSubmission.dueDate` | Requested response date | تاريخ الرد المطلوب |
| `portals.formalSubmission.newRfi` | Submit RFI | تقديم طلب معلومات RFI |
| `portals.formalSubmission.newSubmittal` | Submit submittal | تقديم مستند |
| `portals.formalSubmission.priorities.high` | High | مرتفعة |
| `portals.formalSubmission.priorities.low` | Low | منخفضة |
| `portals.formalSubmission.priorities.normal` | Normal | عادية |
| `portals.formalSubmission.priorities.urgent` | Urgent | عاجلة |
| `portals.formalSubmission.priority` | Priority | الأولوية |
| `portals.formalSubmission.question` | Question | السؤال |
| `portals.formalSubmission.rfiTitle` | New request for information | طلب معلومات جديد |
| `portals.formalSubmission.subject` | Subject | الموضوع |
| `portals.formalSubmission.submitError` | The request could not be submitted. Check the form and try again. | تعذر إرسال الطلب. راجع الحقول وحاول مجدداً. |
| `portals.formalSubmission.submittalTitle` | New submittal | مستند جديد |
| `portals.formalSubmission.submittalType` | Submittal type | نوع المستند |
| `portals.formalSubmission.submittedTo` | Submitted to | مقدم إلى |
| `portals.formalSubmission.title` | Submittal title | عنوان المستند |
| `portals.formalSubmission.types.material` | Material | مادة |
| `portals.formalSubmission.types.method` | Method statement | بيان طريقة التنفيذ |
| `portals.formalSubmission.types.sample` | Sample | عينة |
| `portals.formalSubmission.types.shop_drawing` | Shop drawing | مخطط تنفيذي |
| `portals.inspections.decidedDate` | Decision date: {{date}} | تاريخ القرار: {{date}} |
| `portals.inspections.inspectionDate` | Inspection date: {{date}} | تاريخ الفحص: {{date}} |
| `portals.inspections.mirs.empty` | No material inspections for your deliveries. | لا توجد فحوصات مواد لتوريداتك. |
| `portals.inspections.mirs.title` | Material inspection requests | طلبات فحص المواد |
| `portals.inspections.result` | Result: {{result}} | النتيجة: {{result}} |
| `portals.inspections.status.accepted` | Accepted | مقبول |
| `portals.inspections.status.approved` | Approved | مقبول |
| `portals.inspections.status.approved_with_comments` | Approved with comments | مقبول مع ملاحظات |
| `portals.inspections.status.consultant_review` | Consultant review | مراجعة الاستشاري |
| `portals.inspections.status.draft` | Draft | مسودة |
| `portals.inspections.status.partially_accepted` | Partially accepted | مقبول جزئياً |
| `portals.inspections.status.pending` | Pending | قيد الانتظار |
| `portals.inspections.status.pm_review` | Project manager review | مراجعة مدير المشروع |
| `portals.inspections.status.qa_qc_review` | QA/QC review | مراجعة الجودة |
| `portals.inspections.status.reinspect` | Reinspection | إعادة الفحص |
| `portals.inspections.status.rejected` | Rejected | مرفوض |
| `portals.inspections.status.site_inspection` | Site inspection | فحص الموقع |
| `portals.inspections.status.submitted` | Submitted | تم الإرسال |
| `portals.inspections.wirs.empty` | No formal WIR records for your packages. | لا توجد سجلات WIR رسمية لحزم أعمالك. |
| `portals.inspections.wirs.title` | Work inspection requests | طلبات فحص الأعمال |
| `portals.myReviews` | My reviews | مراجعاتي |
| `portals.observation.afterPhotos` | After photos | صور بعد الإصلاح |
| `portals.observation.beforePhotos` | Before photos | صور قبل الإصلاح |
| `portals.observation.description` | Description | الوصف |
| `portals.observation.drawing` | Reference drawing | المخطط المرجعي |
| `portals.observation.drawingReference` | Drawing reference | مرجع المخطط |
| `portals.observation.dueDate` | Due date | تاريخ الاستحقاق |
| `portals.observation.noDrawing` | No drawing selected | لا يوجد مخطط محدد |
| `portals.observation.project` | Project | المشروع |
| `portals.observation.projectOption` | Project {{id}} | المشروع {{id}} |
| `portals.observation.raise` | Raise observation | رفع ملاحظة |
| `portals.observation.severity` | Severity | الأهمية |
| `portals.observation.severityOptions.high` | High | مرتفع |
| `portals.observation.severityOptions.low` | Low | منخفض |
| `portals.observation.severityOptions.normal` | Normal | عادي |
| `portals.observation.severityOptions.urgent` | Urgent | عاجل |
| `portals.observation.submit` | Submit observation | إرسال الملاحظة |
| `portals.observation.submitError` | The observation could not be submitted. Check the required fields and uploaded evidence. | تعذر إرسال الملاحظة. تحقق من الحقول المطلوبة والملفات المرفوعة. |
| `portals.observation.title` | New site observation | ملاحظة موقع جديدة |
| `portals.observation.titleField` | Title | العنوان |
| `portals.previewAsClient` | Preview as client | المعاينة كعميل |
| `portals.previewBanner` | Preview mode: read-only | وضع المعاينة: للقراءة فقط |
| `portals.previewProject` | Client preview project | مشروع معاينة العميل |
| `portals.quickActions.acknowledgePo` | Acknowledge PO | تأكيد أمر الشراء |
| `portals.quickActions.action` | Action | الإجراء |
| `portals.quickActions.actions.accept` | Accept | قبول |
| `portals.quickActions.actions.acknowledge` | Acknowledge | تأكيد |
| `portals.quickActions.actions.assign` | Assign | إسناد |
| `portals.quickActions.actions.close` | Close | إغلاق |
| `portals.quickActions.actions.reject` | Reject | رفض |
| `portals.quickActions.actions.reopen` | Reopen | إعادة فتح |
| `portals.quickActions.actions.start_rectification` | Start rectification | بدء التصحيح |
| `portals.quickActions.actions.submit_for_verification` | Submit for verification | إرسال للتحقق |
| `portals.quickActions.advanceObservation` | Advance observation | تحديث الملاحظة |
| `portals.quickActions.body` | Response | الرد |
| `portals.quickActions.clarify` | Send clarification | إرسال استفسار |
| `portals.quickActions.comment` | Comment | تعليق |
| `portals.quickActions.comments` | Comments | التعليقات |
| `portals.quickActions.files` | Certificate files | ملفات الشهادة |
| `portals.quickActions.invoiceNumber` | Invoice number | رقم الفاتورة |
| `portals.quickActions.loadError` | The selected record could not be loaded. Refresh and try again. | تعذر تحميل السجل المحدد. حدّث الصفحة وحاول مجدداً. |
| `portals.quickActions.message` | Clarification | الاستفسار |
| `portals.quickActions.proposeDelivery` | Propose delivery | اقتراح موعد التوريد |
| `portals.quickActions.proposedDate` | Proposed delivery date | موعد التوريد المقترح |
| `portals.quickActions.quantity` | Invoice quantity | كمية الفاتورة |
| `portals.quickActions.quoteRfq` | Submit quotation | تقديم عرض سعر |
| `portals.quickActions.record` | Record | السجل |
| `portals.quickActions.responseCode` | Response code | رمز الرد |
| `portals.quickActions.reviewRfi` | Review RFI | مراجعة طلب المعلومات |
| `portals.quickActions.reviewSubmittal` | Review submittal | مراجعة المستند |
| `portals.quickActions.selectRecord` | Select a record | اختر سجلاً |
| `portals.quickActions.selectSupplier` | Select supplier | اختر المورد |
| `portals.quickActions.sendClarification` | Send clarification | إرسال استفسار |
| `portals.quickActions.stage` | Review stage | مرحلة المراجعة |
| `portals.quickActions.stages.consultant_coordinator` | Consultant coordinator review | مراجعة منسق الاستشاري |
| `portals.quickActions.stages.consultant_manager` | Consultant manager review | مراجعة مدير الاستشاري |
| `portals.quickActions.stages.coordinator` | Coordinator review | مراجعة المنسق |
| `portals.quickActions.stages.discipline_review` | Discipline review | مراجعة التخصص |
| `portals.quickActions.stages.internal_technical_review` | Internal technical review | المراجعة الفنية الداخلية |
| `portals.quickActions.stages.manager` | Manager review | مراجعة المدير |
| `portals.quickActions.stages.official_response` | Official response | الرد الرسمي |
| `portals.quickActions.stages.pm` | Project manager review | مراجعة مدير المشروع |
| `portals.quickActions.stages.response` | Final response | الرد النهائي |
| `portals.quickActions.stages.reviewer` | Reviewer review | مراجعة المدقق |
| `portals.quickActions.submitError` | The action could not be submitted. Refresh and try again. | تعذر إرسال الإجراء. حدّث الصفحة وحاول مجدداً. |
| `portals.quickActions.submitInvoice` | Submit invoice | إرسال فاتورة |
| `portals.quickActions.submitQuotation` | Submit quotation | تقديم عرض سعر |
| `portals.quickActions.supplier` | Supplier | المورد |
| `portals.quickActions.unitPrice` | Unit price | سعر الوحدة |
| `portals.quickActions.uploadCertificate` | Upload delivery certificate | رفع شهادة التوريد |
| `portals.quickActions.validationError` | Enter valid values for all required fields. | أدخل قيماً صحيحة في جميع الحقول المطلوبة. |
| `portals.recordActions.acknowledgeInstruction` | Acknowledge instruction | تأكيد استلام تعليمات المهندس |
| `portals.recordActions.acknowledgePackage` | Acknowledge package | تأكيد استلام حزمة الأعمال |
| `portals.recordActions.acknowledgeRfi` | Acknowledge RFI response | تأكيد الرد على طلب المعلومات |
| `portals.recordActions.claimQuantity` | Submit progress quantity | تقديم كمية الإنجاز |
| `portals.recordActions.instruction` | Engineer instruction | تعليمات المهندس |
| `portals.recordActions.materialsDeducted` | Materials deducted | قيمة المواد المخصومة |
| `portals.recordActions.noBoqPackage` | No assigned package has a BOQ item available for quantity claims. | لا توجد حزمة مسندة مرتبطة ببند كميات متاح للمطالبة. |
| `portals.recordActions.notes` | Notes | ملاحظات |
| `portals.recordActions.otherDeductions` | Other deductions | استقطاعات أخرى |
| `portals.recordActions.paymentApplication` | Payment application | طلب دفعة |
| `portals.recordActions.periodFrom` | Period start | بداية الفترة |
| `portals.recordActions.periodTo` | Period end | نهاية الفترة |
| `portals.recordActions.quantityClaimed` | Quantity claimed | الكمية المطالب بها |
| `portals.recordActions.response` | Response | الرد |
| `portals.recordActions.resubmitSubmittal` | Resubmit returned submittal | إعادة تقديم المستند المعاد |
| `portals.recordActions.retention` | Retention | الاستقطاع المحتجز |
| `portals.recordActions.revisionComments` | What changed in this revision? | ما الذي تغير في هذه المراجعة؟ |
| `portals.recordActions.rfi` | RFI | طلب معلومات RFI |
| `portals.recordActions.submitError` | The action could not be completed. Refresh and try again. | تعذر تنفيذ الإجراء. حدّث الصفحة وحاول مجدداً. |
| `portals.recordActions.submittal` | Submittal | المستند |
| `portals.recordActions.workValue` | Work value this period | قيمة الأعمال خلال الفترة |
| `portals.review.approve` | Approve | اعتماد |
| `portals.review.approveWithComments` | Approve with comments | اعتماد مع ملاحظات |
| `portals.review.empty` | No reviews are waiting for you. | لا توجد مراجعات بانتظارك. |
| `portals.review.recommendApprove` | Recommend approval | التوصية بالاعتماد |
| `portals.review.recommendReject` | Recommend rejection | التوصية بالرفض |
| `portals.review.recommendationActions` | Commercial recommendation actions | إجراءات التوصية التجارية |
| `portals.review.reinspect` | Request reinspection | طلب إعادة الفحص |
| `portals.review.reject` | Reject | رفض |
| `portals.review.rfiCostImpact` | Estimated cost {amount} | الأثر المالي المتوقع {amount} |
| `portals.review.rfiLocation` | Location #{id} | الموقع رقم {id} |
| `portals.review.rfiScheduleImpact` | Schedule impact {days} days | الأثر الزمني {days} أيام |
| `portals.review.rfiWorkPackage` | Work package #{id} | حزمة العمل رقم {id} |
| `portals.review.submitError` | The review could not be submitted. Refresh and try again. | تعذر إرسال المراجعة. حدّث الصفحة وحاول مجددًا. |
| `portals.review.wirActions` | Work inspection review actions | إجراءات مراجعة فحص الأعمال |
| `portals.selectPreviewProject` | Select project to preview | اختر المشروع للمعاينة |
| `portals.submissions.amount` | Quoted amount | قيمة العرض |
| `portals.submissions.date` | Work date | تاريخ العمل |
| `portals.submissions.empty` | No submissions yet. | لا توجد إرساليات بعد. |
| `portals.submissions.equipmentName` | Equipment name | اسم المعدة |
| `portals.submissions.hours` | Hours on site | ساعات العمل بالموقع |
| `portals.submissions.new` | New project submission | إرسال جديد للمشروع |
| `portals.submissions.note` | Details | التفاصيل |
| `portals.submissions.package` | Awarded package | حزمة الأعمال المسندة |
| `portals.submissions.packageOption` | Package #{{id}} | الحزمة رقم {{id}} |
| `portals.submissions.project` | Project {{id}} | المشروع {{id}} |
| `portals.submissions.record` | Record | السجل |
| `portals.submissions.relatedRecord` | Related record | السجل المرتبط |
| `portals.submissions.response` | Response | الرد |
| `portals.submissions.saving` | Submitting… | جارٍ الإرسال… |
| `portals.submissions.scheduleDays` | Schedule impact (days) | أثر الجدول (أيام) |
| `portals.submissions.selectRecord` | Select a record | اختر سجلاً |
| `portals.submissions.status.accepted` | Accepted | مقبول |
| `portals.submissions.status.closed` | Closed | مغلق |
| `portals.submissions.status.rejected` | Returned | مُعاد للتعديل |
| `portals.submissions.status.submitted` | Submitted | تم الإرسال |
| `portals.submissions.status.under_review` | Under review | قيد المراجعة |
| `portals.submissions.submit` | Submit for review | إرسال للمراجعة |
| `portals.submissions.submitError` | The submission could not be sent. Refresh and try again. | تعذر إرسال الطلب. حدّث الصفحة وحاول مجدداً. |
| `portals.submissions.title` | My submissions | إرسالياتي |
| `portals.submissions.type` | Submission type | نوع الإرسال |
| `portals.submissions.types.equipment` | Equipment report | تقرير المعدات |
| `portals.submissions.types.manpower` | Manpower report | تقرير العمالة |
| `portals.submissions.types.mir_request` | MIR inspection request | طلب فحص MIR |
| `portals.submissions.types.ncr_response` | NCR response | رد على تقرير عدم المطابقة |
| `portals.submissions.types.observation_response` | Observation response | رد على الملاحظة |
| `portals.submissions.types.variation_quote` | Variation quote | عرض سعر للتغيير |
| `portals.submissions.types.wir_request` | WIR inspection request | طلب فحص WIR |
| `portals.submissions.workerCount` | Worker count | عدد العمال |
| `portals.submissions.workerType` | Worker type | نوع العمالة |
| `portals.title` | Portal | البوابة |

### procurement

| Catalog key | English | Arabic |
|---|---|---|
| `procurement.actions.accept` | Accept inspection | قبول الفحص |
| `procurement.actions.approve` | Approve | موافقة |
| `procurement.actions.approveInvoice` | Approve supplier invoice | اعتماد فاتورة المورد |
| `procurement.actions.approveIssue` | Approve purchase order | اعتماد أمر الشراء |
| `procurement.actions.cancel` | Cancel | إلغاء |
| `procurement.actions.createGrn` | Create goods receipt | إنشاء إذن استلام |
| `procurement.actions.createMir` | Create inspection request | إنشاء طلب فحص |
| `procurement.actions.createPo` | Create purchase order | إنشاء أمر شراء |
| `procurement.actions.createPr` | Create request | إنشاء طلب شراء |
| `procurement.actions.createReturn` | Record supplier return | تسجيل مرتجع للمورد |
| `procurement.actions.createRfq` | Create request for quotation | إنشاء طلب عرض سعر |
| `procurement.actions.invite` | Invite selected suppliers | دعوة الموردين المحددين |
| `procurement.actions.markSupplierCollected` | Mark collected by supplier | تأكيد استلام المورد للمرفوض |
| `procurement.actions.recordDelivery` | Record delivery | تسجيل التسليم |
| `procurement.actions.recordInvoice` | Record supplier invoice | تسجيل فاتورة المورد |
| `procurement.actions.recordPayment` | Record supplier payment | تسجيل دفعة المورد |
| `procurement.actions.reject` | Reject | رفض |
| `procurement.actions.save` | Save changes | حفظ التغييرات |
| `procurement.actions.startPoApproval` | Submit for approval | إرسال للاعتماد |
| `procurement.actions.submit` | Submit | إرسال |
| `procurement.actions.submitQuote` | Submit quotation | إرسال عرض السعر |
| `procurement.actions.submitRecommendation` | Submit for approval | إرسال للموافقة |
| `procurement.comparison.compare` | Compare | مقارنة |
| `procurement.comparison.description` | Compare invited suppliers for one RFQ before making an award decision. | قارن الموردين المدعوين لطلب عرض سعر قبل اتخاذ قرار الترسية. |
| `procurement.comparison.documents.awardRecommendation` | Award recommendation PDF | ملف توصية الترسية PDF |
| `procurement.comparison.documents.commercialComparison` | Commercial comparison PDF | ملف المقارنة التجارية PDF |
| `procurement.comparison.documents.rfq` | RFQ PDF | ملف طلب عرض السعر PDF |
| `procurement.comparison.documents.technicalEvaluation` | Technical evaluation PDF | ملف التقييم الفني PDF |
| `procurement.comparison.downloadError` | The comparison document could not be downloaded. Try again. | تعذر تنزيل مستند المقارنة. حاول مرة أخرى. |
| `procurement.comparison.loadError` | The quotation comparison could not be loaded. Check the RFQ and try again. | تعذر تحميل مقارنة عروض الأسعار. تحقق من الطلب وحاول مرة أخرى. |
| `procurement.comparison.noQuotations` | No quotations have been submitted for this RFQ. | لم يتم تقديم عروض أسعار لهذا الطلب. |
| `procurement.comparison.reasons.highest_commercial_score_lowest_price_tiebreak` | highest commercial score among compliant quotes; lowest total price as tiebreak | أعلى تقييم تجاري بين العروض المطابقة؛ وعند التعادل يُختار أقل سعر إجمالي |
| `procurement.comparison.recommendation` | Recommended: {supplier} — {reason} | المورد الموصى به: {supplier} — {reason} |
| `procurement.comparison.rfqId` | RFQ ID | رقم طلب عرض السعر |
| `procurement.comparison.title` | Procurement comparison | مقارنة المشتريات |
| `procurement.fields.actualSpend` | Received spend | قيمة المستلم |
| `procurement.fields.basis` | Recommendation basis | أساس التوصية |
| `procurement.fields.commercial_score` | Commercial score | التقييم التجاري |
| `procurement.fields.committedSpend` | Committed spend | الالتزامات |
| `procurement.fields.compliant` | Compliant | مطابق |
| `procurement.fields.deliveryDate` | Delivery date | تاريخ التسليم |
| `procurement.fields.deliveryTerms` | Delivery terms | شروط التسليم |
| `procurement.fields.delivery_terms` | Delivery terms | شروط التسليم |
| `procurement.fields.description` | Description | الوصف |
| `procurement.fields.deviations` | Deviations | الاستثناءات |
| `procurement.fields.dueDate` | Due date | تاريخ الاستحقاق |
| `procurement.fields.estimatedPrice` | Estimated unit price | سعر الوحدة التقديري |
| `procurement.fields.expiryDate` | Expiry date | تاريخ الصلاحية |
| `procurement.fields.goodsReceipt` | Goods receipt | إذن الاستلام |
| `procurement.fields.invoiceDate` | Invoice date | تاريخ الفاتورة |
| `procurement.fields.invoiceId` | Supplier invoice ID | معرف فاتورة المورد |
| `procurement.fields.invoiceNumber` | Supplier invoice number | رقم فاتورة المورد |
| `procurement.fields.justification` | Justification | المبررات |
| `procurement.fields.leadTime` | Lead time (days) | مدة التوريد (أيام) |
| `procurement.fields.lead_time_days` | Lead time (days) | مدة التوريد (أيام) |
| `procurement.fields.line` | Line ID | معرف البند |
| `procurement.fields.lotNumber` | Lot number | رقم التشغيلة |
| `procurement.fields.matchStatus` | Three-way match | المطابقة الثلاثية |
| `procurement.fields.material` | Material | المادة |
| `procurement.fields.materialId` | Material ID | معرف المادة |
| `procurement.fields.onTime` | On time (%) | التسليم في الموعد (%) |
| `procurement.fields.orderLine` | Purchase order line | بند أمر الشراء |
| `procurement.fields.paymentDate` | Payment date | تاريخ الدفع |
| `procurement.fields.paymentMethod` | Payment method | طريقة الدفع |
| `procurement.fields.paymentTerms` | Payment terms | شروط الدفع |
| `procurement.fields.payment_terms` | Payment terms | شروط الدفع |
| `procurement.fields.priority` | Priority | الأولوية |
| `procurement.fields.purchaseOrder` | Purchase order | أمر الشراء |
| `procurement.fields.purchaseOrders` | Orders | أوامر الشراء |
| `procurement.fields.purchaseRequest` | Purchase request | طلب الشراء |
| `procurement.fields.quality` | Quality (%) | الجودة (%) |
| `procurement.fields.quotations` | Quotations | العروض |
| `procurement.fields.reason` | Reason | السبب |
| `procurement.fields.reference` | Reference | المرجع |
| `procurement.fields.rfq` | Request for quotation | طلب عرض سعر |
| `procurement.fields.rfqLine` | Request line | بند الطلب |
| `procurement.fields.selectedQuote` | Selected quote | العرض المحدد |
| `procurement.fields.supplier_name` | Supplier | المورد |
| `procurement.fields.taxAmount` | Tax amount | قيمة الضريبة |
| `procurement.fields.tax_amount` | Tax | الضريبة |
| `procurement.fields.technical_score` | Technical score | التقييم الفني |
| `procurement.fields.title` | Title | العنوان |
| `procurement.fields.total_price` | Total price | السعر الإجمالي |
| `procurement.fields.unitPrice` | Unit price | سعر الوحدة |
| `procurement.fields.unit_price` | Unit price | سعر الوحدة |
| `procurement.fields.warehouse` | Warehouse | المخزن |
| `procurement.fields.warranty_months` | Warranty (months) | الضمان (أشهر) |
| `procurement.messages.apReviewHelp` | Use the supplier invoice ID returned when an invoice is recorded. Approval follows the configured ledger mapping. | استخدم معرف فاتورة المورد الذي يظهر بعد تسجيلها. يعتمد الاعتماد على ربط الحسابات المُعد. |
| `procurement.messages.cancelConfirm` | Cancel {reference}? A reason is required and the record will remain in the audit trail. | إلغاء {reference}؟ يلزم إدخال السبب وسيظل السجل محفوظاً في سجل التدقيق. |
| `procurement.messages.cancelled` | Record cancelled. | تم إلغاء السجل. |
| `procurement.messages.comparisonUnavailable` | The comparison details are not available for your current access. | تفاصيل المقارنة غير متاحة حسب صلاحياتك الحالية. |
| `procurement.messages.created` | Record created. | تم إنشاء السجل. |
| `procurement.messages.loadingWorkspace` | Loading project procurement... | جارٍ تحميل مشتريات المشروع... |
| `procurement.messages.noAnalytics` | No procurement analytics are available yet. | لا تتوفر تحليلات مشتريات بعد. |
| `procurement.messages.noAwards` | No award recommendations yet. | لا توجد توصيات ترسية بعد. |
| `procurement.messages.noDeliveries` | No deliveries for this project. | لا توجد تسليمات لهذا المشروع. |
| `procurement.messages.noGrns` | No goods receipts for this project. | لا توجد أذون استلام لهذا المشروع. |
| `procurement.messages.noInvoices` | No supplier invoice reviews to show. | لا توجد مراجعات لفواتير الموردين. |
| `procurement.messages.noLines` | No purchase order lines available. | لا توجد بنود لأمر الشراء. |
| `procurement.messages.noPos` | No purchase orders for this project. | لا توجد أوامر شراء لهذا المشروع. |
| `procurement.messages.noPrs` | No purchase requests for this project. | لا توجد طلبات شراء لهذا المشروع. |
| `procurement.messages.noQuotes` | No quotations have been received for this request. | لم يتم استلام عروض لهذا الطلب. |
| `procurement.messages.noRfqs` | No requests for quotation for this project. | لا توجد طلبات عروض أسعار لهذا المشروع. |
| `procurement.messages.paymentRecorded` | Payment recorded. | تم تسجيل الدفعة. |
| `procurement.messages.recommendedVendor` | Recommended supplier: {supplier}. | المورد الموصى به: {supplier}. |
| `procurement.messages.saved` | Changes saved. | تم حفظ التغييرات. |
| `procurement.messages.selectGrn` | Select a goods receipt with a received line. | حدد إذن استلام يحتوي على بند مستلم. |
| `procurement.messages.selectPurchaseOrder` | Select a purchase order. | حدد أمر شراء. |
| `procurement.messages.selectRfqAndSupplier` | Select an RFQ and at least one supplier. | حدد طلب عرض سعر ومورداً واحداً على الأقل. |
| `procurement.messages.selectRfqLine` | Select a line from the selected RFQ. | حدد بنداً من طلب عرض السعر. |
| `procurement.messages.submitted` | Submitted for approval. | تم الإرسال للموافقة. |
| `procurement.messages.supplierCollected` | Collected by supplier | استلمه المورد |
| `procurement.messages.supplierCollectionNote` | Collection note (optional) | ملاحظة الاستلام (اختياري) |
| `procurement.messages.supplierToCollect` | Rejected - supplier to collect | مرفوض - على المورد استلامه |
| `procurement.messages.threeWayMatch` | Invoice lines are checked against the purchase order and accepted goods receipts. Approval records the supplier liability. | تتم مطابقة بنود الفاتورة مع أمر الشراء والبضائع المستلمة والمقبولة. الاعتماد يسجل التزام المورد. |
| `procurement.rfq` | Request for quotation | طلب عرض سعر |
| `procurement.title` | Procurement | المشتريات |
| `procurement.values.bank_transfer` | Bank transfer | تحويل بنكي |
| `procurement.values.cash` | Cash | نقداً |
| `procurement.values.check` | Check | شيك |
| `procurement.values.commercial` | Commercial evaluation | التقييم التجاري |
| `procurement.values.comparison` | Best evaluated comparison | أفضل عرض وفق المقارنة |
| `procurement.values.direct_award` | Direct award with justification | ترسية مباشرة مع مبررات |
| `procurement.values.high` | High | مرتفع |
| `procurement.values.low` | Low | منخفض |
| `procurement.values.match_exception` | Exception | استثناء |
| `procurement.values.match_matched` | Matched | مطابق |
| `procurement.values.match_pending` | Pending | قيد الانتظار |
| `procurement.values.normal` | Normal | عادي |
| `procurement.values.other` | Other | أخرى |
| `procurement.values.technical` | Technical evaluation | التقييم الفني |
| `procurement.values.urgent` | Urgent | عاجل |
| `procurement.workspace.apReview` | Accounts payable review | مراجعة الحسابات الدائنة |
| `procurement.workspace.awardRecommendation` | Award recommendation and approval | توصية الترسية والموافقة |
| `procurement.workspace.comparison` | Quote comparison | مقارنة عروض الأسعار |
| `procurement.workspace.createPo` | Create an order from an RFQ quotation | إنشاء أمر من عرض طلب الأسعار |
| `procurement.workspace.createPr` | New purchase request | طلب شراء جديد |
| `procurement.workspace.createRfq` | New request for quotation | طلب عرض سعر جديد |
| `procurement.workspace.deliveries` | Deliveries | التسليمات |
| `procurement.workspace.goodsReceipts` | Goods receipt notes | أذون استلام البضائع |
| `procurement.workspace.inspectAndReceive` | Inspection and goods receipts | الفحص واستلام البضائع |
| `procurement.workspace.inviteSuppliers` | Invite suppliers | دعوة الموردين |
| `procurement.workspace.navigation` | Procurement stages | مراحل المشتريات |
| `procurement.workspace.orderActions` | Order review and actions | مراجعة الأوامر وإجراءاتها |
| `procurement.workspace.orderLines` | Purchase order lines | بنود أمر الشراء |
| `procurement.workspace.purchaseOrders` | Purchase orders | أوامر الشراء |
| `procurement.workspace.purchaseRequests` | Purchase requests | طلبات الشراء |
| `procurement.workspace.quotes` | Submitted quotations | عروض الأسعار المقدمة |
| `procurement.workspace.recordDelivery` | Record delivery receipt | تسجيل استلام التسليم |
| `procurement.workspace.recordPayment` | Supplier payment | دفعة المورد |
| `procurement.workspace.rfqList` | Requests for quotation | طلبات عروض الأسعار |
| `procurement.workspace.sections.analytics` | Analytics | التحليلات |
| `procurement.workspace.sections.awards` | Comparison and award | المقارنة والترسية |
| `procurement.workspace.sections.invoices` | Invoices and payments | الفواتير والمدفوعات |
| `procurement.workspace.sections.orders` | Purchase orders | أوامر الشراء |
| `procurement.workspace.sections.receipts` | Delivery and receipt | التسليم والاستلام |
| `procurement.workspace.sections.requests` | Requests | الطلبات |
| `procurement.workspace.sections.rfqs` | RFQs and quotes | طلبات الأسعار والعروض |
| `procurement.workspace.spendAnalytics` | Spend analytics | تحليلات الإنفاق |
| `procurement.workspace.submitQuote` | Record supplier quotation | تسجيل عرض المورد |
| `procurement.workspace.subtitle` | Manage requisitions, supplier quotes, approvals, receipts, invoices, and payments for this project. | إدارة الطلبات وعروض الموردين والموافقات والاستلام والفواتير والمدفوعات لهذا المشروع. |
| `procurement.workspace.supplierInvoice` | Supplier invoice and three-way match | فاتورة المورد والمطابقة الثلاثية |
| `procurement.workspace.supplierReturn` | Supplier return | مرتجع المورد |
| `procurement.workspace.title` | Project procurement | مشتريات المشروع |
| `procurement.workspace.vendorPerformance` | Vendor performance | أداء الموردين |

### projectWizard

| Catalog key | English | Arabic |
|---|---|---|
| `projectWizard.steps.basics` | Basics | البيانات الأساسية |
| `projectWizard.steps.review` | Review | المراجعة |
| `projectWizard.steps.team` | Team | الفريق |
| `projectWizard.system.11StepsEverythingIsCommittedAtomicallyOnFinish` | 11 steps · everything is committed atomically on Finish | ١١ خطوة · يُحفظ كل شيء ذرياً عند الإنهاء |
| `projectWizard.system.add` | Add | إضافة |
| `projectWizard.system.addTeamMember` | Add team member | إضافة عضو فريق |
| `projectWizard.system.address` | Address | العنوان |
| `projectWizard.system.advancePayment` | Advance Payment % | نسبة الدفعة المقدمة % |
| `projectWizard.system.approvalRulesBelowComeFromTheSelectedTemplate` | Approval rules below come from the selected template. | قواعد الاعتماد أدناه من القالب المختار. |
| `projectWizard.system.approvalSlaHours` | Approval SLA (hours) | مهلة الاعتماد (ساعات) |
| `projectWizard.system.arabicName` | Arabic Name * | الاسم العربي * |
| `projectWizard.system.auto` | auto | تلقائي |
| `projectWizard.system.back` | Back | السابق |
| `projectWizard.system.blankBoqSectionsItemsCanBeBuiltOrImportedLater` | Blank — BOQ sections/items can be built or imported later from the project BOQ page. | فارغ — يمكن بناء أو استيراد جدول الكميات لاحقاً. |
| `projectWizard.system.blankMilestonesCanBeAddedFromTheProjectPage` | Blank — milestones can be added from the project page. | فارغ — يمكن إضافة المعالم من صفحة المشروع. |
| `projectWizard.system.blankProject` | Blank project | مشروع فارغ |
| `projectWizard.system.blankSelectedYouCanStillDefineACustomLocationTree` | Blank selected — you can still define a custom location tree in the BOQ/schedule steps later, or import one. | تم اختيار المشروع الفارغ — يمكنك تعريف المواقع لاحقاً أو استيرادها. |
| `projectWizard.system.blankWbsASingleRootNodeIsCreatedPhasesCan` | Blank WBS — a single root node is created; phases can be added later from the project page. | سيُنشأ عقدة جذر واحدة؛ يمكن إضافة المراحل من صفحة المشروع. |
| `projectWizard.system.boqCbsSourceFileOptionalImport` | BOQ/CBS source file (optional import) | ملف جدول الكميات (اختياري) |
| `projectWizard.system.city` | City | المدينة |
| `projectWizard.system.clientOptional` | Client (optional) | العميل (اختياري) |
| `projectWizard.system.completionDate` | Completion Date | تاريخ الإنجاز |
| `projectWizard.system.country` | Country | الدولة |
| `projectWizard.system.currency` | Currency | العملة |
| `projectWizard.system.defaultApprovalRulesApplyEditThresholdsAfterCreation` | Default approval rules apply (edit thresholds after creation). | قواعد افتراضية — يمكن تعديل الحدود بعد الإنشاء. |
| `projectWizard.system.dlpMonths` | DLP (months) | فترة الصيانة (شهور) |
| `projectWizard.system.englishName` | English Name | الاسم بالإنجليزية |
| `projectWizard.system.finishProvisionProject` | Finish — provision project | إنهاء — إنشاء المشروع |
| `projectWizard.system.gpsLat` | GPS Lat | خط العرض |
| `projectWizard.system.gpsLng` | GPS Lng | خط الطول |
| `projectWizard.system.internalCostFieldsUnderCostingAndFinanceAreHiddenFrom` | Internal cost fields under /costing and /finance are hidden from consultant and client roles by the Phase 4 policy engine regardless of this setting. | حقول التكلفة الداخلية مخفية عن أدوار الاستشاري والعميل بمحرك الصلاحيات من المرحلة ٤ بغض النظر عن هذا الإعداد. |
| `projectWizard.system.liquidatedDamagesDay` | Liquidated Damages %/day | التعويض الاتفاقي %/يوم |
| `projectWizard.system.locationsWbsNodesFoldersWillBeCreated` | {description} — {length} locations, {length2} WBS nodes, {length3} folders will be created. | {description} — سيتم إنشاء {length} موقع و {length2} عقدة WBS و {length3} مجلد. |
| `projectWizard.system.newProjectWizard` | New Project — Wizard | مشروع جديد — معالج الإعداد |
| `projectWizard.system.next` | Next | التالي |
| `projectWizard.system.noClientAssigned` | -- No client assigned -- | -- بدون عميل -- |
| `projectWizard.system.noExternalParticipantsTheyCanBeAddedLater` | No external participants (they can be added later). | لا توجد أطراف خارجية (يمكن إضافتها لاحقاً). |
| `projectWizard.system.noTeamMembersYetOptional` | No team members yet (optional). | لا يوجد أعضاء بعد (اختياري). |
| `projectWizard.system.notificationChannels` | Notification channels | قنوات التنبيه |
| `projectWizard.system.optionalCanBeEmptyConsultantsClientsGetPortalAccessPer` | Optional — can be empty. Consultants/clients get portal access per participant. | اختياري — يمكن أن يبقى فارغاً. |
| `projectWizard.system.organizationClientDirectory` | Organization (client directory) | المؤسسة (دليل العملاء) |
| `projectWizard.system.originalBudget` | Original Budget | الميزانية الأصلية |
| `projectWizard.system.originalContractValue` | Original Contract Value | قيمة العقد الأصلية |
| `projectWizard.system.projectManager` | Project Manager | مدير المشروع |
| `projectWizard.system.projectNumber` | Project Number | رقم المشروع |
| `projectWizard.system.projectType` | Project Type | نوع المشروع |
| `projectWizard.system.queued` | Queued: {schedule} | في الانتظار: {schedule} |
| `projectWizard.system.queuedImportRunsAfterProvisioning` | Queued: {boq} (import runs after provisioning) | في الانتظار: {boq} |
| `projectWizard.system.register` | 🗂 Register: | 🗂 السجل: |
| `projectWizard.system.retention` | Retention % | نسبة الحجز % |
| `projectWizard.system.retentionCap` | Retention Cap | سقف الحجز |
| `projectWizard.system.role` | Role | الدور |
| `projectWizard.system.scheduleImportOptional` | Schedule import (optional) | استيراد الجدول الزمني (اختياري) |
| `projectWizard.system.selectEmployee` | -- Select employee -- | -- اختر موظفاً -- |
| `projectWizard.system.selectOrganization` | -- Select organization -- | -- اختر مؤسسة -- |
| `projectWizard.system.startDate` | Start Date | تاريخ البدء |
| `projectWizard.system.startFromATemplateOrBlank` | Start from a template or blank | البدء من قالب أو فراغ |
| `projectWizard.system.taxProfile` | Tax Profile | الملف الضريبي |
| `projectWizard.system.taxRetentionHandledInSteps67` | Tax / retention handled in steps 6-7 | يُكمل في الخطوات ٦-٧ |
| `projectWizard.system.theseStandardFoldersAndRegistersAreCreatedAutomaticallyOnFinish` | These standard folders and registers are created automatically on Finish: | تُنشأ هذه المجلدات والسجلات تلقائياً عند الإنهاء: |
| `projectWizard.system.timezone` | Timezone | المنطقة الزمنية |
| `projectWizard.system.visibilityPolicy` | Visibility policy | سياسة الظهور |
| `projectWizard.system.warrantyMonths` | Warranty (months) | الضمان (شهور) |
| `projectWizard.system.wbsNodesComeFromTheSelectedTemplateAndAreCreated` | WBS nodes come from the selected template and are created inside the Finish transaction. | عقد WBS تُنشأ من القالب داخل معاملة الإنهاء. |
| `projectWizard.title` | New project setup | إعداد مشروع جديد |

### projects

| Catalog key | English | Arabic |
|---|---|---|
| `projects.calendar.add` | Add Calendar | إضافة تقويم |
| `projects.calendar.addHoliday` | Add holiday | إضافة عطلة |
| `projects.calendar.cancelDelete` | Keep | إلغاء |
| `projects.calendar.confirmDelete` | Confirm delete | تأكيد الحذف |
| `projects.calendar.defaultBadge` | Default | افتراضي |
| `projects.calendar.delete` | Delete | حذف |
| `projects.calendar.edit` | Edit Calendar | تعديل التقويم |
| `projects.calendar.errDefaultRequired` | A project must keep one default calendar. Make another calendar the default first. | يجب أن يحتفظ المشروع بتقويم افتراضي واحد. اجعل تقويماً آخر افتراضياً أولاً. |
| `projects.calendar.errNotFound` | This calendar no longer exists on the project. | هذا التقويم لم يعد موجوداً على المشروع. |
| `projects.calendar.errOffDaysInvalid` | Weekly off days must be whole days from Sunday (0) to Saturday (6). | يجب أن تكون أيام الراحة أعداداً صحيحة من الأحد (0) إلى السبت (6). |
| `projects.calendar.holidays` | Holidays | العطلات |
| `projects.calendar.nameAr` | Name (Arabic) | الاسم (بالعربية) |
| `projects.calendar.nameEn` | Name (English) | الاسم (بالإنجليزية) |
| `projects.calendar.noCalendarsYet` | No calendars yet. The first calendar you create becomes the project default. | لا توجد تقويمات بعد. أول تقويم تنشئه يصبح الافتراضي للمشروع. |
| `projects.calendar.offDaysNone` | None | بدون |
| `projects.calendar.removeHoliday` | Remove | إزالة |
| `projects.calendar.section` | Calendars | التقويمات |
| `projects.calendar.setAsDefault` | Set as default calendar | تعيين كالتقويم الافتراضي |
| `projects.calendar.timezone` | Timezone | المنطقة الزمنية |
| `projects.calendar.weekdayFri` | Fri | الجمعة |
| `projects.calendar.weekdayMon` | Mon | الاثنين |
| `projects.calendar.weekdaySat` | Sat | السبت |
| `projects.calendar.weekdaySun` | Sun | الأحد |
| `projects.calendar.weekdayThu` | Thu | الخميس |
| `projects.calendar.weekdayTue` | Tue | الثلاثاء |
| `projects.calendar.weekdayWed` | Wed | الأربعاء |
| `projects.calendar.weeklyOffDays` | Weekly off days | أيام الراحة الأسبوعية |
| `projects.count.one` | {count} project | مشروع واحد |
| `projects.count.other` | {count} projects | {count} مشروع |
| `projects.empty` | No projects yet. | لا توجد مشاريع بعد. |
| `projects.nav.aria.groups` | Project sections | أقسام المشروع |
| `projects.nav.aria.tabs` | {group} pages | صفحات {group} |
| `projects.nav.groups.documents` | Documents & Reports | المستندات والتقارير |
| `projects.nav.groups.handover` | Handover & Sales | التسليم والمبيعات |
| `projects.nav.groups.overview` | Overview | نظرة عامة |
| `projects.nav.groups.procurement` | Procurement & Cost | المشتريات والتكلفة |
| `projects.nav.groups.scope` | Scope & Planning | النطاق والتخطيط |
| `projects.nav.groups.site` | Site & Quality | الموقع والجودة |
| `projects.nav.tabs.boq` | BOQ | جدول الكميات |
| `projects.nav.tabs.documents` | Documents | المستندات |
| `projects.nav.tabs.handover` | Handover & Closeout | التسليم والإغلاق |
| `projects.nav.tabs.hse` | HSE Workspace | الصحة والسلامة |
| `projects.nav.tabs.locations` | Locations & Quantities | المواقع والكميات |
| `projects.nav.tabs.operations` | Materials & Commercial | المواد والمشتريات |
| `projects.nav.tabs.qhse` | Quality & HSE | الجودة والسلامة |
| `projects.nav.tabs.reports` | Reports | التقارير |
| `projects.nav.tabs.schedule` | Schedule | الجدولة |
| `projects.nav.tabs.site` | Site Management | إدارة الموقع |
| `projects.nav.tabs.siteWorkspace` | Site Workspace | مساحة عمل الموقع |
| `projects.nav.tabs.units` | Units & Sales | الوحدات والمبيعات |
| `projects.nav.tabs.workOrders` | Work Orders | أوامر العمل |
| `projects.new` | New project | مشروع جديد |
| `projects.operations.description` | Materials, stock, procurement, commercial control and finance in one project-scoped workspace. | المواد والمخزون والمشتريات والرقابة التجارية والمالية في مساحة عمل مرتبطة بالمشروع. |
| `projects.operations.fields.boqItem` | BOQ item | بند جدول الكميات |
| `projects.operations.fields.certificate` | Certificate | المستخلص |
| `projects.operations.fields.certified` | Certified | المعتمد |
| `projects.operations.fields.issueDate` | Issued | تاريخ الإصدار |
| `projects.operations.fields.issued` | Issued | المصروف |
| `projects.operations.fields.location` | Location | الموقع |
| `projects.operations.fields.material` | Material | المادة |
| `projects.operations.fields.needDate` | Need date | تاريخ الحاجة |
| `projects.operations.fields.netAmount` | Net amount | صافي المبلغ |
| `projects.operations.fields.periodWork` | Period work | أعمال الفترة |
| `projects.operations.fields.remaining` | Remaining | المتبقي |
| `projects.operations.fields.required` | Required | المطلوب |
| `projects.operations.fields.retention` | Retention | الاستقطاع المحتجز |
| `projects.operations.fields.status` | Status | الحالة |
| `projects.operations.loadError` | This project section could not be loaded. Refresh and try again. | تعذر تحميل قسم المشروع. حدّث الصفحة وحاول مرة أخرى. |
| `projects.operations.metrics.balance` | Balance | الرصيد |
| `projects.operations.metrics.cashCollected` | Cash collected | المحصل نقداً |
| `projects.operations.metrics.cashExpenses` | Cash expenses | المصروفات النقدية |
| `projects.operations.metrics.contractValue` | Contract value | قيمة العقد |
| `projects.operations.metrics.eac` | EAC | التكلفة المتوقعة عند الإكمال |
| `projects.operations.metrics.forecastProfit` | Forecast profit | الربح المتوقع |
| `projects.operations.metrics.forecastRevenue` | Forecast revenue | الإيرادات المتوقعة |
| `projects.operations.metrics.held` | Held | المحتجز |
| `projects.operations.metrics.invoiced` | Invoiced | المفوتر |
| `projects.operations.metrics.outstanding` | Outstanding | المستحق |
| `projects.operations.metrics.released` | Released | المفرج عنه |
| `projects.operations.modules` | Project operations modules | وحدات عمليات المشروع |
| `projects.operations.noRecords` | No records for this project yet. | لا توجد سجلات لهذا المشروع بعد. |
| `projects.operations.openInventory` | Open inventory | فتح المخزون |
| `projects.operations.project` | Project | المشروع |
| `projects.operations.projectWarehouse` | Project warehouse | مخزن المشروع |
| `projects.operations.refresh` | Refresh | تحديث |
| `projects.operations.tabs.commercial` | Commercial | التجارة والعقود |
| `projects.operations.tabs.finance` | Finance | المالية |
| `projects.operations.tabs.inventory` | Inventory | المخزون |
| `projects.operations.tabs.materials` | Material planning | تخطيط المواد |
| `projects.operations.tabs.procurement` | Procurement | المشتريات |
| `projects.operations.tabs.retention` | Retention | الاستقطاع المحتجز |
| `projects.operations.tabs.valuations` | Valuations | المستخلصات |
| `projects.operations.title` | Project operations | عمليات المشروع |
| `projects.operations.warehouse` | Warehouse | مخزن |
| `projects.system.achievedDate` | Achieved Date | تاريخ الإنجاز |
| `projects.system.activeProjects` | Active Projects | مشاريع نشطة |
| `projects.system.addBuilding` | Add Building | إضافة مبنى |
| `projects.system.addMember` | Add Member | إضافة عضو |
| `projects.system.addMilestone` | Add Milestone | إضافة معلم |
| `projects.system.addPhase` | Add Phase | إضافة مرحلة |
| `projects.system.addTeamMember` | Add Team Member | إضافة عضو للفريق |
| `projects.system.addUnit` | Add Unit — {code} | إضافة وحدة — {code} |
| `projects.system.address` | Address | العنوان |
| `projects.system.all` | All | الكل |
| `projects.system.allTypes` | All Types | كل الأنواع |
| `projects.system.areaM` | Area m² | المساحة م² |
| `projects.system.backToProjects` | Back to Projects | العودة للمشاريع |
| `projects.system.baths` | Baths | حمامات |
| `projects.system.beds` | Beds | غرف |
| `projects.system.budget` | Budget | الميزانية |
| `projects.system.buildingsUnitInventorySalesStatus` | Buildings, unit inventory & sales status | المباني والوحدات وحالة البيع |
| `projects.system.bulkGenerate` | Bulk Generate | توليد وحدات |
| `projects.system.bulkGenerateUnits` | Bulk Generate Units — {code} | توليد وحدات — {code} |
| `projects.system.city` | City | المدينة |
| `projects.system.client` | Client | العميل |
| `projects.system.code` | Code | الكود |
| `projects.system.complete` | complete | إنجاز |
| `projects.system.completion` | Completion % | نسبة الإنجاز |
| `projects.system.completion2` | Completion | نسبة الإنجاز |
| `projects.system.contractValue` | Contract Value | قيمة العقد |
| `projects.system.deleteUnit` | Delete unit {code}? | حذف الوحدة {code}؟ |
| `projects.system.description` | Description | الوصف |
| `projects.system.done` | Done | مكتمل |
| `projects.system.due` | Due:  | متوقع:  |
| `projects.system.edit` | Edit | تعديل |
| `projects.system.editMilestone` | Edit Milestone | تعديل المعلم |
| `projects.system.editPhase` | Edit Phase | تعديل المرحلة |
| `projects.system.editProject` | Edit Project | تعديل المشروع |
| `projects.system.egp` | (EGP) | (ج.م.) |
| `projects.system.employee` | Employee | الموظف |
| `projects.system.englishName` | English Name * | الاسم بالإنجليزية * |
| `projects.system.englishTitle` | English Title * | العنوان بالإنجليزية * |
| `projects.system.expected` | Expected | المتوقع |
| `projects.system.expectedCompletion` | Expected Completion | تاريخ الانتهاء المتوقع |
| `projects.system.expenses` | Expenses | المصروفات |
| `projects.system.facing` | Facing | الاتجاه |
| `projects.system.finishing` | Finishing | التشطيب |
| `projects.system.floor` | Floor | طابق |
| `projects.system.floor2` | Floor | الطابق |
| `projects.system.floors` | floors | طوابق |
| `projects.system.floors2` | Floors | الطوابق |
| `projects.system.milestones` | Milestones | المعالم الرئيسية |
| `projects.system.name` | Name | الاسم |
| `projects.system.newProject` | New Project | مشروع جديد |
| `projects.system.noBuildingsYetAddYourFirstBuilding` | No buildings yet. Add your first building. | لا توجد مبانٍ. أضف أول مبنى. |
| `projects.system.noDepartment` | No Department | بدون قسم |
| `projects.system.noMilestonesYet` | No milestones yet. | لا توجد معالم رئيسية بعد. |
| `projects.system.noPhasesYet` | No phases yet. | لا توجد مراحل بعد. |
| `projects.system.noProjectsFoundAddYourFirstProject` | No projects found. Add your first project. | لا توجد مشاريع. أضف أول مشروع. |
| `projects.system.noTeamMembersYet` | No team members yet. | لا يوجد أعضاء في الفريق. |
| `projects.system.noUnits` | No units. | لا توجد وحدات. |
| `projects.system.outstanding` | Outstanding:  | مستحق:  |
| `projects.system.overallCompletion` | Overall Completion | نسبة الإنجاز الإجمالية |
| `projects.system.paymentsCollected` | Payments Collected | المدفوعات |
| `projects.system.pending` | Pending | معلق |
| `projects.system.pm` | PM: | مدير المشروع: |
| `projects.system.prefix` | Prefix | بادئة |
| `projects.system.price` | Price | السعر |
| `projects.system.profit` | Profit | الربح |
| `projects.system.projectManager` | Project Manager | مدير المشروع |
| `projects.system.projectPhases` | Project Phases | مراحل المشروع |
| `projects.system.projectPortfolioManagement` | Project Portfolio Management | إدارة محفظة المشاريع |
| `projects.system.projectTeam` | Project Team | فريق المشروع |
| `projects.system.projectType` | Project Type | نوع المشروع |
| `projects.system.role` | Role | الدور |
| `projects.system.searchProjects` | Search projects... | بحث عن مشاريع... |
| `projects.system.selectClient` | Select Client | اختر العميل |
| `projects.system.selectEmployee` | Select Employee | اختر الموظف |
| `projects.system.selectPm` | Select PM | اختر مدير المشروع |
| `projects.system.sold` | Sold | بيعت بـ |
| `projects.system.soldValue` | Sold Value | مبيعات |
| `projects.system.startDate` | Start Date | تاريخ البدء |
| `projects.system.startFloor` | Start Floor | أول طابق |
| `projects.system.targetDate` | Target Date | التاريخ المستهدف |
| `projects.system.totalContractValue` | Total Contract Value | إجمالي قيمة العقود |
| `projects.system.totalProjects` | Total Projects | إجمالي المشاريع |
| `projects.system.totalUnits` | Total Units | إجمالي الوحدات |
| `projects.system.type` | Type | النوع |
| `projects.system.unit` | Unit | وحدة |
| `projects.system.unitsFloor` | Units/Floor | وحدات/طابق |
| `projects.system.view` | View | الإطلالة |
| `projects.system.willCreateUnitsEG` | Will create {count} units (e.g. {exampleCode}) | سيتم إنشاء {count} وحدة (مثال: {exampleCode}) |
| `projects.title` | Projects | المشاريع |
| `projects.workPackage.empty` | This project has no work packages yet. Create them under Scope & Planning first. | لا توجد حزم عمل في هذا المشروع بعد. أنشئها أولًا من النطاق والتخطيط. |
| `projects.workPackage.label` | Work package | حزمة العمل |
| `projects.workPackage.loadFailed` | Work packages could not be loaded. | تعذّر تحميل حزم العمل. |
| `projects.workPackage.loading` | Loading work packages... | جارٍ تحميل حزم العمل... |
| `projects.workPackage.none` | No work package | بدون حزمة عمل |

### qhse

| Catalog key | English | Arabic |
|---|---|---|
| `qhse.certificates.create` | Register certificate | تسجيل الشهادة |
| `qhse.certificates.created` | Certificate registered. | تم تسجيل الشهادة. |
| `qhse.certificates.documentId` | Linked project document ID | رقم مستند المشروع المرتبط |
| `qhse.certificates.documentLink` | Document: {{title}} | المستند: {{title}} |
| `qhse.certificates.empty` | No certificates registered. | لا توجد شهادات مسجلة. |
| `qhse.certificates.error` | Could not load or save certificates. | تعذر تحميل الشهادات أو حفظها. |
| `qhse.certificates.expiryDate` | Expiry date | تاريخ الانتهاء |
| `qhse.certificates.issueDate` | Issue date | تاريخ الإصدار |
| `qhse.certificates.issuer` | Issuer | جهة الإصدار |
| `qhse.certificates.loading` | Loading certificates… | جارٍ تحميل الشهادات… |
| `qhse.certificates.mirId` | Linked MIR ID | رقم طلب فحص المواد المرتبط |
| `qhse.certificates.mirLink` | MIR: {{number}} | طلب الفحص: {{number}} |
| `qhse.certificates.name` | Title | العنوان |
| `qhse.certificates.new` | Register a certificate | تسجيل شهادة |
| `qhse.certificates.notes` | Notes | ملاحظات |
| `qhse.certificates.number` | Certificate number | رقم الشهادة |
| `qhse.certificates.revoke` | Revoke | إلغاء |
| `qhse.certificates.status` | Status | الحالة |
| `qhse.certificates.statuses.active` | Active | سارية |
| `qhse.certificates.statuses.revoked` | Revoked | ملغاة |
| `qhse.certificates.statuses.superseded` | Superseded | مستبدلة |
| `qhse.certificates.supersede` | Supersede | استبدال |
| `qhse.certificates.title` | Certificate register | سجل الشهادات |
| `qhse.certificates.type` | Certificate type | نوع الشهادة |
| `qhse.certificates.types.calibration` | Calibration | معايرة |
| `qhse.certificates.types.equipment` | Equipment | معدات |
| `qhse.certificates.types.material` | Material | مواد |
| `qhse.certificates.types.other` | Other | أخرى |
| `qhse.certificates.types.safety` | Safety | سلامة |
| `qhse.certificates.types.test` | Test | اختبار |
| `qhse.certificates.updated` | Certificate updated. | تم تحديث الشهادة. |
| `qhse.itp` | Inspection and test plans | خطط الفحص والاختبار |
| `qhse.ncr` | Non-conformance reports | تقارير عدم المطابقة |
| `qhse.system.accept` | Accept | قبول |
| `qhse.system.acceptanceCriteria` | Acceptance criteria | معايير القبول |
| `qhse.system.all` | All | الكل |
| `qhse.system.approve` | Approve | اعتماد |
| `qhse.system.approve2` | Approve | قبول |
| `qhse.system.assign` | Assign | إسناد |
| `qhse.system.assigned` | Assigned | المسؤول |
| `qhse.system.assignedRole` | Assigned role | الدور المسؤول |
| `qhse.system.calibrated` | Calibrated | المعايرة |
| `qhse.system.calibration` | Calibration | المعايرة |
| `qhse.system.cancel` | Cancel | إلغاء |
| `qhse.system.capa` | CAPA | إجراءات CAPA |
| `qhse.system.certificate` | Certificate | الشهادة |
| `qhse.system.certificateRef` | Certificate ref | مرجع الشهادة |
| `qhse.system.checklist` | Checklist | قائمة الفحص |
| `qhse.system.close` | Close | إغلاق |
| `qhse.system.complete` | Complete | إنجاز |
| `qhse.system.concreteCubeTest` | Concrete cube test | اختبار مكعبات خرسانة |
| `qhse.system.consultant` | Consultant | الاستشاري |
| `qhse.system.corrective` | Corrective | إجراءات تصحيحية |
| `qhse.system.correctiveAction` | Corrective Action | الإجراء التصحيحي |
| `qhse.system.critical` | Critical | حرج |
| `qhse.system.date` | Date | التاريخ |
| `qhse.system.description` | Description | الوصف |
| `qhse.system.discipline` | Discipline | التخصص |
| `qhse.system.due` | Due | الاستحقاق |
| `qhse.system.fail` | Fail | غير ناجح |
| `qhse.system.failedTest` | Failed test | اختبار فاشل |
| `qhse.system.failedTests` | Failed Tests | اختبارات فاشلة |
| `qhse.system.fallCut` | Fall, cut... | سقوط، جرح... |
| `qhse.system.findings` | Findings:  | الملاحظات:  |
| `qhse.system.findings2` | Findings | الملاحظات |
| `qhse.system.incidents` | Incidents | الحوادث |
| `qhse.system.injured` | Injured:  | مصاب:  |
| `qhse.system.injuredPartyIfAny` | Injured Party (if any) | المصاب (إن وجد) |
| `qhse.system.inspections` | Inspections | عمليات تفتيش |
| `qhse.system.instrument` | Instrument | الجهاز |
| `qhse.system.instrumentName` | Instrument name | اسم الجهاز |
| `qhse.system.investigate` | Investigate | تحقيق |
| `qhse.system.item` | Item | البند |
| `qhse.system.itp` | ITP | خطط الفحص |
| `qhse.system.itp2` | ITP | خطة الفحص والاختبار |
| `qhse.system.itpOptional` | — ITP (optional) — | — ITP (اختياري) — |
| `qhse.system.linkedToTest` | Linked to test:  | مرتبط بالاختبار:  |
| `qhse.system.location` | — Location — | — الموقع — |
| `qhse.system.location2` | Location | الموقع |
| `qhse.system.logQualityTest` | Log Quality Test | تسجيل اختبار جودة |
| `qhse.system.logTest` | Log Test | تسجيل اختبار |
| `qhse.system.major` | Major | جسيم |
| `qhse.system.minor` | Minor | بسيط |
| `qhse.system.mockUps` | Mock-ups | نماذج تجريبية |
| `qhse.system.ncrs` | NCRs | تقارير عدم المطابقة |
| `qhse.system.newAction` | New Action | إجراء جديد |
| `qhse.system.newInspection` | New Inspection | تفتيش جديد |
| `qhse.system.newItp` | New ITP | خطة فحص جديدة |
| `qhse.system.newPunchItem` | New Punch Item | بند جديد |
| `qhse.system.newWir` | New WIR | طلب فحص أعمال |
| `qhse.system.nextDue` | Next due | القادمة |
| `qhse.system.noActionsRecorded` | No actions recorded. | لا توجد إجراءات. |
| `qhse.system.noCalibrationRecords` | No calibration records. | لا توجد سجلات معايرة. |
| `qhse.system.noIncidentsReported` | No incidents reported. | لا توجد حوادث مسجلة. |
| `qhse.system.noInspectionPointsDefined` | No inspection points defined. | لا توجد نقاط فحص. |
| `qhse.system.noInspectionTestPlansYet` | No inspection & test plans yet. | لا توجد خطط فحص. |
| `qhse.system.noInspectionsLogged` | No inspections logged. | لا توجد عمليات تفتيش. |
| `qhse.system.noMockUpsProposed` | No mock-ups proposed. | لا توجد نماذج تجريبية. |
| `qhse.system.noNcrs` | No NCRs. | لا توجد تقارير عدم مطابقة. |
| `qhse.system.noPunchItemsTheRegisterIsClean` | No punch items — the register is clean. | لا توجد بنود PUNCH. |
| `qhse.system.noQualityTestsLogged` | No quality tests logged. | لا توجد اختبارات. |
| `qhse.system.noWorkInspectionRequestsYet` | No work inspection requests yet. | لا توجد طلبات فحص أعمال. |
| `qhse.system.ok` | OK | مطابق |
| `qhse.system.openIncidents` | Open Incidents | حوادث مفتوحة |
| `qhse.system.openNcrs` | Open NCRs | عدم مطابقة مفتوحة |
| `qhse.system.overdue` | overdue | متأخر |
| `qhse.system.pass` | Pass | ناجح |
| `qhse.system.point` | Point | نقطة |
| `qhse.system.point2` | Point | النقطة |
| `qhse.system.points` | Points | النقاط |
| `qhse.system.preventive` | Preventive | إجراءات وقائية |
| `qhse.system.proposeMockUp` | Propose Mock-up | نموذج تجريبي |
| `qhse.system.punchItems` | Punch Items | بنود PUNCH |
| `qhse.system.punchListPdf` | Punch list PDF | قائمة PUNCH |
| `qhse.system.qualityTests` | Quality Tests | اختبارات الجودة |
| `qhse.system.qualityTestsNcrsSiteSafety` | Quality tests, NCRs & site safety | اختبارات الجودة وعدم المطابقة والسلامة |
| `qhse.system.raiseNcr` | Raise NCR | رفع عدم مطابقة |
| `qhse.system.raiseNcr2` | Raise NCR | رفع تقرير عدم مطابقة |
| `qhse.system.raisedBy` | Raised By | رفعه |
| `qhse.system.reReview` | Re-review | إعادة مراجعة |
| `qhse.system.recordCalibration` | Record Calibration | سجل معايرة |
| `qhse.system.rectified` | Rectified | تم التصحيح |
| `qhse.system.reinspect` | Reinspect | إعادة فحص |
| `qhse.system.reject` | Reject | رفض |
| `qhse.system.reopen` | Reopen | إعادة فتح |
| `qhse.system.reportIncident` | Report Incident | الإبلاغ عن حادث |
| `qhse.system.responsible` | Responsible | المسؤول |
| `qhse.system.result` | Result | النتيجة |
| `qhse.system.return` | Return | إرجاع |
| `qhse.system.review` | Review | مراجعة |
| `qhse.system.safetyInspection` | Safety Inspection | تفتيش سلامة |
| `qhse.system.safetyInspections` | Safety Inspections | تفتيش السلامة |
| `qhse.system.save` | Save | حفظ |
| `qhse.system.serial` | Serial | الرقم التسلسلي |
| `qhse.system.serialNo` | Serial no. | الرقم التسلسلي |
| `qhse.system.severity` | Severity | الخطورة |
| `qhse.system.source` | Source | المصدر |
| `qhse.system.stage` | Stage | المرحلة |
| `qhse.system.start` | Start | بدء |
| `qhse.system.submit` | Submit | إرسال |
| `qhse.system.testType` | Test Type | نوع الاختبار |
| `qhse.system.testedBy` | Tested By | أجراه |
| `qhse.system.type` | Type | النوع |
| `qhse.system.verificationAuthority` | Verification authority | جهة التحقق |
| `qhse.system.verify` | Verify | تحقق |
| `qhse.system.wir` | WIR | طلب فحص أعمال |
| `qhse.system.wirs` | WIRs | فحص الأعمال |
| `qhse.system.workPackage` | Work package | حزمة العمل |
| `qhse.title` | Quality & HSE | الجودة والسلامة |

### reports

| Catalog key | English | Arabic |
|---|---|---|
| `reports.catalog.corrective_actions.columns.description` | Description | الوصف |
| `reports.catalog.corrective_actions.columns.due_date` | Due | تاريخ الاستحقاق |
| `reports.catalog.corrective_actions.columns.id` | ID | المعرف |
| `reports.catalog.corrective_actions.columns.status` | Status | الحالة |
| `reports.catalog.corrective_actions.title` | Corrective actions | الإجراءات التصحيحية |
| `reports.catalog.correspondence.columns.corr_number` | Ref | المرجع |
| `reports.catalog.correspondence.columns.corr_type` | Type | النوع |
| `reports.catalog.correspondence.columns.id` | ID | المعرف |
| `reports.catalog.correspondence.columns.revision` | Rev | المراجعة |
| `reports.catalog.correspondence.columns.status` | Status | الحالة |
| `reports.catalog.correspondence.columns.subject` | Subject | الموضوع |
| `reports.catalog.correspondence.title` | Correspondence | المراسلات |
| `reports.catalog.deliveries.columns.delivery_date` | Date | التاريخ |
| `reports.catalog.deliveries.columns.delivery_number` | Delivery | التوريد |
| `reports.catalog.deliveries.columns.id` | ID | المعرف |
| `reports.catalog.deliveries.columns.status` | Status | الحالة |
| `reports.catalog.deliveries.title` | Deliveries | التوريدات |
| `reports.catalog.employees.columns.id` | ID | المعرف |
| `reports.catalog.employees.columns.name` | Name | الاسم |
| `reports.catalog.employees.columns.position` | Position | الوظيفة |
| `reports.catalog.employees.columns.status` | Status | الحالة |
| `reports.catalog.employees.title` | Employees | الموظفون |
| `reports.catalog.expenses.columns.amount` | Amount | المبلغ |
| `reports.catalog.expenses.columns.date` | Date | التاريخ |
| `reports.catalog.expenses.columns.description` | Description | الوصف |
| `reports.catalog.expenses.columns.id` | ID | المعرف |
| `reports.catalog.expenses.columns.status` | Status | الحالة |
| `reports.catalog.expenses.title` | Expenses | المصروفات |
| `reports.catalog.incidents.columns.id` | ID | المعرف |
| `reports.catalog.incidents.columns.incident_category` | Category | الفئة |
| `reports.catalog.incidents.columns.incident_date` | Date | التاريخ |
| `reports.catalog.incidents.columns.lost_days` | Lost days | أيام العمل المفقودة |
| `reports.catalog.incidents.columns.severity` | Severity | الخطورة |
| `reports.catalog.incidents.columns.status` | Status | الحالة |
| `reports.catalog.incidents.title` | Incidents | الحوادث |
| `reports.catalog.inductions.columns.id` | ID | المعرف |
| `reports.catalog.inductions.columns.induction_date` | Date | التاريخ |
| `reports.catalog.inductions.columns.induction_type` | Type | النوع |
| `reports.catalog.inductions.columns.person_name` | Person | الشخص |
| `reports.catalog.inductions.columns.status` | Status | الحالة |
| `reports.catalog.inductions.title` | Inductions | التعريف بالسلامة |
| `reports.catalog.invoices.columns.amount` | Amount | المبلغ |
| `reports.catalog.invoices.columns.due_date` | Due | تاريخ الاستحقاق |
| `reports.catalog.invoices.columns.id` | ID | المعرف |
| `reports.catalog.invoices.columns.invoice_number` | Invoice | الفاتورة |
| `reports.catalog.invoices.columns.status` | Status | الحالة |
| `reports.catalog.invoices.title` | Client invoices | فواتير العملاء |
| `reports.catalog.ncrs.columns.cost_impact` | Cost impact | الأثر المالي |
| `reports.catalog.ncrs.columns.id` | ID | المعرف |
| `reports.catalog.ncrs.columns.ncr_number` | NCR | تقرير عدم المطابقة |
| `reports.catalog.ncrs.columns.severity` | Severity | الخطورة |
| `reports.catalog.ncrs.columns.status` | Status | الحالة |
| `reports.catalog.ncrs.title` | NCRs | تقارير عدم المطابقة |
| `reports.catalog.near_misses.columns.id` | ID | المعرف |
| `reports.catalog.near_misses.columns.incident_date` | Date | التاريخ |
| `reports.catalog.near_misses.columns.near_miss_number` | Ref | المرجع |
| `reports.catalog.near_misses.columns.severity` | Severity | الخطورة |
| `reports.catalog.near_misses.columns.status` | Status | الحالة |
| `reports.catalog.near_misses.title` | Near misses | الحوادث الوشيكة |
| `reports.catalog.permits.columns.id` | ID | المعرف |
| `reports.catalog.permits.columns.permit_number` | Permit | التصريح |
| `reports.catalog.permits.columns.permit_type` | Type | النوع |
| `reports.catalog.permits.columns.status` | Status | الحالة |
| `reports.catalog.permits.columns.valid_from` | Valid from | ساري من |
| `reports.catalog.permits.columns.valid_to` | Valid to | ساري حتى |
| `reports.catalog.permits.title` | Permits to work | تصاريح العمل |
| `reports.catalog.project_documents.columns.discipline` | Discipline | التخصص |
| `reports.catalog.project_documents.columns.doc_number` | Doc number | رقم المستند |
| `reports.catalog.project_documents.columns.doc_status` | Status | الحالة |
| `reports.catalog.project_documents.columns.doc_type` | Type | النوع |
| `reports.catalog.project_documents.columns.id` | ID | المعرف |
| `reports.catalog.project_documents.columns.revision_code` | Rev | المراجعة |
| `reports.catalog.project_documents.columns.title` | Title | العنوان |
| `reports.catalog.project_documents.title` | Document register | سجل المستندات |
| `reports.catalog.projects.columns.budget` | Budget | الميزانية |
| `reports.catalog.projects.columns.completion_percentage` | Progress % | نسبة الإنجاز |
| `reports.catalog.projects.columns.contract_value` | Contract value | قيمة العقد |
| `reports.catalog.projects.columns.id` | ID | المعرف |
| `reports.catalog.projects.columns.name_en` | Project | المشروع |
| `reports.catalog.projects.columns.status` | Status | الحالة |
| `reports.catalog.projects.title` | Projects register | سجل المشاريع |
| `reports.catalog.punch_items.columns.discipline` | Discipline | التخصص |
| `reports.catalog.punch_items.columns.due_date` | Due | تاريخ الاستحقاق |
| `reports.catalog.punch_items.columns.id` | ID | المعرف |
| `reports.catalog.punch_items.columns.punch_number` | Item | البند |
| `reports.catalog.punch_items.columns.status` | Status | الحالة |
| `reports.catalog.punch_items.title` | Punch list | قائمة الملاحظات |
| `reports.catalog.purchase_orders.columns.id` | ID | المعرف |
| `reports.catalog.purchase_orders.columns.po_number` | PO | أمر الشراء |
| `reports.catalog.purchase_orders.columns.status` | Status | الحالة |
| `reports.catalog.purchase_orders.columns.total_amount` | Value | القيمة |
| `reports.catalog.purchase_orders.title` | Purchase orders | أوامر الشراء |
| `reports.catalog.purchase_requests.columns.id` | ID | المعرف |
| `reports.catalog.purchase_requests.columns.pr_number` | PR | طلب الشراء |
| `reports.catalog.purchase_requests.columns.status` | Status | الحالة |
| `reports.catalog.purchase_requests.columns.total_amount` | Value | القيمة |
| `reports.catalog.purchase_requests.title` | Purchase requisitions | طلبات الشراء |
| `reports.catalog.quality_tests.columns.id` | ID | المعرف |
| `reports.catalog.quality_tests.columns.result` | Result | النتيجة |
| `reports.catalog.quality_tests.columns.test_date` | Date | التاريخ |
| `reports.catalog.quality_tests.columns.test_type` | Test type | نوع الاختبار |
| `reports.catalog.quality_tests.title` | Quality tests | اختبارات الجودة |
| `reports.catalog.schedule_activities.columns.activity_code` | Code | الرمز |
| `reports.catalog.schedule_activities.columns.critical` | Critical | حرج |
| `reports.catalog.schedule_activities.columns.id` | ID | المعرف |
| `reports.catalog.schedule_activities.columns.name` | Activity | النشاط |
| `reports.catalog.schedule_activities.columns.percent_complete` | % complete | نسبة الإكمال |
| `reports.catalog.schedule_activities.columns.planned_finish` | Planned finish | النهاية المخططة |
| `reports.catalog.schedule_activities.columns.planned_start` | Planned start | البداية المخططة |
| `reports.catalog.schedule_activities.title` | Schedule activities | أنشطة الجدول الزمني |
| `reports.catalog.sub_contracts.columns.contract_value` | Value | القيمة |
| `reports.catalog.sub_contracts.columns.id` | ID | المعرف |
| `reports.catalog.sub_contracts.columns.status` | Status | الحالة |
| `reports.catalog.sub_contracts.columns.sub_contract_number` | Contract | العقد |
| `reports.catalog.sub_contracts.title` | Subcontracts | عقود المقاولين من الباطن |
| `reports.catalog.transmittals.columns.created_at` | Created | تاريخ الإنشاء |
| `reports.catalog.transmittals.columns.direction` | Direction | الاتجاه |
| `reports.catalog.transmittals.columns.id` | ID | المعرف |
| `reports.catalog.transmittals.columns.status` | Status | الحالة |
| `reports.catalog.transmittals.columns.transmittal_number` | Transmittal | الإرسالية |
| `reports.catalog.transmittals.title` | Transmittals | الإرساليات |
| `reports.catalog.variations.columns.amount` | Amount | المبلغ |
| `reports.catalog.variations.columns.id` | ID | المعرف |
| `reports.catalog.variations.columns.status` | Status | الحالة |
| `reports.catalog.variations.columns.title` | Title | العنوان |
| `reports.catalog.variations.columns.variation_number` | Ref | المرجع |
| `reports.catalog.variations.title` | Variations | التغييرات |
| `reports.catalog.wirs.columns.id` | ID | المعرف |
| `reports.catalog.wirs.columns.inspection_date` | Date | التاريخ |
| `reports.catalog.wirs.columns.result` | Result | النتيجة |
| `reports.catalog.wirs.columns.status` | Stage | المرحلة |
| `reports.catalog.wirs.columns.wir_number` | WIR | طلب فحص الأعمال |
| `reports.catalog.wirs.title` | Work inspection requests | طلبات فحص الأعمال |
| `reports.empty` | No reports available. | لا توجد تقارير متاحة. |
| `reports.packs.commercial` | Commercial pack | حزمة التقارير التجارية |
| `reports.packs.management` | Management pack | حزمة تقارير الإدارة |
| `reports.packs.procurement` | Procurement pack | حزمة تقارير المشتريات |
| `reports.sections.actions` | Open actions | المهام المفتوحة |
| `reports.sections.consultant_observations` | Consultant observations | ملاحظات الاستشاري |
| `reports.sections.equipment` | Equipment on site | المعدات في الموقع |
| `reports.sections.executive_summary` | Executive Summary | الملخص التنفيذي |
| `reports.sections.financial_status` | Financial status | الوضع المالي |
| `reports.sections.key_risks` | Key risks | المخاطر الرئيسية |
| `reports.sections.manpower` | Manpower (today) | القوى العاملة اليوم |
| `reports.sections.materials` | Material inspections | فحص المواد |
| `reports.sections.milestones` | Milestones | المراحل الرئيسية |
| `reports.sections.photos` | Photos | الصور |
| `reports.sections.procurement` | Procurement | المشتريات |
| `reports.sections.progress` | Progress | الإنجاز |
| `reports.sections.quality` | Quality | الجودة |
| `reports.sections.quantities` | Approved quantities | الكميات المعتمدة |
| `reports.sections.rfis` | RFIs | طلبات المعلومات |
| `reports.sections.safety` | Safety | السلامة |
| `reports.sections.schedule` | Schedule | الجدول الزمني |
| `reports.sections.submittals` | Submittals | التقديمات |
| `reports.sections.variations` | Variations | التغييرات |
| `reports.system.automaticProjectReport` | Automatic project report | تقرير المشروع التلقائي |
| `reports.system.catalogExportsSavedViewsSchedules` | Catalog, exports, saved views & schedules | كتالوج التقارير والتصدير والتقارير المجدولة |
| `reports.system.noRecords` | No records. | لا سجلات. |
| `reports.system.openFromInsideAProjectFirst` | Open from inside a project first | افتح من داخل مشروع |
| `reports.system.runs` | ) · runs: | ) · مرات التشغيل: |
| `reports.system.saveView` | Save view | حفظ العرض |
| `reports.system.savedViews` | Saved views | العروض المحفوظة |
| `reports.system.schedule` | Schedule | جدولة |
| `reports.system.scheduledReports` | Scheduled reports | التقارير المجدولة |
| `reports.title` | Reports | التقارير |

### schedule

| Catalog key | English | Arabic |
|---|---|---|
| `schedule.activities` | Activities | الأنشطة |
| `schedule.activityBudget` | Activity budget | ميزانية النشاط |
| `schedule.actualProgress` | Actual progress | التقدم الفعلي |
| `schedule.addAssignment` | Add assignment | إضافة إسناد |
| `schedule.allocationPercent` | Allocation (%) | نسبة التخصيص |
| `schedule.assignResources` | Assign resources | إسناد الموارد |
| `schedule.assignedFrom` | Assigned from | الإسناد من |
| `schedule.assignedTo` | Assigned to | الإسناد حتى |
| `schedule.assignmentNotes` | Assignment notes | ملاحظات الإسناد |
| `schedule.assignmentStatus` | Assignment status | حالة الإسناد |
| `schedule.assignmentStatuses.active` | Active | نشط |
| `schedule.assignmentStatuses.cancelled` | Cancelled | ملغى |
| `schedule.assignmentStatuses.completed` | Completed | مكتمل |
| `schedule.assignmentStatuses.planned` | Planned | مخطط |
| `schedule.budgetAtCompletion` | Budget at completion | الميزانية عند الإكمال |
| `schedule.budgetAtCompletionHelp` | Enter the approved activity budget. This value is captured in the next baseline and supports financial SPI and CPI. | أدخل ميزانية النشاط المعتمدة. تُحفظ هذه القيمة في خط الأساس التالي وتدعم مؤشري أداء الجدول والتكلفة. |
| `schedule.budgetSaveFailed` | The activity budget could not be saved. | تعذر حفظ ميزانية النشاط. |
| `schedule.cancelAssignment` | Cancel | إلغاء الإسناد |
| `schedule.completeAssignment` | Complete | إكمال الإسناد |
| `schedule.cpi` | Cost performance index (CPI) | مؤشر أداء التكلفة (CPI) |
| `schedule.cpiStatus.activity_budgets_required` | Set a budget for every work activity, then capture a new baseline. | حدّد ميزانية لكل نشاط عمل ثم سجّل خط أساس جديداً. |
| `schedule.cpiStatus.actual_cost_required` | Project actual cost must be greater than zero to calculate CPI. | يجب أن تكون التكلفة الفعلية للمشروع أكبر من صفر لحساب المؤشر. |
| `schedule.cpiStatus.baseline_required` | Capture a current schedule baseline to calculate CPI. | سجّل خط أساس حالي للجدول لحساب المؤشر. |
| `schedule.cpiStatus.ready` | Calculated from baseline activity budgets and project actual cost. | محسوب من ميزانيات الأنشطة في خط الأساس والتكلفة الفعلية للمشروع. |
| `schedule.criticalPath` | Critical path | المسار الحرج |
| `schedule.dailyAllocation` | Daily allocation | التخصيص اليومي |
| `schedule.dataDate` | Data date | تاريخ البيانات |
| `schedule.employee` | Employee | موظف |
| `schedule.equipment` | Equipment | معدة |
| `schedule.history` | History | السجل |
| `schedule.invalidAssignment` | Check the resource and assignment dates. | تحقق من بيانات الإسناد وتواريخه. |
| `schedule.loadDate` | Date | التاريخ |
| `schedule.noAssignments` | No resources assigned to this activity. | لا توجد إسنادات بعد. |
| `schedule.noProgressHistory` | No progress updates yet | لا يوجد سجل إنجاز بعد. |
| `schedule.noResourceLoad` | No planned or active resource assignments in this date range. | لا توجد تعيينات موارد مخططة أو نشطة خلال هذه الفترة. |
| `schedule.noResources` | No active project employees or registered assets are available. | لا يوجد موظفون نشطون أو أصول مسجلة ضمن المشروع. |
| `schedule.percentComplete` | Percent complete | نسبة الإنجاز |
| `schedule.plannedProgress` | Planned progress | التقدم المخطط |
| `schedule.progressHistory` | Progress history | سجل الإنجاز |
| `schedule.progressNotes` | Notes | ملاحظات الإنجاز |
| `schedule.recordProgress` | Record progress | تسجيل الإنجاز |
| `schedule.resource` | Resource | المورد |
| `schedule.resourceAssignments` | Resource assignments | إسنادات الموارد |
| `schedule.resourceLoad` | Resource load | تحميل الموارد |
| `schedule.resourceLoadFailed` | Resource loading could not be retrieved. | تعذر تحميل بيانات الموارد. |
| `schedule.resourceOverlap` | This resource is already assigned to another activity during these dates. | يتداخل هذا الإسناد مع إسناد آخر للمورد. |
| `schedule.resourceProjectMismatch` | Choose a resource assigned to this project for the full assignment period. | اختر مورداً تابعاً لهذا المشروع طوال فترة الإسناد. |
| `schedule.scheduleVariance` | Schedule variance | انحراف الجدول |
| `schedule.selectResource` | Select a project resource | اختر مورداً |
| `schedule.startAssignment` | Start | بدء الإسناد |
| `schedule.system.activitiesCriticalPathLookaheads` | Activities, critical path & lookaheads | الأنشطة والمسار الحرج والنظرات المستقبلية |
| `schedule.system.activitiesGantt` | Activities & Gantt | الأنشطة والجانت |
| `schedule.system.activitiesNeedPlannedStartFinishDatesToDrawBars` | Activities need planned start/finish dates to draw bars. | تحتاج الأنشطة إلى تاريخ بداية ونهاية مخططين لرسم الأشرطة. |
| `schedule.system.activity` | Activity | النشاط |
| `schedule.system.activityName` | Activity name | اسم النشاط |
| `schedule.system.analytics` | Analytics | التحليلات |
| `schedule.system.baselineName` | Baseline name | اسم خط الأساس |
| `schedule.system.baselines` | Baselines | خطوط الأساس |
| `schedule.system.cancel` | Cancel | إلغاء |
| `schedule.system.capture` | Capture | التقاط |
| `schedule.system.code` | Code | الرمز |
| `schedule.system.complete` | % Complete | الإنجاز |
| `schedule.system.critical` | Critical | حرج |
| `schedule.system.criticalPathCpm` | Critical path (CPM) | المسار الحرج (CPM) |
| `schedule.system.current` | Current | الحالي |
| `schedule.system.delayedActivities` | Delayed activities | أنشطة متأخرة |
| `schedule.system.dur` | Dur. | المدة |
| `schedule.system.durationDays` | Duration (days) | المدة (أيام) |
| `schedule.system.finish` | Finish | النهاية |
| `schedule.system.milestone` | Milestone | معلم |
| `schedule.system.name` | Name | الاسم |
| `schedule.system.newActivity` | New Activity | نشاط جديد |
| `schedule.system.noActivitiesStartInThisWindow` | No activities start in this window. | لا أنشطة في النافذة. |
| `schedule.system.noBaselinesCaptured` | No baselines captured. | لا توجد خطوط أساس. |
| `schedule.system.noDelayedActivities` | No delayed activities. | لا أنشطة متأخرة. |
| `schedule.system.noScheduleActivitiesYetTheGanttIsEmpty` | No schedule activities yet — the Gantt is empty. | لا توجد أنشطة مجدولة. |
| `schedule.system.plannedFinish` | Planned finish | النهاية المخططة |
| `schedule.system.plannedFinish2` | — planned finish | — النهاية المخططة |
| `schedule.system.plannedStart` | Planned start | البداية المخططة |
| `schedule.system.projectFinish` | — project finish: | — نهاية المشروع: |
| `schedule.system.sCurve` | S-curve | منحنى التقدم |
| `schedule.system.save` | Save | حفظ |
| `schedule.system.schedule` | Schedule | الجدولة |
| `schedule.system.scheduleAlerts` | Schedule alerts | تنبيهات الجدولة |
| `schedule.system.spi` | SPI | مؤشر أداء الجدول الزمني |
| `schedule.system.start` | Start | البداية |
| `schedule.system.weekLookahead` | {weeks}-week lookahead | نافذة {weeks} أسابيع |
| `schedule.title` | Schedule | الجدول الزمني |
| `schedule.updateProgress` | Update progress | تحديث الإنجاز |

### site

| Catalog key | English | Arabic |
|---|---|---|
| `site.dailyReport` | Daily report | تقرير يومي |
| `site.instructions` | Site instructions | تعليمات الموقع |
| `site.offline.addMeasurement` | Add quantity | إضافة كمية |
| `site.offline.boqItem` | BOQ item | بند جدول الكميات |
| `site.offline.catalogError` | Project locations or BOQ items could not be loaded. Try again while connected. | تعذر تحميل المواقع أو البنود. أعد المحاولة عند الاتصال. |
| `site.offline.catalogLoading` | Loading project locations and BOQ items… | جارٍ تحميل مواقع المشروع وبنود جدول الكميات… |
| `site.offline.chooseItem` | Choose a BOQ item | اختر بنداً من جدول الكميات |
| `site.offline.chooseLocation` | Choose a location | اختر موقعاً |
| `site.offline.invalidMeasurement` | Complete each quantity row or remove it before saving. | أكمل بيانات كل صف كمية أو احذفه قبل الحفظ. |
| `site.offline.location` | Project location | موقع المشروع |
| `site.offline.measurements` | Reported quantities | الكميات المنفذة |
| `site.offline.photos` | Site photos | صور الموقع |
| `site.offline.quantity` | Quantity | الكمية |
| `site.offline.remove` | Remove | حذف |
| `site.offline.removeMeasurement` | Remove quantity row | حذف صف الكمية |
| `site.offline.removeMessage` | This unsent report and its local photos will be deleted from this device. | سيُحذف التقرير غير المرسل وصوره المحلية من هذا الجهاز. |
| `site.offline.removeTitle` | Remove offline report? | حذف التقرير غير المرسل؟ |
| `site.offline.retry` | Retry sync | إعادة المزامنة |
| `site.offline.status.conflict` | Needs review | تحتاج إلى مراجعة |
| `site.offline.status.failed` | Sync failed | فشلت المزامنة |
| `site.offline.status.queued` | Waiting to sync | بانتظار المزامنة |
| `site.offline.status.syncing` | Syncing | جارٍ المزامنة |
| `site.offline.storageError` | This report could not be saved on this device. Keep this page open and try again. | تعذر حفظ التقرير على هذا الجهاز. اترك الصفحة مفتوحة وحاول مجدداً. |
| `site.offline.syncError` | The report needs attention before it can be sent. | يحتاج التقرير إلى مراجعة قبل إرساله. |
| `site.offline.title` | Daily reports waiting to sync | تقارير يومية بانتظار المزامنة |
| `site.offline.unit` | Unit | الوحدة |
| `site.offline.userUnavailable` | Sign in again before saving a report offline. | سجّل الدخول مجدداً لحفظ التقرير دون اتصال. |
| `site.system.actionCreated` | Action created | أصبح إجراء |
| `site.system.actionItems` | Action Items | بنود المتابعة |
| `site.system.addAnItem` | Add an item... | أضف بند... |
| `site.system.all` | All | الكل |
| `site.system.assembleReportFromRecords` | Assemble report from records | تجميع التقرير من السجلات |
| `site.system.closed` | Closed | مغلقة |
| `site.system.consultant` | Consultant | استشاري |
| `site.system.convertToAction` | Convert to action | تحويل لإجراء |
| `site.system.dailyReport` | Daily Report | التقرير اليومي |
| `site.system.dailyReports` | Daily Reports | التقارير اليومية |
| `site.system.dailyReportsInstructionsVisits` | Daily reports, instructions & visits | التقارير اليومية والتعليمات والزيارات |
| `site.system.dailySiteReport` | Daily Site Report | تقرير موقع يومي |
| `site.system.date` | Date | التاريخ |
| `site.system.engineerInstructions` | Engineer Instructions | تعليمات المهندس |
| `site.system.equipmentOnSite` | Equipment on site:  | معدات بالموقع:  |
| `site.system.equipmentOnSite2` | Equipment on Site | معدات بالموقع |
| `site.system.fileTodaySReport` | File Today's Report | تقرير اليوم |
| `site.system.hTotal` | h total | ساعة إجمالاً |
| `site.system.issueInstruction` | Issue Instruction | إصدار تعليمات |
| `site.system.issuedBy` | Issued By | أصدرها |
| `site.system.issues` | Issues:  | مشاكل:  |
| `site.system.issuesBlockers` | Issues / blockers: | المشاكل والمعوقات: |
| `site.system.issuesNotes` | Issues / Notes | مشاكل / ملاحظات |
| `site.system.kb` | KB) | كيلوبايت) |
| `site.system.loadingWorkspace` | Loading workspace… | جارٍ تحميل مساحة العمل… |
| `site.system.logSiteVisit` | Log Site Visit | تسجيل زيارة موقع |
| `site.system.logVisit` | Log Visit | تسجيل زيارة |
| `site.system.materialsReceived` | Materials received:  | مواد مستلمة:  |
| `site.system.materialsReceived2` | Materials Received | مواد مستلمة |
| `site.system.narrative` | Narrative: | السرد: |
| `site.system.nextDayPlan` | Next-day plan: | خطة الغد: |
| `site.system.noActivitiesScheduledToday` | No activities scheduled today. | لا توجد أنشطة اليوم. |
| `site.system.noApprovedMeasurementsToday` | No approved measurements today. | لا كميات معتمدة اليوم. |
| `site.system.noAttendanceRecordsToday` | No attendance records today. | لا سجلات حضور اليوم. |
| `site.system.noDailyReportsFiledYet` | No daily reports filed yet. | لا توجد تقارير يومية بعد. |
| `site.system.noEquipmentLoggedToday` | No equipment logged today. | لا معدات اليوم. |
| `site.system.noGrnsToday` | No GRNs today. | لا توريدات اليوم. |
| `site.system.noIncidentsToday` | No incidents today. | لا حوادث. |
| `site.system.noInspectionsScheduledToday` | No inspections scheduled today. | لا فحوصات اليوم. |
| `site.system.noInstructions` | No instructions. | لا توجد تعليمات. |
| `site.system.noOpenInstructions` | No open instructions. | لا تعليمات مفتوحة. |
| `site.system.noPhotosToday` | No photos today. | لا صور اليوم. |
| `site.system.noStickyNotes` | No sticky notes. | لا ملاحظات. |
| `site.system.noVisitsLogged` | No visits logged. | لا توجد زيارات مسجلة. |
| `site.system.notes` | Notes | ملاحظات |
| `site.system.personal` | Personal | شخصية |
| `site.system.photo` | photo | صورة |
| `site.system.photos` | Photos | صور |
| `site.system.present` | present | حاضر |
| `site.system.priority` | Priority | الأولوية |
| `site.system.project` | Project | مشروع |
| `site.system.quickNote` | Quick note… | ملاحظة سريعة… |
| `site.system.quickPhoto` | Quick Photo | التقاط صورة |
| `site.system.readyToPick` | ready to pick | جاهز للصرف |
| `site.system.role` | Role | الصفة |
| `site.system.siteEngineerWorkspace` | Site Engineer Workspace | مساحة عمل مهندس الموقع |
| `site.system.siteManagement` | Site Management | إدارة الموقع |
| `site.system.siteVisits` | Site Visits | زيارات الموقع |
| `site.system.stickyNotes` | Sticky Notes | ملاحظات لاصقة |
| `site.system.stickyNotesAreNotFormalCorrespondenceUseTheOfficialDocument` | Sticky notes are not formal correspondence — use the official document registers for anything contractual. | الملاحظات اللاصقة ليست مراسلات رسمية — استخدم مسار المستندات الرسمية. |
| `site.system.sunny` | Sunny | مشمس |
| `site.system.temp` | Temp | الحرارة |
| `site.system.title` | Title | العنوان |
| `site.system.total` | total | الإجمالي |
| `site.system.uploading` | Uploading… | جارٍ الرفع… |
| `site.system.visitorName` | Visitor Name | اسم الزائر |
| `site.system.weather` | Weather | الطقس |
| `site.system.workSummary` | Work Summary | ملخص الأعمال |
| `site.system.workers` | workers | عامل |
| `site.system.workersCount` | Workers Count | عدد العمال |
| `site.title` | Site management | إدارة الموقع |
| `site.workspace.sections.activities` | Today's Activities | أنشطة اليوم |
| `site.workspace.sections.deliveries` | Deliveries (GRNs) | التوريدات (GRN) |
| `site.workspace.sections.equipment` | Equipment | المعدات |
| `site.workspace.sections.executedQuantities` | Executed Quantities | الكميات المنفذة |
| `site.workspace.sections.inspections` | Inspections | الفحوصات |
| `site.workspace.sections.instructions` | Open Engineer Instructions | تعليمات مفتوحة |
| `site.workspace.sections.manpower` | Manpower | العمالة |
| `site.workspace.sections.materialReadiness` | Material Readiness | جاهزية المواد |
| `site.workspace.sections.photos` | Today's Photos | صور اليوم |
| `site.workspace.sections.safety` | Safety | السلامة |

### subcontractors

| Catalog key | English | Arabic |
|---|---|---|
| `subcontractors.empty` | No subcontractors yet. | لا يوجد مقاولو باطن بعد. |
| `subcontractors.title` | Subcontractors | مقاولو الباطن |

### suppliers

| Catalog key | English | Arabic |
|---|---|---|
| `suppliers.empty` | No suppliers yet. | لا يوجد موردون بعد. |
| `suppliers.record.deleteConfirm` | Delete | حذف |
| `suppliers.record.deleteMessage` | {name} will be hidden from lists and pickers. Existing orders, deliveries and invoices keep it, and you can restore it later. | سيتم إخفاء {name} من القوائم وقوائم الاختيار. تحتفظ به الطلبات والتسليمات والفواتير الحالية ويمكنك استعادته لاحقًا. |
| `suppliers.record.deleteTitle` | Delete supplier | حذف المورد |
| `suppliers.record.deletedBadge` | Deleted | محذوف |
| `suppliers.record.restore` | Restore | استعادة |
| `suppliers.record.showDeleted` | Show deleted suppliers | عرض الموردين المحذوفين |
| `suppliers.system.active` | Active | نشط |
| `suppliers.system.addMaterial` | Add Material | إضافة مادة |
| `suppliers.system.addNewSupplier` | Add New Supplier | إضافة مورد جديد |
| `suppliers.system.addSupplier` | Add Supplier | إضافة مورد |
| `suppliers.system.address` | Address | العنوان |
| `suppliers.system.city` | City | المدينة |
| `suppliers.system.contactPerson` | Contact Person | الشخص المسؤول |
| `suppliers.system.edit` | Edit: {code} | تعديل: {code} |
| `suppliers.system.email` | Email | البريد الإلكتروني |
| `suppliers.system.englishName` | English Name * | الاسم بالإنجليزية * |
| `suppliers.system.leadTime` | Lead Time | مدة التوريد |
| `suppliers.system.leadTimeDays` | Lead Time (days) | مدة التوريد (يوم) |
| `suppliers.system.material` | Material | المادة |
| `suppliers.system.noMaterialsLinkedYet` | No materials linked yet. | لا توجد مواد مرتبطة بعد. |
| `suppliers.system.noSuppliersFoundAddYourFirstSupplier` | No suppliers found. Add your first supplier. | لا يوجد موردين. أضف أول مورد. |
| `suppliers.system.notes` | Notes | ملاحظات |
| `suppliers.system.paymentTerms` | Payment Terms | شروط الدفع |
| `suppliers.system.phone` | Phone | الهاتف |
| `suppliers.system.price` | Price | السعر |
| `suppliers.system.searchSuppliers` | Search suppliers... | بحث عن موردين... |
| `suppliers.system.selectCity` | Select City | اختر المدينة |
| `suppliers.system.selectMaterial` | Select material | اختر مادة |
| `suppliers.system.suppliedMaterials` | Supplied Materials | المواد الموردة |
| `suppliers.system.supplierDatabase` | Supplier Database | قاعدة بيانات الموردين |
| `suppliers.system.taxId` | Tax ID | الرقم الضريبي |
| `suppliers.system.unitPrice` | Unit Price | سعر الوحدة |
| `suppliers.title` | Suppliers | الموردين |

### workorders

| Catalog key | English | Arabic |
|---|---|---|
| `workorders.cancel.action` | Cancel work order | إلغاء أمر العمل |
| `workorders.cancel.confirm` | Cancel work order | إلغاء أمر العمل |
| `workorders.cancel.message` | {title} will be marked cancelled. Its materials, labor and completions are kept for the cost record. | سيتم وسم {title} كملغى. تُحفظ المواد والعمالة والإنجازات المرتبطة به ضمن سجل التكلفة. |
| `workorders.cancel.title` | Cancel work order | إلغاء أمر العمل |
| `workorders.empty` | No work orders yet. | لا توجد أوامر عمل بعد. |
| `workorders.system.actualQty` | Actual Qty | الكمية الفعلية |
| `workorders.system.assigned` | Assigned | مسند إلى |
| `workorders.system.assignedTo` | Assigned To | مسند إلى |
| `workorders.system.boqItem` | BOQ Item | البند |
| `workorders.system.boqItem2` | BOQ Item | بند الحصر |
| `workorders.system.boqSection` | BOQ Section | قسم الحصر |
| `workorders.system.collapse` | Collapse | طي |
| `workorders.system.completed` | Completed | مكتمل |
| `workorders.system.date` | Date | التاريخ |
| `workorders.system.description` | Description | الوصف |
| `workorders.system.details` | Details | تفاصيل |
| `workorders.system.editWorkOrder` | Edit Work Order | تعديل أمر العمل |
| `workorders.system.englishTitle` | English Title * | العنوان بالإنجليزية * |
| `workorders.system.equipment` | Equipment | المعدة |
| `workorders.system.hourlyCost` | Hourly Cost | تكلفة الساعة |
| `workorders.system.hours` | Hours | الساعات |
| `workorders.system.inProgress` | In Progress | قيد التنفيذ |
| `workorders.system.issueMaterial` | Issue Material | صرف مادة |
| `workorders.system.item` | Item | المادة |
| `workorders.system.newWorkOrder` | New Work Order | أمر عمل جديد |
| `workorders.system.noCompletionsRecordedYet` | No completions recorded yet. | لا توجد تسجيلات إنجاز. |
| `workorders.system.noEquipmentEntriesRecorded` | No equipment entries recorded. | لا توجد تسجيلات معدات. |
| `workorders.system.noLaborEntriesRecorded` | No labor entries recorded. | لا توجد تسجيلات عمالة. |
| `workorders.system.noMaterialsIssuedYet` | No materials issued yet. | لا توجد مواد مصروفة. |
| `workorders.system.noWorkOrdersFoundCreateYourFirst` | No work orders found. Create your first. | لا توجد أوامر عمل. أنشئ أول أمر. |
| `workorders.system.pending` | Pending | معلق |
| `workorders.system.phase` | Phase | المرحلة |
| `workorders.system.planned` | Planned | مخطط |
| `workorders.system.plannedEnd` | Planned End | تاريخ الانتهاء المخطط |
| `workorders.system.plannedQty` | Planned Qty | الكمية المخطط |
| `workorders.system.plannedStart` | Planned Start | تاريخ البدء المخطط |
| `workorders.system.quantity` | Quantity | الكمية |
| `workorders.system.quantityCompleted` | Quantity Completed | الكمية المنجزة |
| `workorders.system.recordCompletion` | Record Completion | تسجيل إنجاز |
| `workorders.system.recordEquipment` | Record Equipment | تسجيل معدة |
| `workorders.system.recordLabor` | Record Labor | تسجيل عمالة |
| `workorders.system.reject` | Reject | رفض |
| `workorders.system.rejected` | Rejected | مرفوض |
| `workorders.system.select` | — Select — | — اختر — |
| `workorders.system.selectBoqItem` | — Select BOQ Item — | — اختر البند — |
| `workorders.system.selectEquipment` | — Select Equipment — | — اختر المعدة — |
| `workorders.system.selectItem` | — Select Item — | — اختر المادة — |
| `workorders.system.skill` | Skill | المهارة |
| `workorders.system.skillCategory` | Skill Category | المهارة |
| `workorders.system.totalOrders` | Total Orders | إجمالي الأوامر |
| `workorders.system.unitCost` | Unit Cost | تكلفة الوحدة |
| `workorders.system.verified` | Verified | معتمد |
| `workorders.system.verify` | Verify | اعتماد |
| `workorders.system.warehouse` | Warehouse | المستودع |
| `workorders.system.workOrdersForProject` | Work Orders for Project | أوامر العمل للمشروع |
| `workorders.system.workerCount` | Worker Count | عدد العمال |
| `workorders.system.workers` | Workers | عدد العمال |
| `workorders.title` | Work orders | أوامر العمل |
