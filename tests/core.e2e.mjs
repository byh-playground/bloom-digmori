import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
// Fixed user flow for the player slice: move, roll, three-hit combo, equipment, deterministic replay.
const started=Date.now(),errors=[],report={};
const timeout=setTimeout(()=>{console.error('E2E exceeded 180 seconds');process.exit(1);},180000);
let browser,server;
try{
 // Static rule: the simulation never touches floats, trig, randomness or wall-clock time.
 for(const file of fs.readdirSync(new URL('../src/sim/',import.meta.url))){
  const src=fs.readFileSync(new URL('../src/sim/'+file,import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm,'');
  assert.doesNotMatch(src,/Math\.(sin|cos|tan|atan2|sqrt|random|pow|hypot)\b|Date\.now|performance\.now/,file+' uses a non-deterministic API');
  assert.doesNotMatch(src,/\b\d+\.\d+\b/,file+' contains a float literal');
 }
 let url=process.env.TEST_URL;
 if(!url){server=http.createServer(serveStatic);await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port+'/bloom-digmori/';}
 browser=await chromium.launch({...(process.env.BROWSER_CHANNEL||process.platform==='win32'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{}),headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(url);
 await page.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:60000});
 const player=()=>page.evaluate(()=>{const p=window.Bloom.app.sim.player;return{x:p.x,z:p.z,state:p.state,combo:p.combo,weapon:p.weapon,tier:p.tier,tick:window.Bloom.app.sim.tick}});
 const Q=1024;
 // Move right for 0.6 s.
 const p0=await player();await page.keyboard.down('KeyD');await page.waitForTimeout(600);await page.keyboard.up('KeyD');const p1=await player();
 report.walkMeters=(p1.x-p0.x)/Q;assert(report.walkMeters>1.5,'walk moved '+report.walkMeters);assert.equal(p1.z,p0.z);
 // Roll left: state becomes roll, then returns to idle having travelled about 4.6 m.
 await page.waitForTimeout(300);const r0=await player();await page.keyboard.down('KeyA');await page.keyboard.press('Space');
 await page.waitForFunction(()=>window.Bloom.app.sim.player.state===2,null,{timeout:2000});await page.keyboard.up('KeyA');
 await page.waitForFunction(()=>window.Bloom.app.sim.player.state!==2,null,{timeout:3000});const r1=await player();
 report.rollMeters=(r0.x-r1.x)/Q;assert(report.rollMeters>3.5&&report.rollMeters<6,'roll moved '+report.rollMeters);
 // Three-hit combo: each press during the previous swing queues the next one.
 const combos=new Set();await page.evaluate(()=>{window.__combos=new Set();const app=window.Bloom.app,tick=app.tick.bind(app);app.tick=()=>{tick();const p=app.sim.player;if(p.state===3)window.__combos.add(p.combo)}});
 for(let i=0;i<3;i++){await page.keyboard.press('KeyJ');await page.waitForTimeout(330);}
 await page.waitForFunction(()=>window.Bloom.app.sim.player.state!==3,null,{timeout:4000});
 report.combos=await page.evaluate(()=>[...window.__combos].sort());assert.deepEqual(report.combos,[0,1,2]);combos.clear();
 // Equipment: weapon 2 = greatsword, T cycles the tier.
 await page.keyboard.press('Digit2');await page.keyboard.press('KeyT');await page.waitForTimeout(150);const e=await player();
 assert.equal(e.weapon,'greatsword');assert.equal(e.tier,(p0.tier+1)%3);report.equipment={weapon:e.weapon,tier:e.tier};
 // Deterministic replay: the recorded commands rebuild the same state twice.
 report.replay=await page.evaluate(()=>{const app=window.Bloom.app,run=()=>{const s=new Simulation();for(const c of app.commands)s.step(c);return s.checksum()};return{live:app.sim.checksum(),a:run(),b:run(),ticks:app.commands.length}});
 assert.equal(report.replay.a,report.replay.b);assert.equal(report.replay.a,report.replay.live);
 if(process.env.TEST_SCREENSHOT)await page.screenshot({path:process.env.TEST_SCREENSHOT});
 assert.deepEqual(errors,[]);
 const result={result:'PASS',elapsedMs:Date.now()-started,errors:errors.length,...report};
 if(process.env.TEST_REPORT)fs.writeFileSync(process.env.TEST_REPORT,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({result:'FAIL',elapsedMs:Date.now()-started,errors,report,message:error.message}));process.exitCode=1;}
finally{clearTimeout(timeout);await browser?.close();server?.close();}
