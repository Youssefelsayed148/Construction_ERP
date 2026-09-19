// Phase 15 — site-engineer daily workspace and the self-assembling daily report.
//
// Two core outputs:
//   getWorkspace(q, projectId, date)     — the home screen feed
//   assembleDailyReport(q, {projectId, date, ...}) — the auto-populated report
//
// The daily report is NOT free text anymore: the engine pulls the day's
// schedule/work-order activities, manpower (attendance), equipment usage,
// GRNs (Phase 12), executed quantities (Phase 8), quality/safety inspections,
// engineer-instruction activity, and photos into `assembled_from`. The
// engineer types ONLY narrative, issues/blockers and the next-day plan.
//
// No double counting: every section draws from one distinct source table and
// the census records the source of every figure. engineer_instructions
// activity appears in ONE section (instructions) counted from the
// instruction row's own status stamps — never from activity_log.

'use strict';

const { query: defaultQuery } = require('../config/database');

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function dateStr(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10);
  const s = String(v);
  // ISO timestamp → date part; ISO date → itself; Date-object string
  // ("Thu Sep 15 ...") → parse it.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toISOString().slice(0, 10);
}

function sameDay(v, date) {
  const d = dateStr(v);
  return d != null && d === dateStr(date);
}

// Best-effort section loader — a source table that doesn't exist (older DB)
// contributes an empty section, never a failure.
async function safeAll(q, sql, params) {
  try {
    return (await q(sql, params)).rows;
  } catch (e) {
    console.error(`[SITE] ${e.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Source collectors — each returns { rows, count } for its OWN source only
// ---------------------------------------------------------------------------

async function dayActivities(q, projectId, date) {
  const orders = await safeAll(q, 'SELECT * FROM work_orders WHERE project_id = $1', [projectId]);
  return orders.filter((w) =>
    sameDateIn([w.planned_start_date, w.actual_start_date, w.planned_end_date, w.actual_end_date], date)
    || (['in_progress', 'completed'].includes(w.status) && w.updated_at && sameDateIn([w.updated_at], date)));
}
function sameDateIn(list, date) {
  const target = dateStr(date);
  return list.some((v) => {
    if (v == null) return false;
    if (typeof v === 'string' || v instanceof Date) return dateStr(v) === target;
    return false;
  });
}

async function dayManpower(q, projectId, date) {
  const rows = await safeAll(q, 'SELECT * FROM attendance WHERE date = $1', [dateStr(date)]);
  return rows.filter((r) => toNum(r.project_id) === toNum(projectId) && r.status === 'present');
}

async function dayEquipment(q, projectId, date) {
  const logs = await safeAll(q, 'SELECT * FROM equipment_usage_logs WHERE project_id = $1', [projectId]);
  return logs.filter((l) => sameDateIn([l.log_date], date));
}

async function dayGrns(q, projectId, date) {
  const rows = await safeAll(q, 'SELECT * FROM goods_receipt_notes', []);
  const purchaseOrders = await safeAll(q, 'SELECT id, project_id FROM purchase_orders', []);
  const projectByPo = new Map(purchaseOrders.map((po) => [toNum(po.id), toNum(po.project_id)]));
  return rows.filter((g) => projectByPo.get(toNum(g.purchase_order_id)) === toNum(projectId)
    && g.created_at && sameDateIn([g.created_at], date));
}

async function dayMeasurements(q, projectId, date) {
  const rows = await safeAll(q, 'SELECT * FROM quantity_measurements WHERE project_id = $1', [projectId]);
  return rows.filter((m) => sameDateIn([m.measured_date], date) && m.approval_state === 'approved');
}

async function dayQualityTests(q, projectId, date) {
  const rows = await safeAll(q, 'SELECT * FROM quality_tests WHERE project_id = $1', [projectId]);
  return rows.filter((t) => sameDateIn([t.test_date], date));
}

async function daySafety(q, projectId, date) {
  const inspections = (await safeAll(q, 'SELECT * FROM safety_inspections WHERE project_id = $1', [projectId]))
    .filter((i) => sameDateIn([i.inspection_date], date));
  const incidents = (await safeAll(q, 'SELECT * FROM safety_incidents WHERE project_id = $1', [projectId]))
    .filter((i) => sameDateIn([i.incident_date], date));
  return { inspections, incidents };
}

async function openInstructions(q, projectId) {
  return (await safeAll(q, 'SELECT * FROM engineer_instructions WHERE project_id = $1', [projectId]))
    .filter((i) => i.status !== 'closed');
}

async function instructionActivity(q, projectId, date) {
  // One census per instruction: an instruction touched on the day counts once
  // even if it moved through several states that day.
  const all = await safeAll(q, 'SELECT * FROM engineer_instructions WHERE project_id = $1', [projectId]);
  return all.filter((i) =>
    sameDateIn([i.issued_date], date)
    || (i.acknowledged_at && sameDateIn([i.acknowledged_at], date))
    || (i.implemented_at && sameDateIn([i.implemented_at], date))
    || (i.closed_at && sameDateIn([i.closed_at], date))
    || (i.updated_at && sameDateIn([i.updated_at], date) && i.issued_date && dateStr(i.issued_date) !== dateStr(date))
  );
}

async function dayPhotos(q, projectId, date) {
  const rows = await safeAll(q, 'SELECT * FROM photos WHERE project_id = $1', [projectId]);
  return rows.filter((p) => {
    const stamp = p.captured_at || p.uploaded_at || p.created_at;
    return stamp && sameDateIn([stamp], date);
  });
}

async function materialReadiness(q, projectId) {
  const reqs = await safeAll(q, 'SELECT * FROM material_requirements WHERE project_id = $1', [projectId]);
  const stock = await safeAll(q, 'SELECT * FROM warehouse_stock', []);
  const ready = reqs.filter((r) => (r.status || '') === 'ready_to_pick' || (r.status || '') === 'approved');
  return { requirements: reqs, ready };
}

// ---------------------------------------------------------------------------
// The workspace feed (home screen)
// ---------------------------------------------------------------------------

async function getWorkspace(q, projectId, date = new Date().toISOString().slice(0, 10)) {
  const [activities, manpower, equipment, grns, measurements, quality, safety, instructions, photos, material] = await Promise.all([
    dayActivities(q, projectId, date),
    dayManpower(q, projectId, date),
    dayEquipment(q, projectId, date),
    dayGrns(q, projectId, date),
    dayMeasurements(q, projectId, date),
    dayQualityTests(q, projectId, date),
    daySafety(q, projectId, date),
    openInstructions(q, projectId),
    dayPhotos(q, projectId, date),
    materialReadiness(q, projectId),
  ]);

  return {
    project_id: projectId,
    date: dateStr(date),
    activities: { count: activities.length, items: activities.map((w) => ({ id: w.id, title: w.title, status: w.status, completion_percentage: toNum(w.completion_percentage) })) },
    manpower: { present: manpower.length, items: manpower.map((a) => ({ id: a.id, employee_id: a.employee_id, status: a.status })) },
    equipment: { count: equipment.length, hours: round2(equipment.reduce((s, e) => s + toNum(e.hours_operated), 0)), items: equipment.map((e) => ({ id: e.id, equipment_id: e.equipment_id, hours_operated: toNum(e.hours_operated) })) },
    deliveries: { grns: grns.length, items: grns.map((g) => ({ id: g.id, grn_number: g.grn_number, status: g.status })) },
    executed_quantities: { approved_measurements: measurements.length, total_quantity: round2(measurements.reduce((s, m) => s + toNum(m.quantity), 0)), items: measurements.map((m) => ({ id: m.id, quantity: toNum(m.quantity), unit: m.unit })) },
    inspections: {
      quality_tests: quality.length,
      safety_inspections: safety.inspections.length,
      items: [
        ...quality.map((t) => ({ id: t.id, kind: 'quality_test', status: t.status || t.result || null, test_type: t.test_type })),
        ...safety.inspections.map((i) => ({ id: i.id, kind: 'safety_inspection', status: i.status })),
      ],
    },
    safety: { incidents: safety.incidents.length, items: safety.incidents.map((i) => ({ id: i.id, incident_type: i.incident_type })) },
    material_readiness: { requirements: material.requirements.length, ready: material.ready.length },
    instructions: { open: instructions.length, items: instructions.map((i) => ({ id: i.id, instruction_number: i.instruction_number, title: i.title, priority: i.priority, status: i.status })) },
    photos: { count: photos.length, items: photos.map((p) => ({ id: p.id, caption: p.caption, linked_entity_type: p.linked_entity_type, linked_entity_id: p.linked_entity_id })) },
  };
}

// ---------------------------------------------------------------------------
// The self-assembling daily report
// ---------------------------------------------------------------------------

async function assembleDailyReport(q, projectId, date, engineer = null, typed = {}) {
  const day = dateStr(date);
  const [activities, manpower, equipment, grns, measurements, quality, safety, instructions, photos, material] = await Promise.all([
    dayActivities(q, projectId, day),
    dayManpower(q, projectId, day),
    dayEquipment(q, projectId, day),
    dayGrns(q, projectId, day),
    dayMeasurements(q, projectId, day),
    dayQualityTests(q, projectId, day),
    daySafety(q, projectId, day),
    instructionActivity(q, projectId, day),
    dayPhotos(q, projectId, day),
    materialReadiness(q, projectId),
  ]);

  // The census: every figure carries the exact source table it came from, so
  // the report remains explainable and nothing is counted twice (each source
  // appears exactly once in the census).
  const assembledFrom = {
    activities: { source: 'work_orders', count: activities.length },
    manpower: { source: 'attendance', count: manpower.length },
    equipment: { source: 'equipment_usage_logs', count: equipment.length },
    deliveries: { source: 'goods_receipt_notes', count: grns.length },
    executed_quantities: { source: 'quantity_measurements', count: measurements.length },
    quality_tests: { source: 'quality_tests', count: quality.length },
    safety_inspections: { source: 'safety_inspections', count: safety.inspections.length },
    safety_incidents: { source: 'safety_incidents', count: safety.incidents.length },
    instructions: { source: 'engineer_instructions', count: instructions.length },
    photos: { source: 'photos', count: photos.length },
    material_requirements: { source: 'material_requirements', count: material.requirements.length },
  };

  const payload = {
    weather: typed.weather || null,
    temperature: typed.temperature || null,
    workers_count: manpower.length,
    assembled_from: assembledFrom,
    narrative: typed.narrative || null,
    issues_blockers: typed.issues_blockers || null,
    next_day_plan: typed.next_day_plan || null,
    work_summary: typed.narrative
      || (activities.length > 0
        ? activities.map((w) => `${w.title}${w.completion_percentage != null ? ` (${toNum(w.completion_percentage)}%)` : ''}`).join('; ')
        : ''),
    material_received: grns.length > 0 ? `${grns.length} GRN(s) received` : (typed.material_received || ''),
    equipment_on_site: equipment.length > 0 ? `${equipment.length} equipment unit(s), ${round2(equipment.reduce((s, e) => s + toNum(e.hours_operated), 0))} h` : (typed.equipment_on_site || ''),
  };

  const existing = (await q(
    'SELECT * FROM site_daily_reports WHERE project_id = $1 AND report_date = $2',
    [projectId, day]
  )).rows[0];

  let report;
  if (existing) {
    const r = await q(
      `UPDATE site_daily_reports
       SET weather = $1, temperature = $2, workers_count = $3, work_summary = $4,
           material_received = $5, equipment_on_site = $6, assembled_from = $7,
           narrative = $8, issues_blockers = $9, next_day_plan = $10,
           assembled_at = $11, updated_at = $11
       WHERE id = $12`,
      [payload.weather, payload.temperature, payload.workers_count, payload.work_summary,
       payload.material_received, payload.equipment_on_site, JSON.stringify(payload.assembled_from),
       payload.narrative, payload.issues_blockers, payload.next_day_plan, new Date(), existing.id]
    );
    report = (await q('SELECT * FROM site_daily_reports WHERE id = $1', [existing.id])).rows[0];
  } else {
    const r = await q(
      `INSERT INTO site_daily_reports
         (project_id, report_date, weather, temperature, workers_count, work_summary,
          material_received, equipment_on_site, assembled_from, narrative, issues_blockers,
          next_day_plan, assembled_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14) RETURNING *`,
      [projectId, day, payload.weather, payload.temperature, payload.workers_count, payload.work_summary,
       payload.material_received, payload.equipment_on_site, JSON.stringify(payload.assembled_from),
       payload.narrative, payload.issues_blockers, payload.next_day_plan, new Date(),
       engineer ? engineer.id : null]
    );
    report = r.rows[0];
  }

  return { report, assembled: { assembled_from: payload.assembled_from, detail: { activities, manpower, equipment, deliveries: grns, executed_quantities: measurements, quality_tests: quality, safety, instructions, photos, material_requirements: material.requirements } } };
}

// ---------------------------------------------------------------------------
// Photos (the shared metadata model)
// ---------------------------------------------------------------------------

async function addPhoto(q, {
  project_id, location_id = null, linked_entity_type = null, linked_entity_id = null,
  file_name = null, file_url = null, uploader_user_id = null, organization_id = null,
  captured_at = null, gps_lat = null, gps_lng = null, caption = null, annotations = [],
}) {
  const r = await q(
    `INSERT INTO photos (project_id, location_id, linked_entity_type, linked_entity_id,
       file_name, file_url, uploader_user_id, organization_id, captured_at, gps_lat, gps_lng, caption, annotations)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING *`,
    [project_id, location_id, linked_entity_type, linked_entity_id,
     file_name, file_url, uploader_user_id, organization_id,
     captured_at ? new Date(captured_at) : new Date(), gps_lat, gps_lng, caption,
     JSON.stringify(annotations)]
  );
  return r.rows[0];
}

async function getPhotos(q, { project_id = null, linked_entity_type = null, linked_entity_id = null } = {}) {
  let rows = [];
  if (project_id != null) {
    rows = (await q('SELECT * FROM photos WHERE project_id = $1', [project_id])).rows;
  } else {
    rows = (await q('SELECT * FROM photos')).rows;
  }
  if (linked_entity_type != null) rows = rows.filter((p) => p.linked_entity_type === linked_entity_type);
  if (linked_entity_id != null) rows = rows.filter((p) => toNum(p.linked_entity_id) === toNum(linked_entity_id));
  return rows;
}

// ---------------------------------------------------------------------------
// Sticky notes (never contractual correspondence)
// ---------------------------------------------------------------------------

const STICKY_SCOPES = ['personal', 'project', 'location', 'record'];

async function createStickyNote(q, {
  project_id = null, scope = 'personal', owner_user_id, location_id = null,
  linked_entity_type = null, linked_entity_id = null, text, color = 'yellow', reminder_at = null,
}) {
  if (!STICKY_SCOPES.includes(scope)) throw new Error(`Invalid sticky-note scope: ${scope}`);
  if (!text || !String(text).trim()) throw new Error('Sticky note requires text');
  if (scope === 'personal') { project_id = project_id; } // personal notes may still sit on a project
  if (scope === 'location' && location_id == null) throw new Error('Location sticky note requires location_id');
  if (scope === 'record' && (linked_entity_type == null || linked_entity_id == null)) {
    throw new Error('Record sticky note requires linked_entity_type and linked_entity_id');
  }
  const r = await q(
    `INSERT INTO sticky_notes (project_id, scope, owner_user_id, location_id, linked_entity_type, linked_entity_id, text, color, reminder_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [project_id, scope, owner_user_id, location_id, linked_entity_type, linked_entity_id,
     String(text).trim(), color, reminder_at]
  );
  return r.rows[0];
}

async function listStickyNotes(q, { project_id = null, owner_user_id = null } = {}) {
  let rows = (await q('SELECT * FROM sticky_notes')).rows;
  if (project_id != null) rows = rows.filter((n) => toNum(n.project_id) === toNum(project_id));
  if (owner_user_id != null) {
    // Visibility: personal notes are the owner's only; project/location/record
    // notes are visible to everyone on the project.
    rows = rows.filter((n) => n.scope === 'personal'
      ? toNum(n.owner_user_id) === toNum(owner_user_id)
      : true);
  }
  return rows;
}

// "Convert to action" — feeds Phase 7's action_items. The sticky note keeps a
// pointer to the action it spawned; the note itself is never a document.
async function convertStickyToAction(q, noteId, user, opts = {}) {
  const note = (await q('SELECT * FROM sticky_notes WHERE id = $1', [noteId])).rows[0];
  if (!note) throw new Error(`Sticky note #${noteId} not found`);
  if (note.converted_action_item_id != null) return { note, already: true };

  const actionService = require('./actionService');
  const item = await actionService.createActionItem({
    source_type: 'sticky_note',
    source_id: note.id,
    project_id: note.project_id,
    location_id: note.location_id,
    title: note.text.slice(0, 200),
    description: `Converted from sticky note #${note.id} (scope: ${note.scope})`,
    assigned_user_id: opts.assigned_user_id != null ? opts.assigned_user_id : note.owner_user_id,
    assigned_role: opts.assigned_role || null,
    priority: opts.priority || 'medium',
    due_date: opts.due_date || (note.reminder_at ? new Date(note.reminder_at) : null),
    created_by: user.id,
  }, { query: q, notify: opts.notify !== false });

  await q(
    'UPDATE sticky_notes SET converted_action_item_id = $1, updated_at = $2 WHERE id = $3',
    [item.id, new Date(), noteId]
  );
  return { note: (await q('SELECT * FROM sticky_notes WHERE id = $1', [noteId])).rows[0], action_item: item };
}

// ---------------------------------------------------------------------------
// Sticky-note reminders (Phase 7 notifications)
// ---------------------------------------------------------------------------

async function runStickyReminderSweep(q, opts = {}) {
  const now = new Date();
  let sent = 0;
  let notes;
  try {
    notes = (await q('SELECT * FROM sticky_notes')).rows;
  } catch (e) { return { reminders_sent: 0 }; }
  for (const n of notes) {
    if (n.reminder_at == null || n.reminder_notified_at != null) continue;
    if (new Date(n.reminder_at) > now) continue;
    try {
      await require('./notificationService').notify({
        userId: n.owner_user_id,
        title: `Sticky note reminder: ${String(n.text).slice(0, 80)}`,
        body: null,
        eventType: 'sticky_note.reminder',
        entityType: 'sticky_note',
        entityId: n.id,
      }, { query: q });
    } catch (e) {
      console.error('[STICKY] reminder failed:', e.message);
    }
    await q('UPDATE sticky_notes SET reminder_notified_at = $1 WHERE id = $2', [new Date(), n.id]);
    sent++;
  }
  return { reminders_sent: sent };
}

function round2(n) {
  return Math.round((toNum(n) + Number.EPSILON) * 100) / 100;
}

module.exports = {
  STICKY_SCOPES,
  getWorkspace,
  assembleDailyReport,
  addPhoto,
  getPhotos,
  createStickyNote,
  listStickyNotes,
  convertStickyToAction,
  runStickyReminderSweep,
  round2,
};
