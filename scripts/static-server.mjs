import {readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
export function serveStatic(req,res){
 try{
  let route=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/bloom-digmori(?=\/)/,'');
  if(route.endsWith('/'))route+='index.html';
  const file=path.resolve(root,'.'+route);
  if(!file.startsWith(root)||!/^\/(index\.html|src\/|previews\/)/.test(route)||!statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(readFileSync(file));
 }catch{res.writeHead(404);res.end();}
}
