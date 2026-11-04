'use strict';
// One species definition drives wild appearance/AI, its structure boss and the pet (0.41.0, D-227).
// Ids are the cut-out rig ids (src/assets/units/<id>/) so simulation, save and presentation share one key.
// `food` is the item that tames the wild creature, heals a pet and grows a tamed baby: 뿌리 열매(food), 바위 병아리 씨앗(seed,
// like Minecraft chickens), 버섯 달팽이 잎(leaves). `petDamage` is an adult pet's strike (a baby does CFG.pets.babyFactor of it).
// Each species' rig: attack = its signature anim (뿌리 slam, 바위 병아리 headbutt/hide, 버섯 달팽이 spore).
const SPECIES=Object.freeze({
 root:Object.freeze({name:'뿌리',icon:'❦',realm:'grassland',signature:'slam',food:'food',petDamage:25,
  wild:Object.freeze({hp:100,speed:2.6,damage:15,reach:1.9,wind:700,active:125,recovery:900,size:.65,loot:Object.freeze([['seed',2],['food',1],['bark',1]])}),
  boss:Object.freeze({name:'뿌리 거인',hp:900,speed:2.6,damage:30,heavy:true,reach:4,wind:1000,active:200,recovery:1400,size:1.9,structure:'grove',crown:'rootCrown'})}),
 'rock-chick':Object.freeze({name:'바위 병아리',icon:'◒',realm:'cave',signature:'headbutt',food:'seed',petDamage:20,
  wild:Object.freeze({hp:125,speed:2.2,damage:15,reach:1.8,wind:700,active:125,recovery:1000,size:.65,loot:Object.freeze([['cobble',2],['coal',1]])}),
  boss:Object.freeze({name:'광맥 병아리 대왕',hp:1000,speed:2.2,damage:30,heavy:true,reach:3.6,wind:1000,active:200,recovery:1400,size:1.6,structure:'dungeon',crown:'rockChickCrown'})}),
 'mushroom-snail':Object.freeze({name:'버섯 달팽이',icon:'❂',realm:'fungal',signature:'spore',food:'leaves',petDamage:20,
  wild:Object.freeze({hp:100,speed:1.6,damage:10,reach:2.4,wind:900,active:150,recovery:1200,size:.65,loot:Object.freeze([['cap',1],['food',1]])}),
  boss:Object.freeze({name:'포자 군주',hp:800,speed:2,damage:25,heavy:true,reach:4.5,wind:1100,active:250,recovery:1400,size:1.9,structure:'ring',crown:'mushroomSnailCrown'})})
});
// One-time save migration: retired hostile forms (≤0.27) and the 0.28–0.32 species map to the nearest new species.
// 조약돌 두더지(shell) burrows like a cave chick, 수확집게(leaf) gathers like a root, the spore and the retired
// warden-era kinds follow their biome. The old warden boss itself is retired, not migrated (Simulation.migrateLegacyActors).
const LEGACY_SPECIES=Object.freeze({shell:'rock-chick',leaf:'root',warden:'root',beetle:'rock-chick',spore:'mushroom-snail',guardian:'rock-chick',crystalWisp:'rock-chick',cryptKnight:'rock-chick'});
const BOSS_LOOT=Object.freeze([['heart',1],['diamond',3]]);
