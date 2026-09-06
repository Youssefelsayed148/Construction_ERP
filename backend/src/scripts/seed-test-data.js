// Populates the database with realistic test data for manually exercising every module
// (Clients, Suppliers, Inventory, Projects, BOQ, Work Orders, Site Reports, Invoices/Payments, Expenses).
//
// Safe to re-run: every row is created with a fixed "SEED-" marker in its code/title, and the
// script checks for that marker before inserting, so re-running just reports "already exists"
// and reuses the existing rows instead of duplicating them.
//
// DEV/TEST DATABASES ONLY. This inserts fictional client/project/financial data — do not run
// against a production database.
//
// Usage: node backend/src/scripts/seed-test-data.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function findOrCreate(table, code, insertFn) {
  const existing = await query(`SELECT * FROM ${table} WHERE code = $1`, [code]);
  if (existing.rows.length > 0) {
    console.log(`[SKIP] ${table} ${code} already exists (id=${existing.rows[0].id})`);
    return existing.rows[0];
  }
  const row = await insertFn();
  console.log(`[OK]   ${table} ${code} created (id=${row.id})`);
  return row;
}

async function getOwnerUserId() {
  const owner = await query(`SELECT id FROM users WHERE email = 'owner@construction-erp.com'`);
  if (owner.rows.length === 0) throw new Error('Seeded owner user (owner@construction-erp.com) not found — run setupDb.js first.');
  return owner.rows[0].id;
}

