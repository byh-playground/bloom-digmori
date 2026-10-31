'use strict';
/* The pebble mole stays as authored SVG and retained GameKit mesh geometry. */
const COMPANION_SPRITE=Object.freeze({cell:128,pixelsPerMeter:32,size:2048});
const VECTOR_FRAME_COUNTS=Object.freeze({idle:4,walk:4,work:4,return:4,prepare:8,flight:3,ground:3});

function createCompanionCombatAtlas(){
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
 return{frames,canvas,count:index};
}

function svgWorldMatrix(viewBox,root,facing,sizeScale,flipX=false,aspectX=1){
 const [minX,minY,width,height]=viewBox,size=4*sizeScale/Math.max(width,height),sx=size*aspectX*(flipX?-1:1),forward=V.norm({x:facing.x,y:0,z:facing.z}),right={x:-forward.z,y:0,z:forward.x},offset=minX+width*.5;
 return new Float32Array([right.x*sx,0,right.z*sx,0,0,-size,0,0,forward.x*size,0,forward.z*size,0,root.x-right.x*offset*sx,root.y-1+(minY+height)*size,root.z-right.z*offset*sx,1]);
}

/* GameKit vector assets keep their SVG parts, clips and expressions; this backend implements the
 * retained-mesh contract (createMesh/drawMesh/deleteMesh) with three.js. The shader reproduces
 * GameKit's world-mode mesh shader: per-part 2D affine poses, premultiplied alpha, tint and white flash. */
