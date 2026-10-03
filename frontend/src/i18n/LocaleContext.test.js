import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider, useLocale } from './LocaleContext';
import { _resetCatalogCache } from './catalog';

global.IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ label }) {
  const { t, locale, isRTL, setLocale } = useLocale();
  return (
    <div data-testid={label}>
      <span className="text">{t('common.save')}</span>
      <span className="locale">{locale}</span>
      <span className="rtl">{String(isRTL)}</span>
      <button className="toggle" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')} />
    </div>
  );
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('LocaleProvider', () => {
  let container; let root;
  const mount = async (ui) => {
    await act(async () => { root.render(ui); });
    await flush();
  };
  beforeEach(() => {
    _resetCatalogCache();
    window.localStorage.clear();
    document.documentElement.lang = ''; document.documentElement.dir = '';
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const text = (id) => container.querySelector(`[data-testid="${id}"] .text`).textContent;
  const loc = (id) => container.querySelector(`[data-testid="${id}"] .locale`).textContent;

  test('defaults to Arabic, sets lang and dir, and renders translated text', async () => {
    await mount(<LocaleProvider><Probe label="a" /></LocaleProvider>);
    expect(loc('a')).toBe('ar');
    expect(text('a')).toBe('حفظ');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  test('one toggle updates EVERY mounted consumer at once, with lang/dir and no reload', async () => {
    await mount(<LocaleProvider><Probe label="shell" /><Probe label="page" /></LocaleProvider>);
    await act(async () => { container.querySelector('[data-testid="shell"] .toggle').click(); });
    await flush();
    expect(loc('shell')).toBe('en');
    expect(loc('page')).toBe('en');
    expect(text('page')).toBe('Save');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(container.querySelector('[data-testid="page"] .rtl').textContent).toBe('false');
  });

  test('the choice is persisted and restored on the next mount', async () => {
    await mount(<LocaleProvider><Probe label="a" /></LocaleProvider>);
    await act(async () => { container.querySelector('.toggle').click(); });
    await flush();
    expect(window.localStorage.getItem('locale')).toBe('en');
    act(() => root.unmount());
    root = createRoot(container);
    await mount(<LocaleProvider><Probe label="b" /></LocaleProvider>);
    expect(loc('b')).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  test('an invalid stored value falls back to the default', async () => {
    window.localStorage.setItem('locale', 'klingon');
    await mount(<LocaleProvider><Probe label="a" /></LocaleProvider>);
    expect(loc('a')).toBe('ar');
    expect(document.documentElement.lang).toBe('ar');
  });

  test('a change made in another tab is followed', async () => {
    await mount(<LocaleProvider><Probe label="a" /></LocaleProvider>);
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'locale', newValue: 'en' }));
    });
    await flush();
    expect(loc('a')).toBe('en');
  });

  test('useLocale outside a provider fails loudly', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => act(() => root.render(<Probe label="x" />))).toThrow(/LocaleProvider/);
    spy.mockRestore();
  });
});
