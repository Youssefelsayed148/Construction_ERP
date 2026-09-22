// Phase 21 tests — document control: auto-numbering format, the revision
// rules (exactly one current revision, superseded history), transmittals,
// revision-safe correspondence, and the zero-record contract.

const { MockDb } = require('../test-helpers/mock-db');
const doccontrolMigration = require('../doccontrol-migration');
const engine = require('../../services/doccontrolEngine');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const OWNER = { id: 1, name: 'Owner', role: 'owner' };

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, code VARCHAR(50), name VARCHAR(255), name_en VARCHAR(255), status VARCHAR(50))`);
  await q(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS project_documents (
    id SERIAL PRIMARY KEY, project_id INTEGER, category_id INTEGER, title VARCHAR(255), description TEXT,
    document_type VARCHAR(50), file_url VARCHAR(1000), file_type VARCHAR(50), file_size_bytes INTEGER,
    version INTEGER DEFAULT 1, status VARCHAR(30) DEFAULT 'draft', tags JSONB, uploaded_by INTEGER,
    approved_by INTEGER, approved_at TIMESTAMPTZ, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    portal_visibility VARCHAR(30) DEFAULT 'internal',
    discipline VARCHAR(100), doc_type VARCHAR(100), doc_status VARCHAR(30), project_location_id INTEGER,
    package VARCHAR(150), originator_organization_id INTEGER, recipient_organization_id INTEGER,
    doc_number VARCHAR(120), revision_code VARCHAR(20), is_current BOOLEAN DEFAULT true,
    superseded_by_doc_id INTEGER, review_due_date DATE, registered_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS document_versions (
    id SERIAL PRIMARY KEY, document_id INTEGER, version_no INTEGER, file_url VARCHAR(1000),
    file_type VARCHAR(50), file_size_bytes INTEGER, change_description TEXT, uploaded_by INTEGER,
    created_at TIMESTAMPTZ, revision_code VARCHAR(20), is_current BOOLEAN DEFAULT true,
    superseded_at TIMESTAMPTZ, superseded_by_version_id INTEGER, status VARCHAR(30) DEFAULT 'current')`);
  await q(`CREATE TABLE IF NOT EXISTS event_log (
    id SERIAL PRIMARY KEY, event_type VARCHAR(100), entity_type VARCHAR(100), entity_id INTEGER,
    user_id INTEGER, user_name VARCHAR(255), user_role VARCHAR(100), payload JSONB,
    dispatched_at TIMESTAMPTZ, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY, user_id INTEGER, channel VARCHAR(30), event_type VARCHAR(255),
    entity_type VARCHAR(100), entity_id INTEGER, title VARCHAR(500), body TEXT, status VARCHAR(30),
    created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY, user_id INTEGER, event_type VARCHAR(255), channel VARCHAR(30), enabled BOOLEAN)`);

  await doccontrolMigration.ensureTables(q);
  await doccontrolMigration.ensureTables(q); // idempotent

  await q(`INSERT INTO projects (id, code, name_en, status) VALUES ($1,$2,$3,$4)`, [1, 'TWR', 'Tower A', 'active']);
}

beforeAll(buildFixture);

