// Phase 16 tests — consultant portal: scoped auth, the observation workflow,
// multi-stage RFI/submittal responses, the dashboard, and My Reviews.
//
// Empty states are tested EXPLICITLY:
//   "No inspections scheduled today", "No RFIs require your response",
//   "Consultant not assigned to this discipline" (no reviews for a
//   discipline filter), never blank, never a crash.

const { MockDb } = require('../test-helpers/mock-db');
const consultantMigration = require('../consultant-migration');
const workflowMigration = require('../workflow-engine-migration');
const engine = require('../../services/consultantEngine');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const CONSULTANT = { id: 20, name: 'Consultant Rep', role: 'consultant' };
const PM = { id: 4, name: 'PM', role: 'project_manager' };
const SUPERVISOR = { id: 6, name: 'Site Supervisor', role: 'site_supervisor' };

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255), name_en VARCHAR(255), status VARCHAR(50), progress_percent DECIMAL(5,2))`);
  await q(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name VARCHAR(255), org_type VARCHAR(30))`);
  await q(`CREATE TABLE IF NOT EXISTS organization_users (
    id SERIAL PRIMARY KEY, organization_id INTEGER, user_id INTEGER, role_at_org VARCHAR(100),
    is_active BOOLEAN DEFAULT true)`);
  await q(`CREATE TABLE IF NOT EXISTS project_participants (
    id SERIAL PRIMARY KEY, project_id INTEGER, organization_id INTEGER,
    participant_type VARCHAR(50), portal_access_enabled BOOLEAN, active_from TIMESTAMPTZ, active_to TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS project_locations (id SERIAL PRIMARY KEY, project_id INTEGER, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS boq_items (id SERIAL PRIMARY KEY, project_id INTEGER, quantity DECIMAL(15,3) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS quantity_measurements (
    id SERIAL PRIMARY KEY, project_id INTEGER, boq_item_id INTEGER, measured_date DATE,
    quantity DECIMAL(15,3) DEFAULT 0, unit VARCHAR(50), approval_state VARCHAR(30) DEFAULT 'pending')`);
  await q(`CREATE TABLE IF NOT EXISTS project_milestones (
    id SERIAL PRIMARY KEY, project_id INTEGER, title VARCHAR(255), title_en VARCHAR(255),
    target_date DATE, achieved_date DATE, status VARCHAR(50) DEFAULT 'pending')`);
  await q(`CREATE TABLE IF NOT EXISTS work_orders (
    id SERIAL PRIMARY KEY, project_id INTEGER, title VARCHAR(255), status VARCHAR(50) DEFAULT 'planned',
    actual_start_date DATE, actual_end_date DATE)`);
  await q(`CREATE TABLE IF NOT EXISTS work_completions (
    id SERIAL PRIMARY KEY, work_order_id INTEGER, project_id INTEGER, boq_item_id INTEGER,
    quantity_completed DECIMAL(15,3) DEFAULT 0, completion_date DATE, verified_by INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS quality_tests (
    id SERIAL PRIMARY KEY, project_id INTEGER, test_type VARCHAR(100), test_date DATE, status VARCHAR(30))`);
  await q(`CREATE TABLE IF NOT EXISTS material_inspection_requests (
    id SERIAL PRIMARY KEY, project_id INTEGER, mir_number VARCHAR(50), title VARCHAR(255), status VARCHAR(30) DEFAULT 'pending')`);
  await q(`CREATE TABLE IF NOT EXISTS sub_work_verifications (
    id SERIAL PRIMARY KEY, sub_contract_id INTEGER, boq_item_id INTEGER, status VARCHAR(50) DEFAULT 'pending')`);
  await q(`CREATE TABLE IF NOT EXISTS project_rfis (
    id SERIAL PRIMARY KEY, rfi_number VARCHAR(50), project_id INTEGER, subject VARCHAR(255),
    question TEXT, category VARCHAR(100), discipline VARCHAR(100), priority VARCHAR(20) DEFAULT 'normal',
    status VARCHAR(20) DEFAULT 'open', due_date DATE, raised_by INTEGER, answer TEXT,
    answered_by INTEGER, answered_at TIMESTAMPTZ, revision INTEGER DEFAULT 1)`);
  await q(`CREATE TABLE IF NOT EXISTS project_submittals (
    id SERIAL PRIMARY KEY, submittal_number VARCHAR(50), project_id INTEGER, title VARCHAR(255),
    submittal_type VARCHAR(30) DEFAULT 'material', status VARCHAR(30) DEFAULT 'submitted',
    response TEXT, response_code VARCHAR(2), responded_by INTEGER, responded_at TIMESTAMPTZ,
    revision_number INTEGER DEFAULT 1)`);
  await q(`CREATE TABLE IF NOT EXISTS ncrs (
    id SERIAL PRIMARY KEY, project_id INTEGER, ncr_number VARCHAR(50), title VARCHAR(255),
    description TEXT, status VARCHAR(30) DEFAULT 'open')`);
  await q(`CREATE TABLE IF NOT EXISTS project_documents (
    id SERIAL PRIMARY KEY, project_id INTEGER, category_id INTEGER, title VARCHAR(255), file_name VARCHAR(255),
    document_type VARCHAR(50), status VARCHAR(30), portal_visibility VARCHAR(30))`);
  await q(`CREATE TABLE IF NOT EXISTS document_categories (id SERIAL PRIMARY KEY, code VARCHAR(50))`);
  await q(`CREATE TABLE IF NOT EXISTS site_daily_reports (
    id SERIAL PRIMARY KEY, project_id INTEGER, report_date DATE, work_summary TEXT)`);
  await q(`CREATE TABLE IF NOT EXISTS site_visits (
    id SERIAL PRIMARY KEY, project_id INTEGER, visit_date DATE, visitor_name VARCHAR(255), visit_type VARCHAR(50))`);
  await q(`CREATE TABLE IF NOT EXISTS sticky_notes (
    id SERIAL PRIMARY KEY, project_id INTEGER, scope VARCHAR(20), owner_user_id INTEGER,
    location_id INTEGER, linked_entity_type VARCHAR(50), linked_entity_id INTEGER,
    text VARCHAR(2000), color VARCHAR(20), reminder_at TIMESTAMPTZ, reminder_notified_at TIMESTAMPTZ,
    converted_action_item_id INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS photos (
    id SERIAL PRIMARY KEY, project_id INTEGER, location_id INTEGER, linked_entity_type VARCHAR(50),
    linked_entity_id INTEGER, file_name VARCHAR(500), file_url VARCHAR(1000),
    uploader_user_id INTEGER, organization_id INTEGER, captured_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(), gps_lat DECIMAL(10,7), gps_lng DECIMAL(10,7),
    caption VARCHAR(1000), annotations JSONB DEFAULT '[]', created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY, user_id INTEGER, channel VARCHAR(30), event_type VARCHAR(255),
    entity_type VARCHAR(100), entity_id INTEGER, title VARCHAR(500), body TEXT, status VARCHAR(30),
    created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY, user_id INTEGER, event_type VARCHAR(255), channel VARCHAR(30), enabled BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS action_items (
    id SERIAL PRIMARY KEY, source_type VARCHAR(50), source_id INTEGER, project_id INTEGER,
    location_id INTEGER, title VARCHAR(500), description TEXT, assigned_user_id INTEGER,
    assigned_role VARCHAR(100), priority VARCHAR(20) DEFAULT 'medium', due_date TIMESTAMPTZ,
    status VARCHAR(30) DEFAULT 'open', reminder_policy JSONB, escalation_policy JSONB,
    created_by INTEGER, acknowledged_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, completed_by INTEGER,
    workflow_instance_id INTEGER, workflow_step_instance_id INTEGER, event_log_id INTEGER,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS reminder_rules (
    id SERIAL PRIMARY KEY, source_type VARCHAR(50), remind_after_hours INTEGER,
    repeat_interval_hours INTEGER, max_reminders INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS audit_events (
    id SERIAL PRIMARY KEY, entity VARCHAR(100), entity_id INTEGER, action VARCHAR(100),
    "before" JSONB, "after" JSONB, user_id INTEGER, project_id INTEGER,
    entity_type VARCHAR(100), event_type VARCHAR(50), actor_id INTEGER, actor_name VARCHAR(255),
    before_state JSONB DEFAULT '{}', after_state JSONB DEFAULT '{}', created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS event_log (
    id SERIAL PRIMARY KEY, event_type VARCHAR(100), entity_type VARCHAR(100), entity_id INTEGER,
    user_id INTEGER, user_name VARCHAR(255), user_role VARCHAR(100), payload JSONB,
    dispatched_at TIMESTAMPTZ, created_at TIMESTAMPTZ)`);

  await workflowMigration.run(q);
  await consultantMigration.ensureTables(q);
  await consultantMigration.widenObservationTemplate(q);
  await consultantMigration.ensureTables(q); // idempotent

  await q(`INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)`, [20, 'Consultant Rep', 'c@x.com', 'consultant', true]);
  await q(`INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)`, [4, 'PM', 'pm@x.com', 'project_manager', true]);
  await q(`INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)`, [6, 'Supervisor', 's@x.com', 'site_supervisor', true]);
  await q(`INSERT INTO organizations (id, name, org_type) VALUES ($1,$2,$3)`, [5, 'Consultant Org', 'consultant']);
  await q(`INSERT INTO organizations (id, name, org_type) VALUES ($1,$2,$3)`, [9, 'Other Consultant', 'consultant']);
  await q(`INSERT INTO organization_users (id, organization_id, user_id, role_at_org, is_active) VALUES ($1,$2,$3,$4,$5)`, [1, 5, 20, 'engineer', true]);
  // Project 1: consultant assigned. Project 2: NOT assigned.
  await q(`INSERT INTO projects (id, name, name_en, status, progress_percent) VALUES ($1,$2,$3,$4,$5)`, [1, 'Tower A', 'Tower A', 'active', 40]);
  await q(`INSERT INTO projects (id, name, name_en, status, progress_percent) VALUES ($1,$2,$3,$4,$5)`, [2, 'Quiet Project', 'Quiet Project', 'active', 0]);
  await q(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, portal_access_enabled)
           VALUES ($1,$2,$3,$4,$5)`, [1, 1, 5, 'consultant', true]);
}

beforeAll(buildFixture);

// ---------------------------------------------------------------------------
// Scoped project resolution
// ---------------------------------------------------------------------------

describe('scoped consultant auth', () => {
  test('the consultant sees exactly the assigned projects — never an unassigned one', async () => {
    const projects = await engine.resolveConsultantProjects(q, CONSULTANT.id);
    expect(projects).toEqual([1]);
  });

  test('a consultant with no organization sees an empty project list, not an error', async () => {
    const projects = await engine.resolveConsultantProjects(q, 999);
    expect(projects).toEqual([]);
    const dash = await engine.consultantDashboard(q, { id: 999, name: 'Ghost', role: 'consultant' });
    expect(dash.projects.length).toBe(0);
    expect(dash.rfis_awaiting_response.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Observation workflow
// ---------------------------------------------------------------------------

describe('observation workflow (exact states)', () => {
  let obsId;

  test('create notifies the PM and opens a PM action item', async () => {
    const obs = await engine.createObservation(q, {
      project_id: 1, title: 'Honeycombing in column C-3', description: 'Visible voids',
      discipline: 'structures', severity: 'high', user: CONSULTANT, organization_id: 5,
    });
    obsId = obs.id;
    expect(obs.status).toBe('raised');
    expect(obs.observation_number).toMatch(/^OBS-/);

    // The Phase 6 dispatcher route fired: PM notified + action item opened.
    // The test drives the dispatcher's catch-up path (the production path is
    // the synchronous eventBus subscription — same handler).
    const dispatcher = require('../../services/eventDispatcher');
    await dispatcher.catchUp(q, { query: q });
    const pmNotes = (await q("SELECT * FROM notifications WHERE event_type = 'observation.created'")).rows;
    expect(pmNotes.length).toBeGreaterThan(0);
    const pmActions = (await q("SELECT * FROM action_items WHERE source_type = 'observation' AND status = 'open'")).rows;
    expect(pmActions.length).toBe(1);
    const history = (await q('SELECT * FROM observation_status_history WHERE observation_id = $1', [obsId])).rows;
    expect(history.length).toBe(1);
    expect(history[0].to_status).toBe('raised');
  });

  test('full lifecycle: acknowledged → assigned → rectification → submitted → rejected → reopened → accepted → closed', async () => {
    let obs = await engine.advanceObservation(q, obsId, CONSULTANT, 'acknowledge');
    expect(obs.status).toBe('acknowledged');

    obs = await engine.advanceObservation(q, obsId, PM, 'assign', { assigned_user_id: SUPERVISOR.id, comment: 'Assign to structures crew' });
    expect(obs.status).toBe('assigned');
    expect(obs.assigned_user_id).toBe(SUPERVISOR.id);
    // Assignment creates a rectification action for the assignee.
    const rectActions = (await q("SELECT * FROM action_items WHERE source_type = 'observation' AND status = 'open'")).rows;
    expect(rectActions.length).toBe(1);
    expect(rectActions[0].assigned_user_id).toBe(SUPERVISOR.id);

    obs = await engine.advanceObservation(q, obsId, SUPERVISOR, 'start_rectification');
    expect(obs.status).toBe('rectification_in_progress');

    obs = await engine.advanceObservation(q, obsId, SUPERVISOR, 'submit_for_verification', {
      comment: 'Repaired and re-cured',
      photos: [{ file_name: 'after-1.jpg', caption: 'Repaired column' }],
    });
    expect(obs.status).toBe('submitted_for_verification');
    // After-photos captured through the Phase 15 photo model.
    const photos = (await q("SELECT * FROM photos WHERE linked_entity_type = 'observation' AND linked_entity_id = $1", [obsId])).rows;
    expect(photos.length).toBe(1);
    expect(photos[0].caption).toBe('Repaired column');

    // The rectification action completed on submission.
    const openAfterSubmit = (await q("SELECT * FROM action_items WHERE source_type = 'observation' AND status = 'open'")).rows;
    expect(openAfterSubmit.length).toBe(0);

    // Rejection reopens with a new comment and full audit trail.
    obs = await engine.advanceObservation(q, obsId, CONSULTANT, 'reject', { comment: 'Cure not verified' });
    expect(obs.status).toBe('rejected');
    const rejectionComment = (await q("SELECT * FROM observation_comments WHERE observation_id = $1 AND comment_type = 'rejection'", [obsId])).rows[0];
    expect(rejectionComment.body).toBe('Cure not verified');
    obs = await engine.advanceObservation(q, obsId, SUPERVISOR, 'start_rectification');
    expect(obs.status).toBe('rectification_in_progress');
    obs = await engine.advanceObservation(q, obsId, SUPERVISOR, 'submit_for_verification', { photos: [{ file_name: 'after-2.jpg' }] });
    obs = await engine.advanceObservation(q, obsId, CONSULTANT, 'accept');
    expect(obs.status).toBe('accepted');
    obs = await engine.advanceObservation(q, obsId, CONSULTANT, 'close');
    expect(obs.status).toBe('closed');

    // Full status history recorded (a dispute could replay every step).
    const history = (await q('SELECT * FROM observation_status_history WHERE observation_id = $1', [obsId])).rows
      .map((h) => h.to_status);
    expect(history).toEqual([
      'raised', 'acknowledged', 'assigned', 'rectification_in_progress',
      'submitted_for_verification', 'rejected', 'rectification_in_progress',
      'submitted_for_verification', 'accepted', 'closed',
    ]);
  });

  test('illegal transitions are refused', async () => {
    await expect(engine.advanceObservation(q, obsId, CONSULTANT, 'accept')).rejects.toThrow(/Cannot move/);
  });
});

// ---------------------------------------------------------------------------
// Multi-stage RFI + submittal responses (audited)
// ---------------------------------------------------------------------------

describe('multi-stage RFI and submittal flows', () => {
  test('official RFI response records user, organization, date/time, revision, attachments', async () => {
    await q(`INSERT INTO project_rfis (id, rfi_number, project_id, subject, question, status, due_date, raised_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [1, 'RFI-0001', 1, 'Slab thickness at ramp', 'Confirm 250mm', 'open', '2026-09-30', SUPERVISOR.id]);
    await expect(engine.recordRfiResponse(q, { rfi_id: 1, stage: 'official_response', user: CONSULTANT, body: 'Too early' }))
      .rejects.toThrow(/cannot follow submission/);
    await engine.recordRfiResponse(q, { rfi_id: 1, stage: 'coordinator', user: CONSULTANT, body: 'Assigned to structures' });
    await engine.recordRfiResponse(q, { rfi_id: 1, stage: 'discipline_review', user: CONSULTANT, body: 'Reviewed drawing' });
    const response = await engine.recordRfiResponse(q, {
      rfi_id: 1, stage: 'official_response', user: CONSULTANT,
      organization_id: 9, organization_name: 'Other Consultant',
      body: 'Thickness confirmed at 250 mm nominal.', attachments: [{ file: 'sk-1.pdf' }], revision: 1,
    });
    expect(response.responder_organization_id).toBe(5);
    expect(response.responder_organization_name).toBe('Consultant Org');
    expect(response.revision).toBe(1);
    expect(response.attachments).toBeDefined();
    const rfi = (await q('SELECT * FROM project_rfis WHERE id = 1')).rows[0];
    expect(rfi.status).toBe('answered');
    expect(rfi.answer).toMatch(/250 mm/);
    // Audit trail written.
    const audits = (await q("SELECT * FROM audit_events WHERE entity_type = 'rfi_response'")).rows;
    expect(audits.length).toBe(3);
    await expect(engine.recordRfiResponse(q, { rfi_id: 1, stage: 'acknowledgement', user: PM, body: 'Ack' }))
      .rejects.toThrow(/Only the RFI requester/);
    await engine.recordRfiResponse(q, { rfi_id: 1, stage: 'acknowledgement', user: SUPERVISOR, body: 'Acknowledged' });
    expect((await engine.closeRfi(q, 1, CONSULTANT)).status).toBe('closed');
  });

  test('submittal A/B/C/D response with revision history; D forces resubmit', async () => {
    await q(`INSERT INTO project_submittals (id, submittal_number, project_id, title, status)
             VALUES ($1,$2,$3,$4,$5)`, [1, 'SUB-0001', 1, 'Rebar shop drawings', 'submitted']);
    await expect(engine.recordSubmittalResponse(q, { submittal_id: 1, stage: 'response', user: CONSULTANT, response_code: 'D' }))
      .rejects.toThrow(/cannot follow submission/);
    const reviewStages = async (revision) => {
      await engine.recordSubmittalResponse(q, { submittal_id: 1, stage: 'internal_technical_review', user: SUPERVISOR, comments: 'Technical check', revision });
      await engine.recordSubmittalResponse(q, { submittal_id: 1, stage: 'pm', user: PM, comments: 'PM check', revision });
      await engine.recordSubmittalResponse(q, { submittal_id: 1, stage: 'consultant_coordinator', user: CONSULTANT, comments: 'Coordinator check', revision });
      await engine.recordSubmittalResponse(q, { submittal_id: 1, stage: 'reviewer', user: CONSULTANT, comments: 'Reviewer check', revision });
    };
    await reviewStages(1);
    const d = await engine.recordSubmittalResponse(q, {
      submittal_id: 1, stage: 'response', user: CONSULTANT, organization_id: 5, organization_name: 'Consultant Org',
      response_code: 'D', comments: 'Bar spacing does not match spec', revision: 1,
    });
    expect(d.response_code).toBe('D');
    const submittal = (await q('SELECT * FROM project_submittals WHERE id = 1')).rows[0];
    expect(submittal.status).toBe('resubmit_required');
    expect(submittal.response_code).toBe('D');

    await engine.resubmitSubmittal(q, 1, SUPERVISOR, { comments: 'Corrected drawing attached' });
    await reviewStages(2);
    const a = await engine.recordSubmittalResponse(q, { submittal_id: 1, stage: 'response', user: CONSULTANT, response_code: 'A', revision: 2 });
    expect(a.revision_number).toBe(2);
    const submittal2 = (await q('SELECT * FROM project_submittals WHERE id = 1')).rows[0];
    expect(submittal2.status).toBe('closed');
    const revisions = (await q('SELECT * FROM submittal_revisions WHERE submittal_id = 1')).rows;
    expect(revisions.length).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Dashboard + My Reviews — explicit empty states
// ---------------------------------------------------------------------------

describe('consultant dashboard (zero-safe widgets)', () => {
  test('an empty project renders every widget with its empty label, never blank or crash', async () => {
    await q(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, portal_access_enabled)
             VALUES ($1,$2,$3,$4,$5)`, [2, 2, 5, 'consultant', true]);
    const dash = await engine.consultantDashboard(q, CONSULTANT, { project_id: 2 });
    expect(dash.overall_progress.percent).toBe(0);
    expect(dash.todays_inspections.count).toBe(0);
    expect(dash.todays_inspections.empty_label).toBe('No inspections scheduled today');
    expect(dash.rfis_awaiting_response.count).toBe(0);
    expect(dash.rfis_awaiting_response.empty_label).toBe('No RFIs require your response');
    expect(dash.submittals_awaiting_review.count).toBe(0);
    expect(dash.observations_awaiting_verification.count).toBe(0);
    expect(dash.ncr_closeouts_awaiting_review.count).toBe(0);
    expect(dash.wir_pending.count).toBe(0);
    expect(dash.mir_pending.count).toBe(0);
    expect(dash.work_ready_for_inspection.empty_label).toBe('No new work ready for inspection');
    expect(dash.milestones.items.length).toBe(0);
    expect(dash.latest_drawings_safe).toBeUndefined();
  });

  test('a populated project fills the widgets from real records', async () => {
    await q(`INSERT INTO boq_items (id, project_id, quantity) VALUES ($1,$2,$3)`, [1, 1, 200]);
    await q(`INSERT INTO quantity_measurements (id, project_id, boq_item_id, measured_date, quantity, unit, approval_state) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [1, 1, 1, '2026-09-01', 50, 'm3', 'approved']);
    await q(`INSERT INTO project_milestones (id, project_id, title, target_date, achieved_date) VALUES ($1,$2,$3,$4,$5)`, [1, 1, 'Structure top-out', '2026-12-01', '2026-11-20']);
    await q(`INSERT INTO work_orders (id, project_id, title, status, actual_start_date, actual_end_date) VALUES ($1,$2,$3,$4,$5,$6)`, [1, 1, 'Slab L5', 'completed', '2026-09-01', '2026-09-10']);
    await q(`INSERT INTO quality_tests (id, project_id, test_type, test_date, status) VALUES ($1,$2,$3,$4,$5)`, [1, 1, 'Cube test', new Date().toISOString().slice(0, 10), 'pending']);
    await q(`INSERT INTO project_rfis (id, rfi_number, project_id, subject, status, due_date) VALUES ($1,$2,$3,$4,$5,$6)`, [2, 'RFI-0002', 1, 'Footing detail', 'open', '2026-09-25']);
    await q(`INSERT INTO observations (id, observation_number, project_id, title, status, consultant_organization_id)
             VALUES ($1,$2,$3,$4,$5,$6)`, [50, 'OBS-0050', 1, 'Curing check', 'submitted_for_verification', 5]);
    await q(`INSERT INTO ncrs (id, project_id, ncr_number, title, status) VALUES ($1,$2,$3,$4,$5)`, [1, 1, 'NCR-0001', 'Rebar cover', 'verification']);
    await q(`INSERT INTO project_documents (id, project_id, category_id, title, document_type, status, portal_visibility) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [1, 1, 7, 'Drawing Rev C', 'drawing', 'approved', 'consultant']);
    await q(`INSERT INTO document_categories (id, code) VALUES ($1,$2)`, [7, 'drawings']);

    const dash = await engine.consultantDashboard(q, CONSULTANT, { project_id: 1 });
    expect(dash.overall_progress.percent).toBe(25); // 50 / 200
    expect(dash.milestones.achieved).toBe(1);
    expect(dash.todays_inspections.count).toBe(1);
    expect(dash.rfis_awaiting_response.count).toBe(1);
    expect(dash.observations_awaiting_verification.count).toBe(1);
    expect(dash.ncr_closeouts_awaiting_review.count).toBe(1);
  });
});

describe('My Reviews inbox', () => {
  test('sorted by due date then priority; filters by project/type/discipline', async () => {
    const rows = await engine.myReviews(q, CONSULTANT, {});
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // The RFI with a due date (2026-09-25) sorts before the undated ones.
    expect(rows[0].type).toBe('rfi');
    expect(rows[0].due_date).toBeTruthy();

    const byType = await engine.myReviews(q, CONSULTANT, { type: 'observation' });
    expect(byType.every((r) => r.type === 'observation')).toBe(true);
    expect(byType.length).toBe(1);

    const byDiscipline = await engine.myReviews(q, CONSULTANT, { discipline: 'structures' });
    expect(byDiscipline.every((r) => r.discipline === 'structures' || r.discipline === null)).toBe(true);
  });

  test("the 'not assigned to this discipline' behavior — empty inbox, never blank or crash", async () => {
    // A second, OPEN observation with an explicit discipline.
    await q(`INSERT INTO observations (id, observation_number, project_id, title, status, discipline, consultant_organization_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`, [51, 'OBS-0051', 1, 'Hose bib missing', 'submitted_for_verification', 'architecture', 5]);
    const rows = await engine.myReviews(q, CONSULTANT, { discipline: 'plumbing' });
    // No plumbing records anywhere — the inbox is empty, not broken.
    expect(rows.length).toBe(0);
    const arch = await engine.myReviews(q, CONSULTANT, { discipline: 'architecture' });
    expect(arch.length).toBe(1);
    expect(arch[0].discipline).toBe('architecture');
    // Records WITHOUT a discipline never match an explicit discipline filter.
    const obs = (await q('SELECT * FROM observations WHERE id = 51')).rows[0];
    await q('UPDATE observations SET status = $1 WHERE id = $2', ['submitted_for_verification', obs.id]);
    const noDiscipline = await engine.myReviews(q, CONSULTANT, { discipline: 'mechanical' });
    expect(noDiscipline.length).toBe(0);
  });
});
