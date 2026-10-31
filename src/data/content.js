'use strict';
const BIOMES=Object.freeze({
 meadow:{name:'꽃잎 초원',surface:'grass',soil:'dirt',habitat:{surfaces:['grass'],elevation:[3,15],climate:{heat:[-.15,.15],wet:[-.13,.10]},maxSlope:1,maxExposure:2.5},vegetation:{density:18,canopy:'leaves'},resources:{ore:'coalOre',bonus:0,substrate:'stone',minDepth:3,surface:'grass',climate:{heat:[-.15,.15],wet:[-.13,.10]}},decorations:{caveBloom:{chance:.035,host:'stone',y:[CFG.bottom+4,-8],climate:{heat:[-.15,.15],wet:[-.13,.10]}}},realm:'grassland'},
 forest:{name:'포자 수림',surface:'grass',soil:'dirt',habitat:{surfaces:['grass'],elevation:[3,16],climate:{heat:[-.15,.15],wet:[.10,1]},maxSlope:1,maxExposure:2},vegetation:{density:82,canopy:'leaves'},resources:{ore:'coalOre',bonus:.025,substrate:'stone',minDepth:3,surface:'grass',climate:{heat:[-.15,.15],wet:[.10,1]}},decorations:{caveBloom:{chance:.055,host:'stone',y:[CFG.bottom+4,-8],climate:{heat:[-.15,.15],wet:[.10,1]}}},realm:'fungal'},
 fungal:{name:'균사 정원',surface:'mycelium',soil:'dirt',habitat:{surfaces:['mycelium'],elevation:[3,15],climate:{heat:[-.15,.15],wet:[-1,-.13]},maxSlope:1,maxExposure:2.5},vegetation:{density:64,canopy:'cap'},resources:{ore:'ironOre',bonus:.015,substrate:'stone',minDepth:3,surface:'mycelium',climate:{heat:[-.15,.15],wet:[-1,-.13]}},decorations:{caveBloom:{chance:.08,host:'stone',y:[CFG.bottom+4,-8],climate:{heat:[-.15,.15],wet:[-1,-.13]}}},realm:'fungal'},
 dry:{name:'모래 구릉',surface:'sand',soil:'sand',habitat:{surfaces:['sand'],elevation:[3,12],climate:{heat:[.15,1],wet:[-1,1]},maxSlope:0,maxExposure:1},vegetation:{density:0,canopy:'leaves'},resources:{ore:'goldOre',bonus:.025,substrate:'stone',minDepth:3,surface:'sand',climate:{heat:[.15,1],wet:[-1,1]}},decorations:{caveBloom:{chance:.005,host:'stone',y:[CFG.bottom+4,-8],climate:{heat:[.15,1],wet:[-1,1]}}},realm:null},
 cold:{name:'서리 고원',surface:'snow',soil:'dirt',habitat:{surfaces:['snow'],elevation:[3,10],climate:{heat:[-1,-.15],wet:[-1,1]},maxSlope:.75,maxExposure:1},vegetation:{density:8,canopy:'leaves'},resources:{ore:'ironOre',bonus:.025,substrate:'stone',minDepth:3,surface:'snow',climate:{heat:[-1,-.15],wet:[-1,1]}},decorations:{caveBloom:{chance:.035,host:'stone',y:[CFG.bottom+4,-8],climate:{heat:[-1,-.15],wet:[-1,1]}}},realm:null}
});
// G2 gameplay biomes (D-100/D-101) mapped onto the terrain biomes above: terrain keeps its climate generator,
// only companion species, boss structures and gather placement follow the realm. 모래 구릉·서리 고원 have none.
// The cave realm is everything carved underground (natural caves, mines and the dungeon) below the surface.
// gear/hazard (0.35.1, doc §3.3): the recommended equipment tier of the realm (GEAR_TIERS) and the hazard that drains HP
// when the worn armor is below it. 초원 asks for nothing, 동굴 for 철, 균류 숲 for 다이아몬드(기획의 청수정 단계).
const REALMS=Object.freeze({
 grassland:Object.freeze({name:'초원',species:'root',structure:'grove',gear:0,hazard:null}),
 fungal:Object.freeze({name:'균류 숲',species:'mushroom-snail',structure:'ring',gear:4,hazard:'spore'}),
 cave:Object.freeze({name:'동굴',species:'rock-chick',structure:'dungeon',gear:3,hazard:'cold'})
});
// The realm order of the slice: each later realm's gear recipes take one resource of the realm before it (doc §3.5 ①).
const REALM_ORDER=Object.freeze(['grassland','cave','fungal']);
const BLOCKS=[
 {id:'air',name:'공기',color:'#ffffff',solid:false},
 {id:'grass',name:'풀흙',color:'#80b966',hardness:650,drop:'dirt',tool:'pick',tier:0},
 {id:'dirt',name:'흙',color:'#aa8056',hardness:650,tool:'pick',tier:0},
 {id:'stone',name:'돌',color:'#93a29b',hardness:1400,drop:'cobble',tool:'pick',tier:1},
 {id:'log',name:'원목',color:'#9e724d',hardness:1500,tool:'axe',tier:0},
 {id:'leaves',name:'잎',color:'#69af67',hardness:250,drop:'seed',tool:'none',tier:0},
 {id:'sand',name:'모래',color:'#edcf8b',hardness:550,tool:'pick',tier:0},
 {id:'coalOre',name:'석탄 광석',color:'#586567',hardness:1900,drop:'coal',tool:'pick',tier:1},
 {id:'ironOre',name:'철 광석',color:'#bbaa8c',hardness:2100,drop:'rawIron',tool:'pick',tier:2},
 {id:'goldOre',name:'금 광석',color:'#d5bd65',hardness:2400,drop:'rawGold',tool:'pick',tier:3},
 {id:'diamondOre',name:'다이아몬드 광석',color:'#73dcd9',hardness:2900,drop:'diamond',tool:'pick',tier:3},
 {id:'planks',name:'판자',color:'#d5ab73',hardness:1200,tool:'axe',tier:0},
 {id:'workbench',name:'제작대',color:'#b7804f',hardness:1200,tool:'axe',tier:0,station:'craft'},
 {id:'furnace',name:'화로',color:'#707d7e',hardness:2200,tool:'pick',tier:1,station:'furnace'},
 {id:'torch',name:'횃불',color:'#f7c558',hardness:120,tool:'none',tier:0,light:11},
 {id:'obsidian',name:'흑요석',color:'#48415f',hardness:8000,tool:'pick',tier:4},
 {id:'bedrock',name:'기반암',color:'#394548',hardness:Infinity,tier:99},
 {id:'cobble',name:'조약돌',color:'#879391',hardness:1600,tool:'pick',tier:1},
 {id:'altar',name:'오래된 꽃 제단',color:'#bd91bd',hardness:Infinity,tier:99,light:8},
 // 0.35.1: a cap drops itself (plus a fruit by chance, Simulation.blockDrops) and a stem drops itself, so mushroom blocks
 // can be carried and placed: a snail farm works anywhere. A stem crafts into planks like a log.
 {id:'cap',name:'버섯 갓',color:'#c184a9',hardness:450,tier:0},
 {id:'stem',name:'버섯 줄기',color:'#e8d9b8',hardness:900,tool:'axe',tier:0},
 {id:'trophy',name:'화원 수호의 증표',color:'#eec565',hardness:800,tier:0,light:12},
 {id:'crystalBloom',name:'공명 수정',color:'#8eddeb',hardness:1400,tool:'pick',tier:2,drop:'crystalShard',light:9},
 {id:'snow',name:'눈덮인 흙',color:'#dae9ed',hardness:650,drop:'dirt',tool:'pick',tier:0},
 {id:'mycelium',name:'균사 흙',color:'#b79bc4',hardness:650,drop:'dirt',tool:'pick',tier:0},
 {id:'lootChest',name:'봉인된 보물함',color:'#bf935d',hardness:Infinity,tier:99,station:'loot'},
 // Companion eggs (D-103): an item that places as a non-solid block, drawn with the species' egg PNG instead of a cube.
 // Appended only: block ids are saved terrain edits, so existing indices never move.
 {id:'rootEgg',name:'뿌리 알',color:'#d8c79a',hardness:300,tool:'none',tier:0,solid:false,mesh:false,egg:'root'},
 {id:'rockChickEgg',name:'바위 병아리 알',color:'#c8c2b4',hardness:300,tool:'none',tier:0,solid:false,mesh:false,egg:'rock-chick'},
 {id:'mushroomSnailEgg',name:'버섯 달팽이 알',color:'#e0c4cf',hardness:300,tool:'none',tier:0,solid:false,mesh:false,egg:'mushroom-snail'},
 // Ranching (D-103/D-106, 0.34.0). A fence and a closed gate are one solid voxel in the collider, but count as 1.5 blocks
 // high: owned units never cross, climb or stand on them (Ranch.passable/standable) and, since 0.35.1, a body (player or
 // creature) whose feet are below its top (1.5, lifted just over the 1.52 jump apex) cannot move into one or auto-step it
 // (Physics.fenceClamp). Both are drawn as posts
 // and rails (Renderer.drawFences), not as cubes. The open gate is its own non-solid block so the voxel collider opens.
 {id:'fence',name:'나무 울타리',color:'#b48552',hardness:1000,tool:'axe',tier:0,mesh:false,fence:true},
 {id:'fenceGate',name:'울타리 문',color:'#c39762',hardness:1000,tool:'axe',tier:0,mesh:false,fence:true,gate:'closed'},
 {id:'fenceGateOpen',name:'열린 울타리 문',color:'#c39762',hardness:1000,tool:'axe',tier:0,solid:false,mesh:false,gate:'open',drop:'fenceGate'},
 {id:'storageChest',name:'보관 상자',color:'#b27a45',hardness:1200,tool:'axe',tier:0,station:'chest'}
];
const BID=Object.fromEntries(BLOCKS.map((b,i)=>[b.id,i]));
const RESOURCE_DEFS=Object.freeze([
 Object.freeze({id:'coalOre',name:'석탄',min:-4,max:24,peak:10,substrate:'stone',tool:'나무 곡괭이',hint:'얕은 동굴·바위 능선',salt:12,scale:.20,threshold:.43,peakBonus:.17}),
 Object.freeze({id:'ironOre',name:'철',min:-18,max:16,peak:2,substrate:'stone',tool:'돌 곡괭이',hint:'동굴·폐광 주변',salt:33,scale:.17,threshold:.46,peakBonus:.18}),
 Object.freeze({id:'goldOre',name:'금',min:-28,max:-4,peak:-16,substrate:'stone',tool:'철 곡괭이',hint:'깊은 동굴·던전 벽',salt:63,scale:.15,threshold:.50,peakBonus:.16}),
 Object.freeze({id:'diamondOre',name:'다이아몬드',min:-31,max:-15,peak:-24,substrate:'stone',tool:'철 곡괭이',hint:'최심부·고대 화원 유적',salt:47,scale:.18,threshold:.56,peakBonus:.14})
]);
const RESOURCE_BY_ID=Object.freeze(Object.fromEntries(RESOURCE_DEFS.map(def=>[def.id,def])));
const resourceRangeText=id=>{const r=RESOURCE_BY_ID[id];return r?`${r.name} Y ${r.min}~${r.max}`:'';};
// 무기 종류가 기본 성능을, 재료 등급이 공격력(+5 단위)을 결정한다.
// 채광 속도와 무게는 피해 수치와 분리한다.
const MATERIALS={wood:{name:'나무',tier:1,damageBonus:-10,speed:2,color:'#cfa876'},stone:{name:'돌',tier:2,damageBonus:-5,speed:4,color:'#a3adae'},iron:{name:'철',tier:3,damageBonus:0,speed:6,color:'#dde6e6'},diamond:{name:'다이아몬드',tier:4,damageBonus:5,speed:8,color:'#78ded9'}};
// 플레이어 전투는 기본 공격 연타(combo 단계)만 사용한다. 도끼는 무기이면서 원목 채집 도구다.
const WEAPONS={
 sword:{name:'검',icon:'⚔',damage:25,reach:3.3,arc:1.65,weight:5,wind:250,active:125,recovery:375},
 spear:{name:'창',icon:'↟',damage:25,reach:4.2,arc:.3,weight:6,wind:300,active:100,recovery:450},
 axe:{name:'도끼',icon:'🪓',damage:30,reach:3.2,arc:1.4,weight:8,wind:425,active:125,recovery:450}
};
const ITEMS={};
function defineItem(id,name,icon,opts={}){ITEMS[id]={id,name,icon,stack:64,...opts};}
for(const b of BLOCKS)if(!['air','grass','bedrock','altar','coalOre','ironOre','goldOre','diamondOre','lootChest','fenceGateOpen'].includes(b.id))defineItem(b.id,b.name,({log:'▥',leaves:'✿',stone:'◆',dirt:'■',planks:'▤',workbench:'▦',furnace:'▣',torch:'♨',cap:'🍄',stem:'▥',trophy:'✧',fence:'#',fenceGate:'⊓',storageChest:'▤'})[b.id]||'◆',{block:BID[b.id]});
for(const [id,name,icon]of [['stick','나뭇가지','╱'],['coal','석탄','●'],['charcoal','목탄','●'],['rawIron','철 원석','◆'],['iron','철 주괴','▰'],['rawGold','금 원석','◆'],['gold','금 주괴','▰'],['diamond','다이아몬드','💎'],['seed','씨앗','🌰'],['food','열매','🍓'],['fiber','질긴 섬유','〰'],['leather','가죽','▱'],['heart','화원의 심장','✺'],['bucket','빈 물통','▣'],['waterBucket','물통','▣'],['crystalShard','공명 수정 조각','◇'],['healingSalve','치유 연고','✚'],['relic','고대의 유물','✧']])defineItem(id,name,icon,{...(['bucket','waterBucket'].includes(id)?{stack:1}:{})});
// D-104 merge potion: thrown like a splash potion (right-click), merges owned adults hit by the splash (Simulation.splashPotion).
defineItem('mergePotion','합성 물약','⚗',{stack:16,throwable:true});
// 0.35.1 boss crowns (doc §3.0 "보스는 재료와 왕관을 떨군다"): every structure boss drops its own crown (SPECIES.boss.crown).
// The cave boss's crown goes into the diamond helmet, so the fungal tier needs the cave boss killed (doc §3.3).
for(const [id,name]of [['rootCrown','금빛 꽃 왕관'],['rockChickCrown','금광석 왕관'],['mushroomSnailCrown','금빛 버섯 왕관']])defineItem(id,name,'♛',{stack:16,crown:true});
for(const [mat,m]of Object.entries(MATERIALS)){
 defineItem(mat+'_pick',m.name+' 곡괭이','⛏',{stack:1,material:mat,tool:'pick',tier:m.tier,miningSpeed:m.speed,weight:4});
 for(const [type,w]of Object.entries(WEAPONS))
  defineItem(mat+'_'+type,m.name+' '+w.name,w.icon,{stack:1,material:mat,weapon:type,weight:w.weight,...type==='axe'?{tool:'axe',miningSpeed:m.speed,tier:m.tier}:{}});
}
const ARMOR_SLOTS=Object.freeze(['helmet','chest','boots']);
// 갑옷은 투구·흉갑·장화 세 부위. 부위 값은 정수 단위이고 부위 가중치는 투구 1 / 흉갑 3 / 장화 1이다.
// 옛 각반 몫(1)을 몸통을 덮는 흉갑에 합쳐 세트 합(가중치 5)과 세트 방어력(가죽 25 · 철 50 · 다이아몬드 75)을 유지한다.
for(const [mat,name,defense,weight]of [['leather','가죽',5,2],['iron','철',10,5],['diamond','다이아몬드',15,4]])
 for(const [part,pn,k]of [['helmet','투구',1],['chest','흉갑',3],['boots','장화',1]])
  defineItem(mat+'_'+part,name+' '+pn,'♜',{stack:1,armor:part,defense:defense*k,weight:weight*k,material:mat});
