// One species definition drives wild appearance/AI and owned capabilities.
const SPECIES=Object.freeze({
 shell:Object.freeze({name:'말랑조개',icon:'◉',art:'ball',wild:Object.freeze({kind:'bug',hp:100,poise:50,speed:2.6,damage:15,poiseDamage:10,reach:1.9,wind:700,active:125,recovery:900,tint:[.94,.7,.57,1],size:1}),capabilities:{gather:{blocks:['grass','dirt','leaves','cap','stem'],speed:2},carry:{capacity:1},attack:{mode:'ball',damage:20,poise:15,cost:10,charge:[550,1100],reach:12,cooldown:1600,groundHoldMs:300,projectile:{speed:18,lift:8,gravity:1,radius:.29}}}}),
 leaf:Object.freeze({name:'수확집게',icon:'⋈',art:'claw',wild:Object.freeze({kind:'fungus',hp:75,poise:25,speed:2,damage:15,poiseDamage:10,reach:2.5,wind:900,active:100,recovery:1500,tint:[.82,.72,.98,1],size:1}),capabilities:{gather:{blocks:['log','leaves','grass','cap','stem'],speed:2.5},carry:{capacity:1},attack:{mode:'claw',damage:20,poise:20,cost:10,charge:[550,1100],reach:2.5,cooldown:1000}}})
});
const COMPANION_SLOTS=3;
