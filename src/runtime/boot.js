'use strict';
function withTimeout(promise,ms,label){let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(label+' 시간 초과')),ms))]).finally(()=>clearTimeout(timer));}
function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('Bloom-Sandbox-0100',1);r.onupgradeneeded=()=>r.result.createObjectStore('world');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function storeSave(bytes){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('world','readwrite');tx.objectStore('world').put(bytes,'solo');tx.oncomplete=()=>{d.close();resolve()};tx.onerror=()=>{d.close();reject(tx.error)};});}
async function readSave(){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('world','readonly').objectStore('world').get('solo');r.onsuccess=()=>{d.close();resolve(r.result)};r.onerror=()=>{d.close();reject(r.error)};});}
let app,bootPromise=null,bootAttempt=0;
const gamekitBase=dependency=>`https://cdn.jsdelivr.net/gh/${dependency.repository}@${dependency.distCommit}/`;
// Import commit-pinned, distribution-ready ESM directly. Do not depend on crypto.subtle,
// Blob import, or opaque file:// origins. The pinned SHA declarations are build/audit metadata.
async function importGamekitModule(url,name,timeoutMs){try{return await withTimeout(import(url),timeoutMs,'Gamekit '+name+' 로딩');}
 catch(cause){const error=new Error('Gamekit '+name+' 로딩 실패: '+(cause?.message||String(cause)));error.cause=cause;error.stage='gamekit.'+name;throw error;}}
