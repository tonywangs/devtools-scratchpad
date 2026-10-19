const $=id=>document.getElementById(id), token=document.querySelector('meta[name=desk-token]').content;
let state={schema:1,inventory:null,notes:Object.create(null),filters:{query:'',declaration:'',unresolved:false}},selected='',historical=true;
const key='license-desk-review-v1';
function save(){try{localStorage.setItem(key,JSON.stringify(state));}catch{$('status').textContent='Browser storage full or unavailable. Export JSON to preserve this review.';}}
function el(tag,text,parent){const e=document.createElement(tag);e.textContent=text;parent?.append(e);return e;}
async function api(route,data){const r=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json','X-Desk-Token':token},body:JSON.stringify(data)});if(!r.ok)throw Error((await r.json()).error||'Request rejected');return route==='/html'?r.text():r.json();}
function validate(s){
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x), digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
 const bad=()=>{throw Error('Invalid review structure');};
 if(!object(s)||s.schema!==1||!object(s.inventory)||!object(s.notes)||!object(s.filters))bad();
 const i=s.inventory,f=s.filters;
 if(!Array.isArray(i.packages)||i.packages.length>2000||i.total!==i.packages.length||typeof i.root!=='string'||!digest(i.lockSha256)||!object(i.coverage)||typeof i.notice!=='string')bad();
 if(typeof f.query!=='string'||typeof f.declaration!=='string'||!['','valid','custom','absent','malformed'].includes(f.declaration)||typeof f.unresolved!=='boolean')bad();
 const statuses=['present','missing','linked','unsupported','failed'];const seen=new Set();
 for(const p of i.packages){
  if(!object(p)||typeof p.path!=='string'||seen.has(p.path)||!digest(p.fingerprint)||!statuses.includes(p.coverage)||!Array.isArray(p.evidence)||!Array.isArray(p.findings)||!p.findings.every(x=>typeof x==='string')||!object(p.declaration)||!['valid','custom','absent','malformed'].includes(p.declaration.status))bad();
  seen.add(p.path);
  for(const e of p.evidence)if(!object(e)||typeof e.path!=='string'||typeof e.text!=='string'||!digest(e.sha256)||!Number.isSafeInteger(e.bytes)||e.bytes<0)bad();
 }
 for(const k of statuses)if(i.coverage[k]!==i.packages.filter(p=>p.coverage===k).length)bad();
 for(const n of Object.values(s.notes))if(!object(n)||typeof n.text!=='string'||!digest(n.fingerprint)||!digest(n.lockSha256))bad();
 return {...s,notes:Object.assign(Object.create(null),s.notes)};
}
function render(){const inv=state.inventory; if(!inv)return; $('root').value=inv.root;$('history').textContent=historical?'Historical snapshot — reinspect this root to check for changed or missing evidence.':'Inspected this session. Evidence is a snapshot; reinspect after installation changes.';const removed=Object.keys(state.notes).filter(k=>!inv.packages.some(p=>p.path===k));if(removed.length)$('history').textContent+=` ${removed.length} historical note(s) belong to removed lockfile entries and are retained in JSON export.`;$('history').className=historical||removed.length?'warning':'';
 $('counts').replaceChildren();for(const [k,v]of Object.entries(inv.coverage)){const c=el('div','',$('counts'));c.className='count';el('b',v,c);el('span',k,c);}
 $('query').value=state.filters.query;$('declaration').value=state.filters.declaration;$('unresolved').checked=state.filters.unresolved;
 const rows=inv.packages.filter(p=>(!state.filters.unresolved||p.findings.length)&&(!state.filters.declaration||p.declaration.status===state.filters.declaration)&&JSON.stringify([p.path,p.name,p.declaration.raw]).toLowerCase().includes(state.filters.query.toLowerCase()));
 $('list').replaceChildren();el('small',`${rows.length} / ${inv.total} package instances`,$('list'));
 for(const p of rows){const b=el('button',`${p.name||'(root)'} @ ${p.version??'unknown'}`,$('list'));el('small',p.path||'(project root)',b);el('small',`${p.coverage} · ${p.declaration.status} · ${p.findings.length} findings`,b);b.className=selected===p.path?'active':'';b.onclick=()=>{selected=p.path;render();};}
 if(!rows.some(p=>p.path===selected))selected=rows[0]?.path;
 const p=rows.find(p=>p.path===selected);$('detail').replaceChildren();if(!p){el('p','No matching packages.',$('detail'));return;}
 const d=$('detail');el('h2',`${p.name} @ ${p.version}`,d);el('p',p.path||'(project root)',d);
 const instances=inv.packages.filter(x=>x.name===p.name);el('p',`${instances.length} installation instance(s), ${new Set(instances.map(x=>x.version)).size} distinct version(s)`,d);
 el('pre',JSON.stringify({coverage:p.coverage,raw:p.declaration.raw,status:p.declaration.status,expression:p.declaration.expression,legacyLicenses:p.legacyLicenses,findings:p.findings,lock:p.lock},null,2),d);
 const n=state.notes[p.path];if(n&&(n.fingerprint!==p.fingerprint||n.lockSha256!==inv.lockSha256))el('p','STALE NOTE — evidence changed or is missing. Original note retained; edit to bind it to this snapshot.',d).className='warning';
 const label=el('label','Review note',d);const note=el('textarea','',label);note.id='note';note.value=n?.text??'';note.oninput=()=>{state.notes[p.path]={text:note.value,fingerprint:p.fingerprint,lockSha256:inv.lockSha256,updatedAt:new Date().toISOString()};save();};
 for(const e of p.evidence){const det=el('details','',d);el('summary',e.path,det);el('small',`SHA-256 ${e.sha256} · ${e.bytes} bytes`,det);el('pre',e.text,det);}
}
$('inspect').onclick=async()=>{const b=$('inspect');b.disabled=true;$('status').textContent='Inspecting bounded local evidence…';try{const inv=await api('/inspect',{root:$('root').value});const same=(state.inventory?.root===inv.root||state.inventory?.lockSha256===inv.lockSha256);state={schema:1,inventory:inv,notes:same?state.notes:Object.create(null),filters:state.filters};historical=false;save();render();$('status').textContent=`Accounted for ${inv.total} lockfile entries. ${inv.coverage.present} present.`;}catch(e){$('status').textContent=e.message;}finally{b.disabled=false;}};
$('demo').onclick=()=>{$('root').value=new URLSearchParams(location.search).get('demo')||'DEMO_ROOT';$('status').textContent='Demo root selected. Click Inspect installation.';};
for(const id of ['query','declaration','unresolved'])$(id).oninput=()=>{state.filters={query:$('query').value,declaration:$('declaration').value,unresolved:$('unresolved').checked};save();render();};
function download(name,text,type){const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
$('json').onclick=()=>{if(state.inventory)download('license-review.json',JSON.stringify(state,null,2),'application/json');};
$('html').onclick=async()=>{try{if(state.inventory)download('license-review.html',await api('/html',state),'text/html');}catch(e){$('status').textContent=e.message;}};
$('import').onchange=async()=>{try{const f=$('import').files[0];if(!f)return;if(f.size>32*1024*1024)throw Error('Import exceeds 32 MiB');state=validate(JSON.parse(await f.text()));historical=true;save();render();$('status').textContent='Recovered historical review; no source files were read.';}catch(e){$('status').textContent='Recovery failed: '+e.message;}};
try{const s=localStorage.getItem(key);if(s){state=validate(JSON.parse(s));render();}}catch{$('status').textContent='Saved review could not be recovered. Import a JSON backup or inspect again.';}
