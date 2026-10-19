export const phases=['blocked','dns','connect','send','wait','receive'];
export const known=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
export async function hash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function parse(text){
 if(new TextEncoder().encode(text).length>10*1024*1024)throw Error('Capture exceeds 10 MiB limit; no entries imported.');
 const doc=JSON.parse(text.replace(/^\uFEFF/,''));if(doc?.log?.version!=='1.2'||!Array.isArray(doc.log.entries))throw Error('Expected a HAR 1.2 log with entries.');
 if(doc.log.entries.length>10000)throw Error('Capture exceeds 10,000-entry limit; no entries imported.');
 const pages=Array.isArray(doc.log.pages)?doc.log.pages.filter(p=>p&&typeof p.id==='string'):[];const rejected=[],rows=[];
 doc.log.entries.forEach((e,i)=>{
  const ordinal=i+1;
  if(!e||typeof e.request?.url!=='string'||typeof e.request?.method!=='string'||!Number.isInteger(e.response?.status)||e.response.status< -1||e.response.status>599){rejected.push({ordinal,reason:'Missing/invalid request URL, method or response status'});return;}
  const warnings=[];const rawDate=e.startedDateTime;
  let start=typeof rawDate==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(rawDate)&&Number.isFinite(Date.parse(rawDate))?Date.parse(rawDate):null;
  if(start!==null){const [year,month,day]=rawDate.slice(0,10).split('-').map(Number);if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())start=null;}
  if(e.response.status===-1)warnings.push('Browser-specific failure sentinel -1; not an HTTP status');
  if(start===null)warnings.push('Unavailable or unsupported timestamp; excluded from chronological activity bounds');
  const duration=known(e.time);if(duration===null)warnings.push('Unknown request duration');
  const timings=Object.fromEntries([...phases,'ssl'].map(k=>[k,known(e.timings?.[k])]));
  const knownTotal=phases.reduce((n,k)=>n+(timings[k]??0),0);
  if(phases.some(k=>timings[k]===null))warnings.push('Some timing phases unavailable; unknown is not zero');
  if(duration!==null&&Math.abs(knownTotal-duration)>Math.max(1,duration*0.001))warnings.push(phases.some(k=>timings[k]===null)?'Available timing sum differs from reported duration; missing phases may explain the difference':'Inconsistent timing total: available phases differ from reported duration');
  if(timings.ssl!==null&&(timings.connect===null||timings.ssl>timings.connect))warnings.push('SSL nesting inconsistent or connection unavailable');
  const page=pages.some(p=>p.id===e.pageref)?e.pageref:null;if(page===null)warnings.push('No matching page association');
  rows.push({ordinal,url:e.request.url,method:e.request.method,status:e.response.status,type:e._resourceType||e.response.content?.mimeType||'unknown',page,start,duration,timings,knownTotal,warnings,size:known(e.response.bodySize),redirect:e.response.redirectURL||null,cache:{status304:e.response.status===304,har:e.cache??null,fromCache:e._fromCache??e.response._fromCache??null},raw:e});
 });
 rows.sort((a,b)=>(a.start??Infinity)-(b.start??Infinity)||a.ordinal-b.ordinal);
 return {rows,rejected,total:doc.log.entries.length,pages,complete:rejected.length===0};
}
export function select(model,filters={}){return model.rows.filter(r=>(!filters.page|| (filters.page==='__unassigned'?r.page===null:r.page===filters.page))&&(!filters.url||r.url.toLowerCase().includes(filters.url.toLowerCase()))&&(!filters.method||r.method.toLowerCase()===filters.method.toLowerCase())&&(!filters.status||String(r.status)===filters.status)&&(!filters.type||String(r.type).toLowerCase().includes(filters.type.toLowerCase())));}
export function summary(rows){const dated=rows.filter(r=>r.start!==null&&r.duration!==null);return {count:rows.length,statuses:rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),summedKnownDuration:rows.reduce((n,r)=>n+(r.duration??0),0),unknownDurations:rows.filter(r=>r.duration===null).length,elapsedKnownActivity:dated.length?Math.max(...dated.map(r=>r.start+r.duration))-Math.min(...dated.map(r=>r.start)):null,excludedFromActivity:rows.length-dated.length};}
export function report(model,sourceHash,filters,annotations){const rows=select(model,filters);return {format:'har-waterfall-report-1',sourceHash,warning:'May contain sensitive URLs and notes. Timing correlations do not prove causes. Elapsed request activity is not user-perceived load time.',accounting:{total:model.total,supported:model.rows.length,rejected:model.rejected,complete:model.complete},filters,summary:summary(rows),requests:rows.map(({raw,...r})=>({...r,annotation:annotations[r.ordinal]||''}))};}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function htmlReport(r){return '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>HAR diagnostic report</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}article{border-top:1px solid #ccc;padding:20px 0}</style><h1>HAR diagnostic report</h1><p>'+esc(r.warning)+'</p><p>Source SHA-256: '+esc(r.sourceHash)+'</p><h2>Accounting and scope</h2><pre>'+esc(JSON.stringify({accounting:r.accounting,filters:r.filters,summary:r.summary},null,2))+'</pre>'+r.requests.map(x=>'<article><h2>Original entry #'+x.ordinal+' · '+x.status+' '+esc(x.method)+'</h2><p>'+esc(x.url)+'</p><pre>'+esc(JSON.stringify(x,null,2))+'</pre></article>').join('')+'</html>';}
