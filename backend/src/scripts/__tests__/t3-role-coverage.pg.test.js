// Real PostgreSQL. Closeout Session T, T3: role-by-role lifecycle and permissions, items (a)-(c) of the
// 2026-10-28 owner review added to REMOTE_SESSION_T_TESTS_PROMPT.md T3.2. Extends, does not duplicate,
// nav-visibility.pg.test.js (curated role->group fixture), policy-matrix.pg.test.js (full grid swept
// directly on the policy engine) and portal-acceptance.pg.test.js (forbidden-field + cross-portal-prefix
// checks). This file adds three things none of those already do:
//
//   Group A - a GENERATED sidebar-vs-API test: for every canonical role actually seeded, and for every
//     sidebar module this file can map to a parameter-free or single-project-param list endpoint, the
//     EXPECTED visibility is read from the seeded policy (policy.evaluateForRole - the same ground truth
//     Sidebar.js's hasModule/hasPermission ultimately reflects via the user's policy_modules/
//     policy_permissions), then the REAL endpoint is hit over HTTP and must agree: visible -> < 400,
//     hidden -> 401/403/404. No hand-written per-role expectation table (that's what nav-visibility.pg.test.js
//     already is); this one can't drift from the seed because it reads the seed.
//
//   Group B - list-endpoint project-scope tests (not just the single-record GETs other suites cover):
//     a user bound to project A only must never see project B's rows, whether the route takes the
//     project id as a path param (expect 403/404) or a query param (expect 403/404, or a 200 payload
//     that contains none of project B's distinctive fixture data).
//
//   Group C - external-role id-guessing: a portal user of one organization must not reach another
//     organization's record (contract, RFQ/PO, RFI responses) by guessing its id, on any of the four
//     portal families.
//
// Narrowing (said explicitly, not silently skipped): Group A excludes Sidebar.js's 'settings',
// 'admin/organizations' and 'agent-activity' entries - those are gated by Sidebar's hard-coded `roles`
// array BEFORE the module/action check (see Sidebar.js's `item.roles.includes(user?.role)` clause), so a
// seeded-policy-only derivation does not apply to them the same way; they're covered by the three-layer
// role-access audit in docs/CLOSEOUT_RECONCILIATION.md instead. Group A also only covers modules with a
// representative list endpoint that needs no extra fixture rows to return <400 for a role that holds the
// grant (so a 403 always means "denied", never "denied because there was nothing to list" producing a
// false negative) - 16 of mainMenuItems's ~19 module-gated entries qualify.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

// Mirrors frontend/src/components/layout/Sidebar.js `mainMenuItems` (module, action, representative
// endpoint). Backend tests can't import JSX, so this is kept as data; action defaults to 'view' exactly
// as Sidebar.js's `hasPermission(module, action = 'view')` does when an item carries no `action` key.
const SIDEBAR_MODULES = [
  ['dashboard', 'view', (pid) => `/api/dashboard/project/${pid}`],
  ['projects', 'view', (pid) => `/api/projects/${pid}`],
  ['inventory', 'view', () => '/api/inventory/lots'],
  ['warehouses', 'view', () => '/api/warehouses/reservations'],
  // Sidebar.js gates its '/procurement/comparison' LINK on action 'see_supplier_value', but that link's
  // own backing endpoint (an RFQ comparison by id) needs a real RFQ fixture to probe meaningfully. The
  // representative endpoint used here, /api/procurement/project/:projectId, is what the Procurement
  // workspace tab (ProcurementWorkspace.js, the actual day-to-day procurement screen) calls, and its
  // route enforces action 'view' - so this row tests general procurement visibility, not the
  // comparison-link's narrower grant. Documented narrowing, not a silent one.
  ['procurement', 'view', (pid) => `/api/procurement/project/${pid}`],
  ['clients', 'view', () => '/api/clients'],
  ['suppliers', 'view', () => '/api/suppliers'],
  ['assets', 'view', () => '/api/assets'],
  ['hr', 'view', () => '/api/hr/employees'],
  ['expenses', 'view', () => '/api/expenses'],
  ['invoices', 'view', () => '/api/invoices'],
  ['finance-ledger', 'view', () => '/api/finance-ledger/cash-flow'],
  ['legal', 'view', () => '/api/legal'],
  ['approvals', 'view', () => '/api/approvals/my-requests'],
  ['actions', 'view', () => '/api/actions/my'],
  ['notifications', 'view', () => '/api/notifications/preferences'],
];

