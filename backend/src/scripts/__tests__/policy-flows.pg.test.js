// Real PostgreSQL + real app. Ported from the mock suite policy.test.js, against the REAL seeded
// roles/permissions/role_permissions catalog: the visibility-flags trio per role class (internal roles
// hold all three lenses, client sees client value, subcontractor sees subcontractor value only),
// listGrants (source + raw grants; none for a user with no role rows), preview-as-role evaluation
// (admin previewing consultant denied costing; an unassigned external project fails closed), the
// method→action mapping (pure function), and the append-only audit row written with JSON payloads
// into the real audit_events table — including the Phase 14 dual-write of the same event.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('policy flows (real PostgreSQL, real app)', () => {
  let db; let policy; let finance;
  const tag = String(Date.now()).slice(-7);
  let seq = 0;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  let project; let internal; let clientUser; let subUser; let grantsUser; let admin;
  const made = { users: [] };

  const mkUser = async (key, role, assignments = [{ roleKey: role, projectId: null }]) => {
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version", [`pol-${key}`, `pol-${key}-${tag}@test.io`, role]);
    for (const a of assignments) {
      await db.query(
        `INSERT INTO user_project_roles (user_id, project_id, role_id, organization_id) SELECT $1, $2, id, $3 FROM roles WHERE key = $4`,
        [row.id, a.projectId, a.organizationId ?? null, a.roleKey]);
    }
    made.users.push(row.id);
    return { id: row.id, role, name: `pol-${key}` };
  };

  beforeAll(async () => {
    db = require('../../config/database');
    policy = require('../../services/policy');
    finance = require('../../services/financeEngine');
    project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`pol-${tag}`, `PL${tag}`.slice(0, 20)])).id;
    // A second, unrelated project for the fail-closed preview test.
    const other = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`pol2-${tag}`, `P2${tag}`.slice(0, 20)])).id;
    seq += 1;
    internal = await mkUser('engineer', 'engineer');                         // company-wide row (project NULL)
    clientUser = await mkUser('client', 'client', [{ roleKey: 'client', projectId: project, organizationId: null }]);
    subUser = await mkUser('sub', 'subcontractor', [{ roleKey: 'subcontractor', projectId: project }]);
    grantsUser = await mkUser('fresh', 'staff', []);                        // users.role keeps a legacy value but NO role rows
    admin = await mkUser('admin', 'admin');
    void other;
  });

  afterAll(async () => {
    for (const u of made.users) {
      await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [u]);
      await db.query('UPDATE users SET is_active = false WHERE id = $1', [u]);
    }
    await db.pool.end();
  });

  test('1. the visibility trio per role class: internal roles hold all three lenses; client and subcontractor hold only their own', async () => {
    // Internal (company-wide engineer row backed by the seeded ('*','*') grants + the three flag permissions).
    const d = await policy.evaluate({ user: internal, module: 'costing', action: 'view' }, { query: db.query });
    expect(d.allowed).toBe(true);
    expect(d.source).toBe('policy');
    expect(d.flags).toEqual({ see_internal_cost: true, see_client_price: true, see_subcontractor_price: true });

    // Client: project-bound — sees client value, never internal cost or subcontractor value,
    // and never the internal-cost modules even on their own project.
    const clientDecision = await policy.evaluate({ user: clientUser, module: 'projects', action: 'view', projectId: project }, { query: db.query });
    expect(clientDecision.allowed).toBe(true);
    expect(clientDecision.flags.see_client_price).toBe(true);
    expect(clientDecision.flags.see_internal_cost).toBe(false);
    expect(clientDecision.flags.see_subcontractor_price).toBe(false);
    expect((await policy.evaluate({ user: clientUser, module: 'costing', action: 'view', projectId: project }, { query: db.query })).allowed).toBe(false);
    // …and the helper works identically without a module/action.
    const clientFlags = await policy.visibilityFlags(clientUser, { query: db.query });
    expect(clientFlags).toEqual({ see_internal_cost: false, see_client_price: true, see_subcontractor_price: false });

    // Subcontractor: the subcontractor lens only; suppliers are out of reach.
    const subDecision = await policy.evaluate({ user: subUser, module: 'subcontractors', action: 'view', projectId: project }, { query: db.query });
    expect(subDecision.allowed).toBe(true);
    expect(subDecision.flags).toEqual({ see_internal_cost: false, see_client_price: false, see_subcontractor_price: true });
    expect((await policy.evaluate({ user: subUser, module: 'suppliers', action: 'view', projectId: project }, { query: db.query })).allowed).toBe(false);
    const subFlags = await policy.visibilityFlags(subUser, { query: db.query });
    expect(subFlags).toEqual({ see_internal_cost: false, see_client_price: false, see_subcontractor_price: true });
  });

  test('2. listGrants reports the policy source with raw grants; a user with no role rows gets none', async () => {
    const internalGrants = await policy.listGrants(internal, { query: db.query });
    expect(internalGrants.source).toBe('policy');
    expect(internalGrants.grants.some((g) => g.perm_module === '*' && g.perm_action === '*')).toBe(true);

    const empty = await policy.listGrants(grantsUser, { query: db.query });
    expect(empty.source).toBe('policy');
    expect(empty.grants).toEqual([]);
    // No legacy fallback: the same user is denied and flagged as unassigned, whatever users.role says.
    const denied = await policy.evaluate({ user: grantsUser, module: 'costing', action: 'view' }, { query: db.query });
    expect(denied.allowed).toBe(false);
    expect(denied.no_assignment).toBe(true);
    expect(denied.source).toBe('policy');
    expect(await policy.visibilityFlags(grantsUser, { query: db.query })).toEqual({
      see_internal_cost: false, see_client_price: false, see_subcontractor_price: false,
    });
  });

  test('3. evaluateForRole (preview-as-role): admin previewing consultant is denied costing; an unassigned external project fails closed', async () => {
    // The previewed consultant role has no costing grants on the REAL seeded catalog.
    const costing = await policy.evaluateForRole('consultant', { module: 'costing', action: 'view' }, { query: db.query });
    expect(costing.allowed).toBe(false);
    // …but the consultant-visible modules preview through.
    const allowed = await policy.evaluateForRole('consultant', { module: 'projects', action: 'view' }, { query: db.query });
    expect(allowed.allowed).toBe(true);
    // Previewing an external role keeps the actor's own project scope: an unassigned project fails closed.
    const roaming = await policy.evaluateForRole('consultant', {
      module: 'projects', action: 'view', projectId: project, actorScopedProjects: [999999],
    }, { query: db.query });
    expect(roaming.allowed).toBe(false);
    // The actor assigned to the correct scope previews through.
    const scoped = await policy.evaluateForRole('consultant', {
      module: 'projects', action: 'view', projectId: project, actorScopedProjects: [project],
    }, { query: db.query });
    expect(scoped.allowed).toBe(true);
  });

  test('4. method-to-action mapping (pure)', () => {
    expect(policy.actionFromRequest({ method: 'GET' })).toBe('view');
    expect(policy.actionFromRequest({ method: 'HEAD' })).toBe('view');
    expect(policy.actionFromRequest({ method: 'POST' })).toBe('create');
    expect(policy.actionFromRequest({ method: 'PUT' })).toBe('edit');
    expect(policy.actionFromRequest({ method: 'PATCH' })).toBe('edit');
    expect(policy.actionFromRequest({ method: 'DELETE' })).toBe('delete');
    expect(policy.actionFromRequest({ method: 'WHATEVER' })).toBe('view');
  });

  test('5. recordAuditEvent writes entity/entity_id/action/before/after/user/project with JSON payloads, and the dual-write fills both column families', async () => {
    seq += 1;
    // Phase 4 row family, tagged (entity_id carries the run tag: audit_events is append-only
    // so a fresh identity is needed for every run to make the row findable).
    await policy.recordAuditEvent({
      entity: 'policy_scoped_probe', entityId: Number(tag), action: 'preview_as_role',
      before: { state: 'before' }, after: { preview_role: 'consultant' },
      userId: admin.id, projectId: project,
    }, { query: db.query });
    // The helper is append-only and has no RETURNING readback; the row is found by its tagged identity.
    const written = await one(
      "SELECT * FROM audit_events WHERE entity = 'policy_scoped_probe' AND action = 'preview_as_role' AND entity_id = $1 ORDER BY id DESC", [Number(tag)]);
    expect(written).toBeTruthy();
    expect(written.entity).toBe('policy_scoped_probe');
    expect(Number(written.entity_id)).toBe(Number(tag));
    expect(written.action).toBe('preview_as_role');
    expect(written.user_id).toBe(admin.id);
    expect(Number(written.project_id)).toBe(project);
    expect(typeof written.before).toBe('object');
    expect(written.before).toEqual({ state: 'before' });
    expect(written.after).toEqual({ preview_role: 'consultant' });

    // Phase 14 family: writeAuditEvent dual-writes the SAME event into both column families
    // (entity=entity_type, action=event_type, user_id=actor_id) so either reader sees the event.
    const dual = await finance.writeAuditEvent(db.query, {
      entity_type: 'policy_scoped_probe', entity_id: Number(tag), event_type: 'status_change',
      actor_id: admin.id, actor_name: admin.name, before_state: { x: 1 }, after_state: { x: 2 },
    });
    const dualRow = await one(
      "SELECT * FROM audit_events WHERE entity_type = 'policy_scoped_probe' AND event_type = 'status_change' AND entity_id = $1 ORDER BY id DESC", [Number(tag)]);
    expect(dualRow).toBeTruthy();
    expect(dualRow.entity_type).toBe('policy_scoped_probe');
    expect(dualRow.event_type).toBe('status_change');
    expect(dualRow.actor_id).toBe(admin.id);
    expect(dualRow.before_state).toEqual({ x: 1 });
    expect(dualRow.after_state).toEqual({ x: 2 });
    expect(dualRow.entity).toBe('policy_scoped_probe');     // Phase 4 mirror
    expect(dualRow.action).toBe('status_change');           // Phase 4 mirror
    expect(dualRow.user_id).toBe(admin.id);                 // Phase 4 mirror
    expect(dualRow.before).toEqual({ x: 1 });
    expect(dualRow.after).toEqual({ x: 2 });
    expect(JSON.stringify(dualRow.after_state)).toBe('{"x":2}');
  });
});
