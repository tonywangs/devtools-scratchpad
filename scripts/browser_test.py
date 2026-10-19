"""Complete real-input browser workflow, pixel equality, and font-use evidence."""
import base64,hashlib,json,os,socket,subprocess,sys,tempfile,time,zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'demo'
def main():
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 proc=subprocess.Popen([sys.executable,'app.py'],cwd=ROOT,env=dict(os.environ,PORT=str(port)),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  for _ in range(100):
   try:
    with socket.create_connection(('127.0.0.1',port),.1):break
   except OSError:time.sleep(.1)
  with tempfile.TemporaryDirectory(prefix='webfont-browser-') as tmp, sync_playwright() as p:
   override=os.environ.get('CHROMIUM_PATH');browser=p.chromium.launch(**({'executable_path':override} if override else {}),args=['--no-sandbox']);context=browser.new_context(viewport={'width':1280,'height':1100},device_scale_factor=1);page=context.new_page();errors=[];external=[]
   page.on('pageerror',lambda error:errors.append(str(error)));page.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(f'http://127.0.0.1:{port}/') else None)
   page.goto(f'http://127.0.0.1:{port}');page.click('#latinDemo');page.wait_for_function("()=>document.querySelector('#status').textContent.startsWith('Real demo')")
   page.uncheck('#liga');page.uncheck('#kern');saved=page.locator('#text').input_value()
   with page.expect_download() as dl:page.click('#saveProject')
   project=Path(tmp)/'project.json';dl.value.save_as(project)
   page.reload();assert page.locator('#text').input_value()==saved;assert not page.is_checked('#liga');page.click('#build');page.wait_for_function("()=>document.querySelector('#status').textContent.includes('Reconnect')")
   page.set_input_files('#font',str(D/'NotoNaskhArabic-Regular.ttf'));page.wait_for_function("()=>document.querySelector('#status').textContent.includes('hash mismatch')")
   page.set_input_files('#font',str(D/'NotoSans-Regular.ttf'));page.wait_for_function("()=>document.querySelector('#status').textContent.startsWith('Font connected')")
   page.click('#clear');page.set_input_files('#projectFile',str(project));page.wait_for_function("()=>document.querySelector('#status').textContent.startsWith('Project restored')");assert page.locator('#text').input_value()==saved;assert not page.is_checked('#kern')
   page.set_input_files('#font',str(D/'NotoSans-Regular.ttf'));page.wait_for_function("()=>document.querySelector('#status').textContent.startsWith('Font connected')")
   # Exercise UTF-8 file input and missing coverage, then restore the real multilingual text.
   page.set_input_files('#textFile',{'name':'missing.txt','mimeType':'text/plain','buffer':'A🦄'.encode()});page.click('#inspect');page.wait_for_function("()=>document.querySelector('#coverage').textContent.includes('U+1F984')")
   page.click('#build');page.wait_for_function("()=>document.querySelector('#status').textContent.includes('Missing coverage')");assert page.is_disabled('#download')
   page.set_input_files('#textFile',{'name':'real.txt','mimeType':'text/plain','buffer':saved.encode()});page.check('#liga');page.check('#kern')
   results=[]
   for name in ['latin','arabic']:
    if name=='arabic':page.click('#arabicDemo');page.wait_for_function("()=>document.querySelector('#status').textContent.startsWith('Real demo')")
    page.click('#build');page.wait_for_function("()=>document.querySelector('#status').textContent.startsWith('HarfBuzz passed')",timeout=60000)
    pixel=page.evaluate('''async()=>{await document.fonts.ready;const a=document.querySelector('#original'),b=document.querySelector('#subset');let rows=[];for(const size of [16,32,48]){const render=el=>{const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=800;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,2000,800);c.fillStyle='black';c.font=size+'px '+el.style.fontFamily;c.direction=el.dir;c.textAlign=el.dir==='rtl'?'right':'left';c.fontKerning='normal';for(const [i,line]of el.textContent.split('\\n').entries())c.fillText(line,el.dir==='rtl'?1980:20,60+i*size*2);return c.getImageData(0,0,2000,800).data};const x=render(a),y=render(b);let diff=0,ink=0;for(let i=0;i<x.length;i++){if(x[i]!==y[i])diff++;if(i%4!==3&&x[i]!==255)ink++}rows.push({size,different_channels:diff,ink_channels:ink});}return rows;}''')
    assert all(x['different_channels']==0 and x['ink_channels']>0 for x in pixel),pixel
    cdp=context.new_cdp_session(page);cdp.send('DOM.enable');cdp.send('CSS.enable');root=cdp.send('DOM.getDocument')['root']['nodeId'];font_usage={}
    for selector in ['#original','#subset']:
     node=cdp.send('DOM.querySelector',{'nodeId':root,'selector':selector})['nodeId'];fonts=cdp.send('CSS.getPlatformFontsForNode',{'nodeId':node})['fonts'];assert fonts and all(f['isCustomFont'] for f in fonts),fonts;font_usage[selector]=fonts
    with page.expect_download() as dl:page.click('#download')
    zpath=Path(tmp)/(name+'.zip');dl.value.save_as(zpath);folder=Path(tmp)/name
    with zipfile.ZipFile(zpath) as z:z.extractall(folder)
    manifest=json.loads((folder/'manifest.json').read_text())
    for fname,meta in manifest['files'].items():assert hashlib.sha256((folder/fname).read_bytes()).hexdigest()==meta['sha256']
    specimen=context.new_page();requests=[];specimen.on('request',lambda r:requests.append(r.url));specimen.goto((folder/'specimen.html').as_uri());specimen.wait_for_function('()=>window.specimenReady===true');assert not [u for u in requests if u.startswith(('http:','https:'))],requests
    # Standalone has no original font; verify its actual DOM font is the custom subset.
    scdp=context.new_cdp_session(specimen);scdp.send('DOM.enable');scdp.send('CSS.enable');sr=scdp.send('DOM.getDocument')['root']['nodeId'];sn=scdp.send('DOM.querySelector',{'nodeId':sr,'selector':'#text'})['nodeId'];sf=scdp.send('CSS.getPlatformFontsForNode',{'nodeId':sn})['fonts'];assert sf and all(f['isCustomFont'] for f in sf),sf
    specimen.close();results.append({'sample':name,'pixel_comparison':pixel,'dom_fonts':font_usage,'standalone_fonts':sf,'standalone_remote_requests':0,'source_bytes':manifest['source']['bytes'],'subset_bytes':manifest['subset']['bytes']})
    page.screenshot(path=str(ROOT/'results'/f'{name}-workbench.png'),full_page=True)
   assert not errors,errors;assert not external,external
   report={'browser':browser.version,'method':'Chromium canvas RGBA equality at 16/32/48px; white 2000x800 canvas, same coordinates, direction, text. DOM CDP font inspection confirms all rendered fonts are custom. Both default optional features enabled in pixel checks.','workflow':['real Latin demo','feature configuration','project download','reload recovery','mismatched font rejection','matching reconnection','project import','UTF-8 text import','missing coverage blocks export','Latin and Arabic build','ZIP download and hash verification','file:// standalone reopen without remote requests'],'results':results,'page_errors':errors,'external_requests':external}
   (ROOT/'results'/'browser.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n');print(json.dumps(report,indent=2,ensure_ascii=False));browser.close()
 finally:proc.terminate();proc.wait(timeout=10)
if __name__=='__main__':main()
