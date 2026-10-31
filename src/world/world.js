'use strict';
const DUNGEON_THEMES=Object.freeze([
 Object.freeze({name:'잊힌 석실',wall:'cobble',trim:'obsidian',species:['shell','leaf']}),
 Object.freeze({name:'균사 성소',wall:'cobble',trim:'stem',species:['shell','leaf']}),
 Object.freeze({name:'수정 묘역',wall:'stone',trim:'obsidian',species:['shell','leaf']})
]);
const DUNGEON_ROOMS=Object.freeze([
 Object.freeze({name:'입구',dx:0,dz:0,r:5,role:'entrance'}),
 Object.freeze({name:'동쪽 경비실',dx:16,dz:-4,r:4,role:'guard'}),
 Object.freeze({name:'서쪽 저장고',dx:-15,dz:-4,r:4,role:'treasure'}),
 Object.freeze({name:'수정 정원',dx:17,dz:16,r:5,role:'crystal'}),
 Object.freeze({name:'기도실',dx:-14,dz:16,r:5,role:'shrine'}),
 Object.freeze({name:'최심부',dx:0,dz:32,r:6,role:'vault'})
]);
// Connected graph: every room reachable from entry. Edge 1-3 forms an optional loop.
const DUNGEON_EDGES=Object.freeze([[0,1],[0,2],[1,3],[2,4],[3,5],[4,5],[1,4]]);
/* Seed + integer block edits own the world; meshes/LOD/physics caches never own gameplay state. */
const FACE_DIRS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const blockKey=(x,y,z)=>x+','+y+','+z,chunkKey=(x,y,z)=>x+':'+y+':'+z,columnKey=(x,z)=>x+':'+z;
const biomeRangeContains=(value,range)=>Array.isArray(range)&&value>=range[0]&&value<=range[1];
/* FluidWorld owns water sources + flowing levels. Terrain remains solid-only.
 * Minecraft-inspired: eight levels, seven horizontal steps, falling columns,
 * finite deterministic tick budget, and one snapshot owner for multiplayer. */
