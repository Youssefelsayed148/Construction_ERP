// Phase 3.3 observability — the count for the outbox queue and (per Phase 3.4) the background sweeps.
// Prints: total, pending, dispatching, delivered, dead, failed sweep runs, and the oldest pending retry.
// Usage: npm run outbox:stats   (uses the same DB_* environment variables as the app)
const database = require('../config/database');

async function main() {
  const outbox = require('../services/outboxDispatcher');
  const s = await outbox.stats();
  const lines = [
    `outbox: total=${s.total} pending=${s.pending} dispatching=${s.dispatching} delivered=${s.delivered} dead=${s.dead}`,
    `background sweeps failed (all time): ${s.sweep_failures}`,
    `oldest pending next retry: ${s.oldest_pending_next_retry}`,
  ];
  for (const line of lines) console.log(line);
  if (s.sweep_failures > 0 || s.dead > 0) {
    const dead = (await database.query('SELECT event_type, event_id, attempts, last_error FROM event_outbox WHERE status = $1 ORDER BY updated_at DESC LIMIT 10', ['dead'])).rows;
    if (dead.length) {
      console.log('dead-lettered events (latest 10):');
      for (const d of dead) console.log(`  ${d.event_type} ${d.event_id} after ${d.attempts} attempts: ${d.last_error || '(no error recorded)'}`);
    }
    if (s.sweep_failures > 0) {
      const fails = (await database.query('SELECT sweep, started_at, error FROM background_sweep_runs WHERE status = $1 ORDER BY started_at DESC LIMIT 10', ['failed'])).rows;
      console.log('failed sweep runs (latest 10):');
      for (const f of fails) console.log(`  ${f.sweep} at ${f.started_at.toISOString ? f.started_at.toISOString() : f.started_at}: ${f.error || '(no error recorded)'}`);
    }
    process.exitCode = 1; // a dead letter or a failed sweep makes the check non-zero by default
  }
  await database.pool.end();
}

main().catch((e) => { console.error('outbox:stats failed:', e.message); process.exit(1); });
