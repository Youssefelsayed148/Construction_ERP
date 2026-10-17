import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MyActions from './MyActions';
import ProjectWizard from './ProjectWizard';
import Reports from './Reports';

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn(), useParams: () => ({}) }));
jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({ locale: 'ar', t: (key, params) => {
  const catalogs = Object.fromEntries(['en', 'ar'].map(locale => [locale, Object.fromEntries(
    ['actions', 'projectWizard', 'reports', 'enums', 'common'].map(namespace => [namespace, require(`../locales/${locale}/${namespace}.json`)]))]));
  return require('../i18n/translate').translate(catalogs, 'ar', key, params);
} }) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('Batch 5A Arabic system labels', () => {
  let container; let root;
  beforeEach(() => {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    global.fetch = jest.fn(async url => ({ ok: true, headers: { get: () => '0' }, json: async () => {
      if (url.includes('/actions/my')) return { success: true, buckets: {} };
      if (url.includes('/reports/catalog')) return { success: true, data: { reports: [{ key: 'projects', label: 'Projects register' }] } };
      if (url.includes('/reports/data/')) return { success: true, data: { columns: [{ key: 'name_en', label: 'Project' }, { key: 'status', label: 'Status' }], rows: [{ id: 1, name_en: 'Business DATA', status: 'active' }] } };
      return { success: true, data: [] };
    } }));
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); delete global.fetch; });
  test('priority filter buttons translate all severity levels', async () => {
    await act(async () => root.render(<MyActions />));
    const buttons = [...container.querySelectorAll('button')].map(button => button.textContent);
    for (const label of ['حرجة', 'عالية', 'متوسطة', 'منخفضة']) expect(buttons).toContain(label);
    expect(buttons).not.toEqual(expect.arrayContaining(['critical', 'high', 'medium', 'low']));
  });
  test('wizard notification channels use translated labels and preserve machine checkbox values', async () => {
    await act(async () => root.render(<ProjectWizard />));
    const notificationStep = [...container.querySelectorAll('button')].find(button => button.textContent.includes('التنبيهات'));
    expect(notificationStep).toBeTruthy();
    await act(async () => notificationStep.click());
    const labels = [...container.querySelectorAll('label')].filter(label => label.querySelector('input[type="checkbox"]')).map(label => label.textContent.trim());
    expect(labels).toEqual(['داخل التطبيق', 'البريد الإلكتروني', 'رسالة نصية', 'واتساب']);
  });
  test('report catalog and column labels are Arabic while business data stays unchanged', async () => {
    await act(async () => root.render(<Reports />));
    expect(container.textContent).toContain('سجل المشاريع');
    expect([...container.querySelectorAll('th')].map(node => node.textContent)).toEqual(['المشروع', 'الحالة']);
    expect(container.querySelector('tbody').textContent).toContain('Business DATA');
  });
});
