class RPG {
 static create(){return{level:1,xp:0,points:0,skills:{vitality:0,might:0,endurance:0}};}
 static next(level){return 45+level*35;}
 static staminaMax(actor){return CFG.player.stamina+(actor.rpg?.skills.endurance||0)*10;}
 static gain(actor,amount,sim,reason='explore'){
  if(!actor||actor.enemy||actor.dead||!Number.isInteger(amount)||amount<=0)return false;
  const r=actor.rpg;r.xp+=amount;let up=0;
  while(r.level<CFG.rpg.maxLevel&&r.xp>=this.next(r.level)){r.xp-=this.next(r.level);r.level++;r.points++;up++;}
  if(r.level>=CFG.rpg.maxLevel)r.xp=0;
  sim.emit('xp',actor,{amount,reason});if(up)sim.emit('level-up',actor,{level:r.level,points:r.points});return true;
 }
 static upgrade(actor,skill,sim){const r=actor.rpg;if(actor.enemy||!Object.hasOwn(RPG_SKILLS,skill)||r.points<=0||r.skills[skill]>=10)return false;
  r.points--;r.skills[skill]++;if(skill==='vitality'){actor.maxHp+=25;actor.hp+=25;}
  if(skill==='endurance')actor.combat.stamina.value=Math.min(this.staminaMax(actor),actor.combat.stamina.value+10);
  sim.emit('skill-up',actor,{skill,level:r.skills[skill]});return true;
 }
}
