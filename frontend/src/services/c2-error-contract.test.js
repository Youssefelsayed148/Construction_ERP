import { errorCodeToTranslationKey, ApiError } from './apiClient';
import { errorMessage } from '../utils/errorMessage';

// C2: every stable backend error_code in the demo-path error contract maps to
// an errors.<code> catalog key; anything unknown keeps the generic localized
// status fallback, so no raw server English string is ever the render path.
describe('C2 error-code mapping', () => {
  const CONTRACT_CODES = [
    'invoice_not_found', 'invoice_posted', 'void_reason_required', 'invoice_already_terminal',
    'invoice_has_live_payments', 'invoice_not_issued', 'payment_not_found', 'payment_already_void',
    'purchase_request_not_found', 'purchase_order_not_found', 'invalid_document_id',
    'no_compliant_quotation', 'supplier_return_not_found', 'unknown_document_type',
    'grn_requires_accepted_mir', 'unit_cost_not_accepted', 'stock_movement_not_found',
    'movement_not_quarantined_receipt', 'transfer_not_found', 'transfer_already_processed',
    'warehouse_not_found', 'warehouse_stock_not_found', 'employee_not_found', 'attendance_duplicate',
    'invalid_status', 'leave_request_not_found', 'laborer_not_found', 'labor_payment_not_found',
    'project_not_found', 'project_template_not_found', 'phase_not_found', 'team_member_duplicate',
    'team_member_not_found', 'milestone_not_found', 'project_provisioning_rolled_back',
    'unknown_approval_module', 'approval_not_found', 'agent_request_not_found', 'agent_request_forbidden',
    'business_rule_violation', 'ledger_account_not_mapped', 'database_conflict',
    'database_reference_violation', 'database_check_violation', 'invalid_notification_preference',
  ];

  test.each(CONTRACT_CODES)('%s maps to its errors.<code> catalog key', (code) => {
    expect(errorCodeToTranslationKey(code, 400)).toBe(`errors.${code}`);
  });

  test('unknown codes and internal_error keep the generic localized status fallback (never a raw message path)', () => {
    expect(errorCodeToTranslationKey('internal_error', 500)).toBe('errors.serverError');
    expect(errorCodeToTranslationKey('totally_unknown_code', 400)).toBe('errors.requestFailed');
    expect(errorCodeToTranslationKey('totally_unknown_code', 403)).toBe('errors.forbidden');
    expect(errorCodeToTranslationKey('totally_unknown_code', 500)).toBe('errors.serverError');
  });
});

describe('errorMessage rendering helper', () => {
  const t = (key) => ` localized:${key} `;

  test('an ApiError renders through its translation key, never its raw English message', () => {
    const err = new ApiError({ status: 400, code: 'invoice_not_issued', message: 'Money can only be received against an issued invoice.' });
    expect(errorMessage(err, t)).toBe(' localized:errors.invoice_not_issued ');
    expect(errorMessage(err, t)).not.toContain('issued invoice');
  });

  test('a plain local error keeps its own message; null renders empty', () => {
    expect(errorMessage(new Error('Could not load translations: hr'), t)).toBe('Could not load translations: hr');
    expect(errorMessage(null, t)).toBe('');
  });
});
