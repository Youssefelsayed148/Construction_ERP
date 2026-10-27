'use strict';

// F1.3: caller-fault business-rule throws carry .status + .error_code (instead of surfacing as a 500 through
// routeFail/typedFail), across procurement, inventory, finance, site, qaqc, hse, handover, doccontrol, actions.
jest.mock('dotenv', () => ({ config: jest.fn() }));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f1-fixture-only-secret-longer-than-32';
jest.mock('../../config/database', () => ({ query: jest.fn(), pool: { query: jest.fn(), on: jest.fn() }, transaction: jest.fn() }));

const procurement = require('../../services/procurementService');
const inventory = require('../../services/inventoryEngine');
const finance = require('../../services/financeEngine');
const site = require('../../services/siteEngine');
const qaqc = require('../../services/qaqcEngine');
const hse = require('../../services/hseEngine');
const handover = require('../../services/handoverEngine');
const doccontrol = require('../../services/doccontrolEngine');
const actions = require('../../services/actionService');
const { routeFail } = require('../../utils/typedRoute');

const empty = () => jest.fn().mockResolvedValue({ rows: [] });
const one = (row) => jest.fn().mockResolvedValue({ rows: [row] });
const owner = { id: 1, role: 'owner' };
const viewer = { id: 2, role: 'viewer' };

// [label, thunk, status, error_code]
const CASES = [
  ['procurement: PR missing', () => procurement.submitPurchaseRequest(empty(), 9, owner), 404, 'record_not_found'],
  ['procurement: PR not draft', () => procurement.submitPurchaseRequest(one({ id: 9, status: 'approved' }), 9, owner), 409, 'invalid_state'],
  ['procurement: MIR already decided', () => procurement.decideMir(one({ id: 1, status: 'accepted' }), 1, owner, 'accept'), 409, 'invalid_state'],
  ['procurement: MIR missing', () => procurement.decideMir(empty(), 1, owner, 'accept'), 404, 'record_not_found'],
  ['inventory: movement missing', () => inventory.reverseMovement(empty(), 5, { reason: 'x' }), 404, 'record_not_found'],
  ['inventory: reservation qty', () => inventory.createReservation(empty(), { warehouse_id: 1, item_id: 1, quantity: 0 }), 400, 'invalid_input'],
  ['finance: invoice missing', () => finance.transitionInvoice(empty(), 3, 'issued', owner), 404, 'record_not_found'],
  ['finance: invalid lifecycle', () => finance.transitionInvoice(one({ id: 3, status: 'draft' }), 3, 'paid', owner), 409, 'invalid_state'],
  ['site: sticky note without text', () => site.createStickyNote(empty(), { owner_user_id: 1, text: ' ' }), 400, 'invalid_input'],
  ['qaqc: WIR missing', () => qaqc.submitWir(empty(), 4, owner), 404, 'record_not_found'],
  ['qaqc: WIR not draft', () => qaqc.submitWir(one({ id: 4, status: 'submitted' }), 4, owner), 409, 'invalid_state'],
  ['qaqc: WIR submit forbidden', () => qaqc.submitWir(one({ id: 4, status: 'draft' }), 4, viewer), 403, 'not_authorized_for_action'],
  ['hse: permit missing', () => hse.submitPermit(empty(), 4, owner), 404, 'record_not_found'],
  ['hse: permit not draft', () => hse.submitPermit(one({ id: 4, status: 'active' }), 4, owner), 409, 'invalid_state'],
  ['handover: process missing', () => handover.transitionHandover(empty(), 1, 'x', owner), 404, 'record_not_found'],
  ['doccontrol: transmittal missing', () => doccontrol.transitionTransmittal(empty(), 1, 'sent', owner), 404, 'record_not_found'],
  ['actions: missing title', () => actions.createActionItem({ title: '' }, { query: empty() }), 400, 'invalid_input'],
];

describe.each(CASES)('%s', (_label, thunk, status, code) => {
  test(`throws ${status} ${code} and routeFail answers it as such`, async () => {
    const err = await thunk().then(() => null, (e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(status);
    expect(err.error_code).toBe(code);
    const res = { statusCode: null, body: null, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; }, setHeader() {} };
    routeFail(res, err, 'TEST');
    expect(res.statusCode).toBe(status);
    expect(res.body.error_code).toBe(code);
  });
});

test('every new code has EN and AR catalog entries and is registered in the frontend contract set', () => {
  const fs = require('fs'); const path = require('path');
  const root = path.join(__dirname, '../../../../frontend/src');
  const codes = [...new Set(CASES.map((c) => c[3]))];
  const en = JSON.parse(fs.readFileSync(path.join(root, 'locales/en/errors.json'), 'utf8'));
  const ar = JSON.parse(fs.readFileSync(path.join(root, 'locales/ar/errors.json'), 'utf8'));
  const client = fs.readFileSync(path.join(root, 'services/apiClient.js'), 'utf8');
  for (const c of [...codes, 'insufficient_stock', 'amount_exceeds_limit']) {
    expect(en[c]).toBeTruthy(); expect(ar[c]).toBeTruthy(); expect(client).toContain(`'${c}'`);
  }
});
