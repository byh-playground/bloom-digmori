import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';

// G2 (0.34.0) companion flow: units come only from eggs, eggs only from boss kills (D-107), and are raised on a ranch
// (D-103…D-106). This test drives the real path with browser input — boss kill → egg drop → pick up → craft fences, a gate,
// a chest and a merge potion at a workbench → build a fence pen with a gate (right-click) → place the egg in it → hatch →
// throw food (Q) until the baby is an adult, twice → throw the merge potion (grade 2) → chest labor fills the chest →
// save/reload — plus deterministic checks of the boss structures for seed 190725, the egg rule, enclosure detection and
// the old base-storage save migration.
// Fixtures (direct state writes) are limited to: placing a wild/boss near the player, lowering a boss's HP and pausing
// its attacks so a short fight is reproducible, shortening an egg's remaining hatch time (30 s in play) and a labor
// block's remaining regrowth time (20 s in play), swapping an item into hotbar slot 9 (same as dragging it there), and
// writing a 0.33-format base (storage + working unit) into a save to check its migration. Set SHOTS=<dir> to also save
// review screenshots of the ranch flow.
const Bloom_EGG_MS=30000,began=Date.now(),report={checks:[]},errors=[],SHOTS=process.env.SHOTS||null;
const PEN=Object.freeze({x0:-4,x1:2,z0:-3,z1:2,y:5,gate:Object.freeze({x:-4,z:0})});// seed 190725's flat grass at spawn
const inPen=c=>c&&c.x>PEN.x0&&c.x<PEN.x1&&c.z>PEN.z0&&c.z<PEN.z1&&c.y===PEN.y;
let browser,server;
const out=new URL('../artifacts/companions/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const timeout=setTimeout(()=>{console.error('Companion E2E exceeded 180 seconds');process.exit(1)},180000);
const pass=(name,evidence)=>{const s=Math.round((Date.now()-began)/1000);report.checks.push({name,evidence,s});console.log('PASS '+s+'s '+name)};
const boot=p=>p.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});
const owned=p=>p.evaluate(()=>Bloom.app.sim.companions.owned(Bloom.app.localId));
const observe=(p,id)=>p.evaluate(id=>{const a=Bloom.app.actor(),c=Bloom.app.sim.actors[id];return c&&{id:c.id,kind:c.speciesId,targetId:c.targetId,hp:c.hp,dead:c.dead,day:!Bloom.app.sim.night(),distance:Math.hypot(a.pos.x-c.pos.x,a.pos.z-c.pos.z),pos:{...c.pos},player:{...a.pos}}},id);
const panelFit=p=>p.evaluate(()=>{const el=document.querySelector('.companion-panel'),r=el.getBoundingClientRect();return{rect:{x:r.x,y:r.y,w:r.width,h:r.height},client:el.clientHeight,scroll:el.scrollHeight,buttons:[...el.querySelectorAll('button')].filter(b=>b.getClientRects().length).map(b=>({h:b.getBoundingClientRect().height,disabled:b.disabled}))}});
const pause=(p,ms)=>p.waitForTimeout(ms);
// Walk with the keyboard (W plus sidesteps when blocked) until the target point is within stopAt metres.
async function walkTo(p,target,limit=24000,stopAt=3.5){
 const start=Date.now();let previous=Infinity,stale=Date.now(),side='KeyD';await p.locator('#world').focus();
 while(Date.now()-start<limit){
  const s=await target();if(!s)throw Error('walk target vanished');if(s.distance<=stopAt)return s;
  await p.evaluate(({player,pos})=>{const c=Bloom.app.renderer.camera;c.yaw=Math.atan2(-(pos.x-player.x),-(pos.z-player.z));c.pitch=.12;},s);
  if(s.distance<previous-.06){previous=s.distance;stale=Date.now();}else if(Date.now()-stale>1200){await p.keyboard.down(side);await pause(p,600);await p.keyboard.up(side);side=side==='KeyD'?'KeyA':'KeyD';stale=Date.now();previous=Infinity;continue;}
  await p.keyboard.down('KeyW');await pause(p,170);await p.keyboard.up('KeyW');await pause(p,25);
 }
 throw Error('could not walk within '+stopAt+'m; last '+JSON.stringify(await target()));
}
const approach=(p,id,limit,stopAt)=>walkTo(p,()=>observe(p,id),limit,stopAt);
// Aim the camera at the target's body centre (wild units are small, so a level look passes over them).
async function clickAttack(p,id){const s=await observe(p,id);await p.evaluate(({id,player,pos})=>{const c=Bloom.app.renderer.camera,t=Bloom.app.sim.actors[id],d=Math.hypot(pos.x-player.x,pos.z-player.z);c.yaw=Math.atan2(-(pos.x-player.x),-(pos.z-player.z));c.pitch=Math.atan2(player.y+Bloom.CFG.player.eyeHeight-(pos.y+(t?.offset||.6)),Math.max(.5,d));},{id,...s});await pause(p,120);await p.mouse.move(683,450);await p.mouse.down();await pause(p,90);await p.mouse.up();}
// from: the first angle tried (radians, 0 = +x), so a fixture can put the wild unit on a chosen side.
async function spawnSpecies(p,kind,from=0){
 return p.evaluate(({kind,from})=>{const sim=Bloom.app.sim,player=Bloom.app.actor();for(const a of Object.values(sim.actors).filter(a=>a.speciesId)){sim.physics.removeBody(a);delete sim.actors[a.id];}
  for(let radius=6;radius<=12;radius++)for(let n=0;n<24;n++){const angle=from+n*Math.PI/12,x=Math.floor(player.pos.x+Math.cos(angle)*radius),z=Math.floor(player.pos.z+Math.sin(angle)*radius),h=sim.terrain.height(x,z);if(h<Bloom.CFG.sea+1||h>19||Math.abs(h+1-player.pos.y)>2)continue;let low=h,high=h;for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const y=sim.terrain.height(x+dx,z+dz);low=Math.min(low,y);high=Math.max(high,y);}if(high-low>1||sim.terrain.get(x,h,z)===0||[1,2,3].some(k=>sim.terrain.get(x,h+k,z)!==0))continue;const c=sim.addCreature(kind,{x:x+.5,y:h+1.1,z:z+.5});if(c)return c.id;}throw Error('could not place test wildlife: '+kind);},{kind,from});
}
// Boss kill through ordinary sword input. Fixture: a nearby structure-less debug boss with low HP and paused attacks.
async function killBoss(p,species){
 const id=await p.evaluate(species=>{const app=Bloom.app,sim=app.sim,a=app.actor();for(const e of Object.values(sim.actors).filter(e=>e.speciesId)){sim.physics.removeBody(e);delete sim.actors[e.id];}
  const pos={x:a.pos.x,y:a.pos.y+.3,z:a.pos.z-4},boss=sim.addBoss(species,pos,null);boss.hp=40;boss.ai.cooldown=1e9;return boss.id;},species);
 const sword=await p.evaluate(()=>Bloom.app.actor().inventory.slots.findIndex(s=>s?.id==='iron_sword'));await p.locator('#world').focus();await p.keyboard.press('Digit'+(sword+1));
 for(let attempt=0;attempt<14;attempt++){const s=await observe(p,id);if(!s||s.dead)break;if(s.distance>2.6)await approach(p,id,8000,2.4);await clickAttack(p,id);await pause(p,550);}
 await p.waitForFunction(id=>Bloom.app.sim.actors[id]?.dead||!Bloom.app.sim.actors[id],id,{timeout:5000});
 // The first boss victory of a world opens the ending card; continue playing from it.
 if(await p.locator('#ending').isVisible()){await p.locator('#continue-end').click();await p.locator('#world').focus();}return id;
}
async function pickUp(p,item){
 await walkTo(p,()=>p.evaluate(item=>{const a=Bloom.app.actor(),d=Object.values(Bloom.app.sim.drops).find(d=>d.item===item);if(!d)return Bloom.app.actor().inventory.slots.some(s=>s?.id===item)?{distance:0,pos:a.pos,player:a.pos}:null;return{distance:Math.hypot(a.pos.x-d.pos.x,a.pos.z-d.pos.z),pos:{...d.pos},player:{...a.pos}};},item),12000,.6);
 await p.waitForFunction(item=>Bloom.app.actor().inventory.slots.some(s=>s?.id===item),item,{timeout:6000});
}
// Select the egg, look at the ground in front and right-click. Then shorten the remaining hatch time (fixture).
async function placeAndHatch(p,item,mobile=false){
 // A full hotbar puts the egg in the backpack; swap it into hotbar slot 9 (inventory fixture, same as dragging it there).
 const before=await p.evaluate(()=>Bloom.app.sim.companions.all().length),slot=await p.evaluate(item=>{const s=Bloom.app.actor().inventory.slots,i=s.findIndex(s=>s?.id===item);if(i<9)return i;[s[8],s[i]]=[s[i],s[8]];return 8;},item);
 await p.locator('#world').focus();await p.keyboard.press('Digit'+(slot+1));await p.evaluate(()=>{const c=Bloom.app.renderer.camera;c.pitch=.78;});await pause(p,250);
 if(mobile){const box=await p.locator('#world').boundingBox();await p.touchscreen.tap(box.width/2,box.height*.62);}else{await p.locator('#world').focus();await p.mouse.click(683,520,{button:'right'});}
 await p.waitForFunction(()=>Object.keys(Bloom.app.sim.eggs).length>0,null,{timeout:4000});
 const egg=await p.evaluate(()=>{const sim=Bloom.app.sim,e=Object.values(sim.eggs)[0];return{...e,block:Bloom.BLOCKS[sim.terrain.get(e.x,e.y,e.z)].id,below:Bloom.BLOCKS[sim.terrain.get(e.x,e.y-1,e.z)].id,hatchMs:(e.hatchTick-e.placedTick)*Bloom.CFG.stepMs,sample:Bloom.app.renderer.unitRig.samples.find(s=>s.role==='egg')};});
 await p.waitForFunction(()=>Bloom.app.renderer.unitRig.samples.some(s=>s.role==='egg'&&s.egg),null,{timeout:4000});
 await p.evaluate(()=>{const sim=Bloom.app.sim;for(const e of Object.values(sim.eggs))e.hatchTick=sim.tick+45;});
 await p.waitForFunction(n=>Bloom.app.sim.companions.all().length>n&&!Object.keys(Bloom.app.sim.eggs).length,before,{timeout:8000});
 const unit=await p.evaluate(()=>Bloom.app.sim.companions.all().at(-1));return{egg,unit};
}
async function assign(p,id,slot=0,mobile=false){
 const target=p.locator('[data-companion-slot-target="'+slot+'"]');if(mobile)await target.tap();else await target.click();
 const card=p.locator('[data-unit-id="'+id+'"] [data-companion-action="equip"]');if(mobile)await card.tap();else await card.click();
 await p.waitForFunction(({id,slot})=>Bloom.app.sim.companions.data.units[id]?.location==='combat'&&Bloom.app.sim.companions.data.units[id].slot===slot,{id,slot},{timeout:8000});
 await p.waitForFunction(()=>!Bloom.app.companionPanel.request,null,{timeout:4000});
}
async function saveAndReload(p,expectedId,expectSlot){
 if(!(await p.locator('#companions').isHidden()))await p.locator('#companions-close').click();await p.locator('#menu-btn').click();await p.locator('#save-world').click();
 await p.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('저장됨'),null,{timeout:6000});
 await p.reload({timeout:45000});await boot(p);await p.locator('#menu-btn').click();await p.locator('#load-world').click();
 await p.waitForFunction(()=>Bloom.app.sim.companions.all().length>0,null,{timeout:8000});
 const unit=(await owned(p)).find(u=>u.id===expectedId);assert(unit);assert.equal(unit.location,expectSlot===null?'ranch':'combat');assert.equal(unit.slot,expectSlot);return unit;
}
// ---- Ranch helpers (0.34.0) ----
const shot=async(p,name)=>{if(SHOTS){fs.mkdirSync(SHOTS,{recursive:true});await p.screenshot({path:SHOTS+'/'+name+'.png'});}};
// Put a bag item into hotbar slot 9 (inventory fixture, the same as dragging it there) and select it with the keyboard.
async function hold(p,item){const ok=await p.evaluate(item=>{const s=Bloom.app.actor().inventory.slots,i=s.findIndex(s=>s?.id===item);if(i<0)return false;if(i!==8)[s[8],s[i]]=[s[i],s[8]];return true;},item);assert(ok,'no '+item+' in the bag');await p.locator('#world').focus();await p.keyboard.press('Digit9');await p.waitForFunction(item=>Bloom.app.actor().inventory.selected===8&&Bloom.app.actor().inventory.slots[8]?.id===item,item,{timeout:3000});}
// Turn the camera so the eye ray (with the same input quantization the simulation applies) hits face n of block b.
const aimAt=(p,b,n)=>p.evaluate(({b,n})=>{const app=Bloom.app,a=app.actor(),eye={x:a.pos.x,y:a.pos.y+Bloom.CFG.player.eyeHeight,z:a.pos.z};
 for(const [u,v]of [[0,0],[.3,0],[-.3,0],[0,.3],[0,-.3],[.3,.3],[-.3,-.3],[.3,-.3],[-.3,.3],[.42,0],[-.42,0],[0,.42],[0,-.42]]){
  const pt={x:b.x+.5+n.x*.5+(n.x?0:u),y:b.y+.5+n.y*.5+(n.y?0:n.x?v:v),z:b.z+.5+n.z*.5+(n.z?0:n.x?u:v)},d={x:pt.x-eye.x,y:pt.y-eye.y,z:pt.z-eye.z},len=Math.hypot(d.x,d.y,d.z);if(len>Bloom.CFG.reach-.05)continue;
  const yaw=Math.atan2(-d.x,-d.z),pitch=Math.asin(-d.y/len),q=Bloom.decodeInput(Bloom.encodeInputObject({...Bloom.neutralInput(),yaw,pitch})),hit=app.sim.aim({...a,facing:direction(q.yaw,q.pitch)});
  if(hit&&hit.x===b.x&&hit.y===b.y&&hit.z===b.z&&hit.normal.x===n.x&&hit.normal.y===n.y&&hit.normal.z===n.z){app.renderer.camera.yaw=yaw;app.renderer.camera.pitch=pitch;return true;}}
 return false;},{b,n});
