'use strict';
/* 0.9.2 승인 스프라우틀링 아트를 유지. world physics와 무관한 생성 아틀라스. */
function createSpriteAtlas(maxTextureSize){let c=document.createElement('canvas');c.width=2048;c.height=4096;let ctx=c.getContext('2d',{alpha:true});ctx.imageSmoothingEnabled=false;let textures={},index=0;const cols=32,CW=64,CH=64,out='#322b39';
function fill(col){ctx.fillStyle=col}function poly(points,color,stroke=out,width=2){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineJoin='round';ctx.stroke()}}function rect(x,y,w,h,c){fill(c);ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}function dotc(x,y,r,c){ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=c;ctx.fill()}
function addEffect(name,draw){let x=(index%cols)*CW,y=Math.floor(index/cols)*CH;ctx.save();ctx.translate(x,y);if(!name.startsWith('slash-'))ctx.translate(8,4);draw();ctx.restore();textures['fx/'+name]={x,y,w:CW,h:CH};index++}
addEffect('spark',()=>{poly([[24,9],[27,22],[39,15],[32,28],[45,31],[31,36],[28,49],[21,37],[8,42],[17,30],[7,22],[21,24]],'#ffffff',null)});
addEffect('impact-light',()=>{poly([[24,4],[28,22],[43,12],[34,27],[51,30],[33,35],[38,50],[26,39],[16,55],[18,37],[3,40],[16,29],[5,18],[21,23]],'#ffffff',null);rect(21,26,8,8,'#ffffff')});
addEffect('impact-heavy',()=>{for(let a=0;a<12;a++){const ang=a*TAU/12+(a%2)*.08,r=a%2?23:28,w=a%3?3:5;ctx.save();ctx.translate(24,28);ctx.rotate(ang);poly([[0,-w],[r,-1],[r+5,1],[0,w]],'#ffffff',null);ctx.restore();}dotc(24,28,8,'#ffffff')});
addEffect('shard',()=>{poly([[6,29],[30,20],[43,26],[26,31],[48,39],[22,35]],'#ffffff',null)});
for(let frame=0;frame<4;frame++)addEffect('dust-'+frame,()=>{const k=frame/3,alpha=1-k*.22;ctx.globalAlpha=alpha;for(const [x,y,rx,ry] of [[9,34,10,4],[21,29,12,5],[36,34,9,4],[28,39,13,4]]){ctx.beginPath();ctx.ellipse(x+(x-24)*k*.35,y,rx*(1+k*.65),Math.max(1.5,ry*(1-k*.45)),0,0,TAU);ctx.fillStyle='#ffffff';ctx.fill();}ctx.globalAlpha=1;});
addEffect('puff',()=>{for(let [x,y,r] of [[18,32,8],[25,26,9],[32,32,7]])dotc(x,y,r,'#ffffff')});
addEffect('seed',()=>{poly([[13,26],[22,16],[32,21],[34,29],[28,36],[18,36]],'#ffffff',null)});
addEffect('ring',()=>{ctx.lineWidth=3;ctx.strokeStyle='#ffffff';ctx.beginPath();ctx.ellipse(24,28,14,7,0,0,TAU);ctx.stroke()});
// Impact-first pixel slashes: bright inner core, jagged outer edge, short-lived tail.
for(const style of ['light','heavy','thrust','overhead'])for(let frame=0;frame<ANIMATION.slash.frames;frame++)addEffect('slash-'+style+'-'+frame,()=>{
 const image=ctx.createImageData(64,64),progress=frame/(ANIMATION.slash.frames-1);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){
  const xx=(x-31.5)/28,yy=(y-31.5)/28;let band=0,edge=0,flow=0;
  if(style==='thrust'){const along=(x-4)/55,width=.12+.12*Math.sin(clamp(along,0,1)*Math.PI);band=along>progress*.12&&along<1-Math.max(0,progress-.68)*.2&&Math.abs(yy)<width;edge=Math.abs(yy)/Math.max(.001,width);flow=along;}
  else if(style==='overhead'){const vertical=(y-2)/59,bend=.24*Math.sin(vertical*Math.PI),width=.08+.22*Math.sin(vertical*Math.PI);band=vertical>progress*.10&&vertical<1&&Math.abs(xx-bend)<width;edge=Math.abs(xx-bend)/Math.max(.001,width);flow=vertical;}
  else{const r=Math.hypot(xx,yy),a=Math.atan2(yy,xx),start=-2.22+progress*.34,end=1.20+progress*.62,thickness=style==='heavy'?.31:.17,taper=Math.pow(Math.sin(clamp((a-start)/(end-start),0,1)*Math.PI),.72),outer=.96,inner=outer-thickness*taper;band=a>start&&a<end&&r<outer&&r>inner;edge=(outer-r)/Math.max(.01,thickness*taper);flow=clamp((a-start)/(end-start),0,1);}
  if(!band)continue;const h=hash3(x,y,frame,7921);if((edge>.68&&h%9<2+frame/2)||(frame>=4&&h%7<frame-3))continue;
  const i=(x+y*64)*4,core=edge<.30&&flow>.08&&flow<.94,v=core?255:edge<.68?238:174;image.data[i]=v;image.data[i+1]=v;image.data[i+2]=v;image.data[i+3]=core?255:frame===ANIMATION.slash.frames-1?155:225;
 }
 const tile=document.createElement('canvas');tile.width=tile.height=64;tile.getContext('2d').putImageData(image,0,0);ctx.drawImage(tile,0,0);
});

