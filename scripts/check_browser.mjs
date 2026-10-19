// Independent oracle: Node HTTP + Chromium DOM/URL handling, no Python resolver imports.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const demo=path.join(root,'build/demo');
const results=path.join(root,'results');
await fs.mkdir(results,{recursive:true});
const server=http.createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let target=path.resolve(demo,'.'+name);
  if(!target.startsWith(demo+path.sep)){res.writeHead(403).end();return;}
  if((await fs.stat(target)).isDirectory())target=path.join(target,'index.html');
  const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png'};
  res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');
  res.end(await fs.readFile(target));
 }catch{res.writeHead(404).end('Missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext();
 await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 const page=await context.newPage();
 await page.goto(origin+'/site/index.html');
 assert.equal(await page.locator('h1').textContent(),'Mozilla is cool');
 assert.equal(await page.locator('img').evaluate(x=>x.complete&&x.naturalWidth>0),true);
 assert.equal((await context.request.get(origin+'/site/styles/style.css')).status(),200);
 // Independent controlled-defect oracle reads the document's actual browser URLs.
 await page.goto(origin+'/controlled-site/index.html');
 const occurrences=await page.locator('#inspector-controls a, #inspector-controls img, #inspector-controls script').evaluateAll(nodes=>nodes.map(n=>({raw:n.getAttribute(n.tagName==='A'?'href':'src'),url:n.tagName==='A'?n.href:n.src})));
 const oracle=[];
 for(const occurrence of occurrences){
  // Root-relative URLs map to the site root, not the demo server's parent.
  const url=new URL(occurrence.url);
  if(occurrence.raw.startsWith('/'))url.pathname='/controlled-site'+url.pathname;
  const response=await context.request.get(url.href);
  let reason=response.status()===404?'missing_target':'local_target_exists';
  assert.ok([200,404].includes(response.status()));
  if(response.status()===200&&url.hash){
   const target=await context.newPage();await target.goto(url.href);
   const fragment=decodeURIComponent(url.hash.slice(1));
   const found=await target.evaluate(id=>!!document.getElementById(id)||[...document.getElementsByName(id)].some(x=>x.tagName==='A'),fragment);
   if(!found)reason='missing_anchor';await target.close();
  }
  oracle.push({url:occurrence.raw,reason});
 }
 assert.equal(oracle.length,8);
 const actual=JSON.parse(await fs.readFile(path.join(demo,'controlled-report/report.json'),'utf8'));
 for(const expected of oracle){const row=actual.links.find(x=>x.url===expected.url);assert.ok(row);assert.equal(row.reason,expected.reason,expected.url);}
 assert.deepEqual(oracle.filter(x=>x.reason!=='local_target_exists').map(x=>x.url),['missing-page.html','images/missing-image.png','#absent-anchor']);
 await context.close();
 // The entire report workflow runs from file:// with network disabled.
 const offline=await browser.newContext({offline:true,viewport:{width:1280,height:900}});
 const report=await offline.newPage();const errors=[];report.on('pageerror',e=>errors.push(e.message));
 await report.goto(pathToFileURL(path.join(demo,'index.html')).href);
 await report.getByRole('link',{name:'2. Explore the three injected defects'}).click();
 assert.equal(await report.locator('article').count(),12);
 await report.getByLabel('Status').selectOption('failed');
 assert.equal(await report.locator('article').count(),3);
 await report.getByLabel('Search source, URL, or reason').fill('absent-anchor');
 assert.equal(await report.locator('article').count(),1);
 await report.locator('summary').click();
 assert.equal(await report.locator('details').getAttribute('open'),'');
 assert.match(await report.locator('.detail').textContent(),/missing_anchor/);
 assert.match(await report.locator('pre').textContent(),/href="#absent-anchor"/);
 assert.match(await report.locator('summary').textContent(),/index\.html:\d+:\d+/);
 await report.screenshot({path:path.join(results,'report-desktop.png'),fullPage:true});
 await report.getByRole('button',{name:'Reset filters'}).click();assert.equal(await report.locator('article').count(),12);
 await report.getByLabel('Status').selectOption('skipped');assert.equal(await report.locator('article').count(),2);
 await report.getByLabel('Search source, URL, or reason').fill('no-such-match');assert.equal(await report.locator('article').count(),0);
 assert.match(await report.locator('#findings').textContent(),/No occurrences match/);
 await report.getByRole('button',{name:'Reset filters'}).click();
 const downloadPromise=report.waitForEvent('download');await report.getByRole('link',{name:'Download full JSON'}).click();
 const download=await downloadPromise;const downloaded=await download.path();
 assert.deepEqual(JSON.parse(await fs.readFile(downloaded,'utf8')),actual);
 await report.setViewportSize({width:390,height:844});
 await report.getByLabel('Status').selectOption('failed');await report.locator('summary').first().click();
 assert.equal(await report.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await report.screenshot({path:path.join(results,'report-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 await offline.close();
 const evidence={browser:browser.version(),oracle,real_site:{html_loaded:true,image_loaded:true,stylesheet_status:200},offline_workflow:['demo navigation','all occurrences','status filter','search','finding expansion','source context','resolution evidence','reset','skipped filter','empty result','JSON download','mobile layout'],page_errors:errors};
 await fs.writeFile(path.join(results,'browser.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
