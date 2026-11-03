// Player rig pose sheet (0.36.1): draws every rig animation (idle, walk, attack, roll, mine, swim, jump, fall) in the
// front/side/back views with the real PlayerRig from the page, checks each cell differs from idle and saves the sheet
// (SHOTS=<dir>). Presentation only: no simulation state is touched.
import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const SHOTS=process.env.SHOTS||null,errors=[];
const timeout=setTimeout(()=>{console.error('player-poses exceeded 120 seconds');process.exit(1);},120000);
let browser,server;
try{
 server=http.createServer(serveStatic);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port+'/bloom-digmori/';
 browser=await chromium.launch({...(process.platform==='win32'?{channel:'msedge'}:{}),headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.Bloom?.app?.renderer?.playerRig?.rig,null,{timeout:60000});
 const result=await page.evaluate(()=>{
  const rig=Bloom.app.renderer.playerRig.rig,anims=['idle','walk','attack','roll','mine','swim','jump','fall'],views=['front','side','back'],C=256;
  const sheet=document.createElement('canvas');sheet.width=C*anims.length;sheet.height=C*views.length+24;const g=sheet.getContext('2d');g.fillStyle='#8fb7d6';g.fillRect(0,0,sheet.width,sheet.height);
  const cell=document.createElement('canvas');cell.width=cell.height=512;const x=cell.getContext('2d'),sums={};
  const base={flip:false,combo:0,weapon:'pick',material:'iron',helmet:'iron',chest:null,boots:'base',hurt:false};
  for(const [i,anim]of anims.entries())for(const [j,view]of views.entries()){
   const look={...base,anim,view:anim==='attack'||anim==='mine'?'side':view,progress:anim==='attack'?.24:anim==='roll'?.5:anim==='mine'?.55:0};
   x.clearRect(0,0,512,512);rig.draw(x,look,anim==='walk'?.4:anim==='swim'?.3:0,{x:256,y:420,scale:1});
   const d=x.getImageData(0,0,512,512).data;let h=0;for(let k=3;k<d.length;k+=64)h=(h*31+d[k])>>>0;sums[anim+':'+view]=h;
   g.drawImage(cell,i*C,24+j*C,C,C);g.fillStyle='#123';g.font='16px sans-serif';if(!j)g.fillText(anim,i*C+8,18);}
  return{sums,png:sheet.toDataURL('image/png')};});
 for(const a of ['walk','attack','roll','mine','swim','jump','fall'])for(const v of ['front','side','back'])
  if(a!=='attack'&&a!=='mine')assert.notEqual(result.sums[a+':'+v],result.sums['idle:'+v],a+' '+v+' draws the same as idle');
 assert.notEqual(result.sums['mine:side'],result.sums['attack:side'],'mine differs from the attack strike');
 if(SHOTS){fs.mkdirSync(SHOTS,{recursive:true});fs.writeFileSync(SHOTS+'/player-poses.png',Buffer.from(result.png.split(',')[1],'base64'));}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',cells:Object.keys(result.sums).length}));
}finally{clearTimeout(timeout);await browser?.close();server?.close();}
