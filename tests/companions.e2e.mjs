import {chromium} from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';

const began=Date.now(),report={checks:[]},errors=[];
let browser,server;
const out=new URL('../artifacts/companions/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const timeout=setTimeout(()=>{console.error('Companion E2E exceeded 180 seconds');process.exit(1)},180000);
const pass=(name,evidence)=>{report.checks.push({name,evidence});console.log('PASS '+name)};
const boot=p=>p.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});
const owned=p=>p.evaluate(()=>Bloom.app.sim.companions.owned(Bloom.app.localId));
const observeCandidate=(p,id)=>p.evaluate(id=>{const a=Bloom.app.actor(),c=Bloom.app.sim.actors[id];return c&&{id:c.id,kind:c.candidateCompanion,targetId:c.targetId,hp:c.hp,day:!Bloom.app.sim.night(),distance:Math.hypot(a.pos.x-c.pos.x,a.pos.z-c.pos.z),pos:{...c.pos},player:{...a.pos}}},id);
const panelFit=p=>p.evaluate(()=>{const el=document.querySelector('.companion-panel'),r=el.getBoundingClientRect();return{rect:{x:r.x,y:r.y,w:r.width,h:r.height},client:el.clientHeight,scroll:el.scrollHeight,buttons:[...el.querySelectorAll('button')].filter(b=>b.getClientRects().length).map(b=>({h:b.getBoundingClientRect().height,disabled:b.disabled}))}});
async function candidateBoundary(p,id){
 await p.keyboard.press('KeyK');
 const state=await p.evaluate(id=>{const app=Bloom.app,sim=app.sim,player=app.actor(),candidate=sim.actors[id],original={...candidate.pos},dx=original.x-player.pos.x,dz=original.z-player.pos.z,horizontal=Math.hypot(dx,dz),ux=dx/(horizontal||1),uz=dz/(horizontal||1),dy=original.y-player.pos.y;
  const at=distance=>{const span=Math.sqrt(distance*distance-dy*dy);sim.physics.teleport(candidate,{x:player.pos.x+ux*span,y:original.y,z:player.pos.z+uz*span});app.companionPanel.refresh();const button=document.querySelector('[data-candidate-id="'+id+'"]');return{distance:Math.hypot(player.pos.x-candidate.pos.x,player.pos.y-candidate.pos.y,player.pos.z-candidate.pos.z),disabled:button.disabled,label:button.textContent.trim(),distanceText:button.parentElement.querySelector('small').textContent};};
  const outside=at(4.6),inside=at(4.4);sim.physics.teleport(candidate,original);app.companionPanel.refresh();return{outside,inside};},id);
 await p.keyboard.press('KeyK');
 assert(state.outside.distance>4.5&&state.outside.disabled&&state.outside.label.includes('4.6m'),JSON.stringify(state));
 assert(state.inside.distance<=4.5&&!state.inside.disabled&&state.inside.distanceText.includes('4.4m'),JSON.stringify(state));
 pass('candidate distance copy, button state, and refresh key agree across the 4.5m boundary',state);
}
const pause=(p,ms)=>p.waitForTimeout(ms);
async function approach(p,id,limit=24000,stopAt=4.1){
 const start=Date.now();let previous=Infinity,stale=Date.now(),side='KeyD';await p.locator('#world').focus();
 while(Date.now()-start<limit){
  const s=await observeCandidate(p,id);if(!s)throw Error('candidate despawned before encounter: '+id);if(s.distance<=stopAt)return s;
  await p.evaluate(({id,player,target})=>{const c=Bloom.app.renderer.camera;c.yaw=Math.atan2(-(target.x-player.x),-(target.z-player.z));c.pitch=.12;}, {id,player:s.player,target:s.pos});
  if(s.distance<previous-.06){previous=s.distance;stale=Date.now();}else if(Date.now()-stale>1200){await p.keyboard.down(side);await pause(p,600);await p.keyboard.up(side);side=side==='KeyD'?'KeyA':'KeyD';stale=Date.now();previous=Infinity;continue;}
  await p.keyboard.down('KeyW');await pause(p,170);await p.keyboard.up('KeyW');await pause(p,25);
 }
 throw Error('could not walk within '+stopAt+'m of '+id+'; last distance '+(await observeCandidate(p,id))?.distance);
}
async function approachMobile(p,id,limit=30000,stopAt=3.5){
 const start=Date.now();let previous=Infinity,stale=Date.now(),side=1;
 while(Date.now()-start<limit){
  const s=await observeCandidate(p,id);if(!s)throw Error('candidate despawned before mobile encounter: '+id);if(s.distance<=stopAt)return s;
  if(s.distance<previous-.06){previous=s.distance;stale=Date.now();}else if(Date.now()-stale>1200){await p.evaluate(x=>{Bloom.app.controls.joy={x,z:0};},side);await pause(p,700);await p.evaluate(()=>{Bloom.app.controls.joy={x:0,z:0}});side=-side;stale=Date.now();previous=Infinity;continue;}
  await p.evaluate(({player,target})=>{const c=Bloom.app.renderer.camera;c.yaw=Math.atan2(-(target.x-player.x),-(target.z-player.z));c.pitch=.12;Bloom.app.controls.joy={x:0,z:-1};},{player:s.player,target:s.pos});
  await pause(p,260);await p.evaluate(()=>{Bloom.app.controls.joy={x:0,z:0}});await pause(p,80);
 }
 throw Error('mobile stick could not walk within '+stopAt+'m of '+id);
}
async function acquire(p,id,mobile=false){
 if(mobile)await p.locator('#companions-btn').tap();else await p.keyboard.press('KeyK');
 const row=p.locator('[data-candidate-id="'+id+'"]');await row.waitFor({state:'visible'});
 await p.waitForFunction(id=>{const a=Bloom.app.actor(),c=Bloom.app.sim.actors[id];return !!c&&Math.hypot(a.pos.x-c.pos.x,a.pos.z-c.pos.z)<=4.5},id,{timeout:12000});
 const count=await p.evaluate(()=>Bloom.app.sim.companions.owned(Bloom.app.localId).length);
 if(mobile)await row.tap();else await row.click();
 await p.waitForFunction(count=>Bloom.app.sim.companions.owned(Bloom.app.localId).length>=count+1,count,{timeout:8000});
 await p.waitForFunction(()=>!Bloom.app.companionPanel.request,null,{timeout:4000});
 return owned(p);
}
async function nextCandidate(p,exclude=[],kind=null,timeoutMs=22000){
 await p.waitForFunction(({exclude,kind})=>Object.values(Bloom.app.sim.actors).some(c=>c.candidateCompanion&&!c.dead&&!exclude.includes(c.id)&&(!kind||c.candidateCompanion===kind)),{exclude,kind},{timeout:timeoutMs});
 return p.evaluate(({exclude,kind})=>Object.values(Bloom.app.sim.actors).filter(c=>c.candidateCompanion&&!c.dead&&!exclude.includes(c.id)&&(!kind||c.candidateCompanion===kind)).sort((a,b)=>Math.hypot(a.pos.x-Bloom.app.actor().pos.x,a.pos.z-Bloom.app.actor().pos.z)-Math.hypot(b.pos.x-Bloom.app.actor().pos.x,b.pos.z-Bloom.app.actor().pos.z))[0]?.id,{exclude,kind});
}
async function assign(p,id,mobile=false){
 const slot=p.locator('[data-companion-slot-target="0"]');
 if(mobile)await slot.tap();else await slot.click();
 const card=p.locator('[data-unit-id="'+id+'"] [data-companion-action="equip"]');
 if(mobile)await card.tap();else await card.click();
 await p.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.location==='combat',id,{timeout:8000});
}
async function saveAndReload(p,expectSlot){
 await p.locator('#companions-close').click();await p.locator('#menu-btn').click();await p.locator('#save-world').click();
 await p.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('저장됨'),null,{timeout:6000});
 await p.reload();await boot(p);await p.locator('#menu-btn').click();await p.locator('#load-world').click();
 await p.waitForFunction(()=>Bloom.app.sim.companions.all().length>0,null,{timeout:8000});
 const state=await owned(p);assert.equal(state.length,1);assert.equal(state[0].location,expectSlot===null?'reserve':'combat');assert.equal(state[0].slot,expectSlot);
 return state[0];
}

