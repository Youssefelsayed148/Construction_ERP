// Real PostgreSQL: controlled-document numbers (PREFIX-DISCIPLINE-TYPE-SEQ-REV) are unique under concurrency.
// Reproduced first: doccontrolEngine read document_number_sequences.seq, added 1 in JS and wrote it back,
// so concurrent registrations in one (project, discipline, type) got the same number.
const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('document control numbering (real PostgreSQL)', () => {
  let db; let engine; let projectId;
  const tag = String(Date.now()).slice(-7);

  const newDoc = async (discipline = 'architectural', docType = 'drawing', pid = projectId) => (await db.query(
    `INSERT INTO project_documents (project_id, title, discipline, doc_type) VALUES ($1, 'doc', $2, $3) RETURNING id`,
    [pid, discipline, docType]
  )).rows[0].id;
  const extraProjects = [];
  const q = (text, params) => db.query(text, params);

  beforeAll(async () => {
    db = require('../../config/database');
    engine = require('../../services/doccontrolEngine');
    projectId = (await db.query(
      "INSERT INTO projects (name, code) VALUES ('doc numbering test', $1) RETURNING id", [`DN${tag}`]
    )).rows[0].id;
    // The sequence race is tested with the settings row already present, so it is not masked by the settings race.
    await db.query("INSERT INTO project_numbering_settings (project_id, doc_prefix) VALUES ($1, $2)", [projectId, `DN${tag}`]);
  });
  afterAll(async () => {
    await db.query('DELETE FROM document_counters WHERE scope_key LIKE $1', [`%project=${projectId}|%`]);
    await db.query('DELETE FROM project_documents WHERE project_id = $1', [projectId]);
    await db.query('DELETE FROM document_number_sequences WHERE project_id = $1', [projectId]);
    await db.query('DELETE FROM project_numbering_settings WHERE project_id = $1', [projectId]);
    for (const id of extraProjects) {
      await db.query('DELETE FROM document_counters WHERE scope_key LIKE $1', [`%project=${id}|%`]);
      await db.query('DELETE FROM project_documents WHERE project_id = $1', [id]);
      await db.query('DELETE FROM project_numbering_settings WHERE project_id = $1', [id]);
      await db.query('DELETE FROM projects WHERE id = $1', [id]);
    }
    await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    await db.pool.end();
  });

  test('50 concurrent registrations get 50 distinct numbers in the standard format', async () => {
    const ids = [];
    for (let i = 0; i < 50; i += 1) ids.push(await newDoc());
    const results = await Promise.allSettled(ids.map((id) => engine.registerDocument(q, { documentId: id })));
    const failed = results.filter((r) => r.status === 'rejected');
    expect(failed.map((f) => String(f.reason && f.reason.message))).toEqual([]);
    const numbers = results.map((r) => r.value.doc_number);
    expect(new Set(numbers).size).toBe(50);
    for (const n of numbers) expect(n).toMatch(new RegExp(`^DN${tag}-ARC-DWG-\\d{4}-R0$`));
    expect([...numbers].sort()[0]).toBe(`DN${tag}-ARC-DWG-0001-R0`);
    expect([...numbers].sort()[49]).toBe(`DN${tag}-ARC-DWG-0050-R0`);
  });

  test('the first registrations in a brand-new project (default settings created on demand) do not collide', async () => {
    const pid = (await db.query("INSERT INTO projects (name, code) VALUES ('doc numbering fresh', $1) RETURNING id", [`DF${tag}`])).rows[0].id;
    extraProjects.push(pid);
    const ids = [];
    for (let i = 0; i < 20; i += 1) ids.push(await newDoc('architectural', 'drawing', pid));
    const results = await Promise.allSettled(ids.map((id) => engine.registerDocument(q, { documentId: id })));
    expect(results.filter((r) => r.status === 'rejected').map((f) => String(f.reason && f.reason.message))).toEqual([]);
    expect(new Set(results.map((r) => r.value.doc_number)).size).toBe(20);
  });

  test('each discipline and type has its own sequence', async () => {
    const a = await engine.registerDocument(q, { documentId: await newDoc('structural', 'specification') });
    const b = await engine.registerDocument(q, { documentId: await newDoc('structural', 'specification') });
    const c = await engine.registerDocument(q, { documentId: await newDoc('civil', 'report') });
    expect(a.doc_number).toBe(`DN${tag}-STR-SPE-0001-R0`);
    expect(b.doc_number).toBe(`DN${tag}-STR-SPE-0002-R0`);
    expect(c.doc_number).toBe(`DN${tag}-CIV-REP-0001-R0`);
  });

  test('a scope that already has numbers continues after the highest one, ignoring the revision suffix', async () => {
    await db.query(
      `INSERT INTO project_documents (project_id, title, discipline, doc_type, doc_number) VALUES ($1, 'old', 'electrical', 'drawing', $2)`,
      [projectId, `DN${tag}-ELE-DWG-0007-R3`]
    );
    const doc = await engine.registerDocument(q, { documentId: await newDoc('electrical', 'drawing') });
    expect(doc.doc_number).toBe(`DN${tag}-ELE-DWG-0008-R0`);
  });

  test('a scope already counted in the retired document_number_sequences table keeps counting', async () => {
    // Old code stored seq = (last issued - 1); the migration copies it into document_counters.
    await db.query(
      `INSERT INTO document_number_sequences (project_id, discipline, doc_type, seq) VALUES ($1, 'fire', 'report', 11)`, [projectId]
    );
    const sql = require('fs').readFileSync(require('path').join(__dirname, '../../migrations/0005_retire_legacy_counters.sql'), 'utf8');
    await db.query(sql);
    const doc = await engine.registerDocument(q, { documentId: await newDoc('fire', 'report') });
    expect(doc.doc_number).toBe(`DN${tag}-FIR-REP-0013-R0`);
  });
});
