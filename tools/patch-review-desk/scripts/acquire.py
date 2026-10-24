"""Recreate real fixtures from a public Click checkout. Never applies patches."""
import hashlib, json, pathlib, subprocess, sys
repo = sys.argv[1]
out = pathlib.Path(__file__).resolve().parents[1] / 'demo'
def git(*args):
    return subprocess.check_output(['git','-C',repo,*args])
def sha(b): return hashlib.sha256(b).hexdigest()
manifest=[]
for name,rev in [('short-help', 'f67c2bb6c2f055c1c7a57cd46c3697fc26a7742e'),('parameter-spec', '9f0bcdf0d868edfc71435cd0aac2dcc08cf94828')]:
    target=git('rev-parse',rev).decode().strip()
    base=git('rev-parse',rev+'^').decode().strip()
    args=['-c','core.quotePath=true','diff','--no-ext-diff','--no-textconv','--binary','--full-index','--no-renames','--unified=3',base,target,'--']
    patch=git(*args)
    folder=out/name; folder.mkdir(parents=True,exist_ok=True)
    (folder/'change.patch').write_bytes(patch)
    license=git('show',target+':LICENSE.txt'); (folder/'LICENSE.txt').write_bytes(license)
    files=[]
    for index,path in enumerate(git('diff','--name-only','-z',base,target).decode().strip('\0').split('\0')):
        item={'path':path}
        for side,revision in [('base',base),('target',target)]:
            data=git('show',revision+':'+path)
            filename=f'{index}-{side}.txt'; (folder/filename).write_bytes(data)
            item[side]={'file':filename,'sha256':sha(data),'url':f'https://github.com/pallets/click/blob/{revision}/{path}'}
        files.append(item)
    manifest.append({'id':name,'project':'Click','repository':'https://github.com/pallets/click','base':base,'target':target,'title':git('show','-s','--format=%s',target).decode().strip(),'patch':name+'/change.patch','sha256':sha(patch),'license':{'file':name+'/LICENSE.txt','sha256':sha(license),'url':f'https://github.com/pallets/click/blob/{target}/LICENSE.txt'},'command':['git',*args],'files':files,'numstat':git('diff','--numstat',base,target).decode()})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
