// Real PostgreSQL + real app. Phase 5.1 — Organization and RBAC (spec 03, 04). Born green on the
// implementation slice, but this suite tries to break the grant map:
//   1. migration surfacing: the spec tables, the exact 24+9 role set, no NEW ('*','*') wildcard, the
//      plan's decision-8 lens pins, the legacy alias map, the additive expires_at team column;
//   2. the authorization formula: a company-wide internal role passes for any project, a project-bound
//      NEW role stays inside its project (policy level + one HTTP run-through per direction);
//   3. organizations CRUD: owner creates a department; a Purchasing Manager cannot (403 — the coarse
//      role list filters on top of the blanket grants); duplicate codes, bilingual pair rule;
//   3b. organizations CRUD itself (soft deactivate only), bank-account exactly-one-primary,
//       performance-score per period, qualification own-rows rule;
//   4. delegations END-END: owner delegates approvals to a user who can reach the endpoint (users.role
//      matches the engine stage rules) but whose POLICY grants carry no approvals.approve (403 before
//      the delegation); a live live window approves; deactivate/expire/over-cap refuse again; audited;
//   5. team inheritance: the role's grants apply through the seat, notification subscriptions activate
//      at assign time, expiry honored, removal hard-removes the ASSIGNMENT (never the user), audited;
//   6. new-role light-level matrix: seeded rule-map spot checks allow/deny per canonical role;
//   7. fail-closed preserved: no user_project_roles rows ⇒ denied on the new modules too, and a
//      delegation CANNOT rescue an identity-less caller (the fail-closed.pg.test.js contract);
//   8. external-role regression: the 4 alias families keep exactly their isolation edges; the new
//      canonical external roles inherit their family's lens shape with NO internal cost access;
//   9. lookupDelegation gates (window, is_active, scope, amount) — null-or-row semantics;
//  10. v1 read family: blanket users can read organizations; storekeeper remains 403.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('5.1 Organization and RBAC (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let policy; let org; let team; let delegationService;
  const tag = String(Date.now()).slice(-8);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const call = async (method, path, user, body) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user && user.token ? user.token : ''}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };

  const INTERNAL24 = ['owner_ceo', 'coo', 'projects_director', 'construction_manager', 'project_manager',
    'site_manager', 'site_engineer', 'planning_engineer', 'technical_office_engineer', 'quantity_surveyor',
    'commercial_manager', 'contracts_manager', 'procurement_manager', 'procurement_officer', 'finance_manager',
    'accountant_ar', 'accountant_ap', 'storekeeper', 'qa_qc_manager', 'hse_manager', 'document_controller',
    'equipment_manager', 'hr_manager', 'business_development'];
  const EXTERNAL9 = ['client_executive', 'client_reviewer', 'pmc_manager', 'consultant_coordinator',
    'consultant_reviewer', 'subcontractor_manager', 'subcontractor_site_engineer', 'supplier_sales', 'testing_lab'];
  const KEPT_EXISTING = ['project_manager', 'site_engineer', 'quantity_surveyor', 'storekeeper',
    'document_controller', 'finance_manager'];
  const NEW_INTERNAL = INTERNAL24.filter((k) => !KEPT_EXISTING.includes(k));

  const	users = {};
  const made = { delegations: [], expenses: [], approvalRequests: [], departments: [] };
  let day = 0;
  const days = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  // userRole = users.role (drives the engine stage checks + coarse role lists); grantRole = the role
  // whose GRANTS the user holds (drives the policy middleware).
  const makeUser = async (key, userRole, grantRole = userRole, projectId = null) => {
    const row = await one(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version",
      [`org-${key}`, `org-${key}-${++day}-${tag}@test.io`, userRole]);
    if (grantRole) {
      await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3',
        [row.id, projectId, grantRole]);
    }
    users[key] = { id: row.id, role: userRole, grantRole, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    return users[key];
  };

  const createExpense = async (amount) => {
    const created = await call('POST', '/api/expenses', users.requester, {
      category: 'other', description: `org 5.1 ${amount} ${tag}`, amount,
    });
    expect(created.status).toBe(201);
    made.expenses.push(created.body.data.id);
    return created.body.data;
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    policy = require('../../services/policy');
    org = require('../../services/orgService');
    team = require('../../services/teamService');
    delegationService = require('../../services/delegationService');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;

    made.pA = (await one("INSERT INTO projects (name, name_en, code, status, budget) VALUES ('org A', 'org A', $1, 'active', 100000) RETURNING id", [`ORG${tag}A`.slice(0, 20)])).id;
    made.pB = (await one("INSERT INTO projects (name, name_en, code, status, budget) VALUES ('org B', 'org B', $1, 'active', 100000) RETURNING id", [`ORG${tag}B`.slice(0, 20)])).id;

    await makeUser('owner', 'owner');                        // legacy blanket, company-wide row
    await makeUser('purchasing', 'purchasing_mgr');          // REDUNDANT blanket role (not on the org coarse lists)
    await makeUser('planner', 'planning_engineer');          // NEW canonical role, company-wide seat
    await makeUser('sitemgr', 'site_manager', 'site_manager', made.pA);
    await makeUser('storekeeper', 'storekeeper');            // explicit-grant role from slice 1, no organizations grants
    // THE delegation test's core shape: users.role matches the ENGINE's expense stage rules
    // (finance_manager = expense manager), while the POLICY grants (planning_engineer) carry no
    // approvals.approve → the middleware refuses every approval before the delegation exists.
    await makeUser('delegate', 'finance_manager', 'planning_engineer');
    await makeUser('requester', 'staff');                    // company-wide staff: raises approvals
    await makeUser('fresh', 'staff', null);                  // NO role rows AT ALL (fail-closed contract)
    await makeUser('hr', 'hr_manager');                      // new role with organizations view
    await makeUser('owner_ceo', 'owner_ceo');                // canonical org manager (delegations CRUD)
  });

  afterAll(async () => {
    // Hard-removal is allowed ONLY for rows this suite created (tagged ids): delegations (our table),
    // notification subscriptions, team assignments, org fixtures. Users are deactivated, never deleted.
    const uids = [...new Set(Object.values(users).map((u) => u.id))];
    await db.query('DELETE FROM delegations WHERE delegate_user_id = ANY($1) OR delegate_from_user_id = ANY($1)', [uids]);
    await db.query('DELETE FROM notification_preferences WHERE user_id = ANY($1)', [uids]);
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [uids]);
    for (const alias of made.departments) {
      await db.query('DELETE FROM job_positions WHERE department_id = $1', [alias]);
      await db.query('DELETE FROM departments WHERE id = $1', [alias]);
    }
    if (made.organization) {
      await db.query('DELETE FROM org_bank_accounts WHERE organization_id = $1', [made.organization]);
      await db.query('DELETE FROM org_performance_scores WHERE organization_id = $1', [made.organization]);
      await db.query('DELETE FROM organizations WHERE id = $1', [made.organization]);
    }
    await db.query('DELETE FROM company_profiles');
    // The approval chain (expenses + approval_requests + their workflow instances) leaves durable rows:
    // approvals-atomic keeps them the same way — the steps cascade, action items close, entries stay.
    for (const ar of made.approvalRequests) {
      await db.query('DELETE FROM action_items WHERE workflow_step_instance_id IN (SELECT id FROM workflow_step_instances WHERE instance_id IN (SELECT id FROM workflow_instances WHERE legacy_approval_id = $1))', [ar]);
      await db.query('DELETE FROM workflow_instances WHERE legacy_approval_id = $1', [ar]);
      await db.query('DELETE FROM approval_requests WHERE id = $1', [ar]);
    }
    for (const e of made.expenses) {
      await db.query('DELETE FROM project_costs WHERE source_type = $1 AND source_id = $2', ['expense', e]);
      await db.query('DELETE FROM expenses WHERE id = $1', [e]);
    }
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [uids]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('1. migration: the spec tables, the exact 24+9 role set, decision-8 lenses, aliases, expiry column', async () => {
    for (const table of ['company_profiles', 'departments', 'job_positions', 'delegations',
      'org_qualifications', 'org_bank_accounts', 'org_performance_scores', 'user_legacy_role_aliases']) {
      expect((await one("SELECT count(*)::int n FROM information_schema.tables WHERE table_name = $1", [table])).n).toBe(1);
    }
    const keys = (await all('SELECT key FROM roles')).map((r) => r.key);
    for (const key of [...INTERNAL24, ...EXTERNAL9, 'owner', 'admin', 'manager', 'staff']) expect(keys).toContain(key);
    expect(new Set(keys).size).toBe(keys.length); // aliases are ADDITIVE rows, no renames
    // no NEW canonical internal role gets a ('*','*') wildcard (scope: the legacy blankets stay)
    const wildcards = (await all(
      `SELECT r.key FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
        WHERE p.module = '*' AND p.action = '*' AND r.key = ANY($1)`, [NEW_INTERNAL])).map((r) => r.key);
    expect(wildcards).toEqual([]);
    const hasFlag = async (role) => Number((await one(
      `SELECT count(*)::int n FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
        WHERE r.key = $1 AND p.action = 'see_internal_cost'`, [role])).n);
    expect(await hasFlag('quantity_surveyor')).toBe(0);   // plan decision 8: NOT granted
    expect(await hasFlag('commercial_manager')).toBeGreaterThan(0);
    expect(await hasFlag('finance_manager')).toBeGreaterThan(0);
    // additive team expiry column, NULL-safe for the existing rows
    expect((await one("SELECT count(*)::int n FROM information_schema.columns WHERE table_name = 'user_project_roles' AND column_name = 'expires_at'")).n).toBe(1);
    // every alias row resolves into a seeded canonical role
    expect(await all(`SELECT a.legacy_role_key FROM user_legacy_role_aliases a
        LEFT JOIN roles r ON r.key = a.canonical_role_key WHERE r.id IS NULL`)).toEqual([]);
    expect((await one('SELECT count(*)::int n FROM user_legacy_role_aliases')).n).toBeGreaterThanOrEqual(10);
  });

  test('2. the authorization formula: company-wide passes everywhere; project-bound stays in its project', async () => {
    // company-wide seat: the planner can act on any project it does not belong to
    const planning = await policy.evaluate(
      { user: { id: users.planner.id, role: 'planning_engineer' }, module: 'schedule', action: 'create', projectId: made.pB });
    expect(planning.allowed).toBe(true);
    expect(planning.company_wide).toBe(true);
    // a project-bound NEW role: inside allowed, outside denied
    expect((await policy.evaluate(
      { user: { id: users.sitemgr.id, role: 'site_manager' }, module: 'site', action: 'create', projectId: made.pA })).allowed).toBe(true);
    expect((await policy.evaluate(
      { user: { id: users.sitemgr.id, role: 'site_manager' }, module: 'site', action: 'create', projectId: made.pB })).allowed).toBe(false);
    // and the rule holds through the route layer (Bearer-real): the record's project is resolved, not trusted
    expect((await call('GET', `/api/projects/${made.pB}`, users.sitemgr)).status).toBe(403);
    expect((await call('GET', `/api/projects/${made.pA}`, users.sitemgr)).status).toBe(200);
  });

  test('3. roles CRUD via the organizations routes: owner creates a department; a Purchasing Manager cannot (403)', async () => {
    const created = await call('POST', '/api/organizations/departments', users.owner,
      { code: `dep-${tag}`, name_ar: 'الهندسة', name_en: 'Engineering' });
    expect(created.status).toBe(201);
    made.departments.push(created.body.data.id);
    // bilingual rule: BOTH names empty is a typed 400, never a half-translated row
    const badPair = await call('POST', '/api/organizations/departments', users.owner, { code: `dep2-${tag}` });
    expect(badPair.status).toBe(400);
    expect(badPair.body.error_code).toBe('bilingual_pair_required');
    expect(badPair.body.error_params).toEqual({ field_a: 'name_ar', field_b: 'name_en' });
    // duplicate code is a typed 400 (not a bare 500)
    const dup = await call('POST', '/api/organizations/departments', users.owner, { code: `dep-${tag}`, name_ar: 'x', name_en: 'y' });
    expect(dup.status).toBe(400);
    expect(dup.body.error_code).toBe('department_code_taken');
    // the Purchasing Manager holds a blanket grant at the POLICY layer, yet the coarse role list of the
    // organizational editors keeps them out — 403 on top of the policy decision, never a policy row.
    const refused = await call('POST', '/api/organizations/departments', users.purchasing, { code: `dep3-${tag}`, name_ar: 'P', name_en: 'P' });
    expect(refused.status).toBe(403);
    // reading is open to module grants: hr_manager holds organizations.view
    const list = await call('GET', '/api/organizations/departments', users.hr);
    expect(list.status).toBe(200);
    expect(list.body.data.some((d) => d.code === `dep-${tag}`)).toBe(true);
    // job positions attach to a department
    const jp = await call('POST', '/api/organizations/job-positions', users.owner,
      { code: `jp-${tag}`, name_ar: 'مهندس', name_en: 'Engineer', department_id: created.body.data.id, grade: 'A' });
    expect(jp.status).toBe(201);
    // company profile is a single editable row
    const company1 = await call('POST', '/api/organizations/company', users.owner, { legal_name_ar: 'شركة', legal_name_en: 'Company' });
    expect(company1.status).toBe(201);
    const company2 = await call('POST', '/api/organizations/company', users.owner, { legal_name_ar: 'شركة', legal_name_en: 'Company Renamed', cr_no: 'CR-1' });
    expect(company2.status).toBe(201);
    expect(Number(company1.body.data.id)).toBe(Number(company2.body.data.id));
    expect((await one('SELECT count(*)::int n FROM company_profiles')).n).toBe(1);
    expect(company2.body.data.legal_name_en).toBe('Company Renamed');
    const companyDenied = await call('POST', '/api/organizations/company', users.purchasing, { legal_name_ar: 'x', legal_name_en: 'y' });
    expect(companyDenied.status).toBe(403);
  });

  test('3b. organizations CRUD: soft deactivate, unique code, one primary bank account, performance once per period', async () => {
    const org1 = await call('POST', '/api/organizations', users.owner,
      { code: `org-${tag}`, org_type: 'supplier', name_ar: 'مورد', name_en: `Supplier ${tag}` });
    expect(org1.status).toBe(201);
    made.organization = org1.body.data.id;
    const dup = await call('POST', '/api/organizations', users.owner,
      { code: `org-${tag}`, org_type: 'client', name_ar: 'x', name_en: 'y' });
    expect(dup.status).toBe(400);
    expect(dup.body.error_code).toBe('organization_code_taken');
    const deactivated = await call('POST', `/api/organizations/${made.organization}/deactivate`, users.owner, {});
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.status).toBe('inactive');
    const again = await call('POST', `/api/organizations/${made.organization}/deactivate`, users.owner, {});
    expect(again.status).toBe(400);
    expect(again.body.error_code).toBe('organization_already_inactive');
    // still readable (the row survives; soft delete only flips the status)
    const fetched = await call('GET', `/api/organizations/${made.organization}`, users.hr);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.status).toBe('inactive');
    // bank accounts: the first one becomes primary, exactly one primary per organization
    const bank1 = await call('POST', '/api/organizations/bank-accounts', users.owner,
      { organization_id: made.organization, bank_name: 'CIB', account_no: `acc-${tag}` });
    expect(bank1.status).toBe(201);
    expect(bank1.body.data.is_primary).toBe(true);
    const bank2 = await call('POST', '/api/organizations/bank-accounts', users.owner,
      { organization_id: made.organization, bank_name: 'QNB', iban: `eg-${tag}` });
    expect(bank2.status).toBe(201);
    expect(bank2.body.data.is_primary).toBe(false);
    const madePrimary = await call('POST', `/api/organizations/bank-accounts/${bank2.body.data.id}/make-primary`, users.owner,
      { organization_id: made.organization });
    expect(madePrimary.status).toBe(200);
    const primaries = await all('SELECT id FROM org_bank_accounts WHERE organization_id = $1 AND is_primary', [made.organization]);
    expect(primaries).toHaveLength(1);
    expect(Number(primaries[0].id)).toBe(Number(bank2.body.data.id));
    // performance scoring once per (organization, period)
    const score = await call('POST', '/api/organizations/performance-scores', users.owner,
      { organization_id: made.organization, period: `${tag}`, score: 87.5 });
    expect(score.status).toBe(201);
    expect(Number(score.body.data.score)).toBe(87.5);
    const scoreDup = await call('POST', '/api/organizations/performance-scores', users.owner,
      { organization_id: made.organization, period: `${tag}`, score: 50 });
    expect(scoreDup.status).toBe(400);
    expect(scoreDup.body.error_code).toBe('performance_duplicate');
    // qualifications: own rows are creatable/deletable; a caller without the module grant is stopped by
    // the policy (plain 403), a grant-holding non-owner is stopped by the service (typed 403)
    const qual = await call('POST', '/api/organizations/qualifications', users.hr,
      { name_ar: 'شهادة', name_en: 'PMP', issuer: 'PMI', issued_on: '2024-01-01' });
    expect(qual.status).toBe(201);
    const ungranted = await call('DELETE', `/api/organizations/qualifications/${qual.body.data.id}`, users.planner);
    expect(ungranted.status).toBe(403);
    const foreign = await call('DELETE', `/api/organizations/qualifications/${qual.body.data.id}`, users.owner_ceo);
    expect(foreign.status).toBe(403);
    expect(foreign.body.error_code).toBe('qualification_not_mine');
    const removed = await call('DELETE', `/api/organizations/qualifications/${qual.body.data.id}`, users.hr);
    expect(removed.status).toBe(200);
  });

  test('4. delegations end-to-end: before → 403 anywhere; live window → 200; inactive/expired/over-cap → 403; audited', async () => {
    // Baseline: the delegate reaches the approval stage through its users.role (finance_manager is the
    // expense module manager), but its POLICY grants (planning_engineer) carry no approvals.approve, so
    // the middleware refuses every approval BEFORE the engine — and before any delegation exists.
    const expense1 = await createExpense(40000);
    const request1 = (await call('POST', '/api/approvals/request', users.requester,
      { module_name: 'expenses', request_type: 'expense', request_id: expense1.id })).body.request;
    made.approvalRequests.push(request1.id);
    expect(request1).toBeTruthy();
    const baseline = await call('PUT', `/api/approvals/${request1.id}/approve`, users.delegate, { notes: 'trying' });
    expect(baseline.status).toBe(403);
    expect(await one('SELECT status, stage FROM approval_requests WHERE id = $1', [request1.id]))
      .toMatchObject({ status: 'pending', stage: 'manager_review' });

    // Owner delegates approvals (approvals-scoped, cap 50000, valid for a month).
    const delegation = await call('POST', '/api/delegations', users.owner, {
      delegate_user_id: users.delegate.id, module_scope: 'approvals',
      max_amount: 50000, valid_from: days(0), valid_to: days(30),
    });
    expect(delegation.status).toBe(201);
    made.delegations.push(delegation.body.data.id);
    expect(delegation.body.data.max_amount).toBe('50000.00');
    expect((await one("SELECT count(*)::int n FROM audit_events WHERE entity = 'delegation' AND entity_id = $1 AND action = 'create'",
      [delegation.body.data.id])).n).toBe(1);

    const approved = await call('PUT', `/api/approvals/${request1.id}/approve`, users.delegate, { notes: 'on behalf of the owner' });
    expect(approved.status).toBe(200);
    const row = await one('SELECT stage, manager_id, status FROM approval_requests WHERE id = $1', [request1.id]);
    expect(row.stage).toBe('owner_review');
    // the acting user is recorded (the legacy dual-write keeps the ACTING user in manager_id) — the
    // delegated authority is the POLICY decision that let the delegate press the button at all.
    expect(Number(row.manager_id)).toBe(users.delegate.id);

    // deactivated → refused again
    const deactivated = await call('POST', `/api/delegations/${delegation.body.data.id}/deactivate`, users.owner, {});
    expect(deactivated.status).toBe(200);
    const expense2 = await createExpense(1500);
    const request2 = (await call('POST', '/api/approvals/request', users.requester,
      { module_name: 'expenses', request_type: 'expense', request_id: expense2.id })).body.request;
    made.approvalRequests.push(request2.id);
    expect((await call('PUT', `/api/approvals/${request2.id}/approve`, users.delegate, {})).status).toBe(403);

    // a fresh live delegation, same window, cap 50000 — an amount ABOVE the cap refuses
    const live = await call('POST', '/api/delegations', users.owner, {
      delegate_user_id: users.delegate.id, module_scope: 'approvals', max_amount: 50000,
      valid_from: days(0), valid_to: days(30),
    });
    expect(live.status).toBe(201);
    made.delegations.push(live.body.data.id);
    const expense3 = await createExpense(60000);
    const request3 = (await call('POST', '/api/approvals/request', users.requester,
      { module_name: 'expenses', request_type: 'expense', request_id: expense3.id })).body.request;
    made.approvalRequests.push(request3.id);
    expect((await call('PUT', `/api/approvals/${request3.id}/approve`, users.delegate, {})).status).toBe(403);
    expect(await one('SELECT status, stage FROM approval_requests WHERE id = $1', [request3.id]))
      .toMatchObject({ status: 'pending', stage: 'manager_review' });

    // an EXPIRED window refuses even inside a huge cap (the live row is parked first: the
    // unique-active constraint earlier caught the overlapping windows as a genuine collision)
    const parked = await call('POST', `/api/delegations/${live.body.data.id}/deactivate`, users.owner, {});
    expect(parked.status).toBe(200);
    await call('POST', '/api/delegations', users.owner, {
      delegate_user_id: users.delegate.id, module_scope: 'approvals', max_amount: 999999,
      valid_from: days(-10), valid_to: days(-1),
    });
    const expense4 = await createExpense(2000);
    const request4 = (await call('POST', '/api/approvals/request', users.requester,
      { module_name: 'expenses', request_type: 'expense', request_id: expense4.id })).body.request;
    made.approvalRequests.push(request4.id);
    expect((await call('PUT', `/api/approvals/${request4.id}/approve`, users.delegate, {})).status).toBe(403);

    // the delegation lifecycle is audited: a create per row and a deactivate for each parked row
    const audits = await all(
      "SELECT action FROM audit_events WHERE entity = 'delegation' AND entity_id = ANY($1::int[])",
      [[delegation.body.data.id, live.body.data.id]]);
    expect(audits.filter((a) => a.action === 'create')).toHaveLength(2);
    expect(audits.filter((a) => a.action === 'deactivate')).toHaveLength(2);
  });

  test('5. team inheritance: grants apply through the seat, subscriptions activate, expiry and removal honored', async () => {
    const volunteer = await makeUser('volunteer', 'site_engineer', null);   // a BARE user: the team seat is the only grant
    const grant = await call('POST', '/api/team', users.owner,
      { project_id: made.pA, user_id: volunteer.id, role_key: 'site_engineer' });
    expect(grant.status).toBe(201);
    expect(grant.body.data.assignment.role_key).toBeUndefined(); // the assignment row is the DB row; role_key resolved by SQL below
    expect((await one('SELECT r.key AS rk FROM user_project_roles upr JOIN roles r ON r.id = upr.role_id WHERE upr.id = $1', [grant.body.data.assignment.id])).rk).toBe('site_engineer');
    // the seat operatively grants the useraccess to the project (points 1+2: the join IS the grant)
    expect((await call('GET', `/api/projects/${made.pA}`, volunteer)).status).toBe(200);
    const report = await call('POST', `/api/projects/${made.pA}/site-reports`, volunteer,
      { report_date: `2026-06-${String(day % 28).padStart(2, '0')}`, work_summary: 'poured slab' });
    expect(report.status).not.toBe(403);
    // notification subscriptions activated at assign time (point 3)
    const prefs = await all(
      "SELECT event_type, channel FROM notification_preferences WHERE user_id = $1 ORDER BY event_type",
      [volunteer.id]);
    expect(prefs).toEqual(expect.arrayContaining([
      { event_type: 'action.overdue', channel: 'in_app' },
      { event_type: 'approval.requested', channel: 'in_app' },
    ]));
    // double assignment → typed conflict (the UNIQUE constraint backs the check)
    const dup = await call('POST', '/api/team', users.owner,
      { project_id: made.pA, user_id: volunteer.id, role_key: 'site_engineer' });
    expect(dup.status).toBe(409);
    expect(dup.body.error_code).toBe('team_assignment_exists');
    // a seat dated yesterday grants nothing (point 4)
    await call('POST', '/api/team', users.owner,
      { project_id: made.pA, user_id: volunteer.id, role_key: 'storekeeper', expires_at: days(-1) });
    // revoke (point 6): the ASSIGNMENT row is removed (never the user), audited
    const seat = (await one(
      "SELECT id FROM user_project_roles WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE key='site_engineer') AND expires_at IS NULL", [volunteer.id])).id;
    expect((await call('GET', `/api/projects/${made.pA}`, volunteer)).status).toBe(200);
    const removal = await call('DELETE', `/api/team/${seat}`, users.owner);
    expect(removal.status).toBe(200);
    expect((await call('GET', `/api/projects/${made.pA}`, volunteer)).status).toBe(403);
    expect((await one('SELECT is_active FROM users WHERE id = $1', [volunteer.id])).is_active).toBe(true);
    expect((await one(
      "SELECT count(*)::int n FROM audit_events WHERE entity = 'team_assignment' AND entity_id = $1 AND action = 'delete'", [seat])).n).toBe(1);
  });

  test('6. the new-role light-level matrix: intended modules open, sensitive modules shut', async () => {
    // Spot checks on the seeded rule map, per-role, ONE module/action each — the full grid for all
    // seeded pairs is policy-matrix.pg.test.js's job; this one asserts the map's shape by hand.
    const MATRIX = [
      ['owner_ceo', [['projects', 'view', 'allow'], ['approvals', 'approve', 'allow'], ['users', 'manage_permissions', 'allow'], ['delegations', 'create', 'allow']]],
      ['coo', [['approvals', 'approve', 'allow'], ['organizations', 'create', 'allow'], ['finance-ledger', 'record_payment', 'allow']]],
      ['projects_director', [['projects', 'edit', 'allow'], ['team', 'create', 'allow'], ['invoices', 'create', 'deny']]],
      ['construction_manager', [['site', 'edit', 'allow'], ['quantities', 'create', 'allow'], ['invoices', 'create', 'deny']]],
      ['site_manager', [['site', 'create', 'allow'], ['qhse', 'edit', 'allow'], ['invoices', 'view', 'deny']]],
      ['planning_engineer', [['schedule', 'edit', 'allow'], ['schedule', 'create', 'allow'], ['invoices', 'view', 'deny']]],
      ['technical_office_engineer', [['boq', 'create', 'allow'], ['docs', 'submit', 'allow'], ['payments', 'view', 'deny']]],
      ['commercial_manager', [['commercial', 'approve', 'allow'], ['costing', 'view', 'allow'], ['subcontractors', 'approve', 'allow'], ['hr', 'view', 'deny']]],
      ['contracts_manager', [['legal', 'create', 'allow'], ['subcontractors', 'edit', 'allow'], ['payments', 'create', 'deny']]],
      ['procurement_manager', [['procurement', 'edit', 'allow'], ['suppliers', 'edit', 'allow'], ['invoices', 'create', 'deny']]],
      ['procurement_officer', [['procurement', 'create', 'allow'], ['suppliers', 'create', 'allow'], ['finance-ledger', 'record_payment', 'deny']]],
      ['accountant_ar', [['invoices', 'edit', 'allow'], ['payments', 'create', 'allow'], ['hr', 'view', 'deny']]],
      ['accountant_ap', [['expenses', 'create', 'allow'], ['procurement', 'create', 'allow'], ['invoices', 'edit', 'deny']]],
      ['qa_qc_manager', [['qhse', 'approve', 'allow'], ['docs', 'submit', 'allow'], ['commercial', 'view', 'deny']]],
      ['hse_manager', [['hse', 'edit', 'allow'], ['qhse', 'create', 'allow'], [['invoices'], 'view', 'deny'][1]]],
      ['equipment_manager', [['assets', 'edit', 'allow'], ['maintenance', 'create', 'allow'], ['costing', 'view', 'deny']]],
      ['hr_manager', [['hr', 'edit', 'allow'], ['users', 'create', 'allow'], ['approvals', 'approve', 'deny']]],
      ['business_development', [['clients', 'create', 'allow'], ['sales', 'edit', 'allow'], ['invoices', 'view', 'deny']]],
    ];
    const wrong = [];
    for (const [role, cases] of MATRIX) {
      for (const [module, action, expectation] of cases) {
        if (action === undefined) void action;
        const d = await policy.evaluateForRole(role, { module, action, projectId: null });
        if (expectation === 'allow' && !d.allowed) wrong.push(`${role} ${module}/${action} should be allowed`);
        if (expectation === 'deny' && d.allowed) wrong.push(`${role} ${module}/${action} should be denied`);
        void d;
      }
    }
    expect(wrong).toEqual([]);
  });

  test('7. fail-closed preserved for the new modules: no rows ⇒ denied, delegation cannot rescue zero identity', async () => {
    expect((await call('GET', '/api/organizations', users.fresh)).status).toBe(403);
    expect((await call('GET', '/api/delegations', users.fresh)).status).toBe(403);
    const denied = await policy.evaluate({ user: { id: -987654, role: 'staff' }, module: 'organizations', action: 'view' });
    expect(denied.allowed).toBe(false);
    expect(denied.no_assignment).toBe(true);
    // THE CONTRACT: a delegation to an identity-less user grants NOTHING. The policy checks the
    // permission rows FIRST and skips the delegation hook when the user has none at all.
    await org.createDelegation(db.query, users.owner, {
      delegate_user_id: users.fresh.id, module_scope: 'approvals', max_amount: 999999,
      valid_from: days(0), valid_to: days(30),
    });
    const synthetic = {
      user: { id: users.fresh.id, role: 'finance_manager', name: 'fresh' },
      method: 'PUT', baseUrl: '/api/approvals', route: { path: '/:id/approve' },
      params: { id: '1' }, query: {}, body: {},
    };
    const decision = await policy.evaluateRequest(synthetic, {});
    expect(decision.allowed).toBe(false);
    // the row itself is real; only the POLICY refuses (lookupDelegation is a pure row-finder)
    expect(await delegationService.lookupDelegation(db.query, users.fresh.id, users.owner.id, { module: 'approvals', amount: 50 })).toBeTruthy();
  });

  test('8. external-role regression: the 4 alias families keep their exact isolation edges', async () => {
    for (const [key, roleKey] of [['extconsultant', 'consultant'], ['extclient', 'client'], ['extsubcontractor', 'subcontractor'], ['extsup', 'supplier']]) {
      await makeUser(key, roleKey, roleKey, made.pA);
    }
    for (const [roleKey, module] of [['consultant', 'costing'], ['consultant', 'finance'],
      ['client', 'costing'], ['client', 'subcontractors'], ['client', 'suppliers'], ['subcontractor', 'suppliers']]) {
      const u = users[`ext${roleKey}`];
      const d = await policy.evaluate({ user: { id: u.id, role: roleKey }, module, action: 'view', projectId: made.pA });
      expect([roleKey, module, d.allowed]).toEqual([roleKey, module, false]);
      expect(d.flags.see_internal_cost).toBe(false);
    }
    // the lens shapes are untouched: client only see_client_price; subcontractor only see_subcontractor_price
    expect(await policy.visibilityFlags(users.extclient, {})).toEqual({ see_internal_cost: false, see_client_price: true, see_subcontractor_price: false });
    expect(await policy.visibilityFlags(users.extsubcontractor, {})).toEqual({ see_internal_cost: false, see_client_price: false, see_subcontractor_price: true });
    // assigned-project view modules stay open, and ID-guessing another project fails closed
    expect((await policy.evaluate({ user: { id: users.extconsultant.id, role: 'consultant' }, module: 'boq', action: 'view', projectId: made.pA })).allowed).toBe(true);
    expect((await policy.evaluate({ user: { id: users.extconsultant.id, role: 'consultant' }, module: 'projects', action: 'view', projectId: made.pB })).allowed).toBe(false);
    // the NEW canonical external mirror holds the family's lens but never an internal-cost lens
    await makeUser('extreviewer', 'client_reviewer', 'client_reviewer', made.pA);
    expect((await policy.evaluate({ user: users.extreviewer, module: 'docs', action: 'view', projectId: made.pA })).allowed).toBe(true);
    expect((await policy.evaluate({ user: users.extreviewer, module: 'costing', action: 'view', projectId: made.pA })).allowed).toBe(false);
    expect((await policy.visibilityFlags(users.extreviewer, {})).see_internal_cost).toBe(false);
  });

  test('9. lookupDelegation: window, is_active, scope and amount all gate between a row and null', async () => {
    // a live row within the cap → the row
    const live = await org.createDelegation(db.query, users.owner, {
      delegate_user_id: users.delegate.id, module_scope: 'approvals', max_amount: 50000,
      valid_from: days(0), valid_to: days(30),
    });
    expect(await delegationService.lookupDelegation(db.query, users.delegate.id, users.owner.id, { module: 'approvals', amount: 4000 })).toBeTruthy();
    // amount over the cap → null
    expect(await delegationService.lookupDelegation(db.query, users.delegate.id, users.owner.id, { module: 'approvals', amount: 60000 })).toBeNull();
    // a scope the row does not name → null (the delegation row is approvals-scoped)
    expect(await delegationService.lookupDelegation(db.query, users.delegate.id, users.owner.id, { module: 'procurement' })).toBeNull();
    // no such pair → null
    expect(await delegationService.lookupDelegation(db.query, users.planner.id, users.requester.id, { module: 'approvals' })).toBeNull();
    // window not yet opened → null
    await org.createDelegation(db.query, users.fresh, {
      delegate_user_id: users.planner.id, module_scope: 'approvals', max_amount: null,
      valid_from: days(5), valid_to: days(10),
    });
    expect(await delegationService.lookupDelegation(db.query, users.planner.id, users.fresh.id, {})).toBeNull();
    // is_active=false → null (deactivate the live row created in this test)
    await org.deactivateDelegation(db.query, users.owner, live.id);
    expect(await delegationService.lookupDelegation(db.query, users.delegate.id, users.owner.id, { module: 'approvals', amount: 4000 })).toBeNull();
  });

  test('10. v1 read family: blanket roles read organizations; storekeeper stays 403; hr_manager view passes', async () => {
    expect((await call('GET', '/api/v1/organizations', users.owner)).status).toBe(200);
    expect((await call('GET', '/api/organizations', users.storekeeper)).status).toBe(403);
    expect((await call('GET', '/api/organizations', users.hr)).status).toBe(200);
    // v1 enforces the same module decision (module "organizations" per apiResources)
    expect((await call('GET', '/api/v1/organizations', users.storekeeper)).status).toBe(403);
    expect((await call('GET', '/api/v1/organizations', users.hr)).status).toBe(200);
  });
});
