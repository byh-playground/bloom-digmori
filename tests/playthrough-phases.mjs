import assert from 'node:assert/strict';
// The playthrough phases, in order. Each gets the driver (tests/playthrough.e2e.mjs) and uses only its real-input helpers.
export const PHASES=[
 ['wood',async d=>{
  // Seed 190725 has almost no trees near spawn; giant mushrooms (stems are wood since 0.35.1) are ~20 m east.
  const got=await d.gather(['stem','log'],3,{radius:40});assert(got>=3,'wood');
  await d.craft('stemPlanks','all');await d.craft('planks','all');
  assert(await d.craft('workbench',1),'workbench');await d.craft('sticks',1);
  assert(await d.craft('wood_pick',1),'wood pick');
  const p=await d.progress();assert(p.log&&p.workbench&&p.wood_pick);
  await d.milestone('wood-tools','원목(버섯 줄기) → 판자 → 제작대 → 나무 곡괭이');
 }],
 ['stone',async d=>{
  await d.pickUpStation('workbench');
  // wood for the stone tools' sticks first, on the surface; then stone (a dug staircase); back up the same stairs.
  await d.gather(['stem','log'],2,{radius:40});await d.craft('stemPlanks','all');await d.craft('sticks',1);
  // Stone lies 3 blocks under the surface everywhere here, so a player digs down for it. Do that out of the 균류 숲 (the
  // spore hazard of the stems' grove), on the plain near spawn: a staircase toward screen-up (-z), whose dug columns are
  // stone below the top 3 cells, until 16 cobble; then back up the same stairs.
  const site=await quarrySite(d);assert(site,'a quarry site off the 균류 숲');d.log('quarry site',JSON.stringify(site));
  await d.goTo({x:site.x+.5,z:site.z+.5,r:.6,y:site.y,dy:1});
  // an ore the wooden pick cannot break (iron) in the next column: turn and keep going down another way
  const DIRS=[[0,-1],[-1,0],[1,0],[0,1]];let dir=0;
  for(let i=0;i<20&&await d.count('cobble')<16&&dir<DIRS.length;i++){const f=await d.feet();
   try{await d.staircase(f.y-1,{dx:DIRS[dir][0],dz:DIRS[dir][1],maxSteps:1});}catch(e){d.log('quarry turn',e.message);dir++;}}
  const got=await d.count('cobble');d.log('cobble',got,'hp',(await d.st()).hp);assert(got>=14,'cobble '+got);
  await d.climbBack();
  assert(await d.craft('stone_pick',1),'stone pick');assert(await d.craft('stone_sword',1),'stone sword');await d.craft('furnace',1);
  await d.milestone('stone-tools','돌 곡괭이 · 돌 검 · 화로');
 }],
 ['tree',async d=>{
  // Nothing regenerates HP, and the mushroom grove east of spawn is 균류 숲 (spore hazard). The lone tree ~57 m west
  // (초원) gives leaves: fruit 1 in 4 (food) and the 초원 fibre the iron armor needs.
  // Walk to the tree once (full retries); the gather then only steps between leaves in hand reach.
  await d.goTo({x:-48.5,z:24.5,r:2.5});
  await d.gather(['leaves'],22,{near:{x:-50,y:7,z:24},radius:9});await d.eat(95);
  await d.craft('fiber',2);
  await d.gather(['log'],2,{near:{x:-51,y:5,z:26},radius:6});
  d.log('hp',(await d.st()).hp,'food',await d.count('food'),'fiber',await d.count('fiber'));
  await d.milestone('food-fiber','잎 → 열매(회복)·질긴 섬유');
 }],
 ['iron',async d=>{
  // A staircase straight down (toward screen-up) to the iron band, then a tunnel; coal and iron ore in view are mined
  // on the way. Without iron gear the cave realm shows the penalty line and the cold hazard.
  const top=await d.feet();let seen=false;
  const check=async()=>{const h=await d.gearHUD();if(!seen&&h.realm==='cave'){seen=true;d.log('gear HUD in cave',JSON.stringify(h));assert(!h.hidden&&h.below>=3&&h.hazard==='cold','penalty HUD in the cave: '+JSON.stringify(h));await d.milestone('cave-penalty','동굴 · 권장 철 · 곡괭이/무기/방어구 페널티 + 추위');}};
  const ORES=['ironOre','coalOre'];
  // dig to the densest iron and coal veins in reach (a real player follows the ore band hint: 철 Y -18~16, 석탄 Y -4~24)
  for(const [id,want] of [['coalOre',3],['ironOre',22],['ironOre',22],['ironOre',22],['coalOre',3]]){if(await d.count(id==='coalOre'?'coal':'rawIron')>=want)continue;
   const v=await d.oreCluster(id,26,-12,top.y-2);d.log('vein',id,JSON.stringify(v));if(!v)continue;try{await d.digTo({x:v.x,y:v.y,z:v.z+1},{ores:[]});}catch(e){if(/died/.test(e.message))throw e;d.log('vein dig',e.message);/* the next vein, from where the dig stopped */}await check();
   const enough=async()=>await d.count(id==='coalOre'?'coal':'rawIron')>=want;
   for(let r=0;r<6&&!(await enough());r++)if(!(await d.mineVisible([id],5,12,enough)))break;}
  assert(seen,'reached the cave realm');const c=await d.counts(['rawIron','coal']);assert(c.rawIron>=22&&c.coal>=3,'ore '+JSON.stringify(c));
  await d.climbBack();d.ctx.top=top;// the stair's top cell (climbBack may end on the cell beside it)
 }],
 ['iron-gear',async d=>{
  const top=d.ctx.top||await d.feet();
  const iron=await d.smelt('rawIron','coal',Math.min(27,await d.count('rawIron')));/* 22 for the gear + 5 for the diamond pick and sword; the rest stays raw */assert(iron>=22,'iron '+iron);
  if(await d.count('stick')<4){await d.craft('planks','all');await d.craft('sticks',1);}
  for(const id of ['iron_helmet','iron_chest','iron_boots','iron_pick','iron_sword'])assert(await d.craft(id,1),id+' '+JSON.stringify(await d.counts(['iron','fiber','stick','planks'])));
  // 곡괭이·무기 count from the hotbar (Gear.tiers): put the new pick and sword there
  await d.selectId('iron_sword');await d.selectId('iron_pick');
  const worn=await d.wear('iron');assert.deepEqual(worn,{helmet:'iron_helmet',chest:'iron_chest',boots:'iron_boots'});
  await d.eat(95);
  await d.milestone('iron-gear','철 곡괭이·검·투구·흉갑·장화');
  // Back down the same stairs with the iron kit: the penalty line clears (cave asks for iron).
  await d.goTo({x:top.x+.5,z:top.z+.5,r:.4,y:top.y,dy:0});await d.resetYaw();await d.page.keyboard.down('KeyW');await d.page.waitForFunction(()=>Bloom.Gear.status(Bloom.app.actor(),Bloom.app.sim.terrain).realm==='cave',null,{timeout:15000}).catch(()=>{});await d.page.keyboard.up('KeyW');await d.sleep(300);
  const h=await d.gearHUD();d.log('gear HUD with iron',JSON.stringify(h));assert(h.realm==='cave'&&h.below===0&&!h.hazard,'penalty cleared: '+JSON.stringify(h));
  await d.milestone('cave-no-penalty','철 장비로 동굴 · 페널티 없음');await d.goTo({x:top.x+.5,z:top.z+.5,r:.8,y:top.y,dy:0});
 }],
 ['grove-boss',async d=>{
  // The 초원 boss structure (꽃 고리) the HUD quest points at: walk until the boss wakes, then fight it.
  const grove=await structure(d,'grove');assert(grove,'grove in range');
  // Nothing regenerates HP and the cave's cold has pressed it down (floor 1): fruit first (25 HP each), like a player would
  // before a boss: from the trees by the cave stairs (the grove is ~170 m away), else from trees outside its wake radius.
  const heal=async away=>{if((await d.st()).hp+25*(await d.count('food'))<95)await gatherFood(d,Math.ceil((95-(await d.st()).hp)/25),away);};
  await heal(null);
  await d.goTo({x:grove.x+.5,z:grove.z+.5,r:34});
  d.log('hp before the grove',(await d.st()).hp,'food',await d.count('food'));
  await heal({x:grove.x+.5,z:grove.z+.5,r:30});/* out of the boss's wake radius (22 m) */
  await d.eat(95);d.log('hp',(await d.st()).hp);
  await d.goTo({x:grove.x+.5,z:grove.z+.5,r:18});
  await d.page.waitForFunction(()=>Object.values(Bloom.app.sim.actors).some(a=>a.boss&&!a.dead),null,{timeout:10000});
  assert((await d.progress()).bossFound,'bossFound');await d.milestone('grove-found','꽃 고리 도착 · 뿌리 거인 깨어남');
  await killBoss(d,'root');
  assert(await d.count('rootEgg')>=1,'first kill drops the egg');assert(await d.count('rootCrown')>=1,'crown');
  await d.milestone('grassland-boss','뿌리 거인 처치 · 알 · 왕관 · 다이아몬드 3');
 }],
 ['pen',async d=>{
  // Wood and fruit from the grove's trees, then a fenced pen (5×5 inside: 23 fences + a gate) on flat ground nearby.
  const grove=await structure(d,'grove');
  await d.gather(['log'],12,{near:{x:grove.x,y:grove.y,z:grove.z},radius:12,item:'log'});
  await gatherFood(d,4);
  await d.craft('planks','all');await d.craft('sticks',6);
  assert(await d.craft('fence',8)>=8,'fences');assert(await d.craft('fenceGate',1),'gate');assert(await d.count('fence')>=23,'23 fences');
  const site=await flatSite(d,grove,32,110);assert(site,'flat 7×7 site');d.log('pen site',JSON.stringify(site));d.ctx.pen=site;
  await d.goTo({x:site.x+.5,z:site.z+.5,r:.6,y:site.y,dy:0});
  for(const c of ring(site))if(!c.gate)await placeFence(d,site,c,'fence');
  // the egg in the middle, out through the gap, then the gate closes the ring from outside
  await d.placeOn({x:site.x,y:site.y-1,z:site.z-1},'rootEgg');
  await d.milestone('egg-placed','울타리 목장 안에 알을 놓음 · 30초 뒤 부화');
  await d.goTo({x:site.x+.5,z:site.z+5.5,r:.6,y:site.y,dy:1});
  const gate=ring(site).find(c=>c.gate);await d.placeOn({x:gate.x,y:gate.y-1,z:gate.z},'fenceGate');
  await d.timeScale(8);await d.until(()=>Bloom.app.sim.progress.hatched&&Bloom.app.sim.progress.pen,null,40000,'hatch in the pen').catch(async e=>{d.log('pen state',JSON.stringify(await d.page.evaluate(({s,g})=>{const sim=Bloom.app.sim,t=sim.terrain,a=Bloom.app.actor();return{hatched:sim.progress.hatched,pen:sim.progress.pen,eggs:Object.keys(sim.eggs),gate:Bloom.BLOCKS[t.get(g.x,g.y,g.z)]?.id,me:a.pos,units:Object.values(sim.companions.data.units).map(u=>({cell:u.cell,stage:u.stage,location:u.location}))};},{s:site,g:gate})));throw e;});await d.timeScale(1);
  const u=await d.units();assert(u.length===1&&u[0].stage==='baby','one baby: '+JSON.stringify(u));
  await d.milestone('hatched-pen','부화 · 닫힌 목장 안의 아기 뿌리');
 }],
 ['feed',async d=>{
  const pen=d.ctx.pen??await penFromWorld(d);await feedAll(d,pen);
  assert((await d.units()).every(x=>x.stage==='adult'));assert((await d.progress()).grown);
  await d.milestone('adult','먹이 3번 · 성체');
 }],
 ['egg2',async d=>{
  // A second root egg: the boss comes back 4 minutes after a kill and later kills drop an egg 35% of the time.
  const pen=d.ctx.pen??await penFromWorld(d),grove=await structure(d,'grove');if(await d.inPen(pen))await exitPen(d,pen);let kills=0;
  while(await d.count('rootEgg')<1&&kills<8){
   await d.goTo({x:grove.x+.5,z:grove.z+.5,r:19});await d.timeScale(8);
   await d.until(()=>Object.values(Bloom.app.sim.actors).some(a=>a.boss&&!a.dead),null,250000,'boss respawn');await d.timeScale(1);
   await d.eat(95);await killBoss(d,'root');kills++;d.log('grove kill',kills,'egg',await d.count('rootEgg'));}
  assert(await d.count('rootEgg')>=1,'second egg after '+kills+' kills');
  await d.milestone('second-egg','뿌리 거인 재등장 '+kills+'회 처치 · 두 번째 알');
 }],
 ['dungeon',async d=>{
  // A ruin's sealed chests hold 공명 수정 조각 (merge potion) and fruit; the cave boss in its deepest vault drops the crown
  // the diamond helmet needs. Iron gear: no cold. Reached by digging a staircase down from the surface above it.
  const pen=d.ctx.pen??await penFromWorld(d);if(pen&&await d.inPen(pen))await exitPen(d,pen);
  const dun=await d.page.evaluate(()=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain;const s=t.structuresNear(a.pos,200).find(s=>s.type==='dungeon');return s&&{...s,rooms:t.dungeonRooms(s)};});assert(dun,'a ruin in range');d.log('dungeon',JSON.stringify({x:dun.x,y:dun.y,z:dun.z}));
  const chests=await d.page.evaluate(dun=>window.__PT.find(['lootChest'],{x:dun.x,y:dun.y,z:dun.z},26,{ry:6}),dun);d.log('chests',JSON.stringify(chests.slice(0,4)));assert(chests.length,'ruin chests');
  // start the staircase as far north of the chest as it is deep, so the stairs (one step down per block toward -z) end beside it
  await d.eat(95);
  for(const c of chests.slice(0,3)){if(await d.count('crystalShard')>=1&&await d.count('food')>=4)break;
   // a staircase that starts as far north of the chest as it is deep ends beside it; a cave void in the way: try a
   // start a few blocks east/west instead (climbing back first)
   for(const dx of [0,3,-3,6,-6]){const depth=await d.page.evaluate(({c,dx})=>Bloom.app.sim.terrain.height(c.x+dx,c.z+20)+1-c.y,{c,dx});
    try{await d.goTo({x:c.x+dx+.5,z:c.z+1.5+Math.max(2,depth),r:1.2});await d.digTo({x:c.x,y:c.y,z:c.z+1});if(await openLoot(d,c))break;}
    catch(e){d.log('chest approach',dx,e.message);}}}
  assert(await d.count('crystalShard')>=1,'crystal shard from a ruin chest');
  await d.milestone('ruin-chest','유적 보물함 · 공명 수정 · 열매');
  const vault=dun.rooms[5];await d.digTo({x:vault.x,y:dun.y+1,z:vault.z+4});
  await d.page.waitForFunction(()=>Object.values(Bloom.app.sim.actors).some(a=>a.boss&&!a.dead&&a.speciesId==='rock-chick'),null,{timeout:15000});
  await d.eat(95);await killBoss(d,'rock-chick');
  assert(await d.count('rockChickCrown')>=1,'cave boss crown');
  await d.milestone('cave-boss','광맥 병아리 대왕 처치 · 금광석 왕관');
  assert(await d.pillarUp(),'back on the surface');
 }],
 ['food2',async d=>{
  // fruit for the second baby (3) and the merge potion (1)
  // and enough to heal first: the walk back to the pen crosses 균류 숲 (spores −1/s); keep out of the 포자 군주's wake
  // radius (it is not fought until the fungal phase) when there are trees elsewhere, else take the ones near it
  const ring=await structure(d,'ring'),away=ring&&{x:ring.x+.5,z:ring.z+.5,r:30};
  for(let k=0;k<3;k++){const hp=(await d.st()).hp;if(hp>=80&&await d.count('food')>=4)break;const want=4+Math.max(0,Math.ceil((95-hp)/25));await gatherFood(d,want,away);if(await d.count('food')<want)await gatherFood(d,want);await d.eat(95);}
  d.log('hp',(await d.st()).hp,'food',await d.count('food'));assert(await d.count('food')>=4,'food');
 }],
 ['hatch2',async d=>{
  const pen=d.ctx.pen??await penFromWorld(d);
  await enterPen(d,pen);await d.placeOn({x:pen.x+1,y:pen.y-1,z:pen.z-1},'rootEgg');await d.timeScale(8);
  await d.until(()=>Bloom.app.sim.companions.owned(Bloom.app.localId).length>=2,null,40000,'second hatch').catch(async e=>{d.log('eggs',JSON.stringify(await d.page.evaluate(()=>({tick:Bloom.app.sim.tick,eggs:Bloom.app.sim.eggs,owned:Bloom.app.sim.companions.owned(Bloom.app.localId).length,all:Bloom.app.sim.companions.all().length}))));throw e;});await d.timeScale(1);
  await feedAll(d,pen);
  const u=await d.units();assert(u.length===2&&u.every(x=>x.stage==='adult'),'two adults: '+JSON.stringify(u));
  await d.milestone('two-adults','두 번째 뿌리 성체');
 }],
 ['merge',async d=>{
  const pen=d.ctx.pen??await penFromWorld(d);
  if(!(await d.count('food')))await gatherFood(d,1);
  assert(await d.craft('mergePotion',1),'merge potion');
  await enterPen(d,pen);
  const u=await d.units(),mid={x:(u[0].pos.x+u[1].pos.x)/2,y:u[0].pos.y+.3,z:(u[0].pos.z+u[1].pos.z)/2};
  await d.selectId('mergePotion');await d.settleCamera();const sp=await d.page.evaluate(p=>window.__pointScreen(p),mid);await d.page.mouse.move(sp.x,sp.y);await d.sleep(150);await d.page.mouse.click(sp.x,sp.y,{button:'right'});
  await d.until(()=>Bloom.app.sim.progress.merged,null,6000,'merge');
  const after=await d.units();assert(after.length===1&&after[0].grade===2,'grade 2: '+JSON.stringify(after));
  await d.milestone('merge-grade2','합성 물약 · 뿌리 2등급');
 }],
 ['labor',async d=>{
  // A storage chest and an aptitude block (a placed dirt block: 뿌리 gathers grass/dirt/log/leaves) inside the closed pen:
  // the adult harvests it into the chest.
  const pen=d.ctx.pen??await penFromWorld(d);
  if(!(await d.count('storageChest'))){if(await d.count('planks')<8){if(await d.inPen(pen))await exitPen(d,pen);await d.gather(['log','stem'],2,{radius:60});await d.craft('planks','all');await d.craft('stemPlanks','all');}assert(await d.craft('storageChest',1),'chest');}
  const block=(await d.count('dirt'))?'dirt':'log';assert(await d.count(block),'a dirt block to place');
  await herdIn(d,pen);await enterPen(d,pen);
  await d.placeOn({x:pen.x+2,y:pen.y-1,z:pen.z+2},'storageChest');await d.placeOn({x:pen.x-2,y:pen.y-1,z:pen.z-2},block);
  await exitPen(d,pen);await d.timeScale(8);
  await d.until(()=>Bloom.app.sim.progress.labor,null,60000,'chest labor').catch(async e=>{d.log('labor state',JSON.stringify(await d.page.evaluate(p=>{const s=Bloom.app.sim,t=s.terrain,id=(x,y,z)=>Bloom.BLOCKS[t.get(x,y,z)]?.id;return{units:Object.values(s.companions.data.units).map(u=>({id:u.id,stage:u.stage,grade:u.grade,location:u.location,cell:u.cell,cargo:u.cargo,progress:u.progress})),chest:id(p.x+2,p.y,p.z+2),block:id(p.x-2,p.y,p.z-2),gate:id(p.x,p.y,p.z+3),region:(()=>{const r=s.ranch.region(p.x,p.y,p.z);return{open:r.open,cells:r.cells?.size};})()};},pen)));throw e;});await d.timeScale(1);
  const chest=await d.page.evaluate(p=>Bloom.app.sim.chests[(p.x+2)+','+p.y+','+(p.z+2)]?.slots.filter(Boolean),pen);assert(chest?.length,'chest has items');
  await d.milestone('chest-labor','상자 노동 · 상자에 '+chest.map(s=>s.id+'×'+s.count).join(', '));
 }],
 ['diamond',async d=>{
  // Diamonds: 3 per boss kill so far, the rest from ore (iron pick); iron ingots for the handles and the chest/boots.
  const need={diamond:22,iron:5};let c=await d.counts(['diamond','iron','rawIron','coal']);d.log('have',JSON.stringify(c));
  const home=await d.feet();
  // dig down to the densest diamond vein in reach (다이아몬드 Y -31~-15), mine what comes into view, pillar back up
  for(let k=0;k<3&&await d.count('diamond')<need.diamond;k++){const v=await d.oreCluster('diamondOre',30,-31,-15);d.log('vein diamond',JSON.stringify(v));if(!v)break;
   try{await d.digTo({x:v.x,y:v.y,z:v.z+1});}catch(e){d.log('dig',e.message);}
   const enough=async()=>await d.count('diamond')>=need.diamond;for(let r=0;r<8&&!(await enough());r++)if(!(await d.mineVisible(['diamondOre'],5,12,enough)))break;}
  assert(await d.count('diamond')>=need.diamond,'diamonds '+await d.count('diamond'));
  c=await d.counts(['diamond','iron','rawIron','coal']);
  if(c.iron<need.iron&&c.rawIron<need.iron-c.iron){for(let r=0;r<4&&await d.count('rawIron')<need.iron-c.iron;r++)await d.mineVisible(['ironOre'],5,8);}
  // back the way we dug (the stairs), else straight up
  let up=true;try{await d.climbBack();}catch(e){d.log('climb',e.message);up=await d.pillarUp();}assert(up,'back up');
  c=await d.counts(['diamond','iron','rawIron','coal']);
  c=await d.counts(['iron']);if(c.iron<need.iron)await d.smelt('rawIron','coal',need.iron-c.iron);
  for(const id of ['diamond_pick','diamond_sword','diamond_helmet','diamond_chest','diamond_boots'])assert(await d.craft(id,1),id);
  await d.selectId('diamond_sword');await d.selectId('diamond_pick');
  const worn=await d.wear('diamond');assert.deepEqual(worn,{helmet:'diamond_helmet',chest:'diamond_chest',boots:'diamond_boots'});
  assert((await d.progress()).diamondGear);
  await d.milestone('diamond-gear','다이아몬드 곡괭이·검·투구(왕관)·흉갑·장화');
 }],
 ['fungal',async d=>{
  const ring=await structure(d,'ring');assert(ring,'a mushroom ring in range');
  await d.eat(95);await d.goTo({x:ring.x+.5,z:ring.z+.5,r:26});
  // stand on 균류 숲 ground at the ring (its surroundings can be another biome)
  const spot=await d.page.evaluate(r=>{const t=Bloom.app.sim.terrain;let best=null;for(let x=r.x-14;x<=r.x+14;x++)for(let z=r.z-14;z<=r.z+14;z++){const y=t.height(x,z)+1;if(t.realm(x+.5,y,z+.5)!=='fungal'||!window.__PT.stand(x,y,z))continue;const dd=Math.hypot(x-r.x,z-r.z);if(dd<8)continue;if(!best||dd>best.dd)best={x,y,z,dd};}return best;},ring);d.log('fungal spot',JSON.stringify(spot));
  if(spot)await d.goTo({x:spot.x+.5,z:spot.z+.5,r:1.5,y:spot.y,dy:2});else await d.goTo({x:ring.x+.5,z:ring.z+.5,r:12});
  await d.selectId('diamond_pick');await d.selectId('diamond_sword');
  const h=await d.gearHUD();d.log('fungal HUD',JSON.stringify(h));assert(h.realm==='fungal'&&h.below===0&&!h.hazard,'fungal forest without penalty: '+JSON.stringify(h));
  await d.milestone('fungal-no-penalty','균류 숲 · 다이아몬드 장비로 페널티 없음');
  await d.page.waitForFunction(()=>Object.values(Bloom.app.sim.actors).some(a=>a.boss&&!a.dead&&a.speciesId==='mushroom-snail'),null,{timeout:10000});
  await killBoss(d,'mushroom-snail');assert((await d.progress())['bossKill:mushroom-snail']);
  await d.milestone('spore-lord','포자 군주 처치');
 }],
];

