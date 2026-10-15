/* Rapier is mandatory and owns all collision, gravity and dynamic integration. */
class Physics {
 constructor(R,terrain){this.R=R;this.terrain=terrain;this.world=new R.World({x:0,y:-CFG.player.gravity,z:0});this.world.timestep=CFG.stepMs/1000;this.events=new R.EventQueue(true);this.loaded=new Map();this.tags=new Map();this.bodyCount=0;this.lastPrefetchTick=-1;this.stats={built:0,updated:0,combined:0,relinked:0};}
 neighbors(key){const [x,y,z]=key.split(':').map(Number),out=[];for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy||dz)out.push(chunkKey(x+dx,y+dy,z+dz));return out.sort(cmp);}
 chunkCollider(key){const e=this.loaded.get(key);return e?.handle!=null?this.world.getCollider(e.handle):null;}
 loadTerrain(key,until=0){if(this.loaded.has(key))return false;const started=performance.now(),xyz=key.split(':').map(Number),data=this.terrain.voxelData(...xyz);let handle=null;
  if(data.length){const col=this.world.createCollider(this.R.ColliderDesc.voxels(data,{x:1,y:1,z:1}).setTranslation(...xyz.map(v=>v*CFG.chunk)).setFriction(.7).setRestitution(0));handle=col.handle;this.tags.set(handle,{type:'terrain',key});}
  this.loaded.set(key,{handle,revision:this.terrain.physicsRevisions.get(key)||0,count:data.length/3,until});this.stats.built++;METRICS.add('terrain.colliderCreate',performance.now()-started);return true;
 }
 combineTerrain(changed){if(!changed.size)return;const C=CFG.chunk,pairs=new Map();
  // Visit only changed chunks and their neighbors, not every active chunk.
  for(const key of [...changed].sort(cmp))for(const other of this.neighbors(key)){const [a,b]=cmp(key,other)<0?[key,other]:[other,key];pairs.set(a+'|'+b,[a,b]);}
  const ordered=[...pairs.values()].sort((a,b)=>cmp(a[0],b[0])||cmp(a[1],b[1]));
  for(const [key,other]of ordered){const a=this.chunkCollider(key),b=this.chunkCollider(other);if(!a||!b)continue;const [x,y,z]=key.split(':').map(Number),[ox,oy,oz]=other.split(':').map(Number);a.combineVoxelStates(b,(ox-x)*C,(oy-y)*C,(oz-z)*C);this.stats.combined++;}
 }
 boundaryNeighbors(key,lx,ly,lz){const C=CFG.chunk,[x,y,z]=key.split(':').map(Number),out=[];
  for(const dz of [0,...(lz===0?[-1]:lz===C-1?[1]:[])])for(const dy of [0,...(ly===0?[-1]:ly===C-1?[1]:[])])for(const dx of [0,...(lx===0?[-1]:lx===C-1?[1]:[])])if(dx||dy||dz)out.push(chunkKey(x+dx,y+dy,z+dz));return out.sort(cmp);
 }
 resetTerrainBoundaries(keys){const changed=new Set();for(const key of [...keys].sort(cmp)){const col=this.chunkCollider(key);if(!col)continue;const data=this.terrain.voxelData(...key.split(':').map(Number));if(!data.length)continue;col.setShape(new this.R.Voxels(data,{x:1,y:1,z:1}));const entry=this.loaded.get(key);entry.count=data.length/3;entry.revision=this.terrain.physicsRevisions.get(key)||0;this.stats.relinked++;changed.add(key);}return changed;}
 detachTerrain(key,affected){const e=this.loaded.get(key);if(!e)return;if(e.handle!=null){const c=this.world.getCollider(e.handle);if(c)this.world.removeCollider(c,true);this.tags.delete(e.handle);for(const n of this.neighbors(key))if(this.loaded.has(n))affected.add(n);}this.loaded.delete(key);}
 removeTerrain(key){const affected=new Set();this.detachTerrain(key,affected);this.combineTerrain(this.resetTerrainBoundaries(affected));}
 activeTerrain(actors,drops=[],shots=[]){const required=new Set(),predictive=new Set(),C=CFG.chunk,dt=CFG.stepMs/1000;
  const bounds=(set,p,v,horizon,radius,height,margin,gravityScale=1)=>{const gravity=CFG.player.gravity*gravityScale,end={x:p.x+v.x*horizon,y:p.y+v.y*horizon-gravity*horizon*horizon*.5,z:p.z+v.z*horizon};
   const apexTime=gravity>0?clamp(v.y/gravity,0,horizon):0,apex=p.y+v.y*apexTime-gravity*apexTime*apexTime*.5;
   const lo={x:Math.min(p.x,end.x)-radius-margin,y:Math.min(p.y,end.y,apex)-margin,z:Math.min(p.z,end.z)-radius-margin},hi={x:Math.max(p.x,end.x)+radius+margin,y:Math.max(p.y,end.y,apex)+height+margin,z:Math.max(p.z,end.z)+radius+margin};
   for(let z=Math.floor(lo.z/C);z<=Math.floor(hi.z/C);z++)for(let y=Math.max(Math.floor(CFG.bottom/C),Math.floor(lo.y/C));y<=Math.min(Math.ceil(CFG.top/C)-1,Math.floor(hi.y/C));y++)for(let x=Math.floor(lo.x/C);x<=Math.floor(hi.x/C);x++)set.add(chunkKey(x,y,z));};
  for(const a of actors){if(a.dead||a.suspended)continue;const body=a.body!=null?this.world.getRigidBody(a.body):null;const scale=a.scale||1,r=CFG.player.radius*scale,h=2*(CFG.player.radius+CFG.player.halfHeight)*scale,v=body?body.linvel():a.velocity||{x:0,y:0,z:0};
   bounds(required,a.pos,v,dt,r,h,a.enemy?CFG.terrain.margin:Math.max(CFG.terrain.margin,CFG.reach));bounds(predictive,a.pos,v,CFG.terrain.predictSeconds,r,h,CFG.terrain.margin+1);}
  for(const e of [...drops,...shots]){const b=this.world.getRigidBody(e.body),v=b?b.linvel():e.velocity||{x:0,y:0,z:0},r=e.radius||(e.type==='shot'?.11:.16),p={x:e.pos.x,y:e.pos.y-r,z:e.pos.z};const gravityScale=b?.gravityScale?.()??(e.type==='shot'?.2:1);bounds(required,p,v,dt,r,r*2,CFG.terrain.margin,gravityScale);if(e.type==='shot'||b&&!b.isSleeping())bounds(predictive,p,v,CFG.terrain.predictSeconds*.5,r,r*2,.5,gravityScale);}
  for(const k of required)predictive.delete(k);return{required:[...required].sort(cmp),predictive:[...predictive].sort(cmp)};
 }
 syncTerrain(actors,drops=[],shots=[],tick=0,prefetch=true){const started=performance.now();this.flushTerrainChanges();const sets=this.activeTerrain(actors,drops,shots),want=new Set([...sets.required,...sets.predictive]),reset=new Set(),changed=new Set();
  for(const key of [...this.loaded.keys()].sort(cmp)){const e=this.loaded.get(key);if(want.has(key))e.until=tick+CFG.terrain.retireTicks;else if(tick>=e.until)this.detachTerrain(key,reset);}
  for(const key of sets.required)if(this.loadTerrain(key,tick+CFG.terrain.retireTicks))changed.add(key);
  if(prefetch&&this.lastPrefetchTick!==tick){this.lastPrefetchTick=tick;let n=0;for(const key of sets.predictive)if(!this.loaded.has(key)&&n<CFG.terrain.prefetchPerTick){this.loadTerrain(key,tick+CFG.terrain.retireTicks);changed.add(key);n++;}}
  for(const k of this.resetTerrainBoundaries(reset))changed.add(k);this.combineTerrain(changed);METRICS.add('terrain.sync',performance.now()-started);
 }
 flushTerrainChanges(){const changes=this.terrain.physicsChanges;if(!changes.size)return;const started=performance.now(),reset=new Set(),created=new Set(),wake=[],groups=new Map(),propagate=[];
  for(const change of changes.values()){let batch=groups.get(change.ck);if(!batch){batch=[];groups.set(change.ck,batch);}batch.push(change);}
  // A chunk is committed as one batch. A freshly loaded/rebuilt collider already
  // contains its final occupancy; never apply the queued deltas a second time.
  for(const key of [...groups.keys()].sort(cmp)){const batch=groups.get(key).sort((a,b)=>cmp(a.key,b.key)),entry=this.loaded.get(key);if(!entry)continue;
   const revision=this.terrain.physicsRevisions.get(key)||0;for(const q of batch)wake.push(q);if(entry.revision===revision)continue;
   const col=this.chunkCollider(key),count=entry.count+batch.reduce((n,q)=>n+(q.filled?1:-1),0),until=entry.until;
   if(count<0||count>CFG.chunk**3)throw Error('복셀 점유 수 불일치: '+key);
   if(count===0){this.detachTerrain(key,reset);this.loaded.set(key,{handle:null,count:0,until,revision});continue;}
   if(!col){this.loaded.delete(key);this.loadTerrain(key,until);created.add(key);continue;}
   const C=CFG.chunk,[cx,cy,cz]=key.split(':').map(Number);
   for(const q of batch){const lx=q.x-cx*C,ly=q.y-cy*C,lz=q.z-cz*C;col.setVoxel(lx,ly,lz,q.filled);this.stats.updated++;propagate.push({key,lx,ly,lz,cx,cy,cz});}
   entry.count=count;entry.revision=revision;
  }
  // Reset removed-neighbor topology against final block data, then reconnect.
  for(const key of this.resetTerrainBoundaries(reset))created.add(key);
  const C=CFG.chunk;for(const q of propagate){const col=this.chunkCollider(q.key);if(!col)continue;for(const key of this.boundaryNeighbors(q.key,q.lx,q.ly,q.lz)){const neighbor=this.chunkCollider(key);if(!neighbor)continue;const [x,y,z]=key.split(':').map(Number);col.propagateVoxelChange(neighbor,q.lx,q.ly,q.lz,(x-q.cx)*C,(y-q.cy)*C,(z-q.cz)*C);}}
  this.combineTerrain(created);changes.clear();
  if(wake.length)this.world.forEachRigidBody(b=>{if(!b.isDynamic()||!b.isSleeping())return;const p=b.translation();for(const q of wake)if(Math.abs(p.x-q.x-.5)<2&&Math.abs(p.y-q.y-.5)<4&&Math.abs(p.z-q.z-.5)<2){b.wakeUp();break;}});
  METRICS.add('terrain.edit',performance.now()-started);
 }
 addActor(actor){const R=this.R,scale=actor.scale||1,rad=CFG.player.radius*scale,half=CFG.player.halfHeight*scale+rad,offset=half;
  const body=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(actor.pos.x,actor.pos.y+offset,actor.pos.z).lockRotations().setCcdEnabled(true).setCanSleep(false));
  // Rapier defaults to Average: actor friction 0 + wall friction .7 => effective .35.
  // Min gives zero only for contacts with actors; terrain and drops keep friction.
  const col=this.world.createCollider(R.ColliderDesc.cuboid(rad,half,rad).setDensity(actor.boss?6:1.5).setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0),body);
  actor.body=body.handle;actor.collider=col.handle;actor.offset=offset;this.tags.set(col.handle,{type:'actor',id:actor.id});this.bodyCount++;
 }
 removeBody(entity){const body=this.world.getRigidBody(entity.body);if(body)this.world.removeRigidBody(body);this.tags.delete(entity.collider);this.bodyCount--;}
 addBall(entity,radius,velocity,gravity=1){const R=this.R;const body=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(entity.pos.x,entity.pos.y,entity.pos.z).setLinvel(velocity.x,velocity.y,velocity.z).setCcdEnabled(true).setGravityScale(gravity));
  const col=this.world.createCollider(R.ColliderDesc.ball(radius).setRestitution(entity.type==='drop'?.15:0).setFriction(.6).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),body);entity.previous={...entity.pos};entity.radius=radius;entity.velocity={...velocity};entity.body=body.handle;entity.collider=col.handle;this.tags.set(col.handle,{type:entity.type,id:entity.id});this.bodyCount++;
 }
 ground(actor,position=actor.pos,gap=CFG.movement.groundGap,footSupport=false){const body=this.world.getRigidBody(actor.body);if(!body)return null;const r=Math.max(.05,CFG.player.radius*(actor.scale||1)-CFG.movement.footInset),C=CFG.chunk;
  const positions=[[0,0],[-r,-r],[r,-r],[-r,r],[r,r]],keys=new Set();for(const [x,z]of positions){const cx=Math.floor((position.x+x)/C),cz=Math.floor((position.z+z)/C);for(let cy=Math.floor((position.y-gap)/C);cy<=Math.floor((position.y+actor.offset)/C);cy++)keys.add(chunkKey(cx,cy,cz));}
  const colliders=[...[...keys].sort(cmp).map(k=>this.chunkCollider(k)).filter(Boolean)];for(const [h,t]of this.tags)if(t.type==='actor'&&t.id!==actor.id){const c=this.world.getCollider(h);if(c)colliders.push(c);}
  let best=null;for(const [dx,dz]of positions){const ray=new this.R.Ray({x:position.x+dx,y:position.y+actor.offset,z:position.z+dz},{x:0,y:-1,z:0});for(const col of colliders){const hit=col.castRayAndGetNormal(ray,actor.offset+gap,true);if(!hit||hit.normal.y<=.45)continue;
    if(footSupport&&(hit.timeOfImpact<actor.offset-CFG.movement.footPenetration||hit.timeOfImpact>actor.offset+gap))continue;
    if(!best||hit.timeOfImpact<best.timeOfImpact)best=hit;}}
  return best;
 }
 autoJump(actor,move){const t=this.terrain,unit=V.norm({x:move.x,y:0,z:move.z}),r=CFG.player.radius*(actor.scale||1),p=actor.pos,look=CFG.movement.autoJumpLook,feet=Math.floor(p.y+.12),height=actor.offset*2;
  // A full footprint, not one central voxel: don't hop into diagonal corners or ceilings.
  const next={x:p.x+unit.x*look,y:p.y,z:p.z+unit.z*look},min={x:next.x-r+.01,y:feet+.01,z:next.z-r+.01},max={x:next.x+r-.01,y:feet+1-.01,z:next.z+r-.01};
  if(!t.boxSolid(min,max))return false;
  if(t.boxSolid({...min,y:feet+1+.01},{...max,y:feet+1+height+CFG.movement.ceilingGap}))return false;
  const rise=CFG.player.jump*CFG.player.jump/(2*CFG.player.gravity)+.03;
  for(const f of [0,.5,1]){const x=lerp(p.x,next.x,f),z=lerp(p.z,next.z,f);if(t.boxSolid({x:x-r+.01,y:p.y+height+.01,z:z-r+.01},{x:x+r-.01,y:p.y+height+rise,z:z+r-.01}))return false;}
  return true;
 }
 bankAhead(actor,move){const length=Math.hypot(move.x,move.z);if(length<.3)return false;
  const dir={x:move.x/length,z:move.z/length},r=CFG.player.radius*(actor.scale||1),pos=actor.pos;
  const cx=pos.x+dir.x*(r+.27),cz=pos.z+dir.z*(r+.27),floor=Math.floor(pos.y),t=this.terrain;
  // Only a one-voxel bank, with clearance for the entire cuboid. A wall two
  // voxels high or a ceiling never gains swimming climb impulse.
  const min={x:cx-r*.75,y:floor+.02,z:cz-r*.75},max={x:cx+r*.75,y:floor+.90,z:cz+r*.75};
  if(!t.boxSolid(min,max))return false;
  const h=actor.offset*2;
  return !t.boxSolid({...min,y:floor+1.03},{...max,y:floor+1+h+.06});
 }
 control(actor,move,speed,jump=false,allowAutoJump=true,swimRise=false,swimDive=false){const b=this.world.getRigidBody(actor.body);if(!b)return;
  if(actor.suspended||actor.dead){b.setLinvel({x:0,y:0,z:0},true);return;}
  const vel=b.linvel(),dt=CFG.stepMs/1000,m=b.mass(),fluid=this.terrain.water.bodyState(actor.pos,CFG.player.eyeHeight,CFG.player.radius*(actor.scale||1));
  actor.swim={...fluid,inWater:fluid.inWater};
  // The avatar may still overlap water by its feet when its head/body has
  // already crossed the swim-state threshold. Keep the bank assist active
  // through this narrow contact band, without converting a dry jump to swim.
  const bank=fluid.depth>.001&&!swimDive&&this.bankAhead(actor,move);
  if((fluid.inWater||bank)&&actor.combat.state!=='roll'){
   const max=CFG.player.acceleration*dt,swimSpeed=actor.sprinting?CFG.water.sprintSpeed:CFG.water.swimSpeed;
   const targetX=move.x*swimSpeed+fluid.flow.x*.7,targetZ=move.z*swimSpeed+fluid.flow.z*.7;
   const dx=clamp(targetX-vel.x,-max,max),dz=clamp(targetZ-vel.z,-max,max);
   const surfaceError=fluid.surface-(actor.pos.y+.85);
   const targetY=swimDive?CFG.water.diveSpeed:swimRise||jump?CFG.water.riseSpeed:bank?CFG.movement.bankRiseSpeed:clamp(surfaceError*.8,-.7,.75);
   // A bank is a real solid lip, not a water-surface floor. Accelerate upward
   // enough to clear it before the feet leave the last water voxel; normal
   // swimming still uses smooth buoyancy without an extra jump.
   const lift=bank?Math.max(CFG.player.gravity*dt*fluid.immersion,(targetY-vel.y)*(1-Math.pow(.05,dt/.025))):CFG.player.gravity*dt*fluid.immersion+(targetY-vel.y)*Math.min(.34,dt*9);
   b.applyImpulse({x:dx*m,y:lift*m,z:dz*m},true);actor.grounded=false;return;
  }
  const max=(actor.knock>0?CFG.combat.knockback.drag:actor.combat.state==='roll'?70:CFG.player.acceleration)*dt,d={x:clamp(move.x*speed-vel.x,-max,max),y:0,z:clamp(move.z*speed-vel.z,-max,max)};
  b.applyImpulse({x:d.x*m,y:0,z:d.z*m},true);const ground=this.ground(actor,actor.pos,CFG.movement.groundGap,true);actor.grounded=!!ground&&vel.y<2;
  const autoStep=allowAutoJump&&!jump&&!actor.enemy&&actor.combat.state!=='roll'&&actor.grounded&&actor.knock<=0&&Math.hypot(move.x,move.z)>.35&&this.autoJump(actor,move);
  if((jump||autoStep)&&actor.grounded){const vertical=autoStep?Math.sqrt(2*CFG.player.gravity*CFG.movement.autoStepRise):CFG.player.jump;
   b.applyImpulse({x:0,y:(vertical-vel.y)*m,z:0},true);actor.grounded=false;}
 }
 impulse(actor,dir,power,profile=null){const b=this.world.getRigidBody(actor.body);if(!b)return;
  const velocity=b.linvel(),mass=b.mass(),limit=CFG.combat.knockback.maxSpeed,nx=velocity.x+dir.x*power,nz=velocity.z+dir.z*power,ratio=Math.min(1,limit/Math.max(.001,Math.hypot(nx,nz))),lift=profile?.lift??Math.max(.6,dir.y*power);
  // J = mass * delta-v. Preserve gravity and cap chained lateral impacts, never teleport.
  b.applyImpulse({x:(nx*ratio-velocity.x)*mass,y:Math.max(0,lift-velocity.y)*mass,z:(nz*ratio-velocity.z)*mass},true);
  actor.knock=Math.max(actor.knock||0,profile?.duration??CFG.combat.knockback.duration);
 }
 teleport(actor,pos){const b=this.world.getRigidBody(actor.body);if(!b)return;b.setTranslation({x:pos.x,y:pos.y+actor.offset,z:pos.z},true);b.setLinvel({x:0,y:0,z:0},true);actor.pos={...pos};actor.previous={...pos};actor.velocity={x:0,y:0,z:0};actor.grounded=false;actor.motion=motionState();this.world.propagateModifiedBodyPositionsToColliders();}
 step(sim){this.flushTerrainChanges();const started=performance.now();for(const shot of Object.values(sim.projectiles)){const body=this.world.getRigidBody(shot.body);if(body)shot.flightVelocity={...body.linvel()};}for(const drop of Object.values(sim.drops)){const body=this.world.getRigidBody(drop.body);if(!body)continue;const water=this.terrain.water.bodyState({x:drop.pos.x,y:drop.pos.y-.1,z:drop.pos.z},.3);if(water.inWater){const vel=body.linvel(),mass=body.mass();body.applyImpulse({x:water.flow.x*1.2*CFG.stepMs/1000*mass,y:(CFG.player.gravity*CFG.stepMs/1000*.95+(.75-vel.y)*(1-Math.pow(.82,CFG.stepMs/25)))*mass,z:water.flow.z*1.2*CFG.stepMs/1000*mass},true);}}this.world.step(this.events);METRICS.add('physics.step',performance.now()-started);
  for(const a of Object.values(sim.actors)){const b=this.world.getRigidBody(a.body);if(!b)continue;const before=a.pos,prevY=a.velocity.y,p=b.translation();a.pos={x:p.x,y:p.y-a.offset,z:p.z};a.velocity={...b.linvel()};
   if(a.dead||a.suspended)continue;const m=a.motion||(a.motion=motionState()),dt=CFG.stepMs,ground=this.ground(a,a.pos,CFG.movement.groundGap,true),grounded=!!ground&&Math.abs(a.velocity.y)<.8,speed=Math.hypot(a.velocity.x,a.velocity.z);
   m.land=Math.max(0,m.land-dt);m.brake=Math.max(0,m.brake-dt);
   if(grounded&&!m.grounded&&m.air>=50){m.land=ANIMATION.land;m.impact=Math.abs(prevY);sim.emit('land',a,{power:Math.min(1,m.impact/8),rolling:a.combat.state==='roll'});}
   if(grounded&&m.speed>1&&speed<.35&&a.combat.state==='idle')m.brake=ANIMATION.brake;
   if(grounded&&a.combat.state!=='roll'&&a.knock<=0)m.distance=qf(m.distance+Math.min(1.5,Math.hypot(a.pos.x-before.x,a.pos.z-before.z)));
   m.air=grounded?0:m.air+dt;m.grounded=grounded;m.speed=speed;a.grounded=grounded;if(grounded)a.combat.airRollUsed=false;a.swim=this.terrain.water.bodyState(a.pos,CFG.player.eyeHeight,CFG.player.radius*(a.scale||1));
  }
  for(const e of [...Object.values(sim.drops),...Object.values(sim.projectiles),...sim.companions.bodies()]){const b=this.world.getRigidBody(e.body);if(b){e.pos={...b.translation()};e.velocity={...b.linvel()};}}
  const hits=[];this.events.drainCollisionEvents((h1,h2,started)=>{if(started)hits.push([h1,h2]);});
  hits.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);for(const [h1,h2]of hits){const a=this.tags.get(h1),b=this.tags.get(h2);if(a?.type==='shot')sim.projectileContact(a.id,b);if(b?.type==='shot')sim.projectileContact(b.id,a);}
 }
 sight(from,to,excludeActor=null){const delta=V.sub(to,from),length=V.len(delta);if(length<.001)return true;
  const hit=this.terrain.ray(from,V.scale(delta,1/length),length);return !hit||hit.distance>=length-.03;
 }
 /** Terrain support only: a wall or another actor is not a landing. */
 ballSupport(shot){const r=shot.radius||.29,C=CFG.chunk,ray=new this.R.Ray(shot.pos,{x:0,y:-1,z:0});let support=null;
  for(let x=Math.floor((shot.pos.x-r)/C);x<=Math.floor((shot.pos.x+r)/C);x++)for(let z=Math.floor((shot.pos.z-r)/C);z<=Math.floor((shot.pos.z+r)/C);z++)for(let y=Math.floor((shot.pos.y-r-.12)/C);y<=Math.floor(shot.pos.y/C);y++){
   const col=this.chunkCollider(chunkKey(x,y,z)),hit=col?.castRayAndGetNormal(ray,r+.12,true);if(!hit||hit.timeOfImpact<r*.35||hit.normal.y<=.45||Math.abs(V.dot(shot.velocity,hit.normal))>1.2)continue;
   if(!support||hit.timeOfImpact<support.distance)support={distance:hit.timeOfImpact,normal:{...hit.normal},point:V.add(shot.pos,{x:0,y:-hit.timeOfImpact,z:0})};}
  return support;
 }
 /** Closest active *other* actor under the camera-aligned aim ray. */
 aimEnemy(actor,reach){const eye=V.add(actor.pos,{x:0,y:CFG.player.eyeHeight,z:0}),ray=new this.R.Ray(eye,actor.facing),wall=this.terrain.ray(eye,actor.facing,reach),limit=wall?wall.distance:reach;let best=limit,found=null;
  const candidates=[...this.tags.entries()].filter(([,tag])=>tag.type==='actor'&&tag.id!==actor.id).sort((a,b)=>cmp(a[1].id,b[1].id));
  for(const [handle,tag]of candidates){const collider=this.world.getCollider(handle);if(!collider||collider.parent()?.bodyType()!==this.R.RigidBodyType.Dynamic)continue;const toi=collider.castRay(ray,limit,true);if(toi>=0&&(!wall||toi<limit-1e-6)&&(toi<best-1e-6||found===null&&toi<=best)){best=toi;found=tag.id;}}
  return found;
 }
 overlapActors(pos,half){const found=[],shape=new this.R.Cuboid(half,half,half);for(const [handle,tag]of this.tags)if(tag.type==='actor'){const col=this.world.getCollider(handle);if(col?.intersectsShape(shape,pos,{x:0,y:0,z:0,w:1}))found.push(tag.id);}return found.sort(cmp);}
 sweepAttack(actor,action,fromT,toT){
  const started=performance.now(),contacts=new Map(),samples=attackSamples(actor,action,fromT,toT),radius=samples[0].radius,ball=new this.R.Ball(radius),reach=action.reach+radius+1;
  // Small actor set, no dependence on a possibly stale broad-phase after a same-tick edit.
  const candidates=[...this.tags.entries()].filter(([,t])=>t.type==='actor'&&t.id!==actor.id).sort((a,b)=>cmp(a[1].id,b[1].id)).map(([h,t])=>({id:t.id,col:this.world.getCollider(h)})).filter(t=>{if(!t.col||t.col.parent()?.bodyType()!==this.R.RigidBodyType.Dynamic)return false;const p=t.col.translation(),r=t.col.halfExtents();return Math.abs(p.x-actor.pos.x)<=reach+(r?.x||0)&&Math.abs(p.z-actor.pos.z)<=reach+(r?.z||0);});
  let casts=0,wallContact=null;
  for(const sample of samples){
   const {from,to}=sample,C=CFG.chunk,min=Object.fromEntries(['x','y','z'].map(k=>[k,Math.floor((Math.min(from[k],to[k])-radius)/C)])),max=Object.fromEntries(['x','y','z'].map(k=>[k,Math.floor((Math.max(from[k],to[k])+radius)/C)]));
   let wallFraction=1+1e-5;
   for(let z=min.z;z<=max.z;z++)for(let y=min.y;y<=max.y;y++)for(let x=min.x;x<=max.x;x++){
    const col=this.chunkCollider(chunkKey(x,y,z));if(!col)continue;casts++;const hit=contactCast(col,ball,from,to);
    if(hit&&hit.fraction<wallFraction){wallFraction=hit.fraction;wallContact={...hit,phase:sample.phase};}
   }
   for(const target of candidates){if(contacts.has(target.id)||action.touched?.includes(target.id))continue;casts++;
    const hit=contactCast(target.col,ball,from,to);if(!hit||hit.fraction>=wallFraction-1e-5)continue;
    // The thick swing is blocked by terrain BEFORE the actor; never use sprite distance.
    if(!this.sight(sample.pose.origin,hit.point,actor))continue;
    contacts.set(target.id,{id:target.id,...hit,phase:sample.phase});
   }
  }
  if(wallContact&&!action.wallContact)action.wallContact={point:wallContact.point,normal:wallContact.normal};
  METRICS.add('combat.shapeCasts',casts);METRICS.add('combat.hitQuery',performance.now()-started);
  return [...contacts.values()].sort((a,b)=>a.phase-b.phase||a.fraction-b.fraction||cmp(a.id,b.id));
 }
 snapshot(){return this.world.takeSnapshot();}
 metadata(){return {format:'voxels-1',loaded:[...this.loaded.entries()].sort(([a],[b])=>cmp(a,b)),tags:[...this.tags.entries()].sort(([a],[b])=>a-b),bodyCount:this.bodyCount,lastPrefetchTick:this.lastPrefetchTick};}
 static restore(R,terrain,bytes,meta){if(meta.format!=='voxels-1')throw Error('호환되지 않는 물리 저장 형식입니다.');const world=R.World.restoreSnapshot(bytes);if(!world)throw Error('Rapier snapshot 복원 실패');
  const p=Object.create(Physics.prototype);p.R=R;p.terrain=terrain;p.world=world;p.events=new R.EventQueue(true);p.loaded=new Map();p.tags=new Map();p.bodyCount=meta.bodyCount;p.lastPrefetchTick=meta.lastPrefetchTick??-1;p.stats={built:0,updated:0,combined:0,relinked:0};
  try{if(!Array.isArray(meta.loaded)||!Array.isArray(meta.tags))throw Error('물리 메타데이터 손상');p.loaded=new Map(meta.loaded);p.tags=new Map(meta.tags);for(const [h,t]of p.tags)if(!world.getCollider(h))throw Error('충돌체 식별자 불일치');for(const [k,e]of p.loaded)if(e.handle!=null&&p.tags.get(e.handle)?.key!==k)throw Error('지형 충돌체 매핑 불일치');}catch(e){p.free();throw e;}return p;
 }

 free(){this.events.free();this.world.free();}
}


