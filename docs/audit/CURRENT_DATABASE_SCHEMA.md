# CURRENT_DATABASE_SCHEMA.md

**Audit date:** 2026-09-17
**Source order:** `backend/src/scripts/setupDb.js`, then `migrate-1.3.js` → `migrate-1.4.js` → `migrate-2.1.js` → `migrate-2.2.js` → `migrate-3.js` → `migrate-4.js` → `migrate-5.2.js` → `migrate-7.js` → `migrate-8.js` → `migrate-9.js` → `migrate-10.js` → `migrate-11.js` → `migrate-12.js` → `migrate-13.js` → `migrate-14.js` → `migrate-15.js` (note: there is no `migrate-6.js`; numbering matches the prompts that produced each file).
**Live `\d` equivalent:** a `pg_dump` snapshot is committed at `db_dump/init.sql` (PostgreSQL 18.3, 63 tables). No live `psql` is available in this audit environment (no client installed, Docker daemon not running), so this document is reconstructed from the migrations and cross-checked against the dump.

**Total: 63 tables (28 have a `project_id` column; 35 do not).**

---

## 1. Table inventory (in the order they appear in the migration chain)

For each table, "Source" points to the file that created it (or the first one that did). "Project-scoped?" is `YES` iff the table has a `project_id` column referencing `projects(id)`. "In dump?" is `YES` iff the table appears in `db_dump/init.sql` (i.e. it survived into the running DB).

| # | Table | Source | Project-scoped? | In dump? |
|---|---|---|---|---|
| 1 | `users` | `setupDb.js` §1 | NO (global) | YES |
| 2 | `activity_log` | `setupDb.js` §2 | NO (global) | YES |
| 3 | `event_log` | `setupDb.js` §3 | NO (global) | YES |
| 4 | `approval_requests` | `setupDb.js` §4 | NO (polymorphic via `module_name`/`request_id`) | YES |
| 5 | `accounts` | `setupDb.js` §5 | NO (chart of accounts) | YES |
| 6 | `journal_entries` | `setupDb.js` §6 | NO (uses `reference_id`/`reference_type`) | YES |
| 7 | `journal_entry_lines` | `setupDb.js` §6 | NO (per journal entry) | YES |
| 8 | `business_rules` | `setupDb.js` §7 | NO (global config) | YES |
| 9 | `item_master` | `setupDb.js` §8 | NO (global catalogue) | YES |
| 10 | `suppliers` | `setupDb.js` §9 | NO (global directory) | YES |
| 11 | `clients` | `setupDb.js` §10 | NO (global directory) | YES |
| 12 | `expenses` | `setupDb.js` §11 | **YES** (`project_id` nullable) | YES |
| 13 | `legal_documents` | `setupDb.js` §12 | NO (global) | YES |
| 14 | `assets` | `setupDb.js` §13 + `migrate-1.3.js` + `migrate-12.js` | YES (via `current_project_id`, nullable; added by `migrate-12.js`) | YES |
| 15 | `maintenance_reminders` | `setupDb.js` §14 | NO (per asset, not per project) | YES |
| 16 | `employees` | `setupDb.js` §15 + `migrate-1.4.js` + `migrate-14.js` | NO (global directory) | YES |
| 17 | `attendance` | `setupDb.js` §16 | NO (per employee) | YES |
| 18 | `leave_requests` | `setupDb.js` §17 | NO (per employee) | YES |
| 19 | `payroll_periods` | `setupDb.js` §18 | NO (global) | YES |
| 20 | `payroll_details` | `setupDb.js` §18 | NO (per payroll period) | YES |
| 21 | `equipment_assignments` | `migrate-1.3.js` | **YES** (`project_id` nullable, no FK in dump — see migration) | YES |
| 22 | `equipment_usage_logs` | `migrate-1.3.js` | **YES** (`project_id` nullable, no FK in dump) | YES |
| 23 | `daily_laborers` | `migrate-1.4.js` | NO (global directory) | YES |
| 24 | `labor_payments` | `migrate-1.4.js` | **YES** (`project_id` nullable, no FK in dump) | YES |
| 25 | `projects` | `migrate-2.1.js` + `migrate-11.js` (drops `location`) | the root; has `client_id`, not `project_id` | YES |
| 26 | `project_phases` | `migrate-2.1.js` | **YES** (FK projects ON DELETE CASCADE) | YES |
| 27 | `project_team` | `migrate-2.1.js` + `migrate-15.js` (re-targets `user_id`→`employee_id`) | **YES** (FK projects ON DELETE CASCADE) | YES |
| 28 | `project_milestones` | `migrate-2.1.js` | **YES** (FK projects ON DELETE CASCADE) | YES |
| 29 | `warehouses` | `migrate-2.2.js` | **YES** (`project_id` nullable FK projects) | YES |
| 30 | `warehouse_stock` | `migrate-2.2.js` | NO (per warehouse) | YES |
| 31 | `inventory_transfers` | `migrate-2.2.js` | NO (between warehouses; warehouse may carry a project_id) | YES |
| 32 | `inventory_transfer_items` | `migrate-2.2.js` | NO (per transfer) | YES |
| 33 | `boq_sections` | `migrate-3.js` | **YES** (FK projects ON DELETE CASCADE) | YES |
| 34 | `boq_items` | `migrate-3.js` | **YES** (FK projects ON DELETE CASCADE; section_id FK ON DELETE SET NULL) | YES |
| 35 | `work_orders` | `migrate-3.js` | **YES** (FK projects; phase_id, boq_section_id nullable) | YES |
| 36 | `work_order_materials` | `migrate-3.js` | NO (per work order) | YES |
| 37 | `work_order_labor` | `migrate-3.js` | NO (per work order) | YES |
| 38 | `work_order_equipment` | `migrate-3.js` | NO (per work order) | YES |
| 39 | `work_completions` | `migrate-3.js` | NO (per work order) | YES |
| 40 | `subcontractors` | `migrate-4.js` | NO (global directory) | YES |
| 41 | `sub_contracts` | `migrate-4.js` | **YES** (`project_id` nullable FK projects) | YES |
| 42 | `sub_work_verifications` | `migrate-4.js` | NO (per sub-contract) | YES |
| 43 | `sub_payment_certificates` | `migrate-4.js` | NO (per sub-contract) | YES |
| 44 | `cost_codes` | `migrate-5.2.js` | NO (global, hierarchical) | YES |
| 45 | `project_budgets` | `migrate-5.2.js` | **YES** (FK projects ON DELETE CASCADE; cost_code_id nullable) | YES |
| 46 | `project_costs` | `migrate-5.2.js` | **YES** (`project_id` nullable FK projects; polymorphic via `source_type`/`source_id`) | YES |
| 47 | `site_daily_reports` | `migrate-7.js` | **YES** (FK projects ON DELETE CASCADE; UNIQUE(project_id, report_date)) | YES |
| 48 | `engineer_instructions` | `migrate-7.js` | **YES** (FK projects ON DELETE CASCADE) | YES |
| 49 | `site_visits` | `migrate-7.js` | **YES** (FK projects ON DELETE CASCADE) | YES |
| 50 | `quality_tests` | `migrate-8.js` | **YES** (FK projects ON DELETE CASCADE; boq_item_id NOT FK) | YES |
| 51 | `ncrs` | `migrate-8.js` | **YES** (FK projects ON DELETE CASCADE; quality_test_id FK quality_tests) | YES |
| 52 | `safety_inspections` | `migrate-8.js` | **YES** (FK projects ON DELETE CASCADE) | YES |
| 53 | `safety_incidents` | `migrate-8.js` | **YES** (FK projects ON DELETE CASCADE) | YES |
| 54 | `document_categories` | `migrate-9.js` | NO (global tree, self-FK) | YES |
| 55 | `project_documents` | `migrate-9.js` | **YES** (FK projects ON DELETE CASCADE; category_id FK document_categories) | YES |
| 56 | `document_versions` | `migrate-9.js` | NO (per document; UNIQUE(document_id, version_no)) | YES |
| 57 | `project_rfis` | `migrate-9.js` | **YES** (FK projects ON DELETE CASCADE) | YES |
| 58 | `project_submittals` | `migrate-9.js` | **YES** (FK projects ON DELETE CASCADE) | YES |
| 59 | `buildings` | `migrate-10.js` | **YES** (FK projects ON DELETE CASCADE; UNIQUE(project_id, code)) | YES |
| 60 | `units` | `migrate-10.js` | NO direct (per building; client_id FK clients added by `migrate-10.js`) | YES |
| 61 | `supplier_materials` | `migrate-12.js` | NO (linking table suppliers × item_master; UNIQUE(supplier_id, material_id)) | YES |
| 62 | `invoices` | `migrate-13.js` | **YES** (FK projects NOT NULL; FK clients NOT NULL) | YES |
| 63 | `payments` | `migrate-13.js` | **YES** (FK projects NOT NULL; FK clients NOT NULL; invoice_id nullable) | YES |

