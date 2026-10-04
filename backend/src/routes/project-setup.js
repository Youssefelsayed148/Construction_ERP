// Phase 5.2 (spec 05, 06) - project setup routes, mounted at /api/projects next to projects.js and site.js:
//   settings, calendars, WBS nodes and work packages. Policy module is "projects" (mount-derived), the action
//   follows the HTTP verb, project scope comes from :id. Writes are audited; every error carries error_code.
const express = require('express');
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const setup = require('../services/projectSetupService');

const router = express.Router();

function fail(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error('[PROJECT-SETUP]', e);
  return res.status(status).json({
    success: false,
    error: e.message,
    ...(e.error_code ? { error_code: e.error_code, error_params: e.error_params || {} } : {}),
  });
}

function validated(schema, body, res) {
  const { error, value } = schema.validate(body, { abortEarly: true });
  if (error) {
    res.status(400).json({
      success: false, error: error.details[0].message,
      error_code: 'validation_error', error_params: { field: error.details[0].path.join('.') },
    });
    return null;
  }
  return value;
}

const audit = (req, description, entityType, entityId) => logActivity({
  userId: req.user.id, userName: req.user.name, userRole: req.user.role,
  action: req.method === 'DELETE' ? 'delete' : req.method === 'POST' ? 'create' : 'update',
  module: 'projects', description, entityId, entityType,
});

// --- settings ---------------------------------------------------------------------------------
router.get('/:id/settings', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await setup.getSettings(query, req.params.id) }); } catch (e) { return fail(res, e); }
});

router.put('/:id/settings', authenticate, authorize(), async (req, res) => {
  try {
    const value = validated(Joi.object({ settings: Joi.object().min(1).required() }), req.body, res);
    if (!value) return;
    const data = await transaction((client) => setup.putSettings(client.query.bind(client), req.params.id, value.settings, req.user.id));
    await audit(req, `Updated project settings (${Object.keys(value.settings).join(', ')})`, 'project_settings', Number(req.params.id));
    res.json({ success: true, data });
  } catch (e) { return fail(res, e); }
});

// --- calendars --------------------------------------------------------------------------------
const calendarBody = {
  name: Joi.string().max(255), name_ar: Joi.string().max(255).allow('', null), name_en: Joi.string().max(255).allow('', null),
  timezone: Joi.string().max(64), weekly_off_days: Joi.array().items(Joi.number().integer().min(0).max(6)),
  holidays: Joi.array().items(Joi.object({ date: Joi.date().iso().required(), name: Joi.string().allow('', null) })),
  is_default: Joi.boolean(),
};

router.get('/:id/calendars', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await setup.listCalendars(query, req.params.id) }); } catch (e) { return fail(res, e); }
});

router.post('/:id/calendars', authenticate, authorize(), async (req, res) => {
  try {
    const value = validated(Joi.object({ ...calendarBody, name: calendarBody.name.required() }), req.body, res);
    if (!value) return;
    const data = await transaction((client) => setup.createCalendar(client.query.bind(client), req.params.id, value, req.user.id));
    await audit(req, `Created calendar "${data.name}"`, 'project_calendar', data.id);
    res.status(201).json({ success: true, data });
  } catch (e) { return fail(res, e); }
});

router.put('/:id/calendars/:calendarId', authenticate, authorize(), async (req, res) => {
  try {
    const value = validated(Joi.object(calendarBody).min(1), req.body, res);
    if (!value) return;
    const data = await transaction((client) => setup.updateCalendar(client.query.bind(client), req.params.id, req.params.calendarId, value));
    await audit(req, `Updated calendar "${data.name}"`, 'project_calendar', data.id);
    res.json({ success: true, data });
  } catch (e) { return fail(res, e); }
});

router.delete('/:id/calendars/:calendarId', authenticate, authorize(), async (req, res) => {
  try {
    const data = await transaction((client) => setup.deleteCalendar(client.query.bind(client), req.params.id, req.params.calendarId));
    await audit(req, `Deleted calendar "${data.name}"`, 'project_calendar', data.id);
    res.json({ success: true, data });
  } catch (e) { return fail(res, e); }
});

