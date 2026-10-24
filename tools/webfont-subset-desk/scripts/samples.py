import sys,base64,json,zipfile,io
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from core import build,DEFAULT
D=ROOT/'demo';out=ROOT/'samples';out.mkdir(exist_ok=True)
records=[]
for name,font,text,s in [('latin','NotoSans-Regular.ttf',(D/'eng.txt').read_text()+'\n'+(D/'fra.txt').read_text(),DEFAULT),('arabic','NotoNaskhArabic-Regular.ttf',(D/'arb.txt').read_text(),dict(DEFAULT,script='Arab',language='ar',direction='rtl'))]:
 r=build((D/font).read_bytes(),text,s,(D/'OFL.txt').read_text()+'\n\n'+(D/'TEXT-NOTICE.txt').read_text(),True)
 target=out/name;target.mkdir(exist_ok=True)
 with zipfile.ZipFile(io.BytesIO(base64.b64decode(r['zip']))) as z:
  z.extractall(target)
 records.append({'sample':name,'source_bytes':r['manifest']['source']['bytes'],'subset_bytes':r['manifest']['subset']['bytes'],'change_percent':r['manifest']['subset']['change_percent'],'shaping_equal':r['manifest']['shaping']['equal']})
(ROOT/'results'/'sizes.json').write_text(json.dumps(records,indent=2)+'\n');print(json.dumps(records,indent=2))
