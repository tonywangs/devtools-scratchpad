"""Bounded static TrueType subsetting; HarfBuzz validates the actual exported WOFF2."""
import base64,hashlib,html,io,json,re,zipfile,unicodedata as ud
from fontTools.ttLib import TTFont
from fontTools import subset, unicodedata
from fontTools.pens.recordingPen import DecomposingRecordingPen
import fontTools,uharfbuzz as hb

MAX_FONT=5*1024*1024
MAX_TEXT=12000
IGNORED={10,13,9,0x200c,0x200d}
DEFAULT={'script':'Latn','language':'en','direction':'ltr','liga':True,'kern':True}

def digest(data):return hashlib.sha256(data).hexdigest()
def settings(value):
 if not isinstance(value,dict):raise ValueError('Settings must be an object.')
 s=DEFAULT|value
 if set(s)!=set(DEFAULT) or s['script'] not in ('Latn','Arab') or s['direction'] not in ('ltr','rtl') or not isinstance(s['language'],str) or not re.fullmatch(r'[a-z]{2,3}(-[A-Za-z0-9]{2,8})?',s['language']) or any(type(s[k]) is not bool for k in ('liga','kern')):raise ValueError('Invalid shaping settings.')
 if (s['script']=='Arab')!=(s['direction']=='rtl'):raise ValueError('Arabic requires RTL; Latin requires LTR.')
 return s

def load(data):
 if not data or len(data)>MAX_FONT:raise ValueError('Font must be between 1 byte and 5 MiB.')
 try:
  f=TTFont(io.BytesIO(data),recalcTimestamp=False)
  if 'glyf' not in f or any(t in f for t in ('fvar','COLR','CBDT','sbix','SVG ','Silf')):raise ValueError('Only static, monochrome TrueType outlines (TTF/WOFF/WOFF2) are supported; no collections, variable, CFF, color or Graphite fonts.')
  if not f.getBestCmap():raise ValueError('No Unicode character map.')
  if f['OS/2'].fsType & 0x302:raise ValueError('Embedding restrictions prohibit this workflow (restricted, no-subsetting, or bitmap-only).')
  return f
 except ValueError:raise
 except Exception as e:raise ValueError('Unreadable or unsupported font.') from e

def validate_text(text,s):
 if not isinstance(text,str) or not text.strip() or len(text)>MAX_TEXT:raise ValueError('Provide 1–12,000 characters of UTF-8 text.')
 if any(0xd800<=ord(c)<=0xdfff for c in text):raise ValueError('Text contains invalid Unicode surrogates.')
 bad=sorted({unicodedata.script(c) for c in text if unicodedata.script(c) not in (s['script'],'Zyyy','Zinh')})
 if bad:raise ValueError('Text contains unsupported/mixed scripts for this run: '+', '.join(bad)+'. Use separate projects for Latin and Arabic.')
 if any(ord(c)<32 and ord(c) not in IGNORED for c in text):raise ValueError('Unsupported control characters.')
 if any(ord(c) in range(0x202a,0x202f) or ord(c) in range(0x2066,0x206a) for c in text):raise ValueError('Explicit bidi controls are unsupported; use the direction setting.')

def inspect(data,text,s):
 s=settings(s);validate_text(text,s);f=load(data);cmap=f.getBestCmap();cps=sorted(set(map(ord,text))-IGNORED)
 missing=[{'codepoint':f'U+{cp:04X}','character':chr(cp)} for cp in cps if cp not in cmap]
 return {'source_sha256':digest(data),'source_bytes':len(data),'family':f['name'].getDebugName(1),'unique_characters':len(cps),'covered':len(cps)-len(missing),'missing':missing,'ignored_controls':[f'U+{cp:04X}' for cp in sorted(set(map(ord,text))&IGNORED)],'notice':'Character-map coverage is not a shaping or rendering guarantee.'}

def sfnt(f):
 old=f.flavor;f.flavor=None;b=io.BytesIO();f.save(b);f.flavor=old;return b.getvalue()

def shape(font,text,s):
 """Compare decomposed outlines, clusters and all positions, never renumbered GIDs."""
 hf=hb.Font(hb.Face(sfnt(font)));hb.ot_font_set_funcs(hf);hf.scale=(font['head'].unitsPerEm,)*2
 gs=font.getGlyphSet();order=font.getGlyphOrder();cache={}
 def outline(gid):
  if gid not in cache:
   pen=DecomposingRecordingPen(gs);gs[order[gid]].draw(pen);cache[gid]=digest(json.dumps(pen.value,separators=(',',':')).encode())
  return cache[gid]
 out=[]
 for line in text.splitlines():
  # Tab uses browser expansion; shaping checks each tab-separated run independently.
  for run in line.split('\t'):
   if not run:
    out.append([]);continue
   b=hb.Buffer();b.add_str(run);b.script=s['script'];b.language=s['language'];b.direction=s['direction'];hb.shape(hf,b,{k:int(s[k]) for k in ('liga','kern')})
   out.append([{'outline':outline(i.codepoint),'cluster':i.cluster,'missing':i.codepoint==0,'advance':[p.x_advance,p.y_advance],'offset':[p.x_offset,p.y_offset]} for i,p in zip(b.glyph_infos,b.glyph_positions)])
 return out

