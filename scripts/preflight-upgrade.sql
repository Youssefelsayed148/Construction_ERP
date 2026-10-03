-- Preflight for the versioned migrations 0001-0012. READ ONLY: run it against a restored copy of the real
-- database before applying them (psql -X -f scripts/preflight-upgrade.sql <dsn>). It changes nothing.
--
-- Each row is: migration | what it will do to existing rows | how many rows are affected.
-- "will_change" rows are rows a migration will write; "will_stay_invalid" rows are rows that break a
-- constraint the migration adds NOT VALID (the constraint is then enforced for new writes only, and the
-- row has to be fixed by hand: run `npm run data-cleaning-report` in backend/ to list the offending rows; it never fixes anything).
BEGIN READ ONLY;

SELECT migration, effect, kind, affected_rows FROM (
  -- 0001: backfill project_id
  SELECT '0001' AS migration, 'maintenance_reminders.project_id set from the asset''s current project' AS effect, 'will_change' AS kind,
         (SELECT count(*) FROM maintenance_reminders m JOIN assets a ON a.id = m.asset_id
           WHERE m.project_id IS NULL AND a.current_project_id IS NOT NULL) AS affected_rows
  UNION ALL
  SELECT '0001', 'agent_action_requests.project_id set from payload.project_id', 'will_change',
         (SELECT count(*) FROM agent_action_requests r
           WHERE r.project_id IS NULL AND r.payload->>'project_id' ~ '^[0-9]{1,9}$'
             AND EXISTS (SELECT 1 FROM projects p WHERE p.id = (r.payload->>'project_id')::int))
  UNION ALL
  SELECT '0001', 'legal_documents with no project (stay company-wide, not changed)', 'unchanged',
         (SELECT count(*) FROM legal_documents WHERE project_id IS NULL)
  -- 0004: backfill role assignments
  UNION ALL
  SELECT '0004', 'user_project_roles rows inserted (internal users with no assignment get a company-wide row for their role)', 'will_change',
         (SELECT count(*) FROM users u JOIN roles r ON r.key = u.role
           WHERE r.key NOT IN ('consultant','client','subcontractor','supplier')
             AND NOT EXISTS (SELECT 1 FROM user_project_roles x WHERE x.user_id = u.id))
  UNION ALL
  SELECT '0004', 'users whose role key matches no roles row (they get nothing and will be denied)', 'attention',
         (SELECT count(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.key = u.role))
  UNION ALL
  SELECT '0004', 'external users with no project assignment (not backfilled by design; they have no access until assigned)', 'attention',
         (SELECT count(*) FROM users u WHERE u.role IN ('consultant','client','subcontractor','supplier')
            AND NOT EXISTS (SELECT 1 FROM user_project_roles x WHERE x.user_id = u.id))
  -- 0005: document control counters
  UNION ALL
  SELECT '0005', 'document_counters rows upserted from document_number_sequences', 'will_change',
         (SELECT count(*) FROM document_number_sequences)
  -- 0006: role templates
  UNION ALL
  SELECT '0006', 'roles that already use a template key (site_engineer, storekeeper, quantity_surveyor, document_controller, viewer); the role row is kept and the template grants are ADDED to it (nothing is removed)', 'attention',
         (SELECT count(*) FROM roles WHERE key IN ('site_engineer','storekeeper','quantity_surveyor','document_controller','viewer'))
  UNION ALL
  SELECT '0006', 'users already holding one of those role keys (they gain the template grants)', 'attention',
         (SELECT count(*) FROM users WHERE role IN ('site_engineer','storekeeper','quantity_surveyor','document_controller','viewer'))
  -- 0007: inventory integrity
  UNION ALL
  SELECT '0007', 'warehouse_stock rows with a negative bucket (constraint stays NOT VALID)', 'will_stay_invalid',
         (SELECT count(*) FROM warehouse_stock WHERE COALESCE(quantity,0) < 0 OR COALESCE(reserved_quantity,0) < 0 OR COALESCE(quarantined_quantity,0) < 0)
  UNION ALL
  SELECT '0007', 'stock_movements recorded before valuation (stay unvalued, NULL cost; ledger is append-only, no backfill)', 'unchanged',
         (SELECT count(*) FROM stock_movements)
  -- 0008: procurement integrity
  UNION ALL
  SELECT '0008', 'purchase_order_lines breaking delivered>=0, accepted>=0, accepted<=delivered (constraint stays NOT VALID)', 'will_stay_invalid',
         (SELECT count(*) FROM purchase_order_lines
           WHERE COALESCE(delivered_quantity,0) < 0 OR COALESCE(accepted_quantity,0) < 0 OR COALESCE(accepted_quantity,0) > COALESCE(delivered_quantity,0))
  UNION ALL
  SELECT '0008', 'purchase_order_lines already over-delivered past ordered + tolerance (not blocked from unrelated updates)', 'attention',
         (SELECT count(*) FROM purchase_order_lines l JOIN purchase_orders o ON o.id = l.purchase_order_id
           WHERE COALESCE(l.delivered_quantity,0) > ROUND(l.quantity * (1 + COALESCE(o.tolerance_pct,5) / 100), 3))
  -- 0009: additive columns only
  UNION ALL
  SELECT '0009', 'soft delete and void columns added (deleted_at, voided_at, ...); no row is read, rewritten or hidden', 'unchanged',
         (SELECT count(*) FROM item_master) + (SELECT count(*) FROM suppliers) + (SELECT count(*) FROM payments) + (SELECT count(*) FROM invoices)
  -- 0010: foreign keys become RESTRICT; rows are untouched, constraints are replaced
  UNION ALL
  SELECT '0010', 'foreign keys replaced by ON DELETE RESTRICT (constraint rows changed, no data rows); the child table is re-checked once, lock it in a maintenance window if it is large', 'will_change',
         (SELECT count(*) FROM pg_constraint c
           WHERE c.contype = 'f' AND c.confdeltype IN ('c', 'n') AND c.confrelid::regclass::text <> 'users'
             AND c.conrelid::regclass::text = ANY (ARRAY[
               'bid_comparisons','deliveries','delivery_lines','grn_lines','mir_lines','purchase_order_lines','purchase_orders','purchase_request_lines','purchase_requests',
               'rfq_lines','rfq_vendors','supplier_invoice_lines','supplier_invoices','supplier_quotation_lines','supplier_quotations','supplier_return_lines',
               'stock_movements','stock_reservations','warehouse_stock','inventory_transfer_items','advance_ledger','ap_review_queue','budget_changes','commitments',
               'commercial_snapshots','journal_entry_lines','payment_allocations','payment_certificates','payroll_details','project_budgets','receivable_reminders',
               'retention_ledger','variation_cost_buildup','variation_lines','variations','boq_items','boq_sections','boq_location_allocations','client_contracts',
               'contract_lines','engineer_instructions','sub_contract_changes','sub_contract_lines','warranty_claims','quantity_measurements','handover_package_items',
               'handover_processes','work_order_materials','work_order_labor','work_order_equipment','work_completions','payments','invoices','work_orders']))
  UNION ALL
  SELECT '0010', 'rows the old SET NULL links already detached (purchase orders with no supplier, BOQ items with no section): they stay as they are', 'attention',
         (SELECT count(*) FROM purchase_orders WHERE supplier_id IS NULL) + (SELECT count(*) FROM boq_items WHERE section_id IS NULL)
  -- 0011: users are never deleted
  UNION ALL
  SELECT '0011', 'foreign keys to users replaced by ON DELETE RESTRICT (constraint rows changed, no data rows)', 'will_change',
         (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND confrelid = 'users'::regclass AND confdeltype IN ('c', 'n'))
  UNION ALL
  SELECT '0011', 'a trigger now refuses every DELETE on users; any process that deletes users (scripts, manual SQL) must deactivate instead', 'attention',
         (SELECT count(*) FROM users)
  -- 0012: CHECK constraints (added NOT VALID, validated when clean)
  UNION ALL
  SELECT '0012', 'rows with a non-positive quantity on PO, PR, RFQ, delivery or return lines (their constraints stay NOT VALID)', 'will_stay_invalid',
         (SELECT count(*) FROM purchase_order_lines WHERE quantity <= 0) + (SELECT count(*) FROM purchase_request_lines WHERE quantity <= 0)
         + (SELECT count(*) FROM rfq_lines WHERE quantity <= 0) + (SELECT count(*) FROM delivery_lines WHERE quantity <= 0)
         + (SELECT count(*) FROM supplier_return_lines WHERE quantity <= 0)
  UNION ALL
  SELECT '0012', 'invoices or payments with amount <= 0 (constraint stays NOT VALID)', 'will_stay_invalid',
         (SELECT count(*) FROM invoices WHERE amount <= 0) + (SELECT count(*) FROM payments WHERE amount <= 0)
  UNION ALL
  SELECT '0012', 'negative money on PO lines, POs, supplier invoices, expenses or BOQ items (constraints stay NOT VALID)', 'will_stay_invalid',
         (SELECT count(*) FROM purchase_order_lines WHERE unit_rate < 0) + (SELECT count(*) FROM purchase_orders WHERE total_amount < 0)
         + (SELECT count(*) FROM supplier_invoices WHERE total_amount < 0 OR tax_amount < 0) + (SELECT count(*) FROM expenses WHERE amount < 0)
         + (SELECT count(*) FROM boq_items WHERE quantity < 0 OR unit_rate < 0)
  UNION ALL
  SELECT '0012', 'rows whose status is outside the known vocabulary on invoices, work orders, projects, phases, milestones, units, buildings, expenses (constraints stay NOT VALID)', 'will_stay_invalid',
         (SELECT count(*) FROM invoices WHERE status NOT IN ('draft','sent','approved','issued','partially_paid','paid','overdue','cancelled','void','credited'))
         + (SELECT count(*) FROM work_orders WHERE status NOT IN ('planned','in_progress','completed','cancelled'))
         + (SELECT count(*) FROM projects WHERE status NOT IN ('planning','active','on_hold','completed','closed'))
         + (SELECT count(*) FROM project_phases WHERE status NOT IN ('planning','active','completed','on_hold'))
         + (SELECT count(*) FROM project_milestones WHERE status NOT IN ('pending','achieved','delayed'))
         + (SELECT count(*) FROM units WHERE status NOT IN ('available','reserved','contracted','delivered','blocked','closed'))
         + (SELECT count(*) FROM buildings WHERE status NOT IN ('planning','under_construction','completed'))
         + (SELECT count(*) FROM expenses WHERE status NOT IN ('pending','approved','rejected'))
  -- 0013: money standard and unique indexes
  UNION ALL
  SELECT '0013', 'money columns widened to NUMERIC(15,2) (invoices.amount, payments.amount, supplier_materials.unit_price, units.price_per_m2): values unchanged, tables rewritten once', 'will_change',
         (SELECT count(*) FROM invoices) + (SELECT count(*) FROM payments) + (SELECT count(*) FROM supplier_materials) + (SELECT count(*) FROM units)
  UNION ALL
  SELECT '0013', 'records with more than one pending approval request: the migration STOPS until these are resolved by a person', 'attention',
         (SELECT count(*) FROM (SELECT 1 FROM approval_requests WHERE status = 'pending' GROUP BY module_name, request_type, request_id HAVING count(*) > 1) d)
  UNION ALL
  SELECT '0013', 'documents with more than one current version: the migration STOPS until these are resolved by a person', 'attention',
         (SELECT count(*) FROM (SELECT 1 FROM document_versions WHERE is_current GROUP BY document_id HAVING count(*) > 1) d)
  -- 0014: header-only purchase orders and requests get one line
  UNION ALL
  SELECT '0014', 'purchase orders with a header material and no lines: one line row is ADDED per order (header kept)', 'will_change',
         (SELECT count(*) FROM purchase_orders po WHERE po.material_id IS NOT NULL AND po.quantity > 0
            AND NOT EXISTS (SELECT 1 FROM purchase_order_lines l WHERE l.purchase_order_id = po.id))
  UNION ALL
  SELECT '0014', 'purchase requests with a header material and no lines: one line row is ADDED per request (header kept)', 'will_change',
         (SELECT count(*) FROM purchase_requests pr WHERE pr.material_id IS NOT NULL AND pr.quantity > 0
            AND NOT EXISTS (SELECT 1 FROM purchase_request_lines l WHERE l.purchase_request_id = pr.id))
  -- 0015: ledger accounts from configuration, balanced entries
  UNION ALL
  SELECT '0015', 'ledger account keys that will be mapped from the chart by code (cash 1000, receivable 1100, inventory 1200, payable 2000, revenue 4000, salary_expense 5000, material_cost 5100, other_expense 5200); a key with no account of that code stays unmapped and posting needing it fails until an owner maps it', 'will_change',
         (SELECT count(*) FROM accounts WHERE code IN ('1000','1100','1200','2000','4000','5000','5100','5200'))
  UNION ALL
  SELECT '0015', 'existing journal entries whose debits differ from their credits (left as they are; the new trigger only checks entries touched later)', 'attention',
         (SELECT count(*) FROM (SELECT journal_entry_id FROM journal_entry_lines GROUP BY journal_entry_id HAVING COALESCE(SUM(debit), 0) <> COALESCE(SUM(credit), 0)) d)
  UNION ALL
  SELECT '0015', 'journal lines with a negative amount or an amount on both sides (constraint stays NOT VALID)', 'will_stay_invalid',
         (SELECT count(*) FROM journal_entry_lines WHERE COALESCE(debit, 0) < 0 OR COALESCE(credit, 0) < 0 OR (COALESCE(debit, 0) > 0 AND COALESCE(credit, 0) > 0))
  -- 0016: one posting per document, output VAT account
  UNION ALL
  SELECT '0016', 'chart of accounts gets ONE new account (2100 Output VAT Payable, mapped as vat_output) when no account with code 2100 exists; nothing else in the chart changes', 'will_change',
         (SELECT CASE WHEN EXISTS (SELECT 1 FROM accounts WHERE code = '2100') THEN 0 ELSE 1 END)
  UNION ALL
  SELECT '0016', 'invoices already issued (sent, issued, partially_paid, paid, overdue) have no ledger entry and get none: postings start with new issues, no backfill; decide on an opening balance separately', 'attention',
         (SELECT count(*) FROM invoices WHERE status IN ('sent','issued','partially_paid','paid','overdue'))
  -- 0017: approval requests and their workflow instances
  UNION ALL
  SELECT '0017', 'active workflow instances with no legacy_approval_id whose context names a request nobody else claims: they get linked (column NULL -> id)', 'will_change',
         (SELECT count(*) FROM workflow_instances wi
           WHERE wi.legacy_approval_id IS NULL AND wi.context ->> 'legacy_approval_id' ~ '^[0-9]+$'
             AND EXISTS (SELECT 1 FROM approval_requests ar WHERE ar.id = (wi.context ->> 'legacy_approval_id')::integer)
             AND NOT EXISTS (SELECT 1 FROM workflow_instances o WHERE o.legacy_approval_id = (wi.context ->> 'legacy_approval_id')::integer))
  UNION ALL
  SELECT '0017', 'instances with no legacy_approval_id whose request already has a linked twin: stale duplicates, left as they are, a person must cancel them', 'attention',
         (SELECT count(*) FROM workflow_instances wi
           WHERE wi.legacy_approval_id IS NULL AND wi.context ->> 'legacy_approval_id' ~ '^[0-9]+$'
             AND EXISTS (SELECT 1 FROM workflow_instances o WHERE o.legacy_approval_id = (wi.context ->> 'legacy_approval_id')::integer))
  UNION ALL
  SELECT '0017', 'approval requests with more than one linked workflow instance: the migration STOPS until a person resolves these', 'attention',
         (SELECT count(*) FROM (SELECT 1 FROM workflow_instances WHERE legacy_approval_id IS NOT NULL GROUP BY legacy_approval_id HAVING count(*) > 1) d)
) report
ORDER BY migration, kind, effect;

ROLLBACK;
