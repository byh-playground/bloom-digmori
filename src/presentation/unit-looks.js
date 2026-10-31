'use strict';
/* Simulation display state → cut-out rig looks (UnitRig.draw) for every companion-species body in the world:
 * wild individuals and structure bosses (actors), owned units (companions: on the ranch, following, striking, thrown)
 * and placed eggs. Presentation only: reads interpolated display models and never writes the simulation.
 * Signature anims carry the species' attack: 뿌리 slam, 바위 병아리 headbutt (and hide while rolled up as a thrown
 * ball or hurt and cornered), 버섯 달팽이 spore. */
// Rig progress at which each one-shot anim lands its strike (see UnitRig.pose keyframes).
const UNIT_IMPACT=Object.freeze({attack:.4,slam:.53,headbutt:.45,spore:.4});
const unitFacing=yaw=>({x:-Math.sin(yaw),y:0,z:-Math.cos(yaw)});
// Wind-up plays up to the impact frame, the active window crosses it, recovery settles the rest of the anim.
function unitStrikeProgress(anim,action,elapsed){const k=UNIT_IMPACT[anim]??.4,t=actionTiming(action,elapsed);return t.stage==='wind'?t.phase*k:t.stage==='active'?k+t.phase*.1:k+.1+t.phase*(.9-k);}
// Which anim a wild/boss action plays: a boss's plain swing and spit use the generic attack, everything heavier the signature.
function unitActionAnim(species,action,boss){if(boss&&(action.kind==='swing'||action.kind==='spit'))return 'attack';return SPECIES[species].signature;}
// a: display actor (facing, combat, velocity, anim, hp…). Returns a UnitRig look plus the facing used for view/flip.
function speciesActorLook(a,reaction,night){
 const species=a.speciesId,c=a.combat,act=c.action,speed=Math.hypot(a.velocity.x,a.velocity.z),seconds=(a.anim||0)/1000;
 const look={species,anim:'idle',progress:0,seconds,grade:a.boss?4:1,stage:a.boss?'boss':'adult'};let facing=a.facing;
 if(c.state==='attack'&&act){const anim=unitActionAnim(species,act,a.boss);look.anim=anim;look.progress=unitStrikeProgress(anim,act,c.elapsed);facing=act.dir;}
 else if(reaction&&reaction.age<360){look.anim='hurt';look.progress=reaction.age/360;}
 else if(speed>.16&&a.knock<=0)look.anim='walk';
 else if(species==='rock-chick'&&a.wildState==='retaliating'&&a.hp<a.maxHp*.3){look.anim='hide';look.progress=.5;}
 else if(night&&a.wildState==='neutral'&&!a.boss)look.anim='sleep';
 return{look,facing};
}
class UnitPresenter{
 constructor(renderer){this.r=renderer;this.flips=new Map();this.samples=[];}
 view(key,facing){const v=unitRigView(facing,this.r.camera.yaw,this.flips.get(key));this.flips.set(key,v.sideFlip);return v;}
 queue(key,role,pos,look,facing,{phase='world',tint=[1,1,1,1],alpha=1,whiteFlash=false}={}){const flat=Math.hypot(facing.x,facing.z)>1e-4?V.norm({x:facing.x,y:0,z:facing.z}):{x:0,y:0,z:1},v=this.view(key,flat);this.r.unitRig.queue({phase,key,role,pos,look:{...look,view:v.view,flip:v.flip},tint,alpha,whiteFlash});}
 // Wild individuals and structure bosses.
 actor(a,sim,reaction,tint,whiteFlash){const {look,facing}=speciesActorLook(a,reaction,sim.night());this.queue(a.id,a.boss?'boss':'wild',a.pos,look,facing,{tint,whiteFlash});}
 // A fading ghost of a fallen wild unit or boss: its hurt pose sinking out.
 ghost(g,t){this.queue('ghost/'+g.id,'ghost',{...g.pos,y:g.pos.y-.15*t},{species:g.species,anim:'hurt',progress:.35,seconds:0,grade:g.boss?4:1,stage:g.boss?'boss':'adult'},g.facing||{x:0,y:0,z:1},{phase:'late',alpha:Math.pow(1-t,1.5)});}
 prepare(view,sim,actor,dyn){const r=this.r;
  // Placed eggs (D-103): the species egg part, rocking harder through the last 30% before it hatches.
  for(const e of Object.values(sim.eggs)){const pos={x:e.x+.5,y:e.y,z:e.z+.5};if(!r.worldVisualReady(pos,.3))continue;const span=Math.max(1,e.hatchTick-e.placedTick),left=e.hatchTick-sim.tick,wobble=clamp(1-left/(span*.3),0,1);
   this.queue('egg/'+e.key,'egg',pos,{species:e.species,egg:true,wobble,seconds:(r.displayTimeMs||0)/1000+(hashStr(e.key)%97)*.1},{x:0,y:0,z:1});}
  const shots=new Map(Object.values(view.projectiles).filter(p=>p.companionId).map(p=>[p.companionId,p]));
  for(const u of Object.values(view.companions)){const a=view.actors[u.owner];if(u.location!=='ranch'&&(!a||a.dead||a.suspended))continue;
   const base={species:u.kind,anim:'idle',progress:0,seconds:(r.displayTimeMs||0)/1000+(hashStr(u.id)%53)*.07,grade:u.grade||1,stage:u.stage||'adult'};
   const shadow=(p,size)=>{if(r.worldVisualReady(p,.3))r.box(dyn,{x:p.x,y:p.y+.012,z:p.z},{x:size,y:.01,z:size*.7},[.20,.30,.22]);};
   const scale=UNIT_STAGES[base.stage].scale;
   // Ranch (grid walk): walking, pecking at thrown food with a happy face, or working a block (chest labor).
   if(u.location==='ranch'){const p={x:u.pos.x,y:u.pos.y,z:u.pos.z};if(!r.worldVisualReady(p,.3))continue;
    const hard=BLOCKS[u.target?.id]?.hardness||650,gather=u.phase==='gather',eat=u.phase==='eat',moving=Math.hypot(u.velocity?.x||0,u.velocity?.z||0)>.3;
    const look=gather?{...base,anim:'attack',progress:(u.progress/hard*3)%1}:eat?{...base,anim:'attack',progress:(u.progress/RANCH_RULES.eatTicks*2)%1,face:'happy'}:{...base,anim:moving?'walk':'idle'};
    this.queue(u.id,'ranch',p,look,unitFacing(u.yaw||0));shadow(p,.36*scale);continue;}
   if(u.phase==='flight'){const shot=shots.get(u.id);if(!shot)continue;const radius=SPECIES[u.kind].capabilities.attack.projectile.radius,p={x:shot.pos.x,y:shot.pos.y-radius,z:shot.pos.z};if(!r.worldVisualReady(p,.3))continue;
    // Thrown rock chick: rolled up in its shell through the flight, peeking out again while it rests on the ground.
    const hold=SPECIES[u.kind].capabilities.attack.groundHoldMs,progress=shot.throwPhase==='ground'?.5+.5*clamp((shot.groundMs||0)/hold,0,1):.5;
    this.queue(u.id,'thrown',p,{...base,anim:'hide',progress},shot.dir);
    const hit=sim.terrain.ray(p,{x:0,y:-1,z:0},12);if(hit&&hit.normal.y>.7){const size=.27/(1+hit.distance*.2);r.box(dyn,{x:p.x,y:p.y-hit.distance+.012,z:p.z},{x:size*2,y:.01,z:size*1.3},[.20,.30,.22]);}continue;}
   if(u.phase==='return'){const p={x:u.pos.x,y:u.pos.y-.6,z:u.pos.z};if(r.worldVisualReady(p,.3))this.queue(u.id,'return',p,{...base,anim:'hide',progress:.5},V.sub(companionRoot(a),u.pos));continue;}
   const c=a.combat,act=c.action,striking=u.location==='combat'&&c.state==='attack'&&act?.companionId===u.id;
   if(striking){const visual=r.combatFx.pose(a),vc=visual.combat,anim=SPECIES[u.kind].signature;
    if(SPECIES[u.kind].capabilities.attack.mode==='melee'){const p=meleeWorldPose(visual,act,vc.elapsed).root;this.queue(u.id,'strike',{x:p.x,y:a.pos.y,z:p.z},{...base,anim,progress:unitStrikeProgress(anim,act,vc.elapsed)},act.dir);shadow({x:p.x,y:a.pos.y,z:p.z},.4*scale);continue;}
    if(!act.fired){const p=companionRoot(visual,act.dir);this.queue(u.id,'strike',{x:p.x,y:a.pos.y,z:p.z},{...base,anim:'headbutt',progress:clamp(vc.elapsed/Math.max(1,act.wind),0,1)*.25},act.dir);continue;}
   }
   const p={x:u.pos.x,y:u.pos.y,z:u.pos.z};if(!r.worldVisualReady(p,.3))continue;const speed=Math.hypot(u.velocity?.x||0,u.velocity?.z||0);
   this.queue(u.id,u.location==='combat'?'slot':'follow',p,{...base,anim:speed>.3?'walk':'idle'},unitFacing(u.yaw||0));shadow(p,.36*scale);
  }
 }
}
