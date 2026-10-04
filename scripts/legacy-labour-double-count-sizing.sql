-- READ-ONLY sizing query (closeout answer 6). Run on a RESTORED COPY only, before migrations 0025 and 0026 go near
-- production. Changes nothing.
--
-- Before closeout A2.3 a verified work completion accrued the work order's labour AND equipment as one
-- project_costs row (source_type 'work_completion', whole work order, once per completion), while every labour
-- payment also accrued itself (source_type 'labor_payment'). The labour of a work order could therefore be
-- counted twice, and a second completion of the same order counted the whole order again.
--
-- Per work order: the legacy completion rows, what they hold, and the labour rows that overlap them.
WITH legacy AS (
  SELECT wc.work_order_id,
         count(*)                   AS completion_cost_rows,
         sum(pc.amount)             AS completion_rows_total,
         min(pc.project_id)         AS project_id
    FROM project_costs pc
    JOIN work_completions wc ON wc.id = pc.source_id
   WHERE pc.source_type = 'work_completion'
   GROUP BY wc.work_order_id
), labour AS (
  SELECT lp.work_order_id, count(*) AS labour_cost_rows, sum(pc.amount) AS labour_rows_total
    FROM project_costs pc
    JOIN labor_payments lp ON lp.id = pc.source_id
   WHERE pc.source_type = 'labor_payment' AND lp.work_order_id IS NOT NULL
   GROUP BY lp.work_order_id
), equipment AS (
  SELECT work_order_id, sum(total_cost) AS equipment_total FROM work_order_equipment GROUP BY work_order_id
)
SELECT l.work_order_id, l.project_id, l.completion_cost_rows, l.completion_rows_total,
       COALESCE(b.labour_cost_rows, 0) AS labour_cost_rows, COALESCE(b.labour_rows_total, 0) AS labour_rows_total,
       COALESCE(e.equipment_total, 0) AS equipment_total,
       -- Upper bound of the overcount: everything the completion rows hold beyond one pass of the equipment.
       GREATEST(l.completion_rows_total - COALESCE(e.equipment_total, 0), 0) AS completion_labour_and_repeat_estimate,
       -- Labour counted in both places (the completion rows' labour share, capped by the labour rows).
       LEAST(COALESCE(b.labour_rows_total, 0), GREATEST(l.completion_rows_total - COALESCE(e.equipment_total, 0), 0)) AS likely_labour_double_count
  FROM legacy l
  LEFT JOIN labour b ON b.work_order_id = l.work_order_id
  LEFT JOIN equipment e ON e.work_order_id = l.work_order_id
 ORDER BY likely_labour_double_count DESC, l.work_order_id;

-- Totals for the report:
--   SELECT count(*) AS affected_work_orders, sum(likely_labour_double_count) AS likely_overcount FROM (<query above>) t
--    WHERE likely_labour_double_count > 0;