// Item ids removed in 0.31.0 and 0.33.0; Simulation.retireEquipment drops them from older saves.
// 0.33.0 retired the warden summoning sigil together with the altar summon (bosses now live in structures).
const RETIRED_ITEM_IDS=new Set(['arrow','sigil',
 ...['wood','stone','iron','diamond','gold'].flatMap(m=>['shovel','greatsword','dagger','bow','shield'].map(t=>m+'_'+t)),
 ...['pick','sword','spear','axe','helmet','chest','boots'].map(t=>'gold_'+t),
 ...['leather','iron','gold','diamond'].map(m=>m+'_legs')]);
const RECIPES=[];
function recipe(id,out,count,pattern,keys,station=2,unlock=null){RECIPES.push({id,out,count,pattern,keys,station,unlock});}
recipe('planks','planks',4,['L'],{L:'log'});recipe('sticks','stick',4,['P','P'],{P:'planks'});recipe('workbench','workbench',1,['PP','PP'],{P:'planks'});
recipe('bucket','bucket',1,['I I',' I '],{I:'iron'},3);recipe('furnace','furnace',1,['CCC','C C','CCC'],{C:'cobble'},3);recipe('torch','torch',4,['C','S'],{C:['coal','charcoal'],S:'stick'});
recipe('fiber','fiber',4,['LL'],{L:'leaves'});
// Circular resources (0.35.1, doc §3.5 ① and §3.3): every gear recipe of a later realm's tier takes one resource of the
// realm before it (REALM_ORDER, ITEM_REALMS). 철(동굴 단계): tools and weapons keep the 초원 wood stick, armor gets a 초원
// fibre lining. 다이아몬드(균류 숲 단계): the handle is a 동굴 iron ingot instead of a stick, the chestplate and boots take
// one iron ingot, the helmet takes the 동굴 boss's 금광석 왕관 (so the boss must fall before the fungal tier).
for(const [mat,ingredient,handle]of [['wood','planks','stick'],['stone','cobble','stick'],['iron','iron','stick'],['diamond','diamond','iron']]){
 const keys={M:ingredient,S:handle};
 recipe(mat+'_pick',mat+'_pick',1,['MMM',' S ',' S '],keys,3);
 recipe(mat+'_sword',mat+'_sword',1,['M','M','S'],keys,3);
 recipe(mat+'_spear',mat+'_spear',1,['  M',' S ','S  '],keys,3);recipe(mat+'_axe',mat+'_axe',1,['MM','MS',' S'],keys,3);
}
recipe('leather_helmet','leather_helmet',1,['MMM','M M'],{M:'leather'},3);recipe('leather_chest','leather_chest',1,['M M','MMM','MMM'],{M:'leather'},3);recipe('leather_boots','leather_boots',1,['M M','M M'],{M:'leather'},3);
recipe('iron_helmet','iron_helmet',1,['MMM','MFM'],{M:'iron',F:'fiber'},3);recipe('iron_chest','iron_chest',1,['MFM','MMM','MMM'],{M:'iron',F:'fiber'},3);recipe('iron_boots','iron_boots',1,['MFM','M M'],{M:'iron',F:'fiber'},3);
recipe('diamond_helmet','diamond_helmet',1,['MMM','MCM'],{M:'diamond',C:'rockChickCrown'},3);recipe('diamond_chest','diamond_chest',1,['MIM','MMM','MMM'],{M:'diamond',I:'iron'},3);recipe('diamond_boots','diamond_boots',1,['MIM','M M'],{M:'diamond',I:'iron'},3);
recipe('stemPlanks','planks',4,['S'],{S:'stem'});
recipe('healingSalve','healingSalve',1,['FF','CS'],{F:'food',C:'crystalShard',S:'fiber'},2);
recipe('trophy','trophy',1,[' D ','IHI','PPP'],{D:'diamond',I:'iron',H:'heart',P:'planks'},3,'boss');
// Ranch (0.34.0), Minecraft-shaped: fence = planks/stick/planks ×2 rows → 3, gate = stick/planks/stick ×2 rows, chest = planks ring.
// Merge potion = 공명 수정 조각 over 열매 (crystal + fruit, the healing salve's ingredients without the fiber) → 1 in the 2×2 grid.
recipe('fence','fence',3,['PSP','PSP'],{P:'planks',S:'stick'},3);recipe('fenceGate','fenceGate',1,['SPS','SPS'],{P:'planks',S:'stick'},3);
recipe('storageChest','storageChest',1,['PPP','P P','PPP'],{P:'planks'},3);recipe('mergePotion','mergePotion',1,['C','F'],{C:'crystalShard',F:'food'},2);
// Equipment progression (0.35.1, doc §3.3 draft numbers). A slot's tier is a material step (GEAR_TIERS); a realm asks for
// REALMS[realm].gear. Factors are integer per-mille (1000 = ×1):
//  below the realm's tier  곡괭이 → gathering ×0.35, 무기 → attack ×0.4, 방어구 → damage taken ×2 and the realm hazard
//                          (동굴 추위 · 균류 숲 포자 독: −1 HP every second, never below 1 HP, so it presses but never kills);
//  at or above it          ×1, and diamond (bonusTier, 기획의 청수정) gives the bonus column — gathering ×1.5, attack ×1.6,
//                          taken ×0.6 — wherever the realm asks for less than diamond (초원, 동굴; in 균류 숲 it is the norm).
const GEAR_TIERS=Object.freeze({leather:1,wood:1,stone:2,iron:3,diamond:4});
const GEAR_TIER_NAMES=Object.freeze(['맨손','나무','돌','철','다이아몬드']);
const GEAR_RULES=Object.freeze({
 slots:Object.freeze({
  pick:Object.freeze({name:'곡괭이',icon:'⛏',effect:'gather',label:'채집'}),
  weapon:Object.freeze({name:'무기',icon:'⚔',effect:'attack',label:'공격'}),
  armor:Object.freeze({name:'방어구',icon:'🛡',effect:'taken',label:'받는 피해'})}),
 below:Object.freeze({gather:350,attack:400,taken:2000}),
 bonus:Object.freeze({gather:1500,attack:1600,taken:600}),bonusTier:4,
 hazards:Object.freeze({
  cold:Object.freeze({name:'추위',everyTicks:ticksForMs(1000),damage:1,floor:1}),
  spore:Object.freeze({name:'포자 독',everyTicks:ticksForMs(1000),damage:1,floor:1})})
});
// Where a recipe ingredient comes from, for the circular-resource rule and the recipe card: wood sticks and leaf fibre are
// 초원 resources, iron ingots and the cave boss's crown are 동굴 resources. MATERIAL_REALMS: the realm a gear tier is for.
const ITEM_REALMS=Object.freeze({stick:'grassland',fiber:'grassland',iron:'cave',rockChickCrown:'cave'});
const MATERIAL_REALMS=Object.freeze({wood:'grassland',stone:'grassland',leather:'grassland',iron:'cave',diamond:'fungal'});
// The previous-realm ingredients of a recipe: [{key, item, realm}] (empty for 초원 tiers and non-gear recipes).
function recipePriorIngredients(r){const realm=MATERIAL_REALMS[ITEMS[r.out]?.material],i=REALM_ORDER.indexOf(realm);if(i<1)return[];const prior=REALM_ORDER[i-1];
 return Object.entries(r.keys).flatMap(([key,val])=>(Array.isArray(val)?val:[val]).filter(id=>ITEM_REALMS[id]===prior).map(item=>({key,item,realm:prior})));}
