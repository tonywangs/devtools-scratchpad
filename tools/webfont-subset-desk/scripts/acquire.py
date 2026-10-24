"""Reacquire pinned public demo inputs; verify against checked-in manifest by default."""
import hashlib,json,pathlib,urllib.request,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]; D=ROOT/'demo'
SOURCES=[('notofonts/noto-fonts','ffebf8c1ee449e544955a7e813c54f9b73848eac','hinted/ttf/NotoSans/NotoSans-Regular.ttf','NotoSans-Regular.ttf'),('notofonts/noto-fonts','ffebf8c1ee449e544955a7e813c54f9b73848eac','hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Regular.ttf','NotoNaskhArabic-Regular.ttf'),('notofonts/noto-fonts','ffebf8c1ee449e544955a7e813c54f9b73848eac','LICENSE','OFL.txt')]+[('unicode-org/udhr','588b3f4b2d0467aff54842a4b926551b69d5a66a',f'data/udhr/udhr_{lang}.xml',f'udhr_{lang}.xml') for lang in ['eng','fra','arb']]
def main():
 D.mkdir(exist_ok=True); old=json.loads((D/'sources.json').read_text()) if (D/'sources.json').exists() else None
 records=[]
 for repo,rev,path,name in SOURCES:
  url=f'https://raw.githubusercontent.com/{repo}/{rev}/{path}';data=urllib.request.urlopen(url,timeout=30).read();sha=hashlib.sha256(data).hexdigest()
  if old:assert next(x for x in old['files'] if x['file']==name)['sha256']==sha,name
  (D/name).write_bytes(data);records.append(dict(file=name,url=url,revision=rev,sha256=sha,bytes=len(data)))
 for lang in ['eng','fra','arb']:
  root=ET.parse(D/f'udhr_{lang}.xml').getroot();article=root.find('{*}article');text='\n'.join(''.join(p.itertext()).strip() for p in article.findall('{*}para'))+'\n';(D/f'{lang}.txt').write_text(text,encoding='utf-8')
 license_url='https://www.unicode.org/license.txt'
 license_data=urllib.request.urlopen(license_url,timeout=30).read();license_sha=hashlib.sha256(license_data).hexdigest()
 if old:assert next(x for x in old['files'] if x['file']=='UNICODE-LICENSE.txt')['sha256']==license_sha,'Unicode license changed; retain the checked-in dated snapshot and review new terms.'
 (D/'UNICODE-LICENSE.txt').write_bytes(license_data);records.append(dict(file='UNICODE-LICENSE.txt',url=license_url,revision='retrieved 2026-10-19; content pinned by SHA-256',sha256=license_sha,bytes=len(license_data)))
 notice='''Universal Declaration of Human Rights, Article 1, English, French and Arabic.
Source: Unicode UDHR XML project, https://github.com/unicode-org/udhr
Revision: 588b3f4b2d0467aff54842a4b926551b69d5a66a
The Declaration was adopted by the UN General Assembly on 10 December 1948.
The Unicode-hosted collection was retired in January 2024. These historical
transcriptions are used as typography specimens, not authoritative translations.
Unicode data notice follows (https://www.unicode.org/license.txt).
'''
 (D/'TEXT-NOTICE.txt').write_text(notice+license_data.decode(),encoding='utf-8')
 derived=[dict(file=n,sha256=hashlib.sha256((D/n).read_bytes()).hexdigest(),bytes=(D/n).stat().st_size) for n in ('eng.txt','fra.txt','arb.txt','TEXT-NOTICE.txt')]
 (D/'sources.json').write_text(json.dumps({'files':records,'derived':derived,'text_extraction':'First article, all para itertext, stripped, joined with newline and final newline; no normalization.'},indent=2)+'\n')
if __name__=='__main__':main()