// --- WBS --------------------------------------------------------------------------------------
const wbsBody = {
  code: Joi.string().max(50), name: Joi.string().max(255), name_en: Joi.string().max(255).allow('', null),
  name_ar: Joi.string().max(255).allow('', null), sort_order: Joi.number().integer(),
};

router.get('/:id/wbs', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await setup.listWbs(query, req.params.id) }); } catch (e) { return fail(res, e); }
});

router.post('/:id/wbs', authenticate, authorize(), async (req, res) => {
  try {
    const value = validated(Joi.object({
      ...wbsBody, code: wbsBody.code.required(), name: wbsBody.name.required(), parent_id: Joi.number().integer().allow(null),
    }), req.body, res);
    if (!value) return;
    const data = await setup.createWbsNode(query, req.params.id, value);
    await audit(req, `Created WBS node ${data.code}`, 'wbs_node', data.id);
    res.status(201).json({ success: true, data });
  } catch (e) { return fail(res, e); }
});

router.put('/:id/wbs/:nodeId', authenticate, authorize(), async (req, res) => {
  try {
    const value = validated(Joi.object(wbsBody).min(1), req.body, res);
    if (!value) return;
    const data = await setup.updateWbsNode(query, req.params.id, req.params.nodeId, value);
    await audit(req, `Updated WBS node ${data.code}`, 'wbs_node', data.id);
    res.json({ success: true, data });
  } catch (e) { return fail(res, e); }
});

router.delete('/:id/wbs/:nodeId', authenticate, authorize(), async (req, res) => {
  try {
    const data = await setup.deleteWbsNode(query, req.params.id, req.params.nodeId);
    await audit(req, `Deleted WBS node ${data.code}`, 'wbs_node', data.id);
    res.json({ success: true, data });
  } catch (e) { return fail(res, e); }
});

// --- work packages ----------------------------------------------------------------------------
const packageBody = {
  code: Joi.string().max(50), name: Joi.string().max(255), description: Joi.string().allow('', null),
  status: Joi.string().valid('planned', 'in_progress', 'completed', 'on_hold', 'cancelled'),
  wbs_node_id: Joi.number().integer().allow(null), project_location_id: Joi.number().integer().allow(null),
  planned_start_date: Joi.date().iso().allow(null), planned_end_date: Joi.date().iso().allow(null),
  actual_start_date: Joi.date().iso().allow(null), actual_end_date: Joi.date().iso().allow(null),
  assigned_employee_id: Joi.number().integer().allow(null),
};

router.get('/:id/work-packages', authenticate, authorize(), async (req, res) => {
  try { res.json({ success: true, data: await setup.listWorkPackages(query, req.params.id) }); } catch (e) { return fail(res, e); }
});

router.post('/:id/work-packages', authenticate, authorize(), async (req, res) => {
  try {
    const value = validated(Joi.object({ ...packageBody, code: packageBody.code.required(), name: packageBody.name.required() }), req.body, res);
    if (!value) return;
    const data = await setup.createWorkPackage(query, req.params.id, value);
    await audit(req, `Created work package ${data.code}`, 'work_package', data.id);
    res.status(201).json({ success: true, data });
  } catch (e) { return fail(res, e); }
});

router.put('/:id/work-packages/:workPackageId', authenticate, authorize(), async (req, res) => {
  try {
    const value = validated(Joi.object(packageBody).min(1), req.body, res);
    if (!value) return;
    const data = await setup.updateWorkPackage(query, req.params.id, req.params.workPackageId, value);
    await audit(req, `Updated work package ${data.code}`, 'work_package', data.id);
    res.json({ success: true, data });
  } catch (e) { return fail(res, e); }
});

router.delete('/:id/work-packages/:workPackageId', authenticate, authorize(), async (req, res) => {
  try {
    const data = await setup.deleteWorkPackage(query, req.params.id, req.params.workPackageId);
    await audit(req, `Deleted work package ${data.code}`, 'work_package', data.id);
    res.json({ success: true, data });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
