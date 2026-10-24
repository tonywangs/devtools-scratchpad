import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import available_timezones
from .engine import Invalid, LIMITS, evaluate
from .importing import import_source, load_project
from .report import standalone

ROOT=Path(__file__).resolve().parent.parent
GATE=threading.BoundedSemaphore(2)


def demo():
    manifest=json.loads((ROOT/'fixtures/manifest.json').read_text())
    project={'schema':'atlas-project-v1','title':'Real workflows · timezone comparison','start':'2026-10-24T00:00:00Z','end':'2026-11-03T00:00:00Z','annotation':'Pinned Flask and Requests workflows. UTC is the original hosted setting. Duplicate a schedule to simulate another timezone.','sources':[],'schedules':[]}
    for source in manifest['sources']:
        if source['kind']!='workflow':continue
        content=(ROOT/source['local']).read_text()
        item=import_source(dict(source,content=content,format='workflow',name=source['repository']+' / '+Path(source['path']).name,license_url=f"https://github.com/{source['repository']}/blob/{source['revision']}/{source['license_path']}"))
        # Bind to the pinned manifest hash, rather than silently accepting modified fixtures.
        item['source']['sha256']=source['sha256']
        project['sources'].append(item['source']);project['schedules'].extend(item['schedules'])
    return project


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass

    def send(self,status,body,mime='application/json'):
        if not isinstance(body,bytes):body=(json.dumps(body,ensure_ascii=False) if mime=='application/json' else body).encode()
        self.send_response(status)
        self.send_header('Content-Type',mime+'; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        try:self.wfile.write(body)
        except (BrokenPipeError,ConnectionResetError):pass

    def permitted(self):
        host=self.headers.get('Host','')
        allowed={f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
        origin=self.headers.get('Origin')
        return host in allowed and (origin is None or origin=='http://'+host)

    def do_GET(self):
        if not self.permitted():return self.send(403,{'error':'Local same-origin access only'})
        path=urlsplit(self.path).path
        if path=='/api/demo':return self.send(200,demo())
        if path=='/api/zones':return self.send(200,sorted(z for z in available_timezones() if not z.startswith(('posix/','right/'))))
        files={'/':('index.html','text/html'),'/app.js':('app.js','text/javascript'),'/style.css':('style.css','text/css')}
        if path not in files:return self.send(404,{'error':'Not found'})
        name,mime=files[path];self.send(200,(ROOT/'static'/name).read_bytes(),mime)

    def do_POST(self):
        if not self.permitted():return self.send(403,{'error':'Local same-origin access only'})
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.send(415,{'error':'application/json required'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=LIMITS['request_bytes']:raise Invalid('Request must be 1 byte–1 MiB')
            self.connection.settimeout(10)
            data=json.loads(self.rfile.read(size))
            if not isinstance(data,dict):raise Invalid('Expected JSON object')
            if self.path=='/api/import':return self.send(200,import_source(data))
            if self.path=='/api/project':return self.send(200,load_project(data))
            if self.path in ['/api/evaluate','/api/export']:
                if not GATE.acquire(blocking=False):return self.send(429,{'error':'Two evaluations already active; retry shortly'})
                try:report=evaluate(data)
                finally:GATE.release()
                if self.path=='/api/export':return self.send(200,standalone(report),'text/html')
                return self.send(200,report)
            self.send(404,{'error':'Not found'})
        except (Invalid,ValueError,TypeError,RecursionError) as exc:self.send(400,{'error':str(exc)[:500]})
        except (TimeoutError,ConnectionError):pass


def main():
    parser=argparse.ArgumentParser(description='Local cron simulator; never installs or executes jobs')
    parser.add_argument('--port',type=int,default=8765)
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Cron Schedule Atlas: http://127.0.0.1:{server.server_port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
