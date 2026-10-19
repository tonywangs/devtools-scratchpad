import http from 'node:http';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {inspect} from './inspect.js';
import {html} from './report.js';
const token=crypto.randomBytes(24).toString('hex');
const port=Number(process.env.PORT||4173);
const staticRoot=fileURLToPath(new URL('../public/',import.meta.url));
const server=http.createServer(async(req,res)=>{
  const headers={'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
  function reply(status,body,type='application/json'){res.writeHead(status,{...headers,'Content-Type':type});res.end(body);}
  try {
    if(req.headers.host!==`127.0.0.1:${port}`)return reply(403,'{}');
    if(req.method==='GET'&&['/','/app.js','/style.css'].includes(req.url)) {
      const file=req.url==='/'?'index.html':req.url.slice(1);let data=await fs.readFile(staticRoot+file,'utf8');data=data.replace('__TOKEN__',token).replace('DEMO_ROOT',fileURLToPath(new URL('../demo/source',import.meta.url)));
      return reply(200,data,file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    }
    if(req.method!=='POST'||req.headers['x-desk-token']!==token||req.headers.origin!==`http://127.0.0.1:${port}`)return reply(403,'{}');
    let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>32*1024*1024)throw Error('Request too large');body+=chunk;}
    const input=JSON.parse(body);
    if(req.url==='/inspect')return reply(200,JSON.stringify(await inspect(input.root)));
    if(req.url==='/html')return reply(200,html(input),'text/html');
    reply(404,'{}');
  }catch(e){reply(400,JSON.stringify({error:e.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`License Desk: http://127.0.0.1:${port}\nDemo root: ${fileURLToPath(new URL('../demo/source',import.meta.url))}`));
