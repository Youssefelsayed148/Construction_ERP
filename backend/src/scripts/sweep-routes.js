'use strict';
const fs = require('fs');
const path = require('path');
const c = require('./sweep-common');

// Same mount declaration + Express stack traversal used by pagination-routes.test.js.
function enumerate() {
  const env = c.config(); Object.assign(process.env, env);
  const routes = [];
  function walk(stack, prefix, inherited = []) {
    const middleware = [...inherited];
    for (const layer of stack) {
      if (layer.route) {
        for (const routePath of [layer.route.path].flat()) for (const method of Object.keys(layer.route.methods)) {
          const handlers = [...middleware, ...layer.route.stack.map(entry => entry.handle)];
          routes.push({ method: method.toUpperCase(), path: prefix + (routePath === '/' ? '' : routePath), prefix, routePath, handlers });
        }
      } else if (layer.handle?.stack) {
        if (layer.regexp.fast_slash) { walk(layer.handle.stack, prefix, middleware); continue; }
        const mount = layer.regexp.source.match(/^\^\\\/(.*?)(?:\\\/)?\(\?=/);
        if (!mount) throw new Error('Unsupported nested router mount');
        walk(layer.handle.stack, `${prefix}/${mount[1].replace(/\\\//g, '/')}`, middleware);
      } else middleware.push(layer.handle);
    }
  }
  const source = fs.readFileSync(path.join(c.root, 'backend/server.js'), 'utf8');
  for (const [, prefix, modulePath, build] of source.matchAll(/app\.use\('([^']+)', require\('([^']+)'\)(\.buildV1Router\(\))?\);/g)) {
    const exported = require(path.resolve(c.root, 'backend', modulePath));
    walk((build ? exported.buildV1Router() : exported).stack, prefix);
  }
  routes.push({ method: 'GET', path: '/api/health', prefix: '/api', routePath: '/health', handlers: [] });
  // v1 wraps internal chains in closures. Its exported family registry lets the audit retain the
  // original policy mount, path and authorizers without changing any application handler.
  const { FAMILY_MAP, ROUTERS }=require('../routes/v1');
  for(const [family,operations] of Object.entries(FAMILY_MAP))for(const [routerName,method,internalPath,v1Path] of operations){
    const externalPath=`/api/v1/${family}${v1Path}`;
    const route=routes.find(r=>r.method===method&&r.path===externalPath);
    const definition=ROUTERS[routerName];
    const internal=definition.router.stack.find(layer=>layer.route?.path===internalPath&&layer.route.methods[method.toLowerCase()]);
    if(route&&internal){route.policyPrefix=definition.mount;route.policyRoutePath=internalPath;route.handlers.push(...internal.route.stack.map(layer=>layer.handle));}
  }
  const {READ_MODELS}=require('../services/apiResources');
  for(const route of routes){
    const family=route.path.split('/')[3];
    if(route.method==='GET'&&route.path.startsWith('/api/v1/')&&!route.policyPrefix&&READ_MODELS[family]){
      route.readModel=READ_MODELS[family];route.policyPrefix=`/api/${route.readModel.module}`;
    }
  }
  return routes;
}
module.exports = { enumerate };
