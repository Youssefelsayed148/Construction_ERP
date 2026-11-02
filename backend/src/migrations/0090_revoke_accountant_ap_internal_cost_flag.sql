-- Corrects 0088 (2026-11-02, same day): the see_internal_cost flag also unlocks commercial budget / forecast / commitment reads, which the AP clerk
-- must NOT have (nav-visibility B7: commercial is a hidden group for accountant_ap). The value-masking layer names accountant_ap explicitly instead.
-- Deletes exactly ONE role_permissions row (accountant_ap -> * / see_internal_cost) that 0088 inserted; nothing else is touched. Idempotent.
DELETE FROM role_permissions rp
 USING roles r, permissions p
 WHERE rp.role_id = r.id AND rp.permission_id = p.id
   AND r.key = 'accountant_ap' AND p.module = '*' AND p.action = 'see_internal_cost';
