import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const started=Date.now(),errors=[],responses=[],pending=[],report={};
const timeout=setTimeout(()=>{console.error('E2E exceeded 180 seconds');process.exit(1);},180000);
let browser,server;
const output=process.env.TEST_REPORT;
try {
 let url=process.env.TEST_URL;
 if(!url){server=http.createServer((req,res)=>{
  if(new URL(req.url,'http://localhost').pathname==='/bloom-digmori/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(new URL('../dist/index.html',import.meta.url)));}
  else{res.writeHead(404);res.end();}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port+'/bloom-digmori/';}
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':'chromium'),headless:true});
 report.browser=browser.version();report.url=url;
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('requestfailed',request=>errors.push(request.url()+': '+request.failure()?.errorText));
 const config=fs.readFileSync(new URL('../src/core/config.js',import.meta.url),'utf8');
 const expectedVersion=config.match(/const VERSION='([^']+)'/)[1];
 const sdkSHA=config.match(/distCommit:'([a-f0-9]{40})'/)[1];
 const hashes=new Map([...config.matchAll(/file:'([^']+)',sha256:'([^']+)'/g)].map(m=>[m[1],m[2]]));
 page.on('response',response=>{if(response.url().includes('@'+sdkSHA+'/'))pending.push((async()=>{
  const sha=createHash('sha256').update(await response.body()).digest('hex'),file=response.url().split('/').pop();
  responses.push({file,status:response.status(),sha256:sha});
  assert.equal(response.status(),200);assert.equal(sha,hashes.get(file));
 })());});
 const boot=()=>page.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});
 const state=()=>page.evaluate(()=>{const app=window.Bloom.app,a=app.actor();return{pos:{...a.pos},slots:a.inventory.slots,edits:[...app.sim.terrain.edits],seed:app.sim.terrain.seed,tick:app.sim.tick};});
 await page.goto(url);await boot();
 await page.click('#menu-btn');await page.fill('#seed-input','190725');await page.click('#new-world');
 await page.waitForTimeout(1200);const initial=await state();assert.equal(initial.seed,190725);
 await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');
 const moved=await state();assert(moved.pos.z<initial.pos.z-1);
 await page.keyboard.press('KeyV');await page.mouse.click(683,384);await page.mouse.move(683,620);await page.waitForTimeout(1300);
 const target=await page.evaluate(()=>window.Bloom.app.sim.aim(window.Bloom.app.actor()));assert(target);
 await page.mouse.down();
 await page.waitForFunction(()=>window.Bloom.app.sim.terrain.edits.size>0,null,{timeout:5000});
 await page.mouse.up();await page.waitForTimeout(400);
 const mined=await state();assert(mined.edits.some(([key,value])=>key===target.x+','+target.y+','+target.z&&value===0));
 await page.keyboard.down('KeyW');await page.waitForTimeout(200);await page.keyboard.up('KeyW');
 await page.waitForFunction(()=>window.Bloom.app.actor().inventory.slots.some(s=>s?.id==='dirt'),null,{timeout:5000});
 const collected=await state();
 await page.keyboard.down('KeyS');await page.waitForTimeout(200);await page.keyboard.up('KeyS');await page.waitForTimeout(300);
 await page.mouse.click(683,620,{button:'right'});
 await page.waitForFunction(()=>!window.Bloom.app.actor().inventory.slots.some(s=>s?.id==='dirt'),null,{timeout:5000});
 const placed=await state();assert(placed.edits.some(([key,value])=>key===target.x+','+target.y+','+target.z&&value!==0));
 // E opens the actual inventory and exits pointer lock; synthetic Escape is browser-reserved.
 await page.keyboard.press('KeyE');await page.click('#inventory-close');await page.click('#menu-btn');
 await page.click('#save-world');await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('저장됨'));
 const saved=await state();await page.reload();await boot();
 assert.equal((await state()).edits.length,0);
 await page.click('#menu-btn');await page.click('#load-world');
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('복원했어요'));
 const restored=await state();assert.deepEqual(restored.edits,saved.edits);assert.deepEqual(restored.slots,saved.slots);assert(Math.hypot(restored.pos.x-saved.pos.x,restored.pos.z-saved.pos.z)<0.05);
 const diagnostic=await page.evaluate(()=>JSON.parse(window.BloomDiagnostics.format()));
 assert.equal(diagnostic.version,expectedVersion);assert.equal(diagnostic.snapshotVersion,expectedVersion);assert.equal(diagnostic.diagnostics.total,0);
 if(process.env.TEST_SCREENSHOT)await page.screenshot({path:process.env.TEST_SCREENSHOT});
 await page.click('#menu-btn');await page.fill('#seed-input','190725');await page.click('#new-world');
 await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.Bloom.app.actor().pos.z<-14,null,{timeout:12000});await page.keyboard.up('KeyW');await page.waitForTimeout(300);
 const entrance=await state();if(process.env.CAVE_SCREENSHOT)await page.screenshot({path:process.env.CAVE_SCREENSHOT});
 await page.keyboard.press('KeyV');await page.keyboard.down('KeyW');
 await page.waitForFunction(()=>window.Bloom.app.actor().pos.z<-52,null,{timeout:20000});await page.keyboard.up('KeyW');await page.waitForTimeout(500);
 const cave=await page.evaluate(()=>{const b=window.Bloom,a=b.app.actor(),w=b.app.sim.terrain;let ores=new Set();for(let z=-60;z<=-27;z++)for(let x=-5;x<=5;x++)for(let y=-9;y<=3;y++){const id=w.get(x,y,z);if(b.BLOCKS[id]?.id?.endsWith('Ore'))ores.add(b.BLOCKS[id].id);}return{pos:{...a.pos},hp:a.hp,water:a.swim.inWater,ores:[...ores],workerFailures:b.app.renderer.meshBuilder.stats.failed};});
 assert(cave.pos.y<0&&cave.hp>0&&!cave.water);assert(cave.ores.includes('coalOre')&&cave.ores.includes('ironOre'));assert.equal(cave.workerFailures,0);
 if(process.env.CAVE_INTERIOR_SCREENSHOT)await page.screenshot({path:process.env.CAVE_INTERIOR_SCREENSHOT});
 report.exploration={entrance,cave,input:'WASD walk from fresh spawn to underground gallery; no teleport'};
 const mobile=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 mobile.on('pageerror',error=>errors.push(error.message));await mobile.goto(url);
 await mobile.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});
 await mobile.tap('#journal-btn');
 const mobileUI=await mobile.evaluate(()=>{const el=document.querySelector('#journal .panel'),r=el.getBoundingClientRect();return{visible:!document.querySelector('#journal').hidden,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight};});
 assert(mobileUI.visible&&mobileUI.left>=0&&mobileUI.top>=0&&mobileUI.right<=mobileUI.width+1&&mobileUI.bottom<=mobileUI.height+1);
 await Promise.all(pending);assert.equal(new Set(responses.map(r=>r.file)).size,5);assert.deepEqual(errors,[]);
 Object.assign(report,{result:'PASS',elapsedMs:Date.now()-started,gameVersion:diagnostic.version,gamekitDist:sdkSHA,sdk:responses,flow:{initial,moved,target,mined,collected,placed,saved,restored},mobileJournal:mobileUI,errors,limitations:['No external NAT multiplayer','No physical mobile device','No exhaustive dungeon/combat or long-term performance test'],inputMethod:'UI keyboard/mouse/touch; read-only state observations; no mocked SDK or game-state fixture'});
 console.log(JSON.stringify({result:report.result,elapsedMs:report.elapsedMs,browser:report.browser,sdkFiles:5,errors:0}));
} catch(error){Object.assign(report,{result:'FAIL',elapsedMs:Date.now()-started,error:error.stack,errors});console.error(error);process.exitCode=1;}
finally{if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser?.close();server?.close();clearTimeout(timeout);}

