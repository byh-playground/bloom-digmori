/* Render jobs own a separate world/cache. They never write a Rapier World or simulation tick.
 * Native Worker and cooperative fallback execute the exact same generator. */
class MeshBuilder {
 constructor(){this.epoch=0;this.jobSerial=0;this.pending=new Map();this.ready=[];this.jobs=[];this.worker=null;this.local=null;this.current=null;this.mode='uninitialized';this.stats={sent:0,accepted:0,discarded:0,failed:0};this.seen=0;}
 source(){return `const CFG=${JSON.stringify(CFG)},BLOCKS=${JSON.stringify(BLOCKS)},BID=${JSON.stringify(BID)},RESOURCE_DEFS=${JSON.stringify(RESOURCE_DEFS)},DUNGEON_ROOMS=${JSON.stringify(DUNGEON_ROOMS)},DUNGEON_THEMES=${JSON.stringify(DUNGEON_THEMES)},DUNGEON_EDGES=${JSON.stringify(DUNGEON_EDGES)};
const clamp=${clamp},lerp=${lerp},cmp=${cmp},sq=${sq},hash3=${hash3},noise=${noise},fbm=${fbm},blockKey=${blockKey},chunkKey=${chunkKey};
const METRICS={add(){}};
${FluidWorld.toString()}
${VoxelWorld.toString()}
let world=null,epoch=0;
onmessage=({data:m})=>{try{if(m.type==='init'){epoch=m.epoch;world=VoxelWorld.restore(m.seed,m.edits);return;}if(m.epoch!==epoch)return;
if(m.type==='edits'){for(const e of m.edits)world.set(e.x,e.y,e.z,e.id);world.physicsChanges.clear();return;}
if(m.type==='mesh'){const start=performance.now(),it=world.meshSteps(...m.key.split(':').map(Number));let r;do{r=it.next();}while(!r.done);const mesh=r.value;world.meshes.delete(m.key);
 postMessage({type:'mesh',epoch,id:m.id,key:m.key,revision:m.revision,ms:performance.now()-start,vertices:mesh.vertices,indices:mesh.indices,colors:mesh.colors,normals:mesh.normals,materials:mesh.materials},[mesh.vertices.buffer,mesh.indices.buffer,mesh.colors.buffer,mesh.normals.buffer,mesh.materials.buffer]);
 if(world.chunks.size>650){world.chunks.clear();world.heights.clear();world.meshes.clear();}}
}catch(e){postMessage({type:'error',epoch,id:m.id,message:e.stack||e.message});}};`;}
 reset(world,forceLocal=false){this.freeWorker();this.epoch++;this.world=world;this.seen=world.editSerial;this.pending.clear();this.ready.length=0;this.jobs.length=0;this.current=null;
  if(!forceLocal&&typeof Worker!=='undefined'){let url;try{url=URL.createObjectURL(new Blob([this.source()],{type:'text/javascript'}));const epoch=this.epoch;this.worker=new Worker(url);this.worker.onmessage=e=>this.receive(e.data);this.worker.onerror=e=>{if(epoch!==this.epoch)return;console.warn('렌더 워커 폴백',e.message);this.stats.failed++;this.reset(this.world,true);};this.worker.postMessage({type:'init',epoch:this.epoch,seed:world.seed,edits:world.snapshot()});this.mode='worker';this.local=null;return;}catch(e){console.warn('렌더 워커 시작 실패, 분할 실행',e);this.freeWorker();}finally{if(url)URL.revokeObjectURL(url);}}
  this.local=VoxelWorld.restore(world.seed,world.snapshot());this.mode='cooperative';
 }
 sync(world){if(this.world!==world){this.reset(world);return;}const edits=world.changesAfter(this.seen);if(edits===null){this.reset(world,this.mode==='cooperative');return;}if(!edits.length)return;
  this.seen=world.editSerial;if(this.worker)this.worker.postMessage({type:'edits',epoch:this.epoch,edits});else{for(const e of edits)this.local.set(e.x,e.y,e.z,e.id);this.local.physicsChanges.clear();if(this.current){this.pending.delete(this.current.id);this.current=null;}}
 }
 has(key,revision){return this.ready.some(m=>m.key===key&&m.revision===revision)||[...this.pending.values()].some(m=>m.key===key&&m.revision===revision);}
 request(key,revision){if(this.pending.size>=CFG.render.maxPending||this.has(key,revision))return false;const job={type:'mesh',id:++this.jobSerial,epoch:this.epoch,key,revision};this.pending.set(job.id,job);this.stats.sent++;if(this.worker)this.worker.postMessage(job);else this.jobs.push(job);return true;}
 receive(m){if(m.epoch!==this.epoch){this.stats.discarded++;return;}const job=this.pending.get(m.id);this.pending.delete(m.id);if(m.type==='error'){this.stats.failed++;console.warn('렌더 메시 작업 실패',m.message);this.reset(this.world,true);return;}
  if(!job||m.key!==job.key||m.revision!==job.revision||m.revision!==(this.world.revisions.get(m.key)||0)){this.stats.discarded++;return;}this.ready.push(m);if(this.ready.length>CFG.render.maxPending*3)this.ready.shift();METRICS.add('render.meshBuild',m.ms);}
 pump(){if(this.worker||!this.local)return;const start=performance.now();let steps=0;while(steps++<256&&performance.now()-start<CFG.render.workerBudgetMs){if(!this.current){const job=this.jobs.shift();if(!job)break;if(!this.pending.has(job.id))continue;if(job.revision!==(this.world.revisions.get(job.key)||0)){this.pending.delete(job.id);this.stats.discarded++;continue;}this.current={...job,started:performance.now(),it:this.local.meshSteps(...job.key.split(':').map(Number))};}
   const r=this.current.it.next();if(r.done){const j=this.current;this.current=null;this.local.meshes.delete(j.key);this.receive({...r.value,type:'mesh',epoch:j.epoch,id:j.id,revision:j.revision,ms:performance.now()-j.started});}}
 }
 takeReady(want){const out=this.ready;this.ready=[];return out.filter(m=>{const valid=want.has(m.key)&&m.revision===(this.world.revisions.get(m.key)||0);if(!valid)this.stats.discarded++;return valid;});}
 freeWorker(){if(this.worker)this.worker.terminate();this.worker=null;}
 free(){this.freeWorker();this.pending.clear();this.ready.length=0;this.jobs.length=0;this.local=null;this.current=null;this.world=null;}
}

