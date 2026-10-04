// Phase 5 — project provisioning service.
//
// Turns project creation into one atomic transaction: the project row, root
// location, root WBS node, user_project_roles for the assigned team, default
// project_participants, workflow instances (stubbed until Phase 6 builds the
// workflow engine), standard folder/register rows, numbering sequences and
// default dashboard preferences are ALL created inside the caller's
// transaction client. Any step that throws rolls everything back — no
// half-created project.
//
// The caller (POST /api/projects with the wizard enabled, or POST
// /api/projects/wizard) wraps this in db.transaction(client => ...). Tests
// inject a mock client with snapshot/rollback semantics.

'use strict';

const numbering = require('./numbering');
const teamService = require('./teamService');

// Standard content every project gets even without a template.
const DEFAULT_FOLDERS = [
  { code: 'contracts', name: 'Contracts', folder_type: 'documents' },
  { code: 'drawings', name: 'Drawings', folder_type: 'documents' },
  { code: 'boq', name: 'BOQ and CBS', folder_type: 'documents' },
  { code: 'submittals', name: 'Submittals', folder_type: 'submittals' },
  { code: 'rfi', name: 'RFIs', folder_type: 'rfi' },
  { code: 'hse', name: 'HSE', folder_type: 'documents' },
  { code: 'financial', name: 'Financial', folder_type: 'documents' },
];

const DEFAULT_REGISTERS = [
  { code: 'site-diary', name: 'Site diary', register_type: 'log' },
  { code: 'safety-incidents', name: 'Safety incidents', register_type: 'log' },
  { code: 'inspections', name: 'Inspections', register_type: 'log' },
  { code: 'correspondence', name: 'Correspondence', register_type: 'log' },
];

const NUMBERED_ENTITIES = [
  'invoices', 'payments', 'expenses', 'work_orders', 'purchase_orders', 'grn',
];

// Team role (project_team.role) -> the canonical role template whose grants the seat inherits.
// supervisor and foreman have no canonical role: they stay a project_team row only, with no access
// grant of their own (set the key here to give them one).
const TEAM_ROLE_TEMPLATES = {
  project_manager: 'project_manager',
  site_engineer: 'site_engineer',
  qs: 'quantity_surveyor',
  safety_officer: 'hse_manager',
  supervisor: null,
  foreman: null,
};

// Reports every project starts with, scheduled through the reports engine (scheduled_reports) and
// addressed to the user who created the project.
const DEFAULT_REPORTS = [
  { report_key: 'schedule_activities', name: 'Weekly schedule status', frequency: 'weekly', format: 'pdf' },
  { report_key: 'ncrs', name: 'Weekly NCR register', frequency: 'weekly', format: 'pdf' },
  { report_key: 'incidents', name: 'Monthly incident register', frequency: 'monthly', format: 'pdf' },
  { report_key: 'variations', name: 'Monthly variations register', frequency: 'monthly', format: 'pdf' },
];

const DEFAULT_DASHBOARD_PREFERENCES = [
  { preference_key: 'layout', preference_value: { widgets: ['progress', 'cost', 'schedule', 'alerts'] } },
  { preference_key: 'locale', preference_value: { default: 'en' } },
];

// ---------------------------------------------------------------------------
// Helpers (all queries go through the injected client)
// ---------------------------------------------------------------------------

async function resolveTemplate(client, templateKey) {
  if (!templateKey) return null;
  const t = await client.query('SELECT id, key, name, project_type, default_values FROM project_templates WHERE key = $1', [templateKey]);
  return t.rows[0] || null;
}

function generateProjectCode(seq) {
  return `PRJ-${String(seq).padStart(4, '0')}`;
}

async function nextProjectNumber(client) {
  return numbering.nextNumber((t, p) => client.query(t, p), { table: 'projects', column: 'code', prefix: 'PRJ', pad: 4 });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  return v == null || String(v).trim() === '' ? null : String(v);
}

