// Phase 18 migration core — subcontractor & supplier portals.
//
// Steps (all idempotent):
//   ensureTables — additive widening only: organization_documents gains an
//                  expiry_date (compliance-document expiry tracking the
//                  supplier dashboard needs). Everything else this phase uses
//                  already exists from Phases 3/6/7/8/12/13/15/16.

'use strict';

const DDL = [
  `ALTER TABLE organization_documents ADD COLUMN IF NOT EXISTS expiry_date DATE`,
];

async function ensureTables(query) {
  for (const ddl of DDL) {
    await query(ddl);
  }
}

module.exports = { DDL, ensureTables };