async function rightClick(p,b,n,expect,arg){assert(await aimAt(p,b,n),'cannot aim at '+JSON.stringify({b,n}));await pause(p,70);await p.locator('#world').focus();await p.mouse.click(683,384,{button:'right'});await p.waitForFunction(expect,arg,{timeout:3000});}
const blockAt=(p,x,y,z)=>p.evaluate(({x,y,z})=>Bloom.BLOCKS[Bloom.app.sim.terrain.get(x,y,z)].id,{x,y,z});
const walkPoint=(p,pt,stopAt=.35)=>walkTo(p,()=>p.evaluate(pt=>{const a=Bloom.app.actor();return{distance:Math.hypot(a.pos.x-pt.x,a.pos.z-pt.z),pos:{x:pt.x,y:a.pos.y,z:pt.z},player:{...a.pos}};},pt),15000,stopAt);
// Place the selected block on the floor cell (x,PEN.y,z) by right-clicking the top face of the grass under it.
const placeOn=(p,x,z,id)=>rightClick(p,{x,y:PEN.y-1,z},{x:0,y:1,z:0},({x,y,z,id})=>Bloom.BLOCKS[Bloom.app.sim.terrain.get(x,y,z)].id===id,{x,y:PEN.y,z,id});
// Recipe book click (autofills the grid) then the result slot `times` times onto the cursor, then the cursor into an empty bag slot.
async function craft(p,recipe,times){await p.locator('[data-recipe="'+recipe+'"]').click();await p.waitForFunction(r=>!!Bloom.Inventory.result(Bloom.app.actor(),Bloom.app.sim)&&Bloom.Inventory.result(Bloom.app.actor(),Bloom.app.sim).recipe.id===r,recipe,{timeout:3000});
 const out=Bloom_RECIPE_OUT[recipe];for(let n=0;n<times;n++){const before=await p.evaluate(()=>Bloom.app.actor().inventory.cursor?.count||0);await p.locator('#craft-result').click();await p.waitForFunction(b=>(Bloom.app.actor().inventory.cursor?.count||0)>b,before,{timeout:3000});}
 const slot=await p.evaluate(()=>Bloom.app.actor().inventory.slots.findIndex((s,i)=>i>=9&&!s));await p.locator('#inventory-grid [data-area="bag"][data-index="'+slot+'"]').click();await p.waitForFunction(({slot,out})=>Bloom.app.actor().inventory.slots[slot]?.id===out&&!Bloom.app.actor().inventory.cursor,{slot,out},{timeout:3000});}
