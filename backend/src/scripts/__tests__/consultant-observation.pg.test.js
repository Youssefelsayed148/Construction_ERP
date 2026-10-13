const db = require('../../config/database');
const engine = require('../../services/consultantEngine');
const { canAccessMedia } = require('../../services/mediaAccess');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('consultant observation completeness (real PostgreSQL)', () => {
  const tag = String(Date.now()).slice(-8);
  const created = { projects: [], organizations: [], users: [], files: [] };
  let project; let otherProject; let consultantOrg; let otherConsultantOrg; let consultant; let teammate; let otherOrgConsultant; let drawing;

  const makeProject = async (code) => (await db.query(
    "INSERT INTO projects (name, name_en, code, status) VALUES ($1,$1,$2,'active') RETURNING *",
    [`observation-${tag}-${code}`, `OB${tag}${code}`]
  )).rows[0];
  const makeOrg = async (suffix) => (await db.query(
    "INSERT INTO organizations (code, name_en, name_ar, org_type) VALUES ($1,$1,$1,'consultant') RETURNING *",
    [`obs-${tag}-${suffix}`]
  )).rows[0];
  const makeUser = async (suffix, organizationId) => {
    const user = (await db.query(
      "INSERT INTO users (name, email, password, role, is_active) VALUES ($1,$2,'x','consultant',true) RETURNING *",
      [`Obs ${suffix}`, `obs-${tag}-${suffix}@test.invalid`]
    )).rows[0];
    created.users.push(user.id);
    await db.query('INSERT INTO organization_users (user_id, organization_id, is_active) VALUES ($1,$2,true)', [user.id, organizationId]);
    return user;
  };

  beforeAll(async () => {
    project = await makeProject('A'); otherProject = await makeProject('B');
    created.projects.push(project.id, otherProject.id);
    consultantOrg = await makeOrg('main'); otherConsultantOrg = await makeOrg('other');
    created.organizations.push(consultantOrg.id, otherConsultantOrg.id);
    consultant = await makeUser('owner', consultantOrg.id);
    teammate = await makeUser('teammate', consultantOrg.id);
    otherOrgConsultant = await makeUser('other-org', otherConsultantOrg.id);
    await db.query("INSERT INTO project_participants (project_id, organization_id, participant_type, portal_access_enabled) VALUES ($1,$2,'consultant',true),($1,$3,'consultant',true)", [project.id, consultantOrg.id, otherConsultantOrg.id]);
    drawing = (await db.query(
      "INSERT INTO project_documents (project_id, title, document_type, status, portal_visibility, file_url) VALUES ($1,'Structural plan S-12','drawing','approved','consultant','/uploads/s12.pdf') RETURNING *",
      [project.id]
    )).rows[0];
    await db.query("INSERT INTO project_documents (project_id, title, document_type, status, portal_visibility) VALUES ($1,'Other project drawing','drawing','approved','consultant')", [otherProject.id]);
  });

  afterAll(async () => {
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1::int[])', [created.users]);
    await db.pool.end();
  });

  test('stores metadata and evidence, and scopes drawing and media access to the assigned consultant organization', async () => {
    const beforeName = `obs-${tag}-before.jpg`;
    const afterName = `obs-${tag}-after.jpg`;
    created.files.push(beforeName, afterName);
    await db.query('INSERT INTO uploaded_files (file_name, uploaded_by) VALUES ($1,$2),($3,$2)', [beforeName, consultant.id, afterName]);
    const observation = await db.transaction((client) => engine.createObservation(client.query.bind(client), {
      project_id: project.id, title: 'Column crack inspection', description: 'Review repair at grid C3',
      due_date: '2026-10-20', drawing_reference: 'S-12 / Rev 4', drawing_document_id: drawing.id,
      before_photos: [{ file_name: beforeName, file_url: `/uploads/${beforeName}`, caption: 'Before repair' }],
      after_photos: [{ file_name: afterName, file_url: `/uploads/${afterName}`, caption: 'After repair' }],
      user: { id: consultant.id, role: 'consultant', name: consultant.name },
    }));
    expect(observation).toMatchObject({ due_date: '2026-10-20', drawing_reference: 'S-12 / Rev 4', drawing_document_id: drawing.id });
    const photos = (await db.query('SELECT linked_entity_type, file_url, caption FROM photos WHERE linked_entity_id = $1 ORDER BY id', [observation.id])).rows;
    expect(photos).toEqual([
      { linked_entity_type: 'observation_before', file_url: `/uploads/${beforeName}`, caption: 'Before repair' },
      { linked_entity_type: 'observation_after', file_url: `/uploads/${afterName}`, caption: 'After repair' },
    ]);
    expect((await db.query('SELECT due_date::text AS due_date FROM observations WHERE id = $1', [observation.id])).rows[0].due_date).toBe('2026-10-20');
    await db.query("UPDATE observations SET status = 'submitted_for_verification' WHERE id = $1", [observation.id]);
    const inbox = await engine.myReviews(db.query, { id: teammate.id, role: 'consultant' }, { type: 'observation' });
    expect(inbox.find((row) => row.id === observation.id).due_date).toBe('2026-10-20');
    expect(await canAccessMedia(db.query, { id: teammate.id, role: 'consultant' }, beforeName)).toBe(true);
    expect(await canAccessMedia(db.query, { id: otherOrgConsultant.id, role: 'consultant' }, beforeName)).toBe(false);
    const nonImage = `obs-${tag}-evidence.pdf`;
    created.files.push(nonImage);
    await db.query('INSERT INTO uploaded_files (file_name, uploaded_by) VALUES ($1,$2)', [nonImage, consultant.id]);
    await expect(db.transaction((client) => engine.createObservation(client.query.bind(client), {
      project_id: project.id, title: 'Reject non-image evidence', user: { id: consultant.id, role: 'consultant', name: consultant.name },
      before_photos: [{ file_name: nonImage, file_url: `/uploads/${nonImage}` }],
    }))).rejects.toThrow(/uploaded image file/);
    await expect(engine.createObservation(db.query, {
      project_id: project.id, title: 'Cross-project drawing', drawing_document_id: (await db.query('SELECT id FROM project_documents WHERE project_id = $1 ORDER BY id DESC LIMIT 1', [otherProject.id])).rows[0].id,
      user: { id: consultant.id, role: 'consultant', name: consultant.name },
    })).rejects.toThrow(/same project/);
  });

  test('My Reviews reads consultant-stage WIRs from the formal register and calculates configured SLA', async () => {
    const template = (await db.query("SELECT id FROM workflow_templates WHERE key = 'wir'")).rows[0];
    const step = (await db.query("SELECT id, sla_hours FROM workflow_steps WHERE template_id = $1 AND step_key = 'consultant'", [template.id])).rows[0];
    const instance = (await db.query(
      `INSERT INTO workflow_instances (template_id, template_key, entity_type, entity_id, project_id, context, current_step_key, status, requester_id)
       VALUES ($1,'wir','wir',$2,$3,'{}','consultant','active',$4) RETURNING id`,
      [template.id, tag, project.id, consultant.id]
    )).rows[0];
    const openedAt = '2026-10-12T08:00:00.000Z';
    const wir = (await db.query(
      `INSERT INTO wirs (wir_number, project_id, status, workflow_instance_id, latest_drawing_ref, inspection_date)
       VALUES ($1,$2,'consultant_review',$3,'S-12 / Rev 4','2026-10-12') RETURNING id`,
      [`WIR-${tag}`, project.id, instance.id]
    )).rows[0];
    await db.query(
      `INSERT INTO workflow_step_instances (instance_id, step_id, step_key, name, status, opened_at)
       VALUES ($1,$2,'consultant','Consultant','pending',$3)`,
      [instance.id, step.id, openedAt]
    );
    await db.query('UPDATE workflow_steps SET sla_hours = 24 WHERE id = $1', [step.id]);

    try {
      const inbox = await engine.myReviews(db.query, { id: teammate.id, role: 'consultant' }, { type: 'wir' });
      expect(inbox).toContainEqual(expect.objectContaining({
        type: 'wir', id: wir.id, project_id: project.id, number: `WIR-${tag}`,
        status: 'consultant_review', due_date: new Date('2026-10-13T08:00:00.000Z'),
        drawing_reference: 'S-12 / Rev 4', inspection_date: '2026-10-12',
      }));
      const outOfScope = await engine.myReviews(db.query, { id: teammate.id, role: 'consultant' }, { project_id: otherProject.id, type: 'wir' });
      expect(outOfScope).toEqual([]);
    } finally {
      await db.query('DELETE FROM workflow_instances WHERE id = $1', [instance.id]);
      await db.query('DELETE FROM wirs WHERE id = $1', [wir.id]);
      await db.query('UPDATE workflow_steps SET sla_hours = $1 WHERE id = $2', [step.sla_hours, step.id]);
    }
  });
});
