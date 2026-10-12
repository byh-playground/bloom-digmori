import http from 'node:http';
import {readFileSync} from 'node:fs';
const files=new Map([['/','index.html'],['/index.html','index.html'],['/build.json','build.json']]);
http.createServer((req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname.replace(/^\/bloom-digmori(?=\/)/,'');
 const file=files.get(route);
 if(!file){res.writeHead(404);res.end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.json')?'application/json':'text/html; charset=utf-8');res.end(readFileSync(new URL('../dist/'+file,import.meta.url)));}
 catch{res.writeHead(503);res.end('Run npm run build first.');}
}).listen(8000,'127.0.0.1',()=>console.log('Digmori: http://127.0.0.1:8000/bloom-digmori/'));