const usedHeight=2**Math.ceil(Math.log2(Math.ceil(index/cols)*CH));if(usedHeight>maxTextureSize)throw Error('스프라이트 아틀라스 크기를 지원하지 않는 GPU');
const trimmed=document.createElement('canvas');trimmed.width=c.width;trimmed.height=usedHeight;trimmed.getContext('2d').drawImage(c,0,0);c=trimmed;
for(const f of Object.values(textures))Object.assign(f,{u0:f.x/c.width,v0:1-f.y/c.height,u1:(f.x+f.w)/c.width,v1:1-(f.y+f.h)/c.height});
return {frames:textures,count:index,canvas:c}}


const c3=h=>[parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];
const arr=v=>[v.x,v.y,v.z],minus=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),normal=a=>{const d=Math.hypot(...a)||1;return a.map(x=>x/d)};
function projection(fov,aspect,n,f){const t=1/Math.tan(fov/2);return new Float32Array([t/aspect,0,0,0,0,t,0,0,0,0,(f+n)/(n-f),-1,0,0,2*f*n/(n-f),0]);}
function viewMatrix(eye,at){const f=normal(minus(at,eye)),s=normal(cross(f,[0,1,0])),u=cross(s,f);return new Float32Array([s[0],u[0],-f[0],0,s[1],u[1],-f[1],0,s[2],u[2],-f[2],0,-dot(s,eye),-dot(u,eye),dot(f,eye),1]);}
function matrixMul(a,b){const c=new Float32Array(16);for(let j=0;j<4;j++)for(let i=0;i<4;i++)c[j*4+i]=a[i]*b[j*4]+a[i+4]*b[j*4+1]+a[i+8]*b[j*4+2]+a[i+12]*b[j*4+3];return c;}
/* Original 16px block art. No copied Minecraft assets, image downloads or runtime dependencies.
 * Integer pixels -> one GPU atlas; one-block world-space repetition survives greedy quads. */
