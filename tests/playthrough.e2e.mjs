import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CURSOR_HELPERS} from './cursor-helpers.mjs';
import {PLAYTHROUGH_HELPERS} from './playthrough-helpers.mjs';

// G2 full playthrough (0.36.0) on seed 190725, from a new world, driven ONLY by real input: Playwright keyboard (WASD,
// Space, digits, Tab, Escape, G) and mouse clicks on the canvas and on the inventory UI, the same paths a player uses.
// Routes and targets are computed from what is on screen/in the world (tests/playthrough-helpers.mjs reads terrain and
// actor state, never writes it). No teleport, no item injection, no debug kit.
// The only acceleration is the clearly marked TEST HOOK (`?testHooks=1`, App.setTestHooks): sim time runs faster while
// waiting (hatching, smelting, growth, boss respawn, labor), and structure bosses spawn with less HP/damage.
// Output: a milestone timeline (sim ticks → minutes of play at normal speed) in artifacts/playthrough/timeline.json and
// one screenshot per milestone in SHOTS (default artifacts/playthrough/).
// DEV ONLY: PT_SAVE=<dir> writes a world snapshot before each phase (and FAIL.bloom on a failure) and PT_RESUME=<phase> starts from one; a resumed run
// is not a valid playthrough and the timeline marks it.
const began=Date.now(),errors=[],timeline=[],SHOTS=process.env.SHOTS||'artifacts/playthrough',LIMIT=+(process.env.PT_LIMIT_S||4800);/* 0.36.0 hold-to-mine bot: about 50 min on a headless software-rendered page (PT_LIMIT_S overrides) */
const PT_SAVE=process.env.PT_SAVE||null,PT_RESUME=process.env.PT_RESUME||null;
const timeout=setTimeout(()=>{console.error('playthrough exceeded '+LIMIT+' s');process.exit(1);},LIMIT*1000);
let browser,server,page;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=(...a)=>console.log(Math.round((Date.now()-began)/1000)+'s',...a);
const BOSS_HP=200,BOSS_DAMAGE=100;// TEST HOOK per-mille: boss HP ×0.2, boss damage ×0.1

// ---------- state reads ----------
const st=()=>page.evaluate(()=>{const a=Bloom.app.actor(),s=Bloom.app.sim;return{pos:{...a.pos},hp:a.hp,dead:a.dead,grounded:a.grounded,tick:s.tick,sel:a.inventory.selected,modal:Bloom.app.modal()};});
const count=id=>page.evaluate(id=>Bloom.Inventory.count(Bloom.app.actor().inventory,id),id);
const counts=ids=>page.evaluate(ids=>Object.fromEntries(ids.map(id=>[id,Bloom.Inventory.count(Bloom.app.actor().inventory,id)])),ids);
const progress=()=>page.evaluate(()=>({...Bloom.app.sim.progress}));
const tick=()=>page.evaluate(()=>Bloom.app.sim.tick);
const feet=()=>page.evaluate(()=>window.__PT.feet());
const blockAt=b=>page.evaluate(b=>Bloom.BLOCKS[Bloom.app.sim.terrain.get(b.x,b.y,b.z)].id,b);
const hooks=o=>page.evaluate(o=>Bloom.app.setTestHooks(o),o);
let scale=1;
async function timeScale(n){scale=n;await hooks({timeScale:n});}
// Wait for a page condition in sim time: `simMs` of game time at the current scale (plus slack).
async function until(fn,arg,simMs,what){const ok=await page.waitForFunction(fn,arg,{timeout:Math.max(3000,simMs+10000),polling:100}).then(()=>true,()=>false);if(!ok)throw Error('timed out: '+what);}

async function milestone(name,note=''){const t=await tick();timeline.push({name,tick:t,minutes:+(t/30/60).toFixed(2),realS:Math.round((Date.now()-began)/1000),note});log('MILESTONE',name,'tick',t,'≈'+(t/30/60).toFixed(1)+' min');
 fs.mkdirSync(SHOTS,{recursive:true});await sleep(300);await page.screenshot({path:SHOTS+'/'+String(timeline.length).padStart(2,'0')+'-'+name+'.png'});}

// ---------- input ----------
const held=new Set();
async function keys(want){for(const k of [...held])if(!want.includes(k)){await page.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}}
async function focusWorld(){await page.locator('#world').focus();}
// The first-boss ending card is dismissed with its own button, like a player would.
async function dismissModal(){if(await page.evaluate(()=>!document.querySelector('#ending').hidden)){await clickSel('#continue-end');await sleep(200);}else await closeMenus();}
async function closeMenus(){if((await st()).modal){await page.keyboard.press('Escape');await page.waitForFunction(()=>!Bloom.app.modal(),null,{timeout:3000});}}
// Hotbar slot of the best item matching pred (ITEMS def) or of id; moves it from the bag to the hotbar through the UI.
async function hotbarIndex(pred){return page.evaluate(src=>{const f=new Function('it','return ('+src+')(it)');const s=Bloom.app.actor().inventory.slots;let best=-1,tier=-1;for(let i=0;i<36;i++){const it=s[i]&&Bloom.ITEMS[s[i].id];if(it&&f(it)){const t=it.tier||Bloom.GEAR_TIERS[it.material]||0;if(t>tier){tier=t;best=i;}}}return best;},pred.toString());}
async function select(pred){let i=await hotbarIndex(pred);if(i<0)return false;if(i>=9){await toHotbar(i);i=await hotbarIndex(pred);if(i<0||i>=9)throw Error('could not move to hotbar');}
 if((await st()).sel!==i){await focusWorld();await page.keyboard.press('Digit'+(i+1));await page.waitForFunction(i=>Bloom.app.actor().inventory.selected===i,i,{timeout:3000});}return true;}
const selectId=id=>select(new Function('it','return it.id==='+JSON.stringify(id)));
// Shift-click a bag slot (index>=9) into the hotbar; if the hotbar is full, first shift-click the least useful hotbar
// stack (a plain block/material that is not a tool, weapon, egg or potion) into the bag.
async function toHotbar(index){await openBag();
 const full=await page.evaluate(()=>Bloom.app.actor().inventory.slots.slice(0,9).every(Boolean));
 if(full){const junk=await page.evaluate(()=>{const s=Bloom.app.actor().inventory.slots;for(let i=8;i>=0;i--){const it=Bloom.ITEMS[s[i].id];if(!it.tool&&!it.weapon&&!it.armor&&!it.throwable&&!Bloom.BLOCKS[it.block]?.egg&&!['food','seed','fence','storageChest','workbench','furnace'].includes(it.id))return i;}return 8;});
  await clickSel('#inventory-hotbar [data-index="'+junk+'"]',{shift:true});await sleep(150);}
 await clickSel('#inventory-grid [data-index="'+index+'"]',{shift:true});await sleep(200);await closeMenus();}
async function openBag(){if(!(await page.evaluate(()=>!document.querySelector('#inventory').hidden))){await closeMenus();await focusWorld();await page.keyboard.press('Tab');await page.waitForFunction(()=>!document.querySelector('#inventory').hidden,null,{timeout:3000});}await sleep(120);}

