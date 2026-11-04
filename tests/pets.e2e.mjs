import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {CURSOR_HELPERS} from './cursor-helpers.mjs';

// Pets (0.41.0, D-227): the Minecraft wolf level. A new player starts with an adult root that follows and fights on its own;
// a wild creature is tamed by feeding it its food with a real right click (3 times), a tamed baby grows up by being fed
// (3 times), a right click with an empty hand makes a pet sit, a fallen pet is gone for good, and pets
// survive a save and load. Fixtures (direct state writes): placing a wild creature or a hostile one near the player, killing a
// pet (its removal timer is shortened), and moving the food into the hotbar. Every aim is the mouse cursor on
// the creature (found with the game's own pick, tests/cursor-helpers.mjs); walking uses WASD.
const began=Date.now(),report={checks:[]},errors=[],SHOTS=process.env.SHOTS||null;
let browser,server;
const timeout=setTimeout(()=>{console.error('pets E2E exceeded 180 seconds');process.exit(1)},180000);
const pass=(name,evidence)=>{const s=Math.round((Date.now()-began)/1000);report.checks.push({name,evidence,s});console.log('PASS '+s+'s '+name)};
const boot=p=>p.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});
const pause=(p,ms)=>p.waitForTimeout(ms);
const shot=async(p,name)=>{if(!SHOTS)return;fs.mkdirSync(SHOTS,{recursive:true});await p.screenshot({path:SHOTS+'/'+name+'.png'});};
const pets=p=>p.evaluate(()=>Object.values(Bloom.app.sim.actors).filter(a=>a.ownerId).sort((a,b)=>a.id<b.id?-1:1).map(a=>({id:a.id,kind:a.speciesId,stage:a.petStage,hp:a.hp,max:a.maxHp,sit:a.sit,dead:a.dead,fed:a.fed,d:+Math.hypot(a.pos.x-Bloom.app.actor().pos.x,a.pos.z-Bloom.app.actor().pos.z).toFixed(2)})));
// Put the cursor on creature `id` and wait until the simulation's own aim (from the input packet) names it.
async function aimAt(p,id){for(let i=0;i<20;i++){const at=await p.evaluate(id=>window.__entityScreen(id),id);if(at){await p.mouse.move(at.x,at.y);
  const ok=await p.waitForFunction(id=>Bloom.app.sim.aimedCreature(Bloom.app.actor())?.id===id,id,{timeout:900}).then(()=>true,()=>false);if(ok)return at;}await pause(p,120);}
 return null;}
const hold=async(p,item)=>{await p.evaluate(item=>{const a=Bloom.app.actor(),i=a.inventory,idx=i.slots.findIndex(s=>s?.id===item);if(idx<0)throw Error('no '+item);if(idx>8){const t=i.slots[8];i.slots[8]=i.slots[idx];i.slots[idx]=t;}},item);
 const slot=await p.evaluate(item=>Bloom.app.actor().inventory.slots.findIndex(s=>s?.id===item),item);await p.keyboard.press('Digit'+(slot+1));await p.waitForFunction(i=>Bloom.app.actor().inventory.selected===i,slot,{timeout:3000});};
const count=(p,item)=>p.evaluate(item=>Bloom.Inventory.count(Bloom.app.actor().inventory,item),item);

