import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CURSOR_HELPERS} from './cursor-helpers.mjs';

// D-165 shoulder camera and controls (0.38.0; hold-to-mine D-123), driven by real browser input on seed 190725: a click
// locks the pointer and shows the crosshair, relative mouse motion turns yaw and pitch (pitch clamped), a menu releases the
// lock, W walks where the camera looks, wheel zoom limits; in free-cursor mode (headless tests aim with the visible
// cursor) a short left click on a block attacks and leaves it, holding the left button mines the block on the head ray
// (re-aimed while held, nothing out of reach), a right click places on the cursor face; in a tunnel the camera stays out
// of the rock and the player fades; pillar-up from a cave floor to the surface using only digging the ceiling, jumping and
// under-feet placement; touch drag turns the camera and a pinch zooms. Fixtures (direct state writes): the debug kit button
// (iron pick, logs), and teleporting the player into the two seed-190725 caves. SHOTS=<dir> saves the review screenshots.
const began=Date.now(),errors=[],report={checks:[]},SHOTS=process.env.SHOTS||null;
const timeout=setTimeout(()=>{console.error('camera E2E exceeded 180 seconds');process.exit(1);},180000);
const pass=(name,evidence)=>{const s=Math.round((Date.now()-began)/1000);report.checks.push({name,evidence,s});console.log('PASS '+s+'s '+name);};
const TUNNEL={x:-2.5,y:-15,z:-51.5},SHAFT={x:-.5,y:-1,z:-35.5};
let browser,server;
const boot=p=>p.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});
const settle=p=>p.waitForFunction(()=>{const r=Bloom.app.renderer;return r.streamComplete&&r.readyChunks.size===r.visibleChunks.size;},null,{timeout:30000});
const shot=async(p,name)=>{if(!SHOTS)return;fs.mkdirSync(SHOTS,{recursive:true});await settle(p).catch(()=>{});await p.waitForTimeout(150);await p.screenshot({path:SHOTS+'/'+name+'.png'});};
const camera=p=>p.evaluate(()=>{const c=Bloom.app.renderer.camera;return{yaw:c.yaw,pitch:c.pitch,distance:c.distance};});
const look=(p,dyaw,dpitch)=>p.evaluate(([y,q])=>window.__look(y,q),[dyaw,dpitch]);
const setPitch=async(p,pitch)=>{const c=await camera(p);await look(p,0,pitch-c.pitch);await p.waitForTimeout(250);};
const actorState=p=>p.evaluate(()=>{const a=Bloom.app.actor();return{pos:{...a.pos},mine:{...a.mine},grounded:a.grounded,selected:a.inventory.selected};});
const blockId=(p,b)=>p.evaluate(b=>Bloom.app.sim.terrain.get(b.x,b.y,b.z),b);
const teleport=(p,pos)=>p.evaluate(pos=>{const a=Bloom.app.actor();Bloom.app.sim.physics.teleport(a,pos);},pos);
async function faceScreen(p,b,n){for(let i=0;i<20;i++){const s=await p.evaluate(({b,n})=>window.__faceScreen(b,n),{b,n});if(s)return s;await p.waitForTimeout(100);}throw Error('face not on screen: '+JSON.stringify({b,n}));}
async function mineScreen(p,b){for(let i=0;i<20;i++){const s=await p.evaluate(b=>window.__mineScreen(b),b);if(s)return s;await p.waitForTimeout(100);}throw Error('no screen point mines '+JSON.stringify(b));}
const hotbar=async(p,index)=>{await p.keyboard.press('Digit'+(index+1));await p.waitForFunction(i=>Bloom.app.actor().inventory.selected===i,index,{timeout:3000});};
try{
 server=http.createServer(serveStatic);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/bloom-digmori/';
 browser=await chromium.launch({...(process.env.BROWSER_CHANNEL||process.platform==='win32'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{}),headless:true});report.browser=browser.version();
 const page=await browser.newPage({viewport:{width:1366,height:768}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(CURSOR_HELPERS);
 await page.goto(url+'?debug=1');await boot(page);await settle(page);
 assert.equal(await page.evaluate(()=>Bloom.app.sim.terrain.seed),190725);
 await shot(page,'desktop-surface');

 // 1. Shoulder camera (D-165): no first-person code is left; a click on the world locks the pointer (the crosshair shows and
 // the aim is the screen centre), relative mouse motion turns yaw and pitch (pitch clamped), opening a menu releases it.
 const sources=['src/input/controls.js','src/presentation/renderer.js','src/runtime/app.js','index.html'].map(f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8')).join('\n');
 const banned=['renderViewArms','camera.first','toggleView','view-btn',"'KeyV'",'1인칭','rotateCamera','cutaway','data-turn'].filter(t=>sources.includes(t));
 assert.deepEqual(banned,[],'first-person / fixed-camera code left: '+banned);
 const c0=await camera(page);assert(Math.abs(c0.pitch-20*Math.PI/180)<1e-9&&c0.distance===4,JSON.stringify(c0));
 await page.evaluate(()=>{window.__allowLock=true;});await page.mouse.move(683,384);await page.mouse.click(683,384);
 const locked=await page.evaluate(()=>({lock:document.pointerLockElement===Bloom.app.renderer.canvas,crosshair:getComputedStyle(document.querySelector('#crosshair')).display}));
 assert.deepEqual(locked,{lock:true,crosshair:'block'});
 const k=await page.evaluate(()=>Bloom.CFG.camera.mouseSensitivity);
 await page.evaluate(()=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:-200,movementY:100})));const c1=await camera(page);
 assert(Math.abs(c1.yaw-((c0.yaw+200*k)%(2*Math.PI)))<1e-9&&Math.abs(c1.pitch-(c0.pitch+100*k))<1e-9,'mouse look: '+JSON.stringify({c0,c1}));
 await page.evaluate(()=>{for(let i=0;i<20;i++)document.dispatchEvent(new MouseEvent('mousemove',{movementX:0,movementY:-400}));});const up=await camera(page);
 assert(Math.abs(up.pitch+60*Math.PI/180)<1e-9,'pitch clamps at -60°: '+up.pitch);await shot(page,'look-up');
 await page.waitForTimeout(200);const center=await page.evaluate(()=>({x:Bloom.app.controls.pointer.x,y:Bloom.app.controls.pointer.y,w:Bloom.app.renderer.canvas.clientWidth,h:Bloom.app.renderer.canvas.clientHeight}));
 assert.deepEqual([center.x,center.y],[center.w/2,center.h/2]);
 await page.keyboard.press('Tab');await page.waitForFunction(()=>!document.querySelector('#inventory').hidden);await page.waitForTimeout(150);
 const released=await page.evaluate(()=>({lock:document.pointerLockElement,crosshair:getComputedStyle(document.querySelector('#crosshair')).display}));assert.deepEqual(released,{lock:null,crosshair:'none'});
 await page.keyboard.press('Tab');await page.evaluate(()=>{window.__allowLock=false;});await setPitch(page,c0.pitch);
 pass('a click locks the pointer and shows the crosshair at the aim (screen centre), mouse motion turns yaw and pitch (clamped at -60°), opening the bag releases the lock; no first-person or fixed-camera code is left',{banned,c0,c1,up:up.pitch,released});

 // 2. W walks where the camera looks (turned 90° left, W moves along -x).
 const yawNow=(await camera(page)).yaw;await look(page,-yawNow+Math.PI/2,0);await page.waitForTimeout(200);
 const w0=await actorState(page);await page.locator('#world').focus();await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');const w1=await actorState(page);
 assert(w1.pos.x<w0.pos.x-.8&&Math.abs(w1.pos.z-w0.pos.z)<.4,'W follows the camera: '+JSON.stringify({w0:w0.pos,w1:w1.pos}));
 await look(page,-Math.PI/2,0);
 pass('W walks where the camera looks',{walk:{from:w0.pos,to:w1.pos}});

 // 3. Wheel zoom stops at the limits.
 for(let i=0;i<14;i++){await page.mouse.wheel(0,120);await page.waitForTimeout(15);}const far=await camera(page);await page.waitForTimeout(500);await shot(page,'zoom-max');
 for(let i=0;i<20;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(15);}const near=await camera(page);await page.waitForTimeout(500);await shot(page,'zoom-min');
 const limits=await page.evaluate(()=>({min:Bloom.CFG.camera.minDistance,max:Bloom.CFG.camera.maxDistance}));assert.equal(far.distance,limits.max);assert.equal(near.distance,limits.min);
 for(let i=0;i<6;i++){await page.mouse.wheel(0,120);await page.waitForTimeout(15);}const back=await camera(page);assert(back.distance>3.5&&back.distance<4.5,'back: '+back.distance);await page.waitForTimeout(500);
 pass('the wheel zooms between the minimum and maximum distance and stops there',{far:far.distance,near:near.distance,limits,back:back.distance});

 // 4. Hold-to-mine (D-123): a short left click on a ground block 2 m away is the basic attack and leaves it; holding the
 // left button on it mines it with bare hands (grass, 0.65 s) from where the player stands; moving the mouse while held
 // moves the target; a block out of hand reach (6 m) is not mined and the player does not walk.
 await setPitch(page,.55);await page.waitForTimeout(600);// look down at the ground around the player and let the camera settle
 const goal=await page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain;for(const [dx,dz]of [[0,-2],[1,-2],[-1,-2],[2,0],[-2,0],[0,2]]){const x=Math.floor(a.pos.x)+dx,z=Math.floor(a.pos.z)+dz,y=t.height(x,z);if(t.get(x,y,z)&&!t.get(x,y+1,z)&&!t.get(x,y+2,z)&&Math.abs(y+1-a.pos.y)<.6&&window.__faceScreen({x,y,z},{x:0,y:1,z:0}))return{x,y,z,id:t.get(x,y,z),distance:Math.hypot(x+.5-a.pos.x,z+.5-a.pos.z)};}return null;});
 assert(goal,'no ground block 2 m away');const goalScreen=await faceScreen(page,goal,{x:0,y:1,z:0});await page.mouse.move(goalScreen.x,goalScreen.y);await page.waitForTimeout(250);
 const hover=await page.evaluate(()=>({cursor:Bloom.app.renderer.cursor?.block,target:Bloom.app.renderer.target}));assert.deepEqual([hover.cursor.x,hover.cursor.y,hover.cursor.z],[goal.x,goal.y,goal.z]);await shot(page,'cursor-highlight');
 const start=await actorState(page),edits0=await page.evaluate(()=>Bloom.app.sim.terrain.edits.size);
 await page.mouse.down();await page.waitForTimeout(60);await page.mouse.up();await page.waitForTimeout(500);
 assert.notEqual(await blockId(page,goal),0,'a short click does not mine');assert.equal(await page.evaluate(()=>Bloom.app.sim.terrain.edits.size),edits0,'a short click changes no block');
 await page.mouse.down();await page.waitForFunction(g=>{const a=Bloom.app.actor();return a.mine.target===g.x+','+g.y+','+g.z&&a.mine.elapsed>0;},goal,{timeout:3000});await shot(page,'mining');
 await page.waitForFunction(g=>Bloom.app.sim.terrain.get(g.x,g.y,g.z)===0,goal,{timeout:6000});await page.mouse.up();const done=await actorState(page);
 const walked=Math.hypot(done.pos.x-start.pos.x,done.pos.z-start.pos.z),pointerLock=await page.evaluate(()=>document.pointerLockElement);
 assert(walked<.3,'the player does not walk: '+walked);assert.equal(pointerLock,null);
 pass('a short left click on a block is an attack and changes no block; holding the left button mines it barehanded from where the player stands (no walk; free-cursor aim)',{goal,start:start.pos,end:done.pos,walked});
 // While held the target follows the mouse: hold on one block, then move the cursor to another one.
 await page.waitForTimeout(400);const pair=await page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain,out=[];for(const [dx,dz]of [[2,-2],[-2,-2],[2,2],[-2,2],[3,0],[-3,0]]){const x=Math.floor(a.pos.x)+dx,z=Math.floor(a.pos.z)+dz,y=t.height(x,z);if(t.get(x,y,z)&&!t.get(x,y+1,z)&&Math.abs(y+1-a.pos.y)<.6&&window.__faceScreen({x,y,z},{x:0,y:1,z:0}))out.push({x,y,z});}return out.slice(0,2);});
 assert(pair.length===2,'two ground blocks in reach: '+JSON.stringify(pair));const [a1,a2]=pair,s1=await faceScreen(page,a1,{x:0,y:1,z:0}),s2=await faceScreen(page,a2,{x:0,y:1,z:0});
 await page.mouse.move(s1.x,s1.y);await page.waitForTimeout(150);await page.mouse.down();await page.waitForFunction(g=>Bloom.app.actor().mine.target===g.x+','+g.y+','+g.z,a1,{timeout:3000});
 await page.mouse.move(s2.x,s2.y,{steps:4});await page.waitForFunction(g=>Bloom.app.actor().mine.target===g.x+','+g.y+','+g.z,a2,{timeout:3000});await page.mouse.up();
 await page.waitForFunction(()=>!Bloom.app.actor().mine.target,null,{timeout:2000});assert.notEqual(await blockId(page,a1),0);assert.notEqual(await blockId(page,a2),0);
 pass('while the left button is held the mine target follows the cursor, and releasing stops mining',{from:a1,to:a2});
 // Out of reach: holding on a block 6+ m away mines nothing and the player stays put.
 const far6=await page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain;for(const [dx,dz]of [[0,-6],[1,-6],[-1,-6],[0,-7],[6,0],[-6,0]]){const x=Math.floor(a.pos.x)+dx,z=Math.floor(a.pos.z)+dz,y=t.height(x,z);if(t.get(x,y,z)&&!t.get(x,y+1,z)&&window.__faceScreen({x,y,z},{x:0,y:1,z:0}))return{x,y,z};}return null;});
 if(far6){const s=await faceScreen(page,far6,{x:0,y:1,z:0}),p0=await actorState(page);await page.mouse.move(s.x,s.y);await page.mouse.down();await page.waitForTimeout(1500);const held=await actorState(page);await page.mouse.up();
  assert.notEqual(await blockId(page,far6),0);assert(Math.hypot(held.pos.x-p0.pos.x,held.pos.z-p0.pos.z)<.3,'no walk');assert(!held.mine.target||held.mine.target!==far6.x+','+far6.y+','+far6.z,'out of reach is not mined');
  pass('holding the button on a block out of hand reach (6 m) mines nothing and the player does not walk',{far6,mineTarget:held.mine.target});}

 // 5. A right click places the held block on the face under the cursor (debug kit: iron pick and logs from here on).
 await page.locator('#debug-kit').dispatchEvent('click');const pick=await page.evaluate(()=>Bloom.app.actor().inventory.slots.findIndex(s=>s?.id==='iron_pick'));
 const log=await page.evaluate(()=>Bloom.app.actor().inventory.slots.findIndex(s=>s?.id==='log'));await hotbar(page,log);
 const face=await page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain;for(const [dx,dz]of [[2,0],[-2,0],[0,2],[0,-2],[2,2],[-2,2]]){const x=Math.floor(a.pos.x)+dx,z=Math.floor(a.pos.z)+dz,y=t.height(x,z);if(t.get(x,y,z)&&!t.get(x,y+1,z)&&!t.get(x,y+2,z)&&window.__faceScreen({x,y,z},{x:0,y:1,z:0}))return{x,y,z};}return null;});
 assert(face);const faceAt=await faceScreen(page,face,{x:0,y:1,z:0});const logs=await page.evaluate(()=>Bloom.Inventory.count(Bloom.app.actor().inventory,'log'));
 await page.mouse.click(faceAt.x,faceAt.y,{button:'right'});const placed={x:face.x,y:face.y+1,z:face.z};
 await page.waitForFunction(b=>Bloom.BLOCKS[Bloom.app.sim.terrain.get(b.x,b.y,b.z)].id==='log',placed,{timeout:3000});await shot(page,'place-right-click');
 assert.equal(await page.evaluate(()=>Bloom.Inventory.count(Bloom.app.actor().inventory,'log')),logs-1);
 pass('a right click places the held log on the cursor face (the cell above the clicked top face)',{face,placed});

 // 5b. Fighting (D-123): with the pick held, short left clicks on the ground right next to a wild creature are attacks
 // and change no terrain block (before 0.36.0 a missed click on a block started walk-and-mine and dug the ground).
 await hotbar(page,pick);await page.locator('#debug-enemy').dispatchEvent('click');
 const foe=await page.waitForFunction(()=>{const a=Bloom.app.actor(),c=Object.values(Bloom.app.sim.actors).filter(x=>x.speciesId&&!x.dead&&!x.boss&&!x.structureKey).sort((x,y)=>Math.hypot(x.pos.x-a.pos.x,x.pos.z-a.pos.z)-Math.hypot(y.pos.x-a.pos.x,y.pos.z-a.pos.z))[0];return c&&Math.hypot(c.pos.x-a.pos.x,c.pos.z-a.pos.z)<6?c.id:null;},null,{timeout:4000}).then(h=>h.jsonValue());
 await page.evaluate(()=>{const s=window.__fightSeen={attack:0};const loop=()=>{if(Bloom.app.actor().combat?.state==='attack')s.attack++;if(!s.done)requestAnimationFrame(loop);};requestAnimationFrame(loop);});
 const fightEdits0=await page.evaluate(()=>Bloom.app.sim.terrain.edits.size),clicks=[];
 for(let i=0;i<8;i++){const g=await page.evaluate(id=>{const c=Bloom.app.sim.actors[id],t=Bloom.app.sim.terrain;if(!c||c.dead)return null;for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]){const x=Math.floor(c.pos.x)+dx,z=Math.floor(c.pos.z)+dz,y=t.height(x,z);if(t.get(x,y,z)&&!t.get(x,y+1,z)){const s=window.__faceScreen({x,y,z},{x:0,y:1,z:0});if(s)return{x,y,z,s};}}return null;},foe);
  if(!g)break;clicks.push({x:g.x,y:g.y,z:g.z});await page.mouse.move(g.s.x,g.s.y);await page.mouse.down();await page.waitForTimeout(40);await page.mouse.up();await page.waitForTimeout(260);}
 await page.waitForTimeout(400);const seen=await page.evaluate(()=>{window.__fightSeen.done=true;return window.__fightSeen;}),edits1=await page.evaluate(()=>Bloom.app.sim.terrain.edits.size);await shot(page,'fight-clicks');
 assert(clicks.length>=3,'clicked the ground next to the creature: '+clicks.length);assert(seen.attack>0,'the clicks attacked');assert.equal(edits1,fightEdits0,'fight clicks changed terrain');
 for(const b of clicks)assert.notEqual(await blockId(page,b),0);
 pass('during a fight, short left clicks on the ground next to a creature (pick held) attack and change no terrain block',{clicks:clicks.length,attackFrames:seen.attack,edits:edits1-fightEdits0});

 // 6. Tunnel (D-165): the camera never sits inside rock (a wall behind pulls it in), the local player fades so it does not
 // cover the view, and looking up at the ceiling above the head lets the player dig it.
 await teleport(page,TUNNEL);await page.waitForTimeout(800);await settle(page);
 await setPitch(page,.15);
 const tunnel=await page.evaluate(()=>{const r=Bloom.app.renderer,t=Bloom.app.sim.terrain,e=r.eye;return{eyeSolid:t.isSolid(t.get(e.x,e.y,e.z)),distance:r.viewDistance,want:r.camera.distance,alpha:r.selfAlpha()};});
 assert(!tunnel.eyeSolid&&tunnel.distance<tunnel.want&&tunnel.alpha<1,'tunnel camera: '+JSON.stringify(tunnel));
 // then turn down the tunnel (the longest open run from the head), as a player would
 const along=await page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain,h={x:a.pos.x,y:a.pos.y+1.5,z:a.pos.z};let best=0,run=-1;for(let k=0;k<16;k++){const y=k*Math.PI/8,hit=t.ray(h,{x:-Math.sin(y),y:0,z:-Math.cos(y)},30),d=hit?hit.distance:30;if(d>run){run=d;best=y;}}return best;});
 {const c=await camera(page);await look(page,along-c.yaw,0);}await setPitch(page,.15);await page.mouse.move(683,300);await shot(page,'desktop-cave-tunnel');
 pass('in a tunnel the camera is pulled in front of the rock (never inside it) and the player fades instead of covering the view',tunnel);
 const ceilingBlock=await page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain,x=Math.floor(a.pos.x),z=Math.floor(a.pos.z);for(let y=Math.round(a.pos.y)+2;y<Math.round(a.pos.y)+5;y++)if(t.isSolid(t.get(x,y,z)))return{x,y,z};return null;});
 await setPitch(page,-1);const under=await faceScreen(page,ceilingBlock,{x:0,y:-1,z:0});
 await hotbar(page,pick);await page.mouse.move(under.x,under.y);await page.waitForTimeout(120);await page.mouse.down();
 await page.waitForFunction(b=>Bloom.app.actor().mine.target===b.x+','+b.y+','+b.z&&Bloom.app.actor().mine.elapsed>0||Bloom.app.sim.terrain.get(b.x,b.y,b.z)===0,ceilingBlock,{timeout:4000});if(await blockId(page,ceilingBlock))await shot(page,'dig-ceiling');
 await page.waitForFunction(b=>Bloom.app.sim.terrain.get(b.x,b.y,b.z)===0,ceilingBlock,{timeout:6000});await page.mouse.up();
 pass('looking up in the tunnel, holding the button on the ceiling above the player digs it',{block:ceilingBlock});

 // 7. Pillar-up: from a cave floor to the surface using only ceiling digging (looking up, left button held), Space and a
 // mid-air right click on the player (under-feet placement).
 await teleport(page,SHAFT);await page.waitForTimeout(400);await page.waitForFunction(()=>Bloom.app.actor().grounded,null,{timeout:6000});await setPitch(page,-1);
 const column=await page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain,x=Math.floor(a.pos.x),z=Math.floor(a.pos.z);return{x,z,floor:Math.round(a.pos.y),surface:t.height(x,z)};});
 assert(column.surface-column.floor>=6,'a deep cave: '+JSON.stringify(column));const steps=[];let midShot=false;
 const solidAt=y=>page.evaluate(({x,y,z})=>Bloom.app.sim.terrain.isSolid(Bloom.app.sim.terrain.get(x,y,z)),{x:column.x,y,z:column.z});
 for(let guard=0;guard<40;guard++){
  const s=await actorState(page),feet=Math.round(s.pos.y);if(feet>column.surface)break;
  // Clear two cells above the head (feet+2, feet+3), looking up: the cursor goes where the highlight is on the cell (the
  // camera may be in the cave below, so the face itself can be hidden while the head ray reaches it).
  let dugAny=false;for(const y of [feet+2,feet+3]){if(!(await solidAt(y)))continue;dugAny=true;await hotbar(page,pick);
   // keep the cursor on the layer cell while holding (a player re-aims when the camera settles)
   const cell={x:column.x,y,z:column.z};let at=await mineScreen(page,cell);await page.mouse.move(at.x,at.y);await page.mouse.down();
   for(let k=0;k<40&&await page.evaluate(b=>Bloom.app.sim.terrain.get(b.x,b.y,b.z)!==0,cell);k++){await page.waitForTimeout(200);const still=await page.evaluate(({b,at})=>{const r=Bloom.app.renderer,k=r.minePreview(Bloom.app.sim,Bloom.app.actor(),r.pickAt(at.x,at.y))?.block;return k&&k.x===b.x&&k.y===b.y&&k.z===b.z;},{b:cell,at});const again=still?null:await page.evaluate(b=>window.__mineScreen(b),cell);if(again&&(Math.abs(again.x-at.x)>1||Math.abs(again.y-at.y)>1)){at=again;await page.mouse.move(at.x,at.y);}}
   await page.mouse.up();assert.equal(await page.evaluate(b=>Bloom.app.sim.terrain.get(b.x,b.y,b.z),cell),0,'ceiling cell dug: '+JSON.stringify(cell));steps.push({dig:y});}
  if(dugAny)await page.waitForTimeout(250);
  // Jump, and once the feet are above the cell, right-click the player: the block goes under the feet.
  await hotbar(page,log);await page.waitForFunction(()=>Bloom.app.actor().grounded,null,{timeout:4000});await page.keyboard.press('Space');
  await page.waitForFunction(y=>Bloom.app.actor().pos.y>y+1.05,feet,{timeout:3000,polling:'raf'});const me=await page.evaluate(()=>window.__selfScreen());await page.mouse.click(me.x,me.y,{button:'right'});
  await page.waitForFunction(b=>Bloom.app.sim.terrain.isSolid(Bloom.app.sim.terrain.get(b.x,b.y,b.z)),{x:column.x,y:feet,z:column.z},{timeout:3000});
  await page.waitForFunction(y=>Bloom.app.actor().grounded&&Math.abs(Bloom.app.actor().pos.y-(y+1))<.05,feet,{timeout:3000});steps.push({placed:feet});
  if(!midShot&&feet>=column.floor+Math.floor((column.surface-column.floor)/2)){midShot=true;await shot(page,'pillar-midway');}
 }
 const top=await actorState(page);await page.waitForTimeout(400);await shot(page,'pillar-surface-exit');
 assert(top.pos.y>column.surface+.9,'reached the surface: '+JSON.stringify({top:top.pos,column}));assert(steps.filter(s=>'placed'in s).length>=column.surface-column.floor);
 pass('from a cave floor the player reaches the surface with only ceiling digging, jumps and mid-air under-feet right clicks',{column,steps:steps.length,top:top.pos});
 assert.deepEqual(errors,[]);await page.close();

 // 8. Landscape touch: a one-finger drag on the world turns the camera (no turn buttons); a pinch zooms.
 const mobileContext=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true}),mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.addInitScript(CURSOR_HELPERS);
 await mobile.goto(url);await boot(mobile);await settle(mobile);await mobile.waitForTimeout(300);await shot(mobile,'mobile-surface');
 const cdp=await mobileContext.newCDPSession(mobile),y0=(await camera(mobile)).yaw;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:420,y:180,id:1}]});for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:420+i*25,y:180,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const m1=await camera(mobile),turned=((y0-m1.yaw)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);assert(turned>.5&&turned<1.2,'a drag right turns right: '+JSON.stringify({y0,m1}));
 const z0=(await camera(mobile)).distance;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:380,y:200,id:1},{x:460,y:200,id:2}]});for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:380-i*20,y:200,id:1},{x:460+i*20,y:200,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const z1=(await camera(mobile)).distance;assert(z1<z0-2,'pinch out zooms in: '+JSON.stringify({z0,z1}));
 await teleport(mobile,TUNNEL);await mobile.waitForTimeout(1500);await shot(mobile,'mobile-cave-tunnel');
 pass('landscape touch: a one-finger drag turns the camera and a pinch zooms it',{turned,zoom:{z0,z1}});
 await mobileContext.close();assert.deepEqual(errors,[]);report.result='PASS';
 console.log(JSON.stringify({result:'PASS',checks:report.checks.length,elapsedMs:Date.now()-began,errors:0}));
}catch(error){report.result='FAIL';report.error=error.stack;console.error(error);process.exitCode=1;}
finally{report.elapsedMs=Date.now()-began;report.errors=errors;if(process.env.CAMERA_REPORT)fs.writeFileSync(process.env.CAMERA_REPORT,JSON.stringify(report,null,2)+'\n');clearTimeout(timeout);await browser?.close();server?.close();}
