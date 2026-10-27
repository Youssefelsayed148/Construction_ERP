const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const API_URL = `${API_BASE_URL}/api`;

export class ApiError extends Error {
  constructor({ status = 0, code, message, params = {}, data, retryAfter, totalCount }) {
    super(message || 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || (status === 503 ? 'database_unavailable' : status === 504 ? 'database_timeout' : 'request_failed');
    this.translationKey = errorCodeToTranslationKey(this.code, status);
    this.params = params;
    this.data = data;
    this.retryAfter = retryAfter;
    this.totalCount = totalCount;
  }
}

export function errorCodeToTranslationKey(code, status) {
  const known = {
    database_unavailable: 'errors.databaseUnavailable',
    database_timeout: 'errors.databaseTimeout',
    network_error: 'errors.networkError',
    rate_limit_unavailable: 'errors.rateLimitUnavailable',
    rate_limited: 'errors.rateLimited',
    validation_error: 'errors.validation_error',
    forbidden: 'errors.forbidden',
    unauthorized: 'errors.unauthorized',
    project_id_mismatch: 'errors.projectIdMismatch',
    invalid_project_id: 'errors.invalidProjectId',
  };
  // C2: snake_case backend error codes map by convention to errors.<code> keys
  // (locales/en/errors.json + locales/ar/errors.json). Only codes with a
  // catalog entry resolve specifically; anything else keeps the generic
  // localized status fallback so no raw server English is ever rendered.
  if (!known[code] && typeof code === 'string' && /^[a-z][a-z0-9_]*$/.test(code) && SNAKE_CASE_ERROR_CODES.has(code)) {
    return `errors.${code}`;
  }
  return known[code] || (status === 503 ? 'errors.databaseUnavailable' : status === 504 ? 'errors.databaseTimeout' : status === 401 ? 'errors.unauthorized' : status === 403 ? 'errors.forbidden' : status >= 500 ? 'errors.serverError' : 'errors.requestFailed');
}

// The C2 error contract catalog (locales/*/errors.json). Kept explicit so an
// unknown or misspelled code falls back to the generic localized message
// instead of a missing key.
export const SNAKE_CASE_ERROR_CODES = new Set([
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
  'supplier_invoice_duplicate', 'supplier_invoice_not_approvable', 'cancel_reason_required',
  'reason_required', 'commitment_not_found', 'commitment_cancelled', 'commitment_unchanged',
  'record_not_found', 'invalid_state', 'insufficient_stock', 'invalid_input', 'amount_exceeds_limit',
  'not_authorized_for_action',
]);

function withAuthHeaders(options) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Authorization')) {
    const token = localStorage.getItem('token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  const bodyIsForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body != null && !bodyIsForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return headers;
}

async function readError(response) {
  try { return await response.clone().json(); } catch { return {}; }
}

export async function apiFetch(input, options = {}) {
  const { auth = true, redirectOn401 = true, ...fetchOptions } = options;
  if (!auth) fetchOptions.headers = new Headers(fetchOptions.headers || {});
  else fetchOptions.headers = withAuthHeaders(fetchOptions);
  let response;
  try {
    response = await fetch(input, fetchOptions);
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    throw new ApiError({ code: 'network_error', message: error?.message, status: 0 });
  }

  if (response.status === 401 && redirectOn401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('api:unauthorized'));
  }
  if (response.status === 503 || response.status === 504) {
    const data = await readError(response);
    throw new ApiError({
      status: response.status,
      code: data.error_code,
      message: data.error,
      params: data.error_params,
      data,
      retryAfter: response.headers.get('Retry-After'),
      totalCount: parseTotalCount(response.headers),
    });
  }
  return response;
}

export async function apiJson(input, options = {}) {
  const response = await apiFetch(input, options);
  let data;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: data?.error_code,
      message: data?.error,
      params: data?.error_params,
      data,
      retryAfter: response.headers.get('Retry-After'),
      totalCount: parseTotalCount(response.headers),
    });
  }
  return { data, status: response.status, headers: response.headers, totalCount: parseTotalCount(response.headers) };
}

export function parseTotalCount(headers) {
  const value = headers?.get?.('X-Total-Count');
  if (value == null || value === '') return null;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

// Preserve the existing JSON response shape while making the pagination
// header available to page-level helpers that still consume a Response.
export async function apiResponseJson(response) {
  const data = await response.json();
  const totalCount = parseTotalCount(response.headers);
  if (data && typeof data === 'object' && totalCount != null) {
    Object.defineProperty(data, 'totalCount', { value: totalCount, configurable: true });
  }
  return data;
}

export function apiUrl(path) {
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