const TEXTURE_STYLE=Object.freeze({tile:16,cell:32,columns:8,rows:16,gutter:8});
function blockTexturePixel(id,face,x,y){
 const name=BLOCKS[id].id,N=(xx,yy,s=0)=>hash3((xx+64)%16,(yy+64)%16,id,15973+s),
  mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t)),rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),
  shade=(c,k)=>c.map(v=>clamp(Math.round(v*k),0,255));
 const h=N(x,y),cell=N(x>>1,y>>1,6),grain=(h%5-2)*.018;
 let c=rgb(BLOCKS[id].color),k=1+grain+(cell%5-2)*.040;
 const dirt=()=>{let a=[151,107,70],q=N(x,y,42);if(q%29<3)a=[188,149,97];if(q%37<2)a=[110,76,52];return shade(a,1+grain+(N(x>>1,y>>1,18)%5-2)*.045);};
 const stone=()=>{const a=[140,151,148],cx=(x+Math.floor(y/4)*3)%16,edge=(cx%7===0&&y%5<3)||(y%7===2&&cx%7<3);return shade(a,(edge?.77:1)+(N(x>>1,y>>1,8)%5-2)*.065+grain);};
 if(name==='grass'){
  if(face===2)return dirt();
  if(face===1){const fringe=3+N(x>>1,0,11)%3;if(y>=fringe){const a=dirt();return y===fringe?shade(a,.83):a;}c=[99,154,64];k=1+grain+(cell%5-2)*.06+(y===0?.10:0);}
  else{c=[113,170,74];k=1+grain+(cell%5-2)*.075;if(h%23===0)k=1.20;if((x+3*y)%11===0&&N(x,y,10)%3===0)k=.74;}
 }else if(name==='dirt')return dirt();
 else if(name==='stone')return stone();
 else if(name==='cobble'||name==='furnace'){
  if(name==='furnace'&&face===1&&x>=3&&x<=12&&y>=6&&y<=12){if(x===3||x===12||y===6||y===12)return [70,78,76];return [28+(h%3)*4,35+(h%3)*4,34+(h%3)*4];}
  const seeds=[[2,2],[8,1],[14,4],[5,7],[11,9],[1,13],[7,14],[15,15]];let d1=1e6,d2=1e6,win=seeds[0],index=0;
  for(let i=0;i<seeds.length;i++){const s=seeds[i],dx=Math.min(Math.abs(x-s[0]),16-Math.abs(x-s[0])),dy=Math.min(Math.abs(y-s[1]),16-Math.abs(y-s[1])),d=dx*dx+dy*dy;if(d<d1){d2=d1;d1=d;win=s;index=i;}else d2=Math.min(d2,d);}
  c=name==='furnace'?[120,130,130]:[137,146,140];k=d2-d1<5?.64:1+(index%3-1)*.085+(y<win[1]&&d1>3?.12:0)+grain;
 }else if(name==='log'||name==='stem'){
  const stem=name==='stem';c=stem?[213,198,157]:[144,103,65];
  if(face!==1){c=stem?[227,211,170]:[193,151,94];const r=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));k=(Math.floor(r)%3===0?.76:1)+(x<8&&y<8?.06:0)+grain;if(r>6.5){c=stem?[188,172,133]:[115,78,48];k=1+grain;}}
  else{const stripe=(x+Math.floor(y/6))%5;k=stripe===0?.72:stripe===1?1.13:1+grain;if(!stem&&Math.abs(x-9)+Math.abs(y-7)*.7<2.5)k=.65;if(stem)k=.96+(stripe===0?-.1:stripe===1?.04:grain);}
 }else if(name==='planks'||name==='workbench'){
  c=[195,150,93];const row=Math.floor(y/4),joint=(x+(row%2)*7)%16;
  k=y%4===0?.68:y%4===1?1.09:joint===0?.76:1+grain;if(h%19===0&&y%4!==0)k=.87;
  if(name==='workbench'){
   c=[175,124,73];if(face===0){const border=x<2||x>13||y<2||y>13;k=border?.58:x===5||x===10||y===5||y===10?.73:1.15+grain;if((x===1||x===14)&&(y===1||y===14))return [214,190,131];}
   else if(face===1){if(x<2||x>13)k=.62;if(y>5&&y<13&&((x===5)||(y===7&&x>=4&&x<=9)))return [70,68,57];}
  }
 }else if(name==='leaves'){
  c=[78,141,71];const xx=(x+(Math.floor(y/4)%2)*2)%4,yy=y%4;k=xx+yy===0?.55:xx===1&&yy===1?1.36:xx+yy<3?1.13:xx===3&&yy===3?.70:.94; k+=grain;
 }else if(name==='sand'){
  c=[226,199,135];k=1+grain*.55+(cell%3-1)*.025;if(h%39===0)k=.78;if(h%43===1)k=1.10;
 }else if(name.endsWith('Ore')){
  const base=stone(),cx=x>>2,cy=y>>2,seed=N(cx*4,cy*4,25),xx=x%4,yy=y%4;
  if(seed%3!==0&&xx>=1&&xx<=2&&yy>=1&&yy<=2){const ore={coalOre:[53,60,59],ironOre:[204,161,126],goldOre:[229,186,53],diamondOre:[74,215,216]}[name];return shade(ore,yy===1&&xx===1?1.25:yy===2&&xx===2?.75:1);}
  if(seed%3!==0&&((xx===0&&yy===1)||(xx===1&&yy===3)))return shade(base,.78);return base;
 }else if(name==='obsidian'){
  c=[64,49,86];k=.85+(cell%5)*.08+grain;if((x+y*2)%11===0&&h%3!==0)return [108,82,128];
 }else if(name==='bedrock'){
  c=[66,75,76];k=.55+(N(x>>1,y>>1,17)%6)*.13+grain;
 }else if(name==='cap'){
  c=[181,102,146];k=1+(cell%4-1.5)*.035+grain;
  const spots=[[3,3],[11,2],[8,10],[1,13],[15,12]];if(spots.some(([a,b])=>Math.abs(x-a)+Math.abs(y-b)<2.4))return [242-(h%3)*4,224-(h%3)*4,191-(h%3)*4];if(face===2){c=[205,169,173];k=(x+y)%4===0?.8:1+grain;}
 }else if(name==='altar'||name==='trophy'){
  const gold=name==='trophy';c=gold?[207,168,78]:[139,111,150];k=1+grain+(cell%4-1.5)*.04;
  const dx=Math.abs(x-7.5),dy=Math.abs(y-7.5),petal=(Math.abs(dx-2)+dy<1.8)||(Math.abs(dy-2)+dx<1.8),rim=x===1||y===1||x===14||y===14;
  if(petal||dx+dy<1.5)return gold?[253,226,130]:[218,192,233];if(rim)return shade(c,.72);if(x===2||y===2)return shade(c,1.18);
 }else if(name==='torch'){
  c=[122,88,54];k=(x%4===0?.72:1)+grain;
  if(face===0||(x>=5&&x<=10&&y<9)){const fire=(x+y)%3;return [[255,220,104],[241,164,54],[212,103,35]][fire];}
 }
 return shade(c,k);
}
function buildBlockAtlas(){
 const {tile,cell,columns,rows,gutter}=TEXTURE_STYLE,width=columns*cell,height=rows*cell,data=new Uint8Array(width*height*4),averages=[];
 for(let id=0;id<BLOCKS.length;id++)for(let face=0;face<3;face++){
  const index=id*3+face,ox=(index%columns)*cell,oy=Math.floor(index/columns)*cell,pixels=[],sum=[0,0,0];
  for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){const c=blockTexturePixel(id,face,x,y);pixels.push(c);for(let k=0;k<3;k++)sum[k]+=c[k];}
  const avg=sum.map(v=>Math.round(v/(tile*tile)));averages[index]=avg;
  for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){const c=pixels[((y-gutter+tile)%tile)*tile+(x-gutter+tile)%tile],i=((oy+y)*width+ox+x)*4;data.set([...c,255],i);}
  // One reserved texel stores the average for minification without cross-tile bleeding.
  data.set([...avg,255],((oy+cell-1)*width+ox+cell-1)*4);
 }
 return {width,height,data,averages};
}

