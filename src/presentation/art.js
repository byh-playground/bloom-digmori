/* 0.9.2 승인 스프라우틀링 아트를 유지. world physics와 무관한 생성 아틀라스. */
function createSpriteAtlas(gl){let c=document.createElement('canvas');c.width=2048;c.height=4096;let ctx=c.getContext('2d',{alpha:true});ctx.imageSmoothingEnabled=false;let textures={},index=0;const cols=32,CW=64,CH=64;const face='#ffe6bd',out='#322b39';
function fill(col){ctx.fillStyle=col}function poly(points,color,stroke=out,width=2){ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);ctx.closePath();ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineJoin='round';ctx.stroke()}}function rect(x,y,w,h,c){fill(c);ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}function dotc(x,y,r,c){ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=c;ctx.fill()}
function drawHead(kind,view,action,frame,motion){const back=view===3||view===4;let hood=kind==='sprout'?'#78c74a':kind==='fungus'?'#b38bea':kind==='flower'?'#f1a1b4':kind==='bug'?'#78c3d3':'#e7c34f';let hoodHi=kind==='sprout'?'#a6e96c':kind==='fungus'?'#d9a9eb':kind==='flower'?'#ffd1b7':kind==='bug'?'#b9e9e5':'#f7d770',hoodLo=kind==='sprout'?'#468f49':kind==='fungus'?'#8257a3':kind==='flower'?'#c36c90':kind==='bug'?'#3d8f9b':'#ab873e';
// head — one simple recognizable shape readable from a distance
if(kind==='sprout'){
 poly(view===2?[[10,24],[10,17],[14,10],[20,7],[28,8],[34,15],[37,21],[35,28],[26,31],[15,30]]:
      view===1?[[10,24],[10,17],[13,11],[20,7],[29,8],[36,14],[38,23],[34,29],[15,31]]:
      view===3?[[9,24],[10,16],[16,9],[25,7],[33,11],[36,19],[35,27],[28,31],[14,29]]:
      [[11,25],[9,19],[11,12],[15,8],[20,6],[29,8],[36,14],[37,23],[34,30],[15,31]],hood,out,2.5);
 poly(view===2?[[12,14],[20,9],[27,9],[31,12],[26,14],[14,17]]:[[14,12],[20,8],[27,8],[33,12],[29,14],[16,15]],hoodHi,null,0);
 poly([[11,25],[15,29],[32,29],[36,23],[33,25],[30,28],[17,27]],hoodLo,null,0);
 if(!back)poly(view===2?[[27,16],[32,17],[35,20],[36,23],[31,28],[27,27]]:
                  view===1?[[20,16],[32,17],[34,23],[31,28],[21,27],[17,22]]:
                  [[15,17],[31,17],[33,25],[29,29],[17,29],[14,25]],face,out,1.8);
 if(view===2){ // protruding side profile; back of hood remains a visible dark silhouette
   poly([[10,20],[14,27],[26,30],[25,26],[24,16],[19,13]],hoodLo,null);
   poly([[32,22],[37,24],[32,26]],face,out,1.3);
 }
 // stalk + two leaves with secondary animation
 let wobble=Math.sin(motion*TAU)*1.8;rect(22,3,2,5,'#397a42');poly([[23,5],[18+wobble,3],[16+wobble,-1],[22+wobble,0],[25,3]],'#8dd854','#376b39',1);poly([[24,4],[30-wobble,0],[32-wobble,1],[29-wobble,5]],'#b6ed6c','#376b39',1);
}else if(kind==='fungus'){
 poly([[15,22],[15,14],[21,10],[30,12],[33,18],[32,29],[17,30]],face,out,2);poly([[6,17],[9,10],[15,6],[25,3],[34,7],[40,15],[41,21],[10,22]],hood,out,2.5);poly([[11,13],[16,8],[29,7],[35,12]],hoodHi,null,0);dotc(18,13,2.2,'#fff1ce');dotc(29,16,2,'#fff1ce');
}else if(kind==='flower'){
 poly([[12,16],[18,10],[29,11],[35,17],[34,28],[15,29]],face,out,2);for(let a=0;a<5;a++){let ang=a*TAU/5-.9;dotc(24+Math.cos(ang)*11,16+Math.sin(ang)*10,6,hood)}dotc(24,16,8,hoodHi);
}else{poly([[12,14],[15,8],[32,9],[36,17],[33,29],[15,29]],hood,out,2.4);poly([[16,11],[32,12],[31,17],[16,18]],hoodHi,null,0);if(kind==='bug'){rect(18,3,2,7,out);rect(30,3,2,7,out);dotc(19,3,2,hoodLo);dotc(31,3,2,hoodLo)}else{rect(21,4,3,5,out);dotc(23,4,3,'#ffdb75')} }
 if(!back){
    let eyeX=view===2?30:view===1?27:20;
    rect(eyeX,20,view===2?2:3,4,out);
    if(view===0)rect(28,20,3,4,out);
    if(action==='hurt')rect(eyeX,20,3,2,out);
    if(kind==='sprout'){
       if(view===0){rect(18,26,3,2,'#f4ac9f');rect(30,26,2,2,'#f4ac9f')}
       if(view===1)rect(20,25,3,2,'#f4ac9f');
    }
 }
}
function make(kind,dir,action,frame){let cx=24,cy=27;let view=dir>=5?8-dir:dir;let side=(view===1||view===2||view===3),back=(view===3||view===4),front=(view===0||view===1);let right=1;
const art=clipArtPose(action,frame),motion=frame/(ANIMATION.clips[action]||4),walk=action==='walk'||action==='run',stride=art.stride,bob=art.bob;
ctx.save();ctx.translate(cx,48);ctx.rotate(art.lean);ctx.scale(1+(1-art.squash)*.25,art.squash);ctx.translate(-cx,-48-bob);
let hood=kind==='sprout'?'#78c74a':kind==='fungus'?'#b38bea':kind==='flower'?'#f1a1b4':kind==='bug'?'#78c3d3':'#e7c34f';let hoodHi=kind==='sprout'?'#a6e96c':kind==='fungus'?'#d9a9eb':kind==='flower'?'#ffd1b7':kind==='bug'?'#b9e9e5':'#f7d770',hoodLo=kind==='sprout'?'#468f49':kind==='fungus'?'#8257a3':kind==='flower'?'#c36c90':kind==='bug'?'#3d8f9b':'#ab873e';
// small ground-independent body and stepping feet
poly([[17,29],[31,29],[34,38],[31,45],[17,45],[14,38]],kind==='bug'?'#517d9a':'#e9e7d1',out,2);poly([[15,32],[23,35],[32,31],[30,42],[17,42]],kind==='sprout'?'#a7d874':hoodLo,out,1.5);
let footY=48;const knee=art.knee;
function limb(x,y,kx,ky,ex,ey,color,width=4){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(kx,ky);ctx.lineTo(ex,ey);ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=out;ctx.lineWidth=width+2.5;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
limb(19,39,19+stride*.5,44-knee,18+stride,footY-Math.max(0,stride)*.28,'#564538',4);
limb(28,39,28-stride*.5,44-knee,28-stride,footY-Math.max(0,-stride)*.28,'#564538',4);
rect(15+stride,footY-1-Math.max(0,stride)*.28,7,3,'#473849');rect(25-stride,footY-1-Math.max(0,-stride)*.28,7,3,'#473849');
limb(14,32,(14+art.armL[0])*.5-2,(32+art.armL[1])*.5,art.armL[0],art.armL[1],face,3.4);
limb(33,32,(33+art.armR[0])*.5+2,(32+art.armR[1])*.5,art.armR[0],art.armR[1],face,3.4);
if(view===1||view===2){poly([[14,30],[19,27],[19,38],[16,41],[11,36]],'#9d724c',out,2);rect(13,33,2,5,'#d0a45f')}
drawHead(kind,view,action,frame,motion);
 if(back && kind==='sprout'){
   // Strap and pack on back, different from side-profile pack.
   poly(view===4?[[17,29],[31,29],[33,38],[29,41],[19,41],[15,38]]:
                 [[15,29],[25,29],[28,38],[21,41],[13,39]],'#8d6748',out,2);
   rect(view===4?22:17,32,7,6,'#cda769');
   rect(view===4?25:19,33,2,3,'#ffdfa0');
 }
if(!back&&['light','lightReverse','heavy','heavyReverse','overhead','thrust','thrustReverse','bow','bash','guard','charge'].includes(action)){limb(14,32,(14+art.armL[0])*.5-2,(32+art.armL[1])*.5,art.armL[0],art.armL[1],face,3.4);limb(33,32,(33+art.armR[0])*.5+2,(32+art.armR[1])*.5,art.armR[0],art.armR[1],face,3.4);}
ctx.restore();}
function add(kind,dir,action,frame){let key=kind+'/'+dir+'/'+action+'/'+frame;let x=(index%cols)*CW,y=Math.floor(index/cols)*CH;
ctx.save();ctx.beginPath();ctx.rect(x,y,CW,CH);ctx.clip();ctx.translate(x,y);
if(action.startsWith('roll'))makeRoll(dir,+action.slice(4),frame);else{ctx.translate(8,11);make(kind,dir,action,frame);}ctx.restore();
textures[key]={x,y,w:CW,h:CH};index++;}
// Directional tumble atlas: rotate a tucked joint model around UP x travel, not the billboard.
// Head art comes from the same approved sprout drawing, with front/back selected after rotation.
const rollHeads=new Map();
function headCanvas(view){if(rollHeads.has(view))return rollHeads.get(view);const save=ctx,head=document.createElement('canvas');head.width=48;head.height=36;ctx=head.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.save();if(view>=5){ctx.translate(48,0);ctx.scale(-1,1);}ctx.translate(0,3);drawHead('sprout',view>=5?8-view:view,'idle',0,0);ctx.restore();ctx=save;rollHeads.set(view,head);return head;}
function makeRoll(view,variant,frame){if(frame===0||frame===ANIMATION.rollFrames-1){ctx.save();ctx.translate(8,11);make('sprout',view,'idle',0);ctx.restore();return;}const p=frame/(ANIMATION.rollFrames-1),f={x:Math.sin(view*Math.PI/4),y:0,z:Math.cos(view*Math.PI/4)},right={x:-f.z,y:0,z:f.x},relative=variant*Math.PI/4;
 const travel=V.add(V.scale(f,Math.cos(relative)),V.scale(right,Math.sin(relative))),axis={x:travel.z,y:0,z:-travel.x};
 const turn=easeMotion((p-.08)/.80)*TAU,tuck=Math.min(easeMotion(p/.18),easeMotion((1-p)/.18)),cs=Math.cos(turn),sn=Math.sin(turn);
 const rot=v=>{const cr={x:axis.y*v.z-axis.z*v.y,y:axis.z*v.x-axis.x*v.z,z:axis.x*v.y-axis.y*v.x},d=V.dot(axis,v);return V.add(V.add(V.scale(v,cs),V.scale(cr,sn)),V.scale(axis,d*(1-cs)));};
 const at=(x,y,z)=>rot(V.add(V.add(V.scale(right,x),{x:0,y,z:0}),V.scale(f,z)));
 const baseY=45-3*tuck,project=v=>({x:32+v.x,y:baseY-v.y+v.z*.20,z:v.z});
 const shapes=[];
 function oval(v,rx,ry,color){shapes.push({z:v.z,draw:()=>{const q=project(v);ctx.beginPath();ctx.ellipse(q.x,q.y,rx,ry,0,0,TAU);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=1.8;ctx.strokeStyle=out;ctx.stroke();}});}
 function bone(a,b,color,width){shapes.push({z:(a.z+b.z)*.5,draw:()=>{const q=project(a),r=project(b);ctx.lineCap='round';ctx.strokeStyle=out;ctx.lineWidth=width+2.4;ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(r.x,r.y);ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}});}
 // Body curls toward travel while feet fold to the chest. Distinct silhouette at every quarter turn.
 const chest=at(0,2,0),hip=at(0,-5+3*tuck,-1),headPos=at(0,14-8*tuck,2*tuck);
 oval(chest,8.5,8,'#a7d874');oval(at(0,3,-6),6,6,'#9d724c');
 for(const side of [-1,1]){const shoulder=at(side*6,3,0),elbow=at(side*(8-2*tuck),-3+6*tuck,2+3*tuck),hand=at(side*(9-4*tuck),-7+12*tuck,5*tuck),knee=at(side*4,-9+6*tuck,6*tuck),foot=at(side*5,-14+12*tuck,8*tuck);
  bone(shoulder,elbow,'#dfe2c0',4);bone(elbow,hand,face,3.4);bone(hip,knee,'#645141',4);bone(knee,foot,'#564538',4.8);oval(foot,3.5,2.7,'#473849');}
 const normal=rot(f),headView=(Math.round(Math.atan2(normal.x,normal.z)/(Math.PI/4))+8)%8,headImage=headCanvas(headView),up=rot({x:0,y:1,z:0}),qx=-up.y+up.z*.20,angle=Math.atan2(up.x,-qx);
 shapes.push({z:headPos.z+.5,draw:()=>{const q=project(headPos),scale=1-tuck*.20;ctx.save();ctx.translate(q.x,q.y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.drawImage(headImage,4,0,40,35,-20,-18,40,35);ctx.restore();}});
 shapes.sort((a,b)=>a.z-b.z);for(const s of shapes)s.draw();
}

for(const kind of ['sprout','fungus','bug'])for(let d=0;d<5;d++)for(const [a,n]of Object.entries(ANIMATION.clips)){if(kind!=='sprout'&&(['run','brake','charge','guard','gather','bash'].includes(a)||a.endsWith('Reverse')))continue;for(let f=0;f<n;f++)add(kind,d,a,f);}
for(let d=0;d<5;d++)for(let k=0;k<8;k++)for(let f=0;f<ANIMATION.rollFrames;f++)add('sprout',d,'roll'+k,f);
// Unused decorative species retain their original walk frames for saved NPC kinds.
for(const kind of ['flower','bee'])for(let d=0;d<5;d++)for(let f=0;f<3;f++)add(kind,d,'walk',f);
function addEffect(name,draw){let x=(index%cols)*CW,y=Math.floor(index/cols)*CH;ctx.save();ctx.translate(x,y);if(!name.startsWith('slash-'))ctx.translate(8,4);draw();ctx.restore();textures['fx/'+name]={x,y,w:CW,h:CH};index++}
addEffect('spark',()=>{poly([[24,9],[27,22],[39,15],[32,28],[45,31],[31,36],[28,49],[21,37],[8,42],[17,30],[7,22],[21,24]],'#ffffff',null)});
addEffect('impact-light',()=>{poly([[24,4],[28,22],[43,12],[34,27],[51,30],[33,35],[38,50],[26,39],[16,55],[18,37],[3,40],[16,29],[5,18],[21,23]],'#ffffff',null);rect(21,26,8,8,'#ffffff')});
addEffect('impact-heavy',()=>{for(let a=0;a<12;a++){const ang=a*TAU/12+(a%2)*.08,r=a%2?23:28,w=a%3?3:5;ctx.save();ctx.translate(24,28);ctx.rotate(ang);poly([[0,-w],[r,-1],[r+5,1],[0,w]],'#ffffff',null);ctx.restore();}dotc(24,28,8,'#ffffff')});
addEffect('impact-guard',()=>{ctx.lineWidth=5;ctx.strokeStyle='#ffffff';ctx.beginPath();ctx.arc(24,28,17,-2.5,.45);ctx.stroke();ctx.beginPath();ctx.arc(24,28,11,.6,3.4);ctx.stroke();for(let a=0;a<6;a++){const ang=a*TAU/6;ctx.save();ctx.translate(24,28);ctx.rotate(ang);rect(15,-2,8,4,'#ffffff');ctx.restore();}});
addEffect('impact-break',()=>{ctx.lineWidth=4;ctx.strokeStyle='#ffffff';ctx.beginPath();ctx.arc(24,28,20,0,TAU);ctx.stroke();for(let a=0;a<9;a++){const ang=a*TAU/9+.12;ctx.save();ctx.translate(24,28);ctx.rotate(ang);poly([[8,-2],[28,0],[12,3]],'#ffffff',null);ctx.restore();}});
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

const usedHeight=2**Math.ceil(Math.log2(Math.ceil(index/cols)*CH));if(usedHeight>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw Error('스프라이트 아틀라스 크기를 지원하지 않는 GPU');
const trimmed=document.createElement('canvas');trimmed.width=c.width;trimmed.height=usedHeight;trimmed.getContext('2d').drawImage(c,0,0);c=trimmed;
for(const f of Object.values(textures))Object.assign(f,{u0:f.x/c.width,v0:1-f.y/c.height,u1:(f.x+f.w)/c.width,v1:1-(f.y+f.h)/c.height});
const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return {tex,frames:textures,count:index,canvas:c}}


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
function createBlockAtlas(gl){
 const atlas=buildBlockAtlas(),tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,atlas.width,atlas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,atlas.data);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 return {...atlas,tex};
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
 effectStyle(e,heavy){if(e.type==='guard')return'guard';if(e.guardBreak||e.stagger)return'break';if(heavy)return'heavy';return'light';}
 emitDust(e,count,scale=1){const seed=hashStr(e.id),dir=e.direction||{x:0,y:0,z:0};for(let i=0;i<count;i++){const h=hash3(seed,i,77),a=(h%6283)/1000,r=.35+((h>>>8)%100)/120;this.particles.push({kind:'dust',pos:{x:e.pos.x+Math.cos(a)*.08,y:e.pos.y+.025,z:e.pos.z+Math.sin(a)*.08},velocity:{x:Math.cos(a)*r+dir.x*.18,y:.05,z:Math.sin(a)*r+dir.z*.18},age:0,duration:170+(h%120),size:(.48+((h>>>16)%50)/100)*scale,color:[.76,.76,.61],gravity:0});}}
 event(e,sim,local){if(e.type==='attack-hit'||e.type==='windup'||e.type==='swing')return;const target=sim.actors[e.actorId],position=e.point||V.add(e.pos,{x:0,y:target?.offset||.8,z:0}),near=V.len(V.sub(position,sim.actors[local]?.pos||position))<27;if(!near)return;
  const confirmed=e.type==='hit'||e.type==='guard',heavy=e.heavy||e.stagger||e.lethal,style=this.effectStyle(e,heavy),color=style==='guard'?[.52,.84,1]:style==='break'?[1,.62,.18]:style==='heavy'?[1,.72,.25]:e.type==='wall'||e.type==='spark'?[.90,.81,.64]:[1,.91,.70];
  if(confirmed||e.type==='wall'||e.type==='spark'){const seed=hashStr(e.id),b={age:0,duration:style==='break'?340:heavy?280:210,point:{...position},normal:e.normal||{x:0,y:1,z:0},color,heavy,guard:e.type==='guard',style,size:style==='break'?1.25:heavy?.96:.66,seed};this.bursts.push(b);
   const count=style==='guard'?7:style==='break'?15:heavy?12:7;for(let i=0;i<count;i++){const h=hash3(seed,i,1),u=((h&1023)/511.5-1),v=(((h>>>10)&1023)/511.5-1),w=(((h>>>20)&1023)/1023),n=b.normal;this.particles.push({kind:i%3?'shard':'streak',pos:{...position},velocity:{x:u*(heavy?4.8:3.5)+n.x*2.2,y:w*(heavy?4.7:3.5)+n.y*1.5+.45,z:v*(heavy?4.8:3.5)+n.z*2.2},age:0,duration:150+(h%190),size:.045+(h%5)*.012,color,gravity:7.5});}}
  if(confirmed){this.reactions.set(e.actorId,{age:0,heavy,dir:e.direction||{x:0,y:0,z:1},guard:e.blocked});const source=sim.actors[e.sourceId];if(source?.combat.state==='attack')this.holds.set(source.id,{left:heavy?CFG.combat.feedback.heavyHold:CFG.combat.feedback.poseHold,elapsed:source.combat.elapsed,sequence:source.combat.action.sequence});if(e.sourceId===local){this.marker={until:this.clock+170,heavy,color};this.shake=Math.min(1.25,this.shake+(e.blocked?.18:heavy?.68:.36));}if(e.actorId===local){this.hurt=Math.min(1,this.hurt+.8);this.shake=Math.min(1.25,this.shake+.65);}if(e.sourceId===local||e.actorId===local)this.number(e,position,color,heavy);}
  if(e.type==='roll'&&!e.airborne)this.emitDust({...e,direction:target?.combat?.action?.dir},8,.85);if(e.type==='land')this.emitDust(e,10,1.05);
  if(e.type==='stagger'){this.bursts.push({age:0,duration:350,point:{...e.pos,y:e.pos.y+.55},normal:{x:0,y:1,z:0},style:'break',color:[1,.68,.25],size:1.35,heavy:true,seed:hashStr(e.id)});this.bursts.push({age:0,duration:310,point:{...e.pos,y:e.pos.y+.035},ground:true,color:[1,.69,.32],size:1.5,heavy:true,seed:hashStr(e.id)});}
  if(e.type==='burst')this.bursts.push({age:0,duration:450,point:{...e.pos,y:e.pos.y+.05},ground:true,color:[.90,.42,.65],size:e.radius||4,heavy:true,seed:hashStr(e.id)});
  if(e.type==='evade'&&(e.sourceId===local||e.actorId===local))this.number({...e,damage:null,label:'회피'},position,[.65,.88,.93],false);
  if(e.type==='death'){const scale=target?.scale||1;this.ghosts.push({age:0,duration:380,pos:{...e.pos},scale,kind:target?.enemy?ENEMIES[target.kind].kind:'sprout',tint:target?.enemy?ENEMIES[target.kind].tint:[1,1,1,1]});const seed=hashStr(e.id);for(let i=0;i<14;i++){const h=hash3(seed,i,9);this.particles.push({kind:'shard',pos:{...e.pos,y:e.pos.y+scale},velocity:{x:((h%31)-15)*.16,y:1.7+(h%6)*.35,z:(((h>>>8)%31)-15)*.16},age:0,duration:320+h%180,size:.065+h%4*.018,color:[.74,.88,.51],gravity:3});}}
  while(this.particles.length>CFG.combat.feedback.particles)this.particles.shift();while(this.bursts.length>CFG.combat.feedback.bursts)this.bursts.shift();}
 runDust(sim){const live=new Set();for(const a of Object.values(sim.actors)){if(a.enemy||a.dead||a.suspended||!a.sprinting||!a.grounded)continue;live.add(a.id);const step=Math.floor((a.motion?.distance||0)/1.05),prev=this.runSteps.get(a.id);if(prev===undefined){this.runSteps.set(a.id,step);continue;}if(step!==prev){this.runSteps.set(a.id,step);const dir=V.norm({x:a.velocity.x,y:0,z:a.velocity.z});this.emitDust({id:'run:'+a.id+':'+step,pos:{...a.pos},direction:V.scale(dir,-.35)},2,.46);}}for(const id of this.runSteps.keys())if(!live.has(id))this.runSteps.delete(id);}
 number(e,point,color,heavy){if(!this.options.numbers)return;const parent=document.getElementById('combat-floats');if(!parent)return;if(this.numbers.length>=CFG.combat.feedback.numbers)this.numbers.shift().node.remove();const node=document.createElement('div');node.className='combat-number'+(heavy?' heavy':'')+(e.blocked?' guarded':'');const label=e.label||(e.guardBreak?'방어 붕괴':e.stagger?'강인도 붕괴':e.lethal?'처치':e.blocked?'방어':'');const main=document.createElement('b');main.textContent=e.damage==null?label:String(e.damage);node.append(main);if(label&&e.damage!=null){const small=document.createElement('small');small.textContent=label;node.append(small);}node.style.color='rgb('+color.map(x=>Math.round(x*255)).join(',')+')';parent.append(node);this.numbers.push({node,age:0,duration:heavy?800:680,point:{...point},lane:(hashStr(e.id)%5-2)*12,heavy});}
 cameraOffset(){if(!this.options.shake||this.shake<=0)return ZERO_VECTOR;const a=CFG.combat.feedback.shake*this.shake*this.shake,t=this.clock;return{x:this.r.right?.x*a*Math.sin(t*.13)||0,y:a*.65*Math.cos(t*.17),z:this.r.right?.z*a*Math.sin(t*.13)||0};}
 ui(){for(const n of this.numbers){if(!this.r.worldVisualReady(n.point,.08)){n.node.hidden=true;continue;}const t=n.age/n.duration,p=this.r.projected(V.add(n.point,{x:0,y:.12+t*.7,z:0}));if(!p){n.node.hidden=true;continue;}n.node.hidden=false;const pop=t<.15?lerp(.65,n.heavy?1.45:1.22,t/.15):lerp(n.heavy?1.45:1.22,1,clamp((t-.15)/.20,0,1));n.node.style.transform=`translate(${p.x+n.lane*t}px,${p.y-16-Math.sin(t*Math.PI)*9}px) translate(-50%,-100%) scale(${pop})`;n.node.style.opacity=String(clamp((1-t)/.26,0,1));}const marker=document.getElementById('hit-confirm');if(marker){const t=this.marker?(this.marker.until-this.clock)/170:0;marker.style.opacity=String(clamp(t*2,0,1));marker.style.transform=`translate(-50%,-50%) scale(${this.marker?.heavy?1.25+.3*t:1+.2*t})`;if(this.marker)marker.style.color='rgb('+this.marker.color.map(c=>Math.round(c*255)).join(',')+')';}const vignette=document.getElementById('hurt-vignette');if(vignette)vignette.style.opacity=String(this.hurt*.65);}
 line(out,a,b,width,color,alpha=1){const dir=V.sub(b,a),eye=V.sub(this.r.eye||{x:0,y:10,z:10},a),side=V.norm({x:dir.y*eye.z-dir.z*eye.y,y:dir.z*eye.x-dir.x*eye.z,z:dir.x*eye.y-dir.y*eye.x}),s=V.scale(side,width*.5),points=[V.add(a,s),V.add(b,s),V.sub(b,s),V.sub(a,s)];for(const i of [0,1,2,0,2,3])out.push(points[i].x,points[i].y,points[i].z,...color,alpha);}
 groundArc(out,pos,radius,start,end,color,alpha,width=.025){const segments=Math.max(4,Math.ceil(Math.abs(end-start)*12));for(let i=0;i<segments;i++){const a=lerp(start,end,i/segments),b=lerp(start,end,(i+1)/segments);this.line(out,{x:pos.x+Math.sin(a)*radius,y:pos.y,z:pos.z+Math.cos(a)*radius},{x:pos.x+Math.sin(b)*radius,y:pos.y,z:pos.z+Math.cos(b)*radius},width,color,alpha);}}
 trails(out,sim){if(!this.options.debugGround)return;for(const a of Object.values(sim.actors)){const c=a.combat,act=c.action;if(a.dead||!a.enemy||c.state!=='attack'||c.elapsed>=act.wind)continue;const rp=a.pos,yaw=Math.atan2(act.dir.x,act.dir.z),arc=act.kind==='burst'?TAU:act.arc||1.5;this.groundArc(out,{...rp,y:rp.y+.035},act.reach,yaw-arc*.5,yaw+arc*.5,[1,.44,.31],.32,.025);}}
 afterimages(sprites,sim){this.afterimageSamples=[];for(const raw of Object.values(sim.actors)){if(raw.dead||raw.suspended||!this.r.entityVisualReady(raw))continue;const a=this.pose(raw),c=a.combat,act=c.action;let strength=0,dir=null;if(c.state==='attack'&&act){if(act.companionId)continue;const timing=actionTiming(act,c.elapsed);if(timing.stage!=='active')continue;strength=.55+.45*Math.sin(clamp(timing.phase,0,1)*Math.PI);dir=V.norm({x:act.dir.x,y:0,z:act.dir.z});}else if(c.state==='roll'&&act){const p=clamp(c.elapsed/act.duration,0,1);if(p<.06||p>.88)continue;strength=Math.sin(p*Math.PI);dir=V.norm(act.dir);}else continue;const sample=actorSpritePose(a,this.r.camera.yaw,this.reactions.get(a.id)),frame=this.r.atlas.frames[sample.kind+'/'+sample.dir+'/'+sample.clip+'/'+sample.frame];if(!frame)continue;const rp=raw.pos,scale=a.scale||1,count=Math.max(1,Math.round(CFG.combat.feedback.afterimages*strength));for(let i=count;i>=1;i--){const d=.07+i*.10+(c.state==='roll'?i*.05:0),pos=V.sub(rp,V.scale(dir,d)),alpha=(.13+.06*(count-i))*strength,tint=a.enemy?[1,.42,.28,alpha]:[.72,.92,1,alpha];this.r.sprite(sprites,pos,1.65*64/48*scale,2*64/56*scale,frame,tint,sample.flip,0);this.afterimageSamples.push({id:a.id,state:c.state,index:i,alpha});}}}
 slashPlane(sprites,center,u,v,key,color,opacity,flip=false){const ghost=this.r.atlas.frames[key.replace(/-(\d+)$/,(_,n)=>'-'+Math.max(0,+n-2))]||this.r.atlas.frames[key],frame=this.r.atlas.frames[key];if(!frame)return;this.r.spritePlane(sprites,center,V.scale(u,1.10),V.scale(v,1.10),ghost,[color[0]*.72,color[1]*.78,color[2],opacity*.20],flip);this.r.spritePlane(sprites,center,u,v,frame,[...color,opacity*.88],flip);this.r.spritePlane(sprites,center,V.scale(u,.76),V.scale(v,.76),frame,[1,1,.94,Math.min(1,opacity*.72)],flip);}
 slashes(sprites,sim){this.slashSamples=[];for(const raw of Object.values(sim.actors)){if(raw.dead||raw.suspended||!this.r.entityVisualReady(raw))continue;const a=this.pose(raw),c=a.combat,act=c.action;if(c.state!=='attack'||!act)continue;if(act.companionId)continue;const elapsed=c.elapsed,ms=elapsed-act.wind,wind=ms<0;if(ms<-ANIMATION.slash.windup||ms>act.active+ANIMATION.slash.tail)continue;const position=raw.pos,preview={...a,pos:position},heavy=['heavy','heavyReverse','overhead'].includes(attackClip(act));if(['arrow','spit','precision','quickshot','burst'].includes(act.kind)){if(wind){const p=V.add(position,{x:0,y:a.offset*1.65,z:0}),size=.26+.12*(1+ms/ANIMATION.slash.windup);this.r.sprite(sprites,{...p,y:p.y-size/2},size,size,this.r.atlas.frames['fx/spark'],[1,.73,.35,.26]);}continue;}const t=clamp(ms/act.active,0,1),pose=wind?weaponVisualPose(preview,act,elapsed):attackPose(preview,act,t),style=pose.overhead?'overhead':pose.thrust?'thrust':heavy?'heavy':'light',tail=1-clamp((ms-act.active)/ANIMATION.slash.tail,0,1),opacity=wind?.10:tail*.98,frame=wind?0:Math.min(ANIMATION.slash.frames-1,Math.floor(clamp(ms/(act.active+ANIMATION.slash.tail),0,.999)*ANIMATION.slash.frames)),color=a.enemy?[1,.49,.30]:heavy?[1,.79,.36]:[.82,.96,1],key='fx/slash-'+style+'-'+frame;
   if(pose.overhead){const flat=V.norm({x:act.dir.x,y:0,z:act.dir.z}),side={x:-flat.z,y:0,z:flat.x},center=V.add(pose.origin,V.scale(pose.dir,pose.reach*.68));this.slashPlane(sprites,center,V.scale(side,Math.min(1.5,act.reach*.43)),{x:flat.x*.28,y:Math.min(2.65,act.reach*.80),z:flat.z*.28},key,color,opacity,false);}
   else if(pose.thrust){const along=V.norm(V.sub(pose.tip,pose.origin)),up={x:0,y:1,z:0},center=V.add(pose.origin,V.scale(along,pose.reach*.58)),length=Math.max(.35,pose.reach*.88);this.slashPlane(sprites,center,V.scale(along,length),V.scale(up,heavy?.88:.50),key,color,opacity,false);}
   else{const flat=V.norm({x:pose.dir.x,y:0,z:pose.dir.z}),tangent={x:-flat.z,y:0,z:flat.x},sign=pose.sign,extent=Math.min(act.reach*(heavy?.86:.79),heavy?3.55:2.95),up=V.norm({x:flat.x*.22,y:1,z:flat.z*.22}),center=V.add(pose.origin,V.scale(pose.dir,pose.reach*.69));this.slashPlane(sprites,center,V.scale(tangent,extent),V.scale(up,extent*(heavy?.66:.48)),key,color,opacity,sign<0);}
   this.slashSamples.push({id:a.id,sequence:act.sequence,stage:wind?'wind':ms<act.active?'active':'tail',style,motion:pose.motion,combo:act.combo,sign:pose.sign,frame,origin:pose.origin,tip:pose.tip});}}
 draw(out,sprites,sim){if(!this.options.effects)return;this.runDust(sim);this.trails(out,sim);this.afterimages(sprites,sim);this.slashes(sprites,sim);const right=this.r.right||{x:1,y:0,z:0},up={x:0,y:1,z:0};for(const b of this.bursts){if(!this.r.worldVisualReady(b.point,.08))continue;const t=b.age/b.duration,opacity=Math.pow(1-t,1.55),r=b.size*(.35+t*.65);if(b.ground){this.groundArc(out,b.point,r,0,TAU,b.color,opacity*.72,.045*(1-t)+.015);continue;}const p=V.add(b.point,V.scale(b.normal,.018)),style=b.style||'light',frame=this.r.atlas.frames['fx/impact-'+style]||this.r.atlas.frames['fx/impact-light'],size=r*(style==='break'?1.55:style==='heavy'?1.32:1.08);this.r.sprite(sprites,{...p,y:p.y-size*.5},size,size,frame,[...b.color,opacity]);const rays=style==='guard'?3:style==='break'?6:style==='heavy'?5:3;for(let i=0;i<rays;i++){const angle=(i/rays)*TAU+(b.seed%17)*.09,dir=V.add(V.scale(right,Math.cos(angle)),V.scale(up,Math.sin(angle))),outer=r*(.75+(i%2)*.35);this.line(out,V.add(p,V.scale(dir,r*.12)),V.add(p,V.scale(dir,outer)),(.055*(1-t)+.012),b.color,opacity*.8);}if(b.guard){const g=r*.78;for(let i=0;i<10;i++){const a=i*TAU/10,c=(i+1)*TAU/10;this.line(out,V.add(p,V.add(V.scale(right,Math.cos(a)*g),V.scale(up,Math.sin(a)*g))),V.add(p,V.add(V.scale(right,Math.cos(c)*g),V.scale(up,Math.sin(c)*g))),.022,b.color,opacity*.75);}}}
  for(const p of this.particles){if(!this.r.worldVisualReady(p.pos,.08))continue;const f=1-p.age/p.duration;if(p.kind==='dust'){const frame=Math.min(3,Math.floor((p.age/p.duration)*4)),size=p.size*(.72+(1-f)*.85);this.r.spritePlane(sprites,{...p.pos,y:p.pos.y+.012},{x:size,y:0,z:0},{x:0,y:0,z:size*.58},this.r.atlas.frames['fx/dust-'+frame],[...p.color,f*.34]);}else if(p.kind==='shard'){const size=p.size*(.65+f*.8);this.r.sprite(sprites,{...p.pos,y:p.pos.y-size*.5},size*2.2,size,this.r.atlas.frames['fx/shard'],[...p.color,Math.min(1,f*2)]);}else{const tail=V.sub(p.pos,V.scale(p.velocity,.025));this.line(out,tail,p.pos,p.size*f,p.color,Math.min(1,f*2));}}
  for(const g of this.ghosts){if(!this.r.worldVisualReady(g.pos,.12))continue;const t=g.age/g.duration,frame=this.r.atlas.frames[g.kind+'/0/dead/'+Math.min(4,Math.floor(t*5))];if(frame)this.r.sprite(sprites,{...g.pos,y:g.pos.y+.15*t},1.65*64/48*g.scale*(1-t*.25),2*64/56*g.scale*(1-t*.25),frame,[...g.tint.slice(0,3),Math.pow(1-t,1.5)],false,0);}}
}

function createBlockIcons(atlas,iconCanvases){
 const source=document.createElement('canvas');source.width=atlas.width;source.height=atlas.height;source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(atlas.data),atlas.width,atlas.height),0,0);
 const out={};for(let id=1;id<BLOCKS.length;id++){const c=document.createElement('canvas');c.width=40;c.height=44;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
  const tile=(face,matrix,shade=0)=>{const index=id*3+face;ctx.save();ctx.setTransform(...matrix);ctx.drawImage(source,index%8*32+8,Math.floor(index/8)*32+8,16,16,0,0,16,16);if(shade){ctx.fillStyle=`rgba(0,0,0,${shade})`;ctx.fillRect(0,0,16,16);}ctx.restore();};
  tile(1,[1.125,.5625,0,1.25,2,11],.24);tile(1,[1.125,-.5625,0,1.25,20,20],.10);tile(0,[1.125,.5625,-1.125,.5625,20,2]);out[id]=c.toDataURL('image/png');iconCanvases.set('block:'+id,c);
 }return out;
}
function createItemIcons(iconCanvases){const out={},S=2,size=16,materialColor=id=>MATERIALS[ITEMS[id]?.material]?.color||'#d9c79b',dark=hex=>{const n=parseInt(hex.slice(1),16),r=Math.max(0,(n>>16)-55),g=Math.max(0,((n>>8)&255)-55),b=Math.max(0,(n&255)-55);return'#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');};for(const [id,it] of Object.entries(ITEMS)){if(it.block)continue;const c=document.createElement('canvas');c.width=c.height=size*S;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;const px=(x,y,w,h,col)=>{ctx.fillStyle=col;ctx.fillRect(x*S,y*S,w*S,h*S);},mat=materialColor(id),edge=dark(mat),wood='#7a5237';ctx.clearRect(0,0,c.width,c.height);if(id==='bucket'||id==='waterBucket'){px(3,3,10,2,'#bfd4d9');px(3,4,2,8,'#9ca8a4');px(11,4,2,8,'#9ca8a4');px(5,11,6,2,'#bfc8c4');if(id==='waterBucket'){px(5,6,6,5,'#3e9fe2');px(6,6,4,2,'#79d7ef');}}else if(it.weapon||it.tool){const type=it.weapon||it.tool;if(type==='bow'){px(3,2,2,12,wood);px(5,1,1,2,mat);px(5,13,1,2,mat);px(5,3,1,10,'#dbc99b');}else if(type==='shield'){px(3,2,10,11,edge);px(4,2,8,9,mat);px(7,4,2,7,'#f0deb0');}else{px(7,7,2,8,wood);if(type==='pick'){px(3,3,10,2,edge);px(4,2,8,2,mat);}else if(type==='shovel'){px(5,2,6,5,edge);px(6,2,4,4,mat);}else if(type==='axe'){px(3,2,8,5,edge);px(4,2,6,4,mat);}else if(type==='spear'){px(7,1,2,8,mat);px(6,1,4,3,edge);}else if(type==='dagger'){px(7,2,2,7,mat);px(6,2,4,2,edge);px(5,8,6,2,'#d9b765');}else{px(7,type==='greatsword'?1:2,2,type==='greatsword'?10:8,mat);px(6,type==='greatsword'?1:2,4,3,edge);px(5,10,6,2,'#d9b765');}}}else if(it.armor){const shapes={helmet:[[3,3,10,3],[3,6,2,5],[11,6,2,5]],chest:[[4,2,8,3],[2,5,12,3],[4,8,8,6]],legs:[[4,2,8,6],[4,8,3,6],[9,8,3,6]],boots:[[3,5,4,7],[9,5,4,7],[2,11,5,3],[9,11,5,3]]}[it.armor];for(const [x,y,w,h]of shapes)px(x,y,w,h,edge);for(const [x,y,w,h]of shapes)if(w>2&&h>2)px(x+1,y+1,w-2,h-2,mat);}else{switch(id){case'coal':case'charcoal':px(5,4,6,7,'#282a2e');px(4,6,2,4,'#3d4246');break;case'rawIron':case'rawGold':px(4,4,8,8,id==='rawGold'?'#c99e39':'#b18d72');px(6,2,4,3,'#d8c09b');break;case'iron':case'gold':px(3,6,10,6,edge);px(4,4,8,7,mat);px(5,5,6,2,'#fff2bd');break;case'diamond':px(8,1,5,5,'#c9ffff');px(3,5,10,5,'#5ee0d9');px(6,10,4,5,'#45aaa8');break;case'stick':px(7,2,2,12,wood);break;case'fiber':for(let k=0;k<4;k++)px(3+k*2,3+k,2,10-k*2,'#8fc47d');break;case'leather':px(3,3,10,10,'#9d6847');px(5,2,6,2,'#c08a61');break;case'arrow':px(2,7,10,2,'#d4c398');px(11,5,3,6,'#d9dde0');px(2,5,3,6,'#8da969');break;case'seed':px(5,5,6,7,'#9c7a42');px(9,3,3,4,'#78b65a');break;case'food':px(4,4,8,9,'#d85d6f');px(6,2,4,3,'#82b85d');break;case'sigil':px(6,1,4,14,'#d6a95b');px(1,6,14,4,'#d6a95b');px(4,4,8,8,'#7766aa');px(6,6,4,4,'#ead48a');break;case'heart':px(3,4,4,4,'#e76573');px(9,4,4,4,'#e76573');px(5,7,6,6,'#c9445b');break;default:px(4,4,8,8,mat);px(6,2,4,4,edge);break;}}out[id]=c.toDataURL('image/png');iconCanvases.set(id,c);}return out;}

function createDropAtlas(gl,iconCanvases){
 const CELL=64,SIZE=1024,c=document.createElement('canvas');c.width=c.height=SIZE;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;const frames={};let n=0;
 for(const [id,item]of Object.entries(ITEMS)){const sprite=item.block?iconCanvases.get('block:'+item.block):iconCanvases.get(id);if(!sprite)throw Error('아이템 텍스처 없음: '+id);
  const x=(n%16)*CELL,y=Math.floor(n/16)*CELL;if(y+CELL>SIZE)throw Error('드롭 텍스처 아틀라스 용량 초과');ctx.drawImage(sprite,x+8,y+8,48,48);
  frames[id]={u0:(x+7)/SIZE,u1:(x+57)/SIZE,v0:1-(y+7)/SIZE,v1:1-(y+57)/SIZE};n++;}
 const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return{tex,frames};
}

