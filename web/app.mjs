import {parse,select,summary,hash,report,htmlReport,phases} from './model.mjs';
const $=id=>document.getElementById(id), fields=['page','url','method','status','type'];
let model=null,sourceHash='',annotations={},filters={},selected=null,pending=null;
const say=t=>$('message').textContent=t;
function save(){if(!model)return;try{localStorage.setItem('har-desk:'+sourceHash,JSON.stringify({annotations,filters}));localStorage.setItem('har-desk:last',sourceHash);}catch{say('Browser storage unavailable or full. Export a project to preserve notes.');}}
function stateValid(p){if(!p||typeof p.annotations!=='object'||p.annotations===null||Array.isArray(p.annotations)||typeof p.filters!=='object'||p.filters===null)throw Error('Invalid saved project');for(const [k,v]of Object.entries(p.annotations))if(!/^[1-9]\d*$/.test(k)||typeof v!=='string'||v.length>20000)throw Error('Invalid annotation');for(const [k,v]of Object.entries(p.filters))if(!fields.includes(k)||typeof v!=='string')throw Error('Invalid filter');return p;}
function applyState(p){stateValid(p);annotations=p.annotations;filters=p.filters;if(filters.page&&![...$('page').options].some(o=>o.value===filters.page))$('page').add(new Option('Saved page (not in capture): '+filters.page,filters.page));for(const id of fields)$(id).value=filters[id]||'';}
async function load(bytes,label){
 const nextHash=await hash(bytes);if(pending&&nextHash!==pending.sourceHash)throw Error('Source hash mismatch. Select the exact original HAR for this project.');
 const next=parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 model=next;sourceHash=nextHash;annotations={};filters={};selected=null;
 $('page').replaceChildren(new Option('All pages',''),new Option('Unassigned entries','__unassigned'));
 for(const p of model.pages)if(typeof p.id==='string')$('page').add(new Option(String(p.title||p.id),p.id));
 for(const f of fields)$(f).value='';
 let recovery='';if(pending){applyState(pending);pending=null;recovery=' Project restored.';}else{try{const saved=localStorage.getItem('har-desk:'+sourceHash);if(saved){applyState(JSON.parse(saved));recovery=' Saved annotations and filters recovered.';}}catch{recovery=' Saved state could not be recovered; use project export.';}}
 $('hash').textContent=sourceHash;$('detail').textContent='Select a request to inspect its timing, uncertainty and original entry.';
 say(label+recovery);render();save();
}
function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function render(){if(!model)return;const rows=select(model,filters),s=summary(rows);
 $('accounting').textContent=`${model.complete?'All entries accounted for':'INCOMPLETE IMPORT'} · ${model.rows.length} supported / ${model.total} original entries · ${model.rejected.length} rejected`;
 $('accounting').className=model.complete?'':'warning';$('rejected').textContent=JSON.stringify(model.rejected,null,2);
 $('scope').textContent=`${rows.length} visible`;$('stats').textContent=`${s.count} requests  ·  Σ known durations ${s.summedKnownDuration.toFixed(2)} ms (${s.unknownDurations} unknown)  ·  known activity ${s.elapsedKnownActivity?.toFixed(2)??'unknown'} ms (${s.excludedFromActivity} excluded)`;
 const dated=rows.filter(r=>r.start!==null);const origin=dated.length?Math.min(...dated.map(r=>r.start)):0;const end=dated.length?Math.max(...dated.map(r=>r.start+(r.duration??0))):origin;const span=Math.max(end-origin,1);
 $('rows').replaceChildren();for(const r of rows){const b=node('button',undefined,'request');b.dataset.ordinal=r.ordinal;b.setAttribute('aria-pressed',String(selected===r.ordinal));b.title=r.url;
 b.append(node('span',`#${r.ordinal} ${r.status<=0?'FAILED':r.status} ${r.method} · ${r.url}`,'label'+(r.status<=0||r.status>=400?' bad':'')));
 const track=node('span',undefined,'track');if(r.start!==null&&r.duration!==null){const bar=node('span',undefined,'bar');bar.style.left=((r.start-origin)/span*100)+'%';bar.style.width=(r.duration/span*100)+'%';track.append(bar);}track.append(node('span',`${r.duration===null?'?':r.duration.toFixed(2)} ms${r.warnings.length?' · ⚠':''}`,'duration'));b.append(track);b.onclick=()=>{selected=r.ordinal;detail(r);render();};$('rows').append(b);}
 if(!rows.length)$('rows').append(node('p','No requests match these filters.'));}
