const { canAccessMedia } = require('../../services/mediaAccess');
const policy = require('../../services/policy');
const fs = require('fs');
const path = require('path');
// Independent classification from the authoritative migration's external block.
const roleSeed = fs.readFileSync(path.resolve(__dirname, '../../migrations/0031_organizations_rbac.sql'), 'utf8');
const externalSeed = roleSeed.split('-- external (9)')[1].split('ON CONFLICT')[0];
const externalRoles = new Set([...policy.EXTERNAL_ROLES, ...[...externalSeed.matchAll(/\('([^']+)'/g)].map(match => match[1])]);
const describePg = process.env.TEST_PG === '1' ? describe : describe.skip;

describePg('R0.4 media authorization matches the seeded role permission matrix', () => {
  let db; let project;
  const tag = `${Date.now()}-${process.pid}`;
  const users = [];
  beforeAll(async () => {
    db = require('../../config/database');
    project = (await db.query("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`media-${tag}`, `MEDIA-${tag}`])).rows[0];
  });
  afterAll(async () => {
    if (project) await db.query('DELETE FROM project_documents WHERE project_id = $1', [project.id]);
    for (const user of users) {
      await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [user.id]);
      await db.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);
    }
    if (project) await db.query('DELETE FROM projects WHERE id = $1', [project.id]);
    await db.pool.end();
  });

  test('every role has its own linked document and allow/deny comes from matrix grants', async () => {
    const roles = (await db.query(`SELECT r.id, r.key, EXISTS (
      SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = r.id AND p.module IN ('docs', '*') AND p.action IN ('view', '*')
    ) AS docs_view FROM roles r ORDER BY r.key`)).rows;
    expect(roles.length).toBeGreaterThanOrEqual(48);
    const failures = [];
    for (const role of roles) {
      const user = (await db.query("INSERT INTO users (name, email, password, role) VALUES ('media-matrix', $1, 'unused', $2) RETURNING id, role", [`media-${tag}-${role.key}@test.invalid`, role.key])).rows[0];
      users.push(user);
      await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) VALUES ($1, $2, $3)', [user.id, project.id, role.id]);
      const fileName = `media-${tag}-${role.key}.pdf`;
      await db.query("INSERT INTO project_documents (project_id, title, document_type, file_url, status, portal_visibility) VALUES ($1, $2, 'drawing', $3, 'draft', 'internal')", [project.id, fileName, `/uploads/${fileName}`]);
      // Draft internal documents are unavailable to external portal accounts,
      // regardless of grants. All other decisions come from the actual matrix.
      const expected = !externalRoles.has(role.key) && role.docs_view;
      const actual = await canAccessMedia(db.query, user, fileName);
      if (actual !== expected) failures.push(`${role.key}: expected=${expected} actual=${actual}`);
    }
    console.log(`R0.4 media matrix: ${roles.length} roles, ${failures.length} mismatches`);
    expect(failures).toEqual([]);
  }, 60000);
});