// The 24 internal + 9 external canonical roles (migrations 0006/0031/0072; confirmed seeded - 48 roles
// total, 33 canonical + 15 legacy - in docs/CLOSEOUT_RECONCILIATION.md's T0.6 role census).
const CANONICAL_INTERNAL_ROLES = [
  'owner_ceo', 'coo', 'projects_director', 'construction_manager', 'project_manager', 'site_manager',
  'site_engineer', 'planning_engineer', 'technical_office_engineer', 'quantity_surveyor',
  'commercial_manager', 'contracts_manager', 'procurement_manager', 'procurement_officer',
  'finance_manager', 'accountant_ar', 'accountant_ap', 'storekeeper', 'qa_qc_manager', 'hse_manager',
  'document_controller', 'equipment_manager', 'hr_manager', 'business_development',
];
const CANONICAL_EXTERNAL_ROLES = [
  'client_executive', 'client_reviewer', 'pmc_manager', 'consultant_coordinator', 'consultant_reviewer',
  'subcontractor_manager', 'subcontractor_site_engineer', 'supplier_sales', 'testing_lab',
];
const CANONICAL_ROLES = [...CANONICAL_INTERNAL_ROLES, ...CANONICAL_EXTERNAL_ROLES];

describePg('T3 role coverage: generated sidebar-vs-API sweep, list-endpoint project scope, portal id-guessing', () => {
  let app; let server; let base; let db; let policy;
  const tag = String(Date.now()).slice(-7);
  const createdEmails = [];
  const createdProjects = [];
  const createdOrgs = [];
  let seq = 0;

  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const call = async (method, path, token, body) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };

  const newProject = async (label) => {
    seq += 1;
    const row = await one(
      "INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id",
      [`t3-${label}-${tag}-${seq}`, `T3${tag}${seq}`.slice(0, 20)]);
    createdProjects.push(row.id);
    return row;
  };

  const newOrg = async (orgType) => {
    seq += 1;
    const row = await one(
      'INSERT INTO organizations (code, name_ar, name_en, org_type) VALUES ($1, $1, $1, $2) RETURNING id',
      [`t3-${orgType}-${tag}-${seq}`, orgType]);
    createdOrgs.push(row.id);
    return row;
  };

  // A user bound to exactly one project (or company-wide if projectId is null), with an optional org link.
  const actorFor = async (roleKey, projectId, orgId) => {
    seq += 1;
    const email = `t3-${roleKey}-${tag}-${seq}@test.io`;
    const row = await one(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version",
      [`t3-${roleKey}`, email, roleKey]);
    createdEmails.push(email);
    await db.query(
      'INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3',
      [row.id, projectId, roleKey]);
    if (orgId) await db.query('INSERT INTO organization_users (user_id, organization_id, is_active) VALUES ($1, $2, true)', [row.id, orgId]);
    return { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    policy = require('../../services/policy');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await db.query('UPDATE users SET is_active = false WHERE email = ANY($1)', [createdEmails]);
    if (createdProjects.length) {
      await db.query('DELETE FROM user_project_roles WHERE project_id = ANY($1)', [createdProjects]);
      await db.query('DELETE FROM project_participants WHERE project_id = ANY($1)', [createdProjects]);
      await db.query('DELETE FROM client_contracts WHERE project_id = ANY($1)', [createdProjects]);
      await db.query('DELETE FROM project_documents WHERE project_id = ANY($1)', [createdProjects]);
      await db.query('DELETE FROM sub_contracts WHERE project_id = ANY($1)', [createdProjects]);
      await db.query('DELETE FROM variations WHERE project_id = ANY($1)', [createdProjects]);
      await db.query('DELETE FROM rfqs WHERE project_id = ANY($1)', [createdProjects]);
      await db.query('DELETE FROM project_rfis WHERE project_id = ANY($1)', [createdProjects]);
    }
    if (createdOrgs.length) await db.query('DELETE FROM organization_users WHERE organization_id = ANY($1)', [createdOrgs]);
    if (createdProjects.length) await db.query('DELETE FROM projects WHERE id = ANY($1)', [createdProjects]);
    if (createdOrgs.length) await db.query('DELETE FROM subcontractors WHERE code LIKE $1', [`t3-sub%-${tag}`]);
    if (createdOrgs.length) await db.query('DELETE FROM organizations WHERE id = ANY($1)', [createdOrgs]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('fixture sanity: all 33 canonical roles are present in the seed', async () => {
    const rows = await all('SELECT key FROM roles WHERE key = ANY($1)', [CANONICAL_ROLES]);
    expect(rows.map((r) => r.key).sort()).toEqual([...CANONICAL_ROLES].sort());
  });

  // ---- Group A: generated sidebar-vs-API sweep ----
  describe('Group A: sidebar module visibility matches the seeded policy, role by role', () => {
    for (const roleKey of CANONICAL_ROLES) {
      test(`${roleKey}: every sidebar module's API answers exactly as the seeded policy says`, async () => {
        const project = await newProject(`a-${roleKey}`);
        const actor = await actorFor(roleKey, project.id);
        const mismatches = [];
        for (const [module, action, pathFor] of SIDEBAR_MODULES) {
          const expected = await policy.evaluateForRole(roleKey, { module, action, projectId: project.id });
          const res = await call('GET', pathFor(project.id), actor.token);
          const isVisible = Boolean(expected && expected.allowed);
          const gotVisible = res.status < 400;
          if (isVisible !== gotVisible) {
            mismatches.push(`${module}/${action}: policy says allowed=${isVisible}, API returned ${res.status}`);
          }
        }
        expect(mismatches).toEqual([]);
      });
    }
  });

  // ---- Group B: list-endpoint project scope ----
  describe('Group B: list endpoints never return another project\'s rows', () => {
    test('projects: GET /api/projects lists only projects the caller belongs to', async () => {
      const mine = await newProject('b-projects-mine');
      const other = await newProject('b-projects-other');
      const actor = await actorFor('owner_ceo', mine.id);
      const res = await call('GET', '/api/projects', actor.token);
      expect(res.status).toBe(200);
      const ids = (res.body.data || []).map((p) => Number(p.id));
      expect(ids).toContain(Number(mine.id));
      expect(ids).not.toContain(Number(other.id));
    });

    const PATH_PARAM_CASES = [
      ['boq', (pid) => `/api/boq/items/${pid}`],
      ['work-orders', (pid) => `/api/work-orders/project/${pid}`],
      ['site', (pid) => `/api/site/${pid}/site-reports`],
      ['procurement', (pid) => `/api/procurement/project/${pid}`],
      ['commercial', (pid) => `/api/commercial/contracts/${pid}`],
      ['handover', (pid) => `/api/handover/process/${pid}`],
    ];
    for (const [label, pathFor] of PATH_PARAM_CASES) {
      test(`${label}: a project-A-only user reading project B's id is refused, never served`, async () => {
        const projectA = await newProject(`b-${label}-a`);
        const projectB = await newProject(`b-${label}-b`);
        const actor = await actorFor('owner_ceo', projectA.id);
        const res = await call('GET', pathFor(projectB.id), actor.token);
        expect([401, 403, 404]).toContain(res.status);
      });
    }

    test('finance-ledger retention: project_id query param for an unrelated project returns no data for it', async () => {
      const projectA = await newProject('b-fin-a');
      const projectB = await newProject('b-fin-b');
      const marker = `t3-fin-marker-${tag}`;
      // A distinctive, recognizable retention-bearing fixture scoped to project B only.
      await db.query(
        "INSERT INTO client_contracts (project_id, contract_number, original_value, revised_value, status) VALUES ($1, $2, 12345.67, 12345.67, 'active')",
        [projectB.id, marker]);
      const actor = await actorFor('owner_ceo', projectA.id);
      const res = await call('GET', `/api/finance-ledger/retention?project_id=${projectB.id}`, actor.token);
      if (res.status >= 400) {
        expect([401, 403, 404]).toContain(res.status);
      } else {
        expect(JSON.stringify(res.body)).not.toContain(marker);
      }
    });

    test('documents: project_id query param for an unrelated project returns none of its documents', async () => {
      const projectA = await newProject('b-docs-a');
      const projectB = await newProject('b-docs-b');
      const marker = `t3-doc-marker-${tag}`;
      await db.query(
        "INSERT INTO project_documents (project_id, title, document_type, status) VALUES ($1, $2, 'drawing', 'draft')",
        [projectB.id, marker]);
      const actor = await actorFor('owner_ceo', projectA.id);
      const res = await call('GET', `/api/docs/documents?project_id=${projectB.id}`, actor.token);
      if (res.status >= 400) {
        expect([401, 403, 404]).toContain(res.status);
      } else {
        expect(JSON.stringify(res.body)).not.toContain(marker);
      }
    });
  });

  // ---- Group C: external-role id-guessing per portal ----
  describe('Group C: a portal user cannot reach another organization\'s record by guessing its id', () => {
    test('subcontractor: another subcontractor\'s contract id 404s, never the record', async () => {
      // Real isolation mechanism (services/portalEngine.js subContractForOrg): a sub_contracts row is in
      // an org's scope only if a project_participants row links that ORG to the contract's
      // subcontractor_id (legacy_subcontractor_id) for that SAME project. Mine gets a participant grant;
      // Other's contract uses a different subcontractor_id with no such grant, so it must 404.
      const project = await newProject('c-sub');
      const orgMine = await newOrg('subcontractor');
      const subMine = await one("INSERT INTO subcontractors (code, name) VALUES ($1, $1) RETURNING id", [`t3-submine-${tag}`]);
      const subOther = await one("INSERT INTO subcontractors (code, name) VALUES ($1, $1) RETURNING id", [`t3-subother-${tag}`]);
      await db.query(
        `INSERT INTO project_participants (project_id, organization_id, participant_type, portal_access_enabled, legacy_subcontractor_id)
         VALUES ($1, $2, 'subcontractor', true, $3)`, [project.id, orgMine.id, subMine.id]);
      const other = await one(
        "INSERT INTO sub_contracts (project_id, subcontractor_id, contract_number, contract_value, status) VALUES ($1, $2, $3, 5000, 'active') RETURNING id",
        [project.id, subOther.id, `t3-subcontract-${tag}`]);
      const actor = await actorFor('subcontractor_manager', project.id, orgMine.id);
      const res = await call('GET', `/api/portal/subcontractor/contracts/${other.id}`, actor.token);
      expect([401, 403, 404]).toContain(res.status);
    });

    test('supplier: another supplier\'s RFQ quotation view id-guesses to nothing', async () => {
      const project = await newProject('c-sup');
      const orgOther = await newOrg('supplier');
      const otherSupplier = await one("INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id", [`t3-sup-${tag}`]);
      const rfq = await one(
        "INSERT INTO rfqs (project_id, rfq_number, title, status) VALUES ($1, $2, 'T3 RFQ', 'draft') RETURNING id",
        [project.id, `t3-rfq-${tag}`]);
      void otherSupplier; void orgOther;
      const myOrg = await newOrg('supplier');
      const actor = await actorFor('supplier_sales', project.id, myOrg.id);
      // This supplier was never invited to the RFQ at all - guessing its id must not resolve.
      const res = await call('GET', `/api/portal/supplier/rfqs/${rfq.id}`, actor.token);
      expect([401, 403, 404]).toContain(res.status);
    });

    test('client: responding to another client org\'s variation 403s/404s, never applies the response', async () => {
      const projectMine = await newProject('c-client-mine');
      const projectOther = await newProject('c-client-other');
      const myOrg = await newOrg('client');
      const otherVariation = await one(
        "INSERT INTO variations (project_id, variation_number, title, variation_type, status, amount) VALUES ($1, $2, 'T3 Variation', 'client', 'client_approval_reject', 1000) RETURNING id",
        [projectOther.id, `t3-var-${tag}`]);
      const actor = await actorFor('client_executive', projectMine.id, myOrg.id);
      const res = await call('POST', `/api/client-portal/variations/${otherVariation.id}/response`, actor.token, { decision: 'approve' });
      expect([401, 403, 404]).toContain(res.status);
      const row = await one('SELECT status FROM variations WHERE id = $1', [otherVariation.id]);
      expect(row.status).toBe('client_approval_reject');
    });

    test('consultant: another project\'s RFI responses are not reachable by id', async () => {
      const projectMine = await newProject('c-consult-mine');
      const projectOther = await newProject('c-consult-other');
      const myOrg = await newOrg('consultant');
      const otherRfi = await one(
        "INSERT INTO project_rfis (project_id, rfi_number, subject, status) VALUES ($1, $2, 'T3 RFI', 'open') RETURNING id",
        [projectOther.id, `t3-rfi-${tag}`]);
      const actor = await actorFor('consultant_coordinator', projectMine.id, myOrg.id);
      const res = await call('GET', `/api/consultant/rfis/${otherRfi.id}/responses`, actor.token);
      expect([401, 403, 404]).toContain(res.status);
    });
  });
});
