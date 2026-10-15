class Companions {
 constructor(sim,data={units:{},bases:{},sequence:0}){this.sim=sim;this.data=structuredClone(data);}
 all(){return Object.values(this.data.units).sort((a,b)=>cmp(a.id,b.id));}
 owned(owner){return this.all().filter(u=>u.owner===owner);}
 bodies(){return this.all().filter(u=>u.body!==null);}
 base(owner){return this.data.bases[owner]||null;}
 nearBase(a){const b=this.base(a.id);return b&&V.len(V.sub(a.pos,b.pos))<=7;}
 equipped(a,slot=a.companionSlot){return this.owned(a.id).find(u=>u.location==='combat'&&u.slot===slot)||null;}
 ready(a){const u=this.equipped(a);return u&&u.phase==='idle'&&u.cooldown<=0&&!u.pending?u:null;}
 socket(a){return V.add(companionRoot(a),{x:0,y:.9,z:0});}
 recruit(a,candidateId){const candidate=this.sim.actors[candidateId],kind=candidate?.speciesId;
  if(!candidate||candidate.dead||candidate.wildState!=='neutral'||!kind||!SPECIES[kind]||this.data.units[candidate.id]||this.all().length>=128||V.len(V.sub(a.pos,candidate.pos))>4.5)return false;
  if(!this.base(a.id)){if(Object.keys(this.data.bases).length>=64)return false;this.data.bases[a.id]={owner:a.id,pos:{...a.pos},slots:Array(9).fill(null)};}
  this.sim.physics.removeBody(candidate);delete this.sim.actors[candidate.id];
  const id=candidate.id;this.data.units[id]={id,owner:a.id,kind,location:'reserve',slot:null,phase:'idle',cooldown:0,pending:null,cargo:null,target:null,progress:0,retry:0,pos:this.socket(a),previous:this.socket(a),velocity:{x:0,y:0,z:0},type:'companion',body:null,collider:null};
  this.sim.emit('companion-recruited',a,{companionId:id,name:SPECIES[kind].name});return true;
 }
 removeBody(u){if(u.body!==null){this.sim.physics.removeBody(u);u.body=null;u.collider=null;}}
 stopShot(u){for(const p of Object.values(this.sim.projectiles))if(p.companionId===u.id){u.pos={...p.pos};this.sim.physics.removeBody(p);delete this.sim.projectiles[p.id];}}
 assign(a,u,destination){if(!u||u.owner!==a.id||!['reserve','work','combat'].includes(destination.location))return false;
  if(u.pending&&destination.location===u.location&&(u.location!=='combat'||destination.slot===u.slot)){u.pending=null;return true;}
  if(destination.location==='combat'&&(!Number.isInteger(destination.slot)||destination.slot<0||destination.slot>=COMPANION_SLOTS))return false;
  if(destination.location==='work'&&(!this.nearBase(a)||!SPECIES[u.kind].capabilities.gather))return false;
  const other=destination.location==='combat'?this.equipped(a,destination.slot):null;
  if(destination.location==='combat'&&this.owned(a.id).some(v=>v!==u&&v.pending?.location==='combat'&&v.pending.slot===destination.slot))return false;
  if(other&&other!==u&&(other.phase==='flight'||other.phase==='return')){u.pending={...destination};other.pending={location:'reserve'};return true;}
  // Never teleport a live projectile or duplicate carried resources into a second placement.
  if(u.cargo&&u.location!=='work'&&destination.location==='combat')return false;
  if(u.phase==='flight'||u.phase==='return'||u.cargo&&u.location==='work'){u.pending={...destination};return true;}
  if(u.location==='combat'&&(a.combat.action?.companionId===u.id||a.companionSlot===u.slot&&['charge','secondary','guard'].includes(a.combat.state))){const c=a.combat;Combat.resetCombo(c);c.state='idle';c.elapsed=0;c.action=null;c.charge=0;c.secondary=false;}
  const oldSlot=u.slot;this.removeBody(u);if(other&&other!==u){if(a.companionSlot===other.slot)a.companionSlot=-1;other.pending=null;other.location='reserve';other.slot=null;}
  u.location=destination.location;u.slot=destination.location==='combat'?destination.slot:null;u.phase='idle';u.pending=null;u.target=null;u.progress=0;
  if(u.location==='work'){u.pos=V.add(this.base(a.id).pos,{x:1,y:1,z:0});this.sim.physics.addBall(u,.23,{x:0,y:0,z:0},0);}
  if(oldSlot!==null&&a.companionSlot===oldSlot)a.companionSlot=u.location==='combat'?u.slot:-1;
  this.sim.emit('companion-assigned',a,{companionId:u.id,location:u.location});return true;
 }
 command(a,c){if(c.action==='recruit')return this.recruit(a,c.candidateId);
  if(c.action==='select'){if(c.slot===-1||this.equipped(a,c.slot)){if(a.companionSlot!==c.slot&&['charge','secondary','guard'].includes(a.combat.state)){a.combat.state='idle';a.combat.charge=0;a.combat.action=null;}a.companionSlot=c.slot;Combat.resetCombo(a.combat);return true;}return false;}
  if(c.action==='collect'){const b=this.base(a.id);if(!b||!this.nearBase(a))return false;for(let n=0;n<b.slots.length;n++){const s=b.slots[n];if(!s)continue;const left=Inventory.addTo(a.inventory.slots,s.id,s.count);if(left<s.count)this.sim.markItem(s.id);b.slots[n]=left?{id:s.id,count:left}:null;}for(const u of this.owned(a.id).filter(u=>u.location==='reserve'&&u.cargo)){const left=Inventory.addTo(a.inventory.slots,u.cargo.id,u.cargo.count);if(left<u.cargo.count)this.sim.markItem(u.cargo.id);u.cargo=left?{...u.cargo,count:left}:null;}return true;}
  return this.assign(a,this.data.units[c.id],{location:c.location,slot:c.slot});
 }
 action(a,kind,tier){const u=this.ready(a);if(!u||!SPECIES[u.kind].capabilities.attack||!['light','charged'].includes(kind))return null;const def=Combat.weapon(a,this.sim),mult=kind==='charged'?(tier===2?2:1.5):1;
  return {name:kind,weapon:def.mode==='ball'?'bow':'fist',weaponKey:u.id,kind:def.mode==='ball'?'companionBall':'companionClaw',motion:def.mode==='ball'?'sweep':'clamp',companionId:u.id,companionKind:u.kind,companionMode:def.mode,projectile:def.projectile?{...def.projectile}:null,owner:a.id,combo:0,comboCount:1,tier,wind:def.wind,active:def.active,recovery:def.recovery,reach:def.reach,arc:def.arc,damage:statStep((def.damage+(a.rpg?.skills.might||0)*5)*mult,STAT_SCALE.damage),poise:statStep(def.poise*mult,STAT_SCALE.poise),cost:statStep(def.cost*(tier?1+tier*.5:1),STAT_SCALE.stamina),impulse:5,enemy:false,dir:{...a.facing},hits:[],touched:[],fired:false,staminaRefunded:false,sequence:0};
 }
 start(a,act){const u=this.data.units[act.companionId];if(!u||this.ready(a)!==u)return false;u.cooldown=SPECIES[u.kind].capabilities.attack.cooldown;return true;}
 launched(shot){const u=this.data.units[shot.companionId];if(u){u.phase='flight';u.pos={...shot.pos};}}
 returned(shot){const u=this.data.units[shot.companionId];if(u&&u.phase==='flight'){u.pos={...shot.pos};u.phase='return';}}
 activity(u){
  if(u.phase==='flight'){const shot=Object.values(this.sim.projectiles).find(p=>p.companionId===u.id);return shot?.throwPhase==='ground'?'착지 · 잠깐 쉬는 중':shot?.spent?'낙하 중':'포물선 비행';}
  if(u.phase==='return')return '회수 중';
  if(u.location==='reserve'&&u.cargo)return '보관함 가득 참 · 자원 수거 대기';
  const c=this.sim.actors[u.owner]?.combat,act=c?.action;if(c?.state==='attack'&&act?.companionId===u.id)return c.elapsed<act.wind?'공격 준비':c.elapsed<act.wind+act.active?(act.kind==='companionBall'?'투척':'집게 접촉'):'공격 회복';
  return u.cooldown>0?'준비까지 '+(u.cooldown/1000).toFixed(1)+'초':u.location==='combat'?'공격 준비됨':u.phase==='carry'?'거점으로 운반':u.phase==='gather'?'채집 중':u.phase==='travel'?'자원으로 이동':'대기';
 }
  updateThrow(shot){const u=this.data.units[shot.companionId],a=u&&this.sim.actors[u.owner],body=this.sim.physics.world.getRigidBody(shot.body);if(!u||!a||!body)return;
   const def=SPECIES[u.kind].capabilities.attack;shot.spent=!!shot.spent||shot.age>shot.lifetime;
  const support=this.sim.physics.ballSupport(shot);shot.supportTicks=support?(shot.supportTicks||0)+1:0;
   if(shot.supportTicks>=2){if(shot.throwPhase!=='ground'){const radius=shot.radius||def.projectile.radius,center=V.add(support.point,V.scale(support.normal,radius+.015));body.setTranslation(center,true);body.setLinvel({x:0,y:0,z:0},true);body.setAngvel({x:0,y:0,z:0},true);body.setGravityScale(0,true);shot.pos={...center};shot.velocity={x:0,y:0,z:0};shot.throwPhase='ground';shot.groundMs=0;shot.spent=true;this.sim.emit('companion-landed',a,{companionId:u.id,point:{...support.point}});}shot.groundMs=(shot.groundMs||0)+CFG.stepMs;}
   else{body.setGravityScale(def.projectile.gravity,true);shot.groundMs=0;shot.throwPhase=shot.spent?'fall':'flight';}
  if(shot.throwPhase==='ground'&&shot.groundMs>=def.groundHoldMs){this.returned(shot);this.sim.physics.removeBody(shot);delete this.sim.projectiles[shot.id];return;}
  if(shot.pos.y<CFG.bottom-2||shot.age>12000&&V.len(shot.velocity)<.08&&!support){this.stopShot(u);if(a.companionSlot===u.slot)a.companionSlot=-1;u.location='reserve';u.slot=null;u.phase='idle';u.pending=null;this.sim.emit('companion-safety',a,{reason:shot.pos.y<CFG.bottom?'월드 밖':'끼임'});}
 }
 unavailable(a){for(const u of this.owned(a.id)){this.stopShot(u);this.removeBody(u);u.location='reserve';u.slot=null;u.phase='idle';u.pending=null;u.target=null;}a.companionSlot=-1;}
 completePending(a,u){const pending=u.pending;u.pending=null;if(pending&&!this.assign(a,u,pending))this.assign(a,u,{location:'reserve'});}
 target(u){const b=this.base(u.owner),g=SPECIES[u.kind].capabilities.gather,world=this.sim.terrain,claimed=new Set(this.all().filter(v=>v!==u&&v.target).map(v=>v.target.key)),out=[];
  for(let x=Math.floor(b.pos.x)-4;x<=b.pos.x+4;x++)for(let z=Math.floor(b.pos.z)-4;z<=b.pos.z+4;z++)for(let y=Math.floor(b.pos.y)-2;y<=b.pos.y+5;y++){
   const id=world.get(x,y,z),block=BLOCKS[id],key=blockKey(x,y,z);if(Math.hypot(x+.5-b.pos.x,z+.5-b.pos.z)<1.7||!g.blocks.includes(block?.id)||!Number.isFinite(block.hardness)||block.tier>0||claimed.has(key))continue;
   // Only exposed, low-tier resources; no underground mining or extra economy.
   if(world.get(x,y+1,z))continue;
   out.push({x,y,z,id,key,d:Math.hypot(x+.5-u.pos.x,y+1-u.pos.y,z+.5-u.pos.z)});
  }out.sort((a,b)=>a.d-b.d||cmp(a.key,b.key));return out[0]||null;
 }
 move(u,to){const body=this.sim.physics.world.getRigidBody(u.body);if(!body)return false;let delta=V.sub(to,u.pos),dist=V.len(delta);if(dist<.7){body.setLinvel({x:0,y:0,z:0},true);return true;}
  if(!this.sim.physics.sight(u.pos,to)){if(u.pos.y>Math.max(to.y,this.base(u.owner).pos.y)+3){body.setLinvel({x:0,y:0,z:0},true);u.target=null;u.retry=1500;return false;}delta={x:0,y:1,z:0};}
  body.setLinvel(V.scale(V.norm(delta),Math.min(2.5,dist*3)),true);return false;
 }
 tick(){const dt=CFG.stepMs,sim=this.sim;
  for(const u of this.all()){const a=sim.actors[u.owner];u.cooldown=Math.max(0,u.cooldown-dt);u.previous={...u.pos};if(!a||a.dead||a.suspended)continue;
   if(u.phase==='flight'){const p=Object.values(sim.projectiles).find(p=>p.companionId===u.id);if(p)u.pos={...p.pos};else u.phase='return';continue;}
   if(u.phase==='return'){const to=this.socket(a,u.slot),delta=V.sub(to,u.pos),dist=V.len(delta);u.pos=dist<.4?to:V.add(u.pos,V.scale(V.norm(delta),Math.min(dist,10*dt/1000)));if(dist<.4){u.phase='idle';this.completePending(a,u);}continue;}
   if(u.pending&&u.phase==='idle'&&!u.cargo){this.completePending(a,u);if(u.pending)continue;}
   if(u.location!=='work'){if(u.location==='combat')u.pos=this.socket(a,u.slot);continue;}
   if(u.cargo){u.phase='carry';if(this.move(u,V.add(this.base(a.id).pos,{x:1,y:1,z:0}))){const left=Inventory.addTo(this.base(a.id).slots,u.cargo.id,u.cargo.count);if(left<u.cargo.count){sim.markItem(u.cargo.id);sim.emit('companion-delivery',a,{item:u.cargo.id,count:u.cargo.count-left});}u.cargo=left?{...u.cargo,count:left}:null;if(!u.cargo){u.phase='idle';this.completePending(a,u);}else{this.removeBody(u);u.location='reserve';u.slot=null;u.phase='idle';u.pending=null;u.target=null;u.progress=0;sim.emit('companion-storage-full',a);}}continue;}
   if(!u.target){u.retry-=dt;if(u.retry>0)continue;u.target=this.target(u);u.retry=1000;u.progress=0;if(!u.target){u.phase='idle';continue;}}
   const t=u.target;if(sim.terrain.get(t.x,t.y,t.z)!==t.id){u.target=null;continue;}
   u.phase='travel';if(!this.move(u,{x:t.x+.5,y:t.y+1.35,z:t.z+.5}))continue;u.phase='gather';u.progress+=dt*SPECIES[u.kind].capabilities.gather.speed;
   if(u.progress<BLOCKS[t.id].hardness||Object.keys(sim.drops).length>=CFG.maxDrops)continue;
   const before=new Set(Object.keys(sim.drops));if(sim.harvest(a,{...t,normal:{x:0,y:1,z:0}})){
    const drop=Object.values(sim.drops).find(d=>!before.has(d.id));if(drop){u.cargo={id:drop.item,count:drop.count};sim.physics.removeBody(drop);delete sim.drops[drop.id];}
   }u.target=null;u.progress=0;
  }
 }
 snapshot(){return structuredClone(this.data);}
 static validate(data,actors,shots){const fail=()=>{throw Error('동료 저장 상태 손상');};if(data===undefined){if(shots.some(p=>p.companionId))fail();return;}if(!data||!data.units||!data.bases||!Number.isSafeInteger(data.sequence)||data.sequence<0||Object.keys(data.units).length>128||Object.keys(data.bases).length>64)fail();const slots=new Set(),pendingSlots=new Set(),bodies=new Set();
  for(const [owner,b]of Object.entries(data.bases))if(!b||b.owner!==owner||!b.pos||!['x','y','z'].every(k=>Number.isFinite(b.pos[k]))||!Array.isArray(b.slots)||b.slots.length!==9||!b.slots.every(Inventory.validateStack.bind(Inventory)))fail();
  for(const [id,u]of Object.entries(data.units)){
   const oldId=/^companion:([1-9]\d*)$/.exec(id),creatureId=/^creature:[1-9]\d*$/.test(id),legacyCandidateId=/^enemy:[1-9]\d*$/.test(id);
   if((!oldId&&!creatureId&&!legacyCandidateId)||oldId&&Number(oldId[1])>data.sequence||actors.some(a=>a.id===id)||!u||u.id!==id||!SPECIES[u.kind]||!data.bases[u.owner]||!['reserve','work','combat'].includes(u.location)||!['idle','travel','gather','carry','flight','return'].includes(u.phase)||![u.cooldown,u.progress,u.retry].every(Number.isFinite)||u.cooldown<0||!u.pos||!['x','y','z'].every(k=>Number.isFinite(u.pos[k]))||u.cargo&&(!Inventory.validateStack(u.cargo)||u.cargo.count>SPECIES[u.kind].capabilities.carry.capacity)||u.location==='work'&&(!Number.isFinite(u.body)||!Number.isFinite(u.collider))||u.location!=='work'&&u.body!==null)fail();
   if(u.body!==null){if(bodies.has(u.body))fail();bodies.add(u.body);}
   if(u.location==='combat'){const key=u.owner+':'+u.slot;if(!Number.isInteger(u.slot)||u.slot<0||u.slot>=COMPANION_SLOTS||slots.has(key))fail();slots.add(key);}else if(u.slot!==null)fail();
   if(u.pending&&(!['reserve','work','combat'].includes(u.pending.location)||u.pending.location==='combat'&&(!Number.isInteger(u.pending.slot)||u.pending.slot<0||u.pending.slot>=COMPANION_SLOTS||pendingSlots.has(u.owner+':'+u.pending.slot))))fail();if(u.pending?.location==='combat')pendingSlots.add(u.owner+':'+u.pending.slot);
   if(u.target&&(!['x','y','z','id'].every(k=>Number.isInteger(u.target[k]))||u.target.key!==blockKey(u.target.x,u.target.y,u.target.z)||!SPECIES[u.kind].capabilities.gather.blocks.includes(BLOCKS[u.target.id]?.id)))fail();
   if(u.phase==='flight'&&(u.location!=='combat'||shots.filter(p=>p.companionId===id&&p.source===u.owner).length!==1))fail();
  }
  for(const p of shots)if(p.companionId&&(!data.units[p.companionId]||data.units[p.companionId].owner!==p.source||data.units[p.companionId].phase!=='flight'||p.spent!==undefined&&typeof p.spent!=='boolean'||p.throwPhase!==undefined&&!['flight','fall','ground'].includes(p.throwPhase)||p.groundMs!==undefined&&(!Number.isFinite(p.groundMs)||p.groundMs<0)||p.supportTicks!==undefined&&(!Number.isInteger(p.supportTicks)||p.supportTicks<0)))fail();
  for(const a of actors){if(a.speciesId!==undefined&&a.speciesId!==null&&(!SPECIES[a.speciesId]||!['neutral','retaliating'].includes(a.wildState)||!a.homePos||!['x','y','z'].every(k=>Number.isFinite(a.homePos[k]))||a.targetId!==null&&typeof a.targetId!=='string'||a.enemy!==(a.wildState==='retaliating')))fail();if(a.companionSlot!==undefined&&(!Number.isInteger(a.companionSlot)||a.companionSlot< -1||a.companionSlot>=COMPANION_SLOTS))fail();const id=a.combat?.action?.companionId;if(id&&(!data.units[id]||data.units[id].owner!==a.id||data.units[id].location!=='combat'))fail();}
 }
}
