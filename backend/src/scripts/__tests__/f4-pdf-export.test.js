'use strict';

// F4.1: Arabic-capable PDF export (headless Chromium + bundled IBM Plex fonts) and CSV export hygiene.
// The Chromium half skips (visibly) when no browser can start, e.g. the alpine image-build test stage; set
// PDF_CHROMIUM_REQUIRED=1 to make a missing browser a failure instead.
jest.mock('dotenv', () => ({ config: jest.fn() }));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f4-fixture-only-secret-longer-than-32';
jest.mock('../../config/database', () => ({ query: jest.fn(), pool: { query: jest.fn(), on: jest.fn() } }));

const htmlPdf = require('../../utils/htmlPdf');
const { renderDocument } = require('../../utils/procurementPdf');
const { toCsv, csvField } = require('../../utils/reporting');

const ARABIC_SPEC = {
  docType: 'فاتورة أعمال خرسانة', number: 'INV-2026-0042', date: '2026-10-14',
  meta: [['العميل', 'شركة النيل للمقاولات'], ['المشروع', 'CAI-008']],
  columns: [{ key: 'item', label: 'البند', width: 100 }, { key: 'desc', label: 'الوصف', width: 200 }, { key: 'qty', label: 'الكمية', width: 60, align: 'right' }, { key: 'total', label: 'الإجمالي', width: 80, align: 'right' }],
  rows: Array.from({ length: 60 }, (_, i) => ({ item: `BOQ-${i + 1}`, desc: i % 2 ? 'خرسانة مسلحة — Level 08' : 'Reinforced slab', qty: 12 + i, total: 1500.5 * (i + 1) })),
  summary: [['المبلغ المستحق', 1245000]],
};
const ENGLISH_SPEC = { ...ARABIC_SPEC, docType: 'Concrete Works Invoice', meta: [['Customer', 'Nile Contracting']], columns: [{ key: 'item', label: 'Item', width: 100 }, { key: 'desc', label: 'Description', width: 200 }, { key: 'qty', label: 'Qty', width: 60, align: 'right' }, { key: 'total', label: 'Total', width: 80, align: 'right' }], rows: ARABIC_SPEC.rows.map((r) => ({ ...r, desc: 'Reinforced slab' })), summary: [['Amount due', 1245000]] };

describe('locale resolution and HTML layout', () => {
  test('Arabic content or an explicit locale selects the Chromium path; plain English stays on PDFKit', () => {
    expect(htmlPdf.resolveLocale(ARABIC_SPEC)).toBe('ar');
    expect(htmlPdf.resolveLocale(ENGLISH_SPEC)).toBe('en');
    expect(htmlPdf.resolveLocale({ ...ENGLISH_SPEC, locale: 'ar' })).toBe('ar');
  });

  test('Arabic HTML is right-to-left, embeds the bundled fonts, isolates codes and keeps the Arabic text', () => {
    const html = htmlPdf.buildHtml(ARABIC_SPEC, 'ar');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("font-family:'PlexArabic'");
    expect(html).toMatch(/src:url\(data:font\/woff2;base64,[A-Za-z0-9+/=]{1000,}\)/);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);          // no runtime network request
    expect(html).toContain('فاتورة أعمال خرسانة');
    expect(html).toContain('<bdi dir="ltr">INV-2026-0042</bdi>');
    expect(html).toContain('<thead>');                                // repeated header on page breaks
  });

  test('English HTML is left-to-right', () => {
    expect(htmlPdf.buildHtml(ENGLISH_SPEC, 'en')).toContain('dir="ltr"');
  });

  test('plain header strings with array rows (reports shape) render too', () => {
    const html = htmlPdf.buildHtml({ docType: 'تقرير', columns: ['الاسم', 'الحالة'], rows: [['أحمد', 'معتمد']] }, 'ar');
    expect(html).toContain('<th style="text-align:start">الاسم</th>');
    expect(html).toContain('أحمد');
  });

  test('text is escaped', () => {
    const html = htmlPdf.buildHtml({ docType: '<script>x</script>', rows: [], columns: [] }, 'en');
    expect(html).not.toContain('<script>x');
  });
});