// A real mouse click at the centre of a UI element (the bag re-renders while a furnace runs, so no element handle is kept).
async function clickSel(sel,{shift=false}={}){for(let i=0;i<20;i++){const b=await page.evaluate(sel=>{const n=document.querySelector(sel);if(!n)return null;n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return r.width?{x:r.x+r.width/2,y:r.y+r.height/2}:null;},sel);
  if(b){if(shift)await page.keyboard.down('Shift');await page.mouse.click(b.x,b.y);if(shift)await page.keyboard.up('Shift');return true;}await sleep(100);}throw Error('no element '+sel);}
// ---------- world clicks ----------
// Hold still until the camera settles, then move the mouse onto a visible face of b and confirm the renderer's cursor
// is on b (the camera follows the player, so a screen point goes stale while walking). Returns the point or null.
async function settleCamera(){await keys([]);
 // a hill behind the player pulls the camera in close (thick-obstacle rule); turn the view like a player would
 for(let k=0;k<4;k++){const vd=await page.evaluate(()=>Bloom.app.renderer.viewDistance);if(vd>=5)break;await focusWorld();await page.keyboard.press('KeyQ');await page.keyboard.press('KeyQ');await sleep(700);}
 let last=null;for(let i=0;i<30;i++){const p=await page.evaluate(()=>{const r=Bloom.app.renderer;return r.eye?[r.eye.x,r.eye.y,r.eye.z]:null;});if(last&&p&&Math.hypot(p[0]-last[0],p[1]-last[1],p[2]-last[2])<.004)return;last=p;await sleep(40);}}
async function aim(b,n=null){await settleCamera();for(let i=0;i<6;i++){const at=await page.evaluate(({b,n})=>n?window.__faceScreen(b,n):window.__PT.face(b),{b,n});if(!at){if(process.env.PT_VERBOSE)log('aim none',JSON.stringify(b),JSON.stringify(await page.evaluate(b=>{const r=Bloom.app.renderer,out=[];for(const n of [{x:0,y:0,z:1},{x:0,y:1,z:0},{x:0,y:-1,z:0}]){const q=r.projected({x:b.x+.5+n.x*.51,y:b.y+.5+n.y*.51,z:b.z+.5+n.z*.51});if(!q){out.push(null);continue;}const k=r.pickAt(q.x,q.y);out.push({n,q:[Math.round(q.x),Math.round(q.y)],blk:k?.block&&[k.block.x,k.block.y,k.block.z,k.block.normal],ent:k?.entity,cut:r.cutCell(b.x,b.y,b.z),fade:r.fadedCell(b.x,b.y,b.z),cutY:r.cut.y,rad:r.cut.frame?.radius});}return out;},b)));return null;}await page.mouse.move(at.x,at.y);
  const ok=await page.waitForFunction(({b,n})=>{const c=Bloom.app.renderer.cursor?.block;return c&&c.x===b.x&&c.y===b.y&&c.z===b.z&&(!n||c.normal.x===n.x&&c.normal.y===n.y&&c.normal.z===n.z);},{b,n},{timeout:400,polling:'raf'}).then(()=>true,()=>false);if(ok)return at;if(process.env.PT_VERBOSE)log('aim miss',JSON.stringify({b,at,cur:await page.evaluate(()=>Bloom.app.renderer.cursor?.block)}));await sleep(60);}return null;}
// Hold-to-mine (D-123): walk until the block is within hand reach of the head (CFG.reach), put the cursor on one of its
// faces, hold the left button until it breaks (the sim mines the first block on the head→cursor ray), then release.
// A different block in the way (the ray hits it first) is not dug by accident: release and try another camera turn,
// unless it is one of `accept` (gathering leaves: the leaf in front is as good as the one behind it, like a player
// would take it). Returns true once the block (or the accepted one in front of it) is gone.
const inReach=b=>page.evaluate(b=>{const a=Bloom.app.actor(),e={x:a.pos.x,y:a.pos.y+Bloom.CFG.player.eyeHeight,z:a.pos.z};return Math.hypot(b.x+.5-e.x,b.y+.5-e.y,b.z+.5-e.z)<=Bloom.CFG.reach-.6;},b);
async function mine(b,{tool=null,wait=20000,approach={dig:0,caveCost:0},accept=null}={}){
 if(tool)await select(tool);else{const id=await blockAt(b);const def=await page.evaluate(id=>Bloom.BLOCKS.find(x=>x.id===id),id);
  if(def.tool==='axe'&&await select(it=>it.tool==='axe'));else await select(it=>it.tool==='pick');}
 for(let attempt=0;attempt<4;attempt++){if(await blockAt(b)==='air')return true;
  if(!(await inReach(b))){if(!approach)return false;try{await goTo({x:b.x+.5,z:b.z+.5,r:2.2,y:b.y,dy:2},{dig:approach.dig||0,tries:2,caveCost:approach.caveCost||0});}catch(e){if(/died/.test(e.message))throw e;log('mine approach',JSON.stringify(b),e.message.slice(0,120));return false;}if(!(await inReach(b)))return false;}
  const at=await aim(b);if(!at){await turn(2);continue;}let key=b.x+','+b.y+','+b.z;await page.mouse.down();
  const started=await page.waitForFunction(k=>{const a=Bloom.app.actor(),[x,y,z]=k.split(',').map(Number);return a.mine.target===k||Bloom.app.sim.terrain.get(x,y,z)===0||a.mine.target&&a.mine.target!==k;},key,{timeout:2500,polling:'raf'}).then(()=>true,()=>false);
  const other=await page.evaluate(k=>{const t=Bloom.app.actor().mine.target;return t&&t!==k?t:null;},key);
  const otherId=other&&await page.evaluate(k=>{const [x,y,z]=k.split(',').map(Number);return Bloom.BLOCKS[Bloom.app.sim.terrain.get(x,y,z)]?.id;},other);
  if(process.env.PT_VERBOSE)log('mine try',JSON.stringify({b,at,started,other}));
  const swap=!!other&&!!accept&&accept.includes(otherId);if(swap)key=other;
  if(!started){await page.mouse.up();await turn(2);continue;}
  // something else is on the head ray (a trunk in front of a leaf): stand on the far side of the target and try again
  if(other&&!swap){await page.mouse.up();const [ox,,oz]=other.split(',').map(Number);let vx=b.x-ox,vz=b.z-oz;if(!vx&&!vz)vx=attempt%2?1:-1;const L=Math.hypot(vx,vz);
   if(approach)await goTo({x:b.x+.5+vx/L*1.6,z:b.z+.5+vz/L*1.6,r:.9},{tries:1,dig:0}).catch(()=>{});else await turn(2);continue;}
  const ok=await page.waitForFunction(k=>{const a=Bloom.app.actor(),[x,y,z]=k.split(',').map(Number);return Bloom.app.sim.terrain.get(x,y,z)===0||a.mine.target!==k;},key,{timeout:wait/scale+3000,polling:'raf'}).then(()=>true,()=>false);
  await page.mouse.up();if(swap&&await page.evaluate(k=>{const [x,y,z]=k.split(',').map(Number);return Bloom.app.sim.terrain.get(x,y,z)===0;},key))return true;if(await blockAt(b)==='air')return true;if(!ok)break;}
 return (await blockAt(b))==='air';}