class FluidWorld {
 constructor(terrain){this.terrain=terrain;this.flow=new Map();this.sources=new Set();this.removed=new Set();this.flowChunks=new Map();this.sourceChunks=new Map();this.pending=[];this.head=0;this.queued=new Set();this.revision=0;this.chunkRevisions=new Map();this.lastSeedTick=-1;this.activeCenters=null;this.capacityBlocked=0;}
 key(x,y,z){return blockKey(x,y,z);}
 section(x,y,z){const C=CFG.chunk;return chunkKey(Math.floor(x/C),Math.floor(y/C),Math.floor(z/C));}
 // Rebuildable spatial indices: simulation state remains flow/sources (snapshot SSOT).
 indexCell(index,x,y,z,present){const ck=this.section(x,y,z),key=this.key(x,y,z);let entries=index.get(ck);
  if(present){if(!entries){entries=new Set();index.set(ck,entries);}entries.add(key);}
  else if(entries){entries.delete(key);if(!entries.size)index.delete(ck);}}
 inBounds(x,y,z){return y>CFG.bottom&&y<CFG.top&&Math.abs(x)<8190&&Math.abs(z)<8190;}
 // Natural water is confined to terrain depressions below the shared sea level.
 // No hash-selected source is placed above dry land; deep cavities are not aquifers.
 naturalSource(x,y,z){const ground=this.terrain.height(x,z);return ground<CFG.sea&&y>ground&&y<=CFG.sea&&this.terrain.isSolid(this.terrain.get(x,ground,z));}
 isSource(x,y,z){const key=this.key(x,y,z);return !this.removed.has(key)&&(this.sources.has(key)||this.naturalSource(x,y,z));}
 level(x,y,z){x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);if(!this.inBounds(x,y,z))return 0;
  if(this.terrain.isSolid(this.terrain.get(x,y,z)))return 0;
  const key=this.key(x,y,z);return this.isSource(x,y,z)?8:this.flow.get(key)||0;}
 depthAt(x,y,z){const yy=Math.floor(y),level=this.level(x,yy,z);return level?Math.max(0,Math.min(1,yy+level/8-y)):0;}
 bodyState(pos,eyeHeight=CFG.player.eyeHeight,footRadius=0){const x=Math.floor(pos.x),z=Math.floor(pos.z),y=Math.floor(pos.y);
  // The water/land boundary is determined from the actor's full foot area,
  // not just its center cell. Crossing a bank then cannot abruptly toggle
  // buoyancy while half of the cuboid is still inside water.
  const cells=[[x,z]];
  if(footRadius>0){const r=Math.min(.7,footRadius);
   for(const [ox,oz]of [[-r,-r],[r,-r],[-r,r],[r,r]]){const cx=Math.floor(pos.x+ox),cz=Math.floor(pos.z+oz);
    if(!cells.some(v=>v[0]===cx&&v[1]===cz))cells.push([cx,cz]);}}
  let surface=-Infinity;for(const [cx,cz]of cells)for(let dy=-1;dy<=2;dy++){const yy=y+dy,lv=this.level(cx,yy,cz);if(lv&&yy<pos.y+1.7&&yy+lv/8>pos.y)surface=Math.max(surface,yy+lv/8);}
  const depth=Math.max(0,surface-pos.y),immersion=clamp((depth-.25)/1.0,0,1),inWater=depth>.22;
  const lv=this.level(x,Math.floor(pos.y+.6),z);let fx=0,fz=0;
  if(lv&&immersion>.1){const cy=Math.floor(pos.y+.6);fx=(this.level(x-1,cy,z)-this.level(x+1,cy,z))/8;fz=(this.level(x,cy,z-1)-this.level(x,cy,z+1))/8;}
  return{inWater,underwater:surface>pos.y+eyeHeight-.1,depth,immersion,surface,flow:{x:fx,y:0,z:fz}};}
 // Only loaded simulation regions spread fluid. Source blocks remain persistent.
 active(x,z){const centers=this.activeCenters;if(centers===null)return true;if(!centers.length)return false;const radius=CFG.water.simulationRadius;
  return centers.some(p=>Math.abs(x-p.x)<=radius&&Math.abs(z-p.z)<=radius);}
 schedule(x,y,z){if(!this.inBounds(x,y,z)||!this.active(x,z))return;const key=this.key(x,y,z);if(this.queued.has(key))return;this.queued.add(key);this.pending.push([x,y,z]);}
 scheduleNeighbors(x,y,z){this.schedule(x,y,z);this.schedule(x,y-1,z);this.schedule(x,y+1,z);for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])this.schedule(x+dx,y,z+dz);}
 touch(x,y,z){this.revision++;const C=CFG.chunk,cx=Math.floor(x/C),cy=Math.floor(y/C),cz=Math.floor(z/C);
  const offsets=[[0,0,0]];if(x-cx*C===0)offsets.push([-1,0,0]);if(x-cx*C===C-1)offsets.push([1,0,0]);
  if(y-cy*C===0)offsets.push([0,-1,0]);if(y-cy*C===C-1)offsets.push([0,1,0]);
  if(z-cz*C===0)offsets.push([0,0,-1]);if(z-cz*C===C-1)offsets.push([0,0,1]);
  for(const [dx,dy,dz]of offsets){const key=chunkKey(cx+dx,cy+dy,cz+dz);this.chunkRevisions.set(key,(this.chunkRevisions.get(key)||0)+1);}}

 onBlockEdited(x,y,z){this.scheduleNeighbors(x,y,z);this.touch(x,y,z);}
 source(x,y,z,present){x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);if(!this.inBounds(x,y,z)||this.terrain.isSolid(this.terrain.get(x,y,z)))return false;
  const key=this.key(x,y,z);if(present){if(this.isSource(x,y,z))return false;this.sources.add(key);this.removed.delete(key);this.flow.delete(key);this.indexCell(this.sourceChunks,x,y,z,true);this.indexCell(this.flowChunks,x,y,z,false);}
  else{if(!this.isSource(x,y,z))return false;this.sources.delete(key);this.indexCell(this.sourceChunks,x,y,z,false);if(this.naturalSource(x,y,z))this.removed.add(key);else this.removed.delete(key);}
  this.touch(x,y,z);this.scheduleNeighbors(x,y,z);return true;}
 // Flow is derived from persistent source blocks. Inactive regions are not ticked,
 // just as unloaded voxel sections are not ticked. Pruning is deterministic from
 // the complete set of active players, not the local camera or render distance.
 retireInactive(){if(!this.activeCenters.length)return;
  const affected=new Set(),C=CFG.chunk;let retired=0;
  const mark=(x,y,z)=>{const cx=Math.floor(x/C),cy=Math.floor(y/C),cz=Math.floor(z/C);
   affected.add(chunkKey(cx,cy,cz));if(x-cx*C===0)affected.add(chunkKey(cx-1,cy,cz));if(x-cx*C===C-1)affected.add(chunkKey(cx+1,cy,cz));
   if(y-cy*C===0)affected.add(chunkKey(cx,cy-1,cz));if(y-cy*C===C-1)affected.add(chunkKey(cx,cy+1,cz));
   if(z-cz*C===0)affected.add(chunkKey(cx,cy,cz-1));if(z-cz*C===C-1)affected.add(chunkKey(cx,cy,cz+1));};
  for(const [section,entries] of this.flowChunks){
   for(const key of entries){const [x,y,z]=key.split(',').map(Number);if(this.active(x,z))continue;
    this.flow.delete(key);entries.delete(key);mark(x,y,z);retired++;}
   if(!entries.size)this.flowChunks.delete(section);
  }
  if(retired){this.revision+=retired;for(const section of affected)this.chunkRevisions.set(section,(this.chunkRevisions.get(section)||0)+1);METRICS.add('water.retiredCells',retired);}
  if(this.head||this.pending.length){const next=[];this.queued.clear();for(let i=this.head;i<this.pending.length;i++){
    const p=this.pending[i];if(!this.active(p[0],p[2]))continue;const key=this.key(...p);
    if(!this.queued.has(key)){next.push(p);this.queued.add(key);}}
   this.pending=next;this.head=0;}
 }
 activate(players,tick){if(this.lastSeedTick>=0&&tick-this.lastSeedTick<CFG.water.activateEveryTicks)return;this.lastSeedTick=tick;
  const radius=CFG.water.activationRadius,C=CFG.chunk;
  const activePlayers=players.filter(p=>p&&!p.dead&&!p.suspended).sort((a,b)=>cmp(a.id,b.id));
  for(const p of activePlayers){const x0=Math.floor(p.pos.x),z0=Math.floor(p.pos.z);
   for(let z=z0-radius;z<=z0+radius;z++)for(let x=x0-radius;x<=x0+radius;x++){
    const sy=CFG.sea;
    if(Math.abs(sy-p.pos.y)>18||!this.naturalSource(x,sy,z)||!this.inBounds(x,sy,z))continue;
    if(this.removed.has(this.key(x,sy,z)))continue;
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])this.schedule(x+dx,sy,z+dz);
    this.schedule(x,sy-1,z);
   }
   // Player-placed sources are indexed per section and reactivated when a
   // player revisits their region. No global source scan each simulation tick.
   const sr=CFG.water.simulationRadius,cx0=Math.floor((x0-sr)/C),cx1=Math.floor((x0+sr)/C),cz0=Math.floor((z0-sr)/C),cz1=Math.floor((z0+sr)/C);
   for(let cz=cz0;cz<=cz1;cz++)for(let cx=cx0;cx<=cx1;cx++)for(let cy=Math.floor((CFG.bottom+1)/C);cy<=Math.floor((CFG.top-1)/C);cy++){
    const sources=this.sourceChunks.get(chunkKey(cx,cy,cz));if(!sources)continue;
    for(const key of [...sources].sort(cmp)){const [sx,sy,sz]=key.split(',').map(Number);if(this.active(sx,sz))this.scheduleNeighbors(sx,sy,sz);}
   }
  }
 }
 step(players,tick){this.activeCenters=players.filter(p=>p&&!p.dead&&!p.suspended).map(p=>({x:Math.floor(p.pos.x),z:Math.floor(p.pos.z)}));
  if(!this.activeCenters.length)return;
  if(tick%CFG.water.retireEveryTicks===0)this.retireInactive();
  this.activate(players,tick);if(tick%CFG.water.updateEveryTicks!==0)return;
  const started=performance.now(),limit=CFG.water.maxUpdatesPerStep;let work=0;
  while(this.head<this.pending.length&&work<limit){work++;const [x,y,z]=this.pending[this.head++],key=this.key(x,y,z);this.queued.delete(key);
   if(!this.inBounds(x,y,z)||!this.active(x,z))continue;
   const existing=this.flow.get(key)||0;
   let next=0;if(!this.terrain.isSolid(this.terrain.get(x,y,z))&&!this.isSource(x,y,z)){
    if(this.level(x,y+1,z)>0)next=8;
    else for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
     const nx=x+dx,nz=z+dz,neighbor=this.level(nx,y,nz);
     if(neighbor>next+1&&(this.terrain.isSolid(this.terrain.get(nx,y-1,nz))||this.isSource(nx,y,nz)))next=neighbor-1;
    }
   }
   if(next===existing)continue;
   if(next&&!existing&&this.flow.size>=CFG.water.maxFlowCells){
    // Bounded deterministic backpressure: a large flood never crashes the
    // entire PvP simulation. Re-seeding sources or terrain changes can resume
    // spreading after distant derived cells are retired.
    this.capacityBlocked++;METRICS.add('water.capacityBlocked',1);continue;
   }
   if(next)this.flow.set(key,next);else this.flow.delete(key);
   if(!!next!==!!existing)this.indexCell(this.flowChunks,x,y,z,!!next);
   this.touch(x,y,z);this.scheduleNeighbors(x,y,z);
  }
  if(this.head>4096){this.pending=this.pending.slice(this.head);this.head=0;}
  METRICS.add('water.step',performance.now()-started);
 }
 snapshot(){return{sources:[...this.sources].sort(cmp),removed:[...this.removed].sort(cmp),flow:[...this.flow.entries()].sort(([a],[b])=>cmp(a,b)),pending:this.pending.slice(this.head).map(v=>[...v]),lastSeedTick:this.lastSeedTick};}
 restore(state){if(!state||!Array.isArray(state.sources)||!Array.isArray(state.removed)||!Array.isArray(state.flow)||!Array.isArray(state.pending))throw Error('물 상태 누락 또는 손상');
  if(state.flow.length>CFG.water.maxFlowCells||state.pending.length>120000)throw Error('물 상태 용량 초과');
  this.sources=new Set(state.sources);this.removed=new Set(state.removed);this.flow=new Map(state.flow);
  this.flowChunks.clear();this.sourceChunks.clear();for(const key of this.sources){const [x,y,z]=key.split(',').map(Number);this.indexCell(this.sourceChunks,x,y,z,true);}
  for(const key of this.flow.keys()){const [x,y,z]=key.split(',').map(Number);this.indexCell(this.flowChunks,x,y,z,true);}this.pending=state.pending.map(v=>[...v]);this.head=0;this.queued=new Set(this.pending.map(p=>this.key(...p)));this.chunkRevisions.clear();this.lastSeedTick=state.lastSeedTick;this.revision++;}
 /** A finite stepped ray is used only for interactable fluid sources, never for combat/terrain hits. */
 raySource(origin,dir,reach=CFG.reach){const d=V.norm(dir),step=.18;for(let t=.18;t<=reach;t+=step){const p=V.add(origin,V.scale(d,t)),x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);if(this.terrain.isSolid(this.terrain.get(x,y,z)))break;if(this.isSource(x,y,z)&&this.depthAt(p.x,p.y,p.z)>0)return{x,y,z};}return null;}
}

