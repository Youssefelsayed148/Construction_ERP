const DB_NAME = 'construction-erp-offline';
const DB_VERSION = 1;
const STORE_NAME = 'site-reports';
const activeSyncs = new Set();

function openDatabase() {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.reject(new Error('Offline storage is unavailable in this browser.'));
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
    request.onblocked = () => reject(new Error('Offline storage is busy in another tab.'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Offline storage request failed.'));
  });
}

async function withStore(mode, callback) {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const completion = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Offline storage transaction failed.'));
      tx.onabort = () => reject(tx.error || new Error('Offline storage transaction was canceled.'));
    });
    const result = await callback(tx.objectStore(STORE_NAME));
    await completion;
    return result;
  } finally {
    db.close();
  }
}

export const siteReportQueueStore = {
  add: (record) => withStore('readwrite', (store) => requestResult(store.add(record))),
  update: (id, patch) => withStore('readwrite', async (store) => {
    const current = await requestResult(store.get(id));
    if (!current) return null;
    const next = { ...current, ...patch, updatedAt: Date.now() };
    await requestResult(store.put(next));
    return next;
  }),
  claim: (id) => withStore('readwrite', async (store) => {
    const current = await requestResult(store.get(id));
    if (!current || current.status !== 'queued') return false;
    await requestResult(store.put({ ...current, status: 'syncing', errorCode: null, updatedAt: Date.now() }));
    return true;
  }),
  remove: (id) => withStore('readwrite', (store) => requestResult(store.delete(id))),
  list: async (ownerId, projectId) => withStore('readonly', async (store) => {
    const all = await requestResult(store.getAll());
    return all.filter((row) => String(row.ownerId) === String(ownerId)
      && String(row.projectId) === String(projectId)).sort((a, b) => a.createdAt - b.createdAt);
  }),
};

export function currentQueueOwnerId() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user?.id == null ? null : String(user.id);
  } catch {
    return null;
  }
}

export function notifySiteReportQueueChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('site-report-queue-updated'));
}

async function readResponse(response) {
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

export async function syncQueuedSiteReports({
  ownerId, projectId, token, storage = siteReportQueueStore,
  fetchImpl = window.fetch, apiUrl = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`,
}) {
  if (!ownerId || !token || !fetchImpl || navigator.onLine === false) return { synced: 0, queued: 0, blocked: 0 };
  const items = await storage.list(ownerId, projectId);
  let synced = 0; let queued = 0; let blocked = 0;

  for (const item of items) {
    if (item.status === 'syncing' && Date.now() - item.updatedAt > 120000) {
      await storage.update(item.id, { status: 'queued', errorCode: null });
      item.status = 'queued';
    }
    if (item.status !== 'queued' || activeSyncs.has(item.id)) continue;
    if (item.nextAttemptAt && item.nextAttemptAt > Date.now()) continue;
    activeSyncs.add(item.id);
    try {
      const claimed = storage.claim
        ? await storage.claim(item.id)
        : (await storage.update(item.id, { status: 'syncing', errorCode: null }), true);
      if (!claimed) continue;
      notifySiteReportQueueChanged();
      let photos = item.photos || [];
      if (item.files?.length) {
        const formData = new FormData();
        item.files.forEach((file) => formData.append('files', file, file.name));
        const uploaded = await fetchImpl(`${apiUrl}/documents/upload`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
        });
        const uploadResult = await readResponse(uploaded);
        if (!uploadResult.response.ok || !uploadResult.body.success) {
          const error = new Error(uploadResult.body.error || 'Upload failed');
          error.status = uploadResult.response.status;
          error.code = uploadResult.body.error_code || uploadResult.body.code;
          throw error;
        }
        photos = uploadResult.body.data || [];
        await storage.update(item.id, { photos, files: [] });
      }

      const response = await fetchImpl(`${apiUrl}/projects/${item.projectId}/site-reports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': item.idempotencyKey },
        body: JSON.stringify({ ...item.payload, photos }),
      });
      const result = await readResponse(response);
      if (!result.response.ok || !result.body.success) {
        const error = new Error(result.body.error || 'Report sync failed');
        error.status = result.response.status;
        error.code = result.body.error_code;
        throw error;
      }
      await storage.remove(item.id);
      synced += 1;
    } catch (error) {
      const isNetworkError = error instanceof TypeError || navigator.onLine === false;
      const status = Number(error.status || 0);
      const nextStatus = isNetworkError ? 'queued' : status === 409 ? 'conflict' : 'failed';
      const attempts = (item.attempts || 0) + 1;
      await storage.update(item.id, {
        status: nextStatus,
        errorCode: error.code || (isNetworkError ? 'offline' : 'sync_failed'),
        attempts,
        nextAttemptAt: nextStatus === 'queued' ? Date.now() + Math.min(300000, 1000 * (2 ** Math.min(attempts, 8))) : null,
      });
      if (nextStatus === 'queued') queued += 1;
      else blocked += 1;
    } finally {
      activeSyncs.delete(item.id);
    }
  }
  notifySiteReportQueueChanged();
  return { synced, queued, blocked };
}
