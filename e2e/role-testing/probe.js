const { call } = require('./lib');
(async () => {
  const [role, ...ps] = process.argv.slice(2);
  for (const p of ps) { const [m, u] = p.split(' '); const r = await call(role, m, u, {}); console.log(m, u, r.status, JSON.stringify(r.body).slice(0, 700)); }
})();
