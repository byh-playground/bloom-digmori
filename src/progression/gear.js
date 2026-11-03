'use strict';
/* Equipment progression (0.35.1, doc §3.3): entering a realm is free, but gear below its recommended tier costs a lot.
 * Pure functions of the actor's inventory and position, so every peer computes the same factors on the same tick.
 * Slot tiers: 곡괭이 and 무기 are the held item (D-160: what the player sees in hand is what is judged; anything else in
 * hand counts as bare for that slot; `idle` marks the other one while a pick or weapon is held), 방어구 is the lowest worn piece (a missing piece counts as bare). Factors are integer per-mille (GEAR_RULES); Gear.scale applies one with
 * integer rounding. */
const Gear={
 itemTier(id){const it=ITEMS[id];return it?.material?GEAR_TIERS[it.material]||0:0;},
 tiers(actor){const i=actor.inventory,s=Inventory.selected(i),it=s&&ITEMS[s.id],t=it?this.itemTier(s.id):0,pick=it?.tool==='pick'?t:0,weapon=it?.weapon?t:0;
  let armor=GEAR_RULES.bonusTier;for(const k of ARMOR_SLOTS)armor=Math.min(armor,i.armor[k]?this.itemTier(i.armor[k].id):0);
  return{pick,weapon,armor,held:it?.tool==='pick'?'pick':it?.weapon?'weapon':null};},
 // 'below' | 'normal' | 'bonus' for a slot tier against the realm's recommended tier.
 grade(tier,need){if(tier<need)return'below';if(tier>=GEAR_RULES.bonusTier&&need<GEAR_RULES.bonusTier)return'bonus';return'normal';},
 factor(grade,effect){return grade==='below'?GEAR_RULES.below[effect]:grade==='bonus'?GEAR_RULES.bonus[effect]:1000;},
 // Everything the HUD and the simulation need at the actor's spot: realm, recommended tier, per-slot grade and factors,
 // and the active hazard (armor below the tier in a realm that has one).
 status(actor,terrain){const realm=terrain.realm(actor.pos.x,actor.pos.y,actor.pos.z),rule=REALMS[realm],need=rule?.gear||0,tiers=this.tiers(actor),slots={};
  for(const [slot,def]of Object.entries(GEAR_RULES.slots)){const grade=this.grade(tiers[slot],need);slots[slot]={tier:tiers[slot],grade,factor:this.factor(grade,def.effect),idle:!!tiers.held&&slot!=='armor'&&slot!==tiers.held};}
  return{realm,need,slots,gather:slots.pick.factor,attack:slots.weapon.factor,taken:slots.armor.factor,hazard:slots.armor.grade==='below'&&rule?.hazard?rule.hazard:null};},
 // Integer scaling of a whole damage value by a per-mille factor (half up, at least 1).
 scale(value,milli){return Math.max(1,Math.floor((value*milli+500)/1000));}
};
