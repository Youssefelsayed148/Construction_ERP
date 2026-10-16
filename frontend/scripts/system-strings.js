// AST inventory for system text. Business-data selection and layout branches are
// deliberately excluded: only branches containing literal presentation text count.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

function parse(source, file = 'page.jsx') {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
}
function visit(node, fn) { fn(node); ts.forEachChild(node, child => visit(child, fn)); }
const languageTest = text => /^(?:ar|isRTL)$|\b(?:locale|language)\s*[!=]==?\s*['"]ar['"]/.test(text);
function textBranch(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);
}
const nonText = new Set(['ar', 'en', 'ar-EG', 'en-US', 'en-GB', 'rtl', 'ltr', 'left', 'right', 'EN', 'ع', '—']);
function systemBranch(node) {
  return textBranch(node) && !(ts.isStringLiteral(node) && nonText.has(node.text));
}
function renderedLiteral(node) {
  let child = node; let parent = node.parent;
  while (parent) {
    if (ts.isConditionalExpression(parent) && languageTest(parent.condition.getText())) return false;
    if (ts.isJsxExpression(parent)) return !ts.isJsxAttribute(parent.parent);
    if (ts.isParenthesizedExpression(parent) || (ts.isConditionalExpression(parent) && parent.condition !== child)
      || (ts.isBinaryExpression(parent) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(parent.operatorToken.kind))) {
      child = parent; parent = parent.parent;
    } else return false;
  }
  return false;
}
function scan(source, file) {
  const tree = parse(source, file); const findings = [];
  const add = (node, category) => findings.push({ line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, category, start: node.getStart(tree), end: node.end });
  visit(tree, node => {
    if (ts.isConditionalExpression(node) && languageTest(node.condition.getText(tree)) && (systemBranch(node.whenTrue) || systemBranch(node.whenFalse))) add(node, 'inline-language-system-text');
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'L' && node.arguments.length === 2 && node.arguments.every(textBranch)) add(node, 'inline-language-helper-text');
    if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text.replace(/&\w+;/g, '').trim())) add(node, 'JSX-system-text');
    if (ts.isJsxAttribute(node) && /^(placeholder|title|aria-label|alt)$/.test(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer) && /[A-Za-z]/.test(node.initializer.text)) add(node.initializer, 'JSX-system-attribute');
    if (ts.isStringLiteral(node) && /[A-Za-z]{2}/.test(node.text) && !nonText.has(node.text) && renderedLiteral(node)) add(node, 'JSX-expression-system-text');
    if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent) && node.expression && ts.isPropertyAccessExpression(node.expression) && /^(status|role|scope|priority|severity|execution_status|decision|result|required_approver_role|source_type|frequency|direction|corr_type|point_type)$/.test(node.expression.name.text) && !/^L\./.test(node.expression.getText(tree))) add(node.expression, 'raw-system-enum');
  });
  return findings;
}
function filesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? filesIn(path.join(dir, e.name)) : /\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name) ? [path.join(dir, e.name)] : []);
}
// No user-visible literal branches are allow-listed. Branches selecting stored
// names, locale codes, alignment, icons, or other non-text values are permitted.
function pageViolations(pagesDir = path.join(__dirname, '../src/pages')) {
  return filesIn(pagesDir).flatMap(file => scan(fs.readFileSync(file, 'utf8'), file).filter(f => f.category.startsWith('inline-language-')).map(f => `${path.basename(file)}:${f.line}`));
}
const allowedLiterals = {
  'ProjectFinanceWorkbench.js': ['REL-'], // Stored document-number prefix.
  'Reports.js': ['CSV', 'PDF'], 'Schedule.js': ['CSV'], // File-format names.
  'Login.js': ['email@example.com'], // Example input values, never stored/translated.
  'SiteManagement.js': ['35°C'], 'UnitsSales.js': ['B1', 'A-'],
};
function visibleLiteralViolations(srcDir = path.join(__dirname, '../src')) {
  return filesIn(srcDir).flatMap(file => {
    const source = fs.readFileSync(file, 'utf8');
    return scan(source, file).filter(f => /^JSX-/.test(f.category) && !(allowedLiterals[path.basename(file)] || []).includes(source.slice(f.start, f.end).trim().replace(/^['"]|['"]$/g, ''))).map(f => `${path.basename(file)}:${f.line}`);
  });
}
module.exports = { parse, visit, scan, filesIn, pageViolations, visibleLiteralViolations, ts };
