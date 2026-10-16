/* The existing woodcutter stays on its authored claw atlas; the pebble mole uses one GameKit SVG source. */
const COMPANION_SPRITE=Object.freeze({cell:128,pixelsPerMeter:32,size:2048});

function createPebbleMoleFrames(vectorKit,cell,clips){
 if(!vectorKit?.WebGLDevice||!vectorKit?.MeshRenderer||!vectorKit?.createVectorAsset||!vectorKit?.pebbleMole)throw Error('GameKit pebble mole asset is missing');
 const canvas=document.createElement('canvas');canvas.width=canvas.height=cell;
 const device=new vectorKit.WebGLDevice(canvas,{alpha:true,antialias:true,depth:false,stencil:false,preserveDrawingBuffer:true});
 const meshes=new vectorKit.MeshRenderer(device),asset=vectorKit.createVectorAsset(meshes,vectorKit.pebbleMole),players=new Map(),frames={};
 const [minX,minY,width,height]=asset.viewBox,viewScale=[1,.94,.80,.94,.82];
 const projection=view=>{const sx=viewScale[view],a=2*sx/width;return new Float32Array([a,0,0,0,-2/height,0,-a*(minX+width*.5),1+2*minY/height,1]);};
 try{
  for(const [clip]of Object.entries(clips))players.set(clip,asset.createPlayer({clip}));
  for(const [clip,count]of Object.entries(clips))for(let view=0;view<5;view++)for(let frame=0;frame<count;frame++){
   const player=players.get(clip),duration=asset.metadata.clips[clip].durationMs;
   player.setExpression(view>=3?'back':'front');player.seek(count===1?0:duration*frame/(count-1));
   if(!device.beginFrame({width:cell,height:cell,clearColor:[0,0,0,0]}))throw Error('GameKit vector canvas is unavailable');
   meshes.beginFrame();player.draw({projection:projection(view)});meshes.flush();device.endFrame();
   const tile=document.createElement('canvas');tile.width=tile.height=cell;tile.getContext('2d').drawImage(canvas,0,0);frames[clip+'/'+view+'/'+frame]=tile;
  }
  return frames;
 }finally{asset.dispose();meshes.dispose();device.dispose();}
}

function createCompanionCombatAtlas(gl,vectorKit){
 const {cell,pixelsPerMeter:S,size}=COMPANION_SPRITE,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const dest=canvas.getContext('2d'),frames={};let index=0;
 const layouts={claw:{attack:12,work:4,return:4},ball:{prepare:8,flight:3,ground:3,return:3,work:4,idle:4,walk:4}};
 const vectorFrames=createPebbleMoleFrames(vectorKit,cell,layouts.ball);
 for(const [mode,clips]of Object.entries(layouts))for(const [clip,count]of Object.entries(clips))for(let view=0;view<5;view++)for(let frame=0;frame<count;frame++){
  const x=index%16*cell,y=Math.floor(index/16)*cell;
  if(y+cell>size)throw Error('동료 아틀라스 용량 초과');
  if(mode==='ball'){
   dest.drawImage(vectorFrames[clip+'/'+view+'/'+frame],x,y);
   frames[mode+'/'+clip+'/'+view+'/'+frame]={u0:x/size,u1:(x+cell)/size,v0:1-y/size,v1:1-(y+cell)/size,x,y,w:cell,h:cell};index++;continue;
  }
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