const VECTOR_IDENTITY=Object.freeze([1,0,0,1,0,0]);
const VECTOR_DEPTH_FUNCS=Object.freeze({never:'NeverDepth',less:'LessDepth',equal:'EqualDepth',lequal:'LessEqualDepth',greater:'GreaterDepth',notequal:'NotEqualDepth',gequal:'GreaterEqualDepth',always:'AlwaysDepth'});
function vectorMeshShader(partCount,morphCount){
 const multi=partCount>1,local=morphCount?'position+a_morph.xy*(i_params.x'+(multi?'+pose.x':'')+')'+(morphCount>1?'+a_morph.zw*(i_params.y'+(multi?'+pose.y':'')+')':''):'position';
 return{vertex:`in vec2 position;in vec4 a_color;${morphCount?'in vec4 a_morph;':''}${multi?`in float a_part;uniform vec4 u_parts[${partCount*3}];`:''}uniform vec4 i_row0;uniform vec4 i_row1;uniform vec4 i_row2;uniform vec4 i_params;uniform mat4 u_viewProjection;uniform vec4 u_color;out vec4 v_color;
void main(){${multi?'int index=int(a_part)*3;vec4 row0=u_parts[index];vec4 row1=u_parts[index+1];vec4 pose=u_parts[index+2];':''}vec2 local=${local};vec2 plane=${multi?'vec2(dot(row0.xyz,vec3(local,1.0)),dot(row1.xyz,vec3(local,1.0)))':'local'};
vec3 world=vec3(dot(i_row0.xyz,vec3(plane,1.0)),dot(i_row1.xyz,vec3(plane,1.0)),dot(i_row2.xyz,vec3(plane,1.0)));vec4 projected=u_viewProjection*vec4(world,1.0);projected.z+=(i_params.w+${multi?'pose.w':'0.0'})*projected.w;gl_Position=projected;
vec4 color=mix(a_color*u_color,u_color,i_row1.w);color.a*=i_row0.w${multi?'*pose.z':''};color.rgb=mix(color.rgb,vec3(1.0),i_row2.w);v_color=vec4(color.rgb*color.a,color.a);}`,
  fragment:'precision mediump float;in vec4 v_color;out vec4 fragColor;void main(){fragColor=v_color;}'};
}
class ThreeVectorMeshes {
 constructor(renderer){this.r=renderer;this.meshes=new Set();}
 createMesh(data){
  const T=this.r.T,vertices=data?.vertices,indices=data?.indices;
  if(!(vertices instanceof Float32Array)||data.strideFloats!==11||vertices.length<33||vertices.length%11||!Number.isSafeInteger(data.partCount)||data.partCount<1||data.partCount>16||!Number.isSafeInteger(data.morphCount)||data.morphCount<0||data.morphCount>2||!(indices instanceof Uint16Array)||indices.length<3||indices.length%3)throw TypeError('Indexed mesh geometry with complete triangles and 1..16 parts required');
  if(data.nonScalingStroke||data.indexVariants&&Object.keys(data.indexVariants).length)throw TypeError('three.js 벡터 메시는 non-scaling stroke와 이름 있는 index variant를 지원하지 않습니다');
  const buffer=new T.InterleavedBuffer(vertices.slice(),11),attributes=[['position',2,0],['a_color',4,2],['a_morph',4,6],['a_part',1,10]].map(([name,size,offset])=>[name,new T.InterleavedBufferAttribute(buffer,size,offset)]);
  const index=new T.BufferAttribute(indices.slice(),1),variants=new Map(Object.entries(data.expressionIndices||{}).map(([name,variant])=>[name,new T.BufferAttribute(variant.slice(),1)]));
  const mesh={attributes,index,variants,geometries:new Map(),partCount:data.partCount,morphCount:data.morphCount,shaderKey:data.partCount+':'+data.morphCount,parts:new Float32Array(data.partCount*12),count:indices.length};
  this.meshes.add(mesh);return mesh;
 }
 deleteMesh(mesh){if(!this.meshes.delete(mesh))return false;for(const geometry of mesh.geometries.values())geometry.dispose();mesh.geometries.clear();return true;}
 geometry(mesh,variant,index,first,count){const key=variant+'|'+first+'|'+count;let geometry=mesh.geometries.get(key);
  if(!geometry){geometry=new this.r.T.BufferGeometry();for(const [name,attribute]of mesh.attributes)geometry.setAttribute(name,attribute);geometry.setIndex(index);geometry.setDrawRange(first,count);mesh.geometries.set(key,geometry);}return geometry;}
 drawMesh(mesh,options={}){
  const {matrix=VECTOR_IDENTITY,parts=null,morph=[0,0],color=[1,1,1,1],forceColor=false,alpha=1,whiteFlash=false,depth=0,depthTest=false,depthWrite=false,depthFunc='lequal',indexVariant=null,indexRange=null,clips=[],stencilRef=null,projection,viewProjection,worldMatrix}=options;
  if(!this.meshes.has(mesh))throw TypeError('Mesh owned by this renderer required');
  if(projection!==undefined||viewProjection?.length!==16||worldMatrix?.length!==16)throw TypeError('3D mesh draws require viewProjection and worldMatrix and cannot include projection');
  if(clips.length||stencilRef!==null)throw TypeError('three.js 벡터 메시는 clip·stencil 그리기를 지원하지 않습니다');
  if(!VECTOR_DEPTH_FUNCS[depthFunc])throw TypeError('Unsupported depthFunc');
  const index=indexVariant===null?mesh.index:mesh.variants.get(indexVariant);if(!index)throw TypeError('Known mesh index variant required');
  const first=indexRange?.[0]??0,count=indexRange?.[1]??index.count;if(first+count>index.count)throw RangeError('indexRange exceeds the selected mesh index data');if(!count)return;
  const P=mesh.parts;
  for(let i=0;i<mesh.partCount;i++){const part=parts?.[i],M=part?.transform??VECTOR_IDENTITY,shift=part?.morph??[0,0],at=i*12;
   P[at]=M[0];P[at+1]=M[2];P[at+2]=M[4];P[at+3]=0;P[at+4]=M[1];P[at+5]=M[3];P[at+6]=M[5];P[at+7]=0;P[at+8]=shift[0];P[at+9]=shift[1];P[at+10]=part?.visible===false?0:part?.opacity??1;P[at+11]=part?.depth??0;}
  let [m0,m1,m2,m3,m4,m5]=matrix,weight0=morph[0],weight1=morph[1],instanceAlpha=alpha;
  if(mesh.partCount===1){const a=m0,b=m1,c=m2,d=m3;m0=a*P[0]+c*P[4];m1=b*P[0]+d*P[4];m2=a*P[1]+c*P[5];m3=b*P[1]+d*P[5];m4=a*P[2]+c*P[6]+m4;m5=b*P[2]+d*P[6]+m5;instanceAlpha*=P[10];weight0+=P[8];weight1+=P[9];}
  const W=worldMatrix,T=this.r.T;
  const item=this.r.pooled('vector:'+mesh.shaderKey,()=>{const shader=vectorMeshShader(mesh.partCount,mesh.morphCount);return{object:new T.Mesh(new T.BufferGeometry(),this.r.material(shader.vertex,shader.fragment,{u_viewProjection:{value:new Float32Array(16)},u_color:{value:new Float32Array(4)},i_row0:{value:new Float32Array(4)},i_row1:{value:new Float32Array(4)},i_row2:{value:new Float32Array(4)},i_params:{value:new Float32Array(4)},...(mesh.partCount>1?{u_parts:{value:new Float32Array(mesh.partCount*12)}}:{})},{blend:'premultiplied'}))};});
  const material=item.object.material,u=material.uniforms;
  u.i_row0.value.set([W[0]*m0+W[4]*m1,W[0]*m2+W[4]*m3,W[0]*m4+W[4]*m5+W[12],instanceAlpha]);
  u.i_row1.value.set([W[1]*m0+W[5]*m1,W[1]*m2+W[5]*m3,W[1]*m4+W[5]*m5+W[13],forceColor?1:0]);
  u.i_row2.value.set([W[2]*m0+W[6]*m1,W[2]*m2+W[6]*m3,W[2]*m4+W[6]*m5+W[14],whiteFlash?1:0]);
  u.i_params.value.set([weight0,weight1,0,depth+(mesh.partCount===1?P[11]:0)]);u.u_color.value.set(color);u.u_viewProjection.value.set(viewProjection);if(u.u_parts)u.u_parts.value.set(P);
  material.depthTest=depthTest;material.depthWrite=depthWrite;material.depthFunc=T[VECTOR_DEPTH_FUNCS[depthFunc]];
  item.object.geometry=this.geometry(mesh,indexVariant,index,first,count);this.r.submit(item.object);
 }
 dispose(){for(const mesh of [...this.meshes])this.deleteMesh(mesh);}
}