async function insertProject(client, payload, code) {
  const r = await client.query(
    `INSERT INTO projects (
      code, name, name_ar, name_en, address, city, project_type,
      client_id, project_manager_id, contract_value, budget,
      start_date, expected_completion, status,
      project_number, country, gps_latitude, gps_longitude, timezone, currency,
      tax_profile, original_contract_value, original_budget,
      dlp_period_months, warranty_period_months,
      retention_percentage, retention_cap_amount,
      advance_payment_amount, advance_payment_percentage,
      liquidated_damages_rate, liquidated_damages_cap
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31
    ) RETURNING id`,
    [
      code,
      str(payload.name_ar), str(payload.name_ar), str(payload.name_en || payload.name_ar),
      str(payload.address), str(payload.city), str(payload.project_type) || 'commercial',
      payload.client_id == null ? null : num(payload.client_id),
      payload.project_manager_id == null ? null : num(payload.project_manager_id),
      num(payload.contract_value) ?? 0, num(payload.budget) ?? 0,
      str(payload.start_date), str(payload.expected_completion), str(payload.status) || 'planning',
      str(payload.project_number) || code,
      str(payload.country), num(payload.gps_latitude), num(payload.gps_longitude),
      str(payload.timezone) || 'Africa/Cairo', str(payload.currency) || 'EGP',
      str(payload.tax_profile) || 'standard_vat',
      num(payload.original_contract_value) ?? num(payload.contract_value) ?? 0,
      num(payload.original_budget) ?? num(payload.budget) ?? 0,
      num(payload.dlp_period_months), num(payload.warranty_period_months),
      num(payload.retention_percentage), num(payload.retention_cap_amount),
      num(payload.advance_payment_amount), num(payload.advance_payment_percentage),
      num(payload.liquidated_damages_rate), num(payload.liquidated_damages_cap),
    ]
  );
  // Read the row back (RETURNING * is not portable to the mock executor).
  const back = await client.query('SELECT * FROM projects WHERE id = $1', [r.rows[0].id]);
  return back.rows[0];
}

async function insertRootLocation(client, project) {
  const typeRes = await client.query("SELECT id FROM location_types WHERE code = 'site'");
  const typeId = typeRes.rows[0] ? typeRes.rows[0].id : null;
  const r = await client.query(
    `INSERT INTO project_locations (project_id, parent_id, location_type_id, code, name, name_en, name_ar, sort_order)
     VALUES ($1, NULL, $2, $3, $4, $5, $6, 0) RETURNING id`,
    [project.id, typeId, 'ROOT', project.name_en || project.name_ar, project.name_en, project.name_ar]
  );
  return r.rows[0];
}

async function insertRootWbs(client, project) {
  const r = await client.query(
    `INSERT INTO wbs_nodes (project_id, parent_id, code, name, name_en, name_ar, wbs_level, sort_order)
     VALUES ($1, NULL, $2, $3, $4, $5, 1, 0) RETURNING id`,
    [project.id, 'ROOT', project.name_en || project.name_ar, project.name_en, project.name_ar]
  );
  return r.rows[0];
}

// Physical structure from a template: parent resolution is a JS map walk in
// sort order (parents are always emitted before children by the seed), so no
// recursive SQL is needed — mock-db and PostgreSQL both behave identically.
async function provisionTemplateLocations(client, project, templateId) {
  const locTypes = await client.query('SELECT id, code FROM location_types');
  const typeByCode = new Map(locTypes.rows.map((t) => [t.code, t.id]));
  const rows = await client.query(
    'SELECT parent_code, code, location_type_code, name, name_en, name_ar, sort_order FROM template_locations WHERE template_id = $1 ORDER BY sort_order, id',
    [templateId]
  );
  const codeToId = new Map();
  let count = 0;
  for (const loc of rows.rows) {
    const parentId = loc.parent_code ? codeToId.get(loc.parent_code) ?? null : null;
    const r = await client.query(
      `INSERT INTO project_locations (project_id, parent_id, location_type_id, code, name, name_en, name_ar, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [project.id, parentId, typeByCode.get(loc.location_type_code) ?? null, loc.code, loc.name, loc.name_en, loc.name_ar, loc.sort_order]
    );
    codeToId.set(loc.code, r.rows[0].id);
    count++;
  }
  return count;
}

// Blank-structure projects can still pass an explicit location tree — e.g. an
// infrastructure project using chainage-type locations (CH-0+000, CH-0+500 …).
// Top-level rows (no parent_code) attach to the project root location.
async function provisionCustomLocations(client, project, structure, rootLocationId) {
  if (!Array.isArray(structure) || structure.length === 0) return 0;
  const locTypes = await client.query('SELECT id, code FROM location_types');
  const typeByCode = new Map(locTypes.rows.map((t) => [t.code, t.id]));
  const codeToId = new Map([['ROOT', rootLocationId]]);
  let count = 0;
  for (const [i, loc] of structure.entries()) {
    const explicitParent = loc.parent_code ? codeToId.get(loc.parent_code) ?? null : null;
    const parentId = loc.parent_code ? explicitParent : (rootLocationId ?? null);
    const r = await client.query(
      `INSERT INTO project_locations (project_id, parent_id, location_type_id, code, name, name_en, name_ar, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        project.id, parentId,
        typeByCode.get(loc.location_type_code || loc.location_type) ?? null,
        str(loc.code) || `LOC-${i + 1}`,
        str(loc.name) || str(loc.name_en) || `Location ${i + 1}`,
        str(loc.name_en), str(loc.name_ar),
        num(loc.sort_order) ?? i + 1,
      ]
    );
    codeToId.set(loc.code, r.rows[0].id);
    count++;
  }
  return count;
}

