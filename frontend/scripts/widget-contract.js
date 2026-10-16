// Read the producer's AST, including identifier-backed data and handover data.
// This runs without loading backend config, querying a database, or starting services.
const fs = require('fs');
const path = require('path');
const { parse, visit, ts } = require('./system-strings');
const serviceDir = path.join(__dirname, '../../backend/src/services');

function widgetContract(source = fs.readFileSync(path.join(serviceDir, 'dashboardWidgets.js'), 'utf8')) {
  const tree = parse(source); const widgets = new Set(); const fields = new Set(); const values = new Map();
  visit(tree, node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) values.set(node.name.text, node.initializer);
  });
  const collect = (node, seen = new Set()) => {
    if (!node) return;
    if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if (prop.name) fields.add(prop.name.text);
        if (prop.initializer && ts.isObjectLiteralExpression(prop.initializer)) collect(prop.initializer, seen);
      }
    } else if (ts.isIdentifier(node) && !seen.has(node.text)) {
      seen.add(node.text); collect(values.get(node.text), seen);
    }
  };
  visit(tree, node => {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'w') {
      if (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0])) throw new Error('Widget key must be a stable string literal');
      widgets.add(node.arguments[0].text); collect(node.arguments[2]);
    }
  });
  const handover = parse(fs.readFileSync(path.join(serviceDir, 'handoverEngine.js'), 'utf8'));
  visit(handover, node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'handoverReadiness') visit(node, child => {
      if (ts.isReturnStatement(child)) collect(child.expression);
    });
  });
  return { widgets: [...widgets].sort(), fields: [...fields].sort() };
}
function missingWidgetKeys(contract, catalogs) {
  const missing = [];
  for (const locale of ['en', 'ar']) {
    const widgets = catalogs[locale]?.widgets;
    for (const key of contract.widgets) if (typeof widgets?.[key]?.title !== 'string' || !widgets[key].title.trim()) missing.push(`${locale}: dashboard.widgets.${key}.title`);
    for (const field of contract.fields) if (typeof widgets?.fields?.[field] !== 'string' || !widgets.fields[field].trim()) missing.push(`${locale}: dashboard.widgets.fields.${field}`);
  }
  return missing;
}
module.exports = { widgetContract, missingWidgetKeys };
