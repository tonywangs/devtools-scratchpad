export const LIMITS = Object.freeze({bytes:1048576, lines:20000, files:200, hunks:2000, lineLength:20000, noteLength:4000, projectBytes:8388608});
export const COVERAGE = 'Patch excerpts only. Surrounding source is unavailable. Reviewed means a personal decision, not proof of correctness. Warnings indicate incomplete or unsupported interpretation; raw input is retained.';
export const decode = bytes => new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes);
export async function hash(bytes) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function base64(bytes) {let s=''; for(const b of bytes)s+=String.fromCharCode(b); return btoa(s);}
export function unbase64(s) {if(typeof s!=='string'||s.length>Math.ceil(LIMITS.bytes/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error('Invalid patch bytes'); return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
export function pathName(s) {
  if(!s.startsWith('"')) return s;
  if(!s.endsWith('"'))throw Error('Unclosed quoted path');
  let bytes=[]; const body=s.slice(1,-1); const escapes={a:7,b:8,t:9,n:10,v:11,f:12,r:13,'"':34,'\\':92};
  for(let i=0;i<body.length;) {
    if(body[i]!=='\\'){const c=String.fromCodePoint(body.codePointAt(i));bytes.push(...new TextEncoder().encode(c));i+=c.length;continue;}
    i++; if(/[0-7]/.test(body[i]||'')){const oct=body.slice(i,i+3);if(!/^[0-7]{3}$/.test(oct)||parseInt(oct,8)>255)throw Error('Invalid path escape'); bytes.push(parseInt(oct,8));i+=3;}
    else if(Object.hasOwn(escapes,body[i]))bytes.push(escapes[body[i++]]);else throw Error('Invalid path escape');
  }
  return decode(new Uint8Array(bytes));
}
export function parse(bytes) {
  if(bytes.length>LIMITS.bytes)throw Error('Patch exceeds 1 MiB');
  const raw=decode(bytes); if(raw.includes('\0'))throw Error('NUL bytes are unsupported');
  const lines=raw.split('\n'); if(lines.at(-1)==='')lines.pop();
  if(lines.length>LIMITS.lines||lines.some(l=>l.length>LIMITS.lineLength))throw Error('Patch line resource limit exceeded');
  const result={files:[],warnings:[],lineCount:lines.length,coverage:COVERAGE};
  const warn=(message,line)=>result.warnings.push({line:line+1,message});
  let file=null,hunk=null,old=0,neu=0,total=0,seenBody=false;
  if(raw && !raw.endsWith('\n'))warn('Patch transport lacks a final LF; may be truncated',lines.length-1);
  function endHunk(){if(hunk&&(hunk.oldSeen!==hunk.oldCount||hunk.newSeen!==hunk.newCount))warn('Hunk counts do not match body',hunk.patchLine-1);hunk=null;}
  function endFile(){endHunk(); if(file&&file.hunks.length&&(!file.oldMarker||!file.newMarker))warn('Text hunks lack old/new file markers',file.patchLine-1); if(file&&!file.hunks.length&&!file.metadata.some(s=>/^(old mode |new mode |rename |copy |new file mode |deleted file mode |Binary files |GIT binary patch)/.test(s)))warn('File has no interpreted change',file.patchLine-1);}
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];
    if(line.startsWith('diff ')) {
      endFile(); if(result.files.length>=LIMITS.files)throw Error('File limit exceeded');
      file={id:`f${result.files.length}`,header:line,patchLine:i+1,oldPath:null,newPath:null,metadata:[],hunks:[]};result.files.push(file);seenBody=false;
      if(!line.startsWith('diff --git '))warn('Unsupported diff format (including combined diffs)',i);
      else {const rest=line.slice(11); if(!rest.startsWith('"')&&(rest.match(/ b\//g)||[]).length>1)warn('Ambiguous unquoted file header paths',i); const match=rest.match(/^("(?:\\.|[^"\\])*"|a\/.*?) ("(?:\\.|[^"\\])*"|b\/.*)$/);if(match){try{file.oldPath=pathName(match[1]).replace(/^a\//,'');file.newPath=pathName(match[2]).replace(/^b\//,'');}catch(e){warn(e.message,i);}}else warn('Ambiguous or unsupported file header paths',i);}
      continue;
    }
    if(!file){warn('Unparsed content outside a Git file section',i);continue;}
    if(line.startsWith('@@')) {
      endHunk(); const m=line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/);
      if(!m){warn('Malformed or unsupported hunk header',i);file.metadata.push(line);continue;}
      if(++total>LIMITS.hunks)throw Error('Hunk limit exceeded');
      const nums=[+m[1],m[2]===undefined?1:+m[2],+m[3],m[4]===undefined?1:+m[4]];
      if(nums.some(n=>!Number.isSafeInteger(n)||n>1000000000)) {warn('Invalid hunk range',i);continue;}
      hunk={id:`${file.id}h${file.hunks.length}`,header:line,patchLine:i+1,oldStart:nums[0],oldCount:nums[1],newStart:nums[2],newCount:nums[3],oldSeen:0,newSeen:0,lines:[]};
      if((!nums[0]&&nums[1])||(!nums[2]&&nums[3]))warn('Nonempty hunk range starts at zero',i);
      const previous=file.hunks.at(-1);if(previous&&(nums[0]<previous.oldStart+previous.oldCount||nums[2]<previous.newStart+previous.newCount))warn('Overlapping or out-of-order hunk ranges',i);
      file.hunks.push(hunk);old=nums[0];neu=nums[2];seenBody=true;continue;
    }
    if(hunk) {
      if(line==='\\ No newline at end of file') {const previous=hunk.lines.at(-1);if(!previous||previous.noNewline)warn('Misplaced missing-newline marker',i);else previous.noNewline=true;continue;}
      if(/^[ +\-]/.test(line)) {
        const kind=line[0];const row={id:`${hunk.id}l${hunk.lines.length}`,kind,text:line.slice(1),old:kind==='+'?null:old++,new:kind==='-'?null:neu++,patchLine:i+1,noNewline:false};
        hunk.lines.push(row);if(kind!=='+')hunk.oldSeen++;if(kind!=='-')hunk.newSeen++;
        if(hunk.oldSeen>hunk.oldCount||hunk.newSeen>hunk.newCount)warn('Hunk body exceeds declared range',i);continue;
      }
      endHunk();
    }
    file.metadata.push(line);
    if(!seenBody && /^(--- |\+\+\+ )/.test(line)) {file[line.startsWith('---')?'oldMarker':'newMarker']=true;try{const p=pathName(line.slice(4));file[line.startsWith('---')?'oldPath':'newPath']=p==='/dev/null'?null:p.replace(/^[ab]\//,'');}catch(e){warn(e.message,i);}continue;}
    if(/^(Binary files |GIT binary patch)/.test(line)){warn('Binary content unavailable; metadata only',i);continue;}
    if(/^(?:index .* |(?:old mode|new mode|new file mode|deleted file mode) )160000$/.test(line))warn('Submodule content unsupported',i);
    if(/^(rename|copy) (from|to) /.test(line)){try{file[/^(rename|copy) from /.test(line)?'oldPath':'newPath']=pathName(line.replace(/^(rename|copy) (from|to) /,''));}catch(e){warn(e.message,i);}continue;}
    if(/^index [0-9a-f]+\.\.[0-9a-f]+(?: \d{6})?$/.test(line)||/^(old mode|new mode|new file mode|deleted file mode) \d{6}$/.test(line)||/^(similarity|dissimilarity) index \d+%$/.test(line)||/^(rename|copy) (from|to) .+$/.test(line))continue;
    warn('Unparsed or unsupported section content',i);
  }
  endFile();if(!result.files.length)warn('No Git file sections found',0);
  result.complete=result.warnings.length===0;
  return result;
}
export function checkProjectSize(p) {const reviewed=Object.fromEntries((p.parsed?.files??[]).flatMap(f=>[f.id,...f.hunks.map(h=>h.id)]).map(id=>[id,false]));if(new TextEncoder().encode(JSON.stringify({...p,reviewed},null,2)).length>LIMITS.projectBytes)throw Error('Expanded project exceeds 8 MiB; reduce patch or annotation size');return p;}
export function setNote(p,id,value) {if(typeof value!=='string'||value.length>LIMITS.noteLength)throw Error('Annotation exceeds 4000 characters');const notes={...p.notes};if(value)notes[id]=value;else delete notes[id];checkProjectSize({...p,notes});p.notes=notes;}
export async function createProject(bytes,name='Imported patch',source=null) {const parsed=parse(bytes);return checkProjectSize({format:'patch-review-desk/1',name:String(name).slice(0,200),sha256:await hash(bytes),patchBase64:base64(bytes),source,notes:{},reviewed:{},parsed});}
export async function importProject(text) {
  if(new TextEncoder().encode(text).length>LIMITS.projectBytes)throw Error('Project exceeds 8 MiB');
  const input=JSON.parse(text);if(input.format!=='patch-review-desk/1')throw Error('Unsupported project format');
  const p=await createProject(unbase64(input.patchBase64),input.name,input.source??null);
  if(p.sha256!==input.sha256)throw Error('Patch hash mismatch');
  if(JSON.stringify(p.source).length>100000)throw Error('Source metadata too large');
  const rowIds=new Set(p.parsed.files.flatMap(f=>f.hunks.flatMap(h=>h.lines.map(l=>l.id))));
  const reviewIds=new Set(p.parsed.files.flatMap(f=>[f.id,...f.hunks.map(h=>h.id)]));
  if(!input.notes||typeof input.notes!=='object'||Array.isArray(input.notes)||!input.reviewed||typeof input.reviewed!=='object'||Array.isArray(input.reviewed))throw Error('Invalid review state');
  for(const [id,note] of Object.entries(input.notes)){if(!rowIds.has(id)||typeof note!=='string'||note.length>LIMITS.noteLength)throw Error('Invalid annotation identity or length');p.notes[id]=note;}
  for(const [id,value] of Object.entries(input.reviewed)){if(!reviewIds.has(id)||typeof value!=='boolean')throw Error('Invalid review identity');p.reviewed[id]=value;}
  return checkProjectSize(p);
}
export const serialize = p => JSON.stringify(p,null,2);
export const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function report(p) {
  const e=escape;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${e(p.name)} — Patch review</title><style>body{font:16px system-ui;margin:2em;max-width:1200px}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td{vertical-align:top;border-bottom:1px solid #ddd;padding:3px}td pre{margin:0}tr.add{background:#e5f7e9}tr.del{background:#ffe9e5}code{overflow-wrap:anywhere}.warning{color:#9c3500}</style><h1>${e(p.name)}</h1><p>SHA-256 <code>${e(p.sha256)}</code></p><p>${e(COVERAGE)}</p><p>${p.parsed.complete?'All sections parsed within the supported subset.':'INCOMPLETE INTERPRETATION — see warnings.'}</p><pre class="warning">${e(p.parsed.warnings.map(w=>`Patch line ${w.line}: ${w.message}`).join('\n'))}</pre><h2>Source references (supplied metadata)</h2><pre>${e(JSON.stringify(p.source,null,2))}</pre>${p.parsed.files.map(f=>`<section><h2>${e(f.newPath??f.oldPath??f.header)} — ${p.reviewed[f.id]?'reviewed':'pending'}</h2><pre>${e(f.header+'\n'+f.metadata.join('\n'))}</pre>${f.hunks.map(h=>`<h3>${e(h.header)} — ${p.reviewed[h.id]?'reviewed':'pending'}</h3><table><thead><tr><th>Old</th><th>New</th><th>Change / included source</th><th>Annotation</th></tr></thead><tbody>${h.lines.map(l=>`<tr class="${l.kind==='+'?'add':l.kind==='-'?'del':''}" id="${l.id}"><td>${e(l.old)}</td><td>${e(l.new)}</td><td><pre>${e(l.kind+l.text)}${l.noNewline?'\n\\ No newline at end of file':''}</pre></td><td>${e(p.notes[l.id]??'')}</td></tr>`).join('')}</tbody></table>`).join('')}</section>`).join('')}<h2>Byte-preserving portable project</h2><p>The following JSON includes the original patch as base64 and its SHA-256. Copy it into a .json file to reopen the review. Displayed changes are derived anew on import.</p><pre id="project">${e(serialize(p))}</pre></html>`;
}