/* Client-only feedback: never changes time step, snapshots, aim input or Rapier state. */
class CombatVisuals {
 constructor(renderer){this.r=renderer;this.options={shake:!matchMedia('(prefers-reduced-motion: reduce)').matches,sound:true,numbers:true,textures:true,effects:true,debugGround:false};this.reset();}
 reset(){this.clock=0;this.reactions=new Map();this.holds=new Map();this.bursts=[];this.particles=[];this.numbers=[];this.ghosts=[];this.runSteps=new Map();this.shake=0;this.hurt=0;this.marker=null;this.slashSamples=[];this.afterimageSamples=[];const node=document.getElementById('combat-floats');if(node)node.replaceChildren();}
 advance(dt){this.clock+=dt;this.shake=Math.max(0,this.shake-dt*.0018);this.hurt=Math.max(0,this.hurt-dt/260);
  for(const [k,v]of this.reactions){v.age+=dt;if(v.age>360)this.reactions.delete(k);}for(const [k,v]of this.holds){v.left-=dt;if(v.left<=0)this.holds.delete(k);}
  for(const b of this.bursts)b.age+=dt;this.bursts=this.bursts.filter(b=>b.age<b.duration);for(const g of this.ghosts)g.age+=dt;this.ghosts=this.ghosts.filter(g=>g.age<g.duration);
  for(const p of this.particles){p.age+=dt;p.pos=V.add(p.pos,V.scale(p.velocity,dt/1000));p.velocity.y-=p.gravity*dt/1000;}this.particles=this.particles.filter(p=>p.age<p.duration);
  for(const n of this.numbers)n.age+=dt;this.numbers=this.numbers.filter(n=>{if(n.age>=n.duration){n.node?.remove();return false;}return true;});}
 pose(a){const hold=this.holds.get(a.id);return hold&&a.combat.state==='attack'&&a.combat.action?.sequence===hold.sequence?{...a,combat:{...a.combat,elapsed:hold.elapsed}}:a;}
 effectStyle(heavy){return heavy?'heavy':'light';}
 emitDust(e,count,scale=1){const seed=hashStr(e.id),dir=e.direction||{x:0,y:0,z:0};for(let i=0;i<count;i++){const h=hash3(seed,i,77),a=(h%6283)/1000,r=.35+((h>>>8)%100)/120;this.particles.push({kind:'dust',pos:{x:e.pos.x+Math.cos(a)*.08,y:e.pos.y+.025,z:e.pos.z+Math.sin(a)*.08},velocity:{x:Math.cos(a)*r+dir.x*.18,y:.05,z:Math.sin(a)*r+dir.z*.18},age:0,duration:170+(h%120),size:(.48+((h>>>16)%50)/100)*scale,color:[.76,.76,.61],gravity:0});}}
 event(e,sim,local){if(e.type==='attack-hit'||e.type==='windup'||e.type==='swing')return;const target=sim.actors[e.actorId],position=e.point||V.add(e.pos,{x:0,y:target?.offset||.8,z:0}),near=V.len(V.sub(position,sim.actors[local]?.pos||position))<27;if(!near)return;
  const confirmed=e.type==='hit',heavy=e.heavy||e.lethal,style=this.effectStyle(heavy),color=style==='heavy'?[1,.72,.25]:e.type==='wall'||e.type==='spark'?[.90,.81,.64]:[1,.91,.70];
  if(confirmed||e.type==='wall'||e.type==='spark'){const seed=hashStr(e.id),b={age:0,duration:heavy?280:210,point:{...position},normal:e.normal||{x:0,y:1,z:0},color,heavy,style,size:heavy?.96:.66,seed};this.bursts.push(b);
   const count=heavy?12:7;for(let i=0;i<count;i++){const h=hash3(seed,i,1),u=((h&1023)/511.5-1),v=(((h>>>10)&1023)/511.5-1),w=(((h>>>20)&1023)/1023),n=b.normal;this.particles.push({kind:i%3?'shard':'streak',pos:{...position},velocity:{x:u*(heavy?4.8:3.5)+n.x*2.2,y:w*(heavy?4.7:3.5)+n.y*1.5+.45,z:v*(heavy?4.8:3.5)+n.z*2.2},age:0,duration:150+(h%190),size:.045+(h%5)*.012,color,gravity:7.5});}}
  if(confirmed){this.reactions.set(e.actorId,{age:0,heavy,dir:e.direction||{x:0,y:0,z:1}});const source=sim.actors[e.sourceId];if(source?.combat.state==='attack')this.holds.set(source.id,{left:heavy?CFG.combat.feedback.heavyHold:CFG.combat.feedback.poseHold,elapsed:source.combat.elapsed,sequence:source.combat.action.sequence});if(e.sourceId===local){this.marker={until:this.clock+170,heavy,color};this.shake=Math.min(1.25,this.shake+(heavy?.68:.36));}if(e.actorId===local){this.hurt=Math.min(1,this.hurt+.8);this.shake=Math.min(1.25,this.shake+.65);}if(e.sourceId===local||e.actorId===local)this.number(e,position,color,heavy);}
  if(e.type==='roll'&&!e.airborne)this.emitDust({...e,direction:target?.combat?.action?.dir},8,.85);if(e.type==='land')this.emitDust(e,10,1.05);
  if(e.type==='burst')this.bursts.push({age:0,duration:450,point:{...e.pos,y:e.pos.y+.05},ground:true,color:[.90,.42,.65],size:e.radius||4,heavy:true,seed:hashStr(e.id)});
  if(e.type==='evade'&&(e.sourceId===local||e.actorId===local))this.number({...e,damage:null,label:'회피'},position,[.65,.88,.93],false);
if(e.type==='death'){const scale=target?.scale||1,def=target?.speciesId?SPECIES[target.speciesId].wild:target?.boss?BOSS:null;this.ghosts.push({id:e.id,age:0,duration:380,pos:{...e.pos},scale,kind:def?.kind||'sprout',tint:def?.tint||[1,1,1,1]});const seed=hashStr(e.id);for(let i=0;i<14;i++){const h=hash3(seed,i,9);this.particles.push({kind:'shard',pos:{...e.pos,y:e.pos.y+scale},velocity:{x:((h%31)-15)*.16,y:1.7+(h%6)*.35,z:(((h>>>8)%31)-15)*.16},age:0,duration:320+h%180,size:.065+h%4*.018,color:[.74,.88,.51],gravity:3});}}
  while(this.particles.length>CFG.combat.feedback.particles)this.particles.shift();while(this.bursts.length>CFG.combat.feedback.bursts)this.bursts.shift();}
 runDust(sim){const live=new Set();for(const a of Object.values(sim.actors)){if(a.enemy||a.dead||a.suspended||!a.sprinting||!a.grounded)continue;live.add(a.id);const step=Math.floor((a.motion?.distance||0)/1.05),prev=this.runSteps.get(a.id);if(prev===undefined){this.runSteps.set(a.id,step);continue;}if(step!==prev){this.runSteps.set(a.id,step);const dir=V.norm({x:a.velocity.x,y:0,z:a.velocity.z});this.emitDust({id:'run:'+a.id+':'+step,pos:{...a.pos},direction:V.scale(dir,-.35)},2,.46);}}for(const id of this.runSteps.keys())if(!live.has(id))this.runSteps.delete(id);}
 number(e,point,color,heavy){if(!this.options.numbers)return;const parent=document.getElementById('combat-floats');if(!parent)return;if(this.numbers.length>=CFG.combat.feedback.numbers)this.numbers.shift().node.remove();const node=document.createElement('div');node.className='combat-number'+(heavy?' heavy':'');const label=e.label||(e.lethal?'처치':'');const main=document.createElement('b');main.textContent=e.damage==null?label:String(e.damage);node.append(main);if(label&&e.damage!=null){const small=document.createElement('small');small.textContent=label;node.append(small);}node.style.color='rgb('+color.map(x=>Math.round(x*255)).join(',')+')';parent.append(node);this.numbers.push({node,age:0,duration:heavy?800:680,point:{...point},lane:(hashStr(e.id)%5-2)*12,heavy});}
 cameraOffset(){if(!this.options.shake||this.shake<=0)return ZERO_VECTOR;const a=CFG.combat.feedback.shake*this.shake*this.shake,t=this.clock;return{x:this.r.right?.x*a*Math.sin(t*.13)||0,y:a*.65*Math.cos(t*.17),z:this.r.right?.z*a*Math.sin(t*.13)||0};}
 ui(){for(const n of this.numbers){if(!this.r.worldVisualReady(n.point,.08)){n.node.hidden=true;continue;}const t=n.age/n.duration,p=this.r.projected(V.add(n.point,{x:0,y:.12+t*.7,z:0}));if(!p){n.node.hidden=true;continue;}n.node.hidden=false;const pop=t<.15?lerp(.65,n.heavy?1.45:1.22,t/.15):lerp(n.heavy?1.45:1.22,1,clamp((t-.15)/.20,0,1));n.node.style.transform=`translate(${p.x+n.lane*t}px,${p.y-16-Math.sin(t*Math.PI)*9}px) translate(-50%,-100%) scale(${pop})`;n.node.style.opacity=String(clamp((1-t)/.26,0,1));}const marker=document.getElementById('hit-confirm');if(marker){const t=this.marker?(this.marker.until-this.clock)/170:0;marker.style.opacity=String(clamp(t*2,0,1));marker.style.transform=`translate(-50%,-50%) scale(${this.marker?.heavy?1.25+.3*t:1+.2*t})`;if(this.marker)marker.style.color='rgb('+this.marker.color.map(c=>Math.round(c*255)).join(',')+')';}const vignette=document.getElementById('hurt-vignette');if(vignette)vignette.style.opacity=String(this.hurt*.65);}
 line(out,a,b,width,color,alpha=1){const dir=V.sub(b,a),eye=V.sub(this.r.eye||{x:0,y:10,z:10},a),side=V.norm({x:dir.y*eye.z-dir.z*eye.y,y:dir.z*eye.x-dir.x*eye.z,z:dir.x*eye.y-dir.y*eye.x}),s=V.scale(side,width*.5),points=[V.add(a,s),V.add(b,s),V.sub(b,s),V.sub(a,s)];for(const i of [0,1,2,0,2,3])out.push(points[i].x,points[i].y,points[i].z,...color,alpha);}
 groundArc(out,pos,radius,start,end,color,alpha,width=.025){const segments=Math.max(4,Math.ceil(Math.abs(end-start)*12));for(let i=0;i<segments;i++){const a=lerp(start,end,i/segments),b=lerp(start,end,(i+1)/segments);this.line(out,{x:pos.x+Math.sin(a)*radius,y:pos.y,z:pos.z+Math.cos(a)*radius},{x:pos.x+Math.sin(b)*radius,y:pos.y,z:pos.z+Math.cos(b)*radius},width,color,alpha);}}
 trails(out,sim){if(!this.options.debugGround)return;for(const a of Object.values(sim.actors)){const c=a.combat,act=c.action;if(a.dead||!a.enemy||c.state!=='attack'||c.elapsed>=act.wind)continue;const rp=a.pos,yaw=Math.atan2(act.dir.x,act.dir.z),arc=act.kind==='burst'?TAU:act.arc||1.5;this.groundArc(out,{...rp,y:rp.y+.035},act.reach,yaw-arc*.5,yaw+arc*.5,[1,.44,.31],.32,.025);}}
 afterimages(sprites,sim){this.afterimageSamples=[];for(const raw of Object.values(sim.actors)){if(raw.dead||raw.suspended||!this.r.entityVisualReady(raw))continue;const a=this.pose(raw),c=a.combat,act=c.action;let strength=0,dir=null;if(c.state==='attack'&&act){if(act.companionId)continue;const timing=actionTiming(act,c.elapsed);if(timing.stage!=='active')continue;strength=.55+.45*Math.sin(clamp(timing.phase,0,1)*Math.PI);dir=V.norm({x:act.dir.x,y:0,z:act.dir.z});}else if(c.state==='roll'&&act){const p=clamp(c.elapsed/act.duration,0,1);if(p<.06||p>.88)continue;strength=Math.sin(p*Math.PI);dir=V.norm(act.dir);}else continue;const sample=actorSpritePose(a,this.r.camera.yaw,this.reactions.get(a.id));if(!this.r.companionRenderer.hasCharacter(sample.kind))continue;const rp=raw.pos,scale=a.scale||1,count=Math.max(1,Math.round(CFG.combat.feedback.afterimages*strength));for(let i=count;i>=1;i--){const d=.07+i*.10+(c.state==='roll'?i*.05:0),pos=V.sub(rp,V.scale(dir,d)),alpha=(.13+.06*(count-i))*strength,tint=a.enemy?[1,.42,.28,1]:[.72,.92,1,1];this.r.companionRenderer.queueCharacter({phase:'late',key:'afterimage/'+a.id+'/'+i,kind:sample.kind,sample,pos,scale,tint,alpha,whiteFlash:false});this.afterimageSamples.push({id:a.id,state:c.state,index:i,alpha});}}}
 slashPlane(sprites,center,u,v,key,color,opacity,flip=false){const ghost=this.r.atlas.frames[key.replace(/-(\d+)$/,(_,n)=>'-'+Math.max(0,+n-2))]||this.r.atlas.frames[key],frame=this.r.atlas.frames[key];if(!frame)return;this.r.spritePlane(sprites,center,V.scale(u,1.10),V.scale(v,1.10),ghost,[color[0]*.72,color[1]*.78,color[2],opacity*.20],flip);this.r.spritePlane(sprites,center,u,v,frame,[...color,opacity*.88],flip);this.r.spritePlane(sprites,center,V.scale(u,.76),V.scale(v,.76),frame,[1,1,.94,Math.min(1,opacity*.72)],flip);}
 slashes(sprites,sim){this.slashSamples=[];for(const raw of Object.values(sim.actors)){if(raw.dead||raw.suspended||!this.r.entityVisualReady(raw))continue;const a=this.pose(raw),c=a.combat,act=c.action;if(c.state!=='attack'||!act)continue;if(act.companionId)continue;const elapsed=c.elapsed,ms=elapsed-act.wind,wind=ms<0;if(ms<-ANIMATION.slash.windup||ms>act.active+ANIMATION.slash.tail)continue;const position=raw.pos,preview={...a,pos:position},heavy=['heavy','heavyReverse','overhead'].includes(attackClip(act));if(['arrow','spit','precision','quickshot','burst'].includes(act.kind)){if(wind){const p=V.add(position,{x:0,y:a.offset*1.65,z:0}),size=.26+.12*(1+ms/ANIMATION.slash.windup);this.r.sprite(sprites,{...p,y:p.y-size/2},size,size,this.r.atlas.frames['fx/spark'],[1,.73,.35,.26]);}continue;}const t=clamp(ms/act.active,0,1),pose=wind?weaponVisualPose(preview,act,elapsed):attackPose(preview,act,t),style=pose.overhead?'overhead':pose.thrust?'thrust':heavy?'heavy':'light',tail=1-clamp((ms-act.active)/ANIMATION.slash.tail,0,1),opacity=wind?.10:tail*.98,frame=wind?0:Math.min(ANIMATION.slash.frames-1,Math.floor(clamp(ms/(act.active+ANIMATION.slash.tail),0,.999)*ANIMATION.slash.frames)),color=a.enemy?[1,.49,.30]:heavy?[1,.79,.36]:[.82,.96,1],key='fx/slash-'+style+'-'+frame;
   if(pose.overhead){const flat=V.norm({x:act.dir.x,y:0,z:act.dir.z}),side={x:-flat.z,y:0,z:flat.x},center=V.add(pose.origin,V.scale(pose.dir,pose.reach*.68));this.slashPlane(sprites,center,V.scale(side,Math.min(1.5,act.reach*.43)),{x:flat.x*.28,y:Math.min(2.65,act.reach*.80),z:flat.z*.28},key,color,opacity,false);}
   else if(pose.thrust){const along=V.norm(V.sub(pose.tip,pose.origin)),up={x:0,y:1,z:0},center=V.add(pose.origin,V.scale(along,pose.reach*.58)),length=Math.max(.35,pose.reach*.88);this.slashPlane(sprites,center,V.scale(along,length),V.scale(up,heavy?.88:.50),key,color,opacity,false);}
   else{const flat=V.norm({x:pose.dir.x,y:0,z:pose.dir.z}),tangent={x:-flat.z,y:0,z:flat.x},sign=pose.sign,extent=Math.min(act.reach*(heavy?.86:.79),heavy?3.55:2.95),up=V.norm({x:flat.x*.22,y:1,z:flat.z*.22}),center=V.add(pose.origin,V.scale(pose.dir,pose.reach*.69));this.slashPlane(sprites,center,V.scale(tangent,extent),V.scale(up,extent*(heavy?.66:.48)),key,color,opacity,sign<0);}
   this.slashSamples.push({id:a.id,sequence:act.sequence,stage:wind?'wind':ms<act.active?'active':'tail',style,motion:pose.motion,combo:act.combo,sign:pose.sign,frame,origin:pose.origin,tip:pose.tip});}}
 draw(out,sprites,sim){if(!this.options.effects)return;this.runDust(sim);this.trails(out,sim);this.afterimages(sprites,sim);this.slashes(sprites,sim);const right=this.r.right||{x:1,y:0,z:0},up={x:0,y:1,z:0};for(const b of this.bursts){if(!this.r.worldVisualReady(b.point,.08))continue;const t=b.age/b.duration,opacity=Math.pow(1-t,1.55),r=b.size*(.35+t*.65);if(b.ground){this.groundArc(out,b.point,r,0,TAU,b.color,opacity*.72,.045*(1-t)+.015);continue;}const p=V.add(b.point,V.scale(b.normal,.018)),style=b.style||'light',frame=this.r.atlas.frames['fx/impact-'+style]||this.r.atlas.frames['fx/impact-light'],size=r*(style==='heavy'?1.32:1.08);this.r.sprite(sprites,{...p,y:p.y-size*.5},size,size,frame,[...b.color,opacity]);const rays=style==='heavy'?5:3;for(let i=0;i<rays;i++){const angle=(i/rays)*TAU+(b.seed%17)*.09,dir=V.add(V.scale(right,Math.cos(angle)),V.scale(up,Math.sin(angle))),outer=r*(.75+(i%2)*.35);this.line(out,V.add(p,V.scale(dir,r*.12)),V.add(p,V.scale(dir,outer)),(.055*(1-t)+.012),b.color,opacity*.8);}}
  for(const p of this.particles){if(!this.r.worldVisualReady(p.pos,.08))continue;const f=1-p.age/p.duration;if(p.kind==='dust'){const frame=Math.min(3,Math.floor((p.age/p.duration)*4)),size=p.size*(.72+(1-f)*.85);this.r.spritePlane(sprites,{...p.pos,y:p.pos.y+.012},{x:size,y:0,z:0},{x:0,y:0,z:size*.58},this.r.atlas.frames['fx/dust-'+frame],[...p.color,f*.34]);}else if(p.kind==='shard'){const size=p.size*(.65+f*.8);this.r.sprite(sprites,{...p.pos,y:p.pos.y-size*.5},size*2.2,size,this.r.atlas.frames['fx/shard'],[...p.color,Math.min(1,f*2)]);}else{const tail=V.sub(p.pos,V.scale(p.velocity,.025));this.line(out,tail,p.pos,p.size*f,p.color,Math.min(1,f*2));}}
  for(const g of this.ghosts){if(!this.r.worldVisualReady(g.pos,.12)||!this.r.companionRenderer.hasCharacter(g.kind))continue;const t=g.age/g.duration,sample={clip:'dead',frame:Math.min(4,Math.floor(t*5)),kind:g.kind,dir:0,flip:false};this.r.companionRenderer.queueCharacter({phase:'late',key:'ghost/'+g.id,kind:g.kind,sample,pos:{...g.pos,y:g.pos.y+.15*t},scale:g.scale*(1-t*.25),tint:[...g.tint.slice(0,3),1],alpha:Math.pow(1-t,1.5),whiteFlash:false});}}
}

