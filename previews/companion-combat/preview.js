// Preview-only sockets for the existing authored 64px atlas. This is NOT a 3D body.
// Each point is evaluated from the SAME clip/frame, squash, lean and mirror as art.js.
const ATTACHMENT_ART=Object.freeze([
 {id:'claw',pivot:[48,78],scale:.40},
 {id:'dew',pivot:[32,48],scale:.31},
 {id:'puff',pivot:[32,51],scale:.36}
]);
function attachmentPose(sample){
 const art=clipArtPose(sample.clip,sample.frame),mirror=sample.flip?-1:1;
 const mirrorPoint=p=>({...p,x:sample.flip?64-p.x:p.x});
 const isRoll=sample.clip.startsWith('roll')&&sample.frame>0&&sample.frame<ANIMATION.rollFrames-1;
 let point,hand,elbow,hip,back,shoulder,layer,bodyAngle=art.lean;
 if(isRoll){
  // Exact makeRoll() curve, tucking joints, axis and 2.5D projection from art.js.
  const p=sample.frame/(ANIMATION.rollFrames-1),view=sample.dir,variant=+sample.clip.slice(4),f={x:Math.sin(view*Math.PI/4),y:0,z:Math.cos(view*Math.PI/4)},right={x:-f.z,y:0,z:f.x};
  const travel=V.add(V.scale(f,Math.cos(variant*Math.PI/4)),V.scale(right,Math.sin(variant*Math.PI/4))),axis={x:travel.z,y:0,z:-travel.x};
  const turn=easeMotion((p-.08)/.80)*TAU,tuck=Math.min(easeMotion(p/.18),easeMotion((1-p)/.18)),cs=Math.cos(turn),sn=Math.sin(turn);
  const rot=v=>V.add(V.add(V.scale(v,cs),V.scale({x:axis.y*v.z-axis.z*v.y,y:axis.z*v.x-axis.x*v.z,z:axis.x*v.y-axis.y*v.x},sn)),V.scale(axis,V.dot(axis,v)*(1-cs)));
  const at=(x,y,z)=>rot(V.add(V.add(V.scale(right,x),{x:0,y,z:0}),V.scale(f,z)));
  const project=v=>({x:32+v.x,y:45-3*tuck-v.y+v.z*.20,z:v.z});
  point=(x,y,z=0)=>project(at(x,y,z));
  const side=sample.dir>=3?1:-1;
  hand=point(side*(9-4*tuck),-7+12*tuck,5*tuck);elbow=point(side*(8-2*tuck),-3+6*tuck,2+3*tuck);shoulder=point(side*6,3,0);
  hip=point(-side*6,-4+3*tuck,-1);back=point(0,3,-6);
  const up=rot({x:0,y:1,z:0});bodyAngle=Math.atan2(up.x,up.y-up.z*.20);
  layer=p=>p.z>=0?'front':'back';
 }else{
  // art.js: translate(8,11), translate(24,48), rotate, scale, translate(-24,-48-bob).
  const pose=sample.clip.startsWith('roll')?clipArtPose('idle',0):art;
  bodyAngle=pose.lean;
  point=(x,y,z=0)=>{const sx=(x-24)*(1+(1-pose.squash)*.25),sy=(y-48-pose.bob)*pose.squash;return{x:32+sx*Math.cos(pose.lean)-sy*Math.sin(pose.lean),y:59+sx*Math.sin(pose.lean)+sy*Math.cos(pose.lean),z};};
  const backView=sample.dir>=3;
  // Front and rear authoring use opposite anatomical hands; side views preserve the far/near limb.
  const arm=backView?pose.armL:pose.armR,sx=backView?14:33;
  hand=point(...arm);shoulder=point(sx,32);elbow=point((sx+arm[0])*.5+(backView?-2:2),(32+arm[1])*.5);
  hip=point(backView?31:16,39);
  back=point(sample.dir===0?24:sample.dir===4?24:sample.dir===3?19:15,32);
  layer=p=>p===back?(backView?'front':'back'):p===hip?(sample.dir===2?'back':'front'):'front';
 }
 const raw=[hand,hip,back],forearmAngle=Math.atan2(hand.y-elbow.y,hand.x-elbow.x)+Math.PI/2;
 const opening=sample.clip==='gather'?[0,.8,.5,0][sample.frame%4]:['light','heavy','overhead','lightReverse','heavyReverse'].includes(sample.clip)?[0,.15,.6,1,.8,.45,.15,0][sample.frame]:0;
 return{sample,bodyAngle:bodyAngle*mirror,opening,hand:mirrorPoint(hand),elbow:mirrorPoint(elbow),shoulder:mirrorPoint(shoulder),
  sockets:raw.map((p,i)=>({id:ATTACHMENT_ART[i].id,...mirrorPoint(p),angle:(i===0?forearmAngle:bodyAngle)*mirror,mirror,layer:layer(p)})),
  transform:point,isRoll};
}
// Fixed socket pivot: local articulation can rotate/scale around this point, never translate it away.
// One atlas texel is one body authoring pixel, for both body and equipment.
// Preserve the approved body's anisotropic world mapping and continuous socket motion.
const PIXEL_CONTRACT=Object.freeze({bodyFrame:64,worldPerPixelX:2.2/64,worldPerPixelY:2/56,filter:'NEAREST',maxDpr:2});
function gearPoint(socket,art,x,y,layout='A'){
 const k=art.scale*(layout==='B'?1.12:1),dx=(x-art.pivot[0])*k*socket.mirror,dy=(y-art.pivot[1])*k;
 return{x:socket.x+dx*Math.cos(socket.angle)-dy*Math.sin(socket.angle),y:socket.y+dx*Math.sin(socket.angle)+dy*Math.cos(socket.angle)};
}
function atlasPointWorld(r,actor,p,layer){const depth=layer==='front'?.008:-.008;
 return V.add(actor.pos,{x:r.right.x*(p.x-32)*PIXEL_CONTRACT.worldPerPixelX-r.forward.x*depth,y:(64-p.y)*PIXEL_CONTRACT.worldPerPixelY,z:r.right.z*(p.x-32)*PIXEL_CONTRACT.worldPerPixelX-r.forward.z*depth});
}
function attachedQuad(r,out,actor,socket,art,frame,layout){
 const extent=frame.sourceExtent??64,corners=[[0,0],[extent,0],[extent,extent],[0,extent]],uv=[[frame.u0,frame.v0],[frame.u1,frame.v0],[frame.u1,frame.v1],[frame.u0,frame.v1]];
 const world=corners.map(([x,y])=>atlasPointWorld(r,actor,gearPoint(socket,art,x,y,layout),socket.layer));
 for(const i of [0,1,2,0,2,3])out.push(world[i].x,world[i].y,world[i].z,...uv[i],1,1,1,1);
}
function connectorGeometry(r,out,actor,contract){
 // Leaf cuffs overlap the skin and shell socket. All endpoints come from the same posed limb.
 const a=atlasPointWorld(r,actor,contract.elbow,'front'),b=atlasPointWorld(r,actor,contract.hand,'front');
 r.weaponBeam(out,V.add(V.scale(a,.25),V.scale(b,.75)),b,.065,[.29,.49,.30]);
 for(const socket of contract.sockets){const p=atlasPointWorld(r,actor,socket,socket.layer);r.box(out,{...p,y:p.y-.045},{x:.11,y:.09,z:.035},socket.id==='claw'?[.48,.61,.48]:[.30,.48,.27]);}
}

