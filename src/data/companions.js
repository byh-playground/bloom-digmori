'use strict';
// One species definition drives wild appearance/AI, its structure boss and the owned unit's capabilities (G2, D-100…D-107).
// Ids are the cut-out rig ids (src/assets/units/<id>/) so simulation, save and presentation share one key.
// Owned attack modes: 'melee' sweeps the articulated companion strike volume beside the owner (companion-motion.js),
// 'ball' throws the unit itself as one physical projectile that lands, holds and returns.
// Each species' rig: attack = its signature anim (뿌리 slam, 바위 병아리 headbutt/hide, 버섯 달팽이 spore).
const SPECIES=Object.freeze({
// `food` (D-105) is the item a baby eats from the ground and the item that leads the species when held:
// 뿌리 열매(food), 바위 병아리 씨앗(seed, like Minecraft chickens), 버섯 달팽이 잎(leaves).
 root:Object.freeze({name:'뿌리',icon:'❦',realm:'grassland',egg:'rootEgg',signature:'slam',food:'food',
  wild:Object.freeze({hp:100,speed:2.6,damage:15,reach:1.9,wind:700,active:125,recovery:900,size:.65,loot:Object.freeze([['seed',2],['food',1]])}),
  boss:Object.freeze({name:'뿌리 거인',hp:900,speed:2.6,damage:30,heavy:true,reach:4,wind:1000,active:200,recovery:1400,size:1.9,structure:'grove',crown:'rootCrown'}),
  capabilities:Object.freeze({gather:Object.freeze({blocks:Object.freeze(['grass','dirt','log','leaves']),tier:0,speed:2.5}),carry:Object.freeze({stacks:4}),
   attack:Object.freeze({mode:'melee',damage:25,reach:2.6,cooldown:1100})})}),
 'rock-chick':Object.freeze({name:'바위 병아리',icon:'◒',realm:'cave',egg:'rockChickEgg',signature:'headbutt',food:'seed',
  wild:Object.freeze({hp:125,speed:2.2,damage:15,reach:1.8,wind:700,active:125,recovery:1000,size:.65,loot:Object.freeze([['cobble',2],['coal',1]])}),
  boss:Object.freeze({name:'광맥 병아리 대왕',hp:1000,speed:2.2,damage:30,heavy:true,reach:3.6,wind:1000,active:200,recovery:1400,size:1.6,structure:'dungeon',crown:'rockChickCrown'}),
  capabilities:Object.freeze({gather:Object.freeze({blocks:Object.freeze(['stone','cobble','coalOre','ironOre','goldOre','diamondOre']),tier:3,speed:2}),carry:Object.freeze({stacks:4}),
   attack:Object.freeze({mode:'ball',damage:20,reach:12,cooldown:1600,groundHoldMs:300,projectile:Object.freeze({speed:18,lift:8,gravity:1,radius:.29})})})}),
 'mushroom-snail':Object.freeze({name:'버섯 달팽이',icon:'❂',realm:'fungal',egg:'mushroomSnailEgg',signature:'spore',food:'leaves',
  wild:Object.freeze({hp:100,speed:1.6,damage:10,reach:2.4,wind:900,active:150,recovery:1200,size:.65,loot:Object.freeze([['cap',1],['food',1]])}),
  boss:Object.freeze({name:'포자 군주',hp:800,speed:2,damage:25,heavy:true,reach:4.5,wind:1100,active:250,recovery:1400,size:1.9,structure:'ring',crown:'mushroomSnailCrown'}),
  capabilities:Object.freeze({gather:Object.freeze({blocks:Object.freeze(['cap','stem','mycelium']),tier:0,speed:2}),carry:Object.freeze({stacks:4}),
   attack:Object.freeze({mode:'melee',damage:20,reach:3,cooldown:1300})})})
});
// One-time save migration: retired hostile forms (≤0.27) and the 0.28–0.32 species map to the nearest new species.
// 조약돌 두더지(shell) burrows like a cave chick, 수확집게(leaf) gathers like a root, the spore and the retired
// warden-era kinds follow their biome. The old warden boss itself is retired, not migrated (Simulation.migrateLegacyActors).
const LEGACY_SPECIES=Object.freeze({shell:'rock-chick',leaf:'root',warden:'root',beetle:'rock-chick',spore:'mushroom-snail',guardian:'rock-chick',crystalWisp:'rock-chick',cryptKnight:'rock-chick'});
const BOSS_LOOT=Object.freeze([['heart',1],['diamond',3]]);
// D-107: units come only from eggs, eggs only from boss kills. Every player's first kill of each boss species drops a
// guaranteed egg (so the slice always yields all three companions); later kills drop one with `chance` percent.
// Bosses come back `respawnMs` after a defeat, so a missed roll is retried by fighting the structure boss again.
// Hatching is deterministic: `hatchMs` after placement the egg block becomes a baby (grade 1) owned by the placer.
const EGG_RULES=Object.freeze({chance:35,hatchMs:30000,grade:1,respawnMs:240000});
const UNIT_STAGES_OWNED=Object.freeze(['baby','adult']);
// Ranching (D-103…D-106, 0.34.0). All counts are ticks or blocks; the ranch state machine (Ranch, Companions.ranch) is grid based.
// enclosure: a flood fill over unit moves inside a box of ±half blocks around the start cell (33×33, so the 32×32 cap) and
// ±up/down blocks; touching the box edge (or maxCells) means the region is open, not a pen.
// stepTicks: ticks per block step (adult .5/.53/.73 s; a baby takes ×5/4). eatTicks: one bite (1.2 s). feedToAdult: bites
// from baby to adult. eatRadius/leadRadius: blocks within which a baby notices thrown food / a unit follows its owner holding
// the species food. wanderTicks: idle pause range before a new wander goal; leash: an open-region unit wanders within this
// many blocks of home. drop: the deepest step down a unit takes. potion: thrown like a splash potion; radius in metres.
// laborGrade: integer per-mille gather speed by grade 1…4, ×1.5 per grade above 1 (doc §3.0 "노동 효율은 등급당 ×1.5"):
// grade 4 works ×3.375. regrow: LABOR_REGROW below (by block, 0.35.1).
const RANCH_RULES=Object.freeze({
 enclosure:Object.freeze({half:16,up:6,down:6,maxCells:2048,drop:3}),
 stepTicks:Object.freeze({root:ticksForMs(500),'rock-chick':ticksForMs(533),'mushroom-snail':ticksForMs(733)}),
 eatTicks:ticksForMs(1200),feedToAdult:3,eatRadius:8,leadRadius:10,wanderTicks:Object.freeze([ticksForMs(800),ticksForMs(3200)]),leash:5,pathMax:96,
 potion:Object.freeze({radius:3,speed:11,lift:3.5,gravity:1,ballRadius:.12,lifetime:4000}),
 chestSlots:9,laborGrade:Object.freeze([1000,1500,2250,3375])
});
// D-106 regrowth by block (0.35.1). A block taken by chest labor grows back in place `ms` later as block `as` (itself when
// omitted). Plants — grass/soil, leaves, logs and mushroom caps/stems — come back in 20 s; stone and cobble in 30 s; coal
// and iron ore come back as the same ore after 2 minutes, so a fenced vein is a slow trickle, not a mine. Gold and diamond
// ore never come back: the hole grows back as stone (stone's 30 s), so a fenced deep vein is mined out once by labor.
// A block missing from the table (not a labor aptitude block) does not regrow.
const LABOR_REGROW=Object.freeze(Object.fromEntries([
 ...['grass','dirt','mycelium','leaves','log','cap','stem'].map(id=>[id,Object.freeze({ms:20000})]),
 ...['stone','cobble'].map(id=>[id,Object.freeze({ms:30000})]),
 ...['coalOre','ironOre'].map(id=>[id,Object.freeze({ms:120000})]),
 ...['goldOre','diamondOre'].map(id=>[id,Object.freeze({ms:30000,as:'stone'})])]));
// The regrowth entry for a labor-harvested block: {id, ticks} or null.
const laborRegrow=blockId=>{const r=LABOR_REGROW[BLOCKS[blockId]?.id];return r?{id:BID[r.as||BLOCKS[blockId].id],ticks:ticksForMs(r.ms)}:null;};
const COMPANION_SLOTS=3;
const eggSpecies=blockId=>BLOCKS[blockId]?.egg||null;
