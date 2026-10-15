import { apiFetch, apiJson, apiResponseJson, errorCodeToTranslationKey, parseTotalCount, ApiError } from './apiClient';

const response = (status, body = {}, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...headers },
});

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear();
    window.fetch = jest.fn();
  });

  test('dispatches session expiry once for an authenticated 401 response', async () => {
    window.fetch.mockResolvedValue(response(401, { error_code: 'unauthorized' }));
    const listener = jest.fn();
    window.addEventListener('api:unauthorized', listener);
    await apiFetch('/api/private');
    window.removeEventListener('api:unauthorized', listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('does not dispatch session expiry for a login 401', async () => {
    window.fetch.mockResolvedValue(response(401, { error_code: 'unauthorized' }));
    const listener = jest.fn();
    window.addEventListener('api:unauthorized', listener);
    await apiFetch('/api/auth/login', { auth: false, redirectOn401: false });
    window.removeEventListener('api:unauthorized', listener);
    expect(listener).not.toHaveBeenCalled();
  });

  test.each([
    [503, 'database_unavailable', 'errors.databaseUnavailable'],
    [504, 'database_timeout', 'errors.databaseTimeout'],
  ])('maps %i responses to a typed retryable error', async (status, code, key) => {
    window.fetch.mockResolvedValue(response(status, { error_code: code, error_params: {} }, { 'Retry-After': '2' }));
    await expect(apiFetch('/api/private')).rejects.toMatchObject({
      status, code, translationKey: key, retryAfter: '2',
    });
  });

  test('preserves AbortError and maps network failures', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    window.fetch.mockRejectedValueOnce(abort);
    await expect(apiFetch('/api/private')).rejects.toBe(abort);
    window.fetch.mockRejectedValueOnce(new TypeError('offline'));
    await expect(apiFetch('/api/private')).rejects.toMatchObject({
      code: 'network_error', translationKey: 'errors.networkError',
    });
  });

  test('maps typed server codes and preserves total count for paging', async () => {
    expect(errorCodeToTranslationKey('project_id_mismatch', 400)).toBe('errors.projectIdMismatch');
    window.fetch.mockResolvedValue(response(200, { rows: [] }, { 'X-Total-Count': '248' }));
    const result = await apiJson('/api/items');
    expect(result.totalCount).toBe(248);
    expect(parseTotalCount(result.headers)).toBe(248);
  });

  test('page response helper exposes total count without changing the body shape', async () => {
    window.fetch.mockResolvedValue(response(200, { success: true, data: [{ id: 1 }] }, { 'X-Total-Count': '201' }));
    const body = await apiResponseJson(await apiFetch('/api/items'));
    expect(body.data).toEqual([{ id: 1 }]);
    expect(body.totalCount).toBe(201);
    expect(Object.keys(body)).not.toContain('totalCount');
  });

  test('throws typed ApiError for JSON endpoint failures', async () => {
    window.fetch.mockResolvedValue(response(400, { error: 'invalid', error_code: 'validation_error' }));
    await expect(apiJson('/api/items')).rejects.toBeInstanceOf(ApiError);
  });
});
