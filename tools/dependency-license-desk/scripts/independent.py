"""Independent traversal: no workbench imports. Used only on the pinned trusted demo."""
import pathlib,json,hashlib,sys,re
root=pathlib.Path(sys.argv[1]).resolve()
report=json.load(open(sys.argv[2]))['inventory']
lock=json.load(open(root/'package-lock.json'))
assert set(lock['packages'])=={p['path'] for p in report['packages']}
assert report['lockSha256']==hashlib.sha256((root/'package-lock.json').read_bytes()).hexdigest()
assert len(report['packages'])==len(lock['packages'])==report['total']
assert report['coverage']=={k:sum(p['coverage']==k for p in report['packages']) for k in ['present','missing','linked','unsupported','failed']}
checks=0
for p in report['packages']:
    folder=root/p['path']
    manifest=folder/'package.json'
    if not manifest.exists():
        assert p['coverage']=='missing',p['path']
        continue
    assert p['coverage']=='present',(p['path'],p['findings'])
    pkg=json.loads(manifest.read_bytes())
    assert p['version']==pkg.get('version')
    assert p['declaration']['raw']==pkg.get('license')
    expected={'package.json'}|{x.name for x in folder.iterdir() if re.match(r'^(licen[sc]e|copying|notice)([.\-_]|$)',x.name,re.I)}
    assert expected=={pathlib.PurePosixPath(e['path']).name for e in p['evidence']},p['path']
    for e in p['evidence']:
        data=(root/e['path']).read_bytes()
        assert hashlib.sha256(data).hexdigest()==e['sha256']
        assert data.decode()==e['text']
        checks+=1
print(json.dumps({'independentLockEntries':len(lock['packages']),'independentEvidenceFiles':checks,'result':'matched every entry, declaration, version, evidence path, hash and text'}))
