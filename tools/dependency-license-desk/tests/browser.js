import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const port=4187,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['src/server.js'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','inherit']});
const ready=new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Server exited '+code)));});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'desk-browser-'));let browser;
try {
 await ready;browser=await chromium.launch({headless:true});const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.click('#demo');assert.equal(await page.inputValue('#root'),path.resolve('demo/source'));await page.click('#inspect');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('495 lockfile entries'));
 await page.fill('#query','node_modules/argparse');assert((await page.locator('#list button').count())>=1);await page.locator('#list button').first().click();await page.fill('#note','Browser review: retain raw declaration and evidence.');await page.reload();assert.equal(await page.inputValue('#query'),'node_modules/argparse');assert.equal(await page.inputValue('#note'),'Browser review: retain raw declaration and evidence.');assert.match(await page.textContent('#history'),/Historical/);
 await page.selectOption('#declaration','valid');await page.check('#unresolved');await page.uncheck('#unresolved');await page.selectOption('#declaration','');
 const jsonPromise=page.waitForEvent('download');await page.click('#json');const jsonDownload=await jsonPromise;const jsonFile=temp+'/review.json';await jsonDownload.saveAs(jsonFile);
 await page.evaluate(()=>localStorage.clear());await page.reload();await page.setInputFiles('#import',jsonFile);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Recovered'));assert.equal(await page.inputValue('#note'),'Browser review: retain raw declaration and evidence.');
 const htmlPromise=page.waitForEvent('download');await page.click('#html');const htmlDownload=await htmlPromise;const htmlFile=temp+'/review.html';await htmlDownload.saveAs(htmlFile);
 const offline=await browser.newContext({offline:true});const op=await offline.newPage();const requests=[];op.on('request',r=>requests.push(r.url()));await op.goto('file://'+htmlFile);assert.match(await op.textContent('body'),/Browser review: retain raw declaration/);assert.match(await op.textContent('body'),/Historical snapshot/);assert.equal(requests.filter(u=>/^https?:/.test(u)).length,0);await offline.close();
 // Labeled browser recovery control: change lock only, then remove evidence.
 const root=temp+'/control';await fs.mkdir(root);await fs.writeFile(root+'/package.json',JSON.stringify({name:'browser-control',version:'1',license:'MIT'}));await fs.writeFile(root+'/LICENSE','<script>window.injected=true</script>');const lock={lockfileVersion:3,packages:{'':{name:'browser-control',version:'1'}}};await fs.writeFile(root+'/package-lock.json',JSON.stringify(lock));
 await page.fill('#query','');await page.fill('#root',root);await page.click('#inspect');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('1 lockfile entries'));await page.fill('#note','Bound to original lock');lock.name='changed';await fs.writeFile(root+'/package-lock.json',JSON.stringify(lock));await page.click('#inspect');await page.waitForFunction(()=>document.querySelector('#detail').textContent.includes('STALE NOTE'));await page.fill('#note','Rebound after lock change');await fs.unlink(root+'/LICENSE');await page.click('#inspect');await page.waitForFunction(()=>document.querySelector('#detail').textContent.includes('No top-level license'));assert.match(await page.textContent('#detail'),/STALE NOTE/);assert.equal(await page.evaluate(()=>window.injected),undefined);
 // Malformed near-valid recovery must not replace the good saved review.
 const saved=await page.evaluate(()=>localStorage.getItem('license-desk-review-v1'));const malformed=JSON.parse(saved);malformed.filters={};await fs.writeFile(temp+'/malformed.json',JSON.stringify(malformed));await page.setInputFiles('#import',temp+'/malformed.json');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Recovery failed'));assert.equal(await page.evaluate(()=>localStorage.getItem('license-desk-review-v1')),saved);assert.equal(await page.inputValue('#note'),'Rebound after lock change');
 // Invalid recovery is explicit, and cross-origin inspection is denied.
 await fs.writeFile(temp+'/bad.json','{}');await page.setInputFiles('#import',temp+'/bad.json');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Recovery failed'));
 const response=await fetch(base+'/inspect',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://example.com'},body:JSON.stringify({root})});assert.equal(response.status,403);
 await page.fill('#root',path.resolve('demo/source'));await page.click('#inspect');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('495 lockfile entries'));await page.fill('#query','argparse');await fs.mkdir('results',{recursive:true});await page.setInputFiles('#import',[]);await page.screenshot({path:'results/demo.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS: real inspection, filters, notes/reload, JSON recovery, stale lock/evidence, inert text, HTML export, offline reopen, invalid import, origin rejection; no browser exceptions');
} finally {await browser?.close();server.kill();await fs.rm(temp,{recursive:true,force:true});}
