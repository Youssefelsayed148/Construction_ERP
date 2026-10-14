const { mutationAuditViolations } = require('../mutation-audit-guard');

describe('R2 mutation-without-audit guard', () => {
  const route = (body) => `router.post('/rows', authenticate, authorize(), async (req, res) => { ${body} });`;
  test('finds SQL mutations without borrowing an audit from a neighboring route', () => {
    const source = route("await query('INSERT INTO rows (id) VALUES (1)');")
      + "router.put('/rows/:id', async () => { await auditedTransaction(work, event); });";
    expect(mutationAuditViolations(source)).toHaveLength(1);
  });
  test('comments and response strings cannot satisfy the audit requirement', () => {
    expect(mutationAuditViolations(route("await query('DELETE FROM rows'); /* logActivity() */ res.json('logActivity()');"))).toHaveLength(1);
  });
  test('follows local write helpers and audit wrappers', () => {
    const helpers = "const write = async q => q('UPDATE rows SET n = 1'); const atomic = async work => { await work(); await logActivity({}); };";
    expect(mutationAuditViolations(helpers + route('await write(query);'))).toHaveLength(1);
    expect(mutationAuditViolations(helpers + route('await atomic(() => write(query));'))).toHaveLength(0);
  });
  test('flags known write helpers even without inline SQL', () => {
    expect(mutationAuditViolations(route('await fireEvent(event);'))).toHaveLength(1);
  });
  test('GETs, SELECTs and authenticated read-only POSTs have no violation', () => {
    expect(mutationAuditViolations(route("await query('SELECT id FROM rows');"))).toEqual([]);
    expect(mutationAuditViolations("router.get('/', async () => query('SELECT id FROM rows'));" )).toEqual([]);
  });
  test('documents exemptions by method, path and source file, never by entire family', () => {
    const source = "router.post('/lookup', async () => fireEvent(event));";
    expect(mutationAuditViolations(source, 'routes/delegations.js')).toEqual([]);
    expect(mutationAuditViolations(source, 'routes/new.js')).toHaveLength(1);
  });
  test('detects writes on v1 routers named api and template SQL', () => {
    const source = "const api = express.Router(); api.patch('/rows', async () => query(`UPDATE rows SET n = ${n}`));";
    expect(mutationAuditViolations(source)).toHaveLength(1);
  });
});