class CompanionRenderer {
 constructor(renderer,gamekit,compiledAssets){
  if(!gamekit?.vectorAssets?.createVectorAsset||!compiledAssets?.pebbleMole)throw Error('GameKit SVG vector assets are unavailable');
  this.r=renderer;this.atlas=createCompanionCombatAtlas();this.atlas.texture=renderer.canvasTexture(this.atlas.canvas);
  this.meshes=new ThreeVectorMeshes(renderer);this.asset=gamekit.vectorAssets.createVectorAsset(this.meshes,compiledAssets.pebbleMole);this.characterAssets=new Map(Object.entries(compiledAssets.characters||{}).map(([id,asset])=>[id,gamekit.vectorAssets.createVectorAsset(this.meshes,asset)]));this.characterPlayers=new Map();this.characterWorld=[];this.characterSamples=[];this.players=new Map();this.samples=[];this.frameActive=false;
 }
 beginFrame(){this.frameActive=true;return true;}
 endFrame(){if(!this.frameActive)return;this.frameActive=false;for(const [key,state]of this.players)if(this.r.frame-state.lastSeen>1800){state.player.dispose();this.players.delete(key);}for(const [key,state]of this.characterPlayers)if(this.r.frame-state.lastSeen>1800){state.player.dispose();this.characterPlayers.delete(key);}}
 dispose(){for(const state of this.players.values())state.player.dispose();this.players.clear();for(const state of this.characterPlayers.values())state.player.dispose();this.characterPlayers.clear();for(const asset of this.characterAssets.values())asset.dispose();this.characterAssets.clear();this.asset.dispose();this.meshes.dispose();this.atlas.texture.dispose();}
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
  player.draw({viewProjection:r.vp,worldMatrix,alpha:item.alpha??1,color:item.tint||[1,1,1,1],whiteFlash:!!item.whiteFlash,depthTest:true,depthWrite:false,depthFunc:'lequal'});
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
  player.seek(timeMs);player.draw({viewProjection:r.vp,worldMatrix,alpha:1,depthTest:true,depthWrite:false,depthFunc:'lequal'});
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
   else if(['hurt','hurtHeavy','rise','fall','land'].includes(sample.clip)){clip='ground';frame=sample.frame%3;}
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
  this.r.drawSprites(vertices,this.atlas.texture,{ambient:this.r.ambient??1,depthWrite:false});
 }
}

