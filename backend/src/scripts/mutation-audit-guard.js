'use strict';

// Use the Babel parser already installed with the backend's Jest toolchain.
// This guard does not execute routes, load the server, or read environment files.
const parser = require('@babel/parser');
const fs = require('fs');
const path = require('path');
const exemptions = require('./mutation-audit-exemptions.json');
const MUTATION = /\b(?:INSERT\s+INTO|UPDATE\s+[\w."${}]+[\s\S]*?\bSET|DELETE\s+FROM)\b/i;
const AUDIT_SQL = /\bINSERT\s+INTO\s+(?:activity_log|audit_events)\b/i;
const AUDITS = new Set(['auditedTransaction', 'auditedMutation', 'auditedChange', 'logActivity', 'writeAuditEvent', 'recordAuditEvent', 'auditProc', 'auditFin']);
const WRITES = new Set(['fireEvent', 'nextNumber', 'bumpCounter']);
const POLICY = /^(?:authenticate|authorize|authorizeProjectPayload|authorizedProjectId|extractProject|evaluate|resolveProject|loadAccess)/;

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

function mutationAuditViolations(source, relative = '', options = {}) {
  const cache = options.cache || new Map();
  const srcDir = options.srcDir || path.resolve(__dirname, '..');
  function parse(text, file) {
    if (cache.has(file)) return cache.get(file);
    const ast = parser.parse(text, { sourceType: 'unambiguous' });
    const context = { ast, functions: new Map(), imports: new Map(), file };
    cache.set(file, context);
    walk(ast, node => {
      if (node.type === 'FunctionDeclaration' && node.id) context.functions.set(node.id.name, node);
      if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier' && node.id.type !== 'ObjectPattern') return;
      if (node.id.type === 'Identifier' && /^(?:ArrowFunctionExpression|FunctionExpression)$/.test(node.init?.type)) context.functions.set(node.id.name, node.init);
      if (node.init?.callee?.name !== 'require' || !node.init.arguments[0]?.value?.startsWith('.')) return;
      const imported = path.resolve(path.dirname(file), node.init.arguments[0].value) + '.js';
      if (!imported.startsWith(srcDir + path.sep) || !fs.existsSync(imported)) return;
      if (node.id.type === 'Identifier') context.imports.set(node.id.name, { file: imported });
      else for (const property of node.id.properties) {
        if (property.value?.name) context.imports.set(property.value.name, { file: imported, name: property.key.name });
      }
    });
    return context;
  }
  const context = parse(source, path.join(srcDir, relative || '__guard_fixture__.js'));
  const routers = new Set(['router']);
  walk(context.ast, node => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.callee?.property?.name === 'Router') routers.add(node.id.name);
  });
  function trace(node, ctx, seen = new Set()) {
    const identity = ctx.file + ':' + node.start;
    if (seen.has(identity)) return { writes: false, audit: false };
    seen.add(identity);
    const result = { writes: false, audit: false };
    walk(node, child => {
      // SQL literals are inspected, but strings/comments naming helpers cannot
      // satisfy an audit. Authorization audits never satisfy business auditing.
      const sql = child.type === 'StringLiteral' ? child.value : child.type === 'TemplateLiteral' ? child.quasis.map(q => q.value.raw).join('${}') : '';
      if (MUTATION.test(sql)) result.writes = true;
      if (AUDIT_SQL.test(sql)) result.audit = true;
      if (child.type !== 'CallExpression') return;
      const callee = child.callee;
      const name = callee.type === 'Identifier' ? callee.name : callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : null;
      if (!name || POLICY.test(name)) return;
      if (AUDITS.has(name)) result.audit = true;
      if (WRITES.has(name)) result.writes = true;
      let target; let targetCtx = ctx;
      if (callee.type === 'Identifier') target = ctx.functions.get(name);
      const imported = callee.type === 'Identifier' ? ctx.imports.get(name) : ctx.imports.get(callee.object?.name);
      if (imported) {
        targetCtx = parse(fs.readFileSync(imported.file, 'utf8'), imported.file);
        target = targetCtx.functions.get(imported.name || name);
      }
      if (target) {
        const nested = trace(target, targetCtx, seen);
        result.writes ||= nested.writes;
        result.audit ||= nested.audit;
      }
    });
    return result;
  }
  const violations = [];
  walk(context.ast, node => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || !routers.has(node.callee.object.name)) return;
    const method = node.callee.property.name?.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
    const route = node.arguments[0]?.value;
    if (Object.entries(exemptions).some(([key, exemption]) => key.startsWith(method + ' ') && exemption.file === relative && exemption.path === route)) return;
    const handler = node.arguments.at(-1);
    const target = handler?.type === 'Identifier' ? context.functions.get(handler.name) : handler;
    if (!target) return;
    const result = trace(target, context);
    if (result.writes && !result.audit) violations.push({ method, path: route || '<dynamic>', line: node.loc.start.line });
  });
  return violations;
}

module.exports = { mutationAuditViolations };
