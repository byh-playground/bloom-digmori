// One species definition drives wild appearance/AI and owned capabilities.
const SPECIES=Object.freeze({
 shell:Object.freeze({name:'조약돌 두더지',icon:'◆',art:'ball',wild:Object.freeze({kind:'pebbleMole',hp:100,poise:50,speed:2.6,damage:15,poiseDamage:10,reach:1.9,wind:700,active:125,recovery:900,tint:[.94,.7,.57,1],size:1}),capabilities:{gather:{blocks:['grass','dirt','leaves','cap','stem'],speed:2},carry:{capacity:1},attack:{mode:'ball',damage:20,poise:15,cost:10,charge:[550,1100],reach:12,cooldown:1600,groundHoldMs:300,projectile:{speed:18,lift:8,gravity:1,radius:.29}}}}),
 leaf:Object.freeze({name:'수확집게',icon:'⋈',art:'claw',wild:Object.freeze({kind:'fungus',hp:75,poise:25,speed:2,damage:15,poiseDamage:10,reach:2.5,wind:900,active:100,recovery:1500,tint:[.82,.72,.98,1],size:1}),capabilities:{gather:{blocks:['log','leaves','grass','cap','stem'],speed:2.5},carry:{capacity:1},attack:{mode:'claw',damage:20,poise:20,cost:10,charge:[550,1100],reach:2.5,cooldown:1000}}}),
 warden:Object.freeze({name:'\uC7A0\uB4E0 \uD654\uC6D0\uC758 \uC218\uD638\uC790',icon:'\u2605',art:'claw',wild:Object.freeze({kind:'fungus',hp:1000,poise:250,speed:2.5,damage:35,poiseDamage:40,reach:4.3,wind:1000,active:200,recovery:1400,tint:[1,.69,.68,1],size:2.8}),capabilities:{attack:{mode:'claw',damage:45,poise:40,cost:20,charge:[800,1400],reach:3.6,cooldown:2000}}})
});
// One-time save migration from retired hostile forms to capturable species.
const LEGACY_SPECIES=Object.freeze({beetle:'shell',spore:'leaf',guardian:'shell',crystalWisp:'leaf',cryptKnight:'shell'});
const BOSS=Object.freeze({...SPECIES.warden.wild,name:SPECIES.warden.name,loot:[['heart',1],['diamond',3]]});
const COMPANION_SLOTS=3;
