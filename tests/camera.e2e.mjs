import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CURSOR_HELPERS} from './cursor-helpers.mjs';

// 0.35.2 fixed third-person camera and cursor controls (D-113…D-115), driven by real browser input on seed 190725:
// Q/E 45° steps and wheel zoom limits, no first-person code or keys, a left click on a block 4 m away walks there and
// mines it, a right click places on the cursor face, the cave cutaway (hidden above the first ceiling layer, the
// translucent first layer is clickable, hysteresis), and pillar-up from a cave floor to the surface using only digging
// the ceiling, jumping and under-feet placement. Fixtures (direct state writes): the debug kit button (iron pick, logs),
// and teleporting the player into the two seed-190725 caves. SHOTS=<dir> saves the review screenshots.
const began=Date.now(),errors=[],report={checks:[]},SHOTS=process.env.SHOTS||null;
const timeout=setTimeout(()=>{console.error('camera E2E exceeded 180 seconds');process.exit(1);},180000);
const pass=(name,evidence)=>{const s=Math.round((Date.now()-began)/1000);report.checks.push({name,evidence,s});console.log('PASS '+s+'s '+name);};
const TUNNEL={x:-2.5,y:-15,z:-51.5},SHAFT={x:-.5,y:-1,z:-35.5};
let browser,server;
const boot=p=>p.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});
const settle=p=>p.waitForFunction(()=>{const r=Bloom.app.renderer;return r.streamComplete&&r.readyChunks.size===r.visibleChunks.size;},null,{timeout:30000});
const shot=async(p,name)=>{if(!SHOTS)return;fs.mkdirSync(SHOTS,{recursive:true});await settle(p).catch(()=>{});await p.waitForTimeout(150);await p.screenshot({path:SHOTS+'/'+name+'.png'});};
const camera=p=>p.evaluate(()=>{const c=Bloom.app.renderer.camera;return{yawStep:c.yawStep,yaw:c.yaw,pitch:c.pitch,distance:c.distance};});
const actorState=p=>p.evaluate(()=>{const a=Bloom.app.actor();return{pos:{...a.pos},task:a.task&&{...a.task},mine:{...a.mine},grounded:a.grounded,selected:a.inventory.selected};});
const blockId=(p,b)=>p.evaluate(b=>Bloom.app.sim.terrain.get(b.x,b.y,b.z),b);
const teleport=(p,pos)=>p.evaluate(pos=>{const a=Bloom.app.actor();Bloom.app.sim.physics.teleport(a,pos);},pos);
async function faceScreen(p,b,n){for(let i=0;i<20;i++){const s=await p.evaluate(({b,n})=>window.__faceScreen(b,n),{b,n});if(s)return s;await p.waitForTimeout(100);}throw Error('face not on screen: '+JSON.stringify({b,n}));}
const hotbar=async(p,index)=>{await p.keyboard.press('Digit'+(index+1));await p.waitForFunction(i=>Bloom.app.actor().inventory.selected===i,index,{timeout:3000});};
try{
 server=http.createServer(serveStatic);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/bloom-digmori/';
 browser=await chromium.launch({...(process.env.BROWSER_CHANNEL||process.platform==='win32'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{}),headless:true});report.browser=browser.version();
 const page=await browser.newPage({viewport:{width:1366,height:768}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(CURSOR_HELPERS);
 await page.goto(url+'?debug=1');await boot(page);await settle(page);
 assert.equal(await page.evaluate(()=>Bloom.app.sim.terrain.seed),190725);
 await shot(page,'desktop-surface');

 // 1. No first person (D-113): the source has no pointer lock, mouse look, view toggle or view-model arms; V does nothing.
 const sources=['src/input/controls.js','src/presentation/renderer.js','src/runtime/app.js','index.html'].map(f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
 const banned=['requestPointerLock','pointerLockElement','exitPointerLock','renderViewArms','camera.first','toggleView','view-btn',"'KeyV'",'movementX','1인칭'].filter(t=>sources.includes(t));
 assert.deepEqual(banned,[],'first-person / mouse-look code left: '+banned);
 const beforeV=await camera(page);await page.locator('#world').focus();await page.keyboard.press('KeyV');await page.mouse.move(300,200);await page.mouse.move(900,600);await page.waitForTimeout(300);
 const afterV=await camera(page),runtime=await page.evaluate(()=>({viewButton:!!document.querySelector('#view-btn'),crosshair:!!document.querySelector('#crosshair'),first:'first' in Bloom.app.renderer.camera,arms:typeof Bloom.app.renderer.renderViewArms,cursorStyle:getComputedStyle(document.querySelector('#world')).cursor}));
 assert.deepEqual(afterV,beforeV,'V or mouse movement changed the camera');assert.deepEqual(runtime,{viewButton:false,crosshair:false,first:false,arms:'undefined',cursorStyle:'crosshair'});
 pass('no first-person view, view toggle, pointer lock or mouse look is left; V and mouse movement leave the camera alone',{banned,runtime,camera:afterV});

 // 2. Q/E turn the camera in 45° steps (yaw step 0..7, animated about 0.25 s); the pitch never changes.
 const turns=[];await page.keyboard.press('KeyQ');await page.waitForTimeout(90);const mid=await camera(page);await page.waitForTimeout(300);turns.push(await camera(page));
 assert.equal(mid.yawStep,1);assert(mid.yaw>.02&&mid.yaw<Math.PI/4-.02,'the step is animated: '+JSON.stringify(mid));assert(Math.abs(turns[0].yaw-Math.PI/4)<1e-6);
 await page.keyboard.press('KeyQ');await page.waitForTimeout(350);await shot(page,'surface-yaw2');
 await page.keyboard.press('KeyQ');await page.keyboard.press('KeyQ');await page.waitForTimeout(350);turns.push(await camera(page));await shot(page,'surface-yaw4');
 await page.keyboard.press('KeyQ');await page.keyboard.press('KeyQ');await page.waitForTimeout(350);await shot(page,'surface-yaw6');
 await page.keyboard.press('KeyQ');await page.keyboard.press('KeyQ');await page.waitForTimeout(350);turns.push(await camera(page));
 await page.keyboard.press('KeyE');await page.waitForTimeout(350);turns.push(await camera(page));await page.keyboard.press('KeyE');await page.waitForTimeout(350);turns.push(await camera(page));
 assert.deepEqual(turns.map(t=>t.yawStep),[1,4,0,7,6]);for(const t of turns){assert(Math.abs(t.yaw-t.yawStep*Math.PI/4)<1e-6,JSON.stringify(t));assert(Math.abs(t.pitch-50*Math.PI/180)<1e-9);}
 for(let i=0;i<2;i++)await page.keyboard.press('KeyQ');await page.waitForTimeout(350);assert.equal((await camera(page)).yawStep,0);
 // W walks screen-up: with the camera turned to step 2 (90°), W moves the player along -x.
 await page.keyboard.press('KeyQ');await page.keyboard.press('KeyQ');await page.waitForTimeout(350);const w0=await actorState(page);await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');const w1=await actorState(page);
 assert(w1.pos.x<w0.pos.x-.8&&Math.abs(w1.pos.z-w0.pos.z)<.4,'W follows the camera: '+JSON.stringify({w0:w0.pos,w1:w1.pos}));
 await page.keyboard.press('KeyE');await page.keyboard.press('KeyE');await page.waitForTimeout(350);
 pass('Q/E step the yaw through 0..7 by 45° with a smooth turn and a fixed 50° pitch, and W moves toward screen-up',{mid,turns,walk:{from:w0.pos,to:w1.pos}});

 // 3. Wheel zoom stops at the limits.
 for(let i=0;i<14;i++){await page.mouse.wheel(0,120);await page.waitForTimeout(15);}const far=await camera(page);await page.waitForTimeout(500);await shot(page,'zoom-max');
 for(let i=0;i<20;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(15);}const near=await camera(page);await page.waitForTimeout(500);await shot(page,'zoom-min');
 const limits=await page.evaluate(()=>({min:Bloom.CFG.camera.minDistance,max:Bloom.CFG.camera.maxDistance}));assert.equal(far.distance,limits.max);assert.equal(near.distance,limits.min);
 for(let i=0;i<7;i++){await page.mouse.wheel(0,120);await page.waitForTimeout(15);}const back=await camera(page);assert(back.distance>12&&back.distance<14);await page.waitForTimeout(500);
 pass('the wheel zooms between the minimum and maximum distance and stops there',{far:far.distance,near:near.distance,limits,back:back.distance});

 // 4. A left click on a block about 4 m away: the player walks there (a sim task, no keyboard) and mines it with bare
 // hands (grass, 0.65 s).
 const goal=await page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain;for(const [dx,dz]of [[0,-4],[1,-4],[-1,-4],[4,0],[-4,0],[0,4]]){const x=Math.floor(a.pos.x)+dx,z=Math.floor(a.pos.z)+dz,y=t.height(x,z);if(t.get(x,y,z)&&!t.get(x,y+1,z)&&!t.get(x,y+2,z)&&Math.abs(y+1-a.pos.y)<.6&&window.__faceScreen({x,y,z},{x:0,y:1,z:0}))return{x,y,z,id:t.get(x,y,z),distance:Math.hypot(x+.5-a.pos.x,z+.5-a.pos.z)};}return null;});
 assert(goal,'no ground block 4 m away');const goalScreen=await faceScreen(page,goal,{x:0,y:1,z:0});await page.mouse.move(goalScreen.x,goalScreen.y);await page.waitForTimeout(250);
 const hover=await page.evaluate(()=>({cursor:Bloom.app.renderer.cursor?.block,target:Bloom.app.renderer.target}));assert.deepEqual([hover.cursor.x,hover.cursor.y,hover.cursor.z],[goal.x,goal.y,goal.z]);await shot(page,'cursor-highlight');
 // A page-side sampler records every frame whether the task walked (not yet mining) and then mined.
 await page.evaluate(()=>{const seen=window.__taskSeen={walk:0,mine:0};const loop=()=>{const a=Bloom.app.actor(),t=a.task;if(t&&!t.mining)seen.walk++;if(t?.mining&&a.mine.elapsed>0)seen.mine++;if(!seen.done)requestAnimationFrame(loop);};requestAnimationFrame(loop);});
 const start=await actorState(page);await page.mouse.down();await page.mouse.up();
 await page.waitForFunction(g=>{const t=Bloom.app.actor().task;return t&&t.x===g.x&&t.y===g.y&&t.z===g.z;},goal,{timeout:3000});
 await page.waitForFunction(s=>{const a=Bloom.app.actor();return Math.hypot(a.pos.x-s.x,a.pos.z-s.z)>.6;},start.pos,{timeout:4000});const walking=await actorState(page);await shot(page,'walk-to-block');
 await page.waitForFunction(g=>{const a=Bloom.app.actor();return a.task?.mining&&a.mine.elapsed>0||Bloom.app.sim.terrain.get(g.x,g.y,g.z)===0;},goal,{timeout:6000});const mining=await actorState(page);if(mining.task)await shot(page,'mining');
 await page.waitForFunction(g=>Bloom.app.sim.terrain.get(g.x,g.y,g.z)===0,goal,{timeout:8000});await page.waitForFunction(()=>!Bloom.app.actor().task,null,{timeout:2000});const done=await actorState(page);
 const walked=Math.hypot(done.pos.x-start.pos.x,done.pos.z-start.pos.z),pointerLock=await page.evaluate(()=>document.pointerLockElement);
 const seen=await page.evaluate(()=>{window.__taskSeen.done=true;return window.__taskSeen;});
 assert(walked>1,'the player should walk toward the block: '+walked);assert(seen.walk>0&&seen.mine>0,'walk then mine: '+JSON.stringify(seen));assert.equal(pointerLock,null);
 pass('a left click on a block 4 m away starts a sim task: the player walks there, mines it barehanded until it breaks, then stops (no pointer lock)',{goal,start:start.pos,walking:walking.pos,end:done.pos,walked,framesWalking:seen.walk,framesMining:seen.mine});
 // Movement input cancels a task.
 const second=await page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain;for(const [dx,dz]of [[3,-3],[-3,-3],[3,3],[-3,3],[0,4]]){const x=Math.floor(a.pos.x)+dx,z=Math.floor(a.pos.z)+dz,y=t.height(x,z);if(t.get(x,y,z)&&!t.get(x,y+1,z)&&window.__faceScreen({x,y,z},{x:0,y:1,z:0}))return{x,y,z};}return null;});
 if(second){const s=await faceScreen(page,second,{x:0,y:1,z:0});await page.mouse.click(s.x,s.y);await page.waitForFunction(()=>!!Bloom.app.actor().task,null,{timeout:3000});await page.keyboard.down('KeyS');await page.waitForFunction(()=>!Bloom.app.actor().task,null,{timeout:3000});await page.keyboard.up('KeyS');
  assert.notEqual(await blockId(page,second),0);pass('movement input cancels the walk-and-mine task before the block breaks',{second});}

 // 5. A right click places the held block on the face under the cursor (debug kit: iron pick and logs from here on).
 await page.locator('#debug-kit').dispatchEvent('click');const pick=await page.evaluate(()=>Bloom.app.actor().inventory.slots.findIndex(s=>s?.id==='iron_pick'));
 const log=await page.evaluate(()=>Bloom.app.actor().inventory.slots.findIndex(s=>s?.id==='log'));await hotbar(page,log);
 const face=await page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain;for(const [dx,dz]of [[2,0],[-2,0],[0,2],[0,-2],[2,2],[-2,2]]){const x=Math.floor(a.pos.x)+dx,z=Math.floor(a.pos.z)+dz,y=t.height(x,z);if(t.get(x,y,z)&&!t.get(x,y+1,z)&&!t.get(x,y+2,z)&&window.__faceScreen({x,y,z},{x:0,y:1,z:0}))return{x,y,z};}return null;});
 assert(face);const faceAt=await faceScreen(page,face,{x:0,y:1,z:0});const logs=await page.evaluate(()=>Bloom.Inventory.count(Bloom.app.actor().inventory,'log'));
 await page.mouse.click(faceAt.x,faceAt.y,{button:'right'});const placed={x:face.x,y:face.y+1,z:face.z};
 await page.waitForFunction(b=>Bloom.BLOCKS[Bloom.app.sim.terrain.get(b.x,b.y,b.z)].id==='log',placed,{timeout:3000});await shot(page,'place-right-click');
 assert.equal(await page.evaluate(()=>Bloom.Inventory.count(Bloom.app.actor().inventory,'log')),logs-1);
 pass('a right click places the held log on the cursor face (the cell above the clicked top face)',{face,placed});

 // 6. Cave cutaway: in a 2-high tunnel the blocks above the first ceiling layer are hidden, the first layer is drawn
 // translucent and clickable, and the cutaway opens and closes smoothly with hysteresis.
 await teleport(page,TUNNEL);await page.waitForFunction(()=>Bloom.app.renderer.cut.amount===1,null,{timeout:6000});await page.mouse.move(1150,600);await settle(page);await shot(page,'desktop-cave-tunnel');
 const cut=await page.evaluate(()=>{const r=Bloom.app.renderer,k=r.cut,f=k.frame,a=Bloom.app.actor(),x=Math.floor(a.pos.x),z=Math.floor(a.pos.z),t=Bloom.app.sim.terrain;
  const ceilings=[...r.meshes.values()].filter(m=>m.ceiling.visible).length;let picked=0,above=0;
  for(let sy=60;sy<720;sy+=40)for(let sx=80;sx<1300;sx+=60){const p=r.pickAt(sx,sy),b=p?.block;if(!b)continue;picked++;const inCut=r.cutCell(b.x,b.y,b.z);if(inCut==='hidden'||inCut==='layer'&&Math.hypot(b.x+.5-a.pos.x,b.z+.5-a.pos.z)>Bloom.CFG.cutaway.ceilingPick)above++;}
  return{active:k.active,amount:k.amount,y:k.y,feet:a.pos.y,radius:f.radius,layer:r.cutCell(x,k.y,z),aboveLayer:r.cutCell(x,k.y+1,z),aboveSolid:t.isSolid(t.get(x,k.y+1,z)),ceilingDraws:ceilings,picked,pickedHidden:above};});
 assert(cut.active&&cut.amount===1&&cut.y===Math.round(cut.feet)+2,'cutaway state: '+JSON.stringify(cut));assert.equal(cut.layer,'layer');assert.equal(cut.aboveLayer,'hidden');assert(cut.ceilingDraws>0,'the translucent layer is drawn');
 assert(cut.picked>20&&cut.pickedHidden===0,'the cursor never picks a hidden cell: '+JSON.stringify(cut));
 const ceilingBlock={x:Math.floor(TUNNEL.x),y:cut.y,z:Math.floor(TUNNEL.z)},under=await faceScreen(page,ceilingBlock,{x:0,y:-1,z:0});
 pass('in a tunnel the cutaway hides the rock above the first ceiling layer, draws that layer translucent, and the cursor picks the layer underside but never a hidden block',{...cut,underside:under});
 // Dig the ceiling through the translucent layer (iron pick).
 await hotbar(page,pick);await page.mouse.move(under.x,under.y);await page.waitForTimeout(120);await page.mouse.down();await page.mouse.up();
 await page.waitForFunction(b=>Bloom.app.actor().task?.mining&&Bloom.app.actor().mine.elapsed>0||Bloom.app.sim.terrain.get(b.x,b.y,b.z)===0,ceilingBlock,{timeout:4000});if(await blockId(page,ceilingBlock))await shot(page,'dig-ceiling');
 await page.waitForFunction(b=>Bloom.app.sim.terrain.get(b.x,b.y,b.z)===0,ceilingBlock,{timeout:6000});
 await page.waitForFunction(y=>Bloom.app.renderer.cut.y>y,cut.y,{timeout:4000});const dug=await page.evaluate(()=>Bloom.app.renderer.cut.y);
 pass('clicking the translucent layer above the player digs it, and the cutaway moves up to the next ceiling layer',{block:ceilingBlock,nextLayer:dug});
 // Hysteresis: back on the surface the cutaway closes once, over about 0.3 s, without flicker.
 await page.evaluate(()=>{window.__cutTrace=[];const r=Bloom.app.renderer,loop=()=>{window.__cutTrace.push([performance.now(),r.cut.active,r.cut.amount]);if(window.__cutTrace.length<120)requestAnimationFrame(loop);};requestAnimationFrame(loop);});
 await teleport(page,{x:.5,y:5.1,z:.5});await page.waitForFunction(()=>window.__cutTrace.length>=120,null,{timeout:8000});
 const trace=await page.evaluate(()=>window.__cutTrace),toggles=trace.slice(1).filter((t,i)=>t[1]!==trace[i][1]).length,offAt=trace.find(t=>!t[1]),closedAt=trace.find(t=>t[2]===0),amounts=trace.map(t=>t[2]);
 assert.equal(toggles,1,'one toggle, no flicker');assert(closedAt&&closedAt[0]-offAt[0]>200&&closedAt[0]-offAt[0]<600,'smooth close: '+JSON.stringify({offAt,closedAt}));assert(amounts.every((v,i)=>i===0||v<=amounts[i-1]));
 pass('leaving the cave closes the cutaway once after the exit delay and fades it out over about 0.3 s',{toggles,exitDelayMs:Math.round(offAt[0]-trace[0][0]),fadeMs:Math.round(closedAt[0]-offAt[0])});

 // 7. Pillar-up: from a cave floor to the surface using only ceiling digging (left click on the layer), Space and a
 // mid-air right click on the player (under-feet placement).
 await teleport(page,SHAFT);await page.waitForTimeout(400);await page.waitForFunction(()=>Bloom.app.actor().grounded&&Bloom.app.renderer.cut.amount===1,null,{timeout:6000});
 const column=await page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain,x=Math.floor(a.pos.x),z=Math.floor(a.pos.z);return{x,z,floor:Math.round(a.pos.y),surface:t.height(x,z)};});
 assert(column.surface-column.floor>=6,'a deep cave: '+JSON.stringify(column));const steps=[];let midShot=false;
 const solidAt=y=>page.evaluate(({x,y,z})=>Bloom.app.sim.terrain.isSolid(Bloom.app.sim.terrain.get(x,y,z)),{x:column.x,y,z:column.z});
 for(let guard=0;guard<40;guard++){
  const s=await actorState(page),feet=Math.round(s.pos.y);if(feet>column.surface&&!(await page.evaluate(()=>Bloom.app.renderer.cut.active)))break;
  // Clear two cells above the head (feet+2, feet+3), each through the clickable first layer.
  let dugAny=false;for(const y of [feet+2,feet+3]){if(!(await solidAt(y)))continue;dugAny=true;await hotbar(page,pick);await page.waitForFunction(y=>Bloom.app.renderer.cut.y===y,y,{timeout:4000});
   const at=await faceScreen(page,{x:column.x,y,z:column.z},{x:0,y:-1,z:0});await page.mouse.move(at.x,at.y);await page.mouse.down();await page.mouse.up();
   await page.waitForFunction(b=>Bloom.app.sim.terrain.get(b.x,b.y,b.z)===0,{x:column.x,y,z:column.z},{timeout:8000});steps.push({dig:y});}
  if(dugAny)await page.waitForTimeout(250);
  // Jump, and once the feet are above the cell, right-click the player: the block goes under the feet.
  await hotbar(page,log);await page.waitForFunction(()=>Bloom.app.actor().grounded,null,{timeout:4000});await page.keyboard.press('Space');
  await page.waitForFunction(y=>Bloom.app.actor().pos.y>y+1.05,feet,{timeout:3000,polling:'raf'});const me=await page.evaluate(()=>window.__selfScreen());await page.mouse.click(me.x,me.y,{button:'right'});
  await page.waitForFunction(b=>Bloom.app.sim.terrain.isSolid(Bloom.app.sim.terrain.get(b.x,b.y,b.z)),{x:column.x,y:feet,z:column.z},{timeout:3000});
  await page.waitForFunction(y=>Bloom.app.actor().grounded&&Math.abs(Bloom.app.actor().pos.y-(y+1))<.05,feet,{timeout:3000});steps.push({placed:feet});
  if(!midShot&&feet>=column.floor+Math.floor((column.surface-column.floor)/2)){midShot=true;await shot(page,'pillar-midway');}
 }
 await page.waitForFunction(()=>!Bloom.app.renderer.cut.active,null,{timeout:4000});const top=await actorState(page);await page.waitForTimeout(400);await shot(page,'pillar-surface-exit');
 assert(top.pos.y>column.surface+.9,'reached the surface: '+JSON.stringify({top:top.pos,column}));assert(steps.filter(s=>'placed'in s).length>=column.surface-column.floor);
 pass('from a cave floor the player reaches the surface with only ceiling digging, jumps and mid-air under-feet right clicks',{column,steps:steps.length,top:top.pos});
 assert.deepEqual(errors,[]);await page.close();

 // 8. Landscape touch: the two on-screen turn buttons step the camera; a pinch zooms.
 const mobileContext=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true}),mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.addInitScript(CURSOR_HELPERS);
 await mobile.goto(url);await boot(mobile);await settle(mobile);await mobile.waitForTimeout(300);await shot(mobile,'mobile-surface');
 const buttons=await mobile.evaluate(()=>[...document.querySelectorAll('[data-turn]')].map(b=>{const r=b.getBoundingClientRect();return{turn:b.dataset.turn,visible:r.width>=40&&r.height>=40&&r.right<=innerWidth&&r.bottom<=innerHeight}}));
 assert.deepEqual(buttons,[{turn:'1',visible:true},{turn:'-1',visible:true}]);
 await mobile.locator('#turn-left').tap();await mobile.waitForTimeout(350);const m1=await camera(mobile);await mobile.locator('#turn-right').tap();await mobile.locator('#turn-right').tap();await mobile.waitForTimeout(350);const m2=await camera(mobile);
 assert.deepEqual([m1.yawStep,m2.yawStep],[1,7]);await shot(mobile,'mobile-buttons');
 const cdp=await mobileContext.newCDPSession(mobile),z0=(await camera(mobile)).distance;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:380,y:200,id:1},{x:460,y:200,id:2}]});for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:380-i*20,y:200,id:1},{x:460+i*20,y:200,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const z1=(await camera(mobile)).distance;assert(z1<z0-2,'pinch out zooms in: '+JSON.stringify({z0,z1}));
 await teleport(mobile,TUNNEL);await mobile.waitForFunction(()=>Bloom.app.renderer.cut.amount===1,null,{timeout:6000});await shot(mobile,'mobile-cave-tunnel');
 pass('landscape touch shows the two turn buttons (yaw steps 1 then 7) and a pinch zooms the camera',{buttons,steps:[m1.yawStep,m2.yawStep],zoom:{z0,z1}});
 await mobileContext.close();assert.deepEqual(errors,[]);report.result='PASS';
 console.log(JSON.stringify({result:'PASS',checks:report.checks.length,elapsedMs:Date.now()-began,errors:0}));
}catch(error){report.result='FAIL';report.error=error.stack;console.error(error);process.exitCode=1;}
finally{report.elapsedMs=Date.now()-began;report.errors=errors;if(process.env.CAMERA_REPORT)fs.writeFileSync(process.env.CAMERA_REPORT,JSON.stringify(report,null,2)+'\n');clearTimeout(timeout);await browser?.close();server?.close();}