// Visual-only fixture. Production Renderer and source art remain unchanged.
const previewUI=Object.fromEntries(['preview','state','scale','pitch','pitchOut','action','facing','device','wall','exact','stage','gear','a','b','play','error','close','timeline'].map(id=>[id,document.getElementById(id)]));
let layout='A',combatMode='ball',playing=true,clock=0,last=performance.now(),renderer;
for(const name of ['a','b'])previewUI[name].onclick=()=>{combatMode=name==='a'?'ball':'sword';previewUI.a.classList.toggle('active',combatMode==='ball');previewUI.b.classList.toggle('active',combatMode==='sword');};
previewUI.device.value=matchMedia('(max-width:700px)').matches?'mobile':'pc';
previewUI.timeline.oninput=()=>{playing=false;clock=Number(previewUI.timeline.value);previewUI.play.textContent='재생';drawFrame(clock);};
previewUI.play.onclick=()=>{playing=!playing;previewUI.play.textContent=playing?'일시정지':'재생';};
previewUI.exact.onchange=()=>previewUI.stage.classList.toggle('exact',previewUI.exact.checked);
function companionAtlas(gl){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const dest=canvas.getContext('2d'),frames={};
 for(const mode of ['ball','sword'])for(let type=0;type<3;type++)for(let phase=0;phase<8;phase++){
  const density=ATTACHMENT_ART[type].scale,extent=type===0?96:64,pixels=Math.ceil(extent*density),x=phase*64,y=(type+(mode==='sword'?3:0))*64,k=phase/7;
  const tile=document.createElement('canvas');tile.width=tile.height=pixels;const c=tile.getContext('2d');c.scale(density,density);c.lineWidth=3;c.lineJoin='round';
  const ellipse=(x,y,rx,ry,color)=>{c.fillStyle=color;c.strokeStyle='#26382f';c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();c.stroke();};
  const poly=(pts,color)=>{c.fillStyle=color;c.strokeStyle='#26382f';c.beginPath();c.moveTo(...pts[0]);for(const p of pts.slice(1))c.lineTo(...p);c.closePath();c.fill();c.stroke();};
  if(type===0&&mode==='ball'){
   // Feet and leaves tuck into the shell; the grip/attachment remains at the same pivot.
   c.strokeStyle='#507656';c.lineWidth=5;c.beginPath();c.moveTo(16,78);c.lineTo(23,69);c.lineTo(32,65);c.stroke();
   const tuck=k,cy=57+3*tuck;ellipse(48,cy,23-2*tuck,21-1*tuck,'#7fbaa5');
   poly([[28,54],[30+8*tuck,37],[46,32+7*tuck],[62-6*tuck,38],[68,53]],'#b5d88d');
   for(const sign of [-1,1])poly([[48+sign*15,65],[48+sign*(25-9*tuck),69-8*tuck],[48+sign*12,76]],'#ebbc7d');
   c.strokeStyle='#26382f';c.lineWidth=3.5;
   if(k<.45){ellipse(40,55,3,4,'#233b35');ellipse(56,55,3,4,'#233b35')}
   else{for(const x of [40,56]){c.beginPath();c.moveTo(x-4,53);c.lineTo(x+3,55);c.stroke()}}
   c.beginPath();c.arc(48,62,5,0,Math.PI);c.stroke();
  }else if(type===0){
   // A living leaf blade above a clearly separated grip, rather than an ordinary metal sword.
   const bend=(1-k)*10;poly([[43,82],[42,64],[37,43],[42+bend,18],[49+bend,5],[59,28],[61,48],[53,65],[53,82]],'#8fbb7d');
   poly([[47,65],[44,47],[48+bend,17],[53,35],[55,52]],'#d1df9c');
   ellipse(49+bend*.35,33,9,12,'#a4d1b1');
   for(const x of [45,53]){if(k>.75){c.strokeStyle='#26382f';c.beginPath();c.moveTo(x-2,30);c.lineTo(x+2,32);c.stroke()}else ellipse(x,31,2,3,'#26382f')}
   ellipse(49,39,2,k>.75?3:1.5,'#52684b');
   poly([[37,69],[45,64],[55,64],[62,69],[55,73],[43,73]],'#dca86e');
   poly([[44,74],[52,74],[52,87],[44,87]],'#507656');
   c.strokeStyle='#d8dcb1';c.lineWidth=2;for(const y of [77,81,85]){c.beginPath();c.moveTo(45,y);c.lineTo(51,y);c.stroke()}
  }else if(type===1){poly([[30,49],[11,32],[15,18],[30,29],[34,45]],'#8abd79');poly([[32,47],[42,22],[55,14],[51,36]],'#c2db8c');ellipse(31,43,8,11,'#82c9be');ellipse(28,41,1.5,2,'#26382f');ellipse(35,41,1.5,2,'#26382f')}
  else{c.strokeStyle='#73945e';c.beginPath();c.moveTo(32,48);c.lineTo(32,24);c.stroke();for(let j=0;j<8;j++){const a=j*TAU/8;ellipse(32+Math.cos(a)*10,24+Math.sin(a)*10,4,3,'#e9e8bf')}ellipse(32,45,8,10,'#b99062');ellipse(29,43,1.5,2,'#26382f');ellipse(35,43,1.5,2,'#26382f')}
  const rgba=c.getImageData(0,0,pixels,pixels);for(let i=3;i<rgba.data.length;i+=4)rgba.data[i]=rgba.data[i]>=128?255:0;const native=tile.getContext('2d');native.setTransform(1,0,0,1,0,0);native.putImageData(rgba,0,0);dest.drawImage(tile,x,y);
  frames[mode+'/'+type+'/'+phase]={u0:x/512,u1:(x+pixels)/512,v0:1-y/512,v1:1-(y+pixels)/512,sourceExtent:pixels/density,pixels,density};
 }
 const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);return{tex,frames};
}
function drawSprites(r,vertices,tex){if(!vertices.length)return;const gl=r.gl,p=r.spriteProgram;gl.useProgram(p);gl.uniformMatrix4fv(gl.getUniformLocation(p,'vp'),false,r.vp);gl.uniform1f(gl.getUniformLocation(p,'ambient'),1);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(gl.getUniformLocation(p,'tex'),0);gl.bindBuffer(gl.ARRAY_BUFFER,r.spriteBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);r.attrib(p,'p',3,36,0);r.attrib(p,'uv',2,36,12);r.attrib(p,'tint',4,36,20);gl.drawArrays(gl.TRIANGLES,0,vertices.length/9);}
function drawGeometry(r,vertices){r.meshState(new Float32Array(32));const gl=r.gl;gl.bindBuffer(gl.ARRAY_BUFFER,r.dynamic);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);r.attrib(r.meshProgram,'p',3,24,0);r.attrib(r.meshProgram,'c',3,24,12);gl.drawArrays(gl.TRIANGLES,0,vertices.length/6);}
function combatBeat(t){
 const cycle=((t%2.8)+2.8)%2.8;
 const phase=cycle<.35?'attached':cycle<.85?'prepare':cycle<1.15?'strike':cycle<1.32?'impact':cycle<1.9?'return':cycle<2.3?'recover':'attached';
 const charge=phase==='prepare'?(cycle-.35)/.5:['strike','impact','return'].includes(phase)?1:phase==='recover'?1-(cycle-1.9)/.4:0;
 return{cycle,phase,charge,flight:clamp((cycle-.85)/.3,0,1),returning:clamp((cycle-1.32)/.58,0,1)};
}
function fixture(t){
 const action=previewUI.action.value,angle=Number(previewUI.facing.value)*Math.PI/4,f={x:Math.sin(angle),y:0,z:Math.cos(angle)},beat=combatBeat(t);
 const actor={id:'preview',pos:{x:action==='walk'?Math.sin(t)*.6:0,y:0,z:0},facing:f,velocity:{x:action==='walk'?2:0,y:0,z:0},grounded:true,anim:t*1000,knock:0,motion:{...motionState(),distance:t*2},combat:{state:'idle',elapsed:0,action:null}};
 if(action==='jump'){const c=t%1.6/1.6;actor.pos.y=Math.sin(c*Math.PI)*.8;actor.velocity.y=Math.cos(c*Math.PI)*3;actor.grounded=false;}
 if(action==='roll')actor.combat={state:'roll',elapsed:(t%1.6/1.6)*650,action:{duration:650,facing:f,dir:f,directionIndex:0}};
 if(action==='combat'&&beat.phase!=='attached'){
  const elapsed=beat.phase==='prepare'?beat.charge*250:beat.phase==='strike'?250+beat.flight*150:beat.phase==='impact'?400:400+clamp((beat.cycle-1.32)/.98,0,1)*549;
  actor.combat={state:'attack',elapsed,action:{kind:'normal',weapon:'sword',motion:'swing',tier:0,wind:250,active:300,recovery:400,dir:f,reach:2}};
 }
 const sample=actorSpritePose(actor,0),pose=clipArtPose(sample.clip,sample.frame),deploy=beat.charge;
 return{actor,action,sample,pose,deploy,cycle:beat.cycle,beat};
}
// Camera obstacle is an explicit slab fixture. Uses the production camera's ray contract.
function wallRay(origin,dir,length){if(!previewUI.wall.checked||dir.z<=0)return null;const distance=(2.1-origin.z)/dir.z;return distance>0&&distance<length?{distance}:null;}
function drawFrame(t){
 const r=renderer,gl=r.gl,mobile=previewUI.device.value==='mobile',referenceWidth=mobile?844:1366,referenceHeight=mobile?390:768;
 r.canvas.style.width=referenceWidth+'px';r.canvas.style.aspectRatio=referenceWidth+'/'+referenceHeight;
 const cssWidth=previewUI.exact.checked?referenceWidth:Math.min(referenceWidth,previewUI.stage.clientWidth),cssHeight=cssWidth*referenceHeight/referenceWidth;
 r.canvas.style.height=cssHeight+'px';
 const dpr=Math.min(PIXEL_CONTRACT.maxDpr,window.devicePixelRatio||1),width=Math.max(1,Math.round(cssWidth*dpr)),height=Math.max(1,Math.round(cssHeight*dpr));
 if(r.canvas.width!==width||r.canvas.height!==height){r.canvas.width=width;r.canvas.height=height;}gl.viewport(0,0,width,height);
 r.camera.distance=previewUI.close.checked?4.2:7.5;r.camera.pitch=Number(previewUI.pitch.value);previewUI.pitchOut.textContent=r.camera.pitch.toFixed(2);
 const state=fixture(t),{actor,action,sample,pose,deploy,cycle,beat}=state;
 r.updateCamera(actor,{terrain:{ray:wallRay}});r.fog=new Float32Array([.48,.67,.72]);r.ambient=1;
 gl.clearColor(.48,.67,.72,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
 const scene=[],reach=combatMode==='ball'?2:1.2;
 for(let z=-9;z<=9;z++)for(let x=-9;x<=9;x++)r.box(scene,{x,y:-.26,z},{x:1,y:.25,z:1},(x+z)%2?[.39,.51,.32]:[.43,.55,.35]);
 // A visible target and a side wall keep scale and occlusion legible.
 r.box(scene,{x:actor.pos.x+actor.facing.x*reach,y:0,z:actor.pos.z+actor.facing.z*reach},{x:1,y:action==='combat'&&beat.phase==='impact'?.24:.35,z:1},action==='combat'&&beat.phase==='impact'?[.78,.68,.39]:[.47,.53,.53]);r.box(scene,{x:-3,y:0,z:-3},{x:1,y:2,z:3},[.41,.47,.43]);
 if(previewUI.wall.checked)r.box(scene,{x:0,y:0,z:2.6},{x:8,y:4,z:1},[.45,.49,.43]);
 r.box(scene,{...actor.pos,y:.002},{x:.7,y:.012,z:.43},[.24,.32,.22]);drawGeometry(r,scene);
 const player=[];const frame=r.atlas.frames[`sprout/${sample.dir}/${sample.clip}/${sample.frame}`];if(!frame)throw Error('Missing production pose '+JSON.stringify(sample));
 r.sprite(player,actor.pos,64*PIXEL_CONTRACT.worldPerPixelX,64*PIXEL_CONTRACT.worldPerPixelY,frame,[1,1,1,1],sample.flip,0);
 const contract=attachmentPose(sample),positions=contract.sockets.map(p=>atlasPointWorld(r,actor,p,p.layer));
 const behind=[],front=[];
 if(previewUI.gear.checked)for(let i=0;i<3;i++){
  let socket=contract.sockets[i];const active=i===0&&action==='combat'?beat.charge:0,verts=[],art=i===0&&combatMode==='ball'?{...ATTACHMENT_ART[i],pivot:[16,78]}:ATTACHMENT_ART[i];
  if(i===0&&combatMode==='ball'&&action==='combat')socket={...socket,angle:contract.bodyAngle};
  if(i===0&&combatMode==='sword'&&action==='combat'){
   const direction=Math.sign(actor.facing.x*r.right.x+actor.facing.z*r.right.z)||1;
   const turn=beat.phase==='prepare'?.3-beat.charge:beat.phase==='strike'?-.7+beat.flight*2.4:beat.phase==='impact'?1.7:beat.phase==='return'?1.7-beat.returning*1.4:.3;
   socket={...socket,angle:direction*turn};
  }
  const frame=r.companions.frames[combatMode+'/'+i+'/'+Math.round(active*7)];
  if(i===0&&combatMode==='ball'&&action==='combat'&&['strike','impact','return'].includes(beat.phase)){
   const start=atlasPointWorld(r,actor,gearPoint(socket,art,48,60,layout),socket.layer),target=V.add(actor.pos,{x:actor.facing.x*2,y:.65,z:actor.facing.z*2});
   const u=beat.phase==='strike'?beat.flight:beat.phase==='impact'?1:1-beat.returning;
   const center=V.add(V.scale(start,1-u),V.scale(target,u));center.y+=Math.sin(u*Math.PI)*.22;
   const squash=beat.phase==='impact'?.65:1,w=frame.pixels*PIXEL_CONTRACT.worldPerPixelX/squash,h=frame.pixels*PIXEL_CONTRACT.worldPerPixelY*squash;
   // Center the art's actual shell, not the full padded atlas frame.
   const base=V.add(center,{x:-r.right.x*(48*art.scale-frame.pixels/2)*PIXEL_CONTRACT.worldPerPixelX/squash,y:-(frame.pixels-60*art.scale)*PIXEL_CONTRACT.worldPerPixelY*squash,z:-r.right.z*(48*art.scale-frame.pixels/2)*PIXEL_CONTRACT.worldPerPixelX/squash});
   r.sprite(verts,base,w,h,frame,[1,1,1,1],false,0);
  }else attachedQuad(r,verts,actor,socket,art,frame,layout);
  (socket.layer==='back'?behind:front).push(verts);
 }
 for(const verts of behind)drawSprites(r,verts,r.companions.tex);
 drawSprites(r,player,r.atlas.tex);
 if(previewUI.gear.checked){const cuffs=[];connectorGeometry(r,cuffs,actor,contract);drawGeometry(r,cuffs);}
 for(const verts of front)drawSprites(r,verts,r.companions.tex);
 gl.disable(gl.BLEND);
 const labels={attached:'손에 붙어 대기',prepare:'함께 웅크려 준비',strike:combatMode==='ball'?'공으로 발사':'몸을 굳혀 휘두르기',impact:'명중 · 동료 반응',return:combatMode==='ball'?'손으로 복귀':'팔과 함께 회수',recover:'긴장 풀기'};
 previewUI.state.textContent=(combatMode==='ball'?'① 공 발사':'② 생물 검')+' · '+(action==='combat'?labels[beat.phase]:action)+' · '+sample.view*45+'°';
 if(playing)previewUI.timeline.value=String(cycle);
 previewUI.scale.textContent=`표시 ${Math.round(cssWidth)}×${Math.round(cssHeight)} · DPR ${dpr} · 캔버스 ${width}×${height} · 거리 ${r.camera.distance}m`;
 window.symbioticPreview={revision:4,combatMode,beat,previewOnly:true,pixelContract:{...PIXEL_CONTRACT,dpr,cssSize:[cssWidth,cssHeight],equipment:ATTACHMENT_ART.map((a,i)=>({id:a.id,pixels:r.companions.frames[combatMode+'/'+i+'/0'].pixels,worldPerPixelX:PIXEL_CONTRACT.worldPerPixelX,worldPerPixelY:PIXEL_CONTRACT.worldPerPixelY}))},layout,action,sample,positions,deploy,sockets:contract.sockets,hand:contract.hand,elbow:contract.elbow,camera:{...r.camera},renderSize:[width,height],glError:gl.getError(),frames:(window.symbioticPreview?.frames||0)+1};
}
try{renderer=new Renderer(previewUI.preview);renderer.companions=companionAtlas(renderer.gl);function tick(now){const dt=Math.max(0,Math.min(.05,(now-last)/1000));last=now;if(playing)clock+=dt;try{drawFrame(clock);requestAnimationFrame(tick);}catch(e){showError(e);}}requestAnimationFrame(tick);}catch(e){showError(e);}
function showError(e){previewUI.error.style.display='block';previewUI.error.textContent='미리보기를 렌더하지 못했습니다: '+e.message+' · WebGL을 사용할 수 있는 브라우저에서 열어 주세요.';previewUI.state.textContent='렌더 실패';console.error(e);}

// Deterministic browser review entry point; same live fixture, no alternative rendering path.
window.symbioticReview={setTime(t){playing=false;clock=t;drawFrame(clock);},resume(){playing=true;},attachmentPose};

