const BIOMES=Object.freeze({
 meadow:{name:'꽃잎 초원',surface:'grass',soil:'dirt',resources:{ore:'coalOre',bonus:0},vegetation:{density:18,canopy:'leaves',roots:['grass'],minHeight:3,maxHeight:15,maxSlope:1,maxExposure:2.5,minWet:-.8},decorations:{caveBloom:.035},wildlife:['shell','leaf']},
 forest:{name:'포자 수림',surface:'grass',soil:'dirt',resources:{ore:'coalOre',bonus:.025},vegetation:{density:82,canopy:'leaves',roots:['grass'],minHeight:3,maxHeight:16,maxSlope:1,maxExposure:2,minWet:-.2},decorations:{caveBloom:.055},wildlife:['shell','leaf']},
 fungal:{name:'균사 정원',surface:'mycelium',soil:'dirt',resources:{ore:'ironOre',bonus:.015},vegetation:{density:64,canopy:'cap',roots:['mycelium'],minHeight:3,maxHeight:15,maxSlope:1,maxExposure:2.5,minWet:-.2},decorations:{caveBloom:.08},wildlife:['leaf']},
 dry:{name:'모래 구릉',surface:'sand',soil:'sand',resources:{ore:'goldOre',bonus:.025},vegetation:{density:0,canopy:'leaves',roots:['grass'],minHeight:3,maxHeight:12,maxSlope:0,maxExposure:1,minWet:.15},decorations:{caveBloom:.005},wildlife:['shell']},
 cold:{name:'서리 고원',surface:'snow',soil:'dirt',resources:{ore:'ironOre',bonus:.025},vegetation:{density:24,canopy:'leaves',roots:['snow'],minHeight:3,maxHeight:17,maxSlope:1,maxExposure:2.5,maxHeat:.15},decorations:{caveBloom:.035},wildlife:['shell','leaf']}
});
const BLOCKS=[
 {id:'air',name:'공기',color:'#ffffff',solid:false},
 {id:'grass',name:'풀흙',color:'#80b966',hardness:650,drop:'dirt',tool:'shovel',tier:0},
 {id:'dirt',name:'흙',color:'#aa8056',hardness:650,tool:'shovel',tier:0},
 {id:'stone',name:'돌',color:'#93a29b',hardness:1400,drop:'cobble',tool:'pick',tier:1},
 {id:'log',name:'원목',color:'#9e724d',hardness:1500,tool:'axe',tier:0},
 {id:'leaves',name:'잎',color:'#69af67',hardness:250,drop:'seed',tool:'none',tier:0},
 {id:'sand',name:'모래',color:'#edcf8b',hardness:550,tool:'shovel',tier:0},
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
 {id:'altar',name:'오래된 꽃 제단',color:'#bd91bd',hardness:Infinity,tier:99,station:'altar',light:8},
 {id:'cap',name:'버섯 갓',color:'#c184a9',hardness:450,drop:'food',tier:0},
 {id:'stem',name:'버섯 줄기',color:'#e8d9b8',hardness:900,drop:'log',tool:'axe',tier:0},
 {id:'trophy',name:'화원 수호의 증표',color:'#eec565',hardness:800,tier:0,light:12},
 {id:'crystalBloom',name:'공명 수정',color:'#8eddeb',hardness:1400,tool:'pick',tier:2,drop:'crystalShard',light:9},
 {id:'snow',name:'눈덮인 흙',color:'#dae9ed',hardness:650,drop:'dirt',tool:'shovel',tier:0},
 {id:'mycelium',name:'균사 흙',color:'#b79bc4',hardness:650,drop:'dirt',tool:'shovel',tier:0},
 {id:'lootChest',name:'봉인된 보물함',color:'#bf935d',hardness:Infinity,tier:99,station:'loot'}
];
const BID=Object.fromEntries(BLOCKS.map((b,i)=>[b.id,i]));
const RESOURCE_DEFS=Object.freeze([
 Object.freeze({id:'coalOre',name:'석탄',min:-4,max:24,peak:10,tool:'나무 곡괭이',hint:'얕은 동굴·바위 능선',salt:12,scale:.20,threshold:.43,peakBonus:.17}),
 Object.freeze({id:'ironOre',name:'철',min:-18,max:16,peak:2,tool:'돌 곡괭이',hint:'동굴·폐광 주변',salt:33,scale:.17,threshold:.46,peakBonus:.18}),
 Object.freeze({id:'goldOre',name:'금',min:-28,max:-4,peak:-16,tool:'철 곡괭이',hint:'깊은 동굴·던전 벽',salt:63,scale:.15,threshold:.50,peakBonus:.16}),
 Object.freeze({id:'diamondOre',name:'다이아몬드',min:-31,max:-15,peak:-24,tool:'철 곡괭이',hint:'최심부·고대 화원 유적',salt:47,scale:.18,threshold:.56,peakBonus:.14})
]);
const RESOURCE_BY_ID=Object.freeze(Object.fromEntries(RESOURCE_DEFS.map(def=>[def.id,def])));
const resourceRangeText=id=>{const r=RESOURCE_BY_ID[id];return r?`${r.name} Y ${r.min}~${r.max}`:'';};
// 무기 종류가 기본 성능을, 재료 등급이 공격력(+5 단위)을 결정한다.
// 채광 속도와 무게는 피해 수치와 분리한다.
const MATERIALS={wood:{name:'나무',tier:1,damageBonus:-10,speed:2,color:'#cfa876'},stone:{name:'돌',tier:2,damageBonus:-5,speed:4,color:'#a3adae'},iron:{name:'철',tier:3,damageBonus:0,speed:6,color:'#dde6e6'},diamond:{name:'다이아몬드',tier:4,damageBonus:5,speed:8,color:'#78ded9'},gold:{name:'금',tier:1,damageBonus:-5,speed:12,color:'#eed47b'}};
const WEAPONS={
 sword:{name:'검',icon:'⚔',damage:25,poise:20,reach:3.3,arc:1.65,cost:15,weight:5,wind:250,active:125,recovery:375,combo:3,charge:[550,1200],skill:'thrust',secondary:'guard',guard:.55},
 greatsword:{name:'대검',icon:'⚔',damage:40,poise:50,reach:3.7,arc:1.8,cost:25,weight:11,wind:550,active:150,recovery:600,combo:3,charge:[900,1800],skill:'slam',secondary:'guard',guard:.7},
 spear:{name:'창',icon:'↟',damage:25,poise:20,reach:4.2,arc:.3,cost:15,weight:6,wind:300,active:100,recovery:450,combo:3,charge:[650,1300],skill:'lunge',secondary:'guard',guard:.48},
 axe:{name:'도끼',icon:'🪓',damage:30,poise:30,reach:3.2,arc:1.4,cost:20,weight:8,wind:425,active:125,recovery:450,combo:3,charge:[750,1500],skill:'cleave',secondary:'spin',guard:.25},
 dagger:{name:'단검',icon:'†',damage:15,poise:10,reach:3.0,arc:1.25,cost:10,weight:2,wind:125,active:75,recovery:250,combo:3,charge:[400,800],skill:'double',secondary:'guard',guard:.3},
 bow:{name:'활',icon:'🏹',damage:25,poise:10,reach:35,arc:0,cost:15,weight:3,wind:175,active:50,recovery:675,combo:2,charge:[700,1400],skill:'quickshot',secondary:'precision',guard:0},
 shield:{name:'방패',icon:'⛨',damage:15,poise:30,reach:3.0,arc:1.2,cost:15,weight:8,wind:250,active:100,recovery:450,combo:2,charge:[550,1100],skill:'bash',secondary:'guard',guard:.92}
};
const ITEMS={};
function defineItem(id,name,icon,opts={}){ITEMS[id]={id,name,icon,stack:64,...opts};}
for(const b of BLOCKS)if(!['air','grass','bedrock','altar','coalOre','ironOre','goldOre','diamondOre','lootChest'].includes(b.id))defineItem(b.id,b.name,({log:'▥',leaves:'✿',stone:'◆',dirt:'■',planks:'▤',workbench:'▦',furnace:'▣',torch:'♨',cap:'🍄',stem:'▥',trophy:'✧'})[b.id]||'◆',{block:BID[b.id]});
for(const [id,name,icon]of [['stick','나뭇가지','╱'],['coal','석탄','●'],['charcoal','목탄','●'],['rawIron','철 원석','◆'],['iron','철 주괴','▰'],['rawGold','금 원석','◆'],['gold','금 주괴','▰'],['diamond','다이아몬드','💎'],['seed','씨앗','🌰'],['food','열매','🍓'],['fiber','질긴 섬유','〰'],['leather','가죽','▱'],['arrow','화살','➶'],['sigil','수호자 소환 문양','✵'],['heart','화원의 심장','✺'],['bucket','빈 물통','▣'],['waterBucket','물통','▣'],['crystalShard','공명 수정 조각','◇'],['healingSalve','치유 연고','✚'],['relic','고대의 유물','✧']])defineItem(id,name,icon,{...(['bucket','waterBucket'].includes(id)?{stack:1}:{})});
for(const [mat,m]of Object.entries(MATERIALS)){
 for(const type of ['pick','shovel'])defineItem(mat+'_'+type,m.name+' '+(type==='pick'?'곡괭이':'삽'),type==='pick'?'⛏':'⚒',{stack:1,material:mat,tool:type,tier:m.tier,miningSpeed:m.speed,weight:type==='pick'?4:3});
 for(const [type,w]of Object.entries(WEAPONS)){
  if((type==='bow'||type==='shield')&&mat!=='wood'&&mat!=='iron')continue;
  defineItem(mat+'_'+type,m.name+' '+w.name,w.icon,{stack:1,material:mat,weapon:type,weight:w.weight,...type==='axe'?{tool:'axe',miningSpeed:m.speed,tier:m.tier}:{}});
 }
}
// 부위별 값은 정수 단위: 부위 가중치는 투구 1 / 흉갑 2 / 각반 1 / 신발 1.
// 같은 세트의 방어력·강인도 총합을 바로 계산할 수 있다.
for(const [mat,name,defense,weight,poise]of [['leather','가죽',5,2,5],['iron','철',10,5,10],['gold','금',5,4,5],['diamond','다이아몬드',15,4,15]])
 for(const [part,pn,k]of [['helmet','투구',1],['chest','흉갑',2],['legs','각반',1],['boots','장화',1]])
  defineItem(mat+'_'+part,name+' '+pn,'♜',{stack:1,armor:part,defense:defense*k,weight:weight*k,poise:poise*k,material:mat});
