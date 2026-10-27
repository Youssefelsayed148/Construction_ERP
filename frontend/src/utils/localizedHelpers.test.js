import { localizedName, pickByLocale } from './formatters';
import { otherLocale, LOCALE_BADGE, FORMAT_LOCALE } from '../i18n/config';
import en from '../locales/en/enums.json';
import ar from '../locales/ar/enums.json';

describe('F4 shared localization helpers replace inline en/ar branches', () => {
  test('pickByLocale prefers the active locale and never renders blank when only one side is filled', () => {
    expect(pickByLocale('ar', 'Cairo', 'القاهرة')).toBe('القاهرة');
    expect(pickByLocale('en', 'Cairo', 'القاهرة')).toBe('Cairo');
    expect(pickByLocale('ar', 'Cairo', '')).toBe('Cairo');
    expect(pickByLocale('en', undefined, 'القاهرة')).toBe('القاهرة');
  });

  test('localizedName handles a prefixed pair and the bare fallback, and a missing record', () => {
    const wo = { title_en: 'Slab', title_ar: 'بلاطة', phase_name: 'Phase 1' };
    expect(localizedName(wo, 'ar', 'title')).toBe('بلاطة');
    expect(localizedName(wo, 'en', 'title')).toBe('Slab');
    expect(localizedName(wo, 'ar', 'phase_name')).toBe('Phase 1');
    expect(localizedName(undefined, 'ar')).toBe('');
  });

  test('locale switch helpers', () => {
    expect(otherLocale('ar')).toBe('en');
    expect(otherLocale('en')).toBe('ar');
    expect(LOCALE_BADGE[otherLocale('ar')]).toBe('EN');
    expect(FORMAT_LOCALE.ar).toBe('ar-EG');
  });

  test('every handover lifecycle state has EN and AR enum labels (replaces replace(/_/g, " "))', () => {
    const keys = ['preHandover', 'punchSnag', 'rectification', 'finalInspection', 'testingCommissioning', 'asBuilts', 'oM', 'training', 'takingOver', 'dlpWarranty', 'finalCompletion'];
    for (const k of keys) { expect(en.handoverState[k]).toBeTruthy(); expect(ar.handoverState[k]).toBeTruthy(); }
  });
});
