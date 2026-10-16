import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RoleDashboardSection } from './Dashboard';
import { translate as mockTranslate } from '../i18n/translate';
import mockEn from '../locales/en/dashboard.json';
import mockAr from '../locales/ar/dashboard.json';
import mockEnEnums from '../locales/en/enums.json';
import mockArEnums from '../locales/ar/enums.json';
import { formatNumber } from '../utils/formatters';

jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({ locale: 'ar', dir: 'rtl',
  t: (key, params) => mockTranslate({ en: { dashboard: mockEn, enums: mockEnEnums }, ar: { dashboard: mockAr, enums: mockArEnums } }, 'ar', key, params),
}) }));
jest.mock('react-router-dom', () => ({ Link: ({ children }) => <span>{children}</span> }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('role dashboard system language', () => {
  let container; let root;
  beforeEach(() => { document.documentElement.lang = 'ar'; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); document.documentElement.lang = 'en'; });
  test('CEO widgets show Arabic titles, fields and role, with isolated negative values', () => {
    const widgets = [
      { key: 'portfolio', title: 'Portfolio', data: { projects: 2, active: 1, avg_completion: 50 } },
      { key: 'procurement_exposure', title: 'Procurement exposure', data: { issued_pos: 2, open_commitment: -1250 } },
      { key: 'quality_safety_risks', title: 'Quality & safety risks', data: { open_ncrs: 1, open_punch: 2, open_incidents: 3 } },
      { key: 'financial_position', title: 'Financial position', data: { invoiced: 100, collected: 150, outstanding: -50 } },
    ];
    act(() => root.render(<RoleDashboardSection dash={{ role: 'owner_ceo', widgets }} />));
    expect(container.textContent).not.toMatch(/[A-Za-z_]|⟦/);
    expect(container.textContent).toContain('المالك');
    expect(container.textContent).toContain(mockAr.widgets.financial_position.title);
    expect([...container.querySelectorAll('bdi')].some(node => node.textContent === formatNumber(-50, { locale: 'ar' }))).toBe(true);
    expect(container.querySelector('[dir="rtl"]')).not.toBeNull();
  });
  test('unknown widget keeps its backend English fallback; stored notes are untouched', () => {
    act(() => root.render(<RoleDashboardSection dash={{ role: 'owner_ceo', widgets: [{ key: 'future_widget', title: 'Future fallback', data: {} }], sticky_notes: [{ id: 1, text: 'Owner entered English note', scope: 'personal' }] }} />));
    expect(container.textContent).toContain('Future fallback');
    expect(container.textContent).toContain('Owner entered English note');
    expect(container.textContent).not.toContain('personal');
  });
  test('project-manager source and nested quantity fields stay Arabic', () => {
    act(() => root.render(<RoleDashboardSection dash={{ role: 'project_manager', widgets: [{ key: 'progress', title: 'Progress', data: { avg_percent: 25, source: 'quantities', pending: { measurements: 2, quantity: -12 } } }] }} />));
    expect(container.textContent).not.toMatch(/[A-Za-z_]|⟦|\[object/);
    expect(container.textContent).toContain(mockAr.widgets.fields.measurements);
  });
});
