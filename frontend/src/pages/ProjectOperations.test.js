import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectOperations from './ProjectOperations';

jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({
  t: (key) => key,
}) }));
jest.mock('../components/project/ProcurementWorkspace', () => () => <div>procurement workspace</div>);
jest.mock('../components/project/ProjectFinanceWorkbench', () => () => <div>finance workbench</div>);
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('project operations localization', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }));
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); global.fetch = previousFetch; document.documentElement.lang = 'en'; });

  const renderPage = async () => {
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/projects/17/operations']}><Routes>
        <Route path="/projects/:id/operations" element={<ProjectOperations />} />
      </Routes></MemoryRouter>);
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  };

  test('renders translated project operations labels and materials fields', async () => {
    global.fetch = jest.fn(async (url) => ({ ok: true, json: async () => ({ data: String(url).includes('/materials/requirements') ? [{
      id: 1, material_code: 'C35', material_name_en: 'Concrete', required_quantity: 100, issued_quantity: 20,
    }] : String(url).includes('/warehouses') ? [{ id: 2, name_en: 'Main warehouse', name_ar: 'المخزن الرئيسي', project_name_en: 'Tower', project_name_ar: 'البرج' }] : [] }) }));
    await renderPage();

    expect(container.textContent).toContain('projects.operations.title');
    expect(container.textContent).toContain('projects.operations.tabs.materials');
    expect(container.textContent).toContain('projects.operations.fields.material');
    expect(container.textContent).toContain('projects.operations.fields.needDate');
    expect(container.textContent).toContain('Concrete');
    const previousLang = document.documentElement.lang;
    document.documentElement.lang = 'ar';
    await act(async () => { [...container.querySelectorAll('[role="tab"]')].find((button) => button.textContent.includes('projects.operations.tabs.inventory')).click(); });
    expect(container.textContent).toContain('المخزن الرئيسي');
    expect(container.textContent).toContain('البرج');
    document.documentElement.lang = previousLang;
  });

  test('shows a localized load error without exposing raw server text', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/materials/requirements')) throw new Error('raw database detail');
      return { ok: true, json: async () => ({ data: [] }) };
    });
    await renderPage();

    expect(container.textContent).toContain('projects.operations.loadError');
    expect(container.textContent).not.toContain('raw database detail');
  });
});
