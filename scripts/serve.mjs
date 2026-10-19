import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
export function serve(port=4173){
 const root=resolve('.');
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/control/redirect'){res.writeHead(302,{Location:'/control/failure'});res.end();return;}
  if(url.pathname==='/control/failure'){res.writeHead(503);res.end('Controlled failure, not a public observation');return;}
  if(url.pathname==='/control/slow'){await new Promise(r=>setTimeout(r,350));res.end('Controlled 350ms server delay');return;}
  try{
   let path=decodeURIComponent(url.pathname);if(path==='/')path='/web/index.html';if(path.endsWith('/'))path+='index.html';
   if(!['/web/','/fixtures/','/results/'].some(prefix=>path.startsWith(prefix)))throw Error();
   const file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))throw Error();
   const data=await readFile(file);
   res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.har':'application/json','.png':'image/png'})[extname(file)]||'text/plain');
   if(path.startsWith('/web/'))res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
   res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
 });return new Promise(r=>server.listen(port,'127.0.0.1',()=>r(server)));
}
if(process.argv[1]===new URL(import.meta.url).pathname){await serve(Number(process.env.PORT||4173));console.log('HAR Waterfall Desk: http://127.0.0.1:'+ (process.env.PORT||4173));}
