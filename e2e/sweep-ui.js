'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const c = require('../backend/src/scripts/sweep-common');
const roles = ['owner_ceo','coo','procurement_officer','storekeeper','accountant_ap','accountant_ar','finance_manager','site_engineer','qa_qc_manager','hse_manager','hr_manager','client_reviewer','supplier_sales','unassigned'];
const deny = /logout|log out|delete|void|cancel|reject|approve|post\b|pay\b|send|rotate|revoke|تسجيل الخروج|حذف|إلغاء|رفض|اعتماد|موافقة|ترحيل|دفع|سداد|إرسال|تدوير|إبطال|إلغاء الصلاحية/i;
const localeControl = /^(EN|AR|ع|العربية|English|عربي)$|switch language|تبديل اللغة|تغيير اللغة/i;
const selector = 'a,button,[role="button"],[role="tab"],input[type="button"],input[type="submit"]';
const stateSelector = 'main,[role="main"],.page-content,.content';
async function main() {
  const env = c.config(); c.assertClone(env);
  const output = process.argv.includes('--resume') && fs.existsSync(path.join(c.artifacts,'ui.json'))
    ? JSON.parse(fs.readFileSync(path.join(c.artifacts,'ui.json'),'utf8'))
    : { roles, languages:['en','ar'], pages:[], controls:[], exceptions:[], blocked:[], started:new Date().toISOString() };
  output.discovered ||= {};
  const secrets = c.credentials().map(a=>a.password).filter(Boolean);
  const redact = value => {
    let text = String(value);
    for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
    return text.replace(/Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED]').slice(0,2000);
  };
  const checkpoint = () => c.save('ui.json',output);
  const browser = await chromium.launch({ headless:true });
  try {
    async function crawl(role,language) {
      const context = await browser.newContext({ viewport:{width:1280,height:900}, acceptDownloads:false });
      await context.addInitScript(locale=>localStorage.setItem('locale',locale),language);
      let loginAllowed = true; let current;
      await context.route('**/*', async route=>{
        const request = route.request(); const url = new URL(request.url());
        if (!['http:','https:'].includes(url.protocol)) return route.continue();
        c.assertClone({baseUrl:url.origin,dbName:env.DB_NAME});
        if (url.origin !== env.baseUrl) { output.blocked.push({role,language,reason:'external request',path:url.pathname}); return route.abort(); }
        if (!['GET','HEAD','OPTIONS'].includes(request.method()) && !(loginAllowed && request.method()==='POST' && url.pathname==='/api/auth/login')) {
          output.blocked.push({role,language,reason:'UI phase disallows writes',method:request.method(),path:url.pathname}); return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(3000);
      page.on('dialog',dialog=>{ if(current)current.dialogs.push({type:dialog.type(),message:redact(dialog.message())}); dialog.dismiss(); });
      page.on('console',message=>{if(current && ['error','warning'].includes(message.type()))current.console.push({type:message.type(),message:redact(message.text())});});
      page.on('pageerror',error=>{const row={role,language,page:current?.route,message:redact(error.message)};output.exceptions.push(row);if(current)current.exceptions.push(row);});
      page.on('response',response=>{if(current && response.status()>=400)current.network.push({method:response.request().method(),path:new URL(response.url()).pathname,status:response.status()});});
      page.on('requestfailed',request=>{if(current)current.network.push({method:request.method(),path:new URL(request.url()).pathname,failure:redact(request.failure()?.errorText)});});
      page.on('request',()=>{if(current)current.requestCount=(current.requestCount||0)+1;});
      await page.goto(env.baseUrl+'/login');
      const account = c.credentials().find(a=>a.key===role);
      await page.locator('#login-email').fill(account.email); await page.locator('#login-password').fill(account.password);
      await Promise.all([page.waitForURL(url=>!url.pathname.endsWith('/login')),page.locator('form button[type="submit"]').click()]);
      loginAllowed=false;
      // Subsequent controls cannot submit forms, even if a handler forgets type=button.
      await page.evaluate(()=>document.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();},true));
      await page.addInitScript(()=>document.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();},true));
      await page.waitForTimeout(250);
      const jobKey=`${role}:${language}`;
      const queue = []; const visited = new Set(output.pages.filter(p=>p.role===role&&p.language===language).map(p=>p.route));
      const sharedLinks = new Set(output.controls.filter(p=>p.role===role&&p.language===language&&p.clicked&&p.href).map(p=>p.href));
      const enqueue = value => {
        let url;try{url=new URL(value,env.baseUrl);}catch(_){return;}
        if(url.origin===env.baseUrl && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/uploads/') && !/logout|login/.test(url.pathname)) {
          const route=url.pathname+url.search;
          output.discovered[jobKey] ||= [];
          if(!output.discovered[jobKey].includes(route))output.discovered[jobKey].push(route);
          if(!visited.has(route)&&!queue.includes(route))queue.push(route);
        }
      };
      enqueue(page.url());
      for(const route of output.discovered[jobKey]||[])enqueue(route);
      for(const link of await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))))enqueue(link);
      const scan = async row=>{
        row.actualLocale=await page.locator('html').getAttribute('lang');
        row.localeMatches=row.actualLocale===language;
        const text = await page.locator('body').innerText();
        row.rawKeys=[...new Set(text.match(/\b[a-z][a-zA-Z0-9_]*\.[a-z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_.]*\b/g)||[])].filter(k=>!k.includes('example.com'));
        row.invalidText=[...new Set(text.match(/\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/g)||[])];
        row.emptyState=/no .*(?:found|yet|available)|لا توجد|لا يوجد|فارغ/i.test(text);
        if(language==='ar') {
          const words=await page.locator('button,label,h1,h2,h3,[role="tab"],nav a').allTextContents();
          row.latinSystemCandidates=[...new Set(words.filter(word=>/[A-Za-z]/.test(word)&&!/^\s*(?:EN|AR|PDF|CSV|XLSX|API|ERP|Osiris|ConERP|BOQ|PR|RFQ|PO|GRN|MIR|WIR|NCR|ITP|HSE|QHSE|QA|QC|ID|EGP|USD|ISO|RFI|WBS|Rev\b)/i.test(word.trim())).map(word=>redact(word.trim())))];
          row.overflow=[];
          for(const width of [1280,390]) {
            await page.setViewportSize({width,height:900});await page.waitForTimeout(40);
            row.overflow.push(await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dir:document.documentElement.dir,overflow:document.documentElement.scrollWidth>innerWidth+1})));
          }
          await page.setViewportSize({width:1280,height:900});
        }
        const filename=`${role}-${language}-${String(output.pages.length).padStart(4,'0')}-${output.controls.length}.png`;
        await page.screenshot({path:path.join(c.artifacts,'screenshots',filename),fullPage:true,mask:[page.locator('input,textarea,pre,code')]});row.screenshot=`.sweep/screenshots/${filename}`;
      };
      while(queue.length) {
        const route=queue.shift();if(visited.has(route))continue;visited.add(route);
        const row={role,language,route,console:[],network:[],exceptions:[],dialogs:[],states:[]};current=row;
        await page.goto(env.baseUrl+route,{waitUntil:'domcontentloaded'});await page.waitForTimeout(180);
        for(const href of await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))))enqueue(href);
        await scan(row);
        const seenControls=new Set();let discovery=true;
        while(discovery) {
          discovery=false;
          const controls=await page.locator(selector).evaluateAll(nodes=>nodes.map((node,index)=>({index,tag:node.tagName,label:(node.getAttribute('aria-label')||node.getAttribute('title')||node.innerText||node.value||'').trim().slice(0,160),href:node.getAttribute('href'),type:node.getAttribute('type'),form:!!node.form,role:node.getAttribute('role'),localeControl:node.classList.contains('locale-toggle'),confirmDialog:!!node.closest('[role="alertdialog"]')||/are you sure|confirm|هل أنت متأكد|تأكيد/i.test(node.closest('[role="dialog"]')?.innerText||''),disabled:node.disabled||node.getAttribute('aria-disabled')==='true',visible:!!(node.offsetWidth||node.offsetHeight||node.getClientRects().length)})));
          controls.sort((a,b)=>Number(b.role==='tab')-Number(a.role==='tab')||Number(/^(?:add|new|إضافة|جديد)/i.test(a.label))-Number(/^(?:add|new|إضافة|جديد)/i.test(b.label)));
          for(const control of controls) {
            const key=JSON.stringify([control.tag,control.label,control.href,control.role,control.type]);if(seenControls.has(key))continue;seenControls.add(key);
            const record={role,language,page:route,label:redact(control.label),href:control.href,disabled:control.disabled};
            let reason;
            if(!control.visible)reason='not visible';else if(control.disabled)reason='disabled';else if(deny.test(control.label+' '+(control.href||'')))reason='denylist: asserted rendered/enabled state';
            else if(control.confirmDialog)reason='confirmation dialog prohibited';
            else if(control.href && sharedLinks.has(control.href))reason='shared link already exercised in this role/language';
            else if(control.localeControl||localeControl.test(control.label))reason='locale fixed for this pass';
            else if(control.type==='submit'||(control.form&&control.tag==='BUTTON'&&control.type!=='button'))reason='form submission prohibited';
            else if(!control.label&&!control.href)reason='unlabeled control requires manual safety review';
            else if(control.href && /^(?:https?:|mailto:|tel:|javascript:)/i.test(control.href))reason='external or executable link';
            if(reason){record.skipped=reason;output.controls.push(record);continue;}
            const element=page.locator(selector).nth(control.index);
            try {
              if(!(await element.isVisible())){record.skipped='DOM changed before click';output.controls.push(record);continue;}
              const before=await page.locator('body').innerHTML();const networkBefore=row.requestCount||0;const beforeUrl=page.url();
              if(control.href)enqueue(control.href);
              await element.click({trial:true,timeout:300});
              await element.click({timeout:1500});await page.waitForTimeout(40);
              if(control.href)sharedLinks.add(control.href);
              record.clicked=true;
              record.noDomOrNetworkChange=before===await page.locator('body').innerHTML()&&networkBefore===(row.requestCount||0)&&beforeUrl===page.url();
              if(control.role==='tab'){const state={tab:record.label};await scan(state);row.states.push(state);}
              for(const href of await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))))enqueue(href);
              if(page.url()!==beforeUrl) {
                enqueue(page.url());await page.goto(beforeUrl,{waitUntil:'domcontentloaded'});await page.waitForTimeout(70);
              } else discovery=true;
            } catch(error){record.skipped=`click failed: ${error.name}`;}
            output.controls.push(record);
            // Re-enumerate after every click to avoid stale indices and to discover tab/modal controls.
            if(record.clicked){discovery=true;break;}
          }
        }
        await scan(row);output.pages.push(row);checkpoint();
      }
      console.log(`UI completed ${role} ${language}: routes=${visited.size}; cumulative pages=${output.pages.length}; clicked=${output.controls.filter(r=>r.clicked).length}`);
      current=null;await context.close();
    }
    const jobs=[...roles];let nextJob=0;
    await Promise.all(Array.from({length:3},async()=>{while(nextJob<jobs.length){const role=jobs[nextJob++];await crawl(role,'en');await crawl(role,'ar');}}));
    output.finished=new Date().toISOString();checkpoint();
    console.log(JSON.stringify({roles:roles.length,routes:new Set(output.pages.map(r=>r.route)).size,pages:output.pages.length,clicked:output.controls.filter(r=>r.clicked).length,skipped:output.controls.filter(r=>r.skipped).length,exceptions:output.exceptions.length}));
  }finally{checkpoint();await browser.close();}
}
fs.mkdirSync(path.join(c.artifacts,'screenshots'),{recursive:true});
if(require.main===module)main().catch(error=>{console.error(`UI sweep stopped: ${error.name}; raw error suppressed`);process.exitCode=1;});
