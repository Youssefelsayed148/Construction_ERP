'use strict';
const fs=require('fs');
const path=require('path');
const c=require('./sweep-common');
c.assertClone(c.config());
const read=name=>JSON.parse(fs.readFileSync(path.join(c.artifacts,name),'utf8'));
const phase=process.argv[2];
if(phase==='clone')console.log(JSON.stringify(read('clone.json'),null,2));
else if(phase==='api') {
  const a=read('api.json');const live={};for(const r of require('./sweep-routes').enumerate())live[r.method]=(live[r.method]||0)+1;
  console.log(JSON.stringify({registeredNow:live,accounts:a.accounts.length,gets:a.gets.length,writes:a.writes.length,skippedWriteRoutes:a.skips.length,get5xx:a.gets.filter(r=>r.status>=500).length,write5xx:a.writes.filter(r=>r.status>=500).length,unexpectedAccess:a.findings.filter(r=>r.kind==='unexpected_access').length,projectLeakFlags:a.findings.filter(r=>r.kind==='project_leak').length,noIdRequests:a.gets.filter(r=>!r.idAvailable).length,paginationOver200:a.pagination.length,completed:a.finished},null,2));
}else if(phase==='ui') {
  const u=read('ui.json');console.log(JSON.stringify({roles:new Set(u.pages.map(r=>r.role)).size,languages:new Set(u.pages.map(r=>r.language)).size,routes:new Set(u.pages.map(r=>r.route)).size,pages:u.pages.length,clicked:u.controls.filter(r=>r.clicked).length,skipped:u.controls.filter(r=>r.skipped).length,screenshotsPresent:u.pages.filter(r=>fs.existsSync(path.join(c.root,r.screenshot))).length,exceptions:u.exceptions.length,completed:u.finished||false},null,2));
}else if(phase==='invariants') {
  const i=read('invariants-after.json');console.log(JSON.stringify({money:i.checks.money,trialBalance:i.checks.trialBalance,unbalancedEntries:i.checks.unbalancedEntries.length,poDisagreements:i.checks.poQuantities,duplicateNumbers:i.checks.duplicateNumbers.length,listCounts:i.checks.listCounts.map(({request,total,sqlCount,match})=>({request,total,sqlCount,match})),errors:i.errors},null,2));
}else throw new Error('Expected clone|api|ui|invariants');
