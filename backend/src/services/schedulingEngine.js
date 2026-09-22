// Phase 22 — scheduling engine.
//
// A working critical-path calculation over the activity/dependency graph
// (explicitly NOT a full enterprise CPM engine in this iteration — per the
// build prompt):
//   * forward pass over FS/SS/FF/SF relationships with lag, day-based
//   * backward pass → total float per activity, critical = float <= 0
//   * Schedule Variance % = Actual Progress % − Planned Progress %
//   * SPI/CPI only where earned-value management is explicitly enabled for
//     the project (projects.earned_value_enabled)
//   * quantity-driven progress derives % complete from Phase 8's approved
//     physical quantity; manual override is permission-gated
//
// Every calculation is a pure function over fetched rows — portable across
// PostgreSQL and the test MockDb.

'use strict';

const { query: defaultQuery } = require('../config/database');
const { fireEvent } = require('../utils/activity');

function toNum(v) {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayMs(d) { return d.getTime(); }

const DAY_MS = 86400000;

// ---------------------------------------------------------------------------
// CPM — pure functions
// ---------------------------------------------------------------------------

// Forward + backward pass over { activities, relationships }.
// Durations are in days; finish = start + duration (calendar working-day
// refinement is a later refinement — the docs note this).
function computeSchedule(activities, relationships) {
  const byId = new Map(activities.map((a) => [String(a.id), { ...a }]));
  for (const a of byId.values()) {
    a._earlyStart = a.is_milestone || a.is_milestone === true ? null : null;
    a._duration = Math.max(0, toNum(a.original_duration) || 0);
  }

  const rels = (relationships || []).filter((r) =>
    byId.has(String(r.predecessor_id)) && byId.has(String(r.successor_id)));

  // Topological order (activities first by planned_start, ties by id) so the
  // forward pass converges even with unusual orderings. Cycles are detected:
  // a cycle member simply never relaxes further — flagged, not fatal.
  const ordered = [...byId.values()].sort((a, b) => {
    const ta = toDate(a.planned_start)?.getTime() || 0;
    const tb = toDate(b.planned_start)?.getTime() || 0;
    return ta - tb || (toNum(a.id) - toNum(b.id));
  });

  const predsOf = new Map();
  for (const r of rels) {
    const key = String(r.successor_id);
    if (!predsOf.has(key)) predsOf.set(key, []);
    predsOf.get(key).push(r);
  }

  // Forward pass: for each activity compute earliest start/finish from the
  // predecessors. Milestones have zero duration.
  for (const a of byId.values()) {
    const baseStart = toDate(a.planned_start) || new Date('2000-01-01');
    a._es = baseStart.getTime();
    a._ef = a._es + (a.is_milestone ? 0 : a._duration) * DAY_MS;
    a._isMilestone = a.is_milestone === true;
  }
  // iterate to convergence (bounded — graphs are small)
  for (let iter = 0; iter < byId.size + 2; iter++) {
    let changed = false;
    for (const a of byId.values()) {
      if (a._isMilestone) continue;
      let es = a._es;
      for (const rel of predsOf.get(String(a.id)) || []) {
        const p = byId.get(String(rel.predecessor_id));
        const lag = toNum(rel.lag_days) * DAY_MS;
        const pStart = p._es;
        const pFinish = p._isMilestone ? p._es : p._es + p._duration * DAY_MS;
        const type = String(rel.relationship_type || 'FS').toUpperCase();
        let candidate;
        if (type === 'FS') candidate = pFinish + lag;
        else if (type === 'SS') candidate = pStart + lag;
        else if (type === 'FF') candidate = pFinish + lag - a._duration * DAY_MS;
        else if (type === 'SF') candidate = pStart + lag - a._duration * DAY_MS;
        else candidate = pFinish + lag;
        if (candidate > es) { es = candidate; }
      }
      if (es !== a._es) { a._es = es; changed = true; }
      a._ef = a._es + a._duration * DAY_MS;
    }
    if (!changed) break;
  }

  // Project finish = max EF.
  let projectFinish = 0;
  for (const a of byId.values()) {
    const finish = a._isMilestone ? a._es : a._ef;
    if (finish > projectFinish) projectFinish = finish;
  }

  // Backward pass: latest start/finish + total float.
  const succsOf = new Map();
  for (const r of rels) {
    const key = String(r.predecessor_id);
    if (!succsOf.has(key)) succsOf.set(key, []);
    succsOf.get(key).push(r);
  }
  for (const a of byId.values()) {
    a._lf = projectFinish;
    a._ls = a._lf - (a._isMilestone ? 0 : a._duration * DAY_MS);
  }
  // iterate in reverse topological-ish order (bounded)
  for (let iter = 0; iter < byId.size + 2; iter++) {
    let changed = false;
    for (const a of [...byId.values()].sort((x, y) => (toDate(y.planned_finish)?.getTime() || 0) - (toDate(x.planned_finish)?.getTime() || 0))) {
      let lf = a._lf;
      for (const rel of succsOf.get(String(a.id)) || []) {
        const s = byId.get(String(rel.successor_id));
        const lag = toNum(rel.lag_days) * DAY_MS;
        const type = (rel.relationship_type || 'FS').toUpperCase();
        let candidate;
        if (type === 'FS') lf = Math.min(lf, s._ls - lag);
        else if (type === 'SS') lf = Math.min(lf, s._ls + a._duration * DAY_MS - lag);
        else if (type === 'FF') lf = Math.min(lf, s._lf - lag);
        else if (type === 'SF') lf = Math.min(lf, s._lf - a._duration * DAY_MS - lag);
      }
      if (lf !== a._lf) { a._lf = lf; changed = true; }
      a._ls = a._lf - (a._isMilestone ? 0 : a._duration * DAY_MS);
    }
    if (!changed) break;
  }

  const results = [];
  for (const a of byId.values()) {
    const totalFloat = (a._ls - a._es) / DAY_MS;
    const critical = totalFloat <= 0.0001;
    results.push({
      id: toNum(a.id),
      early_start: new Date(a._es).toISOString().slice(0, 10),
      early_finish: new Date(a._isMilestone ? a._es : a._ef).toISOString().slice(0, 10),
      late_start: new Date(a._ls).toISOString().slice(0, 10),
      late_finish: new Date(a._lf).toISOString().slice(0, 10),
      total_float: Math.round(totalFloat * 100) / 100,
      critical,
    });
  }
  return { project_finish: new Date(projectFinish).toISOString().slice(0, 10), activities: results };
}

// Planned progress % at the data date — time-phased from planned dates.
function plannedProgress(activity, dataDate = new Date()) {
  const ps = toDate(activity.planned_start);
  const pf = toDate(activity.planned_finish);
  if (!ps || !pf) return 0;
  const t = Math.min(Math.max(dataDate.getTime(), ps.getTime()), pf.getTime());
  const span = pf.getTime() - ps.getTime();
  if (span <= 0) return dataDate.getTime() >= pf.getTime() ? 100 : 0;
  return Math.round(Math.min(100, Math.max(0, ((t - ps.getTime()) / span) * 100)) * 10) / 10;
}

// Schedule Variance % = Actual Progress % − Planned Progress %
function scheduleVariancePercent(activity, dataDate) {
  const planned = plannedProgress(activity, dataDate);
  const actual = toNum(activity.percent_complete);
  return Math.round((actual - planned) * 10) / 10;
}

// SPI = EV/PV (earned value / planned value) — only where EVM is enabled.
function spi(project, activities, dataDate = new Date()) {
  if (!project || project.earned_value_enabled !== true) return null;
  let ev = 0, pv = 0;
  for (const a of activities) {
    const weight = toNum(a.planned_quantity) || 1;
    ev += (toNum(a.percent_complete) / 100) * weight;
    pv += (plannedProgress(a, dataDate) / 100) * weight;
  }
  return pv > 0 ? Math.round((ev / pv) * 1000) / 1000 : (ev > 0 ? null : 0);
}

// CPI = EV/AC — needs cost data per activity; provided with cost data.
function cpi(project, activities, costsByActivity) {
  if (!project || project.earned_value_enabled !== true) return null;
  let ev = 0, ac = 0;
  for (const a of activities) {
    const weight = toNum(a.planned_quantity) || 1;
    ev += (toNum(a.percent_complete) / 100) * weight;
    ac += toNum((costsByActivity || {})[a.id]);
  }
  return ac > 0 ? Math.round((ev / ac) * 1000) / 1000 : null;
}

// S-curve: planned vs actual cumulative points over the project window.
function sCurve(activities, dataDate = new Date()) {
  if (activities.length === 0) return [];
  let minT = Infinity, maxT = -Infinity;
  for (const a of activities) {
    const ps = toDate(a.planned_start)?.getTime();
    const pf = toDate(a.planned_finish)?.getTime();
    if (ps != null && ps < minT) minT = ps;
    if (pf != null && pf > maxT) maxT = pf;
  }
  if (!Number.isFinite(minT) || !Number.isFinite(maxT) || maxT <= minT) return [];
  const steps = 20;
  const weight = (a) => toNum(a.planned_quantity) || 1;
  const total = activities.reduce((s, a) => s + weight(a), 0) || 1;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = minT + (i / steps) * (maxT - minT);
    let planned = 0, actual = 0;
    for (const a of activities) {
      const ps = toDate(a.planned_start)?.getTime();
      const pf = toDate(a.planned_finish)?.getTime();
      if (ps == null || pf == null) continue;
      if (t >= ps) {
        const span = pf - ps;
        const frac = span > 0 ? Math.min(1, (t - ps) / span) : 1;
        planned += weight(a) * frac;
        // actual: achieved progress, drawn only up to its recorded level
        const actualSpanFraction = span > 0 ? Math.min(1, Math.max(0, (t - ps) / span)) : 1;
        const actualToData = dataDate.getTime() >= pf ? (toNum(a.percent_complete) / 100) : 0;
        actual += weight(a) * actualToData * (span > 0 ? Math.min(1, actualSpanFraction) : 1);
      }
    }
    points.push({
      date: new Date(t).toISOString().slice(0, 10),
      planned_percent: Math.round((planned / total) * 1000) / 10,
      actual_percent: t <= dataDate.getTime() ? Math.round((actual / total) * 1000) / 10 : null,
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Quantity-derived progress (Phase 8 integration)
// ---------------------------------------------------------------------------

// % complete from approved physical quantity vs the planned quantity
// (boq_location_allocation planned quantity when the activity is
// location-allocated, else the BOQ item quantity).
async function deriveQuantityProgress(q, activity) {
  // Plain row select + JS aggregation keeps the formula portable across
  // PostgreSQL and the test MockDb.
  const rows = (await q(
    `SELECT quantity, approval_state FROM quantity_measurements WHERE boq_item_id = $1`,
    [activity.boq_item_id]
  )).rows;
  const approvedQty = rows.filter((r) => r.approval_state === 'approved').reduce((s, r) => s + toNum(r.quantity), 0);
  let planned = toNum(activity.planned_quantity);
  if (!planned && activity.boq_location_allocation_id) {
    const alloc = (await q(
      'SELECT planned_quantity FROM boq_location_allocations WHERE id = $1',
      [activity.boq_location_allocation_id]
    )).rows[0];
    planned = alloc ? toNum(alloc.planned_quantity) : 0;
  }
  if (!planned) return null;
  const pct = (approvedQty / planned) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

// Manual override is permission-gated (the route carries a coarse role check
// + the Phase 4 policy engine evaluates the request like every other write).
async function updateProgress(q, activityId, { percent_complete, progress_source, dataDate }, user) {
  const activity = (await q('SELECT * FROM schedule_activities WHERE id = $1', [activityId])).rows[0];
  if (!activity) throw new Error('Activity not found');
  let next = toNum(activity.percent_complete);
  if (progress_source === 'quantity' || (progress_source == null && activity.progress_source === 'quantity')) {
    const derived = await deriveQuantityProgress(q, activity);
    if (derived != null) next = derived;
  } else if (percent_complete != null) {
    next = Math.min(100, Math.max(0, toNum(percent_complete)));
  }
  const actualStart = toDate(activity.actual_start) || (next > 0 ? (toDate(dataDate) || new Date()) : null);
  const actualFinish = next >= 100 ? (toDate(activity.actual_finish) || toDate(dataDate) || new Date()) : activity.actual_finish;
  await q(
    `UPDATE schedule_activities SET percent_complete = $1, progress_source = $2,
       actual_start = $3, actual_finish = $4, status = $5, updated_at = $6 WHERE id = $7`,
    [next, progress_source || activity.progress_source, actualStart, actualFinish,
     next >= 100 ? 'completed' : (next > 0 ? 'in_progress' : activity.status),
     new Date(), activityId]
  );
  await fireEvent({
    eventType: 'schedule.activity.changed', entityType: 'schedule_activity', entityId: num(activityId),
    userId: user.id, userName: user.name, userRole: user.role,
    payload: { project_id: activity.project_id, percent_complete: next },
  }, { query: q });
  return (await q('SELECT * FROM schedule_activities WHERE id = $1', [activityId])).rows[0];
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function lookahead(activities, weeks, dataDate = new Date()) {
  const start = dataDate.getTime();
  const end = start + weeks * 7 * DAY_MS;
  return activities.filter((a) => {
    const ps = toDate(a.planned_start)?.getTime();
    return ps != null && ps >= start && ps <= end;
  });
}

function delayedActivities(activities, dataDate = new Date()) {
  const nowMs = dataDate.getTime();
  return activities.filter((a) => {
    if (a.status === 'completed' || toNum(a.percent_complete) >= 100) return false;
    const pf = toDate(a.planned_finish)?.getTime();
    return pf != null && pf < nowMs;
  });
}

function criticalActivities(computed) {
  return (activities, relationships) => {
    const sched = computeSchedule(activities, relationships);
    const criticalIds = new Set(sched.activities.filter((a) => a.critical).map((a) => a.id));
    return activities.filter((a) => criticalIds.has(toNum(a.id)));
  };
}

// ---------------------------------------------------------------------------
// Alerts (cross-module)
// ---------------------------------------------------------------------------

async function scheduleAlerts(q, projectId, dataDate = new Date()) {
  const inTwoWeeks = new Date(dataDate.getTime() + 14 * DAY_MS).toISOString().slice(0, 10);
  const today = dataDate.toISOString().slice(0, 10);
  const alerts = [];

  // 1. Activity starting soon but material not ready (Phase 9 cross-check).
  const soon = (await q(
    `SELECT * FROM schedule_activities
     WHERE project_id = $1 AND boq_item_id IS NOT NULL AND is_milestone = false
       AND planned_start IS NOT NULL AND planned_start BETWEEN $2 AND $3
       AND status = 'planned'`,
    [projectId, today, inTwoWeeks]
  )).rows;
  for (const a of soon) {
    try {
      const reqs = (await q(
        `SELECT id, material_id, net_requirement, status FROM material_requirements
         WHERE boq_item_id = $1 AND status IN ('identified','planned','pending')`,
        [a.boq_item_id]
      )).rows;
      if (reqs.length > 0) {
        alerts.push({
          type: 'material_not_ready', activity_id: a.id, activity_code: a.activity_code,
          name: a.name, planned_start: a.planned_start, open_requirements: reqs.length,
        });
      }
    } catch (e) { /* material_requirements not present — skip */ }
  }

  // 2. Inspection/submittal blocking an activity — open WIRs/RFIs on the
  //    activity's work package or BOQ item.
  try {
    const blockers = (await q(
      `SELECT a.id AS activity_id, a.name, w.wir_number, w.status
       FROM schedule_activities a JOIN wirs w ON w.boq_item_id = a.boq_item_id
       WHERE a.project_id = $1 AND a.status = 'in_progress' AND w.status IN ('draft','submitted','qa_qc_review','pm_review','consultant_review')`,
      [projectId]
    )).rows;
    for (const b of blockers) {
      alerts.push({ type: 'inspection_blocking', activity_id: b.activity_id, name: b.name, blocker: `WIR ${b.wir_number} (${b.status})` });
    }
    const rfiBlockers = (await q(
      `SELECT a.id AS activity_id, a.name, r.rfi_number
       FROM schedule_activities a JOIN project_rfis r ON r.project_id = a.project_id
       WHERE a.project_id = $1 AND a.status = 'in_progress' AND r.status = 'open' AND r.discipline = a.wbs_path`,
      [projectId]
    )).rows;
    for (const r of rfiBlockers) {
      alerts.push({ type: 'rfi_blocking', activity_id: r.activity_id, name: r.name, blocker: `RFI ${r.rfi_number}` });
    }
  } catch (e) { /* wirs/rfis not present in scope */ }

  // 3. Critical activity delayed — computed against the CPM.
  try {
    const activities = (await q('SELECT * FROM schedule_activities WHERE project_id = $1', [projectId])).rows;
    const rels = (await q('SELECT * FROM activity_relationships WHERE project_id = $1', [projectId])).rows;
    const sched = computeSchedule(activities, rels);
    const critIds = new Set(sched.activities.filter((s) => s.critical).map((s) => s.id));
    for (const a of activities) {
      if (!critIds.has(toNum(a.id))) continue;
      const planned = plannedProgress(a, dataDate);
      if (toNum(a.percent_complete) < planned) {
        alerts.push({ type: 'critical_activity_delayed', activity_id: a.id, name: a.name, percent_complete: toNum(a.percent_complete), planned_progress: planned });
      }
    }
  } catch (e) { /* schedule empty */ }

  // 4. Milestone forecast late.
  try {
    const late = (await q(
      `SELECT id, title, target_date FROM project_milestones
       WHERE project_id = $1 AND status != 'achieved' AND target_date IS NOT NULL AND target_date < $2`,
      [projectId, today]
    )).rows;
    for (const m of late) {
      alerts.push({ type: 'milestone_late', milestone_id: m.id, name: m.title, target_date: m.target_date });
    }
  } catch (e) { /* milestones table absent */ }

  return alerts;
}

module.exports = {
  computeSchedule,
  plannedProgress,
  scheduleVariancePercent,
  spi,
  cpi,
  sCurve,
  deriveQuantityProgress,
  updateProgress,
  lookahead,
  delayedActivities,
  criticalActivities,
  scheduleAlerts,
  toNum,
  toDate,
  DAY_MS,
};
