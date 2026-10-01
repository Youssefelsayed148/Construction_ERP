require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const DB_NAME = process.env.DB_NAME || 'construction_erp';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432');
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

async function setupDatabase() {
  console.log('Setting up Construction ERP database...\n');

  // Step 0: Create database if it doesn't exist
  const bootstrapPool = new Pool({
    host: DB_HOST, port: DB_PORT,
    database: 'postgres',
    user: DB_USER, password: DB_PASSWORD,
    connectionTimeoutMillis: 5000,
  });

  try {
    const exists = await bootstrapPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME]
    );
    if (exists.rows.length === 0) {
      await bootstrapPool.query(`CREATE DATABASE "${DB_NAME}"`);
      console.log(`[CREATE] Database "${DB_NAME}" created`);
    } else {
      console.log(`[OK] Database "${DB_NAME}" already exists`);
    }
  } finally {
    await bootstrapPool.end();
  }

  // Now connect to the target database
  const { query } = require('../config/database');

  // 1. Users & Auth
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(100) DEFAULT 'staff',
      department VARCHAR(255),
      module_permissions TEXT[] DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] users');

  // 2. Activity Log
  await query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      user_name VARCHAR(255),
      user_role VARCHAR(100),
      action VARCHAR(100) NOT NULL,
      module VARCHAR(100),
      description TEXT,
      entity_id INTEGER,
      entity_type VARCHAR(100),
      amount DECIMAL(15,2),
      old_status VARCHAR(100),
      new_status VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] activity_log');

  // 3. Event Log (fire_event target)
  await query(`
    CREATE TABLE IF NOT EXISTS event_log (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(255) NOT NULL,
      entity_type VARCHAR(100),
      entity_id INTEGER,
      user_id INTEGER REFERENCES users(id),
      user_name VARCHAR(255),
      user_role VARCHAR(100),
      payload JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] event_log');

  // 4. Approval Requests
  await query(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id SERIAL PRIMARY KEY,
      module_name VARCHAR(100) NOT NULL,
      request_type VARCHAR(100) NOT NULL,
      request_id INTEGER NOT NULL,
      requester_id INTEGER REFERENCES users(id),
      manager_id INTEGER REFERENCES users(id),
      approver_id INTEGER REFERENCES users(id),
      status VARCHAR(50) DEFAULT 'pending',
      stage VARCHAR(50) DEFAULT 'manager_review',
      notes TEXT,
      manager_notes TEXT,
      manager_approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] approval_requests');

  // 5. Accounts (COA)
  await query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE,
      name VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      name_ar VARCHAR(255),
      type VARCHAR(50) DEFAULT 'expense',
      parent_id INTEGER REFERENCES accounts(id),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const existingAccounts = await query('SELECT COUNT(*) as cnt FROM accounts');
  if (parseInt(existingAccounts.rows[0].cnt) === 0) {
    await query(`
      INSERT INTO accounts (code, name, name_en, name_ar, type) VALUES
        ('1000', 'النقدية', 'Cash', 'النقدية', 'asset'),
        ('1100', 'حسابات القبض', 'Accounts Receivable', 'حسابات القبض', 'asset'),
        ('1200', 'مخزون - مواد بناء', 'Inventory - Construction Materials', 'مخزون - مواد بناء', 'asset'),
        ('1300', 'معدات وآلات', 'Equipment & Machinery', 'معدات وآلات', 'asset'),
        ('2000', 'حسابات الدفع', 'Accounts Payable', 'حسابات الدفع', 'liability'),
        ('3000', 'حقوق الملكية', 'Equity', 'حقوق الملكية', 'equity'),
        ('4000', 'إيرادات المشاريع', 'Project Revenue', 'إيرادات المشاريع', 'revenue'),
        ('5000', 'مصروفات الرواتب والأجور', 'Salaries & Wages Expense', 'مصروفات الرواتب والأجور', 'expense'),
        ('5100', 'تكلفة المواد', 'Material Cost', 'تكلفة المواد', 'expense'),
        ('5200', 'مصروفات أخرى', 'Other Expenses', 'مصروفات أخرى', 'expense')
    `);
  }
  console.log('[OK] accounts');

  // 6. Journal Entries
  await query(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id SERIAL PRIMARY KEY,
      entry_number VARCHAR(50) UNIQUE,
      date DATE NOT NULL,
      description TEXT,
      reference_id INTEGER,
      reference_type VARCHAR(100),
      total_amount DECIMAL(15,2) DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id SERIAL PRIMARY KEY,
      journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id INTEGER REFERENCES accounts(id),
      debit DECIMAL(15,2) DEFAULT 0,
      credit DECIMAL(15,2) DEFAULT 0,
      description TEXT,
      line_order INTEGER
    )
  `);
  console.log('[OK] journal_entries + lines');

  // 7. Business Rules
  await query(`
    CREATE TABLE IF NOT EXISTS business_rules (
      id SERIAL PRIMARY KEY,
      rule_key VARCHAR(100) UNIQUE NOT NULL,
      rule_value JSONB NOT NULL DEFAULT '{}',
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const existingRules = await query('SELECT COUNT(*) as cnt FROM business_rules');
  if (parseInt(existingRules.rows[0].cnt) === 0) {
    await query(`
      INSERT INTO business_rules (rule_key, rule_value, description) VALUES
        ('retention_percent', '{"value": 10}', 'Default retention percentage for subcontractor contracts')
    `);
  }
  console.log('[OK] business_rules');

  // 8. Item Master (construction materials)
  await query(`
    CREATE TABLE IF NOT EXISTS item_master (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      category VARCHAR(100) NOT NULL,
      sub_category VARCHAR(100),
      unit VARCHAR(50) DEFAULT 'piece',
      name_en VARCHAR(255) NOT NULL,
      name_ar VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      base_unit VARCHAR(50),
      purchase_unit VARCHAR(50),
      issue_unit VARCHAR(50),
      unit_conversions JSONB DEFAULT '[]',
      preferred_supplier_ids JSONB DEFAULT '[]',
      min_stock DECIMAL(15,3) DEFAULT 0,
      max_stock DECIMAL(15,3) DEFAULT 0,
      safety_stock DECIMAL(15,3) DEFAULT 0,
      supplier_lead_time_days INTEGER DEFAULT 0,
      reorder_policy VARCHAR(30) DEFAULT 'none',
      reorder_point DECIMAL(15,3) DEFAULT 0,
      order_multiple DECIMAL(15,3) DEFAULT 0,
      moq DECIMAL(15,3) DEFAULT 0,
      shelf_life_days INTEGER,
      batch_lot_tracking BOOLEAN DEFAULT false,
      inspection_required BOOLEAN DEFAULT false
    )
  `);
  console.log('[OK] item_master');

  // 9. Suppliers
  await query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE,
      name_ar VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      contact_person VARCHAR(255),
      phone VARCHAR(50),
      email VARCHAR(255),
      address TEXT,
      city VARCHAR(100),
      specialty VARCHAR(255),
      tax_id VARCHAR(100),
      payment_terms VARCHAR(255),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] suppliers');

  // 10. Clients
  await query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE,
      name_ar VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      client_type VARCHAR(100),
      contact_person VARCHAR(255),
      phone VARCHAR(50),
      email VARCHAR(255),
      address TEXT,
      city VARCHAR(100),
      credit_limit DECIMAL(15,2) DEFAULT 0,
      current_balance DECIMAL(15,2) DEFAULT 0,
      payment_terms VARCHAR(255),
      tax_id VARCHAR(100),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] clients');

  // 11. Expenses
  await query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      category VARCHAR(100) NOT NULL,
      description TEXT,
      amount DECIMAL(15,2) NOT NULL,
      date DATE DEFAULT CURRENT_DATE,
      project_id INTEGER,
      status VARCHAR(50) DEFAULT 'pending',
      paid_by VARCHAR(255),
      created_by INTEGER REFERENCES users(id),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] expenses');

  // 12. Legal Documents
  await query(`
    CREATE TABLE IF NOT EXISTS legal_documents (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      document_type VARCHAR(100),
      description TEXT,
      file_path VARCHAR(500),
      status VARCHAR(50) DEFAULT 'pending',
      submitted_by VARCHAR(255),
      verified_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] legal_documents');

  // 13. Assets / Equipment
  await query(`
    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE,
      name VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      name_ar VARCHAR(255),
      asset_type VARCHAR(100),
      category VARCHAR(100),
      equipment_type VARCHAR(50),
      manufacturer VARCHAR(255),
      model VARCHAR(255),
      serial_number VARCHAR(255),
      purchase_date DATE,
      purchase_cost DECIMAL(15,2),
      status VARCHAR(50) DEFAULT 'active',
      hourly_rate DECIMAL(15,2) DEFAULT 0,
      daily_rate DECIMAL(15,2) DEFAULT 0,
      operator_required BOOLEAN DEFAULT false,
      location VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] assets');

  // 14. Maintenance Reminders
  await query(`
    CREATE TABLE IF NOT EXISTS maintenance_reminders (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER REFERENCES assets(id),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      maintenance_type VARCHAR(100),
      priority VARCHAR(50),
      scheduled_date DATE,
      next_due_date DATE,
      interval_value INTEGER,
      interval_unit VARCHAR(50),
      estimated_hours DECIMAL(10,2),
      estimated_cost DECIMAL(15,2),
      assigned_tech VARCHAR(255),
      status VARCHAR(50) DEFAULT 'scheduled',
      actual_hours DECIMAL(10,2),
      actual_cost DECIMAL(15,2),
      completion_date DATE,
      completion_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] maintenance_reminders');

  // 15. Employees
  await query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE,
      name VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      name_ar VARCHAR(255),
      phone VARCHAR(50),
      email VARCHAR(255),
      national_id VARCHAR(100),
      department VARCHAR(100),
      designation VARCHAR(255),
      hire_date DATE,
      salary DECIMAL(15,2) DEFAULT 0,
      bank_name VARCHAR(255),
      bank_account VARCHAR(255),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] employees');

  // 16. Attendance
  await query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER REFERENCES employees(id),
      date DATE NOT NULL,
      status VARCHAR(50) DEFAULT 'present',
      check_in TIME,
      check_out TIME,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] attendance');

  // 17. Leave Requests
  await query(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER REFERENCES employees(id),
      leave_type VARCHAR(100),
      start_date DATE,
      end_date DATE,
      reason TEXT,
      status VARCHAR(50) DEFAULT 'pending',
      reviewed_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('[OK] leave_requests');

  // 18. Payroll
  await query(`
    CREATE TABLE IF NOT EXISTS payroll_periods (
      id SERIAL PRIMARY KEY,
      period_name VARCHAR(255),
      month INTEGER,
      year INTEGER,
      total_employees INTEGER DEFAULT 0,
      total_basic_salary DECIMAL(15,2) DEFAULT 0,
      total_net_salary DECIMAL(15,2) DEFAULT 0,
      status VARCHAR(50) DEFAULT 'draft',
      posted_to_finance BOOLEAN DEFAULT false,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS payroll_details (
      id SERIAL PRIMARY KEY,
      payroll_id INTEGER REFERENCES payroll_periods(id) ON DELETE CASCADE,
      employee_id INTEGER REFERENCES employees(id),
      basic_salary DECIMAL(15,2) DEFAULT 0,
      allowances DECIMAL(15,2) DEFAULT 0,
      deductions DECIMAL(15,2) DEFAULT 0,
      net_salary DECIMAL(15,2) DEFAULT 0,
      notes TEXT
    )
  `);
  console.log('[OK] payroll');

  // Seed an initial owner only when explicitly requested. Production must never
  // receive a predictable default credential as a side effect of migrations.
  const userCount = await query('SELECT COUNT(*) as cnt FROM users');
  const shouldSeedOwner = process.env.SEED_DEFAULT_OWNER === 'true';
  if (parseInt(userCount.rows[0].cnt) === 0 && shouldSeedOwner) {
    const ownerEmail = process.env.DEFAULT_OWNER_EMAIL;
    const ownerPassword = process.env.DEFAULT_OWNER_PASSWORD;
    if (!ownerEmail || !ownerPassword || ownerPassword.length < 12) {
      throw new Error(
        'SEED_DEFAULT_OWNER requires DEFAULT_OWNER_EMAIL and DEFAULT_OWNER_PASSWORD (minimum 12 characters)'
      );
    }
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(ownerPassword, 10);
    await query(
      `INSERT INTO users (name, email, password, role, department, module_permissions, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      ['Owner', ownerEmail, hashedPassword, 'owner', 'Management', ['all']]
    );
    console.log(`[SEED] Owner account created: ${ownerEmail}`);
  } else if (parseInt(userCount.rows[0].cnt) === 0) {
    console.log('[SEED] No users exist; initial owner seeding was not requested');
  }

  console.log('\nDatabase setup complete!');
  process.exit(0);
}

setupDatabase().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
