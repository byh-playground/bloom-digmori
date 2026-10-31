'use strict';
/* Detached display models only. Physics handles, terrain and input are never captured. */
class ScenePresentation {
 constructor(sdk){const R=sdk.RenderObject;
  class ActorView extends R {static renderSchema={
   id:R.STEP,displayKind:R.STEP,'pos.x':R.POSITION_X,'pos.y':R.POSITION_Y,'pos.z':R.POSITION_Z,
   yaw:R.ANGLE,pitch:R.LINEAR,anim:R.LINEAR,'velocity.x':R.LINEAR,'velocity.y':R.LINEAR,'velocity.z':R.LINEAR,
   enemy:R.STEP,kind:R.STEP,speciesId:R.STEP,wildState:R.STATE_KEY,targetId:R.STEP,dead:R.STEP,suspended:R.STEP,boss:R.STEP,scale:R.STEP,offset:R.STEP,hp:R.STEP,maxHp:R.STEP,sprinting:R.STEP,grounded:R.STEP,knock:R.COUNTDOWN_MS,
   'combat.displayKey':R.STATE_KEY,'combat.state':R.STEP,'combat.elapsed':R.LINEAR,'combat.action':R.STEP,
   'motion.distance':R.LINEAR,'motion.speed':R.LINEAR,'motion.land':R.COUNTDOWN_MS,'motion.brake':R.COUNTDOWN_MS,'motion.air':R.LINEAR,'motion.grounded':R.STEP,'motion.impact':R.LINEAR,
   'mine.target':R.STATE_KEY,'mine.elapsed':R.LINEAR,'swim.inWater':R.STEP,inventory:R.STEP,companionSlot:R.STEP
  };}
  class ItemView extends R {static renderSchema={id:R.STEP,displayKind:R.STEP,'pos.x':R.POSITION_X,'pos.y':R.POSITION_Y,'pos.z':R.POSITION_Z,item:R.STEP,age:R.LINEAR,enemy:R.STEP,dir:R.STEP,companionId:R.STEP,companionKind:R.STEP,spent:R.STEP,throwPhase:R.STATE_KEY,groundMs:R.LINEAR};}
  class CompanionView extends R {static renderSchema={id:R.STEP,displayKind:R.STEP,owner:R.STEP,kind:R.STEP,location:R.STEP,slot:R.STEP,phase:R.STATE_KEY,'pos.x':R.POSITION_X,'pos.y':R.POSITION_Y,'pos.z':R.POSITION_Z,cooldown:R.COUNTDOWN_MS,cargo:R.STEP,target:R.STEP,progress:R.LINEAR,yaw:R.ANGLE,'velocity.x':R.LINEAR,'velocity.z':R.LINEAR,stage:R.STEP,grade:R.STEP};}
  this.types={actor:ActorView,drop:ItemView,shot:ItemView,companion:CompanionView};this.runtime=new sdk.PresentationRuntime({stepMs:CFG.stepMs,delayMs:CFG.stepMs,snapDistance:8});this.revision=0;this.generation=0;this.entries=new Map();this.reset();
 }
 reset(mode='reset'){this.revision++;this.mode=mode;this.world=null;this.tick=-1;this.epoch=-1;this.entries.clear();}
 publish(sim){if(this.world===sim.terrain&&this.tick===sim.tick&&this.epoch===sim.epoch)return;
  if(this.world&&(this.world!==sim.terrain||this.epoch!==sim.epoch||sim.tick<this.tick))this.reset('reset');
  const started=performance.now(),entities=[],next=new Map();
  const add=(a,kind)=>{const id=kind+':'+a.id,old=this.entries.get(id),generation=old?.source===a?old.generation:this.generation++;
   // Simulation previous is reset on teleport. A break from the last completed pose is an explicit discontinuity.
   const teleport=!!(old&&a.previous&&V.len(V.sub(a.previous,old.pos))>.001);
   let source={...a,displayKind:kind};
   if(kind==='actor')source={...source,yaw:Math.atan2(-a.facing.x,-a.facing.z),pitch:Math.asin(clamp(-a.facing.y,-1,1)),combat:{...a.combat,displayKey:a.combat.state+':'+(a.combat.action?.sequence??'')},inventory:{slots:[Inventory.selected(a.inventory)],selected:0,armor:a.inventory.armor}};
   const entity={id,generation,type:this.types[kind],source,teleport};
   if(!old&&!this.mode&&a.previous){entity.initialSource={...source,pos:{...a.previous}};entity.initialTimeMs=(sim.tick-1)*CFG.stepMs;}
   entities.push(entity);next.set(id,{source:a,generation,pos:{...a.pos}});
  };
  for(const a of Object.values(sim.actors))add(a,'actor');for(const d of Object.values(sim.drops))add(d,'drop');for(const s of Object.values(sim.projectiles))add(s,'shot');for(const u of sim.companions.all())add(u,'companion');
  this.runtime.capture({revision:this.revision,sequence:sim.tick,timeMs:sim.tick*CFG.stepMs,entities,...(this.mode?{mode:this.mode}:{})},performance.now());
  METRICS.add('presentation.capture',performance.now()-started);
  this.mode=null;this.entries=next;this.world=sim.terrain;this.tick=sim.tick;this.epoch=sim.epoch;
 }
 frame(sim){this.publish(sim);return this.runtime.frame(performance.now());}
}

