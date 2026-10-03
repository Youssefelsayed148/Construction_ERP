-- Phase 2.6a: CHECK constraints for quantities, amounts, money and status vocabularies.
--
-- Each constraint is added NOT VALID first (always safe: it is enforced for every new write at once), then
-- validated if no existing row breaks it. If existing rows do break it the constraint stays NOT VALID, the
-- migration prints a NOTICE with the count, and `npm run data-cleaning-report` lists the rows (it never fixes
-- them). Nothing is rewritten, hidden or deleted here.
--
-- Status vocabularies come from the code that writes them (Joi lists and engine constants):
--   invoices      financeEngine.INVOICE_LIFECYCLE plus the legacy 'sent'
--   work_orders   routes/workorders WO_STATUSES
--   projects, project_phases   routes/projects PROJECT_STATUSES, PHASE_STATUSES
--   project_milestones   pending | achieved | delayed
--   units, buildings     routes/units UNIT_STATUSES and the building statuses
--   expenses      pending | approved | rejected (also what the workflow engine writes)
-- Procurement and other workflow tables are not constrained here: their vocabularies are written from several
-- places (workflow engine maps, services) and need a status audit first; see the log.
CREATE FUNCTION pg_temp.add_check(tbl regclass, cname text, expr text) RETURNS void AS $fn$
DECLARE
  bad BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = cname AND conrelid = tbl) THEN
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s) NOT VALID', tbl, cname, expr);
  EXECUTE format('SELECT count(*) FROM %s WHERE NOT (%s)', tbl, expr) INTO bad;
  IF bad = 0 THEN
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', tbl, cname);
  ELSE
    RAISE NOTICE '% left NOT VALID: % existing row(s) break it (new writes are still checked). Run: npm run data-cleaning-report', cname, bad;
  END IF;
END;
$fn$ LANGUAGE plpgsql;

-- Quantities
SELECT pg_temp.add_check('purchase_order_lines',   'purchase_order_lines_quantity_positive',   'quantity > 0');
SELECT pg_temp.add_check('purchase_request_lines', 'purchase_request_lines_quantity_positive', 'quantity > 0');
SELECT pg_temp.add_check('rfq_lines',              'rfq_lines_quantity_positive',              'quantity > 0');
SELECT pg_temp.add_check('delivery_lines',         'delivery_lines_quantity_positive',         'quantity > 0');
SELECT pg_temp.add_check('supplier_return_lines',  'supplier_return_lines_quantity_positive',  'quantity > 0');

-- Amounts
SELECT pg_temp.add_check('invoices', 'invoices_amount_positive', 'amount > 0');
SELECT pg_temp.add_check('payments', 'payments_amount_positive', 'amount > 0');

-- Money is never negative (variations and budget changes can be credits, so they are not constrained)
SELECT pg_temp.add_check('purchase_order_lines', 'purchase_order_lines_unit_rate_nonneg', 'unit_rate >= 0');
SELECT pg_temp.add_check('purchase_orders',      'purchase_orders_total_nonneg',          'total_amount >= 0');
SELECT pg_temp.add_check('supplier_invoices',    'supplier_invoices_total_nonneg',        'total_amount >= 0');
SELECT pg_temp.add_check('supplier_invoices',    'supplier_invoices_tax_nonneg',          'tax_amount >= 0');
SELECT pg_temp.add_check('expenses',             'expenses_amount_nonneg',                'amount >= 0');
SELECT pg_temp.add_check('boq_items',            'boq_items_quantity_nonneg',             'quantity >= 0');
SELECT pg_temp.add_check('boq_items',            'boq_items_unit_rate_nonneg',            'unit_rate >= 0');

-- Status vocabularies
SELECT pg_temp.add_check('invoices', 'invoices_status_known',
  $c$status IN ('draft', 'sent', 'approved', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled', 'void', 'credited')$c$);
SELECT pg_temp.add_check('work_orders', 'work_orders_status_known', $c$status IN ('planned', 'in_progress', 'completed', 'cancelled')$c$);
SELECT pg_temp.add_check('projects', 'projects_status_known', $c$status IN ('planning', 'active', 'on_hold', 'completed', 'closed')$c$);
SELECT pg_temp.add_check('project_phases', 'project_phases_status_known', $c$status IN ('planning', 'active', 'completed', 'on_hold')$c$);
SELECT pg_temp.add_check('project_milestones', 'project_milestones_status_known', $c$status IN ('pending', 'achieved', 'delayed')$c$);
SELECT pg_temp.add_check('units', 'units_status_known', $c$status IN ('available', 'reserved', 'contracted', 'delivered', 'blocked', 'closed')$c$);
SELECT pg_temp.add_check('buildings', 'buildings_status_known', $c$status IN ('planning', 'under_construction', 'completed')$c$);
SELECT pg_temp.add_check('expenses', 'expenses_status_known', $c$status IN ('pending', 'approved', 'rejected')$c$);
