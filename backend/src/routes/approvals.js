const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const policy = require('../services/policy');
const workflowEngine = require('../services/workflowEngine');
const { logActivity, fireEvent } = require('../utils/activity');

// Module roles mapping - who handles Stage 1 (manager_review) for each module.
// Phase 6: these maps now drive the 'legacy_module_approval' workflow template
// (seeded into workflow_steps conditions by migrate-19). The engine is the
// source of truth for stage transitions; these maps remain only for the
// /pending module filter and the timeline builder until the cleanup phase
// drops them together with the approval_requests table.
const DIRECT_TO_OWNER_MODULES = ['purchase_orders', 'grn'];

const MODULE_MANAGER_ROLES = {
  expenses: ['finance_manager'],
  payroll: ['finance_manager'],
  legal: ['legal_mgr'],
  assets: ['maintenance_mgr'],
  maintenance: ['maintenance_mgr'],
  project_budgets: ['project_manager'],
  sub_contracts: ['project_manager'],
};

// Modules the legacy approval workflow handles.
const APPROVAL_MODULES = [...Object.keys(MODULE_MANAGER_ROLES), ...DIRECT_TO_OWNER_MODULES];

// Structured summary of the underlying record, attached to each list row so the
// client can render/localize it instead of the bare "expense #19" FK pointer.
// Each `extract` returns { amount, category, text } — all optional; the client
// formats the money + translates the category for the active locale.
const SUMMARY_QUERIES = {
  expenses: {
    sql: 'SELECT id, amount, category, description FROM expenses WHERE id = ANY($1)',
    extract: (r) => ({ amount: r.amount, category: r.category || null, text: r.description || null }),
  },
  payroll: {
    sql: 'SELECT id, period_name, month, year, total_net_salary FROM payroll_periods WHERE id = ANY($1)',
    extract: (r) => ({ amount: r.total_net_salary, category: null, text: r.period_name || (r.month && r.year ? `${r.month}/${r.year}` : null) }),
  },
  legal: {
    sql: 'SELECT id, title, document_type FROM legal_documents WHERE id = ANY($1)',
    extract: (r) => ({ amount: null, category: null, text: r.title || r.document_type || null }),
  },
  project_budgets: {
    sql: `SELECT b.id, b.budget_amount, c.name AS cost_code_name
          FROM project_budgets b LEFT JOIN cost_codes c ON b.cost_code_id = c.id
          WHERE b.id = ANY($1)`,
    extract: (r) => ({ amount: r.budget_amount, category: null, text: r.cost_code_name || null }),
  },
  sub_contracts: {
    sql: 'SELECT id, contract_number, contract_value FROM sub_contracts WHERE id = ANY($1)',
    extract: (r) => ({ amount: r.contract_value, category: null, text: r.contract_number || null }),
  },
  assets: {
    sql: 'SELECT id, name, code FROM assets WHERE id = ANY($1)',
    extract: (r) => ({ amount: null, category: null, text: r.name || r.code || null }),
  },
  maintenance: {
    sql: 'SELECT id, title FROM maintenance_reminders WHERE id = ANY($1)',
    extract: (r) => ({ amount: null, category: null, text: r.title || null }),
  },
};

// Attaches `summary` to each approval row by batch-fetching from the source tables.
// summary = { amount, category, text }  when the source record exists
//         = { missing: true }           when a known module's source row was deleted
//         = null                        when the module has no summary mapping
async function enrichApprovalRows(rows) {
  if (!rows || rows.length === 0) return rows;
  const idsByModule = {};
  for (const r of rows) {
    if (!SUMMARY_QUERIES[r.module_name]) continue;
    (idsByModule[r.module_name] = idsByModule[r.module_name] || new Set()).add(r.request_id);
  }
  const summaryMap = {};
  for (const [mod, idSet] of Object.entries(idsByModule)) {
    try {
      const res = await query(SUMMARY_QUERIES[mod].sql, [Array.from(idSet)]);
      for (const srcRow of res.rows) {
        summaryMap[`${mod}:${srcRow.id}`] = SUMMARY_QUERIES[mod].extract(srcRow);
      }
    } catch (e) {
      console.error(`enrichApprovalRows: summary fetch failed for ${mod}:`, e.message);
    }
  }
  return rows.map((r) => {
    if (!SUMMARY_QUERIES[r.module_name]) return { ...r, summary: null };
    return { ...r, summary: summaryMap[`${r.module_name}:${r.request_id}`] || { missing: true } };
  });
}

