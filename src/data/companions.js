// Capabilities compose labor and combat; ownership/location live only in Companions.
const COMPANION_TYPES=Object.freeze({
 shell:Object.freeze({name:'말랑조개',icon:'◉',art:'ball',capabilities:{gather:{blocks:['grass','dirt','leaves','cap','stem'],speed:2},carry:{capacity:1},attack:{mode:'ball',damage:20,poise:15,cost:10,charge:[550,1100],reach:12,cooldown:1600,groundHoldMs:300,projectile:{speed:18,lift:8,gravity:1,radius:.29}}}}),
 // Stable saved kind ID; the former leaf equipment is replaced, not duplicated.
 leaf:Object.freeze({name:'수확집게',icon:'⋈',art:'claw',capabilities:{gather:{blocks:['log','leaves','grass','cap','stem'],speed:2.5},carry:{capacity:1},attack:{mode:'claw',damage:20,poise:20,cost:10,charge:[550,1100],reach:2.5,cooldown:1000}}})
});
const COMPANION_SLOTS=3;