def build(data,text,options,license_text,rights=False):
 s=settings(options);coverage=inspect(data,text,s)
 if coverage['missing']:raise ValueError('Missing coverage; export blocked. Select a covering font or edit the text.')
 if rights is not True or not isinstance(license_text,str) or not license_text.strip() or len(license_text)>100000:raise ValueError('Supply the full license/copyright notice and confirm permission to subset and redistribute.')
 original=load(data);font=load(data)
 o=subset.Options();o.layout_features=['*'];o.name_IDs=['*'];o.name_languages=['*'];o.name_legacy=True;o.glyph_names=True;o.notdef_outline=True;o.hinting=True;o.harfbuzz_repacker=False
 worker=subset.Subsetter(options=o);worker.populate(unicodes=set(map(ord,text+ud.normalize('NFC',text)+ud.normalize('NFD',text)))-set([10,13,9]));worker.subset(font)
 # Rename modified fonts, including typographic/WWS families, to avoid reserved names.
 family='SubsetDesk'+digest(data+text.encode()+json.dumps(s,sort_keys=True).encode())[:12]
 for rec in list(font['name'].names):
  if rec.nameID in (1,2,3,4,6,16,17,18,21,22,25):font['name'].removeNames(nameID=rec.nameID)
 for nid,val in {1:family,2:'Regular',3:family,4:family,6:family,16:family,17:'Regular'}.items():
  font['name'].setName(val,nid,3,1,0x409)
 font.flavor='woff2';out=io.BytesIO();font.save(out);woff=out.getvalue();exported=load(woff)
 before=shape(original,text,s);after=shape(exported,text,s)
 checked={'engine':'uharfbuzz '+hb.__version__,'harfbuzz':hb.version_string(),'fonttools':fontTools.__version__,'method':'Per-line, per-tab explicit script/language/direction; decomposed outline SHA-256, clusters, missing-glyph flags, x/y advances and offsets in font units. No raw glyph ID comparison.','equal':before==after,'missing_glyphs':sum(g['missing'] for run in after for g in run),'glyph_count':sum(map(len,after)),'original':before,'subset':after}
 if not checked['equal'] or checked['missing_glyphs']:raise ValueError('HarfBuzz preservation check failed or produced missing glyphs; export blocked.')
 css=f'@font-face {{ font-family: "{family}"; src: url("subset.woff2") format("woff2"); font-style: normal; font-weight: 400; font-display: block; }}\n.specimen {{ font-family: "{family}"; font-synthesis: none; font-feature-settings: "liga" {int(s["liga"])}, "kern" {int(s["kern"])}; white-space: pre-wrap; direction: {s["direction"]}; }}\n'
 manifest={'schema':1,'source':{'sha256':digest(data),'bytes':len(data),'family':coverage['family']},'text':{'sha256':digest(text.encode()),'bytes':len(text.encode()),'codepoints':len(text)},'settings':s,'subset':{'sha256':digest(woff),'bytes':len(woff),'family':family,'saved_bytes':len(data)-len(woff),'change_percent':round((len(woff)/len(data)-1)*100,2)},'coverage':coverage,'shaping':{k:v for k,v in checked.items() if k not in ('original','subset')},'license_sha256':digest(license_text.encode()),'limitations':['Only the selected text and explicit shaping settings were checked.','Cmap coverage is distinct from shaping. HarfBuzz equality is not a cross-browser pixel guarantee.','Rebuild for future text outside the repertoire. Use separate script runs; no mixed bidi paragraphs.','Font is renamed; preserve this license and all applicable source obligations.']}
 embedded=css.replace('url("subset.woff2")',f'url("data:font/woff2;base64,{base64.b64encode(woff).decode()}")')
 specimen='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'"><title>Subset Desk specimen</title><style>body{max-width:900px;margin:40px auto;padding:24px;font:16px system-ui;background:#f5f2e9;color:#172e32}.specimen{font-size:32px;line-height:1.8}#text{visibility:hidden}pre{white-space:pre-wrap}</style><style>'''+embedded+'</style><h1>Exported webfont specimen</h1><p id="status">Loading embedded font…</p><p>HarfBuzz outlines and positions matched the source for this text. Future text may require rebuilding. This page embeds only the exported font; it needs no network.</p><div id="text" class="specimen" lang="'+s['language']+'" dir="'+s['direction']+'">'+html.escape(text)+'</div><details><summary>License and copyright notices</summary><pre>'+html.escape(license_text)+'</pre></details><script>const family='+json.dumps(family)+''';document.fonts.load('32px "'+family+'"',document.querySelector('#text').textContent).then(f=>{if(f.length!==1||f[0].status!=='loaded')throw Error('Font not loaded');document.querySelector('#text').style.visibility='visible';document.querySelector('#status').textContent='Embedded subset loaded · cmap coverage and HarfBuzz checks passed';window.specimenReady=true}).catch(()=>{document.querySelector('#status').textContent='FONT LOAD FAILED — specimen hidden to prevent silent fallback';});</script>'''
 files={'subset.woff2':woff,'style.css':css.encode(),'specimen.html':specimen.encode(),'text.txt':text.encode(),'LICENSE.txt':license_text.encode(),'shaping.json':json.dumps(checked,ensure_ascii=False,indent=2).encode()}
 manifest['files']={name:{'sha256':digest(blob),'bytes':len(blob)} for name,blob in files.items()}
 files['manifest.json']=json.dumps(manifest,ensure_ascii=False,indent=2).encode()
 z=io.BytesIO()
 with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as archive:
  for name,blob in files.items():archive.writestr(name,blob)
 return {'manifest':manifest,'woff2':base64.b64encode(woff).decode(),'zip':base64.b64encode(z.getvalue()).decode(),'shaping':checked}