// Shared stage-transition logic — Phase 6: delegates to the workflow engine.
// The engine enforces the self-approval guard, the module-manager role map
// and the two-stage transition; this adapter dual-writes approval_requests
// and returns the identical external response shape so Approvals.js and the
// approval-detail modal need no changes yet.
async function advanceApproval({ approvalId, userId, userName, role, notes, action }) {
  // One transaction; recordLegacyDecision locks the request row, so a request is decided once.
  return transaction((client) => workflowEngine.recordLegacyDecision(
    { approvalId, userId, userName, role, notes, action },
    { client, logActivity }
  ));
}

// POST /api/approvals/request - Create approval request
router.post('/request', authenticate, authorize(), async (req, res) => {
  try {
    const { module_name, request_type, notes } = req.body;
    const request_id = Number.isInteger(Number(req.body.request_id)) ? Number(req.body.request_id) : req.body.request_id;

    if (!APPROVAL_MODULES.includes(module_name)) {
      return res.status(400).json({ success: false, error: `Unknown approval module "${module_name}"; expected one of ${APPROVAL_MODULES.join(', ')}` });
    }
    if (!Number.isInteger(request_id) || !request_type) {
      return res.status(400).json({ success: false, error: 'request_type and an integer request_id are required' });
    }

    const stage = DIRECT_TO_OWNER_MODULES.includes(module_name) ? 'owner_review' : 'manager_review';

    // The request row and its workflow instance are created in one transaction (linked by legacy_approval_id);
    // if the workflow cannot start, nothing is saved and the caller gets the error. The unique index
    // uq_approval_requests_one_pending decides who wins a race; the loser reads the winner's row.
    const created = await transaction(async (client) => {
      const q = (text, params) => client.query(text, params);
      const inserted = await q(
        `INSERT INTO approval_requests (module_name, request_type, request_id, requester_id, notes, status, stage)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)
         ON CONFLICT (module_name, request_type, request_id) WHERE status = 'pending' DO NOTHING RETURNING *`,
        [module_name, request_type, request_id, req.user.id, notes, stage]
      );
      if (inserted.rows.length === 0) {
        const existing = await q(
          `SELECT * FROM approval_requests
           WHERE module_name = $1 AND request_id = $2 AND request_type = $3 AND status = 'pending'`,
          [module_name, request_id, request_type]
        );
        return { existing: existing.rows[0] };
      }
      await workflowEngine.startWorkflow('legacy_module_approval', module_name, request_id, {
        module_name,
        request_type,
        request_id,
        requester_id: req.user.id,
        legacy_approval_id: inserted.rows[0].id,
        notes: notes || null,
      }, { client });
      return { result: inserted };
    });
    if (created.existing) {
      return res.json({ success: true, requires_approval: true, request: created.existing, message: 'Approval request already exists' });
    }
    const result = created.result;

    await logActivity({
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      action: 'request_approval', module: module_name,
      description: `Approval requested for ${request_type} #${request_id}`,
      entityId: result.rows[0].id, entityType: 'approval_request'
    });

    // Phase 7: event hook point — let the people who can act on this request
    // know (dispatcher routes 'approval.requested' to owner/admin + module
    // manager).
    fireEvent({
      eventType: 'approval.requested',
      entityType: 'approval_request',
      entityId: result.rows[0].id,
      userId: req.user.id, userName: req.user.name, userRole: req.user.role,
      payload: {
        module_name, request_type, request_id,
        manager_role: (workflowEngine.MODULE_MANAGER_ROLES[module_name] || [])[0] || null,
        title: `Approval requested: ${request_type} #${request_id}`,
      },
    }).catch(() => {});

    res.json({ success: true, requires_approval: true, request: result.rows[0] });
  } catch (error) {
    console.error('Error creating approval request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/approvals/pending
router.get('/pending', authenticate, authorize(
  'owner', 'admin', 'finance_manager', 'purchasing_mgr', 'project_manager', 'legal_mgr', 'maintenance_mgr'
), async (req, res) => {
  try {
    const { role } = req.user;
    let result;

    // Policy grant (Phase 4): explicit permission checks instead of the old
    // hardcoded `role === 'owner' || role === 'admin'` bypass. Internal
    // approver roles hold ('*', '*') grants seeded in role_permissions;
    // module managers resolve through their per-module grants.
    const { grants } = await policy.listGrants(req.user);
    const seesAllPending = grants.some((g) => policy.grantMatches(g.perm_module, g.perm_action, 'approvals', 'approve'));
    const modulesForRole = Object.keys(MODULE_MANAGER_ROLES)
      .filter((mod) => grants.some((g) => policy.grantMatches(g.perm_module, g.perm_action, mod, 'approve')));
    if (seesAllPending) {
      result = await query(`
        SELECT ar.*, u.name as requester_name, u.email as requester_email, m.name as manager_name
        FROM approval_requests ar
        LEFT JOIN users u ON ar.requester_id = u.id
        LEFT JOIN users m ON ar.manager_id = m.id
        WHERE ar.status = 'pending' AND ar.stage IN ('manager_review', 'owner_review')
        ORDER BY ar.updated_at DESC
      `);
    } else {
      const modulesForRole = Object.entries(MODULE_MANAGER_ROLES)
        .filter(([, roles]) => roles.includes(role))
        .map(([mod]) => mod);

      result = modulesForRole.length > 0 ? await query(`
        SELECT ar.*, u.name as requester_name, u.email as requester_email, false::boolean as read_only
        FROM approval_requests ar
        LEFT JOIN users u ON ar.requester_id = u.id
        WHERE ar.status = 'pending' AND ar.stage = 'manager_review' AND ar.module_name = ANY($1)
        ORDER BY ar.created_at DESC
      `, [modulesForRole]) : { rows: [] };
    }

    const enriched = await enrichApprovalRows(result.rows);
    res.json({ success: true, count: enriched.length, requests: enriched });
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/approvals/:id/approve
router.put('/:id/approve', authenticate, authorize(), async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const { role, id: userId, name: userName } = req.user;
    const result = await advanceApproval({ approvalId: id, userId, userName, role, notes, action: 'approve' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    console.error('Error approving:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/approvals/:id/cancel — Phase 3 (open item): a non-destructive cancel for stale approvals.
// status 'cancelled' with cancelled_by, cancelled_at and a required reason; audit-logged; the linked
// workflow instance is cancelled with it. Nothing is deleted (cleanup-orphan-approvals.js --apply stays
// the destructive last resort). The claim is atomic, so a cancel racing a decision cannot double-write.
router.put('/:id/cancel', authenticate, authorize(), async (req, res) => {
  try {
    const { id } = req.params;
    const reason = (req.body && req.body.reason) || null;
    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({ success: false, error: 'A reason (min 3 characters) is required to cancel an approval', error_code: 'cancel_reason_required', error_params: {} });
    }
    const { role, id: userId, name: userName } = req.user;
    const result = await transaction(async (client) => {
      const q = client.query.bind(client);
      const existing = (await q('SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!existing) return { notFound: true };
      if (existing.status !== 'pending') return { conflict: existing.status };
      const cancelled = (await q(
        `UPDATE approval_requests
            SET status = 'cancelled', cancelled_by = $2, cancelled_at = now(), cancel_reason = $3, updated_at = now()
          WHERE id = $1 AND status = 'pending' RETURNING *`,
        [id, userId, reason]
      )).rows[0];
      // The workflow linked to this legacy approval (legacy_approval_id) stops with it, if one exists.
      const instances = (await q('SELECT id FROM workflow_instances WHERE legacy_approval_id = $1 AND status = $2', [id, 'active'])).rows;
      let workflowCancelled = 0;
      for (const inst of instances) {
        if (await workflowEngine.cancelWorkflowInstance(q, inst.id, { userId, reason })) workflowCancelled += 1;
      }
      return { cancelled, workflowCancelled };
    });
    if (result.notFound) return res.status(404).json({ success: false, error: 'Approval not found' });
    if (result.conflict) return res.status(409).json({ success: false, error: `Approval is already ${result.conflict}`, error_code: 'approval_not_cancellable', error_params: { status: result.conflict } });
    await logActivity({
      userId, userName, userRole: role,
      action: 'cancel', module: 'approvals',
      description: `Cancelled approval #${id} (${result.cancelled.module_name}): ${reason}${result.workflowCancelled ? ` — ${result.workflowCancelled} workflow instance(s) cancelled` : ''}`,
      entityId: parseInt(id, 10), entityType: 'approval_request',
    });
    return res.json({ success: true, data: result.cancelled, workflows_cancelled: result.workflowCancelled });
  } catch (error) {
    console.error('Error cancelling approval:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/approvals/stale — the dry-run report: what a cancel sweep would touch, touching nothing.
// owner/admin only (the cancel route itself is policy-gated; the report lists requesters and records).
router.get('/stale', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const olderThanDays = Math.max(1, parseInt(req.query.older_than_days || '30', 10));
    const rows = (await query(
      `SELECT ar.id, ar.module_name, ar.request_type, ar.request_id, ar.status, ar.created_at,
              requester.name AS requester_name, requester.role AS requester_role,
              wi.id AS workflow_instance_id, wi.status AS workflow_status
         FROM approval_requests ar
         LEFT JOIN users requester ON ar.requester_id = requester.id
         LEFT JOIN workflow_instances wi ON wi.legacy_approval_id = ar.id
        WHERE ar.status = 'pending'
          AND ar.created_at < now() - ($1 || ' days')::interval
        ORDER BY ar.created_at ASC
        LIMIT 500`,
      [String(olderThanDays)]
    )).rows;
    const byModule = {};
    for (const r of rows) byModule[r.module_name] = (byModule[r.module_name] || 0) + 1;
    res.json({
      success: true,
      data: {
        older_than_days: olderThanDays,
        total: rows.length,
        by_module: byModule,
        rows,
      },
    });
  } catch (error) {
    console.error('Error building the stale-approvals report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/approvals/:id/reject
router.put('/:id/reject', authenticate, authorize(), async (req, res) => {  try {
    const { id } = req.params;
    const { notes } = req.body;
    const { role, id: userId, name: userName } = req.user;
    const result = await advanceApproval({ approvalId: id, userId, userName, role, notes, action: 'reject' });
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    console.error('Error rejecting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/approvals/my-requests
router.get('/my-requests', authenticate, authorize(), async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const result = await query(`
      SELECT ar.*, approver.name as approver_name, approver.role as approver_role,
             manager.name as manager_name, manager.role as manager_role
      FROM approval_requests ar
      LEFT JOIN users approver ON ar.approver_id = approver.id
      LEFT JOIN users manager ON ar.manager_id = manager.id
      WHERE ar.requester_id = $1 ORDER BY ar.created_at DESC LIMIT $2
    `, [req.user.id, limit]);
    const enriched = await enrichApprovalRows(result.rows);
    res.json({ success: true, count: enriched.length, requests: enriched });
  } catch (error) {
    console.error('Error fetching my requests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/approvals/audit
router.get('/audit', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const { limit = 100, module_name, status } = req.query;
    let conditions = ['ar.status != \'pending\''];
    const params = [];
    let idx = 1;
    if (module_name && module_name !== 'all') { conditions.push(`ar.module_name = $${idx++}`); params.push(module_name); }
    if (status && status !== 'all') { conditions.push(`ar.status = $${idx++}`); params.push(status); }
    params.push(limit);
    const result = await query(`
      SELECT ar.*, requester.name as requester_name, requester.email as requester_email, requester.role as requester_role,
             approver.name as approver_name, approver.role as approver_role,
             manager.name as manager_name, manager.role as manager_role
      FROM approval_requests ar
      LEFT JOIN users requester ON ar.requester_id = requester.id
      LEFT JOIN users approver ON ar.approver_id = approver.id
      LEFT JOIN users manager ON ar.manager_id = manager.id
      WHERE ${conditions.join(' AND ')} ORDER BY ar.updated_at DESC LIMIT $${idx}
    `, params);
    const enriched = await enrichApprovalRows(result.rows);
    res.json({ success: true, count: enriched.length, records: enriched });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/approvals/check/:module/:requestId
router.get('/check/:module/:requestId', authenticate, authorize(), async (req, res) => {
  try {
    const { module, requestId } = req.params;
    const approval = await query(
      `SELECT * FROM approval_requests WHERE module_name = $1 AND request_id = $2::integer ORDER BY created_at DESC LIMIT 1`,
      [module, requestId]
    );
    if (approval.rows.length > 0 && approval.rows[0].status === 'approved') {
      return res.json({ requires_approval: false, approved: true });
    }
    res.json({ requires_approval: true, pending: approval.rows[0]?.status === 'pending' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/approvals/:id/details - Full detail of one approval request + its underlying record
const SOURCE_DETAIL_QUERIES = {
  expenses: `SELECT e.*, u.name AS created_by_name,
                    p.name_ar AS project_name_ar, p.name_en AS project_name_en, p.code AS project_code
             FROM expenses e
             LEFT JOIN users u ON e.created_by = u.id
             LEFT JOIN projects p ON e.project_id = p.id
             WHERE e.id = $1`,
  payroll: `SELECT pp.*, u.name AS created_by_name,
                   (SELECT COUNT(*) FROM payroll_details d WHERE d.payroll_id = pp.id) AS employee_lines
            FROM payroll_periods pp
            LEFT JOIN users u ON pp.created_by = u.id
            WHERE pp.id = $1`,
  legal: `SELECT l.*, u.name AS verified_by_name
          FROM legal_documents l
          LEFT JOIN users u ON l.verified_by = u.id
          WHERE l.id = $1`,
  project_budgets: `SELECT b.*, p.name_ar AS project_name_ar, p.name_en AS project_name_en, p.code AS project_code,
                           c.code AS cost_code, c.name AS cost_code_name
                    FROM project_budgets b
                    LEFT JOIN projects p ON b.project_id = p.id
                    LEFT JOIN cost_codes c ON b.cost_code_id = c.id
                    WHERE b.id = $1`,
  sub_contracts: `SELECT s.*, p.name_ar AS project_name_ar, p.name_en AS project_name_en, p.code AS project_code,
                         sc.name AS subcontractor_name
                  FROM sub_contracts s
                  LEFT JOIN projects p ON s.project_id = p.id
                  LEFT JOIN subcontractors sc ON s.subcontractor_id = sc.id
                  WHERE s.id = $1`,
  assets: `SELECT * FROM assets WHERE id = $1`,
  maintenance: `SELECT m.*, a.name AS asset_name, a.code AS asset_code
                FROM maintenance_reminders m
                LEFT JOIN assets a ON m.asset_id = a.id
                WHERE m.id = $1`,
};

const PRIVILEGED_APPROVAL_ROLES = ['owner', 'admin', 'finance_manager', 'purchasing_mgr', 'project_manager', 'legal_mgr', 'maintenance_mgr'];

function buildApprovalTimeline(ar) {
  const directToOwner = DIRECT_TO_OWNER_MODULES.includes(ar.module_name);
  const steps = [{
    stage: 'submitted', state: 'done',
    actor_name: ar.requester_name || null, actor_role: ar.requester_role || null,
    at: ar.created_at, notes: null,
  }];

  if (!directToOwner) {
    let mgr;
    if (ar.manager_approved_at) {
      mgr = { state: 'done', actor_name: ar.manager_name, actor_role: ar.manager_role, at: ar.manager_approved_at, notes: ar.manager_notes };
    } else if (ar.status === 'rejected') {
      mgr = { state: 'rejected', actor_name: ar.approver_name, actor_role: ar.approver_role, at: ar.updated_at, notes: ar.notes };
    } else if (ar.status === 'pending' && ar.stage === 'manager_review') {
      mgr = { state: 'current', actor_name: null, actor_role: null, at: null, notes: null };
    } else {
      mgr = { state: 'upcoming', actor_name: null, actor_role: null, at: null, notes: null };
    }
    steps.push({ stage: 'manager_review', ...mgr });
  }

  let own;
  if (ar.status === 'approved') {
    own = { state: 'done', actor_name: ar.approver_name, actor_role: ar.approver_role, at: ar.updated_at, notes: ar.notes };
  } else if (ar.status === 'rejected' && (directToOwner || ar.manager_approved_at)) {
    own = { state: 'rejected', actor_name: ar.approver_name, actor_role: ar.approver_role, at: ar.updated_at, notes: ar.notes };
  } else if (ar.status === 'pending' && ar.stage === 'owner_review') {
    own = { state: 'current', actor_name: null, actor_role: null, at: null, notes: null };
  } else {
    own = { state: 'upcoming', actor_name: null, actor_role: null, at: null, notes: null };
  }
  steps.push({ stage: 'owner_review', ...own });
  return steps;
}

router.get('/:id/details', authenticate, authorize(), async (req, res) => {
  try {
    const { id } = req.params;
    const arRes = await query(`
      SELECT ar.*,
             requester.name AS requester_name, requester.email AS requester_email, requester.role AS requester_role,
             manager.name AS manager_name, manager.role AS manager_role,
             approver.name AS approver_name, approver.role AS approver_role
      FROM approval_requests ar
      LEFT JOIN users requester ON ar.requester_id = requester.id
      LEFT JOIN users manager ON ar.manager_id = manager.id
      LEFT JOIN users approver ON ar.approver_id = approver.id
      WHERE ar.id = $1
    `, [id]);
    if (arRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    const ar = arRes.rows[0];

    if (ar.requester_id !== req.user.id && !PRIVILEGED_APPROVAL_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this request' });
    }

    let source = null;
    const sql = SOURCE_DETAIL_QUERIES[ar.module_name];
    if (sql) {
      try {
        const sRes = await query(sql, [ar.request_id]);
        source = sRes.rows[0] || null;
      } catch (e) {
        console.error(`approval detail: source fetch failed for ${ar.module_name}#${ar.request_id}:`, e.message);
      }
    }

    res.json({ success: true, request: ar, source, timeline: buildApprovalTimeline(ar) });
  } catch (error) {
    console.error('Error fetching approval details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
module.exports.advanceApproval = advanceApproval;