try{
 server=http.createServer(serveStatic);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});report.browser=browser.version();
 const page=await browser.newPage({viewport:{width:1366,height:768}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text().slice(0,200));});await page.addInitScript(CURSOR_HELPERS);
 await page.goto('http://127.0.0.1:'+server.address().port+'/?debug=1&seed=190725',{timeout:45000});await boot(page);
 await page.waitForFunction(()=>{const r=Bloom.app.renderer;return r.streamComplete&&r.readyChunks.size===r.visibleChunks.size;},null,{timeout:30000}).catch(()=>{});
 await page.evaluate(()=>{const sim=Bloom.app.sim,log=window.__petEvents=[],emit=sim.emit.bind(sim);sim.emit=(type,actor,data={})=>{if(!sim.silent&&type.startsWith('pet-')||type==='tame-progress'||type==='attack-hit')log.push({type,id:actor?.id,sourceId:data.sourceId,fed:data.fed});return emit(type,actor,data);};});

 // 1. The first pet.
 const first=await pets(page);assert.equal(first.length,1);assert.equal(first[0].kind,'root');assert.equal(first[0].stage,'adult');assert(first[0].d<3,JSON.stringify(first));
 await shot(page,'01-start');
 pass('a new player starts with one adult root pet beside them',first[0]);

 // 2. It follows.
 await page.locator('#world').focus();await page.keyboard.down('KeyW');await pause(page,2600);await page.keyboard.up('KeyW');await pause(page,1500);
 const after=await pets(page);assert(after[0].d<7,'the pet did not follow: '+JSON.stringify(after));
 pass('walking away, the pet follows (loosely: it starts when the owner is 5 m away) and stays within '+after[0].d+' m',after[0]);

 // 3. It fights hostile creatures near its owner on its own.
 const foe=await page.evaluate(()=>{const s=Bloom.app.sim,a=Bloom.app.actor(),w=s.addCreature('root',{x:a.pos.x+3,y:a.pos.y+1,z:a.pos.z-3});w.wildState='retaliating';w.enemy=true;w.targetId=a.id;w.hp=w.maxHp=60;return w.id;});
 const fought=await page.waitForFunction(id=>{const w=Bloom.app.sim.actors[id];return !w||w.dead||w.hp<w.maxHp;},foe,{timeout:12000}).then(()=>true,()=>false);assert(fought,'the pet never hurt the hostile creature');
 const hitBy=await page.evaluate(()=>window.__petEvents.filter(e=>e.type==='attack-hit').map(e=>e.sourceId));assert(hitBy.some(id=>id.startsWith('pet:')),'no pet hit: '+JSON.stringify(hitBy));
 await page.waitForFunction(id=>!Bloom.app.sim.actors[id]||Bloom.app.sim.actors[id].dead,foe,{timeout:25000});
 await shot(page,'02-fight');
 pass('a hostile creature near the owner is fought and killed by the pet without any command',{hitBy:[...new Set(hitBy)]});

 // 4. Friendly fire: the owner and a pet never hurt each other.
 const friendly=await page.evaluate(()=>{const s=Bloom.app.sim,a=Bloom.app.actor(),p=Object.values(s.actors).find(x=>x.ownerId);const hp=[a.hp,p.hp],payload={damage:30,impulse:4,dir:{x:1,y:0,z:0},weapon:'fist',sequence:1};
  const r=[Bloom.Combat.hit(a.id,p,payload,s),Bloom.Combat.hit(p.id,a,payload,s)];return{r,same:[a.hp,p.hp].every((v,i)=>v===hp[i])};});
 assert.deepEqual(friendly,{r:[false,false],same:true});
 pass('the owner and its pet cannot hurt each other',friendly);

 // 5. Taming: feed a wild root its fruit with real right clicks. (Fixture: the first pet sits 8 m away so it never stands
 // between the cursor and the creature being fed.)
 await page.evaluate(()=>{const s=Bloom.app.sim,a=Bloom.app.actor(),p=s.petsOf(a.id)[0];p.sit=true;s.physics.teleport(p,{x:a.pos.x+8,y:a.pos.y+.3,z:a.pos.z+8});});
 await pause(page,500);
 const wild=await page.evaluate(()=>{const s=Bloom.app.sim,a=Bloom.app.actor(),w=s.addCreature('root',{x:a.pos.x-2.2*Math.sin(Bloom.app.renderer.camera.yaw),y:a.pos.y+.6,z:a.pos.z-2.2*Math.cos(Bloom.app.renderer.camera.yaw)});w.ai.cooldown=1e9;w.homePos={...w.pos};return w.id;});
 await page.locator('#debug-kit').dispatchEvent('click');await hold(page,'food');const foodBefore=await count(page,'food');
 for(let i=1;i<=3;i++){const at=await aimAt(page,wild);assert(at,'cannot aim at the wild creature');await page.mouse.click(at.x,at.y,{button:'right'});
  await page.waitForFunction(({id,i})=>{const w=Bloom.app.sim.actors[id];return w.ownerId?i===3:(w.fed||0)===i;},{id:wild,i},{timeout:3000});await pause(page,250);}
 const tamed=await page.evaluate(id=>{const w=Bloom.app.sim.actors[id];return{owner:w.ownerId,stage:w.petStage,state:w.wildState,hp:w.hp,max:w.maxHp};},wild);
 assert.equal(tamed.owner,'local');assert.equal(tamed.stage,'baby');assert.equal(await page.evaluate(id=>Bloom.app.sim.actors[id].sit,wild),true,'a tamed pet waits where it is');assert.equal(await count(page,'food'),foodBefore-3);
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('펫이 됐어요')||window.__petEvents.some(e=>e.type==='pet-tamed'),null,{timeout:3000});
 await shot(page,'03-tamed');
 pass('three right clicks with its fruit tame a wild root into a baby pet that waits where it is (3 fruit used)',tamed);

 // 6. Raising: a baby grows up by being fed three times.
 for(let i=1;i<=3;i++){const at=await aimAt(page,wild);assert(at,'cannot aim at the baby pet');await page.mouse.click(at.x,at.y,{button:'right'});
  await page.waitForFunction(({id,i})=>{const w=Bloom.app.sim.actors[id];return i===3?w.petStage==='adult':(w.fed||0)===i;},{id:wild,i},{timeout:3000});await pause(page,250);}
 const grown=await page.evaluate(id=>{const w=Bloom.app.sim.actors[id];return{stage:w.petStage,hp:w.hp,max:w.maxHp};},wild);assert.equal(grown.stage,'adult');assert.equal(grown.hp,grown.max);assert(grown.max>tamed.max);
 pass('feeding the baby three times grows it into an adult (more health)',{before:tamed,after:grown});

 await page.evaluate(()=>{const s=Bloom.app.sim,a=Bloom.app.actor();for(const p of s.petsOf(a.id))p.sit=false;});
 // 7. At most CFG.pets.max pets: one more wild creature stays wild.
 const extra=await page.evaluate(()=>{const s=Bloom.app.sim,a=Bloom.app.actor(),w=s.addCreature('root',{x:a.pos.x+2.2*Math.sin(Bloom.app.renderer.camera.yaw),y:a.pos.y+.6,z:a.pos.z+2.2*Math.cos(Bloom.app.renderer.camera.yaw)});w.ai.cooldown=1e9;w.homePos={...w.pos};
  const owner=a;while(s.petsOf(owner.id).length<Bloom.CFG.pets.max)s.addPet(owner,'rock-chick','adult');return w.id;});
 await page.evaluate(()=>{Bloom.app.renderer.camera.yaw+=Math.PI;});await pause(page,500);
 const atFull=await aimAt(page,extra);if(atFull){await page.mouse.click(atFull.x,atFull.y,{button:'right'});await pause(page,400);}
 const fullState=await page.evaluate(id=>({owner:Bloom.app.sim.actors[id].ownerId,pets:Bloom.app.sim.petsOf('local').length}),extra);assert.equal(fullState.owner,null);assert.equal(fullState.pets,await page.evaluate(()=>Bloom.CFG.pets.max));
 pass('at the pet limit one more wild creature cannot be tamed',fullState);
 await page.evaluate(()=>{const s=Bloom.app.sim;for(const p of s.petsOf('local').filter(p=>p.speciesId==='rock-chick')){s.physics.removeBody(p);delete s.actors[p.id];}const w=Object.values(s.actors).filter(a=>a.speciesId&&!a.ownerId&&!a.boss);for(const x of w){s.physics.removeBody(x);delete s.actors[x.id];}});

 // 7b. The shepherd's staff (D-247): right click musters the nearest n pets within range (stone: 2 within 16 m; n is 1/2/4/8 by material), the same click
 // again sends them to wait, and a strike with it sends the following pets at the target. Fixture: five waiting pets at known
 // distances (one out of range) and a stone staff in the bag.
 await page.evaluate(()=>{const s=Bloom.app.sim,a=Bloom.app.actor();for(const p of Object.values(s.actors).filter(x=>x.ownerId)){s.physics.removeBody(p);delete s.actors[p.id];}
  for(const [i,d] of [3,5,7,9,20].entries()){const p=s.addPet(a,'root','adult',{x:a.pos.x+d,y:a.pos.y+.3,z:a.pos.z+Math.sin(i)*.5});s.petWaitHere(p);}
  Bloom.Inventory.addTo(a.inventory.slots,'stone_staff',1);});
 await hold(page,'stone_staff');await page.evaluate(()=>{Bloom.app.renderer.camera.yaw=0;});
 const state=()=>page.evaluate(()=>{const a=Bloom.app.actor();return Bloom.app.sim.petsOf(a.id).map(p=>({d:Math.round(Math.hypot(p.pos.x-a.pos.x,p.pos.z-a.pos.z)),sit:p.sit,id:p.id})).sort((x,y)=>x.id<y.id?-1:1);});
 await page.mouse.click(683,300,{button:'right'});await page.waitForFunction(()=>Bloom.app.sim.petsOf('local').filter(p=>!p.sit).length===2,null,{timeout:3000});
 const mustered=await state();assert.deepEqual(mustered.map(p=>!p.sit),[true,true,false,false,false],JSON.stringify(mustered));
 await page.mouse.click(683,300,{button:'right'});await page.waitForFunction(()=>Bloom.app.sim.petsOf('local').every(p=>p.sit),null,{timeout:3000});
 await page.mouse.click(683,300,{button:'right'});await page.waitForFunction(()=>Bloom.app.sim.petsOf('local').filter(p=>!p.sit).length===2,null,{timeout:3000});
 await pause(page,1500);
 const wildFoe=await page.evaluate(()=>{const s=Bloom.app.sim,a=Bloom.app.actor(),w=s.addCreature('root',{x:a.pos.x,y:a.pos.y+.6,z:a.pos.z-2.4});w.ai.cooldown=1e9;w.homePos={...w.pos};return w.id;});
 const hitAt=await aimAt(page,wildFoe);assert(hitAt,'cannot aim at the target');await page.mouse.move(hitAt.x,hitAt.y);
 for(let i=0;i<4;i++){await page.mouse.down();await pause(page,60);await page.mouse.up();await pause(page,350);if(!await page.evaluate(id=>Bloom.app.sim.actors[id]?.enemy===true,wildFoe))continue;break;}
 const focused=await page.waitForFunction(id=>Bloom.app.sim.petsOf('local').filter(p=>!p.sit).some(p=>p.petTargetId===id),wildFoe,{timeout:4000}).then(()=>true,()=>false);assert(focused,'the staff strike did not send the pets at the target');
 await page.evaluate(id=>{const s=Bloom.app.sim,w=s.actors[id];if(w){s.physics.removeBody(w);delete s.actors[w.id];}for(const p of s.petsOf('local')){s.physics.removeBody(p);delete s.actors[p.id];}const a=Bloom.app.actor();s.addPet(a,'root','adult');},wildFoe);
 pass('a stone staff right click musters the 2 nearest pets within 16 m and the rest wait, the same click sends them back to wait, and a staff strike sends the following pets at its target',{mustered});

 // 8. Sit: an empty-hand right click on the pet.
 await page.evaluate(()=>{Bloom.app.renderer.camera.yaw=0;});
 await page.keyboard.press('Digit9');await page.waitForFunction(()=>Bloom.app.actor().inventory.selected===8,null,{timeout:2000});
 await page.evaluate(()=>{const a=Bloom.app.actor();a.inventory.slots[8]=null;});
 const petId=(await pets(page))[0].id;
 const at=await aimAt(page,petId);assert(at,'cannot aim at the pet');await page.mouse.click(at.x,at.y,{button:'right'});
 await page.waitForFunction(id=>Bloom.app.sim.actors[id].sit===true,petId,{timeout:3000});
 await page.keyboard.down('KeyS');await pause(page,2200);await page.keyboard.up('KeyS');await pause(page,800);
 const stayed=await pets(page);assert(stayed.find(p=>p.id===petId).d>4,'the sitting pet followed: '+JSON.stringify(stayed));
 await shot(page,'04-sitting');
 await page.evaluate(id=>{const s=Bloom.app.sim,p=s.actors[id];s.physics.teleport(Bloom.app.actor(),{x:p.pos.x,y:p.pos.y+.05,z:p.pos.z+2.6});},petId);await pause(page,700);
 const at2=await aimAt(page,petId);assert(at2);await page.mouse.click(at2.x,at2.y,{button:'right'});await page.waitForFunction(id=>Bloom.app.sim.actors[id].sit===false,petId,{timeout:3000});
 pass('an empty-hand right click makes a pet sit (it stays put while the owner walks away) and another makes it follow again',{distanceWhileSitting:stayed.find(p=>p.id===petId).d});

 // 9. A pet that falls is gone for good (no revive, no loot).
 const before=(await pets(page)).length;
 const fell=await page.evaluate(id=>{const s=Bloom.app.sim,p=s.actors[id],drops=Object.keys(s.drops).length;s.kill(p,null);p.respawn=300;return{dead:p.dead,body:p.body,drops:Object.keys(s.drops).length-drops};},petId);assert.equal(fell.dead,true);assert.equal(fell.body,null);assert.equal(fell.drops,0);
 await page.waitForFunction(id=>!Bloom.app.sim.actors[id],petId,{timeout:8000});
 const left=await pets(page);assert.equal(left.length,before-1);assert(!left.some(p=>p.id===petId));
 await page.waitForFunction(()=>window.__petEvents.some(e=>e.type==='pet-died'),null,{timeout:3000});
 pass('a pet that falls is gone for good: it leaves with its death animation, drops nothing, and does not stand up again',{before,after:left.length});

 // 10. Save and load keep the pets.
 const saved=await page.evaluate(()=>{const s=Bloom.app.sim,before=Object.values(s.actors).filter(a=>a.ownerId).map(a=>[a.id,a.speciesId,a.petStage,a.sit,a.ownerId]).sort();const bytes=s.save();s.load(bytes);
  for(let i=0;i<30;i++)s.step({tick:s.tick,inputs:[]});const after=Object.values(s.actors).filter(a=>a.ownerId).map(a=>[a.id,a.speciesId,a.petStage,a.sit,a.ownerId]).sort();return{before,after,bodies:Object.values(s.actors).filter(a=>a.ownerId).every(a=>a.body!==null)};});
 assert.deepEqual(saved.after,saved.before);assert.equal(saved.bodies,true);
 pass('save and load keep every pet (species, stage, sitting, owner) and give it a body again',saved);

 // 11. An old save: units and eggs become pets; egg blocks and potions are retired.
 const legacy=await page.evaluate(()=>{const s=Bloom.app.sim,meta={companions:{units:{'unit:2':{id:'unit:2',owner:'local',kind:'rock-chick',stage:'baby',body:null},'unit:1':{id:'unit:1',owner:'local',kind:'mushroom-snail',stage:'adult',body:null}}},eggs:[{x:1,y:5,z:1}],regrow:[],projectiles:[{id:'shot:1',potion:true,body:7,collider:8},{id:'shot:2',body:9,collider:10}],retiredBodies:[]};
  s.retireCompanions(meta);return{pets:meta.legacyPets,eggCells:meta.eggCells,projectiles:meta.projectiles.length,retired:meta.retiredBodies.length,gone:[meta.companions,meta.eggs,meta.regrow].every(v=>v===undefined)};});
 assert.deepEqual(legacy.pets,[{owner:'local',kind:'mushroom-snail',stage:'adult'},{owner:'local',kind:'rock-chick',stage:'baby'}]);assert.equal(legacy.projectiles,1);assert.equal(legacy.retired,1);assert.equal(legacy.gone,true);
 pass('an old save is migrated: adult units come back first as pets, thrown potions are retired, the egg cells are cleared',legacy);

 assert.deepEqual(errors,[]);
 Object.assign(report,{result:'PASS',elapsedMs:Date.now()-began,errors});console.log(JSON.stringify({result:'PASS',checks:report.checks.length,elapsedMs:report.elapsedMs}));
}catch(error){Object.assign(report,{result:'FAIL',elapsedMs:Date.now()-began,error:error.stack,errors});console.error(error);process.exitCode=1;}
finally{if(process.env.PETS_REPORT)fs.writeFileSync(process.env.PETS_REPORT,JSON.stringify(report,null,2)+'\n');await browser?.close();server?.close();clearTimeout(timeout);}
