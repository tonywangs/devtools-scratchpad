"""Check the contract's publication file bounds without staging or publishing."""
import subprocess,pathlib,json
paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0')
paths=sorted(set(p for p in paths if p and pathlib.Path(p).is_file()))
sizes={p:pathlib.Path(p).stat().st_size for p in paths}
assert len(paths)<=1000
assert max(sizes.values(),default=0)<=10*1024*1024
assert sum(sizes.values())<=32*1024*1024
assert not [p for p in paths if p.endswith('.log') and p!='results/tests.log']
assert not [p for p in paths if any(x in p.split('/') for x in ['.agents','.codex','node_modules'])]
print(json.dumps({'files':len(paths),'bytes':sum(sizes.values()),'largest':max(sizes,key=sizes.get),'largestBytes':max(sizes.values())}))