const Bloom_RECIPE_OUT={planks:'planks',sticks:'stick',storageChest:'storageChest',fenceGate:'fenceGate',fence:'fence',mergePotion:'mergePotion'};
// Throw one held food forward (Q) toward a floor point.
async function throwFood(p,pt){await p.evaluate(pt=>{const a=Bloom.app.actor(),c=Bloom.app.renderer.camera;c.yaw=Math.atan2(-(pt.x-a.pos.x),-(pt.z-a.pos.z));c.pitch=.18;},pt);await pause(p,60);await p.locator('#world').focus();await p.keyboard.press('KeyQ');}
const ranchState=(p,ids)=>p.evaluate(ids=>ids.map(id=>{const u=Bloom.app.sim.companions.data.units[id];return u&&{id,stage:u.stage,grade:u.grade,fed:u.fed,location:u.location,cell:u.cell,phase:u.phase,task:u.task};}),ids);
// Page-side sampler: every 50 ms, each tracked ranch unit's cell must be inside the pen.
const watchPen=(p,ids)=>p.evaluate(({ids,pen})=>{clearInterval(window.__penTimer);window.__penSamples=0;window.__penEscapes=[];window.__penIds=ids;window.__penTimer=setInterval(()=>{for(const id of window.__penIds){const u=Bloom.app.sim.companions.data.units[id];if(!u||u.location!=='ranch'||!u.cell)continue;window.__penSamples++;for(const c of [u.cell,u.next].filter(Boolean))if(!(c.x>pen.x0&&c.x<pen.x1&&c.z>pen.z0&&c.z<pen.z1&&c.y===pen.y))window.__penEscapes.push({id,c,tick:Bloom.app.sim.tick});}},50);},{ids,pen:PEN});
const penReport=p=>p.evaluate(()=>({samples:window.__penSamples,escapes:window.__penEscapes.slice(0,5)}));

