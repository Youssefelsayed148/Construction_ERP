# Arabic construction terminology and export review pack

Status: **pending native Egyptian construction-domain reviewer and Arabic role UAT**. Generated on 2026-10-14 from the current final glossary and the paired catalogs. This is a review worksheet, not a sign-off.

## Review checklist

- [ ] Confirm Arabic terminology for construction, procurement, contracts, QS, finance, QA/QC, HSE, planning, handover, and warranty in Egyptian usage.
- [ ] Check abbreviations and mixed Arabic/Latin text: C35, BOQ, RFQ, PR, PO, GRN, MIR, WIR, NCR, EGP, dates, email addresses, URLs, and document numbers.
- [ ] Inspect EN/AR screenshots at desktop and mobile sizes; baseline images are in [docs/i18n/baseline/screenshots/](i18n/baseline/screenshots/).
- [ ] Review the representative Arabic PDF screenshots and PDFs listed in [PDF_SPIKE.md](i18n/PDF_SPIKE.md). This is a renderer spike, not final production export sign-off.
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
- Full production Arabic PDF/CSV export review: **pending; current PDF files are spike samples**

## Current paired catalog inventory

Generated from 35 EN/AR namespaces. The reviewer should add corrections in the term table above and confirm contextual usage on the screens below.

### actions

| Catalog key | English | Arabic |
|---|---|---|
| `actions.empty` | You have no open actions. | ليس لديك مهام مفتوحة. |
| `actions.title` | My actions | مهامي |

### agents

| Catalog key | English | Arabic |
|---|---|---|
| `agents.decisions` | Decisions | القرارات |
| `agents.title` | Agent activity | نشاط الوكلاء |

### approvals

| Catalog key | English | Arabic |
|---|---|---|
| `approvals.pending` | Pending approvals | الموافقات المعلقة |
| `approvals.title` | Approvals | الموافقات |

### assets

| Catalog key | English | Arabic |
|---|---|---|
| `assets.maintenance` | Maintenance | الصيانة |
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
| `boq.title` | Bill of Quantities | جدول الكميات |

### clients

