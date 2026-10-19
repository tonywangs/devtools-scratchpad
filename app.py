import base64,os
from pathlib import Path
from flask import Flask,request,jsonify,send_from_directory
from core import inspect,build
ROOT=Path(__file__).resolve().parent
app=Flask(__name__,static_folder='static');app.config['MAX_CONTENT_LENGTH']=8*1024*1024
@app.before_request
def local_only():
 if request.host.split(':')[0] not in ('127.0.0.1','localhost'):return jsonify(error='Loopback host required.'),403
 if request.method=='POST' and request.headers.get('Origin') not in (None,'http://'+request.host):return jsonify(error='Same-origin requests required.'),403
@app.after_request
def headers(response):
 response.headers['X-Content-Type-Options']='nosniff';response.headers['Cache-Control']='no-store'
 response.headers['Content-Security-Policy']="default-src 'self'; font-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'"
 return response
@app.get('/')
def index():return send_from_directory(ROOT/'static','index.html')
@app.get('/demo/<name>')
def demo(name):
 if name not in ('NotoSans-Regular.ttf','NotoNaskhArabic-Regular.ttf','eng.txt','fra.txt','arb.txt','OFL.txt','TEXT-NOTICE.txt'):return '',404
 return send_from_directory(ROOT/'demo',name)
@app.post('/api/<action>')
def api(action):
 try:
  data=request.get_json();font=base64.b64decode(data['font'],validate=True)
  if action=='inspect':result=inspect(font,data['text'],data['settings'])
  elif action=='build':result=build(font,data['text'],data['settings'],data.get('license',''),data.get('rights',False))
  else:return jsonify(error='Unknown action'),404
  return jsonify(result)
 except (ValueError,KeyError,TypeError) as e:return jsonify(error=str(e)),400
 except Exception:app.logger.exception('Font processing failed');return jsonify(error='Font processing failed; unsupported or damaged input.'),400
@app.errorhandler(413)
def too_large(e):return jsonify(error='Request exceeds 8 MiB.'),413
if __name__=='__main__':app.run(host='127.0.0.1',port=int(os.environ.get('PORT',4173)),threaded=False)
