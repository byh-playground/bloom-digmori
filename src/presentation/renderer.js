'use strict';
/* three.js world renderer. Presentation reads simulation/display state only.
 * Every draw is submitted in the legacy pass order (sky → terrain → props → characters → sprites →
 * drops → water → effects → late characters → view arms): one ordered list via renderOrder with
 * explicit blend/depth state per material, so three.js never re-sorts the frame. */
const RENDER_GLSL=Object.freeze({
 terrainVertex:'in vec3 position;in vec3 n;in float material;uniform mat4 vp;out vec3 wp;out vec3 normal;out float mat;void main(){wp=position;normal=n;mat=material;gl_Position=vp*vec4(position,1.);}',
 terrainFragment:`precision highp float;
  in vec3 wp;in vec3 normal;in float mat;uniform sampler2D tiles;uniform vec3 eye;uniform vec3 fog;uniform vec4 lights[8];uniform float ambient;uniform float textured;out vec4 fragColor;
  void main(){vec3 n=normal;bool top=abs(n.y)>.5;vec2 uv=top?wp.xz:abs(n.x)>.5?vec2(wp.z,-wp.y):vec2(wp.x,-wp.y);
   float face=n.y>.5?0.:n.y<-.5?2.:1.;float tile=floor(mat+.5)*3.+face;vec2 origin=vec2(mod(tile,8.),floor(tile/8.))*32.;
   vec2 coords=(origin+8.+floor(fract(uv)*16.)+.5)/vec2(256.,512.);vec3 pixel=texture(tiles,coords).rgb,average=texture(tiles,(origin+31.5)/vec2(256.,512.)).rgb;
   float footprint=max(length(dFdx(uv)),length(dFdy(uv)))*16.;
   float blend=smoothstep(${CFG.textures.minifyStart.toFixed(2)},${CFG.textures.minifyEnd.toFixed(2)},footprint);
   vec3 c=mix(average,mix(pixel,average,blend),textured);float shade=top?(n.y>.5?1.:.57):abs(n.x)>.5?.79:.90;
   float light=ambient;for(int i=0;i<8;i++){light+=lights[i].w*max(0.,1.-distance(lights[i].xyz,wp)/10.)*.75;}
   c*=shade*clamp(light,.16,1.3);fragColor=vec4(mix(c,fog,smoothstep(33.,69.,distance(wp,eye))),1.);
  }`,
 vfxVertex:'in vec3 position;in vec4 tint;uniform mat4 vp;out vec4 t;void main(){t=tint;gl_Position=vp*vec4(position,1.);}',
 vfxFragment:'precision mediump float;in vec4 t;out vec4 fragColor;void main(){fragColor=t;}',
 meshVertex:'in vec3 position;in vec3 c;uniform mat4 vp;out vec3 col;out vec3 wp;void main(){wp=position;col=c;gl_Position=vp*vec4(position,1.);}',
 meshFragment:'precision mediump float;in vec3 col;in vec3 wp;uniform vec3 eye;uniform float ambient;uniform vec3 fog;uniform vec4 lights[8];out vec4 fragColor;void main(){float l=ambient;for(int i=0;i<8;i++){l+=lights[i].w*max(0.,1.-distance(lights[i].xyz,wp)/10.)*.75;}vec3 c=col*clamp(l,.16,1.3);float grid=min(min(fract(wp.x+.002),fract(wp.y+.002)),fract(wp.z+.002));c*=.97+.03*step(.03,grid);fragColor=vec4(mix(c,fog,smoothstep(33.,69.,distance(wp,eye))),1.);}',
 spriteVertex:'in vec3 position;in vec2 uv;in vec4 tint;uniform mat4 vp;out vec2 v;out vec4 t;void main(){v=uv;t=tint;gl_Position=vp*vec4(position,1.);}',
 spriteFragment:'precision mediump float;uniform sampler2D tex;uniform float ambient;in vec2 v;in vec4 t;out vec4 fragColor;void main(){vec4 c=texture(tex,v)*t;if(c.a<.025)discard;fragColor=vec4(c.rgb*max(.5,ambient),c.a);}',
 skyVertex:'in vec2 position;out vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,1.,1.);}',
 skyFragment:'precision mediump float;in vec2 uv;uniform float yaw;uniform float daylight;uniform float twilight;uniform vec3 sun;uniform vec3 moon;out vec4 fragColor;void main(){vec3 day=mix(vec3(.79,.9,.78),vec3(.32,.67,.89),uv.y);vec3 night=mix(vec3(.14,.19,.25),vec3(.025,.04,.1),uv.y);vec3 c=mix(night,day,daylight);float warm=twilight*(.32+.68*(1.-smoothstep(.30,.92,uv.y)));c=mix(c,vec3(1.,.47,.26),.75*warm);float ds=length((uv-sun.xy)*vec2(1.8,1.));float dm=length((uv-moon.xy)*vec2(1.8,1.));c+=sun.z*(vec3(1.,.63,.24)*.18*exp(-ds*13.)+vec3(1.,.89,.52)*.72*(1.-smoothstep(.019,.027,ds)));c+=moon.z*vec3(.55,.69,.84)*.22*(1.-smoothstep(.014,.022,dm));float cloud=smoothstep(.94,1.,sin((uv.x+yaw*.04)*17.+sin(uv.y*11.))*sin(uv.y*24.));c+=cloud*.08*daylight;fragColor=vec4(c,1.);}',
 waterVertex:'in vec3 position;in vec4 c;uniform mat4 vp;out vec4 tint;out vec3 worldPos;void main(){tint=c;worldPos=position;gl_Position=vp*vec4(position,1.);}',
 waterFragment:'precision mediump float;in vec4 tint;in vec3 worldPos;uniform float phase;out vec4 fragColor;void main(){vec2 xy=floor(worldPos.xz*6.);float line=step(.96,fract(sin(dot(xy,vec2(12.9898,78.233))+floor(phase*3.)*.41)*43758.5453));fragColor=vec4(tint.rgb*(1.+line*.075),tint.a);}'
});
const RENDER_LAYOUT=Object.freeze({mesh:[['position',3],['c',3]],sprite:[['position',3],['uv',2],['tint',4]],vfx:[['position',3],['tint',4]],water:[['position',3],['c',4]]});
const NO_LIGHTS=new Float32Array(32);
// One growable interleaved vertex stream for per-frame CPU geometry.
class DynamicGeometry {
 constructor(T,layout){this.T=T;this.layout=layout;this.stride=layout.reduce((n,[,size])=>n+size,0);this.capacity=0;this.buffer=null;this.geometry=new T.BufferGeometry();}
 upload(vertices){const T=this.T,floats=vertices.length;
  if(floats>this.capacity){this.capacity=Math.ceil(Math.max(4096,2**Math.ceil(Math.log2(floats)))/this.stride)*this.stride;this.geometry.dispose();this.geometry=new T.BufferGeometry();this.buffer=new T.InterleavedBuffer(new Float32Array(this.capacity),this.stride).setUsage(T.DynamicDrawUsage);let offset=0;for(const [name,size]of this.layout){this.geometry.setAttribute(name,new T.InterleavedBufferAttribute(this.buffer,size,offset));offset+=size;}}
  this.buffer.array.set(vertices);this.buffer.clearUpdateRanges();this.buffer.addUpdateRange(0,floats);this.buffer.needsUpdate=true;this.geometry.setDrawRange(0,floats/this.stride);return this.geometry;}
 dispose(){this.geometry.dispose();}
}
function interleavedGeometry(T,layout,vertices){const stride=layout.reduce((n,[,size])=>n+size,0),buffer=new T.InterleavedBuffer(vertices,stride),geometry=new T.BufferGeometry();let offset=0;for(const [name,size]of layout){geometry.setAttribute(name,new T.InterleavedBufferAttribute(buffer,size,offset));offset+=size;}return geometry;}
class Renderer {
 constructor(canvas,gamekit,companionVector,THREE,playerRig,unitRigs){
  if(typeof THREE?.WebGLRenderer!=='function')throw Error('three.js 모듈이 필요한 게임입니다.');
  const T=this.T=THREE;T.ColorManagement.enabled=false;this.canvas=canvas;
  // An opaque drawing buffer (three.js would otherwise request alpha:true), so straight-alpha
  // water/effect blending cannot make the page show through the canvas.
  const context=canvas.getContext('webgl2',{alpha:false,antialias:true,depth:true,stencil:false});if(!context)throw Error('WebGL2가 필요한 게임입니다.');
  this.three=new T.WebGLRenderer({canvas,context});
  this.three.outputColorSpace=T.LinearSRGBColorSpace;this.three.autoClear=true;this.gl=this.three.getContext();
  this.scene=new T.Scene();this.scene.matrixWorldAutoUpdate=false;this.view=new T.Camera();this.view.matrixAutoUpdate=false;this.view.matrixWorldAutoUpdate=false;this.clearColor=new T.Color();this.unusedBounds=new T.Sphere();this.pools=new Map();this.drawOrder=0;
  this.camera={yaw:0,pitch:.20,first:false,distance:initialCameraDistance()};this.viewRadius=new URLSearchParams(location.search).get('showcaseDemo')==='1'?1:matchMedia('(pointer:coarse)').matches?Math.min(2,CFG.view):CFG.view;
  this.atlas=createSpriteAtlas(this.three.capabilities.maxTextureSize);this.atlas.texture=this.canvasTexture(this.atlas.canvas);
  this.meshes=new Map();this.meshBuilder=new MeshBuilder();this.worldRef=null;this.streamSignature=null;this.streamComplete=false;this.visibleChunks=new Set();this.readyChunks=new Set();this.visibleColumns=new Set();this.visibleY={min:0,max:-1};this.particles=[];this.blockFx=null;this.mineFxStep=-1;this.actionFx=null;this.blockFxStats={mines:0,places:0,chips:0,blocked:0};this.vp=null;this.eye=null;this.frame=0;this.fov=65;this.ambient=1;this.fog=new Float32Array([.69,.85,.86]);this.frameLights=NO_LIGHTS;this.stats={drawCalls:0,vertices:0};
  const blockAtlas=buildBlockAtlas(),blockTexture=new T.DataTexture(blockAtlas.data,blockAtlas.width,blockAtlas.height,T.RGBAFormat,T.UnsignedByteType);this.pixelTexture(blockTexture,false);this.blockAtlas={...blockAtlas,texture:blockTexture};
  this.iconCanvases=new Map();this.blockIcons=createBlockIcons(this.blockAtlas,this.iconCanvases);this.itemIcons=createItemIcons(this.iconCanvases);this.dropAtlas=createDropAtlas(this.iconCanvases);this.dropAtlas.texture=this.canvasTexture(this.dropAtlas.canvas);
  this.combatFx=new CombatVisuals(this);this.healthHud=new EnemyHealthHUD(this);
  this.terrainMaterial=this.material(RENDER_GLSL.terrainVertex,RENDER_GLSL.terrainFragment,{vp:{value:new Float32Array(16)},eye:{value:new Float32Array(3)},fog:{value:new Float32Array(3)},lights:{value:new Float32Array(32)},ambient:{value:1},textured:{value:1},tiles:{value:blockTexture}});
  this.waterMaterial=this.material(RENDER_GLSL.waterVertex,RENDER_GLSL.waterFragment,{vp:{value:new Float32Array(16)},phase:{value:0}},{blend:'alpha',depthWrite:false});this.waterMeshes=new Map();this.waterDrawList=[];
  const skyGeometry=new T.BufferGeometry();skyGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),2));
  this.sky=this.worldObject(new T.Mesh(skyGeometry,this.material(RENDER_GLSL.skyVertex,RENDER_GLSL.skyFragment,{yaw:{value:0},daylight:{value:1},twilight:{value:0},sun:{value:new Float32Array(3)},moon:{value:new Float32Array(3)}},{depthTest:false,depthWrite:false})));
  this.companionRenderer=new CompanionRenderer(this,gamekit,companionVector);this.playerRig=new PlayerRigRenderer(this,playerRig);
  // New species cut-out rig (0.32.0): loaded and drawn by the same three.js path, but no actor is routed to it yet.
  this.unitRig=new UnitRigRenderer(this,unitRigs);
 }
 // Players are the cut-out PNG rig; enemies, NPCs and companions keep their GameKit SVG meshes.
 hasCharacter(kind){return kind==='player'||this.companionRenderer.hasCharacter(kind);}
 queueCharacter(item){if(item.kind==='player')this.playerRig.queue(item);else this.companionRenderer.queueCharacter(item);}
 // Nearest-filtered, unmipmapped, clamped textures exactly like the legacy atlases.
 pixelTexture(texture,flipY){const T=this.T;texture.flipY=flipY;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=T.NearestFilter;texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;texture.needsUpdate=true;return texture;}
 canvasTexture(canvas){return this.pixelTexture(new this.T.CanvasTexture(canvas),true);}
 // LEQUAL everywhere: the legacy frame inherited GameKit's character depthFunc for all later passes,
 // which decides coplanar water/terrain and equipment/cuff overlaps.
 material(vertexShader,fragmentShader,uniforms,{blend=null,depthTest=true,depthWrite=true,depthFunc=this.T.LessEqualDepth}={}){const T=this.T,m=new T.RawShaderMaterial({glslVersion:T.GLSL3,vertexShader,fragmentShader,uniforms,side:T.DoubleSide,transparent:true,forceSinglePass:true,depthTest,depthWrite});m.depthFunc=depthFunc;this.setBlend(m,blend);return m;}
 // blend: null (replace), 'alpha' (SRC_ALPHA, ONE_MINUS_SRC_ALPHA) or 'premultiplied' (ONE, ONE_MINUS_SRC_ALPHA).
 setBlend(m,blend){const T=this.T;if(!blend){m.blending=T.NoBlending;return;}m.blending=T.CustomBlending;m.blendEquation=T.AddEquation;m.blendSrc=blend==='premultiplied'?T.OneFactor:T.SrcAlphaFactor;m.blendDst=T.OneMinusSrcAlphaFactor;}
 worldObject(object){object.frustumCulled=false;object.matrixAutoUpdate=false;object.visible=false;this.scene.add(object);return object;}
 pooled(kind,create){let pool=this.pools.get(kind);if(!pool)this.pools.set(kind,pool={items:[],used:0});if(pool.used===pool.items.length){const item=create();this.worldObject(item.object);pool.items.push(item);}return pool.items[pool.used++];}
 // Unique renderOrder fixes the draw order, so three.js's depth tie-break never needs real bounds;
 // a shared placeholder sphere keeps it from scanning every streamed buffer.
 submit(object){object.visible=true;object.renderOrder=this.drawOrder++;this.stats.drawCalls++;object.geometry.boundingSphere??=this.unusedBounds;}
 beginFrame(clearColor){this.drawOrder=0;this.stats={drawCalls:0,vertices:0};for(const pool of this.pools.values()){pool.used=0;for(const item of pool.items)item.object.visible=false;}for(const m of this.meshes.values())m.object.visible=false;for(const m of this.waterMeshes.values())if(m.object)m.object.visible=false;this.sky.visible=false;
  this.three.setViewport(0,0,this.canvas.width,this.canvas.height);this.three.setClearColor(this.clearColor.setRGB(clearColor[0],clearColor[1],clearColor[2]),1);this.companionRenderer.beginFrame();this.playerRig.beginFrame();this.unitRig.beginFrame();}
 endFrame(){this.three.render(this.scene,this.view);this.companionRenderer.endFrame();this.playerRig.endFrame();this.unitRig.endFrame();}
 dynamic(kind,layout,uniforms,options){return this.pooled(kind,()=>{const geometry=new DynamicGeometry(this.T,layout),[vertex,fragment]=layout===RENDER_LAYOUT.mesh?[RENDER_GLSL.meshVertex,RENDER_GLSL.meshFragment]:layout===RENDER_LAYOUT.sprite?[RENDER_GLSL.spriteVertex,RENDER_GLSL.spriteFragment]:[RENDER_GLSL.vfxVertex,RENDER_GLSL.vfxFragment];return{geometry,object:new this.T.Mesh(geometry.geometry,this.material(vertex,fragment,uniforms(),options))};});}
 submitDynamic(item,vertices,stride){item.object.geometry=item.geometry.upload(vertices);this.submit(item.object);this.stats.vertices+=vertices.length/stride;}
 // Lit vertex-colored boxes and beams; overlay draws (view arms) skip depth.
 drawColored(vertices,{lights=this.frameLights,vp=this.vp,eye=arr(this.eye),ambient=this.ambient,fog=this.fog,overlay=false,depthWrite=!overlay}={}){if(!vertices.length)return;
  const item=this.dynamic(overlay?'mesh-overlay':'mesh',RENDER_LAYOUT.mesh,()=>({vp:{value:new Float32Array(16)},eye:{value:new Float32Array(3)},ambient:{value:1},fog:{value:new Float32Array(3)},lights:{value:new Float32Array(32)}}),overlay?{depthTest:false,depthWrite:false}:{}),u=item.object.material.uniforms;
  item.object.material.depthWrite=depthWrite;u.vp.value.set(vp);u.eye.value.set(eye);u.ambient.value=ambient;u.fog.value.set(fog);u.lights.value.set(lights);this.submitDynamic(item,vertices,6);}
 // Textured billboards; blend:true is straight-alpha blending (depth writes off unless requested).
 // Every sprite pass after the SVG characters keeps depth writes off, as the legacy frame did.
 drawSprites(vertices,texture,{ambient=this.ambient,blend=false,depthWrite=!blend}={}){if(!vertices.length)return;
  const item=this.dynamic('sprite',RENDER_LAYOUT.sprite,()=>({vp:{value:new Float32Array(16)},ambient:{value:1},tex:{value:null}})),m=item.object.material,u=m.uniforms;
  u.vp.value.set(this.vp);u.ambient.value=ambient;u.tex.value=texture;this.setBlend(m,blend?'alpha':null);m.depthWrite=depthWrite;this.submitDynamic(item,vertices,9);}
 drawVfx(vertices){if(!vertices.length)return;const item=this.dynamic('vfx',RENDER_LAYOUT.vfx,()=>({vp:{value:new Float32Array(16)}}),{blend:'alpha',depthWrite:false});item.object.material.uniforms.vp.value.set(this.vp);this.submitDynamic(item,vertices,7);}
 resize(){const ratio=Math.min(devicePixelRatio||1,1.5),w=Math.round(this.canvas.clientWidth*ratio),h=Math.round(this.canvas.clientHeight*ratio);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}}
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
 uploadMesh(m){const started=performance.now(),T=this.T,count=m.vertices.length/3;
  if(!m.materials||m.materials.length!==count)throw Error('텍스처 재질 데이터 누락');
  const indices=count<=65535?new Uint16Array(m.indices):m.indices,geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(m.vertices,3));geometry.setAttribute('n',new T.BufferAttribute(m.normals,3));geometry.setAttribute('material',new T.BufferAttribute(m.materials,1));geometry.setIndex(new T.BufferAttribute(indices,1));
  const object=this.worldObject(new T.Mesh(geometry,this.terrainMaterial));METRICS.add('render.upload',performance.now()-started);
  return{object,count:indices.length,revision:m.revision,bytes:m.vertices.byteLength+m.normals.byteLength+m.materials.byteLength+indices.byteLength};
 }
 deleteMesh(m){if(!m)return;this.scene.remove(m.object);m.object.geometry.dispose();}
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
 drawSky(daylight,phase,alt,twilight){const u=this.sky.material.uniforms;u.yaw.value=this.camera.yaw;u.daylight.value=daylight;u.twilight.value=twilight;
  // Sun and moon share a continuous solar arc; camera yaw controls their screen azimuth.
  const az=TAU*phase-this.camera.yaw;
  const x=.5+.43*Math.sin(az),y=.30+.54*alt-.20*this.camera.pitch;
  u.sun.value.set([x,y,Math.cos(az)>0?.95:0]);u.moon.value.set([.5-.43*Math.sin(az),.30-.54*alt-.20*this.camera.pitch,Math.cos(az)<0?1:0]);this.submit(this.sky);}
 drawTerrain(lights){const u=this.terrainMaterial.uniforms;u.vp.value.set(this.vp);u.eye.value.set(arr(this.eye));u.ambient.value=this.ambient;u.fog.value.set(this.fog);u.lights.value.set(lights);u.textured.value=this.combatFx.options.textures?1:0;
  for(const [key,m]of this.meshes){if(!m.count)continue;const [x,y,z]=key.split(':').map(Number),dx=(x+.5)*16-this.eye.x,dz=(z+.5)*16-this.eye.z;if(dx*this.forward.x+dz*this.forward.z<-18||Math.hypot(dx,dz)>75)continue;this.submit(m.object);this.stats.vertices+=m.count;}}
 render(sim,authority,dt,displayFrame){
  const view={actors:{},drops:{},projectiles:{},companions:{}};displayFrame.forEach(model=>{const value=model.displayKind==='actor'?{...model,facing:direction(model.yaw,model.pitch)}:model;view[model.displayKind==='actor'?'actors':model.displayKind==='drop'?'drops':model.displayKind==='companion'?'companions':'projectiles'][model.id]=value;});
  const actor=view.actors[authority.id];if(!actor)return;this.displayTimeMs=displayFrame.timeMs;
  if(this.worldRef!==sim.terrain){this.combatFx.reset();this.particles.length=0;this.blockFx=null;this.actionFx=null;}
  this.combatFx.advance(dt);this.frame++;this.resize();const viewPos=actor.pos;this.updateCamera(actor,sim,viewPos);this.stream(sim,authority);const daylight=sim.daylight(),phase=sim.dayPhase(),alt=Math.cos(TAU*phase),twilight=Math.pow(1-Math.abs(alt),3);
  this.ambient=.20+.80*daylight;
  this.fog=new Float32Array([lerp(.075,.69,daylight)+.11*twilight,lerp(.11,.85,daylight)+.025*twilight,lerp(.19,.86,daylight)-.17*twilight]);this.beginFrame(this.fog);this.companionRenderer.beginCharacterFrame();
  this.drawSky(daylight,phase,alt,twilight);
  const lights=this.lights(sim,actor);this.frameLights=lights;this.drawTerrain(lights);
  const dyn=[],sprites=[];
  // Fluid volumes are submitted separately after solid terrain; no global sea plane.
  this.animationSamples={};
  for(const a of Object.values(view.actors)){
   if(a.speciesId==='shell'||a.dead||this.camera.first&&a.id===actor.id||a.id!==actor.id&&!this.entityVisualReady(a))continue;
   const visual=this.combatFx.pose(a),reaction=this.combatFx.reactions.get(a.id),scale=a.scale||1,c=visual.combat;
   const sample=actorSpritePose(visual,this.camera.yaw,reaction);this.animationSamples[a.id]=sample;
   // Players keep their authored colours; co-op players are told apart by the name tag in EnemyHealthHUD.
   let tint=a.speciesId?[...SPECIES[a.speciesId].wild.tint]:a.boss?[...BOSS.tint]:[1,1,1,1];if(a.suspended)tint=[.55,.57,.55,1];
   const whiteFlash=!!(reaction&&reaction.age<CFG.combat.feedback.flash&&reaction.age<45);
   if(reaction&&reaction.age<CFG.combat.feedback.flash&&!whiteFlash)tint=[1.75,.65,.5,1];
   const rp=a.pos;this.queueCharacter({phase:'world',key:a.id,kind:sample.kind,sample,actor:visual,reaction,pos:rp,scale,tint,alpha:1,whiteFlash});
   const raw=sim.actors[a.id],hit=raw?sim.physics.ground(raw,rp,2.5):null;if(hit&&hit.normal.y>.7){const y=rp.y+a.offset-hit.timeOfImpact+.012,height=Math.max(0,rp.y-y),factor=1/(1+height*.3);this.box(dyn,{x:rp.x,y,z:rp.z},{x:.66*scale*factor,y:.01,z:.44*scale*factor},[.20,.30,.22]);}
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
   }else this.sprite(sprites,p.pos,.15,.15,this.atlas.frames['fx/spark'],[1,.84,.51,1]);
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
  this.drawColored(dyn);
  this.companionRenderer.drawCharacters('world');this.playerRig.draw('world');this.unitRig.draw('world');this.companionRenderer.draw(false);
  this.drawSprites(sprites,this.atlas.texture,{depthWrite:false});
  this.companionRenderer.draw(true);this.drawSprites(dropSprites,this.dropAtlas.texture,{ambient:Math.max(.75,this.ambient),blend:true});this.drawWater();
  const effects=[],effectSprites=[];this.combatFx.draw(effects,effectSprites,view);this.drawVfx(effects);this.drawSprites(effectSprites,this.atlas.texture,{ambient:1,blend:true});this.companionRenderer.drawCharacters('late');this.playerRig.draw('late');this.unitRig.draw('late');this.combatFx.ui(sim);
  if(this.camera.first&&!actor.dead&&actor.companionSlot<0&&actor.combat.state!=='roll')this.renderViewArms(this.combatFx.pose(actor));this.healthHud.update(sim,actor,dt,view.actors,authority);this.endFrame();
 }
 // Reusable per-section water meshes. World streaming controls the same 3D readyChunks
 // used by entities/HUD. A dirty section is rebuilt at most once per revision;
 // unchanged GPU buffers are drawn without any upload or terrain scan.
 deleteWaterMesh(m){if(!m?.object)return;this.scene.remove(m.object);m.object.geometry.dispose();}
 clearWaterMeshes(){for(const m of this.waterMeshes.values())this.deleteWaterMesh(m);this.waterMeshes.clear();this.waterDrawList=[];}
 waterBoundaryMask(key){const [x,y,z]=key.split(':').map(Number);
  let mask=0;for(let i=0;i<FACE_DIRS.length;i++){const d=FACE_DIRS[i];if(this.readyChunks.has(chunkKey(x+d[0],y+d[1],z+d[2])))mask|=1<<i;}return mask;}
 updateWaterMeshes(terrain,actor){const started=performance.now(),water=terrain.water,C=CFG.chunk;
  for(const [key,m]of this.waterMeshes)if(!this.readyChunks.has(key)){this.deleteWaterMesh(m);this.waterMeshes.delete(key);}
  const cx=Math.floor(actor.pos.x/C),cy=Math.floor(actor.pos.y/C),cz=Math.floor(actor.pos.z/C),dirty=[];
  for(const key of this.readyChunks){const version=water.chunkRevisions.get(key)||0,mask=this.waterBoundaryMask(key),previous=this.waterMeshes.get(key);if(previous?.revision===version&&previous.boundaryMask===mask)continue;
   const [x,y,z]=key.split(':').map(Number),dist=sq(x-cx)+sq(y-cy)+sq(z-cz);dirty.push({key,version,mask,dist});}
  dirty.sort((a,b)=>a.dist-b.dist||cmp(a.key,b.key));let rebuilt=0;
  for(const item of dirty){if(rebuilt>=CFG.render.maxWaterMeshesPerFrame||rebuilt&&performance.now()-started>=CFG.render.waterMeshBudgetMs)break;
   const before=performance.now(),vertices=this.waterGeometry(terrain,item.key);
   this.deleteWaterMesh(this.waterMeshes.get(item.key));
   const object=vertices.length?this.worldObject(new this.T.Mesh(interleavedGeometry(this.T,RENDER_LAYOUT.water,vertices),this.waterMaterial)):null;
   this.waterMeshes.set(item.key,{object,count:vertices.length/7,revision:item.version,boundaryMask:item.mask});
   METRICS.add('render.waterMeshBuild',performance.now()-before);rebuilt++;
  }
  this.waterDrawList=[];for(const [key,m]of this.waterMeshes){if(m.object&&m.count>0&&this.readyChunks.has(key)&&m.revision===(water.chunkRevisions.get(key)||0)&&m.boundaryMask===this.waterBoundaryMask(key))this.waterDrawList.push(m);}
  METRICS.add('render.waterMeshUpdate',performance.now()-started);
 }
 drawWater(){if(!this.waterDrawList.length)return;const u=this.waterMaterial.uniforms;u.vp.value.set(this.vp);u.phase.value=performance.now()/1000;
  for(const m of this.waterDrawList){this.submit(m.object);this.stats.vertices+=m.count;}
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
 renderViewArms(actor){
  // Client-only viewmodel: NOT in simulation, snapshots, world meshes or other peers' cameras.
  // Coordinates are meters, relative to a fixed first-person overlay camera at (0,0,0).
  const geom=[],action=actor.combat.action,c=actor.combat;
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
  if(attacking&&item?.weapon){
   const vp=weaponVisualPose({...actor,pos:{x:0,y:0,z:0}},{...action,dir:{x:0,y:0,z:-1}},c.elapsed),root={x:.18,y:-.31,z:-.82},length=clamp(vp.reach*.42,.48,1.55),color=c3(MATERIALS[item.material]?.color||'#c5b7a0');
   this.weaponBeam(geom,root,V.add(root,V.scale(vp.dir,length)),.065,color);
  }else if(item&&(item.tool||item.weapon)){
   const w=item.weapon,tool=item.tool,t=attacking?strike:0;
   const z=-1.35-.33*t-toolSwing-buildPush,y=-.28+.15*t-toolSwing*.35;
   const color=c3(MATERIALS[item.material]?.color||'#c5b7a0');
   this.box(geom,{x:.41,y,z},{x:.11,y:.13,z:.64},c3('#8e6246'),{x:0,y:0,z:-1});
   this.box(geom,{x:.41,y:y+.03,z:z-.39},{x:.15,y:.13,z:tool==='pick'?.62:w==='spear'?.95:.74},color,{x:0,y:0,z:-1});
  }
  // Drawn *after* world+sprites with depth disabled so it never clips through local terrain.
  this.drawColored(geom,{overlay:true,lights:NO_LIGHTS,vp:matrixMul(projection(65*Math.PI/180,this.canvas.width/this.canvas.height,.035,20),viewMatrix([0,0,0],[0,0,-1])),eye:[0,0,0],ambient:Math.max(.6,this.ambient),fog:[.69,.85,.86]});
 }
 free(){this.meshBuilder.free();for(const m of this.meshes.values())this.deleteMesh(m);this.meshes.clear();this.clearWaterMeshes();this.companionRenderer.dispose();this.playerRig.dispose();this.unitRig.dispose();
  for(const pool of this.pools.values())for(const item of pool.items){item.geometry?.dispose();item.object.material.dispose();}this.pools.clear();
  for(const m of [this.terrainMaterial,this.waterMaterial,this.sky.material])m.dispose();this.sky.geometry.dispose();for(const t of [this.atlas.texture,this.dropAtlas.texture,this.blockAtlas.texture])t.dispose();
  this.combatFx.reset();this.healthHud.reset();this.three.dispose();}
}
