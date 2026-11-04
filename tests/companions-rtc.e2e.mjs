import {serveStatic} from '../scripts/static-server.mjs';
import {chromium} from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {CURSOR_HELPERS} from './cursor-helpers.mjs';
import {routeLocalNostrRelay} from './nostr-relay.mjs';

// Two-peer lockstep RTC flow (0.35.2): two Edge contexts share one room through GameKit's Nostr signaling + WebRTC and the
// lockstep room session. While both peers keep advancing, the host
//  1. sets a boss egg down with a real right click on a ground face (D-103) — it hatches after EGG_RULES.hatchMs (30 s,
//     not shortened) into a baby owned by the host, and the guest's own simulation holds the same unit;
//  2. holds the left button on a block in reach (D-123 hold-to-mine): the host mines it from where it stands, and the block breaks
//     on both peers at the same simulation tick.
// Throughout, both peers hash their own simulation state (Simulation.save()) every checksum interval; every common tick must
// match, and the session itself must report no hash mismatch, failure or resync.
//
// Fixture (the only direct state write): one `rootEgg` is put into the host's bag after the host opens the room and
// BEFORE the guest joins. Eggs only come from boss kills (D-107); a boss fight in a fresh shared world is not reproducible
// in the time budget, and items given before connecting are lost because connect() replaces the world with the room seed.
// The guest therefore receives the egg through the room's own join snapshot (the deterministic path), so both peers
// simulate the same state from the first shared tick.
//
// Signaling: RTC_RELAY=public (default) uses GameKit's default public Nostr relays; RTC_RELAY=local answers those same relay
// URLs from an in-process relay (tests/nostr-relay.mjs, Playwright WebSocket routing), so only WebRTC between the two local
// contexts is real. The game source is unchanged in both modes.
const began=Date.now(),report={checks:[]},errors=[],RELAY=process.env.RTC_RELAY||'public';let browser,server,relay;
const out=new URL('../artifacts/companions/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const timeout=setTimeout(()=>{console.error('RTC companion E2E exceeded 180 seconds');try{fs.writeFileSync(new URL('rtc-result.json',out),JSON.stringify({...report,status:'TIMEOUT',elapsedMs:Date.now()-began},null,2));}catch{}process.exit(1)},180000);
const pass=(name,evidence)=>{const s=Math.round((Date.now()-began)/1000);report.checks.push({name,evidence,s});console.log('PASS '+s+'s '+name)};
const pause=(p,ms)=>p.waitForTimeout(ms);

// Page-side instrumentation (read-only): every CHECK ticks after a simulation step, an FNV-1a hash of Simulation.save()
// (the same bytes the session hashes and transfers), and a log of mine/egg events with their simulation tick.
const INSTRUMENT=()=>{const app=Bloom.app,sim=app.sim,every=Bloom.CFG.net.checksumTicks;if(sim.__rtcProbe)return every;
 sim.__rtcProbe=true;window.__rtc={hashes:{},events:[],every};
 const fnv=b=>{let h=0x811c9dc5;for(let i=0;i<b.length;i++){h^=b[i];h=Math.imul(h,0x01000193);}return h>>>0;};
 const step=sim.step.bind(sim);sim.step=(...a)=>{const r=step(...a);if(!sim.silent&&sim.tick%every===0)window.__rtc.hashes[sim.tick]=fnv(sim.save());return r;};
 const emit=sim.emit.bind(sim);sim.emit=(type,actor,data={})=>{if(!sim.silent&&['mine','egg-place','egg-hatch'].includes(type))window.__rtc.events.push({type,tick:sim.tick,actor:actor?.id??null,blockId:data.blockId,pos:data.pos?{...data.pos}:null,companionId:data.companionId,key:data.key,actorPos:actor?.pos?{x:actor.pos.x,z:actor.pos.z}:null});return emit(type,actor,data);};
 return every;};
const probe=p=>p.evaluate(()=>{const s=Bloom.app.net.session,m=s.metrics;return{tick:Bloom.app.sim.tick,status:s.status,failure:s.failure?.type??s.failure?.reason??null,hashMismatches:m.hashMismatches??0,hashes:window.__rtc.hashes,events:window.__rtc.events};});
// Compare the hash logs of both peers at their common ticks.
async function syncCheck(pages,minCommon){
 const [a,b]=await Promise.all(pages.map(probe)),common=Object.keys(a.hashes).filter(t=>t in b.hashes).map(Number).sort((x,y)=>x-y);
 const diff=common.filter(t=>a.hashes[t]!==b.hashes[t]);
 assert.deepEqual(diff,[],'state hash mismatch at ticks '+JSON.stringify(diff.slice(0,5).map(t=>({t,host:a.hashes[t],guest:b.hashes[t]}))));
 assert(common.length>=minCommon,'too few common hash ticks: '+common.length+' < '+minCommon);
 for(const s of [a,b]){assert.equal(s.failure,null);assert.equal(s.hashMismatches,0,'session reported a hash mismatch');assert.notEqual(s.status,'resynchronizing');}
 return{common:common.length,first:common[0],last:common.at(-1),ticks:[a.tick,b.tick],statuses:[a.status,b.status],events:[a.events,b.events]};
}
// The top face of a solid block at stand height `radii` m from the local player whose face the cursor can reach (the game's
// own pick confirms it), with air above, skipping excluded columns.
const groundNear=(p,exclude=[],radii=[2,3,4])=>p.evaluate(({exclude,radii})=>{const a=Bloom.app.actor(),t=Bloom.app.sim.terrain,bodies=Object.values(Bloom.app.sim.actors).filter(x=>!x.dead);
 for(const r of radii)for(const [dx,dz]of [[0,-1],[1,-1],[-1,-1],[1,0],[-1,0],[1,1],[-1,1],[0,1]]){const x=Math.floor(a.pos.x)+dx*r,z=Math.floor(a.pos.z)+dz*r,y=t.height(x,z);
  if(exclude.some(e=>Math.abs(e.x-x)<=1&&Math.abs(e.z-z)<=1))continue;if(!t.isSolid(t.get(x,y,z))||t.get(x,y+1,z)||t.get(x,y+2,z)||Math.abs(y+1-a.pos.y)>.6)continue;
  if(bodies.some(b=>Math.floor(b.pos.x)===x&&Math.floor(b.pos.z)===z))continue;const s=window.__faceScreen({x,y,z},{x:0,y:1,z:0});if(s)return{x,y,z,id:Bloom.BLOCKS[t.get(x,y,z)].id,screen:s};}
 return null;},{exclude,radii});
// Move the OS cursor onto the top face of b and wait until the simulation's aim (from the input packet) is that face.
async function aimTop(p,b){for(let i=0;i<15;i++){const at=await p.evaluate(b=>window.__faceScreen(b,{x:0,y:1,z:0}),b);if(at){await p.mouse.move(at.x,at.y);
  const ok=await p.waitForFunction(b=>{const t=Bloom.app.sim.aim(Bloom.app.actor());return t&&t.x===b.x&&t.y===b.y&&t.z===b.z&&t.normal.y===1;},b,{timeout:1500}).then(()=>true,()=>false);if(ok)return at;}await pause(p,100);}
 return null;}

try{
 server=http.createServer(serveStatic);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});report.browser=browser.version();report.relay=RELAY;
 const contexts=[await browser.newContext({viewport:{width:1100,height:800}}),await browser.newContext({viewport:{width:1100,height:800}})];
 if(RELAY==='local'){relay=routeLocalNostrRelay();for(const c of contexts)await relay.attach(c);}
 const pages=await Promise.all(contexts.map(async context=>{const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(CURSOR_HELPERS);
  await p.goto('http://127.0.0.1:'+server.address().port+'/?starterPet=0',{timeout:45000});await p.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:45000});return p;}));
 const[host,join]=pages;pass('both Edge clients boot the game',{s:Math.round((Date.now()-began)/1000)});

 // Host opens the room; its world is now the room-seed world (connect() replaces the solo world).
 await host.locator('#network-btn').click();await host.locator('#host-room').click();
 await host.waitForFunction(()=>Bloom.app.net.session&&Bloom.app.actor()&&!Bloom.app.net.busy,null,{timeout:45000});const room=await host.locator('#room-code').inputValue();assert.match(room,/^\d{4}$/);
 // Fixture: the boss egg in the host's bag, before anyone else is in the room (see header).
 const eggSlot=await host.evaluate(()=>{const i=Bloom.app.actor().inventory;if(Bloom.Inventory.addTo(i.slots,'rootEgg',1))throw Error('bag full');return i.slots.findIndex(s=>s?.id==='rootEgg');});
 assert(eggSlot>=0&&eggSlot<9,'egg not on the hotbar: '+eggSlot);await pause(host,600);

 await join.locator('#network-btn').click();await join.locator('#room-code').fill(room);await join.locator('#join-room').click();
 for(const p of pages)await p.waitForFunction(()=>Bloom.app.net.session?.players.length===2&&Bloom.app.net.phase==='running'&&Bloom.app.actor()&&Object.values(Bloom.app.sim.actors).filter(a=>!a.enemy&&!a.speciesId&&!a.boss).length===2,null,{timeout:60000});
 const ids=await Promise.all(pages.map(p=>p.evaluate(()=>Bloom.app.localId)));assert.notEqual(ids[0],ids[1]);
 const guestEgg=await join.evaluate(id=>Bloom.app.sim.actors[id].inventory.slots.filter(s=>s?.id==='rootEgg').length,ids[0]);assert.equal(guestEgg,1,'the guest snapshot lacks the host egg');
 for(const p of pages)await p.evaluate(INSTRUMENT);
 pass('two Edge clients join one lockstep room and the guest snapshot carries the host egg',{room,relay:RELAY,players:ids});
 for(const p of pages){await p.locator('#world').focus();}
 await host.waitForFunction(()=>Object.keys(window.__rtc.hashes).length>=2,null,{timeout:10000});await join.waitForFunction(()=>Object.keys(window.__rtc.hashes).length>=2,null,{timeout:10000});
 pass('both peers advance with matching state hashes before any action',await syncCheck(pages,1));

 // 1. Egg: select it with the hotbar key and right-click a ground top face.
 await host.keyboard.press('Digit'+(eggSlot+1));await host.waitForFunction(i=>Bloom.app.actor().inventory.selected===i,eggSlot,{timeout:4000});
 // A click can miss if the aim changes between the move and the click (camera/interpolation); retry on a fresh face.
 let ground=null,placed=false,attempts=0;for(;attempts<3&&!placed;attempts++){ground=await groundNear(host);assert(ground,'no reachable ground face for the egg');const eggAt=await aimTop(host,ground);if(!eggAt)continue;
  await host.mouse.click(eggAt.x,eggAt.y,{button:'right'});placed=await host.waitForFunction(()=>Object.keys(Bloom.app.sim.eggs).length===1,null,{timeout:4000}).then(()=>true,()=>false);}
 assert(placed,'right click did not set the egg down: '+JSON.stringify(await host.evaluate(()=>({sel:Bloom.app.actor().inventory.slots[Bloom.app.actor().inventory.selected],aim:Bloom.app.sim.aim(Bloom.app.actor()),events:window.__rtc.events}))));
 const eggKey=ground.x+','+(ground.y+1)+','+ground.z;
 const eggs=await Promise.all(pages.map(async p=>{await p.waitForFunction(()=>Object.keys(Bloom.app.sim.eggs).length===1,null,{timeout:10000});return p.evaluate(()=>{const e=Object.values(Bloom.app.sim.eggs)[0];return{...e};});}));
 assert.deepEqual(eggs[0],eggs[1],'egg differs between peers');assert.equal(eggs[0].owner,ids[0]);assert.equal(eggs[0].species,'root');
 assert.equal(eggs[0].x,ground.x);assert.equal(eggs[0].y,ground.y+1);assert.equal(eggs[0].z,ground.z);
 const hatchMs=await host.evaluate(e=>(e.hatchTick-e.placedTick)*Bloom.CFG.stepMs,eggs[0]);assert(Math.abs(hatchMs-30000)<1,'hatch time '+hatchMs);
 pass('host right-click sets the egg on the ground and both peers hold the same egg',{egg:eggs[0],hatchMs,eggKey,attempts});

 // 2. Hold-to-mine (D-123): put the cursor on another ground block 2–3 m away (inside CFG.reach) and hold the left button
 // until it breaks; the player does not walk.
 await host.waitForTimeout(600);const target=await groundNear(host,[{x:ground.x,z:ground.z}],[2,3]);assert(target,'no reachable block to mine');const startPos=await host.evaluate(()=>({x:Bloom.app.actor().pos.x,z:Bloom.app.actor().pos.z}));
 await host.keyboard.press('Digit9');await host.waitForFunction(()=>Bloom.app.actor().inventory.selected===8,null,{timeout:4000});// empty hand
 const mineBefore=await Promise.all(pages.map(p=>p.evaluate(b=>Bloom.app.sim.terrain.get(b.x,b.y,b.z),target)));assert(mineBefore.every(v=>v&&v===mineBefore[0]));
 let mined=false;for(let attempt=0;attempt<3&&!mined;attempt++){const at=await aimTop(host,target);assert(at,'cannot aim at the block to mine');await host.mouse.down();
  mined=await host.waitForFunction(b=>!Bloom.app.sim.terrain.get(b.x,b.y,b.z),target,{timeout:8000}).then(()=>true,()=>false);await host.mouse.up();}
 assert(mined,'the held block was not mined');
 await join.waitForFunction(b=>!Bloom.app.sim.terrain.get(b.x,b.y,b.z),target,{timeout:10000});
 const mineEvents=(await Promise.all(pages.map(p=>p.evaluate(b=>window.__rtc.events.filter(e=>e.type==='mine'&&e.pos&&Math.floor(e.pos.x)===b.x&&Math.floor(e.pos.y)===b.y&&Math.floor(e.pos.z)===b.z),target))));
 assert.equal(mineEvents[0].length,1,'host mine events '+JSON.stringify(mineEvents[0]));assert.deepEqual(mineEvents[0],mineEvents[1],'mine event differs between peers');assert.equal(mineEvents[0][0].actor,ids[0]);
 const walked=Math.hypot(mineEvents[0][0].actorPos.x-startPos.x,mineEvents[0][0].actorPos.z-startPos.z),reachAt=Math.hypot(mineEvents[0][0].actorPos.x-target.x-.5,mineEvents[0][0].actorPos.z-target.z-.5);
 assert(walked<.5&&reachAt<4.5,'hold-to-mine should not walk: '+JSON.stringify({walked,reachAt}));
 pass('hold-to-mine: the host holds the left button on a block in reach and it breaks on both peers at the same tick',{block:target.id,at:{x:target.x,y:target.y,z:target.z},tick:mineEvents[0][0].tick,walked,reachAt,sync:await syncCheck(pages,2)});

 // 3. Hatch (30 s of play, not shortened): both peers turn the same egg into the same baby at the same tick.
 const hatched=await Promise.all(pages.map(async p=>{await p.waitForFunction(()=>!Object.keys(Bloom.app.sim.eggs).length&&Bloom.app.sim.companions.all().length===1,null,{timeout:45000});
  return p.evaluate(()=>{const u=Bloom.app.sim.companions.all()[0];return{unit:{id:u.id,kind:u.kind,owner:u.owner,stage:u.stage,grade:u.grade,location:u.location,cell:u.cell&&{...u.cell}},event:window.__rtc.events.find(e=>e.type==='egg-hatch')};});}));
 assert.deepEqual(hatched[0],hatched[1],'hatched unit differs between peers');const baby=hatched[0];
 assert.equal(baby.unit.owner,ids[0]);assert.equal(baby.unit.kind,'root');assert.equal(baby.unit.stage,'baby');assert.equal(baby.unit.grade,1);assert.equal(baby.event.companionId,baby.unit.id);assert.equal(baby.event.tick,eggs[0].hatchTick);
 pass('the egg hatches after 30 s into the same baby (id/kind/owner/stage/grade) on both peers at the same tick',{...baby,sync:await syncCheck(pages,10)});

 // Per peer connection, summed over its candidate pairs: ICE may move traffic between pairs, so a single pair can show
 // one direction only.
 const native=[];for(const p of pages)native.push(await p.evaluate(async()=>{const rows=[];for(const pc of Bloom.app.net.room.peerConnections.values()){const row={succeeded:0,bytesSent:0,bytesReceived:0};for(const s of (await pc.getStats()).values())if(s.type==='candidate-pair'){if(s.state==='succeeded')row.succeeded++;row.bytesSent+=s.bytesSent||0;row.bytesReceived+=s.bytesReceived||0;}rows.push(row);}return rows;}));
 assert(native.every(rows=>rows.length===1&&rows[0].succeeded>0&&rows[0].bytesSent>0&&rows[0].bytesReceived>0),'native RTC connection without two-way data: '+JSON.stringify(native));pass('the native RTC peer connection carries data in both directions on both peers',{native});
 const final=await syncCheck(pages,10);pass('state hashes match at every common tick for the whole run',final);
 if(relay){assert(relay.stats.events>0&&relay.stats.deliveries>0,'local relay unused: '+JSON.stringify(relay.stats));pass('signaling went through the in-process relay',{...relay.stats});}

 // Graceful leave (kept from the 0.33 test): an expired join deadline and a duplicate commit ACK must not block it, and the
 // guest gets its solo world back while the host continues alone.
 const leaveSetup=await join.evaluate(()=>{const s=Bloom.app.net.session;if(!s||typeof s.clock!=='function'||typeof s._send!=='function'||!Number.isFinite(s.membership?.transitionTimeoutMs))throw Error('RoomSession leave regression hooks unavailable');
  s._startedAt=s.clock()-s.membership.transitionTimeoutMs-1;window.__leaveCommitAcks=0;const send=s._send.bind(s);
  s._send=(to,op,detail={})=>{send(to,op,detail);if(op==='committed'&&window.__leaveCommitAcks===0){window.__leaveCommitAcks++;send(to,op,detail);}};return{backupId:Bloom.app.net.backup?.id};});
 await join.locator('#network-btn').click();await join.locator('#leave-room').click();await join.waitForFunction(()=>!Bloom.app.net.session&&!Bloom.app.net.busy,null,{timeout:20000});
 const left=await join.evaluate(()=>({localId:Bloom.app.localId,duplicateAcks:window.__leaveCommitAcks,units:Bloom.app.sim.companions.all().length}));
 assert.equal(left.duplicateAcks,1);assert.equal(left.localId,leaveSetup.backupId,'leave restores the guest solo world');assert.equal(left.units,0);
 await host.waitForFunction(()=>Bloom.app.net.session?.players.length===1&&Object.values(Bloom.app.sim.actors).filter(a=>!a.enemy&&!a.speciesId&&!a.boss).length===1&&Bloom.app.sim.companions.all().length===1,null,{timeout:20000});
 pass('graceful guest leave restores its solo world; the host keeps the room and the hatched unit',left);
 assert.deepEqual(errors,[]);report.status='PASS';report.limit='Two local Edge contexts on one machine; '+(RELAY==='local'?'in-process Nostr relay':'live public Nostr relays')+'; external NAT combinations not covered.';
}catch(error){report.status='FAIL';report.error=error.stack;console.error(error);process.exitCode=1;}
finally{report.elapsedMs=Date.now()-began;report.errors=errors;fs.writeFileSync(new URL('rtc-result.json',out),JSON.stringify(report,null,2));console.log((report.status||'FAIL')+' in '+Math.round(report.elapsedMs/1000)+'s ('+RELAY+' relay)');clearTimeout(timeout);await browser?.close();relay?.close();server?.close();}