async function insertDoc({ doc_type = 'drawing', discipline = 'structural' } = {}) {
  const r = await q(
    `INSERT INTO project_documents (project_id, title, document_type, file_url, discipline, doc_type, is_current)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [1, `Doc ${doc_type}`, doc_type, '/uploads/f.pdf', discipline, doc_type, true]
  );
  const rows = (await q(`SELECT * FROM project_documents WHERE project_id = $1`, [1])).rows;
  return rows[rows.length - 1];
}

// ---------------------------------------------------------------------------
// Migration contract
// ---------------------------------------------------------------------------

describe('phase 21 migration', () => {
  test('is idempotent — running it twice changes nothing', async () => {
    const before = (await q('SELECT COUNT(*) AS c FROM project_documents')).rows[0].c;
    await doccontrolMigration.ensureTables(q);
    const after = (await q('SELECT COUNT(*) AS c FROM project_documents')).rows[0].c;
    expect(before).toBe(after);
  });
});

// ---------------------------------------------------------------------------
// Auto-numbering — PROJECT-DISCIPLINE-TYPE-SEQ-REV
// ---------------------------------------------------------------------------

describe('auto-numbering', () => {
  test('produces the PROJECT-DISCIPLINE-TYPE-SEQ-REV format', async () => {
    const number = await engine.nextDocNumber(q, { project_id: 1, discipline: 'architectural', doc_type: 'drawing', rev_code: 'R0' });
    expect(number).toBe('TWR-ARC-DWG-0001-R0');
  });

  test('sequences increment per project+discipline+type and rev codes bump', async () => {
    expect(await engine.nextDocNumber(q, { project_id: 1, discipline: 'architectural', doc_type: 'drawing', rev_code: 'R0' })).toBe('TWR-ARC-DWG-0002-R0');
    expect(await engine.nextDocNumber(q, { project_id: 1, discipline: 'structural', doc_type: 'specification', rev_code: 'R1' })).toBe('TWR-STR-SPE-0001-R1');
  });

  test('numbering is configurable per project (prefix / parts)', async () => {
    await q(`UPDATE project_numbering_settings SET doc_prefix = $1, include_type = $2, seq_pad = $3, rev_prefix = $4 WHERE project_id = $5`,
      ['PROJ1', false, 3, 'REV', 1]);
    const n = await engine.nextDocNumber(q, { project_id: 1, discipline: 'architectural', doc_type: 'drawing', rev_code: 'R2' });
    expect(n).toMatch(/^PROJ1-ARC-\d{3}-REV2$/);
    await q(`UPDATE project_numbering_settings SET doc_prefix = $1, include_type = $2, seq_pad = $3, rev_prefix = $4 WHERE project_id = $5`,
      ['TWR', true, 4, 'R', 1]);
  });
});

// ---------------------------------------------------------------------------
// Revision rules
// ---------------------------------------------------------------------------

describe('revision rules', () => {
  test('registering assigns the doc number with R0', async () => {
    const doc = await insertDoc();
    const registered = await engine.registerDocument(q, { documentId: doc.id });
    expect(registered.doc_number).toMatch(/^TWR-STR-DWG-\d{4}-R0$/);
    expect(registered.revision_code).toBe('R0');
    expect(registered.is_current).toBe(true);
  });

  test('duplicate doc numbers are refused', async () => {
    const doc = await insertDoc();
    await q(`UPDATE project_documents SET doc_number = $2 WHERE id = $1`, [doc.id, 'TWR-STR-DWG-0001-R0']);
    await expect(engine.registerDocument(q, { documentId: doc.id })).rejects.toThrow(/already used/);
  });

  test('uploading a new revision supersedes the previous current revision', async () => {
    const doc = await insertDoc();
    await q(`INSERT INTO document_versions (document_id, version_no, file_url, is_current, status) VALUES ($1,1,'/a.pdf',$2,'current')`, [doc.id, true]);
    const updated = await engine.supersedeForNewRevision(q, doc.id, 'R1');
    expect(updated.doc_status).toBe('draft');
    const versions = (await q('SELECT * FROM document_versions WHERE document_id = $1', [doc.id])).rows;
    expect(versions.every((v) => v.is_current === false || v.is_current === 'false' || v.status === 'superseded' || v.superseded_at != null)).toBe(true);
  });

  test('explicit supersede marks the old document and fires the event', async () => {
    const oldDoc = await insertDoc();
    const newDoc = await insertDoc();
    const superseded = await engine.supersedeDocument(q, oldDoc.id, newDoc.id, OWNER);
    expect(superseded.doc_status).toBe('superseded');
    expect(superseded.superseded_by_doc_id).toBe(newDoc.id);
    const events = (await q(`SELECT * FROM event_log WHERE event_type = 'document.superseded'`)).rows;
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Transmittals
// ---------------------------------------------------------------------------

describe('transmittals', () => {
  test('create → send → acknowledge → close; illegal jumps refused', async () => {
    const t = await engine.createTransmittal(q, { project_id: 1, direction: 'outgoing', purpose: 'Issue drawings' }, OWNER);
    expect(t.transmittal_number).toMatch(/^TRO-\d{4}-0001$/);
    expect(t.status).toBe('draft');
    await expect(engine.transitionTransmittal(q, t.id, 'acknowledged', OWNER)).rejects.toThrow(/Cannot transition/);
    await engine.transitionTransmittal(q, t.id, 'sent', OWNER);
    const ack = await engine.transitionTransmittal(q, t.id, 'acknowledged', OWNER, { ackNote: 'Received' });
    expect(ack.status).toBe('acknowledged');
    expect(ack.acknowledged_by_user_id).toBe(OWNER.id);
    const closed = await engine.transitionTransmittal(q, t.id, 'closed', OWNER);
    expect(closed.status).toBe('closed');
  });

  test('incoming transmittals number independently', async () => {
    const t = await engine.createTransmittal(q, { project_id: 1, direction: 'incoming' }, OWNER);
    expect(t.transmittal_number).toMatch(/^TRI-\d{4}-0001$/);
  });
});

// ---------------------------------------------------------------------------
// Correspondence
// ---------------------------------------------------------------------------

describe('correspondence', () => {
  test('numbered by type; amendments are revision-safe with history rows', async () => {
    const c = await engine.createCorrespondence(q, { project_id: 1, corr_type: 'notice', subject: 'Delay notice' }, OWNER);
    expect(c.corr_number).toMatch(/^NOT-\d{4}-0001$/);
    await engine.transitionCorrespondence(q, c.id, 'sent', OWNER);
    const amended = await engine.amendCorrespondence(q, c.id, OWNER, { body: 'Revised delay', note: 'Updated dates' });
    expect(amended.revision).toBe(1);
    const history = (await q('SELECT * FROM correspondence_history WHERE correspondence_id = $1', [c.id])).rows;
    expect(history.length).toBe(1);
    expect(history[0].from_revision).toBe(0);
    expect(history[0].to_revision).toBe(1);
  });

  test('responded → closed; invalid lifecycle jumps refused', async () => {
    const c = await engine.createCorrespondence(q, { project_id: 1, corr_type: 'letter', subject: 'Submittal reminder' }, OWNER);
    await engine.transitionCorrespondence(q, c.id, 'sent', OWNER);
    await expect(engine.transitionCorrespondence(q, c.id, 'closed', OWNER)).resolves.toBeTruthy();
    await expect(engine.transitionCorrespondence(q, c.id, 'sent', OWNER)).rejects.toThrow(/Cannot transition/);
  });
});

// ---------------------------------------------------------------------------
// Zero-record contract
// ---------------------------------------------------------------------------

describe('zero-record contract', () => {
  test('a fresh project has no register entries, transmittals, or correspondence', async () => {
    await q(`INSERT INTO projects (id, code, name_en, status) VALUES ($1,$2,$3,$4)`, [2, 'EMP', 'Empty', 'active']);
    expect((await q('SELECT COUNT(*) AS c FROM project_documents WHERE project_id = $1', [2])).rows[0].c).toBe(0);
    expect((await q('SELECT COUNT(*) AS c FROM transmittals WHERE project_id = $1', [2])).rows[0].c).toBe(0);
    expect((await q('SELECT COUNT(*) AS c FROM correspondence WHERE project_id = $1', [2])).rows[0].c).toBe(0);
  });
});
