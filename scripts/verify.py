"""Independent oracle: HarfBuzz outline drawing, not the app's fontTools pen hashes.
Only WOFF2 decoding uses fontTools. Does not import the application or core.
"""
import hashlib,io,json,sys,xml.etree.ElementTree as ET
from pathlib import Path
from fontTools.ttLib import TTFont
import uharfbuzz as hb
ROOT=Path(__file__).resolve().parents[1]
class Pen:
 def __init__(self):self.commands=[]
 def moveTo(self,p):self.commands.append(['M',*p])
 def lineTo(self,p):self.commands.append(['L',*p])
 def curveTo(self,*p):self.commands.append(['C',*p])
 def qCurveTo(self,*p):self.commands.append(['Q',*p])
 def closePath(self):self.commands.append(['Z'])
def shaped(data,text,s):
 f=TTFont(io.BytesIO(data),recalcTimestamp=False);f.flavor=None;buf=io.BytesIO();f.save(buf)
 font=hb.Font(hb.Face(buf.getvalue()));hb.ot_font_set_funcs(font);font.scale=(font.face.upem,)*2
 lines=[]
 for line in text.splitlines():
  for run in line.split('\t'):
   if not run:lines.append([]);continue
   b=hb.Buffer();b.add_str(run);b.direction=s['direction'];b.script=s['script'];b.language=s['language'];hb.shape(font,b,{'liga':int(s['liga']),'kern':int(s['kern'])});glyphs=[]
   for g,p in zip(b.glyph_infos,b.glyph_positions):
    pen=Pen();font.draw_glyph_with_pen(g.codepoint,pen)
    glyphs.append({'outline':pen.commands,'cluster':g.cluster,'missing':g.codepoint==0,'position':[p.x_advance,p.y_advance,p.x_offset,p.y_offset]})
   lines.append(glyphs)
 return lines

def main():
 sources=json.loads((ROOT/'demo/sources.json').read_text())
 for item in sources['files']+sources.get('derived',[]):assert hashlib.sha256((ROOT/'demo'/item['file']).read_bytes()).hexdigest()==item['sha256'],item['file']
 for language in ('eng','fra','arb'):
  root=ET.parse(ROOT/f'demo/udhr_{language}.xml').getroot();text='\n'.join(''.join(p.itertext()).strip() for p in root.find('{*}article').findall('{*}para'))+'\n';assert text==(ROOT/f'demo/{language}.txt').read_text()
 records=[]
 for name,font in [('latin','NotoSans-Regular.ttf'),('arabic','NotoNaskhArabic-Regular.ttf')]:
  folder=ROOT/'samples'/name;m=json.loads((folder/'manifest.json').read_text());source=(ROOT/'demo'/font).read_bytes();data=(folder/'subset.woff2').read_bytes();text=(folder/'text.txt').read_text()
  assert hashlib.sha256(source).hexdigest()==m['source']['sha256'];assert len(source)==m['source']['bytes']
  for path,meta in m['files'].items():
   blob=(folder/path).read_bytes();assert len(blob)==meta['bytes'];assert hashlib.sha256(blob).hexdigest()==meta['sha256']
  a=shaped(source,text,m['settings']);b=shaped(data,text,m['settings']);assert a==b,name
  assert not any(g['missing'] for run in b for g in run)
  records.append({'sample':name,'glyph_count':sum(map(len,b)),'outlines_positions_clusters_equal':True,'missing_glyphs':0,'source_bytes':len(source),'subset_bytes':len(data)})
 report={'oracle':'HarfBuzz draw_glyph_with_pen outline commands, explicit-script shaping; independent of core.py and its fontTools pen hash implementation','harfbuzz':hb.version_string(),'uharfbuzz':hb.__version__,'samples':records}
 (ROOT/'results/independent.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
