// Phase 3.5 — progress is DERIVED from schedule tasks and measured quantities, never free-typed.
//
// The rule (docs/PROGRESS_DERIVATION.md, simplest defensible per the owner's brief):
//   1. quantity-weighted by BOQ value where quantities exist: quantityEngine.projectProgress with the
//      default 'boq_value' weight policy — each BOQ item contributes its approved/certified measured
//      quantity against its planned quantity, weighted by planned quantity x unit rate;
//   2. otherwise duration-weighted from schedule tasks: sum(duration x percent) / sum(duration) over the
//      project's (or the phase's) non-milestone activities — a milestone carries no duration, so it is
//      excluded by construction;
//   3. no source at all -> derive returns progress: null and syncProjectProgress leaves the stored
//      projects.completion_percentage untouched, so old hand-typed values stay readable.
//
// The derived value is written back to the stored columns at recompute points only (a measurement write
// or review, a schedule progress change). A manual override of projects.completion_percentage or
// project_phases.completion_percentage is a distinct permission ('projects','override_progress') on top
// of the ordinary edit grant, and is audited (activity_log action 'override_progress') — see routes.
//
// Overrun quantities are capped at 100%: a measured quantity above the planned one never drags the
// figure past completion.
'use strict';

const quantityEngine = require('./quantityEngine');
const schedulingEngine = require('./schedulingEngine');

const toNum = (v) => {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Duration-weighted progress over schedule tasks. Milestones (original_duration 0 / is_milestone) carry
// no duration weight. Soft-deleted tasks are excluded by the deleted_at guard; schedule_activities are
// hard-deleted today (no such column), so the guard is written for when soft delete lands.
function durationWeighted(activities) {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const a of activities) {
    if (a.deleted_at != null) continue; // soft-deleted tasks are excluded (no-op today)
    const duration = toNum(a.original_duration) || 0;
    if (duration <= 0) continue;
    const pct = Math.min(100, Math.max(0, toNum(a.percent_complete)));
    weightedSum += duration * pct;
    totalWeight += duration;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

async function deriveProjectProgress(q, projectId) {
  // Source 1: measured quantities weighted by BOQ value.
  const quantitative = await quantityEngine.projectProgress(q, projectId, 'boq_value');
  if (quantitative && toNum(quantitative.total_weight) > 0) {
    return {
      source: 'quantities',
      progress: Math.min(100, round2(toNum(quantitative.progress))),
      total_weight: toNum(quantitative.total_weight),
    };
  }
  // Source 2: duration-weighted schedule tasks.
  const activities = (await q(
    'SELECT * FROM schedule_activities WHERE project_id = $1 ORDER BY id',
    [projectId]
  )).rows;
  if (activities.length) {
    const progress = durationWeighted(activities);
    if (progress != null) return { source: 'schedule', progress: Math.min(100, round2(progress)) };
  }
  return { source: 'none', progress: null };
}

// Phase progress: the phase's own activities, duration-weighted; null when the phase has none.
async function derivePhaseProgress(q, phaseId) {
  const activities = (await q(
    'SELECT * FROM schedule_activities WHERE phase_id = $1 ORDER BY id',
    [phaseId]
  )).rows;
  if (!activities.length) return null;
  return durationWeighted(activities);
}

// Recompute points. Writes only when a source exists; the stored column stays readable for old data.
async function syncProjectProgress(q, projectId) {
  const derived = await deriveProjectProgress(q, projectId);
  if (derived.progress == null) return { project_id: projectId, ...derived, stored: false };
  await q('UPDATE projects SET completion_percentage = $1, updated_at = now() WHERE id = $2', [derived.progress, projectId]);
  await syncPhaseProgressForProject(q, projectId);
  return { project_id: projectId, ...derived, stored: true };
}

// Every phase of a project recomputes from its own activities; phases without activities are left alone.
async function syncPhaseProgressForProject(q, projectId) {
  const phases = (await q('SELECT id FROM project_phases WHERE project_id = $1', [projectId])).rows;
  for (const phase of phases) {
    const progress = await derivePhaseProgress(q, phase.id);
    if (progress != null) {
      await q('UPDATE project_phases SET completion_percentage = $1 WHERE id = $2', [Math.min(100, round2(progress)), phase.id]);
    }
  }
  return phases.length;
}

// Measurement changes push to quantity-driven schedule activities: percent recomputes without any
// explicit PUT, and the project (and phases) follow.
async function syncActivityProgressForBoqItem(q, boqItemId) {
  const activities = (await q(
    "SELECT * FROM schedule_activities WHERE boq_item_id = $1 AND progress_source = 'quantity' ORDER BY id",
    [boqItemId]
  )).rows;
  const changed = [];
  for (const activity of activities) {
    const derived = await schedulingEngine.deriveQuantityProgress(q, activity);
    if (derived == null || round2(derived) === round2(activity.percent_complete)) continue;
    await q(
      `UPDATE schedule_activities
          SET percent_complete = $1::numeric,
              status = CASE WHEN $1::numeric >= 100 THEN 'completed' WHEN $1::numeric > 0 THEN 'in_progress' ELSE status END,
              updated_at = now()
        WHERE id = $2`,
      [Math.min(100, round2(derived)), activity.id]
    );
    changed.push({ activity_id: activity.id, percent_complete: round2(derived) });
  }
  return changed;
}

// The one hook for "measurements of this BOQ item changed" (a new measurement, a review, a verified work
// completion, a daily report): derived allocation figures first, then the quantity-driven activities, then the
// project's progress (and its phases). Every measurement source calls this, so none can forget a step.
async function onMeasurementsChanged(q, { boqItemId, projectId }) {
  await quantityEngine.syncAllocations(q, { boqItemId });
  await quantityEngine.syncBoqItemCompletedQuantity(q, boqItemId);
  const activities = await syncActivityProgressForBoqItem(q, boqItemId);
  const project = await syncProjectProgress(q, projectId);
  return { activities, project };
}

// Portfolio figure over several projects: each project's progress weighted by its contract value, else its
// budget, else equally. A small project counts for less than the main contract (the plain mean treated them alike).
function portfolioWeight(project) {
  const contract = toNum(project.contract_value);
  if (contract > 0) return contract;
  const budget = toNum(project.budget);
  return budget > 0 ? budget : 1;
}
function weightedPortfolioProgress(projects) {
  let sum = 0;
  let weight = 0;
  for (const p of projects) {
    const pct = Math.min(100, Math.max(0, toNum(p.completion_percentage)));
    const w = portfolioWeight(p);
    sum += pct * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0;
}

module.exports = {
  deriveProjectProgress, derivePhaseProgress, syncProjectProgress, syncPhaseProgressForProject,
  syncActivityProgressForBoqItem, onMeasurementsChanged, weightedPortfolioProgress, durationWeighted,
};