// ---- phase helpers (real input only; reads of world state to decide where to go) ----
// The nearest surface cell off the 균류 숲 whose 10 columns toward -z are flat (±1) and solid from 3 to 12 below (no cave
// void under the staircase).
async function quarrySite(d){return d.page.evaluate(()=>{const P=window.__PT,t=Bloom.app.sim.terrain,a=Bloom.app.actor();let best=null;
 for(let x=Math.floor(a.pos.x)-40;x<=Math.floor(a.pos.x)+40;x++)for(let z=Math.floor(a.pos.z)-40;z<=Math.floor(a.pos.z)+40;z++){const y=t.height(x,z)+1;if(!P.stand(x,y,z))continue;
  const dd=Math.hypot(x-a.pos.x,z-a.pos.z);if(best&&dd>=best.dd)continue;let ok=true;
  for(let k=0;k<=10&&ok;k++){const h=t.height(x,z-k);if(Math.abs(h+1-y)>1||t.realm(x+.5,h+1,z-k+.5)==='fungal'){ok=false;break;}for(let yy=h-12;yy<=h-3;yy++)if(!P.solid(x,yy,z-k)){ok=false;break;}}
  if(ok)best={x,y,z,dd};}return best;});}
const structure=(d,type)=>d.page.evaluate(type=>{const a=Bloom.app.actor();return Bloom.app.sim.terrain.structuresNear(a.pos,220).find(s=>s.type===type)||null;},type);
async function killBoss(d,species){const b=await d.page.evaluate(sp=>{const a=Bloom.app.actor();return Object.values(Bloom.app.sim.actors).filter(x=>x.boss&&!x.dead&&x.speciesId===sp).sort((x,y)=>Math.hypot(x.pos.x-a.pos.x,x.pos.z-a.pos.z)-Math.hypot(y.pos.x-a.pos.x,y.pos.z-a.pos.z))[0]?.id;},species);assert(b,'boss '+species);
 for(let round=0;round<6;round++){if(await d.fight(b,{maxS:40}))break;await d.eat(80);}
 const gone=await d.page.evaluate(id=>!Bloom.app.sim.actors[id]||Bloom.app.sim.actors[id].dead,b);assert(gone,'boss down');await d.sleep(700);
 if(await d.page.evaluate(()=>!document.querySelector('#ending').hidden)){await d.milestone('first-boss-card','첫 보스 처치 카드');await d.dismissModal();}await d.collect(9);await d.collect(9);}
