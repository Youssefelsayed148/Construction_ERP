// Phase 5.1b - legacy role switch DRY RUN (read-only).
//
// For every existing role seat (user_project_roles row) that holds a LEGACY role, shows the canonical role it
// would move to (user_legacy_role_aliases) and exactly which (module, action) permissions the user would
// gain and lose. Nothing is written: only SELECTs run. The switch itself is a separate, clearly labelled
// migration that is applied only after this report has been reviewed.
//
// Effective permissions are expanded against the permission catalog (the `permissions` table), so a blanket
// ('*','*') grant counts as every catalog pair and a ('module','*') grant as every action of that module.
'use strict';

function expandGrants(grants, catalog) {
  const out = new Set();
  for (const g of grants) {
    for (const pair of catalog) {
      const [m, a] = pair.split('|');
      const moduleOk = g.module === '*' || g.module === m;
      const actionOk = g.action === '*' || g.action === a;
      if (moduleOk && actionOk) out.add(pair);
    }
  }
  return out;
}

const pairLabel = (p) => p.replace('|', '.');

async function buildReport(q) {
  const catalog = (await q("SELECT DISTINCT module, action FROM permissions WHERE module <> '*' AND action <> '*' ORDER BY 1, 2"))
    .rows.map((r) => `${r.module}|${r.action}`);
  const aliases = (await q('SELECT legacy_role_key, canonical_role_key, notes FROM user_legacy_role_aliases ORDER BY 1')).rows;
  const aliasOf = new Map(aliases.map((a) => [a.legacy_role_key, a.canonical_role_key]));

  const grantRows = (await q(
    `SELECT r.key AS role_key, p.module, p.action
       FROM roles r JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p ON p.id = rp.permission_id`)).rows;
  const grantsByRole = new Map();
  for (const g of grantRows) {
    if (!grantsByRole.has(g.role_key)) grantsByRole.set(g.role_key, []);
    grantsByRole.get(g.role_key).push({ module: g.module, action: g.action });
  }
  const effective = (roleKey) => expandGrants(grantsByRole.get(roleKey) || [], catalog);
  const blanket = (roleKey) => (grantsByRole.get(roleKey) || []).some((g) => g.module === '*' && g.action === '*');
  const existingRoles = new Set((await q('SELECT key FROM roles')).rows.map((r) => r.key));

  // Role-level view (independent of who holds the role): what each mapping does to the permission set.
  const mappings = aliases.map((a) => {
    const before = effective(a.legacy_role_key);
    const after = effective(a.canonical_role_key);
    const lost = [...before].filter((p) => !after.has(p));
    const gained = [...after].filter((p) => !before.has(p));
    const lostByModule = {};
    for (const p of lost) { const m = p.split('|')[0]; lostByModule[m] = (lostByModule[m] || 0) + 1; }
    return {
      old_role: a.legacy_role_key, new_role: a.canonical_role_key, notes: a.notes,
      had_blanket_grant: blanket(a.legacy_role_key), permissions_before: before.size, permissions_after: after.size,
      lost_count: lost.length, gained_count: gained.length, lost_by_module: lostByModule,
    };
  });

  const seats = (await q(
    `SELECT upr.id AS seat_id, upr.user_id, upr.project_id, upr.expires_at, r.key AS old_role,
            u.name, u.email, u.role AS users_role, u.is_active
       FROM user_project_roles upr
       JOIN roles r ON r.id = upr.role_id
       JOIN users u ON u.id = upr.user_id
      WHERE r.key = ANY($1)
      ORDER BY u.id, upr.id`, [[...aliasOf.keys()]])).rows;

  const rows = seats.map((s) => {
    const newRole = aliasOf.get(s.old_role);
    const before = effective(s.old_role);
    const after = effective(newRole);
    const gained = [...after].filter((p) => !before.has(p)).sort();
    const lost = [...before].filter((p) => !after.has(p)).sort();
    return {
      seat_id: s.seat_id, user_id: s.user_id, name: s.name, email: s.email, is_active: s.is_active,
      users_role: s.users_role, project_id: s.project_id, expires_at: s.expires_at,
      old_role: s.old_role, new_role: newRole, new_role_exists: existingRoles.has(newRole),
      had_blanket_grant: blanket(s.old_role),
      permissions_before: before.size, permissions_after: after.size,
      gained: gained.map(pairLabel), lost: lost.map(pairLabel),
    };
  });

  const byRole = {};
  for (const r of rows) {
    const key = `${r.old_role} -> ${r.new_role}`;
    byRole[key] = byRole[key] || { seats: 0, users: new Set(), had_blanket_grant: r.had_blanket_grant, lost_total: 0, gained_total: 0 };
    byRole[key].seats += 1;
    byRole[key].users.add(r.user_id);
    byRole[key].lost_total += r.lost.length;
    byRole[key].gained_total += r.gained.length;
  }
  const summary = Object.entries(byRole).map(([mapping, v]) => ({
    mapping, seats: v.seats, users: v.users.size, had_blanket_grant: v.had_blanket_grant,
    lost_per_seat: v.seats ? v.lost_total / v.seats : 0, gained_per_seat: v.seats ? v.gained_total / v.seats : 0,
  }));

  return {
    generated_at: new Date().toISOString(),
    catalog_pairs: catalog.length,
    unmapped_legacy_roles: [...aliasOf.entries()].filter(([, to]) => !existingRoles.has(to)).map(([from]) => from),
    mappings,
    summary,
    seats: rows,
    notes: [
      'users.role (the coarse role the route role lists read) is NOT changed by this report or by the seat switch unless the switch migration says so.',
      'Seats with expires_at keep their expiry; a project-bound seat stays project-bound.',
      'A seat whose old role is already canonical (e.g. finance_manager) maps to itself and shows no change.',
    ],
  };
}

function toCsv(report) {
  const head = ['seat_id', 'user_id', 'name', 'email', 'is_active', 'users_role', 'project_id', 'old_role', 'new_role',
    'had_blanket_grant', 'permissions_before', 'permissions_after', 'gained_count', 'lost_count', 'lost'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')];
  for (const r of report.seats) {
    lines.push([r.seat_id, r.user_id, esc(r.name), esc(r.email), r.is_active, r.users_role, r.project_id ?? '', r.old_role, r.new_role,
      r.had_blanket_grant, r.permissions_before, r.permissions_after, r.gained.length, r.lost.length, esc(r.lost.join(' '))].join(','));
  }
  return lines.join('\n');
}

module.exports = { buildReport, expandGrants, toCsv };