const RECIPES=[];
function recipe(id,out,count,pattern,keys,station=2,unlock=null){RECIPES.push({id,out,count,pattern,keys,station,unlock});}
recipe('planks','planks',4,['L'],{L:'log'});recipe('sticks','stick',4,['P','P'],{P:'planks'});recipe('workbench','workbench',1,['PP','PP'],{P:'planks'});
recipe('bucket','bucket',1,['I I',' I '],{I:'iron'},3);recipe('furnace','furnace',1,['CCC','C C','CCC'],{C:'cobble'},3);recipe('torch','torch',4,['C','S'],{C:['coal','charcoal'],S:'stick'});
recipe('arrows','arrow',8,['C','S','F'],{C:'cobble',S:'stick',F:'fiber'},3);recipe('fiber','fiber',4,['LL'],{L:'leaves'});
for(const [mat,ingredient]of [['wood','planks'],['stone','cobble'],['iron','iron'],['diamond','diamond'],['gold','gold']]){
 const keys={M:ingredient,S:'stick',F:'fiber'};
 recipe(mat+'_pick',mat+'_pick',1,['MMM',' S ',' S '],keys,3);recipe(mat+'_shovel',mat+'_shovel',1,['M','S','S'],keys,3);
 recipe(mat+'_sword',mat+'_sword',1,['M','M','S'],keys,3);recipe(mat+'_greatsword',mat+'_greatsword',1,[' MM',' MM','S  '],keys,3);
 recipe(mat+'_spear',mat+'_spear',1,['  M',' S ','S  '],keys,3);recipe(mat+'_axe',mat+'_axe',1,['MM','MS',' S'],keys,3);
 recipe(mat+'_dagger',mat+'_dagger',1,['M','S'],keys,2);
 if(mat==='wood'||mat==='iron'){
  recipe(mat+'_bow',mat+'_bow',1,[' MF','S F',' MF'],keys,3);
  recipe(mat+'_shield',mat+'_shield',1,['MMM','MMM',' M '],keys,3);
 }
}
for(const mat of ['leather','iron','gold','diamond']){
 recipe(mat+'_helmet',mat+'_helmet',1,['MMM','M M'],{M:mat},3);recipe(mat+'_chest',mat+'_chest',1,['M M','MMM','MMM'],{M:mat},3);
 recipe(mat+'_legs',mat+'_legs',1,['MMM','M M','M M'],{M:mat},3);recipe(mat+'_boots',mat+'_boots',1,['M M','M M'],{M:mat},3);
}
recipe('healingSalve','healingSalve',1,['FF','CS'],{F:'food',C:'crystalShard',S:'fiber'},2);
recipe('sigil','sigil',1,['SIS','IDI','SIS'],{S:'seed',I:'iron',D:'diamond'},3);
recipe('trophy','trophy',1,[' D ','IHI','PPP'],{D:'diamond',I:'iron',H:'heart',P:'planks'},3,'boss');
const FUELS={coal:48000,charcoal:48000,log:9000,planks:9000,stick:3000};
const SMELT={rawIron:{out:'iron',ms:6000},rawGold:{out:'gold',ms:6000},log:{out:'charcoal',ms:6000},cobble:{out:'stone',ms:6000}};
const ENEMIES={beetle:{name:'가시갑충',kind:'bug',hp:100,poise:50,speed:2.6,damage:15,poiseDamage:10,reach:1.9,wind:700,active:125,recovery:900,loot:[['fiber',2],['seed',2]],tint:[.94,.7,.57,1],size:1.0},
 crystalWisp:{name:'수정 정령',kind:'fungus',hp:75,poise:25,speed:3,damage:20,poiseDamage:15,reach:15,wind:650,active:100,recovery:1100,loot:[['crystalShard',2]],tint:[.55,.89,1,1],size:.95,ranged:true},
 cryptKnight:{name:'유적의 철갑 기사',kind:'bug',hp:175,poise:100,speed:2.3,damage:30,poiseDamage:30,reach:2.7,wind:850,active:175,recovery:1000,loot:[['iron',2],['crystalShard',1]],tint:[.78,.73,.96,1],size:1.35},
 spore:{name:'떠도는 포자사수',kind:'fungus',hp:75,poise:25,speed:2,damage:15,poiseDamage:10,reach:16,wind:900,active:100,recovery:1500,loot:[['food',2],['fiber',1]],tint:[.82,.72,.98,1],size:1.0,ranged:true},
 guardian:{name:'철갑 경비병',kind:'bug',hp:200,poise:100,speed:2.1,damage:25,poiseDamage:25,reach:2.6,wind:900,active:175,recovery:1000,loot:[['iron',1],['seed',3]],tint:[.7,.86,.77,1],size:1.3}};
