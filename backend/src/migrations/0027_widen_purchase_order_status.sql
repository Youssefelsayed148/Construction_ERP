-- Closeout A2.7 (found by the golden-chain test): purchase_orders.status was VARCHAR(30), but the PO workflow's
-- first approval step is 'commercial_procurement_approval' (31 characters). The workflow mirrors its current step
-- into purchase_orders.status, so the FIRST decision on any purchase order failed on PostgreSQL with
-- "value too long for type character varying(30)" and no PO could ever be issued through its workflow.
-- (mock-db does not enforce lengths, so no unit test could see it.)
--
-- Widening a VARCHAR is metadata-only and changes no row. If a CHECK constraint lists the status vocabulary it is
-- unaffected (the listed values already include the long step key or are widened in 0012's helper).
-- Existing rows: untouched. Nothing to preflight.
ALTER TABLE purchase_orders ALTER COLUMN status TYPE VARCHAR(50);