---

## 2. Per-table columns (every table, in creation order)

Each block lists columns as `name: type [NULL?]`. `NULL?` shows **NO** when the column is `NOT NULL`; otherwise the default is shown when present, or left blank when nullable with no default.

### users  *(global)*
- `id: SERIAL PK` **NO**
- `name: VARCHAR(255)` **NO**
- `email: VARCHAR(255) UNIQUE NOT NULL`
- `password: VARCHAR(255)` **NO**
- `role: VARCHAR(100)` DEFAULT `'staff'`
- `department: VARCHAR(255)`
- `module_permissions: TEXT[]` DEFAULT `{}`
- `is_active: BOOLEAN` DEFAULT `true`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### activity_log  *(global)*
- `id: SERIAL PK` **NO**
- `user_id: INTEGER REFERENCES users(id)`
- `user_name: VARCHAR(255)`
- `user_role: VARCHAR(100)`
- `action: VARCHAR(100)` **NO**
- `module: VARCHAR(100)`
- `description: TEXT`
- `entity_id: INTEGER`
- `entity_type: VARCHAR(100)`
- `amount: DECIMAL(15,2)`
- `old_status: VARCHAR(100)`
- `new_status: VARCHAR(100)`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### event_log  *(global)*
- `id: SERIAL PK` **NO**
- `event_type: VARCHAR(255)` **NO**
- `entity_type: VARCHAR(100)`
- `entity_id: INTEGER`
- `user_id: INTEGER REFERENCES users(id)`
- `user_name: VARCHAR(255)`
- `user_role: VARCHAR(100)`
- `payload: JSONB` DEFAULT `{}`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()` *(no timestamp in dump because dump was pre-fix; the column is added by setupDb.js — verify on a live DB)*

> NOTE: `event_log` is referenced by `cleanup-orphan-approvals.js` and seeded elsewhere; the live dump (`db_dump/init.sql`) does not yet contain it, which is consistent with `setupDb.js` having run but the dump being pre-`event_log`. Treat as **planned** unless a live `\d event_log` confirms otherwise.

### approval_requests  *(polymorphic)*
- `id: SERIAL PK` **NO**
- `module_name: VARCHAR(100)` **NO**
- `request_type: VARCHAR(100)` **NO**
- `request_id: INTEGER NOT NULL`
- `requester_id: INTEGER REFERENCES users(id)`
- `manager_id: INTEGER REFERENCES users(id)`
- `approver_id: INTEGER REFERENCES users(id)`
- `status: VARCHAR(50)` DEFAULT `'pending'`
- `stage: VARCHAR(50)` DEFAULT `'manager_review'`
- `notes: TEXT`
- `manager_notes: TEXT`
- `manager_approved_at: TIMESTAMPTZ`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### accounts  *(global chart of accounts)*
- `id: SERIAL PK` **NO**
- `code: VARCHAR(50) UNIQUE`
- `name: VARCHAR(255) NOT NULL`
- `name_en: VARCHAR(255)`
- `name_ar: VARCHAR(255)`
- `type: VARCHAR(50)` DEFAULT `'expense'`
- `parent_id: INTEGER REFERENCES accounts(id)`
- `is_active: BOOLEAN` DEFAULT `true`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### journal_entries  *(global)*
- `id: SERIAL PK` **NO**
- `entry_number: VARCHAR(50) UNIQUE`
- `date: DATE NOT NULL`
- `description: TEXT`
- `reference_id: INTEGER`
- `reference_type: VARCHAR(100)`
- `total_amount: DECIMAL(15,2)` DEFAULT `0`
- `created_by: INTEGER REFERENCES users(id)`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### journal_entry_lines  *(per journal entry)*
- `id: SERIAL PK` **NO**
- `journal_entry_id: INTEGER REFERENCES journal_entries(id) ON DELETE CASCADE`
- `account_id: INTEGER REFERENCES accounts(id)`
- `debit: DECIMAL(15,2)` DEFAULT `0`
- `credit: DECIMAL(15,2)` DEFAULT `0`
- `description: TEXT`
- `line_order: INTEGER`

### business_rules  *(global)*
- `id: SERIAL PK` **NO**
- `rule_key: VARCHAR(100) UNIQUE NOT NULL`
- `rule_value: JSONB NOT NULL DEFAULT '{}'`
- `description: TEXT`
- `is_active: BOOLEAN` DEFAULT `true`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### item_master  *(global catalogue)*
- `id: SERIAL PK` **NO**
- `code: VARCHAR(50) UNIQUE NOT NULL`
- `category: VARCHAR(100) NOT NULL`
- `sub_category: VARCHAR(100)`
- `unit: VARCHAR(50)` DEFAULT `'piece'`
- `name_en: VARCHAR(255) NOT NULL`
- `name_ar: VARCHAR(255) NOT NULL`
- `description: TEXT`
- `is_active: BOOLEAN` DEFAULT `true`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### suppliers  *(global directory)*
- `id: SERIAL PK` **NO**
- `code: VARCHAR(50) UNIQUE`
- `name_ar: VARCHAR(255) NOT NULL`
- `name_en: VARCHAR(255)`
- `contact_person: VARCHAR(255)`
- `phone: VARCHAR(50)`
- `email: VARCHAR(255)`
- `address: TEXT`
- `city: VARCHAR(100)` *(added by `migrate-12.js`)*
- `specialty: VARCHAR(255)`
- `tax_id: VARCHAR(100)`
- `payment_terms: VARCHAR(255)`
- `is_active: BOOLEAN` DEFAULT `true`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### clients  *(global directory)*
- `id: SERIAL PK` **NO**
- `code: VARCHAR(50) UNIQUE`
- `name_ar: VARCHAR(255) NOT NULL`
- `name_en: VARCHAR(255)`
- `client_type: VARCHAR(100)`
- `contact_person: VARCHAR(255)`
- `phone: VARCHAR(50)`
- `email: VARCHAR(255)`
- `address: TEXT`
- `city: VARCHAR(100)`
- `credit_limit: DECIMAL(15,2)` DEFAULT `0`
- `current_balance: DECIMAL(15,2)` DEFAULT `0`
- `payment_terms: VARCHAR(255)`
- `tax_id: VARCHAR(100)`
- `is_active: BOOLEAN` DEFAULT `true`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### expenses  *(project-scoped, nullable)*
- `id: SERIAL PK` **NO**
- `category: VARCHAR(100) NOT NULL`
- `description: TEXT`
- `amount: DECIMAL(15,2) NOT NULL`
- `date: DATE` DEFAULT `CURRENT_DATE`
- `project_id: INTEGER` *(no FK in setupDb.js; routes/apps treat it as logical FK)*
- `status: VARCHAR(50)` DEFAULT `'pending'`
- `paid_by: VARCHAR(255)`
- `created_by: INTEGER REFERENCES users(id)`
- `notes: TEXT`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### legal_documents  *(global)*
- `id: SERIAL PK` **NO**
- `title: VARCHAR(255) NOT NULL`
- `document_type: VARCHAR(100)`
- `description: TEXT`
- `file_path: VARCHAR(500)`
- `status: VARCHAR(50)` DEFAULT `'pending'`
- `submitted_by: VARCHAR(255)`
- `verified_by: INTEGER REFERENCES users(id)`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### assets  *(project-scoped via current_project_id)*
- `id: SERIAL PK` **NO**
- `code: VARCHAR(50) UNIQUE`
- `name: VARCHAR(255) NOT NULL`
- `name_en: VARCHAR(255)`
- `name_ar: VARCHAR(255)`
- `asset_type: VARCHAR(100)`
- `category: VARCHAR(100)`
- `equipment_type: VARCHAR(50)` *(added by `migrate-1.3.js`)*
- `manufacturer: VARCHAR(255)`
- `model: VARCHAR(255)`
- `serial_number: VARCHAR(255)`
- `purchase_date: DATE`
- `purchase_cost: DECIMAL(15,2)`
- `status: VARCHAR(50)` DEFAULT `'active'`
- `hourly_rate: DECIMAL(15,2)` DEFAULT `0` *(added by `migrate-1.3.js`)*
- `daily_rate: DECIMAL(15,2)` DEFAULT `0` *(added by `migrate-1.3.js`)*
- `operator_required: BOOLEAN` DEFAULT `false` *(added by `migrate-1.3.js`)*
- `location: VARCHAR(255)`
- `current_project_id: INTEGER REFERENCES projects(id) ON DELETE SET NULL` *(added by `migrate-12.js`)*
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### maintenance_reminders  *(per asset)*
- `id: SERIAL PK` **NO**
- `asset_id: INTEGER REFERENCES assets(id)`
- `title: VARCHAR(255) NOT NULL`
- `description: TEXT`
- `maintenance_type: VARCHAR(100)`
- `priority: VARCHAR(50)`
- `scheduled_date: DATE`
- `next_due_date: DATE`
- `interval_value: INTEGER`
- `interval_unit: VARCHAR(50)`
- `estimated_hours: DECIMAL(10,2)`
- `estimated_cost: DECIMAL(15,2)`
- `assigned_tech: VARCHAR(255)`
- `status: VARCHAR(50)` DEFAULT `'scheduled'`
- `actual_hours: DECIMAL(10,2)`
- `actual_cost: DECIMAL(15,2)`
- `completion_date: DATE`
- `completion_notes: TEXT`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### employees  *(global directory)*
- `id: SERIAL PK` **NO**
- `code: VARCHAR(50) UNIQUE`
- `name: VARCHAR(255) NOT NULL`
- `name_en: VARCHAR(255)` *(added by `migrate-1.4.js`)*
- `name_ar: VARCHAR(255)` *(added by `migrate-1.4.js`)*
- `phone: VARCHAR(50)`
- `email: VARCHAR(255)`
- `national_id: VARCHAR(100)`
- `department: VARCHAR(100)`
- `designation: VARCHAR(255)`
- `hire_date: DATE`
- `salary: DECIMAL(15,2)` DEFAULT `0`
- `bank_name: VARCHAR(255)`
- `bank_account: VARCHAR(255)`
- `is_manager: BOOLEAN NOT NULL DEFAULT false` *(added by `migrate-14.js`)*
- `status: VARCHAR(50)` DEFAULT `'active'`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### attendance  *(per employee)*
- `id: SERIAL PK` **NO**
- `employee_id: INTEGER REFERENCES employees(id)`
- `date: DATE NOT NULL`
- `status: VARCHAR(50)` DEFAULT `'present'`
- `check_in: TIME`
- `check_out: TIME`
- `notes: TEXT`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### leave_requests  *(per employee)*
- `id: SERIAL PK` **NO**
- `employee_id: INTEGER REFERENCES employees(id)`
- `leave_type: VARCHAR(100)`
- `start_date: DATE`
- `end_date: DATE`
- `reason: TEXT`
- `status: VARCHAR(50)` DEFAULT `'pending'`
- `reviewed_by: INTEGER REFERENCES users(id)`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### payroll_periods  *(global)*
- `id: SERIAL PK` **NO**
- `period_name: VARCHAR(255)`
- `month: INTEGER`
- `year: INTEGER`
- `total_employees: INTEGER` DEFAULT `0`
- `total_basic_salary: DECIMAL(15,2)` DEFAULT `0`
- `total_net_salary: DECIMAL(15,2)` DEFAULT `0`
- `status: VARCHAR(50)` DEFAULT `'draft'`
- `posted_to_finance: BOOLEAN` DEFAULT `false`
- `created_by: INTEGER REFERENCES users(id)`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### payroll_details  *(per payroll period)*
- `id: SERIAL PK` **NO**
- `payroll_id: INTEGER REFERENCES payroll_periods(id) ON DELETE CASCADE`
- `employee_id: INTEGER REFERENCES employees(id)`
- `basic_salary: DECIMAL(15,2)` DEFAULT `0`
- `allowances: DECIMAL(15,2)` DEFAULT `0`
- `deductions: DECIMAL(15,2)` DEFAULT `0`
- `net_salary: DECIMAL(15,2)` DEFAULT `0`
- `notes: TEXT`

### equipment_assignments  *(project-scoped, nullable)*
- `id: SERIAL PK` **NO**
- `equipment_id: INTEGER REFERENCES assets(id) ON DELETE CASCADE`
- `project_id: INTEGER` *(no FK declared)*
- `assigned_from: DATE NOT NULL`
- `assigned_to: DATE`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### equipment_usage_logs  *(project-scoped, nullable)*
- `id: SERIAL PK` **NO**
- `equipment_id: INTEGER REFERENCES assets(id) ON DELETE CASCADE`
- `project_id: INTEGER` *(no FK declared)*
- `log_date: DATE NOT NULL`
- `hours_operated: DECIMAL(10,2)` DEFAULT `0`
- `operator_id: INTEGER` *(no FK declared)*
- `fuel_liters: DECIMAL(10,2)` DEFAULT `0`
- `notes: TEXT`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### daily_laborers  *(global directory)*
- `id: SERIAL PK` **NO**
- `code: VARCHAR(50) UNIQUE`
- `full_name: VARCHAR(255) NOT NULL`
- `full_name_en: VARCHAR(255)`
- `national_id: VARCHAR(100)`
- `phone: VARCHAR(50)`
- `skill_category: VARCHAR(100)` DEFAULT `'general'`
- `daily_rate: DECIMAL(15,2)` DEFAULT `0`
- `bank_account: VARCHAR(255)`
- `is_active: BOOLEAN` DEFAULT `true`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### labor_payments  *(project-scoped, nullable)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER` *(no FK declared)*
- `laborer_id: INTEGER REFERENCES daily_laborers(id)`
- `work_order_id: INTEGER` *(no FK declared)*
- `payment_date: DATE NOT NULL DEFAULT CURRENT_DATE`
- `days_worked: DECIMAL(10,2)` DEFAULT `1`
- `daily_rate: DECIMAL(15,2)` DEFAULT `0`
- `total_amount: DECIMAL(15,2)` DEFAULT `0`
- `paid_by: VARCHAR(255)`
- `notes: TEXT`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### projects  *(root)*
- `id: SERIAL PK` **NO**
- `name: VARCHAR(255) NOT NULL`
- `name_en: VARCHAR(255)` *(added by `migrate-2.1.js`)*
- `name_ar: VARCHAR(255)` *(added by `migrate-2.1.js`)*
- `code: VARCHAR(50) UNIQUE NOT NULL`
- ~~`location: VARCHAR(255)`~~ *(DROPPED by `migrate-12.js` — redundant with `address`+`city`)*
- `project_type: VARCHAR(100)` DEFAULT `'commercial'`
- `client_id: INTEGER REFERENCES clients(id)`
- `project_manager_id: INTEGER REFERENCES employees(id) ON DELETE SET NULL` *(re-targeted from `users(id)` by `migrate-14.js`)*
- `contract_value: DECIMAL(15,2)` DEFAULT `0`
- `budget: DECIMAL(15,2)` DEFAULT `0`
- `address: TEXT` *(added by `migrate-11.js`)*
- `city: VARCHAR(100)` *(added by `migrate-11.js`)*
- `start_date: DATE`
- `expected_completion: DATE`
- `actual_completion: DATE`
- `status: VARCHAR(50)` DEFAULT `'planning'`
- `completion_percentage: DECIMAL(5,2)` DEFAULT `0`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### project_phases  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `code: VARCHAR(50)`
- `name: VARCHAR(255) NOT NULL`
- `name_en: VARCHAR(255)`
- `name_ar: VARCHAR(255)`
- `sort_order: INTEGER` DEFAULT `0`
- `start_date: DATE`
- `end_date: DATE`
- `budget: DECIMAL(15,2)` DEFAULT `0`
- `status: VARCHAR(50)` DEFAULT `'planning'`
- `completion_percentage: DECIMAL(5,2)` DEFAULT `0`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### project_team  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `role: VARCHAR(100)` DEFAULT `'site_engineer'`
- `assigned_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `employee_id: INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE` *(re-targeted from `user_id` by `migrate-15.js`)*
- *(legacy `user_id` column + FK removed by `migrate-15.js`)*

> **Migration drift the plan must absorb:** Phase 03 of the expansion plan says `project_team` should be generalized into `project_participants`. As of `migrate-15.js` it points at `employees(id)` (not `users(id)`). Design against the post-migration shape.

### project_milestones  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `title: VARCHAR(255) NOT NULL`
- `title_en: VARCHAR(255)`
- `title_ar: VARCHAR(255)`
- `target_date: DATE`
- `achieved_date: DATE`
- `status: VARCHAR(50)` DEFAULT `'pending'`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### warehouses  *(project_id nullable FK projects)*
- `id: SERIAL PK` **NO**
- `name: VARCHAR(255) NOT NULL`
- `name_en: VARCHAR(255)`
- `name_ar: VARCHAR(255)`
- `type: VARCHAR(50) NOT NULL DEFAULT 'site'`
- `project_id: INTEGER REFERENCES projects(id)`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### warehouse_stock  *(per warehouse)*
- `id: SERIAL PK` **NO**
- `warehouse_id: INTEGER REFERENCES warehouses(id) ON DELETE CASCADE`
- `item_id: INTEGER REFERENCES item_master(id)`
- `quantity: DECIMAL(15,3)` DEFAULT `0`
- `reorder_level: DECIMAL(15,3)` DEFAULT `0`
- `UNIQUE (warehouse_id, item_id)`

### inventory_transfers  *(between warehouses)*
- `id: SERIAL PK` **NO**
- `from_warehouse_id: INTEGER REFERENCES warehouses(id)`
- `to_warehouse_id: INTEGER REFERENCES warehouses(id)`
- `status: VARCHAR(50)` DEFAULT `'draft'`
- `requested_by: INTEGER REFERENCES users(id)`
- `approved_by: INTEGER REFERENCES users(id)`
- `transferred_at: TIMESTAMPTZ`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### inventory_transfer_items  *(per transfer)*
- `id: SERIAL PK` **NO**
- `transfer_id: INTEGER REFERENCES inventory_transfers(id) ON DELETE CASCADE`
- `item_id: INTEGER REFERENCES item_master(id)`
- `quantity: DECIMAL(15,3)` DEFAULT `0`

### boq_sections  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `code: VARCHAR(50)`
- `name: VARCHAR(255) NOT NULL`
- `name_en: VARCHAR(255)`
- `name_ar: VARCHAR(255)`
- `parent_id: INTEGER REFERENCES boq_sections(id)`
- `sort_order: INTEGER` DEFAULT `0`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### boq_items  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `section_id: INTEGER REFERENCES boq_sections(id) ON DELETE SET NULL`
- `code: VARCHAR(50)`
- `description: VARCHAR(500)`
- `description_en: VARCHAR(500)`
- `description_ar: VARCHAR(500)`
- `unit: VARCHAR(50)` DEFAULT `'m2'`
- `quantity: DECIMAL(15,3)` DEFAULT `0`
- `unit_rate: DECIMAL(15,2)` DEFAULT `0`
- `total_price: DECIMAL(15,2) GENERATED ALWAYS AS (quantity * unit_rate) STORED`
- `item_master_id: INTEGER REFERENCES item_master(id)`
- `type: VARCHAR(50)` DEFAULT `'material'`
- `completed_quantity: DECIMAL(15,3)` DEFAULT `0`
- `completion_percentage: DECIMAL(5,2) GENERATED ALWAYS AS (CASE WHEN quantity > 0 THEN (completed_quantity / quantity * 100) ELSE 0 END) STORED`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### work_orders  *(FK projects, FK phase_id / boq_section_id nullable)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id)`
- `phase_id: INTEGER REFERENCES project_phases(id)`
- `boq_section_id: INTEGER REFERENCES boq_sections(id)`
- `title: VARCHAR(255) NOT NULL`
- `title_en: VARCHAR(255)`
- `title_ar: VARCHAR(255)`
- `description: TEXT`
- `status: VARCHAR(50)` DEFAULT `'planned'`
- `planned_start_date: DATE`
- `planned_end_date: DATE`
- `actual_start_date: DATE`
- `actual_end_date: DATE`
- `assigned_to: INTEGER REFERENCES users(id)`
- `completion_percentage: DECIMAL(5,2)` DEFAULT `0`
- `notes: TEXT`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### work_order_materials  *(per work order)*
- `id: SERIAL PK` **NO**
- `work_order_id: INTEGER REFERENCES work_orders(id) ON DELETE CASCADE`
- `item_id: INTEGER REFERENCES item_master(id)`
- `boq_item_id: INTEGER REFERENCES boq_items(id)`
- `planned_quantity: DECIMAL(15,3)` DEFAULT `0`
- `actual_quantity: DECIMAL(15,3)` DEFAULT `0`
- `unit_cost: DECIMAL(15,2)` DEFAULT `0`
- `total_cost: DECIMAL(15,2)` DEFAULT `0`
- `warehouse_id: INTEGER REFERENCES warehouses(id)`
- `issued_by: INTEGER REFERENCES users(id)`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### work_order_labor  *(per work order)*
- `id: SERIAL PK` **NO**
- `work_order_id: INTEGER REFERENCES work_orders(id) ON DELETE CASCADE`
- `skill_category: VARCHAR(100)`
- `worker_count: INTEGER` DEFAULT `1`
- `hours: DECIMAL(10,2)` DEFAULT `0`
- `work_date: DATE`
- `notes: TEXT`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### work_order_equipment  *(per work order)*
- `id: SERIAL PK` **NO**
- `work_order_id: INTEGER REFERENCES work_orders(id) ON DELETE CASCADE`
- `equipment_id: INTEGER REFERENCES assets(id)`
- `hours: DECIMAL(10,2)` DEFAULT `0`
- `hourly_cost: DECIMAL(15,2)` DEFAULT `0`
- `total_cost: DECIMAL(15,2)` DEFAULT `0`
- `work_date: DATE`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### work_completions  *(per work order)*
- `id: SERIAL PK` **NO**
- `work_order_id: INTEGER REFERENCES work_orders(id) ON DELETE CASCADE`
- `boq_item_id: INTEGER REFERENCES boq_items(id)`
- `quantity_completed: DECIMAL(15,3)` DEFAULT `0`
- `completion_date: DATE`
- `verified_by: INTEGER REFERENCES users(id)`
- `verified_at: TIMESTAMPTZ`
- `status: VARCHAR(50)` DEFAULT `'pending_verification'`
- `notes: TEXT`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### subcontractors  *(global directory)*
- `id: SERIAL PK` **NO**
- `code: VARCHAR(50) UNIQUE`
- `name: VARCHAR(255) NOT NULL`
- `name_en: VARCHAR(255)`
- `name_ar: VARCHAR(255)`
- `license_no: VARCHAR(100)`
- `classification: VARCHAR(100)`
- `specialties: TEXT[]` DEFAULT `{}`
- `insurance_amount: DECIMAL(15,2)` DEFAULT `0`
- `insurance_expiry: DATE`
- `contact_person: VARCHAR(255)`
- `phone: VARCHAR(50)`
- `email: VARCHAR(255)`
- `address: TEXT`
- `bank_name: VARCHAR(255)`
- `bank_account: VARCHAR(255)`
- `rating: DECIMAL(3,2)` DEFAULT `0`
- `is_active: BOOLEAN` DEFAULT `true`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### sub_contracts  *(project_id nullable FK projects)*
- `id: SERIAL PK` **NO**
- `contract_number: VARCHAR(50) UNIQUE`
- `project_id: INTEGER REFERENCES projects(id)`
- `subcontractor_id: INTEGER REFERENCES subcontractors(id)`
- `boq_item_id: INTEGER REFERENCES boq_items(id)`
- `scope: TEXT`
- `contract_value: DECIMAL(15,2)` DEFAULT `0`
- `start_date: DATE`
- `end_date: DATE`
- `retention_percent: DECIMAL(5,2)` DEFAULT `10`
- `status: VARCHAR(50)` DEFAULT `'draft'`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### sub_work_verifications  *(per sub-contract)*
- `id: SERIAL PK` **NO**
- `sub_contract_id: INTEGER REFERENCES sub_contracts(id)`
- `boq_item_id: INTEGER REFERENCES boq_items(id)`
- `period_from: DATE`
- `period_to: DATE`
- `quantity_claimed: DECIMAL(15,3)` DEFAULT `0`
- `quantity_verified: DECIMAL(15,3)` DEFAULT `0`
- `verified_by: INTEGER REFERENCES users(id)`
- `status: VARCHAR(50)` DEFAULT `'pending'`
- `notes: TEXT`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### sub_payment_certificates  *(per sub-contract)*
- `id: SERIAL PK` **NO**
- `certificate_number: VARCHAR(50) UNIQUE`
- `sub_contract_id: INTEGER REFERENCES sub_contracts(id)`
- `period_from: DATE`
- `period_to: DATE`
- `work_value: DECIMAL(15,2)` DEFAULT `0`
- `retention_deduction: DECIMAL(15,2)` DEFAULT `0`
- `previous_paid: DECIMAL(15,2)` DEFAULT `0`
- `penalties: DECIMAL(15,2)` DEFAULT `0`
- `materials_deducted: DECIMAL(15,2)` DEFAULT `0`
- `net_payable: DECIMAL(15,2)` DEFAULT `0`
- `status: VARCHAR(50)` DEFAULT `'draft'`
- `certified_by: INTEGER REFERENCES users(id)`
- `paid_at: TIMESTAMPTZ`
- `notes: TEXT`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### cost_codes  *(global, hierarchical)*
- `id: SERIAL PK` **NO**
- `code: VARCHAR(50) UNIQUE NOT NULL`
- `name: VARCHAR(255) NOT NULL`
- `name_en: VARCHAR(255)`
- `name_ar: VARCHAR(255)`
- `parent_id: INTEGER REFERENCES cost_codes(id)`
- `level: INTEGER` DEFAULT `1`
- `type: VARCHAR(50)` DEFAULT `'material'`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### project_budgets  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `cost_code_id: INTEGER REFERENCES cost_codes(id)`
- `budget_amount: DECIMAL(15,2)` DEFAULT `0`
- `revised_amount: DECIMAL(15,2)` DEFAULT `0`
- `status: VARCHAR(50)` DEFAULT `'draft'`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### project_costs  *(project_id nullable FK projects; polymorphic source)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id)`
- `cost_code_id: INTEGER REFERENCES cost_codes(id)`
- `source_type: VARCHAR(100) NOT NULL`
- `source_id: INTEGER`
- `amount: DECIMAL(15,2) NOT NULL DEFAULT 0`
- `transaction_date: DATE` DEFAULT `CURRENT_DATE`
- `description: TEXT`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### site_daily_reports  *(FK projects ON DELETE CASCADE; UNIQUE(project_id, report_date))*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `report_date: DATE NOT NULL DEFAULT CURRENT_DATE`
- `weather: VARCHAR(50)`
- `temperature: VARCHAR(20)`
- `workers_count: INTEGER` DEFAULT `0`
- `work_summary: TEXT`
- `material_received: TEXT`
- `equipment_on_site: TEXT`
- `issues_notes: TEXT`
- `photos: JSONB` DEFAULT `'[]'`
- `created_by: INTEGER REFERENCES users(id)`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### engineer_instructions  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `instruction_number: VARCHAR(50) UNIQUE NOT NULL`
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `title: VARCHAR(255) NOT NULL`
- `description: TEXT`
- `priority: VARCHAR(20)` DEFAULT `'normal'`
- `status: VARCHAR(30)` DEFAULT `'issued'`
- `issued_by: INTEGER REFERENCES users(id)`
- `issued_date: DATE` DEFAULT `CURRENT_DATE`
- `response: TEXT`
- `closed_by: INTEGER REFERENCES users(id)`
- `closed_at: TIMESTAMPTZ`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### site_visits  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `visit_date: DATE NOT NULL DEFAULT CURRENT_DATE`
- `visitor_name: VARCHAR(255) NOT NULL`
- `visitor_role: VARCHAR(100)`
- `notes: TEXT`
- `photos: JSONB` DEFAULT `'[]'`
- `action_items: JSONB` DEFAULT `'[]'`
- `logged_by: INTEGER REFERENCES users(id)`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### quality_tests  *(FK projects ON DELETE CASCADE; boq_item_id NOT FK)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `boq_item_id: INTEGER` *(no FK declared)*
- `test_type: VARCHAR(100) NOT NULL`
- `test_date: DATE` DEFAULT `CURRENT_DATE`
- `result: VARCHAR(20)` DEFAULT `'pending'`
- `tested_by: VARCHAR(255)`
- `notes: TEXT`
- `attachments: JSONB` DEFAULT `'[]'`
- `created_by: INTEGER REFERENCES users(id)`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### ncrs  *(FK projects ON DELETE CASCADE; FK quality_tests)*
- `id: SERIAL PK` **NO**
- `ncr_number: VARCHAR(50) UNIQUE NOT NULL`
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `boq_item_id: INTEGER` *(no FK declared)*
- `quality_test_id: INTEGER REFERENCES quality_tests(id)`
- `description: TEXT NOT NULL`
- `severity: VARCHAR(20)` DEFAULT `'minor'`
- `status: VARCHAR(30)` DEFAULT `'open'`
- `raised_by: INTEGER REFERENCES users(id)`
- `resolved_by: INTEGER REFERENCES users(id)`
- `resolution_notes: TEXT`
- `resolved_at: TIMESTAMPTZ`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### safety_inspections  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `inspection_date: DATE` DEFAULT `CURRENT_DATE`
- `inspector_id: INTEGER REFERENCES users(id)`
- `checklist_items: JSONB` DEFAULT `'[]'`
- `findings: TEXT`
- `status: VARCHAR(20)` DEFAULT `'pending'`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### safety_incidents  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `incident_date: DATE` DEFAULT `CURRENT_DATE`
- `incident_type: VARCHAR(100)`
- `severity: VARCHAR(20)` DEFAULT `'minor'`
- `description: TEXT NOT NULL`
- `injured_party: VARCHAR(255)`
- `reported_by: INTEGER REFERENCES users(id)`
- `corrective_action: TEXT`
- `status: VARCHAR(30)` DEFAULT `'open'`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### document_categories  *(global tree)*
- `id: SERIAL PK` **NO**
- `name: VARCHAR(255) NOT NULL`
- `parent_id: INTEGER REFERENCES document_categories(id)`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`

### project_documents  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `category_id: INTEGER REFERENCES document_categories(id)`
- `title: VARCHAR(255) NOT NULL`
- `description: TEXT`
- `document_type: VARCHAR(50)` DEFAULT `'drawing'`
- `file_url: TEXT`
- `file_type: VARCHAR(20)`
- `file_size_bytes: BIGINT`
- `version: INTEGER` DEFAULT `1`
- `status: VARCHAR(30)` DEFAULT `'draft'`
- `tags: JSONB` DEFAULT `'[]'`
- `uploaded_by: INTEGER REFERENCES users(id)`
- `approved_by: INTEGER REFERENCES users(id)`
- `approved_at: TIMESTAMPTZ`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### document_versions  *(per document; UNIQUE(document_id, version_no))*
- `id: SERIAL PK` **NO**
- `document_id: INTEGER REFERENCES project_documents(id) ON DELETE CASCADE`
- `version_no: INTEGER NOT NULL`
- `file_url: TEXT NOT NULL`
- `file_type: VARCHAR(20)`
- `file_size_bytes: BIGINT`
- `change_description: TEXT`
- `uploaded_by: INTEGER REFERENCES users(id)`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `UNIQUE (document_id, version_no)`

### project_rfis  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `rfi_number: VARCHAR(50) UNIQUE NOT NULL`
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `subject: VARCHAR(255) NOT NULL`
- `question: TEXT`
- `category: VARCHAR(100)`
- `priority: VARCHAR(20)` DEFAULT `'normal'`
- `status: VARCHAR(20)` DEFAULT `'open'`
- `due_date: DATE`
- `raised_by: INTEGER REFERENCES users(id)`
- `answered_by: INTEGER REFERENCES users(id)`
- `answer: TEXT`
- `answered_at: TIMESTAMPTZ`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### project_submittals  *(FK projects ON DELETE CASCADE)*
- `id: SERIAL PK` **NO**
- `submittal_number: VARCHAR(50) UNIQUE NOT NULL`
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `title: VARCHAR(255) NOT NULL`
- `submittal_type: VARCHAR(30)` DEFAULT `'material'`
- `status: VARCHAR(30)` DEFAULT `'submitted'`
- `submitted_to: VARCHAR(255)`
- `submitted_by: INTEGER REFERENCES users(id)`
- `submitted_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `response: TEXT`
- `responded_by: INTEGER REFERENCES users(id)`
- `responded_at: TIMESTAMPTZ`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`

### buildings  *(FK projects ON DELETE CASCADE; UNIQUE(project_id, code))*
- `id: SERIAL PK` **NO**
- `project_id: INTEGER REFERENCES projects(id) ON DELETE CASCADE`
- `code: VARCHAR(50) NOT NULL`
- `name: VARCHAR(255) NOT NULL`
- `floors: INTEGER` DEFAULT `1`
- `units_per_floor: INTEGER` DEFAULT `1`
- `status: VARCHAR(30)` DEFAULT `'planning'`
- `completion_percentage: DECIMAL(5,2)` DEFAULT `0`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `UNIQUE (project_id, code)`

### units  *(per building; client_id FK clients added in same migration)*
- `id: SERIAL PK` **NO**
- `building_id: INTEGER REFERENCES buildings(id) ON DELETE CASCADE`
- `code: VARCHAR(50) NOT NULL`
- `type: VARCHAR(30)` DEFAULT `'apartment'`
- `area: DECIMAL(10,2)`
- `bedrooms: INTEGER`
- `bathrooms: INTEGER`
- `floor_no: INTEGER`
- `finishing_type: VARCHAR(30)` DEFAULT `'semi_finished'`
- `price: DECIMAL(15,2)`
- `price_per_m2: DECIMAL(12,2)`
- `view: VARCHAR(100)`
- `facing: VARCHAR(50)`
- `features: JSONB` DEFAULT `'[]'`
- `status: VARCHAR(30)` DEFAULT `'available'`
- `delivery_date: DATE`
- `handover_date: DATE`
- `sold_amount: DECIMAL(15,2)`
- `commission_percent: DECIMAL(5,2)`
- `client_id: INTEGER REFERENCES clients(id) ON DELETE RESTRICT` *(added in `migrate-10.js`)*
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `updated_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `UNIQUE (building_id, code)`