// Right click a block face (place the held block on it, or use a station/gate).
async function rightClick(b,n){for(let i=0;i<4;i++){const at=await aim(b,n);if(at){await page.mouse.click(at.x,at.y,{button:'right'});return true;}await turn(2);}return false;}
async function placeOn(ground,blockId){await selectId(blockId);const cell={x:ground.x,y:ground.y+1,z:ground.z};if(!(await rightClick(ground,{x:0,y:1,z:0})))throw Error('cannot aim at '+JSON.stringify(ground));
 await page.waitForFunction(({c,id})=>Bloom.BLOCKS[Bloom.app.sim.terrain.get(c.x,c.y,c.z)].id===id,{c:cell,id:blockId},{timeout:3000});return cell;}
// Wait until nearby drops are picked up (walking onto those still out of reach).
async function collect(radius=7){for(let k=0;k<6;k++){await sleep(450/scale+100);const d=await page.evaluate(r=>{const a=Bloom.app.actor();return Object.values(Bloom.app.sim.drops).filter(d=>Math.hypot(d.pos.x-a.pos.x,d.pos.z-a.pos.z)<r&&Math.abs(d.pos.y-a.pos.y)<4).sort((x,y)=>Math.hypot(x.pos.x-a.pos.x,x.pos.z-a.pos.z)-Math.hypot(y.pos.x-a.pos.x,y.pos.z-a.pos.z)).map(d=>({x:d.pos.x,y:d.pos.y,z:d.pos.z}))[0]||null;},radius);
  if(!d)return;await goTo({x:d.x,z:d.z,r:.9,y:Math.floor(d.y),dy:2},{dig:0,tries:1}).catch(()=>{});}}

// Q turns the camera 45° (yaw step +1). A block hidden by the line-of-sight fade (between camera and player) is picked
// after turning the camera, like a player would.
async function turn(steps){await focusWorld();for(let i=0;i<steps;i++)await page.keyboard.press('KeyQ');await sleep(330);}
// WASD keys toward world direction (dx,dz) for the current camera yaw: W = forward (-sin, -cos), D = right (cos, -sin).
async function steer(dx,dz,dead=.1){const yaw=await page.evaluate(()=>Bloom.app.renderer.camera.yaw),f=dx*-Math.sin(yaw)+dz*-Math.cos(yaw),r=dx*Math.cos(yaw)+dz*-Math.sin(yaw),k=[];
 if(f>dead)k.push('KeyW');if(f<-dead)k.push('KeyS');if(r>dead)k.push('KeyD');if(r<-dead)k.push('KeyA');await keys(k);}
// ---------- walking ----------
// Plan a route (helpers) and follow it with WASD, Space when stuck. Dig steps
// (route through solid cells) are left-clicked first. Movement keys follow the current camera yaw (steer).
async function follow(path){
 // Merge straight level runs into one segment (steer at the run's end), so walking does not stop at every cell.
 const segs=[];for(let i=0;i<path.length;i++){const w=path[i],prev=segs[segs.length-1],p0=i?path[i-1]:null;
  if(prev&&!w.dig.length&&p0&&w.y===p0.y&&prev.y===w.y&&prev.dir&&prev.dir[0]===w.x-p0.x&&prev.dir[1]===w.z-p0.z){prev.x=w.x;prev.z=w.z;continue;}
  segs.push({...w,dir:p0?[w.x-p0.x,w.z-p0.z]:null});}
 for(let i=0;i<segs.length;i++){const w=segs[i],last=i===segs.length-1;
  if(w.dig.length){await keys([]);for(const c of w.dig){if(await blockAt(c)==='air')continue;if(!(await mine(c))){AVOID.push(c);throw Error('dig failed '+JSON.stringify(c)+' '+(await blockAt(c)));}}await focusWorld();}
  let best=1e9,lastProg=Date.now(),stuck=0;const loose=!last&&!segs[i+1]?.dig.length&&segs[i+1]?.y===w.y?.4:.26;
  for(;;){const s=await st();if(s.dead)throw Error('died');if(s.modal){await keys([]);await dismissModal();continue;}const dx=w.x+.5-s.pos.x,dz=w.z+.5-s.pos.z,d=Math.hypot(dx,dz);
   if(Math.abs(dx)<loose&&Math.abs(dz)<loose){if(Math.abs(s.pos.y-w.y)<.7||w.wet&&Math.abs(s.pos.y-w.y)<1.6)break;/* in water the body floats at the surface */if(s.grounded&&(s.pos.y<w.y-.7||Math.abs(dx)<.16&&Math.abs(dz)<.16)){await keys([]);throw Error('off route at '+JSON.stringify(s.pos)+' → '+JSON.stringify(w));}}
   await steer(dx,dz);
   if(d<best-.04){best=d;lastProg=Date.now();}else if(Date.now()-lastProg>500){lastProg=Date.now();
    // a creature in the way (bodies collide): let it wander off instead of counting a stuck step
    const blocker=await page.evaluate(()=>{const a=Bloom.app.actor();return Object.values(Bloom.app.sim.actors).some(x=>x!==a&&!x.dead&&Math.hypot(x.pos.x-a.pos.x,x.pos.z-a.pos.z)<1.6*(x.scale||1)+.4);});
    if(blocker&&stuck<12){await keys([]);await sleep(900);stuck+=.34;continue;}stuck++;
    // unstick: step back a little, then jump forward
    // a one-block step up (a dug stair in a 1-wide shaft has no room to back off or sidestep): land, centre on the
    // current cell, then jump toward the next one like climbBack does
    const f=await feet();if(w.y>f.y&&stuck<6){await keys([]);await page.waitForFunction(()=>Bloom.app.actor().grounded,null,{timeout:2000}).catch(()=>{});await stepTo(await feet());await steer(dx,dz,.06);await page.keyboard.press('Space');await sleep(300);}
    else if(stuck%2){await steer(-dz,dx,.05);await sleep(350);}else{await steer(-dx,-dz,.05);await sleep(140);await steer(dx,dz);await page.keyboard.press('Space');await sleep(200);}
    if(!s.grounded&&stuck>=2&&process.env.PT_VERBOSE)log('HANG',JSON.stringify(await page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain,b=Bloom.app.sim.physics.world.getRigidBody(a.body),x=Math.floor(a.pos.x),y=Math.floor(a.pos.y),z=Math.floor(a.pos.z),c=[];for(let dy=-1;dy<=2;dy++)for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)c.push(Bloom.BLOCKS[t.get(x+dx,y+dy,z+dz)].id[0]);return{pos:a.pos,vel:b.linvel(),cells:c.join('')};})));
    if(stuck>7){await keys([]);AVOID.push({x:w.x,y:w.y,z:w.z});/* plan around this cell next time */if(process.env.PT_VERBOSE)await page.screenshot({path:SHOTS+'/stuck-'+Date.now()+'.png'});throw Error('stuck at '+JSON.stringify(s.pos)+' → '+JSON.stringify(w));}}
   await sleep(15);}
 }
 await keys([]);}