function detail(r){const d=$('detail');d.replaceChildren(node('h3',`Original entry #${r.ordinal}`),node('p',r.url),node('p',`${r.method} · status ${r.status} · ${r.type}`));
 if(r.status<=0)d.append(node('p','No HTTP response recorded. This is not an HTTP status; inspect the original failure evidence.','warning'));
 if(r.redirect)d.append(node('p','Redirect target (not fetched): '+r.redirect));
 for(const w of r.warnings)d.append(node('p',w,'warning'));
 d.append(node('p',`Response body size: ${r.size===null?'unknown':r.size+' bytes'}. Cache evidence: ${JSON.stringify(r.cache)}.`));
 const table=node('table');for(const key of [...phases,'ssl']){const tr=node('tr');tr.append(node('td',key+(key==='ssl'?' (inside connect)':'')),node('td',r.timings[key]===null?'unknown':r.timings[key]+' ms'));table.append(tr);}d.append(table,node('p',`Available phase sum: ${r.knownTotal} ms. Reported duration: ${r.duration??'unknown'} ms. SSL is never added twice.`));
 d.append(node('p','Investigate long waits or failures using server and application evidence; this capture alone does not establish a cause.'));
 const label=node('label','Investigation note');const area=node('textarea');area.id='annotation';area.maxLength=20000;area.value=annotations[r.ordinal]||'';area.oninput=()=>{annotations[r.ordinal]=area.value;save();};label.append(area);d.append(label);
 const raw=node('details');raw.append(node('summary','Original unchanged entry'),node('pre',JSON.stringify(r.raw,null,2)));d.append(raw);}
function download(name,content,type){const a=document.createElement('a');const u=URL.createObjectURL(new Blob([content],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
async function file(input,fn){try{const f=input.files[0];if(!f)return;if(f.size>10*1024*1024)throw Error('File exceeds 10 MiB limit');await fn(f);}catch(e){say('Import failed: '+e.message);}finally{input.value='';}}
$('har').onchange=()=>file($('har'),async f=>load(await f.arrayBuffer(),f.name));
$('demo').onclick=async()=>{try{const response=await fetch('/fixtures/local.har');if(!response.ok)throw Error('Demo unavailable');await load(await response.arrayBuffer(),'Real Chromium capture: local CC0 MDN copy; /control/* requests are deliberate delay/redirect/503 controls.');}catch(e){say(e.message);}};
$('project').onchange=()=>file($('project'),async f=>{const p=stateValid(JSON.parse(await f.text()));if(p.format!=='har-waterfall-project-1'||!/^[a-f0-9]{64}$/.test(p.sourceHash))throw Error('Unsupported project or source hash');if(model&&sourceHash===p.sourceHash){applyState(p);pending=null;render();if(selected)detail(model.rows.find(r=>r.ordinal===selected));save();say('Project restored against matching source.');}else{pending=p;say('Project staged. Open the exact original HAR to reconnect; hash matching is required.');}});
for(const id of fields)$(id).oninput=()=>{filters=Object.fromEntries(fields.map(f=>[f,$(f).value]));save();render();};
$('clear').onclick=()=>{filters={};for(const f of fields)$(f).value='';save();render();};
$('save').onclick=()=>{if(!model)return say('Open a capture first.');download('investigation.project.json',JSON.stringify({format:'har-waterfall-project-1',sourceHash,annotations,filters},null,2),'application/json');};
for(const type of ['json','html'])$(type).onclick=()=>{if(!model)return say('Open a capture first.');const r=report(model,sourceHash,filters,annotations);download('diagnostic.'+type,type==='json'?JSON.stringify(r,null,2):htmlReport(r),type==='json'?'application/json':'text/html');};
try{if(localStorage.getItem('har-desk:last'))say('Previous investigation found. Reopen its original HAR to recover notes and filters by source hash.');}catch{}
