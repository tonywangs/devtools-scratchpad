import {readdir,stat} from 'node:fs/promises';
const excluded=new Set(['.git','.agents','.codex','node_modules','test-results','playwright-report']);
let count=0,bytes=0;
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(excluded.has(e.name))continue;const p=`${dir}/${e.name}`;if(e.isDirectory())await walk(p);else {const s=await stat(p);if(s.size>10*1024*1024)throw Error(`Oversized file: ${p}`);if(p.endsWith('.log')&&p!=='./results/tests.log')throw Error(`Disallowed log: ${p}`);count++;bytes+=s.size;}}}
await walk('.');if(count>1000||bytes>32*1024*1024)throw Error('Tree limit exceeded');console.log(`${count} publishable files, ${bytes} bytes; within limits`);
