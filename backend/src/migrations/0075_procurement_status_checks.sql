-- G1.2 status-vocabulary closeout, batch 1/11: procurement (PR -> RFQ -> PO -> GRN chain).
--
-- Method: grep every INSERT/UPDATE of the status column across backend/src/routes,
-- backend/src/services, backend/src/scripts and backend/src/migrations, plus the workflow
-- engine's catalog (backend/src/scripts/workflow-engine-migration.js, templates 'purchase_requisition'
-- and 'po') and its legacy-parity maps (backend/src/services/workflowEngine.js APPROVED_STATUS /
-- REJECTED_STATUS). Each constraint is added NOT VALID only: existing rows are never checked here,
-- so a stray/legacy value already in a real environment cannot block this migration. An operator
-- validates later, after confirming no row currently violates the constraint, with
-- backend/scripts/validate-status-constraints.sql (see docs/MIGRATIONS.md). The guard below
-- (pg_constraint lookup before ADD CONSTRAINT) matches 0012_check_constraints.sql's own
-- idempotency convention; it does not reuse 0012's helper function because that one auto-validates
-- when no row currently breaks the constraint, which this task's NOT VALID requirement rules out.
--
-- All status columns in this batch are NULLable (checked live on erp_closeout_g12), so each
-- CHECK tolerates NULL explicitly (status IS NULL OR status IN (...)); nothing here assumes NULL
-- never happens.

-- purchase_requests: literal 'draft' on insert (procurementService.js:215); 'submitted' set directly on
-- submit (procurementService.js:251); 'budget_check', 'authority_approval', 'procurement' are the
-- workflow_instances.current_step_key values from the 'purchase_requisition' template
-- (workflow-engine-migration.js:201-209), mirrored onto the row by syncStatusFromWorkflow
-- (procurementService.js:137-151, documentStatusFromWorkflow:130-135); 'rejected' from the same
-- workflow mirror when wf.status = 'rejected'; 'cancelled' from cancelPurchaseRequest
-- (procurementDocuments.js:138).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requests_status_check' AND conrelid = 'purchase_requests'::regclass) THEN
    ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check
      CHECK (status IS NULL OR status IN ('draft', 'submitted', 'budget_check', 'authority_approval', 'procurement', 'rejected', 'cancelled'))
      NOT VALID;
  END IF;
END $$;

-- purchase_orders: 'draft' on insert (procurementService.js:467); 'commercial_procurement_approval',
-- 'financial_authority', 'issued', 'acknowledged', 'partially_fully_delivered', 'closed' are the
-- 'po' workflow template's step keys (workflow-engine-migration.js:212-222), mirrored via
-- syncStatusFromWorkflow; 'partially_delivered' / 'fully_delivered' are the real-quantity refinement of
-- 'partially_fully_delivered' (procurementService.js:189-194, and directly in createDelivery:611-612);
-- 'rejected' from the same workflow mirror; 'cancelled' from cancelPurchaseOrder
-- (procurementDocuments.js:201). 'approved' is reachable through the separate legacy_module_approval
-- path: purchase_orders is in DIRECT_TO_OWNER_MODULES and workflowEngine.js's APPROVED_STATUS /
-- REJECTED_STATUS maps (lines 40, 45, 55) write 'approved'/'rejected' onto purchase_orders for any
-- legacy approval_requests row with module_name = 'purchase_orders' (migrateLegacyApprovals + decision
-- recording) -- included though no *current* route creates a new legacy request for this module.
-- UNCERTAIN: 'confirmed' is never assigned by any write site found (only read in
-- COMMITTED_PO_STATUSES/OPEN_PO_STATUSES/PO_CANCELLABLE filters in procurementService.js,
-- replenishment.js, procurementDocuments.js and financeEngine.js) -- kept per the task's rule to
-- include an uncertain value rather than risk blocking a legitimate write; a human should confirm
-- whether any older code path or external data load still produces it before narrowing this list.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_status_check' AND conrelid = 'purchase_orders'::regclass) THEN
    ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
      CHECK (status IS NULL OR status IN ('draft', 'commercial_procurement_approval', 'financial_authority', 'issued', 'acknowledged',
        'partially_fully_delivered', 'partially_delivered', 'fully_delivered', 'closed', 'rejected', 'cancelled', 'approved', 'confirmed'))
      NOT VALID;
  END IF;
END $$;

