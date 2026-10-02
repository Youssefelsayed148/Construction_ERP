const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function main() {
  const pool = new Pool({
    host: 'localhost', port: 5432, user: 'postgres',
    database: 'construction_erp'
  });

  const hash = await bcrypt.hash('test123', 10);

  const users = [
    { name: 'TEST-Finance Manager', email: 'test-finance-mgr@test.com', role: 'finance_manager', dept: 'Finance', perms: ['finance'] },
    { name: 'TEST-Staff User', email: 'test-staff@test.com', role: 'staff', dept: 'Operations', perms: ['projects'] },
  ];

  for (const u of users) {
    const r = await pool.query(
      `INSERT INTO users (name, email, password, role, department, module_permissions, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (email) DO UPDATE SET role = $4, is_active = true
       RETURNING id, name, email, role`,
      [u.name, u.email, hash, u.role, u.dept, JSON.stringify(u.perms)]
    );
    // A user without a role assignment has no access (Phase 1.2).
    await pool.query(
      `INSERT INTO user_project_roles (user_id, project_id, role_id)
       SELECT $1, NULL, id FROM roles WHERE key = $2
       ON CONFLICT DO NOTHING`,
      [r.rows[0].id, u.role]
    );
    console.log('Created:', JSON.stringify(r.rows[0]));
  }

  await pool.end();
  console.log('DONE');
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
