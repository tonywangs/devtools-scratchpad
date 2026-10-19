import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {parse,hash,createProject,report,serialize} from '../src/core.js';
const manifest=JSON.parse(await readFile('demo/manifest.json','utf8')),evidence=[];
for(const demo of manifest){
 const bytes=await readFile('demo/'+demo.patch);assert.equal(await hash(bytes),demo.sha256);
 assert.equal(await hash(await readFile('demo/'+demo.license.file)),demo.license.sha256);
 const parsed=parse(bytes);assert.deepEqual(parsed.warnings,[]);
 const oracle=spawnSync('git',['apply','--numstat','-z','--'],{input:bytes,encoding:'utf8'});assert.equal(oracle.status,0,oracle.stderr);
 const stats=oracle.stdout.split('\0').filter(Boolean).map(s=>{const [add,del,...path]=s.split('\t');return {add:+add,del:+del,path:path.join('\t')};});
 assert.equal(parsed.files.length,stats.length);assert.equal(parsed.files.length,demo.files.length);
 assert.equal(parsed.files.reduce((n,f)=>n+f.hunks.length,0),bytes.toString().split('\n').filter(l=>/^@@ /.test(l)).length);
 const rawSections=bytes.toString().split(/(?=^diff --git )/m).filter(Boolean);assert.equal(rawSections.length,parsed.files.length);
 let included=0,changed=0,hunks=0;
 for(const [index,f] of parsed.files.entries()){
  assert.equal(f.hunks.length,rawSections[index].split('\n').filter(l=>/^@@ /.test(l)).length);
  const source=demo.files[index],stat=stats[index];assert.equal(f.oldPath,source.path);assert.equal(f.newPath,source.path);assert.equal(stat.path,source.path);
  const snapshots={};for(const side of ['base','target']){const data=await readFile(`demo/${demo.id}/${source[side].file}`);assert.equal(await hash(data),source[side].sha256);snapshots[side]=data.toString('utf8').split('\n');}
  const rows=f.hunks.flatMap(h=>h.lines);assert.equal(rows.filter(l=>l.kind==='+').length,stat.add);assert.equal(rows.filter(l=>l.kind==='-').length,stat.del);
  for(const h of f.hunks){hunks++;assert.equal(h.oldSeen,h.oldCount);assert.equal(h.newSeen,h.newCount);for(const l of h.lines){included++;if(l.kind!==' ')changed++;if(l.old!==null)assert.equal(l.text,snapshots.base[l.old-1],`${source.path} old ${l.old}`);if(l.new!==null)assert.equal(l.text,snapshots.target[l.new-1],`${source.path} new ${l.new}`);}}
 }
 const p=await createProject(bytes,demo.title,demo);await writeFile(`results/${demo.id}.html`,report(p));await writeFile(`results/${demo.id}.json`,serialize(p)+'\n');
 evidence.push({demo:demo.id,sha256:demo.sha256,files:parsed.files.length,hunks,includedLines:included,changedLines:changed,oracle:'git apply --numstat -z (accounting only; never applies a patch)',sourceValidation:'Every old/new displayed line compared to hash-verified base/target snapshots',passed:true});
}
await writeFile('results/demo-verification.json',JSON.stringify({executedAt:new Date().toISOString(),git:spawnSync('git',['--version'],{encoding:'utf8'}).stdout.trim(),checks:evidence},null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
