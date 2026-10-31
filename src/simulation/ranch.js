'use strict';
/* Enclosures for owned units (D-103 ranching, 0.34.0). Pure functions of the voxel grid plus a cache.
 * A unit occupies one cell and moves one block at a time along the four axis directions (Ranch.step): it walks level,
 * climbs one block (with headroom), or steps down up to RANCH_RULES.enclosure.drop blocks. A fence or a closed gate
 * counts as 1.5 blocks high for units (like Minecraft): it is never crossed, climbed or stood on. An open gate is an
 * ordinary open cell.
 * The enclosure of a cell is everything a unit there can reach: a breadth-first fill over those steps inside a box of
 * ±half blocks (33×33, the 32×32 cap) and ±up/down blocks. If the fill tries to leave the box (or passes maxCells) the
 * region is open; otherwise it is a pen (closed) and its cells are exactly where a unit inside can ever walk.
 * Results are cached per start cell and dropped when a terrain edit (VoxelWorld.editJournal) lands inside the box.
 * The cache never changes a result, only its cost, so peers with different query histories stay identical. */
const RANCH_DIRS=Object.freeze([Object.freeze([1,0]),Object.freeze([-1,0]),Object.freeze([0,1]),Object.freeze([0,-1])]);
// Unit yaw for a step direction (atan2(-dx,-dz) of the four axis steps), constants so the grid walk needs no trigonometry.
const RANCH_YAW=Object.freeze({'1,0':-Math.PI/2,'-1,0':Math.PI/2,'0,1':Math.PI,'0,-1':0});
class Ranch {
 constructor(terrain){this.terrain=terrain;this.serial=terrain.editSerial;this.regions=new Map();this.stats={built:0,hits:0,dropped:0};}
 fenceLike(id){return !!BLOCKS[id]?.fence;}
 passable(x,y,z){return !this.terrain.isSolid(this.terrain.get(x,y,z));}
 // An open cell on a solid floor that is not a fence or gate top.
 standable(x,y,z){if(!this.passable(x,y,z))return false;const below=this.terrain.get(x,y-1,z);return this.terrain.isSolid(below)&&!this.fenceLike(below);}
 // The cell one step from (x,y,z) toward (dx,dz), or null.
 step(x,y,z,dx,dz){const t=this.terrain,nx=x+dx,nz=z+dz,id=t.get(nx,y,nz);
  if(t.isSolid(id)){if(this.fenceLike(id)||!this.passable(x,y+1,z)||!this.passable(nx,y+1,nz))return null;return this.standable(nx,y+1,nz)?{x:nx,y:y+1,z:nz}:null;}
  for(let k=0;k<=RANCH_RULES.enclosure.drop;k++){const below=t.get(nx,y-k-1,nz);if(t.isSolid(below))return this.fenceLike(below)?null:{x:nx,y:y-k,z:nz};}
  return null;}
 sync(){const t=this.terrain;if(t.editSerial===this.serial)return;const changes=t.changesAfter(this.serial),E=RANCH_RULES.enclosure;this.serial=t.editSerial;
  if(!changes){this.stats.dropped+=this.regions.size;this.regions.clear();return;}
  for(const [key,r]of this.regions){const {min,max}=r.box;if(changes.some(c=>c.x>=min.x-1&&c.x<=max.x+1&&c.z>=min.z-1&&c.z<=max.z+1&&c.y>=min.y-E.drop-2&&c.y<=max.y+2)){this.regions.delete(key);this.stats.dropped++;}}}
 region(x,y,z){this.sync();const key=blockKey(x,y,z);let r=this.regions.get(key);if(r){this.stats.hits++;return r;}
  r=this.build(x,y,z);this.regions.set(key,r);if(this.regions.size>768)this.regions.delete(this.regions.keys().next().value);return r;}
 build(sx,sy,sz){const E=RANCH_RULES.enclosure,key=blockKey(sx,sy,sz),min={x:sx-E.half,y:sy-E.down,z:sz-E.half},max={x:sx+E.half,y:sy+E.up,z:sz+E.half},cells=new Map(),list=[];let open=false;this.stats.built++;
  if(!this.standable(sx,sy,sz))return{key,cells,list,open:true,box:{min,max},sides:null};
  cells.set(key,{x:sx,y:sy,z:sz});list.push(cells.get(key));
  for(let i=0;i<list.length;i++){const c=list[i];for(const [dx,dz]of RANCH_DIRS){const n=this.step(c.x,c.y,c.z,dx,dz);if(!n)continue;
   if(n.x<min.x||n.x>max.x||n.z<min.z||n.z>max.z||n.y<min.y||n.y>max.y){open=true;continue;}
   const k=blockKey(n.x,n.y,n.z);if(cells.has(k))continue;if(cells.size>=E.maxCells){open=true;continue;}cells.set(k,n);list.push(n);}}
  return{key,cells,list,open,box:{min,max},sides:null};}
 // Blocks beside the region at walking height (the side of a cell, not the floor under it): chests and labor targets.
 sides(r){if(r.sides)return r.sides;const seen=new Map();
  for(const c of r.list)for(const [dx,dz]of RANCH_DIRS){const x=c.x+dx,z=c.z+dz,k=blockKey(x,c.y,z);if(seen.has(k)||r.cells.has(k))continue;const id=this.terrain.get(x,c.y,z);if(id)seen.set(k,{x,y:c.y,z,id,key:k});}
  r.sides=[...seen.values()].sort((a,b)=>cmp(a.key,b.key));return r.sides;}
 // Taking block b out keeps the pen closed: b sits on solid ground and every step out of its cell lands in the region.
 safe(r,b){if(!this.terrain.isSolid(this.terrain.get(b.x,b.y-1,b.z)))return false;
  for(const [dx,dz]of RANCH_DIRS){const n=this.step(b.x,b.y,b.z,dx,dz);if(n&&!(n.x===b.x&&n.y===b.y&&n.z===b.z)&&!r.cells.has(blockKey(n.x,n.y,n.z)))return false;}return true;}
 // Shortest walk from `from` to the first region cell passing `test`, as the list of cells after `from`; [] when `from`
 // passes, null when nothing reachable passes. Breadth first in RANCH_DIRS order, so ties are deterministic.
 path(r,from,test){const start=blockKey(from.x,from.y,from.z);if(test(from))return[];const prev=new Map([[start,null]]),queue=[from];
  for(let i=0;i<queue.length;i++){const c=queue[i];for(const [dx,dz]of RANCH_DIRS){const n=this.step(c.x,c.y,c.z,dx,dz);if(!n)continue;const k=blockKey(n.x,n.y,n.z);if(prev.has(k)||!r.cells.has(k))continue;prev.set(k,c);
   if(test(n)){const out=[n];for(let p=c;p&&blockKey(p.x,p.y,p.z)!==start;p=prev.get(blockKey(p.x,p.y,p.z)))out.unshift(p);return out;}queue.push(n);}}
  return null;}
}