class VoxelWorld {
 constructor(seed){this.seed=seed>>>0;this.edits=new Map();this.editBuckets=new Map();this.chunks=new Map();this.heights=new Map();this.climates=new Map();this.caves=new Map();this.meshes=new Map();this.revisions=new Map();this.dirty=new Set();this.editSerial=0;this.physicsRevisions=new Map();this.physicsChanges=new Map();this.editJournal=[];this.lightBuckets=new Map();this.spawn={x:.5,y:5.1,z:.5};this.altar={x:24,y:5,z:-14};this.water=new FluidWorld(this);}
 climate(x,z){x=Math.floor(x);z=Math.floor(z);const key=columnKey(x,z);let value=this.climates.get(key);if(value)return value;
  const heat=noise(x*.018,0,z*.018,this.seed+831),wet=noise(x*.019,0,z*.019,this.seed+839);
  const id=Math.hypot(x,z)<12?'meadow':heat>.15?'dry':heat<-.15?'cold':wet>.10?'forest':wet<-.13?'fungal':'meadow';
  value={id,heat,wet};this.climates.set(key,value);return value;}
 height(x,z){const key=x+','+z;let h=this.heights.get(key);if(h!==undefined)return h;
  const wx=fbm(x*.01,z*.01,this.seed+141)*14,wz=fbm(x*.009+7,z*.012,this.seed+333)*14;
  const climate=this.climate(x,z),ridge=Math.max(0,-climate.heat)*12,dunes=Math.max(0,climate.heat)*noise(x*.065,0,z*.065,this.seed+844)*9;
  h=Math.floor(4+fbm((x+wx)*.014,(z+wz)*.014,this.seed)*13+fbm(x*.085,z*.085,this.seed+95)*2.5+ridge+dunes);
  // A small safe landing, not a prebuilt village. The rest remains seeded.
  const d=Math.hypot(x,z);if(d<12)h=Math.round(lerp(4,h,clamp((d-5)/7,0,1)));
  // A gentle approach from the landing to the first natural cave, not a ladder shaft.
  const approach=Math.hypot(x,Math.max(0,-20-z,z));if(approach<7)h=Math.round(lerp(4,h,clamp((approach-2)/5,0,1)));
  const caveBank=Math.hypot(x,Math.max(0,-60-z,z+20));if(caveBank<8)h=Math.max(h,Math.floor(lerp(4,h,clamp((caveBank-4)/4,0,1))));
  if(Math.abs(x-24)<=4&&Math.abs(z+14)<=4)h=4;
  h=clamp(h,-8,24);this.heights.set(key,h);return h;
 }
 vegetationSite(x,z,biome=BIOMES[this.climate(x,z).id]){const rule=biome.vegetation,habitat=biome.habitat,h=this.height(x,z),climate=this.climate(x,z);
  if(!rule.density||!biomeRangeContains(h,habitat.elevation)||!biomeRangeContains(climate.heat,habitat.climate.heat)||!biomeRangeContains(climate.wet,habitat.climate.wet))return null;
  const ground=h<CFG.sea+2?'sand':biome.surface;if(!habitat.surfaces.includes(BLOCKS[BID[ground]]?.id)||this.edits.has(blockKey(x,h,z)))return null;
  let low=Infinity,high=-Infinity,total=0;for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const next=this.height(x+dx,z+dz);low=Math.min(low,next);high=Math.max(high,next);total+=next;}
  if(high-low>habitat.maxSlope)return null;const exposure=Math.max(0,h-total/8);if(exposure>habitat.maxExposure)return null;
  return{height:h,canopy:rule.canopy};
 }
 biome(x,z){const h=this.height(Math.floor(x),Math.floor(z));return h<3?'이슬 해안':BIOMES[this.climate(x,z).id].name;}
 caveAnchors(minX,minZ,maxX,maxZ){const out=[],spacing=CFG.worldgen.caveSpacing,margin=CFG.worldgen.caveLength+8;
  const add=c=>{if(c&&c.x+margin>=minX&&c.x-margin<=maxX&&c.z+margin>=minZ&&c.z-margin<=maxZ)out.push(c);};
  add({key:'cave:start',x:0,z:-20,y:4,dx:0,dz:-1});
  for(let gz=Math.floor((minZ-margin)/spacing);gz<=Math.floor((maxZ+margin)/spacing);gz++)for(let gx=Math.floor((minX-margin)/spacing);gx<=Math.floor((maxX+margin)/spacing);gx++){
   const key=gx+':'+gz;let c=this.caves.get(key);
   if(c===undefined){const h=hash3(gx,0,gz,this.seed+684),x=gx*spacing+10+h%28,z=gz*spacing+10+(h>>>8)%28,y=this.height(x,z);
    c=null;if(h%4!==0&&y>=CFG.sea+3&&y<=18&&Math.hypot(x,z+20)>48){
     const directions=[[0,-1],[1,0],[0,1],[-1,0]],rank=directions.map(([dx,dz],i)=>({dx,dz,i,height:this.height(x+dx*12,z+dz*12)+this.height(x+dx*24,z+dz*24)})).filter(d=>{for(let t=-3;t<=CFG.worldgen.caveLength+6;t+=3)for(const w of [-5,0,5])if(this.height(x+d.dx*t-d.dz*w,z+d.dz*t+d.dx*w)<CFG.sea+2)return false;return true;}).sort((a,b)=>b.height-a.height||a.i-b.i),d=rank[0];
     if(d)c={key:'cave:'+key,x,z,y,dx:d.dx,dz:d.dz};}this.caves.set(key,c);
   }add(c);
  }return out.sort((a,b)=>cmp(a.key,b.key));}
 caveFloor(c,step){const count=clamp(step,0,CFG.worldgen.caveLength-6),phase=hash3(c.x,0,c.z,this.seed+685)%5;let drop=0;for(let i=1;i<=count;i++)if((i+phase)%5===0||(i+phase)%5===2)drop++;return c.y-drop;}
 applyNaturalCaves(out,x0,y0,z0,C,caves){const put=(x,y,z,id)=>{if(x>=x0&&x<x0+C&&y>=y0&&y<y0+C&&z>=z0&&z<z0+C&&y>CFG.bottom&&y<CFG.top)out[x-x0+C*(y-y0+C*(z-z0))]=id;};
  for(const c of caves){const sideX=-c.dz,sideZ=c.dx;
   for(let step=-3;step<=CFG.worldgen.caveLength;step++){const bend=step<2?0:Math.round(noise(step*.14,0,0,this.seed+hash3(c.x,0,c.z))*1.5),x=c.x+c.dx*step+sideX*bend,z=c.z+c.dz*step+sideZ*bend,floor=this.caveFloor(c,step),width=2+(hash3(Math.floor(step/3),c.x,c.z,this.seed)%3===0?1:0);
    // Natural stone ramp keeps a continuous sole even across existing underground cavities.
    for(let w=-width;w<=width;w++){const px=x+sideX*w,pz=z+sideZ*w;const surface=this.height(px,pz),material=surface-floor<2?BID[BIOMES[this.climate(px,pz).id].surface]:BID.stone;
     put(px,floor,pz,material);const headroom=3+(Math.abs(w)<2?1:0)+(w===0&&hash3(step,c.x,c.z,this.seed)%3===0?1:0);for(let dy=1;dy<=headroom;dy++)put(px,floor+dy,pz,0);}
    if(step===12||step===13)for(const side of [-1,1])for(let dy=1;dy<=2;dy++)put(x+sideX*(width+1)*side,floor+dy,z+sideZ*(width+1)*side,BID.coalOre);
   }
   const end=CFG.worldgen.caveLength,ex=c.x+c.dx*end,ez=c.z+c.dz*end,floor=this.caveFloor(c,end);
   for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++){if(dx*dx+dz*dz>25)continue;put(ex+dx,floor,ez+dz,BID.stone);for(let dy=1;dy<=5;dy++)put(ex+dx,floor+dy,ez+dz,0);}
   for(const side of [-1,1])for(let dy=1;dy<=2;dy++)for(let t=-1;t<=1;t++)put(ex+sideX*5*side+c.dx*t,floor+dy,ez+sideZ*5*side+c.dz*t,BID.ironOre);
  }}
 oreBand(y,min,max,peak){if(y<min||y>max)return 0;return y<=peak?(y-min)/Math.max(1,peak-min):(max-y)/Math.max(1,max-peak);}
  resourceInfo(){return RESOURCE_DEFS;}
  dungeonTheme(structure){return DUNGEON_THEMES[structure.hash%DUNGEON_THEMES.length];}
  dungeonRooms(structure){return DUNGEON_ROOMS.map((r,i)=>({id:i,name:r.name,role:r.role,r:r.r,x:structure.x+r.dx+(i?((structure.hash>>>(i*3%22))%3)-1:0),z:structure.z+r.dz+(i?((structure.hash>>>(i*4%22))%3)-1:0),y:structure.y}));}
  caveCarve(x,y,z,depth){if(depth<4||y<CFG.bottom+2)return false;
   const cheap=noise(x*.032,y*.041,z*.032,this.seed+675);
   const cheese=depth>9&&cheap>.53;
   // 3D crossing contours produce continuous curving tubes, not per-chunk carvers.
   const offset=noise(x*.015,y*.019,z*.015,this.seed+677)*1.7;
   const spaghetti=depth>5&&Math.abs(noise(x*.055+offset,y*.060,z*.055-offset,this.seed+674))<.062;
   const noodle=depth>12&&Math.abs(noise(x*.098,y*.091,z*.087,this.seed+680))<.027;
   const shaft=depth>14&&cheap>.19&&Math.abs(noise(x*.029,0,z*.029,this.seed+681))<.055;
   const mouth=depth<10&&Math.abs(noise(x*.040,0,z*.040,this.seed+682))<.05&&Math.abs(noise(x*.022,y*.040,z*.022,this.seed+683))<.12;
   return cheese||spaghetti||noodle||shaft||mouth;
  }
 structureAnchors(minX,minZ,maxX,maxZ){const out=[],add=(type,spacing,salt,depthBase,depthSpan,margin)=>{const gx0=Math.floor((minX-margin)/spacing),gx1=Math.floor((maxX+margin)/spacing),gz0=Math.floor((minZ-margin)/spacing),gz1=Math.floor((maxZ+margin)/spacing);for(let gz=gz0;gz<=gz1;gz++)for(let gx=gx0;gx<=gx1;gx++){const h=hash3(gx,0,gz,this.seed+salt),span=Math.max(1,spacing-32),x=gx*spacing+16+(h%span),z=gz*spacing+16+((h>>>8)%span);if(Math.hypot(x,z)<20)continue;const y=depthBase-((h>>>16)%depthSpan);out.push({type,key:type+':'+gx+':'+gz,x,y,z,hash:h});}};add('mine',CFG.worldgen.mineSpacing,1701,-6,9,24);add('dungeon',CFG.worldgen.dungeonSpacing,2701,-17,8,38);return out.sort((a,b)=>cmp(a.key,b.key));}
 structuresNear(pos,radius=CFG.worldgen.resourceGuideRadius){return this.structureAnchors(pos.x-radius,pos.z-radius,pos.x+radius,pos.z+radius).map(s=>({...s,distance:Math.hypot(s.x-pos.x,s.y-pos.y,s.z-pos.z)})).filter(s=>s.distance<=radius).sort((a,b)=>a.distance-b.distance||cmp(a.key,b.key));}
 nearestStructure(pos,radius=CFG.worldgen.resourceGuideRadius){return this.structuresNear(pos,radius)[0]||null;}
 rawTerrain(x,y,z,h){if(y<=CFG.bottom)return BID.bedrock;if(y>=CFG.top||y>h)return 0;
  const depth=h-y;
  if(this.caveCarve(x,y,z,depth))return 0;
  const climate=this.climate(x,z),biome=BIOMES[climate.id];
  if(y===h)return h<CFG.sea+2?BID.sand:BID[biome.surface];
  if(depth<=2)return h<CFG.sea+2?BID.sand:BID[biome.soil];
  const vein=(salt,scale=.17)=>noise(x*scale,y*scale*.91,z*scale,this.seed+salt)*.68+noise(x*scale*.47,y*scale*.51,z*scale*.47,this.seed+salt+1)*.32;
  // Resource depth/rarity comes from RESOURCE_DEFS; worldgen and UI never duplicate the bands.
  const profile=biome.resources,resourceSite=depth>=profile.minDepth&&profile.substrate==='stone'&&profile.surface===biome.surface&&biomeRangeContains(climate.heat,profile.climate.heat)&&biomeRangeContains(climate.wet,profile.climate.wet);
  for(let i=RESOURCE_DEFS.length-1;i>=0;i--){const r=RESOURCE_DEFS[i],band=this.oreBand(y,r.min,r.max,r.peak);if(r.substrate===profile.substrate&&band>0&&vein(r.salt,r.scale)>r.threshold-band*r.peakBonus-(resourceSite&&r.id===profile.ore?profile.bonus:0))return BID[r.id];}
  if(y<CFG.bottom+3&&noise(x*.12,0,z*.12,this.seed+543)>.4)return BID.obsidian;
  return BID.stone;
 }
  applyStructures(out,x0,y0,z0,C,structures=this.structureAnchors(x0,z0,x0+C-1,z0+C-1)){
   const inside=(x,y,z)=>x>=x0&&x<x0+C&&y>=y0&&y<y0+C&&z>=z0&&z<z0+C;
   const set=(x,y,z,id)=>{if(!inside(x,y,z)||y<=CFG.bottom||y>=CFG.top)return;out[(x-x0)+C*((y-y0)+C*(z-z0))]=id;};
   const carve=(x,y,z)=>set(x,y,z,0),paint=(x,y,z,id)=>set(x,y,z,id);
   for(const s of structures){
    if(s.type==='mine'){
     if(s.x+18<x0||s.x-18>=x0+C||s.z+18<z0||s.z-18>=z0+C||s.y+4<y0||s.y>=y0+C)continue;
     for(let d=-16;d<=16;d++){
      for(let w=-2;w<=2;w++){
       for(let h=0;h<4;h++){carve(s.x+d,s.y+h,s.z+w);carve(s.x+w,s.y+h,s.z+d);}
       // A mine must have a walkable platform even where natural caves cut under its tunnel.
       paint(s.x+d,s.y-1,s.z+w,BID.planks);paint(s.x+w,s.y-1,s.z+d,BID.planks);
      }
      if(d%6===0){for(let h=1;h<4;h++){paint(s.x+d,s.y+h,s.z-2,BID.planks);paint(s.x+d,s.y+h,s.z+2,BID.planks);paint(s.x-2,s.y+h,s.z+d,BID.planks);paint(s.x+2,s.y+h,s.z+d,BID.planks);}}
     }
     for(const [dx,dz,id]of[[15,0,BID.ironOre],[-15,0,BID.coalOre],[0,15,BID.ironOre],[0,-15,BID.coalOre]])for(let dy=0;dy<2;dy++)for(let w=-1;w<=1;w++)paint(s.x+dx+(dz?w:0),s.y+dy+1,s.z+dz+(dx?w:0),id);
     for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)paint(s.x+dx,s.y-1,s.z+dz,BID.planks);
     paint(s.x,s.y,s.z,BID.lootChest);paint(s.x+2,s.y+1,s.z+2,BID.torch);
     continue;
    }
    const rooms=this.dungeonRooms(s),theme=this.dungeonTheme(s),wall=BID[theme.wall],trim=BID[theme.trim],base=s.y;
    if(base+6<y0||base-2>=y0+C)continue;
    // Geometry and semantic rooms are one deterministic seed-derived definition.
    for(const room of rooms){const r=room.r;if(room.x+r<x0||room.x-r>=x0+C||room.z+r<z0||room.z-r>=z0+C)continue;
     for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)for(let dy=0;dy<=5;dy++){
      const edge=Math.abs(dx)===r||Math.abs(dz)===r;
      if(dy===0)paint(room.x+dx,base,room.z+dz,dx%5===0&&dz%5===0?trim:wall);
      else if(dy===5||edge)paint(room.x+dx,base+dy,room.z+dz,Math.abs(dx)===r&&Math.abs(dz)===r?trim:wall);
      else carve(room.x+dx,base+dy,room.z+dz);
     }
    }
    // Corridor segments are the topology SSOT. Objects never obstruct a path.
    const corridorSegments=[];
    for(let i=0;i<DUNGEON_EDGES.length;i++){
     if(i===6&&s.hash%3!==0)continue;
     const [ia,ib]=DUNGEON_EDGES[i],a=rooms[ia],b=rooms[ib];
     const corner=(s.hash&1)===0?{x:b.x,z:a.z}:{x:a.x,z:b.z};
     corridorSegments.push([a,corner],[corner,b]);
    }
    const onCorridor=(x,z)=>corridorSegments.some(([a,b])=>
     a.x===b.x?Math.abs(x-a.x)<=1&&z>=Math.min(a.z,b.z)&&z<=Math.max(a.z,b.z):
       Math.abs(z-a.z)<=1&&x>=Math.min(a.x,b.x)&&x<=Math.max(a.x,b.x));
    for(const [a,b]of corridorSegments){
     if(Math.max(a.x,b.x)+2<x0||Math.min(a.x,b.x)-2>=x0+C||Math.max(a.z,b.z)+2<z0||Math.min(a.z,b.z)-2>=z0+C)continue;
     const dx=Math.sign(b.x-a.x),dz=Math.sign(b.z-a.z),length=Math.abs(b.x-a.x)+Math.abs(b.z-a.z);
     for(let n=0;n<=length;n++){
      const x=a.x+dx*n,z=a.z+dz*n;
      for(let w=-1;w<=1;w++){
       const px=x+(dz?w:0),pz=z+(dx?w:0);
       for(let dy=1;dy<=4;dy++)carve(px,base+dy,pz);
       paint(px,base,pz,wall);
      }
     }
    }
    // Surface-to-entry graded path: one block ascent per two horizontal cells.
    for(let step=0;step<66;step++){
     const px=rooms[0].x,pz=rooms[0].z-rooms[0].r-step,py=base+1+Math.floor(step/2),surface=this.height(px,pz);
     if(py>surface+2)break;
     if(px+3<x0||px-3>=x0+C||pz+3<z0||pz-3>=z0+C||py+4<y0||py-3>=y0+C)continue;
     for(let dx=-1;dx<=1;dx++){paint(px+dx,py-1,pz,BID.cobble);for(let dy=0;dy<=3;dy++)carve(px+dx,py+dy,pz);}
     if(step%10===0){paint(px-2,py,pz,BID.planks);paint(px-2,py+1,pz,BID.torch);}
    }
    for(const room of rooms){
     const {x,z,role,r}=room;
     const placeSafe=(candidates,id,limit=1)=>{let placed=0;
      for(const [dx,dz]of candidates){if(Math.abs(dx)>=r||Math.abs(dz)>=r||onCorridor(x+dx,z+dz))continue;
       paint(x+dx,base+1,z+dz,id);if(++placed>=limit)break;
      }return placed;
     };
     for(const [dx,dz]of[[-r+1,-r+1],[r-1,-r+1],[-r+1,r-1],[r-1,r-1]]){
      if(!onCorridor(x+dx,z+dz))paint(x+dx,base+4,z+dz,BID.torch);
     }
     if(role==='treasure'||role==='vault'){
      // Keep at least one reachable chest per reward room.
      placeSafe([[2,1],[-2,1],[2,-1],[-2,-1],[0,2],[0,-2],[2,2],[-2,-2]],BID.lootChest);
     }
     if(role==='crystal')placeSafe([[-3,3],[3,-3],[-3,-3],[3,3],[-2,2],[2,-2],[-2,-2],[2,2]],BID.crystalBloom,3);
     if(role==='shrine')placeSafe([[0,2],[-2,2],[2,2],[-2,-2],[2,-2],[0,-2]],BID.crystalBloom);
    }
    for(const [dx,dz,id]of[[-5,-5,BID.goldOre],[5,-5,BID.goldOre],[-5,5,BID.ironOre],[5,5,BID.ironOre]]){
     for(let dy=1;dy<=2;dy++){
      if(!onCorridor(rooms[5].x+dx,rooms[5].z+dz))paint(rooms[5].x+dx,base+dy,rooms[5].z+dz,id);
     }
    }
   }
  }
 generate(cx,cy,cz){const it=this.generateSteps(cx,cy,cz);let r;do{r=it.next();}while(!r.done);return r.value;}
 *generateSteps(cx,cy,cz){const C=CFG.chunk,out=new Uint8Array(C*C*C),x0=cx*C,y0=cy*C,z0=cz*C;
  for(let z=0;z<C;z++){for(let x=0;x<C;x++){const h=this.height(x0+x,z0+z);for(let y=0;y<C;y++)out[x+C*(y+C*z)]=this.rawTerrain(x0+x,y0+y,z0+z,h);}yield;}
  const generatedStructures=this.structureAnchors(x0-8,z0-8,x0+C+8,z0+C+8);this.applyStructures(out,x0,y0,z0,C,generatedStructures);
  const naturalCaves=this.caveAnchors(x0,z0,x0+C-1,z0+C-1);this.applyNaturalCaves(out,x0,y0,z0,C,naturalCaves);yield;
   // Cave floor formations. World-space grid keys keep chunk seams deterministic.
   if(y0<0&&y0+C>CFG.bottom+3){
    for(let gz=Math.floor(z0/5);gz<=Math.floor((z0+C-1)/5);gz++)for(let gx=Math.floor(x0/5);gx<=Math.floor((x0+C-1)/5);gx++){
     const key=hash3(gx,0,gz,this.seed+2991),x=gx*5+key%5,z=gz*5+(key>>>4)%5;
     if(x<x0||x>=x0+C||z<z0||z>=z0+C||key%5!==0||generatedStructures.some(s=>Math.abs(x-s.x)<46&&Math.abs(z-s.z)<47))continue;
     for(let y=Math.max(y0,CFG.bottom+4);y<Math.min(y0+C,-8);y++){
      const j=(x-x0)+C*((y-y0)+C*(z-z0));
      if(out[j]||y<=y0)continue;
      const climate=this.climate(x,z),rule=BIOMES[climate.id].decorations.caveBloom,roll=hash3(x,y,z,this.seed+2993)%10000;
      if(y>=rule.y[0]&&y<=rule.y[1]&&rule.host==='stone'&&biomeRangeContains(climate.heat,rule.climate.heat)&&biomeRangeContains(climate.wet,rule.climate.wet)&&out[j-C]===BID[rule.host]&&roll<Math.floor(rule.chance*10000))out[j]=BID.crystalBloom;
     }
    }
   }
  const write=(x,y,z,id)=>{if(x>=x0&&x<x0+C&&y>=y0&&y<y0+C&&z>=z0&&z<z0+C){const idx=(x-x0)+C*((y-y0)+C*(z-z0));if(!out[idx])out[idx]=id;}};
  for(let gz=Math.floor((z0-4)/7);gz<=Math.floor((z0+C+4)/7);gz++)for(let gx=Math.floor((x0-4)/7);gx<=Math.floor((x0+C+4)/7);gx++){
   const hsh=hash3(gx,0,gz,this.seed+701),tx=gx*7+(hsh%5)+1,tz=gz*7+((hsh>>>4)%5)+1;
   if(Math.hypot(tx,tz)<7||Math.hypot(tx-24,tz+14)<6||generatedStructures.some(s=>Math.hypot(tx-s.x,tz-s.z)<12))continue;
   if(naturalCaves.some(c=>{const dx=tx-c.x,dz=tz-c.z,t=dx*c.dx+dz*c.dz,w=Math.abs(-dx*c.dz+dz*c.dx);return t>=-6&&t<=CFG.worldgen.caveLength+6&&w<7;}))continue;
   const biome=BIOMES[this.climate(tx,tz).id],site=this.vegetationSite(tx,tz,biome);if(!site||hsh%100>=biome.vegetation.density)continue;
   const h=site.height,tall=4+(hsh>>>8)%3,canopy=site.canopy;
   for(let y=h+1;y<=h+tall;y++)write(tx,y,tz,canopy==='cap'?BID.stem:BID.log);
   for(let y=h+tall-1;y<=h+tall+1;y++)for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
    if(Math.abs(dx)+Math.abs(dz)>3-(y===h+tall+1?1:0))continue;
    if(dx===0&&dz===0&&y<h+tall+1)continue;
    write(tx+dx,y,tz+dz,canopy==='cap'?BID.cap:BID.leaves);
   }
  }
  write(24,5,-14,BID.altar);
  const edited=this.editBuckets.get(chunkKey(cx,cy,cz));if(edited)for(const [index,id] of edited)out[index]=id;
  return out;
 }
 indexGeneratedLights(cx,cy,cz,data){const C=CFG.chunk,ck=chunkKey(cx,cy,cz);let bucket=this.lightBuckets.get(ck);if(bucket)for(const key of [...bucket.keys()])if(key.startsWith('base:'))bucket.delete(key);for(let z=0;z<C;z++)for(let y=0;y<C;y++)for(let x=0;x<C;x++){const id=data[x+C*(y+C*z)];if(!BLOCKS[id]?.light)continue;if(!bucket){bucket=new Map();this.lightBuckets.set(ck,bucket);}const wx=cx*C+x,wy=cy*C+y,wz=cz*C+z,key='base:'+blockKey(wx,wy,wz);bucket.set(key,{key,x:wx+.5,y:wy+1,z:wz+.5,id});}if(bucket&&!bucket.size)this.lightBuckets.delete(ck);}
 data(cx,cy,cz){const key=chunkKey(cx,cy,cz);let d=this.chunks.get(key);if(!d){const started=performance.now();d=this.generate(cx,cy,cz);this.chunks.set(key,d);this.indexGeneratedLights(cx,cy,cz,d);METRICS.add('terrain.generate',performance.now()-started);}return d;}
 *dataSteps(cx,cy,cz){const key=chunkKey(cx,cy,cz);let d=this.chunks.get(key);if(!d){d=yield* this.generateSteps(cx,cy,cz);this.chunks.set(key,d);this.indexGeneratedLights(cx,cy,cz,d);}return d;}
 isSolid(id){return id!==0&&BLOCKS[id]?.solid!==false;}
 voxelData(cx,cy,cz){const data=this.data(cx,cy,cz),C=CFG.chunk;let count=0;for(const id of data)if(this.isSolid(id))count++;
  const out=new Int32Array(count*3);let n=0;for(let z=0;z<C;z++)for(let y=0;y<C;y++)for(let x=0;x<C;x++)if(this.isSolid(data[x+C*(y+C*z)])){out[n++]=x;out[n++]=y;out[n++]=z;}return out;}
 boxSolid(min,max){for(let z=Math.floor(min.z);z<=Math.floor(max.z-1e-6);z++)for(let y=Math.floor(min.y);y<=Math.floor(max.y-1e-6);y++)for(let x=Math.floor(min.x);x<=Math.floor(max.x-1e-6);x++)if(this.isSolid(this.get(x,y,z)))return true;return false;}
 changesAfter(serial){if(serial===this.editSerial)return [];if(!this.editJournal.length||serial<this.editJournal[0].serial-1)return null;return this.editJournal.filter(e=>e.serial>serial);}
 lightEntries(pos,radius=15){const out=[],C=CFG.chunk;for(let z=Math.floor((pos.z-radius)/C);z<=Math.floor((pos.z+radius)/C);z++)for(let y=Math.floor((pos.y-radius)/C);y<=Math.floor((pos.y+radius)/C);y++)for(let x=Math.floor((pos.x-radius)/C);x<=Math.floor((pos.x+radius)/C);x++){const bucket=this.lightBuckets.get(chunkKey(x,y,z));if(bucket)for(const light of bucket.values()){const d=sq(light.x-pos.x)+sq(light.y-pos.y)+sq(light.z-pos.z);if(d<radius*radius)out.push({...light,d});}}return out.sort((a,b)=>a.d-b.d||cmp(a.key,b.key));}
 get(x,y,z){x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);if(y<CFG.bottom)return BID.bedrock;if(y>=CFG.top)return 0;const C=CFG.chunk,cx=Math.floor(x/C),cy=Math.floor(y/C),cz=Math.floor(z/C);return this.data(cx,cy,cz)[(x-cx*C)+C*((y-cy*C)+C*(z-cz*C))];}
 set(x,y,z,id){if(![x,y,z,id].every(Number.isInteger)||!BLOCKS[id]||y<=CFG.bottom||y>=CFG.top||Math.abs(x)>8191||Math.abs(z)>8191)return false;
  const old=this.get(x,y,z);if(old===id||old===BID.bedrock||old===BID.altar)return false;
   if(this.isSolid(id)&&this.water.isSource(x,y,z))this.water.source(x,y,z,false);
  const key=blockKey(x,y,z),C=CFG.chunk,cx=Math.floor(x/C),cy=Math.floor(y/C),cz=Math.floor(z/C);this.indexEdit(key,x,y,z,id);this.editSerial++;
  this.data(cx,cy,cz)[x-cx*C+C*(y-cy*C+C*(z-cz*C))]=id;
   const ck=chunkKey(cx,cy,cz),filled=this.isSolid(id);
   if(this.isSolid(old)!==filled){this.physicsRevisions.set(ck,(this.physicsRevisions.get(ck)||0)+1);const change=this.physicsChanges.get(key);if(change){change.filled=filled;if(change.was===filled)this.physicsChanges.delete(key);}else this.physicsChanges.set(key,{key,ck,x,y,z,was:this.isSolid(old),filled});}
   this.editJournal.push({serial:this.editSerial,key,x,y,z,id});if(this.editJournal.length>4096)this.editJournal.splice(0,1024);
  const updates=[[cx,cy,cz]];if(x-cx*C===0)updates.push([cx-1,cy,cz]);if(x-cx*C===C-1)updates.push([cx+1,cy,cz]);if(y-cy*C===0)updates.push([cx,cy-1,cz]);if(y-cy*C===C-1)updates.push([cx,cy+1,cz]);if(z-cz*C===0)updates.push([cx,cy,cz-1]);if(z-cz*C===C-1)updates.push([cx,cy,cz+1]);
  for(const [a,b,c]of updates){const k=chunkKey(a,b,c);this.revisions.set(k,(this.revisions.get(k)||0)+1);this.meshes.delete(k);this.dirty.add(k);}this.water.onBlockEdited(x,y,z);return old;
 }
 ray(origin,dir,max=CFG.reach){const d=V.norm(dir);let x=Math.floor(origin.x),y=Math.floor(origin.y),z=Math.floor(origin.z),distance=0,normal={x:0,y:0,z:0};
  const sx=d.x>=0?1:-1,sy=d.y>=0?1:-1,sz=d.z>=0?1:-1,ddx=Math.abs(1/d.x),ddy=Math.abs(1/d.y),ddz=Math.abs(1/d.z);
  let tx=((sx>0?x+1:x)-origin.x)/d.x,ty=((sy>0?y+1:y)-origin.y)/d.y,tz=((sz>0?z+1:z)-origin.z)/d.z;if(!Number.isFinite(tx))tx=Infinity;if(!Number.isFinite(ty))ty=Infinity;if(!Number.isFinite(tz))tz=Infinity;
  for(let n=0;n<300&&distance<=max;n++){const id=this.get(x,y,z);if(id)return{x,y,z,id,distance,normal,point:V.add(origin,V.scale(d,distance))};if(tx<=ty&&tx<=tz){x+=sx;distance=tx;tx+=ddx;normal={x:-sx,y:0,z:0};}else if(ty<=tz){y+=sy;distance=ty;ty+=ddy;normal={x:0,y:-sy,z:0};}else{z+=sz;distance=tz;tz+=ddz;normal={x:0,y:0,z:-sz};}}return null;
 }
 mesh(cx,cy,cz){const it=this.meshSteps(cx,cy,cz);let result;do{result=it.next();}while(!result.done);return result.value;}
 *meshSteps(cx,cy,cz){const key=chunkKey(cx,cy,cz);let cached=this.meshes.get(key);if(cached)return cached;
  const C=CFG.chunk,origin=[cx*C,cy*C,cz*C],vertices=[],indices=[],colors=[],normals=[],materials=[];
  // Hot path: one padded block volume per meshed chunk. Avoid thousands of
  // get()/Map/string allocations for each face mask cell (6 neighbor planes).
  const P=C+2,padded=new Uint8Array(P*P*P),at=(x,y,z)=>x+P*(y+P*z);
  const inner=yield* this.dataSteps(cx,cy,cz);yield;
   const left=yield* this.dataSteps(cx-1,cy,cz);yield;const right=yield* this.dataSteps(cx+1,cy,cz);yield;
   const below=yield* this.dataSteps(cx,cy-1,cz);yield;const above=yield* this.dataSteps(cx,cy+1,cz);yield;
   const back=yield* this.dataSteps(cx,cy,cz-1);yield;const front=yield* this.dataSteps(cx,cy,cz+1);yield;
  for(let z=0;z<C;z++)for(let y=0;y<C;y++)for(let x=0;x<C;x++){
   const i=x+C*(y+C*z),px=x+1,py=y+1,pz=z+1;
   padded[at(px,py,pz)]=inner[i];
  }
  for(let z=0;z<C;z++)for(let y=0;y<C;y++){
   padded[at(0,y+1,z+1)]=left[C-1+C*(y+C*z)];
   padded[at(C+1,y+1,z+1)]=right[C*(y+C*z)];
  }
  for(let z=0;z<C;z++)for(let x=0;x<C;x++){
   padded[at(x+1,0,z+1)]=below[x+C*(C-1+C*z)];
   padded[at(x+1,C+1,z+1)]=above[x+C*C*z];
  }
  for(let y=0;y<C;y++)for(let x=0;x<C;x++){
   padded[at(x+1,y+1,0)]=back[x+C*(y+C*(C-1))];
   padded[at(x+1,y+1,C+1)]=front[x+C*y];
  }
  const voxel=(x,y,z)=>padded[at(x+1,y+1,z+1)];
  // Greedy face merging, material and direction remain part of the merge key.
  for(let axis=0;axis<3;axis++){
   const u=(axis+1)%3,v=(axis+2)%3,q=[0,0,0];q[axis]=1;const mask=new Int16Array(C*C);
   for(let slice=-1;slice<C;slice++){
    let n=0;for(let j=0;j<C;j++)for(let i=0;i<C;i++){
     const p=[0,0,0];p[axis]=slice;p[u]=i;p[v]=j;const a=voxel(p[0],p[1],p[2]),b=voxel(p[0]+q[0],p[1]+q[1],p[2]+q[2]);
     mask[n++]=a&&b?0:a&&slice>=0?a: b&&slice<C-1?-b:0;
    }
    for(let j=0;j<C;j++)for(let i=0;i<C;){const m=mask[i+j*C];if(!m){i++;continue;}let w=1;while(i+w<C&&mask[i+w+j*C]===m)w++;let h=1,ok=true;while(j+h<C&&ok){for(let k=0;k<w;k++)if(mask[i+k+(j+h)*C]!==m){ok=false;break;}if(ok)h++;}
     const base=[...origin];base[axis]+=slice+1;base[u]+=i;base[v]+=j;const du=[0,0,0],dv=[0,0,0];du[u]=w;dv[v]=h;
     const a=base,b=base.map((x,k)=>x+du[k]),c=base.map((x,k)=>x+du[k]+dv[k]),d=base.map((x,k)=>x+dv[k]);const pts=m>0?[a,b,c,d]:[a,d,c,b];
     const id=Math.abs(m),hex=BLOCKS[id].color,shade=axis===1?(m>0?1:.55):axis===0?.77:.89,col=[parseInt(hex.slice(1,3),16)/255*shade,parseInt(hex.slice(3,5),16)/255*shade,parseInt(hex.slice(5,7),16)/255*shade];const start=vertices.length/3;
     for(const pt of pts){vertices.push(...pt);colors.push(...col);materials.push(id);const normal=[0,0,0];normal[axis]=m>0?1:-1;normals.push(...normal);}indices.push(start,start+1,start+2,start,start+2,start+3);
     for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)mask[i+xx+(j+yy)*C]=0;i+=w;
    }
    yield;
   }
  }
  cached={key,cx,cy,cz,revision:this.revisions.get(key)||0,vertices:new Float32Array(vertices),indices:new Uint32Array(indices),colors:new Float32Array(colors),normals:new Float32Array(normals),materials:new Float32Array(materials)};this.meshes.set(key,cached);return cached;
 }
 indexEdit(key,x,y,z,id){
  // The global edit map is the snapshot SSOT. Chunk buckets are a rebuildable
  // read index, avoiding 4,096 string allocations on every generated chunk.
  this.edits.set(key,id);
  const C=CFG.chunk,cx=Math.floor(x/C),cy=Math.floor(y/C),cz=Math.floor(z/C),ck=chunkKey(cx,cy,cz);
  let bucket=this.editBuckets.get(ck);if(!bucket){bucket=new Map();this.editBuckets.set(ck,bucket);}
  const index=(x-cx*C)+C*((y-cy*C)+C*(z-cz*C));bucket.set(index,id);
   let lights=this.lightBuckets.get(ck);if(lights)lights.delete('base:'+key);if(BLOCKS[id]?.light){if(!lights){lights=new Map();this.lightBuckets.set(ck,lights);}lights.set(key,{key,x:x+.5,y:y+1,z:z+.5,id});}else if(lights){lights.delete(key);if(!lights.size)this.lightBuckets.delete(ck);}
 }
 snapshot(){return [...this.edits.entries()].sort(([a],[b])=>cmp(a,b));}
 static restore(seed,edits){const w=new VoxelWorld(seed);if(!Array.isArray(edits)||edits.length>200000)throw Error('지형 변경 기록 한도');for(const [key,id]of edits){const xyz=key.split(',').map(Number);if(xyz.length!==3||!xyz.every(Number.isInteger)||!BLOCKS[id]||xyz[1]<=CFG.bottom||xyz[1]>=CFG.top)throw Error('잘못된 블록');w.indexEdit(key,xyz[0],xyz[1],xyz[2],id);}return w;}
 prune(positions,renderKeys){if(this.chunks.size<550)return;const keep=renderKeys||new Set();for(const key of this.chunks.keys()){const [cx,cy,cz]=key.split(':').map(Number);if(keep.has(key)||positions.some(p=>Math.abs(cx-Math.floor(p.x/16))<=4&&Math.abs(cz-Math.floor(p.z/16))<=4&&Math.abs(cy-Math.floor(p.y/16))<=3))continue;this.chunks.delete(key);this.meshes.delete(key);}if(this.heights.size>90000)this.heights.clear();}
}