async function loadGamekit(dependency=DEPENDENCIES.gamekit,onProgress=()=>{}){
 const base=gamekitBase(dependency),entries=Object.entries(dependency.modules),modules={};
 const [first, ...remaining]=entries;
 if(first?.[0]!=='debug')throw Error('Gamekit 초기 진단 모듈이 먼저 와야 합니다.');
 onProgress({name:'debug',index:0,total:entries.length,url:base+first[1].file});
 modules.debug=await importGamekitModule(base+first[1].file,'debug',dependency.timeoutMs);
 if(typeof modules.debug.DiagnosticRing!=='function'||typeof modules.debug.copyDiagnostic!=='function')throw Error('Gamekit debug-tools 공개 API 불일치');
 window.BloomDiagnostics.install(modules.debug);
 const results=await Promise.all(remaining.map(async ([name,def],i)=>{
   onProgress({name,index:i+1,total:entries.length,url:base+def.file});
   return [name,await importGamekitModule(base+def.file,name,dependency.timeoutMs)];}));
 for(const [name,module]of results)modules[name]=module;
 if(typeof modules.interpolation.RenderObject!=='function'||typeof modules.interpolation.PresentationRuntime!=='function')throw Error('GameKit display API mismatch');
 if(typeof modules.input.ActionState!=='function'||typeof modules.input.createDOMInput!=='function'||typeof modules.simloop.createLoop!=='function'||typeof modules.simloop.createDeadlineScheduler!=='function'||typeof modules.presentation.PresentationEventQueue!=='function'||typeof modules.audio.AudioPlayer!=='function')throw Error('Gamekit 공개 API 불일치');
 return Object.freeze(modules);
}
// three.js is the 3D world renderer: one pinned ESM build, checked by revision and public API.
async function loadThree(dependency=DEPENDENCIES.three){try{
 const THREE=await withTimeout(import(dependency.url),dependency.timeoutMs,'three.js '+dependency.version+' 로딩');
 if(THREE.REVISION!==dependency.revision)throw Error('three.js 버전 불일치: r'+THREE.REVISION);
 for(const name of ['WebGLRenderer','RawShaderMaterial','InterleavedBuffer','CanvasTexture','DataTexture'])if(typeof THREE[name]!=='function')throw Error('three.js 공개 API 누락: '+name);
 return THREE;
}catch(cause){const error=new Error('three.js 로딩 실패: '+(cause?.message||String(cause)));error.cause=cause;error.stage='three';throw error;}}
async function loadExternalRapier(dependency=DEPENDENCIES.rapier,onProgress=()=>{},retry=0){
 const urls=[dependency.url,...(dependency.mirrors||[])],failures=[];
 for(let index=0;index<urls.length;index++){
  const base=urls[index],url=retry?base+(base.includes('?')?'&':'?')+'bloomRetry='+retry:base;
  try{
   onProgress({phase:'download',index,total:urls.length,url});
   const R=await withTimeout(import(url),dependency.timeoutMs,'CDN '+(index+1)+' 다운로드');
   if(typeof R.init!=='function'||typeof R.version!=='function')throw Error('Rapier 모듈 형식 불일치');
   for(const name of ['voxels'])if(typeof R.ColliderDesc?.[name]!=='function')throw Error('필수 Rapier 복셀 API 누락: '+name);
   for(const name of ['setVoxel','combineVoxelStates','propagateVoxelChange'])if(typeof R.Collider?.prototype?.[name]!=='function')throw Error('필수 Rapier 복셀 API 누락: '+name);
   onProgress({phase:'initialize',index,total:urls.length,url});
   await withTimeout(R.init(),dependency.timeoutMs,'Rapier 초기화');
   if(R.version()!==dependency.version)throw Error('Rapier 버전 불일치: '+R.version());
   return R;
  }catch(e){failures.push({url:base,message:e?.message||String(e)});console.warn('Rapier CDN 로딩 실패',base,e?.message||String(e));}
 }
 const error=Error('물리 엔진을 다운로드하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도하세요.');error.attempts=failures;throw error;
}
async function boot(){
 if(app)return app;if(bootPromise)return bootPromise;
 const attempt=bootAttempt++;$('loading').hidden=false;$('load-retry').hidden=true;$('load-retry').disabled=true;
 $('load-title').textContent='화원을 준비하고 있어요';$('loading').querySelector('.spinner').style.display='block';
 bootPromise=(async()=>{try{
  window.BloomDiagnostics.setPhase('gamekit');
  $('load-status').textContent='Bloom Gamekit 공통 모듈을 불러오고 있어요.';
  const gamekit=await loadGamekit(DEPENDENCIES.gamekit,e=>{$('load-status').textContent='Bloom Gamekit · '+e.name+' 모듈 로딩 중';console.info('Bloom gamekit',e.name,e.url);});
  window.BloomDiagnostics.setPhase('player-art');
  $('load-status').textContent='플레이어 부품 그림을 불러오고 있어요.';
  const playerRig=await PlayerRig.load(DEPENDENCIES.playerArt.base);
  window.BloomDiagnostics.setPhase('unit-art');
  $('load-status').textContent='새 동료 부품 그림을 불러오고 있어요.';
  const unitRigs=await UnitRig.loadAll(DEPENDENCIES.unitArt.base);
  window.BloomDiagnostics.setPhase('three');
  $('load-status').textContent='three.js 렌더러를 불러오고 있어요.';
  const THREE=await loadThree();
  window.BloomDiagnostics.setPhase('rapier');
  const R=await loadExternalRapier(DEPENDENCIES.rapier,e=>{
   $('load-status').textContent=e.phase==='initialize'?'물리 엔진을 초기화하고 있어요.':(e.index?'다른 CDN에서 물리 엔진을 다시 불러오고 있어요.':'물리 엔진을 CDN에서 불러오고 있어요.');
   console.info('Bloom dependency',e.phase,e.url);
  },attempt);
  window.BloomDiagnostics.setPhase('simulation');
  app=new App(R,gamekit,THREE,playerRig,unitRigs);
  window.Bloom={app,diagnostics:window.BloomDiagnostics,Simulation,Gear,GEAR_RULES,GEAR_TIERS,LABOR_REGROW,laborRegrow,Companions,recipePriorIngredients,ITEM_REALMS,REALM_ORDER,SPECIES,REALMS,EGG_RULES,RANCH_RULES,Ranch,BOSS_STRUCTURES,UnitPresenter,speciesActorLook,unitStrikeProgress,Inventory,Combat,Physics,VoxelWorld,RPG,RPG_SKILLS,QUESTS,DUNGEON_ROOMS,ITEMS,RECIPES,CFG,BLOCKS,BID,RESOURCE_DEFS,DEPENDENCIES,createItemIcons,encodeInputObject,decodeInput,encodeCommand,neutralInput,Renderer,MeshBuilder,MetricWindow,METRICS,ScenePresentation,VERSION,SNAPSHOT_VERSION,buildBlockAtlas,blockTexturePixel,TEXTURE_STYLE,CombatVisuals,ANIMATION,actionTiming,actorSpritePose,PlayerRig,playerRigLook,UnitRig,UnitRigRenderer,unitRigView,UNIT_SPECIES,UNIT_ANIMS,UNIT_EXPRESSIONS,UNIT_STAGES,BASIC_CHAIN,attackMotion,attackPose,attackClip,weaponVisualPose,EnemyHealthHUD,healthMeter,projectWorldToScreen,rollDirection,rollSpeed,attackPose,attackSamples,knockbackResponse};
  app.start();window.BloomDiagnostics.setPhase('playing');console.info('Bloom boot: ready');return app;
 }catch(e){console.error(e);window.BloomDiagnostics.report(e,{kind:'boot-error',visibility:'fatal',origin:e.stage||'boot'});$('load-title').textContent='화원을 불러오지 못했어요';$('load-status').textContent=e.message;$('loading').querySelector('.spinner').style.display='none';$('load-retry').hidden=false;$('load-retry').disabled=false;return null;
 }finally{bootPromise=null;}})();return bootPromise;
}
$('load-retry').onclick=()=>boot();

// Deep-linked introductions own a disposable game iframe. Do not initialize a second
// Rapier world behind it; boot the playable world after returning from the showcase.
if (window.__BLOOM_SHOWCASE_DEEPLINK) {
 window.addEventListener('bloom-showcase-closed',()=>{void boot();},{once:true});
} else {
 void boot();
}


