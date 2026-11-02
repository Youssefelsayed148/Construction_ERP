-- Value masking (2026-11-02) now hides ledger / payments / finance amounts from any role holding none of the three visibility flags.
-- accountant_ap works the supplier-invoice and payment side and held none of them, so it would have been blind in its own job.
-- Grant it see_internal_cost (the flag the finance manager and accountant already hold). Idempotent.
INSERT INTO permissions (module, action) VALUES ('*', 'see_internal_cost') ON CONFLICT (module, action) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.module = '*' AND p.action = 'see_internal_cost'
 WHERE r.key = 'accountant_ap'
ON CONFLICT (role_id, permission_id) DO NOTHING;