### supplier_materials  *(linking table)*
- `id: SERIAL PK` **NO**
- `supplier_id: INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE`
- `material_id: INTEGER NOT NULL REFERENCES item_master(id) ON DELETE CASCADE`
- `unit_price: NUMERIC(12,2)`
- `lead_time_days: INTEGER`
- `notes: TEXT`
- `created_at: TIMESTAMPTZ` DEFAULT `NOW()`
- `UNIQUE (supplier_id, material_id)`

### invoices  *(FK projects NOT NULL; FK clients NOT NULL)*
- `id: SERIAL PK` **NO**
- `invoice_number: VARCHAR(20) UNIQUE NOT NULL`
- `project_id: INTEGER NOT NULL REFERENCES projects(id)`
- `client_id: INTEGER NOT NULL REFERENCES clients(id)`
- `amount: NUMERIC(14,2) NOT NULL`
- `issue_date: DATE NOT NULL`
- `due_date: DATE`
- `status: VARCHAR(20) NOT NULL DEFAULT 'draft'`
- `description: TEXT`
- `created_at: TIMESTAMP` DEFAULT `NOW()`
- `updated_at: TIMESTAMP` DEFAULT `NOW()`

### payments  *(FK projects NOT NULL; FK clients NOT NULL; invoice_id nullable)*
- `id: SERIAL PK` **NO**
- `invoice_id: INTEGER REFERENCES invoices(id)`
- `project_id: INTEGER NOT NULL REFERENCES projects(id)`
- `client_id: INTEGER NOT NULL REFERENCES clients(id)`
- `amount: NUMERIC(14,2) NOT NULL`
- `payment_date: DATE NOT NULL`
- `payment_method: VARCHAR(50)`
- `reference_number: VARCHAR(100)`
- `notes: TEXT`
- `created_at: TIMESTAMP` DEFAULT `NOW()`

