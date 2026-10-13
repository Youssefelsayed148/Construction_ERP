const db = require('../../config/database');
const tokens = require('../../services/tokens');
const portalEngine = require('../../services/portalEngine');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('subcontractor portal submissions (real PostgreSQL)', () => {
  const tag = String(Date.now()).slice(-8);
  const created = { projects: [], organizations: [], users: [], participants: [], subcontractors: [], contracts: [], submissions: [], wirs: [] };
  let project; let otherProject; let organization; let otherOrganization; let user; let contract; let otherContract; let subcontractorId; let otherSubcontractorId;

  const makeProject = async (suffix) => (await db.query(
    "INSERT INTO projects (name, name_en, code, status) VALUES ($1,$1,$2,'active') RETURNING id",
    [`portal-submission-${tag}-${suffix}`, `PS${tag}${suffix}`]
  )).rows[0].id;

  beforeAll(async () => {
    project = await makeProject('own'); otherProject = await makeProject('other');
    created.projects.push(project, otherProject);
    organization = (await db.query(
      "INSERT INTO organizations (code,name_en,name_ar,org_type) VALUES ($1,$1,$1,'subcontractor') RETURNING id",
      [`ps-${tag}-own`]
    )).rows[0].id;
    otherOrganization = (await db.query(
      "INSERT INTO organizations (code,name_en,name_ar,org_type) VALUES ($1,$1,$1,'subcontractor') RETURNING id",
      [`ps-${tag}-other`]
    )).rows[0].id;
    created.organizations.push(organization, otherOrganization);
    subcontractorId = (await db.query('INSERT INTO subcontractors (name) VALUES ($1) RETURNING id', [`Portal sub ${tag}`])).rows[0].id;
    otherSubcontractorId = (await db.query('INSERT INTO subcontractors (name) VALUES ($1) RETURNING id', [`Other portal sub ${tag}`])).rows[0].id;
    created.subcontractors.push(subcontractorId, otherSubcontractorId);
    user = (await db.query(
      "INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,'x','subcontractor',true) RETURNING id,name,role,token_version",
      [`Submission ${tag}`, `submission-${tag}@test.invalid`]
    )).rows[0];
    created.users.push(user.id);
    await db.query('INSERT INTO organization_users (user_id,organization_id,is_active) VALUES ($1,$2,true)', [user.id, organization]);
    const participant = (await db.query(
      `INSERT INTO project_participants (project_id,organization_id,participant_type,portal_access_enabled,legacy_subcontractor_id)
       VALUES ($1,$2,'subcontractor',true,$3) RETURNING id`, [project, organization, subcontractorId]
    )).rows[0];
    created.participants.push(participant.id);
    const otherParticipant = (await db.query(
      `INSERT INTO project_participants (project_id,organization_id,participant_type,portal_access_enabled,legacy_subcontractor_id)
       VALUES ($1,$2,'subcontractor',true,$3) RETURNING id`, [otherProject, otherOrganization, otherSubcontractorId]
    )).rows[0];
    created.participants.push(otherParticipant.id);
    contract = (await db.query(
      "INSERT INTO sub_contracts (contract_number,project_id,subcontractor_id,scope,status) VALUES ($1,$2,$3,'Own work','active') RETURNING id",
      [`PS-${tag}-OWN`, project, subcontractorId]
    )).rows[0].id;
    otherContract = (await db.query(
      "INSERT INTO sub_contracts (contract_number,project_id,subcontractor_id,scope,status) VALUES ($1,$2,$3,'Other work','active') RETURNING id",
      [`PS-${tag}-OTHER`, otherProject, otherSubcontractorId]
    )).rows[0].id;
    created.contracts.push(contract, otherContract);
    await db.query(
      `INSERT INTO user_project_roles (user_id,project_id,role_id,organization_id)
       SELECT $1,$2,r.id,$3 FROM roles r WHERE r.key = 'subcontractor' ON CONFLICT DO NOTHING`,
      [user.id, project, organization]
    );
  });

  afterAll(async () => {
    if (user) await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [user.id]);
    if (created.submissions.length) await db.query('DELETE FROM portal_submissions WHERE id = ANY($1::int[])', [created.submissions]);
    if (created.contracts.length) await db.query('DELETE FROM sub_contracts WHERE id = ANY($1::int[])', [created.contracts]);
    if (created.wirs.length) await db.query('DELETE FROM wirs WHERE id = ANY($1::int[])', [created.wirs]);
    if (created.participants.length) await db.query('DELETE FROM project_participants WHERE id = ANY($1::int[])', [created.participants]);
    if (user) await db.query('DELETE FROM organization_users WHERE user_id = $1', [user.id]);
    if (created.users.length) await db.query('UPDATE users SET is_active = false WHERE id = ANY($1::int[])', [created.users]);
    if (created.projects.length) await db.query('DELETE FROM projects WHERE id = ANY($1::int[])', [created.projects]);
    if (created.subcontractors.length) await db.query('DELETE FROM subcontractors WHERE id = ANY($1::int[])', [created.subcontractors]);
    if (created.organizations.length) await db.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [created.organizations]);
    await db.pool.end();
  });

  test('submission history is restricted to the assigned organization/project pair and redacts legacy payload keys', async () => {
    const own = (await db.query(
      `INSERT INTO portal_submissions (organization_id,project_id,submission_type,payload,submitted_by)
       VALUES ($1,$2,'manpower',$3::jsonb,$4) RETURNING id`,
      [organization, project, JSON.stringify({ sub_contract_id: contract, report_date: '2026-10-13', worker_count: 9, unit_cost: 800, actual_cost: 900 }), user.id]
    )).rows[0];
    const cross = (await db.query(
      `INSERT INTO portal_submissions (organization_id,project_id,submission_type,payload,submitted_by)
       VALUES ($1,$2,'manpower',$3::jsonb,$4) RETURNING id`,
      [otherOrganization, otherProject, JSON.stringify({ sub_contract_id: otherContract, report_date: '2026-10-13', worker_count: 99 }), user.id]
    )).rows[0];
    created.submissions.push(own.id, cross.id);
    const result = await portalEngine.subcontractorSubmissions(db.query, user.id);
    expect(result.items.map((item) => item.id)).toEqual([own.id]);
    expect(result.items[0].payload).toEqual({ sub_contract_id: contract, report_date: '2026-10-13', worker_count: 9 });
    expect(JSON.stringify(result)).not.toMatch(/unit_cost|actual_cost|otherOrganization|otherContract/);
  });

  test('formal WIR reads are restricted to the caller organization and active package projects', async () => {
    const ownWir = (await db.query(
      `INSERT INTO wirs (wir_number,project_id,subcontractor_organization_id,status)
       VALUES ($1,$2,$3,'consultant_review') RETURNING id`, [`PS-WIR-${tag}-OWN`, project, organization]
    )).rows[0].id;
    const otherWir = (await db.query(
      `INSERT INTO wirs (wir_number,project_id,subcontractor_organization_id,status)
       VALUES ($1,$2,$3,'approved') RETURNING id`, [`PS-WIR-${tag}-OTHER`, otherProject, otherOrganization]
    )).rows[0].id;
    created.wirs.push(ownWir, otherWir);
    const dashboard = await portalEngine.subcontractorDashboard(db.query, user.id);
    expect(dashboard.wirs.items.map((item) => item.id)).toEqual([ownWir]);
    expect(JSON.stringify(dashboard.wirs)).not.toContain('PS-WIR-' + tag + '-OTHER');
  });

  test('HTTP intake validates category fields, rejects another package, and writes submission plus activity audit', async () => {
    const { app } = require('../../../server');
    const server = await new Promise((resolve) => { const started = app.listen(0, () => resolve(started)); });
    const token = tokens.signSession({ userId: user.id, tokenVersion: user.token_version || 0 });
    const send = (path, body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
    try {
      const invalid = await send('/api/portal/subcontractor/submissions/manpower', {
        project_id: project, payload: { sub_contract_id: contract, report_date: '2026-10-13', worker_count: 9, actual_cost: 500 },
      });
      const invalidPayload = await invalid.json();
      expect({ status: invalid.status, error: invalidPayload.error }).toMatchObject({ status: 400 });
      const foreign = await send('/api/portal/subcontractor/submissions/manpower', {
        project_id: project, payload: { sub_contract_id: otherContract, report_date: '2026-10-13', worker_count: 9 },
      });
      expect(foreign.status).toBe(404);
      const response = await send('/api/portal/subcontractor/submissions/manpower', {
        project_id: project, payload: { sub_contract_id: contract, report_date: '2026-10-13', worker_count: 9, worker_type: 'mason', note: 'Day shift' },
      });
      const body = await response.json();
      expect(response.status).toBe(201);
      created.submissions.push(body.data.id);
      expect(body.data.payload).toMatchObject({ sub_contract_id: contract, worker_count: 9, worker_type: 'mason' });
      expect(JSON.stringify(body)).not.toMatch(/actual_cost|unit_cost|committed_cost/);
      const listed = await fetch(`http://127.0.0.1:${server.address().port}/api/portal/subcontractor/submissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(listed.status).toBe(200);
      const listedBody = await listed.json();
      expect(listedBody.data.items.map((item) => item.id)).toContain(body.data.id);
      expect((await db.query("SELECT count(*)::int AS count FROM activity_log WHERE module='portal' AND entity_type='portal_submission' AND entity_id=$1 AND user_id=$2", [body.data.id, user.id])).rows[0].count).toBe(1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await db.query('DELETE FROM user_project_roles WHERE user_id = $1 AND project_id = $2', [user.id, project]);
    }
  });
});
