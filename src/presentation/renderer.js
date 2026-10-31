'use strict';
/* three.js world renderer. Presentation reads simulation/display state only.
 * Every draw is submitted in the legacy pass order (sky → terrain → props → characters → sprites →
 * drops → water → effects → late characters): one ordered list via renderOrder with
 * explicit blend/depth state per material, so three.js never re-sorts the frame. */
// Cave cutaway and line-of-sight fade, shared by the opaque terrain and the translucent first ceiling layer (render only).
// cut = (first ceiling layer y, look target y, -, radius); cutLine = (target x, target z, slope x, slope z): the cut is a
// cylinder around the view line (target toward the camera), so it stays open from the camera at every height.
// Terrain within fade.x of the camera-to-target segment (and farther than fade.y from the target) is dithered away, and a
// face seen from behind (from inside rock: the near wall of a tunnel, a cut cross-section) is not drawn.
const RENDER_CUT_GLSL=`uniform vec4 cut;uniform vec4 cutLine;uniform vec3 camA;uniform vec3 camB;uniform vec2 fade;
  float cutDistance(vec3 p){return distance(p.xz,cutLine.xy+cutLine.zw*(p.y-cut.y));}
  float bayer4(vec2 f){ivec2 q=ivec2(mod(floor(f),4.));const float m[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);return(m[q.x+q.y*4]+.5)/16.;}
  bool fadeOut(vec3 p){vec3 ab=camB-camA;float t=clamp(dot(p-camA,ab)/max(dot(ab,ab),1e-4),0.,1.);return t<.98&&distance(p,camA+ab*t)<fade.x&&distance(p,camB)>fade.y&&bayer4(gl_FragCoord.xy)<.62;}`;