async function provisionTemplateWbs(client, project, templateId, rootWbsId) {
  const rows = await client.query(
    'SELECT parent_code, code, name, name_en, name_ar, wbs_level, sort_order FROM template_wbs WHERE template_id = $1 ORDER BY sort_order, id',
    [templateId]
  );
  const codeToId = new Map([['ROOT', rootWbsId]]);
  let count = 0;
  for (const node of rows.rows) {
    const parentId = node.parent_code ? codeToId.get(node.parent_code) ?? rootWbsId : rootWbsId;
    const level = Number(node.wbs_level) || (node.parent_code ? 2 : 1);
    const r = await client.query(
      `INSERT INTO wbs_nodes (project_id, parent_id, code, name, name_en, name_ar, wbs_level, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [project.id, parentId, node.code, node.name, node.name_en, node.name_ar, level, node.sort_order]
    );
    codeToId.set(node.code, r.rows[0].id);
    count++;
  }
  return count;
}

// project_team rows for the wizard's team list (who works on the project).
async function provisionTeam(client, project, teamMembers) {
  const teamRows = Array.isArray(teamMembers) ? teamMembers : [];
  let rows = 0;
  for (const member of teamRows) {
    const employeeId = num(member.employee_id);
    if (employeeId == null) continue;
    await client.query(
      'INSERT INTO project_team (project_id, employee_id, role) VALUES ($1, $2, $3)',
      [project.id, employeeId, str(member.role) || 'site_engineer']
    );
    rows++;
  }
  return rows;
}

// Role assignments: a team member that maps to a login account gets a seat on THIS project for the role
// template of their team role (TEAM_ROLE_TEMPLATES), through the same service as POST /api/team, so the
// seat inherits the role's grants and notification subscriptions. The seat is the access grant; it is
// never copied from the user's legacy global role. A refused seat (inactive user, unknown role) fails the
// whole wizard transaction: the project is not created half-staffed.
async function provisionRoleAssignments(client, project, teamMembers, grantedBy) {
  const q = (text, params) => client.query(text, params);
  const rows = Array.isArray(teamMembers) ? teamMembers : [];
  let seated = 0;
  for (const member of rows) {
    const roleKey = TEAM_ROLE_TEMPLATES[str(member.role) || 'site_engineer'];
    if (!roleKey) continue;
    let userId = member.user_id != null ? num(member.user_id) : null;
    if (userId == null && member.email) {
      const u = await q('SELECT id FROM users WHERE email = $1', [member.email]);
      if (u.rows[0]) userId = u.rows[0].id;
    }
    if (userId == null) continue;
    await teamService.assignTeamMember(q, { project_id: project.id, user_id: userId, role_key: roleKey, granted_by: grantedBy });
    seated++;
  }
  return seated;
}

// Default reports: scheduled through the reports engine, addressed to the creating user.
async function provisionDefaultReports(client, project, createdBy) {
  let count = 0;
  for (const rpt of DEFAULT_REPORTS) {
    await client.query(
      `INSERT INTO scheduled_reports (project_id, report_key, name, frequency, recipients, format, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [project.id, rpt.report_key, rpt.name, rpt.frequency, JSON.stringify(createdBy != null ? [createdBy] : []), rpt.format, createdBy || null]
    );
    count++;
  }
  return count;
}

// Default project_participants: one internal-team sentinel row, plus the
// client organization when one is assigned, plus any explicit wizard
// participants. A project with NO client explicitly gets only the internal
// participant — the Client Portal (Phase 17) must render "No client
// assigned", not error.
async function provisionParticipants(client, project, payload) {
  let count = 0;
  const internalOrg = await client.query("SELECT id FROM organizations WHERE code = 'INTERNAL'");
  const internalOrgId = internalOrg.rows[0] ? internalOrg.rows[0].id : null;
  if (internalOrgId != null) {
    await client.query(
      `INSERT INTO project_participants (project_id, organization_id, participant_type, role_label, active_from, portal_access_enabled, visibility_policy)
       VALUES ($1, $2, 'internal_team_member', 'project_team', NOW(), false, $3)`,
      [project.id, internalOrgId, str(payload.visibility_policy) || 'standard']
    );
    count++;
  }
  const addOrgParticipant = async (organizationId, participantType, portalAccess) => {
    if (organizationId == null) return;
    await client.query(
      `INSERT INTO project_participants (project_id, organization_id, participant_type, role_label, active_from, portal_access_enabled, visibility_policy)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6)`,
      [
        project.id, organizationId, participantType, participantType,
        portalAccess === true, str(payload.visibility_policy) || 'standard',
      ]
    );
    count++;
  };
  const resolveClientOrg = async (clientId) => {
    const orgRes = await client.query(
      'SELECT organization_id FROM _migration_client_org_map WHERE old_client_id = $1',
      [num(clientId)]
    );
    return orgRes.rows[0] && orgRes.rows[0].organization_id != null ? num(orgRes.rows[0].organization_id) : null;
  };

  if (payload.client_id != null) {
    await addOrgParticipant(await resolveClientOrg(payload.client_id), 'client', true);
  }
  const extra = Array.isArray(payload.participants) ? payload.participants : [];
  for (const p of extra) {
    const organizationId = p.organization_id != null ? num(p.organization_id) : await resolveClientOrg(p.client_id);
    await addOrgParticipant(organizationId, str(p.participant_type) || 'consultant', p.portal_access_enabled);
  }
  return count;
}

// The project's workflow register: one row per ACTIVE engine template (workflow_templates), with the
// steps and resolvers the engine will actually run for this project's documents. Rows are linked to the
// real engine by workflow_code = workflow_templates.key, so a provisioned workflow is never a name the
// engine cannot start. (The descriptive template_workflows rows of a project template used codes the
// engine never had, e.g. material_approval, and are no longer copied.)
async function provisionWorkflows(client, project) {
  const templates = await client.query('SELECT id, key, name, description FROM workflow_templates WHERE is_active = $1 ORDER BY key', [true]);
  let count = 0;
  for (const t of templates.rows) {
    const steps = await client.query(
      'SELECT step_key, resolver_type, resolver_value FROM workflow_steps WHERE template_id = $1 ORDER BY sort_order, id', [t.id]);
    if (steps.rows.length === 0) continue; // a template with no steps cannot run, so it is not a project workflow
    await client.query(
      `INSERT INTO project_workflows (project_id, workflow_code, name, description, steps, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [project.id, t.key, t.name, t.description || null,
        JSON.stringify(steps.rows.map((s) => ({ stage: s.step_key, resolver: s.resolver_type, role: s.resolver_value })))]
    );
    count++;
  }
  return count;
}

async function provisionFoldersAndRegisters(client, project, templateId) {
  let folders = DEFAULT_FOLDERS;
  let registers = DEFAULT_REGISTERS;
  if (templateId != null) {
    const tf = await client.query(
      'SELECT code, name, folder_type FROM template_folders WHERE template_id = $1 ORDER BY sort_order, id',
      [templateId]
    );
    if (tf.rows.length > 0) {
      folders = tf.rows.map((f) => ({ code: f.code, name: f.name, folder_type: f.folder_type }));
    }
  }
  let count = 0;
  for (const [i, f] of folders.entries()) {
    await client.query(
      `INSERT INTO project_folders (project_id, code, name, folder_type, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [project.id, f.code, f.name, f.folder_type || 'documents', i]
    );
    count++;
  }
  for (const reg of registers) {
    await client.query(
      `INSERT INTO project_registers (project_id, code, name, register_type)
       VALUES ($1, $2, $3, $4)`,
      [project.id, reg.code, reg.name, reg.register_type]
    );
    count++;
  }
  return count;
}

async function provisionNumbering(client, project) {
  let count = 0;
  for (const entity of NUMBERED_ENTITIES) {
    await client.query(
      'INSERT INTO numbering_sequences (project_id, entity, prefix) VALUES ($1, $2, $3)',
      [project.id, entity, `${project.code}-${entity.slice(0, 3).toUpperCase()}-`]
    );
    count++;
  }
  return count;
}

async function provisionDashboardPreferences(client, project) {
  let count = 0;
  for (const pref of DEFAULT_DASHBOARD_PREFERENCES) {
    await client.query(
      'INSERT INTO project_dashboard_preferences (project_id, preference_key, preference_value) VALUES ($1, $2, $3)',
      [project.id, pref.preference_key, JSON.stringify(pref.preference_value)]
    );
    count++;
  }
  return count;
}

// Empty-state helper for the Client Portal (Phase 17): a project with no
// client assigned resolves to an explicit label instead of an error.
function resolveClientLabel(project) {
  if (!project || project.client_id == null) return 'No client assigned';
  return project.client_name_en || project.client_name_ar || 'No client assigned';
}

// ---------------------------------------------------------------------------
// Steps — each receives ctx { client, payload, project, templateId } and
// throws on failure so the caller's transaction rolls everything back.
// ---------------------------------------------------------------------------

const PROVISION_STEPS = [
  { name: 'root_location', run: async (ctx) => (ctx.rootLocation = await insertRootLocation(ctx.client, ctx.project)) ? 1 : 0 },
  { name: 'root_wbs', run: async (ctx) => (ctx.rootWbs = await insertRootWbs(ctx.client, ctx.project)) ? 1 : 0 },
  {
    name: 'template_structure',
    run: async (ctx) => {
      if (!ctx.templateId) return 0;
      const locations = await provisionTemplateLocations(ctx.client, ctx.project, ctx.templateId);
      const wbs = await provisionTemplateWbs(ctx.client, ctx.project, ctx.templateId, ctx.rootWbs.id);
      return locations + wbs;
    },
  },
  { name: 'custom_structure', run: async (ctx) => provisionCustomLocations(ctx.client, ctx.project, ctx.payload.structure, ctx.rootLocation && ctx.rootLocation.id) },
  { name: 'team', run: async (ctx) => provisionTeam(ctx.client, ctx.project, ctx.payload.team) },
  { name: 'role_assignments', run: async (ctx) => provisionRoleAssignments(ctx.client, ctx.project, ctx.payload.team, ctx.createdBy) },
  { name: 'participants', run: async (ctx) => provisionParticipants(ctx.client, ctx.project, ctx.payload) },
  { name: 'workflows', run: async (ctx) => provisionWorkflows(ctx.client, ctx.project) },
  { name: 'default_reports', run: async (ctx) => provisionDefaultReports(ctx.client, ctx.project, ctx.createdBy) },
  { name: 'folders_registers', run: async (ctx) => provisionFoldersAndRegisters(ctx.client, ctx.project, ctx.templateId) },
  { name: 'numbering', run: async (ctx) => provisionNumbering(ctx.client, ctx.project) },
  { name: 'dashboard_preferences', run: async (ctx) => provisionDashboardPreferences(ctx.client, ctx.project) },
];

// Main entry point. `client` is the transaction-scoped query handle (pg
// Client or mock). Returns { project, counts: {stepName: n}, steps }.
async function provisionProject(payload, { client, templateKey, createdBy = null } = {}) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('provisionProject requires a transaction client');
  }
  const input = payload || {};
  const template = await resolveTemplate(client, templateKey || input.template_key);
  const templateId = template ? template.id : null;

  // Merge template defaults under explicit payload values.
  let defaults = (template && template.default_values) || {};
  if (typeof defaults === 'string') {
    try { defaults = JSON.parse(defaults); } catch (e) { defaults = {}; }
  }
  const merged = { ...defaults, ...input };
  if (template) merged.template_key = template.key;

  const code = str(merged.code) || (await nextProjectNumber(client));
  const project = await insertProject(client, merged, code);

  const ctx = { client, payload: merged, project, templateId, createdBy, counts: {} };
  const applied = [];
  for (const step of PROVISION_STEPS) {
    ctx.counts[step.name] = await step.run(ctx);
    applied.push(step.name);
  }
  return { project, counts: ctx.counts, steps: applied };
}

module.exports = {
  DEFAULT_FOLDERS,
  DEFAULT_REGISTERS,
  TEAM_ROLE_TEMPLATES,
  DEFAULT_REPORTS,
  NUMBERED_ENTITIES,
  DEFAULT_DASHBOARD_PREFERENCES,
  PROVISION_STEPS,
  provisionProject,
  resolveClientLabel,
  resolveTemplate,
  insertProject,
  insertRootLocation,
  insertRootWbs,
  provisionTemplateLocations,
  provisionTemplateWbs,
  provisionCustomLocations,
  provisionTeam,
  provisionParticipants,
  provisionWorkflows,
  provisionRoleAssignments,
  provisionDefaultReports,
  provisionFoldersAndRegisters,
  provisionNumbering,
  provisionDashboardPreferences,
  nextProjectNumber,
  generateProjectCode,
};
