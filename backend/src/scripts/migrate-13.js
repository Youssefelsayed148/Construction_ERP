require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function migrate() {
  console.log('Running Prompt 13 — Billing, Payments & Finance migration...\n');

  await query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      invoice_number VARCHAR(20) UNIQUE NOT NULL,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      client_id INTEGER NOT NULL REFERENCES clients(id),
      amount NUMERIC(14,2) NOT NULL,
      issue_date DATE NOT NULL,
      due_date DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('[OK] invoices');

  await query(`CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices(project_id)`);
  console.log('[OK] idx_invoices_project_id');

  await query(`CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id)`);
  console.log('[OK] idx_invoices_client_id');

  await query(`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`);
  console.log('[OK] idx_invoices_status');

  await query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER REFERENCES invoices(id),
      project_id INTEGER NOT NULL REFERENCES projects(id),
      client_id INTEGER NOT NULL REFERENCES clients(id),
      amount NUMERIC(14,2) NOT NULL,
      payment_date DATE NOT NULL,
      payment_method VARCHAR(50),
      reference_number VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('[OK] payments');

  await query(`CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id)`);
  console.log('[OK] idx_payments_invoice_id');

  await query(`CREATE INDEX IF NOT EXISTS idx_payments_project_id ON payments(project_id)`);
  console.log('[OK] idx_payments_project_id');

  await query(`CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id)`);
  console.log('[OK] idx_payments_client_id');

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
