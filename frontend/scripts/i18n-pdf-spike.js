// Reproducible L8 comparison: current shared PDFKit layout versus Chromium print.
// Run from frontend with: node scripts/i18n-pdf-spike.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const pdfJsPath = require.resolve('pdfjs-dist/build/pdf.js');
const pdfJsWorkerPath = require.resolve('pdfjs-dist/build/pdf.worker.js');
const { renderDocument } = require('../../backend/src/utils/procurementPdf');

const repo = path.resolve(__dirname, '../..');
const output = path.join(repo, 'docs/i18n/pdf-spike');
const arabicFont = path.join(__dirname, '../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2');
const latinFont = path.join(__dirname, '../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2');
const fontData = (file) => `data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}`;

const arabic = {
  invoice: { title: 'فاتورة أعمال خرسانة', customer: 'شركة النيل للمقاولات', table: ['البند', 'الوصف', 'الكمية', 'الوحدة', 'السعر', 'الإجمالي'], total: 'الإجمالي المستحق' },
  certificate: { title: 'شهادة دفع رقم 04', customer: 'مشروع أبراج القاهرة', table: ['البند', 'القيمة المعتمدة'], total: 'صافي المستخلص' },
  register: { title: 'سجل طلبات الفحص', customer: 'مشروع أبراج القاهرة', table: ['رقم الطلب', 'الوصف', 'الموقع', 'الحالة', 'التاريخ'], total: 'عدد السجلات' },
};
const english = {
  invoice: { title: 'Concrete Works Invoice', customer: 'Nile Contracting Company', table: ['Item', 'Description', 'Qty', 'Unit', 'Rate', 'Total'], total: 'Amount due' },
  certificate: { title: 'Payment Certificate 04', customer: 'Cairo Towers Project', table: ['Item', 'Certified value'], total: 'Net certificate' },
  register: { title: 'Work Inspection Request Register', customer: 'Cairo Towers Project', table: ['Request no.', 'Description', 'Location', 'Status', 'Date'], total: 'Records' },
};

