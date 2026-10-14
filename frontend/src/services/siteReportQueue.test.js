import { currentQueueOwnerId, siteReportQueueStore, syncQueuedSiteReports } from './siteReportQueue';

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function createStorage(initial) {
  const rows = new Map(initial.map((row) => [row.id, { ...row }]));
  return {
    rows,
    list: jest.fn(async (ownerId, projectId) => [...rows.values()].filter((row) => row.ownerId === ownerId && row.projectId === projectId)),
    update: jest.fn(async (id, patch) => { const next = { ...rows.get(id), ...patch, updatedAt: Date.now() }; rows.set(id, next); return next; }),
    remove: jest.fn(async (id) => rows.delete(id)),
  };
}

function createFakeIndexedDB() {
  const data = new Map();
  const storeApi = {
    add: (row) => request(() => { data.set(row.id, row); return row.id; }),
    put: (row) => request(() => { data.set(row.id, row); return row.id; }),
    get: (id) => request(() => data.get(id)),
    getAll: () => request(() => [...data.values()]),
    delete: (id) => request(() => data.delete(id)),
  };
  function request(run) {
    const result = { onsuccess: null, onerror: null };
    setTimeout(() => {
      try { result.result = run(); result.onsuccess?.(); } catch (error) { result.error = error; result.onerror?.(); }
    }, 0);
    return result;
  }
  const names = new Set();
  const db = {
    objectStoreNames: { contains: (name) => names.has(name) },
    createObjectStore: (name) => { names.add(name); return storeApi; },
    transaction: () => {
      const tx = { oncomplete: null, onerror: null, onabort: null, error: null, objectStore: () => storeApi };
      setTimeout(() => tx.oncomplete?.(), 5);
      return tx;
    },
    close: jest.fn(),
  };
  return {
    open: () => {
      const openRequest = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: db };
      setTimeout(() => { openRequest.onupgradeneeded?.(); openRequest.onsuccess?.(); }, 0);
      return openRequest;
    },
  };
}

const item = (overrides = {}) => ({
  id: 'report-1', ownerId: 'user-7', projectId: '42', status: 'queued', idempotencyKey: 'retry-key',
  payload: { report_date: '2026-10-14', work_summary: 'Poured slab', measurements: [{ project_location_id: 2, boq_item_id: 5, quantity: 3, unit: 'm3' }] },
  photos: [], files: [], createdAt: 1, updatedAt: 1, ...overrides,
});

describe('offline site-report queue', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(global, 'indexedDB', { configurable: true, value: createFakeIndexedDB() });
  });

  test('scopes locally stored reports to the authenticated user', () => {
    localStorage.setItem('user', JSON.stringify({ id: 7 }));
    expect(currentQueueOwnerId()).toBe('7');
    localStorage.setItem('user', '{invalid');
    expect(currentQueueOwnerId()).toBeNull();
  });

  test('persists local reports in IndexedDB and lists only the same user and project', async () => {
    await siteReportQueueStore.add(item());
    await siteReportQueueStore.add(item({ id: 'other-user', ownerId: 'user-8' }));
    await siteReportQueueStore.add(item({ id: 'other-project', projectId: '43' }));
    expect(await siteReportQueueStore.list('user-7', '42')).toHaveLength(1);
    await siteReportQueueStore.update('report-1', { status: 'failed' });
    expect((await siteReportQueueStore.list('user-7', '42'))[0].status).toBe('failed');
    await siteReportQueueStore.remove('report-1');
    expect(await siteReportQueueStore.list('user-7', '42')).toHaveLength(0);
  });

  test('uploads queued photos, sends measurements with the same idempotency key, then removes the item', async () => {
    const storage = createStorage([item({ files: [new File(['photo'], 'site.jpg', { type: 'image/jpeg' })] })]);
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response(201, { success: true, data: [{ file_url: '/uploads/site.jpg', original_name: 'site.jpg' }] }))
      .mockResolvedValueOnce(response(201, { success: true, data: { id: 99 } }));

    const result = await syncQueuedSiteReports({ ownerId: 'user-7', projectId: '42', token: 'test-token', storage, fetchImpl, apiUrl: '/api' });

    expect(result).toEqual({ synced: 1, queued: 0, blocked: 0 });
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/documents/upload');
    expect(fetchImpl.mock.calls[1][1].headers['Idempotency-Key']).toBe('retry-key');
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toMatchObject({
      report_date: '2026-10-14', measurements: [{ boq_item_id: 5, quantity: 3 }], photos: [{ file_url: '/uploads/site.jpg' }],
    });
    expect(storage.remove).toHaveBeenCalledWith('report-1');
  });

  test('keeps a network failure queued with the same key for retry', async () => {
    const storage = createStorage([item()]);
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await syncQueuedSiteReports({ ownerId: 'user-7', projectId: '42', token: 'test-token', storage, fetchImpl, apiUrl: '/api' });

    expect(result).toEqual({ synced: 0, queued: 1, blocked: 0 });
    expect(storage.rows.get('report-1')).toMatchObject({ status: 'queued', errorCode: 'offline', attempts: 1, idempotencyKey: 'retry-key' });
    expect(storage.rows.get('report-1').nextAttemptAt).toBeGreaterThan(Date.now());
  });

  test('does not sync a queued report before its backoff window expires', async () => {
    const storage = createStorage([item({ nextAttemptAt: Date.now() + 60000 })]);
    const fetchImpl = jest.fn();

    const result = await syncQueuedSiteReports({ ownerId: 'user-7', projectId: '42', token: 'test-token', storage, fetchImpl, apiUrl: '/api' });

    expect(result).toEqual({ synced: 0, queued: 0, blocked: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(storage.rows.get('report-1').status).toBe('queued');
  });

  test('keeps a 409 report conflict visible instead of retrying it automatically', async () => {
    const storage = createStorage([item()]);
    const fetchImpl = jest.fn().mockResolvedValue(response(409, { success: false, error_code: 'idempotency_key_reuse' }));

    const result = await syncQueuedSiteReports({ ownerId: 'user-7', projectId: '42', token: 'test-token', storage, fetchImpl, apiUrl: '/api' });

    expect(result).toEqual({ synced: 0, queued: 0, blocked: 1 });
    expect(storage.rows.get('report-1')).toMatchObject({ status: 'conflict', errorCode: 'idempotency_key_reuse' });
  });
});