const RENDER_GLSL=Object.freeze({
 terrainVertex:'in vec3 position;in vec3 n;in float material;uniform mat4 vp;out vec3 wp;out vec3 normal;out float mat;void main(){wp=position;normal=n;mat=material;gl_Position=vp*vec4(position,1.);}',
 terrainFragment:`precision highp float;
  in vec3 wp;in vec3 normal;in float mat;uniform sampler2D tiles;uniform vec3 eye;uniform vec3 fog;uniform vec4 lights[8];uniform float ambient;uniform float textured;out vec4 fragColor;
  ${RENDER_CUT_GLSL}
  void main(){float cd=cutDistance(wp);bool above=cut.w>0.&&wp.y>cut.x-.002;if(above&&cd<cut.w||fadeOut(wp)||dot(normal,eye-wp)<0.)discard;vec3 n=normal;bool top=abs(n.y)>.5;vec2 uv=top?wp.xz:abs(n.x)>.5?vec2(wp.z,-wp.y):vec2(wp.x,-wp.y);
   float face=n.y>.5?0.:n.y<-.5?2.:1.;float tile=floor(mat+.5)*3.+face;vec2 origin=vec2(mod(tile,8.),floor(tile/8.))*32.;
   vec2 coords=(origin+8.+floor(fract(uv)*16.)+.5)/vec2(256.,512.);vec3 pixel=texture(tiles,coords).rgb,average=texture(tiles,(origin+31.5)/vec2(256.,512.)).rgb;
   float footprint=max(length(dFdx(uv)),length(dFdy(uv)))*16.;
   float blend=smoothstep(${CFG.textures.minifyStart.toFixed(2)},${CFG.textures.minifyEnd.toFixed(2)},footprint);
   vec3 c=mix(average,mix(pixel,average,blend),textured);float shade=top?(n.y>.5?1.:.57):abs(n.x)>.5?.79:.90;
   float light=ambient;for(int i=0;i<8;i++){light+=lights[i].w*max(0.,1.-distance(lights[i].xyz,wp)/10.)*.75;}
   c*=shade*clamp(light,.16,1.3);if(above)c*=mix(.3,1.,clamp((cd-cut.w)/.8,0.,1.));fragColor=vec4(mix(c,fog,smoothstep(33.,69.,distance(wp,eye))),1.);
  }`,
 // The first ceiling layer inside the cutaway: translucent block faces with bright outlines, so it reads as clickable.
 ceilingFragment:`precision highp float;
  in vec3 wp;in vec3 normal;in float mat;uniform sampler2D tiles;uniform vec4 lights[8];uniform float ambient;out vec4 fragColor;
  ${RENDER_CUT_GLSL}
  void main(){float cd=cutDistance(wp);if(cut.w<=0.||cd>=cut.w||wp.y<cut.x-.002||wp.y>cut.x+1.002)discard;
   vec3 n=normal;bool top=abs(n.y)>.5;vec2 uv=top?wp.xz:abs(n.x)>.5?vec2(wp.z,-wp.y):vec2(wp.x,-wp.y);
   float face=n.y>.5?0.:n.y<-.5?2.:1.;float tile=floor(mat+.5)*3.+face;vec2 origin=vec2(mod(tile,8.),floor(tile/8.))*32.;
   vec3 c=texture(tiles,(origin+8.+floor(fract(uv)*16.)+.5)/vec2(256.,512.)).rgb;float light=ambient;for(int i=0;i<8;i++){light+=lights[i].w*max(0.,1.-distance(lights[i].xyz,wp)/10.)*.75;}
   c*=clamp(light,.35,1.3);vec2 f=fract(uv);float e=min(min(f.x,1.-f.x),min(f.y,1.-f.y)),edge=1.-smoothstep(.025,.06,e),rim=smoothstep(cut.w,cut.w-.9,cd);
   fragColor=vec4(mix(c,vec3(1.,.93,.66),edge*.85),(.32+.6*edge)*rim);
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
 constructor(canvas,THREE,playerRig,unitRigs){
  if(typeof THREE?.WebGLRenderer!=='function')throw Error('three.js 모듈이 필요한 게임입니다.');
  const T=this.T=THREE;T.ColorManagement.enabled=false;this.canvas=canvas;
  // An opaque drawing buffer (three.js would otherwise request alpha:true), so straight-alpha
  // water/effect blending cannot make the page show through the canvas.
  const context=canvas.getContext('webgl2',{alpha:false,antialias:true,depth:true,stencil:false});if(!context)throw Error('WebGL2가 필요한 게임입니다.');
  this.three=new T.WebGLRenderer({canvas,context});
  this.three.outputColorSpace=T.LinearSRGBColorSpace;this.three.autoClear=true;this.gl=this.three.getContext();
  this.scene=new T.Scene();this.scene.matrixWorldAutoUpdate=false;this.view=new T.Camera();this.view.matrixAutoUpdate=false;this.view.matrixWorldAutoUpdate=false;this.clearColor=new T.Color();this.unusedBounds=new T.Sphere();this.pools=new Map();this.drawOrder=0;
  this.resetCamera();this.pointer={x:innerWidth*.5,y:innerHeight*.5};this.cursor=null;this.viewRadius=new URLSearchParams(location.search).get('showcaseDemo')==='1'?1:matchMedia('(pointer:coarse)').matches?Math.min(2,CFG.view):CFG.view;
  this.atlas=createSpriteAtlas(this.three.capabilities.maxTextureSize);this.atlas.texture=this.canvasTexture(this.atlas.canvas);
  this.meshes=new Map();this.meshBuilder=new MeshBuilder();this.worldRef=null;this.streamSignature=null;this.streamComplete=false;this.visibleChunks=new Set();this.readyChunks=new Set();this.visibleColumns=new Set();this.visibleY={min:0,max:-1};this.particles=[];this.blockFx=null;this.mineFxStep=-1;this.actionFx=null;this.blockFxStats={mines:0,places:0,chips:0,blocked:0};this.vp=null;this.eye=null;this.frame=0;this.fov=65;this.ambient=1;this.fog=new Float32Array([.69,.85,.86]);this.frameLights=NO_LIGHTS;this.stats={drawCalls:0,vertices:0};
  const blockAtlas=buildBlockAtlas(),blockTexture=new T.DataTexture(blockAtlas.data,blockAtlas.width,blockAtlas.height,T.RGBAFormat,T.UnsignedByteType);this.pixelTexture(blockTexture,false);this.blockAtlas={...blockAtlas,texture:blockTexture};
  this.iconCanvases=new Map();this.blockIcons=createBlockIcons(this.blockAtlas,this.iconCanvases);this.eggIcons(unitRigs);this.itemIcons=createItemIcons(this.iconCanvases);this.dropAtlas=createDropAtlas(this.iconCanvases);this.dropAtlas.texture=this.canvasTexture(this.dropAtlas.canvas);
  this.combatFx=new CombatVisuals(this);this.healthHud=new EnemyHealthHUD(this);
  const cutUniforms=()=>({cut:{value:new Float32Array(4)},cutLine:{value:new Float32Array(4)},camA:{value:new Float32Array(3)},camB:{value:new Float32Array(3)},fade:{value:new Float32Array([CFG.cutaway.fadeRadius,CFG.cutaway.fadeKeep])}});
  this.terrainMaterial=this.material(RENDER_GLSL.terrainVertex,RENDER_GLSL.terrainFragment,{vp:{value:new Float32Array(16)},eye:{value:new Float32Array(3)},fog:{value:new Float32Array(3)},lights:{value:new Float32Array(32)},ambient:{value:1},textured:{value:1},tiles:{value:blockTexture},...cutUniforms()});
  this.ceilingMaterial=this.material(RENDER_GLSL.terrainVertex,RENDER_GLSL.ceilingFragment,{vp:{value:new Float32Array(16)},lights:{value:new Float32Array(32)},ambient:{value:1},tiles:{value:blockTexture},...cutUniforms()},{blend:'alpha',depthWrite:false});
  this.waterMaterial=this.material(RENDER_GLSL.waterVertex,RENDER_GLSL.waterFragment,{vp:{value:new Float32Array(16)},phase:{value:0}},{blend:'alpha',depthWrite:false});this.waterMeshes=new Map();this.waterDrawList=[];
  const skyGeometry=new T.BufferGeometry();skyGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),2));
  this.sky=this.worldObject(new T.Mesh(skyGeometry,this.material(RENDER_GLSL.skyVertex,RENDER_GLSL.skyFragment,{yaw:{value:0},daylight:{value:1},twilight:{value:0},sun:{value:new Float32Array(3)},moon:{value:new Float32Array(3)}},{depthTest:false,depthWrite:false})));
  this.playerRig=new PlayerRigRenderer(this,playerRig);
  // Companion species (wild, boss, owned, eggs) are the cut-out unit rig; UnitPresenter maps display state to looks.
  this.unitRig=new UnitRigRenderer(this,unitRigs);this.units=new UnitPresenter(this);
 }
 // Egg items, drops and inventory slots show the species' authored egg PNG instead of a textured cube.
 eggIcons(unitRigs){for(const block of BLOCKS){if(!block.egg)continue;const id=BID[block.id],image=unitRigs[block.egg].images.egg,c=document.createElement('canvas');c.width=40;c.height=44;const ctx=c.getContext('2d'),k=Math.min(36/image.width,40/image.height);ctx.drawImage(image,(40-image.width*k)/2,42-image.height*k,image.width*k,image.height*k);this.blockIcons[id]=c.toDataURL('image/png');this.iconCanvases.set('block:'+id,c);}}
 // Players are the cut-out player rig; companion species go through UnitPresenter (this.units).
 hasCharacter(kind){return kind==='player';}
 queueCharacter(item){this.playerRig.queue(item);}
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
 beginFrame(clearColor){this.drawOrder=0;this.stats={drawCalls:0,vertices:0};for(const pool of this.pools.values()){pool.used=0;for(const item of pool.items)item.object.visible=false;}for(const m of this.meshes.values()){m.object.visible=false;m.ceiling.visible=false;}for(const m of this.waterMeshes.values())if(m.object)m.object.visible=false;this.sky.visible=false;
  this.three.setViewport(0,0,this.canvas.width,this.canvas.height);this.three.setClearColor(this.clearColor.setRGB(clearColor[0],clearColor[1],clearColor[2]),1);this.playerRig.beginFrame();this.unitRig.beginFrame();}
 endFrame(){this.three.render(this.scene,this.view);this.playerRig.endFrame();this.unitRig.endFrame();}
 dynamic(kind,layout,uniforms,options){return this.pooled(kind,()=>{const geometry=new DynamicGeometry(this.T,layout),[vertex,fragment]=layout===RENDER_LAYOUT.mesh?[RENDER_GLSL.meshVertex,RENDER_GLSL.meshFragment]:layout===RENDER_LAYOUT.sprite?[RENDER_GLSL.spriteVertex,RENDER_GLSL.spriteFragment]:[RENDER_GLSL.vfxVertex,RENDER_GLSL.vfxFragment];return{geometry,object:new this.T.Mesh(geometry.geometry,this.material(vertex,fragment,uniforms(),options))};});}
 submitDynamic(item,vertices,stride){item.object.geometry=item.geometry.upload(vertices);this.submit(item.object);this.stats.vertices+=vertices.length/stride;}
 // Lit vertex-colored boxes.
 drawColored(vertices,{lights=this.frameLights,vp=this.vp,eye=arr(this.eye),ambient=this.ambient,fog=this.fog}={}){if(!vertices.length)return;
  const item=this.dynamic('mesh',RENDER_LAYOUT.mesh,()=>({vp:{value:new Float32Array(16)},eye:{value:new Float32Array(3)},ambient:{value:1},fog:{value:new Float32Array(3)},lights:{value:new Float32Array(32)}})),u=item.object.material.uniforms;
  u.vp.value.set(vp);u.eye.value.set(eye);u.ambient.value=ambient;u.fog.value.set(fog);u.lights.value.set(lights);this.submitDynamic(item,vertices,6);}
 // Textured billboards; blend:true is straight-alpha blending (depth writes off unless requested).
 // Every sprite pass after the SVG characters keeps depth writes off, as the legacy frame did.
 drawSprites(vertices,texture,{ambient=this.ambient,blend=false,depthWrite=!blend}={}){if(!vertices.length)return;
  const item=this.dynamic('sprite',RENDER_LAYOUT.sprite,()=>({vp:{value:new Float32Array(16)},ambient:{value:1},tex:{value:null}})),m=item.object.material,u=m.uniforms;
  u.vp.value.set(this.vp);u.ambient.value=ambient;u.tex.value=texture;this.setBlend(m,blend?'alpha':null);m.depthWrite=depthWrite;this.submitDynamic(item,vertices,9);}
 drawVfx(vertices){if(!vertices.length)return;const item=this.dynamic('vfx',RENDER_LAYOUT.vfx,()=>({vp:{value:new Float32Array(16)}}),{blend:'alpha',depthWrite:false});item.object.material.uniforms.vp.value.set(this.vp);this.submitDynamic(item,vertices,7);}
 resize(){const ratio=Math.min(devicePixelRatio||1,1.5),w=Math.round(this.canvas.clientWidth*ratio),h=Math.round(this.canvas.clientHeight*ratio);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}}
 // D-114 camera: yawStep 0..7 (45° each, animated over CFG.camera.stepMs), fixed pitch, zoom distance (wheel/pinch).
 resetCamera(){this.camera={yawStep:0,yaw:0,pitch:CFG.camera.pitch,distance:initialCameraDistance(),turn:null};this.viewDistance=this.camera.distance;this.cut={active:false,amount:0,y:0,coverMs:0,openMs:0,pendY:null,pendMs:0,frame:null};}
 rotateCamera(dir){const c=this.camera,n=CFG.camera.yawSteps;c.yawStep=((c.yawStep+dir)%n+n)%n;const to=c.yawStep*TAU/n,delta=((to-c.yaw)%TAU+TAU+Math.PI)%TAU-Math.PI;c.turn={from:c.yaw,to:c.yaw+delta,t:0};}
 zoomCamera(sign){this.setZoom(this.camera.distance*Math.pow(CFG.camera.zoomStep,sign));}
 setZoom(distance){this.camera.distance=clamp(distance,CFG.camera.minDistance,CFG.camera.maxDistance);}
 // Cave cutaway state with hysteresis: a solid non-plant block within CFG.cutaway.probe cells above the head (player's
 // column) is the first ceiling layer. Entering waits enterMs, leaving waits exitMs, the radius opens/closes over fadeMs.
 updateCutaway(sim,pos,dt){const C=CFG.cutaway,k=this.cut,t=sim.terrain,x=Math.floor(pos.x),z=Math.floor(pos.z),head=Math.floor(pos.y+1.95);let ceil=null;
  for(let y=head;y<=head+C.probe;y++){const id=t.get(x,y,z);if(t.isSolid(id)&&!CUTAWAY_PLANTS.has(id)){ceil=y;break;}}
  if(ceil===null){k.openMs+=dt;k.coverMs=0;k.pendY=null;if(k.active&&k.openMs>=C.exitMs)k.active=false;}
  else{k.coverMs+=dt;k.openMs=0;if(ceil!==k.y){if(k.pendY!==ceil){k.pendY=ceil;k.pendMs=0;}else k.pendMs+=dt;if(!k.active||k.pendMs>=C.enterMs){k.y=ceil;k.pendY=null;}}if(!k.active&&k.coverMs>=C.enterMs)k.active=true;}
  k.amount=clamp(k.amount+(k.active?1:-1)*dt/C.fadeMs,0,1);}
 updateCamera(actor,sim,renderPos,dt){const c=this.camera,C=CFG.camera;
  if(c.turn){c.turn.t=Math.min(1,c.turn.t+dt/C.stepMs);const e=c.turn.t*c.turn.t*(3-2*c.turn.t);c.yaw=c.turn.from+(c.turn.to-c.turn.from)*e;if(c.turn.t>=1){c.yaw=((c.turn.to%TAU)+TAU)%TAU;c.turn=null;}}
  this.fov=lerp(this.fov||65,actor.sprinting?71:65,actor.sprinting?.18:.12);this.updateCutaway(sim,renderPos,dt);
  const forward=direction(c.yaw,c.pitch),back=V.scale(forward,-1),target=V.add(renderPos,{x:0,y:C.target,z:0}),k=this.cut;
  // In a cave the zoom is capped so the cutaway stays readable; outside one, a line blocked by a thick obstacle (more than
  // pullThickness solid cells, e.g. inside a hill) pulls the camera in front of it. Thin obstacles are only faded.
  let want=lerp(c.distance,Math.min(c.distance,C.caveDistance),k.amount);
  if(!k.active){const hit=sim.terrain.ray(target,back,want);if(hit){let solid=0,last='';for(let d=hit.distance;d<want;d+=.25){const p=V.add(target,V.scale(back,d)),key=Math.floor(p.x)+','+Math.floor(p.y)+','+Math.floor(p.z);if(key!==last){last=key;if(sim.terrain.isSolid(sim.terrain.get(p.x,p.y,p.z)))solid++;}}if(solid>CFG.cutaway.pullThickness)want=Math.max(1.2,hit.distance-.3);}}
  this.viewDistance=want<this.viewDistance?lerp(this.viewDistance,want,clamp(dt/60,0,1)):lerp(this.viewDistance,want,clamp(dt/350,0,1));
  let camera=V.add(target,V.scale(back,this.viewDistance));camera=V.add(camera,this.combatFx.cameraOffset());
  this.eye=camera;this.forward=forward;this.right={x:cosQ(c.yaw),y:0,z:-sinQ(c.yaw)};this.up=V.norm({x:this.right.y*forward.z-this.right.z*forward.y,y:this.right.z*forward.x-this.right.x*forward.z,z:this.right.x*forward.y-this.right.y*forward.x});
  this.vp=matrixMul(projection(this.fov*Math.PI/180,this.canvas.width/this.canvas.height,.035,130),viewMatrix(arr(camera),arr(V.add(camera,forward))));
  const radius=CFG.cutaway.radius*k.amount*k.amount*(3-2*k.amount),flat=Math.hypot(back.x,back.z)||1,slope=1/Math.tan(c.pitch);
  k.frame={y:k.y,base:target.y,radius,cx:target.x,cz:target.z,sx:back.x/flat*slope,sz:back.z/flat*slope,camera:{...camera},target:{...target},pos:{...renderPos}};
 }
 // The cutaway centre at height y (the view line), and whether cell (x,y,z) is inside the cut above the first layer
 // (hidden) or in the first ceiling layer itself.
 cutCenter(y){const f=this.cut.frame;return{x:f.cx+f.sx*(y-f.base),z:f.cz+f.sz*(y-f.base)};}
 cutCell(x,y,z){const f=this.cut.frame;if(!f||f.radius<=0||y<f.y)return null;const c=this.cutCenter(y+.5);if(Math.hypot(x+.5-c.x,z+.5-c.z)>=f.radius)return null;return y===f.y?'layer':'hidden';}
 // Distance from p to the camera-to-target segment.
 lineOfSight(p){const f=this.cut.frame,a=f.camera,ab=V.sub(f.target,a),t=clamp(V.dot(V.sub(p,a),ab)/Math.max(V.dot(ab,ab),1e-4),0,1);return V.len(V.sub(p,V.add(a,V.scale(ab,t))));}
 // Cells the line of sight fades (same test as the terrain shader, at the cell centre).
 fadedCell(x,y,z){const f=this.cut.frame;if(!f)return false;const p={x:x+.5,y:y+.5,z:z+.5},a=f.camera,ab=V.sub(f.target,a),t=clamp(V.dot(V.sub(p,a),ab)/Math.max(V.dot(ab,ab),1e-4),0,1);return t<.98&&V.len(V.sub(p,V.add(a,V.scale(ab,t))))<CFG.cutaway.fadeRadius&&V.len(V.sub(p,f.target))>CFG.cutaway.fadeKeep;}
 // Cursor ray (render-side input): a screen point → the block face under it and/or the actor under it, skipping hidden and
 // faded cells. The first ceiling layer is clickable (from below) within ceilingPick m of the player's column; a hit face buried in
 // rock is swapped for the open face that looks toward the camera. point is what the aim yaw/pitch looks at.
 pickAt(sx,sy){if(!this.eye||!this.cut.frame)return null;const w=this.canvas.clientWidth,h=this.canvas.clientHeight,t=Math.tan(this.fov*Math.PI/360),nx=(sx/w*2-1)*t*w/h,ny=(1-sy/h*2)*t;
  const dir=V.norm(V.add(this.forward,V.add(V.scale(this.right,nx),V.scale(this.up,ny)))),origin={...this.eye},sim=this.simRef,terrain=sim?.terrain,f=this.cut.frame;if(!terrain)return null;
  // The visible part of the first layer is its underside (the plane y = layer): a ray through that plane over the player
  // picks the layer cell there, ahead of anything below it. Elsewhere the voxel ray passes through layer and hidden cells.
  const skip=(x,y,z)=>!!this.cutCell(x,y,z)||this.fadedCell(x,y,z);let block=terrain.ray(origin,dir,80,skip);
  if(f.radius>0&&dir.y<0){const t=(f.y-origin.y)/dir.y,p=V.add(origin,V.scale(dir,t)),x=Math.floor(p.x),z=Math.floor(p.z),id=terrain.get(x,f.y,z);
   if(t>0&&(!block||t<block.distance)&&id&&this.cutCell(x,f.y,z)==='layer'&&Math.hypot(x+.5-f.pos.x,z+.5-f.pos.z)<=CFG.cutaway.ceilingPick&&!terrain.isSolid(terrain.get(x,f.y-1,z)))block={x,y:f.y,z,id,distance:t,normal:{x:0,y:-1,z:0},point:p};}
  if(block){const open=n=>!terrain.isSolid(terrain.get(block.x+n.x,block.y+n.y,block.z+n.z));
   if(!open(block.normal)){const faces=TARGET_FACES.filter(open).sort((a,b)=>V.dot(b,dir)-V.dot(a,dir));if(faces.length)block.normal={...faces[0]};}}
  let entity=null,entityT=block?block.distance:Infinity,self=false;
  for(const a of Object.values(this.lastActors||{})){if(a.dead)continue;const s=a.scale||1,r=CFG.player.radius*s+.2,top=a.pos.y+2*(a.offset||.95*s)+.2,hit=rayBox(origin,dir,{x:a.pos.x-r,y:a.pos.y-.1,z:a.pos.z-r},{x:a.pos.x+r,y:top,z:a.pos.z+r});if(hit===null)continue;if(a.id===this.localId){self=true;continue;}if(hit<entityT&&!this.cutCell(Math.floor(a.pos.x),Math.floor(a.pos.y+.5),Math.floor(a.pos.z))){entityT=hit;entity=a;}}
  const local=this.lastActors?.[this.localId];if(local&&!self){const feet=this.projected(local.pos),head=this.projected(V.add(local.pos,{x:0,y:1.9,z:0}));if(feet&&head){const ab={x:head.x-feet.x,y:head.y-feet.y},len=ab.x*ab.x+ab.y*ab.y||1,u=clamp(((sx-feet.x)*ab.x+(sy-feet.y)*ab.y)/len,0,1);self=Math.hypot(sx-feet.x-ab.x*u,sy-feet.y-ab.y*u)<48;}}
  let point=entity?V.add(entity.pos,{x:0,y:(entity.offset||.95),z:0}):block?block.point:null;
  if(!point){const feetY=local?local.pos.y:f.pos.y;point=Math.abs(dir.y)>1e-4&&(feetY-origin.y)/dir.y>0?V.add(origin,V.scale(dir,(feetY-origin.y)/dir.y)):V.add(origin,V.scale(dir,20));}
  this.cursor={sx,sy,block:entity?null:block&&{x:block.x,y:block.y,z:block.z,id:block.id,normal:{...block.normal},point:block.point,distance:block.distance},entity:entity?.id||null,self,point};return this.cursor;}

 blockFaceLine(out,center,u,v,x0,y0,x1,y1,width,color){
  const dx=x1-x0,dy=y1-y0,l=Math.hypot(dx,dy)||1,ox=-dy/l*width*.5,oy=dx/l*width*.5;
  const at=(x,y)=>[center.x+u.x*x+v.x*y,center.y+u.y*x+v.y*y,center.z+u.z*x+v.z*y];
  const pts=[at(x0+ox,y0+oy),at(x1+ox,y1+oy),at(x1-ox,y1-oy),at(x0-ox,y0-oy)];
  for(const i of [0,1,2,0,2,3])out.push(...pts[i],...color);
 }
 blockFace(out,hit,progress=0){
  const n=hit.normal,center={x:hit.x+.5+n.x*.514,y:hit.y+.5+n.y*.514,z:hit.z+.5+n.z*.514};
  const u=n.x?{x:0,y:0,z:1}:{x:1,y:0,z:0},v=n.y?{x:0,y:0,z:1}:{x:0,y:1,z:0};
  const color=progress?[1,.83,.44]:[.96,1,.86],k=clamp((this.viewDistance||8)/10,.8,2);
  const line=(x0,y0,x1,y1,w=.018,c=color)=>this.blockFaceLine(out,center,u,v,x0,y0,x1,y1,w*k,c);
  // The camera sits 6–20 m away: a full face outline (thicker when zoomed out) plus bright corner brackets.
  for(const a of [-1,1]){line(a*.48,-.48,a*.48,.48,.03);line(-.48,a*.48,.48,a*.48,.03);}
  for(const a of [-1,1])for(const b of [-1,1]){
   line(a*.46,b*.46,a*.22,b*.46,.06);line(a*.46,b*.46,a*.46,b*.22,.06);
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
  const object=this.worldObject(new T.Mesh(geometry,this.terrainMaterial)),ceiling=this.worldObject(new T.Mesh(geometry,this.ceilingMaterial));METRICS.add('render.upload',performance.now()-started);
  return{object,ceiling,count:indices.length,revision:m.revision,bytes:m.vertices.byteLength+m.normals.byteLength+m.materials.byteLength+indices.byteLength};
 }
 deleteMesh(m){if(!m)return;this.scene.remove(m.object);this.scene.remove(m.ceiling);m.object.geometry.dispose();}
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
 setCutUniforms(u){const f=this.cut.frame;u.cut.value.set([f.y,f.base,0,f.radius]);u.cutLine.value.set([f.cx,f.cz,f.sx,f.sz]);u.camA.value.set(arr(f.camera));u.camB.value.set(arr(f.target));}
 drawTerrain(lights){const u=this.terrainMaterial.uniforms;u.vp.value.set(this.vp);u.eye.value.set(arr(this.eye));u.ambient.value=this.ambient;u.fog.value.set(this.fog);u.lights.value.set(lights);u.textured.value=this.combatFx.options.textures?1:0;this.setCutUniforms(u);
  for(const [key,m]of this.meshes){if(!m.count)continue;const [x,y,z]=key.split(':').map(Number),dx=(x+.5)*16-this.eye.x,dz=(z+.5)*16-this.eye.z;if(dx*this.forward.x+dz*this.forward.z<-18||Math.hypot(dx,dz)>75)continue;this.submit(m.object);this.stats.vertices+=m.count;}}
 // The translucent first ceiling layer: the same chunk geometry again, only the band [cut y, cut y+1] inside the cut.
 drawCeiling(lights){const f=this.cut.frame;if(!f||f.radius<=0)return;const u=this.ceilingMaterial.uniforms,C=CFG.chunk,c=this.cutCenter(f.y+.5),cy=Math.floor(f.y/C);u.vp.value.set(this.vp);u.ambient.value=this.ambient;u.lights.value.set(lights);this.setCutUniforms(u);
  for(const [key,m]of this.meshes){if(!m.count)continue;const [x,y,z]=key.split(':').map(Number);if(y!==cy&&y!==Math.floor((f.y+1)/C)||Math.max(Math.abs((x+.5)*C-c.x),Math.abs((z+.5)*C-c.z))>C/2+f.radius+1)continue;this.submit(m.ceiling);this.stats.vertices+=m.count;}}
 // Darkened cross-sections of the cut: a cap on rock under the first layer and the slanted wall around the hidden volume,
 // up to the ground surface there, so the cut reads as cut-away ground and not sky. No cap within 1.5 m of the line of sight, so
 // the walls of a narrow tunnel never cover the player.
 cutawayShell(out,sim){const f=this.cut.frame;if(!f||f.radius<=0)return;const t=sim.terrain,solid=(x,y,z)=>t.isSolid(t.get(x,y,z)),dark=CUTAWAY_ROCK,c0=this.cutCenter(f.y),r=Math.ceil(f.radius);
  for(let z=Math.floor(c0.z)-r;z<=Math.floor(c0.z)+r;z++)for(let x=Math.floor(c0.x)-r;x<=Math.floor(c0.x)+r;x++){if(this.cutCell(x,f.y,z)!=='layer'||!solid(x,f.y-1,z)||this.lineOfSight({x:x+.5,y:f.y,z:z+.5})<1.5)continue;const y=f.y+.002;for(const p of [[x,y,z],[x+1,y,z],[x+1,y,z+1],[x,y,z],[x+1,y,z+1],[x,y,z+1]])out.push(...p,...dark);}
  const N=36,ring=[];for(let i=0;i<=N;i++){const a=i/N*TAU,dx=Math.cos(a)*f.radius,dz=Math.sin(a)*f.radius;let top=f.y+1;for(let k=0;k<3;k++){const c=this.cutCenter(top);top=Math.max(f.y+1,t.height(Math.floor(c.x+dx),Math.floor(c.z+dz))+1);}ring.push({dx,dz,top:Math.min(top,f.camera.y+2)});}
  for(let i=0;i<N;i++){const a=ring[i],b=ring[i+1],top=Math.min(a.top,b.top);if(top<=f.y)continue;const at=(q,y,k)=>{const c=this.cutCenter(y);return[c.x+q.dx,y,c.z+q.dz,...dark.map(v=>v*k)];};const lo=f.y,hiK=1.35;
   out.push(...at(a,lo,1),...at(b,lo,1),...at(b,top,hiK),...at(a,lo,1),...at(b,top,hiK),...at(a,top,hiK));}}
 // Whether an entity at pos stands in the hidden part of the cut (the ground under it is not drawn).
 cutHides(pos){return this.cutCell(Math.floor(pos.x),Math.floor(pos.y+.5),Math.floor(pos.z))==='hidden';}
 render(sim,authority,dt,displayFrame){
  const view={actors:{},drops:{},projectiles:{},companions:{}};displayFrame.forEach(model=>{const value=model.displayKind==='actor'?{...model,facing:direction(model.yaw,model.pitch)}:model;view[model.displayKind==='actor'?'actors':model.displayKind==='drop'?'drops':model.displayKind==='companion'?'companions':'projectiles'][model.id]=value;});
  const actor=view.actors[authority.id];if(!actor)return;this.displayTimeMs=displayFrame.timeMs;
  if(this.worldRef!==sim.terrain){this.combatFx.reset();this.particles.length=0;this.blockFx=null;this.actionFx=null;}
  this.combatFx.advance(dt);this.frame++;this.resize();const viewPos=actor.pos;this.simRef=sim;this.localId=authority.id;this.lastActors=view.actors;this.updateCamera(actor,sim,viewPos,dt);this.stream(sim,authority);const daylight=sim.daylight(),phase=sim.dayPhase(),alt=Math.cos(TAU*phase),twilight=Math.pow(1-Math.abs(alt),3);
  this.ambient=.20+.80*daylight;
  this.fog=new Float32Array([lerp(.075,.69,daylight)+.11*twilight,lerp(.11,.85,daylight)+.025*twilight,lerp(.19,.86,daylight)-.17*twilight]);const cutK=this.cut.amount,rock=CUTAWAY_ROCK.map(v=>v*clamp(this.ambient,.16,1.3));this.beginFrame(cutK>0?this.fog.map((v,i)=>lerp(v,rock[i],cutK)):this.fog);
  // Inside the cutaway, unmeshed rock interiors behind the cut show the rock colour instead of the sky.
  if(cutK<=0)this.drawSky(daylight,phase,alt,twilight);
  const lights=this.lights(sim,actor);this.frameLights=lights;this.drawTerrain(lights);
  const dyn=[],sprites=[];
  // Fluid volumes are submitted separately after solid terrain; no global sea plane.
  this.animationSamples={};
  for(const a of Object.values(view.actors)){
   if(a.dead||a.id!==actor.id&&(!this.entityVisualReady(a)||this.cutHides(a.pos)))continue;
   const visual=this.combatFx.pose(a),reaction=this.combatFx.reactions.get(a.id),scale=a.scale||1,c=visual.combat;
   const sample=actorSpritePose(visual,this.camera.yaw,reaction);this.animationSamples[a.id]=sample;
   // Players keep their authored colours; co-op players are told apart by the name tag in EnemyHealthHUD.
   let tint=[1,1,1,1];if(a.suspended)tint=[.55,.57,.55,1];
   const whiteFlash=!!(reaction&&reaction.age<CFG.combat.feedback.flash&&reaction.age<45);
   if(reaction&&reaction.age<CFG.combat.feedback.flash&&!whiteFlash)tint=[1.75,.65,.5,1];
   const rp=a.pos;if(a.speciesId)this.units.actor(visual,sim,reaction,tint,whiteFlash);else this.queueCharacter({phase:'world',key:a.id,kind:sample.kind,sample,actor:visual,reaction,pos:rp,scale,tint,alpha:1,whiteFlash});
   const raw=sim.actors[a.id],hit=raw?sim.physics.ground(raw,rp,2.5):null;if(hit&&hit.normal.y>.7){const y=rp.y+a.offset-hit.timeOfImpact+.012,height=Math.max(0,rp.y-y),factor=1/(1+height*.3);this.box(dyn,{x:rp.x,y,z:rp.z},{x:.66*scale*factor,y:.01,z:.44*scale*factor},[.20,.30,.22]);}
  }
  const dropSprites=[];for(const d of Object.values(view.drops)){const dp=d.pos,frame=this.dropAtlas.frames[d.item];if(!frame||!this.worldVisualReady(dp,.16))continue;
    const bob=Math.sin(d.age*.007+(hashStr(d.id)%37)*.12)*.045;
    this.sprite(dropSprites,{x:dp.x,y:dp.y-.075+bob,z:dp.z},.72,.72,frame,[1,1,1,1]);}

  for(const s of Object.values(view.projectiles)){const sp=s.pos;if(s.companionId||!this.worldVisualReady(sp,.08))continue;
   // A thrown item (the merge potion) spins as its item sprite; arrows and spit stay beams.
   if(s.item&&this.dropAtlas.frames[s.item]){this.sprite(dropSprites,{x:sp.x,y:sp.y-.2,z:sp.z},.42,.42,this.dropAtlas.frames[s.item],[1,1,1,1],false,(s.age||0)*.012);continue;}
   this.box(dyn,sp,{x:.08,y:.08,z:.55},s.enemy?[.75,.42,.73]:[.9,.79,.4],s.dir);}
  // Cursor highlight (render-side pick of the pointer) and the click-to-mine task block with its crack progress.
  const cursor=this.pickAt(this.pointer.x,this.pointer.y),task=authority.task,taskHit=task?{x:task.x,y:task.y,z:task.z,id:task.id,normal:faceToward(task,this.eye)}:null;
  if(this.pointer.shown!==false&&cursor?.block&&!(task&&cursor.block.x===task.x&&cursor.block.y===task.y&&cursor.block.z===task.z))this.blockFace(dyn,cursor.block,0);
  const hit=taskHit||(this.pointer.shown!==false?cursor?.block:null)||null;this.target=hit;
  if(taskHit){
   const key=blockKey(taskHit.x,taskHit.y,taskHit.z),mining=authority.mine.target===key&&authority.mine.elapsed>0;
   const progress=mining?clamp(authority.mine.elapsed/Math.max(1,BLOCKS[taskHit.id].hardness),0,1):0;
   this.blockFace(dyn,taskHit,progress);
   const index=mining?Math.floor(authority.mine.elapsed/140):-1;
   if(index!==this.mineFxStep&&index>=0&&index<=8){
    const n=taskHit.normal,p={x:taskHit.x+.5+n.x*.50,y:taskHit.y+.5+n.y*.50,z:taskHit.z+.5+n.z*.50};
    this.addBlockChips(p,BLOCKS[taskHit.id].color,3,n);
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
  this.units.prepare(view,sim,actor,dyn);this.drawFences(dyn,sim);this.cutawayShell(dyn,sim);
  this.drawColored(dyn);this.drawCeiling(lights);
  this.playerRig.draw('world');this.unitRig.draw('world');
  this.drawSprites(sprites,this.atlas.texture,{depthWrite:false});
  this.drawSprites(dropSprites,this.dropAtlas.texture,{ambient:Math.max(.75,this.ambient),blend:true});this.drawWater();
  const effects=[],effectSprites=[];this.combatFx.draw(effects,effectSprites,view);this.drawVfx(effects);this.drawSprites(effectSprites,this.atlas.texture,{ambient:1,blend:true});this.playerRig.draw('late');this.unitRig.draw('late');this.combatFx.ui(sim);
  this.healthHud.update(sim,actor,dt,view.actors,authority);this.endFrame();
 }
 // Fences and gates (mesh:false blocks, only ever placed by players) as lit wooden posts and rails, kept in an index
 // that follows VoxelWorld.editJournal. A fence joins fences, gates and full cubes on its four sides; a gate spans the
 // axis its neighbours join on and swings its two halves open to one side.
 fenceIndex(terrain){const f=this.fences;if(f?.world===terrain&&f.serial===terrain.editSerial)return f.map;
  const changes=f?.world===terrain?terrain.changesAfter(f.serial):null,fenceLike=id=>!!(BLOCKS[id]?.fence||BLOCKS[id]?.gate);let map=changes?f.map:new Map();
  if(changes){for(const c of changes)if(fenceLike(c.id))map.set(c.key,{x:c.x,y:c.y,z:c.z,id:c.id});else map.delete(c.key);}
  else for(const [key,id]of terrain.edits)if(fenceLike(id)){const [x,y,z]=key.split(',').map(Number);map.set(key,{x,y,z,id});}
  this.fences={world:terrain,serial:terrain.editSerial,map};return map;}
 drawFences(out,sim){const t=sim.terrain,wood=[.66,.47,.28],rail=[.74,.54,.33],gate=[.82,.63,.38],eye=this.eye;
  const joins=(x,y,z)=>{const id=t.get(x,y,z),b=BLOCKS[id];return !!id&&!!b&&(b.fence||!!b.gate||t.isSolid(id)&&b.mesh!==false);};
  for(const f of this.fenceIndex(t).values()){const c={x:f.x+.5,y:f.y,z:f.z+.5};if(Math.abs(c.x-eye.x)>44||Math.abs(c.z-eye.z)>44||!this.worldVisualReady(c,.2))continue;const b=BLOCKS[f.id];
   if(!b.gate){this.box(out,c,{x:.25,y:1,z:.25},wood);
    for(const [dx,dz]of RANCH_DIRS){if(!joins(f.x+dx,f.y,f.z+dz))continue;for(const y of [.36,.74])this.box(out,{x:c.x+dx*.31,y:c.y+y,z:c.z+dz*.31},dx?{x:.38,y:.12,z:.09}:{x:.09,y:.12,z:.38},rail);}continue;}
   const alongX=joins(f.x+1,f.y,f.z)||joins(f.x-1,f.y,f.z)||!(joins(f.x,f.y,f.z+1)||joins(f.x,f.y,f.z-1)),u=alongX?{x:1,z:0}:{x:0,z:1},n=alongX?{x:0,z:1}:{x:1,z:0},S=(a,b)=>alongX?{x:a,y:.12,z:b}:{x:b,y:.12,z:a};
   for(const s of [-1,1]){const end={x:c.x+u.x*s*.44,y:c.y+.08,z:c.z+u.z*s*.44};this.box(out,end,{x:.1,y:.92,z:.1},wood);
    if(b.gate==='closed'){for(const y of [.3,.74])this.box(out,{x:c.x+u.x*s*.22,y:c.y+y,z:c.z+u.z*s*.22},S(.44,.08),gate);this.box(out,{x:c.x+u.x*s*.04,y:c.y+.3,z:c.z+u.z*s*.04},{x:.08,y:.56,z:.08},gate);}
    else{for(const y of [.3,.74])this.box(out,{x:end.x+n.x*.24,y:c.y+y,z:end.z+n.z*.24},S(.08,.44),gate);this.box(out,{x:end.x+n.x*.44,y:c.y+.3,z:end.z+n.z*.44},{x:.08,y:.56,z:.08},gate);}}}}
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
 free(){this.meshBuilder.free();for(const m of this.meshes.values())this.deleteMesh(m);this.meshes.clear();this.clearWaterMeshes();this.playerRig.dispose();this.unitRig.dispose();
  for(const pool of this.pools.values())for(const item of pool.items){item.geometry?.dispose();item.object.material.dispose();}this.pools.clear();
  for(const m of [this.terrainMaterial,this.ceilingMaterial,this.waterMaterial,this.sky.material])m.dispose();this.sky.geometry.dispose();for(const t of [this.atlas.texture,this.dropAtlas.texture,this.blockAtlas.texture])t.dispose();
  this.combatFx.reset();this.healthHud.reset();this.three.dispose();}
}
// Colour of cut-away rock (caps, the cut wall and the background seen through rock interiors).
const CUTAWAY_ROCK=Object.freeze([.3,.27,.24]);
// Plant blocks over the head (a tree canopy, a giant mushroom) do not make a cave ceiling.
const CUTAWAY_PLANTS=new Set(['log','leaves','cap','stem'].map(id=>BID[id]));
// Ray against an axis-aligned box: the entry distance, or null.
function rayBox(o,d,min,max){let t0=0,t1=Infinity;for(const k of ['x','y','z']){if(Math.abs(d[k])<1e-9){if(o[k]<min[k]||o[k]>max[k])return null;continue;}let a=(min[k]-o[k])/d[k],b=(max[k]-o[k])/d[k];if(a>b)[a,b]=[b,a];t0=Math.max(t0,a);t1=Math.min(t1,b);if(t0>t1)return null;}return t0;}