function ring(c){const out=[];for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)if(Math.max(Math.abs(dx),Math.abs(dz))===3)out.push({x:c.x+dx,y:c.y,z:c.z+dz,gate:dx===0&&dz===3});return out;}
// A dry 7×7 patch whose 49 cells stand at one height with free head room, min…max m from the structure, nearest the player.
async function flatSite(d,from,min,max){return d.page.evaluate(({from,min,max})=>{const P=window.__PT,t=Bloom.app.sim.terrain,a=Bloom.app.actor();let best=null;
 for(let x=from.x-max;x<=from.x+max;x++)for(let z=from.z-max;z<=from.z+max;z++){const r=Math.hypot(x-from.x,z-from.z);if(r<min||r>max)continue;const y=t.height(x,z)+1;let ok=t.realm(x+.5,y,z+.5)==='grassland';
  for(let dx=-3;dx<=3&&ok;dx++)for(let dz=-3;dz<=3&&ok;dz++){if(t.height(x+dx,z+dz)+1!==y||!P.stand(x+dx,y,z+dz)||t.water.level(x+dx,y,z+dz)>0||P.solid(x+dx,y+2,z+dz)||P.solid(x+dx,y+3,z+dz))ok=false;}
  if(ok&&![4,5].every(k=>[-1,0,1].some(dy=>P.stand(x,y+dy,z+k))))ok=false;// the way out through the south gate
  if(ok){const dd=Math.hypot(x-a.pos.x,z-a.pos.z);if(!best||dd<best.dd)best={x,y,z,dd};}}return best;},{from,min,max});}
