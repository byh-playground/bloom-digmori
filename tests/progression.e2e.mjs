import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {CURSOR_HELPERS} from './cursor-helpers.mjs';

// G2 step 4b (0.35.1): equipment progression and ranch follow-ups.
//  1. Deterministic checks in a separate Simulation of seed 190725: the labor regrowth table, the grade multiplier (actual
//     gather ticks), recipes that need the previous realm's resource, gear factors and the realm hazard by inventory and
//     place, mushroom blocks dropping themselves, one labor harvest's every item going into the chest (and waiting when it
//     is full), and that the resources of the whole progression exist within reach of spawn and the boss sites.
//  2. Browser input on the live game: a fence row stops walking and jumping (a cobble row is climbed), the HUD penalty line
//     entering the cave bare-handed and after equipping iron through the inventory UI, the fungal forest without diamond,
//     the recipe card naming the previous-realm ingredient, and a snail farm built from placed mushroom caps.
// Fixtures (direct state writes) are limited to: teleporting the player to the cave / fungal forest, adding gear and
// materials to the bag, writing fence rows and the farm's fence ring as terrain edits, and shortening an egg's hatch time.
// Set SHOTS=<dir> to save review screenshots.
const PLAYER_R=.35,began=Date.now(),report={checks:[]},errors=[],SHOTS=process.env.SHOTS||null;
let browser,server;
const timeout=setTimeout(()=>{console.error('Progression E2E exceeded 180 seconds');process.exit(1)},180000);
const pass=(name,evidence)=>{const s=Math.round((Date.now()-began)/1000);report.checks.push({name,evidence,s});console.log('PASS '+s+'s '+name)};
const boot=p=>p.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});
const pause=(p,ms)=>p.waitForTimeout(ms);
const shot=async(p,name)=>{if(SHOTS){fs.mkdirSync(SHOTS,{recursive:true});await p.screenshot({path:SHOTS+'/'+name+'.png'});}};
// Move the mouse onto face n of block b (0.35.2 cursor model; the game's own pick confirms it) and wait until the
// simulation holds that target within reach. Returns the screen point, or null.
async function aimAt(p,b,n){for(let i=0;i<15;i++){const at=await p.evaluate(({b,n})=>window.__faceScreen(b,n),{b,n});if(at){await p.mouse.move(at.x,at.y);
  const ok=await p.waitForFunction(({b,n})=>{const t=Bloom.app.sim.aim(Bloom.app.actor());return t&&t.x===b.x&&t.y===b.y&&t.z===b.z&&t.normal.x===n.x&&t.normal.y===n.y&&t.normal.z===n.z;},{b,n},{timeout:1500}).then(()=>true,()=>false);if(ok)return at;}await pause(p,80);}
 return null;}
async function hold(p,item){const ok=await p.evaluate(item=>{const s=Bloom.app.actor().inventory.slots,i=s.findIndex(s=>s?.id===item);if(i<0)return false;if(i!==8)[s[8],s[i]]=[s[i],s[8]];return true;},item);assert(ok,'no '+item+' in the bag');await p.locator('#world').focus();await p.keyboard.press('Digit9');await p.waitForFunction(item=>Bloom.app.actor().inventory.selected===8&&Bloom.app.actor().inventory.slots[8]?.id===item,item,{timeout:3000});}
async function rightClick(p,b,n,expect,arg){const at=await aimAt(p,b,n);assert(at,'cannot aim at '+JSON.stringify({b,n}));await p.mouse.click(at.x,at.y,{button:'right'});await p.waitForFunction(expect,arg,{timeout:3000});}
const placeOn=(p,x,y,z,id)=>rightClick(p,{x,y:y-1,z},{x:0,y:1,z:0},({x,y,z,id})=>Bloom.BLOCKS[Bloom.app.sim.terrain.get(x,y,z)].id===id,{x,y,z,id});
const give=(p,items)=>p.evaluate(items=>{const i=Bloom.app.actor().inventory;for(const [id,n]of items)Bloom.Inventory.addTo(i.slots,id,n);Bloom.app.refreshUI(true);},items);
// The camera is the fixed third-person one (0.35.2): yaw step 0, so W walks toward -z. Teleport only moves the player.
const teleport=(p,pos)=>p.evaluate(pos=>{const app=Bloom.app;app.sim.physics.teleport(app.actor(),pos);},pos);
const gearHUD=p=>p.evaluate(()=>{const n=document.querySelector('#gear-status');return{hidden:n.hidden,title:n.querySelector('b')?.textContent||'',chips:[...n.querySelectorAll('span')].map(s=>({slot:s.dataset.slot,kind:s.className,text:s.textContent})),body:document.body.className,status:Bloom.Gear.status(Bloom.app.actor(),Bloom.app.sim.terrain),hp:Bloom.app.actor().hp};});

