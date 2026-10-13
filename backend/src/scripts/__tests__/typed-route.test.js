const { typedFail } = require('../../utils/typedRoute');

function response() {
  return {
    statusCode: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('typed route error boundary', () => {
  test('untyped errors are logged and returned as a generic correlated error', () => {
    const res = response();
    const detail = new Error('postgres password or SQL detail must not leak');
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    typedFail(res, detail, 'TEST', { correlationId: 'request-123' });
    expect(res.statusCode).toBe(500);
    expect(res.headers['X-Request-ID']).toBe('request-123');
    expect(res.body.error).toBe('The request could not be completed');
    expect(res.body.error_params.request_id).toBe('request-123');
    expect(JSON.stringify(res.body)).not.toContain(detail.message);
    expect(log).toHaveBeenCalledWith('[TEST] request_id=request-123', detail);
    log.mockRestore();
  });

  test('PostgreSQL constraints become stable typed errors without constraint details', () => {
    const duplicate = response();
    typedFail(duplicate, { code: '23505', detail: 'private constraint detail' });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.body.error_code).toBe('database_conflict');
    expect(JSON.stringify(duplicate.body)).not.toContain('private constraint detail');

    const reference = response();
    typedFail(reference, { code: '23503', constraint: 'private_fk_name' });
    expect(reference.statusCode).toBe(400);
    expect(reference.body.error_code).toBe('database_reference_violation');
    expect(JSON.stringify(reference.body)).not.toContain('private_fk_name');
  });

  test('known typed errors preserve their stable code and parameters', () => {
    const res = response();
    typedFail(res, { status: 422, error_code: 'amount_invalid', error_params: { max: 10 }, message: 'Amount exceeds limit' });
    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({ error_code: 'amount_invalid', error_params: { max: 10 } });
  });
});
