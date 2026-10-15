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
  return known[code] || (status === 503 ? 'errors.databaseUnavailable' : status === 504 ? 'errors.databaseTimeout' : status === 401 ? 'errors.unauthorized' : status === 403 ? 'errors.forbidden' : status >= 500 ? 'errors.serverError' : 'errors.requestFailed');
}

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

export function apiUrl(path) {
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