// The pen centre (DEV resume only; a full run keeps d.ctx.pen): the closed gate nearest the first unit is 3 south of it.
async function penFromWorld(d){for(let i=0;i<10;i++){const p=await penFromWorld1(d);if(p)return p;await d.sleep(300);}return null;}
async function penFromWorld1(d){return d.page.evaluate(()=>{const u=Bloom.app.sim.companions.owned(Bloom.app.localId)[0],t=Bloom.app.sim.terrain,c=u?.cell||u?.home;if(!c)return null;
 for(let r=0;r<10;r++)for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)for(let dy=-1;dy<=1;dy++){const id=Bloom.BLOCKS[t.get(c.x+dx,c.y+dy,c.z+dz)].id;if(id==='fenceGate'||id==='fenceGateOpen')return{x:c.x+dx,y:c.y+dy,z:c.z+dz-3};}return null;});}
// Place a fence/gate on ring cell c from inside the pen (walk toward that side first if it is out of reach).
async function placeFence(d,site,c,id){if(await d.blockAt(c)===id)return;const p=await d.feet();
 if(Math.hypot(c.x-p.x,c.z-p.z)>3.2)await d.goTo({x:site.x+.5+Math.sign(c.x-site.x),z:site.z+.5+Math.sign(c.z-site.z),r:.6,y:site.y,dy:0});
 await d.placeOn({x:c.x,y:c.y-1,z:c.z},id);}