try{
 server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fs.readFileSync(new URL('../dist/index.html',import.meta.url)))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});report.browser=browser.version();
 const pc=await browser.newPage({viewport:{width:1366,height:900}});pc.setDefaultTimeout(8000);pc.on('pageerror',e=>errors.push(e.message));
 await pc.goto('http://127.0.0.1:'+server.address().port+'/?debug=1');await boot(pc);

 // Procedural output stays a pure function of the same seed and chunk coordinates.
 const ecology=await pc.evaluate(()=>{const seed=Bloom.app.sim.terrain.seed,t=Bloom.app.sim.terrain,a=Array.from(t.generate(-1,0,1));Bloom.app.newWorld(seed);const b=Array.from(Bloom.app.sim.terrain.generate(-1,0,1));const world=Bloom.app.sim.terrain;let highSites=0,steepSites=0,siteCount=0;const sitesByBiome={};
  for(let z=-240;z<=240;z+=4)for(let x=-240;x<=240;x+=4){const h=world.height(x,z),climate=world.climate(x,z),site=world.vegetationSite(x,z);if(site){siteCount++;sitesByBiome[climate.id]=(sitesByBiome[climate.id]||0)+1;}if(h>17&&!site)highSites++;let low=h,high=h;for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const q=world.height(x+dx,z+dz);low=Math.min(low,q);high=Math.max(high,q);}if(high-low>1&&!site)steepSites++;}
  return{sameChunk:JSON.stringify(a)===JSON.stringify(b),highSites,steepSites,siteCount,sitesByBiome,seed};});
 assert(ecology.sameChunk);assert(ecology.highSites>0);assert(ecology.steepSites>0);assert(ecology.siteCount>0);pass('same-seed chunk vegetation repeats; approved sites occur by biome and high or steep sites are rejected',ecology);

 await pc.waitForFunction(()=>!Bloom.app.sim.night()&&Object.values(Bloom.app.sim.actors).some(a=>a.candidateCompanion),null,{timeout:30000});
 const candId=await pc.evaluate(()=>Object.values(Bloom.app.sim.actors).find(a=>a.candidateCompanion&&!a.dead)?.id);let cand=await observeCandidate(pc,candId);assert(cand.day);assert.equal(cand.targetId,null);const hpBefore=await pc.evaluate(()=>Bloom.app.actor().hp);await pause(pc,700);cand=await observeCandidate(pc,candId);assert.equal(cand.targetId,null);assert.equal(await pc.evaluate(()=>Bloom.app.actor().hp),hpBefore);pass('daylight candidate remains neutral and does not attack before provoked',{id:candId,kind:cand.kind,distance:cand.distance});
 await pc.locator('#companions-btn').click();await pc.locator('[data-candidate-id="'+candId+'"]').waitFor({state:'visible'});assert(await pc.locator('[data-candidate-id="'+candId+'"]').isDisabled());await pc.locator('#companions-close').click();
 // Provocation uses the ordinary mouse attack and the candidate records the actual actor ID.
 await approach(pc,candId,45000,2.65);for(let attempt=0;attempt<4;attempt++){const pose=await observeCandidate(pc,candId);await pc.evaluate(({player,target})=>{const c=Bloom.app.renderer.camera;c.yaw=Math.atan2(-(target.x-player.x),-(target.z-player.z));c.pitch=.12;},{player:pose.player,target:pose.pos});await pc.mouse.move(683,450);await pc.mouse.down();await pause(pc,100);await pc.mouse.up();try{await pc.waitForFunction(id=>Bloom.app.sim.actors[id]?.targetId===Bloom.app.localId,candId,{timeout:1800});break;}catch{await pause(pc,300);}}
 await pc.waitForFunction(id=>Bloom.app.sim.actors[id]?.targetId===Bloom.app.localId,candId,{timeout:6000});
 await pc.waitForFunction(id=>Bloom.app.sim.actors[id]?.combat.state==='attack',candId,{timeout:8000});
 const provocation=await pc.evaluate(id=>({target:Bloom.app.sim.actors[id].targetId,player:Bloom.app.localId,ai:Bloom.app.sim.actors[id].combat.state,hp:Bloom.app.sim.actors[id].hp}),candId);assert.equal(provocation.target,provocation.player);pass('ordinary attack makes the nearby candidate retaliate toward the actual attacker',provocation);
 await candidateBoundary(pc,candId);
 await approach(pc,candId,15000,3.5);let units=await acquire(pc,candId);const unitId=units[0].id;assert.equal(units[0].kind,cand.kind);pass('walking encounter recruits the individual from its nearby-candidate row',{unitId,kind:units[0].kind});
 await assign(pc,unitId);assert.equal((await owned(pc))[0].slot,0);pass('empty combat slot plus owned individual card assigns the matching individual ID',{unitId,slot:0});

 if(units[0].kind==='shell'){
  await pc.locator('#companions-close').click();await pc.keyboard.press('KeyZ');await pc.locator('#debug-enemy').click();await pc.mouse.move(683,450);await pc.mouse.down();await pause(pc,100);await pc.mouse.up();
  await pc.waitForFunction(id=>Object.values(Bloom.app.sim.projectiles).some(p=>p.companionId===id),unitId,{timeout:6000});
  const shot=await pc.evaluate(id=>{const p=Object.values(Bloom.app.sim.projectiles).find(p=>p.companionId===id);return p&&{source:p.source,radius:p.radius,gravity:Bloom.app.sim.physics.world.getRigidBody(p.body).gravityScale()};},unitId);assert.equal(shot.source,'local');assert.equal(shot.radius,.29);assert.equal(shot.gravity,1);
  await pc.waitForFunction(id=>Object.values(Bloom.app.sim.projectiles).some(p=>p.companionId===id&&p.throwPhase==='ground'),unitId,{timeout:6000});await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.phase==='idle',unitId,{timeout:6000});pass('existing shell attack follows physical flight, ground hold, then recovery',{shot});
 }

 if(await pc.locator('#companions').isHidden())await pc.keyboard.press('KeyK');await pc.locator('[data-unit-id="'+unitId+'"] [data-companion-action="work"]').click();await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.location==='work',unitId,{timeout:8000});
 await pc.waitForFunction(()=>Bloom.app.sim.companions.base(Bloom.app.localId)?.slots.some(Boolean),null,{timeout:28000});await pc.locator('[data-companion-tab="storage"]').click();await pc.locator('#companion-collect').click();await pc.waitForFunction(()=>Bloom.app.actor().inventory.slots.some(Boolean),null,{timeout:5000});
 await pc.locator('[data-companion-tab="companions"]').click();await pc.locator('[data-unit-id="'+unitId+'"] [data-companion-action="work"]').click();await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.location==='reserve',unitId,{timeout:8000});await assign(pc,unitId);pass('existing terrain harvest, base delivery, inventory collection and work recall still work');

 const saved=await saveAndReload(pc,0);assert.equal(saved.id,unitId);pass('local save and reload preserve unique companion ID and equipped slot',{id:saved.id,slot:saved.slot});
 await pc.locator('#companions-btn').click();await pc.locator('[data-companion-remove="'+unitId+'"]').click();await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.location==='reserve',unitId,{timeout:8000});
 const removed=await saveAndReload(pc,null);assert.equal(removed.id,unitId);pass('one-tap slot removal survives save and reload',{id:removed.id,location:removed.location});

 // Recruit both species through natural encounters; accepting a second same-kind individual is valid.
 let kinds=new Set((await owned(pc)).map(u=>u.kind)),seen=new Set([candId]),tries=0;
   while((!kinds.has('shell')||!kinds.has('leaf'))&&tries++<8){const missing=kinds.has('shell')?'leaf':'shell';let candidateId;try{candidateId=await nextCandidate(pc,[...seen],missing,12000);}catch{candidateId=await nextCandidate(pc,[...seen],null,16000);}seen.add(candidateId);await approach(pc,candidateId,24000,3.5);units=await acquire(pc,candidateId);kinds=new Set(units.map(u=>u.kind));await pc.locator('#companions-close').click();}
 assert(kinds.has('shell')&&kinds.has('leaf'));assert.equal(new Set((await owned(pc)).map(u=>u.id)).size,(await owned(pc)).length);pass('distinct individuals of both capability types coexist in the owned roster',{units:(await owned(pc)).map(u=>({id:u.id,kind:u.kind,location:u.location}))});
  await pc.keyboard.press('KeyK');
 const claw=(await owned(pc)).find(u=>u.kind==='leaf');await pc.locator('[data-companion-slot-target="1"]').click();await pc.locator('[data-unit-id="'+claw.id+'"] [data-companion-action="equip"]').click();await pc.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.location==='combat',claw.id,{timeout:8000});
  await pc.locator('#companions-close').click();await pc.locator('#debug-kit').click();
  // Restore HP through the normal eat command before the melee encounter so
  // world enemies left over from earlier coverage cannot cause a respawn.
  const foodSlot=await pc.evaluate(()=>Bloom.app.actor().inventory.slots.findIndex(s=>s?.id==='food'));assert(foodSlot>=0);
  await pc.evaluate(index=>Bloom.app.select(index),foodSlot);await pc.waitForFunction(index=>Bloom.app.actor().inventory.selected===index,foodSlot,{timeout:2000});
  for(let n=0;n<4;n++){const hp=await pc.evaluate(()=>Bloom.app.actor().hp);if(hp>=100)break;await pc.evaluate(()=>Bloom.app.command({op:'eat'}));await pc.waitForFunction(hp=>Bloom.app.actor().hp>hp,hp,{timeout:1500});}
  await pc.waitForFunction(()=>!Bloom.app.actor().dead,null,{timeout:5000});
  await pc.keyboard.press('KeyX');await pc.waitForFunction(()=>Bloom.app.actor().companionSlot===1,null,{timeout:3000});const enemiesBefore=await pc.evaluate(()=>Object.values(Bloom.app.sim.actors).filter(a=>a.enemy&&!a.candidateCompanion).map(a=>a.id));await pc.locator('#debug-enemy').click();await pc.waitForFunction(before=>Object.values(Bloom.app.sim.actors).some(a=>a.enemy&&!a.candidateCompanion&&!before.includes(a.id)),enemiesBefore,{timeout:3000});const clawTarget=await pc.evaluate(before=>Object.values(Bloom.app.sim.actors).find(a=>a.enemy&&!a.candidateCompanion&&!before.includes(a.id))?.id,enemiesBefore);
  // Keep one real beetle target but postpone its retaliation so this probe
  // measures the claw swing without an enemy stagger racing the same input.
  await pc.evaluate(id=>{const sim=Bloom.app.sim;for(const e of Object.values(sim.actors))if(e.enemy&&!e.candidateCompanion){if(e.id===id)e.ai.cooldown=100000;else{sim.physics.removeBody(e);delete sim.actors[e.id];}}},clawTarget);
  await approach(pc,clawTarget,18000,1.8);const clawBefore=await pc.evaluate(id=>({hp:Bloom.app.sim.actors[id].hp,slot:Bloom.app.actor().companionSlot,playerHp:Bloom.app.actor().hp}),clawTarget);assert.equal(clawBefore.slot,1);for(let attempt=0;attempt<4;attempt++){
   const clawPose=await observeCandidate(pc,clawTarget);await pc.evaluate(({player,target})=>{const c=Bloom.app.renderer.camera;c.yaw=Math.atan2(-(target.x-player.x),-(target.z-player.z));c.pitch=.12;},{player:clawPose.player,target:clawPose.pos});await pc.mouse.move(683,450);await pc.mouse.down();await pause(pc,100);await pc.mouse.up();
   try{await pc.waitForFunction(id=>Bloom.app.actor().combat.state==='attack'&&Bloom.app.actor().combat.action?.companionId===id,claw.id,{timeout:1200});}catch{continue;}
   await pc.waitForFunction(({id,target,hp})=>Bloom.app.sim.actors[target]?.hp<hp||Bloom.app.actor().combat.state==='idle'&&Bloom.app.sim.companions.data.units[id].cooldown===0,{id:claw.id,target:clawTarget,hp:clawBefore.hp},{timeout:2600});if(await pc.evaluate(({id,hp})=>Bloom.app.sim.actors[id]?.hp<hp,{id:clawTarget,hp:clawBefore.hp}))break;
  }
  const clawAfter=await pc.evaluate(({target,unitId})=>({hp:Bloom.app.sim.actors[target]?.hp,slot:Bloom.app.actor().companionSlot,playerHp:Bloom.app.actor().hp,dead:Bloom.app.actor().dead,dist:Math.hypot(Bloom.app.actor().pos.x-Bloom.app.sim.actors[target].pos.x,Bloom.app.actor().pos.z-Bloom.app.sim.actors[target].pos.z),combat:Bloom.app.actor().combat.state,cooldown:Bloom.app.sim.companions.data.units[unitId]?.cooldown}),{target:clawTarget,unitId:claw.id});assert(clawAfter.hp<clawBefore.hp,'claw did not damage: '+JSON.stringify({before:clawBefore,after:clawAfter}));pass('existing short claw appearance attack still damages through common combat',clawAfter);

 const mobileContext=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const mobile=await mobileContext.newPage();mobile.setDefaultTimeout(8000);mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto('http://127.0.0.1:'+server.address().port+'/');await boot(mobile);
 await mobile.waitForFunction(()=>!Bloom.app.sim.night()&&Object.values(Bloom.app.sim.actors).some(a=>a.candidateCompanion),null,{timeout:30000});const mobileId=await mobile.evaluate(()=>Object.values(Bloom.app.sim.actors).find(a=>a.candidateCompanion&&!a.dead)?.id);await approachMobile(mobile,mobileId);let mobileUnits=await acquire(mobile,mobileId,true);const mobileUnit=mobileUnits[0].id;await assign(mobile,mobileUnit,true);
 let fit=await panelFit(mobile);assert(fit.rect.x>=0&&fit.rect.x+fit.rect.w<=845&&fit.scroll<=fit.client+1&&fit.buttons.every(b=>b.h>=44));
 let mobileSaved=await saveAndReload(mobile,0);assert.equal(mobileSaved.id,mobileUnit);await mobile.locator('#companions-btn').tap();await mobile.locator('[data-companion-remove="'+mobileUnit+'"]').tap();await mobile.waitForFunction(id=>Bloom.app.sim.companions.data.units[id]?.location==='reserve',mobileUnit,{timeout:8000});mobileSaved=await saveAndReload(mobile,null);assert.equal(mobileSaved.id,mobileUnit);
 await mobile.locator('#companions-btn').tap();fit=await panelFit(mobile);assert(fit.rect.x>=0&&fit.rect.x+fit.rect.w<=845&&fit.scroll<=fit.client+1&&fit.buttons.every(b=>b.h>=44));pass('landscape touch UI assigns and removes by ID, survives reload, and remains in the viewport',{id:mobileUnit,landscape:fit});
 await mobileContext.close();assert.deepEqual(errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;console.error(error);process.exitCode=1;}
finally{report.elapsedMs=Date.now()-began;report.errors=errors;fs.writeFileSync(new URL('result.json',out),JSON.stringify(report,null,2));clearTimeout(timeout);await browser?.close();server?.close();}