| Catalog key | English | Arabic |
|---|---|---|
| `clients.empty` | No clients yet. | لا يوجد عملاء بعد. |
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
| `common.pagination.page` | Page {page} of {total} | صفحة {page} من {total} |
| `common.phone` | Phone | الهاتف |
| `common.print` | Print | طباعة |
| `common.quantity` | Quantity | الكمية |
| `common.save` | Save | حفظ |
| `common.search` | Search | بحث |
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
| `dashboard.title` | Dashboard | لوحة التحكم |
| `dashboard.welcome` | Welcome back, {name} | مرحبًا بعودتك، {name} |
| `dashboard.widgets.title` | Overview | نظرة عامة |

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
| `documentControl.rfiImpacts.cost` | Estimated cost impact | ????? ?????? ?????? |
| `documentControl.rfiImpacts.loading` | Loading project locations… | ???? ????? ????? ???????? |
| `documentControl.rfiImpacts.location` | Project location | ???? ??????? |
| `documentControl.rfiImpacts.locationsUnavailable` | Project locations could not be loaded. You can still raise the RFI without a location. | ???? ????? ????? ???????. ????? ????? ??? ????????? ??? ????. |
| `documentControl.rfiImpacts.none` | No location linked | ?? ???? ???? ????? |
| `documentControl.rfiImpacts.schedule` | Schedule impact (days) | ??? ?????? (????) |
| `documentControl.rfiImpacts.workPackage` | Work package | ???? ????? |
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
| `enums.entityType.asset` | Asset | أصل |
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
| `enums.entityType.submittal` | Submittal | مستند للاعتماد |
| `enums.entityType.variation` | Variation | أمر تغيير |
| `enums.entityType.workOrder` | Work order | أمر عمل |
| `enums.priority.critical` | Critical | حرجة |
| `enums.priority.high` | High | عالية |
| `enums.priority.low` | Low | منخفضة |
| `enums.priority.medium` | Medium | متوسطة |
| `enums.priority.urgent` | Urgent | عاجلة |
| `enums.risk.draft` | Draft | مسودة |
| `enums.risk.gated` | Needs approval | يتطلب موافقة |
| `enums.risk.read` | Read | قراءة |
| `enums.role.accountant` | Accountant | محاسب |
| `enums.role.admin` | Administrator | مدير النظام |
| `enums.role.client` | Client | عميل |
| `enums.role.consultant` | Consultant | استشاري |
| `enums.role.engineer` | Engineer | مهندس |
| `enums.role.financeManager` | Finance Manager | مدير مالي |
| `enums.role.legalMgr` | Legal Manager | مدير قانوني |
| `enums.role.maintenanceMgr` | Maintenance Manager | مدير الصيانة |
| `enums.role.manager` | Manager | مدير |
| `enums.role.owner` | Owner | المالك |
| `enums.role.projectManager` | Project Manager | مدير مشروع |
| `enums.role.purchasingMgr` | Purchasing Manager | مدير المشتريات |
| `enums.role.siteSupervisor` | Site Supervisor | مشرف موقع |
| `enums.role.staff` | Staff | موظف |
| `enums.role.subcontractor` | Subcontractor | مقاول من الباطن |
| `enums.role.supplier` | Supplier | مورد |
| `enums.severity.critical` | Critical | حرجة |
| `enums.severity.high` | High | عالية |
| `enums.severity.low` | Low | منخفضة |
| `enums.severity.major` | Major | كبيرة |
| `enums.severity.medium` | Medium | متوسطة |
| `enums.severity.minor` | Minor | بسيطة |
| `enums.severity.moderate` | Moderate | متوسطة |
| `enums.status.active` | Active | نشط |
| `enums.status.approved` | Approved | معتمد |
| `enums.status.available` | Available | متاح |
| `enums.status.blocked` | Blocked | محظور |
| `enums.status.cancelled` | Cancelled | ملغي |
| `enums.status.certified` | Certified | معتمد (مستخلص) |
| `enums.status.closed` | Closed | مغلق |
| `enums.status.completed` | Completed | مكتمل |
| `enums.status.delivered` | Delivered | تم التسليم |
| `enums.status.draft` | Draft | مسودة |
| `enums.status.expired` | Expired | منتهي |
| `enums.status.inProgress` | In progress | قيد التنفيذ |
| `enums.status.inactive` | Inactive | غير نشط |
| `enums.status.issued` | Issued | صادر |
| `enums.status.onHold` | On hold | معلق |
| `enums.status.open` | Open | مفتوح |
| `enums.status.overdue` | Overdue | متأخر |
| `enums.status.paid` | Paid | مدفوع |
| `enums.status.partiallyPaid` | Partially paid | مدفوع جزئيًا |
| `enums.status.pending` | Pending | قيد الانتظار |
| `enums.status.pendingApproval` | Pending approval | بانتظار الاعتماد |
| `enums.status.planning` | Planning | قيد التخطيط |
| `enums.status.received` | Received | مستلم |
| `enums.status.rejected` | Rejected | مرفوض |
| `enums.status.reserved` | Reserved | محجوز |
| `enums.status.returned` | Returned | معاد للتعديل |
| `enums.status.scheduled` | Scheduled | مجدول |
| `enums.status.sent` | Sent | مرسل |
| `enums.status.submitted` | Submitted | مُرسل |
| `enums.status.underReview` | Under review | قيد المراجعة |
| `enums.status.unpaid` | Unpaid | غير مدفوع |
| `enums.status.verified` | Verified | تم التحقق |
| `enums.status.void` | Void | ملغى |
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
| `errors.award_decision_refused` | You are not authorized to decide this recommendation. | ??? ???? ?????? ????? ???? ???? ??? ???????. |
| `errors.award_not_draft` | Only draft award recommendations can be submitted. | ???? ????? ?????? ??????? ??????? ???. |
| `errors.award_not_submitted` | This award recommendation is not waiting for a decision. | ????? ??????? ??? ?? ????? ??????. |
| `errors.award_recommendation_exists` | An active award recommendation already exists for this request. | ???? ????? ????? ???? ???? ????? ??????. |
| `errors.cancel_reason_required` | Enter a reason with at least three characters. | ???? ????? ?? ??? ?? ????? ????. |
| `errors.certified_quantity_amount_override` | Certified work is calculated from certified quantities and contract rates. | يتم احتساب قيمة الأعمال المعتمدة من الكميات المعتمدة والأسعار التعاقدية. |
| `errors.certified_quantity_invalid` | Certified quantities must be within the claimed amounts and measurements must remain certified. | يجب ألا تتجاوز الكميات المعتمدة المطالبة، ويجب أن تظل القياسات معتمدة. |
| `errors.certified_quantity_lines_required` | Enter the certified quantity for every claimed line. | أدخل الكمية المعتمدة لكل بند من المطالبة. |
| `errors.conflict` | This record was changed by someone else. | تم تعديل هذا السجل بواسطة شخص آخر. |
| `errors.contract_boq_rate_ambiguous` | Each BOQ item must have exactly one matching contract rate. | يجب أن يكون لكل بند في جدول الكميات سعر تعاقدي مطابق واحد فقط. |
| `errors.delivery_not_found` | The delivery could not be found. | ???? ?????? ??? ???????. |
| `errors.forbidden` | You do not have permission to do this. | ليس لديك صلاحية لتنفيذ هذا الإجراء. |
| `errors.grn_not_found` | The goods receipt could not be found. | ???? ?????? ??? ??? ????????. |
| `errors.invalid_activity_budgeted_cost` | Enter a non-negative activity budget with no more than two decimal places. | أدخل ميزانية نشاط غير سالبة وبحد أقصى منزلتين عشريتين. |
| `errors.invalid_resource_load_range` | Choose a valid resource loading date range of up to 91 days. | اختر نطاقاً صحيحاً لتحميل الموارد لا يتجاوز 91 يوماً. |
| `errors.invoice_match_failed` | The invoice does not match the purchase order and accepted receipt quantities. | ?? ?????? ???????? ?? ??? ?????? ?????? ???????? ????????. |
| `errors.mir_not_found` | The inspection request could not be found. | ???? ?????? ??? ??? ?????. |
| `errors.networkError` | Cannot reach the server. Check your connection. | تعذر الوصول إلى الخادم. تحقق من اتصالك. |
| `errors.notFound` | The requested record was not found. | لم يتم العثور على السجل المطلوب. |
| `errors.po_cannot_cancel` | This purchase order cannot be cancelled in its current state. | ?? ???? ????? ??? ?????? ?? ????? ???????. |
| `errors.po_not_draft` | Only draft purchase orders can be edited. | ???? ????? ????? ?????? ??????? ???. |
| `errors.po_not_found` | The purchase order could not be found. | ???? ?????? ??? ??? ??????. |
| `errors.pr_cannot_cancel` | This purchase request cannot be cancelled in its current state. | ?? ???? ????? ??? ?????? ?? ????? ???????. |
| `errors.pr_has_orders` | This purchase request already has a purchase order. | ??? ??? ?????? ??? ???? ??????. |
| `errors.pr_not_draft` | Only draft purchase requests can be edited. | ???? ????? ????? ?????? ??????? ???. |
| `errors.pr_not_found` | The purchase request could not be found. | ???? ?????? ??? ??? ??????. |
| `errors.quantity_already_claimed` | That quantity is already reserved or certified on another application. | هذه الكمية محجوزة أو معتمدة بالفعل في طلب آخر. |
| `errors.quantity_claim_invalid` | Claimed quantity must be positive and within the certified measurement quantity. | يجب أن تكون الكمية المطالب بها موجبة وألا تتجاوز كمية القياس المعتمد. |
| `errors.quantity_measurement_duplicate` | A measurement can appear only once in an application. | يمكن إدراج القياس مرة واحدة فقط في الطلب. |
| `errors.quantity_measurement_not_certified` | Only certified measurements from this project can be claimed. | يمكن المطالبة بالقياسات المعتمدة من هذا المشروع فقط. |
| `errors.quantity_measurement_not_found` | One or more quantity measurements could not be found. | تعذر العثور على قياس واحد أو أكثر للكميات. |
| `errors.quantity_valuation_other_amounts_unsupported` | Quantity-based applications cannot include separate variation or material amounts. | لا يمكن أن تتضمن طلبات الكميات مبالغ منفصلة للتغييرات أو المواد. |
| `errors.quotation_not_compliant` | A non-compliant quotation cannot be awarded. | ?? ???? ????? ??? ??? ?????. |
| `errors.quotation_not_found` | The supplier quotation could not be found. | ???? ?????? ??? ??? ??????. |
| `errors.rateLimited` | Too many requests. Please wait a moment. | عدد الطلبات كبير جدًا. يرجى الانتظار قليلًا. |
| `errors.recordInUse` | This record is used by other records and cannot be deleted. | هذا السجل مستخدم في سجلات أخرى ولا يمكن حذفه. |
| `errors.requestFailed` | The request could not be completed. | تعذر إكمال الطلب. |
| `errors.rfq_line_not_found` | The selected request line could not be found. | ???? ?????? ??? ??? ????? ??????. |
| `errors.rfq_not_found` | The request for quotation could not be found. | ???? ?????? ??? ??? ??? ?????. |
| `errors.schedule_activity_budget_update_failed` | The activity budget could not be saved. | تعذر حفظ ميزانية النشاط. |
| `errors.schedule_activity_not_found` | The schedule activity could not be found. | تعذر العثور على نشاط الجدول. |
| `errors.schedule_kpis_failed` | Schedule performance indicators could not be retrieved. | تعذر تحميل مؤشرات أداء الجدول. |
| `errors.schedule_project_scope_denied` | You do not have access to this project schedule. | ليس لديك صلاحية الوصول إلى جدول هذا المشروع. |
| `errors.schedule_resource_load_failed` | Resource loading could not be retrieved. | تعذر تحميل بيانات الموارد. |
| `errors.serverError` | Something went wrong on our side. | حدث خطأ من جانبنا. |
| `errors.sessionExpired` | Your session has expired. | انتهت صلاحية الجلسة. |
| `errors.supplier_invoice_duplicate` | This supplier has already submitted that invoice number. | ??? ?? ??? ?????? ??? ???????? ???. |
| `errors.supplier_invoice_not_approvable` | This supplier invoice cannot be approved in its current state. | ?? ???? ?????? ?????? ?????? ?? ?????? ???????. |
| `errors.unauthorized` | Please sign in to continue. | يرجى تسجيل الدخول للمتابعة. |
| `errors.unknown` | An unexpected error occurred. | حدث خطأ غير متوقع. |
| `errors.validation` | Some fields are invalid. Please review and try again. | بعض الحقول غير صحيحة. يرجى المراجعة والمحاولة مرة أخرى. |
| `errors.validation_error` | Some required values are invalid. Review the highlighted fields. | ??? ????? ???????? ??? ?????. ???? ?????? ????? ??? ????. |