const gateOf=p=>({x:p.x,y:p.y,z:p.z+3});
async function setGate(d,p,open){const g=gateOf(p);
 for(let i=0;i<8;i++){if((await d.blockAt(g))===(open?'fenceGateOpen':'fenceGate'))return;await d.rightClick(g,{x:0,y:1,z:0});
  if(await d.page.waitForFunction(({g,open})=>Bloom.BLOCKS[Bloom.app.sim.terrain.get(g.x,g.y,g.z)].id===(open?'fenceGateOpen':'fenceGate'),{g,open},{timeout:1500}).then(()=>true,()=>false))return;await d.sleep(800);}
 throw Error('gate '+(open?'open':'close'));}
// Leave/enter through the south gate (holding a fence, not the fruit, so no unit follows), closing it behind.
async function exitPen(d,p){await d.selectId('fence').catch(()=>{});await setGate(d,p,true);await d.goTo({x:p.x+.5,z:p.z+5.5,r:.6,y:p.y,dy:1});await setGate(d,p,false);}
// An adult that slipped out while the gate stood open is led back in like a player would: hold its food (fruit) near
// it, walk in through the gate, close it once the unit is inside.
const unitsOut=(d,p)=>d.page.evaluate(p=>Object.values(Bloom.app.sim.companions.data.units).filter(u=>u.location==='ranch'&&u.cell&&(Math.abs(u.cell.x-p.x)>2||Math.abs(u.cell.z-p.z)>2)).map(u=>({id:u.id,cell:u.cell})),p);
async function herdIn(d,p){for(let k=0;k<3;k++){const out=await unitsOut(d,p);if(!out.length)return;d.log('lead back',JSON.stringify(out));
  if(await d.inPen(p))await exitPen(d,p);if(!(await d.count('food')))await gatherFood(d,1);const u=out[0].cell;await d.goTo({x:u.x+.5,z:u.z+.5,r:2});await d.selectId('food');await d.sleep(800);
  await d.goTo({x:p.x+.5,z:p.z+4.5,r:.8,y:p.y,dy:1});await d.selectId('food');await setGate(d,p,true);await d.selectId('food');await d.goTo({x:p.x+.5,z:p.z-1.5,r:.6,y:p.y,dy:0});
  await d.page.waitForFunction(p=>!Object.values(Bloom.app.sim.companions.data.units).some(u=>u.location==='ranch'&&u.cell&&(Math.abs(u.cell.x-p.x)>2||Math.abs(u.cell.z-p.z)>2)),p,{timeout:8000}).catch(()=>{});
  await d.selectId('fence').catch(()=>{});await d.goTo({x:p.x+.5,z:p.z+2.5,r:.5,y:p.y,dy:0});await setGate(d,p,false);}
 assert(!(await unitsOut(d,p)).length,'units left outside the pen');}
