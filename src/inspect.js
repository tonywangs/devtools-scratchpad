import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import parse from 'spdx-expression-parse';
export const limits = {packages:2000,file:1024*1024,total:16*1024*1024,entries:2000,licenses:32};
export const hash = x => crypto.createHash('sha256').update(x).digest('hex');
export function declaration(raw) {
  if(raw === undefined || raw === null) return {status:'absent',raw:raw??null};
  if(typeof raw !== 'string' || !raw.length || raw.length>4096) return {status:'malformed',raw};
  if(raw==='UNLICENSED' || /^SEE LICENSE IN .+/.test(raw)) return {status:'custom',raw};
  if(raw.split(/[\s()]+/).some(t=>['and','or','with'].includes(t.toLowerCase())&&t!==t.toUpperCase())) return {status:'malformed',raw};
  try { const expression=parse(raw); return {status:raw.includes('LicenseRef-')?'custom':'valid',raw,expression}; }
  catch { return {status:'malformed',raw}; }
}
class ScopeError extends Error {constructor(message,code='failed'){super(message);this.code=code;}}
export async function inspect(selected, overrides={}) {
  if(typeof selected!=='string' || !path.isAbsolute(selected)) throw Error('Select an absolute project root');
  const cap={...limits,...overrides}; const root=path.resolve(selected);
  if(await fs.realpath(root)!==root) throw Error('Project root must not traverse symbolic links');
  if(!(await fs.lstat(root)).isDirectory()) throw Error('Root is not a directory');
  if(process.platform!=='linux')throw Error('This release requires Linux for descriptor-relative no-link reads');
  const rootHandle=await fs.open(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try {
  if(await fs.realpath('/proc/self/fd/'+rootHandle.fd)!==root)throw Error('Root changed during selection');
  let bytes=0;
  async function scoped(rel,operation) {
    if(typeof rel!=='string'||rel.includes('\\')||rel.includes('\0')||path.isAbsolute(rel)||rel.split('/').some(p=>p==='..'||p==='.'||!p)) throw new ScopeError('Unsafe relative path','unsupported');
    const parts=rel.split('/'), handles=[];let parent=rootHandle;
    try {
      for(const part of parts.slice(0,-1)) {
        const next=await fs.open('/proc/self/fd/'+parent.fd+'/'+part,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
        handles.push(next);parent=next;
      }
      const target='/proc/self/fd/'+parent.fd+'/'+parts.at(-1);
      if((await fs.lstat(target)).isSymbolicLink())throw new ScopeError('Symbolic link not followed','linked');
      return await operation(target);
    } catch(e) {if(['ELOOP','ENOTDIR'].includes(e.code))throw new ScopeError('Link or non-directory ancestor rejected','linked');throw e;}
    finally {for(const h of handles.reverse())await h.close();}
  }
  async function read(rel) {
    return scoped(rel,async p=>{
      const f=await fs.open(p,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      try {
        const stat=await f.stat(); if(!stat.isFile()) throw new ScopeError('Not a regular file');
        if(stat.size>cap.file || bytes+stat.size>cap.total) throw new ScopeError('Evidence byte limit exceeded');
        const buffer=Buffer.alloc(Math.min(cap.file+1,stat.size+1)); const {bytesRead}=await f.read(buffer,0,buffer.length,0);
        if(bytesRead>cap.file || bytesRead>stat.size) throw new ScopeError('File changed or exceeds limit');
        const data=buffer.subarray(0,bytesRead);bytes+=bytesRead;
        return {path:rel,sha256:hash(data),bytes:bytesRead,text:new TextDecoder('utf-8',{fatal:true}).decode(data)};
      } finally {await f.close();}
    });
  }
  async function names(rel) {
    const list=async p=>{
      const h=await fs.open(p,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
      try {const dir=await fs.opendir('/proc/self/fd/'+h.fd);const names=[];
        for await(const ent of dir){if(names.length>=cap.entries)throw Error('Directory entry limit exceeded');names.push(ent.name);}return names;
      }finally{await h.close();}
    };
    // Root descriptor is already anchored; opening it through proc is intentional.
    if(!rel){const dir=await fs.opendir('/proc/self/fd/'+rootHandle.fd);const result=[];for await(const e of dir){if(result.length>=cap.entries)throw Error('Directory entry limit exceeded');result.push(e.name);}return result;}
    return scoped(rel,list);
  }
  const lockEvidence=await read('package-lock.json');
  const lock=JSON.parse(lockEvidence.text);
  if(![2,3].includes(lock.lockfileVersion)||!lock.packages||typeof lock.packages!=='object'||Array.isArray(lock.packages)) throw Error('Supported: package-lock v2/v3 with packages object');
  const entries=Object.entries(lock.packages);if(entries.length>cap.packages)throw Error('Package limit exceeded; no partial inventory produced');
  const packages=[];
  for(const [rel,metadata] of entries) {
    const row={path:rel,name:metadata?.name??rel.split('node_modules/').at(-1),version:metadata?.version??null,lock:metadata,coverage:'failed',findings:[],evidence:[],declaration:declaration(undefined)};
    packages.push(row);
    try {
      if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))throw new ScopeError('Malformed lock package','unsupported');
      if(rel) await scoped(rel,async()=>{});
      if(metadata.link) {row.coverage='linked';row.findings.push('Lockfile link: target intentionally not followed');continue;}
      const manifest=await read(rel?rel+'/package.json':'package.json');row.evidence.push(manifest);
      const pkg=JSON.parse(manifest.text);if(!pkg||typeof pkg!=='object'||Array.isArray(pkg))throw Error('Invalid package manifest');
      row.name=pkg.name??row.name;row.version=pkg.version??null;row.declaration=declaration(pkg.license);row.legacyLicenses=pkg.licenses??null;
      row.coverage='present';
      for(const key of ['name','version','license']) if(metadata[key]!==undefined && JSON.stringify(metadata[key])!==JSON.stringify(pkg[key])) row.findings.push('Lockfile/package '+key+' disagreement');
      if(metadata.optional)row.findings.push('Optional package present');
      if(metadata.inBundle)row.findings.push('Bundled dependency; inspected at lockfile path');
      if(rel&&!rel.includes('node_modules/'))row.findings.push('Workspace/local package entry');
      const expected=rel.split('node_modules/').at(-1);
      if(rel.includes('node_modules/')&&pkg.name!==expected)row.findings.push('Installation name differs (possible npm alias)');
      let found=0;
      for(const name of await names(rel)) {
        if(!/^(licen[sc]e|copying|notice)([.\-_]|$)/i.test(name))continue;
        if(++found>cap.licenses)throw Error('License evidence count limit exceeded');
        const ref=rel?rel+'/'+name:name;
        try {row.evidence.push(await read(ref));}catch(e){row.findings.push(ref+': '+e.message);row.coverage='failed';}
      }
      row.evidence.sort((a,b)=>a.path.localeCompare(b.path));
      if(!found)row.findings.push('No top-level license evidence file found');
      if(row.declaration.status!=='valid')row.findings.push('Declaration '+row.declaration.status);
      if(pkg.licenses!==undefined)row.findings.push('Legacy licenses field retained; not interpreted');
    } catch(e) {
      row.coverage=e.code==='ENOENT'?'missing':['linked','unsupported'].includes(e.code)?e.code:'failed';
      row.findings.push(e.code==='ENOENT'&&metadata?.optional?'Optional package omitted; reason unverified':e.message);
    }
    row.fingerprint=hash(JSON.stringify({lock:row.lock,coverage:row.coverage,evidence:row.evidence.map(e=>[e.path,e.sha256]),findings:row.findings}));
  }
  // Include skipped links in the evidence binding too.
  for(const row of packages)row.fingerprint??=hash(JSON.stringify(row));
  const coverage=Object.fromEntries(['present','missing','linked','unsupported','failed'].map(s=>[s,packages.filter(p=>p.coverage===s).length]));
  return {schema:1,root,inspectedAt:new Date().toISOString(),lockfileVersion:lock.lockfileVersion,lockSha256:lockEvidence.sha256,scope:'Every packages entry, including root; top-level package.json and LICENSE/COPYING/NOTICE files only',limits:cap,coverage,total:entries.length,packages,notice:'Declarations and discovered files are evidence, not a legal or compatibility verdict. Stop concurrent writers during inspection.'};
  } finally {await rootHandle.close();}
}
