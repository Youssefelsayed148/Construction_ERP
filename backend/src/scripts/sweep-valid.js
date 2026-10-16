'use strict';
const { Pool }=require('pg');
const c=require('./sweep-common');

// Bounded successful-body coverage using clone references; never issues/posts/pays/sends anything.
async function main(){
  const env=c.config();c.assertClone(env);Object.assign(process.env,env);
  const pool=new Pool({host:'127.0.0.1',port:55441,database:env.DB_NAME,user:env.DB_USER,password:env.DB_PASSWORD,options:'-c default_transaction_read_only=on'});
  const q=(text,params)=>pool.query(text,params);
  const output={requests:[],skipped:[],started:new Date().toISOString()};
  try{
    if((await q('SELECT current_database() AS name')).rows[0].name!==env.DB_NAME)throw new Error('Refusing sweep identity');
    const auth=await c.login(c.credentials().find(a=>a.key==='owner_ceo'));
    const reader=await c.login(c.credentials().find(a=>a.key==='client_reviewer'));
    const pid=(await q('SELECT project_id FROM user_project_roles WHERE user_id=$1 AND project_id IS NOT NULL LIMIT 1',[auth.user.id])).rows[0].project_id;
    const refs=(await q('SELECT p.client_id,(SELECT supplier_id FROM purchase_orders WHERE project_id=p.id ORDER BY id LIMIT 1) AS supplier_id,(SELECT id FROM item_master WHERE deleted_at IS NULL ORDER BY id LIMIT 1) AS material_id FROM projects p WHERE p.id=$1',[pid])).rows[0];
    const audit=async uid=>(await q('SELECT ((SELECT count(*) FROM audit_events WHERE user_id=$1 OR actor_id=$1)+(SELECT count(*) FROM activity_log WHERE user_id=$1))::int AS n',[uid])).rows[0].n;
    const run=async(method,route,body,{session=auth,variant='valid'}={})=>{
      const before=await audit(session.user.id);
      const result=await c.request(route,{method,body,token:session.token});
      output.requests.push({role:session===auth?'owner_ceo':'client_reviewer',method,request:route,body,variant,status:result.status,errorCode:result.data?.error_code,auditDelta:(await audit(session.user.id))-before});
      return result.data?.data;
    };
    const tag=`SWEEPVALID-${Date.now()}`;
    const common={code:tag,name_en:tag,name_ar:'اختبار'};
    await run('POST','/api/clients',{...common,client_type:'organization'});
    await run('POST','/api/suppliers',{...common,specialty:'other'});
    await run('POST','/api/organizations',{...common,org_type:'supplier'});
    await run('POST','/api/projects',{name_en:tag,name_ar:'اختبار',project_type:'commercial'});
    if(refs.client_id)await run('PUT',`/api/clients/${refs.client_id}`,{city:'Sweep city'});
    if(refs.supplier_id)await run('PUT',`/api/suppliers/${refs.supplier_id}`,{city:'Sweep city'});
    await run('PUT',`/api/projects/${pid}`,{city:'Sweep city'});
    if(refs.material_id&&refs.supplier_id){
      const line={material_id:refs.material_id,quantity:1,unit:'ea',estimated_unit_price:1};
      const pr=await run('POST','/api/procurement/pr',{title:tag,project_id:pid,lines:[line]});
      if(pr?.id)await run('PUT',`/api/procurement/pr/${pr.id}`,{title:`${tag}-edited`});
      await run('POST','/api/procurement/rfq',{title:tag,project_id:pid,lines:[{material_id:refs.material_id,quantity:1,unit:'ea'}]});
      await run('POST','/api/procurement/po',{project_id:pid,supplier_id:refs.supplier_id,lines:[{material_id:refs.material_id,quantity:1,unit:'ea',unit_rate:1}]});
      // A schema-valid business write is denied for the read-only seat, beyond the malformed probes.
      await run('POST','/api/procurement/pr',{title:tag,project_id:pid,lines:[line]},{session:reader,variant:'valid_read_only_probe'});
    }
    output.finished=new Date().toISOString();c.save('valid.json',output);
    console.log(JSON.stringify({requests:output.requests.length,statuses:output.requests.map(({role,method,request,status,auditDelta})=>({role,method,request,status,auditDelta})),success:output.requests.filter(r=>r.status<300).length,serverErrors:output.requests.filter(r=>r.status>=500).length}));
  }finally{c.save('valid.json',output);await pool.end();}
}
if(require.main===module)main().catch(error=>{console.error(`Valid-body sweep stopped: ${error.name}; raw error suppressed`);process.exitCode=1;});
