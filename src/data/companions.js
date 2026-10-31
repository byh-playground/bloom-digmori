'use strict';
// One species definition drives wild appearance/AI, its structure boss and the owned unit's capabilities (G2, D-100…D-107).
// Ids are the cut-out rig ids (src/assets/units/<id>/) so simulation, save and presentation share one key.
// Owned attack modes: 'melee' sweeps the articulated companion strike volume beside the owner (companion-motion.js),
// 'ball' throws the unit itself as one physical projectile that lands, holds and returns.
// Each species' rig: attack = its signature anim (뿌리 slam, 바위 병아리 headbutt/hide, 버섯 달팽이 spore).
const SPECIES=Object.freeze({
 root:Object.freeze({name:'뿌리',icon:'❦',realm:'grassland',egg:'rootEgg',signature:'slam',
  wild:Object.freeze({hp:100,speed:2.6,damage:15,reach:1.9,wind:700,active:125,recovery:900,size:.65,loot:Object.freeze([['seed',2],['food',1]])}),
  boss:Object.freeze({name:'뿌리 거인',hp:900,speed:2.6,damage:30,heavy:true,reach:4,wind:1000,active:200,recovery:1400,size:1.9,structure:'grove'}),
  capabilities:Object.freeze({gather:Object.freeze({blocks:Object.freeze(['grass','dirt','log','leaves']),tier:0,speed:2.5}),carry:Object.freeze({capacity:1}),
   attack:Object.freeze({mode:'melee',damage:25,reach:2.6,cooldown:1100})})}),
 'rock-chick':Object.freeze({name:'바위 병아리',icon:'◒',realm:'cave',egg:'rockChickEgg',signature:'headbutt',
  wild:Object.freeze({hp:125,speed:2.2,damage:15,reach:1.8,wind:700,active:125,recovery:1000,size:.65,loot:Object.freeze([['cobble',2],['coal',1]])}),
  boss:Object.freeze({name:'광맥 병아리 대왕',hp:1000,speed:2.2,damage:30,heavy:true,reach:3.6,wind:1000,active:200,recovery:1400,size:1.6,structure:'dungeon'}),
  capabilities:Object.freeze({gather:Object.freeze({blocks:Object.freeze(['stone','cobble','coalOre','ironOre','goldOre','diamondOre']),tier:3,speed:2}),carry:Object.freeze({capacity:1}),
   attack:Object.freeze({mode:'ball',damage:20,reach:12,cooldown:1600,groundHoldMs:300,projectile:Object.freeze({speed:18,lift:8,gravity:1,radius:.29})})})}),
 'mushroom-snail':Object.freeze({name:'버섯 달팽이',icon:'❂',realm:'fungal',egg:'mushroomSnailEgg',signature:'spore',
  wild:Object.freeze({hp:100,speed:1.6,damage:10,reach:2.4,wind:900,active:150,recovery:1200,size:.65,loot:Object.freeze([['cap',1],['food',1]])}),
  boss:Object.freeze({name:'포자 군주',hp:800,speed:2,damage:25,heavy:true,reach:4.5,wind:1100,active:250,recovery:1400,size:1.9,structure:'ring'}),
  capabilities:Object.freeze({gather:Object.freeze({blocks:Object.freeze(['cap','stem','mycelium']),tier:0,speed:2}),carry:Object.freeze({capacity:1}),
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
const COMPANION_SLOTS=3;
const eggSpecies=blockId=>BLOCKS[blockId]?.egg||null;