const AVOID=[];
async function goTo(goal,{dig=0,tries=8,max=40000,caveCost=0}={}){let lastErr=null,spare=12;const left=async()=>{const s=await st();return Math.hypot(goal.x-s.pos.x,goal.z-s.pos.z);};
 for(let t=0;t<tries;t++){const before=await left(),from=await feet(),tier=await page.evaluate(()=>{const s=Bloom.app.actor().inventory.slots;let t=0;for(const x of s){const it=x&&Bloom.ITEMS[x.id];if(it?.tool==='pick')t=Math.max(t,it.tier);}return t;});
  // cells the walk got stuck on are planned around, except near the goal (it may be the only way in)
  const avoid=AVOID.slice(-200).filter(c=>Math.hypot(c.x+.5-goal.x,c.z+.5-goal.z)>Math.max(goal.r||0,1)+1),route=o=>page.evaluate(({from,goal,o})=>window.__PT.route(from,goal,o),{from,goal,o});
  const path=await route({dig,tier,max,caveCost,avoid})||avoid.length&&await route({dig,tier,max,caveCost,avoid:[]});
  if(!path){lastErr=Error('no route '+JSON.stringify({from,goal,dig}));if(dig)break;dig=4;continue;}
  try{await follow(path);return true;}catch(e){lastErr=e;log('replan:',e.message);if(/died/.test(e.message))throw e;if(spare>0&&before-await left()>3){spare--;t--;}/* a long walk that got 3 m closer before it stuck: not a failed try */if(t>=1&&/stuck|off route/.test(e.message))dig=4;/* a spot the walk cannot pass: dig through it next time */
   // wiggle free: a short hop in a direction that changes every retry
   const dirs=[[1,0],[0,1],[-1,0],[0,-1]],[wx,wz]=dirs[(t%4+4)%4];await steer(wx,wz,.05);await page.keyboard.press('Space');await sleep(250);await keys([]);await sleep(200);}}
 throw lastErr;}

// ---------- crafting ----------
async function station(kind){const s=await page.evaluate(k=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain,id=Bloom.BID[k];for(let r=1;r<=4;r++)for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)for(let dy=-2;dy<=2;dy++){const x=Math.floor(a.pos.x)+dx,y=Math.floor(a.pos.y)+dy,z=Math.floor(a.pos.z)+dz;if(t.get(x,y,z)===id&&Math.hypot(x+.5-a.pos.x,z+.5-a.pos.z)<4)return{x,y,z};}return null;},kind);return s;}
// A flat spot 2 cells away where a block can be placed (ground top face visible, both cells above empty).
async function spot(){await settleCamera();for(let k=0;k<3;k++){const s=await page.evaluate(()=>{const P=window.__PT,f=P.feet(),c=[];for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){const d=Math.hypot(dx,dz);if(d<1.4||d>3.6)continue;for(const dy of [0,-1,1,-2])c.push({dx,dz,dy,d});}c.sort((a,b)=>a.d-b.d||Math.abs(a.dy)-Math.abs(b.dy));
  for(const {dx,dz,dy}of c){const x=f.x+dx,y=f.y+dy,z=f.z+dz;if(P.stand(x,y,z)&&!P.solid(x,y+2,z)&&window.__faceScreen({x,y:y-1,z},{x:0,y:1,z:0}))return{x,y:y-1,z};}return null;});if(s)return s;await turn(2);}return null;}
async function placeStation(kind){let s=await station(kind);if(s)return s;if(!(await count(kind))){if(kind!=='workbench'||!(await craft('workbench',1)))throw Error('no '+kind+' to place');}for(let i=0;i<5;i++){const g=await spot();if(!g){await turn(2);continue;}try{return await placeOn(g,kind);}catch(e){log('place retry',kind,e.message.split(String.fromCharCode(10))[0],JSON.stringify(await page.evaluate(g=>{const a=Bloom.app.actor(),r=Bloom.app.renderer,q=window.__faceScreen(g,{x:0,y:1,z:0}),k=q&&r.pickAt(q.x,q.y);return{g,feet:window.__PT.feet(),sel:a.inventory.slots[a.inventory.selected]?.id,above:Bloom.BLOCKS[Bloom.app.sim.terrain.get(g.x,g.y+1,g.z)]?.id,pick:k&&{b:k.block&&[k.block.x,k.block.y,k.block.z],e:k.entity?.id||k.entity,self:k.self},combat:a.combat.state,modal:Bloom.app.modal()};},g)));await turn(1);}}throw Error('no spot for '+kind);}
async function openStation(b){await closeMenus();for(let i=0;i<3;i++){const n=await page.evaluate(b=>{const P=window.__PT;for(const n of [{x:0,y:1,z:0},{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}])if(!P.solid(b.x+n.x,b.y+n.y,b.z+n.z)&&window.__faceScreen(b,n))return n;return null;},b);
  if(n&&await rightClick(b,n)&&await page.waitForFunction(()=>!document.querySelector('#inventory').hidden,null,{timeout:2500}).then(()=>true,()=>false))return;await sleep(200);}throw Error('cannot open station '+JSON.stringify(b));}
async function craft(id,times=1){const r=await page.evaluate(id=>Bloom.RECIPES.find(r=>r.id===id),id);let ws=null;
 let placed=false;if(r.station===3){placed=!(await station('workbench'));ws=await placeStation('workbench');await openStation(ws);}else await openBag();
 // times='all': the recipe book fills the grid with every complete craft and a shift-click takes them all. A number:
 // plain clicks take one craft each onto the cursor; closing the bag returns the cursor and the grid leftovers.
 let made=0;const all=times==='all',n0=all?1:times;
 for(let n=0;n<n0;n++){if(await page.locator('#craft-result').isDisabled()){if(!(await page.evaluate(id=>!!document.querySelector('#recipe-list [data-recipe="'+id+'"]'),id)))break;await clickSel('#recipe-list [data-recipe="'+id+'"]');
   const ready=await page.waitForFunction(()=>!document.querySelector('#craft-result').disabled,null,{timeout:2000}).then(()=>true,()=>false);if(!ready)break;}
  const before=await page.evaluate(()=>JSON.stringify(Bloom.app.actor().inventory.grid));await clickSel('#craft-result',{shift:all});
  if(!(await page.waitForFunction(b=>JSON.stringify(Bloom.app.actor().inventory.grid)!==b,before,{timeout:2000}).then(()=>true,()=>false)))break;made++;}
 await closeMenus();if(placed&&ws){await mine(ws);await collect(4);}// carry the workbench along
 return made;}
async function pickUpStation(kind){const s=await station(kind);if(s)await mine(s);await collect(4);}