-- rfqs: 'draft' on insert (procurementService.js:281); 'awarded' on award (procurementService.js:447).
-- UNCERTAIN: 'closed', 'cancelled', 'void' are checked as terminal/non-open states in submitQuotation's
-- guard (procurementService.js:316: "RFQ is no longer open for quotations") but no write site sets
-- them -- there is no cancel/close route for rfqs in backend/src/routes/procurement.js. Kept per the
-- task's rule since the guard clearly treats them as valid states the schema should allow.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rfqs_status_check' AND conrelid = 'rfqs'::regclass) THEN
    ALTER TABLE rfqs ADD CONSTRAINT rfqs_status_check
      CHECK (status IS NULL OR status IN ('draft', 'awarded', 'closed', 'cancelled', 'void'))
      NOT VALID;
  END IF;
END $$;

-- rfq_vendors: DEFAULT 'invited' on the column itself (procurement-migration.js:72) and the same
-- literal on insert (procurementService.js:302); 'quoted' set in submitQuotation
-- (procurementService.js:366).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rfq_vendors_status_check' AND conrelid = 'rfq_vendors'::regclass) THEN
    ALTER TABLE rfq_vendors ADD CONSTRAINT rfq_vendors_status_check
      CHECK (status IS NULL OR status IN ('invited', 'quoted'))
      NOT VALID;
  END IF;
END $$;

-- supplier_quotations: 'submitted' on insert (procurementService.js:347); 'awarded' /
-- 'not_awarded' set together when an RFQ is awarded (procurementService.js:445-446).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_quotations_status_check' AND conrelid = 'supplier_quotations'::regclass) THEN
    ALTER TABLE supplier_quotations ADD CONSTRAINT supplier_quotations_status_check
      CHECK (status IS NULL OR status IN ('submitted', 'awarded', 'not_awarded'))
      NOT VALID;
  END IF;
END $$;

-- deliveries: 'received' on insert (procurementService.js:570).
-- UNCERTAIN: 'pending' is read in a dashboard aggregate filter (dashboardWidgets.js:305) and
-- 'cancelled' is exercised by a direct-SQL test (batch5a-reconcile.pg.test.js:104), but no app
-- route/service writes either value. Kept per the task's rule rather than risk blocking a
-- legitimate write path this grep missed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_status_check' AND conrelid = 'deliveries'::regclass) THEN
    ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check
      CHECK (status IS NULL OR status IN ('received', 'pending', 'cancelled'))
      NOT VALID;
  END IF;
END $$;

-- goods_receipt_notes: 'posted' on insert (procurementService.js:761; also reconcile-database.js:271
-- and sweep-invariants.js:25 read 'posted' as the completed state). UNCERTAIN: 'approved' /
-- 'rejected' are reachable the same way as purchase_orders' 'approved' above -- grn is in
-- DIRECT_TO_OWNER_MODULES and workflowEngine.js's APPROVED_STATUS/REJECTED_STATUS maps
-- (lines 40, 46, 56) write them for any legacy approval_requests row with module_name = 'grn'; no
-- current route creates a new one, so this is legacy-migration-path only. Kept per the task's rule.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipt_notes_status_check' AND conrelid = 'goods_receipt_notes'::regclass) THEN
    ALTER TABLE goods_receipt_notes ADD CONSTRAINT goods_receipt_notes_status_check
      CHECK (status IS NULL OR status IN ('posted', 'approved', 'rejected'))
      NOT VALID;
  END IF;
END $$;

-- supplier_invoices: 'received' on insert (procurementService.js:930); 'approved' on approval
-- (procurementService.js:789, financeDocuments.js:139); 'paid' once fully settled
-- (financeEngine.js:401, financeDocuments.js:115); reverted back to 'received' if a payment is
-- undone and the balance reopens while still carrying 'paid' (routes/payments.js:163).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_invoices_status_check' AND conrelid = 'supplier_invoices'::regclass) THEN
    ALTER TABLE supplier_invoices ADD CONSTRAINT supplier_invoices_status_check
      CHECK (status IS NULL OR status IN ('received', 'approved', 'paid'))
      NOT VALID;
  END IF;
END $$;

-- supplier_returns: 'returned' on insert (procurementService.js:854); no other write site found.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_returns_status_check' AND conrelid = 'supplier_returns'::regclass) THEN
    ALTER TABLE supplier_returns ADD CONSTRAINT supplier_returns_status_check
      CHECK (status IS NULL OR status IN ('returned'))
      NOT VALID;
  END IF;
END $$;
