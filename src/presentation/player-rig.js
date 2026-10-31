'use strict';
/* Cut-out player rig (Cult of the Lamb / Don't Starve style), approved in the 0.29 mockup (#38).
 * Authored part PNGs from src/assets/player are assembled at runtime on a 2D canvas per player and
 * shown in the three.js world as a camera-facing quad. Presentation only: reads display state, never
 * writes the simulation. Rig units: ground at y=0, head centre at y=133. */
const RIG_PARTS=Object.freeze(['front','side','back'].flatMap(v=>['head','torso','hand','foot','cap','jacket','pack'].map(p=>v+'_'+p))
 .concat(['front','side'].flatMap(v=>['n','atk','shout','hurt'].map(f=>v+'_head_'+f))));
const RIG_WEAPON_SCALE=Object.freeze({sword:.7,spear:.64,axe:.64,pick:.64});
// Attack angles in degrees from straight up, clockwise, for a rig facing screen-left: rest, wind-up, strike end.
const RIG_SWINGS=Object.freeze([[-20,40,-95],[-20,-130,55],[-20,15,-160]]);
// Attack timeline in rig progress: wind-up ends at strikeStart, the strike lands by strikeEnd, rest pose at rest.
const RIG_ATTACK=Object.freeze({strikeStart:.16,strikeEnd:.24,rest:.8});
// Equipment materials recolour their own part: helmet → cap, chestplate → jacket, boots → foot, held
// weapon/tool → blade. Each entry is [hue°, saturation ×, value ×]; null keeps the authored colours.
// base = parts no equipment touches. leather = authored, wood = 나무 blade, stone = 돌, iron = 철, diamond = 청수정.
const RIG_MATERIAL_COLOR=Object.freeze({
 base:Object.freeze({cap:null,jacket:null,foot:null,blade:null}),
 wood:Object.freeze({cap:null,jacket:null,foot:null,blade:[30,.48,.86]}),
 leather:Object.freeze({cap:null,jacket:null,foot:null,blade:null}),
 stone:Object.freeze({cap:null,jacket:null,foot:null,blade:[30,.16,.74]}),
 iron:Object.freeze({cap:[222,.25,1.02],jacket:[214,.3,.86],foot:[222,.25,1.35],blade:null}),
 diamond:Object.freeze({cap:[214,1.2,1.05],jacket:[190,.8,1.05],foot:[192,1.2,1.65],blade:[195,.38,1.04]})
});
const RIG_PART_KIND=key=>/_cap$/.test(key)?'cap':/_jacket$/.test(key)?'jacket':/_foot$/.test(key)?'foot':null;
// Held item → rig art. Items without a drawing (blocks, food…) show an empty hand.
const RIG_WEAPONS=Object.freeze(['sword','spear','axe','pick']);
const rigWeaponOf=item=>item?.weapon||(item?.tool==='pick'?'pick':null);
// World placement: a 512 px canvas whose ground row (420) sits on the actor's feet; 200 rig units ≈ the old sprout height.
const RIG_VIEW=Object.freeze({canvas:512,ground:420,metersPerUnit:.0092});
function rigEase(t,keys){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++){if(t<=keys[i][0]){const a=keys[i-1],b=keys[i];let u=(t-a[0])/(b[0]-a[0]);u=u*u*(3-2*u);return a[1]+(b[1]-a[1])*u}}return keys[keys.length-1][1]}
function rgbToHsv(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360}return[h,mx?d/mx:0,mx]}
function hsvToRgb(h,s,v){const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let r=0,g=0,b=0;if(h<60){r=c;g=x}else if(h<120){r=x;g=c}else if(h<180){g=c;b=x}else if(h<240){g=x;b=c}else if(h<300){r=x;b=c}else{r=c;b=x}return[(r+m)*255,(g+m)*255,(b+m)*255]}
function recolorPart(image,kind,to){
 if(!to)return image;
 const out=document.createElement('canvas');out.width=image.width;out.height=image.height;const x=out.getContext('2d');x.drawImage(image,0,0);
 const data=x.getImageData(0,0,out.width,out.height),p=data.data;
 for(let i=0;i<p.length;i+=4){if(!p[i+3])continue;const[h,s,v]=rgbToHsv(p[i],p[i+1],p[i+2]);
  const hit=kind==='cap'?h>140&&h<215&&s>.28:kind==='jacket'?h>8&&h<44&&s>.6&&v>.55:kind==='foot'?s>.15:s<.2&&v>.45;
  if(!hit)continue;const rgb=kind==='blade'?hsvToRgb(to[0],to[1]*(.6+v*.4),Math.min(1,v*to[2])):hsvToRgb(to[0],Math.min(1,s*to[1]),Math.min(1,v*to[2]));p[i]=rgb[0];p[i+1]=rgb[1];p[i+2]=rgb[2]}
 x.putImageData(data,0,0);return out}
