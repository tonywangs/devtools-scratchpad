"""Independent stdlib oracle reads raw HAR and exported reports; does not call JS model."""
import json,hashlib,datetime,pathlib,math
root=pathlib.Path(__file__).resolve().parents[1]
provenance=json.loads((root/'fixtures/provenance.json').read_text())
def known(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) and v>=0
for name in ['public','local']:
 raw=(root/f'fixtures/{name}.har').read_bytes(); h=json.loads(raw)['log'];r=json.loads((root/f'results/{name}-report.json').read_text());entries=h['entries']
 digest=hashlib.sha256(raw).hexdigest();assert digest==r['sourceHash']==next(c['sha256'] for c in provenance['captures'] if c['name']==name)
 assert r['accounting']=={'total':len(entries),'supported':len(entries),'rejected':[],'complete':True}
 expected=sorted(range(len(entries)),key=lambda i:(datetime.datetime.fromisoformat(entries[i]['startedDateTime'].replace('Z','+00:00')).timestamp(),i))
 assert [x['ordinal'] for x in r['requests']]==[i+1 for i in expected]
 statuses={};starts=[];ends=[];total=0
 for x in r['requests']:
  e=entries[x['ordinal']-1];assert (x['url'],x['method'],x['status'])==(e['request']['url'],e['request']['method'],e['response']['status'])
  statuses[str(x['status'])]=statuses.get(str(x['status']),0)+1
  for key in ['blocked','dns','connect','send','wait','receive','ssl']:
   v=e['timings'].get(key);assert x['timings'][key]==(v if known(v) else None)
  phase_sum=sum(v for k,v in e['timings'].items() if k in ['blocked','dns','connect','send','wait','receive'] and known(v));assert math.isclose(x['knownTotal'],phase_sum,abs_tol=1e-8)
  start=int(datetime.datetime.fromisoformat(e['startedDateTime'].replace('Z','+00:00')).timestamp()*1000);assert abs(start-x['start'])<=1
  if known(e['time']):total+=e['time'];starts.append(x['start']);ends.append(x['start']+e['time'])
 assert r['summary']['statuses']==statuses
 assert math.isclose(r['summary']['summedKnownDuration'],total,abs_tol=1e-8)
 assert math.isclose(r['summary']['elapsedKnownActivity'],max(ends)-min(starts),abs_tol=.001)
 print(f'{name}: independently verified {len(entries)} entries, ordering, statuses, source hash, timing phases, SSL exclusion and durations')
for p in ['index.html','styles/style.css','images/firefox-icon.png','LICENSE']:
 assert hashlib.sha256((root/'fixtures/site'/p).read_bytes()).hexdigest()==provenance['sha256:'+p]
print('Source fixture hashes verified')