### expenses

| Catalog key | English | Arabic |
|---|---|---|
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
| `finance.invoices` | Invoices | الفواتير |
| `finance.payments` | Payments | المدفوعات |
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
| `finance.workbench.amount` | Amount | المبلغ |
| `finance.workbench.applications` | Payment applications | طلبات المستخلصات |
| `finance.workbench.approve` | Approve | اعتماد |
| `finance.workbench.approved` | Approved | معتمد |
| `finance.workbench.batchHelp` | Use a supplier invoice ID and amount from the approved accounts payable record. | استخدم معرّف فاتورة المورد ومبلغها من سجل الحسابات الدائنة المعتمد. |
| `finance.workbench.batchScope` | Payment batches require a company-wide finance grant. | تتطلب دفعات الموردين صلاحية مالية على مستوى الشركة. |
| `finance.workbench.batches` | Payment batches | دفعات الموردين |
| `finance.workbench.budgets` | Budget versions | إصدارات الميزانية |
| `finance.workbench.certificates` | Payment certificates | شهادات الدفع |
| `finance.workbench.certified` | Application certified. | تم اعتماد طلب المستخلص. |
| `finance.workbench.certify` | Certify claim | اعتماد المطالبة |
| `finance.workbench.claimed` | Claimed total | إجمالي المطالبة |
| `finance.workbench.claimed_materials` | Claimed materials | المواد المطالب بها |
| `finance.workbench.claimed_variations` | Claimed variations | التغييرات المطالب بها |
| `finance.workbench.claimed_work` | Claimed work | الأعمال المطالب بها |
| `finance.workbench.client` | Client | العميل |
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
| `finance.workbench.saved` | Changes saved. | تم حفظ التغييرات. |
| `finance.workbench.selectInvoice` | Select an invoice | اختر فاتورة |
| `finance.workbench.startWorkflow` | Start approval | بدء الاعتماد |
| `finance.workbench.started` | Approval started. | بدأ مسار الاعتماد. |
| `finance.workbench.subcontractor` | Subcontractor | مقاول الباطن |
| `finance.workbench.submit` | Submit | إرسال |
| `finance.workbench.submitted` | Submitted for approval | مرسل للاعتماد |
| `finance.workbench.supplier` | Supplier | المورد |
| `finance.workbench.supplierInvoiceId` | Supplier invoice ID | معرّف فاتورة المورد |
| `finance.workbench.tabs.applications` | Applications and certificates | المستخلصات والشهادات |
| `finance.workbench.tabs.batches` | Payment batches | دفعات الموردين |
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
| `handover.asset` | Asset | ????? |
| `handover.assetCode` | Asset code | ??? ????? |
| `handover.assetDocuments` | Asset documents | ??????? ????? |
| `handover.assetName` | Asset name | ??? ????? |
| `handover.commissioningDate` | Commissioning date | ????? ??????? |
| `handover.coverage` | Coverage description | ??? ??????? |
| `handover.documentAttached` | Controlled document attached | ?? ????? ????? ????? |
| `handover.endDate` | Coverage ends | ????? ??????? |
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
| `handover.legacyDocumentUrl` | Legacy URL; attach a controlled project document to protect access. | ???? ????? ???? ??????? ??????? ???????? ?????? ??????. |
| `handover.model` | Model | ?????? |
| `handover.newAsset` | New project asset | ??? ???? ??????? |
| `handover.newWarranty` | New warranty | ???? ???? |
| `handover.noAsset` | No asset linked | ?? ???? ??? ????? |
| `handover.noWarranties` | No warranties registered. | ?? ???? ?????? ?????. |
| `handover.notes` | Notes | ??????? |
| `handover.reactivateWarranty` | Reactivate | ????? ??????? |
| `handover.serialNumber` | Serial number | ????? ???????? |
| `handover.startDate` | Coverage starts | ????? ??????? |
| `handover.status` | Status | ?????? |
| `handover.title` | Handover | التسليم |
| `handover.uploadAssetDocument` | Upload asset document | ??? ????? ????? |
| `handover.uploadEvidence` | Upload evidence | ??? ??????? |
| `handover.voidWarranty` | Void | ????? |
| `handover.warranties` | Warranty register | ??? ???????? |
| `handover.warranty` | Warranty | الضمان |
| `handover.warrantyDocument` | Warranty document (optional) | ????? ?????? (???????) |
| `handover.warrantyIssuer` | Issuer | ????? ??????? |
| `handover.warrantyNumber` | Warranty number | ??? ?????? |
| `handover.warrantyStatuses.active` | Active | ???? |
| `handover.warrantyStatuses.expired` | Expired | ????? |
| `handover.warrantyStatuses.void` | Void | ???? |
| `handover.warrantyTitle` | Warranty | ?????? |