// ---------- furnace ----------
// Put `n` of item in the input and fuel in the fuel slot by clicking bag slots then furnace slots; wait; take the output.
async function slotOf(id){return page.evaluate(id=>Bloom.app.actor().inventory.slots.findIndex(s=>s?.id===id),id);}
async function clickBag(index){const sel=index<9?'#inventory-hotbar [data-index="'+index+'"]':'#inventory-grid [data-index="'+index+'"]';await clickSel(sel);await sleep(120);}
async function smelt(input,fuel,want){const f=await placeStation('furnace');await openStation(f);
 const put=async(id,area)=>{const i=await slotOf(id);if(i<0)return false;await clickBag(i);await clickSel('#furnace-'+area);await sleep(150);if(await page.evaluate(()=>!!Bloom.app.actor().inventory.cursor)){await clickBag(await page.evaluate(()=>Bloom.app.actor().inventory.slots.findIndex(s=>!s)));}return true;};
 await put(input,'input');await put(fuel,'fuel');
 const out=SMELT_OUT[input];await closeMenus();await timeScale(8);
 const t0=await tick(),r0=Date.now();try{await until(({f,want})=>{const x=Bloom.app.sim.furnaces[f.x+','+f.y+','+f.z];return x&&(x.slots[2]?.count||0)>=want||!x.slots[0];},{f,want},want*6000*4+10000,'smelting');}finally{log('smelt ticks/s',Math.round((await tick()-t0)/((Date.now()-r0)/1000)),JSON.stringify(await page.evaluate(f=>Bloom.app.sim.furnaces[f.x+','+f.y+','+f.z],f)));}
 await page.waitForFunction(f=>{const x=Bloom.app.sim.furnaces[f.x+','+f.y+','+f.z];return !x.slots[0]||x.progress===0;},f,{timeout:8000}).catch(()=>{});await timeScale(1);await openStation(f);
 await clickSel('#furnace-output');await sleep(150);const empty=await page.evaluate(()=>Bloom.app.actor().inventory.slots.findIndex(s=>!s));await clickBag(empty);
 // leftovers back to the bag
 for(const area of ['input','fuel']){if(await page.evaluate(a=>{const i=Bloom.app.actor().inventory;return !!Bloom.app.sim.furnaces[i.station]?.slots[a==='input'?0:1];},area)){await clickSel('#furnace-'+area);await sleep(120);await clickBag(await page.evaluate(()=>Bloom.app.actor().inventory.slots.findIndex(s=>!s)));}}
 await closeMenus();await pickUpStation('furnace');return count(out);}
const SMELT_OUT={rawIron:'iron',cobble:'stone',rawGold:'gold',log:'charcoal'};

// ---------- gathering ----------
const SKIP=new Set();// blocks a click could not mine (no visible face from any camera turn, or out of reach)
// Mine `n` blocks of the given ids, nearest first, walking (and digging if allowed) to each.
async function gather(ids,n,{radius=30,dig=0,item=null,near=null,ry,caveCost=dig?6:0,away=null}={}){let got=0,fails=0;const itemId=item;const before=itemId?await count(itemId):0;
 while((itemId?(await count(itemId))-before:got)<n&&fails<12){const at=near||(await st()).pos;const list=await page.evaluate(({ids,at,radius,ry})=>window.__PT.find(ids,at,radius,{ry}),{ids,at,radius,ry});
  const fresh=list.filter(b=>!SKIP.has(b.x+','+b.y+','+b.z)&&!(away&&[].concat(away).some(c=>Math.hypot(b.x+.5-c.x,b.z+.5-c.z)<c.r)));/* away: keep out of circles (bosses' wake radius) */if(!fresh.length)throw Error('none of '+ids+' near '+JSON.stringify(at));list.length=0;list.push(...fresh);
  // Prefer a block with a face on screen now; mine() walks into hand reach first (WASD) and then holds the button.
  await settleCamera();const vis=await page.evaluate(list=>list.map(b=>!!window.__PT.face(b)),list.slice(0,12));const order=list.slice(0,12).map((b,i)=>({b,v:vis[i]})).sort((x,y)=>(y.v-x.v)||(x.b.d-y.b.d));
  let done=false;for(const {b,v}of order.slice(0,6)){try{
    if(!v&&!(await inReach(b))){await goTo({x:b.x+.5,z:b.z+.5,r:2.2,y:b.y,dy:2},{dig,tries:2,caveCost});}
    if(await mine(b,{approach:{dig,caveCost},accept:ids})){got++;done=true;await collect(4);break;}SKIP.add(b.x+','+b.y+','+b.z);log('mine failed',JSON.stringify(b),await blockAt(b),JSON.stringify(await st()));}catch(e){if(/died/.test(e.message))throw e;SKIP.add(b.x+','+b.y+','+b.z);log('gather skip',JSON.stringify(b),e.message);}}
  if(!done)fails++;}
 return itemId?(await count(itemId))-before:got;}

// ---------- combat ----------
async function fight(id,{maxS=120}={}){await select(it=>!!it.weapon);const end=Date.now()+maxS*1000;
 while(Date.now()<end){const s=await page.evaluate(id=>{const b=Bloom.app.sim.actors[id],a=Bloom.app.actor();return b&&!b.dead?{pos:{...b.pos},hp:b.hp,me:{...a.pos},myHp:a.hp,dead:a.dead,boss:b.boss}:null;},id);if(!s)return true;if(s.dead)throw Error('died fighting');
  const d=Math.hypot(s.pos.x-s.me.x,s.pos.z-s.me.z);
  if(d>6){await goTo({x:s.pos.x,z:s.pos.z,r:2.5},{tries:1}).catch(()=>{});await select(it=>!!it.weapon);continue;}
  if(d>3){await steer(s.pos.x-s.me.x,s.pos.z-s.me.z,.6);await sleep(120);continue;}
  if(s.myHp<35&&!s.boss)return false;// a wild fight going badly: back off
  // a click on the creature (or, with a sword in hand, anywhere toward it: the basic attack swings at the cursor)
  await keys([]);const at=await page.evaluate(id=>window.__entityScreen(id)||(()=>{const a=Bloom.app.sim.actors[id];return a?window.__pointScreen({x:a.pos.x,y:a.pos.y+.4*(a.scale||1),z:a.pos.z}):null;})(),id);if(process.env.PT_VERBOSE)log('fight',JSON.stringify({hp:s.hp,me:s.myHp,d:+d.toFixed(2),at:at&&await page.evaluate(p=>{const n=document.elementFromPoint(p.x,p.y);return n&&(n.id||n.className||n.tagName)+'@'+Math.round(p.x)+','+Math.round(p.y);},at),c:await page.evaluate(()=>{const a=Bloom.app.actor(),C=Bloom.app.controls;return[a.combat.state,a.inventory.slots[a.inventory.selected]?.id,C.buttons.left,C.actionQueue.left.length,Bloom.app.renderer.cursor?.entity,a.companionSlot,Bloom.app.modal()].join('|');})}));if(at){await page.mouse.click(at.x,at.y);}await sleep(180);}
 return false;}

