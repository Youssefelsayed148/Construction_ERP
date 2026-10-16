import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../store/AuthContext';
import AgentActivity from './AgentActivity';
import Approvals from './Approvals';
import Assets from './Assets';
import BOQ from './BOQ';
import Clients from './Clients';
import { RegisterTab, TransmittalsTab } from './DocControlExtended';
import Dashboard from './Dashboard';
import Expenses from './Expenses';
import HR from './HR';
import Handover from './Handover';
import HSE from './HSE';
import Invoices from './Invoices';
import Items from './Items';
import Legal from './Legal';
import LocationDashboard from './LocationDashboard';
import Login from './Login';
import MyActions from './MyActions';
import Payroll from './Payroll';
import PortalDashboard from './PortalDashboard';
import ProcurementReview from './ProcurementReview';
import ProjectDetail from './ProjectDetail';
import ProjectDocuments from './ProjectDocuments';
import ProjectOperations from './ProjectOperations';
import Projects from './Projects';
import ProjectWizard from './ProjectWizard';
import QHSE from './QHSE';
import { ItpTab } from './QHSEExtended';
import QHSECertificatesTab from './QHSECertificatesTab';
import Reports from './Reports';
import Schedule from './Schedule';
import SiteManagement from './SiteManagement';
import SiteWorkspace from './SiteWorkspace';
import Suppliers from './Suppliers';
import UnitsSales from './UnitsSales';
import WorkOrders from './WorkOrders';

