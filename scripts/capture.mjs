import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {serve} from './serve.mjs';
const server=await serve(4174);
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const evidence={capturedAt:new Date().toISOString(),browser:browser.version(),sourceRevision:(await readFile('fixtures/site-revision.txt','utf8')).trim(),source:'https://github.com/mdn/beginner-html-site-styled',license:'CC0-1.0 (fixtures/site/LICENSE)',settings:{headless:true,viewport:{width:1280,height:800},serviceWorkers:'block',recordHar:{mode:'full',content:'omit'},freshContextPerCapture:true,externalRequests:'Only mdn.github.io allowed publicly; only 127.0.0.1 locally. External font blocked explicitly.'},captures:[]};
try{
 for(const [name,url] of [['public','https://mdn.github.io/beginner-html-site-styled/'],['local','http://127.0.0.1:4174/fixtures/site/']]){
  const blocked=[];const context=await browser.newContext({viewport:evidence.settings.viewport,serviceWorkers:'block',recordHar:{path:`fixtures/${name}.har`,mode:'full',content:'omit'}});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===new URL(url).origin)return route.continue();blocked.push(u.href);return route.abort('blockedbyclient');});
  const page=await context.newPage();let error=null;try{await page.goto(url,{waitUntil:'networkidle',timeout:30000});}catch(e){error=e.message;}
  if(name==='local')await page.evaluate(async()=>{await Promise.all(['/control/slow','/control/redirect'].map(u=>fetch(u)));});
  await context.close();evidence.captures.push({name,url,blocked,navigationError:error,controls:name==='local'?['350ms delay','302 redirect to 503']:[],sha256:createHash('sha256').update(await readFile(`fixtures/${name}.har`)).digest('hex')});
 }
 for(const p of ['index.html','styles/style.css','images/firefox-icon.png','LICENSE']){evidence['sha256:'+p]=createHash('sha256').update(await readFile('fixtures/site/'+p)).digest('hex');}
 await writeFile('fixtures/provenance.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();server.close();}
