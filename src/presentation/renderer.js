class Renderer {
 constructor(canvas,vectorKit){this.canvas=canvas;this.gl=canvas.getContext('webgl',{alpha:false,antialias:true,depth:true});if(!this.gl)throw Error('WebGL이 필요한 게임입니다.');const gl=this.gl;this.camera={yaw:0,pitch:.20,first:false,distance:initialCameraDistance()};this.viewRadius=matchMedia('(pointer:coarse)').matches?Math.min(2,CFG.view):CFG.view;this.atlas=createSpriteAtlas(gl);this.companionRenderer=new CompanionRenderer(this,vectorKit);this.meshes=new Map();this.meshBuilder=new MeshBuilder();this.worldRef=null;this.streamSignature=null;this.streamComplete=false;this.visibleChunks=new Set();this.readyChunks=new Set();this.visibleColumns=new Set();this.visibleY={min:0,max:-1};this.particles=[];this.blockFx=null;this.mineFxStep=-1;this.actionFx=null;this.blockFxStats={mines:0,places:0,chips:0,blocked:0};this.vp=null;this.eye=null;this.frame=0;this.fov=65;this.ambient=1;this.stats={drawCalls:0,vertices:0};
  this.blockAtlas=createBlockAtlas(gl);this.iconCanvases=new Map();this.blockIcons=createBlockIcons(this.blockAtlas,this.iconCanvases);this.itemIcons=createItemIcons(this.iconCanvases);this.dropAtlas=createDropAtlas(gl,this.iconCanvases);this.combatFx=new CombatVisuals(this);this.healthHud=new EnemyHealthHUD(this);
  const derivatives=!!gl.getExtension('OES_standard_derivatives');
  this.terrainProgram=this.program('attribute vec3 p;attribute vec3 n;attribute float material;uniform mat4 vp;varying vec3 wp;varying vec3 normal;varying float mat;void main(){wp=p;normal=n;mat=material;gl_Position=vp*vec4(p,1.);}',
   (derivatives?'#extension GL_OES_standard_derivatives : enable\n':'')+`precision highp float;
   varying vec3 wp;varying vec3 normal;varying float mat;uniform sampler2D tiles;uniform vec3 eye;uniform vec3 fog;uniform vec4 lights[8];uniform float ambient;uniform float textured;
   void main(){vec3 n=normal;bool top=abs(n.y)>.5;vec2 uv=top?wp.xz:abs(n.x)>.5?vec2(wp.z,-wp.y):vec2(wp.x,-wp.y);
    float face=n.y>.5?0.:n.y<-.5?2.:1.;float tile=floor(mat+.5)*3.+face;vec2 origin=vec2(mod(tile,8.),floor(tile/8.))*32.;
    vec2 coords=(origin+8.+floor(fract(uv)*16.)+.5)/vec2(256.,512.);vec3 pixel=texture2D(tiles,coords).rgb,average=texture2D(tiles,(origin+31.5)/vec2(256.,512.)).rgb;
    float footprint=${derivatives?'max(length(dFdx(uv)),length(dFdy(uv)))*16.':'distance(wp,eye)/24.'};
    float blend=smoothstep(${CFG.textures.minifyStart.toFixed(2)},${CFG.textures.minifyEnd.toFixed(2)},footprint);
    vec3 c=mix(average,mix(pixel,average,blend),textured);float shade=top?(n.y>.5?1.:.57):abs(n.x)>.5?.79:.90;
    float light=ambient;for(int i=0;i<8;i++){light+=lights[i].w*max(0.,1.-distance(lights[i].xyz,wp)/10.)*.75;}
    c*=shade*clamp(light,.16,1.3);gl_FragColor=vec4(mix(c,fog,smoothstep(33.,69.,distance(wp,eye))),1.);
   }`);
  this.vfxProgram=this.program('attribute vec3 p;attribute vec4 tint;uniform mat4 vp;varying vec4 t;void main(){t=tint;gl_Position=vp*vec4(p,1.);}', 'precision mediump float;varying vec4 t;void main(){gl_FragColor=t;}');
  this.vfxBuffer=gl.createBuffer();this.vfxSprites=gl.createBuffer();
  this.meshProgram=this.program('attribute vec3 p;attribute vec3 c;uniform mat4 vp;varying vec3 col;varying vec3 wp;void main(){wp=p;col=c;gl_Position=vp*vec4(p,1.);}',
   'precision mediump float;varying vec3 col;varying vec3 wp;uniform vec3 eye;uniform float ambient;uniform vec3 fog;uniform vec4 lights[8];void main(){float l=ambient;for(int i=0;i<8;i++){l+=lights[i].w*max(0.,1.-distance(lights[i].xyz,wp)/10.)*.75;}vec3 c=col*clamp(l,.16,1.3);float grid=min(min(fract(wp.x+.002),fract(wp.y+.002)),fract(wp.z+.002));c*=.97+.03*step(.03,grid);gl_FragColor=vec4(mix(c,fog,smoothstep(33.,69.,distance(wp,eye))),1.);}');
  this.spriteProgram=this.program('attribute vec3 p;attribute vec2 uv;attribute vec4 tint;uniform mat4 vp;varying vec2 v;varying vec4 t;void main(){v=uv;t=tint;gl_Position=vp*vec4(p,1.);}',
   'precision mediump float;uniform sampler2D tex;uniform float ambient;varying vec2 v;varying vec4 t;void main(){vec4 c=texture2D(tex,v)*t;if(c.a<.025)discard;gl_FragColor=vec4(c.rgb*max(.5,ambient),c.a);}');
  this.skyProgram=this.program('attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,1.,1.);}',
   'precision mediump float;varying vec2 uv;uniform float ambient;uniform float yaw;uniform float daylight;uniform float twilight;uniform vec3 sun;uniform vec3 moon;void main(){vec3 day=mix(vec3(.79,.9,.78),vec3(.32,.67,.89),uv.y);vec3 night=mix(vec3(.14,.19,.25),vec3(.025,.04,.1),uv.y);vec3 c=mix(night,day,daylight);float warm=twilight*(.32+.68*(1.-smoothstep(.30,.92,uv.y)));c=mix(c,vec3(1.,.47,.26),.75*warm);float ds=length((uv-sun.xy)*vec2(1.8,1.));float dm=length((uv-moon.xy)*vec2(1.8,1.));c+=sun.z*(vec3(1.,.63,.24)*.18*exp(-ds*13.)+vec3(1.,.89,.52)*.72*(1.-smoothstep(.019,.027,ds)));c+=moon.z*vec3(.55,.69,.84)*.22*(1.-smoothstep(.014,.022,dm));float cloud=smoothstep(.94,1.,sin((uv.x+yaw*.04)*17.+sin(uv.y*11.))*sin(uv.y*24.));c+=cloud*.08*daylight;gl_FragColor=vec4(c,1.);}');
  this.uintIndices=gl.getExtension('OES_element_index_uint');this.waterProgram=this.program('attribute vec3 p;attribute vec4 c;uniform mat4 vp;varying vec4 tint;varying vec3 worldPos;void main(){tint=c;worldPos=p;gl_Position=vp*vec4(p,1.);}', 'precision mediump float;varying vec4 tint;varying vec3 worldPos;uniform float phase;void main(){vec2 xy=floor(worldPos.xz*6.);float line=step(.96,fract(sin(dot(xy,vec2(12.9898,78.233))+floor(phase*3.)*.41)*43758.5453));gl_FragColor=vec4(tint.rgb*(1.+line*.075),tint.a);}');this.waterMeshes=new Map();this.waterDrawList=[];this.dynamic=gl.createBuffer();this.spriteBuffer=gl.createBuffer();this.skyBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);gl.enable(gl.DEPTH_TEST);
 }
 program(v,f){const gl=this.gl,p=gl.createProgram();for(const [type,src]of [[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);gl.deleteShader(s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
 attrib(p,name,n,stride,offset){const gl=this.gl;if(this.attributeProgram!==p){for(let i=0;i<8;i++)gl.disableVertexAttribArray(i);this.attributeProgram=p;}const l=gl.getAttribLocation(p,name);if(l<0)return;gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,stride,offset);}
 resize(){const ratio=Math.min(devicePixelRatio||1,1.5),w=Math.round(this.canvas.clientWidth*ratio),h=Math.round(this.canvas.clientHeight*ratio);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.gl.viewport(0,0,w,h);}
 updateCamera(actor,sim,renderPos=actor.pos){const c=this.camera,forward=direction(c.yaw,c.pitch),eye=V.add(renderPos,{x:0,y:CFG.player.eyeHeight,z:0});let camera={...eye};this.fov=lerp(this.fov||65,actor.sprinting?71:65,actor.sprinting?.18:.12);
  if(!c.first){const right={x:cosQ(c.yaw),y:0,z:-sinQ(c.yaw)},back=V.add(V.scale(forward,-c.distance),V.scale(right,.55)),length=V.len(back),hit=sim.terrain.ray(eye,V.norm(back),length);camera=V.add(eye,V.scale(V.norm(back),hit?Math.max(.2,hit.distance-.25):length));}
  this.right={x:cosQ(c.yaw),y:0,z:-sinQ(c.yaw)};camera=V.add(camera,this.combatFx.cameraOffset());this.eye=camera;this.forward=forward;this.right={x:cosQ(c.yaw),y:0,z:-sinQ(c.yaw)};this.vp=matrixMul(projection(this.fov*Math.PI/180,this.canvas.width/this.canvas.height,.035,130),viewMatrix(arr(camera),arr(V.add(camera,forward))));
 }

 blockFaceLine(out,center,u,v,x0,y0,x1,y1,width,color){
  const dx=x1-x0,dy=y1-y0,l=Math.hypot(dx,dy)||1,ox=-dy/l*width*.5,oy=dx/l*width*.5;
  const at=(x,y)=>[center.x+u.x*x+v.x*y,center.y+u.y*x+v.y*y,center.z+u.z*x+v.z*y];
  const pts=[at(x0+ox,y0+oy),at(x1+ox,y1+oy),at(x1-ox,y1-oy),at(x0-ox,y0-oy)];
  for(const i of [0,1,2,0,2,3])out.push(...pts[i],...color);
 }
 blockFace(out,hit,progress=0){
  const n=hit.normal,center={x:hit.x+.5+n.x*.514,y:hit.y+.5+n.y*.514,z:hit.z+.5+n.z*.514};
  const u=n.x?{x:0,y:0,z:1}:{x:1,y:0,z:0},v=n.y?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const color=progress?[1,.83,.44]:[.83,.93,.74];
  const line=(x0,y0,x1,y1,w=.018,c=color)=>this.blockFaceLine(out,center,u,v,x0,y0,x1,y1,w,c);
  // Inset corner brackets are readable without obscuring the whole block.
  for(const a of [-1,1])for(const b of [-1,1]){
   line(a*.46,b*.46,a*.28,b*.46,.025);line(a*.46,b*.46,a*.46,b*.28,.025);
  }
  if(progress>0){
   const paths=[[[0,0],[.20,.14]],[[0,0],[-.17,.22]],[[0,0],[.07,-.25]],[[.20,.14],[.36,.26]],[[.07,-.25],[.29,-.36]],[[-.17,.22],[-.36,.31]],[[.20,.14],[.36,.04]],[[-.17,.22],[-.31,-.07]]];
   const count=Math.min(paths.length,Math.ceil(progress*paths.length));
   for(let i=0;i<count;i++)line(...paths[i][0],...paths[i][1],.024,[.20,.17,.13]);
  }
 }
 addBlockChips(pos,color,count,normal=null,kind='chip'){
  const tint=c3(color||'#d8c69a'),n=normal||{x:0,y:1,z:0};
  for(let i=0;i<count;i++){
   if(this.particles.length>=140)this.particles.shift();
   const size=.055+Math.random()*.09,life=(kind==='break'?.40:kind==='place'?.25:.18)+Math.random()*.14;
   this.particles.push({kind:'block',pos:{x:pos.x+(Math.random()-.5)*.65,y:pos.y+(Math.random()-.5)*.65,z:pos.z+(Math.random()-.5)*.65},
    v:{x:(Math.random()-.5)*2.8+n.x*1.3,y:Math.random()*2.8+(kind==='place'?.6:1),z:(Math.random()-.5)*2.8+n.z*1.3},size,life,maximum:life,color:tint});
  }
 }
 projected(pos){return projectWorldToScreen(this.vp,pos,this.canvas.clientWidth,this.canvas.clientHeight);}
 uploadMesh(m){const started=performance.now(),gl=this.gl,count=m.vertices.length/3,buf=new Float32Array(count*7);
  if(!m.materials||m.materials.length!==count)throw Error('텍스처 재질 데이터 누락');
  for(let i=0;i<count;i++){buf.set(m.vertices.subarray(i*3,i*3+3),i*7);buf.set(m.normals.subarray(i*3,i*3+3),i*7+3);buf[i*7+6]=m.materials[i];}
  const indices=count<=65535?new Uint16Array(m.indices):m.indices;if(indices instanceof Uint32Array&&!this.uintIndices)throw Error('32비트 메시 인덱스 미지원');
  const buffer=gl.createBuffer(),index=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,buf,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);METRICS.add('render.upload',performance.now()-started);
  return{buffer,index,count:indices.length,indexType:indices instanceof Uint16Array?gl.UNSIGNED_SHORT:gl.UNSIGNED_INT,revision:m.revision,bytes:buf.byteLength+indices.byteLength};
 }
 deleteMesh(m){if(!m)return;this.gl.deleteBuffer(m.buffer);this.gl.deleteBuffer(m.index);}
 stream(sim,actor){const started=performance.now();if(this.worldRef!==sim.terrain){for(const m of this.meshes.values())this.deleteMesh(m);this.meshes.clear();this.worldRef=sim.terrain;this.meshBuilder.reset(sim.terrain);this.streamSignature=null;this.streamComplete=false;this.uploadReady=[];this.visibleChunks.clear();this.readyChunks.clear();this.visibleColumns.clear();this.clearWaterMeshes();this.particles.length=0;}
  this.meshBuilder.sync(sim.terrain);const C=CFG.chunk,cx=Math.floor(actor.pos.x/C),cy=Math.floor(actor.pos.y/C),cz=Math.floor(actor.pos.z/C),want=new Set(),columns=new Set(),todo=[],distances=new Map(),yMin=Math.max(Math.floor(CFG.bottom/C),cy-1),yMax=Math.min(Math.ceil(CFG.top/C)-1,cy+1);
  for(let dz=-this.viewRadius;dz<=this.viewRadius;dz++)for(let dx=-this.viewRadius;dx<=this.viewRadius;dx++){const column=columnKey(cx+dx,cz+dz);columns.add(column);for(let y=yMin;y<=yMax;y++){const key=chunkKey(cx+dx,y,cz+dz),old=this.meshes.get(key),rev=sim.terrain.revisions.get(key)||0,dist=dx*dx+dz*dz+Math.abs(y-cy);want.add(key);distances.set(key,dist);if(!old||old.revision!==rev)todo.push({key,revision:rev,dist,dirty:!!old});}}
  todo.sort((a,b)=>Number(b.dirty)-Number(a.dirty)||a.dist-b.dist||cmp(a.key,b.key));
  this.uploadReady.push(...this.meshBuilder.takeReady(want));this.uploadReady=this.uploadReady.filter(m=>want.has(m.key)&&m.revision===(sim.terrain.revisions.get(m.key)||0));this.uploadReady.sort((a,b)=>(distances.get(a.key)||0)-(distances.get(b.key)||0)||cmp(a.key,b.key));
  const uploadStart=performance.now();let count=0;while(this.uploadReady.length&&count<CFG.render.maxUploads&&(count===0||performance.now()-uploadStart<CFG.render.uploadBudgetMs)){const m=this.uploadReady.shift(),previous=this.meshes.get(m.key);this.meshes.set(m.key,this.uploadMesh(m));this.deleteMesh(previous);this.meshBuilder.stats.accepted++;count++;}
  for(const job of todo){const current=this.meshes.get(job.key);if(current?.revision===job.revision||this.uploadReady.some(m=>m.key===job.key&&m.revision===job.revision))continue;this.meshBuilder.request(job.key,job.revision);}
  this.meshBuilder.pump();for(const [key,m]of this.meshes)if(!want.has(key)){this.deleteMesh(m);this.meshes.delete(key);}
  const ready=new Set();for(const key of want){const m=this.meshes.get(key);if(m&&m.revision===(sim.terrain.revisions.get(key)||0))ready.add(key);}
  this.visibleChunks=want;this.readyChunks=ready;this.visibleColumns=columns;this.visibleY={min:yMin,max:yMax};this.streamComplete=ready.size===want.size;
  this.updateWaterMeshes(sim.terrain,actor);
  if(this.frame%120===0)sim.terrain.prune([...Object.values(sim.actors),...Object.values(sim.drops),...Object.values(sim.projectiles)].map(a=>a.pos),want);METRICS.add('render.stream',performance.now()-started);
 }
 worldVisualReady(pos,radius=0){if(!pos||!this.worldRef||!this.readyChunks.size)return false;const C=CFG.chunk,r=Math.max(0,Math.min(.75,radius)),points=r?[[pos.x-r,pos.z-r],[pos.x+r,pos.z-r],[pos.x-r,pos.z+r],[pos.x+r,pos.z+r]]:[[pos.x,pos.z]],feetY=pos.y+.02,cy=Math.floor(feetY/C),belowCy=Math.floor((pos.y-.08)/C);if(cy<this.visibleY.min||cy>this.visibleY.max)return false;for(const [x,z]of points){const cx=Math.floor(x/C),cz=Math.floor(z/C),column=columnKey(cx,cz);if(!this.visibleColumns.has(column))return false;for(const y of belowCy===cy?[cy]:[belowCy,cy]){if(y<this.visibleY.min||y>this.visibleY.max||!this.readyChunks.has(chunkKey(cx,y,cz)))return false;}}
  const water=this.worldRef.water,wx=Math.floor(pos.x),wy=Math.floor(pos.y-.12),wz=Math.floor(pos.z);
  if(water.level(wx,wy,wz)>0){const ck=chunkKey(Math.floor(wx/C),Math.floor(wy/C),Math.floor(wz/C)),m=this.waterMeshes.get(ck);
   if(!m||m.revision!==(water.chunkRevisions.get(ck)||0)||m.boundaryMask!==this.waterBoundaryMask(ck))return false;}
  return true;}
 entityVisualReady(entity){if(!entity)return false;return this.worldVisualReady(entity.pos,CFG.player.radius*(entity.scale||1));}
 lights(sim,actor){const out=new Float32Array(32),entries=sim.terrain.lightEntries(actor.pos);let n=0;for(const light of entries){if(n===8)break;out.set([light.x,light.y,light.z,1],n++*4);}if(V.len(V.sub(actor.pos,sim.terrain.altar))<20&&n<8)out.set([24.5,6,-13.5,1],n++*4);return out;}
 terrainState(lights){const gl=this.gl,p=this.terrainProgram;gl.useProgram(p);gl.uniformMatrix4fv(gl.getUniformLocation(p,'vp'),false,this.vp);gl.uniform3fv(gl.getUniformLocation(p,'eye'),arr(this.eye));gl.uniform1f(gl.getUniformLocation(p,'ambient'),this.ambient);gl.uniform3fv(gl.getUniformLocation(p,'fog'),this.fog);gl.uniform4fv(gl.getUniformLocation(p,'lights[0]'),lights);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.blockAtlas.tex);gl.uniform1i(gl.getUniformLocation(p,'tiles'),1);gl.uniform1f(gl.getUniformLocation(p,'textured'),this.combatFx.options.textures?1:0);}
 meshState(lights){const gl=this.gl,p=this.meshProgram;gl.useProgram(p);gl.uniformMatrix4fv(gl.getUniformLocation(p,'vp'),false,this.vp);gl.uniform3fv(gl.getUniformLocation(p,'eye'),arr(this.eye));gl.uniform1f(gl.getUniformLocation(p,'ambient'),this.ambient);gl.uniform3fv(gl.getUniformLocation(p,'fog'),this.fog);gl.uniform4fv(gl.getUniformLocation(p,'lights[0]'),lights);}
 box(out,pos,scale,color,forward=null){const f=forward?normal([forward.x,0,forward.z]):[0,0,1],right=[f[2],0,-f[0]],p=(x,y,z)=>[pos.x+right[0]*x+f[0]*z,pos.y+y,pos.z+right[2]*x+f[2]*z],x=scale.x/2,z=scale.z/2,y=scale.y;
  const a=p(-x,0,-z),b=p(x,0,-z),c=p(x,y,-z),d=p(-x,y,-z),e=p(-x,0,z),f1=p(x,0,z),g=p(x,y,z),h=p(-x,y,z);
  for(const [quad,shade]of [[[a,d,c,b],.8],[[e,f1,g,h],1],[[a,e,h,d],.75],[[b,c,g,f1],.88],[[d,h,g,c],1.1],[[a,b,f1,e],.55]])for(const i of [0,1,2,0,2,3])out.push(...quad[i],...color.map(n=>n*shade));}
 weaponBeam(out,a,b,width,color){const f=V.norm(V.sub(b,a)),s=V.norm({x:f.z,y:0,z:-f.x}),u=V.norm({x:-f.y*s.z,y:f.z*s.x-f.x*s.z,z:f.y*s.x}),p=(v,i,j)=>V.add(v,V.add(V.scale(s,i*width),V.scale(u,j*width*.5))),q=[p(a,-1,-1),p(a,1,-1),p(a,1,1),p(a,-1,1),p(b,-1,-1),p(b,1,-1),p(b,1,1),p(b,-1,1)];for(const face of [[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5],[4,5,6,7]])for(const i of [0,1,2,0,2,3])out.push(q[face[i]].x,q[face[i]].y,q[face[i]].z,...color);}
 sprite(out,pos,w,h,frame,tint,flip=false,roll=0){const r=this.right;let right={x:r.x*Math.cos(roll),y:Math.sin(roll),z:r.z*Math.cos(roll)},up={x:-r.x*Math.sin(roll),y:Math.cos(roll),z:-r.z*Math.sin(roll)};
  const p=(x,y)=>[pos.x+right.x*x+up.x*y,pos.y+right.y*x+up.y*y,pos.z+right.z*x+up.z*y];const pts=[p(-w/2,0),p(w/2,0),p(w/2,h),p(-w/2,h)],u0=flip?frame.u1:frame.u0,u1=flip?frame.u0:frame.u1,uv=[[u0,frame.v1],[u1,frame.v1],[u1,frame.v0],[u0,frame.v0]];for(const i of [0,1,2,0,2,3])out.push(...pts[i],...uv[i],...tint);
 }
 presentEvent(event,sim,localActorId){
  if(event.type==='mine'||event.type==='place'){
   this.addBlockChips(event.pos,event.color,event.type==='mine'?18:10,event.normal,event.type==='mine'?'break':'place');
   this.blockFx={pos:event.pos,kind:event.type,time:0,duration:event.type==='mine'?300:210,color:c3(event.color||'#e5ce9b')};
   this.blockFxStats[event.type==='mine'?'mines':'places']++;
   if(event.actorId===localActorId)this.actionFx={kind:event.type,elapsed:0,duration:230};
  }else if(event.type==='place-blocked'&&event.actorId===localActorId){this.blockFxStats.blocked++;this.actionFx={kind:'blocked',elapsed:0,duration:160};}
  this.combatFx.event(event,sim,localActorId);
 }
 spritePlane(out,center,u,v,frame,tint,flip=false){const p=(x,y)=>arr(V.add(center,V.add(V.scale(u,x),V.scale(v,y)))),pts=[p(-.5,-.5),p(.5,-.5),p(.5,.5),p(-.5,.5)],u0=flip?frame.u1:frame.u0,u1=flip?frame.u0:frame.u1,uv=[[u0,frame.v1],[u1,frame.v1],[u1,frame.v0],[u0,frame.v0]];for(const i of [0,1,2,0,2,3])out.push(...pts[i],...uv[i],...tint);}
 render(sim,authority,dt,displayFrame){
  const view={actors:{},drops:{},projectiles:{},companions:{}};displayFrame.forEach(model=>{const value=model.displayKind==='actor'?{...model,facing:direction(model.yaw,model.pitch)}:model;view[model.displayKind==='actor'?'actors':model.displayKind==='drop'?'drops':model.displayKind==='companion'?'companions':'projectiles'][model.id]=value;});
  const actor=view.actors[authority.id];if(!actor)return;this.displayTimeMs=displayFrame.timeMs;
  if(this.worldRef!==sim.terrain){this.combatFx.reset();this.particles.length=0;this.blockFx=null;this.actionFx=null;}
  this.combatFx.advance(dt);this.frame++;this.resize();const viewPos=actor.pos;this.updateCamera(actor,sim,viewPos);this.stream(sim,authority);const gl=this.gl;const daylight=sim.daylight(),phase=sim.dayPhase(),alt=Math.cos(TAU*phase),twilight=Math.pow(1-Math.abs(alt),3);
  this.ambient=.20+.80*daylight;
  this.fog=[lerp(.075,.69,daylight)+.11*twilight,lerp(.11,.85,daylight)+.025*twilight,lerp(.19,.86,daylight)-.17*twilight];this.stats={drawCalls:0,vertices:0};gl.clearColor(...this.fog,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  gl.useProgram(this.skyProgram);gl.bindBuffer(gl.ARRAY_BUFFER,this.skyBuffer);this.attrib(this.skyProgram,'p',2,8,0);gl.uniform1f(gl.getUniformLocation(this.skyProgram,'ambient'),this.ambient);gl.uniform1f(gl.getUniformLocation(this.skyProgram,'yaw'),this.camera.yaw);
  gl.uniform1f(gl.getUniformLocation(this.skyProgram,'daylight'),daylight);
  gl.uniform1f(gl.getUniformLocation(this.skyProgram,'twilight'),twilight);
  // Sun and moon share a continuous solar arc; camera yaw controls their screen azimuth.
  const az=TAU*phase-this.camera.yaw;
  const x=.5+.43*Math.sin(az),y=.30+.54*alt-.20*this.camera.pitch;
  gl.uniform3fv(gl.getUniformLocation(this.skyProgram,'sun'),new Float32Array([x,y,Math.cos(az)>0?.95:0]));
  gl.uniform3fv(gl.getUniformLocation(this.skyProgram,'moon'),new Float32Array([.5-.43*Math.sin(az),.30-.54*alt-.20*this.camera.pitch,Math.cos(az)<0?1:0]));
  gl.drawArrays(gl.TRIANGLES,0,6);gl.enable(gl.DEPTH_TEST);
  const lights=this.lights(sim,actor);this.terrainState(lights);
  for(const [key,m]of this.meshes){if(!m.count)continue;const [x,y,z]=key.split(':').map(Number),dx=(x+.5)*16-this.eye.x,dz=(z+.5)*16-this.eye.z;if(dx*this.forward.x+dz*this.forward.z<-18||Math.hypot(dx,dz)>75)continue;gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);this.attrib(this.terrainProgram,'p',3,28,0);this.attrib(this.terrainProgram,'n',3,28,12);this.attrib(this.terrainProgram,'material',1,28,24);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.index);gl.drawElements(gl.TRIANGLES,m.count,m.indexType,0);this.stats.drawCalls++;this.stats.vertices+=m.count;}
  const dyn=[],sprites=[];
  // Fluid volumes are submitted separately after solid terrain; no global sea plane.
  this.animationSamples={};
  for(const a of Object.values(view.actors)){
   if(a.speciesId==='shell'||a.dead||this.camera.first&&a.id===actor.id||a.id!==actor.id&&!this.entityVisualReady(a))continue;
   const visual=this.combatFx.pose(a),reaction=this.combatFx.reactions.get(a.id),scale=a.scale||1,c=visual.combat;
   const sample=actorSpritePose(visual,this.camera.yaw,reaction);this.animationSamples[a.id]=sample;
   const frame=this.atlas.frames[sample.kind+'/'+sample.dir+'/'+sample.clip+'/'+sample.frame]||this.atlas.frames[sample.kind+'/'+sample.dir+'/idle/0'];
   let tint=a.speciesId?[...SPECIES[a.speciesId].wild.tint]:a.boss?[...BOSS.tint]:[[1,1,1,1],[.78,.89,1,1],[1,.8,.9,1],[1,.92,.7,1]][hashStr(a.id)%4];if(a.id===actor.id)tint=[1,1,1,1];if(a.suspended)tint=[.55,.57,.55,1];
   if(reaction&&!reaction.guard&&reaction.age<CFG.combat.feedback.flash)tint=reaction.age<45?[2.8,2.7,2.3,1]:[1.75,.65,.5,1];
   const rp=a.pos;this.sprite(sprites,rp,1.65*64/48*scale,2*64/56*scale,frame,tint,sample.flip,0);
   const raw=sim.actors[a.id],hit=raw?sim.physics.ground(raw,rp,2.5):null;if(hit&&hit.normal.y>.7){const y=rp.y+a.offset-hit.timeOfImpact+.012,height=Math.max(0,rp.y-y),factor=1/(1+height*.3);this.box(dyn,{x:rp.x,y,z:rp.z},{x:.66*scale*factor,y:.01,z:.44*scale*factor},[.20,.30,.22]);}
  }
  for(const raw of Object.values(view.actors)){
   if(raw.dead||raw.enemy||raw.combat.state==='roll'||this.camera.first&&raw.id===actor.id||raw.id!==actor.id&&!this.entityVisualReady(raw))continue;const a=this.combatFx.pose(raw),st=Inventory.stats(a),item=st.item,c=a.combat,act=c.action,rp=a.pos;
   if(c.state==='attack'&&act&&!act.companionId&&!['arrow','quickshot','precision'].includes(act.kind)){
    const phase=clamp((c.elapsed-act.wind)/act.active,0,1),pose=weaponVisualPose({...a,pos:rp},act,c.elapsed),col=c3(st.material?.color||'#edcea0');
    if(act.weapon==='fist'){if(c.elapsed>=act.wind&&c.elapsed<act.wind+act.active){this.box(dyn,{...pose.tip,y:pose.tip.y-.13},{x:.23,y:.26,z:.23},col);}}
    else{const root=V.add(pose.origin,V.scale(pose.dir,.45)),tip=pose.tip;this.weaponBeam(dyn,root,tip,act.weapon==='greatsword'?.19:act.weapon==='spear'?.075:.10,col);
     if(act.weapon==='axe')this.box(dyn,{...tip,y:tip.y-.16},{x:.58,y:.32,z:.15},col,pose.dir);
     if(act.weapon==='shield')this.box(dyn,{...tip,y:tip.y-.45},{x:.78,y:.9,z:.13},col,pose.dir);
    }
   }else if(a.companionSlot<0&&(item?.weapon||item?.tool)){
    const f=a.facing,side={x:f.z,y:0,z:-f.x},p=V.add(rp,{x:f.x*.35+side.x*.35,y:1.05,z:f.z*.35+side.z*.35}),col=c3(st.material?.color||'#dac6a6');
    if(item.weapon==='shield')this.box(dyn,p,{x:.75,y:.85,z:.12},col,f);
    else{this.box(dyn,p,{x:.10,y:.13,z:.65},c3('#8e6246'),f);this.box(dyn,V.add(p,V.scale(f,.70)),{x:item.weapon==='greatsword'?.23:.13,y:.11,z:item.weapon==='spear'?1.6:item.weapon==='dagger'?.5:1.1},col,f);if(item.weapon==='axe'||item.tool==='pick')this.box(dyn,V.add(p,V.scale(f,1)),{x:.60,y:.27,z:.13},col,f);}
   }
  }
  const dropSprites=[];for(const d of Object.values(view.drops)){const dp=d.pos,frame=this.dropAtlas.frames[d.item];if(!frame||!this.worldVisualReady(dp,.16))continue;
    const bob=Math.sin(d.age*.007+(hashStr(d.id)%37)*.12)*.045;
    this.sprite(dropSprites,{x:dp.x,y:dp.y-.075+bob,z:dp.z},.72,.72,frame,[1,1,1,1]);}

  for(const s of Object.values(view.projectiles)){const sp=s.pos;if(s.companionId||!this.worldVisualReady(sp,.08))continue;this.box(dyn,sp,{x:.08,y:.08,z:.55},s.enemy?[.75,.42,.73]:[.9,.79,.4],s.dir);}
  const hit=sim.aim(authority);this.target=hit;
  if(hit){
   const key=blockKey(hit.x,hit.y,hit.z),mining=authority.mine.target===key&&authority.mine.elapsed>0;
   const progress=mining?clamp(authority.mine.elapsed/Math.max(1,BLOCKS[hit.id].hardness),0,1):0;
   this.blockFace(dyn,hit,progress);
   const index=mining?Math.floor(authority.mine.elapsed/140):-1;
   if(index!==this.mineFxStep&&index>=0&&index<=8){
    const n=hit.normal,p={x:hit.x+.5+n.x*.50,y:hit.y+.5+n.y*.50,z:hit.z+.5+n.z*.50};
    this.addBlockChips(p,BLOCKS[hit.id].color,3,n);
    this.blockFxStats.chips++;
   }
   this.mineFxStep=index;
  }else this.mineFxStep=-1;

  for(let i=this.particles.length-1;i>=0;i--){
   const p=this.particles[i];p.life-=dt/1000;p.pos=V.add(p.pos,V.scale(p.v,dt/1000));p.v.y-=8*dt/1000;
   if(p.life<=0){this.particles.splice(i,1);continue;}
   if(!this.worldVisualReady(p.pos,.05))continue;
   if(p.kind==='block'){
    const f=p.life/p.maximum,sz=p.size*f;
    this.box(dyn,{x:p.pos.x,y:p.pos.y-sz*.5,z:p.pos.z},{x:sz,y:sz,z:sz},p.color);
   }else this.sprite(sprites,p.pos,.15,.15,this.atlas.frames['fx/spark'],p.type==='guard'?[.7,.9,1,1]:[1,.84,.51,1]);
  }
  if(this.blockFx){
   const fx=this.blockFx,t=fx.time/fx.duration,k=fx.kind==='place'?1:-1;
   const s=fx.kind==='place'?.51+.1*(1-t):.54+.18*t;
   const col=fx.color.map(x=>x*(1-t*.7));
   // Short expanding frame burst outlines the completed world action.
   for(const axis of [0,1,2]){
    const p={x:fx.pos.x,y:fx.pos.y,z:fx.pos.z};
    const ext={x:axis===0?s*2:.018,y:axis===1?s*2:.018,z:axis===2?s*2:.018};
    this.box(dyn,{...p,y:p.y-ext.y*.5},ext,col);
   }
   fx.time+=dt;if(fx.time>=fx.duration)this.blockFx=null;
  }
  if(this.actionFx){this.actionFx.elapsed+=dt;if(this.actionFx.elapsed>=this.actionFx.duration)this.actionFx=null;}
  this.companionRenderer.prepare(view,sim,actor,dyn);
  this.meshState(lights);if(dyn.length){gl.bindBuffer(gl.ARRAY_BUFFER,this.dynamic);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(dyn),gl.DYNAMIC_DRAW);this.attrib(this.meshProgram,'p',3,24,0);this.attrib(this.meshProgram,'c',3,24,12);gl.drawArrays(gl.TRIANGLES,0,dyn.length/6);}
  this.companionRenderer.draw(false);
  if(sprites.length){const p=this.spriteProgram;gl.useProgram(p);gl.uniformMatrix4fv(gl.getUniformLocation(p,'vp'),false,this.vp);gl.uniform1f(gl.getUniformLocation(p,'ambient'),this.ambient);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.atlas.tex);gl.uniform1i(gl.getUniformLocation(p,'tex'),0);gl.bindBuffer(gl.ARRAY_BUFFER,this.spriteBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(sprites),gl.DYNAMIC_DRAW);this.attrib(p,'p',3,36,0);this.attrib(p,'uv',2,36,12);this.attrib(p,'tint',4,36,20);gl.drawArrays(gl.TRIANGLES,0,sprites.length/9);}
  this.companionRenderer.draw(true);this.drawDropSprites(dropSprites);this.drawWater(sim,actor);
  const effects=[],effectSprites=[];this.combatFx.draw(effects,effectSprites,view);this.drawCombatEffects(effects,effectSprites);this.combatFx.ui(sim);
  if(this.camera.first&&!actor.dead&&actor.companionSlot<0&&actor.combat.state!=='roll')this.renderViewArms(this.combatFx.pose(actor));this.healthHud.update(sim,actor,dt,view.actors,authority);
 }
 drawDropSprites(vertices){if(!vertices.length)return;const gl=this.gl,p=this.spriteProgram;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  gl.useProgram(p);gl.uniformMatrix4fv(gl.getUniformLocation(p,'vp'),false,this.vp);gl.uniform1f(gl.getUniformLocation(p,'ambient'),Math.max(.75,this.ambient));gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.dropAtlas.tex);gl.uniform1i(gl.getUniformLocation(p,'tex'),0);
  gl.bindBuffer(gl.ARRAY_BUFFER,this.spriteBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);this.attrib(p,'p',3,36,0);this.attrib(p,'uv',2,36,12);this.attrib(p,'tint',4,36,20);gl.drawArrays(gl.TRIANGLES,0,vertices.length/9);this.stats.drawCalls++;gl.depthMask(true);gl.disable(gl.BLEND);}
 // Reusable per-section water meshes. World streaming controls the same 3D readyChunks
 // used by entities/HUD. A dirty section is rebuilt at most once per revision;
 // unchanged GPU buffers are drawn without any upload or terrain scan.
 clearWaterMeshes(){for(const m of this.waterMeshes.values())if(m.buffer)this.gl.deleteBuffer(m.buffer);this.waterMeshes.clear();this.waterDrawList=[];}
 waterBoundaryMask(key){const [x,y,z]=key.split(':').map(Number);
  let mask=0;for(let i=0;i<FACE_DIRS.length;i++){const d=FACE_DIRS[i];if(this.readyChunks.has(chunkKey(x+d[0],y+d[1],z+d[2])))mask|=1<<i;}return mask;}
 updateWaterMeshes(terrain,actor){const started=performance.now(),gl=this.gl,water=terrain.water,C=CFG.chunk;
  for(const [key,m]of this.waterMeshes)if(!this.readyChunks.has(key)){if(m.buffer)gl.deleteBuffer(m.buffer);this.waterMeshes.delete(key);}
  const cx=Math.floor(actor.pos.x/C),cy=Math.floor(actor.pos.y/C),cz=Math.floor(actor.pos.z/C),dirty=[];
  for(const key of this.readyChunks){const version=water.chunkRevisions.get(key)||0,mask=this.waterBoundaryMask(key),previous=this.waterMeshes.get(key);if(previous?.revision===version&&previous.boundaryMask===mask)continue;
   const [x,y,z]=key.split(':').map(Number),dist=sq(x-cx)+sq(y-cy)+sq(z-cz);dirty.push({key,version,mask,dist});}
  dirty.sort((a,b)=>a.dist-b.dist||cmp(a.key,b.key));let rebuilt=0;
  for(const item of dirty){if(rebuilt>=CFG.render.maxWaterMeshesPerFrame||rebuilt&&performance.now()-started>=CFG.render.waterMeshBudgetMs)break;
   const before=performance.now(),vertices=this.waterGeometry(terrain,item.key),previous=this.waterMeshes.get(item.key);
   let buffer=previous?.buffer||null;if(vertices.length){if(!buffer)buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);}
   else if(buffer){gl.deleteBuffer(buffer);buffer=null;}
   this.waterMeshes.set(item.key,{buffer,count:vertices.length/7,revision:item.version,boundaryMask:item.mask});
   METRICS.add('render.waterMeshBuild',performance.now()-before);rebuilt++;
  }
  this.waterDrawList=[];for(const [key,m]of this.waterMeshes){if(m.buffer&&m.count>0&&this.readyChunks.has(key)&&m.revision===(water.chunkRevisions.get(key)||0)&&m.boundaryMask===this.waterBoundaryMask(key))this.waterDrawList.push(m);}
  METRICS.add('render.waterMeshUpdate',performance.now()-started);
 }
 drawWater(sim,actor){const gl=this.gl,p=this.waterProgram;if(!this.waterDrawList.length)return;
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.useProgram(p);
  gl.uniformMatrix4fv(gl.getUniformLocation(p,'vp'),false,this.vp);gl.uniform1f(gl.getUniformLocation(p,'phase'),performance.now()/1000);
  for(const m of this.waterDrawList){gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);this.attrib(p,'p',3,28,0);this.attrib(p,'c',4,28,12);gl.drawArrays(gl.TRIANGLES,0,m.count);this.stats.drawCalls++;}
  gl.depthMask(true);gl.disable(gl.BLEND);
 }
 waterGeometry(terrain,section){const water=terrain.water,out=[],seen=new Set(),cells=[],C=CFG.chunk,sides=[[1,0],[-1,0],[0,1],[0,-1]];
  const [cx,cy,cz]=section.split(':').map(Number),x0=cx*C,y0=cy*C,z0=cz*C,yMax=y0+C-1;
  const sourceKeys=water.sourceChunks.get(section),flowKeys=water.flowChunks.get(section);
  // Terrain height is clamped to -8, so sea water cannot occupy a lower section.
  // If no dynamic water exists, underground sections are cheap empty results.
  if(yMax<Math.min(-8,CFG.sea)&&!sourceKeys?.size&&!flowKeys?.size)return new Float32Array(0);
  const add=(x,y,z)=>{if(y<y0||y>yMax||y<=CFG.bottom||y>=CFG.top)return;const key=blockKey(x,y,z);if(seen.has(key))return;
   seen.add(key);if(water.level(x,y,z)>0)cells.push([x,y,z]);};
  for(let z=z0;z<z0+C;z++)for(let x=x0;x<x0+C;x++){
   const h=terrain.height(x,z);if(h<CFG.sea)for(let y=Math.max(y0,h+1);y<=Math.min(CFG.sea,yMax);y++)add(x,y,z);

  }
  if(sourceKeys)for(const key of sourceKeys){const [x,y,z]=key.split(',').map(Number);add(x,y,z);}
  if(flowKeys)for(const key of flowKeys){const [x,y,z]=key.split(',').map(Number);add(x,y,z);}
  const readyLevel=(x,y,z)=>this.readyChunks.has(chunkKey(Math.floor(x/C),Math.floor(y/C),Math.floor(z/C)))?water.level(x,y,z):0;
  const faces=(quad,rgb,alpha)=>{const color=[...rgb,alpha];for(const n of [0,1,2,0,2,3])out.push(...quad[n],...color);};
  for(const [x,y,z]of cells){const lv=water.level(x,y,z),top=y+lv/8,col=[.20,.62,.85];
   if(!readyLevel(x,y+1,z))faces([[x,top,z],[x+1,top,z],[x+1,top,z+1],[x,top,z+1]],col,.62);
   for(const [dx,dz]of sides){const neighbor=readyLevel(x+dx,y,z+dz),bottom=neighbor?y+neighbor/8:y;if(bottom>=top-.01)continue;
    const pts=dx===1?[[x+1,top,z],[x+1,top,z+1],[x+1,bottom,z+1],[x+1,bottom,z]]:dx===-1?[[x,top,z+1],[x,top,z],[x,bottom,z],[x,bottom,z+1]]:dz===1?[[x+1,top,z+1],[x,top,z+1],[x,bottom,z+1],[x+1,bottom,z+1]]:[[x,top,z],[x+1,top,z],[x+1,bottom,z],[x,bottom,z]];faces(pts,[.14,.47,.76],.47);}}
  return new Float32Array(out);
 }
 drawCombatEffects(geometry,sprites){const gl=this.gl;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  if(geometry.length){const p=this.vfxProgram;gl.useProgram(p);gl.uniformMatrix4fv(gl.getUniformLocation(p,'vp'),false,this.vp);gl.bindBuffer(gl.ARRAY_BUFFER,this.vfxBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(geometry),gl.DYNAMIC_DRAW);this.attrib(p,'p',3,28,0);this.attrib(p,'tint',4,28,12);gl.drawArrays(gl.TRIANGLES,0,geometry.length/7);this.stats.drawCalls++;}
  if(sprites.length){const p=this.spriteProgram;gl.useProgram(p);gl.uniformMatrix4fv(gl.getUniformLocation(p,'vp'),false,this.vp);gl.uniform1f(gl.getUniformLocation(p,'ambient'),1);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.atlas.tex);gl.uniform1i(gl.getUniformLocation(p,'tex'),0);gl.bindBuffer(gl.ARRAY_BUFFER,this.vfxSprites);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(sprites),gl.DYNAMIC_DRAW);this.attrib(p,'p',3,36,0);this.attrib(p,'uv',2,36,12);this.attrib(p,'tint',4,36,20);gl.drawArrays(gl.TRIANGLES,0,sprites.length/9);this.stats.drawCalls++;}
  gl.depthMask(true);gl.disable(gl.BLEND);
 }
 renderViewArms(actor){
  // Client-only viewmodel: NOT in simulation, snapshots, world meshes or other peers' cameras.
  // Coordinates are meters, relative to a fixed first-person overlay camera at (0,0,0).
  const gl=this.gl,geom=[],action=actor.combat.action,c=actor.combat;
  const attacking=c.state==='attack'&&!!action;
  const wind=attacking&&c.elapsed<action.wind?clamp(c.elapsed/action.wind,0,1):0;
  const active=attacking?clamp((c.elapsed-action.wind)/action.active,0,1):0;
  const recovery=attacking?clamp((c.elapsed-action.wind-action.active)/action.recovery,0,1):0;
  const strike=attacking&&c.elapsed>=action.wind?Math.sin(active*Math.PI)*(1-recovery):0;
  const item=Inventory.stats(actor).item;
  const blockAction=this.actionFx,blockProgress=blockAction?1-blockAction.elapsed/blockAction.duration:0;
  const mining=!!actor.mine.target&&actor.mine.elapsed>0;
  const toolSwing=mining ? .18*Math.sin(actor.mine.elapsed*.038) : blockAction?.kind==='mine' ? .30*Math.sin(Math.PI*blockProgress) : 0;
  const buildPush=blockAction?.kind==='place' ? .36*Math.sin(Math.PI*blockProgress) : 0;
  // Each sleeve emerges below the screen, not out of the character's head in world space.
  for(let hand=0;hand<2;hand++){
   const sign=hand===0?-1:1,leading=!!(action&&action.combo%2===hand);
   const punch=leading?strike:0;
   let x=sign*(.53-.14*punch),y=-.28-.10*wind+.10*punch-(hand===1?toolSwing:0)+buildPush*.10,z=-1.17-.52*punch+.10*wind-(hand===1?(toolSwing+buildPush):0);
   if(attacking){const vp=weaponVisualPose({...actor,pos:{x:0,y:0,z:0}}, {...action,dir:{x:0,y:0,z:-1}},c.elapsed);const guide=V.add({x:.18,y:-.31,z:-.82},V.scale(vp.dir,.32));if(hand===1||vp.overhead){x=guide.x+(hand===0?-.12:.06);y=guide.y;z=guide.z;}}
   this.box(geom,{x,y:y-.09,z:z+.16},{x:.18,y:.20,z:.40},[.45,.64,.41],{x:0,y:0,z:-1});
   this.box(geom,{x,y,z:z-.08},{x:.21,y:.21,z:.25},[.88,.76,.54],{x:0,y:0,z:-1});
  }
  // Held item also has a viewmodel, but no additional remote/world entity.
  if(attacking&&item?.weapon&&!['bow','shield'].includes(item.weapon)){
   const vp=weaponVisualPose({...actor,pos:{x:0,y:0,z:0}},{...action,dir:{x:0,y:0,z:-1}},c.elapsed),root={x:.18,y:-.31,z:-.82},length=clamp(vp.reach*.42,.48,1.55),color=c3(MATERIALS[item.material]?.color||'#c5b7a0');
   this.weaponBeam(geom,root,V.add(root,V.scale(vp.dir,length)),item.weapon==='greatsword'?.12:.065,color);
  }else if(item&&(item.tool||item.weapon)){
   const w=item.weapon,tool=item.tool,t=attacking?strike:0;
   const z=-1.35-.33*t-toolSwing-buildPush,y=-.28+.15*t-toolSwing*.35;
   const color=c3(MATERIALS[item.material]?.color||'#c5b7a0');
   this.box(geom,{x:.41,y,z},{x:.11,y:.13,z:.64},c3('#8e6246'),{x:0,y:0,z:-1});
   this.box(geom,{x:.41,y:y+.03,z:z-.39},{x:w==='greatsword'?.25:.15,y:.13,z:tool==='pick'?.62:w==='spear'?.95:.74},color,{x:0,y:0,z:-1});
  }
  if(!geom.length)return;
  // Render *after* world+sprites, depth disabled so it never clips through local terrain.
  gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
  gl.useProgram(this.meshProgram);
  gl.uniformMatrix4fv(gl.getUniformLocation(this.meshProgram,'vp'),false,matrixMul(projection(65*Math.PI/180,this.canvas.width/this.canvas.height,.035,20),viewMatrix([0,0,0],[0,0,-1])));
  gl.uniform3fv(gl.getUniformLocation(this.meshProgram,'eye'),new Float32Array([0,0,0]));
  gl.uniform1f(gl.getUniformLocation(this.meshProgram,'ambient'),Math.max(.6,this.ambient));
  gl.uniform3fv(gl.getUniformLocation(this.meshProgram,'fog'),new Float32Array([.69,.85,.86]));
  gl.uniform4fv(gl.getUniformLocation(this.meshProgram,'lights[0]'),new Float32Array(32));
  gl.bindBuffer(gl.ARRAY_BUFFER,this.dynamic);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(geom),gl.DYNAMIC_DRAW);
  this.attrib(this.meshProgram,'p',3,24,0);this.attrib(this.meshProgram,'c',3,24,12);
  gl.drawArrays(gl.TRIANGLES,0,geom.length/6);this.stats.drawCalls++;
  gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
 }
 free(){const gl=this.gl;this.meshBuilder.free();for(const m of this.meshes.values())this.deleteMesh(m);for(const b of [this.dynamic,this.spriteBuffer,this.skyBuffer,this.vfxBuffer,this.vfxSprites])gl.deleteBuffer(b);for(const p of [this.meshProgram,this.spriteProgram,this.skyProgram,this.terrainProgram,this.vfxProgram])gl.deleteProgram(p);gl.deleteTexture(this.atlas.tex);gl.deleteTexture(this.blockAtlas.tex);gl.deleteTexture(this.dropAtlas.tex);this.clearWaterMeshes();gl.deleteProgram(this.waterProgram);this.combatFx.reset();this.healthHud.reset();}
}


