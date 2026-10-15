// Capabilities compose labor and combat; ownership/location live only in Companions.
const COMPANION_TYPES=Object.freeze({
 shell:Object.freeze({name:'말랑조개',icon:'◉',art:'ball',capabilities:{gather:{blocks:['grass','dirt','leaves','cap','stem'],speed:2},carry:{capacity:1},attack:{mode:'ball',damage:18,poise:16,reach:12,cooldown:1600}}}),
 leaf:Object.freeze({name:'칼잎새',icon:'❧',art:'sword',capabilities:{gather:{blocks:['log','leaves','grass','cap','stem'],speed:2.5},carry:{capacity:1},attack:{mode:'sword',damage:22,poise:22,reach:2.5,cooldown:1000}}})
});
const COMPANION_SLOTS=3;
