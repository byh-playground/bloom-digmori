'use strict';
// Deterministic contact preview of the new species rig: every species × view × anim, grades, baby/adult/boss, expressions, eggs.
// Draws with the production UnitRig onto 2D canvases (no simulation, no three.js, no storage).
(async()=>{
const params=new URLSearchParams(location.search),ui=Object.fromEntries(['species','bg','play','out','error'].map(id=>[id,document.getElementById(id)]));
const status=window.unitPreview={ready:false,errors:[],cells:0,species:{},faces:{},anims:{}};
const fail=e=>{status.errors.push(String(e?.stack||e));ui.error.style.display='block';ui.error.textContent=status.errors.join('\n\n');};
addEventListener('error',e=>fail(e.error||e.message));
const NAMES={root:'뿌리','rock-chick':'바위 병아리','mushroom-snail':'버섯 달팽이'};
// Key frame shown for one-shot anims in the grid (the impact / most readable moment); loops use a fixed time.
const KEY={attack:.4,hurt:.3,slam:.66,hide:.5,headbutt:.5,spore:.55},LOOP={idle:.4,walk:.1,sleep:.5};
const VIEWS=[['front',false],['side',false],['side',true],['back',false]];
let rigs,collecting=false,clock=0,playing=params.get('play')==='1',draws=[];
ui.bg.value=['light','dark','green'].includes(params.get('bg'))?params.get('bg'):'light';ui.species.value=params.get('species')||'';
document.body.className=ui.bg.value;ui.play.textContent=playing?'정지':'재생';
ui.bg.onchange=()=>{document.body.className=ui.bg.value;};ui.species.onchange=()=>build();ui.play.onclick=()=>{playing=!playing;ui.play.textContent=playing?'정지':'재생';if(!playing){clock=0;redraw();}};
// One canvas cell. `looks` = [{look, x (fraction of width), scale}] drawn on a shared ground line; the stage scale (baby .55, boss ×3) applies on top, as the world quad does.
function cell(parent,label,w,h,looks,ground=h-14){
 const box=document.createElement('div'),c=document.createElement('canvas'),dpr=Math.min(2,devicePixelRatio||1);box.className='cell';c.width=w*dpr;c.height=h*dpr;c.style.width=w+'px';c.style.height=h+'px';
 const s=document.createElement('span');s.textContent=label;box.append(c,s);parent.append(box);
 const draw=()=>{const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,c.width,c.height);ctx.strokeStyle='rgba(120,120,120,.35)';ctx.beginPath();ctx.moveTo(0,ground*dpr);ctx.lineTo(c.width,ground*dpr);ctx.stroke();
  for(const item of looks){const look={...item.look};if(clock>0){if(UNIT_LOOPS.includes(look.anim))look.seconds=(look.seconds||0)+clock;else look.progress=(clock/1.4)%1;}
   const info=rigs[look.species].draw(ctx,look,{x:item.x*c.width,y:ground*dpr,scale:item.scale*UNIT_STAGES[look.stage].scale*dpr});status.cells++;if(!collecting)continue;
   (status.species[look.species]||=new Set()).add(info.view);if(info.face)(status.faces[look.species]||=new Set()).add(info.face);(status.anims[look.species]||=new Set()).add(look.anim);}};
 draws.push(draw);draw();return box;}
const head=(tag,text,parent)=>{const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;};
const row=parent=>{const r=document.createElement('div');r.className='row';parent.append(r);return r;};
const look=(species,anim,extra={})=>({species,anim,view:'front',flip:false,grade:4,stage:'adult',progress:KEY[anim]??0,seconds:LOOP[anim]??0,...extra});
// Grid cells: 1 px per rig unit (origin.scale = 1/1.6).
const U1=1/UNIT_VIEW.pixelsPerUnit;
function build(){
 collecting=true;ui.out.textContent='';draws=[];status.cells=0;status.species={};status.faces={};status.anims={};
 for(const species of UNIT_SPECIES){if(ui.species.value&&ui.species.value!==species)continue;
  const sec=document.createElement('section');sec.dataset.species=species;ui.out.append(sec);head('h2',NAMES[species]+' · '+species,sec);
  head('h3','시점 × 동작 (등급 4, 성체) — 열: '+UNIT_ANIMS[species].join(' · '),sec);
  for(const [view,flip]of VIEWS){const r=row(sec);for(const anim of UNIT_ANIMS[species])cell(r,view+(flip?' ↔':'')+' · '+anim,180,250,[{look:look(species,anim,{view,flip}),x:.5,scale:U1}]);}
  head('h3','성장: 아기 · 등급 1 · 2 · 3 · 4 · 보스(×3 + 모자) — 같은 축척',sec);
  for(const [view,flip]of VIEWS.filter(([v,f])=>!f)){const r=row(sec),S=.55/UNIT_VIEW.pixelsPerUnit;
   const items=[{stage:'baby',grade:1,x:.05},{grade:1,x:.13},{grade:2,x:.23},{grade:3,x:.33},{grade:4,x:.43},{stage:'boss',grade:4,x:.72}];
   cell(r,view+' · 아기 · g1 · g2 · g3 · g4 · 보스',1100,330,items.map(i=>({look:look(species,'idle',{view,grade:i.grade,stage:i.stage||'adult',seconds:0}),x:i.x,scale:S})));}
  head('h3','등급 1..4 확대 (정면 · 옆면) 와 아기 · 보스 단독',sec);
  {const r=row(sec);for(const view of ['front','side'])for(let g=1;g<=4;g++)cell(r,view+' · g'+g,180,250,[{look:look(species,'idle',{view,grade:g,seconds:0}),x:.5,scale:U1}]);
   for(const view of ['front','side','back'])cell(r,view+' · 아기',140,140,[{look:look(species,'idle',{view,stage:'baby',grade:1,seconds:0}),x:.5,scale:U1}]);
   for(const view of ['front','side','back'])cell(r,view+' · 보스',400,500,[{look:look(species,'idle',{view,stage:'boss',seconds:0}),x:.5,scale:U1*.8}]);}
  head('h3','표정 교체 (정면 · 옆면)',sec);
  {const r=row(sec);for(const view of ['front','side'])for(const face of UNIT_EXPRESSIONS)cell(r,view+' · '+face,150,200,[{look:look(species,'idle',{view,face,seconds:0}),x:.5,scale:U1*.8}]);}
  head('h3','동작 타임라인 (옆면, 진행 0 · .15 · .3 · .45 · .6 · .8)',sec);
  for(const anim of UNIT_ANIMS[species]){const r=row(sec);for(const t of [0,.15,.3,.45,.6,.8]){const l=UNIT_LOOPS.includes(anim)?{seconds:t}:{progress:t};cell(r,anim+' '+t,150,210,[{look:look(species,anim,{view:'side',...l}),x:.5,scale:U1*.8}]);}}
  head('h3','알 (아이템·블록 아이콘용 원본)',sec);
  {const r=row(sec),c=document.createElement('canvas'),rig=rigs[species],m=rig.parts.egg,im=rig.images.egg;c.width=m.size[0];c.height=m.size[1];c.getContext('2d').drawImage(im,0,0);const box=document.createElement('div');box.className='cell';const s=document.createElement('span');s.textContent='egg.png '+m.size.join('×');box.append(c,s);r.append(box);}
 }
 for(const k of ['species','faces','anims'])status[k]=Object.fromEntries(Object.entries(status[k]).map(([s,v])=>[s,[...v].sort()]));
 collecting=false;
}
function redraw(){status.cells=0;for(const d of draws)d();}
try{rigs=await UnitRig.loadAll('../../'+DEPENDENCIES.unitArt.base);build();status.ready=true;}catch(e){fail(e);status.ready=true;}
let last=performance.now();const tick=now=>{const dt=Math.min(.05,(now-last)/1000);last=now;if(playing&&rigs){clock+=dt;try{redraw();}catch(e){fail(e);playing=false;}}requestAnimationFrame(tick);};requestAnimationFrame(tick);
})();
