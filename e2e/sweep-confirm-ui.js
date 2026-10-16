'use strict';
const {chromium}=require('playwright');
const c=require('../backend/src/scripts/sweep-common');
async function main(){
  const env=c.config();c.assertClone(env);const output=[];const browser=await chromium.launch();
  try{
    for(const role of ['procurement_officer','storekeeper'])for(const locale of ['en','ar']){
      const session=await c.login(c.credentials().find(a=>a.key===role));
      const context=await browser.newContext();
      await context.addInitScript(({token,user,locale})=>{localStorage.setItem('token',token);localStorage.setItem('user',JSON.stringify(user));localStorage.setItem('locale',locale);},{token:session.token,user:session.user,locale});
      await context.route('**/*',async route=>{const req=route.request();const url=new URL(req.url());if(url.origin!==env.baseUrl||!['GET','HEAD','OPTIONS'].includes(req.method()))return route.abort();c.assertClone({baseUrl:url.origin,dbName:env.DB_NAME});return route.continue();});
      const page=await context.newPage();let current;
      page.on('pageerror',error=>current.errors.push(error.message.replace(/eyJ\S+/g,'[REDACTED]')));
      for(const route of ['/dashboard','/my-actions']){
        current={role,locale,route,errors:[]};await page.goto(env.baseUrl+route);await page.waitForTimeout(600);current.bodyLength=(await page.locator('body').innerText()).length;output.push(current);
      }
      await context.close();
    }
    c.save('ui-confirm.json',output);console.log(JSON.stringify(output));
  }finally{await browser.close();}
}
if(require.main===module)main().catch(error=>{console.error(`UI confirmation stopped: ${error.name}; raw error suppressed`);process.exitCode=1;});