async function enterPen(d,p){if(await d.inPen(p))return;await d.selectId('fence').catch(()=>{});await d.goTo({x:p.x+.5,z:p.z+4.5,r:.8,y:p.y,dy:1});await setGate(d,p,true);await d.goTo({x:p.x+.5,z:p.z+2.5,r:.5,y:p.y,dy:0});await setGate(d,p,false);}
// Inside the pen, throw one fruit (G) at a time across the pen from a corner (out of pickup range of where it lands)
// until every baby has grown up.
async function feedAll(d,p){await enterPen(d,p);await d.goTo({x:p.x-1.5,z:p.z+2.5,r:.4,y:p.y,dy:0});
 for(let n=0;n<14;n++){const babies=(await d.units()).filter(u=>u.stage==='baby');if(!babies.length)break;
  if(!(await d.count('food'))){await exitPen(d,p);await gatherFood(d,3);await enterPen(d,p);await d.goTo({x:p.x-1.5,z:p.z+2.5,r:.4,y:p.y,dy:0});}
  const before=await d.page.evaluate(()=>Bloom.app.sim.companions.owned(Bloom.app.localId).map(u=>u.fed+(u.stage==='adult'?10:0)).join());
  await d.throwAt('food',{x:p.x+1.5,y:p.y,z:p.z-.5});await d.timeScale(4);
  await d.page.waitForFunction(b=>Bloom.app.sim.companions.owned(Bloom.app.localId).map(u=>u.fed+(u.stage==='adult'?10:0)).join()!==b,before,{timeout:8000}).catch(()=>d.log('no bite yet'));await d.timeScale(1);}
 const left=(await d.units()).filter(u=>u.stage==='baby');assert(!left.length,'babies left '+JSON.stringify(left));}
