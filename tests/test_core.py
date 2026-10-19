import base64,io,json,unittest,zipfile
from pathlib import Path
from core import build,inspect,DEFAULT,digest,load
from fontTools.ttLib import TTFont,newTable
from app import app
D=Path(__file__).resolve().parents[1]/'demo'
class Workflow(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.font=(D/'NotoSans-Regular.ttf').read_bytes();cls.license=(D/'OFL.txt').read_text();cls.text=(D/'eng.txt').read_text()+'\n'+(D/'fra.txt').read_text()
 def test_real_export(self):
  r=build(self.font,self.text,DEFAULT,self.license,True);m=r['manifest'];self.assertLess(m['subset']['bytes'],len(self.font));self.assertTrue(m['shaping']['equal']);self.assertEqual(m['shaping']['missing_glyphs'],0)
  z=zipfile.ZipFile(io.BytesIO(base64.b64decode(r['zip'])))
  for name,meta in m['files'].items():self.assertEqual(digest(z.read(name)),meta['sha256']);self.assertEqual(len(z.read(name)),meta['bytes'])
  self.assertEqual(z.read('text.txt').decode(),self.text);self.assertEqual(z.read('LICENSE.txt').decode(),self.license);self.assertNotIn('Noto',load(z.read('subset.woff2'))['name'].getDebugName(1))
 def test_missing_coverage(self):
  c=inspect(self.font,'A\U0001f984',DEFAULT);self.assertEqual(c['missing'][0]['codepoint'],'U+1F984')
  with self.assertRaisesRegex(ValueError,'Missing coverage'):build(self.font,'A\U0001f984',DEFAULT,self.license,True)
 def test_malformed_and_unsupported(self):
  for data in (b'junk',b'ttcf'+b'0'*30,b'x'*(5*1024*1024+1)):
   with self.assertRaises(ValueError):load(data)
  f=TTFont(io.BytesIO(self.font));f['OS/2'].fsType=0x100;b=io.BytesIO();f.save(b)
  with self.assertRaisesRegex(ValueError,'restrictions'):load(b.getvalue())
 def test_limits_script_and_license(self):
  for text in ('','a'*12001,'ع','x\x00','abc\u202e'):
   with self.assertRaises(ValueError):inspect(self.font,text,DEFAULT)
  with self.assertRaisesRegex(ValueError,'permission'):build(self.font,'test',DEFAULT,'',False)
 def test_controls_and_settings(self):
  for text in ('office ffi fi','AVATAR To WA','a\u0301 e\u0308 A\u030a'):
   for active in (True,False):
    r=build(self.font,text,dict(DEFAULT,liga=active,kern=active),self.license,True);self.assertTrue(r['manifest']['shaping']['equal'])
  r=build((D/'NotoNaskhArabic-Regular.ttf').read_bytes(),'السَّلَامُ عَلَيْكُمْ لا',dict(DEFAULT,script='Arab',language='ar',direction='rtl'),self.license,True);self.assertTrue(r['manifest']['shaping']['equal'])
 def test_http_validation(self):
  c=app.test_client();self.assertEqual(c.get('/',headers={'Host':'evil.example'}).status_code,403)
  self.assertEqual(c.post('/api/build',json={},headers={'Origin':'https://evil.example'}).status_code,403)
  self.assertEqual(c.post('/api/inspect',json={'font':'bad!'}).status_code,400)
if __name__=='__main__':unittest.main()
