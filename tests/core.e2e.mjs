import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const started=Date.now(),errors=[],responses=[],pending=[],report={};
const timeout=setTimeout(()=>{console.error('E2E exceeded 180 seconds');process.exit(1);},180000);
let browser,server,page;
const output=process.env.TEST_REPORT;
const deploymentScope=process.env.E2E_SCOPE==='deployment';report.scope=deploymentScope?'no-build-deployment-user-flow':'full-core';
try {
 let url=process.env.TEST_URL;
 if(!url){server=http.createServer(serveStatic);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port+'/bloom-digmori/';}
 browser=await chromium.launch({...(process.env.BROWSER_CHANNEL||process.platform==='win32'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{}),headless:true});
 report.browser=browser.version();report.url=url;report.browserChannel=process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':'playwright-headless-shell');
 page=await browser.newPage({viewport:{width:1366,height:768},hasTouch:true});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('requestfailed',request=>errors.push(request.url()+': '+request.failure()?.errorText));
 const config=fs.readFileSync(new URL('../src/core/config.js',import.meta.url),'utf8');
 const expectedVersion=config.match(/const VERSION='([^']+)'/)[1];
 const expectedSnapshotVersion=config.match(/SNAPSHOT_VERSION='([^']+)'/)[1];
 const sdkSHA=config.match(/distCommit:'([a-f0-9]{40})'/)[1];
 const manifestResponse=await fetch('https://cdn.jsdelivr.net/gh/byh-playground/bloom-gamekit@'+sdkSHA+'/manifest.json');assert.equal(manifestResponse.status,200);
 const manifestBytes=Buffer.from(await manifestResponse.arrayBuffer()),manifest=JSON.parse(manifestBytes);
 const manifestHash=createHash('sha256').update(manifestBytes).digest('hex');assert.equal(manifestHash,config.match(/manifestSha256:'([^']+)'/)[1]);report.manifestSha256=manifestHash;
 const hashes=new Map([...config.matchAll(/file:'([^']+)',sha256:'([^']+)'/g)].map(m=>[m[1],m[2]]));
 for(const [file,hash]of hashes)assert.equal(manifest.modules.find(m=>m.file===file)?.sha256,hash);
 page.on('response',response=>{if(response.url().includes('@'+sdkSHA+'/'))pending.push((async()=>{
  const sha=createHash('sha256').update(await response.body()).digest('hex'),file=response.url().split('/').pop();
  responses.push({file,status:response.status(),sha256:sha});
  assert.equal(response.status(),200);assert.equal(sha,hashes.get(file));
 })());});
 const boot=()=>page.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});
 const state=()=>page.evaluate(()=>{const app=window.Bloom.app,a=app.actor();return{pos:{...a.pos},slots:a.inventory.slots,edits:[...app.sim.terrain.edits],seed:app.sim.terrain.seed,tick:app.sim.tick};});
 await page.goto(url);await boot();report.renderer=await page.evaluate(()=>{const gl=window.Bloom.app.renderer.gl,ext=gl.getExtension('WEBGL_debug_renderer_info');return{vendor:gl.getParameter(ext?ext.UNMASKED_VENDOR_WEBGL:gl.VENDOR),renderer:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)};});
 if(process.env.TEST_SCREENSHOT)await page.screenshot({path:process.env.TEST_SCREENSHOT});
 await page.evaluate(()=>{const r=window.Bloom.app.renderer,render=r.render.bind(r);window.sceneCheck={detached:true,interpolated:false,frames:0};r.render=(sim,actor,dt,frame)=>{render(sim,actor,dt,frame);window.sceneCheck.frames++;frame.forEach(m=>{if(m.displayKind!=='actor')return;const raw=sim.actors[m.id];window.sceneCheck.detached&&=m!==raw&&!('body'in m)&&!('previous'in m);if(raw&&Math.hypot(m.pos.x-raw.pos.x,m.pos.z-raw.pos.z)>.001)window.sceneCheck.interpolated=true;});};});
 report.timing=await page.evaluate(()=>({tickRate:window.Bloom.CFG.tickRate,sessionRate:window.Bloom.app.localSession.profile.tickRate,physicsStep:window.Bloom.app.sim.physics.world.timestep}));
 assert.equal(report.timing.tickRate,30);assert.equal(report.timing.sessionRate,30);assert(Math.abs(report.timing.physicsStep-1/30)<1e-6);
 await page.click('#menu-btn');await page.fill('#seed-input','190725');await page.click('#new-world');
 await page.waitForTimeout(1200);const initial=await state();assert.equal(initial.seed,190725);
 await page.locator('#world').focus();await page.keyboard.down('KeyW');await page.waitForFunction(z=>window.Bloom.app.actor().pos.z<z-1,initial.pos.z,{timeout:5000});await page.keyboard.up('KeyW');
 const moved=await state();assert(moved.pos.z<initial.pos.z-1);
 await page.keyboard.press('KeyV');await page.mouse.move(683,384);
 // Exercise the supported touch-drag camera input without pointer-lock cursor warps.
 // CDP delivers browser touch events; no camera or game state is assigned.
 const touch=await page.context().newCDPSession(page);
 const beforeLook=await page.evaluate(()=>({yaw:window.Bloom.app.renderer.camera.yaw,pitch:window.Bloom.app.renderer.camera.pitch}));
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:683,y:384,id:1}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:683+beforeLook.yaw/.005,y:384+(.86-beforeLook.pitch)/.005,id:1}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>Math.abs(window.Bloom.app.actor().pitch-.86)<.02,null,{timeout:5000});
 report.cameraInput={method:'browser touch drag',before:beforeLook,after:await page.evaluate(()=>({yaw:window.Bloom.app.renderer.camera.yaw,pitch:window.Bloom.app.renderer.camera.pitch}))};
 const target=await page.evaluate(()=>window.Bloom.app.sim.aim(window.Bloom.app.actor()));assert(target);report.beforeMining={initial,moved,target};
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:683,y:384,id:1}]});
 await page.waitForFunction(()=>window.Bloom.app.sim.terrain.edits.size>0,null,{timeout:10000});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(400);
 const mined=await state();assert(mined.edits.some(([key,value])=>key===target.x+','+target.y+','+target.z&&value===0));
 await page.locator('#world').focus();await page.keyboard.down('KeyW');
 await page.waitForFunction(()=>window.Bloom.app.actor().inventory.slots.some(s=>s?.id==='dirt'),null,{timeout:10000});await page.keyboard.up('KeyW');
 const collected=await state();
 await page.keyboard.down('KeyS');await page.waitForFunction(z=>window.Bloom.app.actor().pos.z>z+.5,collected.pos.z,{timeout:10000});await page.keyboard.up('KeyS');await page.waitForTimeout(300);
 const placeAim=await page.evaluate(()=>window.Bloom.app.sim.aim(window.Bloom.app.actor()));assert(placeAim);
 const placedKey=[placeAim.x+placeAim.normal.x,placeAim.y+placeAim.normal.y,placeAim.z+placeAim.normal.z].join(',');
 await page.touchscreen.tap(683,384);
 await page.waitForFunction(()=>!window.Bloom.app.actor().inventory.slots.some(s=>s?.id==='dirt'),null,{timeout:5000});
 const placed=await state();report.placement={aim:placeAim,expected:placedKey,edits:placed.edits};assert(placed.edits.some(([key,value])=>key===placedKey&&value!==0));
 // E opens the actual inventory and exits pointer lock; synthetic Escape is browser-reserved.
 await page.keyboard.press('KeyE');await page.click('#inventory-close');await page.click('#menu-btn');
 await page.click('#save-world');await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('저장됨'));
 const saved=await state();report.flow={initial,moved,target,mined,collected,placed,saved};report.presentation=await page.evaluate(()=>window.sceneCheck);if(!deploymentScope)assert(report.presentation.detached&&report.presentation.interpolated&&report.presentation.frames>0);else report.presentationObservation={...report.presentation,status:report.presentation.interpolated?'observed':'intermediate frame not observed; strict interpolation check not included in deployment scope'};await page.reload();await boot();
 assert.equal((await state()).edits.length,0);
 await page.click('#menu-btn');await page.click('#load-world');
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('복원했어요'));
 const restored=await state();assert.deepEqual(restored.edits,saved.edits);assert.deepEqual(restored.slots,saved.slots);assert(Math.hypot(restored.pos.x-saved.pos.x,restored.pos.z-saved.pos.z)<0.05);
 const diagnostic=await page.evaluate(()=>JSON.parse(window.BloomDiagnostics.format()));
 assert.equal(diagnostic.gamekitDist,sdkSHA);assert.equal(diagnostic.version,expectedVersion);assert.equal(diagnostic.snapshotVersion,expectedSnapshotVersion);assert.equal(diagnostic.diagnostics.total,0);
 if(process.env.TEST_SCREENSHOT)await page.screenshot({path:process.env.TEST_SCREENSHOT});
 if(!deploymentScope){
 await page.click('#menu-btn');await page.fill('#seed-input','190725');await page.click('#new-world');
 await page.locator('#world').focus();await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.Bloom.app.actor().pos.z<-14,null,{timeout:12000});await page.keyboard.up('KeyW');await page.waitForTimeout(300);
 const entrance=await state();if(process.env.CAVE_SCREENSHOT)await page.screenshot({path:process.env.CAVE_SCREENSHOT});
 await page.keyboard.press('KeyV');await page.keyboard.down('KeyW');
 await page.waitForFunction(()=>window.Bloom.app.actor().pos.z<-52,null,{timeout:20000});await page.keyboard.up('KeyW');await page.waitForTimeout(500);
 const cave=await page.evaluate(()=>{const b=window.Bloom,a=b.app.actor(),w=b.app.sim.terrain;let ores=new Set();for(let z=-60;z<=-27;z++)for(let x=-5;x<=5;x++)for(let y=-9;y<=3;y++){const id=w.get(x,y,z);if(b.BLOCKS[id]?.id?.endsWith('Ore'))ores.add(b.BLOCKS[id].id);}return{pos:{...a.pos},hp:a.hp,water:a.swim.inWater,ores:[...ores],workerFailures:b.app.renderer.meshBuilder.stats.failed};});
 assert(cave.pos.y<0&&cave.hp>0&&!cave.water);assert(cave.ores.includes('coalOre')&&cave.ores.includes('ironOre'));assert.equal(cave.workerFailures,0);
 if(process.env.CAVE_INTERIOR_SCREENSHOT)await page.screenshot({path:process.env.CAVE_INTERIOR_SCREENSHOT});
 report.exploration={entrance,cave,input:'WASD walk from fresh spawn to underground gallery; no teleport'};
 }else report.exploration={status:'not run in deployment scope; unchanged full-core scenario retained'};
 const mobile=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 mobile.on('pageerror',error=>errors.push(error.message));await mobile.goto(url);
 await mobile.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});
 await mobile.tap('#journal-btn');
 const mobileUI=await mobile.evaluate(()=>{const el=document.querySelector('#journal .panel'),r=el.getBoundingClientRect();return{visible:!document.querySelector('#journal').hidden,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight};});
 assert(mobileUI.visible&&mobileUI.left>=0&&mobileUI.top>=0&&mobileUI.right<=mobileUI.width+1&&mobileUI.bottom<=mobileUI.height+1);
 const preview=await browser.newPage({viewport:{width:1280,height:800}});
 preview.on('pageerror',error=>errors.push(error.message));
 await preview.goto(new URL('previews/companion-combat/',url).href);
 await preview.waitForFunction(()=>window.symbioticPreview?.frames>1,null,{timeout:30000});
 await preview.click('#b');
 await preview.waitForFunction(()=>window.symbioticPreview?.combatMode==='sword');
 await preview.click('#a');
 await preview.waitForFunction(()=>window.symbioticPreview?.combatMode==='ball');
 report.preview=await preview.evaluate(()=>({frames:window.symbioticPreview.frames,glError:window.symbioticPreview.glError,mode:window.symbioticPreview.combatMode,error:document.getElementById('error').textContent}));
 assert.equal(report.preview.glError,0);assert.equal(report.preview.error,'');
 if(process.env.TEST_PREVIEW_SCREENSHOT)await preview.screenshot({path:process.env.TEST_PREVIEW_SCREENSHOT});
 await Promise.all(pending);assert.equal(new Set(responses.map(r=>r.file)).size,9);assert.deepEqual(errors,[]);
 Object.assign(report,{result:'PASS',elapsedMs:Date.now()-started,gameVersion:diagnostic.version,gamekitDist:sdkSHA,sdk:responses,flow:{initial,moved,target,mined,collected,placed,saved,restored},mobileJournal:mobileUI,errors,limitations:[...(deploymentScope?['Strict intermediate interpolation observation and cave traversal excluded from deployment scope; full-core checks retained']:[]),'No external NAT multiplayer','No physical mobile device','No exhaustive dungeon/combat or long-term performance test'],inputMethod:'UI keyboard/buttons and browser touch-drag, long-press mining, tap placement; read-only state observations; no mocked SDK or game-state fixture'});
 console.log(JSON.stringify({result:report.result,elapsedMs:report.elapsedMs,browser:report.browser,sdkFiles:9,errors:0}));
} catch(error){if(page&&process.env.TEST_SCREENSHOT)await page.screenshot({path:process.env.TEST_SCREENSHOT.replace(/\.png$/,'.failure.png')}).catch(()=>{});if(page)report.failureState=await page.evaluate(()=>{const b=window.Bloom,a=b?.app;return{diagnostics:window.BloomDiagnostics?.format(),pos:a?.actor()?.pos,aim:a?.sim.aim(a.actor()),buttons:a?.controls.buttons,tick:a?.sim.tick,inputPrevious:a?.actor()?.inputPrevious,combat:a?.actor()?.combat,mine:a?.actor()?.mine,enemy:a?.sim.physics.aimEnemy(a.actor(),b.Combat.weapon(a.actor(),a.sim).reach),camera:a?.renderer.camera,pointerLock:document.pointerLockElement?.id,active:document.activeElement?.id,modal:a?.modal()};}).catch(()=>null);console.error(JSON.stringify(report.failureState));Object.assign(report,{result:'FAIL',elapsedMs:Date.now()-started,error:error.stack,errors});console.error(error);process.exitCode=1;}
finally{if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser?.close();server?.close();clearTimeout(timeout);}


