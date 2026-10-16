'use strict';
const fs = require('fs');
const path = require('path');
const c = require('./sweep-common');

function snapshotCounts(tables) {
  const counts=Object.fromEntries(tables.map(table=>[table,0]));let active;
  for(const line of fs.readFileSync(path.join(c.artifacts,'pilot.sql'),'utf8').split('\n')) {
    const match=line.match(/^COPY public\.(\w+) /);
    if(match)active=match[1];else if(line==='\\.')active=null;else if(Object.hasOwn(counts,active))counts[active]++;
  }
  return counts;
}
async function main() {
  c.assertClone(c.config());
  const redact = text => {
    let value=String(text);
    const env=c.config();
    for(const key of ['DB_PASSWORD','JWT_SECRET','WEBHOOK_ENCRYPTION_KEY'])value=value.split(env[key]).join('[REDACTED]');
    for(const account of c.credentials())value=value.split(account.password).join('[REDACTED]');
    return value.replace(/Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED]');
  };
  const logs=redact(c.docker([...c.composeArgs(),'logs','--no-color','backend']));
  const lines=logs.split('\n');
  const known=lines.filter(line=>/\[WEBHOOK\] global\.eventBus unavailable/.test(line));
  const errors=lines.filter(line=>/error|stack|unhandled|\s+at\s+\S+/i.test(line)&&!known.includes(line));
  const result={observedAt:new Date().toISOString(),logLines:lines.length,knownWebhook:known,errors:[...new Set(errors)]};
  result.migrations=c.docker([...c.composeArgs(),'logs','--no-color','migrate']).split('\n').filter(line=>/all migrations completed/.test(line));
  const auditTables=['audit_events','activity_log','event_log'];
  result.auditSnapshot=snapshotCounts(auditTables);
  result.auditCurrent=Object.fromEntries(auditTables.map(table=>[table,c.sql(`SELECT to_json(count(*)) FROM ${table}`)[0]]));
  result.createdClientActivity=c.sql("SELECT json_build_object('action',action,'module',module,'entity_id',entity_id,'created_at',created_at) FROM activity_log WHERE module='clients' AND description LIKE '%SWEEP-%' ORDER BY id");
  const auth=await c.login(c.credentials().find(a=>a.key==='owner_ceo'));
  result.ownerProjectCreateGrant=c.sql(`SELECT json_build_object('role',r.key,'module',p.module,'action',p.action,'project_id',upr.project_id) FROM user_project_roles upr JOIN roles r ON r.id=upr.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE upr.user_id=${Number(auth.user.id)} AND p.module='projects' AND p.action='create' AND (upr.expires_at IS NULL OR upr.expires_at>=CURRENT_DATE)`);
  result.organizationDeactivateAudit=c.sql(`SELECT json_build_object('entity',entity,'entity_id',entity_id,'action',action) FROM audit_events WHERE user_id=${Number(auth.user.id)} AND entity='organization' AND entity_id=1 ORDER BY id`);
  const rfqFirst=await c.request('/api/procurement/rfq?limit=1&offset=0',{token:auth.token});
  const rfqSecond=await c.request('/api/procurement/rfq?limit=1&offset=1',{token:auth.token});
  result.rfqPagination={first:{status:rfqFirst.status,total:rfqFirst.total,ids:rfqFirst.data?.data?.map(r=>r.id)},second:{status:rfqSecond.status,total:rfqSecond.total,ids:rfqSecond.data?.data?.map(r=>r.id)}};
  // Compare COPY records to establish whether invalid probes changed business fields. Values stay private.
  const after=c.docker([...c.composeArgs(),'exec','-T','db','sh','-c','exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl']);
  function copyRows(text){const tables={};let table;for(const line of text.split('\n')){const match=line.match(/^COPY public\.(\w+) \((.*?)\) FROM stdin;/);if(match){table=match[1];tables[table]={columns:match[2].split(', '),rows:new Map()};}else if(line==='\\.')table=null;else if(table)tables[table].rows.set(line.split('\t')[0],line);}return tables;}
  const beforeTables=copyRows(fs.readFileSync(path.join(c.artifacts,'pilot.sql'),'utf8'));const afterTables=copyRows(after);
  const infrastructure=new Set(['users','user_sessions','agent_sessions','audit_events','activity_log','event_log','event_outbox','distributed_rate_limits','rate_limits','v1_rate_limits','idempotency_keys','schema_migrations','background_sweep_runs','sweep_runs','sweep_leases','sweep_locks','webhook_deliveries']);
  result.changedBusinessTables=[];
  for(const [table,afterTable] of Object.entries(afterTables)){
    if(infrastructure.has(table))continue;const beforeTable=beforeTables[table];if(!beforeTable)continue;
    const added=[...afterTable.rows.keys()].filter(id=>!beforeTable.rows.has(id));const removed=[...beforeTable.rows.keys()].filter(id=>!afterTable.rows.has(id));
    const changed=[];
    for(const [id,row] of afterTable.rows){const previous=beforeTable.rows.get(id);if(previous&&previous!==row){const old=previous.split('\t');const next=row.split('\t');changed.push({id,columns:afterTable.columns.filter((_,index)=>old[index]!==next[index])});}}
    if(added.length||removed.length||changed.length)result.changedBusinessTables.push({table,addedIds:added,removedIds:removed,changed});
  }
  c.save('evidence.json',result);
  console.log(JSON.stringify({logLines:result.logLines,knownWebhook:known.length,errorLines:result.errors.length,auditSnapshot:result.auditSnapshot,auditCurrent:result.auditCurrent,createdClientActivity:result.createdClientActivity.length,changedBusinessTables:result.changedBusinessTables.map(r=>({table:r.table,added:r.addedIds.length,removed:r.removedIds.length,changed:r.changed.length})),rfqPagination:result.rfqPagination}));
}
if(require.main===module)main().catch(error=>{console.error(`Evidence collection stopped: ${error.name}; raw error suppressed`);process.exitCode=1;});
module.exports={snapshotCounts};
