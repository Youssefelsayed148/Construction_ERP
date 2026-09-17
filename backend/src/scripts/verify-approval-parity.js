// Phase 6 definition-of-done verifier — run this script, not your eyes.
//
// For every row in approval_requests it checks that a matching
// workflow_instances row exists whose status/current step/approver role
// exactly matches what the legacy stage logic would compute.
//
// Run:  node backend/src/scripts/verify-approval-parity.js
// Exit code 0 = full parity, 1 = mismatches found.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');
const engine = require('../services/workflowEngine');

async function main() {
  const { checked, mismatches } = await engine.verifyApprovalParity(query);
  console.log(`Checked ${checked} approval_requests row(s).`);
  if (mismatches.length === 0) {
    console.log('PARITY OK — every approval_requests row has a matching workflow_instances row with the same current step/approver.');
    process.exit(0);
  }
  console.log(`PARITY FAILURES (${mismatches.length}):`);
  for (const m of mismatches) {
    console.log(`  legacy #${m.legacy_id}: ${m.problem}`);
  }
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
