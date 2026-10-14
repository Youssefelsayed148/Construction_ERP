'use strict';

// group(keys, build): one fixture builder shared by a route and its v1 aliases.
// build(ctx) -> { params, query, body, status }; `:name` segments of each key's
// path are filled from params, so aliases need no copied payload code.
function group(keys, build) {
  return Object.fromEntries(keys.map(key => [key, async ctx => {
    const spec = await build(ctx, key);
    const route = key.split(' ')[1].replace(/:(\w+)(?:\([^)]*\))?\??/g, (_, name) => {
      if (spec.params?.[name] === undefined) throw new Error(`fixture ${key} lacks param ${name}`);
      return spec.params[name];
    });
    return { path: route + (spec.query ? `?${spec.query}` : ''), body: spec.body, status: spec.status ?? 200 };
  }]));
}

module.exports = { group };
