// 0.33.0: the companion species render path is the PNG cut-out unit rig (the GameKit SVG species path is retired).
// The script name is kept for the CI/npm contract; it now checks the live unit-rig routing, view mapping and depth.
import {serveStatic} from '../scripts/static-server.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {inflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

function decodePng(png){
 assert(png.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),'invalid PNG signature');
 let width=0,height=0,bitDepth=0,colorType=0,interlace=0;const chunks=[];
 for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+length);offset+=length+12;if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9];interlace=data[12];}else if(type==='IDAT')chunks.push(data);else if(type==='IEND')break;}
 assert.equal(bitDepth,8,'browser screenshot PNG must use 8-bit samples');assert.equal(interlace,0,'browser screenshot PNG must not be interlaced');
 const channels=colorType===6?4:colorType===2?3:0;assert(channels,'browser screenshot PNG must be RGB or RGBA');
 const stride=width*channels,encoded=inflateSync(Buffer.concat(chunks)),pixels=Buffer.alloc(height*stride);let source=0;
 for(let y=0;y<height;y++){
  const filter=encoded[source++],row=y*stride,prev=row-stride;
  for(let x=0;x<stride;x++){
   const raw=encoded[source++],a=x>=channels?pixels[row+x-channels]:0,b=y?pixels[prev+x]:0,c=y&&x>=channels?pixels[prev+x-channels]:0;
   let value=raw;if(filter===1)value+=a;else if(filter===2)value+=b;else if(filter===3)value+=Math.floor((a+b)/2);else if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);value+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}else assert.equal(filter,0,'unsupported PNG filter');pixels[row+x]=value&255;
  }
 }
 return{width,height,channels,pixels};
}
function roiDelta(a,b,x,y,radiusX,radiusY){
 assert.equal(a.width,b.width);assert.equal(a.height,b.height);let total=0,changed=0;
 for(let py=Math.max(0,y-radiusY);py<Math.min(a.height,y+radiusY);py++)for(let px=Math.max(0,x-radiusX);px<Math.min(a.width,x+radiusX);px++){
  const aa=(py*a.width+px)*a.channels,bb=(py*b.width+px)*b.channels;let delta=0;for(let c=0;c<3;c++)delta+=Math.abs(a.pixels[aa+c]-b.pixels[bb+c]);total+=delta;if(delta>24)changed++;
 }
 return{total,changed};
}

