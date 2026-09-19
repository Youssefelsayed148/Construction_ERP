'use strict';

const { canAccessMedia } = require('../../services/mediaAccess');
const clientEngine = require('../../services/clientEngine');

describe('authenticated media access', () => {
  afterEach(() => jest.restoreAllMocks());

  test('rejects unauthenticated users and invalid file names', async () => {
    const q = jest.fn();
    expect(await canAccessMedia(q, null, 'file.pdf')).toBe(false);
    expect(await canAccessMedia(q, { id: 1, role: 'admin' }, '../secret')).toBe(false);
    expect(q).not.toHaveBeenCalled();
  });

  test('allows only approved documents visible to an assigned client', async () => {
    jest.spyOn(clientEngine, 'resolveClientProjects').mockResolvedValue([7]);
    const q = jest.fn(async (sql) => {
      if (sql.includes('uploaded_files')) return { rows: [] };
      if (sql.includes('project_documents')) return { rows: [
        { project_id: 7, status: 'approved', portal_visibility: 'client' },
      ] };
      return { rows: [] };
    });
    expect(await canAccessMedia(q, { id: 11, role: 'client' }, 'drawing.pdf')).toBe(true);
    jest.spyOn(clientEngine, 'resolveClientProjects').mockResolvedValue([8]);
    expect(await canAccessMedia(q, { id: 12, role: 'client' }, 'drawing.pdf')).toBe(false);
  });

  test('lets the uploader retrieve a private upload', async () => {
    const q = jest.fn().mockResolvedValue({ rows: [{ uploaded_by: 4 }] });
    expect(await canAccessMedia(q, { id: 4, role: 'supplier' }, 'quote.pdf')).toBe(true);
  });
});
