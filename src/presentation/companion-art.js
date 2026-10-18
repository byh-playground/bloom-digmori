/* The pebble mole stays as authored SVG and retained GameKit mesh geometry. */
const COMPANION_SPRITE=Object.freeze({cell:128,pixelsPerMeter:32,size:2048});
const VECTOR_FRAME_COUNTS=Object.freeze({idle:4,walk:4,work:4,return:4,prepare:8,flight:3,ground:3});

function createCompanionCombatAtlas(gl){
 const {cell,pixelsPerMeter:S,size}=COMPANION_SPRITE,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const dest=canvas.getContext('2d'),frames={};let index=0;
 const layouts={claw:{attack:12,work:4,return:4}};
 for(const [mode,clips]of Object.entries(layouts))for(const [clip,count]of Object.entries(clips))for(let view=0;view<5;view++)for(let frame=0;frame<count;frame++){
  const x=index%16*cell,y=Math.floor(index/16)*cell;
  if(y+cell>size)throw Error('동료 아틀라스 용량 초과');
  const tile=document.createElement('canvas');tile.width=tile.height=cell;
  const c=tile.getContext('2d'),angle=view*Math.PI/4,ca=Math.cos(angle),sa=Math.sin(angle),shapes=[];
  const project=p=>({x:64+(-p.x*ca+p.z*sa)*S,y:96-(p.y-(p.x*sa+p.z*ca)*.20)*S,depth:p.x*sa+p.z*ca});
  const add=(points,draw)=>shapes.push({depth:points.reduce((n,p)=>n+project(p).depth,0)/points.length,draw});
  const polygon=(points,color)=>add(points,()=>{c.beginPath();points.forEach((p,i)=>{const q=project(p);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y)});c.closePath();c.fillStyle=color;c.fill();c.strokeStyle='#102b2b';c.lineWidth=1.7;c.lineJoin='round';c.stroke();});
  const ellipse=(p,rx,ry,color,outline=true)=>add([p],()=>{const q=project(p);c.beginPath();c.ellipse(q.x,q.y,rx*S,ry*S,0,0,TAU);c.fillStyle=color;c.fill();if(outline){c.strokeStyle='#102b2b';c.lineWidth=1.7;c.stroke();}});
  const limb=(a,b,width,color)=>add([a,b],()=>{const p=project(a),q=project(b);c.lineCap='round';c.strokeStyle='#102b2b';c.lineWidth=width*S+2.5;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();c.strokeStyle=color;c.lineWidth=width*S;c.stroke();});
  const action={wind:300,active:280,recovery:350},stage=clip==='attack'?Math.floor(frame/4):0,p=clip==='attack'?(frame%4)/3:clip==='work'?frame/3:.05;
  const elapsed=clip==='attack'?(stage===0?p*299:stage===1?300+p*279:580+p*349):clip==='work'?300+p*279:929,pose=clawPose(action,elapsed),b=pose.body;
  for(let i=0;i<2;i++){const foot=pose.feet[i],hip={x:foot.x*.65,y:.33-pose.crouch,z:0};limb(hip,{x:foot.x,y:.18,z:foot.z-.1},.11,'#679b9c');limb({x:foot.x,y:.18,z:foot.z-.1},foot,.11,'#a9d4cf');ellipse(foot,.14,.07,'#264b50');}
  ellipse(b,.35,.36,'#c7a067');ellipse({...b,y:b.y+.09,z:b.z-.02},.30,.28,'#f0d895');
  const back=view>=3;ellipse({...b,y:b.y+.25,z:b.z+.04},.27,.20,back?'#628b86':'#a9d6cc');
  if(!back)for(const xEye of[-.11,.11]){const eye={x:xEye,y:b.y+.29,z:b.z+.16};ellipse(eye,.045,.06,'#112b31',false);ellipse({...eye,x:xEye-.012,y:eye.y+.02},.015,.02,'#fff6ca',false);}
  else for(const xEye of[-.13,.13])ellipse({x:xEye,y:b.y+.29,z:b.z-.10},.045,.035,'#d3dfb1',false);
  for(const arm of pose.arms){limb(arm.shoulder,arm.elbow,.15,'#538d8b');limb(arm.elbow,arm.wrist,.15,'#9ac9b5');ellipse(arm.wrist,.16,.15,'#d7ad68');
   for(let jaw=0;jaw<2;jaw++){const sign=jaw?1:-1,tip=arm.tips[jaw],w=arm.wrist;polygon([{x:w.x+sign*.14,y:w.y-.11,z:w.z-.06},{x:w.x+sign*.20,y:w.y+.10,z:w.z+.16},{x:tip.x+sign*.055,y:tip.y+.06,z:tip.z},{x:tip.x,y:tip.y,z:tip.z+.08},{x:w.x+sign*.025,y:w.y-.015,z:w.z+.23}],jaw?'#f5d792':'#d9b06e');}}
  shapes.sort((a,b)=>a.depth-b.depth);for(const shape of shapes)shape.draw();
  const rgba=c.getImageData(0,0,cell,cell);for(let i=3;i<rgba.data.length;i+=4)rgba.data[i]=rgba.data[i]>=120?255:0;c.putImageData(rgba,0,0);
  dest.drawImage(tile,x,y);frames[mode+'/'+clip+'/'+view+'/'+frame]={u0:x/size,u1:(x+cell)/size,v0:1-y/size,v1:1-(y+cell)/size,x,y,w:cell,h:cell};index++;
 }
 const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);for(const name of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,name,gl.NEAREST);for(const name of[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,name,gl.CLAMP_TO_EDGE);return{tex,frames,canvas,count:index};
}

