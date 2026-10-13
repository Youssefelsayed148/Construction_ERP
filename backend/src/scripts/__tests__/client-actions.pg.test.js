const db = require('../../config/database');
const engine = require('../../services/clientEngine');
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('client portal actions and assignment scope (real PostgreSQL)', () => {
  const tag = String(Date.now()).slice(-8);
  const created = { projects: [], organizations: [], users: [], participants: [], workflows: [], variations: [], documents: [] };
  let clientOrg; let otherOrg; let client; let projectA; let projectB; let expiredProject; let otherProject;

  const makeProject = async (suffix) => (await db.query(
    "INSERT INTO projects (name, name_en, code, status) VALUES ($1,$1,$2,'active') RETURNING id",
    [`client-action-${tag}-${suffix}`, `CA${tag}${suffix}`]
  )).rows[0].id;
  const makeOrg = async (suffix) => (await db.query(
    "INSERT INTO organizations (code, name_en, name_ar, org_type) VALUES ($1,$1,$1,'client') RETURNING id",
    [`ca-${tag}-${suffix}`]
  )).rows[0].id;
  const makeClient = async (organizationId) => {
    const row = (await db.query(
      "INSERT INTO users (name, email, password, role, is_active) VALUES ($1,$2,'x','client',true) RETURNING id,name,role",
      [`Client ${tag}`, `client-${tag}@test.invalid`]
    )).rows[0];
    created.users.push(row.id);
    await db.query('INSERT INTO organization_users (user_id, organization_id, is_active) VALUES ($1,$2,true)', [row.id, organizationId]);
    return row;
  };
  const makeParticipant = async (projectId, organizationId, activeTo = null) => {
    const row = (await db.query(
      `INSERT INTO project_participants (project_id, organization_id, participant_type, portal_access_enabled, active_to)
       VALUES ($1,$2,'client',true,$3) RETURNING id`,
      [projectId, organizationId, activeTo]
    )).rows[0];
    created.participants.push(row.id);
    return row.id;
  };

  beforeAll(async () => {
    projectA = await makeProject('A'); projectB = await makeProject('B');
    expiredProject = await makeProject('expired'); otherProject = await makeProject('other');
    created.projects.push(projectA, projectB, expiredProject, otherProject);
    clientOrg = await makeOrg('main'); otherOrg = await makeOrg('other');
    created.organizations.push(clientOrg, otherOrg);
    client = await makeClient(clientOrg);
    await makeParticipant(projectA, clientOrg);
    const participantB = await makeParticipant(projectB, clientOrg);
    await db.query('INSERT INTO project_participant_users (project_participant_id, user_id) VALUES ($1,$2)', [participantB, client.id]);
    await makeParticipant(expiredProject, clientOrg, new Date(Date.now() - 86400000));
    await makeParticipant(otherProject, otherOrg);
  });

  afterAll(async () => {
    if (created.variations.length) await db.query('DELETE FROM variations WHERE id = ANY($1::int[])', [created.variations]);
    if (created.workflows.length) await db.query('DELETE FROM workflow_instances WHERE id = ANY($1::int[])', [created.workflows]);
    if (created.documents.length) await db.query('DELETE FROM project_documents WHERE id = ANY($1::int[])', [created.documents]);
    if (created.participants.length) await db.query('DELETE FROM project_participant_users WHERE project_participant_id = ANY($1::int[])', [created.participants]);
    if (created.participants.length) await db.query('DELETE FROM project_participants WHERE id = ANY($1::int[])', [created.participants]);
    if (client) await db.query('DELETE FROM organization_users WHERE user_id = $1', [client.id]);
    if (created.users.length) await db.query('UPDATE users SET is_active = false WHERE id = ANY($1::int[])', [created.users]);
    if (created.projects.length) await db.query('DELETE FROM projects WHERE id = ANY($1::int[])', [created.projects]);
    if (created.organizations.length) await db.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [created.organizations]);
    await db.pool.end();
  });

  test('project lists include active multi-project assignments and exclude expired and other-organization assignments', async () => {
    await expect(engine.resolveClientProjects(db.query, client.id)).resolves.toEqual([projectA, projectB].sort((a, b) => a - b));
    await expect(engine.assignedClientOrganizations(db.query, client.id, expiredProject)).resolves.toEqual([]);
    await expect(engine.assignedClientOrganizations(db.query, client.id, otherProject)).resolves.toEqual([]);
  });

  test('client variation response advances the formal workflow and rejects expired or cross-project records', async () => {
    const template = (await db.query("SELECT id FROM workflow_templates WHERE key = 'variation'")).rows[0];
    const step = (await db.query("SELECT id FROM workflow_steps WHERE template_id = $1 AND step_key = 'client_approval_reject'", [template.id])).rows[0];
    const makeVariation = async (projectId, suffix) => {
      const workflow = (await db.query(
        `INSERT INTO workflow_instances (template_id, template_key, entity_type, entity_id, project_id, context, current_step_key, status)
         VALUES ($1,'variation','variation',0,$2,'{"module_name":"variations"}','client_approval_reject','active') RETURNING id`,
        [template.id, projectId]
      )).rows[0];
      created.workflows.push(workflow.id);
      const variation = (await db.query(
        `INSERT INTO variations (variation_number, project_id, title, variation_type, amount, status, workflow_instance_id)
         VALUES ($1,$2,$3,'client',12000,'client_approval_reject',$4) RETURNING id`,
        [`CA-${tag}-${suffix}`, projectId, `Variation ${suffix}`, workflow.id]
      )).rows[0];
      created.variations.push(variation.id);
      await db.query('UPDATE workflow_instances SET entity_id = $2 WHERE id = $1', [workflow.id, variation.id]);
      await db.query(
        `INSERT INTO workflow_step_instances (instance_id, step_id, step_key, name, status, assigned_role, opened_at)
         VALUES ($1,$2,'client_approval_reject','Client response','pending','client',NOW())`,
        [workflow.id, step.id]
      );
      return variation.id;
    };
    const activeVariation = await makeVariation(projectA, 'active');
    const expiredVariation = await makeVariation(expiredProject, 'expired');
    const crossProjectVariation = await makeVariation(otherProject, 'cross');

    const result = await db.transaction((clientDb) => engine.decideClientVariation(clientDb.query.bind(clientDb), activeVariation, client, 'reject', 'Not accepted'));
    expect(result).toMatchObject({ ok: true, statusCode: 200 });
    expect((await db.query('SELECT status FROM variations WHERE id = $1', [activeVariation])).rows[0].status).toBe('rejected');
    expect((await db.query('SELECT decision, user_id, comment FROM workflow_actions WHERE instance_id = $1', [created.workflows[0]])).rows[0]).toMatchObject({ decision: 'reject', user_id: client.id, comment: 'Not accepted' });
    await expect(engine.decideClientVariation(db.query, expiredVariation, client, 'approve')).rejects.toMatchObject({ status: 404 });
    await expect(engine.decideClientVariation(db.query, crossProjectVariation, client, 'approve')).rejects.toMatchObject({ status: 404 });
  });

  test('document acknowledgement records actor/time, updates formal status, and cannot be repeated or crossed by project', async () => {
    const document = (await db.query(
      `INSERT INTO project_documents (project_id, title, status, portal_visibility, recipient_organization_id)
       VALUES ($1,'Client handover guide','awaiting_acknowledgement','client',$2) RETURNING id`,
      [projectA, clientOrg]
    )).rows[0];
    const otherDocument = (await db.query(
      `INSERT INTO project_documents (project_id, title, status, portal_visibility, recipient_organization_id)
       VALUES ($1,'Other client guide','awaiting_acknowledgement','client',$2) RETURNING id`,
      [otherProject, otherOrg]
    )).rows[0];
    created.documents.push(document.id, otherDocument.id);

    const ack = await db.transaction((clientDb) => engine.acknowledgeClientDocument(clientDb.query.bind(clientDb), document.id, client, 'Received'));
    expect(ack).toMatchObject({ client_user_id: client.id, client_organization_id: clientOrg, comment: 'Received' });
    expect(ack.acknowledged_at).toBeTruthy();
    expect(ack.document.status).toBe('acknowledged');
    await expect(engine.acknowledgeClientDocument(db.query, document.id, client)).rejects.toMatchObject({ status: 409, error_code: 'already_acknowledged' });
    await expect(engine.acknowledgeClientDocument(db.query, otherDocument.id, client)).rejects.toMatchObject({ status: 404 });
    const actionCenter = await engine.clientActionCenter(db.query, client, { project_id: projectA });
    expect(actionCenter.document_acknowledgements.items.map((item) => item.id)).not.toContain(document.id);
  });

  test('HTTP acknowledgement enforces client policy and writes the activity audit in the same transaction', async () => {
    const document = (await db.query(
      `INSERT INTO project_documents (project_id, title, status, portal_visibility, recipient_organization_id)
       VALUES ($1,'Route-tested client document','awaiting_acknowledgement','client',$2) RETURNING id`,
      [projectA, clientOrg]
    )).rows[0];
    created.documents.push(document.id);
    await db.query(
      `INSERT INTO user_project_roles (user_id, project_id, role_id, organization_id)
       SELECT $1,$2,r.id,$3 FROM roles r WHERE r.key = 'client' ON CONFLICT DO NOTHING`,
      [client.id, projectA, clientOrg]
    );
    const { app } = require('../../../server');
    const server = await new Promise((resolve) => { const started = app.listen(0, () => resolve(started)); });
    try {
      const user = (await db.query('SELECT token_version FROM users WHERE id = $1', [client.id])).rows[0];
      const token = tokens.signSession({ userId: client.id, tokenVersion: user.token_version || 0 });
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/client-portal/documents/${document.id}/acknowledgement`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ comment: 'HTTP receipt confirmed' }),
      });
      const payload = await response.json();
      expect(response.status).toBe(200);
      expect(payload.data.client_user_id).toBe(client.id);
      expect((await db.query('SELECT status FROM project_documents WHERE id = $1', [document.id])).rows[0].status).toBe('acknowledged');
      expect((await db.query("SELECT count(*)::int AS count FROM activity_log WHERE module = 'client-portal' AND entity_type = 'project_document' AND entity_id = $1 AND user_id = $2", [document.id, client.id])).rows[0].count).toBe(1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await db.query('DELETE FROM user_project_roles WHERE user_id = $1 AND project_id = $2', [client.id, projectA]);
    }
  });
});
