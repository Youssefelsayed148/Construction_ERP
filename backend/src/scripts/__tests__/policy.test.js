// Unit tests for the Phase 4 policy-evaluation service (services/policy.js).
//
// All tests inject a stub query function — no live database required. The
// stub returns the joined USER_POLICY_SQL row shape:
//   { role_key, project_id, organization_id, perm_module, perm_action }

const policy = require('../../services/policy');

// ---------------------------------------------------------------------------
// Stub query builders
// ---------------------------------------------------------------------------

// rows are keyed by user id; each entry is a list of joined policy rows.
function stubQuery(userRows) {
  return async (sql, params) => {
    if (/FROM\s+user_project_roles/i.test(sql)) {
      return { rows: userRows[params[0]] || [] };
    }
    if (/FROM\s+roles/i.test(sql)) {
      return { rows: userRows[params[0]] || [] };
    }
    if (/INSERT INTO\s+audit_events/i.test(sql)) {
      return { rows: [{ id: 1 }] };
    }
    throw new Error(`stubQuery: unexpected SQL: ${sql.slice(0, 80)}`);
  };
}

const internalFull = (roleKey, projects = []) => {
  const rows = [];
  for (const pid of projects) {
    rows.push({ role_key: roleKey, project_id: pid, organization_id: 1, perm_module: '*', perm_action: '*' });
  }
  rows.push({ role_key: roleKey, project_id: null, organization_id: 1, perm_module: '*', perm_action: '*' });
  for (const flag of ['see_internal_cost', 'see_client_value', 'see_subcontract_value']) {
    rows.push({ role_key: roleKey, project_id: null, organization_id: 1, perm_module: '*', perm_action: flag });
  }
  return rows;
};

// External consultant: view on project modules, bound to project 1 only.
const consultantRows = [
  ...['projects', 'boq', 'qhse', 'docs', 'work-orders', 'documents'].flatMap((m) => [
    { role_key: 'consultant', project_id: 1, organization_id: 2, perm_module: m, perm_action: 'view' },
  ]),
  // No company-wide row — external users stay project-bound.
];

const clientRows = [
  ...['projects', 'docs', 'qhse', 'boq'].flatMap((m) => [
    { role_key: 'client', project_id: 7, organization_id: 3, perm_module: m, perm_action: 'view' },
  ]),
  { role_key: 'client', project_id: 7, organization_id: 3, perm_module: '*', perm_action: 'see_client_value' },
];

const subcontractorRows = [
  { role_key: 'subcontractor', project_id: 7, organization_id: 4, perm_module: 'subcontractors', perm_action: 'view' },
  { role_key: 'subcontractor', project_id: 7, organization_id: 4, perm_module: '*', perm_action: 'see_subcontract_value' },
];

const USERS = {
  1: internalFull('owner'),
  2: internalFull('admin'),
  3: internalFull('site_supervisor', [1]),
  4: consultantRows,
  5: clientRows,
  6: subcontractorRows,
  7: [], // migration incomplete
};

const query = stubQuery(USERS);

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

describe('policy.evaluate — internal roles (parity path)', () => {
  test('owner is allowed everywhere via explicit seeded grants, not hardcoded bypasses', async () => {
    for (const module of ['costing', 'finance', 'users', 'hr', 'projects']) {
      const d = await policy.evaluate({ user: { id: 1, role: 'owner' }, module, action: 'view' }, { query });
      expect(d.allowed).toBe(true);
      expect(d.source).toBe('policy');
    }
  });

  test('admin mirrors owner', async () => {
    const d = await policy.evaluate({ user: { id: 2, role: 'admin' }, module: 'payroll', action: 'delete' }, { query });
    expect(d.allowed).toBe(true);
  });

  test('internal staff can still view every module they could before', async () => {
    for (const module of ['costing', 'finance', 'suppliers', 'subcontractors', 'invoices']) {
      const d = await policy.evaluate({ user: { id: 3, role: 'site_supervisor' }, module, action: 'view' }, { query });
      expect(d.allowed).toBe(true);
    }
  });
});