function svgWorldMatrix(viewBox,root,facing,sizeScale,flipX=false,aspectX=1){
 const [minX,minY,width,height]=viewBox,size=4*sizeScale/Math.max(width,height),sx=size*aspectX*(flipX?-1:1),forward=V.norm({x:facing.x,y:0,z:facing.z}),right={x:-forward.z,y:0,z:forward.x},offset=minX+width*.5;
 return new Float32Array([right.x*sx,0,right.z*sx,0,0,-size,0,0,forward.x*size,0,forward.z*size,0,root.x-right.x*offset*sx,root.y-1+(minY+height)*size,root.z-right.z*offset*sx,1]);
}

class CompanionRenderer {
 constructor(renderer,gamekit,compiledAssets){
  if(!gamekit?.rendering?.WebGLDevice||!gamekit?.rendering?.MeshRenderer||!gamekit?.vectorAssets?.createVectorAsset||!compiledAssets?.pebbleMole)throw Error('GameKit SVG world renderer is unavailable');
  this.r=renderer;this.atlas=createCompanionCombatAtlas(renderer.gl);this.device=new gamekit.rendering.WebGLDevice(renderer.canvas,{alpha:false,antialias:true,depth:true,stencil:false});
  this.meshes=new gamekit.rendering.MeshRenderer(this.device);this.asset=gamekit.vectorAssets.createVectorAsset(this.meshes,compiledAssets.pebbleMole);this.characterAssets=new Map(Object.entries(compiledAssets.characters||{}).map(([id,asset])=>[id,gamekit.vectorAssets.createVectorAsset(this.meshes,asset)]));this.characterPlayers=new Map();this.characterWorld=[];this.characterSamples=[];this.players=new Map();this.samples=[];this.frameActive=false;
 }
 beginFrame(clearColor){this.frameActive=this.device.beginFrame({width:this.r.canvas.width,height:this.r.canvas.height,clearColor:[...clearColor,1],clearDepth:1});if(this.frameActive)this.meshes.beginFrame();return this.frameActive;}
 endFrame(){if(!this.frameActive)return;this.meshes.flush('digmoriSvgFrameEnd');this.device.endFrame();this.frameActive=false;for(const [key,state]of this.players)if(this.r.frame-state.lastSeen>1800){state.player.dispose();this.players.delete(key);}for(const [key,state]of this.characterPlayers)if(this.r.frame-state.lastSeen>1800){state.player.dispose();this.characterPlayers.delete(key);}}
 dispose(){for(const state of this.players.values())state.player.dispose();this.players.clear();for(const state of this.characterPlayers.values())state.player.dispose();this.characterPlayers.clear();for(const asset of this.characterAssets.values())asset.dispose();this.characterAssets.clear();this.asset.dispose();this.meshes.dispose();this.device.dispose();this.r.gl.deleteTexture(this.atlas.tex);}
 beginCharacterFrame(){this.characterWorld=[];this.characterSamples=[];}
 hasCharacter(kind){return this.characterAssets.has(kind);}
 queueCharacter(item){if(this.hasCharacter(item.kind))this.characterWorld.push(item);}
 characterPlayer(item,clip,expression){const asset=this.characterAssets.get(item.kind);let state=this.characterPlayers.get(item.key);if(!state){state={player:asset.createPlayer({clip,startedAtMs:0}),clip,expression:null,lastSeen:this.r.frame};this.characterPlayers.set(item.key,state);}else if(state.clip!==clip){state.player.play(clip,0);state.clip=clip;}if(state.expression!==expression){state.player.setExpression(expression);state.expression=expression;}state.lastSeen=this.r.frame;return state.player;}
 drawCharacter(item){
  if(!this.frameActive)return;const r=this.r,sample=item.sample,asset=this.characterAssets.get(item.kind);if(!asset)return;
  const isRoll=sample.clip.startsWith('roll'),sourceClip=isRoll?'roll':'idle',p=isRoll?sample.frame/Math.max(1,ANIMATION.rollFrames-1):0,timeMs=isRoll?360*p:0,expression='view'+sample.dir,player=this.characterPlayer(item,sourceClip,expression);
  player.seek(timeMs);let pose;
  if(isRoll){const tuck=Math.min(easeMotion(p/.18),easeMotion((1-p)/.18));pose={...clipArtPose('idle',0),roll:true,tuck,armL:[lerp(13,20,tuck),lerp(40,34,tuck)],armR:[lerp(34,27,tuck),lerp(40,34,tuck)],stride:2.4*tuck,knee:4*tuck};player.setBasePose('body',{x:0,y:0,rotation:0,scaleX:1,scaleY:1});}
  else{pose=clipArtPose(sample.clip,sample.frame);player.setBasePose('body',{x:0,y:-pose.squash*pose.bob,rotation:pose.lean,scaleX:1+(1-pose.squash)*.25,scaleY:pose.squash});}
  const arm=(shoulder,base,tip)=>{const bx=base[0]-shoulder[0],by=base[1]-shoulder[1],tx=tip[0]-shoulder[0],ty=tip[1]-shoulder[1],baseLength=Math.hypot(bx,by)||1,length=Math.hypot(tx,ty)||1,scale=length/baseLength;return{x:0,y:0,rotation:Math.atan2(ty,tx)-Math.atan2(by,bx),scaleX:scale,scaleY:scale};};
  player.setBasePose('arm-left',arm([22,43],[21,51],[pose.armL[0]+8,pose.armL[1]+11]));player.setBasePose('arm-right',arm([41,43],[42,51],[pose.armR[0]+8,pose.armR[1]+11]));
  player.setBasePose('leg-left',{x:pose.stride,y:-Math.max(0,pose.stride)*.28,rotation:pose.knee*.025,scaleX:1,scaleY:1});player.setBasePose('leg-right',{x:-pose.stride,y:-Math.max(0,-pose.stride)*.28,rotation:-pose.knee*.025,scaleX:1,scaleY:1});
  player.setBasePose('foot-left',{x:pose.stride,y:-Math.max(0,pose.stride)*.28,rotation:0,scaleX:1,scaleY:1});player.setBasePose('foot-right',{x:-pose.stride,y:-Math.max(0,-pose.stride)*.28,rotation:0,scaleX:1,scaleY:1});
  for(let view=0;view<5;view++)player.setBasePose('view'+view,{x:0,y:0,rotation:item.kind==='sprout'?Math.sin(sample.frame/(ANIMATION.clips[sample.clip]||4)*TAU)*.012:0,scaleX:1,scaleY:1});
  const forward=V.norm({x:r.forward.x,y:0,z:r.forward.z}),root={x:item.pos.x,y:item.pos.y+1,z:item.pos.z},sizeScale=(32/56)*(item.scale||1),worldMatrix=svgWorldMatrix(asset.viewBox,root,forward,sizeScale,sample.flip,1.65*56/96);
  player.draw({viewProjection:r.vp,worldMatrix,alpha:item.alpha??1,color:item.tint||[1,1,1,1],whiteFlash:!!item.whiteFlash,depthTest:true,depthWrite:false,depthFunc:'lequal'});this.meshes.flush('digmoriSvgCharacter');
  this.characterSamples.push({mode:'svg-character',key:item.key,kind:item.kind,clip:sample.clip,frame:sample.frame,view:sample.dir,flip:sample.flip,expression,timeMs,depthTest:true,depthWrite:false,worldMatrix:Array.from(worldMatrix),alpha:item.alpha??1});
 }
 drawCharacters(phase){for(const item of this.characterWorld)if(item.phase===phase)this.drawCharacter(item);}
 playerFor(key,clip,expression){let state=this.players.get(key);if(!state){state={player:this.asset.createPlayer({clip,startedAtMs:0}),clip,expression:null,lastSeen:this.r.frame};this.players.set(key,state);}else if(state.clip!==clip){state.player.play(clip,0);state.clip=clip;}
  if(state.expression!==expression){state.player.setExpression(expression);state.expression=expression;}state.lastSeen=this.r.frame;return state.player;}
 world(out,root,mode,clip,frame,dir={x:0,y:0,z:-1},sizeScale=1,key='',front=true,timeMs=null){
  if(mode==='ball'){this.vectorWorld.push({root:{...root},clip,frame,dir:{...dir},sizeScale,key,front,timeMs});return;}
  const r=this.r,view=(Math.round(Math.atan2(dir.x*cosQ(r.camera.yaw)-dir.z*sinQ(r.camera.yaw),dir.x*sinQ(r.camera.yaw)+dir.z*cosQ(r.camera.yaw))/(Math.PI/4))+8)%8,
   folded=view>=5?8-view:view,art=this.atlas.frames[mode+'/'+clip+'/'+folded+'/'+frame];if(!art)return;
  r.sprite(out,V.add(root,{x:0,y:-1,z:0}),4*sizeScale,4*sizeScale,art,[1,1,1,1],view>=5);this.samples.push({mode,clip,frame,view,sizeScale,root:{...root}});
 }
 drawVector(item){
  if(!this.frameActive)return;
  const r=this.r,forward=V.norm({x:item.dir.x,y:0,z:item.dir.z}),toCamera=V.norm({x:-r.forward.x,y:0,z:-r.forward.z}),expression=V.dot(forward,toCamera)>0?'front':'back',
   player=this.playerFor(item.key,item.clip,expression),duration=this.asset.metadata.clips[item.clip].durationMs,count=VECTOR_FRAME_COUNTS[item.clip]||4,timeMs=Number.isFinite(item.timeMs)?item.timeMs:duration*Math.max(0,Math.min(count-1,item.frame))/Math.max(1,count-1),worldMatrix=svgWorldMatrix(this.asset.viewBox,item.root,item.dir,item.sizeScale);
  player.seek(timeMs);player.draw({viewProjection:r.vp,worldMatrix,alpha:1,depthTest:true,depthWrite:false,depthFunc:'lequal'});this.meshes.flush('digmoriSvgActor');
  this.samples.push({mode:'svg',key:item.key,clip:item.clip,frame:item.frame,expression,timeMs,depthTest:true,depthWrite:false,root:{...item.root},worldMatrix:Array.from(worldMatrix)});
 }
 prepare(view,sim,actor,dyn){
  const r=this.r;this.behind=[];this.front=[];this.vectorWorld=[];this.samples=[];
  for(const b of Object.values(sim.companions.data.bases))if(r.worldVisualReady(b.pos,.3))r.box(dyn,V.add(b.pos,{x:1,y:.02,z:0}),{x:.9,y:.45,z:.65},[.42,.53,.32]);
  for(const candidate of Object.values(view.actors)){
   if(candidate.speciesId!=='shell'||candidate.dead||candidate.suspended||!r.worldVisualReady(candidate.pos,.3))continue;
   const visual=r.combatFx.pose(candidate),reaction=r.combatFx.reactions.get(candidate.id),sample=actorSpritePose(visual,r.camera.yaw,reaction);
   let clip='idle',frame=sample.frame%4;
   if(sample.clip==='walk'||sample.clip==='run'||sample.clip==='swim'||sample.clip==='brake'){clip='walk';frame=Math.floor(sample.frame/2)%4;}
   else if(['hurt','hurtHeavy','stun','rise','fall','land'].includes(sample.clip)){clip='ground';frame=sample.frame%3;}
   else if(visual.combat.state==='attack'){clip='work';frame=sample.frame%4;}
   this.world(this.behind,V.add(candidate.pos,{x:0,y:1,z:0}),'ball',clip,frame,candidate.facing,.55,candidate.id,false,candidate.anim);
  }
  for(const u of Object.values(view.companions)){
   const a=view.actors[u.owner];if(!a||a.dead||a.suspended)continue;const mode=SPECIES[u.kind].art;
   if(u.location==='work'){
    if(!r.worldVisualReady(u.pos,.3))continue;
    const progress=u.phase==='gather'?u.progress/Math.max(1,BLOCKS[u.target?.id]?.hardness||650):0,
     workDir=mode==='ball'&&u.phase==='gather'&&u.target?V.sub({x:u.target.x+.5,y:u.target.y+1,z:u.target.z+.5},u.pos):a.facing;
    this.world(this.front,V.add(u.pos,{x:0,y:mode==='claw'?-.52:0,z:0}),mode,mode==='claw'&&u.phase==='gather'?'attack':'work',mode==='claw'&&u.phase==='gather'?Math.min(11,Math.floor(progress*12)):Math.min(3,Math.floor(progress*4)),workDir,mode==='claw'?1:.72,u.id,true,mode==='ball'?progress*this.asset.metadata.clips.work.durationMs:null);continue;
   }
   if(u.phase==='return'){
    if(r.worldVisualReady(u.pos,.3)){const frame=Math.floor(sim.tick/3)%(mode==='claw'?4:3),dir=V.sub(sim.companions.socket(a,u.slot),u.pos);this.world(this.front,V.add(u.pos,{x:0,y:mode==='claw'?-.52:0,z:0}),mode,'return',frame,dir,mode==='claw'?1:.72,u.id,true,mode==='ball'?frame*this.asset.metadata.clips.return.durationMs/2:null);}
    continue;
   }
   if(u.location!=='combat'||u.phase==='flight')continue;
   const visual=r.combatFx.pose(a),c=visual.combat,act=c.action;if(c.state!=='attack'||act?.companionId!==u.id)continue;
   if(mode==='claw'){
    const timing=actionTiming(act,c.elapsed),stage=timing.stage==='wind'?0:timing.stage==='active'?1:2,frame=stage*4+Math.min(3,Math.floor(timing.phase*4)),compact=Math.min(r.canvas.clientWidth||innerWidth,r.canvas.clientHeight||innerHeight)<=480;
    this.world(this.front,clawWorldPose(visual,act,c.elapsed).root,'claw','attack',frame,act.dir,compact?1.35:1,u.id,true);
   }else if(!act.fired)this.world(this.front,V.add(companionRoot(visual,act.dir),{x:0,y:.9,z:0}),'ball','prepare',Math.min(7,Math.floor(c.elapsed/act.wind*8)),act.dir,.72,u.id,true,c.elapsed);
  }
  for(const p of Object.values(view.projectiles))if(p.companionId&&r.worldVisualReady(p.pos,.3)){
   const clip=p.throwPhase==='ground'?'ground':'flight',frame=clip==='ground'?Math.min(2,Math.floor((p.groundMs||0)/SPECIES[p.companionKind].capabilities.attack.groundHoldMs*3)):Math.floor(p.age/120)%3;
   this.world(this.front,p.pos,'ball',clip,frame,p.dir,.28,p.id,true,clip==='ground'?p.groundMs:p.age);
   const radius=SPECIES[p.companionKind].capabilities.attack.projectile.radius,origin=V.add(p.pos,{x:0,y:-radius,z:0}),hit=sim.terrain.ray(origin,{x:0,y:-1,z:0},12);
   if(hit&&hit.normal.y>.7){const size=.27/(1+hit.distance*.2);r.box(dyn,{x:p.pos.x,y:origin.y-hit.distance+.012,z:p.pos.z},{x:size*2,y:.01,z:size*1.3},[.20,.30,.22]);}
  }
 }
 draw(front){for(const item of this.vectorWorld)if(item.front===front)this.drawVector(item);const vertices=front?this.front:this.behind;if(!vertices.length)return;
  const r=this.r,gl=r.gl,p=r.spriteProgram;gl.useProgram(p);gl.uniformMatrix4fv(gl.getUniformLocation(p,'vp'),false,r.vp);gl.uniform1f(gl.getUniformLocation(p,'ambient'),r.ambient??1);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.atlas.tex);gl.uniform1i(gl.getUniformLocation(p,'tex'),0);gl.bindBuffer(gl.ARRAY_BUFFER,r.spriteBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);r.attrib(p,'p',3,36,0);r.attrib(p,'uv',2,36,12);r.attrib(p,'tint',4,36,20);gl.drawArrays(gl.TRIANGLES,0,vertices.length/9);
 }
}
