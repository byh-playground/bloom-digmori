'use strict';
/* Cut-out rig for the three companion species: 뿌리 (root), 바위 병아리 (rock-chick), 버섯 달팽이 (mushroom-snail).
 * Same path as the player rig: authored part PNGs from src/assets/units/<species>/ are assembled at runtime on a 2D canvas
 * per unit and shown in the three.js world as a camera-facing quad (RIG_GLSL from player-rig.js: depth tested, tint, white flash).
 * Presentation only: never reads or writes the simulation. Since 0.33.0 every wild, boss and owned unit and every placed
 * egg is drawn through UnitRigRenderer.queue (see unit-looks.js for the sim state → look mapping).
 * Rig units: ground at y=0, y up, x right; the art faces screen-left (side view), `flip` mirrors it. Adult body ≈ 100 units. */
const UNIT_SPECIES=Object.freeze(['root','rock-chick','mushroom-snail']);
const UNIT_VIEWS=Object.freeze(['front','side','back']);
// Expression parts authored for every species (front and side; the back view shows no face).
const UNIT_EXPRESSIONS=Object.freeze(['neutral','happy','surprised','hurt','attack','sleep']);
// idle/walk/sleep loop on look.seconds; every other anim is one shot on look.progress 0..1.
const UNIT_ANIMS=Object.freeze({
 root:Object.freeze(['idle','walk','attack','hurt','sleep','slam']),
 'rock-chick':Object.freeze(['idle','walk','attack','hurt','sleep','hide','headbutt']),
 'mushroom-snail':Object.freeze(['idle','walk','attack','hurt','sleep','spore'])
});
const UNIT_LOOPS=Object.freeze(['idle','walk','sleep']);
// Walk styles named in each parts JSON: hop (뿌리), waddle (바위 병아리), slide (버섯 달팽이).
const UNIT_WALKS=Object.freeze(['hop','waddle','slide']);
// Growth stage: baby is the growth line's small round stage, boss is the adult ×3 plus a static hat (nothing else changes).
const UNIT_STAGES=Object.freeze({
 baby:Object.freeze({scale:.55,round:Object.freeze([1.08,.92]),face:1.18}),
 adult:Object.freeze({scale:1,round:Object.freeze([1,1]),face:1}),
 boss:Object.freeze({scale:3,round:Object.freeze([1,1]),face:1})
});
// Canvas: 512 px (1024 for bosses, so the ×3 quad keeps its texel density) with the ground row at 7/8 of the height.
// 1.6 canvas px per rig unit; one rig unit is .0092 m like the player rig, so an adult body is ≈ .92 m.
const UNIT_VIEW=Object.freeze({canvas:512,bossCanvas:1024,ground:448,pixelsPerUnit:1.6,metersPerUnit:.0092});
const unitClamp01=v=>v<0?0:v>1?1:v;
// Deterministic hash in [0,1) for effect particles (no Math.random: equal looks draw equal frames).
const unitHash=n=>{const s=Math.sin(n*12.9898+78.233)*43758.5453;return s-Math.floor(s)};
function loadUnitImage(url){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('동료 부품 이미지 로딩 실패: '+url));i.src=url})}
// Facing (world XZ) and camera yaw → view; the side drawing faces left, flip mirrors it. Same split as the player rig.
function unitRigView(facing,cameraYaw,lastFlip=false){
 const sx=facing.x*Math.cos(cameraYaw)-facing.z*Math.sin(cameraYaw),toward=facing.x*Math.sin(cameraYaw)+facing.z*Math.cos(cameraYaw);
 const view=Math.abs(sx)>=.5?'side':toward>0?'front':'back',flip=Math.abs(sx)>=.2?sx>0:lastFlip;
 return{view,flip:view==='side'&&flip,sideFlip:flip};
}
class UnitRig{
 static async load(base,species){
  if(!UNIT_SPECIES.includes(species))throw Error('알 수 없는 동료 종: '+species);
  const url=base+species+'/'+species+'-parts.json',response=await fetch(url);if(!response.ok)throw Error('동료 부품 정보 로딩 실패: '+species+' '+response.status);
  const meta=await response.json(),rig=new UnitRig(species,meta);
  await Promise.all(Object.keys(meta.parts).map(key=>loadUnitImage(base+species+'/'+key+'.png').then(img=>{rig.images[key]=img})));
  return rig;
 }
 static async loadAll(base){const rigs=await Promise.all(UNIT_SPECIES.map(s=>UnitRig.load(base,s)));return Object.freeze(Object.fromEntries(UNIT_SPECIES.map((s,i)=>[s,rigs[i]])));}
 constructor(species,meta){
  if(meta.species!==species)throw Error('동료 부품 정보의 종이 다릅니다: '+species);
  this.species=species;this.scale=meta.scale;this.parts=meta.parts;this.slots=meta.slots;this.ores=meta.ores||null;this.walk=meta.walk;this.images={};
  // Capabilities come from the authored parts: split egg shells can hide (껍질 쏙), a crown of leaves sways, a shell carries mushrooms.
  this.shells=!!this.slots.front.shellTop;this.leaves=!!this.slots.front.leaves;this.shell=!!this.slots.front.shell;
  if(!UNIT_WALKS.includes(this.walk))throw Error('동료 걷기 방식 누락: '+species);
  const need=[...UNIT_VIEWS.map(v=>'body_'+v),...['front','side'].flatMap(v=>UNIT_EXPRESSIONS.map(e=>'face_'+v+'_'+e)),...['front','side'].map(v=>'hat_'+v),'egg'];
  if(species==='root')need.push(...UNIT_VIEWS.flatMap(v=>[...[1,2,3,4].map(g=>'leaves_'+v+'_g'+g),'sprout_'+v,'hat_'+v]));
  if(species==='rock-chick')need.push(...UNIT_VIEWS.flatMap(v=>['shell_top_'+v,'shell_bottom_'+v,'hat_'+v]),...['front','side'].flatMap(v=>['peek','peek_hurt','peek_sleep'].map(e=>'face_'+v+'_'+e)),...['iron','crystal','copper','gold'].map(o=>'ore_'+o));
  if(species==='mushroom-snail')need.push(...UNIT_VIEWS.flatMap(v=>['shell_'+v,'hat_'+v]),...[1,2,3,4].map(g=>'shrooms_g'+g),'shrooms_side_g4','shrooms_back_g4');
  for(const key of need){const p=this.parts[key];if(!p||!Array.isArray(p.anchor)||typeof this.scale[p.group]!=='number')throw Error('동료 부품 정보 누락: '+species+' '+key);}
  for(const v of UNIT_VIEWS)if(!this.slots[v])throw Error('동료 부품 위치 누락: '+species+' '+v);
 }
 // Validated look → pose. Deterministic in (anim, progress, seconds): squash/stretch, bob, lean, forward lunge, expression.
 pose(look){
  if(!UNIT_ANIMS[this.species].includes(look.anim))throw Error('지원하지 않는 동료 동작: '+this.species+' '+look.anim);
  const t=look.seconds||0,q=unitClamp01(look.progress||0),A=look.anim,W=this.walk,E=rigEase;
  const p={fwd:0,bob:0,rot:0,sx:1,sy:1,sway:0,face:'neutral',shell:0,shellTilt:0,shellScale:1,fx:null,fxQ:0};
  if(A==='idle'){const s=Math.sin(t*3.2);p.sy=1+.025*s;p.sx=1-.018*s;p.sway=Math.sin(t*2.1)*.05;}
  else if(A==='walk'){
   if(W==='hop'){const c=t*9,h=Math.abs(Math.sin(c)),land=(1-h)**2;p.bob=h*9;p.sy=1-.08*land+.04*h;p.sx=1+.07*land-.02*h;p.rot=-.06;p.sway=-Math.cos(c)*.1;}
   else if(W==='waddle'){const c=t*10;p.rot=Math.sin(c)*.08;p.bob=Math.abs(Math.sin(c))*4;p.sway=Math.sin(c)*.05;p.shellTilt=-Math.sin(c)*.04;}
   else{const c=t*5,s=Math.sin(c);p.sx=1+.07*s;p.sy=1-.05*s;p.fwd=s*2;p.sway=Math.sin(c+1)*.06;}
  }
  else if(A==='sleep'){const s=Math.sin(t*1.6);p.sy=.95+.02*s;p.sx=1.03-.015*s;p.face='sleep';if(this.shells){p.shell=1;p.face='peek_sleep';}}
  else if(A==='attack'){
   // Wind-up lean back, quick lunge forward, recover. The strike lands at q≈.4.
   p.fwd=E(q,[[0,0],[.28,-8],[.4,22],[.55,18],[1,0]]);p.rot=E(q,[[0,0],[.28,.12],[.4,-.16],[.6,-.08],[1,0]]);
   p.sy=E(q,[[0,1],[.28,.9],[.4,1.06],[.6,1],[1,1]]);p.sx=E(q,[[0,1],[.28,1.08],[.4,.95],[.6,1],[1,1]]);p.bob=E(q,[[0,0],[.3,0],[.4,6],[.55,0]]);
   p.face=q<.06||q>.85?'neutral':'attack';
  }
  else if(A==='hurt'){
   const k=E(q,[[0,0],[.12,1],[.6,.6],[1,0]]);p.fwd=-12*k;p.rot=.18*k;p.sy=1-.12*k;p.sx=1+.08*k;p.face=q>.9?'neutral':'hurt';
   // 바위 병아리's 껍질 쏙: it snaps into its shell with only the (><) eyes showing.
   if(this.shells){p.shell=E(q,[[0,0],[.1,1],[.75,1],[1,0]]);p.face=p.shell>.5?'peek_hurt':'hurt';p.rot*=.4;}
  }
  else if(A==='slam'){
   // 뿌리 slam: crouch, hop, slam into the ground (dirt burst), settle. Face squints (><) on impact like the action sheet.
   p.sy=E(q,[[0,1],[.18,.78],[.3,1.14],[.46,1.08],[.55,.7],[.75,1.04],[.9,1]]);p.sx=E(q,[[0,1],[.18,1.16],[.3,.9],[.46,.94],[.55,1.28],[.75,.98],[.9,1]]);
   p.bob=E(q,[[0,0],[.18,0],[.34,46],[.44,40],[.53,0]]);p.face=q<.04?'neutral':q<.52?'attack':q<.82?'hurt':'neutral';p.fx='dirt';p.fxQ=(q-.53)/.45;
  }
  else if(A==='hide'){p.shell=E(q,[[0,0],[.15,1],[.85,1],[1,0]]);p.face=p.shell>.5?'peek':'surprised';p.bob=Math.sin(q*Math.PI*6)*(p.shell>.9?1:0);}
  else if(A==='headbutt'){
   // 바위 병아리 headbutt: lean back, dash head-first with the shell, impact burst, recover.
   p.fwd=E(q,[[0,0],[.25,-10],[.45,46],[.6,40],[1,0]]);p.rot=E(q,[[0,0],[.25,.18],[.42,-.3],[.6,-.2],[1,0]]);p.shellTilt=E(q,[[0,0],[.25,.1],[.42,-.12],[.7,0]]);
   p.sy=E(q,[[0,1],[.25,.88],[.42,1.04],[.5,.9],[.7,1]]);p.sx=E(q,[[0,1],[.25,1.1],[.42,.96],[.5,1.1],[.7,1]]);
   p.face=q<.05||q>.85?'neutral':'attack';p.fx=q<.45?'dust':'impact';p.fxQ=q<.45?(q-.25)/.2:(q-.45)/.3;
  }
  else if(A==='spore'){
   // 버섯 달팽이 spore burst: the shell swells, bursts a spore cloud, settles. Face squints (><) like the action sheet.
   p.shellScale=E(q,[[0,1],[.35,1.16],[.45,.94],[.65,1.02],[.8,1]]);p.sy=E(q,[[0,1],[.35,.92],[.45,1.06],[.7,1]]);p.sx=E(q,[[0,1],[.35,1.06],[.45,.97],[.7,1]]);
   p.face=q<.25||q>.8?'neutral':'hurt';p.fx='spore';p.fxQ=(q-.35)/.65;
  }
  // Expression swap: an explicit look.face replaces the anim's face (the chick keeps its peek eyes while hidden).
  if(look.face){if(!UNIT_EXPRESSIONS.includes(look.face))throw Error('지원하지 않는 동료 표정: '+look.face);if(!p.face.startsWith('peek'))p.face=look.face;}
  return p;
 }
 // look: {species, anim, view:'front'|'side'|'back', flip, progress 0..1, seconds, grade 1..4, stage:'baby'|'adult'|'boss', face?}
 // origin: {x, y (ground row), scale (canvas px per UNIT_VIEW px)}. Returns what was drawn, for diagnostics.
 draw(ctx,look,origin){
  if(look.species!==this.species)throw Error('동료 리그 종 불일치: '+look.species);
  if(!UNIT_VIEWS.includes(look.view))throw Error('지원하지 않는 동료 시점: '+look.view);
  const stage=UNIT_STAGES[look.stage||'adult'];if(!stage)throw Error('지원하지 않는 동료 성장 단계: '+look.stage);
  const grade=look.grade??1;if(!Number.isInteger(grade)||grade<1||grade>4)throw Error('동료 등급은 1..4입니다: '+grade);
  const p=this.pose(look),view=look.view,U=UNIT_VIEW.pixelsPerUnit*origin.scale,drawn=[],baby=look.stage==='baby',boss=look.stage==='boss';
  // Part with its anchor at rig (x,y); o.s scale, o.r rotation, o.sx/o.sy extra squash.
  const P=(key,x,y,o={})=>{const im=this.images[key],m=this.parts[key];if(!im)throw Error('동료 부품 없음: '+this.species+' '+key);const s=this.scale[m.group]*(o.s||1)*U;
   ctx.save();ctx.translate(x*U,-y*U);if(o.r)ctx.rotate(o.r);if(o.sx||o.sy)ctx.scale(o.sx||1,o.sy||1);ctx.drawImage(im,-m.anchor[0]*s,-m.anchor[1]*s,im.width*s,im.height*s);ctx.restore();drawn.push(key);};
  // Sub-frame (shell, leaves…) at rig (x,y) whose children use local rig coordinates.
  const frame=(x,y,o,fn)=>{ctx.save();ctx.translate(x*U,-y*U);if(o.r)ctx.rotate(o.r);if(o.s)ctx.scale(o.s,o.s);fn();ctx.restore();};
  const slot=this.slots[view],faceKey='face_'+view+'_'+p.face;
  ctx.save();ctx.translate(origin.x,origin.y);if(look.flip)ctx.scale(-1,1);
  this.effect(ctx,p,U,'back',view);
  // Forward motion: sideways in the side view, toward/away from the camera in front/back.
  const fwdX=view==='side'?-p.fwd:0,zoom=view==='front'?1+p.fwd*.004:view==='back'?1-p.fwd*.003:1;
  ctx.translate(fwdX*U,-p.bob*U);ctx.rotate(p.rot*(view==='side'?1:.35));ctx.scale(p.sx*zoom*stage.round[0],p.sy*zoom*stage.round[1]);
  const face=(at,dy=0)=>{if(view!=='back')P(faceKey,at[0],at[1]+dy,{s:stage.face});};
  if(this.leaves){
   // Leaves grow from the crown: grade 1 leaves, 2 bud, 3 flower, 4 two flowers (leaves sheet). Baby: its own sprout part.
   const [lx,ly]=slot.leaves;P(baby?'sprout_'+view:'leaves_'+view+'_g'+grade,lx,ly,{r:p.sway});
   P('body_'+view,0,0);face(slot.face);if(boss)P('hat_'+view,...slot.hat);
  }else if(this.shells){
   // 껍질 쏙: the body sinks, the top shell drops and the bottom shell rises until only a strip with the eyes shows.
   const c=p.shell,[tx,ty]=slot.shellTop,[bx,by]=slot.shellBottom;
   P('body_'+view,0,0,{sy:1-.18*c});face(slot.face,-c*4);P('shell_bottom_'+view,bx,by+c*4);
   frame(tx,ty-c*20,{r:p.shellTilt},()=>{P('shell_top_'+view,0,0);
    // Grade = ore count on the shell hat (2/3/5/7: iron, crystal, copper, gold). Baby carries one iron ore.
    const n=baby?1:this.ores.count[grade-1],spots=this.ores[view];for(let i=0;i<n;i++){const [ox,oy,os,orr]=spots[i];P('ore_'+this.ores.order[i],ox,oy,{s:os,r:orr});}
    if(boss)P('hat_'+view,...slot.hat);});
  }else{
   // Mushroom clusters on the shell: grade 1..4 = 1/2/3/5 mushrooms (shell sheet). The baby's shell is bare.
   // A per-view cluster (shrooms_<view>_g<grade>) replaces the shared one where it was drawn (side/back grade 4).
   // Slot [x, y, scale]: the shell sheet draws the side view relatively larger than the turnaround, so each view carries its own fit.
   const [sx,sy,ss=1]=slot.shell,shell=()=>frame(sx,sy,{s:p.shellScale*ss},()=>{P('shell_'+view,0,0);if(!baby)P(this.parts['shrooms_'+view+'_g'+grade]?'shrooms_'+view+'_g'+grade:'shrooms_g'+grade,(slot.shrooms[0]-sx)/ss,(slot.shrooms[1]-sy)/ss,{r:p.sway*.5});});
   if(view==='front'){shell();P('body_front',0,0);face(slot.face);if(boss)P('hat_front',...slot.hat);}
   else if(view==='side'){P('body_side',0,0);shell();face(slot.face);if(boss)P('hat_side',...slot.hat);}
   else{P('body_back',0,0);if(boss)P('hat_back',...slot.hat);shell();}
  }
  ctx.restore();
  ctx.save();ctx.translate(origin.x,origin.y);if(look.flip)ctx.scale(-1,1);this.effect(ctx,p,U,'front',view);ctx.restore();
  return{view,face:view==='back'?null:faceKey,parts:drawn,effect:p.fx&&p.fxQ>=0&&p.fxQ<=1?p.fx:null};
 }
 // The egg part (item, drop and placed block art) standing on the ground row. look.wobble 0..1 rocks it faster and
 // wider as hatching nears; deterministic in look.seconds.
 drawEgg(ctx,look,origin){if(look.species!==this.species)throw Error('동료 리그 종 불일치: '+look.species);const m=this.parts.egg,im=this.images.egg,U=UNIT_VIEW.pixelsPerUnit*origin.scale,s=this.scale[m.group]*U,w=unitClamp01(look.wobble||0),r=Math.sin((look.seconds||0)*(5+16*w))*.2*w;
  ctx.save();ctx.translate(origin.x,origin.y);ctx.rotate(r);ctx.drawImage(im,-m.anchor[0]*s,-m.anchor[1]*s,im.width*s,im.height*s);ctx.restore();return{view:'front',face:null,parts:['egg'],effect:null};}
 // Signature effects in rig space, deterministic in the anim progress. layer: 'back' (behind the body) or 'front'.
 effect(ctx,p,U,layer,view){
  const q=p.fxQ;if(!p.fx||q<0||q>1)return;const fade=1-q*q;ctx.save();ctx.lineJoin='round';
  const blob=(x,y,r,fill,stroke)=>{ctx.beginPath();ctx.arc(x*U,-y*U,r*U,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.lineWidth=2.2*U;ctx.strokeStyle=stroke;ctx.stroke();}};
  if(p.fx==='dirt'){
   // Dirt chunks thrown out of the slam crater, half behind and half in front of the body.
   for(let i=0;i<18;i++){if((i%2===0)!==(layer==='back'))continue;const side=i%4<2?-1:1,a=.5+unitHash(i)*.85,v=110+unitHash(i+40)*80,x=side*(26+Math.cos(a)*v*q),y=Math.sin(a)*v*q-150*q*q+4;
    if(y<0)continue;ctx.globalAlpha=fade;blob(x,y,4+unitHash(i+9)*5,'#7a5232','#3b2416');}
   if(layer==='front'){ctx.globalAlpha=fade*.8;ctx.beginPath();ctx.ellipse(0,0,(40+50*q)*U,(7+5*q)*U,0,0,Math.PI*2);ctx.fillStyle='#8a6440';ctx.fill();}
  }else if(p.fx==='spore'&&layer==='front'){
   for(let i=0;i<18;i++){const a=i*2.39996,v=50+unitHash(i)*70,r=(7+unitHash(i+5)*8)*(.7+q*.8),x=Math.cos(a)*v*(.25+q),y=96+Math.sin(a)*v*(.25+q)*.8+24*q;ctx.globalAlpha=fade*.85;blob(x,y,r,i%3?'#efe57a':'#d6e68e','rgba(150,140,60,.55)');}
  }else if(p.fx==='dust'&&layer==='back'){
   for(let i=0;i<5;i++){const x=40+i*12+q*20,y=6+unitHash(i)*10;ctx.globalAlpha=(1-q)*.7;blob(x,y,(6+i*2)*(.6+q),'#e8dcc4','rgba(140,120,90,.6)');}
  }else if(p.fx==='impact'&&layer===(view==='back'?'back':'front')){
   // The burst lands ahead of the head: left in the side view, toward the camera in front, behind the body from the back.
   ctx.globalAlpha=fade;ctx.translate((view==='side'?-72:0)*U,-(view==='side'?60:view==='front'?36:84)*U);ctx.beginPath();for(let i=0;i<16;i++){const a=i*Math.PI/8,r=(i%2?14:34)*(.6+q*.8);ctx[i?'lineTo':'moveTo'](Math.cos(a)*r*U,Math.sin(a)*r*U);}ctx.closePath();
   ctx.fillStyle='#fff3c4';ctx.fill();ctx.lineWidth=2.4*U;ctx.strokeStyle='#e0a030';ctx.stroke();
  }
  ctx.restore();
 }
}
// three.js path, mirroring PlayerRigRenderer: one canvas texture per unit, camera-facing quad on the ground point.
class UnitRigRenderer{
 constructor(renderer,rigs){for(const s of UNIT_SPECIES)if(!(rigs?.[s] instanceof UnitRig))throw Error('동료 컷아웃 리그가 필요합니다: '+s);this.r=renderer;this.rigs=rigs;this.surfaces=new Map();this.items=[];this.samples=[];}
 beginFrame(){this.items=[];this.samples=[];}
 surface(key,size){let s=this.surfaces.get(key);if(s&&s.size!==size){s.texture.dispose();this.surfaces.delete(key);s=null;}
  if(!s){const T=this.r.T,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
   const texture=new T.CanvasTexture(canvas);texture.premultiplyAlpha=true;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;texture.anisotropy=Math.min(4,this.r.three.capabilities.getMaxAnisotropy());
   s={canvas,ctx:canvas.getContext('2d'),texture,size,frame:-1,lastSeen:this.r.frame,info:null,look:null};this.surfaces.set(key,s);}
  s.lastSeen=this.r.frame;return s;}
 // item: {phase:'world'|'late', key, pos (ground point), look (see UnitRig.draw, plus size multiplier), tint, alpha, whiteFlash}.
 queue(item){
  const look=item.look,rig=this.rigs[look?.species];if(!rig)throw Error('알 수 없는 동료 종: '+look?.species);
  const size=look.stage==='boss'?UNIT_VIEW.bossCanvas:UNIT_VIEW.canvas,s=this.surface(item.key,size);
  if(s.frame!==this.r.frame){s.ctx.clearRect(0,0,size,size);const k=size/UNIT_VIEW.canvas,origin={x:size/2,y:UNIT_VIEW.ground*k,scale:k};s.info=look.egg?rig.drawEgg(s.ctx,look,origin):rig.draw(s.ctx,look,origin);s.texture.needsUpdate=true;s.frame=this.r.frame;s.look=look;}
  this.items.push({...item,surface:s});
  this.samples.push({mode:'unit-rig',phase:item.phase,key:item.key,role:item.role||null,species:look.species,egg:!!look.egg,anim:look.egg?'egg':look.anim,progress:look.progress??0,view:s.info.view,flip:!!look.flip,face:s.info.face,grade:look.grade??1,stage:look.stage||'adult',size:look.size??1,effect:s.info.effect,parts:s.info.parts.length,whiteFlash:!!item.whiteFlash,alpha:item.alpha??1,depthTest:true,depthWrite:false,pos:{...item.pos}});
 }
 draw(phase){const r=this.r,T=r.T;
  for(const item of this.items){if(item.phase!==phase)continue;
   const look=item.surface.look,units=UNIT_VIEW.canvas/UNIT_VIEW.pixelsPerUnit,w=units*UNIT_VIEW.metersPerUnit*UNIT_STAGES[look.stage||'adult'].scale*(look.size??1),bottom=-(1-UNIT_VIEW.ground/UNIT_VIEW.canvas)*w,p=item.pos,right=r.right;
   const at=(x,y)=>[p.x+right.x*x,p.y+y,p.z+right.z*x],tint=[...(item.tint||[1,1,1,1]).slice(0,3),(item.tint?.[3]??1)*(item.alpha??1)];
   const pts=[at(-w/2,bottom),at(w/2,bottom),at(w/2,bottom+w),at(-w/2,bottom+w)],uv=[[0,0],[1,0],[1,1],[0,1]],vertices=[];
   for(const i of [0,1,2,0,2,3])vertices.push(...pts[i],...uv[i],...tint);
   const pooled=r.pooled('unit-rig',()=>{const geometry=new DynamicGeometry(T,RENDER_LAYOUT.sprite);return{geometry,object:new T.Mesh(geometry.geometry,r.material(RIG_GLSL.vertex,RIG_GLSL.fragment,{vp:{value:new Float32Array(16)},tex:{value:null},flash:{value:0}},{blend:'premultiplied',depthWrite:false}))};});
   const u=pooled.object.material.uniforms;u.vp.value.set(r.vp);u.tex.value=item.surface.texture;u.flash.value=item.whiteFlash?1:0;r.submitDynamic(pooled,new Float32Array(vertices),9);
  }
 }
 endFrame(){for(const [key,s]of this.surfaces)if(this.r.frame-s.lastSeen>1800){s.texture.dispose();this.surfaces.delete(key);}}
 dispose(){for(const s of this.surfaces.values())s.texture.dispose();this.surfaces.clear();}
}
