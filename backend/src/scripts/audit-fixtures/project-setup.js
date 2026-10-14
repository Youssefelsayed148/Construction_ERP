'use strict';

const { group } = require('./util');
const keys = (method, suffix) => ['/api/projects', '/api/v1/projects'].map(prefix => `${method} ${prefix}/:id/${suffix}`);
const calendar = async ctx => {
  if (!(await ctx.one('SELECT id FROM project_calendars WHERE project_id = $1 AND is_default', [ctx.pid]))) {
    await ctx.api('POST', `/api/projects/${ctx.pid}/calendars`, { name: `base-${ctx.n()}` });
  }
  return ctx.api('POST', `/api/projects/${ctx.pid}/calendars`, { name: `calendar-${ctx.n()}`, is_default: false });
};
const node = ctx => ctx.api('POST', `/api/projects/${ctx.pid}/wbs`, { code: `W${ctx.n()}`, name: 'r02 work breakdown' });
const workPackage = ctx => ctx.api('POST', `/api/projects/${ctx.pid}/work-packages`, { code: `WP${ctx.n()}`, name: 'r02 work package' });

module.exports = {
  ...group(keys('PUT', 'settings'), async ctx => ({ params: { id: ctx.pid }, body: { settings: { [`r02.${ctx.n().replace(/\W/g, '_')}`]: { working_days: 6 } } } })),
  ...group(keys('POST', 'calendars'), async ctx => ({ params: { id: ctx.pid }, body: { name: `calendar-${ctx.n()}`, name_en: 'r02 calendar', name_ar: 'تقويم الاختبار', weekly_off_days: [5], is_default: true }, status: 201 })),
  ...group(keys('PUT', 'calendars/:calendarId'), async ctx => ({ params: { id: ctx.pid, calendarId: (await calendar(ctx)).id }, body: { name: `revised-${ctx.n()}`, is_default: true, holidays: [{ date: '2032-01-01', name: 'r02 holiday' }] } })),
  ...group(keys('DELETE', 'calendars/:calendarId'), async ctx => ({ params: { id: ctx.pid, calendarId: (await calendar(ctx)).id } })),
  ...group(keys('POST', 'wbs'), async ctx => ({ params: { id: ctx.pid }, body: { code: `W${ctx.n()}`, name: 'r02 child', name_en: 'r02 child', name_ar: 'بند الاختبار', parent_id: (await node(ctx)).id }, status: 201 })),
  ...group(keys('PUT', 'wbs/:nodeId'), async ctx => ({ params: { id: ctx.pid, nodeId: (await node(ctx)).id }, body: { name: 'r02 revised', sort_order: 2 } })),
  ...group(keys('DELETE', 'wbs/:nodeId'), async ctx => ({ params: { id: ctx.pid, nodeId: (await node(ctx)).id } })),
  ...group(keys('POST', 'work-packages'), async ctx => ({ params: { id: ctx.pid }, body: { code: `WP${ctx.n()}`, name: 'r02 linked package', wbs_node_id: (await node(ctx)).id }, status: 201 })),
  ...group(keys('PUT', 'work-packages/:workPackageId'), async ctx => ({ params: { id: ctx.pid, workPackageId: (await workPackage(ctx)).id }, body: { name: 'r02 revised', status: 'in_progress' } })),
  ...group(keys('DELETE', 'work-packages/:workPackageId'), async ctx => ({ params: { id: ctx.pid, workPackageId: (await workPackage(ctx)).id } })),
};
