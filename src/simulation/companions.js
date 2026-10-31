'use strict';
// Owned units (D-103…D-107, 0.34.0). Every unit hatches from an egg (Simulation.tickEggs → hatch) into the ranch at the
// egg's cell. A unit is either in a combat slot ('combat': follows its owner and fights, unchanged) or on the ranch
// ('ranch'), Minecraft style with no menu: it stays where it is and roams the cells it can walk (Ranch). Taking a unit out
// of its slot leaves it on the ranch where it stands. Ranch rules, first match wins:
//  1. eat   a baby walks to thrown food of its species (SPECIES.food) within eatRadius and eats it; feedToAdult bites
//           make it an adult (D-105);
//  2. lead  a unit follows its owner while the owner holds that food within leadRadius (wheat-style leading);
//  3. labor an adult in a closed pen that holds a storage chest harvests its aptitude blocks there and carries each drop to
//           the chest (D-106, like a copper golem); harvested blocks grow back after regrowTicks (Simulation.tickRegrow);
//  4. roam  otherwise it wanders: anywhere in a closed pen, within RANCH_RULES.leash blocks of home in an open region.
// Ranch movement is a grid walk over Ranch.step cells (no physics body, integer cells and tick counters), so fences, closed
// gates and pit walls are never crossed. Merging (D-104) is the thrown potion: Simulation.splashPotion → merge.
class Companions {
 constructor(sim,data={units:{},sequence:0}){this.sim=sim;this.data=structuredClone(data);}
 all(){return Object.values(this.data.units).sort((a,b)=>cmp(a.id,b.id));}
 owned(owner){return this.all().filter(u=>u.owner===owner);}
 serial(u){return Number(u.id.slice(u.id.indexOf(':')+1));}
 equipped(a,slot=a.companionSlot){return this.owned(a.id).find(u=>u.location==='combat'&&u.slot===slot)||null;}
 ready(a){const u=this.equipped(a);return u&&u.phase==='idle'&&u.cooldown<=0&&!u.pending?u:null;}
 socket(a){return V.add(companionRoot(a),{x:0,y:.9,z:0});}
 static ranchState(cell){return{cell:cell?{...cell}:null,next:null,stepTick:0,path:[],task:null,wait:0,home:cell?{...cell}:null,food:null};}
 hatch(owner,egg){if(this.all().length>=128||!SPECIES[egg.species])return null;const cell={x:egg.x,y:egg.y,z:egg.z},pos={x:egg.x+.5,y:egg.y,z:egg.z+.5};
  const id='unit:'+ ++this.data.sequence;this.data.units[id]={id,owner:owner.id,kind:egg.species,stage:'baby',grade:EGG_RULES.grade,fed:0,location:'ranch',slot:null,phase:'idle',cooldown:0,pending:null,cargo:null,target:null,progress:0,...Companions.ranchState(cell),pos,previous:{...pos},velocity:{x:0,y:0,z:0},yaw:0,type:'companion',body:null,collider:null};
  return this.data.units[id];}
 stopShot(u){for(const p of Object.values(this.sim.projectiles))if(p.companionId===u.id){u.pos={...p.pos};this.sim.physics.removeBody(p);delete this.sim.projectiles[p.id];}}
 toRanch(u){u.location='ranch';u.slot=null;u.phase='idle';u.target=null;u.progress=0;Object.assign(u,Companions.ranchState(null));}
 // A unit called into a combat slot puts down what it carried (as a drop, never lost) and leaves the ranch walk.
 toCombat(u,slot){if(u.cargo){this.sim.spawnDrop(u.cargo.id,u.cargo.count,u.pos);u.cargo=null;}u.location='combat';u.slot=slot;u.phase='idle';u.target=null;u.progress=0;Object.assign(u,Companions.ranchState(null));}
 assign(a,u,destination){if(!u||u.owner!==a.id||!['ranch','combat'].includes(destination.location))return false;
  if(u.pending&&destination.location===u.location&&(u.location!=='combat'||destination.slot===u.slot)){u.pending=null;return true;}
  // A baby stays on the ranch until it is an adult.
  if(destination.location==='combat'&&u.stage!=='adult')return false;
  if(destination.location==='combat'&&(!Number.isInteger(destination.slot)||destination.slot<0||destination.slot>=COMPANION_SLOTS))return false;
  if(destination.location==='ranch'&&u.location==='ranch')return true;
  const other=destination.location==='combat'?this.equipped(a,destination.slot):null;
  if(destination.location==='combat'&&this.owned(a.id).some(v=>v!==u&&v.pending?.location==='combat'&&v.pending.slot===destination.slot))return false;
  if(other&&other!==u&&(other.phase==='flight'||other.phase==='return')){u.pending={...destination};other.pending={location:'ranch'};return true;}
  // Never teleport a live projectile: a thrown unit is reassigned when it is back.
  if(u.phase==='flight'||u.phase==='return'){u.pending={...destination};return true;}
  if(u.location==='combat'&&a.combat.action?.companionId===u.id){const c=a.combat;Combat.resetCombo(c);c.state='idle';c.elapsed=0;c.action=null;}
  const oldSlot=u.slot;if(other&&other!==u){if(a.companionSlot===other.slot)a.companionSlot=-1;other.pending=null;this.toRanch(other);}
  if(destination.location==='combat')this.toCombat(u,destination.slot);else this.toRanch(u);u.pending=null;
  if(oldSlot!==null&&a.companionSlot===oldSlot)a.companionSlot=u.location==='combat'?u.slot:-1;
  this.sim.emit('companion-assigned',a,{companionId:u.id,location:u.location});return true;
 }
 command(a,c){
  if(c.action==='select'){if(c.slot===-1||this.equipped(a,c.slot)){a.companionSlot=c.slot;Combat.resetCombo(a.combat);return true;}return false;}
  if(c.action==='assign')return this.assign(a,this.data.units[c.id],{location:c.location,slot:c.slot});
  return false;
 }
 action(a){const u=this.ready(a);if(!u||!SPECIES[u.kind].capabilities.attack)return null;const def=Combat.weapon(a,this.sim),ball=def.mode==='ball';
  return {name:'light',weapon:ball?'ball':'fist',weaponKey:u.id,kind:ball?'companionBall':'companionMelee',motion:ball?'sweep':'clamp',companionId:u.id,companionKind:u.kind,companionMode:def.mode,projectile:def.projectile?{...def.projectile}:null,owner:a.id,combo:0,comboCount:1,wind:def.wind,active:def.active,recovery:def.recovery,reach:def.reach,arc:def.arc,damage:statStep(def.damage+(a.rpg?.skills.might||0)*5,STAT_SCALE.damage),heavy:!!def.heavy,impulse:5,enemy:false,dir:{...a.facing},hits:[],touched:[],fired:false,sequence:0};
 }
 start(a,act){const u=this.data.units[act.companionId];if(!u||this.ready(a)!==u)return false;u.cooldown=SPECIES[u.kind].capabilities.attack.cooldown;return true;}
 launched(shot){const u=this.data.units[shot.companionId];if(u){u.phase='flight';u.pos={...shot.pos};}}
 returned(shot){const u=this.data.units[shot.companionId];if(u&&u.phase==='flight'){u.pos={...shot.pos};u.phase='return';}}
 activity(u){
  if(u.location==='ranch'){
   if(u.stage!=='adult')return '아기 · 먹이 '+u.fed+'/'+RANCH_RULES.feedToAdult+' · '+(u.phase==='eat'?'먹는 중':u.task==='eat'?'먹이로 가는 중':u.task==='lead'?'먹이를 든 주인을 따라감':'목장에서 돌아다님');
   return u.phase==='gather'?'채집 중':u.cargo?(u.task==='full'?'상자가 가득 참':'상자로 운반'):u.task==='gather'?'채집하러 가는 중':u.task==='lead'?'먹이를 든 주인을 따라감':'목장에서 돌아다님';
  }
  if(u.phase==='flight'){const shot=Object.values(this.sim.projectiles).find(p=>p.companionId===u.id);return shot?.throwPhase==='ground'?'착지 · 잠깐 쉬는 중':shot?.spent?'낙하 중':'껍질 굴리기';}
  if(u.phase==='return')return '회수 중';
  const c=this.sim.actors[u.owner]?.combat,act=c?.action;if(c?.state==='attack'&&act?.companionId===u.id)return c.elapsed<act.wind?'공격 준비':c.elapsed<act.wind+act.active?(act.kind==='companionBall'?'투척':'근접 타격'):'공격 회복';
  return u.cooldown>0?'준비까지 '+(u.cooldown/1000).toFixed(1)+'초':'공격 준비됨';
 }
  updateThrow(shot){const u=this.data.units[shot.companionId],a=u&&this.sim.actors[u.owner],body=this.sim.physics.world.getRigidBody(shot.body);if(!u||!a||!body)return;
   const def=SPECIES[u.kind].capabilities.attack;shot.spent=!!shot.spent||shot.age>shot.lifetime;
  const support=this.sim.physics.ballSupport(shot);shot.supportTicks=support?(shot.supportTicks||0)+1:0;
   if(shot.supportTicks>=2){if(shot.throwPhase!=='ground'){const radius=shot.radius||def.projectile.radius,center=V.add(support.point,V.scale(support.normal,radius+.015));body.setTranslation(center,true);body.setLinvel({x:0,y:0,z:0},true);body.setAngvel({x:0,y:0,z:0},true);body.setGravityScale(0,true);shot.pos={...center};shot.velocity={x:0,y:0,z:0};shot.throwPhase='ground';shot.groundMs=0;shot.spent=true;this.sim.emit('companion-landed',a,{companionId:u.id,point:{...support.point}});}shot.groundMs=(shot.groundMs||0)+CFG.stepMs;}
   else{body.setGravityScale(def.projectile.gravity,true);shot.groundMs=0;shot.throwPhase=shot.spent?'fall':'flight';}
  if(shot.throwPhase==='ground'&&shot.groundMs>=def.groundHoldMs){this.returned(shot);this.sim.physics.removeBody(shot);delete this.sim.projectiles[shot.id];return;}
  // A lost ball (out of the world or wedged) comes straight back to its owner's side, still in its slot.
  if(shot.pos.y<CFG.bottom-2||shot.age>12000&&V.len(shot.velocity)<.08&&!support){this.stopShot(u);u.pos=this.socket(a);u.phase='idle';this.completePending(a,u);this.sim.emit('companion-safety',a,{reason:shot.pos.y<CFG.bottom?'월드 밖':'끼임'});}
 }
 // Death, leaving or suspension: thrown units come back, combat units keep their slot (they rejoin at the respawn point),
 // ranch units stay where they are.
 unavailable(a){for(const u of this.owned(a.id)){if(u.phase==='flight'||u.phase==='return'){this.stopShot(u);u.phase='idle';}u.pending=null;}a.companionSlot=-1;}
 completePending(a,u){const pending=u.pending;u.pending=null;if(pending&&!this.assign(a,u,pending))this.assign(a,u,{location:'ranch'});}
 // Combat units walk after their owner on the owner's ground level (no body, so they never block terrain or attacks).
 // The selected combat unit stands at the strike root beside the owner; the rest trail behind in rows of three.
 // Far behind (teleport, respawn) they rejoin at once.
 follow(a,u,index){const f=V.norm({x:a.facing.x,y:0,z:a.facing.z}),side={x:-f.z,y:0,z:f.x},row=Math.floor(index/3),col=[0,-1,1][index%3];
  const to=index<0?{...companionRoot(a),y:a.pos.y}:{x:a.pos.x-f.x*(1.6+row*1.2)+side.x*col*1.1,y:a.pos.y,z:a.pos.z-f.z*(1.6+row*1.2)+side.z*col*1.1};
  const delta=V.sub(to,u.pos),dist=V.len(delta),dt=CFG.stepMs/1000;
  if(dist>16){u.pos=to;u.previous={...to};u.velocity={x:0,y:0,z:0};}
  else if(dist>.08){const step=Math.min(dist,(dist>3?7:4.2)*dt);u.velocity=V.scale(delta,step/dist/dt);u.pos=V.add(u.pos,V.scale(delta,step/dist));if(Math.hypot(delta.x,delta.z)>.05)u.yaw=Math.atan2(-delta.x,-delta.z);}
  else{u.velocity={x:0,y:0,z:0};u.yaw=Math.atan2(-a.facing.x,-a.facing.z);}
 }
 // ---- Ranch (grid walk) ----
 stepTicks(u){const t=RANCH_RULES.stepTicks[u.kind];return u.stage==='adult'?t:Math.ceil(t*5/4);}
 // A unit that lost its cell (just left a slot, or the ground changed) takes the nearest standable cell around it.
 snap(u){const P=this.sim.ranch,bx=Math.floor(u.pos.x),by=Math.floor(u.pos.y+.05),bz=Math.floor(u.pos.z);
  for(let r=0;r<=2;r++)for(const dy of [0,1,-1,2,-2,3,-3])for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;const x=bx+dx,y=by+dy,z=bz+dz;
   if(!P.standable(x,y,z))continue;u.cell={x,y,z};u.next=null;u.stepTick=0;u.path=[];u.home??={x,y,z};this.placeRanch(u);return true;}
  return false;}
 placeRanch(u){const c=u.cell,n=u.next,k=n?u.stepTick/this.stepTicks(u):0,ix=n?n.x-c.x:0,iy=n?n.y-c.y:0,iz=n?n.z-c.z:0;
  u.pos={x:c.x+.5+ix*k,y:c.y+iy*k,z:c.z+.5+iz*k};const v=n?1000/(CFG.stepMs*this.stepTicks(u)):0;u.velocity={x:ix*v,y:iy*v,z:iz*v};}
 face(u,dx,dz){if(dx||dz)u.yaw=Math.abs(dx)>=Math.abs(dz)?RANCH_YAW[(dx>0?1:-1)+',0']:RANCH_YAW['0,'+(dz>0?1:-1)];}
 // Take the next cell of the current path if that step is still what Ranch.step gives; otherwise the path is dropped.
 advance(u){const P=this.sim.ranch,c=u.cell,n=u.path[0];if(!n)return false;const s=P.step(c.x,c.y,c.z,n.x-c.x,n.z-c.z);
  if(!s||s.x!==n.x||s.y!==n.y||s.z!==n.z||Math.abs(n.x-c.x)+Math.abs(n.z-c.z)!==1){u.path=[];return false;}
  u.path.shift();u.next={...n};u.stepTick=0;this.face(u,n.x-c.x,n.z-c.z);this.placeRanch(u);return true;}
 // Walk toward the first region cell passing `test`: null when none is reachable, else {arrived, end} with the goal cell.
 go(u,task,region,test){const path=this.sim.ranch.path(region,u.cell,test);if(path===null)return null;u.task=task;if(!path.length){u.path=[];return{arrived:true,end:u.cell};}
  u.path=path.slice(0,RANCH_RULES.pathMax);this.advance(u);return{arrived:false,end:path.at(-1)};}
 ranch(u,a){const sim=this.sim,P=sim.ranch;
  if(u.cell&&!u.next&&!P.standable(u.cell.x,u.cell.y,u.cell.z))u.cell=null;
  if(!u.cell){u.task=null;u.velocity={x:0,y:0,z:0};if(!this.snap(u))return;}
  if(u.next){if(!P.passable(u.next.x,u.next.y,u.next.z)){u.next=null;u.stepTick=0;u.path=[];this.placeRanch(u);return;}
   if(++u.stepTick>=this.stepTicks(u)){u.cell=u.next;u.next=null;u.stepTick=0;}this.placeRanch(u);if(u.next)return;}
  if(u.phase==='eat'){this.eat(u,a);return;}
  if(u.phase==='gather'){this.gather(u,a);return;}
  const r=P.region(u.cell.x,u.cell.y,u.cell.z),key=c=>blockKey(c.x,c.y,c.z);
  // 1. eat: the nearest thrown food of its species in reach (straight distance, then drop id).
  if(u.stage!=='adult'){const food=SPECIES[u.kind].food,drops=Object.values(sim.drops).filter(d=>d.item===food&&V.len(V.sub(d.pos,u.pos))<=RANCH_RULES.eatRadius).sort((x,y)=>V.len(V.sub(x.pos,u.pos))-V.len(V.sub(y.pos,u.pos))||cmp(x.id,y.id));
   for(const d of drops){const cell={x:Math.floor(d.pos.x),y:Math.floor(d.pos.y),z:Math.floor(d.pos.z)};if(!r.cells.has(key(cell)))continue;
    const walk=this.go(u,'eat',r,c=>c.x===cell.x&&c.y===cell.y&&c.z===cell.z);if(walk===null)continue;
    if(walk.arrived){u.phase='eat';u.progress=0;u.food=d.id;u.velocity={x:0,y:0,z:0};this.face(u,d.pos.x-u.pos.x,d.pos.z-u.pos.z);}return;}}
  // 2. lead: the owner holds the species food nearby.
  const held=Inventory.selected(a.inventory);if(held?.id===SPECIES[u.kind].food&&V.len(V.sub(a.pos,u.pos))<=RANCH_RULES.leadRadius){
   const flat=c=>Math.hypot(c.x+.5-a.pos.x,c.z+.5-a.pos.z);let best=null;for(const c of r.list)if(!best||flat(c)<flat(best)-1e-9)best=c;
   u.home={...u.cell};if(flat(u.cell)<=1.6||best===u.cell||key(best)===key(u.cell)){u.task='lead';u.path=[];this.face(u,a.pos.x-u.pos.x,a.pos.z-u.pos.z);return;}
   if(this.go(u,'lead',r,c=>c.x===best.x&&c.y===best.y&&c.z===best.z)!==null)return;}
  // 3. labor in a closed pen with a chest.
  if(u.stage==='adult'&&!r.open&&this.labor(u,a,r))return;
  // 4. roam.
  if(u.task==='roam'&&u.path.length&&this.advance(u))return;
  const [w0,w1]=RANCH_RULES.wanderTicks,h=hash3(sim.tick,this.serial(u),u.cell.x*31+u.cell.z,sim.terrain.seed+5113);
  // Roaming starts (and resumes after each goal) with an idle pause, so a unit let go of stays a moment where it is.
  if(u.task!=='roam'){u.task='roam';u.path=[];u.wait=w0+h%(w1-w0+1);}
  if(u.wait>0){u.wait--;return;}
  const home=u.home||u.cell,L=RANCH_RULES.leash,spots=r.open?r.list.filter(c=>Math.abs(c.x-home.x)<=L&&Math.abs(c.z-home.z)<=L&&Math.abs(c.y-home.y)<=2):r.list;
  u.wait=w0+(h>>>4)%(w1-w0+1);if(!spots.length)return;const goal=spots[(h>>>8)%spots.length];
  this.go(u,'roam',r,c=>c.x===goal.x&&c.y===goal.y&&c.z===goal.z);
 }
 eat(u,a){const sim=this.sim,R=RANCH_RULES;if(++u.progress<R.eatTicks)return;const d=sim.drops[u.food];u.phase='idle';u.progress=0;u.food=null;u.task=null;
  if(!d||d.item!==SPECIES[u.kind].food||Math.hypot(d.pos.x-u.pos.x,d.pos.z-u.pos.z)>1.2)return;
  if(--d.count<=0){sim.physics.removeBody(d);delete sim.drops[d.id];}
  u.fed++;sim.emit('unit-eat',a,{companionId:u.id,pos:{...u.pos},species:u.kind,fed:u.fed});
  if(u.fed>=R.feedToAdult){u.stage='adult';u.fed=0;sim.progress.grown=true;sim.emit('unit-grow',a,{companionId:u.id,pos:{...u.pos},species:u.kind,name:SPECIES[u.kind].name});}}
 chestsWithRoom(r,item){const sim=this.sim;return this.sim.ranch.sides(r).filter(b=>b.id===BID.storageChest&&sim.chests[b.key]&&Inventory.addTo(structuredClone(sim.chests[b.key].slots),item,1)===0);}
 // Labor: carry the cargo to a chest with room, else walk beside the nearest safe aptitude block and harvest it.
 labor(u,a,r){const sim=this.sim,P=sim.ranch,sides=P.sides(r);if(!sides.some(b=>b.id===BID.storageChest))return false;
  const beside=list=>c=>list.some(b=>b.y===c.y&&Math.abs(b.x-c.x)+Math.abs(b.z-c.z)===1);
  if(u.cargo){const chests=this.chestsWithRoom(r,u.cargo.id);if(!chests.length){u.task='full';u.path=[];return true;}
   const walk=this.go(u,'deposit',r,beside(chests));if(walk===null){u.task='full';return true;}if(!walk.arrived)return true;
   const chest=chests.find(b=>beside([b])(u.cell)),slots=sim.chests[chest.key].slots,left=Inventory.addTo(slots,u.cargo.id,u.cargo.count);
   if(left<u.cargo.count){sim.markItem(u.cargo.id);sim.progress.labor=true;sim.emit('labor-deliver',a,{companionId:u.id,item:u.cargo.id,count:u.cargo.count-left,chest:chest.key,pos:{x:chest.x+.5,y:chest.y+1,z:chest.z+.5}});}
   u.cargo=left?{...u.cargo,count:left}:null;this.face(u,chest.x-u.cell.x,chest.z-u.cell.z);u.task=null;return true;}
  const g=SPECIES[u.kind].capabilities.gather;if(!g)return false;const claimed=new Set(this.all().filter(v=>v!==u&&v.target).map(v=>v.target.key));
  const targets=sides.filter(b=>{const def=BLOCKS[b.id];return g.blocks.includes(def.id)&&Number.isFinite(def.hardness)&&def.tier<=g.tier&&!claimed.has(b.key)&&P.safe(r,b);});
  if(!targets.length){u.target=null;return false;}
  const walk=this.go(u,'gather',r,beside(targets));if(walk===null){u.target=null;return false;}
  const t=targets.find(b=>beside([b])(walk.end));u.target={x:t.x,y:t.y,z:t.z,id:t.id,key:t.key};if(!walk.arrived)return true;
  u.target={x:t.x,y:t.y,z:t.z,id:t.id,key:t.key};u.phase='gather';u.progress=0;u.velocity={x:0,y:0,z:0};this.face(u,t.x-u.cell.x,t.z-u.cell.z);return true;}
 gather(u,a){const sim=this.sim,t=u.target;if(!t||sim.terrain.get(t.x,t.y,t.z)!==t.id){u.phase='idle';u.target=null;u.progress=0;return;}
  u.progress+=CFG.stepMs*SPECIES[u.kind].capabilities.gather.speed;if(u.progress<BLOCKS[t.id].hardness||Object.keys(sim.drops).length>=CFG.maxDrops)return;
  const before=new Set(Object.keys(sim.drops));
  if(sim.harvest(a,{...t,normal:{x:0,y:1,z:0}},u.id)){const drop=Object.values(sim.drops).find(d=>!before.has(d.id));if(drop){u.cargo={id:drop.item,count:drop.count};sim.physics.removeBody(drop);delete sim.drops[drop.id];}
   if(Object.keys(sim.regrow).length<512)sim.regrow[t.key]={key:t.key,x:t.x,y:t.y,z:t.z,id:t.id,tick:sim.tick+RANCH_RULES.regrowTicks};}
  u.phase='idle';u.target=null;u.progress=0;u.task=null;}
 // D-104: merge the splashed owned adults that share species and grade, in pairs by unit serial. The lower serial of each
 // pair keeps its id, place and slot and gains a grade (max 4); the other leaves. An odd one out is left as it is.
 merge(owner,units){const groups=new Map(),merged=[];
  for(const u of units){if(u.owner!==owner.id||u.stage!=='adult'||u.grade>=4||u.phase==='flight'||u.phase==='return')continue;const k=u.kind+':'+u.grade;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(u);}
  for(const k of [...groups.keys()].sort(cmp)){const list=groups.get(k).sort((x,y)=>this.serial(x)-this.serial(y)||cmp(x.id,y.id));
   for(let i=0;i+1<list.length;i+=2){const keep=list[i],gone=list[i+1],c=owner.combat;
    if(c.action?.companionId===gone.id){Combat.resetCombo(c);c.state='idle';c.elapsed=0;c.action=null;}
    if(gone.location==='combat'&&owner.companionSlot===gone.slot)owner.companionSlot=-1;
    if(gone.cargo)this.sim.spawnDrop(gone.cargo.id,gone.cargo.count,gone.pos);
    delete this.data.units[gone.id];keep.grade++;merged.push({companionId:keep.id,consumed:gone.id,species:keep.kind,grade:keep.grade,pos:{...keep.pos},from:{...gone.pos}});}}
  return merged;}
 tick(){const dt=CFG.stepMs,sim=this.sim,trail=new Map();
  for(const u of this.all()){const a=sim.actors[u.owner];if(!a||u.location!=='combat'||u.phase!=='idle'||a.companionSlot===u.slot)continue;const list=trail.get(a.id)||[];list.push(u.id);trail.set(a.id,list);}
  for(const u of this.all()){const a=sim.actors[u.owner];u.cooldown=Math.max(0,u.cooldown-dt);u.previous={...u.pos};if(!a||a.dead||a.suspended)continue;
   if(u.phase==='flight'){const p=Object.values(sim.projectiles).find(p=>p.companionId===u.id);if(p)u.pos={...p.pos};else u.phase='return';continue;}
   if(u.phase==='return'){const to=this.socket(a,u.slot),delta=V.sub(to,u.pos),dist=V.len(delta);u.pos=dist<.4?to:V.add(u.pos,V.scale(V.norm(delta),Math.min(dist,10*dt/1000)));if(dist<.4){u.phase='idle';this.completePending(a,u);}continue;}
   if(u.pending&&u.phase==='idle'){this.completePending(a,u);if(u.pending)continue;}
   if(u.location==='combat'){this.follow(a,u,a.companionSlot===u.slot?-1:(trail.get(a.id)||[]).indexOf(u.id));continue;}
   this.ranch(u,a);
  }
 }
 snapshot(){return structuredClone(this.data);}
 static validate(data,actors,shots){const fail=()=>{throw Error('동료 저장 상태 손상');};if(data===undefined){if(shots.some(p=>p.companionId))fail();return;}if(!data||!data.units||'bases' in data||!Number.isSafeInteger(data.sequence)||data.sequence<0||Object.keys(data.units).length>128)fail();const slots=new Set(),pendingSlots=new Set();
  const cell=c=>!!c&&['x','y','z'].every(k=>Number.isInteger(c[k]));
  for(const [id,u]of Object.entries(data.units)){
    // Hatched units are unit:N; companion:/creature:/enemy:/boss: ids are kept from saves of the retired recruitment.
    const serial=/^(?:companion|unit):([1-9]\d*)$/.exec(id),creatureId=/^creature:[1-9]\d*$/.test(id),legacyCandidateId=/^enemy:[1-9]\d*$/.test(id),bossSpeciesId=/^boss:([1-9]\d*)$/.exec(id);
    if((!serial&&!creatureId&&!legacyCandidateId&&!bossSpeciesId)||serial&&Number(serial[1])>data.sequence||actors.some(a=>a.id===id)||!u||u.id!==id||!SPECIES[u.kind]||!UNIT_STAGES_OWNED.includes(u.stage)||!Number.isInteger(u.grade)||u.grade<1||u.grade>4||!Number.isInteger(u.fed)||u.fed<0||u.fed>=RANCH_RULES.feedToAdult||u.stage!=='adult'&&u.location!=='ranch'||!Number.isFinite(u.yaw)||!['ranch','combat'].includes(u.location)||!['idle','eat','gather','flight','return'].includes(u.phase)||![u.cooldown,u.progress].every(Number.isFinite)||u.cooldown<0||!u.pos||!['x','y','z'].every(k=>Number.isFinite(u.pos[k]))||u.cargo&&(!Inventory.validateStack(u.cargo)||!SPECIES[u.kind].capabilities.carry||u.cargo.count>SPECIES[u.kind].capabilities.carry.capacity)||u.body!==null||u.collider!==null)fail();
   if(u.cell!==null&&!cell(u.cell)||u.next!==null&&(!cell(u.next)||!u.cell||Math.abs(u.next.x-u.cell.x)+Math.abs(u.next.z-u.cell.z)!==1)||u.home!==null&&!cell(u.home)||!Number.isInteger(u.stepTick)||u.stepTick<0||!Number.isInteger(u.wait)||u.wait<0||!Array.isArray(u.path)||u.path.length>RANCH_RULES.pathMax||!u.path.every(cell)||u.task!==null&&!['eat','lead','gather','deposit','full','roam'].includes(u.task)||u.food!==null&&typeof u.food!=='string')fail();
   if(u.location==='combat'&&(u.cell!==null||u.path.length||u.cargo))fail();
   if(u.phase==='eat'&&(u.food===null||u.stage==='adult'))fail();
   if(u.location==='combat'){const key=u.owner+':'+u.slot;if(!Number.isInteger(u.slot)||u.slot<0||u.slot>=COMPANION_SLOTS||slots.has(key))fail();slots.add(key);}else if(u.slot!==null)fail();
   if(u.pending&&(!['ranch','combat'].includes(u.pending.location)||u.pending.location==='combat'&&(!Number.isInteger(u.pending.slot)||u.pending.slot<0||u.pending.slot>=COMPANION_SLOTS||pendingSlots.has(u.owner+':'+u.pending.slot))))fail();if(u.pending?.location==='combat')pendingSlots.add(u.owner+':'+u.pending.slot);
    if(u.target&&(!SPECIES[u.kind].capabilities.gather||!['x','y','z','id'].every(k=>Number.isInteger(u.target[k]))||u.target.key!==blockKey(u.target.x,u.target.y,u.target.z)||!SPECIES[u.kind].capabilities.gather.blocks.includes(BLOCKS[u.target.id]?.id)))fail();
   if(u.phase==='flight'&&(u.location!=='combat'||shots.filter(p=>p.companionId===id&&p.source===u.owner).length!==1))fail();
   if((u.phase==='eat'||u.phase==='gather')&&u.location!=='ranch'||u.phase==='gather'&&!u.target)fail();
  }
  for(const p of shots)if(p.companionId&&(!data.units[p.companionId]||data.units[p.companionId].owner!==p.source||data.units[p.companionId].phase!=='flight'||p.spent!==undefined&&typeof p.spent!=='boolean'||p.throwPhase!==undefined&&!['flight','fall','ground'].includes(p.throwPhase)||p.groundMs!==undefined&&(!Number.isFinite(p.groundMs)||p.groundMs<0)||p.supportTicks!==undefined&&(!Number.isInteger(p.supportTicks)||p.supportTicks<0)))fail();
  for(const a of actors){if(a.speciesId!==undefined&&a.speciesId!==null&&(!SPECIES[a.speciesId]||!['neutral','retaliating'].includes(a.wildState)||!a.homePos||!['x','y','z'].every(k=>Number.isFinite(a.homePos[k]))||a.targetId!==null&&typeof a.targetId!=='string'||a.enemy!==(a.wildState==='retaliating')))fail();if(a.companionSlot!==undefined&&(!Number.isInteger(a.companionSlot)||a.companionSlot< -1||a.companionSlot>=COMPANION_SLOTS))fail();const id=a.combat?.action?.companionId;if(id&&(!data.units[id]||data.units[id].owner!==a.id||data.units[id].location!=='combat'))fail();}
 }
}