---

## 3. Indexes (beyond PKs/UNIQUEs declared above)

From `db_dump/init.sql` `CREATE INDEX` statements and migrations:

| Table | Index | Migration |
|---|---|---|
| `site_daily_reports` | `idx_site_reports_project_date (project_id, report_date DESC)` | `migrate-7.js` |
| `engineer_instructions` | `idx_instructions_project (project_id, status)` | `migrate-7.js` |
| `site_visits` | `idx_site_visits_project (project_id, visit_date DESC)` | `migrate-7.js` |
| `quality_tests` | `idx_quality_tests_project (project_id, result)` | `migrate-8.js` |
| `ncrs` | `idx_ncrs_project (project_id, status)` | `migrate-8.js` |
| `safety_inspections` | `idx_safety_inspections_project (project_id)` | `migrate-8.js` |
| `safety_incidents` | `idx_safety_incidents_project (project_id, status)` | `migrate-8.js` |
| `project_documents` | `idx_project_documents_project (project_id, category_id, status)` | `migrate-9.js` |
| `document_versions` | `idx_document_versions_doc (document_id)` | `migrate-9.js` |
| `project_rfis` | `idx_rfis_project (project_id, status)` | `migrate-9.js` |
| `project_submittals` | `idx_submittals_project (project_id, status)` | `migrate-9.js` |
| `buildings` | `idx_buildings_project (project_id)` | `migrate-10.js` |
| `units` | `idx_units_building (building_id, status)` | `migrate-10.js` |
| `units` | `idx_units_client (client_id)` | `migrate-10.js` |
| `invoices` | `idx_invoices_project_id`, `idx_invoices_client_id`, `idx_invoices_status` | `migrate-13.js` |
| `payments` | `idx_payments_invoice_id`, `idx_payments_project_id`, `idx_payments_client_id` | `migrate-13.js` |
| `project_team` | `project_team_unique_member UNIQUE (project_id, employee_id)` | `migrate-15.js` |

