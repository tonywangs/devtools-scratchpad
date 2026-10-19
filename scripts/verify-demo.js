import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import * as checker from 'license-checker-rseidelsohn';
const root=path.resolve('demo/source');
const {inventory}=JSON.parse(await fs.readFile('demo/reports/review.json'));
const independent=JSON.parse(execFileSync('python3',['scripts/independent.py',root,'demo/reports/review.json'],{encoding:'utf8'}));
const baseline=await new Promise((resolve,reject)=>checker.init({start:root,json:true,unknown:true},(e,r)=>e?reject(e):resolve(r)));
const differences=[],matched=[];
for(const p of inventory.packages.filter(p=>p.coverage==='present')) {
 const key=p.name+'@'+p.version, b=baseline[key];assert(b,'Baseline missing '+key);
 if(JSON.stringify(b.licenses)!==JSON.stringify(p.declaration.raw))differences.push({path:p.path,key,raw:p.declaration.raw,baseline:b.licenses,legacyLicenses:p.legacyLicenses,explanation:p.legacyLicenses?'Checker interprets the legacy licenses field; Desk retains it separately and reports the primary license field absent.':'Checker normalizes or infers evidence; no equivalence asserted.'});
 else matched.push(p.path);
}
const ours=new Set(inventory.packages.filter(p=>p.coverage==='present').map(p=>p.name+'@'+p.version));
const extra=Object.keys(baseline).filter(k=>!ours.has(k));assert.equal(extra.length,0,'Baseline scope differs');
const result={independent,baseline:'license-checker-rseidelsohn@4.4.2',scope:'Root plus full installed production/dev tree; missing optional packages excluded from baseline; instances compared individually to name/version keys',instancesCompared:matched.length+differences.length,baselineUniqueNameVersions:Object.keys(baseline).length,exactRawMatches:matched.length,differences,extra};
await fs.writeFile('results/demo-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