// ---------- mining by staircase ----------
// The camera looks along -z at yaw step 0, so a staircase dug toward -z always shows its next cells' faces (the cutaway
// hides the rock over the head). Each step digs the 4 cells of the next column (head+1, head, feet, floor-to-be) and walks
// one cell forward and down; a hole under the new floor is filled with a placed block. Ores whose faces come into view
// within reach are mined on the way (hold-to-mine). Returns the cell reached.
async function resetYaw(){const step=await page.evaluate(()=>Bloom.app.renderer.camera.yawStep);if(step){await focusWorld();for(let i=0;i<(8-step)%8;i++)await page.keyboard.press('KeyQ');await sleep(330);}}
const pickTier=()=>page.evaluate(()=>{const s=Bloom.app.actor().inventory.slots;let t=0;for(const x of s){const it=x&&Bloom.ITEMS[x.id];if(it?.tool==='pick')t=Math.max(t,it.tier);}return t;});
async function digColumn(cells){const tier=await pickTier();for(const c of cells){if(await blockAt(c)==='air'||await blockAt(c)==='water')continue;if(!(await page.evaluate(({c,tier})=>window.__PT.diggable(c.x,c.y,c.z,tier),{c,tier}))){log('dig: pick tier',tier,'cannot break',JSON.stringify(c),await blockAt(c));return false;}/* an ore the pick cannot break */if(!(await mine(c))){const y0=await page.evaluate(()=>Bloom.app.renderer.camera.yawStep),back=async()=>{const k=await page.evaluate(()=>Bloom.app.renderer.camera.yawStep);if(k!==y0)await turn(((y0-k)%8+8)%8);};/* other camera angles, then the one the dig started with */await resetYaw();const ok=await mine(c)||(await stepTo(await feet()),await turn(2),await mine(c))||(await turn(4),await mine(c));await back();if(!ok){log('dig failed',JSON.stringify(c),await blockAt(c),JSON.stringify(await feet()));return false;}}}return true;}
async function stepTo(c,tol=.22){const end=Date.now()+3000;await focusWorld();while(Date.now()<end){const s=await st();const dx=c.x+.5-s.pos.x,dz=c.z+.5-s.pos.z;if(Math.abs(dx)<tol&&Math.abs(dz)<tol&&Math.abs(s.pos.y-c.y)<.3&&s.grounded)break;
  // close in with short taps: the read-back latency is longer than crossing a 1-wide shaft (0.3 m of play) at walking speed
  if(Math.hypot(dx,dz)<.45){await steer(dx,dz,Math.min(.06,tol*.6));await sleep(10);await keys([]);await sleep(90);}else{await steer(dx,dz,.06);await sleep(20);}}await keys([]);await sleep(80);}
// To the cell centre within 0.08 m with one-tick key taps (a held key crosses the 0.3 m of play in a 1-wide shaft faster than the read-back).
async function centre(c){await focusWorld();const was=scale;await timeScale(.2);/* slowed (test hook) so a key tap is one tick even when the page catches up several ticks per frame */try{for(let i=0;i<24;i++){const s=await st(),dx=c.x+.5-s.pos.x,dz=c.z+.5-s.pos.z;if(Math.abs(dx)<.08&&Math.abs(dz)<.08)break;const t0=await tick();
  await steer(Math.abs(dx)>=.08?dx:0,Math.abs(dz)>=.08?dz:0,.01);await page.waitForFunction(t=>Bloom.app.sim.tick>t,t0,{polling:'raf'});await keys([]);
  await page.waitForFunction(()=>{const v=Bloom.app.actor().velocity;return Math.hypot(v.x,v.z)<.05;},null,{timeout:2500,polling:'raf'}).catch(()=>{});}}finally{await keys([]);await timeScale(was);}}
async function fillFloor(c){if(await page.evaluate(c=>window.__PT.solid(c.x,c.y-1,c.z),c))return true;
 // a cave void under the step is bridged with a block when one can be placed (the way back stays a walkable stair);
 // otherwise a short drop (ground within 3 below) is fine: the stair continues lower and the way back is pillarUp
 const drop=await page.evaluate(c=>[2,3].some(k=>window.__PT.solid(c.x,c.y-k,c.z)),c)?'drop':false;const filler=await hotbarIndex(it=>['cobble','dirt','stone'].includes(it.id));if(filler<0)return drop;
 await select(it=>['cobble','dirt','stone'].includes(it.id));const f={x:c.x,y:c.y-1,z:c.z};
 // place into the floor cell from any solid neighbour face that points at it (below, or a side wall of a cave void)
 for(const n of [{x:0,y:-1,z:0},{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}]){const nb={x:f.x+n.x,y:f.y+n.y,z:f.z+n.z};if(!(await page.evaluate(b=>window.__PT.solid(b.x,b.y,b.z),nb)))continue;
  if(await rightClick(nb,{x:-n.x,y:-n.y,z:-n.z})&&await page.waitForFunction(c=>window.__PT.solid(c.x,c.y-1,c.z),c,{timeout:1500}).then(()=>true,()=>false))return true;}
 return drop;}
async function mineVisible(ids,radius=5,cap=8,enough=null){let n=0;const s=await st();const list=await page.evaluate(({ids,p,r})=>window.__PT.find(ids,p,r,{limit:12}),{ids,p:{x:s.pos.x,y:s.pos.y+1,z:s.pos.z},r:radius});
 for(const b of list){if(n>=cap||enough&&await enough())break;if(SKIP.has(b.x+','+b.y+','+b.z))continue;if(TRAIL.some(c=>c.x===b.x&&c.z===b.z&&c.y-1===b.y))continue;// never the floor of the way back
 const vis=await page.evaluate(b=>!!window.__PT.face(b),b);if(!vis)continue;if(await mine(b)){n++;await collect(3);}else SKIP.add(b.x+','+b.y+','+b.z);}return n;}
const TRAIL=[];
// Dig direction → camera yaw step whose forward (screen up) is that direction: 0 → -z, 2 → -x, 4 → +z, 6 → +x.
const YAW_FOR={'0,-1':0,'-1,0':2,'0,1':4,'1,0':6};
async function faceDir(dx,dz){const want=YAW_FOR[dx+','+dz],step=await page.evaluate(()=>Bloom.app.renderer.camera.yawStep);if(step!==want){await focusWorld();for(let i=0;i<((want-step)%8+8)%8;i++)await page.keyboard.press('KeyQ');await sleep(330);}}
async function staircase(toY,{ores=[],dx=0,dz=-1,maxSteps=60}={}){await faceDir(dx,dz);let mined=0;if(!TRAIL.length)TRAIL.push(await feet());
 for(let i=0;i<maxSteps;i++){const f=await feet();if(f.y<=toY)break;const n={x:f.x+dx,y:f.y-1,z:f.z+dz};
  if(!(await digColumn([{x:n.x,y:f.y+1,z:n.z},{x:n.x,y:f.y+2,z:n.z},{x:n.x,y:f.y,z:n.z},{x:n.x,y:f.y-1,z:n.z}])))throw Error('staircase dig failed at '+JSON.stringify(n));
  const fl=(await fillFloor(n))||'drop';/* a cave void under the step: drop into it (no fall damage); the way back is pillarUp */if(fl==='drop'){await stepTo({...n,y:n.y-5});await page.waitForFunction(()=>Bloom.app.actor().grounded,null,{timeout:4000}).catch(()=>{});await sleep(200);const f2=await feet();TRAIL.push(f2);}else{await stepTo(n);TRAIL.push(n);}if(ores.length){mined+=await mineVisible(ores);await stepTo(n);}}
 return mined;}
async function tunnel(len,{ores=[],dx=0,dz=-1}={}){await faceDir(dx,dz);let mined=0;if(!TRAIL.length)TRAIL.push(await feet());for(let i=0;i<len;i++){const f=await feet(),n={x:f.x+dx,y:f.y,z:f.z+dz};
  if(!(await digColumn([{x:n.x,y:f.y+1,z:n.z},{x:n.x,y:f.y,z:n.z}])))throw Error('tunnel dig failed');if(!(await fillFloor(n))){await stepTo({...n,y:n.y-5});await page.waitForFunction(()=>Bloom.app.actor().grounded,null,{timeout:4000}).catch(()=>{});await sleep(200);}else await stepTo(n);TRAIL.push(await feet());if(ores.length){mined+=await mineVisible(ores);await stepTo(n);}}return mined;}
