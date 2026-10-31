'use strict';
/* Authoritative attack trajectory: both renderer and Rapier consume the same pose. */
// Action descriptors are immutable launch-time facts shared by hit casts, art and VFX.
const BASIC_CHAIN=Object.freeze([
 Object.freeze({motion:'sweep',label:'횡베기',wind:1,active:1,recovery:1}),
 Object.freeze({motion:'reverse',label:'반대 횡베기',wind:.90,active:1,recovery:1}),
 Object.freeze({motion:'overhead',label:'내려치기',wind:1.12,active:1.20,recovery:1.15})
]);
const OVERHEAD_ARC=Object.freeze({from:1.02,to:-.72});
function attackMotion(action){
 if(isMeleeAction(action))return 'clamp';
 if(action.motion)return action.motion;
 if(action.kind==='overhead'||action.kind==='slam')return 'overhead';
 if(action.kind==='lunge'||action.weapon==='spear')return 'thrust';
 return action.combo%2?'reverse':'sweep';
}
function attackPose(actor,action,phase){
 phase=clamp(phase,0,1);const f=V.norm(action.dir),flat=V.norm({x:f.x,y:0,z:f.z}),side={x:flat.z,y:0,z:-flat.x},motion=attackMotion(action),overhead=motion==='overhead';
 const up=V.norm({x:-f.y*side.z,y:f.z*side.x-f.x*side.z,z:f.y*side.x}),thrust=!overhead&&(motion==='thrust'||motion==='thrustReverse'),sign=motion==='reverse'||motion==='thrustReverse'?-1:1;
 const angle=overhead?lerp(OVERHEAD_ARC.from,OVERHEAD_ARC.to,phase):thrust?sign*.08:(phase-.5)*action.arc*sign;
 const ca=cosQ(angle),sa=sinQ(angle),axis=overhead?up:side;
 const dir=V.norm({x:f.x*ca+axis.x*sa,y:f.y*ca+axis.y*sa,z:f.z*ca+axis.z*sa});
 const origin=V.add(actor.pos,{x:0,y:actor.offset*1.25,z:0}),distance=thrust?lerp(.35,action.reach,phase):action.reach;
 return {origin,dir,tip:V.add(origin,V.scale(dir,distance)),reach:distance,thrust,overhead,motion,sign,phase};
}
/* One hurt-volume path: fixed snapshots, pairwise Rapier casts, world-space contact payloads. */
const IDENTITY_ROTATION=Object.freeze({x:0,y:0,z:0,w:1}),ZERO_VECTOR=Object.freeze({x:0,y:0,z:0});
function rotateByQuaternion(v,q){const tx=2*(q.y*v.z-q.z*v.y),ty=2*(q.z*v.x-q.x*v.z),tz=2*(q.x*v.y-q.y*v.x);return{x:v.x+q.w*tx+q.y*tz-q.z*ty,y:v.y+q.w*ty+q.z*tx-q.x*tz,z:v.z+q.w*tz+q.x*ty-q.y*tx};}
function weaponHitRadius(action,scale=1){const widths={fist:.30,spear:.18,axe:.29};return (widths[action.weapon]||CFG.combat.hit.radius)*Math.min(scale,2);}
function attackSamples(actor,action,from,to){
 if(isMeleeAction(action)){const out=[],count=Math.max(1,Math.ceil(Math.abs(to-from)*12));for(let n=1;n<=count;n++){
  const previous=meleeWorldPose(actor,action,action.wind+lerp(from,to,(n-1)/count)*action.active),pose=meleeWorldPose(actor,action,action.wind+lerp(from,to,n/count)*action.active);
  for(let i=0;i<pose.tips.length;i++)out.push({phase:lerp(from,to,n/count),pose:{origin:pose.origin},from:previous.tips[i],to:pose.tips[i],radius:.16});}return out;}
 const radius=weaponHitRadius(action,actor.scale||1),span=Math.abs(to-from),angle=(attackMotion(action)==='overhead'?OVERHEAD_ARC.from-OVERHEAD_ARC.to:Math.abs(action.arc||0))*span,
  step=Math.min(CFG.combat.hit.angularStep,radius/Math.max(.1,action.reach)*.85),count=clamp(Math.ceil(angle/step),1,CFG.combat.hit.maxSamples),out=[];
 for(let i=0;i<=count;i++){const phase=lerp(from,to,i/count),pose=attackPose(actor,action,phase);out.push({phase,pose,from:V.add(pose.origin,V.scale(pose.dir,Math.min(.25,pose.reach))),to:pose.tip,radius});}
 return out;
}
function contactCast(collider,ball,from,to){
 const delta=V.sub(to,from),hit=collider.castShape(ZERO_VECTOR,ball,from,IDENTITY_ROTATION,delta,0,1,true);
 if(!hit||!Number.isFinite(hit.time_of_impact)||hit.time_of_impact<0||hit.time_of_impact>1)return null;
 const t=hit.time_of_impact,center=V.add(from,V.scale(delta,t)),detail=collider.contactShape(ball,center,IDENTITY_ROTATION,CFG.combat.hit.skin);
 const rotation=collider.rotation(),point=detail?.point1||V.add(collider.translation(),rotateByQuaternion(hit.witness1,rotation)),normal=detail?.normal1||rotateByQuaternion(hit.normal1,rotation);
 if(!point||!Object.values(point).every(Number.isFinite))return null;
 return {point:{...point},normal:V.norm(normal),fraction:t};
}
function knockbackResponse(target,power,heavy=false){
 const k=CFG.combat.knockback,creature=target.boss?'boss':target.speciesId||target.kind,resistance=creature?(k.creatures[creature]??1):k.playerResistance,
  horizontal=clamp(power*resistance,0,k.maxSpeed),lift=clamp(.55+horizontal*.115+(heavy?.25:0),.5,2.3),
  duration=Math.round((k.duration+(heavy?100:0))*clamp(resistance,.5,1.1));
 return {horizontal,lift,duration};
}

