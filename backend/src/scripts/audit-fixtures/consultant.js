'use strict';

const { group } = require('./util');
let worldPromise;
const world = ctx => worldPromise ||= (async () => {
  const org = await ctx.org('consultant');
  await ctx.participant(org.id, 'consultant');
  const actor = await ctx.actor('consultant', org.id);
  const clientOrg = await ctx.org('client');
  const client = await ctx.actor('client', clientOrg.id);
  const participant = await ctx.participant(clientOrg.id, 'client');
  await ctx.db.query('INSERT INTO project_participant_users (project_participant_id, user_id) VALUES ($1,$2)', [participant.id, client.userId]);
  return { actor, client };
})();

// Seed the formal template and all step instances at the stage under test.
// Immutable identity is shared; each mutation owns a fresh target/workflow.
async function workflow(ctx, key, table, row, stage) {
  const template = await ctx.one('SELECT id FROM workflow_templates WHERE key = $1', [key]);
  const instance = await ctx.one(`INSERT INTO workflow_instances
    (template_id, template_key, entity_type, entity_id, project_id, context, current_step_key, status, requester_id)
    VALUES ($1,$2,$2,$3,$4,$5::jsonb,$6,'active',$7) RETURNING id`,
  [template.id, key, row.id, ctx.pid, JSON.stringify({ project_id: ctx.pid, requester_id: ctx.owner.id, module_name: key }), stage, ctx.owner.id]);
  const { rows } = await ctx.db.query('SELECT * FROM workflow_steps WHERE template_id = $1 ORDER BY sort_order', [template.id]);
  const current = rows.findIndex(step => step.step_key === stage);
  if (current < 0) throw new Error(`Missing workflow stage ${key}/${stage}`);
  for (const [i, step] of rows.entries()) await ctx.db.query(`INSERT INTO workflow_step_instances
    (instance_id, step_id, step_key, name, mode, status, assigned_role, opened_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
  [instance.id, step.id, step.step_key, step.name, step.mode, i < current ? 'done' : i === current ? 'pending' : 'waiting', step.resolver_value, i === current ? new Date() : null]);
  // table is a fixture-owned literal, never request input.
  await ctx.db.query(`UPDATE ${table} SET workflow_instance_id = $1 WHERE id = $2`, [instance.id, row.id]);
  return row.id;
}
const variation = async (ctx, stage) => workflow(ctx, 'variation', 'variations', await ctx.one(`INSERT INTO variations
  (variation_number, project_id, title, amount, variation_type, status) VALUES ($1,$2,'r02 review',100,'client',$3) RETURNING id`,
[`R02-${ctx.n()}`, ctx.pid, stage]), stage);
const observation = ctx => ctx.api('POST', '/api/consultant/observations', { project_id: ctx.pid, title: `r02 observation ${ctx.n()}` });

module.exports = {
  ...group(['POST /api/consultant/observations', 'POST /api/v1/observations'], async ctx => ({ body: { project_id: ctx.pid, title: `r02 observation ${ctx.n()}` }, status: 201 })),
  ...group(['POST /api/consultant/observations/:id/advance', 'POST /api/v1/observations/:id/advance'], async ctx => ({ params: { id: (await observation(ctx)).id }, body: { action: 'acknowledge' } })),
  ...group(['POST /api/v1/observations/:id/comments'], async ctx => ({ params: { id: (await observation(ctx)).id }, body: { body: 'r02 comment' }, status: 201 })),
  ...group(['POST /api/consultant/rfis/:id/close'], async ctx => {
    const row = await ctx.api('POST', '/api/docs/rfis', { project_id: ctx.pid, subject: `r02 question ${ctx.n()}` });
    await ctx.db.query("UPDATE project_rfis SET status = 'acknowledged' WHERE id = $1", [row.id]);
    return { params: { id: row.id } };
  }),
  ...group(['POST /api/consultant/instructions/:id/recommendation'], async ctx => ({ params: { id: (await ctx.one("INSERT INTO engineer_instructions (instruction_number, project_id, title, status, issued_by) VALUES ($1,$2,'r02 review','issued',$3) RETURNING id", [`R02-${ctx.n()}`, ctx.pid, ctx.owner.id])).id }, body: { decision: 'approve' }, actor: (await world(ctx)).actor })),
  ...group(['POST /api/consultant/variations/:id/recommendation'], async ctx => ({ params: { id: await variation(ctx, 'consultant_recommendation') }, body: { decision: 'approve' }, actor: (await world(ctx)).actor })),
  ...group(['POST /api/consultant/payment-certificates/:id/recommendation'], async ctx => ({ params: { id: await workflow(ctx, 'payment_certificate', 'payment_certificates', await ctx.one("INSERT INTO payment_certificates (certificate_number, party_type, project_id, status, net_certificate) VALUES ($1,'subcontractor',$2,'consultant_client',100) RETURNING id", [`R02-${ctx.n()}`, ctx.pid]), 'consultant_client') }, body: { decision: 'approve' }, actor: (await world(ctx)).actor })),
  ...group(['POST /api/consultant/wirs/:id/result'], async ctx => ({ params: { id: await workflow(ctx, 'wir', 'wirs', await ctx.one("INSERT INTO wirs (wir_number, project_id, status) VALUES ($1,$2,'consultant_review') RETURNING id", [`R02-${ctx.n()}`, ctx.pid]), 'consultant') }, body: { result: 'approved' }, actor: (await world(ctx)).actor })),
  ...group(['POST /api/client-portal/variations/:id/response'], async ctx => ({ params: { id: await variation(ctx, 'client_approval_reject') }, body: { decision: 'approve' }, actor: (await world(ctx)).client })),
};