const samples = {
  invoice: { id: 'INV-2026-0042', amount: 1245000, rows: Array.from({ length: 8 }, (_, i) => ({ item: `BOQ-${i + 1}`, desc: i % 2 ? 'Reinforced concrete slab — Level 08' : 'خرسانة مسلحة - الدور الثامن', qty: 18 + i, unit: 'm³', rate: 2450, total: (18 + i) * 2450 })) },
  certificate: { id: 'PC-2026-0004', amount: 987650.5, rows: [['Concrete works', 'أعمال الخرسانة', 630000], ['Holdback 5%', 'استقطاع ضمان 5%', -49382.5], ['Previous payment', 'دفعة سابقة', -120000]] },
  register: { id: 'WIR-REGISTER-07', amount: 46, rows: Array.from({ length: 46 }, (_, i) => ({ id: `WIR-CAI-${String(i + 1).padStart(4, '0')}`, desc: i % 2 ? 'Column reinforcement inspection' : 'فحص تسليح الأعمدة', location: `Tower A / L${String((i % 28) + 1).padStart(2, '0')}`, status: i % 3 ? 'approved' : 'pending_approval', date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}` })) },
};
const arabicExtractionChecks = { invoice: 'فاتورة', certificate: 'شهادة', register: 'سجل' };

function textValue(value) {
  return value == null ? '' : String(value);
}
function makeRows(kind, locale) {
  const labels = (locale === 'ar' ? arabic : english)[kind];
  const spec = samples[kind];
  if (kind === 'invoice') return spec.rows.map((r) => [r.item, r.desc, r.qty, r.unit, r.rate.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG'), r.total.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')]);
  if (kind === 'certificate') return spec.rows.map((r) => [locale === 'ar' ? r[1] : r[0], new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 2 }).format(r[2])]);
  return spec.rows.map((r) => [r.id, r.desc, r.location, locale === 'ar' ? (r.status === 'approved' ? 'معتمد' : 'بانتظار الاعتماد') : (r.status === 'approved' ? 'Approved' : 'Pending approval'), r.date]);
}

function pdfKitSpec(kind, locale) {
  const labels = (locale === 'ar' ? arabic : english)[kind];
  const spec = samples[kind];
  const rows = makeRows(kind, locale);
  const common = { docType: labels.title, number: spec.id, date: '2026-10-14', meta: [[labels.customer, kind === 'invoice' ? 'INV-2026-0042' : 'PRJ-CAI-008'], ['Project / Unit', 'Tower A / L08 / m³']], notes: locale === 'ar' ? 'القيم والأكواد والمراجع محفوظة كما وردت في النظام.' : 'Values, codes and references are preserved from the system.' };
  if (kind === 'invoice') return { ...common, meta: [[locale === 'ar' ? 'العميل' : 'Customer', 'شركة النيل للمقاولات'], [locale === 'ar' ? 'المشروع' : 'Project', 'CAI-008 / Tower A']], columns: labels.table.map((label, i) => ({ key: `c${i}`, label, width: [95, 120, 48, 45, 65, 78][i], align: i > 1 ? 'right' : 'left' })), rows: rows.map((row) => Object.fromEntries(row.map((v, i) => [`c${i}`, v]))), summary: [[labels.total, spec.amount]] };
  if (kind === 'certificate') return { ...common, columns: labels.table.map((label, i) => ({ key: `c${i}`, label, width: i ? 140 : 250 })), rows: rows.map((row) => Object.fromEntries(row.map((v, i) => [`c${i}`, v]))), summary: [[labels.total, spec.amount]] };
  return { ...common, columns: labels.table.map((label, i) => ({ key: `c${i}`, label, width: [100, 130, 90, 105, 82][i] })), rows: rows.map((row) => Object.fromEntries(row.map((v, i) => [`c${i}`, v]))) };
}

function chromiumHtml(kind, locale) {
  const labels = (locale === 'ar' ? arabic : english)[kind];
  const spec = samples[kind];
  const rows = makeRows(kind, locale);
  const direction = locale === 'ar' ? 'rtl' : 'ltr';
  const tableRows = rows.map((row) => `<tr>${row.map((cell, i) => `<td>${i === 0 && /^[A-Z0-9/-]+$/.test(cell) ? `<bdi dir="ltr">${cell}</bdi>` : cell}</td>`).join('')}</tr>`).join('');
  const summary = kind === 'register' ? `${spec.amount}` : new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', { minimumFractionDigits: 2 }).format(spec.amount);
  return `<!doctype html><html lang="${locale}" dir="${direction}"><meta charset="utf-8"><style>
    @font-face{font-family:Plex;src:url('${fontData(latinFont)}')}@font-face{font-family:PlexArabic;src:url('${fontData(arabicFont)}')}
    @page{size:A4}*{box-sizing:border-box}html{direction:${direction}}body{margin:0;color:#1d2732;font:11pt Plex,Arial,sans-serif;line-height:1.45}html[dir=rtl] body{font-family:PlexArabic,Plex,sans-serif}
    .band{background:#173d5b;color:#fff;padding:18px 20px;margin-bottom:22px}.brand{font-size:10pt;opacity:.85}.title{font-size:18pt;font-weight:700;margin:6px 0}.code{font:10pt Plex,monospace;direction:ltr;unicode-bidi:isolate}.meta{display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid #ccd2d8;padding:0 0 12px;margin-bottom:18px}.meta span{display:block;color:#64717d;font-size:9pt}.meta b{display:block;margin-top:4px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{background:#e8edf1;color:#193d59;font-weight:700;text-align:start}th,td{padding:7px 6px;border-bottom:1px solid #d8dde2;vertical-align:top;overflow-wrap:anywhere}td{height:27px}tr{break-inside:avoid}tfoot{display:table-row-group}.summary{display:flex;justify-content:space-between;margin-top:18px;padding-top:12px;border-top:2px solid #193d59;font-weight:bold}.note{margin-top:18px;color:#687581;font-size:9pt}.mixed{direction:ltr;unicode-bidi:isolate;font-family:Plex,Arial,sans-serif}
    </style><body><header class="band"><div class="brand">Osiris Labs · Construction ERP</div><div class="title">${labels.title}</div><bdi class="code">${spec.id}</bdi></header><div class="meta"><div><span>${locale === 'ar' ? 'العميل / المشروع' : 'Customer / Project'}</span><b>${labels.customer}</b></div><div><span>${locale === 'ar' ? 'التاريخ' : 'Date'}</span><b class="mixed">14 Oct 2026</b></div></div><table><thead><tr>${labels.table.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table><div class="summary"><span>${labels.total}</span><bdi class="mixed">${summary} ${kind === 'invoice' || kind === 'certificate' ? 'EGP' : ''}</bdi></div><p class="note">${locale === 'ar' ? 'القيم والأكواد والمراجع محفوظة كما وردت في النظام.' : 'Values, codes and references are preserved from the system.'}</p></body></html>`;
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  for (const file of fs.readdirSync(output)) {
    if (/^(?:invoice|certificate|register)-(?:en|ar)-(?:chromium|pdfkit)(?:-pdf)?(?:-page-\d+)?\.(?:png|pdf)$/.test(file) || file === 'text-extraction.txt') {
      fs.rmSync(path.join(output, file));
    }
  }
  fs.writeFileSync(path.join(output, 'text-extraction.txt'), 'PDF text extraction from representative EN/AR samples\n\n', 'utf8');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const kind of Object.keys(samples)) for (const locale of ['en', 'ar']) {
      const name = `${kind}-${locale}`;
      const html = chromiumHtml(kind, locale);
      const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(output, `${name}-chromium.png`), fullPage: true });
      const chromiumPdf = path.join(output, `${name}-chromium.pdf`);
      await page.pdf({ path: chromiumPdf, format: 'A4', printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: true, headerTemplate: '<div></div>',
        footerTemplate: `<div style="font:8px Arial;color:#7b858e;width:100%;text-align:center">${specsId(kind)} · <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
        margin: { top: '13mm', right: '13mm', bottom: '18mm', left: '13mm' } });
      const legacy = await renderDocument(pdfKitSpec(kind, locale));
      const legacyPdf = path.join(output, `${name}-pdfkit.pdf`);
      fs.writeFileSync(legacyPdf, legacy);
      await page.close();

      const renderPdf = async (file, renderer) => {
        const pdfPage = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
        await pdfPage.setContent('<canvas id="page"></canvas>');
        await pdfPage.addScriptTag({ path: pdfJsPath });
        const pdfBase64 = fs.readFileSync(file).toString('base64');
        const workerSource = fs.readFileSync(pdfJsWorkerPath, 'utf8');
        const rendered = await pdfPage.evaluate(async ({ data, worker }) => {
          pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([worker], { type: 'text/javascript' }));
          const pdf = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)), disableWorker: true }).promise;
          const pages = [];
          const extracted = [];
          const textItems = [];
          for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
            const page = await pdf.getPage(pageNo);
            const viewport = page.getViewport({ scale: 1.4 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            pages.push(canvas.toDataURL('image/png').split(',')[1]);
            const content = await page.getTextContent();
            extracted.push(content.items.map((item) => item.str).join(' '));
            textItems.push(content.items.map(({ str, dir, hasEOL }) => ({ str, dir, hasEOL })));
          }
          return { pages, text: extracted.join(' '), textItems };
        }, { data: pdfBase64, worker: workerSource });
        await pdfPage.close();
        rendered.pages.forEach((png, i) => fs.writeFileSync(path.join(output, `${name}-${renderer}-page-${i + 1}.png`), Buffer.from(png, 'base64')));
        return rendered;
      };
      const chromiumResult = await renderPdf(chromiumPdf, 'chromium-pdf');
      const pdfKitResult = await renderPdf(legacyPdf, 'pdfkit');
      const expectedTitle = (locale === 'ar' ? arabic : english)[kind].title;
      const normalizeText = (value) => value.replace(/\s+/g, ' ').trim();
      const extractedTitle = locale === 'ar'
        ? chromiumResult.text.slice(0, chromiumResult.text.indexOf(specsId(kind))).replace(/\b\d+\b/g, '').split(/\s{3,}/).reverse()
          .map((word) => [...word.replace(/\s+/g, '')].reverse().join('').normalize('NFKC')).join(' ')
        : chromiumResult.text;
      const expectedText = locale === 'ar' ? arabicExtractionChecks[kind] : expectedTitle;
      const expectedTextPresent = normalizeText(extractedTitle).includes(normalizeText(expectedText));
      if (!expectedTextPresent) throw new Error(`${name}: extracted Chromium PDF text did not contain its expected locale string: ${JSON.stringify({ expectedText, extractedTitle, items: chromiumResult.textItems[0].slice(0, 16) })}`);
      fs.appendFileSync(path.join(output, 'text-extraction.txt'), `${name}\nExpected extraction string present: ${expectedTextPresent}\nChromium pages: ${chromiumResult.pages.length}\nChromium: ${chromiumResult.text}\nPDFKit pages: ${pdfKitResult.pages.length}\nPDFKit: ${pdfKitResult.text}\n`, 'utf8');
      console.log(`${name}: PDFs and raster images written`);
    }
  } finally { await browser.close(); }
}

function specsId(kind) { return samples[kind].id; }

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