### hr

| Catalog key | English | Arabic |
|---|---|---|
| `hr.employees` | Employees | الموظفون |
| `hr.title` | HR | الموارد البشرية |

### hse

| Catalog key | English | Arabic |
|---|---|---|
| `hse.incidents` | Incidents | الحوادث |
| `hse.permits` | Permits to work | تصاريح العمل |
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
| `inventory.title` | Inventory | المخزون |

### legal

| Catalog key | English | Arabic |
|---|---|---|
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
| `navigation.items.agentActivity` | Agent Activity | نشاط الوكلاء |
| `navigation.items.approvals` | Approvals | الموافقات |
| `navigation.items.assets` | Equipment | المعدات |
| `navigation.items.clients` | Clients | العملاء |
| `navigation.items.dashboard` | Dashboard | لوحة التحكم |
| `navigation.items.expenses` | Expenses | المصروفات |
| `navigation.items.hr` | HR | الموارد البشرية |
| `navigation.items.inventory` | Inventory | المخزون |
| `navigation.items.invoices` | Invoices & Payments | الفواتير والمدفوعات |
| `navigation.items.legal` | Legal | القسم القانوني |
| `navigation.items.myActions` | My Actions | مهامي |
| `navigation.items.procurementComparison` | Procurement comparison | مقارنة المشتريات |
| `navigation.items.projects` | Projects | المشاريع |
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

