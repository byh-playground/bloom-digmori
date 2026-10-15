class Companions {
 constructor(sim,data={units:{},bases:{},sequence:0}){this.sim=sim;this.data=structuredClone(data);}
 all(){return Object.values(this.data.units).sort((a,b)=>cmp(a.id,b.id));}
 owned(owner){return this.all().filter(u=>u.owner===owner);}
 bodies(){return this.all().filter(u=>u.body!==null);}
 base(owner){return this.data.bases[owner]||null;}
 nearBase(a){const b=this.base(a.id);return b&&V.len(V.sub(a.pos,b.pos))<=7;}
 equipped(a,slot=a.companionSlot){return this.owned(a.id).find(u=>u.location==='combat'&&u.slot===slot)||null;}
 ready(a){const u=this.equipped(a);return u&&u.phase==='idle'&&u.cooldown<=0&&!u.pending?u:null;}
 socket(a,slot=0){slot=slot===a.companionSlot?0:slot===0&&a.companionSlot>=0?a.companionSlot:slot;const f=V.norm({x:a.facing.x,y:0,z:a.facing.z}),side={x:f.z,y:0,z:-f.x};return V.add(a.pos,V.add({x:0,y:slot===2?1.3:.85,z:0},V.add(V.scale(side,slot===1?-.4:.4),V.scale(f,.3))));}
 recruit(a,kind){if(!COMPANION_TYPES[kind]||this.all().length>=128||this.owned(a.id).some(u=>u.kind===kind)||V.len(V.sub(a.pos,this.sim.terrain.spawn))>8)return false;
  if(!this.base(a.id)){if(Object.keys(this.data.bases).length>=64)return false;this.data.bases[a.id]={owner:a.id,pos:{...this.sim.terrain.spawn},slots:Array(9).fill(null)};}
  const id='companion:'+ ++this.data.sequence;this.data.units[id]={id,owner:a.id,kind,location:'reserve',slot:null,phase:'idle',cooldown:0,pending:null,cargo:null,target:null,progress:0,retry:0,pos:this.socket(a),previous:this.socket(a),velocity:{x:0,y:0,z:0},type:'companion',body:null,collider:null};
  this.sim.emit('companion-recruited',a,{companionId:id,name:COMPANION_TYPES[kind].name});return true;
 }
 removeBody(u){if(u.body!==null){this.sim.physics.removeBody(u);u.body=null;u.collider=null;}}
 stopShot(u){for(const p of Object.values(this.sim.projectiles))if(p.companionId===u.id){u.pos={...p.pos};this.sim.physics.removeBody(p);delete this.sim.projectiles[p.id];}}
 assign(a,u,destination){if(!u||u.owner!==a.id||!['reserve','work','combat'].includes(destination.location))return false;
  if(destination.location==='combat'&&(!Number.isInteger(destination.slot)||destination.slot<0||destination.slot>=COMPANION_SLOTS))return false;
  if(destination.location==='work'&&(!this.nearBase(a)||!COMPANION_TYPES[u.kind].capabilities.gather))return false;
  const other=destination.location==='combat'?this.equipped(a,destination.slot):null;if(other&&other!==u&&(other.phase!=='idle'||other.pending||a.combat.action?.companionId===other.id))return false;
  // Never teleport a live projectile or duplicate carried resources into a second placement.
  if(u.cargo&&u.location!=='work'&&destination.location==='combat')return false;
  if(u.phase==='flight'||u.phase==='return'||u.cargo&&u.location==='work'){u.pending={...destination};if(u.phase==='flight'){this.stopShot(u);u.phase='return';}return true;}
  if(u.location==='combat'&&(a.combat.action?.companionId===u.id||a.companionSlot===u.slot&&['charge','secondary','guard'].includes(a.combat.state))){const c=a.combat;Combat.resetCombo(c);c.state='idle';c.elapsed=0;c.action=null;c.charge=0;c.secondary=false;}
  const oldSlot=u.slot;this.removeBody(u);if(other&&other!==u){other.location='reserve';other.slot=null;}
  u.location=destination.location;u.slot=destination.location==='combat'?destination.slot:null;u.phase='idle';u.pending=null;u.target=null;u.progress=0;
  if(u.location==='work'){u.pos=V.add(this.base(a.id).pos,{x:1,y:1,z:0});this.sim.physics.addBall(u,.23,{x:0,y:0,z:0},0);}
  if(oldSlot!==null&&a.companionSlot===oldSlot)a.companionSlot=u.location==='combat'?u.slot:-1;
  this.sim.emit('companion-assigned',a,{companionId:u.id,location:u.location});return true;
 }
 command(a,c){if(c.action==='recruit')return this.recruit(a,c.kind);
  if(c.action==='select'){if(c.slot===-1||this.equipped(a,c.slot)){a.companionSlot=c.slot;Combat.resetCombo(a.combat);return true;}return false;}
  if(c.action==='collect'){const b=this.base(a.id);if(!b||!this.nearBase(a))return false;for(let n=0;n<b.slots.length;n++){const s=b.slots[n];if(!s)continue;const left=Inventory.addTo(a.inventory.slots,s.id,s.count);if(left<s.count)this.sim.markItem(s.id);b.slots[n]=left?{id:s.id,count:left}:null;}for(const u of this.owned(a.id).filter(u=>u.location==='reserve'&&u.cargo)){const left=Inventory.addTo(a.inventory.slots,u.cargo.id,u.cargo.count);u.cargo=left?{...u.cargo,count:left}:null;}return true;}
  return this.assign(a,this.data.units[c.id],{location:c.location,slot:c.slot});
 }
 action(a,kind,tier){const u=this.ready(a);if(!u||!COMPANION_TYPES[u.kind].capabilities.attack)return null;const def=COMPANION_TYPES[u.kind].capabilities.attack;
  return {name:kind,weapon:def.mode==='ball'?'bow':'sword',weaponKey:u.id,kind:def.mode==='ball'?'companionBall':'swing',motion:'sweep',companionId:u.id,companionKind:u.kind,companionMode:def.mode,origin:this.socket(a,u.slot),owner:a.id,combo:0,comboCount:1,tier,wind:300,active:def.mode==='ball'?80:280,recovery:350,reach:def.reach,arc:1.9,damage:def.damage*(tier?1.5:1),poise:def.poise,cost:12,impulse:5,enemy:false,dir:{...a.facing},hits:[],touched:[],fired:false,staminaRefunded:false,sequence:0};
 }
 start(a,act){const u=this.data.units[act.companionId];if(!u||this.ready(a)!==u)return false;u.cooldown=COMPANION_TYPES[u.kind].capabilities.attack.cooldown;return true;}
 launched(shot){const u=this.data.units[shot.companionId];if(u){u.phase='flight';u.pos={...shot.pos};}}
 returned(shot){const u=this.data.units[shot.companionId];if(u&&u.phase==='flight'){u.pos={...shot.pos};u.phase='return';}}
 unavailable(a){for(const u of this.owned(a.id)){this.stopShot(u);this.removeBody(u);u.location='reserve';u.slot=null;u.phase='idle';u.pending=null;u.target=null;}a.companionSlot=-1;}
 completePending(a,u){const pending=u.pending;u.pending=null;if(pending&&!this.assign(a,u,pending))this.assign(a,u,{location:'reserve'});}
 target(u){const b=this.base(u.owner),g=COMPANION_TYPES[u.kind].capabilities.gather,world=this.sim.terrain,claimed=new Set(this.all().filter(v=>v!==u&&v.target).map(v=>v.target.key)),out=[];
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
   if(u.location!=='work'){if(u.location==='combat')u.pos=this.socket(a,u.slot);continue;}
   if(u.cargo){u.phase='carry';if(this.move(u,V.add(this.base(a.id).pos,{x:1,y:1,z:0}))){const left=Inventory.addTo(this.base(a.id).slots,u.cargo.id,u.cargo.count);if(left<u.cargo.count){sim.markItem(u.cargo.id);sim.emit('companion-delivery',a,{item:u.cargo.id,count:u.cargo.count-left});}u.cargo=left?{...u.cargo,count:left}:null;if(!u.cargo){u.phase='idle';this.completePending(a,u);}}continue;}
   if(!u.target){u.retry-=dt;if(u.retry>0)continue;u.target=this.target(u);u.retry=1000;u.progress=0;if(!u.target){u.phase='idle';continue;}}
   const t=u.target;if(sim.terrain.get(t.x,t.y,t.z)!==t.id){u.target=null;continue;}
   u.phase='travel';if(!this.move(u,{x:t.x+.5,y:t.y+1.35,z:t.z+.5}))continue;u.phase='gather';u.progress+=dt*COMPANION_TYPES[u.kind].capabilities.gather.speed;
   if(u.progress<BLOCKS[t.id].hardness||Object.keys(sim.drops).length>=CFG.maxDrops)continue;
   const before=new Set(Object.keys(sim.drops));if(sim.harvest(a,{...t,normal:{x:0,y:1,z:0}})){
    const drop=Object.values(sim.drops).find(d=>!before.has(d.id));if(drop){u.cargo={id:drop.item,count:drop.count};sim.physics.removeBody(drop);delete sim.drops[drop.id];}
   }u.target=null;u.progress=0;
  }
 }
 snapshot(){return structuredClone(this.data);}
 static validate(data,actors,shots){const fail=()=>{throw Error('동료 저장 상태 손상');};if(data===undefined){if(shots.some(p=>p.companionId))fail();return;}if(!data||!data.units||!data.bases||!Number.isSafeInteger(data.sequence)||data.sequence<0||Object.keys(data.units).length>128||Object.keys(data.bases).length>64)fail();const slots=new Set(),kinds=new Set(),bodies=new Set();
  for(const [owner,b]of Object.entries(data.bases))if(!b||b.owner!==owner||!b.pos||!Object.values(b.pos).every(Number.isFinite)||!Array.isArray(b.slots)||b.slots.length!==9||!b.slots.every(Inventory.validateStack.bind(Inventory)))fail();
  for(const [id,u]of Object.entries(data.units)){
   const n=Number(id.slice(10)),kindKey=u?.owner+':'+u?.kind;
   if(!/^companion:[1-9]\d*$/.test(id)||n>data.sequence||!u||u.id!==id||!COMPANION_TYPES[u.kind]||!data.bases[u.owner]||kinds.has(kindKey)||!['reserve','work','combat'].includes(u.location)||!['idle','travel','gather','carry','flight','return'].includes(u.phase)||![u.cooldown,u.progress,u.retry].every(Number.isFinite)||u.cooldown<0||!u.pos||!['x','y','z'].every(k=>Number.isFinite(u.pos[k]))||u.cargo&&(!Inventory.validateStack(u.cargo)||u.cargo.count>COMPANION_TYPES[u.kind].capabilities.carry.capacity)||u.location==='work'&&(!Number.isFinite(u.body)||!Number.isFinite(u.collider))||u.location!=='work'&&u.body!==null)fail();
   kinds.add(kindKey);if(u.body!==null){if(bodies.has(u.body))fail();bodies.add(u.body);}
   if(u.location==='combat'){const key=u.owner+':'+u.slot;if(!Number.isInteger(u.slot)||u.slot<0||u.slot>=COMPANION_SLOTS||slots.has(key))fail();slots.add(key);}else if(u.slot!==null)fail();
   if(u.pending&&(!['reserve','work','combat'].includes(u.pending.location)||u.pending.location==='combat'&&(!Number.isInteger(u.pending.slot)||u.pending.slot<0||u.pending.slot>=COMPANION_SLOTS)))fail();
   if(u.target&&(!['x','y','z','id'].every(k=>Number.isInteger(u.target[k]))||u.target.key!==blockKey(u.target.x,u.target.y,u.target.z)||!COMPANION_TYPES[u.kind].capabilities.gather.blocks.includes(BLOCKS[u.target.id]?.id)))fail();
   if(u.phase==='flight'&&(u.location!=='combat'||shots.filter(p=>p.companionId===id&&p.source===u.owner).length!==1))fail();
  }
  for(const p of shots)if(p.companionId&&(!data.units[p.companionId]||data.units[p.companionId].owner!==p.source||data.units[p.companionId].phase!=='flight'))fail();
  for(const a of actors){if(a.companionSlot!==undefined&&(!Number.isInteger(a.companionSlot)||a.companionSlot< -1||a.companionSlot>=COMPANION_SLOTS))fail();const id=a.combat?.action?.companionId;if(id&&(!data.units[id]||data.units[id].owner!==a.id||data.units[id].location!=='combat'))fail();}
 }
}
