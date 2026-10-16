'use strict';

// Inspection only: requiring routers does not start the server or connect to a
// database. No sweep adapter, environment file or running application is used.
const fs = require('fs');
const path = require('path');

function mountedRoutes() {
  const server = path.resolve(__dirname, '../../server.js');
  const source = fs.readFileSync(server, 'utf8');
  const routes = [];
  function walk(stack, prefix, file) {
    for (const layer of stack) {
      if (layer.route) {
        for (const route of [layer.route.path].flat()) {
          const handlers = layer.route.stack.map(item => item.handle);
          for (const method of Object.keys(layer.route.methods)) routes.push({
            method: method.toUpperCase(), path: prefix + (route === '/' ? '' : route), prefix,
            route, file, handlers,
            roles: handlers.flatMap(handler => handler.authorizeRoles || []),
          });
        }
      } else if (layer.handle?.stack) {
        if (layer.regexp.fast_slash) walk(layer.handle.stack, prefix, file);
        else {
          const mount = layer.regexp.source.match(/^\^\\\/(.*?)\\\/\?\(\?=/);
          if (!mount) throw new Error(`Unsupported nested mount: ${layer.regexp.source}`);
          walk(layer.handle.stack, prefix + '/' + mount[1].replace(/\\\//g, '/'), file);
        }
      }
    }
  }
  for (const [, prefix, module, build] of source.matchAll(/app\.use\('([^']+)', require\('([^']+)'\)(\.buildV1Router\(\))?\);/g)) {
    const file = path.resolve(path.dirname(server), module);
    const exported = require(file);
    walk((build ? exported.buildV1Router() : exported).stack, prefix, module);
  }
  return routes;
}

module.exports = { mountedRoutes };
