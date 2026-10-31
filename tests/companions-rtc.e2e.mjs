import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';

const began=Date.now(),report={checks:[]},errors=[];let browser,server;
const out=new URL('../artifacts/companions/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const timeout=setTimeout(()=>{console.error('RTC companion E2E exceeded 180 seconds');process.exit(1)},180000);
const pass=(name,evidence)=>{report.checks.push({name,evidence});console.log('PASS '+name)};
const observeCandidate=(p,id)=>p.evaluate(id=>{const a=Bloom.app.actor(),c=Bloom.app.sim.actors[id];return c&&{id:c.id,kind:c.speciesId,wildState:c.wildState,targetId:c.targetId,hp:c.hp,pos:{...c.pos},tick:Bloom.app.sim.tick,player:{...a.pos,hp:a.hp,dead:a.dead,combat:a.combat.state,sprinting:a.sprinting}}},id);
async function approach(p,id,stopAt=2.6){const until=Date.now()+50000;let previous=Infinity,stale=Date.now(),side='KeyD',last=null;await p.locator('#world').focus();while(Date.now()<until){const s=await observeCandidate(p,id);if(!s)throw Error('candidate vanished: '+id);last=s;const dist=Math.hypot(s.pos.x-s.player.x,s.pos.z-s.player.z);if(dist<=stopAt)return s;await p.evaluate(({player,target})=>{const c=Bloom.app.renderer.camera;c.yaw=Math.atan2(-(target.x-player.x),-(target.z-player.z));c.pitch=.12;},{player:s.player,target:s.pos});if(dist<previous-.06){previous=dist;stale=Date.now();}else if(Date.now()-stale>1200){await p.keyboard.down(side);await p.waitForTimeout(600);await p.keyboard.up(side);side=side==='KeyD'?'KeyA':'KeyD';stale=Date.now();previous=Infinity;continue;}await p.keyboard.down('KeyW');await p.waitForTimeout(170);await p.keyboard.up('KeyW');await p.waitForTimeout(25);}throw Error('could not approach the RTC candidate: '+JSON.stringify(last));}
async function retreat(p,id,timeoutMs=35000){const until=Date.now()+timeoutMs;let last=null;await p.locator('#world').focus();await p.evaluate(()=>{Bloom.app.controls.joy={x:0,z:-1};Bloom.app.controls.joySprint=true;});try{while(Date.now()<until){const s=await observeCandidate(p,id);if(!s)throw Error('candidate vanished while retreating: '+id);last=s;const dist=Math.hypot(s.player.x-s.pos.x,s.player.z-s.pos.z);if(s.wildState==='neutral'&&s.targetId===null&&dist>26)return{pose:s,distance:dist};await p.evaluate(({player,target})=>{const c=Bloom.app.renderer.camera;c.yaw=Math.atan2(-(player.x-target.x),-(player.z-target.z));c.pitch=.12;},{player:s.player,target:s.pos});await p.waitForTimeout(100);}throw Error('could not sprint beyond the retaliation leash: '+JSON.stringify(last));}finally{await p.evaluate(()=>{Bloom.app.controls.joy={x:0,z:0};Bloom.app.controls.joySprint=false;});}}
const placementState=p=>p.evaluate(()=>({id:Bloom.app.localId,tick:Bloom.app.sim.tick,units:Bloom.app.sim.companions.snapshot().units,bases:Bloom.app.sim.companions.snapshot().bases,actors:Object.values(Bloom.app.sim.actors).filter(a=>a.speciesId).map(a=>({id:a.id,kind:a.speciesId,wildState:a.wildState,targetId:a.targetId,enemy:a.enemy,combat:a.combat.state}))}));
const normalize=units=>Object.values(units).map(({id,owner,kind,location,slot,pending,cargo})=>({id,owner,kind,location,slot,pending,cargo})).sort((a,b)=>a.id.localeCompare(b.id));

try{
 server=http.createServer(serveStatic);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});report.browser=browser.version();
 const contexts=[await browser.newContext({viewport:{width:1100,height:800}}),await browser.newContext({viewport:{width:1100,height:800}})],pages=[];
 for(const context of contexts){const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:'+server.address().port+'/');await p.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});pages.push(p);}
 const[host,join]=pages;await host.locator('#network-btn').click();await host.locator('#host-room').click();await host.waitForFunction(()=>Bloom.app.net.session&&Bloom.app.actor(),null,{timeout:45000});const room=await host.locator('#room-code').inputValue();
 await join.locator('#network-btn').click();await join.locator('#room-code').fill(room);await join.locator('#join-room').click();
 for(const p of pages)await p.waitForFunction(()=>Bloom.app.net.session?.players.length===2&&Object.values(Bloom.app.sim.actors).filter(a=>!a.enemy&&!a.speciesId&&!a.boss).length===2,null,{timeout:45000});
 const ids=await Promise.all(pages.map(p=>p.evaluate(()=>Bloom.app.localId)));assert.notEqual(ids[0],ids[1]);pass('two Edge clients join the live Nostr/WebRTC room',{room,players:ids});

 await host.waitForFunction(()=>!Bloom.app.sim.night()&&Object.values(Bloom.app.sim.actors).some(a=>a.speciesId),null,{timeout:30000});
 let first=await host.evaluate(()=>{const p=Bloom.app.actor();return Object.values(Bloom.app.sim.actors).filter(a=>a.speciesId&&!a.dead).sort((x,y)=>Math.hypot(x.pos.x-p.pos.x,x.pos.z-p.pos.z)-Math.hypot(y.pos.x-p.pos.x,y.pos.z-p.pos.z))[0]?.id;});let close=await approach(host,first,1.1);
 for(let attempt=0;attempt<6;attempt++){const pose=await observeCandidate(host,first);await host.evaluate(({player,target})=>{const c=Bloom.app.renderer.camera;c.yaw=Math.atan2(-(target.x-player.x),-(target.z-player.z));c.pitch=.08;},{player:pose.player,target:pose.pos});await host.waitForTimeout(100);await host.mouse.move(550,400);await host.mouse.down();await host.waitForTimeout(100);await host.mouse.up();try{await host.waitForFunction(({id,owner})=>Bloom.app.sim.actors[id]?.targetId===owner,{id:first,owner:ids[0]},{timeout:1800});break;}catch{await host.waitForTimeout(300);}}
 for(const p of pages)await p.waitForFunction(({id,owner})=>Bloom.app.sim.actors[id]?.targetId===owner,{id:first,owner:ids[0]}, {timeout:15000});
 const attackRows=await Promise.all(pages.map(async p=>{await p.waitForFunction(({id,owner})=>{const a=Bloom.app.sim.actors[id];return a?.targetId===owner&&a.wildState==='retaliating'&&a.combat.state==='attack';},{id:first,owner:ids[0]},{timeout:8000});return p.evaluate(id=>{const a=Bloom.app.sim.actors[id];return{targetId:a.targetId,wildState:a.wildState,combat:a.combat.state,tick:Bloom.app.sim.tick};},first);}));assert(attackRows.every(a=>a.targetId===ids[0]&&a.wildState==='retaliating'&&a.combat==='attack'),'RTC attack start mismatch: '+JSON.stringify(attackRows));let states,targetRows,until=Date.now()+4000;do{states=await Promise.all(pages.map(p=>placementState(p)));targetRows=states.map(s=>s.actors.find(a=>a.id===first));if(targetRows.every(a=>a?.targetId===ids[0]&&a.wildState==='retaliating'&&a.enemy&&a.combat===targetRows[0].combat))break;await host.waitForTimeout(100);}while(Date.now()<until);assert(targetRows.every(a=>a?.targetId===ids[0]&&a.wildState==='retaliating'&&a.enemy&&a.combat===targetRows[0].combat),'RTC retaliation state mismatch: '+JSON.stringify({ids,targets:targetRows,ticks:states.map(s=>s.tick)}));pass('both RTC peers start the retaliating attack and converge on the same target/state snapshot',{attackRows,targets:targetRows,ticks:states.map(s=>s.tick)});

  let pose=await observeCandidate(host,first);const retreatStart={...pose.player},retreatResult=await retreat(host,first);pose=retreatResult.pose;const leashDistance=retreatResult.distance,retreatDistance=Math.hypot(pose.player.x-retreatStart.x,pose.player.z-retreatStart.z);assert(pose.wildState==='neutral'&&pose.targetId===null&&leashDistance>26&&retreatDistance>26&&!pose.player.dead,'host did not sprint out beyond the retaliation leash: '+JSON.stringify({...pose,leashDistance,retreatDistance}));for(const p of pages)await p.waitForFunction(id=>{const a=Bloom.app.sim.actors[id];return a?.wildState==='neutral'&&a.targetId===null&&!a.enemy},first,{timeout:15000});states=await Promise.all(pages.map(placementState));targetRows=states.map(s=>s.actors.find(a=>a.id===first));assert(targetRows.every(a=>a?.targetId===null),'RTC leash reset mismatch: '+JSON.stringify(targetRows));pass('target ownership is released identically on both RTC peers after the attacker sprints beyond 26m',{targets:targetRows,distance:leashDistance,retreatDistance,playerHp:pose.player.hp});await approach(host,first,4.2);

 // 0.33.0: units come only from boss eggs (D-107), so there is no candidate to recruit in a fresh shared room. The panel
 // must show no recruit list on either peer, and an owner-checked assign of a unit nobody owns changes nothing.
 for(const p of pages){await p.keyboard.press('KeyK');assert.equal(await p.evaluate(()=>!!document.querySelector('#companion-candidates,[data-candidate-id]')),false);await p.keyboard.press('KeyK');}
 await join.evaluate(()=>Bloom.app.command({op:'companion',action:'assign',id:'unit:1',location:'combat',slot:1}));await host.waitForTimeout(350);states=await Promise.all(pages.map(placementState));assert.deepEqual(normalize(states[0].units),normalize(states[1].units));assert.deepEqual(states[0].units,{});pass('no recruit list in co-op and an unowned assign is rejected identically on both peers');
 const native=[];for(const p of pages)native.push(await p.evaluate(async()=>{const rows=[];for(const pc of Bloom.app.net.room.peerConnections.values()){const stats=await pc.getStats();for(const s of stats.values())if(s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated)rows.push({state:s.state,bytesSent:s.bytesSent,bytesReceived:s.bytesReceived});}return rows;}));assert(native.every(rows=>rows.some(s=>s.bytesSent>0&&s.bytesReceived>0)));pass('nominated native RTC candidate pairs carry data in both directions',{native});

 await join.locator('#network-btn').click();await join.locator('#reconnect-room').click();await join.waitForFunction(id=>Bloom.app.net.session?.players.length===2&&Bloom.app.actor()?.id===id&&Bloom.app.net.phase==='running',ids[1],{timeout:45000});
 states=await Promise.all(pages.map(placementState));assert.deepEqual(normalize(states[0].units),normalize(states[1].units));assert.deepEqual(states[0].bases,states[1].bases);pass('reconnect preserves room identity and identical companion state',{players:ids});
 const leaveSetup=await join.evaluate(()=>{
  const s=Bloom.app.net.session;
  if(!s||typeof s.clock!=='function'||typeof s._send!=='function'||!Number.isFinite(s.membership?.transitionTimeoutMs))throw Error('RoomSession leave regression hooks unavailable');
  s._startedAt=s.clock()-s.membership.transitionTimeoutMs-1;
  window.__leaveCommitAcks=0;
  const send=s._send.bind(s);
  s._send=(to,op,detail={})=>{send(to,op,detail);if(op==='committed'&&window.__leaveCommitAcks===0){window.__leaveCommitAcks++;send(to,op,detail);}};
  return{startedAt:s._startedAt,transitionTimeoutMs:s.membership.transitionTimeoutMs,backupId:Bloom.app.net.backup?.id};
 });
 await join.locator('#network-btn').click();await join.locator('#leave-room').click();
 await join.waitForFunction(()=>!Bloom.app.net.session&&!Bloom.app.net.busy,null,{timeout:20000});
 const left=await join.evaluate(()=>({session:!!Bloom.app.net.session,busy:Bloom.app.net.busy,localId:Bloom.app.localId,duplicateAcks:window.__leaveCommitAcks,status:Bloom.app.net.status}));
 assert.equal(left.session,false);assert.equal(left.duplicateAcks,1);assert.equal(left.localId,leaveSetup.backupId,'leave restores the guest’s local world');
 await host.waitForFunction(()=>Bloom.app.net.session?.players.length===1&&Object.values(Bloom.app.sim.actors).filter(a=>!a.enemy&&!a.speciesId&&!a.boss).length===1,null,{timeout:20000});
 pass('graceful leave completes after an expired join deadline and duplicate commit ACK, restoring the guest’s solo world',{leaveSetup,left,hostPlayers:await host.evaluate(()=>Bloom.app.net.session.players.length)});
 await join.locator('#room-code').fill(room);await join.locator('#join-room').click();
 for(const p of pages)await p.waitForFunction(()=>Bloom.app.net.session?.players.length===2&&Object.values(Bloom.app.sim.actors).filter(a=>!a.enemy&&!a.speciesId&&!a.boss).length===2,null,{timeout:45000});
 const reentered=await Promise.all(pages.map(p=>p.evaluate(()=>Bloom.app.localId)));
 assert.equal(reentered[0],ids[0]);assert.notEqual(reentered[1],ids[1],'same-room re-entry uses a fresh guest identity');
 pass('guest rejoins the same RTC room after graceful leave',{room,previousPlayers:ids,reenteredPlayers:reentered}); assert.deepEqual(errors,[]);report.status='PASS';report.limit='Two local Edge clients through the live public signaling/RTC path; external NAT combinations not covered.';
}catch(error){report.status='FAIL';report.error=error.stack;console.error(error);process.exitCode=1;}
finally{report.elapsedMs=Date.now()-began;report.errors=errors;fs.writeFileSync(new URL('rtc-result.json',out),JSON.stringify(report,null,2));clearTimeout(timeout);await browser?.close();server?.close();}