function loadRigImage(url){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('플레이어 부품 이미지 로딩 실패: '+url));i.src=url})}
class PlayerRig{
 static async load(base){
  const response=await fetch(base+'player-parts.json');if(!response.ok)throw Error('플레이어 부품 정보 로딩 실패: '+response.status);
  const meta=await response.json(),rig=new PlayerRig();rig.grip=meta.weaponGrip;
  for(const w of RIG_WEAPONS)if(!Array.isArray(rig.grip?.[w]))throw Error('플레이어 무기 손잡이 정보 누락: '+w);
  const jobs=RIG_PARTS.map(k=>loadRigImage(base+k+'.png').then(img=>rig.add(k,img,RIG_PART_KIND(k))))
   .concat(RIG_WEAPONS.map(w=>loadRigImage(base+'weapon_'+w+'.png').then(img=>rig.add('weapon_'+w,img,'blade'))));
  await Promise.all(jobs);return rig;
 }
 constructor(){this.variants=Object.fromEntries(Object.keys(RIG_MATERIAL_COLOR).map(m=>[m,{}]));this.grip={}}
 add(key,image,kind){for(const [m,map]of Object.entries(RIG_MATERIAL_COLOR))this.variants[m][key]=kind?recolorPart(image,kind,map[kind]):image}
 // Pose from display state. `seconds` drives the idle/walk cycles; look.progress (0..1) drives roll and attack.
 pose(look,seconds){
  const p={bob:0,head:0,headX:0,handL:[0,0],handR:[0,0],footL:[0,0],footR:[0,0],footScaleL:1,footScaleR:1,weaponAngle:.35,rot:0,squash:1,offsetX:0,tuck:0,zoom:1,face:null};
  const view=look.view;
  if(look.anim==='idle'){const s=Math.sin(seconds*5);p.bob=s*1.8;p.head=-s*1.2;p.handL=[0,s*1.5];p.handR=[0,s*1.5]}
  else if(look.anim==='walk'){const w=Math.sin(seconds*10),c=Math.cos(seconds*10);p.bob=Math.abs(c)*3;
   if(view==='side'){p.footL=[w*14,Math.max(0,-c)*9];p.footR=[-w*14,Math.max(0,c)*9];p.handL=[-w*10,c*2];p.handR=[w*10,-c*2];p.weaponAngle=.5+w*.15}
   else{const sg=view==='back'?-1:1;p.footL=[0,-sg*w*9+Math.max(0,c)*13];p.footR=[0,sg*w*9+Math.max(0,-c)*13];p.footScaleL=1+sg*w*.14;p.footScaleR=1-sg*w*.14;p.handL=[0,sg*w*7];p.handR=[0,-sg*w*7];p.headX=w*2;p.weaponAngle=.5}}
  else if(look.anim==='roll'){const q=look.progress,T=Math.PI*2,ang=rigEase(q,[[0,0],[.12,0],[.88,T],[1,T]]);p.tuck=rigEase(q,[[0,0],[.2,1],[.82,1],[1,0]]);p.weaponAngle=1.2;p.bob=9*Math.sin(Math.PI*q)-p.tuck*3;
   if(view==='side')p.rot=-ang;else{p.pitch=ang;p.zoom=view==='front'?1+.08*Math.sin(Math.PI*q):1-.08*Math.sin(Math.PI*q)}}
  else if(look.anim==='attack'){const q=look.progress,D=Math.PI/180,sw=RIG_SWINGS[look.combo%RIG_SWINGS.length],rest=sw[0]*D,wind=sw[1]*D,end=sw[2]*D,ts=RIG_ATTACK.strikeStart,te=RIG_ATTACK.strikeEnd,last=look.combo===2;
   p.weaponAngle=rigEase(q,[[0,rest],[ts,wind],[te,end],[.5,end+(end>wind?-6:6)*D],[RIG_ATTACK.rest,rest]]);
   if(look.weapon==='spear'){p.weaponAngle=rigEase(q,[[0,-80*D],[.5,-90*D],[RIG_ATTACK.rest,-80*D]]);p.thrust=rigEase(q,[[0,0],[ts,-14],[te,30],[.5,26],[RIG_ATTACK.rest,0]])}
   p.rot=rigEase(q,[[0,0],[ts,.1],[te,-.14],[.5,-.08],[RIG_ATTACK.rest,0]]);p.squash=rigEase(q,[[0,1],[ts,1.03],[te,.9],[.32,1],[RIG_ATTACK.rest,1]]);
   p.head=rigEase(q,[[0,0],[ts,3],[te,-5],[.5,-2],[RIG_ATTACK.rest,0]]);p.face=q<.05||q>.7?null:(last&&q>=ts&&q<.4?'shout':'atk');
   p.swing={from:wind,q,ts,te,last};if(q>=te&&q<te+(last?.1:.05))p.shake=last?4:2;if(last)p.bob=rigEase(q,[[0,0],[ts,10],[te,0]])}
  if(look.hurt)p.face='hurt';
  return p;
 }
 // look: {anim, view:'front'|'side'|'back', flip, progress, combo, weapon:null|'sword'|'spear'|'axe'|'pick',
 //  material (held weapon/tool), helmet/chest: material|null (null = part not drawn), boots: material|'base', hurt}
 draw(ctx,look,seconds,origin){
  const p=this.pose(look,seconds),V=this.variants,U=origin.scale,OX=origin.x,GY=origin.y;let view=look.view,headKey=null;
  if(p.pitch!==undefined&&Math.cos(p.pitch)<0)view=view==='front'?'back':'front';
  // Part key → material variant: equipment slots pick their material, everything else is authored.
  const variantOf=key=>{const kind=RIG_PART_KIND(key);return kind==='cap'?look.helmet:kind==='jacket'?look.chest:kind==='foot'?look.boots:key.startsWith('weapon_')?look.material:'base'};
  const P=(key,x,y,o={})=>{const m=variantOf(key);if(!m)return;const im=V[m][key];if(!im)return;const s=(o.s||1)*U;ctx.save();ctx.translate(OX+x*U,GY-y*U);ctx.rotate(o.r||0);ctx.scale((o.flip?-1:1)*(o.sx||1),o.sy||1);
   if(o.dim)ctx.filter='brightness(.8)';ctx.drawImage(im,(-im.width/2-(o.px||0))*s,(-im.height/2-(o.py||0))*s,im.width*s,im.height*s);ctx.restore()};
  const weapon=(x,y,r,flip)=>{if(!look.weapon)return;const k='weapon_'+look.weapon,im=V[look.material][k],g=this.grip[look.weapon];P(k,x,y,{s:RIG_WEAPON_SCALE[look.weapon],r,px:g[0]-im.width/2,py:g[1]-im.height/2,flip})};
  const head=(pre,f)=>headKey=V.base[pre+'head_'+f]&&f?pre+'head_'+f:pre+'head';
  ctx.save();if(look.flip){ctx.translate(OX*2,0);ctx.scale(-1,1)}
  // Presentation-only impact jitter; deterministic in the attack progress so equal states draw equal frames.
  if(p.shake)ctx.translate(Math.sin(p.swing.q*977)*p.shake,Math.cos(p.swing.q*613)*p.shake);
  // The tucked roll spins about the ball's own centre so the tumbling body stays above the ground plane.
  const cy=GY-(58+(look.anim==='roll'?p.tuck*37:0))*U;ctx.translate(OX,cy);ctx.rotate(p.rot);ctx.scale(p.zoom,p.squash*p.zoom*(p.pitch!==undefined?.78+.22*Math.abs(Math.cos(p.pitch)):1));ctx.translate(-OX,-cy);
  const tk=p.tuck,b=p.bob,L=(a,c,k)=>a+(c-a)*k;
  if(view==='front'||view==='back'){
   const back=view==='back',pre=back?'back_':'front_',hy=133+b+p.head-tk*28,ty=50+b*.6-tk*4;
   P(pre+'foot',L(-17,-10,tk)+p.footL[0],14+p.footL[1]+tk*18,{s:p.footScaleL});P(pre+'foot',L(17,10,tk)+p.footR[0],14+p.footR[1]+tk*18,{flip:1,s:p.footScaleR});
   P(pre+'torso',0,ty,{sy:1-.1*tk});P(pre+'jacket',0,ty+(back?-1:2),{s:.69});P(pre+'pack',0,ty+(back?4:8),{s:back?.8:.7});
   const lx=L(-52+p.handL[0],-24,tk),ly=L(52+b+p.handL[1],30,tk),rx=L(52+p.handR[0],24,tk),ry=L(52+b+p.handR[1],30,tk);
   P(pre+'hand',back?rx:lx,back?ry:ly);const hk=head(pre,p.face);P(hk,p.headX,hy,{s:hk!==pre+'head'?1.08:1});P(pre+'cap',p.headX,hy+33,{s:.78});
   const wx=back?lx:rx,wy=back?ly:ry;if(!tk)weapon(wx,wy,p.weaponAngle,back);P(pre+'hand',wx,wy,{flip:1});
  }else{
   const hy=133+b+p.head-tk*30,ty=50+b*.6-tk*5;
   P('side_hand',L(14-p.handL[0]*.6,-8,tk),L(50+b+p.handL[1]-p.handL[0]*.3,30,tk),{dim:1});P('side_pack',15,ty+6,{s:.78});
   P('side_foot',L(-4+p.footR[0],-8,tk),14+p.footR[1]+tk*18,{dim:1});P('side_torso',0,ty,{sy:1-.1*tk});P('side_jacket',0,ty+1,{s:.7});
   P('side_foot',L(-4+p.footL[0],-12,tk),14+p.footL[1]+tk*18);
   const hk=head('side_',p.face);P(hk,p.headX-2-tk*12,hy,{r:-tk*.4,s:hk!=='side_head'?1.08:1});P('side_cap',p.headX-5-tk*12,hy+33-tk*5,{s:.78,r:-tk*.4});
   let sx=L(-10+p.handR[0]*.9,-14,tk),sy=L(54+b+p.handR[1],34,tk);
   if(p.swing){const R0=24+(p.thrust||0);sx=-4+Math.sin(p.weaponAngle)*R0;sy=64+b+Math.cos(p.weaponAngle)*R0;P('side_hand',sx+7,sy-3,{dim:1})}
   if(!tk)weapon(sx,sy,p.weaponAngle,false);P('side_hand',sx,sy);
   if(p.swing)this.smear(ctx,p,look,OX-4*U,GY-(64+b)*U,U);
  }
  ctx.restore();
  return{view,head:headKey,weapon:look.weapon&&!tk?look.weapon:null,face:p.face};
 }
 // Swipe band along the weapon arc, drawn only around the strike frames.
 smear(ctx,p,look,cx,cy,U){
  const S=p.swing,q=S.q;if(q<S.ts||q>S.te+.14)return;
  const armed=!!look.weapon,len=armed?this.grip[look.weapon][1]*RIG_WEAPON_SCALE[look.weapon]:30,head=p.weaponAngle,fade=q<=S.te?1:1-(q-S.te)/.14;
  let r0=(armed?24:14)+6,r1=24+len*.98,tail;const span=armed?2.6:.9;
  tail=head<S.from?Math.min(S.from,head+span):Math.max(S.from,head-span);
  ctx.beginPath();
  if(armed&&look.weapon==='spear'){r0=24+len*.2;r1=24+len+(p.thrust||0);const ex=Math.sin(head),ey=-Math.cos(head),w=6*U;
   ctx.moveTo(cx+ex*r1*U,cy+ey*r1*U);ctx.lineTo(cx+ex*r0*U-ey*w,cy+ey*r0*U+ex*w);ctx.lineTo(cx+ex*r0*U+ey*w,cy+ey*r0*U-ex*w)}
  else{const n=20,inner=[];for(let j=0;j<=n;j++){const f=j/n,a=tail+(head-tail)*f,ri=(r1-(r1-r0)*Math.pow(f,.7))*U;ctx[j?'lineTo':'moveTo'](cx+Math.sin(a)*r1*U,cy-Math.cos(a)*r1*U);inner.push([cx+Math.sin(a)*ri,cy-Math.cos(a)*ri])}
   for(let k=inner.length-1;k>=0;k--)ctx.lineTo(inner[k][0],inner[k][1])}
  ctx.closePath();ctx.save();ctx.globalAlpha*=fade;ctx.lineJoin='round';ctx.lineWidth=10*U;ctx.strokeStyle='rgba(255,190,70,.95)';ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.8)';ctx.fill();ctx.lineWidth=3*U;ctx.strokeStyle='rgba(122,74,34,.95)';ctx.stroke();ctx.restore();
 }
}
// Legacy attack timing (wind/active/recovery ms) → rig attack progress, so the drawn strike lands on the hit frames.
function rigAttackProgress(action,elapsed){const {strikeStart:ts,strikeEnd:te,rest}=RIG_ATTACK,w=Math.max(1,action.wind),a=Math.max(1,action.active),r=Math.max(1,action.recovery);
 if(elapsed<w)return ts*clamp(elapsed/w,0,1);if(elapsed<w+a)return lerp(ts,te,(elapsed-w)/a);return lerp(te,rest,clamp((elapsed-w-a)/r,0,1));}