function createBlockIcons(atlas,iconCanvases){
 const source=document.createElement('canvas');source.width=atlas.width;source.height=atlas.height;source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(atlas.data),atlas.width,atlas.height),0,0);
 const out={};for(let id=1;id<BLOCKS.length;id++){const c=document.createElement('canvas');c.width=40;c.height=44;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
  const tile=(face,matrix,shade=0)=>{const index=id*3+face;ctx.save();ctx.setTransform(...matrix);ctx.drawImage(source,index%8*32+8,Math.floor(index/8)*32+8,16,16,0,0,16,16);if(shade){ctx.fillStyle=`rgba(0,0,0,${shade})`;ctx.fillRect(0,0,16,16);}ctx.restore();};
  tile(1,[1.125,.5625,0,1.25,2,11],.24);tile(1,[1.125,-.5625,0,1.25,20,20],.10);tile(0,[1.125,.5625,-1.125,.5625,20,2]);out[id]=c.toDataURL('image/png');iconCanvases.set('block:'+id,c);
 }return out;
}
function createItemIcons(iconCanvases){const out={},S=2,size=16,materialColor=id=>MATERIALS[ITEMS[id]?.material]?.color||'#d9c79b',dark=hex=>{const n=parseInt(hex.slice(1),16),r=Math.max(0,(n>>16)-55),g=Math.max(0,((n>>8)&255)-55),b=Math.max(0,(n&255)-55);return'#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');};for(const [id,it] of Object.entries(ITEMS)){if(it.block)continue;const c=document.createElement('canvas');c.width=c.height=size*S;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;const px=(x,y,w,h,col)=>{ctx.fillStyle=col;ctx.fillRect(x*S,y*S,w*S,h*S);},mat=materialColor(id),edge=dark(mat),wood='#7a5237';ctx.clearRect(0,0,c.width,c.height);if(id==='bucket'||id==='waterBucket'){px(3,3,10,2,'#bfd4d9');px(3,4,2,8,'#9ca8a4');px(11,4,2,8,'#9ca8a4');px(5,11,6,2,'#bfc8c4');if(id==='waterBucket'){px(5,6,6,5,'#3e9fe2');px(6,6,4,2,'#79d7ef');}}else if(it.weapon||it.tool){const type=it.weapon||it.tool;if(type==='bow'){px(3,2,2,12,wood);px(5,1,1,2,mat);px(5,13,1,2,mat);px(5,3,1,10,'#dbc99b');}else if(type==='shield'){px(3,2,10,11,edge);px(4,2,8,9,mat);px(7,4,2,7,'#f0deb0');}else{px(7,7,2,8,wood);if(type==='pick'){px(3,3,10,2,edge);px(4,2,8,2,mat);}else if(type==='shovel'){px(5,2,6,5,edge);px(6,2,4,4,mat);}else if(type==='axe'){px(3,2,8,5,edge);px(4,2,6,4,mat);}else if(type==='spear'){px(7,1,2,8,mat);px(6,1,4,3,edge);}else if(type==='dagger'){px(7,2,2,7,mat);px(6,2,4,2,edge);px(5,8,6,2,'#d9b765');}else{px(7,type==='greatsword'?1:2,2,type==='greatsword'?10:8,mat);px(6,type==='greatsword'?1:2,4,3,edge);px(5,10,6,2,'#d9b765');}}}else if(it.armor){const shapes={helmet:[[3,3,10,3],[3,6,2,5],[11,6,2,5]],chest:[[4,2,8,3],[2,5,12,3],[4,8,8,6]],legs:[[4,2,8,6],[4,8,3,6],[9,8,3,6]],boots:[[3,5,4,7],[9,5,4,7],[2,11,5,3],[9,11,5,3]]}[it.armor];for(const [x,y,w,h]of shapes)px(x,y,w,h,edge);for(const [x,y,w,h]of shapes)if(w>2&&h>2)px(x+1,y+1,w-2,h-2,mat);}else{switch(id){case'coal':case'charcoal':px(5,4,6,7,'#282a2e');px(4,6,2,4,'#3d4246');break;case'rawIron':case'rawGold':px(4,4,8,8,id==='rawGold'?'#c99e39':'#b18d72');px(6,2,4,3,'#d8c09b');break;case'iron':case'gold':px(3,6,10,6,edge);px(4,4,8,7,mat);px(5,5,6,2,'#fff2bd');break;case'diamond':px(8,1,5,5,'#c9ffff');px(3,5,10,5,'#5ee0d9');px(6,10,4,5,'#45aaa8');break;case'stick':px(7,2,2,12,wood);break;case'fiber':for(let k=0;k<4;k++)px(3+k*2,3+k,2,10-k*2,'#8fc47d');break;case'leather':px(3,3,10,10,'#9d6847');px(5,2,6,2,'#c08a61');break;case'arrow':px(2,7,10,2,'#d4c398');px(11,5,3,6,'#d9dde0');px(2,5,3,6,'#8da969');break;case'seed':px(5,5,6,7,'#9c7a42');px(9,3,3,4,'#78b65a');break;case'food':px(4,4,8,9,'#d85d6f');px(6,2,4,3,'#82b85d');break;case'sigil':px(6,1,4,14,'#d6a95b');px(1,6,14,4,'#d6a95b');px(4,4,8,8,'#7766aa');px(6,6,4,4,'#ead48a');break;case'heart':px(3,4,4,4,'#e76573');px(9,4,4,4,'#e76573');px(5,7,6,6,'#c9445b');break;default:px(4,4,8,8,mat);px(6,2,4,4,edge);break;}}out[id]=c.toDataURL('image/png');iconCanvases.set(id,c);}return out;}

function createDropAtlas(iconCanvases){
 const CELL=64,SIZE=1024,c=document.createElement('canvas');c.width=c.height=SIZE;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;const frames={};let n=0;
 for(const [id,item]of Object.entries(ITEMS)){const sprite=item.block?iconCanvases.get('block:'+item.block):iconCanvases.get(id);if(!sprite)throw Error('아이템 텍스처 없음: '+id);
  const x=(n%16)*CELL,y=Math.floor(n/16)*CELL;if(y+CELL>SIZE)throw Error('드롭 텍스처 아틀라스 용량 초과');ctx.drawImage(sprite,x+8,y+8,48,48);
  frames[id]={u0:(x+7)/SIZE,u1:(x+57)/SIZE,v0:1-(y+7)/SIZE,v1:1-(y+57)/SIZE};n++;}
 return{canvas:c,frames};
}