describe('CSV export hygiene', () => {
  test('keeps the UTF-8 BOM, Arabic text and neutralises formula prefixes', () => {
    const csv = toCsv([{ a: '=SUM(A1:A2)', b: 'شركة النيل', c: '-5', d: '@cmd', e: '  +x' }], [['a', 'الاسم'], ['b', 'B'], ['c', 'C'], ['d', 'D'], ['e', 'E']]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toContain('شركة النيل');
    const row = csv.split('\n')[1];
    expect(row).toContain("'=SUM(A1:A2)");
    expect(row).toContain("'@cmd");
    expect(row).toContain("'  +x");
    expect(row).toContain(',-5,');                                    // a plain negative number is data, not a formula
    expect(csvField('+1,5')).toBe('"\'+1,5"');
  });
});

describe('real PDF generation', () => {
  let canLaunch = false;
  beforeAll(async () => {
    try { await htmlPdf.renderHtmlPdf({ docType: 'x', rows: [], columns: [] }, { locale: 'en' }); canLaunch = true; } catch (e) { canLaunch = false; }
    if (!canLaunch && process.env.PDF_CHROMIUM_REQUIRED === '1') throw new Error('Chromium is required but could not start');
  }, 60000);
  afterAll(async () => { await htmlPdf.closeBrowser(); });

  const extract = async (buffer) => {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, disableFontFace: true }).promise;
    let text = '';
    for (let n = 1; n <= doc.numPages; n++) text += ` ${(await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(' ')}`;
    // PDF.js yields presentation-form glyphs in visual order (docs/i18n/PDF_SPIKE.md): normalise, then accept either order.
    const nfkc = text.normalize('NFKC');
    return { pages: doc.numPages, text: nfkc, visual: [...nfkc].reverse().join(''), fonts: Buffer.from(buffer).toString('latin1') };
  };
  // PDF.js returns Arabic as shaped presentation glyphs split into per-letter/ligature runs in mixed order, so
  // exact word matching is unreliable (docs/i18n/PDF_SPIKE.md). Instead require every letter of the expected word,
  // with multiplicity, to be present in the extracted Arabic text: unshaped/garbled output (PDFKit standard fonts)
  // maps to missing glyphs and fails, an embedded Arabic font passes.
  const arabicLetters = (text) => [...text.normalize('NFKC').replace(/[^\u0621-\u064A]/g, '')];
  const has = (extracted, word) => {
    const available = new Map();
    for (const ch of arabicLetters(extracted.text)) available.set(ch, (available.get(ch) || 0) + 1);
    for (const ch of arabicLetters(word)) {
      const left = available.get(ch) || 0;
      if (left === 0) return false;
      available.set(ch, left - 1);
    }
    return true;
  };

  test('an Arabic document is a real, multi-page PDF containing the Arabic text and an embedded font', async () => {
    if (!canLaunch) return console.warn('SKIPPED: Chromium unavailable');
    const buffer = await renderDocument(ARABIC_SPEC);                 // through the shared entry used by every route
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    const out = await extract(buffer);
    expect(out.pages).toBeGreaterThan(1);
    expect(has(out, 'فاتورة')).toBe(true);
    expect(has(out, 'العميل')).toBe(true);
    expect(has(out, 'المبلغ')).toBe(true);
    expect(out.fonts).toMatch(/\/FontFile2|\/FontFile3/);              // embedded, subsetted font program
    expect(out.text.replace(/\s+/g, '')).toContain('INV-2026-0042');
  }, 60000);

  test('an English document is a valid PDF through the PDFKit path', async () => {
    const buffer = await renderDocument(ENGLISH_SPEC);                // PDFKit path
    expect(buffer.slice(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  test('an English-locale Chromium render also works (explicit locale)', async () => {
    if (!canLaunch) return console.warn('SKIPPED: Chromium unavailable');
    const buffer = await htmlPdf.renderHtmlPdf(ENGLISH_SPEC, { locale: 'en' });
    const out = await extract(buffer);
    expect(out.text).toContain('Concrete Works Invoice');
  }, 60000);
});