### payroll

| Catalog key | English | Arabic |
|---|---|---|
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
| `portals.review.rfiCostImpact` | Estimated cost {{amount}} | ??????? ??????? {{amount}} |
| `portals.review.rfiLocation` | Location #{{id}} | ?????? ??? {{id}} |
| `portals.review.rfiScheduleImpact` | Schedule impact {{days}} days | ??? ?????? {{days}} ????? |
| `portals.review.rfiWorkPackage` | Work package #{{id}} | ???? ????? ??? {{id}} |
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
| `procurement.comparison.recommendation` | Recommended: {{supplier}} — {{reason}} | المورد الموصى به: {{supplier}} — {{reason}} |
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
| `projectWizard.title` | New project setup | إعداد مشروع جديد |

### projects

| Catalog key | English | Arabic |
|---|---|---|
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
| `qhse.title` | Quality & HSE | الجودة والسلامة |

### reports

| Catalog key | English | Arabic |
|---|---|---|
| `reports.empty` | No reports available. | لا توجد تقارير متاحة. |
| `reports.title` | Reports | التقارير |

### schedule

| Catalog key | English | Arabic |
|---|---|---|
| `schedule.activities` | Activities | الأنشطة |
| `schedule.activityBudget` | Activity budget | ميزانية النشاط |
| `schedule.actualProgress` | Actual progress | التقدم الفعلي |
| `schedule.addAssignment` | Add assignment | ????? ????? |
| `schedule.allocationPercent` | Allocation (%) | ???? ??????? |
| `schedule.assignResources` | Assign resources | ????? ??????? |
| `schedule.assignedFrom` | Assigned from | ????? ??????? |
| `schedule.assignedTo` | Assigned to | ????? ??????? |
| `schedule.assignmentNotes` | Assignment notes | ??????? ??????? |
| `schedule.assignmentStatus` | Assignment status | ???? ??????? |
| `schedule.assignmentStatuses.active` | Active | ??? |
| `schedule.assignmentStatuses.cancelled` | Cancelled | ???? |
| `schedule.assignmentStatuses.completed` | Completed | ????? |
| `schedule.assignmentStatuses.planned` | Planned | ???? |
| `schedule.budgetAtCompletion` | Budget at completion | الميزانية عند الإكمال |
| `schedule.budgetAtCompletionHelp` | Enter the approved activity budget. This value is captured in the next baseline and supports financial SPI and CPI. | أدخل ميزانية النشاط المعتمدة. تُحفظ هذه القيمة في خط الأساس التالي وتدعم مؤشري أداء الجدول والتكلفة. |
| `schedule.budgetSaveFailed` | The activity budget could not be saved. | تعذر حفظ ميزانية النشاط. |
| `schedule.cancelAssignment` | Cancel | ????? |
| `schedule.completeAssignment` | Complete | ????? |
| `schedule.cpi` | Cost performance index (CPI) | مؤشر أداء التكلفة (CPI) |
| `schedule.cpiStatus.activity_budgets_required` | Set a budget for every work activity, then capture a new baseline. | حدّد ميزانية لكل نشاط عمل ثم سجّل خط أساس جديداً. |
| `schedule.cpiStatus.actual_cost_required` | Project actual cost must be greater than zero to calculate CPI. | يجب أن تكون التكلفة الفعلية للمشروع أكبر من صفر لحساب المؤشر. |
| `schedule.cpiStatus.baseline_required` | Capture a current schedule baseline to calculate CPI. | سجّل خط أساس حالي للجدول لحساب المؤشر. |
| `schedule.cpiStatus.ready` | Calculated from baseline activity budgets and project actual cost. | محسوب من ميزانيات الأنشطة في خط الأساس والتكلفة الفعلية للمشروع. |
| `schedule.criticalPath` | Critical path | ?????? ????? |
| `schedule.dailyAllocation` | Daily allocation | التخصيص اليومي |
| `schedule.dataDate` | Data date | ????? ?????? |
| `schedule.employee` | Employee | ???? |
| `schedule.equipment` | Equipment | ????? |
| `schedule.history` | History | ????? |
| `schedule.invalidAssignment` | Check the resource and assignment dates. | ???? ?? ?????? ??????? ???????. |
| `schedule.loadDate` | Date | التاريخ |
| `schedule.noAssignments` | No resources assigned to this activity. | ?? ???? ????? ????? ???? ??????. |
| `schedule.noProgressHistory` | No progress updates yet | ?? ???? ??????? ?????? ??? |
| `schedule.noResourceLoad` | No planned or active resource assignments in this date range. | لا توجد تعيينات موارد مخططة أو نشطة خلال هذه الفترة. |
| `schedule.noResources` | No active project employees or registered assets are available. | ?? ???? ?????? ??????? ?? ???? ????? ????? ?? ???????. |
| `schedule.percentComplete` | Percent complete | ???? ??????? |
| `schedule.plannedProgress` | Planned progress | التقدم المخطط |
| `schedule.progressHistory` | Progress history | ??? ?????? |
| `schedule.progressNotes` | Notes | ??????? |
| `schedule.recordProgress` | Record progress | ??? ?????? |
| `schedule.resource` | Resource | ?????? |
| `schedule.resourceAssignments` | Resource assignments | ??????? ??????? |
| `schedule.resourceLoad` | Resource load | تحميل الموارد |
| `schedule.resourceLoadFailed` | Resource loading could not be retrieved. | تعذر تحميل بيانات الموارد. |
| `schedule.resourceOverlap` | This resource is already assigned to another activity during these dates. | ?? ????? ??? ?????? ????? ??? ???? ??? ?????. |
| `schedule.resourceProjectMismatch` | Choose a resource assigned to this project for the full assignment period. | ???? ?????? ??????? ???? ??????? ???? ??? ???????. |
| `schedule.scheduleVariance` | Schedule variance | انحراف الجدول |
| `schedule.selectResource` | Select a project resource | ???? ?????? ??????? ?? ??????? |
| `schedule.startAssignment` | Start | ??? |
| `schedule.title` | Schedule | ?????? ?????? |
| `schedule.updateProgress` | Update progress | ????? ?????? |

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
| `site.title` | Site management | إدارة الموقع |

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
| `suppliers.title` | Suppliers | الموردين |

### workorders

| Catalog key | English | Arabic |
|---|---|---|
| `workorders.cancel.action` | Cancel work order | إلغاء أمر العمل |
| `workorders.cancel.confirm` | Cancel work order | إلغاء أمر العمل |
| `workorders.cancel.message` | {title} will be marked cancelled. Its materials, labor and completions are kept for the cost record. | سيتم وسم {title} كملغى. تُحفظ المواد والعمالة والإنجازات المرتبطة به ضمن سجل التكلفة. |
| `workorders.cancel.title` | Cancel work order | إلغاء أمر العمل |
| `workorders.empty` | No work orders yet. | لا توجد أوامر عمل بعد. |
| `workorders.title` | Work orders | أوامر العمل |