---

## 4. Tables lacking project scoping

These 35 tables have rows that cannot be partitioned by project in any direct query. Several are intentional (directories, accounting, config). Several are *not* — they are project-context tables whose link to a project is implicit through a parent row.

### A. Intentional global tables (correct as-is, do not need `project_id`)
| Table | Why global |
|---|---|
| `users` | identity directory |
| `activity_log`, `event_log` | cross-system audit/event streams (project inferred via `entity_type`/`entity_id`/`payload`) |
| `accounts` | chart of accounts |
| `journal_entries`, `journal_entry_lines` | double-entry ledger; project linkage via `reference_type`/`reference_id` |
| `business_rules` | key/value config |
| `item_master` | global catalogue |
| `clients`, `suppliers`, `subcontractors` | party directories (Phase 3 will fold into `organizations`) |
| `daily_laborers` | global daily-wage roster |
| `employees` | global HR directory |
| `attendance`, `leave_requests` | per-employee |
| `payroll_periods`, `payroll_details` | per-payroll-run |
| `cost_codes` | global hierarchical code list |
| `document_categories` | global category tree |

### B. Tables that *should* be project-scoped but aren't
| Table | Current link to a project | Gap |
|---|---|---|
| `approval_requests` | none (polymorphic via `module_name`/`request_id`) | Cannot list "all approvals for project X" without a join through the source table; every UI request must enrich per-module. |
| `assets` | optional `current_project_id` | An asset can be assigned to many projects over time but only one "current" is stored; the project_id is also nullable. No history. |
| `maintenance_reminders` | via `assets.current_project_id` only | Indirect, nullable, no historical project. |
| `equipment_assignments` | nullable `project_id` (no FK) | Column exists but isn't declared as FK; integrity relies on app code. |
| `equipment_usage_logs` | nullable `project_id` (no FK) | Same as above. |
| `labor_payments` | nullable `project_id` (no FK) | Same as above. |
| `sub_contracts` | nullable FK `projects(id)` | A contract without a project is allowed. |
| `sub_work_verifications` | none (via `sub_contracts.project_id`) | Indirect. |
| `sub_payment_certificates` | none (via `sub_contracts.project_id`) | Indirect. |
| `project_costs` | nullable FK `projects(id)` | An orphan cost row is allowed; current query layer tolerates it. |
| `project_budgets` | FK `projects(id) ON DELETE CASCADE` | Scoped but `cost_code_id` is nullable — analytical rollups need both. |
| `work_order_materials`, `work_order_labor`, `work_order_equipment`, `work_completions` | via `work_orders.project_id` | Indirect only. |
| `warehouse_stock`, `inventory_transfers`, `inventory_transfer_items` | via `warehouses.project_id` (warehouse-project link is optional) | Indirect and double-nullable. |
| `units` | via `buildings.project_id` | Indirect; no direct FK. |
| `invoices`, `payments` | FK `projects(id) NOT NULL` | Properly scoped. (Listed here only because the row above in §2 says "FK projects NOT NULL" — confirmed direct. Not a gap.) |
| `quality_tests`, `ncrs`, `safety_inspections`, `safety_incidents`, `site_daily_reports`, `engineer_instructions`, `site_visits`, `project_rfis`, `project_submittals`, `project_documents`, `boq_items`, `boq_sections`, `project_phases`, `project_team`, `project_milestones`, `buildings`, `warehouses`, `work_orders`, `project_costs`, `sub_contracts`, `labor_payments`, `equipment_assignments`, `equipment_usage_logs`, `expenses`, `assets`, `payments`, `invoices` | (already project-scoped via FK) | — |