const FUELS={coal:48000,charcoal:48000,log:9000,planks:9000,stick:3000};
const SMELT={rawIron:{out:'iron',ms:6000},rawGold:{out:'gold',ms:6000},log:{out:'charcoal',ms:6000},cobble:{out:'stone',ms:6000}};
const RPG_SKILLS=Object.freeze({vitality:Object.freeze({name:'생명력',description:'최대 생명력 +25'}),might:Object.freeze({name:'공격력',description:'모든 공격 피해 +5'})});
const QUESTS=Object.freeze([
 Object.freeze({id:'log',title:'첫 원목',hint:'나무 줄기를 채집해 시작하세요.'}),
 Object.freeze({id:'stone_pick',title:'석기 도구',hint:'돌 곡괭이를 제작하세요.'}),
 Object.freeze({id:'crystalShard',title:'동굴 속 푸른빛',hint:'Y -10 아래 공명 수정을 채광하세요.'}),
 Object.freeze({id:'chests',title:'고대의 보물',hint:'폐광 또는 유적의 보물함을 F로 여세요.'}),
 Object.freeze({id:'clearedDungeons',title:'유적 정화',hint:'고대 유적의 적대 생물을 모두 쓰러뜨리세요.'}),
 Object.freeze({id:'boss',title:'보스 구조물',hint:'초원의 꽃 고리, 균류 숲의 버섯 고리, 동굴 유적 최심부에서 보스를 쓰러뜨리세요.'}),
 Object.freeze({id:'hatched',title:'첫 부화',hint:'보스가 남긴 알을 땅에 놓고 부화를 기다리세요.'}),
 Object.freeze({id:'grown',title:'목장의 성체',hint:'울타리 안에 먹이를 던져(G) 아기에게 세 번 먹이세요.'}),
 Object.freeze({id:'merged',title:'첫 합성',hint:'같은 종·같은 등급 성체 둘에게 합성 물약을 던지세요.'}),
 Object.freeze({id:'labor',title:'상자 노동',hint:'울타리 안에 보관 상자와 적성 블록을 두면 성체가 캐서 상자에 넣습니다.'})
]);