// Dig to a cell: a staircase down toward it (along its major axis), then level tunnels along x and z.
async function digTo(t,{ores=[]}={}){let f=await feet();const ax=Math.abs(t.x-f.x)>=Math.abs(t.z-f.z);
 const sd=ax?[Math.sign(t.x-f.x)||1,0]:[0,Math.sign(t.z-f.z)||1];if(f.y>t.y)await staircase(t.y,{ores,dx:sd[0],dz:sd[1]});
 f=await feet();if(t.x!==f.x)await tunnel(Math.abs(t.x-f.x),{ores,dx:Math.sign(t.x-f.x),dz:0});f=await feet();if(t.z!==f.z)await tunnel(Math.abs(t.z-f.z),{ores,dx:0,dz:Math.sign(t.z-f.z)});}
// The densest buried cluster of an ore within radius: the ore cell with the most same ores within 2 cells.
async function oreCluster(id,radius=30,minY=-40,maxY=40){return page.evaluate(({id,radius,minY,maxY})=>{const t=Bloom.app.sim.terrain,a=Bloom.app.actor(),want=Bloom.BID[id];let best=null;const cx=Math.floor(a.pos.x),cz=Math.floor(a.pos.z);
 for(let x=cx-radius;x<=cx+radius;x++)for(let z=cz-radius;z<=cz+radius;z++)for(let y=minY;y<=maxY;y++){if(t.get(x,y,z)!==want)continue;let n=0;for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)for(let k=-2;k<=2;k++)if(t.get(x+i,y+j,z+k)===want)n++;
  const d=Math.hypot(x-cx,z-cz,(y-a.pos.y)*1.5),score=n*10-d;if(!best||score>best.score)best={x,y,z,n,score};}return best;},{id,radius,minY,maxY});}
async function climbBack(){await resetYaw();
 for(let i=TRAIL.length-1;i>=0;i--){const c=TRAIL[i];for(let k=0;k<4;k++){await stepTo(c);const f=await feet();if(f.x===c.x&&f.y===c.y&&f.z===c.z)break;await page.keyboard.press('Space');await sleep(150);}}
 const f=await feet(),t=TRAIL[0];TRAIL.length=0;/* back on the top cell or the one beside it at the same height */if(f.y!==t.y||Math.abs(f.x-t.x)+Math.abs(f.z-t.z)>1)throw Error('climb back ended at '+JSON.stringify(f)+' not '+JSON.stringify(t));}
// Back to the surface straight up (the camera E2E's pillar-up): hold the button on the two cells over the head (the
// pickable first ceiling layer), jump, and right-click the player in mid-air to put a block under the feet; repeat until the sky
// is open above.
async function pillarUp({max=60}={}){TRAIL.length=0;await keys([]);
 const open=async()=>page.evaluate(()=>{const f=window.__PT.feet();return f.y>Bloom.app.sim.terrain.height(f.x,f.z);});// above the ground surface of this column
 for(let i=0;i<max;i++){if(await open())return true;const f=await feet();
  for(const y of [f.y+2,f.y+3]){const b={x:f.x,y,z:f.z};if(!(await page.evaluate(b=>window.__PT.solid(b.x,b.y,b.z),b)))continue;
   await select(it=>it.tool==='pick');let ok=false;for(let t=0;t<3&&!ok;t++){/* near the surface the cutaway closes and only the block's top face shows: the head ray toward it still hits this block first */const at=await aim(b,{x:0,y:-1,z:0})||await aim(b);if(!at){await turn(2);continue;}await page.mouse.down();
    ok=await page.waitForFunction(b=>Bloom.app.sim.terrain.get(b.x,b.y,b.z)===0,b,{timeout:15000/scale+4000,polling:'raf'}).then(()=>true,()=>false);await page.mouse.up();}
   if(!ok)throw Error('pillar: cannot dig '+JSON.stringify(b));}
  if(!(await select(it=>['cobble','dirt','stone','sand'].includes(it.id))))throw Error('pillar: no blocks');
  // the cell is read again once landed (the player may have dropped a cell since the loop started)
  // centred first: a body flush against a shaft wall snags on the voxel edges above and the jump does not rise (see the report)
  let step='land';try{/* a body flush on the edge of the cell beside rests there ungrounded (see the report): step to the middle and drop */if(!(await page.waitForFunction(()=>Bloom.app.actor().grounded,null,{timeout:2500}).then(()=>true,()=>false))){await centre(await feet());await page.waitForFunction(()=>Bloom.app.actor().grounded,null,{timeout:3000});}const g=await feet();if(g.y!==f.y)continue;step='centre';await centre(g);await focusWorld();
   const me=await page.evaluate(()=>window.__selfScreen());await page.mouse.move(me.x,me.y);step='jump';
   for(let k=0;k<3;k++){await page.keyboard.press('Space');if(!(await page.waitForFunction(y=>Bloom.app.actor().pos.y>y+1.01,g.y,{timeout:1500,polling:'raf'}).then(()=>true,()=>false))){await page.waitForFunction(()=>Bloom.app.actor().grounded,null,{timeout:1500}).catch(()=>{});continue;}
    const m=await page.evaluate(()=>window.__selfScreen());await page.mouse.click(m.x,m.y,{button:'right'});
    if(await page.waitForFunction(b=>window.__PT.solid(b.x,b.y,b.z),{x:g.x,y:g.y,z:g.z},{timeout:2000}).then(()=>true,()=>false))break;await page.waitForFunction(()=>Bloom.app.actor().grounded,null,{timeout:1500}).catch(()=>{});}
   step='place';await page.waitForFunction(b=>window.__PT.solid(b.x,b.y,b.z),{x:g.x,y:g.y,z:g.z},{timeout:1500});step='land2';await page.waitForFunction(()=>Bloom.app.actor().grounded,null,{timeout:3000});}
  catch(e){log('pillar retry',step,JSON.stringify(await page.evaluate(()=>{const a=Bloom.app.actor();const f=window.__PT.feet(),t=Bloom.app.sim.terrain,ring=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)ring.push([-1,0,1,2].map(k=>t.get(f.x+dx,f.y+k,f.z+dz)?1:0).join(''));return{pos:a.pos,grounded:a.grounded,feet:f,ring:ring.join(' ')};})));
   if((await feet()).y>f.y)continue;/* the block went in late: one cell up after all */
   // a spot where Space does not lift the player (see the report): pillar from a neighbouring open cell instead
   const n=await page.evaluate(()=>{const P=window.__PT,f=P.feet(),o=[[1,0],[-1,0],[0,1],[0,-1]][Math.floor(Math.random()*4)];for(let k=0;k<4;k++){const [dx,dz]=[[1,0],[0,1],[-1,0],[0,-1]][k];const c={x:f.x+dx,y:f.y,z:f.z+dz};if(!P.solid(c.x,c.y,c.z)&&!P.solid(c.x,c.y+1,c.z)&&P.solid(c.x,c.y-1,c.z))return c;}return null;});
   if(n){await stepTo(n);await keys([]);}
   else{// jammed in the 1×1 shaft against a wall (see the report): dig the wall cells it leans on, then centre again
    const s=await st(),g=await feet(),ox=s.pos.x-(g.x+.5),oz=s.pos.z-(g.z+.5),side=Math.abs(ox)>=Math.abs(oz)?{x:g.x+Math.sign(ox),z:g.z}:{x:g.x,z:g.z+Math.sign(oz)};
    log('pillar jammed',JSON.stringify({pos:s.pos,side}));
    // a fresh column two cells into untouched rock (the tunnel fills the floor), away from the ledges and holes here
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){try{TRAIL.length=0;await tunnel(2,{dx,dz});TRAIL.length=0;break;}catch(e){log('pillar move',dx,dz,e.message.slice(0,80));}}}}}
 return open();}