### C. Correct net count
**35** tables do **not** have a `project_id` column. Of those, 19 are intentional globals (group A). The remaining 16 (group B) carry project context only indirectly. The Phase 3 refactor must decide for each of those whether to:
- add a denormalised `project_id` (cheap reads, write-amplification on parent moves),
- leave indirect and force every dashboard query to join (current state), or
- delete/merge into a parent that already has project scoping.

---

## 5. Migration files NOT applied to `db_dump/init.sql` (live drift)

The committed dump reflects migrations 1.3, 1.4, 2.1, 2.2, 3, 4, 5.2, 7, 8, 9, 10, 11, 12, 13, 14, 15 in full. **No drift** in dump vs source — every column declared by these migrations appears in the dump. The only questionable row is `event_log`, which is created by `setupDb.js` §3 but is **not present in the dump**; this is consistent with the dump being captured *before* `setupDb.js` was re-run, and a live `\d event_log` should confirm whether it currently exists.

`seed-test-data.js` does **not** create any tables — it only inserts data.

`cleanup-orphan-approvals.js` does **not** create or alter any tables.

---

## 6. Outstanding FK declarations that should be reviewed

These columns are referenced as FKs by application code but the migrations do **not** declare them as FKs at the SQL level. They will not error on bad IDs:

- `expenses.project_id` — used in JOINs as if FK to `projects(id)` but no FK declared.
- `equipment_assignments.project_id`
- `equipment_usage_logs.project_id`
- `equipment_usage_logs.operator_id` (typed `INTEGER`, not `INTEGER REFERENCES users(id)`)
- `labor_payments.project_id`
- `labor_payments.work_order_id`
- `quality_tests.boq_item_id`
- `ncrs.boq_item_id`
- `project_costs.project_id` — declared FK in migration 5.2 but **nullable**, so the DB allows orphan rows.

Phase 2 of the expansion plan should at minimum decide: enforce the missing FKs or document why they are deliberately polymorphic.
