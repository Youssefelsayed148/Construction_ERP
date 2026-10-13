import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import store from '../../store';
import { LocaleProvider } from '../../i18n/LocaleContext';
import { _resetCatalogCache } from '../../i18n/catalog';
import { toEnumKey, translateEnum, translateRole } from '../../i18n/enums';
import Layout from './Layout';
import Settings from '../../pages/Settings';
import { accountMappingsApi } from '../../services/api';
import { LoadingState, EmptyState, ErrorState, BackIcon, NextIcon } from '../common/States';
import ConfirmDialog from '../common/ConfirmDialog';
import TextEntryDialog from '../common/TextEntryDialog';

let mockUser = { name: 'Tester', role: 'owner', policy_modules: ['*'] };
jest.mock('../../services/api', () => ({
  authService: { getCurrentUser: () => mockUser, clearSession: jest.fn() },
  accountMappingsApi: { getAll: jest.fn().mockResolvedValue({ data: { mappings: [], accounts: [] } }), update: jest.fn(), confirmMapping: jest.fn() },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const ALLOWED_LATIN = /ConERP|EN/g; // brand name and the language-switch label

describe('application shell in Arabic', () => {
  let container; let root;
  const mount = async (ui) => {
    await act(async () => { root.render(ui); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  };
  const shell = (path = '/') => (
    <LocaleProvider initialLocale="ar">
      <Provider store={store}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<p>صفحة</p>} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>
    </LocaleProvider>
  );
  // Everything a user (or screen reader) can read from the shell.
  const readable = () => {
    const attrs = [...container.querySelectorAll('[aria-label],[title],[alt]')]
      .flatMap((el) => [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('alt')]).filter(Boolean);
    return `${container.textContent} ${attrs.join(' ')}`.replace(ALLOWED_LATIN, '');
  };

  beforeEach(() => {
    _resetCatalogCache(); window.localStorage.clear();
    accountMappingsApi.getAll.mockResolvedValue({ data: { mappings: [], accounts: [] } });
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); mockUser = { name: 'Tester', role: 'owner', policy_modules: ['*'] }; });

  test.each(['owner', 'admin', 'consultant', 'client', 'subcontractor', 'supplier'])('%s: no unconditional English in the shell', async (role) => {
    mockUser = { name: 'محمد', role, policy_modules: ['*'] };
    await mount(shell());
    expect(container.querySelectorAll('.nav-item').length).toBeGreaterThan(0);
    expect(readable()).not.toMatch(/[A-Za-z]/);
  });

  test('the Procurement comparison and Agent Activity links are translated (they were English in Arabic mode)', async () => {
    mockUser = { name: 'Tester', role: 'owner', policy_modules: ['*'], policy_permissions: [{ module: '*', action: '*' }] };
    await mount(shell());
    const labels = [...container.querySelectorAll('.nav-item span')].map((n) => n.textContent);
    expect(labels).toContain('مقارنة المشتريات');
    expect(labels).toContain('نشاط الوكلاء');
  });

  test('navigation follows effective module and action grants, including an empty grant set', async () => {
    mockUser = {
      name: 'Tester', role: 'project_manager',
      policy_modules: ['projects', 'procurement'],
      policy_permissions: [
        { module: 'projects', action: 'view' },
        { module: 'procurement', action: 'create' },
      ],
    };
    await mount(shell());
    expect(container.querySelector('a[href="/projects"]')).not.toBeNull();
    expect(container.querySelector('a[href="/procurement/comparison"]')).toBeNull();
    expect(container.querySelector('a[href="/inventory"]')).toBeNull();

    mockUser = { name: 'Tester', role: 'project_manager', policy_modules: [], policy_permissions: [] };
    await mount(shell());
    expect(container.querySelectorAll('.sidebar-nav .nav-item')).toHaveLength(0);
  });

  test('the role is shown translated while the role code is untouched', async () => {
    mockUser = { name: 'محمد', role: 'project_manager', policy_modules: ['*'] };
    await mount(shell());
    expect(container.querySelector('.user-role-sidebar').textContent).toBe('مدير مشروع');
  });

  test('the offline banner and account-mapping Settings page are translated', async () => {
    mockUser = { name: 'محمد', role: 'owner', policy_modules: ['*'] };
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await mount(shell('/settings'));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    expect(container.querySelector('.offline-banner').textContent).toContain('غير متصل');
    expect(container.querySelector('h1').textContent).toBe('ربط الحسابات بدليل الحسابات');
    expect(readable()).not.toMatch(/[A-Za-z]/);
  });

  test('owners see provisional account state and may save or confirm a mapping', async () => {
    mockUser = { name: 'Finance owner', role: 'owner', policy_modules: ['*'] };
    accountMappingsApi.getAll.mockResolvedValue({ data: {
      mappings: [{ key: 'client_retention_receivable', account_id: 1, purpose_en: 'Client retention receivable', purpose_ar: 'مستحقات ضمان العميل', is_provisional: true }],
      accounts: [{ id: 1, code: '1100', name_en: 'Receivable', name_ar: 'الذمم المدينة' }, { id: 2, code: '1190', name_en: 'Retention', name_ar: 'ضمان العميل' }],
    } });
    accountMappingsApi.update.mockResolvedValue({ success: true });
    accountMappingsApi.confirmMapping.mockResolvedValue({ success: true });
    await mount(shell('/settings'));
    expect(container.querySelector('.badge-warning').textContent).toBe('مؤقت / غير مؤكد');
    const select = container.querySelector('select');
    await act(async () => { select.value = '2'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    const buttons = [...container.querySelectorAll('button')];
    await act(async () => { buttons.find((button) => button.textContent === 'حفظ').click(); });
    expect(accountMappingsApi.update).toHaveBeenCalledWith('client_retention_receivable', 2);
    await act(async () => { buttons.find((button) => button.textContent === 'تأكيد الربط').click(); });
    expect(accountMappingsApi.confirmMapping).toHaveBeenCalledWith('client_retention_receivable');
  });

  test('tooltips and aria-labels of the footer controls follow the locale', async () => {
    await mount(shell());
    expect(container.querySelector('.locale-toggle').getAttribute('title')).toBe('تغيير اللغة');
    expect(container.querySelector('.logout-btn').getAttribute('aria-label')).toBe('تسجيل الخروج');
    expect(container.querySelector('.mobile-menu-button').getAttribute('aria-label')).toBe('فتح القائمة');
  });
});

describe('shared states, dialog and directional icons', () => {
  let container; let root;
  const mount = async (ui, locale) => {
    await act(async () => { root.render(<LocaleProvider key={locale} initialLocale={locale}>{ui}</LocaleProvider>); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  };
  beforeEach(() => {
    _resetCatalogCache(); window.localStorage.clear();
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  test('loading, empty and error states use catalog text in both languages', async () => {
    await mount(<><LoadingState /><EmptyState /><EmptyState filtered /><ErrorState onRetry={() => {}} /></>, 'ar');
    expect(container.textContent).toContain('جارٍ التحميل');
    expect(container.textContent).toContain('لا يوجد ما يمكن عرضه');
    expect(container.textContent).toContain('لا توجد نتائج مطابقة');
    expect(container.textContent).toContain('إعادة المحاولة');
    await mount(<><LoadingState /><ErrorState onRetry={() => {}} /></>, 'en');
    expect(container.textContent).toContain('Loading');
    expect(container.textContent).toContain('Try again');
  });

  test('ConfirmDialog is an accessible dialog with translated buttons and calls back', async () => {
    const onConfirm = jest.fn(); const onCancel = jest.fn();
    await mount(<ConfirmDialog open message="سيتم الحذف" destructive onConfirm={onConfirm} onCancel={onCancel} />, 'ar');
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(container.textContent).toContain('يرجى التأكيد');
    const [cancel, confirm] = container.querySelectorAll('.modal-footer button');
    expect(cancel.textContent).toBe('إلغاء');
    act(() => confirm.click());
    expect(onConfirm).toHaveBeenCalled();
    act(() => cancel.click());
    expect(onCancel).toHaveBeenCalled();
  });

  test('ConfirmDialog requires the exact typed value when configured', async () => {
    const onConfirm = jest.fn();
    await mount(<ConfirmDialog open requireText="Asset 42" onConfirm={onConfirm} onCancel={() => {}} />, 'en');
    const confirm = container.querySelector('.modal-footer button:last-child');
    expect(confirm.disabled).toBe(true);
    const input = container.querySelector('#confirm-dialog-text');
    const setInputValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => { setInputValue.call(input, 'Asset 4'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(confirm.disabled).toBe(true);
    act(() => { setInputValue.call(input, 'Asset 42'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(confirm.disabled).toBe(false);
    act(() => confirm.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('TextEntryDialog validates required text and submits a trimmed value', async () => {
    const onSubmit = jest.fn();
    await mount(<TextEntryDialog open title="Save view" label="View name" onSubmit={onSubmit} onCancel={() => {}} />, 'en');
    const form = container.querySelector('form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(container.textContent).toContain('This field is required.');
    const input = container.querySelector('#text-entry-dialog-value');
    const setInputValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setInputValue.call(input, '  My view  ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith('My view');
  });

  test('TextEntryDialog applies field-specific validation before submit', async () => {
    const onSubmit = jest.fn();
    await mount(<TextEntryDialog open title="Contract unit" label="Sold amount" type="number" validate={(value) => Number(value) >= 0 ? '' : 'Amount must be non-negative'} onSubmit={onSubmit} onCancel={() => {}} />, 'en');
    const form = container.querySelector('form');
    const input = container.querySelector('#text-entry-dialog-value');
    const setInputValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setInputValue.call(input, '-1'); input.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain('Amount must be non-negative');
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => {
      setInputValue.call(input, '12.5'); input.dispatchEvent(new Event('input', { bubbles: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith('12.5');
  });

  test('back and next arrows mirror in RTL and are not mirrored in LTR', async () => {
    await mount(<><BackIcon data-testid="back" /><NextIcon data-testid="next" /></>, 'ar');
    const arrowsAr = [...container.querySelectorAll('svg')].map((s) => s.getAttribute('class'));
    await mount(<><BackIcon data-testid="back" /><NextIcon data-testid="next" /></>, 'en');
    const arrowsEn = [...container.querySelectorAll('svg')].map((s) => s.getAttribute('class'));
    expect(arrowsAr[0]).toContain('arrow-right');
    expect(arrowsAr[1]).toContain('arrow-left');
    expect(arrowsEn[0]).toContain('arrow-left');
    expect(arrowsEn[1]).toContain('arrow-right');
  });
});

describe('enum helpers', () => {
  test('toEnumKey camel-cases machine values', () => {
    expect(toEnumKey('pending_approval')).toBe('pendingApproval');
    expect(toEnumKey('in-progress')).toBe('inProgress');
    expect(toEnumKey('PendingApproval')).toBe('pendingApproval');
    expect(toEnumKey('site_supervisor')).toBe('siteSupervisor');
    expect(toEnumKey('open')).toBe('open');
  });

  test('translateEnum renders through the catalog and shows an unknown value as stored, never as a guessed sentence', () => {
    const t = (key, params) => ({ 'enums.role.siteSupervisor': 'مشرف موقع' }[key] || (params && params.defaultValue));
    expect(translateRole(t, 'site_supervisor')).toBe('مشرف موقع');
    expect(translateEnum(t, 'status', 'some_new_status')).toBe('some_new_status');
    expect(translateEnum(t, 'status', null)).toBe('');
  });
});