const root=fileURLToPath(new URL('../',import.meta.url)),dist=root,out=path.join(root,'artifacts/companion-svg');
fs.mkdirSync(out,{recursive:true});
const config=fs.readFileSync(path.join(root,'src/core/config.js'),'utf8');
// 0.33.0 retired the GameKit SVG species path: the authored SVGs, their pinned digests and the vector-asset modules are gone.
for(const file of ['src/assets/companions/pebble-mole.svg',...['sprout','fungus','bug','flower','bee'].map(k=>'src/assets/characters/'+k+'.svg'),'src/presentation/companion-art.js','previews/companion-combat/index.html'])assert(!fs.existsSync(path.join(root,file)),'retired file still present: '+file);
assert(!/vectorAssets|pebbleMole|vector-assets/.test(config),'config must not pin the retired SVG assets or vector-asset modules');
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert(!html.includes('companion-art.js')&&html.includes('src/presentation/unit-looks.js'),'the page loads the unit-rig presenter instead of the SVG companion renderer');
const evidence={browser:null,checks:[],camera:null,animation:null,depthPixels:null,screenshots:[]};
const pass=(name,data)=>{evidence.checks.push({name,data});console.log('PASS '+name);};
let server,browser,assetRequests=0;
try{
 server=http.createServer((req,res)=>{if(new URL(req.url,'http://localhost').pathname.endsWith('.svg'))assetRequests++;serveStatic(req,res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});evidence.browser=browser.version();
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:60000});
 const loaded=await page.evaluate(()=>({modules:Object.keys(Bloom.DEPENDENCIES.gamekit.modules),gamekitVector:!!Bloom.app.gamekit.vectorAssets,renderer:Object.keys(Bloom.app.renderer).filter(k=>/companion|vector/i.test(k)),rigs:Object.keys(Bloom.app.renderer.unitRig.rigs).sort()}));
 assert(!loaded.modules.some(m=>/vector/i.test(m))&&!loaded.gamekitVector&&loaded.renderer.length===0,JSON.stringify(loaded));assert.deepEqual(loaded.rigs,['mushroom-snail','rock-chick','root']);assert.equal(assetRequests,0,'no SVG is requested at boot');
 pass('boot loads no SVG and no GameKit vector-asset module; the renderer owns only the player and unit cut-out rigs',loaded);

 const playerId=await page.evaluate(()=>Bloom.app.localId);
 // The player is the PNG cut-out rig (src/assets/player); companion species are the unit rig (checked below).
 await page.waitForFunction(id=>Bloom.app.renderer.playerRig.samples.some(s=>s.key===id),playerId,{timeout:10000});
 const playerIdle=await page.evaluate(id=>{const r=Bloom.app.renderer,s=r.playerRig.samples.find(s=>s.key===id);return s&&{mode:s.mode,kind:s.kind,anim:s.anim,view:s.view,flip:s.flip,head:s.head,depthTest:s.depthTest,depthWrite:s.depthWrite,unitPlayer:r.unitRig.samples.some(v=>v.key===id)};},playerId);
 assert.equal(playerIdle.mode,'rig');assert.equal(playerIdle.kind,'player');assert.equal(playerIdle.depthTest,true);assert.equal(playerIdle.depthWrite,false);assert.equal(playerIdle.unitPlayer,false,'the player must not also be drawn through the unit rig');
 pass('the live player is drawn as the PNG cut-out rig in the existing world pass',playerIdle);
 const playerShot=path.join(out,'player-rig-live-webgl.png');await page.locator('#world').screenshot({path:playerShot});evidence.screenshots.push(path.relative(root,playerShot));
 await page.keyboard.down('KeyW');
 await page.waitForFunction(id=>Bloom.app.renderer.playerRig.samples.some(s=>s.key===id&&s.anim==='walk'),playerId,{timeout:5000});
 const moving=await page.evaluate(id=>{const s=Bloom.app.renderer.playerRig.samples.find(s=>s.key===id);return{anim:s.anim,view:s.view};},playerId);
 await page.keyboard.down('ShiftLeft');
 await page.waitForFunction(id=>Bloom.app.renderer.playerRig.samples.some(s=>s.key===id&&s.anim==='roll'&&s.progress>.1&&s.progress<.9),playerId,{timeout:5000});
 const rolling=await page.evaluate(id=>{const s=Bloom.app.renderer.playerRig.samples.find(s=>s.key===id);return{anim:s.anim,progress:s.progress,view:s.view,drawnWeapon:s.drawnWeapon};},playerId);
 await page.keyboard.up('ShiftLeft');await page.keyboard.up('KeyW');
 await page.waitForFunction(()=>Bloom.app.actor().combat.state!=='roll',null,{timeout:8000});
 assert.equal(moving.anim,'walk');assert.equal(rolling.anim,'roll');assert(rolling.progress>.1&&rolling.progress<.9);assert.equal(rolling.drawnWeapon,null,'the tucked roll hides the weapon');
 pass('real keyboard movement and context-roll input drive the player rig walk and roll from the roll state',{moving,rolling});
 // 0.35.2: the player is drawn facing its body heading (movement/strike), so the fixture sets heading with facing.
 await page.evaluate(()=>{const app=Bloom.app;app.localScheduler.stop();app.actor().facing={x:0,y:0,z:-1};app.actor().heading={x:0,z:-1};app.renderer.camera.yaw=0;app.scene.reset();});
 const variants=[];
 for(let raw=0;raw<8;raw++){
  const view=raw===0?'front':raw===4?'back':'side',flip=raw>=1&&raw<=3;
  await page.evaluate(raw=>{const app=Bloom.app,f={x:Math.sin(raw*Math.PI/4),y:0,z:Math.cos(raw*Math.PI/4)};app.renderer.camera.yaw=0;app.actor().facing=f;app.actor().heading={x:f.x,z:f.z};app.scene.reset();},raw);
  await page.waitForFunction(({id,view,flip})=>Bloom.app.renderer.playerRig.samples.some(s=>s.key===id&&s.view===view&&s.flip===flip),{id:playerId,view,flip},{timeout:4000});
  variants.push(await page.evaluate(id=>{const s=Bloom.app.renderer.playerRig.samples.find(s=>s.key===id);return{view:s.view,flip:s.flip};},playerId));
 } assert.equal(new Set(variants.map(v=>v.view+':'+v.flip)).size,4,'the live player camera mapping should cover front, back and both mirrored side drawings');
 pass('camera sampling maps all eight facings onto the rig front/back/side drawings and the side mirror',variants);
 // Wild individuals, a boss and an egg block all route through the unit rig in the world pass with depth testing.
 // 0.35.2 (D-113/D-114): no first-person camera. The fixture puts the unit on flat ground in front of the fixed
 // third-person camera (yaw step 0 looks toward -z), facing the camera, with a clear camera ray to it.
 const fixture=await page.evaluate(()=>{
  const app=Bloom.app,sim=app.sim,p=app.actor(),terrain=sim.terrain,r=app.renderer;for(const a of Object.values(sim.actors).filter(a=>a.speciesId)){sim.physics.removeBody(a);delete sim.actors[a.id];}
  const eye=r.eye,normalize=v=>{const n=Math.hypot(v.x,v.y,v.z)||1;return{x:v.x/n,y:v.y/n,z:v.z/n};};let candidate=null,details=null;
  outer:for(let forward=3;forward<=7;forward++)for(const side of [0,1,-1,2,-2]){
   const cx=Math.floor(p.pos.x)+side,cz=Math.floor(p.pos.z)-forward,h=terrain.height(cx,cz);if(h<Bloom.CFG.sea+1||h>19)continue;
   let low=h,high=h;for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const y=terrain.height(cx+dx,cz+dz);low=Math.min(low,y);high=Math.max(high,y);}if(high-low>1||!terrain.isSolid(terrain.get(cx,h,cz))||[1,2,3].some(k=>terrain.get(cx,h+k,cz)!==0))continue;
   const pos={x:cx+.5,y:h+1.1,z:cz+.5},target={x:pos.x,y:pos.y+.5,z:pos.z},delta={x:target.x-eye.x,y:target.y-eye.y,z:target.z-eye.z},distance=Math.hypot(delta.x,delta.y,delta.z),dir=normalize(delta);
   if(terrain.ray(eye,dir,Math.max(.1,distance-.15)))continue;const k=(distance-1.6)/distance,bx=Math.floor(eye.x+delta.x*k),by=Math.floor(eye.y+delta.y*k),bz=Math.floor(eye.z+delta.z*k);if(terrain.get(bx,by,bz)!==0||Math.hypot(bx+.5-p.pos.x,bz+.5-p.pos.z)<1.5)continue;
   candidate=sim.addCreature('rock-chick',pos);if(!candidate)continue;candidate.ai.cooldown=1e9;candidate.homePos={...pos};candidate.facing={x:0,y:0,z:1};details={id:candidate.id,pos:{...candidate.pos},target,eye:{...eye},block:{x:bx,y:by,z:bz},distance,dir};break outer;}
  if(!candidate)throw Error('no flat, directly visible fixture site');
  const boss=sim.addBoss('root',{x:p.pos.x-5,y:p.pos.y+.4,z:p.pos.z-6},null);boss.ai.cooldown=1e9;details.bossId=boss.id;
  const ex=Math.floor(p.pos.x)+2,ez=Math.floor(p.pos.z)-2,ey=terrain.height(ex,ez)+1;terrain.set(ex,ey,ez,Bloom.BID.mushroomSnailEgg);sim.eggs[ex+','+ey+','+ez]={key:ex+','+ey+','+ez,x:ex,y:ey,z:ez,species:'mushroom-snail',owner:p.id,placedTick:sim.tick,hatchTick:sim.tick+1e6};details.egg=ex+','+ey+','+ez;
  app.localScheduler.stop();app.scene.reset();return details;});
 await page.waitForFunction(({id,bossId})=>{const s=Bloom.app.renderer.unitRig.samples;return s.some(v=>v.key===id&&v.role==='wild')&&s.some(v=>v.key===bossId&&v.role==='boss');},fixture,{timeout:15000});
 await page.waitForFunction(key=>Bloom.app.renderer.unitRig.samples.some(v=>v.key==='egg/'+key&&v.egg),fixture.egg,{timeout:15000});
 const routed=await page.evaluate(({id,bossId,egg})=>{const r=Bloom.app.renderer,s=r.unitRig.samples,pick=k=>{const v=s.find(v=>v.key===k);return v&&{mode:v.mode,role:v.role,species:v.species,stage:v.stage,anim:v.anim,view:v.view,depthTest:v.depthTest,depthWrite:v.depthWrite,parts:v.parts};};return{wild:pick(id),boss:pick(bossId),egg:pick('egg/'+egg),player:r.playerRig.samples.filter(v=>v.key===Bloom.app.localId).length};},fixture);
 assert.equal(routed.wild.species,'rock-chick');assert.equal(routed.wild.stage,'adult');assert.equal(routed.wild.depthTest,true);assert.equal(routed.wild.depthWrite,false);assert.equal(routed.wild.view,'front');
 assert.equal(routed.boss.species,'root');assert.equal(routed.boss.stage,'boss');assert.equal(routed.egg.species,'mushroom-snail');assert.equal(routed.egg.anim,'egg');
 pass('a wild rock chick, a root boss (stage boss, ×3 with hat) and a placed egg block are drawn by the cut-out unit rig in the 3D depth-tested pass',routed);
 // Four Q steps turn the camera 180° around the player.
 await page.evaluate(()=>{for(let i=0;i<4;i++)Bloom.app.renderer.rotateCamera(1);});
 await page.waitForFunction(id=>Bloom.app.renderer.unitRig.samples.some(s=>s.key===id&&s.view==='back'),fixture.id,{timeout:5000});
 await page.evaluate(()=>{for(let i=0;i<4;i++)Bloom.app.renderer.rotateCamera(-1);});await page.waitForFunction(()=>!Bloom.app.renderer.camera.turn&&Bloom.app.renderer.camera.yawStep===0,null,{timeout:3000});
 await page.waitForFunction(id=>Bloom.app.renderer.unitRig.samples.some(s=>s.key===id&&s.view==='front'),fixture.id,{timeout:5000});
 evidence.camera={front:'front',back:'back'};pass('camera reversal switches the rig between its front and back drawings, then returns to the front',evidence.camera);
 const animation=await page.evaluate(id=>{const sim=Bloom.app.sim,a=sim.actors[id];a.combat.state='attack';a.combat.elapsed=0;a.combat.action={name:'enemy',kind:'swing',weapon:'rock-chick',wind:700,active:125,recovery:1000,reach:1.8,arc:1.7,damage:0,dir:{...a.facing},hits:[],fired:false,sequence:999};const look=Bloom.speciesActorLook({...a,velocity:{x:0,y:0,z:0}},null,false).look;a.combat.state='idle';a.combat.action=null;return look;},fixture.id);
 assert.equal(animation.anim,'headbutt');evidence.animation=animation;pass('a wild attack plays the species signature anim (rock chick headbutt)',animation);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const worldShot=path.join(out,'unit-rig-live-webgl.png'),worldPng=await page.locator('#world').screenshot({path:worldShot});evidence.screenshots.push(path.relative(root,worldShot));
 const ray=await page.evaluate(({id,block})=>{const app=Bloom.app,terrain=app.sim.terrain,c=app.sim.actors[id],target={x:c.pos.x,y:c.pos.y+.5,z:c.pos.z},eye=app.renderer.eye,d={x:target.x-eye.x,y:target.y-eye.y,z:target.z-eye.z},length=Math.hypot(d.x,d.y,d.z),dir={x:d.x/length,y:d.y/length,z:d.z/length};
  if(terrain.set(block.x,block.y,block.z,Bloom.BID.diamondOre)===false)throw Error('Depth fixture voxel could not be placed');return{block,ray:terrain.ray(eye,dir,length+1)};},{id:fixture.id,block:fixture.block});
 assert.deepEqual({x:ray.ray?.x,y:ray.ray?.y,z:ray.ray?.z},fixture.block,'the block must be directly on the live camera ray in front of the unit');
 await page.waitForFunction(({x,y,z})=>Bloom.app.renderer.readyChunks.has(Math.floor(x/16)+':'+Math.floor(y/16)+':'+Math.floor(z/16)),fixture.block,{timeout:5000});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const occlusionShot=path.join(out,'unit-rig-world-depth-occlusion.png'),occludedPng=await page.locator('#world').screenshot({path:occlusionShot});evidence.screenshots.push(path.relative(root,occlusionShot));
 const depthOff=await page.evaluate(()=>{const pool=Bloom.app.renderer.pools.get('unit-rig');for(const item of pool.items)item.object.material.depthTest=false;return pool.items.length;});assert(depthOff>0);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const noDepthShot=path.join(out,'unit-rig-depth-disabled.png'),noDepthPng=await page.locator('#world').screenshot({path:noDepthShot});evidence.screenshots.push(path.relative(root,noDepthShot));
 const unitScreen=await page.evaluate(t=>Bloom.app.renderer.projected(t),fixture.target),beforeImage=decodePng(worldPng),occludedImage=decodePng(occludedPng),depthDisabledImage=decodePng(noDepthPng),center={x:Math.round(unitScreen.x),y:Math.round(unitScreen.y)-20};
 const hidden=roiDelta(beforeImage,occludedImage,center.x,center.y+20,42,42),revealed=roiDelta(occludedImage,depthDisabledImage,center.x,center.y+20,42,42);
 assert(hidden.changed>40&&hidden.total>3000,'the foreground voxel should hide part of the unit: '+JSON.stringify({hidden,center}));
 assert(revealed.changed>40&&revealed.total>3000,'disabling depth in the same live draw should reveal the unit over the voxel: '+JSON.stringify({revealed,center}));
 evidence.depthPixels={center,depthTestEnabledScreenshotDelta:hidden,depthTestDisabledScreenshotDelta:revealed,block:ray.block};
 pass('the WebGL world depth buffer occludes the unit rig quad; the same quad shows over the block when depth testing is disabled',evidence.depthPixels);

 assert.deepEqual(errors,[],'page errors: '+errors.join('; '));await page.waitForLoadState('networkidle');await page.close();
 const mobileContext=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true}),mobile=await mobileContext.newPage(),mobileErrors=[];mobile.on('pageerror',error=>mobileErrors.push(error.message));await mobile.goto('http://127.0.0.1:'+server.address().port+'/');
 await mobile.waitForFunction(()=>window.Bloom?.app?.started&&window.Bloom.app.renderer.playerRig.samples.some(s=>s.key===Bloom.app.localId),null,{timeout:60000});const mobileId=await mobile.evaluate(()=>Bloom.app.localId),mobileInitial=await mobile.evaluate(id=>{const r=Bloom.app.renderer,s=r.playerRig.samples.find(v=>v.key===id);return{mode:s?.mode,kind:s?.kind,anim:s?.anim,depthTest:s?.depthTest,canvas:[r.canvas.clientWidth,r.canvas.clientHeight]};},mobileId);assert.equal(mobileInitial.mode,'rig');assert.equal(mobileInitial.kind,'player');assert.equal(mobileInitial.depthTest,true);assert(mobileInitial.canvas[0]>mobileInitial.canvas[1]);
 await mobile.evaluate(()=>Bloom.app.localScheduler.stop());const mobileDirections=[];for(let raw=0;raw<8;raw++){const view=raw===0?'front':raw===4?'back':'side',flip=raw>=1&&raw<=3;await mobile.evaluate(raw=>{const app=Bloom.app,f={x:Math.sin(raw*Math.PI/4),y:0,z:Math.cos(raw*Math.PI/4)};app.renderer.camera.yaw=0;app.actor().facing=f;app.actor().heading={x:f.x,z:f.z};app.scene.reset();},raw);await mobile.waitForFunction(({id,view,flip})=>Bloom.app.renderer.playerRig.samples.some(s=>s.key===id&&s.view===view&&s.flip===flip),{id:mobileId,view,flip},{timeout:5000});mobileDirections.push([view,flip]);}assert.equal(new Set(mobileDirections.map(([view,flip])=>view+':'+flip)).size,4);await mobile.evaluate(()=>Bloom.app.localScheduler.start());
 const joystick=await mobile.locator('#joystick').boundingBox();assert(joystick&&joystick.width>0&&joystick.height>0,'landscape mobile joystick must be visible');await mobile.mouse.move(joystick.x+joystick.width/2,joystick.y+joystick.height/2);await mobile.mouse.down();await mobile.mouse.move(joystick.x+joystick.width/2,joystick.y+joystick.height/2-40,{steps:3});await mobile.waitForFunction(id=>Bloom.app.renderer.playerRig.samples.some(s=>s.key===id&&s.anim==='walk'),mobileId,{timeout:8000});await mobile.mouse.up();await mobile.locator('#mobile-roll').tap();await mobile.waitForFunction(id=>Bloom.app.renderer.playerRig.samples.some(s=>s.key===id&&s.anim==='roll'),mobileId,{timeout:8000});
 const mobileShot=path.join(out,'player-rig-landscape-mobile-webgl.png');await mobile.locator('#world').screenshot({path:mobileShot});evidence.screenshots.push(path.relative(root,mobileShot));evidence.mobile={initial:mobileInitial,directions:mobileDirections,walkAndRoll:true};pass('landscape touch view draws the rig player with the live 3D camera, all eight facings, joystick movement, and touch roll',evidence.mobile);assert.deepEqual(mobileErrors,[],'mobile page errors: '+mobileErrors.join('; '));await mobileContext.close();
 assert.deepEqual(errors,[],'page errors: '+errors.join('; '));
 evidence.result='PASS';evidence.elapsedMs=Date.now();
 fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({result:evidence.result,browser:evidence.browser,checks:evidence.checks.length,screenshots:evidence.screenshots}));
}catch(error){evidence.result='FAIL';evidence.error=error.stack||String(error);fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(evidence,null,2)+'\n');console.error(error);process.exitCode=1;}
finally{await browser?.close();await new Promise(resolve=>server?.close(resolve));}

