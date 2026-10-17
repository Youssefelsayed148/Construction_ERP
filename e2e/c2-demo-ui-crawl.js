'use strict';

const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const target={projectName:'erp-demo-20261017',baseUrl:'http://127.0.0.1:8092',dbName:'construction_erp_demo',dbHost:'127.0.0.1',dbPort:'55442'};
const credentialFile=path.join(root,'.demo-users.json');
const credentials=JSON.parse(fs.readFileSync(credentialFile,'utf8'));
if(JSON.stringify(credentials.target)!==JSON.stringify(target)||credentials.accounts.length!==38)throw new Error('demo target or account roster mismatch');
const base=new URL(target.baseUrl);
const output={target:target.projectName,accounts:credentials.accounts.length,languages:['en','ar'],jobs:[],externalBlocked:[],writesBlocked:[],started:new Date().toISOString()};
function routeOf(value){try{const url=new URL(value,base);if(url.origin!==base.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/uploads/')||/login|logout/i.test(url.pathname))return null;return `${url.pathname}${url.search}`;}catch(_){return null;}}
async function crawl(browser,account,language){
  const row={role:account.key,language,pages:[],pageErrors:[],httpErrors:[],requestFailures:[],locale:{}};output.jobs.push(row);
  const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:false});
  let loginPostAllowed=true;let currentRoute='';
  await context.addInitScript(locale=>localStorage.setItem('locale',locale),language);
  await context.route('**/*',async route=>{
    const request=route.request();let url;
    try{url=new URL(request.url());}catch(_){return route.abort();}
    if(url.origin!==base.origin){output.externalBlocked.push({role:account.key,language,path:url.pathname});return route.abort();}
    const method=request.method();
    if(['GET','HEAD','OPTIONS'].includes(method))return route.continue();
    if(loginPostAllowed&&method==='POST'&&url.pathname==='/api/auth/login')return route.continue();
    output.writesBlocked.push({role:account.key,language,method,path:url.pathname});return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(5000);
  page.on('pageerror',error=>row.pageErrors.push({route:currentRoute,name:error.name||'Error'}));
  page.on('response',response=>{if(response.status()>=400)row.httpErrors.push({route:currentRoute,path:new URL(response.url()).pathname,status:response.status()});});
  page.on('requestfailed',request=>row.requestFailures.push({route:currentRoute,path:new URL(request.url()).pathname,error:request.failure()?.errorText||'request_failed'}));
  try{
    const loginResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/login',{timeout:15000}).catch(()=>null);
    await page.goto(`${target.baseUrl}/login`,{waitUntil:'domcontentloaded'});
    await page.locator('#login-email').fill(account.email);await page.locator('#login-password').fill(account.password);
    await Promise.all([page.waitForURL(url=>!url.pathname.endsWith('/login'),{timeout:20000}),page.locator('form button[type="submit"]').click()]);
    const response=await loginResponse;loginPostAllowed=false;
    row.loginStatus=response?response.status():0;
    if(row.loginStatus!==200){row.loginError='login did not return HTTP 200';return row;}
    const queue=[];const visited=new Set();
    const enqueue=value=>{const route=routeOf(value);if(route&&!visited.has(route)&&!queue.includes(route))queue.push(route);};
    enqueue(page.url());for(const href of await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.href)))enqueue(href);
    while(queue.length){const route=queue.shift();if(visited.has(route))continue;visited.add(route);currentRoute=route;
      try{const navigation=await page.goto(new URL(route,target.baseUrl).toString(),{waitUntil:'domcontentloaded',timeout:15000});await page.waitForTimeout(80);
        const lang=await page.locator('html').getAttribute('lang');const dir=await page.locator('html').getAttribute('dir');row.pages.push({route,status:navigation?.status()||0,lang,dir});
        const hrefs=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.href));for(const href of hrefs)enqueue(href);
      }catch(error){row.pages.push({route,error:error.name||'Error'});}
    }
    row.locale={expected:language,observed:row.pages[0]?.lang||await page.locator('html').getAttribute('lang'),matches:row.pages.every(p=>p.lang===language||p.error)};
  }catch(error){row.loginError=error.name||'Error';loginPostAllowed=false;}
  finally{await context.close();}
  return row;
}
async function main(){
  const browser=await chromium.launch({headless:true});
  try{
    const queue=credentials.accounts.flatMap(account=>['en','ar'].map(language=>({account,language})));let next=0;
    const workers=Array.from({length:3},async()=>{while(next<queue.length){const job=queue[next++];await crawl(browser,job.account,job.language);if(next%8===0)process.stdout.write(`jobs_started=${next}/76\n`);}});
    await Promise.all(workers);
  }finally{await browser.close();}
  output.finished=new Date().toISOString();
  const pages=output.jobs.flatMap(job=>job.pages);const errors=output.jobs.flatMap(job=>job.pageErrors);
  const result={target:output.target,accounts:output.accounts,jobs:output.jobs.length,loginsOk:output.jobs.filter(j=>j.loginStatus===200).length,
    pages:pages.length,uniqueRoutes:new Set(pages.map(p=>p.route)).size,pageErrors:errors.length,reactCrashes:errors.length,
    http500:output.jobs.flatMap(j=>j.httpErrors).filter(x=>x.status===500).length,httpErrors:output.jobs.reduce((n,j)=>n+j.httpErrors.length,0),
    requestFailures:output.jobs.reduce((n,j)=>n+j.requestFailures.length,0),localeMismatches:output.jobs.filter(j=>!j.locale.matches).length,
    externalBlocked:output.externalBlocked.length,writesBlocked:output.writesBlocked.length,
    failures:output.jobs.filter(j=>j.loginStatus!==200||j.pageErrors.length||j.httpErrors.some(e=>e.status>=500)||j.locale.matches===false)
      .map(j=>({role:j.role,language:j.language,loginStatus:j.loginStatus,loginError:j.loginError,pageErrors:j.pageErrors.length,http500:j.httpErrors.filter(e=>e.status===500).length,locale:j.locale}))};
  fs.writeFileSync(path.join(root,'.scratch-company-demo','c2-ui-crawl.json'),JSON.stringify(output,null,2)+'\n','utf8');
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if(result.loginsOk!==76||result.pageErrors||result.http500||result.localeMismatches)process.exitCode=1;
}
main().catch(error=>{process.stderr.write(`${error.name||'Error'}\n`);process.exitCode=1;});
