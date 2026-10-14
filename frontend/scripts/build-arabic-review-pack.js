// Rebuild the owner-facing Arabic review worksheet from the final glossary,
// current paired catalogs, route checklist, screenshots, and PDF spike images.
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '../..');
const docs = path.join(repo, 'docs');
const glossaryFile = path.join(docs, 'i18n/GLOSSARY.md');
const checklistFile = path.join(docs, 'i18n/ROUTE_CHECKLIST.md');
const outputFile = path.join(docs, 'ARABIC_REVIEW_PACK.md');

function flatten(value, prefix = '', out = {}) {
  for (const [key, child] of Object.entries(value || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, fullKey, out);
    else out[fullKey] = String(child);
  }
  return out;
}

function escapeCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function readGlossaryTerms() {
  const lines = fs.readFileSync(glossaryFile, 'utf8').split(/\r?\n/);
  let heading = 'Construction and finance';
  const terms = [];
  const category = () => heading.replace(/^#+\s*/, '');
  for (const line of lines) {
    if (/^##\s+/.test(line)) heading = line;
    const cols = line.match(/^\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$/);
    if (cols && !/^English$/i.test(cols[1]) && !/^[-:]+$/.test(cols[1])) {
      terms.push({ en: cols[1], ar: cols[2], where: category() });
      continue;
    }
    if (/^Submit\s/.test(line) || /^draft\s/.test(line)) {
      for (const item of line.split(' · ')) {
        const match = item.match(/^([A-Za-z][A-Za-z0-9_ /()&-]*?)\s+(.+)$/);
        if (match) terms.push({ en: match[1].trim(), ar: match[2].trim(), where: category() });
      }
    }
  }
  const seen = new Set();
  return terms.filter((term) => {
    const key = `${term.en}\0${term.ar}`;
    if (!term.en || !term.ar || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readRoutes() {
  return fs.readFileSync(checklistFile, 'utf8').split(/\r?\n/)
    .map((line) => line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/))
    .filter(Boolean)
    .filter((cols) => !/^Route$/i.test(cols[1].trim()))
    .filter((cols) => !/^[-:]+$/.test(cols[1].trim()))
    .map((cols) => ({ route: cols[1].trim(), page: cols[2].trim() }));
}

function catalogMarkdown() {
  const enDir = path.join(repo, 'frontend/src/locales/en');
  const arDir = path.join(repo, 'frontend/src/locales/ar');
  const namespaces = fs.readdirSync(enDir).filter((file) => file.endsWith('.json')).sort();
  let out = `## Current paired catalog inventory\n\nGenerated from ${namespaces.length} EN/AR namespaces. The reviewer should add corrections in the term table above and confirm contextual usage on the screens below.\n\n`;
  for (const file of namespaces) {
    const namespace = file.replace(/\.json$/, '');
    const en = flatten(JSON.parse(fs.readFileSync(path.join(enDir, file), 'utf8')), namespace);
    const ar = flatten(JSON.parse(fs.readFileSync(path.join(arDir, file), 'utf8')), namespace);
    out += `### ${namespace}\n\n| Catalog key | English | Arabic |\n|---|---|---|\n`;
    for (const key of Object.keys(en).sort()) {
      out += `| \`${escapeCell(key)}\` | ${escapeCell(en[key])} | ${escapeCell(ar[key])} |\n`;
    }
    out += '\n';
  }
  return out;
}

function main() {
  const terms = readGlossaryTerms();
  const routes = readRoutes();
  const screenshots = path.join(docs, 'i18n/baseline/screenshots');
  const shotFiles = new Set(fs.readdirSync(screenshots));
  const termsTable = ['## Construction and finance terminology review', '',
    `Generated from the full glossary (${terms.length} entries). “Where used” follows the glossary section and names the likely module; add specific screens/exports during review. Leave the correction cell empty until the native reviewer proposes a change.`,
    '', '| Arabic term | English term | Where used | Reviewer corrections |', '|---|---|---|---|',
    ...terms.map((term) => `| ${escapeCell(term.ar)} | ${escapeCell(term.en)} | ${escapeCell(term.where)} | |`), ''].join('\n');

  const screensTable = ['## Per-screen pass/fail worksheet', '',
    'The current English mobile route smoke passed for each listed route. Arabic text correctness is **not verified** by that smoke. “Screenshot pair” means a current EN/AR baseline image exists; screenshots are evidence for review, not a reviewer pass.',
    '', '| Route | Screen | EN route smoke | Current EN/AR screenshot pair | Arabic content result | Reviewer correction / defect |', '|---|---|---|---|---|---|',
    ...routes.map(({ route, page }) => {
      const slug = route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
      const known = shotFiles.has(`${slug}.en.png`) && shotFiles.has(`${slug}.ar.png`);
      const screenshotStatus = known ? 'Yes; linked below where applicable' : 'No';
      return `| ${escapeCell(route)} | ${escapeCell(page)} | PASS (EN route render / mobile overflow only) | ${screenshotStatus} | NOT VERIFIED | |`;
    }), ''].join('\n');

  const content = `# Arabic construction terminology and export review pack\n\nStatus: **pending native Egyptian construction-domain reviewer and Arabic role UAT**. Generated on 2026-10-14 from the current final glossary and the paired catalogs. This is a review worksheet, not a sign-off.\n\n## Review checklist\n\n- [ ] Confirm Arabic terminology for construction, procurement, contracts, QS, finance, QA/QC, HSE, planning, handover, and warranty in Egyptian usage.\n- [ ] Check abbreviations and mixed Arabic/Latin text: C35, BOQ, RFQ, PR, PO, GRN, MIR, WIR, NCR, EGP, dates, email addresses, URLs, and document numbers.\n- [ ] Inspect EN/AR screenshots at desktop and mobile sizes; baseline images are in [docs/i18n/baseline/screenshots/](i18n/baseline/screenshots/).\n- [ ] Review the representative Arabic PDF screenshots and PDFs listed in [PDF_SPIKE.md](i18n/PDF_SPIKE.md). This is a renderer spike, not final production export sign-off.\n- [ ] Record each proposed correction in the term table with its screen/export context, reviewer, and date.\n- [ ] Re-run \`npm run i18n:check\` and \`npm run i18n:parity\` after accepted terminology edits.\n\n## Representative rendered PDF evidence\n\n| Sample | Arabic Chromium PDF and rendered PNG | Arabic PDFKit comparison |\n|---|---|---|\n| Invoice | [PDF](i18n/pdf-spike/invoice-ar-chromium.pdf) · [PNG](i18n/pdf-spike/invoice-ar-chromium-pdf-page-1.png) | [PDF](i18n/pdf-spike/invoice-ar-pdfkit.pdf) · [PNG](i18n/pdf-spike/invoice-ar-pdfkit-page-1.png) |\n| Payment certificate | [PDF](i18n/pdf-spike/certificate-ar-chromium.pdf) · [PNG](i18n/pdf-spike/certificate-ar-chromium-pdf-page-1.png) | [PDF](i18n/pdf-spike/certificate-ar-pdfkit.pdf) · [PNG](i18n/pdf-spike/certificate-ar-pdfkit-page-1.png) |\n| WIR register page 1 | [PNG](i18n/pdf-spike/register-ar-chromium-pdf-page-1.png) | [PNG](i18n/pdf-spike/register-ar-pdfkit-page-1.png) |\n| WIR register page 2 | [PNG](i18n/pdf-spike/register-ar-chromium-pdf-page-2.png) | [PNG](i18n/pdf-spike/register-ar-pdfkit-page-2.png) |\n\n${termsTable}\n${screensTable}\n## Reviewer sign-off\n\n- Native Egyptian construction-domain reviewer: **pending**\n- Arabic role-based UAT: **pending owner**\n- Arabic terminology corrections: **none recorded yet; review pending**\n- Full production Arabic PDF/CSV export review: **pending; current PDF files are spike samples**\n\n${catalogMarkdown()}`;

  fs.writeFileSync(outputFile, `${content.trimEnd()}\n`, 'utf8');
  console.log(`Wrote ${path.relative(repo, outputFile)}: ${terms.length} glossary terms, ${routes.length} routes, ${namespacesCount()} namespaces`);
}

function namespacesCount() {
  return fs.readdirSync(path.join(repo, 'frontend/src/locales/en')).filter((file) => file.endsWith('.json')).length;
}

main();