// The altar guardian is a special encounter, not part of the wild species roster.
const BOSS=Object.freeze({name:'잠든 화원의 수호자',kind:'fungus',hp:1000,poise:250,speed:2.5,damage:35,poiseDamage:40,reach:4.3,wind:1000,active:200,recovery:1400,loot:[['heart',1],['diamond',3]],tint:[1,.69,.68,1],size:2.8});


const RPG_SKILLS=Object.freeze({vitality:Object.freeze({name:'생명력',description:'최대 생명력 +25'}),might:Object.freeze({name:'공격력',description:'모든 공격 피해 +5'}),endurance:Object.freeze({name:'지구력',description:'최대 기력 +10'})});
const QUESTS=Object.freeze([
 Object.freeze({id:'log',title:'첫 원목',hint:'나무 줄기를 채집해 시작하세요.'}),
 Object.freeze({id:'stone_pick',title:'석기 도구',hint:'돌 곡괭이를 제작하세요.'}),
 Object.freeze({id:'crystalShard',title:'동굴 속 푸른빛',hint:'Y -10 아래 공명 수정을 채광하세요.'}),
 Object.freeze({id:'chests',title:'고대의 보물',hint:'폐광 또는 유적의 보물함을 F로 여세요.'}),
 Object.freeze({id:'clearedDungeons',title:'유적 정화',hint:'고대 유적의 적대 생물을 모두 쓰러뜨리세요.'}),
 Object.freeze({id:'boss',title:'잠든 화원의 수호자',hint:'꽃 제단에서 수호자 보스에 도전하세요.'})
]);