// D-114: a player's body faces where it moves or strikes (heading); its aim (facing) follows the cursor. A melee strike
// goes toward the cursor but keeps within about 27 degrees of level, so clicking the ground near a target still swings at it.
function bodyHeading(a){const h=a.heading;return h?{x:h.x,y:0,z:h.z}:V.norm({x:a.facing.x,y:0,z:a.facing.z});}
function aimDirection(a){const f=a.facing,h=Math.hypot(f.x,f.z);if(h<.2)return bodyHeading(a);return V.norm({x:f.x/h,y:clamp(f.y/h,-.5,.5),z:f.z/h});}
/* One action executor and one hit resolver for players, retaliating wildlife, hostile mobs, and bosses. */
class Combat {
 static state(){return {state:'idle',elapsed:0,action:null,left:false,combo:0,comboUntil:0,comboWeapon:null,queued:false,airRollUsed:false,invul:0};}
 static canAct(c){return c.state==='idle'||(c.state==='attack'&&c.elapsed>=c.action.wind+c.action.active+c.action.recovery*.68);}
 static weapon(a,sim=null){const companion=sim?.companions.equipped(a);if(companion){const def=SPECIES[companion.kind];return{...def.capabilities.attack,name:def.name,wind:300,active:def.capabilities.attack.mode==='ball'?80:280,recovery:350,arc:1.9};}const st=Inventory.stats(a);return st.weapon||{name:'맨손',damage:10,reach:3.0,arc:1.25,weight:0,wind:200,active:100,recovery:350};}
 static resetCombo(c){c.combo=0;c.comboUntil=0;c.comboWeapon=null;c.queued=false;}
 static equipmentKey(a,sim=null){return sim?.companions.equipped(a)?.id||Inventory.stats(a).item?.id||'fist';}
 // The only player action is the basic chain: three melee stages for fists, sword, spear and axe.
 static makeAction(a,sim=null){if(sim&&!a.enemy&&a.companionSlot>=0)return sim.companions.action(a);const st=Inventory.stats(a),w=this.weapon(a),c=a.combat,damageBonus=st.material?.damageBonus??0,weapon=st.item?.weapon||'fist',weaponKey=st.item?.id||'fist';
  const count=BASIC_CHAIN.length;
  const continuing=c.comboWeapon===weaponKey&&(c.comboUntil>0||c.state==='attack'&&c.action?.name==='light');
  const combo=continuing?c.combo%count:0,stage=BASIC_CHAIN[combo];
  let actionKind='swing',motion=stage.motion;
  if(combo<2&&(weapon==='fist'||weapon==='spear'))motion=combo?'thrustReverse':'thrust';
  if(combo===2)actionKind='overhead';
  const label=weapon==='fist'?(combo===0?'정권':combo===1?'반대 정권':'내려치기'):weapon==='spear'&&combo<2?(combo===0?'찌르기':'반대 찌르기'):stage.label;
  return {name:'light',weapon,weaponKey,kind:actionKind,motion,comboLabel:label,comboCount:count,combo,
   wind:Math.round(w.wind*stage.wind),active:Math.round(w.active*stage.active),recovery:Math.round(w.recovery*stage.recovery),reach:w.reach,
   arc:w.arc,damage:statStep(Math.max(STAT_SCALE.damage,w.damage+damageBonus+(a.rpg?.skills.might||0)*5)*(1+combo*.1),STAT_SCALE.damage),heavy:false,
   impulse:(CFG.combat.knockback.weapons[weapon]||5)*(1+combo*.08),enemy:a.enemy,dir:aimDirection(a),hits:[],touched:[],fired:false,sequence:0};
 }
 static start(a,action,sim){const c=a.combat;if(!action||!this.canAct(c)||action.companionId&&sim.companions.ready(a)?.id!==action.companionId)return false;if(action.companionId&&!sim.companions.start(a,action))return false;
  action.sequence=++sim.actionSequence;action.enemy=a.enemy;c.state='attack';c.elapsed=0;c.action=action;c.queued=false;
  if(action.name==='light'){c.combo=action.combo+1;c.comboUntil=0;c.comboWeapon=action.weaponKey;}else this.resetCombo(c);
  sim.emit('windup',a,{kind:action.kind,weapon:action.weapon,combo:action.combo,comboCount:action.comboCount,label:action.comboLabel});return true;
 }
 static finish(a,sim){const c=a.combat,act=c.action,queue=c.queued;
  if(!a.enemy&&act.hits.length===0&&!act.fired&&!act.wallFeedback&&!act.touched?.length)sim.emit('whiff',a);
  c.state='idle';c.action=null;c.queued=false;
  // The continuation window starts AFTER recovery, never at the initial button press.
  if(act.name==='light'&&c.comboWeapon===act.weaponKey&&c.combo<act.comboCount)c.comboUntil=CFG.combat.combo.window;
  else this.resetCombo(c);
  if(queue&&!a.enemy&&!this.start(a,this.makeAction(a,sim),sim))this.resetCombo(c);
 }
 static roll(a,move,sim){const c=a.combat,stats=Inventory.stats(a),r=CFG.roll[stats.weightClass],body=sim.physics.world.getRigidBody(a.body);
  // Roll is the deliberate cancel transition out of idle or windup/active/recovery.
  // It never interrupts death or another roll. Failed attempts preserve the current attack.
  if(a.dead||a.suspended||!body||!['idle','attack'].includes(c.state))return false;
  if(sim.terrain.water.bodyState(a.pos,CFG.player.eyeHeight,CFG.player.radius*(a.scale||1)).inWater)return false;
  const velocity=body.linvel(),support=sim.physics.ground(a,a.pos,CFG.movement.groundGap,true);
  const grounded=!!support&&velocity.y<=1.1;
  const airborne=!grounded;
  // One midair evade per airborne interval; actual landing resets this authoritative flag.
  if(airborne&&c.airRollUsed)return false;
  const rd=rollDirection(a.facing,move),radius=CFG.player.radius*(a.scale||1),head=a.pos.y+a.offset*2;
  const liftClear=grounded&&!sim.terrain.boxSolid({x:a.pos.x-radius+.015,y:head+.012,z:a.pos.z-radius+.015},{x:a.pos.x+radius-.015,y:head+r.hop*r.hop/(2*CFG.player.gravity)+.04,z:a.pos.z+radius-.015});
  // Replacing c.action invalidates unfinished hit sweeps, held projectiles, and queued combos.
  // Hits and projectiles already committed on earlier ticks remain authoritative.
  this.resetCombo(c);c.state='roll';c.elapsed=0;c.queued=false;c.airRollUsed=true;
  c.action={duration:r.duration,speed:r.distance/(r.duration/1000),dir:rd.dir,facing:rd.facing,directionIndex:rd.index,hop:liftClear?r.hop:0,airborne,sequence:++sim.actionSequence};
  const speed=rollSpeed(c.action,0),mass=body.mass();
  body.applyImpulse({x:(rd.dir.x*speed-velocity.x)*mass,y:liftClear?Math.max(0,r.hop-velocity.y)*mass:0,z:(rd.dir.z*speed-velocity.z)*mass},true);
  if(liftClear||airborne)a.grounded=false;sim.emit('roll',a,{direction:rd.dir,variant:rd.index,hop:c.action.hop,airborne});return true;
 }
 static updatePlayer(a,input,sim){const c=a.combat;let move={x:input.x,y:0,z:input.z},speed=CFG.player.walk;a.sprinting=false;
  a.facing=direction(input.yaw,input.pitch);a.yaw=input.yaw;a.pitch=input.pitch;
   if(c.comboWeapon&&c.comboWeapon!==this.equipmentKey(a,sim))this.resetCombo(c);
  if(!input.enabled){this.resetCombo(c);c.left=false;if(c.state==='roll')return{move:c.action.dir,speed:rollSpeed(c.action,c.elapsed),jump:false,autoJump:false};return{move:{x:0,y:0,z:0},speed:0,jump:false};}
  const ld=input.left&&!c.left;
  // Shift is an intent, not a locally guessed terrain action. All peers resolve it
  // against authoritative water state on this simulation tick.
  const submerged=sim.terrain.water.bodyState(a.pos,CFG.player.eyeHeight,CFG.player.radius*(a.scale||1)).inWater;
  if(input.roll&&!submerged)this.roll(a,move,sim);
  if(c.state==='attack'&&ld&&!c.action?.companionId)c.queued=true; // One buffered successor; repeated taps never create a hidden multi-hit queue.
  // A press starts the next basic attack immediately; there is no hold-to-charge stage.
  if(ld&&c.state!=='attack'&&this.canAct(c)&&(a.companionSlot<0||sim.companions.ready(a))&&!this.start(a,this.makeAction(a,sim),sim))this.resetCombo(c);
  c.left=input.left;
  if(c.state==='attack')speed*=.32;
  if(c.state==='roll'){move=c.action.dir;speed=rollSpeed(c.action,c.elapsed);}
  if(c.state==='dead'){speed=0;move={x:0,y:0,z:0};}
  const sprinting=input.sprint&&c.state==='idle'&&a.knock<=0&&Math.hypot(move.x,move.z)>.05;
  if(sprinting){speed=CFG.player.run;a.sprinting=true;}
  const turn=c.state==='attack'&&c.action&&!c.action.companionId?c.action.dir:Math.hypot(move.x,move.z)>.1?move:null,th=turn?Math.hypot(turn.x,turn.z):0;if(th>.05)a.heading={x:turn.x/th,z:turn.z/th};
  return{move,speed,jump:input.jump&&c.state==='idle',autoJump:c.state==='idle',swimRise:input.swimRise,swimDive:input.swimDive&&submerged};
 }
 static tick(a,sim){const c=a.combat,dt=CFG.stepMs;if(a.dead)return;c.elapsed+=dt;if(c.state!=='attack'){c.comboUntil=Math.max(0,c.comboUntil-dt);if(c.comboUntil===0&&c.combo>0)this.resetCombo(c);}c.invul=Math.max(0,c.invul-dt);a.knock=Math.max(0,(a.knock||0)-dt);
  if(c.state==='roll'&&c.elapsed>=c.action.duration){c.state='idle';c.action=null;}
  if(c.state!=='attack')return;const act=c.action,prev=c.elapsed-dt,end=act.wind+act.active;
  if(c.elapsed>act.wind&&prev<end){
   if(!act.swung){act.swung=true;sim.emit('swing',a,{weapon:act.weapon,kind:act.kind,sequence:act.sequence,combo:act.combo,comboCount:act.comboCount,label:act.comboLabel});}
   if(['companionBall','spit'].includes(act.kind)){
    if(!act.fired){act.fired=true;sim.fire(a,act);}
   }else if(act.kind==='burst'){
    if(!act.fired){act.fired=true;for(const t of Object.values(sim.actors).sort((a,b)=>cmp(a.id,b.id))){if(t.id===a.id||t.dead||t.suspended)continue;const d=V.sub(t.pos,a.pos);if(V.len(d)<act.reach&&sim.physics.sight(V.add(a.pos,{x:0,y:1,z:0}),V.add(t.pos,{x:0,y:1,z:0}),a))this.hit(a.id,t,act,sim);}sim.emit('burst',a,{radius:act.reach});}
   }else{
    const from=clamp((prev-act.wind)/act.active,0,1),to=clamp((c.elapsed-act.wind)/act.active,0,1);
    for(const contact of sim.physics.sweepAttack(a,act,from,to)){
     const id=contact.id;act.touched??=[];if(act.touched.includes(id))continue;act.touched.push(id);const target=sim.actors[id];if(target&&this.hit(a.id,target,act,sim,contact))act.hits.push(id);
    }
    if(act.wallContact&&!act.wallFeedback&&act.hits.length===0){act.wallFeedback=true;sim.emit('wall',a,{point:act.wallContact.point,normal:act.wallContact.normal,weapon:act.weapon});}
   }
  }
  const chainAt=end+Math.max(CFG.combat.combo.minRecovery,act.recovery*CFG.combat.combo.chainRecovery);
  const link=!a.enemy&&act.name==='light'&&act.combo<act.comboCount-1&&c.queued&&c.elapsed>=chainAt&&c.comboWeapon===act.weaponKey;
  // Do not bypass canAct for rolls: this dedicated transition only links a buffered basic attack.
  if(link||c.elapsed>=end+act.recovery)this.finish(a,sim);
 }
 static hit(sourceId,target,payload,sim,contact=null){
  if(target.dead||target.suspended||sourceId===target.id)return false;
  const source=sim.actors[sourceId];
  const c=target.combat,point=contact?.point||V.add(target.pos,{x:0,y:target.offset||.9,z:0});
  if(c.invul>0||c.state==='roll'&&c.elapsed>=CFG.iframes.start&&c.elapsed<CFG.iframes.end){sim.emit('evade',target,{point,sourceId});return false;}
  const stats=target.boss||target.speciesId||target.enemy?{defense:target.boss?25:0}:Inventory.stats(target),projectile=payload.type==='shot';
  let damage=Math.max(1,Math.round(payload.damage*CFG.armorK/(CFG.armorK+stats.defense)));
  // 0.35.1 equipment progression (Gear): a player's own strike uses its realm attack factor (무기 below tier ×0.4, diamond
  // ×1.6); a player hit takes its realm armor factor (below tier ×2, diamond ×0.6). Unit strikes are not scaled.
  const isPlayer=a=>a&&!a.enemy&&!a.speciesId&&!a.boss;
  if(isPlayer(source)&&!payload.companionId)damage=Gear.scale(damage,Gear.status(source,sim.terrain).attack);
  if(isPlayer(target))damage=Gear.scale(damage,Gear.status(target,sim.terrain).taken);
  target.hp=Math.max(0,target.hp-damage);
  const heavy=!!payload.heavy,lethal=target.hp<=0;
  if(target.speciesId&&source){target.wildState='retaliating';target.enemy=true;target.targetId=source.id;}
  if(!target.enemy)c.invul=200;
  let push=projectile?V.norm({x:(payload.flightVelocity||payload.velocity||payload.dir).x,y:0,z:(payload.flightVelocity||payload.velocity||payload.dir).z}):source?V.norm({x:target.pos.x-source.pos.x,y:0,z:target.pos.z-source.pos.z}):V.norm({x:payload.dir.x,y:0,z:payload.dir.z});
  if(V.len(push)<.001)push=V.norm({x:payload.dir.x,y:0,z:payload.dir.z});
  const response=knockbackResponse(target,payload.impulse||4,heavy);sim.physics.impulse(target,push,response.horizontal,response);
  const event={damage,point:{...point},normal:contact?.normal||V.scale(push,-1),direction:push,sourceId,weapon:payload.weapon||(projectile?'shot':'fist'),sequence:payload.sequence||0,heavy,lethal,power:response.horizontal};
  sim.emit('hit',target,event);
  if(source)sim.emit('attack-hit',source,{...event,targetId:target.id});
  if(lethal)sim.kill(target,sourceId);return true;
 }

}