async function openLoot(d,c){for(const n of [{x:0,y:1,z:0},{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}]){if(await d.page.evaluate(({c,n})=>window.__PT.solid(c.x+n.x,c.y+n.y,c.z+n.z),{c,n}))continue;
  if(await d.rightClick(c,n)&&await d.page.waitForFunction(c=>Bloom.app.sim.terrain.get(c.x,c.y,c.z)!==Bloom.BID.lootChest,c,{timeout:2000}).then(()=>true,()=>false))return true;}return false;}

// Fruit (열매) for growing babies and the potion: low leaves (1 in 4) and wild 뿌리 (each drops a fruit) nearby.
// Surface boss structures whose boss is up (alive, or its respawn time has passed so walking in wakes it): leaves there
// are left alone (the boss wakes at 22 m).
const bossZones=d=>d.page.evaluate(()=>{const s=Bloom.app.sim,a=Bloom.app.actor(),out=[];for(const st of s.terrain.structuresNear(a.pos,220)){if(st.type!=='grove'&&st.type!=='ring')continue;
  const def=s.progress['boss:'+st.key],live=Object.values(s.actors).some(x=>x.boss&&!x.dead&&Math.hypot(x.pos.x-st.x,x.pos.z-st.z)<40);
  if(live||!Number.isInteger(def)||s.tick-def>=Bloom.EGG_RULES.respawnMs/Bloom.CFG.stepMs-300)out.push({x:st.x+.5,z:st.z+.5,r:28});}return out;});