// Display actor state → rig look. `lastFlip` keeps the side drawing's mirror while the facing is near the camera axis.
function playerRigLook(a,cameraYaw,reaction,lastFlip=false){
 const c=a.combat,act=c.action,rolling=c.state==='roll'&&!!act,attacking=c.state==='attack'&&!!act&&!act.companionId,item=Inventory.stats(a).item;
 const held=attacking?ITEMS[act.weaponKey]||null:item,weaponId=rigWeaponOf(held),weapon=RIG_WEAPONS.includes(weaponId)?weaponId:null;
 const worn=slot=>{const s=a.inventory.armor[slot];return s?ITEMS[s.id].material:null};
 const f=rolling||attacking?act.dir:a.facing,sx=f.x*Math.cos(cameraYaw)-f.z*Math.sin(cameraYaw),toward=f.x*Math.sin(cameraYaw)+f.z*Math.cos(cameraYaw);
 let view=Math.abs(sx)>=.5?'side':toward>0?'front':'back';if(attacking)view='side';
 const flip=Math.abs(sx)>=.2?sx>0:lastFlip,m=a.motion||motionState(),speed=Math.hypot(a.velocity.x,a.velocity.z);
 const anim=rolling?'roll':attacking?'attack':speed>.16&&a.knock<=0?'walk':'idle';
 const progress=rolling?clamp(c.elapsed/act.duration,0,1):attacking?rigAttackProgress(act,c.elapsed):0;
 // Walk cycle follows travelled distance (one rig cycle per legacy stride); idle breathes on the simulation clock.
 const seconds=anim==='walk'?m.distance/(a.sprinting?ANIMATION.runStride:ANIMATION.stride)*TAU/10:(a.anim||0)/1000;
 return{anim,view,flip:view==='side'&&flip,sideFlip:flip,progress,seconds,combo:attacking?act.combo||0:0,weapon,material:weapon?held.material:'base',helmet:worn('helmet'),chest:worn('chest'),boots:worn('boots')||'base',hurt:!!(reaction&&reaction.age<CFG.combat.feedback.flash)};
}
const RIG_GLSL=Object.freeze({
 vertex:'in vec3 position;in vec2 uv;in vec4 tint;uniform mat4 vp;out vec2 v;out vec4 t;void main(){v=uv;t=tint;gl_Position=vp*vec4(position,1.);}',
 // Premultiplied texels: tint may brighten up to the texel's own coverage, white flash replaces colour with coverage.
 fragment:'precision mediump float;uniform sampler2D tex;uniform float flash;in vec2 v;in vec4 t;out vec4 fragColor;void main(){vec4 c=texture(tex,v);float a=c.a*t.a;if(a<.002)discard;vec3 rgb=min(c.rgb*t.rgb,vec3(c.a));rgb=mix(rgb,vec3(c.a),flash);fragColor=vec4(rgb*t.a,a);}'
});
class PlayerRigRenderer {
 constructor(renderer,rig){if(!(rig instanceof PlayerRig))throw Error('플레이어 컷아웃 리그가 필요합니다.');this.r=renderer;this.rig=rig;this.surfaces=new Map();this.flips=new Map();this.items=[];this.samples=[];}
 beginFrame(){this.items=[];this.samples=[];}
 surface(key){let s=this.surfaces.get(key);if(!s){const T=this.r.T,canvas=document.createElement('canvas');canvas.width=canvas.height=RIG_VIEW.canvas;
   const texture=new T.CanvasTexture(canvas);texture.premultiplyAlpha=true;texture.generateMipmaps=true;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;texture.anisotropy=Math.min(4,this.r.three.capabilities.getMaxAnisotropy());
   s={canvas,ctx:canvas.getContext('2d'),texture,frame:-1,lastSeen:this.r.frame,info:null};this.surfaces.set(key,s);}
  s.lastSeen=this.r.frame;return s;}
 // item: {phase, key, pos, scale, tint, alpha, whiteFlash} plus either `actor` (+reaction) or a fixed `look`;
 // `canvasKey` lets afterimages reuse their source actor's canvas for the same frame.
 queue(item){
  const canvasKey=item.canvasKey||item.key,s=this.surface(canvasKey);let look=s.look;
  if(s.frame!==this.r.frame){
   look=item.look||playerRigLook(item.actor,this.r.camera.yaw,item.reaction,this.flips.get(canvasKey));if(item.actor)this.flips.set(canvasKey,look.sideFlip);
   s.ctx.clearRect(0,0,RIG_VIEW.canvas,RIG_VIEW.canvas);s.info=this.rig.draw(s.ctx,look,look.seconds||0,{x:RIG_VIEW.canvas/2,y:RIG_VIEW.ground,scale:1});
   s.texture.needsUpdate=true;s.frame=this.r.frame;s.look=look;
  }
  this.items.push({...item,surface:s});
  this.samples.push({mode:'rig',phase:item.phase,key:item.key,canvasKey,kind:'player',anim:look.anim,view:s.info.view,flip:look.flip,progress:look.progress,combo:look.combo,weapon:look.weapon,drawnWeapon:s.info.weapon,material:look.material,helmet:look.helmet,chest:look.chest,boots:look.boots,head:s.info.head,hurt:look.hurt,whiteFlash:!!item.whiteFlash,alpha:item.alpha??1,depthTest:true,depthWrite:false,pos:{...item.pos}});
 }
 draw(phase){const r=this.r,T=r.T,C=RIG_VIEW.canvas,up={x:0,y:1,z:0};
  for(const item of this.items){if(item.phase!==phase)continue;
   const unit=RIG_VIEW.metersPerUnit*(item.scale||1),w=C*unit,bottom=-(C-RIG_VIEW.ground)*unit,p=item.pos,right=r.right;
   const at=(x,y)=>[p.x+right.x*x,p.y+y,p.z+right.z*x],tint=[...(item.tint||[1,1,1,1]).slice(0,3),(item.tint?.[3]??1)*(item.alpha??1)];
   const pts=[at(-w/2,bottom),at(w/2,bottom),at(w/2,bottom+w),at(-w/2,bottom+w)],uv=[[0,0],[1,0],[1,1],[0,1]],vertices=[];
   for(const i of [0,1,2,0,2,3])vertices.push(...pts[i],...uv[i],...tint);
   const pooled=r.pooled('player-rig',()=>{const geometry=new DynamicGeometry(T,RENDER_LAYOUT.sprite);return{geometry,object:new T.Mesh(geometry.geometry,r.material(RIG_GLSL.vertex,RIG_GLSL.fragment,{vp:{value:new Float32Array(16)},tex:{value:null},flash:{value:0}},{blend:'premultiplied',depthWrite:false}))};});
   const u=pooled.object.material.uniforms;u.vp.value.set(r.vp);u.tex.value=item.surface.texture;u.flash.value=item.whiteFlash?1:0;r.submitDynamic(pooled,new Float32Array(vertices),9);
  }
 }
 endFrame(){for(const [key,s]of this.surfaces)if(this.r.frame-s.lastSeen>1800){s.texture.dispose();this.surfaces.delete(key);this.flips.delete(key);}}
 dispose(){for(const s of this.surfaces.values())s.texture.dispose();this.surfaces.clear();this.flips.clear();}
}
