// Companion species cut-out rig: the deterministic preview loads with 0 errors and draws every species,
// view, anim and expression from the authored PNG parts listed in each <species>-parts.json.
import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
const timeout=setTimeout(()=>{console.error('unit-rig E2E exceeded 180 seconds');process.exit(1);},180000);
const SPECIES=['root','rock-chick','mushroom-snail'];
let server,browser;
try{
 for(const species of SPECIES){
  const dir=new URL('../src/assets/units/'+species+'/',import.meta.url),meta=JSON.parse(fs.readFileSync(new URL(species+'-parts.json',dir),'utf8'));
  const pngs=fs.readdirSync(dir).filter(f=>f.endsWith('.png')).map(f=>f.slice(0,-4)).sort();
  assert.deepEqual(Object.keys(meta.parts).sort(),pngs,species+': every PNG is listed in the parts JSON and every listed part has a PNG');
 }
 server=http.createServer(serveStatic);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({...(process.env.BROWSER_CHANNEL||process.platform==='win32'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{}),headless:true});
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));
 page.on('response',r=>{if(r.status()>=400)errors.push(r.url()+': '+r.status());});
 await page.goto('http://127.0.0.1:'+server.address().port+'/bloom-digmori/previews/unit-rig/');
 await page.waitForFunction(()=>window.unitPreview?.ready,null,{timeout:30000});
 const status=await page.evaluate(()=>({errors:window.unitPreview.errors,cells:window.unitPreview.cells,species:window.unitPreview.species,faces:window.unitPreview.faces,anims:window.unitPreview.anims}));
 assert.deepEqual(status.errors,[]);assert.deepEqual(errors,[]);
 const expected=await page.evaluate(()=>({anims:UNIT_ANIMS,views:UNIT_VIEWS,expressions:UNIT_EXPRESSIONS}));
 for(const species of SPECIES){
  assert.deepEqual(status.species[species],[...expected.views].sort(),species+' draws front, side and back');
  assert.deepEqual(status.anims[species],[...expected.anims[species]].sort(),species+' draws every anim');
  for(const view of ['front','side'])for(const face of expected.expressions)assert(status.faces[species].includes('face_'+view+'_'+face),species+' draws '+view+' '+face);
 }
 // Every section painted pixels, and an equal look draws an equal frame (deterministic keyframes, no Math.random).
 const pixels=await page.evaluate(()=>[...document.querySelectorAll('section')].map(sec=>{const c=sec.querySelector('canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return[sec.dataset.species,n];}));
 for(const [species,n]of pixels)assert(n>500,species+' section paints its rig');
 const deterministic=await page.evaluate(async()=>{const rigs=await UnitRig.loadAll('../../'+DEPENDENCIES.unitArt.base),out=[];
  for(const species of UNIT_SPECIES)for(const anim of UNIT_ANIMS[species]){const frame=()=>{const c=document.createElement('canvas');c.width=c.height=256;rigs[species].draw(c.getContext('2d'),{species,anim,view:'side',flip:true,progress:.47,seconds:1.3,grade:3,stage:'boss'},{x:128,y:230,scale:.3});return c.toDataURL();};out.push(frame()===frame());}
  return out.every(Boolean);});
 assert.equal(deterministic,true);
 console.log(JSON.stringify({result:'PASS',cells:status.cells,species:SPECIES.length,anims:Object.fromEntries(SPECIES.map(s=>[s,status.anims[s].length])),errors:0}));
}finally{clearTimeout(timeout);await browser?.close();server?.close();}
