// Page-side READ-ONLY helpers for the playthrough E2E (installed with page.addInitScript). They read terrain and actor
// state to plan routes and find blocks, exactly what a player sees on screen; they never write game state. Inputs are sent
// by the test through Playwright's real keyboard and mouse.
export const PLAYTHROUGH_HELPERS=`
window.__PT=(()=>{
 const T=()=>Bloom.app.sim.terrain,B=id=>Bloom.BLOCKS[id];
 const solid=(x,y,z)=>T().isSolid(T().get(x,y,z)),wet=(x,y,z)=>T().water.level(x,y,z)>0;
 const fence=(x,y,z)=>!!B(T().get(x,y,z))?.fence;
 // A cell the player can dig: finite hardness, minable with the given pick tier, not a fence/station/egg/chest.
 const diggable=(x,y,z,tier)=>{const id=T().get(x,y,z),b=B(id);if(!id)return true;if(!Number.isFinite(b.hardness)||b.fence||b.station||b.egg||b.gate)return false;if(b.tier>0&&(b.tool!=='pick'||tier<b.tier))return false;return true;};
 const clear=(x,y,z)=>!solid(x,y,z);
 const stand=(x,y,z)=>clear(x,y,z)&&clear(x,y+1,z)&&solid(x,y-1,z)&&!fence(x,y-1,z)&&!wet(x,y+1,z);// wading (feet in water) is allowed
 const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
 // Route over standing cells. Walk moves: level, one up (headroom), down up to 3. With dig>0 also: a level/up/down-1 step
 // that needs solid cells cleared (each costs dig + hardness), and digging straight down. Returns
 // [{x,y,z,dig:[cells]}] from the first step to the goal cell, or null. goal: {x,z,r,y?,dy?}.
 function route(from,goal,opt={}){const avoid=new Set((opt.avoid||[]).map(c=>c.x+','+c.y+','+c.z)),tier=opt.tier||0,dig=opt.dig||0,max=opt.max||30000,key=(x,y,z)=>x+','+y+','+z;
  const ok=(c)=>{const dx=c.x+.5-goal.x,dz=c.z+.5-goal.z;return dx*dx+dz*dz<=goal.r*goal.r&&(goal.y===undefined||Math.abs(c.y-goal.y)<=(goal.dy??1));};
  const h=c=>Math.max(0,Math.abs(c.x+.5-goal.x)+Math.abs(c.z+.5-goal.z)-goal.r)+(goal.y===undefined?0:Math.max(0,Math.abs(c.y-goal.y)-(goal.dy??1)));
  const roofed=(x,y,z)=>{for(let k=2;k<8;k++)if(solid(x,y+k,z))return true;return false;},caveCost=opt.caveCost||0;
  const hard=(x,y,z)=>{const id=T().get(x,y,z);return id?B(id).hardness/400:0;};
  const open=new Map(),heap=[];let n=0,seq=0;const less=(a,b)=>a.f<b.f||a.f===b.f&&a.seq<b.seq;
  const push=s=>{heap.push(s);let i=heap.length-1;while(i>0){const q=(i-1)>>1;if(!less(heap[i],heap[q]))break;[heap[i],heap[q]]=[heap[q],heap[i]];i=q;}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<heap.length&&less(heap[l],heap[m]))m=l;if(r<heap.length&&less(heap[r],heap[m]))m=r;if(m===i)break;[heap[i],heap[m]]=[heap[m],heap[i]];i=m;}}return top;};
  const start={x:from.x,y:from.y,z:from.z,g:0,seq:0,parent:null,dig:[]};start.f=h(start);push(start);open.set(key(start.x,start.y,start.z),start);
  const done=new Set();
  while(heap.length&&n<max){const c=pop(),k=key(c.x,c.y,c.z);if(done.has(k))continue;done.add(k);n++;
   if(ok(c)){const out=[];for(let s=c;s.parent;s=s.parent)out.push({x:s.x,y:s.y,z:s.z,dig:s.dig,wet:wet(s.x,s.y,s.z)});return out.reverse();}
   const next=[];
   for(const [dx,dz]of DIRS){const nx=c.x+dx,nz=c.z+dz;
    // pure walking
    if(!solid(nx,c.y,nz)||!solid(nx,c.y+1,nz)){
     if(stand(nx,c.y,nz))next.push({x:nx,y:c.y,z:nz,cost:1,dig:[]});
     else if(solid(nx,c.y,nz)&&!fence(nx,c.y,nz)&&stand(nx,c.y+1,nz)&&clear(c.x,c.y+2,c.z)&&clear(c.x,c.y+3,c.z))next.push({x:nx,y:c.y+1,z:nz,cost:1.5,dig:[]});
     else if(clear(nx,c.y,nz)&&clear(nx,c.y+1,nz))for(let k=1;k<=3;k++){if(!clear(nx,c.y-k,nz))break;if(stand(nx,c.y-k,nz)){next.push({x:nx,y:c.y-k,z:nz,cost:1+k*.3,dig:[]});break;}}}
    if(!dig)continue;
    // digging: level, up one, down one
    // (a step down also clears the cell two above the new head room, so the stair can be walked back up: a step-up needs
    // y+2 and y+3 free over the lower cell; no upward digging: the cell over the head is only clickable through the cave cutaway layer; a dug staircase down is
    // walked back up without digging)
    for(const [dy,cells]of [[0,[[nx,c.y,nz],[nx,c.y+1,nz]]],[-1,[[nx,c.y+1,nz],[nx,c.y+2,nz],[nx,c.y,nz],[nx,c.y-1,nz]]]]){
     const ny=c.y+dy;if(!solid(nx,ny-1,nz)||fence(nx,ny-1,nz)||wet(nx,ny,nz)||wet(nx,ny+1,nz))continue;const need=cells.filter(p=>solid(...p));if(!need.length)continue;
     if(need.some(p=>!diggable(...p,tier)||avoid.has(p.join(',')))||need.some(p=>[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]].some(([a,b,e])=>wet(p[0]+a,p[1]+b,p[2]+e))))continue;
     next.push({x:nx,y:ny,z:nz,cost:1+need.reduce((s,p)=>s+dig+hard(...p),0),dig:need.map(p=>({x:p[0],y:p[1],z:p[2]}))});}}
   // (no straight-down digging: the block under the feet is inside the line-of-sight fade and cannot be clicked)
   for(const s of next){const k2=key(s.x,s.y,s.z);if(done.has(k2)||avoid.has(k2))continue;/* a cell the walk got stuck on */const g=c.g+s.cost+(wet(s.x,s.y,s.z)?10:0)+(caveCost&&!s.dig.length&&roofed(s.x,s.y,s.z)?caveCost:0),old=open.get(k2);if(old&&old.g<=g)continue;const m={x:s.x,y:s.y,z:s.z,g,seq:++seq,parent:c,dig:s.dig};m.f=g+h(m);open.set(k2,m);push(m);}}
  return null;}
 // Nearest exposed blocks of the given ids within radius of p (an open neighbour), by distance.
 function find(ids,p,radius=40,opt={}){const t=T(),want=new Set(ids.map(i=>Bloom.BID[i])),out=[],cx=Math.floor(p.x),cy=Math.floor(p.y),cz=Math.floor(p.z),ry=opt.ry??radius;
  for(let x=cx-radius;x<=cx+radius;x++)for(let z=cz-radius;z<=cz+radius;z++)for(let y=Math.max(Bloom.CFG.bottom,cy-ry);y<=Math.min(40,cy+ry);y++){if(!want.has(t.get(x,y,z)))continue;
   if(!opt.buried&&![[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(([a,b,c])=>!solid(x+a,y+b,z+c)))continue;out.push({x,y,z,id:B(t.get(x,y,z)).id,d:Math.hypot(x+.5-p.x,y+.5-p.y,z+.5-p.z)});}
  return out.sort((a,b)=>a.d-b.d).slice(0,opt.limit||40);}
 const feet=()=>{const a=Bloom.app.actor();return{x:Math.floor(a.pos.x),y:Math.floor(a.pos.y+.125),z:Math.floor(a.pos.z)};};
 // Screen point of any visible open face of block b (the game's own pick confirms it).
 function face(b){for(const n of [{x:0,y:1,z:0},{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1},{x:0,y:-1,z:0}]){if(solid(b.x+n.x,b.y+n.y,b.z+n.z))continue;const s=window.__faceScreen(b,n);if(s)return{...s,n};}return null;}
 return{solid,stand,route,find,feet,face,diggable};
})();
`;