try{
 server=http.createServer(serveStatic);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});report.browser=browser.version();
 const pc=await browser.newPage({viewport:{width:1366,height:768}});pc.setDefaultTimeout(15000);pc.on('pageerror',e=>errors.push(e.message));await pc.addInitScript(CURSOR_HELPERS);
 await pc.goto('http://127.0.0.1:'+server.address().port+'/?debug=1',{timeout:45000});await boot(pc);

 // ---- 1. Deterministic checks ----
 const data=await pc.evaluate(()=>{const B=Bloom,blocks=[...new Set(Object.values(B.SPECIES).flatMap(s=>s.capabilities.gather.blocks))].sort();
  const regrow=Object.fromEntries(blocks.map(id=>{const g=B.laborRegrow(B.BID[id]);return[id,g&&{as:B.BLOCKS[g.id].id,s:Math.round(g.ticks*B.CFG.stepMs)/1000}];}));
  const gear=B.RECIPES.filter(r=>B.ITEMS[r.out].material&&(B.ITEMS[r.out].tool||B.ITEMS[r.out].weapon||B.ITEMS[r.out].armor)).map(r=>({id:r.id,material:B.ITEMS[r.out].material,prior:B.recipePriorIngredients(r).map(p=>p.item+'@'+p.realm)}));
  return{regrow,grade:[1,2,3,4].map(grade=>B.Companions.laborFactor({grade})),gear,crown:B.RECIPES.find(r=>r.id==='diamond_helmet').keys,stem:B.RECIPES.find(r=>r.id==='stemPlanks')};});
 const S=(s,as)=>({as,s});
 assert.deepEqual(data.regrow,{cap:S(20,'cap'),coalOre:S(120,'coalOre'),cobble:S(30,'cobble'),diamondOre:S(30,'stone'),dirt:S(20,'dirt'),goldOre:S(30,'stone'),grass:S(20,'grass'),ironOre:S(120,'ironOre'),leaves:S(20,'leaves'),log:S(20,'log'),mycelium:S(20,'mycelium'),stem:S(20,'stem'),stone:S(30,'stone')});
 pass('labor regrowth table: plants 20 s, stone/cobble 30 s, coal/iron ore 120 s as the same ore, gold/diamond ore grow back as stone',data.regrow);
 for(const r of data.gear){if(['wood','stone','leather'].includes(r.material))assert.deepEqual(r.prior,[],r.id);else if(r.material==='iron')assert(r.prior.length&&r.prior.every(p=>p.endsWith('@grassland')),r.id+' '+r.prior);else assert(r.prior.length&&r.prior.every(p=>p.endsWith('@cave')),r.id+' '+r.prior);}
 assert.equal(data.crown.C,'rockChickCrown');assert.equal(data.stem.out,'planks');
 pass('every iron gear recipe takes a 초원 resource (stick/fibre), every diamond gear recipe a 동굴 resource (iron ingot, the diamond helmet the cave boss crown)',data.gear.filter(r=>r.prior.length));

 const sim=await pc.evaluate(()=>{const B=Bloom,base=B.app.sim,sim=new B.Simulation(base.R,190725);try{
  const P=sim.addPlayer('probe'),run=n=>{for(let i=0;i<n;i++)sim.step({tick:sim.tick,inputs:[]});},set=(x,y,z,id)=>sim.terrain.set(x,y,z,B.BID[id]),out={};
  const outside={x:8.5,y:sim.terrain.height(8,8)+1.1,z:8.5};sim.physics.teleport(P,outside);
  // Gear factors and hazard by place and inventory.
  const at=(pos,setup)=>{const a={...P,pos,inventory:B.Inventory.empty()};setup(a.inventory);const s=B.Gear.status(a,sim.terrain);return[s.realm,s.gather,s.attack,s.taken,s.hazard];};
  const ring=sim.terrain.bossAnchor('ring'),fungal={x:ring.x+.5,y:ring.y+1,z:ring.z+.5},cave={x:0,y:-1,z:-56},grass={x:.5,y:5,z:.5};
  const kit=(mat,armor)=>i=>{i.slots[0]={id:mat+'_pick',count:1};i.slots[1]={id:mat+'_sword',count:1};for(const k of B.ARMOR_SLOTS??['helmet','chest','boots'])i.armor[k]={id:armor+'_'+k,count:1};};
  out.gear={caveBare:at(cave,()=>{}),caveIron:at(cave,kit('iron','iron')),caveDiamond:at(cave,kit('diamond','diamond')),caveIronNoHelmet:at(cave,i=>{kit('iron','iron')(i);i.armor.helmet=null;}),
   fungalIron:at(fungal,kit('iron','iron')),fungalDiamond:at(fungal,kit('diamond','diamond')),grassBare:at(grass,()=>{}),grassDiamond:at(grass,kit('diamond','diamond'))};
  // Combat: a bare-handed player strike in the cave deals ×0.4, a hit on a bare player there ×2.
  const target=sim.addCreature('rock-chick',{x:cave.x+1,y:cave.y,z:cave.z},'probe-structure');sim.physics.teleport(P,cave);
  const hp0=target.hp;B.Combat.hit(P.id,target,{damage:50,dir:{x:1,y:0,z:0},impulse:0},sim);const dealt=hp0-target.hp;
  P.combat.invul=0;const php=P.hp;B.Combat.hit(target.id,P,{damage:10,dir:{x:-1,y:0,z:0},impulse:0},sim);out.combat={dealt,taken:php-P.hp};
  // Hazard: 3 s bare in the cave drains 3 HP; worn iron armor stops it.
  sim.physics.removeBody(target);delete sim.actors[target.id];P.hp=100;P.combat.invul=0;run(ticksForMs(3000));out.cold=100-P.hp;
  for(const k of ['helmet','chest','boots'])P.inventory.armor[k]={id:'iron_'+k,count:1};P.hp=100;run(ticksForMs(3000));out.coldIron=100-P.hp;
  for(const k of ['helmet','chest','boots'])P.inventory.armor[k]=null;sim.physics.teleport(P,outside);run(2);
  // Mushroom blocks: a cap drops the cap block (+ a fruit 1 in 3), a stem drops the stem block.
  const caps={cap:0,food:0,stem:0,other:[]};for(let n=0;n<30;n++){for(const id of ['cap','stem']){set(20,12,20+n,id);sim.harvest(P,{x:20,y:12,z:20+n,id:B.BID[id],normal:{x:0,y:1,z:0}});}
   for(const d of Object.values(sim.drops)){if(d.item in caps)caps[d.item]+=d.count;else caps.other.push(d.item);sim.physics.removeBody(d);delete sim.drops[d.id];}sim.tick++;}
  out.caps=caps;
  // Labor pen on the flat spawn grass: fence ring, a chest, leaves; one adult root.
  for(let x=-4;x<=2;x++){set(x,5,-3,'fence');set(x,5,2,'fence');}for(let z=-3;z<=2;z++){set(-4,5,z,'fence');set(2,5,z,'fence');}
  set(-3,5,1,'storageChest');const chest=sim.chests['-3,5,1']={slots:Array(9).fill(null)};set(1,5,-2,'leaves');
  const u=sim.companions.hatch(P,{x:-1,y:5,z:0,species:'root'});u.stage='adult';
  for(let i=0;i<600&&!chest.slots.some(Boolean);i++)run(1);run(3);
  out.labor={chest:chest.slots.filter(Boolean),floor:Object.values(sim.drops).map(d=>d.item),regrow:Object.values(sim.regrow).map(g=>({key:g.key,id:B.BLOCKS[g.id].id,s:Math.round((g.tick-sim.tick)*B.CFG.stepMs/1000)}))};
  // A full chest: the unit harvests nothing more (or waits holding the yield) and nothing lands on the floor.
  for(let k=0;k<9;k++)chest.slots[k]={id:'dirt',count:64};for(const g of Object.values(sim.regrow))g.tick=sim.tick+1;run(ticksForMs(4000));
  out.full={task:u.task,cargo:u.cargo,activity:sim.companions.activity(u),floor:Object.values(sim.drops).map(d=>d.item),leaves:B.BLOCKS[sim.terrain.get(1,5,-2)].id};
  chest.slots[0]=null;for(let i=0;i<600&&!chest.slots.some(s=>s&&s.id!=='dirt');i++)run(1);run(3);out.resumed=chest.slots.filter(s=>s&&s.id!=='dirt');
  // Grade multiplier: gather ticks of one log for grades 1 and 4 (hardness 1500, root speed 2.5).
  const ticks=grade=>{u.grade=grade;set(1,5,-2,'log');for(const g of Object.values(sim.regrow))delete sim.regrow[g.key];for(let k=0;k<9;k++)chest.slots[k]=null;let n=0;for(let i=0;i<600;i++){run(1);if(u.phase==='gather')n++;else if(n)break;}return n;};
  out.gatherTicks={1:ticks(1),4:ticks(4)};out.expectTicks=Object.fromEntries([1,4].map(g=>{let p=0,n=0;while(p<1500){p+=B.CFG.stepMs*2.5*B.RANCH_RULES.laborGrade[g-1]/1000;n++;}return[g,n];}));
  return out;}finally{sim.free();}});
 assert.deepEqual(data.grade,[1000,1500,2250,3375]);
 assert.deepEqual(sim.gatherTicks,sim.expectTicks);assert(sim.gatherTicks[1]>=3*sim.gatherTicks[4]);
 pass('labor efficiency ×1.5 per grade above 1 (grade 4 ×3.375): one log takes '+sim.gatherTicks[1]+' gather ticks at grade 1 and '+sim.gatherTicks[4]+' at grade 4',{factors:data.grade,ticks:sim.gatherTicks});
 const G=sim.gear;
 assert.deepEqual(G.caveBare,['cave',350,400,2000,'cold']);assert.deepEqual(G.caveIron,['cave',1000,1000,1000,null]);assert.deepEqual(G.caveDiamond,['cave',1500,1600,600,null]);
 assert.deepEqual(G.caveIronNoHelmet,['cave',1000,1000,2000,'cold']);assert.deepEqual(G.fungalIron,['fungal',350,400,2000,'spore']);assert.deepEqual(G.fungalDiamond,['fungal',1000,1000,1000,null]);
 assert.deepEqual(G.grassBare,['grassland',1000,1000,1000,null]);assert.deepEqual(G.grassDiamond,['grassland',1500,1600,600,null]);
 assert.deepEqual(sim.combat,{dealt:20,taken:20});assert.equal(sim.cold,3);assert.equal(sim.coldIron,0);
 pass('gear factors by realm: cave bare ×0.35/×0.4/×2 + cold, iron normal, diamond ×1.5/×1.6/×0.6; fungal needs diamond (spore); a bare strike in the cave deals 50→20 and takes 10→20; cold drains 1 HP/s, iron armor stops it',{gear:G,combat:sim.combat,cold:sim.cold});
 assert.equal(sim.caps.cap,30);assert.equal(sim.caps.stem,30);assert(sim.caps.food>=5&&sim.caps.food<=15,'cap fruit '+sim.caps.food);assert.deepEqual(sim.caps.other,[]);
 pass('breaking a mushroom cap drops the cap block (fruit 1 in 3: '+sim.caps.food+'/30) and a stem drops the stem block',sim.caps);
 const items=sim.labor.chest.map(s=>s.id).sort();assert(items.includes('seed')&&items.includes('leaves'),JSON.stringify(sim.labor));assert.deepEqual(sim.labor.floor,[]);assert(sim.labor.regrow.length===1&&sim.labor.regrow[0].id==='leaves'&&sim.labor.regrow[0].s<=20&&sim.labor.regrow[0].s>=12,JSON.stringify(sim.labor.regrow));
 assert.deepEqual(sim.full.floor,[]);assert(sim.full.task==='full'&&sim.full.activity.includes('가득'),JSON.stringify(sim.full));assert(sim.resumed.length>0);
 pass('one labor harvest puts every drop into the chest (leaves → '+items.join(' + ')+'), nothing on the floor; with the chest full the unit stops and waits, and resumes when a slot frees',{labor:sim.labor,full:sim.full,resumed:sim.resumed});

 // Reachability of the whole progression on seed 190725, without debug: count the blocks it needs around spawn and the
 // three boss structures (ore bands are deterministic from the seed). Needs: 27 iron ore (iron tier + diamond handles),
 // 22 diamonds (diamond pick, sword and armor), coal to smelt and light, wood (mushroom stems or logs; seed 190725's spawn
 // is ringed by 균사 정원 and desert, so its first wood is mushroom stems) and leaves for the iron armor's fibre.
 const reach=await pc.evaluate(()=>{const B=Bloom,w=new B.VoxelWorld(190725),ids=['coalOre','ironOre','goldOre','diamondOre','leaves','log','cap','stem'];
  // Trees and mushrooms within 100 m of spawn (the surface band above each column).
  const plants=(()=>{const n={log:0,leaves:0,stem:0,cap:0,nearestLeaves:Infinity};for(let x=-100;x<=100;x++)for(let z=-100;z<=100;z++){const h=w.height(x,z);for(let y=h+1;y<=h+8;y++){const id=B.BLOCKS[w.get(x,y,z)].id;if(id in n){n[id]++;if(id==='leaves')n.nearestLeaves=Math.min(n.nearestLeaves,Math.round(Math.hypot(x,z)));}}}return n;})();
  const count=(cx,cz,r,y0,y1)=>{const n=Object.fromEntries(ids.map(id=>[id,0]));for(let x=cx-r;x<=cx+r;x++)for(let z=cz-r;z<=cz+r;z++){const top=Math.min(y1,w.height(x,z)+8);for(let y=y0;y<=top;y++){const id=B.BLOCKS[w.get(x,y,z)].id;if(id in n)n[id]++;}}return n;};
  const grove=w.bossAnchor('grove'),ring=w.bossAnchor('ring'),dungeon=w.structuresNear({x:0,y:0,z:0},160).find(s=>s.type==='dungeon'),d=s=>Math.round(Math.hypot(s.x,s.z));
  return{plants,spawn:count(0,0,40,-31,24),dungeon:{at:[dungeon.x,dungeon.y,dungeon.z],distance:d(dungeon),...count(dungeon.x,dungeon.z,24,-31,24)},ring:{at:[ring.x,ring.y,ring.z],distance:d(ring),...count(ring.x,ring.z,24,-31,24)},grove:{at:[grove.x,grove.y,grove.z],distance:d(grove),...count(grove.x,grove.z,24,-31,24)},
   startCave:(()=>{let iron=0;for(let x=-8;x<=8;x++)for(let z=-70;z<=-20;z++)for(let y=-12;y<=6;y++)if(w.get(x,y,z)===B.BID.ironOre)iron++;return iron;})()};});
 const need={ironOre:27,diamondOre:22,coalOre:8,leaves:4};
 assert(reach.spawn.ironOre>=need.ironOre&&reach.startCave>=6,'iron near spawn: '+JSON.stringify(reach));
 assert(reach.spawn.diamondOre+reach.dungeon.diamondOre>=need.diamondOre,'diamond near spawn/dungeon: '+JSON.stringify(reach));
 assert(reach.spawn.coalOre>=need.coalOre&&reach.plants.leaves>=need.leaves&&reach.plants.stem+reach.plants.log>=8,'coal/wood near spawn: '+JSON.stringify(reach));
 assert(reach.dungeon.distance<=160&&reach.ring.distance<=160&&reach.grove.distance<=160);assert(reach.ring.cap>=8&&reach.ring.stem>=4);
 report.reachability=reach;pass('seed 190725 has the whole progression within reach: spawn ±40 m has '+reach.spawn.ironOre+' iron / '+reach.spawn.diamondOre+' diamond / '+reach.spawn.coalOre+' coal ore, the dungeon (cave boss, '+reach.dungeon.distance+' m) ±24 m '+reach.dungeon.diamondOre+' diamond ore; within 100 m '+reach.plants.stem+' stems / '+reach.plants.log+' logs / '+reach.plants.leaves+' leaves (nearest '+reach.plants.nearestLeaves+' m)',reach);

 // ---- 2. Browser input on the live game ----
 await pc.click('#menu-btn');await pc.fill('#seed-input','190725');await pc.click('#new-world');await pause(pc,1500);
 // 2a. A fence row stops walking and jumping; a cobble row of the same height is climbed by the auto step.
 const crossRow=async(id)=>{await pc.evaluate(id=>{const sim=Bloom.app.sim;for(let x=-3;x<=3;x++){sim.terrain.set(x,5,-3,0);sim.terrain.set(x,5,-3,Bloom.BID[id]);}},id);
  await teleport(pc,{x:.5,y:5.05,z:.5});await pause(pc,400);await pc.evaluate(()=>{window.__track={minZ:Infinity,maxY:-Infinity};window.__trackTimer=setInterval(()=>{const a=Bloom.app.actor();window.__track.minZ=Math.min(window.__track.minZ,a.pos.z);window.__track.maxY=Math.max(window.__track.maxY,a.pos.y);},16);});
  await pc.locator('#world').focus();await pc.keyboard.down('KeyW');for(let n=0;n<6;n++){await pc.keyboard.down('Space');await pause(pc,260);await pc.keyboard.up('Space');await pause(pc,240);}await pc.keyboard.up('KeyW');
  const t=await pc.evaluate(()=>{clearInterval(window.__trackTimer);return window.__track;});await pc.evaluate(()=>{const sim=Bloom.app.sim;for(let x=-3;x<=3;x++)sim.terrain.set(x,5,-3,0);});return t;};
 const fenceRun=await crossRow('fence'),cobbleRun=await crossRow('cobble');
 assert(fenceRun.minZ>=-2+PLAYER_R-.02,'fence crossed: '+JSON.stringify(fenceRun));assert(fenceRun.maxY>6.2,'never jumped above the fence voxel: '+JSON.stringify(fenceRun));assert(cobbleRun.minZ< -3,'cobble not climbed: '+JSON.stringify(cobbleRun));
 pass('holding W and jumping into a fence row never crosses it, though the jumps lift the feet to '+fenceRun.maxY.toFixed(2)+' (fence voxel top 6; min z '+fenceRun.minZ.toFixed(2)+'); the same row of cobble is climbed',{fenceRun,cobbleRun});

 // 2b. Cave bare-handed: the HUD names the three short slots and their costs; the screen edge turns cold blue.
 await teleport(pc,{x:0,y:-1,z:-56});await pause(pc,3000);const bare=await gearHUD(pc);await shot(pc,'01-cave-without-iron');
 assert.deepEqual(bare.chips.map(c=>[c.slot,c.kind]),[['pick','below'],['weapon','below'],['armor','below']]);assert(bare.title.includes('동굴')&&bare.title.includes('철')&&bare.title.includes('페널티'));
 assert(bare.chips[0].text.includes('×0.35')&&bare.chips[1].text.includes('×0.4')&&bare.chips[2].text.includes('×2')&&bare.chips[2].text.includes('추위'));assert(bare.body.includes('hazard-cold'));
 await pause(pc,2100);const drained=await gearHUD(pc);assert(drained.hp<=bare.hp-2,'cold drain '+bare.hp+' → '+drained.hp);
 pass('entering the cave bare-handed: the HUD shows 곡괭이 ×0.35, 무기 ×0.4, 방어구 ×2 + 추위, a blue edge, and HP drains',{bare:bare.chips.map(c=>c.text),title:bare.title,hp:[bare.hp,drained.hp]});
 // Iron pick and sword into the hotbar, iron armor equipped by clicking the bag slot then the armor slot (inventory UI).
 await give(pc,[['iron_pick',1],['iron_sword',1],['iron_helmet',1],['iron_chest',1],['iron_boots',1]]);
 await pc.keyboard.press('Tab');await pc.waitForFunction(()=>!document.querySelector('#inventory').hidden);
 for(const part of ['helmet','chest','boots']){const k=await pc.evaluate(part=>Bloom.app.actor().inventory.slots.findIndex(s=>s?.id==='iron_'+part),part);
  await pc.locator((k<9?'#inventory-hotbar':'#inventory-grid')+' [data-area="bag"][data-index="'+k+'"]').click();await pc.locator('#armor-slots [data-area="armor"][data-index="'+part+'"]').click();
  await pc.waitForFunction(part=>Bloom.app.actor().inventory.armor[part]?.id==='iron_'+part,part,{timeout:3000});}
 await pc.keyboard.press('Tab');await pause(pc,700);const iron=await gearHUD(pc);await shot(pc,'02-cave-with-iron');
 assert.deepEqual(iron.chips,[]);assert(iron.title.includes('✓'));assert(!iron.body.includes('hazard'));assert.deepEqual([iron.status.gather,iron.status.attack,iron.status.taken,iron.status.hazard],[1000,1000,1000,null]);
 await pause(pc,1500);assert.equal((await gearHUD(pc)).hp,iron.hp);
 // Taking the helmet off brings the armor penalty and the cold back.
 await pc.keyboard.press('Tab');await pc.locator('#armor-slots [data-area="armor"][data-index="helmet"]').click();await pc.locator('#inventory-grid [data-area="bag"]:not([data-item])').first().click();await pc.keyboard.press('Tab');
 await pc.waitForFunction(()=>!Bloom.app.actor().inventory.armor.helmet);await pause(pc,400);const noHelmet=await gearHUD(pc);
 assert.deepEqual(noHelmet.chips.map(c=>c.slot),['armor']);assert(noHelmet.chips[0].text.includes('2/3')&&noHelmet.body.includes('hazard-cold'));
 pass('equipping iron (pick and sword in the hotbar, three armor pieces through the inventory UI) clears every penalty and the drain; taking the helmet off brings back 방어구 2/3 ×2 + 추위',{iron:iron.title,noHelmet:noHelmet.chips.map(c=>c.text)});

 // 2c. The fungal forest with iron gear (no diamond): every slot is short, spore poison drains.
 const fungal=await pc.evaluate(()=>{const sim=Bloom.app.sim,ring=sim.terrain.bossAnchor('ring');for(let r=6;r<=30;r+=2)for(let k=0;k<16;k++){const a=k*Math.PI/8,x=Math.floor(ring.x+Math.cos(a)*r),z=Math.floor(ring.z+Math.sin(a)*r),h=sim.terrain.height(x,z);if(sim.terrain.realm(x+.5,h+1,z+.5)!=='fungal'||[1,2,3].some(dy=>sim.terrain.get(x,h+dy,z)))continue;return{x:x+.5,y:h+1.05,z:z+.5,yaw:Math.atan2(-(ring.x-x),-(ring.z-z))};}return null;});
 assert(fungal,'no fungal surface spot');await pc.keyboard.press('Tab');await pc.locator('#inventory-grid [data-area="bag"][data-item="iron_helmet"]').click();await pc.locator('#armor-slots [data-area="armor"][data-index="helmet"]').click();await pc.keyboard.press('Tab');
 await teleport(pc,fungal);await pause(pc,1800);const spore=await gearHUD(pc);await shot(pc,'03-fungal-without-diamond');
 assert.deepEqual(spore.chips.map(c=>[c.slot,c.kind]),[['pick','below'],['weapon','below'],['armor','below']]);assert(spore.title.includes('균류 숲')&&spore.title.includes('다이아몬드'));assert(spore.chips[2].text.includes('포자 독')&&spore.body.includes('hazard-spore'));
 assert(spore.chips[0].text.includes('철 곡괭이'));
 pass('the fungal forest with iron gear: 곡괭이/무기/방어구 below 다이아몬드 with 포자 독 and a yellow-green edge',{title:spore.title,chips:spore.chips.map(c=>c.text)});

 // 2d. The recipe card of the diamond helmet names the cave boss crown as a 동굴 resource; it crafts.
 await teleport(pc,{x:.5,y:5.05,z:.5});await pause(pc,500);await give(pc,[['workbench',1],['diamond',5],['rockChickCrown',1]]);
 await hold(pc,'workbench');await placeOn(pc,0,5,-2,'workbench');assert(await aimAt(pc,{x:0,y:5,z:-2},{x:0,y:1,z:0}),'aim workbench');await pc.keyboard.press('KeyF');
 await pc.waitForFunction(()=>!document.querySelector('#inventory').hidden&&document.querySelector('#station-name').textContent.includes('제작대'),null,{timeout:4000});
 await pc.locator('[data-recipe="diamond_helmet"]').click();await pc.waitForFunction(()=>Bloom.Inventory.result(Bloom.app.actor(),Bloom.app.sim)?.recipe.id==='diamond_helmet',null,{timeout:3000});
 await pause(pc,200);const card=await pc.evaluate(()=>document.querySelector('#recipe-detail').textContent);await shot(pc,'04-recipe-card-crown');
 assert(card.includes('금광석 왕관 ×1 (동굴 자원)')&&card.includes('다이아몬드 ×5'),card);
 await pc.locator('#craft-result').click();await pc.waitForFunction(()=>Bloom.app.actor().inventory.cursor?.id==='diamond_helmet',null,{timeout:3000});
 await pc.locator('[data-recipe="iron_sword"]').click();const ironCard=await pc.evaluate(()=>document.querySelector('#recipe-detail').textContent);assert(ironCard.includes('나뭇가지 ×1 (초원 자원)'),ironCard);
 await pc.keyboard.press('Tab');
 pass('the diamond helmet recipe card shows "금광석 왕관 ×1 (동굴 자원)" and crafts from 5 diamonds + the cave boss crown; the iron sword card tags the stick as a 초원 resource',{card,ironCard});

 // 2e. A snail farm built from placed mushroom caps: a fence ring (terrain edits), a chest and three caps placed by
 // right-click, a snail egg hatched in it and grown (debug), which then harvests the caps into the chest.
 await teleport(pc,{x:-.5,y:5.05,z:-.5});await pause(pc,400);
 await pc.evaluate(()=>{const sim=Bloom.app.sim,s=(x,z,id)=>sim.terrain.set(x,5,z,Bloom.BID[id]);for(let x=-5;x<=3;x++){s(x,-4,'fence');s(x,3,'fence');}for(let z=-4;z<=3;z++){s(-5,z,'fence');s(3,z,'fence');}sim.terrain.set(0,5,-2,0);});
 await pc.locator('#debug-kit').dispatchEvent('click');await pc.locator('#debug-ranch').dispatchEvent('click');await give(pc,[['storageChest',1]]);
 await hold(pc,'storageChest');await placeOn(pc,-3,5,-2,'storageChest');await hold(pc,'cap');for(const [x,z]of [[1,-2],[1,1],[-3,1]])await placeOn(pc,x,5,z,'cap');
 await hold(pc,'mushroomSnailEgg');await placeOn(pc,-1,5,1,'mushroomSnailEgg');await pc.evaluate(()=>{const sim=Bloom.app.sim;for(const e of Object.values(sim.eggs))e.hatchTick=sim.tick+20;});
 await pc.waitForFunction(()=>Bloom.app.sim.companions.all().some(u=>u.kind==='mushroom-snail'),null,{timeout:6000});await pc.locator('#debug-adult').dispatchEvent('click');
 const pen=await pc.evaluate(()=>{const u=Bloom.app.sim.companions.all().find(u=>u.kind==='mushroom-snail'),r=Bloom.app.sim.ranch.region(u.cell.x,u.cell.y,u.cell.z);return{open:r.open,cells:r.cells.size,unit:u.id};});assert(!pen.open,'farm pen open: '+JSON.stringify(pen));
 await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.phase==='gather',pen.unit,{timeout:20000});
 await pc.waitForFunction(()=>Bloom.app.sim.chests['-3,5,-2']?.slots.some(s=>s?.id==='cap'),null,{timeout:20000});
 // Review shot: stand south of the pen, outside the fence, looking at the snail.
 await teleport(pc,{x:-.5,y:5.05,z:4.6});await pc.waitForFunction(()=>!document.querySelector('#toast').classList.contains('show'),null,{timeout:6000});
 await pc.evaluate(()=>Bloom.app.renderer.setZoom(6));await pause(pc,500);await shot(pc,'05-snail-cap-farm');
 report.farmShot=await pc.evaluate(id=>{const u=Bloom.app.sim.companions.data.units[id];return{pos:u.pos,task:u.task,phase:u.phase,sample:Bloom.app.renderer.unitRig.samples.find(s=>s.key===id)||null};},pen.unit);
 const farm=await pc.evaluate(()=>({chest:Bloom.app.sim.chests['-3,5,-2'].slots.filter(Boolean),regrow:Object.values(Bloom.app.sim.regrow).map(g=>[g.key,Bloom.BLOCKS[g.id].id]),floor:Object.values(Bloom.app.sim.drops).map(d=>d.item)}));
 assert(farm.regrow.some(([,id])=>id==='cap'));assert(!farm.floor.includes('cap'));
 pass('a snail farm from placed mushroom caps: the adult snail harvests a placed cap into the chest and the cap regrows',{pen,farm});

 assert.deepEqual(errors,[]);
 Object.assign(report,{result:'PASS',elapsedMs:Date.now()-began,errors});console.log(JSON.stringify({result:'PASS',checks:report.checks.length,elapsedMs:report.elapsedMs,reachability:{spawn:report.reachability.spawn,dungeon:report.reachability.dungeon.diamondOre}}));
}catch(error){Object.assign(report,{result:'FAIL',elapsedMs:Date.now()-began,error:error.stack,errors});console.error(error);process.exitCode=1;}
finally{if(process.env.TEST_REPORT)fs.writeFileSync(process.env.TEST_REPORT,JSON.stringify(report,null,2)+'\n');await browser?.close();server?.close();clearTimeout(timeout);}