async function seedClients() {
  const clients = [];
  clients.push(await findOrCreate('clients', 'CLI-SEED-1', async () => {
    const r = await query(
      `INSERT INTO clients (code, name_ar, name_en, client_type, contact_person, phone, email, address, city, credit_limit, payment_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      ['CLI-SEED-1', 'شركة النيل للتطوير العقاري', 'Nile Real Estate Development', 'company', 'Ahmed Hassan', '01001234567', 'contact@nile-dev.example', '15 Nasr Road', 'Cairo', 5000000, 'Net 30']
    );
    return r.rows[0];
  }));
  clients.push(await findOrCreate('clients', 'CLI-SEED-2', async () => {
    const r = await query(
      `INSERT INTO clients (code, name_ar, name_en, client_type, contact_person, phone, email, address, city, credit_limit, payment_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      ['CLI-SEED-2', 'مجموعة الإسكندرية التجارية', 'Alexandria Commercial Group', 'company', 'Sara Mahmoud', '01112345678', 'sara@alex-commercial.example', '40 Corniche St', 'Alexandria', 2000000, 'Net 15']
    );
    return r.rows[0];
  }));
  clients.push(await findOrCreate('clients', 'CLI-SEED-3', async () => {
    const r = await query(
      `INSERT INTO clients (code, name_ar, name_en, client_type, contact_person, phone, email, address, city, credit_limit, payment_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      ['CLI-SEED-3', 'المهندس كريم عبد الله', 'Eng. Karim Abdullah', 'individual', 'Karim Abdullah', '01223456789', 'karim.abdullah@example.com', '7 Gamaat El Dowal St', 'Giza', 500000, 'Due on Receipt']
    );
    return r.rows[0];
  }));
  return clients;
}

async function seedSuppliers() {
  const suppliers = [];
  suppliers.push(await findOrCreate('suppliers', 'SUP-SEED-1', async () => {
    const r = await query(
      `INSERT INTO suppliers (code, name_ar, name_en, contact_person, phone, email, address, city, specialty, payment_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      ['SUP-SEED-1', 'مصنع الدلتا للأسمنت والحديد', 'Delta Cement & Steel Factory', 'Mostafa Fathy', '01098765432', 'sales@delta-cement.example', 'Industrial Zone, 10th of Ramadan', '10th of Ramadan City', 'concrete', 'Net 30']
    );
    return r.rows[0];
  }));
  suppliers.push(await findOrCreate('suppliers', 'SUP-SEED-2', async () => {
    const r = await query(
      `INSERT INTO suppliers (code, name_ar, name_en, contact_person, phone, email, address, city, specialty, payment_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      ['SUP-SEED-2', 'شركة السلامة الحديثة للمعدات', 'Modern Safety Equipment Co.', 'Nour El-Din', '01187654321', 'info@modern-safety.example', '22 Industrial Rd', 'Cairo', 'safety', 'Net 15']
    );
    return r.rows[0];
  }));
  suppliers.push(await findOrCreate('suppliers', 'SUP-SEED-3', async () => {
    const r = await query(
      `INSERT INTO suppliers (code, name_ar, name_en, contact_person, phone, email, address, city, specialty, payment_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      ['SUP-SEED-3', 'مؤسسة الأهرام لتأجير المعدات الثقيلة', 'Al-Ahram Heavy Equipment Rentals', 'Tarek Younis', '01276543210', 'rentals@ahram-equip.example', '5 Ring Road', 'Giza', 'equipment', 'Due on Receipt']
    );
    return r.rows[0];
  }));
  return suppliers;
}

async function seedItems() {
  const specs = [
    ['MAT-SEED-1', 'raw_material', 'cement', 'bag', 'Portland Cement 50kg', 'أسمنت بورتلاندي 50 كجم'],
    ['MAT-SEED-2', 'raw_material', 'steel', 'ton', 'Rebar 12mm', 'حديد تسليح 12مم'],
    ['MAT-SEED-3', 'finished_material', 'tile_flooring', 'm2', 'Ceramic Floor Tile', 'بلاط أرضيات سيراميك'],
    ['MAT-SEED-4', 'equipment_rental', 'earthmoving', 'piece', 'Excavator (rental unit)', 'حفارة (وحدة إيجار)'],
    ['MAT-SEED-5', 'safety', 'ppe', 'piece', 'Safety Helmet', 'خوذة أمان'],
    ['MAT-SEED-6', 'consumable', 'fastener', 'bag', 'Assorted Fasteners', 'مسامير ومشدات متنوعة'],
  ];
  const items = [];
  for (const [code, category, sub_category, unit, name_en, name_ar] of specs) {
    items.push(await findOrCreate('item_master', code, async () => {
      const r = await query(
        `INSERT INTO item_master (code, category, sub_category, unit, name_en, name_ar)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [code, category, sub_category, unit, name_en, name_ar]
      );
      return r.rows[0];
    }));
  }
  return items;
}

async function seedSupplierMaterials(suppliers, items) {
  const links = [
    [suppliers[0], items[0], 180, 3],   // Delta Cement -> Portland Cement
    [suppliers[0], items[1], 35000, 7], // Delta Cement -> Rebar
    [suppliers[1], items[4], 250, 5],   // Modern Safety -> Safety Helmet
    [suppliers[2], items[3], 15000, 1], // Al-Ahram -> Excavator
  ];
  for (const [supplier, item, unit_price, lead_time_days] of links) {
    const existing = await query('SELECT id FROM supplier_materials WHERE supplier_id = $1 AND material_id = $2', [supplier.id, item.id]);
    if (existing.rows.length > 0) {
      console.log(`[SKIP] supplier_materials ${supplier.code}<->${item.code} already linked`);
      continue;
    }
    await query(
      `INSERT INTO supplier_materials (supplier_id, material_id, unit_price, lead_time_days) VALUES ($1,$2,$3,$4)`,
      [supplier.id, item.id, unit_price, lead_time_days]
    );
    console.log(`[OK]   supplier_materials ${supplier.code}<->${item.code} linked (${unit_price} EGP, ${lead_time_days}d lead time)`);
  }
}

async function seedProject(code, nameAr, nameEn, client, ownerId) {
  return findOrCreate('projects', code, async () => {
    const r = await query(
      `INSERT INTO projects (code, name, name_ar, name_en, project_type, client_id, project_manager_id, contract_value, budget, start_date, expected_completion, status, address, city)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      // project_manager_id references employees(id), not users(id) — no seeded manager employee to link here.
      [code, nameAr, nameAr, nameEn, 'residential', client.id, null, 5000000, 4000000, '2026-01-15', '2027-06-30', 'active', '100 New Cairo Blvd', 'Cairo']
    );
    return r.rows[0];
  });
}

async function seedBoqForProject(project) {
  const section = await findOrCreateBoqSection(project.id, 'SEED-SEC-1', 'أعمال الأساسات', 'Foundation Works', null, 1);
  const subSection = await findOrCreateBoqSection(project.id, 'SEED-SEC-2', 'أعمال الحفر', 'Excavation Works', section.id, 1);

  const item = await findOrCreateBoqItem(project.id, 'SEED-BOQ-1', section.id, 'صب خرسانة الأساسات', 'Foundation concrete pour', 'm3', 250, 1800, 'material');
  const item2 = await findOrCreateBoqItem(project.id, 'SEED-BOQ-2', subSection.id, 'حفر التربة', 'Soil excavation', 'm3', 500, 120, 'equipment');
  return { section, subSection, items: [item, item2] };
}

async function findOrCreateBoqSection(projectId, code, nameAr, nameEn, parentId, sortOrder) {
  const existing = await query('SELECT * FROM boq_sections WHERE project_id = $1 AND code = $2', [projectId, code]);
  if (existing.rows.length > 0) {
    console.log(`[SKIP] boq_sections ${code} already exists (id=${existing.rows[0].id})`);
    return existing.rows[0];
  }
  const r = await query(
    `INSERT INTO boq_sections (project_id, code, name, name_ar, name_en, parent_id, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [projectId, code, nameAr, nameAr, nameEn, parentId, sortOrder]
  );
  console.log(`[OK]   boq_sections ${code} created (id=${r.rows[0].id})`);
  return r.rows[0];
}

async function findOrCreateBoqItem(projectId, code, sectionId, descAr, descEn, unit, quantity, unitRate, type) {
  const existing = await query('SELECT * FROM boq_items WHERE project_id = $1 AND code = $2', [projectId, code]);
  if (existing.rows.length > 0) {
    console.log(`[SKIP] boq_items ${code} already exists (id=${existing.rows[0].id})`);
    return existing.rows[0];
  }
  const r = await query(
    `INSERT INTO boq_items (project_id, section_id, code, description, description_ar, description_en, unit, quantity, unit_rate, type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [projectId, sectionId, code, descAr, descAr, descEn, unit, quantity, unitRate, type]
  );
  console.log(`[OK]   boq_items ${code} created (id=${r.rows[0].id})`);
  return r.rows[0];
}

async function seedWorkOrder(project, boqSection, ownerId) {
  const existing = await query(`SELECT * FROM work_orders WHERE project_id = $1 AND title_en = $2`, [project.id, 'SEED: Foundation Pour']);
  if (existing.rows.length > 0) {
    console.log(`[SKIP] work_orders SEED: Foundation Pour already exists (id=${existing.rows[0].id})`);
    return existing.rows[0];
  }
  const r = await query(
    `INSERT INTO work_orders (project_id, boq_section_id, title, title_ar, title_en, description, planned_start_date, planned_end_date, assigned_to, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [project.id, boqSection.id, 'صب خرسانة الأساسات', 'صب خرسانة الأساسات', 'SEED: Foundation Pour', 'Pour foundation concrete per structural drawings.', '2026-08-01', '2026-08-10', ownerId, 'in_progress']
  );
  console.log(`[OK]   work_orders SEED: Foundation Pour created (id=${r.rows[0].id})`);
  return r.rows[0];
}

async function seedSiteReport(project) {
  const existing = await query(`SELECT * FROM site_daily_reports WHERE project_id = $1 AND work_summary = $2`, [project.id, 'SEED: صب خرسانة القواعد - دفعة أولى']);
  if (existing.rows.length > 0) {
    console.log(`[SKIP] site_daily_reports (seed) already exists (id=${existing.rows[0].id})`);
    return existing.rows[0];
  }
  const r = await query(
    `INSERT INTO site_daily_reports (project_id, report_date, weather, temperature, workers_count, work_summary, material_received, equipment_on_site)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [project.id, '2026-07-20', 'مشمس', '34C', 22, 'SEED: صب خرسانة القواعد - دفعة أولى', 'أسمنت 50 طن، حديد تسليح 10 طن', 'خلاطة خرسانة، حفارة']
  );
  console.log(`[OK]   site_daily_reports (seed) created (id=${r.rows[0].id})`);
  return r.rows[0];
}

async function seedInvoiceWithPayments(project, client) {
  let invoice = (await query(`SELECT * FROM invoices WHERE project_id = $1 AND description = $2`, [project.id, 'SEED: Progress billing #1'])).rows[0];
  if (invoice) {
    console.log(`[SKIP] invoices (seed) already exists (id=${invoice.id})`);
  } else {
    const count = await query("SELECT COUNT(*) as cnt FROM invoices WHERE invoice_number LIKE 'INV-%'");
    const invoiceNumber = `INV-${String(parseInt(count.rows[0].cnt) + 1).padStart(4, '0')}`;
    const r = await query(
      `INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date, due_date, status, description)
       VALUES ($1,$2,$3,$4,$5,$6,'sent',$7) RETURNING *`,
      [invoiceNumber, project.id, client.id, 1000000, '2026-07-01', '2026-07-31', 'SEED: Progress billing #1']
    );
    invoice = r.rows[0];
    console.log(`[OK]   invoices ${invoiceNumber} (seed) created (id=${invoice.id})`);
  }

  const existingPayment = await query('SELECT id FROM payments WHERE invoice_id = $1', [invoice.id]);
  if (existingPayment.rows.length > 0) {
    console.log('[SKIP] payments (seed) already recorded against invoice');
  } else {
    await query(
      `INSERT INTO payments (invoice_id, project_id, client_id, amount, payment_date, payment_method, reference_number, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [invoice.id, project.id, client.id, 400000, '2026-07-10', 'bank_transfer', 'SEED-TRF-001', 'Partial payment #1 (seed)']
    );
    console.log('[OK]   payments 400,000 EGP partial payment (seed) recorded');
    await query('UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2', ['partially_paid', invoice.id]);
  }
  return invoice;
}

async function seedExpenses(project, ownerId) {
  const specs = [
    ['SEED: Cement delivery — Foundation phase', 90000, 'materials'],
    ['SEED: Excavator rental — 2 weeks', 30000, 'equipment'],
  ];
  for (const [description, amount, category] of specs) {
    const existing = await query('SELECT id FROM expenses WHERE project_id = $1 AND description = $2', [project.id, description]);
    if (existing.rows.length > 0) {
      console.log(`[SKIP] expenses "${description}" already exists`);
      continue;
    }
    await query(
      `INSERT INTO expenses (category, description, amount, date, project_id, paid_by, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [category, description, amount, '2026-07-15', project.id, 'Site Office', ownerId]
    );
    console.log(`[OK]   expenses "${description}" (${amount} EGP) created`);
  }
}

async function main() {
  console.log('Seeding Construction ERP test data (safe to re-run — existing SEED- rows are skipped)...\n');

  const ownerId = await getOwnerUserId();

  const clients = await seedClients();
  const suppliers = await seedSuppliers();
  const items = await seedItems();
  await seedSupplierMaterials(suppliers, items);

  const project1 = await seedProject('PRJ-SEED-1', 'برج النيل السكني', 'Nile Residential Tower', clients[0], ownerId);
  const { section } = await seedBoqForProject(project1);
  await seedWorkOrder(project1, section, ownerId);
  await seedSiteReport(project1);
  await seedInvoiceWithPayments(project1, clients[0]);
  await seedExpenses(project1, ownerId);

  const project2 = await seedProject('PRJ-SEED-2', 'مجمع الإسكندرية التجاري', 'Alexandria Commercial Complex', clients[1], ownerId);
  await seedBoqForProject(project2);

  console.log('\nSeed complete.');
  console.log(`Clients: ${clients.length}, Suppliers: ${suppliers.length}, Inventory items: ${items.length}`);
  console.log(`Projects: PRJ-SEED-1 (id=${project1.id}, full data), PRJ-SEED-2 (id=${project2.id}, BOQ only)`);
  process.exit(0);
}

main().catch(e => { console.error('Seed failed:', e); process.exit(1); });
