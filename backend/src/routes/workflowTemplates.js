// G2.2: admin editor for the table-driven workflow engine (workflow_templates +
// workflow_steps, schema in scripts/workflow-engine-migration.js — the legacy
// JS-script layer already applied; this router only reads/edits rows, it never
// re-migrates). Exposed under the `approvals` policy module (services/policy.js
// MODULE_OVERRIDES) because template editing is approval configuration, and
// restricted to owner/admin by role on every handler.
'use strict';

const express = require('express');
const Joi = require('joi');
const { authenticate, authorize } = require('../middleware/auth');
const { routeFail, typedBody } = require('../utils/typedRoute');
const { query, transaction } = require('../config/database');
const { recordAuditEvent } = require('../services/policy');

const router = express.Router();

const STEP_EDIT_SCHEMA = Joi.object({
  resolver_value: Joi.string().allow(null, '').max(100),
  sla_hours: Joi.number().integer().min(0).allow(null),
}).unknown(false); // unknown keys (resolver_type in particular) are rejected up front

const TEMPLATE_EDIT_SCHEMA = Joi.object({
  is_active: Joi.boolean().required(),
}).unknown(false);

// workflowEngine.js reads steps live at instance start (startWorkflow →
// loadSteps) AND when resolving decisions on running instances, but a step
// added to the template after an instance started never appears in that
// instance. So: deactivating a template blocks new instances only, while a
// step's resolver/SLA edit is also read by in-flight instances of the template.
// The AdminWorkspace UI note states both halves of this.

router.get('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const r = await query(
      `SELECT t.id, t.key, t.name, t.entity_type_scope, t.description, t.is_active, t.created_at,
              COUNT(s.id)::int AS step_count
         FROM workflow_templates t
         LEFT JOIN workflow_steps s ON s.template_id = t.id
        GROUP BY t.id
        ORDER BY t.key`
    );
    res.json({ success: true, data: r.rows });
  } catch (error) { return routeFail(res, error, 'WORKFLOW_TEMPLATES', req); }
});

router.get('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Invalid template id', error_code: 'validation_error', error_params: { field: 'id' } });
    }
    const template = await query('SELECT id, key, name, entity_type_scope, description, is_active, created_at FROM workflow_templates WHERE id = $1', [id]);
    if (!template.rows[0]) {
      return res.status(404).json({ success: false, error: 'Workflow template not found', error_code: 'not_found', error_params: {} });
    }
    const steps = await query(
      `SELECT id, step_key, name, sort_order, mode, resolver_type, resolver_value, amount_threshold,
              sla_hours, is_terminal
         FROM workflow_steps WHERE template_id = $1 ORDER BY sort_order, id`,
      [id]
    );
    res.json({ success: true, data: { ...template.rows[0], steps: steps.rows } });
  } catch (error) { return routeFail(res, error, 'WORKFLOW_TEMPLATES', req); }
});

// Only resolver_value and sla_hours are editable; resolver_type is engine
// semantics (role/requester/amount routing) and is intentionally immutable
// here — changing it through the UI would silently re-route approvals.
router.put('/:id/steps/:stepId', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const id = Number(req.params.id); const stepId = Number(req.params.stepId);
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(stepId) || stepId < 1) {
      return res.status(400).json({ success: false, error: 'Invalid template or step id', error_code: 'validation_error', error_params: { field: 'id' } });
    }
    if (req.body && req.body.resolver_type !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'resolver_type cannot be changed; only resolver_value and sla_hours are editable',
        error_code: 'resolver_type_immutable',
        error_params: {},
      });
    }
    const body = typedBody(STEP_EDIT_SCHEMA, req, res);
    if (!body) return;

    const step = await transaction(async (client) => {
      const current = await client.query('SELECT id, template_id, step_key, resolver_type, resolver_value, sla_hours FROM workflow_steps WHERE id = $1 AND template_id = $2 FOR UPDATE', [stepId, id]);
      if (!current.rows[0]) return null;
      const before = current.rows[0];
      if (body.resolver_value != null && body.resolver_value !== '' && before.resolver_type === 'role') {
        const role = await client.query('SELECT 1 FROM roles WHERE key = $1', [body.resolver_value]);
        if (!role.rows[0]) {
          const err = new Error('Unknown approver role');
          err.status = 400; err.error_code = 'unknown_role'; err.error_params = { field: 'resolver_value' };
          throw err;
        }
      }
      const resolverValue = body.resolver_value === '' ? null : body.resolver_value;
      const sla = body.sla_hours === undefined ? before.sla_hours : body.sla_hours;
      const updated = await client.query(
        'UPDATE workflow_steps SET resolver_value = $1, sla_hours = $2 WHERE id = $3 AND template_id = $4 RETURNING id, step_key, name, sort_order, resolver_type, resolver_value, sla_hours',
        [resolverValue, sla, stepId, id]
      );
      await recordAuditEvent({
        entity: 'workflow_step', entityId: stepId, action: 'edit',
        before: { resolver_value: before.resolver_value, sla_hours: before.sla_hours },
        after: { resolver_value: updated.rows[0].resolver_value, sla_hours: updated.rows[0].sla_hours },
        userId: req.user.id, projectId: null, ipAddress: req.ip, requestId: req.requestId || null,
      }, { query: client.query.bind(client) });
      return updated.rows[0];
    });
    if (!step) {
      return res.status(404).json({ success: false, error: 'Workflow step not found', error_code: 'not_found', error_params: {} });
    }
    res.json({ success: true, data: step });
  } catch (error) { return routeFail(res, error, 'WORKFLOW_TEMPLATES', req); }
});

router.put('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ success: false, error: 'Invalid template id', error_code: 'validation_error', error_params: { field: 'id' } });
    }
    const body = typedBody(TEMPLATE_EDIT_SCHEMA, req, res);
    if (!body) return;
    const template = await transaction(async (client) => {
      const current = await client.query('SELECT id, key, is_active FROM workflow_templates WHERE id = $1 FOR UPDATE', [id]);
      if (!current.rows[0]) return null;
      const updated = await client.query('UPDATE workflow_templates SET is_active = $1 WHERE id = $2 RETURNING id, key, name, is_active', [body.is_active, id]);
      await recordAuditEvent({
        entity: 'workflow_template', entityId: id, action: 'edit',
        before: { is_active: current.rows[0].is_active },
        after: { is_active: updated.rows[0].is_active },
        userId: req.user.id, projectId: null, ipAddress: req.ip, requestId: req.requestId || null,
      }, { query: client.query.bind(client) });
      return updated.rows[0];
    });
    if (!template) {
      return res.status(404).json({ success: false, error: 'Workflow template not found', error_code: 'not_found', error_params: {} });
    }
    res.json({ success: true, data: template });
  } catch (error) { return routeFail(res, error, 'WORKFLOW_TEMPLATES', req); }
});

module.exports = router;
