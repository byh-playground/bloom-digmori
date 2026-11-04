'use strict';
/* Simulation display state → cut-out rig looks (UnitRig.draw) for every creature-species body in the world: wild individuals,
 * structure bosses and pets (all actors). Presentation only: reads interpolated display models and never writes the simulation.
 * Signature anims carry the species' attack: 뿌리 slam, 바위 병아리 headbutt (and hide while hurt and cornered), 버섯 달팽이 spore. */
// Rig progress at which each one-shot anim lands its strike (see UnitRig.pose keyframes).
const UNIT_IMPACT=Object.freeze({attack:.4,slam:.53,headbutt:.45,spore:.4});
// Wind-up plays up to the impact frame, the active window crosses it, recovery settles the rest of the anim.
function unitStrikeProgress(anim,action,elapsed){const k=UNIT_IMPACT[anim]??.4,t=actionTiming(action,elapsed);return t.stage==='wind'?t.phase*k:t.stage==='active'?k+t.phase*.1:k+.1+t.phase*(.9-k);}
// Which anim a wild/boss action plays: a boss's plain swing and spit use the generic attack, everything heavier the signature.
function unitActionAnim(species,action,boss){if(boss&&(action.kind==='swing'||action.kind==='spit'))return 'attack';return SPECIES[species].signature;}
// a: display actor (facing, combat, velocity, anim, hp…). Returns a UnitRig look plus the facing used for view/flip.
function speciesActorLook(a,reaction,night){
 const species=a.speciesId,c=a.combat,act=c.action,speed=Math.hypot(a.velocity.x,a.velocity.z),seconds=(a.anim||0)/1000;
 const look={species,anim:'idle',progress:0,seconds,grade:a.boss?4:1,stage:a.boss?'boss':a.petStage||'adult'};let facing=a.facing;
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
 actor(a,sim,reaction,tint,whiteFlash){const {look,facing}=speciesActorLook(a,reaction,sim.night());this.queue(a.id,a.boss?'boss':a.ownerId?'pet':'wild',a.pos,look,facing,{tint,whiteFlash});}
 // A fading ghost of a fallen wild unit or boss: its hurt pose sinking out.
 ghost(g,t){this.queue('ghost/'+g.id,'ghost',{...g.pos,y:g.pos.y-.15*t},{species:g.species,anim:'hurt',progress:.35,seconds:0,grade:g.boss?4:1,stage:g.boss?'boss':'adult'},g.facing||{x:0,y:0,z:1},{phase:'late',alpha:Math.pow(1-t,1.5)});}
}