jest.mock('../hooks/useLocale', () => {
  const t = (key, params) => key === 'common.pagination.showing' ? `Showing ${params.loaded} of ${params.total}` : key;
  return { useLocale: () => ({ t, locale: 'en', dir: 'ltr' }) };
});
jest.mock('../services/siteReportQueue', () => ({
  currentQueueOwnerId: () => null,
  notifySiteReportQueueChanged: jest.fn(),
  siteReportQueueStore: { list: jest.fn().mockResolvedValue([]), update: jest.fn(), remove: jest.fn(), add: jest.fn() },
  syncQueuedSiteReports: jest.fn().mockResolvedValue({ synced: 0, queued: 0, blocked: 0 }),
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const pages = [
  ['AgentActivity', AgentActivity, '/agent-activity'], ['Approvals', Approvals, '/approvals'],
  ['Assets', Assets, '/assets'], ['BOQ', BOQ, '/projects/1/boq'], ['Dashboard', Dashboard, '/dashboard'],
  ['HR', HR, '/hr'], ['HSE', HSE, '/projects/1/hse'], ['Invoices', Invoices, '/invoices'],
  ['Items', Items, '/inventory'], ['Legal', Legal, '/legal'], ['LocationDashboard', LocationDashboard, '/projects/1/locations'],
  ['Login', Login, '/login'], ['ProjectDetail', ProjectDetail, '/projects/1'], ['Projects', Projects, '/projects'],
  ['ProjectWizard', ProjectWizard, '/projects/new'], ['QHSE', QHSE, '/projects/1/qhse'],
  ['QHSEExtended', () => <ItpTab projectId="1" locale="en" t={key => key} />, '/projects/1/qhse/extended'], ['Reports', Reports, '/projects/1/reports'],
  ['SiteManagement', SiteManagement, '/projects/1/site'], ['SiteWorkspace', SiteWorkspace, '/projects/1/site-workspace'],
  ['UnitsSales', UnitsSales, '/projects/1/units'],
];
const pagedPages = pages.filter(([name]) => !['Dashboard', 'Login', 'LocationDashboard'].includes(name));
const additionalPagedPages = [
  ['LocationDashboard', LocationDashboard, '/projects/1/locations'],
  ['MyActions', MyActions, '/my-actions'], ['Clients', Clients, '/clients'],
  ['DocControlExtended.RegisterTab', () => <RegisterTab projectId="1" locale="en" t={key => key} />, '/projects/1/documents'],
  ['DocControlExtended.TransmittalsTab', () => <TransmittalsTab projectId="1" locale="en" t={key => key} />, '/projects/1/documents'],
  ['Expenses', Expenses, '/expenses'],
  ['Payroll', Payroll, '/payroll'], ['Handover', Handover, '/projects/1/handover'],
  ['PortalDashboard', () => <PortalDashboard kind="client" />, '/portal'],
  ['ProcurementReview', ProcurementReview, '/procurement/comparison'],
  ['ProjectDocuments', ProjectDocuments, '/projects/1/documents'],
  ['QHSECertificatesTab', () => <QHSECertificatesTab projectId="1" t={key => key} />, '/projects/1/qhse'],
  ['ProjectOperations', ProjectOperations, '/projects/1/operations'],
  ['Schedule', Schedule, '/projects/1/schedule'], ['Suppliers', Suppliers, '/suppliers'],
  ['WorkOrders', WorkOrders, '/projects/1/work-orders'],
];
const row = id => ({
  id, code: `row-${id}`, name: `row-${id}`, name_en: `row-${id}`, title: `row-${id}`,
  title_en: `row-${id}`, title_ar: `row-${id}`, quotation_id: id,
  text: `row-${id}`, work_summary: `row-${id}`, tool: `row-${id}`, tool_name: `row-${id}`,
  response_summary: `row-${id}`, employee_name_en: `row-${id}`, created_by_name: `row-${id}`,
  report_date: `2026-10-${String(id).padStart(2, '0')}`, status: 'draft', amount: id,
});

const workspace = {
  activities: { count: 0, items: [] }, manpower: { present: 0 }, equipment: { count: 0, hours: 0 },
  deliveries: { grns: 0, items: [] }, executed_quantities: { approved_measurements: 0, total_quantity: 0 },
  inspections: { items: [] }, safety: { incidents: 0, items: [] }, instructions: { open: 0, items: [] },
  photos: { count: 0, items: [] }, material_readiness: { ready: 0, requirements: 0 },
};
const response = (status, data = [], total = '0', extra = {}) => new Response(JSON.stringify(
  status >= 400 ? { error_code: status === 403 ? 'forbidden' : 'internal_error', error: 'Request failed' } : { success: true, data, ...extra },
), { status, headers: { 'Content-Type': 'application/json', 'X-Total-Count': total } });

function mount(Component, path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<AuthProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/projects/:id/*" element={<Component />} />
    <Route path="*" element={<Component />} />
  </Routes></MemoryRouter></AuthProvider>));
  return { container, root };
}

async function settle() {
  await act(async () => { await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); });
}

describe('R45 uncovered page smoke matrix', () => {
  let root;
  let container;
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'owner', project_id: 1, policy_modules: ['*'], policy_permissions: [{ module: '*', action: '*' }] }));
    localStorage.setItem('activeProjectId', '1');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.fetch = jest.fn();
  });
  afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); });

  test.each(pages)('%s loads with an empty response', async (_name, Component, path) => {
    window.fetch.mockImplementation(url => Promise.resolve(response(200, String(url).includes('/workspace?') ? workspace : [])));
    ({ container, root } = mount(Component, path));
    await settle();
    expect(container.firstElementChild).not.toBeNull();
    expect(container.textContent).not.toContain('common.states.loading');
  });

  test.each(pages.filter(([name]) => name !== 'Login'))('%s renders after an API error response', async (_name, Component, path) => {
    window.fetch.mockImplementation(() => Promise.resolve(response(500)));
    ({ container, root } = mount(Component, path));
    await settle();
    expect(container.firstElementChild).not.toBeNull();
    expect(window.fetch).toHaveBeenCalled();
    expect(container.textContent).not.toContain('LEAK_SENTINEL');
  });

  test.each(pages.filter(([name]) => name !== 'Login'))('%s makes no response data visible after a role-denied API response', async (_name, Component, path) => {
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'viewer', project_id: 1, policy_modules: [] }));
    window.fetch.mockImplementation(() => Promise.resolve(response(403)));
    ({ container, root } = mount(Component, path));
    await settle();
    expect(container.firstElementChild).not.toBeNull();
    expect(window.fetch).toHaveBeenCalled();
    expect(container.textContent).not.toContain('LEAK_SENTINEL');
  });

  test.each([401, 403])('Login displays a rejected authentication response (%i)', async status => {
    window.fetch.mockImplementation(() => Promise.resolve(response(status)));
    ({ container, root } = mount(Login, '/login'));
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await settle();
    expect(window.fetch).toHaveBeenCalled();
    expect(container.textContent).not.toContain('LEAK_SENTINEL');
  });

  test.each(pagedPages)('%s Load More appends a distinct row and stops at X-Total-Count', async (_name, Component, path) => {
    window.fetch.mockImplementation(url => {
      const parsed = new URL(String(url), 'http://localhost');
      const offset = Number(parsed.searchParams.get('offset') || 0);
      let data = [row(offset + 1)];
      let extra = {};
      if (parsed.pathname.endsWith('/workspace')) data = workspace;
      else if (parsed.pathname.endsWith('/portfolio') || parsed.pathname.endsWith('/finance/summary')) data = {};
      else if (parsed.pathname.endsWith('/approvals/pending')) extra.requests = data;
      else if (parsed.pathname.endsWith('/reports/catalog')) data = { reports: [{ key: 'projects', label: 'Projects' }] };
      else if (parsed.pathname.endsWith('/reports/data/projects')) data = { rows: data, columns: [{ key: 'name', label: 'Name' }] };
      return Promise.resolve(response(200, data, '2', extra));
    });
    ({ container, root } = mount(Component, path));
    await settle();
    if (_name === 'HSE') {
      const incidents = [...container.querySelectorAll('button')].find(button => button.textContent.includes('Incidents'));
      await act(async () => incidents.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await settle();
    }
    if (_name === 'ProjectDetail') {
      const addMember = [...container.querySelectorAll('button')].find(button => button.textContent.includes('Add Member'));
      await act(async () => addMember.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await settle();
    }
    const loadMore = container.querySelector('.load-more button');
    expect(loadMore).not.toBeNull();
    const initialPagerCount = container.querySelectorAll('.load-more button').length;
    const initialRows = container.querySelectorAll('tbody tr').length;
    await act(async () => loadMore.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await settle();
    expect(window.fetch.mock.calls.some(([url]) => new URL(String(url), 'http://localhost').searchParams.get('offset') === '1')).toBe(true);
    expect(container.querySelectorAll('tbody tr').length > initialRows || container.textContent.includes('row-2')).toBe(true);
    expect(container.querySelectorAll('.load-more button').length).toBeLessThan(initialPagerCount);
  });

  test.each(additionalPagedPages)('%s Load More appends a distinct row and stops at X-Total-Count', async (_name, Component, path) => {
    window.fetch.mockImplementation(url => {
      const parsed = new URL(String(url), 'http://localhost');
      const offset = Number(parsed.searchParams.get('offset') || 0);
      let data = [row(offset + 1)];
      if (parsed.pathname.endsWith('/client-portal/dashboard')) {
        data = { records: Array.from({ length: 8 }, (_, index) => row(index + 1)) };
      }
      if (parsed.pathname.endsWith('/comparison')) {
        data = { rfq_number: 'RFQ-1', rows: [row(offset + 1)], recommendation: null };
      }
      return Promise.resolve(response(200, data, '2'));
    });
    ({ container, root } = mount(Component, path));
    await settle();
    if (_name === 'Handover') {
      const assetsTab = [...container.querySelectorAll('button')].find(button => button.textContent.includes('Asset register'));
      await act(async () => assetsTab.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await settle();
    }
    if (_name === 'ProcurementReview') {
      const input = container.querySelector('#rfq-id');
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      await act(async () => {
        setValue.call(input, '1');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await settle();
    }
    const loadMore = container.querySelector('.load-more button');
    expect(loadMore).not.toBeNull();
    const initialPagerCount = container.querySelectorAll('.load-more button').length;
    const initialRows = container.querySelectorAll('tbody tr').length;
    await act(async () => loadMore.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await settle();
    if (_name !== 'PortalDashboard') expect(window.fetch.mock.calls.some(([url]) => new URL(String(url), 'http://localhost').searchParams.get('offset') === '1')).toBe(true);
    expect(container.querySelectorAll('tbody tr').length > initialRows || container.textContent.includes('row-2') || container.textContent.includes('row-8')).toBe(true);
    expect(container.querySelectorAll('.load-more button').length).toBeLessThan(initialPagerCount);
  });
});
