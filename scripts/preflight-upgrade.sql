-- Preflight for the versioned migrations 0001-0008. READ ONLY: run it against a restored copy of the real
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
) report
ORDER BY migration, kind, effect;

ROLLBACK;