describe('policy.evaluate — external roles (isolation path)', () => {
  test('consultant cannot view costing or finance (internal cost fields)', async () => {
    for (const module of ['costing', 'finance']) {
      for (const action of ['view', 'create', 'edit']) {
        const d = await policy.evaluate({ user: { id: 4, role: 'consultant' }, module, action, projectId: 1 }, { query });
        expect(d.allowed).toBe(false);
      }
    }
  });

  test('consultant CAN view assigned-project modules', async () => {
    for (const module of ['projects', 'boq', 'qhse', 'docs', 'work-orders', 'documents']) {
      const d = await policy.evaluate({ user: { id: 4, role: 'consultant' }, module, action: 'view', projectId: 1 }, { query });
      expect(d.allowed).toBe(true);
    }
  });

  test('consultant cannot ID-guess a project they are not assigned to', async () => {
    const d = await policy.evaluate({ user: { id: 4, role: 'consultant' }, module: 'projects', action: 'view', projectId: 2 }, { query });
    expect(d.allowed).toBe(false);
  });

  test('client cannot retrieve subcontractor or supplier rates', async () => {
    for (const module of ['subcontractors', 'suppliers']) {
      const d = await policy.evaluate({ user: { id: 5, role: 'client' }, module, action: 'view' }, { query });
      expect(d.allowed).toBe(false);
    }
  });

  test('client cannot see internal cost fields even on their own project', async () => {
    const d = await policy.evaluate({ user: { id: 5, role: 'client' }, module: 'costing', action: 'view', projectId: 7 }, { query });
    expect(d.allowed).toBe(false);
  });

  test('client cannot ID-guess an unassigned project', async () => {
    const d = await policy.evaluate({ user: { id: 5, role: 'client' }, module: 'projects', action: 'view', projectId: 8 }, { query });
    expect(d.allowed).toBe(false);
  });

  test('subcontractor cannot enumerate suppliers', async () => {
    const d = await policy.evaluate({ user: { id: 6, role: 'subcontractor' }, module: 'suppliers', action: 'view' }, { query });
    expect(d.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Visibility flags
// ---------------------------------------------------------------------------

describe('policy visibility flags', () => {
  test('internal roles hold all three lenses', async () => {
    const d = await policy.evaluate({ user: { id: 1, role: 'owner' }, module: 'costing', action: 'view' }, { query });
    expect(d.flags).toEqual({
      see_internal_cost: true,
      see_client_price: true,
      see_subcontractor_price: true,
    });
  });

  test('client sees client price but never internal cost or subcontractor price', async () => {
    const d = await policy.evaluate({ user: { id: 5, role: 'client' }, module: 'projects', action: 'view', projectId: 7 }, { query });
    expect(d.flags.see_client_price).toBe(true);
    expect(d.flags.see_internal_cost).toBe(false);
    expect(d.flags.see_subcontractor_price).toBe(false);
  });

  test('subcontractor sees subcontractor price only', async () => {
    const d = await policy.evaluate({ user: { id: 6, role: 'subcontractor' }, module: 'subcontractors', action: 'view', projectId: 7 }, { query });
    expect(d.flags).toEqual({
      see_internal_cost: false,
      see_client_price: false,
      see_subcontractor_price: true,
    });
  });

  test('visibilityFlags() helper works independently of a module/action', async () => {
    const flags = await policy.visibilityFlags({ id: 5, role: 'client' }, { query });
    expect(flags.see_client_price).toBe(true);
    expect(flags.see_internal_cost).toBe(false);
  });

  test('visibilityFlags() legacy fallback: internal roles see all, external see none', async () => {
    const internal = await policy.visibilityFlags({ id: 42, role: 'engineer' }, { query: stubQuery({}) });
    expect(internal).toEqual({ see_internal_cost: true, see_client_price: true, see_subcontractor_price: true });
    const external = await policy.visibilityFlags({ id: 43, role: 'client' }, { query: stubQuery({}) });
    expect(external).toEqual({ see_internal_cost: false, see_client_price: false, see_subcontractor_price: false });
  });
});

// ---------------------------------------------------------------------------
// Legacy fallback
// ---------------------------------------------------------------------------

describe('policy.evaluate — legacy fallback (migration incomplete)', () => {
  test('a user with no user_project_roles rows falls back to the legacy check', async () => {
    const d = await policy.evaluate({ user: { id: 7, role: 'staff' }, module: 'costing', action: 'view' }, { query });
    expect(d.source).toBe('legacy');
    expect(d.allowed).toBeNull();
  });

  test('unknown user is denied outright', async () => {
    const d = await policy.evaluate({ user: null, module: 'costing', action: 'view' }, { query });
    expect(d.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasPermission — the hardcoded-bypass replacement primitive
// ---------------------------------------------------------------------------

describe('policy.hasPermission', () => {
  test('migrated owner has the approvals approve grant', async () => {
    expect(await policy.hasPermission({ id: 1, role: 'owner' }, 'approvals', 'approve', { query })).toBe(true);
  });

  test('external client does not', async () => {
    expect(await policy.hasPermission({ id: 5, role: 'client' }, 'approvals', 'approve', { query })).toBe(false);
  });

  test('legacy fallback (un-migrated user): owner/admin only — same as the old bypass', async () => {
    expect(await policy.hasPermission({ id: 7, role: 'owner' }, 'approvals', 'approve', { query })).toBe(true);
    expect(await policy.hasPermission({ id: 7, role: 'finance_manager' }, 'approvals', 'approve', { query })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listGrants — approvals /pending module scoping
// ---------------------------------------------------------------------------

describe('policy.listGrants', () => {
  test('reports the policy source with raw grants', async () => {
    const out = await policy.listGrants({ id: 5, role: 'client' }, { query });
    expect(out.source).toBe('policy');
    expect(out.grants.some((g) => g.perm_module === 'projects' && g.perm_action === 'view')).toBe(true);
  });

  test('reports legacy for un-migrated users', async () => {
    const out = await policy.listGrants({ id: 7, role: 'staff' }, { query });
    expect(out.source).toBe('legacy');
    expect(out.grants).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Request-shaped evaluation
// ---------------------------------------------------------------------------

describe('policy.evaluateRequest', () => {
  test('derives module from the Express mount path', async () => {
    const d = await policy.evaluateRequest(
      { user: { id: 4, role: 'consultant' }, method: 'GET', baseUrl: '/api/costing', params: {}, query: {} },
      { query }
    );
    expect(d.allowed).toBe(false);
  });

  test('derives the project from :projectId path params', async () => {
    const allowed = await policy.evaluateRequest(
      { user: { id: 4, role: 'consultant' }, method: 'GET', baseUrl: '/api/projects', params: { projectId: 1 }, query: {} },
      { query }
    );
    const denied = await policy.evaluateRequest(
      { user: { id: 4, role: 'consultant' }, method: 'GET', baseUrl: '/api/projects', params: { projectId: 9 }, query: {} },
      { query }
    );
    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
  });

  test('derives the project from ?project_id= query params (qhse/doccontrol style)', async () => {
    const denied = await policy.evaluateRequest(
      { user: { id: 4, role: 'consultant' }, method: 'GET', baseUrl: '/api/qhse', params: {}, query: { project_id: 2 } },
      { query }
    );
    expect(denied.allowed).toBe(false);
  });

  test('derives the project from write payloads', async () => {
    const denied = await policy.evaluateRequest(
      { user: { id: 4, role: 'consultant' }, method: 'POST', baseUrl: '/api/qhse', params: {}, query: {}, body: { project_id: 2 } },
      { query }
    );
    expect(denied.allowed).toBe(false);
    expect(denied.project_id).toBe(2);
  });

  test('resolves record IDs to their owning project before deciding', async () => {
    const recordQuery = async (sql, params) => {
      if (/FROM\s+invoices\s+WHERE/i.test(sql)) {
        return { rows: [{ project_id: params[0] === 10 ? 1 : 9 }] };
      }
      return query(sql, params);
    };
    const allowed = await policy.evaluateRequest(
      { user: { id: 4, role: 'consultant' }, method: 'GET', baseUrl: '/api/invoices', route: { path: '/:id' }, params: { id: 10 }, query: {} },
      { query: recordQuery }
    );
    const denied = await policy.evaluateRequest(
      { user: { id: 4, role: 'consultant' }, method: 'GET', baseUrl: '/api/invoices', route: { path: '/:id' }, params: { id: 11 }, query: {} },
      { query: recordQuery }
    );
    // Consultant has no invoice permission, but both decisions prove the
    // resolved owner project is carried into the policy result.
    expect(allowed.project_id).toBe(1);
    expect(denied.project_id).toBe(9);
    expect(denied.allowed).toBe(false);
  });

  test('does not let a body project_id override a record owner', async () => {
    const context = await policy.resolveProjectContext(
      { route: { path: '/:id' }, params: { id: 44 }, query: {}, body: { project_id: 1 } },
      'invoices',
      async () => ({ rows: [{ project_id: 9 }] })
    );
    expect(context).toEqual({ projectId: 9, recordScoped: true, recordFound: false });
  });

  test('project-scoped grants cannot access legacy records with no project owner', async () => {
    const scopedQuery = async (sql) => {
      if (/FROM\s+invoices\s+WHERE/i.test(sql)) return { rows: [{ project_id: null }] };
      if (/FROM\s+user_project_roles/i.test(sql)) {
        return { rows: [{ role_key: 'consultant', project_id: 1, organization_id: 3, perm_module: 'invoices', perm_action: 'view' }] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    };
    const decision = await policy.evaluateRequest(
      { user: { id: 4, role: 'consultant' }, method: 'GET', baseUrl: '/api/invoices', route: { path: '/:id' }, params: { id: 10 }, query: {}, body: {} },
      { query: scopedQuery }
    );
    expect(decision.allowed).toBe(false);
  });

  test('maps HTTP methods to policy actions', () => {
    expect(policy.actionFromRequest({ method: 'GET' })).toBe('view');
    expect(policy.actionFromRequest({ method: 'POST' })).toBe('create');
    expect(policy.actionFromRequest({ method: 'PUT' })).toBe('edit');
    expect(policy.actionFromRequest({ method: 'DELETE' })).toBe('delete');
  });

  test('req.params.id is only trusted as a project on the projects mount (ID-guess rule)', () => {
    expect(policy.extractProjectId({ params: { id: 5 } }, 'projects')).toBe(5);
    expect(policy.extractProjectId({ params: { id: 5 } }, 'invoices')).toBeNull();
  });

  test.each([
    ['warehouses', '/:id/movements', { id: '14' }, /FROM warehouses WHERE id/i],
    ['finance-ledger', '/invoices/:id/transition', { id: '15' }, /FROM invoices WHERE id/i],
    ['handover', '/claims/:id/status', { id: '16' }, /FROM warranty_claims WHERE id/i],
    ['quantities', '/measurements/:id/review', { id: '17' }, /FROM quantity_measurements WHERE id/i],
  ])('resolves %s record routes before authorization', async (module, routePath, params, expectedSql) => {
    const calls = [];
    const context = await policy.resolveProjectContext(
      { route: { path: routePath }, params, query: {}, body: {} },
      module,
      async (sql, values) => { calls.push({ sql, values }); return { rows: [{ project_id: 7 }] }; }
    );
    expect(context).toEqual({ projectId: 7, recordScoped: true, recordFound: true });
    expect(calls[0].sql).toMatch(expectedSql);
    expect(calls[0].values).toEqual([params.id]);
  });

  test('resolves nested warehouse movement ownership through its warehouse', async () => {
    const context = await policy.resolveProjectContext(
      { route: { path: '/movements/:id/reverse' }, params: { id: '22' }, query: {}, body: {} },
      'warehouses',
      async (sql, values) => {
        expect(sql).toMatch(/stock_movements sm JOIN warehouses w/i);
        expect(values).toEqual(['22']);
        return { rows: [{ project_id: 3 }] };
      }
    );
    expect(context.projectId).toBe(3);
  });

  test('uses named record parameters for location dashboards', async () => {
    const context = await policy.resolveProjectContext(
      { route: { path: '/locations/:locationId/dashboard' }, params: { locationId: '31' }, query: {}, body: {} },
      'quantities',
      async (sql, values) => {
        expect(sql).toMatch(/FROM project_locations WHERE id/i);
        expect(values).toEqual(['31']);
        return { rows: [{ project_id: 4 }] };
      }
    );
    expect(context.projectId).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Preview-as-role demo mode
// ---------------------------------------------------------------------------

describe('policy.evaluateForRole (preview-as-role)', () => {
  const roleQuery = async (sql) => {
    if (/FROM\s+roles/i.test(sql)) {
      // role grants for the previewed consultant role
      return { rows: consultantRows.map((r) => ({ perm_module: r.perm_module, perm_action: r.perm_action })) };
    }
    if (/FROM\s+user_project_roles/i.test(sql)) {
      return { rows: [{ project_id: 1 }, { project_id: 2 }] };
    }
    throw new Error('unexpected SQL');
  };

  test('an admin previewing consultant sees the consultant view of costing (denied)', async () => {
    const d = await policy.evaluateForRole('consultant', { module: 'costing', action: 'view' }, { query: roleQuery });
    expect(d.allowed).toBe(false);
  });

  test('previewing consultant can read consultant-visible modules', async () => {
    const d = await policy.evaluateForRole('consultant', { module: 'projects', action: 'view' }, { query: roleQuery });
    expect(d.allowed).toBe(true);
  });

  test('previewing an external role on an unassigned project fails closed', async () => {
    const d = await policy.evaluateForRole('consultant', { module: 'projects', action: 'view', projectId: 3, actorScopedProjects: [1, 2] }, { query: roleQuery });
    expect(d.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Audit trail helper
// ---------------------------------------------------------------------------

describe('policy.recordAuditEvent', () => {
  test('writes entity/entity_id/action/before/after/user/project with JSON payloads', async () => {
    const captured = [];
    const q = async (sql, params) => {
      captured.push({ sql: sql.replace(/\s+/g, ' '), params });
      return { rows: [{ id: 9 }] };
    };
    const out = await policy.recordAuditEvent({
      entity: 'user', entityId: 5, action: 'preview_as_role',
      before: null, after: { preview_role: 'consultant' },
      userId: 1, projectId: null,
    }, { query: q });
    expect(out.id).toBe(9);
    expect(captured[0].sql).toMatch(/INSERT INTO\s+audit_events/i);
    expect(captured[0].sql).toMatch(/"before"/);
    expect(captured[0].sql).toMatch(/"after"/);
    expect(JSON.parse(captured[0].params[4])).toEqual({ preview_role: 'consultant' });
    expect(captured[0].params[5]).toBe(1);
  });
});
