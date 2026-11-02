// Dumps, per mounted route, the coarse authorize(...roles) list declared in code. Read-only; no DB connection is opened.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const path = require('path');
const fs = require('fs');
const server = fs.readFileSync(path.join(__dirname, '../../backend/server.js'), 'utf8');
const mounts = [...server.matchAll(/app\.use\('(\/api\/[a-z0-9-]+)',\s*require\('(\.\/src\/routes\/[A-Za-z0-9-]+)'\)\)/g)].map((m) => [m[1], m[2]]);
const out = [];
for (const [mount, file] of mounts) {
  let router;
  try { router = require(path.join(__dirname, '../../backend', file)); } catch (e) { out.push({ mount, error: e.message.slice(0, 120) }); continue; }
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        const roles = new Set(); let guarded = false;
        for (const h of layer.route.stack) { if (h.handle.authorizeRoles) { guarded = true; h.handle.authorizeRoles.forEach((r) => roles.add(r)); } }
        for (const method of Object.keys(layer.route.methods)) out.push({ mount, method: method.toUpperCase(), path: prefix + layer.route.path, guarded, roles: [...roles] });
      } else if (layer.handle && layer.handle.stack && layer.regexp) {
        const m = String(layer.regexp).match(/^\/\^\\\/([^\\?(]*)/);
        walk(layer.handle.stack, prefix + (m && m[1] ? '/' + m[1] : ''));
      }
    }
  };
  walk(router.stack || [], '');
}
fs.writeFileSync(path.join(__dirname, 'routes.json'), JSON.stringify(out, null, 1));
console.log('mounts', mounts.length, 'routes', out.length, 'errors', out.filter((o) => o.error).length);
console.log(out.filter((o) => o.error));