async function gatherFood(d,n,away=null){for(let k=0;k<8&&await d.count('food')<n;k++){
  const zones=[...(away?[].concat(away):[]),...await bossZones(d)];
  try{await d.gather(['leaves'],6,{radius:60,ry:9,away:zones});}catch(e){if(/died/.test(e.message))throw e;d.log('leaves',e.message);
   if(/none of/.test(e.message))try{await d.gather(['leaves'],6,{radius:120,ry:9,away:zones});}catch(e2){if(/died/.test(e2.message))throw e2;d.log('leaves far',e2.message);}}
  if(await d.count('food')>=n)break;
  const wild=await d.page.evaluate(()=>{const a=Bloom.app.actor();return Object.values(Bloom.app.sim.actors).filter(x=>x.speciesId==='root'&&!x.boss&&!x.dead).map(x=>({id:x.id,d:Math.hypot(x.pos.x-a.pos.x,x.pos.z-a.pos.z)})).filter(x=>x.d<30).sort((x,y)=>x.d-y.d)[0]||null;});
  if(wild&&(await d.st()).hp>=60){d.log('hunt',wild.id);try{await d.fight(wild.id,{maxS:40});await d.collect(6);}catch(e){d.log('hunt',e.message);}}}
 d.log('food',await d.count('food'));}