// ---------- survival, gear, ranch ----------
// Eat fruit (F with the fruit in hand) until hp >= target or no fruit is left. There is no natural regeneration.
async function eat(target=90){while((await st()).hp<target&&await count('food')>0){await selectId('food');const hp=(await st()).hp;await focusWorld();await page.keyboard.press('KeyF');
  if(!(await page.waitForFunction(hp=>Bloom.app.actor().hp>hp,hp,{timeout:2000}).then(()=>true,()=>false)))break;}return (await st()).hp;}
// The HUD equipment line as the player sees it.
const gearHUD=()=>page.evaluate(()=>{const n=document.querySelector('#gear-status');return{hidden:n.hidden,text:n.textContent,below:[...n.querySelectorAll('span')].filter(s=>/below/.test(s.className)).length,body:document.body.className,realm:Bloom.Gear.status(Bloom.app.actor(),Bloom.app.sim.terrain).realm,hazard:Bloom.Gear.status(Bloom.app.actor(),Bloom.app.sim.terrain).hazard};});
// Wear every armor piece of the material: click the piece in the bag (cursor), click its armor slot.
async function wear(material){await openBag();for(const part of ['helmet','chest','boots']){const i=await slotOf(material+'_'+part);if(i<0)continue;await clickBag(i);
  await clickSel('#armor-slots [data-area="armor"][data-index="'+part+'"]');await sleep(150);if(await page.evaluate(()=>!!Bloom.app.actor().inventory.cursor))await clickBag(await page.evaluate(()=>Bloom.app.actor().inventory.slots.findIndex(s=>!s)));}
 await closeMenus();return page.evaluate(()=>Object.fromEntries(Object.entries(Bloom.app.actor().inventory.armor).map(([k,v])=>[k,v?.id||null])));}
// Throw one held item (G) toward a world point under the mouse.
async function throwAt(item,pt){await selectId(item);await settleCamera();const s=await page.evaluate(p=>window.__pointScreen(p),pt);await page.mouse.move(s.x,s.y);await sleep(120);await focusWorld();await page.keyboard.press('KeyG');await sleep(200);}
async function nearestBoss(){return page.evaluate(()=>{const a=Bloom.app.actor();return Object.values(Bloom.app.sim.actors).filter(x=>x.boss&&!x.dead).map(x=>({id:x.id,species:x.speciesId,hp:x.hp,maxHp:x.maxHp,pos:{...x.pos},d:Math.hypot(x.pos.x-a.pos.x,x.pos.z-a.pos.z)})).sort((x,y)=>x.d-y.d)[0]||null;});}
const units=()=>page.evaluate(()=>Bloom.app.sim.companions.owned(Bloom.app.localId).map(u=>({id:u.id,kind:u.kind,stage:u.stage,grade:u.grade,fed:u.fed,cell:u.cell,pos:{...u.pos},location:u.location})));

// ---------- the playthrough ----------
try{
 server=http.createServer(serveStatic);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({...(process.env.BROWSER_CHANNEL||process.platform==='win32'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{}),headless:true});
 page=await browser.newPage({viewport:{width:1366,height:768}});page.setDefaultTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);log('PAGEERROR',e.message);});
 await page.addInitScript(CURSOR_HELPERS);await page.addInitScript(PLAYTHROUGH_HELPERS);
 await page.goto('http://127.0.0.1:'+server.address().port+'/bloom-digmori/?testHooks=1',{timeout:45000});
 await page.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});
 assert.equal(await page.evaluate(()=>Bloom.app.sim.terrain.seed),190725);
 await hooks({bossHp:BOSS_HP,bossDamage:BOSS_DAMAGE});await page.mouse.move(1300,740);await focusWorld();
 const phases=(await import('./playthrough-phases.mjs')).PHASES;
 let resumed=false;const ctx={};
 for(const [name,run]of phases){if(process.env.PT_ONLY&&!process.env.PT_ONLY.split(",").includes(name))continue;
  if(PT_RESUME&&!resumed){if(name!==PT_RESUME)continue;resumed=true;const bytes=fs.readFileSync(PT_SAVE+'/'+name+'.bloom');await page.evaluate(b=>{Bloom.app.sim.load(new Uint8Array(b));Bloom.app.sim.testHooks=Bloom.app.testHooks;Bloom.app.renderer.worldRef=null;Bloom.app.presentation.reset();Bloom.app.scene.reset();Bloom.app.refreshUI(true);},[...bytes]);timeline.push({name:'DEV RESUME '+name,tick:await tick()});await sleep(1500);}
  if(PT_SAVE){fs.mkdirSync(PT_SAVE,{recursive:true});const b=await page.evaluate(()=>[...Bloom.app.sim.save()]);fs.writeFileSync(PT_SAVE+'/'+name+'.bloom',Buffer.from(b));}
  log('PHASE',name);await run({ctx,inPen:async p=>{const f=await feet();return Math.abs(f.x-p.x)<=2&&Math.abs(f.z-p.z)<=2&&Math.abs(f.y-p.y)<=1;},page,st,count,counts,progress,tick,feet,blockAt,timeScale,until,milestone,keys,focusWorld,closeMenus,select,selectId,openBag,mine,rightClick,placeOn,collect,goTo,follow,craft,placeStation,openStation,pickUpStation,smelt,gather,fight,dismissModal,pillarUp,staircase,tunnel,digTo,oreCluster,climbBack,mineVisible,resetYaw,station,spot,sleep,log,hooks,clickBag,slotOf,eat,gearHUD,wear,throwAt,nearestBoss,units,turn,aim,settleCamera,shot:async n=>{fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:SHOTS+'/'+n+'.png'});}});
 }
 assert.deepEqual(errors,[]);
 const report={result:'PASS',seed:190725,resumed:!!PT_RESUME,elapsedS:Math.round((Date.now()-began)/1000),timeline};fs.mkdirSync('artifacts/playthrough',{recursive:true});fs.writeFileSync('artifacts/playthrough/timeline.json',JSON.stringify(report,null,1)+'\n');
 console.table(timeline);console.log(JSON.stringify({result:'PASS',milestones:timeline.length,elapsedS:report.elapsedS}));
}catch(e){console.error(e);console.table(timeline);if(page&&PT_SAVE)await page.evaluate(()=>[...Bloom.app.sim.save()]).then(b=>fs.writeFileSync(PT_SAVE+'/FAIL.bloom',Buffer.from(b))).catch(()=>{});if(page)await page.screenshot({path:'artifacts/playthrough/FAIL.png'}).catch(()=>{});process.exitCode=1;}
finally{clearTimeout(timeout);await browser?.close();server?.close();}
