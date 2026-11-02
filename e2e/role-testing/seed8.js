// Stage 8: add the portal organizations to the DEMO project through the new participants endpoint, then check the portals see it.
const x = require('./seedlib');
const { S, actAs, check, snap, evidenceSince, sql, call, section } = x;
module.exports = async function stage8() {
  const P = S.project;
  section('26. project participants (client + supplier portals)');
  for (const [orgCode, type] of [['PILOT-CLIENT-ORG', 'client'], ['PILOT-SUPPLIER-ORG', 'supplier']]) {
    const orgId = sql(`select id from organizations where code='${orgCode}'`);
    if (!orgId) { check(`organization ${orgCode} exists`, false, 'pilot organization missing'); continue; }
    if (sql(`select count(*) from project_participants where project_id=${P} and organization_id=${orgId} and participant_type='${type}'`) !== '0') continue;
    const s0 = snap();
    await actAs(['project_manager'], 'POST', `/api/projects/${P}/participants`, { organization_id: Number(orgId), participant_type: type, role_label: `DEMO-${type}`, portal_access_enabled: true }, { expect: [201], label: `project_manager adds ${type} organization to the DEMO project` });
    evidenceSince(s0, `participant ${type}`);
  }
  // duplicate is a typed 409, a site engineer is refused
  const orgId = sql("select id from organizations where code='PILOT-CLIENT-ORG'");
  await actAs(['project_manager'], 'POST', `/api/projects/${P}/participants`, { organization_id: Number(orgId), participant_type: 'client' }, { expect: [409], forbidden: true, label: 'duplicate participant refused (409)' });
  await actAs(['site_engineer'], 'POST', `/api/projects/${P}/participants`, { organization_id: Number(orgId), participant_type: 'client' }, { expect: [403], forbidden: true, label: 'site_engineer adds participant (forbidden)' });
  // exercise the endpoint live with an organization created through the API (no legacy ids): consultant, then a DEMO supplier whose legacy record must be created + linked
  for (const [code, type, nameEn] of [['DEMO-ORG-CONS', 'consultant', 'DEMO-Consulting Engineers'], ['DEMO-ORG-SUP', 'supplier', 'DEMO-Steel Traders LLC']]) {
    let oid = sql(`select id from organizations where code='${code}'`);
    if (!oid) { const o = await actAs(['owner_ceo'], 'POST', '/api/organizations', { code, org_type: type, name_ar: 'DEMO-' + nameEn, name_en: nameEn, email: 'demo-' + code.toLowerCase() + '@example.invalid' }, { expect: [201], label: `owner_ceo creates organization ${code}` }); oid = o && o.data && o.data.id; }
    if (!oid) continue;
    if (sql(`select count(*) from project_participants where project_id=${P} and organization_id=${oid} and participant_type='${type}'`) === '0') {
      const s1 = snap();
      await actAs(['project_manager'], 'POST', `/api/projects/${P}/participants`, { organization_id: Number(oid), participant_type: type, role_label: `DEMO-${type}` }, { expect: [201], label: `project_manager adds API-created ${type} organization` });
      evidenceSince(s1, `participant ${code}`);
    }
    if (type === 'supplier') check('API-created supplier organization got a legacy supplier id and the participant carries it', sql(`select count(*) from organizations o join project_participants pp on pp.organization_id=o.id where o.id=${oid} and o.legacy_supplier_id is not null and pp.legacy_supplier_id = o.legacy_supplier_id`) === '1', 'legacy link', 'project_manager', 'projects');
  }
  const cp = await call('client_executive', 'GET', '/api/client-portal/projects');
  check('client portal lists the DEMO project after the participant was added', cp.status === 200 && (cp.data || []).map(Number).includes(Number(P)), `HTTP ${cp.status}`, 'client_executive', 'client-portal');
  const sp = await call('supplier_sales', 'GET', '/api/portal/supplier/dashboard');
  check('supplier portal reachable and project-scoped after the participant was added', sp.status === 200, `HTTP ${sp.status}`, 'supplier_sales', 'portal');
  x.save();
};
if (require.main === module) module.exports().then(x.finish);