try{
 server=http.createServer(serveStatic);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});report.browser=browser.version();
 // 1. A fresh normal world: grassland wildlife (뿌리) spawns as plain wildlife and the panel has no recruit list.
 const normal=await browser.newPage({viewport:{width:1366,height:900}});normal.setDefaultTimeout(15000);normal.on('pageerror',e=>errors.push(e.message));await normal.goto('http://127.0.0.1:'+server.address().port+'/',{timeout:45000});await boot(normal);
 await normal.waitForFunction(()=>!Bloom.app.sim.night()&&Object.values(Bloom.app.sim.actors).some(a=>a.speciesId&&!a.dead),null,{timeout:30000});
 const wild=await normal.evaluate(()=>{const a=Object.values(Bloom.app.sim.actors).find(a=>a.speciesId&&!a.dead),p=Bloom.app.actor();Bloom.app.renderer.camera.yaw=Math.atan2(-(a.pos.x-p.pos.x),-(a.pos.z-p.pos.z));Bloom.app.renderer.camera.pitch=.12;return{id:a.id,kind:a.speciesId,realm:Bloom.app.sim.terrain.realm(a.pos.x,a.pos.y,a.pos.z),state:a.wildState,hostile:a.enemy,distance:Math.hypot(a.pos.x-p.pos.x,a.pos.z-p.pos.z),verticalDelta:Math.abs(a.pos.y-p.pos.y),spawn:Bloom.CFG.creatures};});
 assert.equal(wild.kind,'root');assert.equal(wild.realm,'grassland');assert.equal(wild.state,'neutral');assert.equal(wild.hostile,false);assert(wild.verticalDelta<=3.5);assert(wild.distance>=7.5);
 await normal.waitForFunction(id=>{const label=document.querySelector('.enemy-label[data-actor-id="'+id+'"]');return !!label&&label.textContent.includes('뿌리 · 야생')&&label.classList.contains('wild')},wild.id,{timeout:5000});
 await normal.waitForFunction(id=>Bloom.app.renderer.unitRig.samples.some(s=>s.key===id&&s.role==='wild'&&s.species==='root'),wild.id,{timeout:5000});
 await normal.locator('#companions-btn').click();const panel=await normal.evaluate(()=>({candidates:!!document.querySelector('#companion-candidates,.companion-encounters,[data-candidate-id]'),buttons:[...document.querySelectorAll('#companions button')].map(b=>b.textContent.trim()),empty:document.querySelector('#companion-cards').textContent}));
 assert.equal(panel.candidates,false);assert(!panel.buttons.some(t=>t.includes('함께하기')));assert(panel.empty.includes('알'));await normal.locator('#companions-close').click();
 pass('a fresh world spawns grassland 뿌리 as plain neutral wildlife on the unit rig, and the companion panel has no recruit list',{wild,panel});
 await normal.waitForTimeout(8000);const population=await normal.evaluate(()=>{const p=Bloom.app.actor(),wild=Object.values(Bloom.app.sim.actors).filter(a=>a.speciesId&&!a.boss&&!a.dead&&!a.structureKey);return{total:wild.length,nearby:wild.filter(a=>Math.hypot(a.pos.x-p.pos.x,a.pos.z-p.pos.z)<Bloom.CFG.creatures.encounterRadius).length,kinds:[...new Set(wild.map(a=>a.speciesId))]};});
 assert(population.total<=wild.spawn.maxWild);assert(population.nearby<=wild.spawn.perPlayer);pass('live exploration keeps wildlife within the world/player caps',population);await normal.close();

 const pc=await browser.newPage({viewport:{width:1366,height:768}});pc.setDefaultTimeout(15000);pc.on('pageerror',e=>errors.push(e.message));
 await pc.goto('http://127.0.0.1:'+server.address().port+'/?debug=1',{timeout:45000});await boot(pc);
 // 2. Deterministic world checks for seed 190725: one of each boss structure within reach of spawn, the voxels they are
 // built from, the boss each wakes, the cave realm's rock chicks, and the D-107 egg rule.
 const world=await pc.evaluate(()=>{const base=Bloom.app.sim,test=new Bloom.Simulation(base.R,190725),again=new Bloom.Simulation(base.R,190725);try{
  const t=test.terrain,grove=t.bossAnchor('grove'),ring=t.bossAnchor('ring'),dungeon=t.structuresNear({x:0,y:0,z:0},120).find(s=>s.type==='dungeon');
  const count=(s,ids)=>{let n=0;for(let dz=-8;dz<=8;dz++)for(let dx=-8;dx<=8;dx++)for(let dy=0;dy<=6;dy++)if(ids.includes(Bloom.BLOCKS[t.get(s.x+dx,s.y+dy,s.z+dz)].id))n++;return n;};
  const anchors=t.structureAnchors(-160,-160,160,160).filter(s=>s.type!=='mine').map(s=>s.key);
  const player=test.addPlayer('probe'),woke={};
  for(const s of [ring,dungeon,grove]){/* grove last: a boss leaves once every player is 64m away */const spot=test.bossSpot(s);test.physics.teleport(player,{x:spot.x,y:spot.y,z:spot.z+3});test.tickBossStructures([player]);const boss=Object.values(test.actors).find(a=>a.boss&&a.structureKey===s.key);woke[s.type]={id:boss?.id,species:boss?.speciesId,hp:boss?.maxHp,stage:boss?.scale};}
  // Kill the grove boss twice: the first kill of a species always drops its egg; the rule then rolls EGG_RULES.chance.
  const g=test.actors[woke.grove.id];test.kill(g,player.id);const firstDrops=Object.values(test.drops).map(d=>d.item).sort();
  const respawnBlocked=(()=>{test.physics.teleport(player,{...test.bossSpot(grove),z:test.bossSpot(grove).z+3});test.tickBossStructures([player]);return !Object.values(test.actors).some(a=>a.boss&&!a.dead&&a.structureKey===grove.key);})();
  test.tick+=Math.ceil(Bloom.EGG_RULES.respawnMs/Bloom.CFG.stepMs)+1;test.tickBossStructures([player]);const second=Object.values(test.actors).find(a=>a.boss&&!a.dead&&a.structureKey===grove.key);
  for(const d of Object.values(test.drops)){test.physics.removeBody(d);delete test.drops[d.id];}test.kill(second,player.id);const secondDrops=Object.values(test.drops).map(d=>d.item).sort(),roll=hash3(hashStr(second.id),test.tick,test.terrain.seed,4127)%100;
  const dist=s=>Math.round(Math.hypot(s.x,s.z));
  return{grove:{...grove,distance:dist(grove),leaves:count(grove,['leaves']),logs:count(grove,['log']),torches:count(grove,['torch'])},ring:{...ring,distance:dist(ring),stems:count(ring,['stem']),caps:count(ring,['cap'])},dungeon:{key:dungeon.key,x:dungeon.x,y:dungeon.y,z:dungeon.z,distance:dist(dungeon),stairsOpen:(()=>{const r0=t.dungeonRooms(dungeon)[0];let n=0;for(let z=r0.z-r0.r-66;z<r0.z;z++){const h=t.height(r0.x,z);if(t.get(r0.x,h,z)===0)n++;}return n;})()},
   anchorsIncluded:[grove.key,ring.key,dungeon.key].every(k=>anchors.includes(k)),sameSeed:JSON.stringify([again.terrain.bossAnchor('grove'),again.terrain.bossAnchor('ring')])===JSON.stringify([grove,ring]),woke,firstDrops,respawnBlocked,secondSpawned:!!second,secondDrops,roll,chance:Bloom.EGG_RULES.chance,guaranteed:test.progress['egg:probe:root']===true};
 }finally{test.free();again.free();}});
 assert(world.grove.distance<=160&&world.ring.distance<=160&&world.dungeon.distance<=160,'boss structures out of reach: '+JSON.stringify(world));assert(world.anchorsIncluded&&world.sameSeed);assert(world.dungeon.stairsOpen>0,'the dungeon staircase must open at the surface so the cave boss is walkable');
 assert(world.grove.leaves>20&&world.grove.logs>=16&&world.grove.torches>=8);assert(world.ring.stems>=16&&world.ring.caps>=40);
 assert.deepEqual([world.woke.grove.species,world.woke.ring.species,world.woke.dungeon.species],['root','mushroom-snail','rock-chick']);
 assert.deepEqual(world.firstDrops,['diamond','heart','rootCrown','rootEgg']);assert(world.guaranteed&&world.respawnBlocked&&world.secondSpawned);
 assert.equal(world.secondDrops.includes('rootEgg'),world.roll<world.chance);
 pass('seed 190725 builds a grove, a mushroom ring and the dungeon within reach of spawn; each wakes its species boss; the first kill drops a guaranteed egg, later kills roll after the respawn delay',world);
 const cave=await pc.evaluate(()=>{const base=Bloom.app.sim,test=new Bloom.Simulation(base.R,190725);try{const p=test.addPlayer('caver');test.physics.teleport(p,{x:0,y:-1,z:-56});const out=[];for(let i=0;i<40&&out.length<2;i++){test.spawnCaveCreature([p],p,hash3(i,3,9,1));out.push(...Object.values(test.actors).filter(a=>a.speciesId&&!out.includes(a.speciesId)).map(a=>a.speciesId));}const c=Object.values(test.actors).find(a=>a.speciesId);return{realm:test.terrain.realm(0,-1,-56),species:c?.speciesId,pos:c&&{...c.pos}};}finally{test.free();}});
 assert.equal(cave.realm,'cave');assert.equal(cave.species,'rock-chick');pass('underground (cave realm) wildlife is the rock chick',cave);

 // 3. Wild provocation and leash (unchanged retaliation contract) on a grassland root.
 const rootId=await spawnSpecies(pc,'root');await approach(pc,rootId,20000,2.6);
 for(let attempt=0;attempt<8;attempt++){if((await observe(pc,rootId)).distance>2.4)await approach(pc,rootId,8000,2);await clickAttack(pc,rootId);try{await pc.waitForFunction(id=>Bloom.app.sim.actors[id]?.targetId===Bloom.app.localId,rootId,{timeout:1800});break;}catch{await pause(pc,300);}}
 await pc.waitForFunction(id=>Bloom.app.sim.actors[id]?.targetId===Bloom.app.localId&&Bloom.app.sim.actors[id].combat.state==='attack',rootId,{timeout:15000}).catch(async e=>{throw Error('root never retaliated: '+JSON.stringify(await pc.evaluate(id=>{const c=Bloom.app.sim.actors[id],a=Bloom.app.actor();return{c:c&&{pos:c.pos,state:c.combat.state,target:c.targetId,wild:c.wildState,hp:c.hp,dead:c.dead},a:{pos:a.pos,hp:a.hp,dead:a.dead},night:Bloom.app.sim.night()};},rootId)));});
 const retaliation=await pc.evaluate(id=>{const sim=Bloom.app.sim,bytes=sim.save();sim.load(bytes);const a=sim.actors[id];return{targetId:a?.targetId,wildState:a?.wildState,hostile:a?.enemy,anim:Bloom.app.renderer.unitRig.samples.find(s=>s.key===id)?.anim};},rootId);
 assert.deepEqual({targetId:retaliation.targetId,wildState:retaliation.wildState,hostile:retaliation.hostile},{targetId:'local',wildState:'retaliating',hostile:true});
 const home=await pc.evaluate(()=>{const p=Bloom.app.actor(),home={...p.pos};Bloom.app.sim.physics.teleport(p,{x:home.x+32,y:home.y,z:home.z});return home;});await pc.waitForFunction(id=>{const a=Bloom.app.sim.actors[id];return a?.wildState==='neutral'&&a.targetId===null&&!a.enemy},rootId,{timeout:5000});await pc.evaluate(pos=>Bloom.app.sim.physics.teleport(Bloom.app.actor(),pos),home);
 pass('an ordinary hit makes the wild root retaliate against its attacker (saved/reloaded), and it lets go past the 26m leash',retaliation);

 // 4. Boss kill → egg → place → hatch → baby (the only way to get a unit).
 await pc.locator('#debug-kit').dispatchEvent('click');await pc.evaluate(()=>{const i=Bloom.app.actor().inventory;i.slots=i.slots.map(s=>s&&/Egg$/.test(s.id)?null:s);});
 const bossId=await killBoss(pc,'root');const drops=await pc.evaluate(()=>[...Object.values(Bloom.app.sim.drops).map(d=>d.item),...Bloom.app.actor().inventory.slots.filter(s=>s&&['rootEgg','heart'].includes(s.id)).map(s=>s.id)].sort());assert(drops.includes('rootEgg'),'first root boss kill must drop its egg: '+drops);
 await pickUp(pc,'rootEgg');pass('a sword kill of 뿌리 거인 drops its guaranteed egg and the player picks it up',{bossId,drops});
 // 4b. Ranch materials crafted at a workbench through the recipe book (D-103/D-104/D-106 recipes): planks, sticks, a chest,
 // a gate, 24 fences and a merge potion. Seed 190725 spawns on flat grass, so the pen is built right there.
 await pc.locator('#debug-ranch').dispatchEvent('click');await walkPoint(pc,{x:-1.6,z:3.2});
 await hold(pc,'workbench');await placeOn(pc,-1,4,'workbench');assert(await aimAt(pc,{x:-1,y:PEN.y,z:4},{x:0,y:1,z:0}),'aim workbench');await pc.keyboard.press('KeyF');
 await pc.waitForFunction(()=>!document.querySelector('#inventory').hidden&&document.querySelector('#station-name').textContent.includes('제작대'),null,{timeout:4000});
 await pc.locator('[data-recipe="planks"]').click();await pc.locator('#craft-result').click({modifiers:['Shift']});await pc.waitForFunction(()=>Bloom.Inventory.count(Bloom.app.actor().inventory,'planks')>=52,null,{timeout:3000});
 await craft(pc,'sticks',5);await craft(pc,'storageChest',1);await craft(pc,'fenceGate',1);await pc.locator('[data-recipe="fence"]').click();await pc.locator('#craft-result').click({modifiers:['Shift']});await pc.waitForFunction(()=>Bloom.Inventory.count(Bloom.app.actor().inventory,'fence')===24,null,{timeout:3000});await craft(pc,'mergePotion',1);
 const crafted=await pc.evaluate(()=>Object.fromEntries(['fence','fenceGate','storageChest','mergePotion'].map(id=>[id,Bloom.Inventory.count(Bloom.app.actor().inventory,id)])));
 assert.deepEqual(crafted,{fence:24,fenceGate:1,storageChest:1,mergePotion:1});await pc.keyboard.press('Escape');pass('the recipe book crafts fences (planks·stick ×2 rows → 3), a gate, a storage chest and a merge potion (crystal + fruit)',crafted);await walkPoint(pc,{x:-1.6,z:-.4});
 // 4c. A 7×6 fence ring with a gate on the west side, placed by right-click from two spots inside; the gate opens and closes.
 const ring=[];for(let x=PEN.x0;x<=PEN.x1;x++)for(let z=PEN.z0;z<=PEN.z1;z++)if((x===PEN.x0||x===PEN.x1||z===PEN.z0||z===PEN.z1)&&!(x===PEN.gate.x&&z===PEN.gate.z))ring.push({x,z});
 // West half from the west spot, east half from the east spot; corners first, then the farthest first, so a placed post
 // never stands between the eye and the next grass face.
 const order=(cells,spot)=>cells.sort((a,b)=>Number((b.x===PEN.x0||b.x===PEN.x1)&&(b.z===PEN.z0||b.z===PEN.z1))-Number((a.x===PEN.x0||a.x===PEN.x1)&&(a.z===PEN.z0||a.z===PEN.z1))||Math.hypot(b.x+.5-spot.x,b.z+.5-spot.z)-Math.hypot(a.x+.5-spot.x,a.z+.5-spot.z));
 await hold(pc,'fenceGate');await placeOn(pc,PEN.gate.x,PEN.gate.z,'fenceGate');await hold(pc,'fence');
 for(const [spot,half]of [[{x:-1.6,z:-.4},c=>c.x<0],[{x:.4,z:-.4},c=>c.x>=0]]){await walkPoint(pc,spot);for(const c of order(ring.filter(half),spot))await placeOn(pc,c.x,c.z,'fence');}
 await walkPoint(pc,{x:-1.6,z:-.4});
 const gateCell={x:PEN.gate.x,y:PEN.y,z:PEN.gate.z},isBlock=id=>g=>Bloom.BLOCKS[Bloom.app.sim.terrain.get(g.x,g.y,g.z)].id===g.id;
 const region=()=>pc.evaluate(()=>{const r=Bloom.app.sim.ranch.region(-1,5,0);return{open:r.open,cells:r.cells.size};});
 await rightClick(pc,gateCell,{x:1,y:0,z:0},isBlock(),{...gateCell,id:'fenceGateOpen'});const opened=await region();
 await rightClick(pc,gateCell,{x:1,y:0,z:0},isBlock(),{...gateCell,id:'fenceGate'});const pen=await region();
 assert(opened.open&&!pen.open&&pen.cells===20,'enclosure: '+JSON.stringify({opened,pen}));
 await pc.evaluate(()=>{const c=Bloom.app.renderer.camera;c.yaw=Math.PI/2;c.pitch=.62;c.distance=10;});await pause(pc,400);await shot(pc,'01-pen-fence-gate');
 pass('21 fences and a gate are placed by right-click; the open gate opens the region and the closed gate makes a 20-cell pen',{opened,pen});
 // 4d. The boss egg is set down inside the pen and hatches into a ranch baby that stays in the pen.
 const hatchAt=async(item,x,z)=>{await hold(pc,item);const before=await pc.evaluate(()=>Bloom.app.sim.companions.all().length);await placeOn(pc,x,z,item);
  const egg=await pc.evaluate(()=>{const e=Object.values(Bloom.app.sim.eggs)[0];return{...e,hatchMs:(e.hatchTick-e.placedTick)*Bloom.CFG.stepMs};});await pc.waitForFunction(()=>Bloom.app.renderer.unitRig.samples.some(s=>s.role==='egg'&&s.egg),null,{timeout:4000});
  await pc.evaluate(()=>{const sim=Bloom.app.sim;for(const e of Object.values(sim.eggs))e.hatchTick=sim.tick+30;});await pc.waitForFunction(n=>Bloom.app.sim.companions.all().length>n&&!Object.keys(Bloom.app.sim.eggs).length,before,{timeout:8000});
  return{egg,unit:await pc.evaluate(()=>Bloom.app.sim.companions.all().at(-1))};};
 const first=await hatchAt('rootEgg',0,-1);assert.equal(first.egg.owner,'local');assert(Math.abs(first.egg.hatchMs-Bloom_EGG_MS)<1);assert.equal(first.unit.kind,'root');assert.equal(first.unit.stage,'baby');assert.equal(first.unit.grade,1);assert.equal(first.unit.location,'ranch');assert(inPen(first.unit.cell));
 const unitId=first.unit.id;await watchPen(pc,[unitId]);pass('right-click sets the boss egg inside the pen and it hatches in place into a ranch baby owned by the placer',first);
 await pc.keyboard.press('KeyK');const babyCard=await pc.evaluate(id=>{const card=document.querySelector('[data-unit-id="'+id+'"]');return{text:card.textContent,equip:card.querySelector('[data-companion-action="equip"]').disabled,tabs:!!document.querySelector('#companion-tabs,[data-companion-action="work"],#companion-storage,#companion-quick-collect')};},unitId);assert(babyCard.equip&&babyCard.text.includes('아기')&&!babyCard.tabs);
 await pc.evaluate(id=>Bloom.app.command({op:'companion',action:'assign',id,location:'combat',slot:0}),unitId);await pause(pc,300);assert.equal((await owned(pc))[0].location,'ranch');await pc.locator('#companions-close').click();
 pass('the panel has no base work/storage menu, and a baby cannot enter a combat slot',babyCard);
 // 4e. D-105: thrown 열매 (Q) inside the pen; the baby walks to each one and eats it, three bites make it an adult.
 // One throw per bite (thrown drops can bounce off each other back to the thrower); each must be eaten before the next.
 const dumpBite=async id=>Error('no bite: '+JSON.stringify(await ranchState(pc,[id]))+' '+JSON.stringify(await pc.evaluate(()=>({player:Bloom.app.actor().pos,drops:Object.values(Bloom.app.sim.drops).map(d=>[d.id,d.item,d.count,d.pos])}))));
 const view=(id,pitch,distance)=>pc.evaluate(({id,pitch,distance})=>{const u=Bloom.app.sim.companions.data.units[id],a=Bloom.app.actor(),c=Bloom.app.renderer.camera;c.yaw=Math.atan2(-(u.pos.x-a.pos.x),-(u.pos.z-a.pos.z));c.pitch=pitch;c.distance=distance;},{id,pitch,distance});
 const feed=async(id,label)=>{await hold(pc,'food');
  for(let bite=1;bite<=3;bite++){await throwFood(pc,{x:1.5,z:-.4+(bite-2)*.9});
   await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.task==='eat',id,{timeout:6000}).catch(async()=>{throw await dumpBite(id);});
   if(label&&bite===1){await view(id,.95,6.5);await pause(pc,250);await shot(pc,label+'-walks-to-food');}
   await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.phase==='eat',id,{timeout:8000}).catch(async()=>{throw await dumpBite(id);});
   if(label&&bite===1){await view(id,.95,6.5);await pause(pc,300);await shot(pc,label+'-eats');}
   await pc.waitForFunction(({id,bite})=>{const u=Bloom.app.sim.companions.data.units[id];return u&&(u.stage==='adult'||u.fed>=bite);},{id,bite},{timeout:8000}).catch(async()=>{throw await dumpBite(id);});}};
 await feed(unitId,'02-baby');const grown=(await ranchState(pc,[unitId]))[0];assert.equal(grown.stage,'adult');assert.equal(grown.grade,1);assert(inPen(grown.cell));await pause(pc,600);await view(unitId,.8,5);await pause(pc,200);await shot(pc,'03-grown-adult');
 pass('the baby walks to thrown food inside the pen, eats three times and becomes an adult',grown);
 // 4f. A second root egg (debug kit) hatches in the pen and grows the same way.
 await pc.locator('#debug-kit').dispatchEvent('click');const second=(await hatchAt('rootEgg',-2,1)).unit;await watchPen(pc,[unitId,second.id]);await feed(second.id,null);
 // 4g. D-104: both adults follow the held food to the player, then the thrown merge potion makes one grade-2 root.
 await hold(pc,'food');await pc.waitForFunction(ids=>ids.every(id=>{const u=Bloom.app.sim.companions.data.units[id],a=Bloom.app.actor();return Math.hypot(u.pos.x-a.pos.x,u.pos.z-a.pos.z)<1.9&&!u.next;}),[unitId,second.id],{timeout:12000});
 // Aim steeply down toward the pair's midpoint, so the splash (3 m) lands between them.
 await hold(pc,'mergePotion');await pc.evaluate(ids=>{const a=Bloom.app.actor(),us=ids.map(id=>Bloom.app.sim.companions.data.units[id]),m={x:(us[0].pos.x+us[1].pos.x)/2,z:(us[0].pos.z+us[1].pos.z)/2},c=Bloom.app.renderer.camera;if(Math.hypot(m.x-a.pos.x,m.z-a.pos.z)>.2)c.yaw=Math.atan2(-(m.x-a.pos.x),-(m.z-a.pos.z));c.pitch=1.2;},[unitId,second.id]);await pause(pc,80);await pc.locator('#world').focus();await pc.mouse.click(683,384,{button:'right'});
 await pc.waitForFunction(id=>!Bloom.app.sim.companions.data.units[id],second.id,{timeout:5000});await view(unitId,.9,6);await pause(pc,120);await shot(pc,'04-potion-splash-merge');
 const merged=(await ranchState(pc,[unitId]))[0],mergeCount=await pc.evaluate(()=>Bloom.app.sim.companions.owned('local').length);assert.deepEqual([merged.grade,merged.stage,mergeCount,(await owned(pc))[0].id],[2,'adult',1,unitId]);
 pass('a thrown merge potion splashes the two grade-1 adults; the lower unit id keeps its place as one grade-2 unit',{merged,consumed:second.id});
 // 4h. D-106: a storage chest and leaves inside the pen; the adult root harvests them into the chest, the leaves grow back.
 await hold(pc,'storageChest');await placeOn(pc,-3,1,'storageChest');await hold(pc,'leaves');await placeOn(pc,1,-2,'leaves');await placeOn(pc,-3,-2,'leaves');
 await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.phase==='gather',unitId,{timeout:15000});await view(unitId,.85,5.5);await pause(pc,150);await shot(pc,'05-root-labor');
 await pc.waitForFunction(()=>Object.values(Bloom.app.sim.chests).some(c=>c.slots.some(Boolean)),null,{timeout:20000});
 const regrow=await pc.evaluate(()=>{const sim=Bloom.app.sim,g=Object.values(sim.regrow);for(const r of g)r.tick=sim.tick+15;return g.map(r=>({key:r.key,id:Bloom.BLOCKS[r.id].id}));});assert(regrow.length&&regrow.every(r=>r.id==='leaves'));
 await pc.waitForFunction(keys=>keys.every(k=>Bloom.app.sim.terrain.get(...k.split(',').map(Number))===Bloom.BID.leaves),regrow.map(r=>r.key),{timeout:6000});
 assert(await aimAt(pc,{x:-3,y:PEN.y,z:1},{x:1,y:0,z:0}),'aim chest');await pc.keyboard.press('KeyF');await pc.waitForFunction(()=>!document.querySelector('#chest-view').hidden&&document.querySelectorAll('#chest-grid [data-item]').length>0,null,{timeout:4000});
 const chestUI=await pc.evaluate(()=>[...document.querySelectorAll('#chest-grid [data-item]')].map(b=>b.dataset.item));await shot(pc,'06-chest-ui-labor');await pc.keyboard.press('Escape');
 assert(chestUI.length&&chestUI.every(id=>['seed','leaves','food'].includes(id)));pass('chest labor: the adult root harvests leaves in the pen into the chest (shown in the chest UI) and the leaves grow back',{chestUI,regrow});
 // 4i. Save → reload keeps the pen, the grade-2 unit in it, the chest contents; the unit never left the pen.
 const chestSummary=()=>pc.evaluate(()=>({items:Object.values(Bloom.app.sim.chests).flatMap(c=>c.slots.filter(Boolean)).reduce((n,s)=>n+s.count,0),fences:[...Bloom.app.sim.terrain.edits.values()].filter(id=>Bloom.BLOCKS[id].id==='fence').length,gate:Bloom.BLOCKS[Bloom.app.sim.terrain.get(-4,5,0)].id}));
 const beforeSave=await chestSummary();
 let escapes=await penReport(pc);assert(escapes.samples>200&&!escapes.escapes.length,'pen escape: '+JSON.stringify(escapes));
 const saved=await saveAndReload(pc,unitId,null);assert.deepEqual([saved.stage,saved.grade],['adult',2]);assert(inPen(saved.cell));
 // Labor keeps running between the summary and the save click, so the loaded chest holds at least what was counted.
 const afterLoad=await chestSummary();assert(afterLoad.items>=beforeSave.items&&afterLoad.items>0&&afterLoad.fences===21&&beforeSave.fences===21&&afterLoad.gate==='fenceGate','reload: '+JSON.stringify({beforeSave,afterLoad}));await watchPen(pc,[unitId]);await pause(pc,2500);escapes=await penReport(pc);assert(escapes.samples>=10&&!escapes.escapes.length,'pen escape after reload: '+JSON.stringify(escapes));
 pass('save and reload keep the fences, the gate, the grade-2 unit inside the pen and the chest; sampled every 50 ms it never left the pen',{saved:{id:saved.id,grade:saved.grade,cell:saved.cell},fences:afterLoad.fences,samples:escapes.samples});
 // 4j. 0.33 saves: base storage and a working unit's cargo land in a chest placed at the old base spot; the unit's ball retires.
 const migration=await pc.evaluate(()=>{clearInterval(window.__penTimer);const sim=Bloom.app.sim,c=sim.companions.data,id='unit:'+ ++c.sequence,pos={x:3.5,y:5.3,z:-3.5};
  c.bases={local:{owner:'local',pos:{x:3.5,y:5,z:-4.5},slots:[{id:'coal',count:5},{id:'log',count:3},...Array(7).fill(null)]}};
  c.units[id]={id,owner:'local',kind:'rock-chick',stage:'adult',grade:1,location:'work',slot:null,phase:'carry',cooldown:0,pending:null,cargo:{id:'cobble',count:1},target:null,progress:0,retry:0,pos,previous:{...pos},velocity:{x:0,y:0,z:0},yaw:0,type:'companion',body:null,collider:null};
  sim.physics.addBall(c.units[id],.23,{x:0,y:0,z:0},0);const bodies=sim.physics.bodyCount;sim.load(sim.save());const u=sim.companions.data.units[id];
  return{unit:[u.location,u.body,u.cargo,u.phase],bodies:[bodies,sim.physics.bodyCount],block:Bloom.BLOCKS[sim.terrain.get(3,5,-5)].id,chest:sim.chests['3,5,-5']?.slots.filter(Boolean),marker:sim.progress['baseStorage:local'],bases:'bases' in sim.companions.data};});
 assert.deepEqual(migration,{unit:['ranch',null,null,'idle'],bodies:[migration.bodies[0],migration.bodies[0]-1],block:'storageChest',chest:[{id:'coal',count:5},{id:'log',count:3},{id:'cobble',count:1}],marker:'3,5,-5',bases:false});
 pass('a 0.33-format base migrates: its storage and the working unit’s cargo go into a chest placed at the base spot, the unit joins the ranch and its physics ball is retired',migration);
 await pc.keyboard.press('KeyK');await assign(pc,unitId,0);await pc.locator('#companions-close').click();
 // The grade-2 root now follows from slot 1; the player opens the gate and walks out of the pen through it.
 await rightClick(pc,gateCell,{x:1,y:0,z:0},isBlock(),{...gateCell,id:'fenceGateOpen'});await walkPoint(pc,{x:-2.5,z:.5});await walkPoint(pc,{x:-6,z:.5},.6);

 // 6. A second species from the debug egg: rock chick ball throw, and slot replacement by ID.
 await pc.locator('#debug-kit').dispatchEvent('click');const chick=(await placeAndHatch(pc,'rockChickEgg')).unit;await pc.locator('#debug-adult').dispatchEvent('click');
 await pc.keyboard.press('KeyK');await pc.locator('[data-companion-slot-target="0"]').click();assert.match(await pc.locator('[data-unit-id="'+chick.id+'"] .companion-card-action').innerText(),/1번과 교체/);await pc.locator('[data-unit-id="'+chick.id+'"] [data-companion-action="equip"]').click();
 await pc.waitForFunction(({a,b})=>Bloom.app.sim.companions.data.units[a]?.location==='ranch'&&Bloom.app.sim.companions.data.units[b]?.slot===0,{a:unitId,b:chick.id},{timeout:8000});await pc.waitForFunction(()=>!Bloom.app.companionPanel.request);
 await pc.locator('#companions-close').click();await pc.keyboard.press('KeyZ');const ballTarget=await spawnSpecies(pc,'mushroom-snail',Math.PI);await pc.evaluate(id=>{Bloom.app.sim.actors[id].ai.cooldown=1e9;},ballTarget);await approach(pc,ballTarget,15000,5);await clickAttack(pc,ballTarget);
 await pc.waitForFunction(id=>Object.values(Bloom.app.sim.projectiles).some(p=>p.companionId===id),chick.id,{timeout:6000}).catch(async e=>{throw Error('no ball: '+JSON.stringify(await pc.evaluate(id=>{const a=Bloom.app.actor();return{u:Bloom.app.sim.companions.data.units[id],slot:a.companionSlot,combat:a.combat.state,action:a.combat.action?.kind,sel:a.inventory.selected,item:a.inventory.slots[a.inventory.selected]};},chick.id)));});
 await pc.waitForFunction(id=>Bloom.app.renderer.unitRig.samples.some(s=>s.key===id&&s.role==='thrown'&&s.anim==='hide'),chick.id,{timeout:3000});
 await pc.waitForFunction(id=>Object.values(Bloom.app.sim.projectiles).some(p=>p.companionId===id&&p.throwPhase==='ground'),chick.id,{timeout:6000});await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.phase==='idle',chick.id,{timeout:6000});
 pass('the rock chick replaces slot 1 by ID and attacks as the physical ball (rolled up in its shell), lands, holds and returns',{chick:chick.id});

 // 7. Melee: the adult root slams a wild target from slot 2 through ordinary input (on the flat grass south of the pen).
 await pc.keyboard.press('KeyK');await assign(pc,unitId,1);await pc.locator('#companions-close').click();
 const meleeTarget=await pc.evaluate(()=>{const sim=Bloom.app.sim,player=Bloom.app.actor();for(const e of Object.values(sim.actors))if(e.speciesId){sim.physics.removeBody(e);delete sim.actors[e.id];}sim.physics.teleport(player,{x:.5,y:5.1,z:-5.5});const t=sim.addCreature('mushroom-snail',{x:.5,y:5.1,z:-7.6});t.homePos={...t.pos};t.ai.cooldown=1e9;Bloom.app.renderer.camera.yaw=0;Bloom.app.renderer.camera.pitch=0;return t.id;});await pause(pc,300);
 await pc.keyboard.press('KeyX');await pc.waitForFunction(()=>Bloom.app.actor().companionSlot===1,null,{timeout:3000});const meleeBefore=await observe(pc,meleeTarget);let slamSeen=false;
 for(let attempt=0;attempt<6;attempt++){await clickAttack(pc,meleeTarget);try{await pc.waitForFunction(id=>Bloom.app.actor().combat.action?.companionId===id,unitId,{timeout:1200});}catch{continue;}
  slamSeen||=await pc.waitForFunction(id=>Bloom.app.renderer.unitRig.samples.some(s=>s.key===id&&s.role==='strike'&&s.anim==='slam'),unitId,{timeout:1500}).then(()=>true,()=>false);
  await pc.waitForFunction(({id,target,hp})=>Bloom.app.sim.actors[target]?.hp<hp||Bloom.app.actor().combat.state==='idle'&&Bloom.app.sim.companions.data.units[id].cooldown===0,{id:unitId,target:meleeTarget,hp:meleeBefore.hp},{timeout:2600});if((await observe(pc,meleeTarget)).hp<meleeBefore.hp)break;}
 const meleeAfter=await observe(pc,meleeTarget);assert(meleeAfter.hp<meleeBefore.hp,'root slam did not damage');assert(slamSeen);pass('the adult root strikes with its slam beside the owner and damages through common combat',{before:meleeBefore.hp,after:meleeAfter.hp});

 // 8. Old saves: shell/leaf wildlife and units migrate to the new species, the old warden boss and candidate field retire.
 const migrated=await pc.evaluate(()=>{const app=Bloom.app,sim=app.sim,player=app.actor();const legacy=sim.createActor('enemy:77',{x:player.pos.x+8,y:player.pos.y,z:player.pos.z});legacy.kind='beetle';legacy.enemy=true;legacy.candidateCompanion='shell';sim.actors[legacy.id]=legacy;sim.physics.addActor(legacy);
  const leaf=sim.createActor('creature:80',{x:player.pos.x+11,y:player.pos.y,z:player.pos.z});Object.assign(leaf,{speciesId:'leaf',kind:'leaf',wildState:'retaliating',enemy:true,targetId:player.id,homePos:{...leaf.pos},rpg:null});sim.actors[leaf.id]=leaf;sim.physics.addActor(leaf);
  const warden=sim.createActor('boss:81',{x:player.pos.x+14,y:player.pos.y,z:player.pos.z});Object.assign(warden,{speciesId:'warden',kind:'warden',boss:true,wildState:'neutral',enemy:false,targetId:null,homePos:{...warden.pos},rpg:null});sim.actors[warden.id]=warden;sim.physics.addActor(warden);
  sim.companions.data.sequence=Math.max(sim.companions.data.sequence,90);sim.companions.data.units['companion:90']={id:'companion:90',owner:'local',kind:'shell',location:'reserve',slot:null,phase:'idle',cooldown:0,pending:null,cargo:null,target:null,progress:0,retry:0,pos:{...player.pos},previous:{...player.pos},velocity:{x:0,y:0,z:0},type:'companion',body:null,collider:null};
  player.inventory.slots[20]={id:'sigil',count:2};const inventory=JSON.stringify(player.inventory.slots.filter(s=>s&&s.id!=='sigil')),saved=sim.save();sim.load(saved);const u=sim.companions.data.units['companion:90'];
  return{beetle:[sim.actors['enemy:77']?.speciesId,sim.actors['enemy:77']?.wildState,'candidateCompanion' in (sim.actors['enemy:77']||{})],leaf:[sim.actors['creature:80']?.speciesId,sim.actors['creature:80']?.wildState],wardenRetired:!sim.actors['boss:81'],unit:[u?.kind,u?.stage,u?.grade],sigilRetired:!sim.actors.local.inventory.slots.some(s=>s?.id==='sigil'),inventoryPreserved:JSON.stringify(sim.actors.local.inventory.slots.filter(Boolean))===inventory};});
 assert.deepEqual(migrated,{beetle:['rock-chick','neutral',false],leaf:['root','neutral'],wardenRetired:true,unit:['rock-chick','adult',1],sigilRetired:true,inventoryPreserved:true});
 pass('same-version saves migrate shell/leaf wildlife and units to the new species, retire the warden boss, the candidate field and the sigil',migrated);

 // 9. Landscape touch UI keeps the panel inside the viewport; assign and remove by ID survive reload.
 const mobileContext=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const mobile=await mobileContext.newPage();mobile.setDefaultTimeout(15000);mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto('http://127.0.0.1:'+server.address().port+'/?debug=1',{timeout:45000});await boot(mobile);
 await mobile.locator('#debug-kit').dispatchEvent('click');const mobileUnit=(await placeAndHatch(mobile,'mushroomSnailEgg',true)).unit.id;await mobile.locator('#debug-adult').dispatchEvent('click');await mobile.locator('#companions-btn').tap();await assign(mobile,mobileUnit,0,true);
 let fit=await panelFit(mobile);assert(fit.rect.x>=0&&fit.rect.x+fit.rect.w<=845&&fit.scroll<=fit.client+1&&fit.buttons.every(b=>b.h>=44),JSON.stringify(fit));
 let mobileSaved=await saveAndReload(mobile,mobileUnit,0);await mobile.locator('#companions-btn').tap();await mobile.locator('[data-companion-remove="'+mobileUnit+'"]').tap();await mobile.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.location==='ranch',mobileUnit,{timeout:8000});mobileSaved=await saveAndReload(mobile,mobileUnit,null);
 await mobile.locator('#companions-btn').tap();fit=await panelFit(mobile);assert(fit.rect.x>=0&&fit.rect.x+fit.rect.w<=845&&fit.scroll<=fit.client+1&&fit.buttons.every(b=>b.h>=44));pass('landscape touch UI places and removes a hatched snail by ID, survives reload, and stays in the viewport',{id:mobileUnit,landscape:fit});
 await mobileContext.close();assert.deepEqual(errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;console.error(error);process.exitCode=1;}
finally{report.elapsedMs=Date.now()-began;report.errors=errors;fs.writeFileSync(new URL('result.json',out),JSON.stringify(report,null,2));clearTimeout(timeout);await browser?.close();server?.close();}
