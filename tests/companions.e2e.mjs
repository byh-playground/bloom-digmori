import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';

// G2 (0.33.0) companion flow: units come only from eggs, eggs only from boss kills (D-107). This test drives the real
// path with browser input — boss kill → egg drop → pick up → right-click place → hatch → baby follows → debug adult →
// slot/work/save — plus deterministic checks of the boss structures for seed 190725 and the egg rule.
// Fixtures (direct state writes) are limited to: placing a wild/boss near the player, lowering a boss's HP and pausing
// its attacks so a short fight is reproducible, and shortening an egg's remaining hatch time (30 s in play).
const Bloom_EGG_MS=30000,began=Date.now(),report={checks:[]},errors=[];
let browser,server;
const out=new URL('../artifacts/companions/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const timeout=setTimeout(()=>{console.error('Companion E2E exceeded 180 seconds');process.exit(1)},180000);
const pass=(name,evidence)=>{report.checks.push({name,evidence});console.log('PASS '+name)};
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
async function spawnSpecies(p,kind){
 return p.evaluate(kind=>{const sim=Bloom.app.sim,player=Bloom.app.actor();for(const a of Object.values(sim.actors).filter(a=>a.speciesId)){sim.physics.removeBody(a);delete sim.actors[a.id];}
  for(let radius=6;radius<=12;radius++)for(let n=0;n<24;n++){const angle=n*Math.PI/12,x=Math.floor(player.pos.x+Math.cos(angle)*radius),z=Math.floor(player.pos.z+Math.sin(angle)*radius),h=sim.terrain.height(x,z);if(h<Bloom.CFG.sea+1||h>19||Math.abs(h+1-player.pos.y)>2)continue;let low=h,high=h;for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const y=sim.terrain.height(x+dx,z+dz);low=Math.min(low,y);high=Math.max(high,y);}if(high-low>1||sim.terrain.get(x,h,z)===0||[1,2,3].some(k=>sim.terrain.get(x,h+k,z)!==0))continue;const c=sim.addCreature(kind,{x:x+.5,y:h+1.1,z:z+.5});if(c)return c.id;}throw Error('could not place test wildlife: '+kind);},kind);
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
 const unit=(await owned(p)).find(u=>u.id===expectedId);assert(unit);assert.equal(unit.location,expectSlot===null?'reserve':'combat');assert.equal(unit.slot,expectSlot);return unit;
}

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

 const pc=await browser.newPage({viewport:{width:1366,height:900}});pc.setDefaultTimeout(15000);pc.on('pageerror',e=>errors.push(e.message));
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
 assert.deepEqual(world.firstDrops,['diamond','heart','rootEgg']);assert(world.guaranteed&&world.respawnBlocked&&world.secondSpawned);
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
 const first=await placeAndHatch(pc,'rootEgg');assert.equal(first.egg.block,'rootEgg');assert.equal(first.egg.owner,'local');assert(Math.abs(first.egg.hatchMs-Bloom_EGG_MS)<1);assert.equal(first.unit.kind,'root');assert.equal(first.unit.stage,'baby');assert.equal(first.unit.grade,1);assert.equal(first.unit.location,'reserve');
 const unitId=first.unit.id;pass('right-click sets the egg on the ground as a sprite-drawn block that hatches in place into a baby owned by the placer',first);
 await pc.keyboard.down('KeyS');await pause(pc,1400);await pc.keyboard.up('KeyS');await pause(pc,1200);
 const follow=await pc.evaluate(id=>{const a=Bloom.app.actor(),u=Bloom.app.sim.companions.data.units[id],s=Bloom.app.renderer.unitRig.samples.find(s=>s.key===id);return{distance:Math.hypot(a.pos.x-u.pos.x,a.pos.z-u.pos.z),stage:s?.stage,role:s?.role,base:Bloom.app.sim.companions.base('local')?.pos};},unitId);assert(follow.distance<3.5&&follow.stage==='baby'&&follow.role==='follow');
 await pc.keyboard.press('KeyK');const babyCard=await pc.evaluate(id=>{const card=document.querySelector('[data-unit-id="'+id+'"]');return{text:card.textContent,equip:card.querySelector('[data-companion-action="equip"]').disabled,work:card.querySelector('[data-companion-action="work"]').disabled};},unitId);assert(babyCard.equip&&babyCard.work&&babyCard.text.includes('아기'));
 await pc.evaluate(id=>Bloom.app.command({op:'companion',action:'assign',id,location:'combat',slot:0}),unitId);await pause(pc,300);assert.equal((await owned(pc))[0].location,'reserve');
 pass('the baby follows its owner as a reserve unit and cannot be placed in combat or work',{follow,babyCard});
 await pc.locator('#companions-close').click();await pc.locator('#debug-adult').dispatchEvent('click');await pc.keyboard.press('KeyK');await assign(pc,unitId,0);pass('the debug kit makes it adult and the slot card places it by ID',{unitId});

 // 5. Base work with the adult root (grass/dirt/log/leaves aptitude), delivery and collection.
 await pc.locator('#companions-close').click();await walkTo(pc,()=>pc.evaluate(()=>{const a=Bloom.app.actor(),b=Bloom.app.sim.companions.base('local');return{distance:Math.hypot(a.pos.x-b.pos.x,a.pos.z-b.pos.z),pos:{...b.pos},player:{...a.pos}};}),12000,2.5);await pc.keyboard.press('KeyK');
 await pc.locator('[data-unit-id="'+unitId+'"] [data-companion-action="work"]').click();await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.location==='work',unitId,{timeout:8000});
 await pc.waitForFunction(()=>Bloom.app.sim.companions.base(Bloom.app.localId)?.slots.some(Boolean),null,{timeout:30000});const delivered=await pc.evaluate(()=>Bloom.app.sim.companions.base(Bloom.app.localId).slots.filter(Boolean));
 await pc.locator('[data-companion-tab="storage"]').click();await pc.locator('#companion-collect').click();await pc.locator('[data-companion-tab="companions"]').click();await pc.locator('[data-unit-id="'+unitId+'"] [data-companion-action="work"]').click();await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.location==='reserve',unitId,{timeout:8000});await assign(pc,unitId,0);
 assert(delivered.every(s=>['dirt','log','leaves','seed','food'].includes(s.id)));pass('the root harvests its aptitude blocks around the base, delivers, and returns to its slot',{delivered});
 const saved=await saveAndReload(pc,unitId,0);assert.equal(saved.stage,'adult');pass('save and reload keep the unit ID, stage and slot',{id:saved.id,stage:saved.stage});

 // 6. A second species from the debug egg: rock chick ball throw, and slot replacement by ID.
 await pc.locator('#debug-kit').dispatchEvent('click');const chick=(await placeAndHatch(pc,'rockChickEgg')).unit;await pc.locator('#debug-adult').dispatchEvent('click');
 await pc.keyboard.press('KeyK');await pc.locator('[data-companion-slot-target="0"]').click();assert.match(await pc.locator('[data-unit-id="'+chick.id+'"] .companion-card-action').innerText(),/1번과 교체/);await pc.locator('[data-unit-id="'+chick.id+'"] [data-companion-action="equip"]').click();
 await pc.waitForFunction(({a,b})=>Bloom.app.sim.companions.data.units[a]?.location==='reserve'&&Bloom.app.sim.companions.data.units[b]?.slot===0,{a:unitId,b:chick.id},{timeout:8000});await pc.waitForFunction(()=>!Bloom.app.companionPanel.request);
 await pc.locator('#companions-close').click();await pc.keyboard.press('KeyZ');const ballTarget=await spawnSpecies(pc,'mushroom-snail');await pc.evaluate(id=>{Bloom.app.sim.actors[id].ai.cooldown=1e9;},ballTarget);await approach(pc,ballTarget,15000,5);await clickAttack(pc,ballTarget);
 await pc.waitForFunction(id=>Object.values(Bloom.app.sim.projectiles).some(p=>p.companionId===id),chick.id,{timeout:6000});
 await pc.waitForFunction(id=>Bloom.app.renderer.unitRig.samples.some(s=>s.key===id&&s.role==='thrown'&&s.anim==='hide'),chick.id,{timeout:3000});
 await pc.waitForFunction(id=>Object.values(Bloom.app.sim.projectiles).some(p=>p.companionId===id&&p.throwPhase==='ground'),chick.id,{timeout:6000});await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.phase==='idle',chick.id,{timeout:6000});
 pass('the rock chick replaces slot 1 by ID and attacks as the physical ball (rolled up in its shell), lands, holds and returns',{chick:chick.id});

 // 7. Melee: the adult root slams a wild target from slot 2 through ordinary input.
 await pc.keyboard.press('KeyK');await assign(pc,unitId,1);await pc.locator('#companions-close').click();
 const meleeTarget=await pc.evaluate(()=>{const sim=Bloom.app.sim,player=Bloom.app.actor();for(const e of Object.values(sim.actors))if(e.speciesId){sim.physics.removeBody(e);delete sim.actors[e.id];}sim.physics.teleport(player,{x:.5,y:5.1,z:.5});const t=sim.addCreature('mushroom-snail',{x:.5,y:5.1,z:-1.6});t.homePos={...t.pos};t.ai.cooldown=1e9;Bloom.app.renderer.camera.yaw=0;Bloom.app.renderer.camera.pitch=0;return t.id;});await pause(pc,300);
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
 let mobileSaved=await saveAndReload(mobile,mobileUnit,0);await mobile.locator('#companions-btn').tap();await mobile.locator('[data-companion-remove="'+mobileUnit+'"]').tap();await mobile.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.location==='reserve',mobileUnit,{timeout:8000});mobileSaved=await saveAndReload(mobile,mobileUnit,null);
 await mobile.locator('#companions-btn').tap();fit=await panelFit(mobile);assert(fit.rect.x>=0&&fit.rect.x+fit.rect.w<=845&&fit.scroll<=fit.client+1&&fit.buttons.every(b=>b.h>=44));pass('landscape touch UI places and removes a hatched snail by ID, survives reload, and stays in the viewport',{id:mobileUnit,landscape:fit});
 await mobileContext.close();assert.deepEqual(errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;console.error(error);process.exitCode=1;}
finally{report.elapsedMs=Date.now()-began;report.errors=errors;fs.writeFileSync(new URL('result.json',out),JSON.stringify(report,null,2));clearTimeout(timeout);await browser?.close();server?.close();}
