'use strict';
(async()=>{
const dependency=DEPENDENCIES.gamekit,base=`https://cdn.jsdelivr.net/gh/${dependency.repository}@${dependency.distCommit}/`;
const [vectorAssets,loader,THREE]=await Promise.all([...['vectorAssets','vectorAssetLoader'].map(name=>import(base+dependency.modules[name].file)),import(DEPENDENCIES.three.url)]);
const previewGamekit={vectorAssets};
const definition=DEPENDENCIES.vectorAssets.pebbleMole;
const previewLoader=loader.createVectorAssetLoader({fetch:globalThis.fetch.bind(globalThis),maxEntries:2});
const previewVector=await previewLoader.load(new URL('../../'+definition.url,location.href),{sourcePath:definition.sourcePath,expectedSha256:definition.sha256,maxBytes:definition.maxBytes,curveSegments:definition.curveSegments,includeSourcePaths:false});
const characterDefinition=DEPENDENCIES.vectorAssets.preview.sprout;
const previewCharacter=await previewLoader.load(new URL('../../'+characterDefinition.url,location.href),{sourcePath:characterDefinition.sourcePath,expectedSha256:characterDefinition.sha256,maxBytes:characterDefinition.maxBytes,curveSegments:characterDefinition.curveSegments,includeSourcePaths:false});
const ATTACHMENT_ART=COMPANION_ART;
const attachmentPose=companionAttachmentPose;
const PIXEL_CONTRACT=COMPANION_PIXELS;
const gearPoint=companionGearPoint;
const atlasPointWorld=companionAtlasPointWorld;
const attachedQuad=companionAttachedQuad;
const connectorGeometry=companionConnectorGeometry;
const companionAtlas=createCompanionAtlas;
const drawSprites=drawCompanionSprites;
// Visual-only fixture. Production Renderer and source art remain unchanged.
const previewUI=Object.fromEntries(['preview','state','scale','pitch','pitchOut','action','facing','device','wall','exact','stage','gear','a','b','play','error','close','timeline'].map(id=>[id,document.getElementById(id)]));
let layout='A',combatMode='ball',playing=true,clock=0,last=performance.now(),renderer;
for(const name of ['a','b'])previewUI[name].onclick=()=>{combatMode=name==='a'?'ball':'sword';previewUI.a.classList.toggle('active',combatMode==='ball');previewUI.b.classList.toggle('active',combatMode==='sword');};
previewUI.device.value=matchMedia('(max-width:700px)').matches?'mobile':'pc';
previewUI.timeline.oninput=()=>{playing=false;clock=Number(previewUI.timeline.value);previewUI.play.textContent='재생';drawFrame(clock);};
previewUI.play.onclick=()=>{playing=!playing;previewUI.play.textContent=playing?'일시정지':'재생';};
previewUI.exact.onchange=()=>previewUI.stage.classList.toggle('exact',previewUI.exact.checked);
// Geometry and sprites drawn after the SVG character keep depth writes off (legacy pass state).
function drawGeometry(r,vertices,depthWrite=true){r.drawColored(vertices,{lights:new Float32Array(32),depthWrite});}
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
 if(r.canvas.width!==width||r.canvas.height!==height){r.canvas.width=width;r.canvas.height=height;}
 r.camera.distance=previewUI.close.checked?4.2:7.5;r.camera.pitch=Number(previewUI.pitch.value);previewUI.pitchOut.textContent=r.camera.pitch.toFixed(2);
 const state=fixture(t),{actor,action,sample,pose,deploy,cycle,beat}=state;
 r.updateCamera(actor,{terrain:{ray:wallRay}});r.fog=new Float32Array([.48,.67,.72]);r.ambient=1;r.beginFrame(r.fog);
 const scene=[],reach=combatMode==='ball'?2:1.2;
 for(let z=-9;z<=9;z++)for(let x=-9;x<=9;x++)r.box(scene,{x,y:-.26,z},{x:1,y:.25,z:1},(x+z)%2?[.39,.51,.32]:[.43,.55,.35]);
 // A visible target and a side wall keep scale and occlusion legible.
 r.box(scene,{x:actor.pos.x+actor.facing.x*reach,y:0,z:actor.pos.z+actor.facing.z*reach},{x:1,y:action==='combat'&&beat.phase==='impact'?.24:.35,z:1},action==='combat'&&beat.phase==='impact'?[.78,.68,.39]:[.47,.53,.53]);r.box(scene,{x:-3,y:0,z:-3},{x:1,y:2,z:3},[.41,.47,.43]);
 if(previewUI.wall.checked)r.box(scene,{x:0,y:0,z:2.6},{x:8,y:4,z:1},[.45,.49,.43]);
 r.box(scene,{...actor.pos,y:.002},{x:.7,y:.012,z:.43},[.24,.32,.22]);drawGeometry(r,scene);
 // Reuse the current product's SVG character path instead of removed sprite frames.
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
 for(const verts of behind)drawSprites(r,verts,r.companions.texture);
 r.companionRenderer.drawCharacter({key:'preview-player',kind:'sprout',sample,pos:actor.pos,scale:1,tint:[1,1,1,1],alpha:1});
 if(previewUI.gear.checked){const cuffs=[];connectorGeometry(r,cuffs,actor,contract);drawGeometry(r,cuffs,false);}
 for(const verts of front)drawSprites(r,verts,r.companions.texture,false);
 r.endFrame();
 const labels={attached:'손에 붙어 대기',prepare:'함께 웅크려 준비',strike:combatMode==='ball'?'공으로 발사':'몸을 굳혀 휘두르기',impact:'명중 · 동료 반응',return:combatMode==='ball'?'손으로 복귀':'팔과 함께 회수',recover:'긴장 풀기'};
 previewUI.state.textContent=(combatMode==='ball'?'① 공 발사':'② 생물 검')+' · '+(action==='combat'?labels[beat.phase]:action)+' · '+sample.view*45+'°';
 if(playing)previewUI.timeline.value=String(cycle);
 previewUI.scale.textContent=`표시 ${Math.round(cssWidth)}×${Math.round(cssHeight)} · DPR ${dpr} · 캔버스 ${width}×${height} · 거리 ${r.camera.distance}m`;
 window.symbioticPreview={revision:4,combatMode,beat,previewOnly:true,pixelContract:{...PIXEL_CONTRACT,dpr,cssSize:[cssWidth,cssHeight],equipment:ATTACHMENT_ART.map((a,i)=>({id:a.id,pixels:r.companions.frames[combatMode+'/'+i+'/0'].pixels,worldPerPixelX:PIXEL_CONTRACT.worldPerPixelX,worldPerPixelY:PIXEL_CONTRACT.worldPerPixelY}))},layout,action,sample,positions,deploy,sockets:contract.sockets,hand:contract.hand,elbow:contract.elbow,camera:{...r.camera},renderSize:[width,height],glError:gl.getError(),frames:(window.symbioticPreview?.frames||0)+1};
}
const previewRig=await PlayerRig.load('../../'+DEPENDENCIES.playerArt.base);
try{renderer=new Renderer(previewUI.preview,previewGamekit,{pebbleMole:previewVector,characters:{sprout:previewCharacter}},THREE,previewRig);renderer.companions=companionAtlas();renderer.companions.texture=renderer.canvasTexture(renderer.companions.canvas);function tick(now){const dt=Math.max(0,Math.min(.05,(now-last)/1000));last=now;if(playing)clock+=dt;try{drawFrame(clock);requestAnimationFrame(tick);}catch(e){showError(e);}}requestAnimationFrame(tick);}catch(e){showError(e);}
function showError(e){previewUI.error.style.display='block';previewUI.error.textContent='미리보기를 렌더하지 못했습니다: '+e.message+' · WebGL을 사용할 수 있는 브라우저에서 열어 주세요.';previewUI.state.textContent='렌더 실패';console.error(e);}

// Deterministic browser review entry point; same live fixture, no alternative rendering path.
window.symbioticReview={setTime(t){playing=false;clock=t;drawFrame(clock);},resume(){playing=true;},attachmentPose};



})().catch(error=>{const panel=document.getElementById('error');panel.style.display='block';panel.textContent='미리보기를 불러오지 못했습니다: '+error.message;console.error(error);});
