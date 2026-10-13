'use strict';

const { canAccessMedia } = require('../../services/mediaAccess');
const clientEngine = require('../../services/clientEngine');
const consultantEngine = require('../../services/consultantEngine');

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

  test('an explicit portal audience does not override confidential classification', async () => {
    jest.spyOn(clientEngine, 'resolveClientProjects').mockResolvedValue([7]);
    const q = jest.fn(async (sql) => {
      if (sql.includes('uploaded_files')) return { rows: [] };
      if (sql.includes('project_documents')) return { rows: [
        { project_id: 7, status: 'approved', portal_visibility: 'client', confidentiality: 'confidential' },
      ] };
      return { rows: [] };
    });
    expect(await canAccessMedia(q, { id: 14, role: 'client' }, 'restricted-drawing.pdf')).toBe(false);
  });

  test('lets the uploader retrieve a private upload', async () => {
    const q = jest.fn().mockResolvedValue({ rows: [{ uploaded_by: 4 }] });
    expect(await canAccessMedia(q, { id: 4, role: 'supplier' }, 'quote.pdf')).toBe(true);
  });

  test('does not expose an unapproved project photo to an assigned client', async () => {
    jest.spyOn(clientEngine, 'resolveClientProjects').mockResolvedValue([7]);
    const q = jest.fn(async (sql) => {
      if (sql.includes('uploaded_files')) return { rows: [] };
      if (sql.includes('project_documents')) return { rows: [] };
      if (sql.includes('photos')) return { rows: [{ project_id: 7 }] };
      return { rows: [] };
    });
    expect(await canAccessMedia(q, { id: 12, role: 'client' }, 'site-photo.jpg')).toBe(false);
    expect(q).not.toHaveBeenCalledWith(expect.stringContaining('photos'), expect.anything());
  });

  test('consultants can access observation evidence only within their assigned organization and project', async () => {
    jest.spyOn(consultantEngine, 'resolveConsultantProjects').mockResolvedValue([7]);
    const q = jest.fn(async (sql) => {
      if (sql.includes('uploaded_files')) return { rows: [] };
      if (sql.includes('organization_users')) return { rows: [{ organization_id: 5, is_active: true }] };
      if (sql.includes('photos')) return { rows: [{ project_id: 7, organization_id: 5 }] };
      if (sql.includes('project_documents')) return { rows: [] };
      return { rows: [] };
    });
    expect(await canAccessMedia(q, { id: 20, role: 'consultant' }, 'before.jpg')).toBe(true);
    q.mockImplementation(async (sql) => {
      if (sql.includes('uploaded_files')) return { rows: [] };
      if (sql.includes('organization_users')) return { rows: [{ organization_id: 5, is_active: true }] };
      if (sql.includes('photos')) return { rows: [{ project_id: 8, organization_id: 5 }] };
      if (sql.includes('project_documents')) return { rows: [] };
      return { rows: [] };
    });
    expect(await canAccessMedia(q, { id: 20, role: 'consultant' }, 'before.jpg')).toBe(false);
  });

  test('requires internal users to have policy access to the project that owns the media', async () => {
    const q = jest.fn(async (sql) => {
      if (sql.includes('uploaded_files')) return { rows: [] };
      if (sql.includes('project_documents')) return { rows: [{ project_id: 7 }] };
      return { rows: [] };
    });
    const check = jest.fn().mockResolvedValue({ allowed: false });
    expect(await canAccessMedia(q, { id: 3, role: 'admin' }, 'restricted.pdf', null, check)).toBe(false);
    expect(check).toHaveBeenCalledWith({ user: { id: 3, role: 'admin' }, module: 'docs', action: 'view', projectId: 7 }, { query: q });
    check.mockResolvedValue({ allowed: true });
    expect(await canAccessMedia(q, { id: 3, role: 'admin' }, 'restricted.pdf', null, check)).toBe(true);
  });
});
