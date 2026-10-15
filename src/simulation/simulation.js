class Simulation {
 constructor(R,seed=CFG.worldSeed){this.R=R;this.terrain=new VoxelWorld(seed);this.physics=new Physics(R,this.terrain);this.companions=new Companions(this);this.tick=0;this.epoch=0;this.actors={};this.drops={};this.projectiles={};this.furnaces={};this.progress={};this.sequence=0;this.actionSequence=0;this.effects=[];this.nextSpawn=CFG.mobs.initialSpawnTicks;this.aiSequence=0;this.presentationSequence=0;this.silent=false;this.revision=0;}
 createActor(id,pos,enemy=null){const d=enemy?ENEMIES[enemy]:null;return{id,pos:{...pos},previous:{...pos},velocity:{x:0,y:0,z:0},facing:{x:0,y:0,z:-1},yaw:0,pitch:0,hp:d?.hp||CFG.player.hp,maxHp:d?.hp||CFG.player.hp,rpg:enemy?null:RPG.create(),maxPoise:d?.poise||CFG.player.poise,scale:d?.size||1,enemy:!!enemy,kind:enemy,boss:enemy==='boss',suspended:false,dead:false,respawn:0,grounded:false,knock:0,inventory:Inventory.empty(),companionSlot:-1,combat:Combat.state(),mine:{target:null,elapsed:0},ai:{cooldown:500,phase:1,pattern:0},inputPrevious:{jump:false,roll:false,right:false,left:false,primary:'none'},anim:0,motion:motionState(),sprinting:false,swim:{inWater:false,underwater:false,depth:0,immersion:0,surface:-1,flow:{x:0,y:0,z:0}}};}
 addPlayer(id){if(this.actors[id])return;const count=Object.values(this.actors).filter(a=>!a.enemy).length,p={x:.5+count*1.7,y:5.1,z:.5};const a=this.createActor(id,p);this.actors[id]=a;this.physics.syncTerrain(Object.values(this.actors),[...Object.values(this.drops),...this.companions.bodies()],Object.values(this.projectiles),this.tick);this.physics.addActor(a);return a;}
 addEnemy(kind,pos){if(Object.values(this.actors).filter(a=>a.enemy).length>=CFG.maxEnemies)return null;const id='enemy:'+ ++this.sequence,a=this.createActor(id,pos,kind);this.actors[id]=a;this.physics.addActor(a);return a;}
 emit(type,actor,data={}){if(this.silent)return;if(this.effects.length>=CFG.presentation.maxBuffered)throw Error('표현 이벤트 버퍼 초과');const sequence=this.presentationSequence++;this.effects.push({id:this.epoch+':'+this.tick+':'+sequence,tick:this.tick,sequence,type,pos:{...actor.pos},actorId:actor.id,enemy:actor.enemy,...data});}
 drainEffects(){const events=this.effects;this.effects=[];return events;}
 markItem(id){this.progress[id]=true;}
 spawnDrop(item,count,pos){if(!ITEMS[item]||count<=0||Object.keys(this.drops).length>=CFG.maxDrops)return false;const id='drop:'+ ++this.sequence,h=hash3(this.sequence,0,this.tick,this.terrain.seed),drop={id,type:'drop',item,count,pos:{x:pos.x,y:pos.y+.35,z:pos.z},age:0};this.drops[id]=drop;
  this.physics.addBall(drop,.16,{x:((h%99)/99-.5)*1.5,y:2.5,z:(((h>>>8)%99)/99-.5)*1.5});return true;}
 fire(actor,action){if(Object.keys(this.projectiles).length>=64)return;const dir=V.norm(action.dir),eye=V.add(actor.pos,{x:0,y:actor.offset*1.65,z:0}),origin=action.origin?{...action.origin}:V.add(eye,V.scale(dir,.65*(actor.scale||1)));
  if(!this.physics.sight(eye,origin,actor)){this.emit('wall',actor);return;}const id='shot:'+ ++this.sequence,shot={id,type:'shot',source:actor.id,companionId:action.companionId||null,companionKind:action.companionKind||null,lifetime:action.companionId?action.reach/18*1000:5000,enemy:actor.enemy,damage:action.damage,poise:action.poise,impulse:action.impulse,weapon:action.weapon,tier:action.tier||0,sequence:action.sequence,cost:action.cost||0,name:action.name,combo:action.combo||0,staminaRefunded:false,dir:{...dir},pos:origin,age:0};this.projectiles[id]=shot;
  this.physics.addBall(shot,action.companionId?.23:.11,V.scale(dir,action.companionId?18:actor.enemy?13:26),action.companionId?0:.2);this.companions.launched(shot);this.emit('shot',actor);}
 projectileContact(id,tag){const shot=this.projectiles[id];if(!shot||!tag||tag.type==='drop'||tag.type==='companion'||tag.type==='shot'||tag.id===shot.source)return;
  let contact=null,accepted=false;
  if(tag.type==='actor'){const target=this.actors[tag.id],col=target&&this.physics.world.getCollider(target.collider),other=this.physics.world.getCollider(shot.collider),pair=col&&other?col.contactCollider(other,.20):null;
   if(pair)contact={point:{...pair.point1},normal:{...pair.normal1}};
   if(target)accepted=Combat.hit(shot.source,target,shot,this,contact);
  }
  if(!accepted)this.emit('spark',{id:shot.id,pos:shot.pos,enemy:shot.enemy},{point:contact?.point||{...shot.pos},normal:contact?.normal||V.scale(V.norm(shot.flightVelocity||shot.velocity||shot.dir),-1),weapon:shot.weapon||'bow'});
  this.companions.returned(shot);this.physics.removeBody(shot);delete this.projectiles[id];
 }
 stationInReach(actor,key,kind){if(!actor||!key)return false;const xyz=key.split(',').map(Number);if(xyz.length!==3||!xyz.every(Number.isFinite))return false;const id=this.terrain.get(...xyz);return BLOCKS[id]?.station===kind&&V.len(V.sub({x:xyz[0]+.5,y:xyz[1],z:xyz[2]+.5},actor.pos))<=CFG.reach+1;}
 aim(actor){return this.terrain.ray(V.add(actor.pos,{x:0,y:CFG.player.eyeHeight,z:0}),actor.facing,CFG.reach);}
  interact(actor){const hit=this.aim(actor);if(!hit)return this.useConsumable(actor);const block=BLOCKS[hit.id];if(!block.station)return this.useConsumable(actor);const key=blockKey(hit.x,hit.y,hit.z);
   if(block.station==='loot')return this.openChest(actor,hit);
  if(block.station==='altar')return this.summon(actor);
  actor.inventory.station=key;if(block.station==='furnace'&&!this.furnaces[key])this.furnaces[key]={slots:[null,null,null],burn:0,burnTotal:0,progress:0,recipe:null};this.emit('open-station',actor,{station:block.station,key});return true;}
  useConsumable(actor){const i=actor.inventory,s=Inventory.selected(i);if(!s||actor.hp>=actor.maxHp||!['food','healingSalve'].includes(s.id))return false;
   actor.hp=Math.min(actor.maxHp,actor.hp+(s.id==='healingSalve'?50:25));if(--s.count===0)i.slots[i.selected]=null;this.emit('heal',actor,{item:s.id});return true;
  }
  openChest(actor,hit){const key=blockKey(hit.x,hit.y,hit.z),opened='chest:'+key;
   if(this.progress[opened]||this.terrain.get(hit.x,hit.y,hit.z)!==BID.lootChest)return false;
   const structure=this.terrain.structuresNear({x:hit.x,y:hit.y,z:hit.z},50).find(s=>s.type==='dungeon'||s.type==='mine');
   const dungeon=structure?.type==='dungeon',deep=hit.y< -15,loot=dungeon?
     [['crystalShard',1+(hash3(hit.x,1,hit.z,this.terrain.seed)%3)],['rawGold',2],['iron',2],['relic',deep?1:0],['food',2]]:
     [['coal',4],['rawIron',3],['arrow',8],['food',2]];
   const changed=this.terrain.set(hit.x,hit.y,hit.z,BID.planks);if(changed===false)return false;
   this.progress[opened]=true;this.progress.chests=(this.progress.chests||0)+1;
   for(const [id,count] of loot){if(count<=0)continue;const remains=Inventory.addTo(actor.inventory.slots,id,count);this.markItem(id);if(remains)this.spawnDrop(id,remains,{x:hit.x+.5,y:hit.y+1.4,z:hit.z+.5});}
   RPG.gain(actor,CFG.rpg.chest,this,'chest');this.emit('chest-open',actor,{pos:{x:hit.x+.5,y:hit.y+.6,z:hit.z+.5},loot:loot.filter(x=>x[1]>0).map(([id,n])=>({id,count:n}))});return true;
  }
 useBucket(actor){const selected=Inventory.selected(actor.inventory),water=this.terrain.water,eye=V.add(actor.pos,{x:0,y:CFG.player.eyeHeight,z:0});if(!selected)return false;
  if(selected.id==='bucket'){const source=water.raySource(eye,actor.facing);if(!source||!water.source(source.x,source.y,source.z,false))return false;selected.id='waterBucket';this.emit('water-collect',actor,{pos:source});return true;}
  if(selected.id==='waterBucket'){const hit=this.terrain.ray(eye,actor.facing);if(!hit)return false;const x=hit.x+hit.normal.x,y=hit.y+hit.normal.y,z=hit.z+hit.normal.z;
   if(!water.source(x,y,z,true))return false;selected.id='bucket';this.emit('water-place',actor,{pos:{x:x+.5,y:y+.5,z:z+.5}});return true;}
  return false;}
 place(actor){const inv=actor.inventory,stack=Inventory.selected(inv),def=stack?ITEMS[stack.id]:null;if(!def?.block){this.emit('place-blocked',actor,{reason:'item'});return false;}const hit=this.aim(actor);if(!hit){this.emit('place-blocked',actor,{reason:'target'});return false;}const x=hit.x+hit.normal.x,y=hit.y+hit.normal.y,z=hit.z+hit.normal.z;
  if(this.terrain.get(x,y,z)||this.physics.overlapActors({x:x+.5,y:y+.5,z:z+.5},.49).length){this.emit('place-blocked',actor,{pos:{x:x+.5,y:y+.5,z:z+.5}});return false;}
  if(this.terrain.set(x,y,z,def.block)===false)return false;if(--stack.count===0)inv.slots[inv.selected]=null;
  if(stack.id==='furnace')this.furnaces[blockKey(x,y,z)]={slots:[null,null,null],burn:0,burnTotal:0,progress:0,recipe:null};this.emit('place',actor,{pos:{x:x+.5,y:y+.5,z:z+.5},color:BLOCKS[def.block].color,normal:hit.normal,blockId:def.block});return true;}
 mine(actor,held){if(!held){actor.mine.target=null;actor.mine.elapsed=0;return;}const hit=this.aim(actor);if(!hit||Object.keys(this.drops).length>=CFG.maxDrops)return;
  const b=BLOCKS[hit.id],key=blockKey(hit.x,hit.y,hit.z),item=Inventory.stats(actor).item;
  if(!Number.isFinite(b.hardness))return;
  if(actor.mine.target!==key){actor.mine.target=key;actor.mine.elapsed=0;}
  const proper=b.tool===item?.tool,speed=proper?item.miningSpeed||1:1;
  if(b.tier>0&&(!proper||item.tier<b.tier)){actor.mine.elapsed=0;return;}
  actor.mine.elapsed+=CFG.stepMs*speed;if(actor.mine.elapsed<b.hardness)return;
  actor.mine.elapsed=0;this.harvest(actor,hit);
 }
 harvest(actor,hit){
  const b=BLOCKS[hit.id],key=blockKey(hit.x,hit.y,hit.z);if(this.terrain.get(hit.x,hit.y,hit.z)!==hit.id||!Number.isFinite(b?.hardness)||Object.keys(this.drops).length>=CFG.maxDrops)return false;const id=this.terrain.set(hit.x,hit.y,hit.z,0);if(id===false)return false;
  const pos={x:hit.x+.5,y:hit.y+.5,z:hit.z+.5};this.spawnDrop(b.drop||b.id,1,pos);
  if(CFG.rpg.mining[b.id])RPG.gain(actor,CFG.rpg.mining[b.id],this,'mine');
   if(id===BID.leaves){this.spawnDrop('leaves',1,pos);if(hash3(hit.x,hit.y,hit.z,this.terrain.seed)%4===0)this.spawnDrop('food',1,pos);}
  const furnace=this.furnaces[key];if(furnace){for(const s of furnace.slots)if(s)this.spawnDrop(s.id,s.count,pos);delete this.furnaces[key];}
  this.emit('mine',actor,{pos,color:b.color,normal:hit.normal,blockId:hit.id});return true;
 }
 command(actor,c){if(!c||typeof c.op!=='string'||actor.dead||actor.suspended)return false;
  switch(c.op){
   case 'companion':return this.companions.command(actor,c);
   case 'slot':return Inventory.click(actor,c,this);
   case 'collect':return Inventory.collect(actor,c,this);
   case 'distribute':return Inventory.distribute(actor,c,this);
   case 'recipe':return Inventory.autoFill(actor,c.id,this);
   case 'craft':return Inventory.takeResult(actor,this,!!c.all);
   case 'close':Inventory.close(actor,this);return true;
   case 'select':if(Number.isInteger(c.index)&&c.index>=0&&c.index<9){actor.inventory.selected=c.index;return true;}return false;
   case 'interact':return this.interact(actor);
    case 'upgrade':return RPG.upgrade(actor,c.skill,this);
   case 'eat':return this.useConsumable(actor);
   case 'drop':{const i=actor.inventory,s=i.cursor||Inventory.selected(i);if(!s)return false;const n=c.all?s.count:1;if(!this.spawnDrop(s.id,n,V.add(actor.pos,V.scale(actor.facing,1))))return false;s.count-=n;if(!s.count){if(i.cursor===s)i.cursor=null;else i.slots[i.selected]=null;}return true;}
   case 'summon':return this.summon(actor);
  }return false;
 }
 summon(actor){if(V.len(V.sub(actor.pos,this.terrain.altar))>7||Object.values(this.actors).some(a=>a.boss&&!a.dead)||!Inventory.takeFrom(actor.inventory.slots,'sigil',1))return false;
  const pos={x:24.5,y:6.1,z:-17.5},boss=this.addEnemy('boss',pos);if(!boss)return false;if(this.progress.boss){boss.maxHp=boss.hp*1.5;boss.hp=boss.maxHp;}this.emit('boss-spawn',boss);return true;}
 kill(actor,source){if(actor.dead)return;if(!actor.enemy)this.companions.unavailable(actor);actor.dead=true;Combat.resetCombo(actor.combat);actor.combat.state='dead';actor.combat.action=null;actor.respawn=CFG.respawn;this.emit('death',actor);
  if(actor.enemy){const killer=this.actors[source];if(killer&&!killer.enemy)RPG.gain(killer,CFG.rpg.xp[actor.kind]||15,this,'combat');for(const [id,count]of ENEMIES[actor.kind].loot)this.spawnDrop(id,count,actor.pos);if(actor.structureKey&&!Object.values(this.actors).some(a=>a.id!==actor.id&&a.enemy&&!a.dead&&a.structureKey===actor.structureKey)){this.progress['cleared:'+actor.structureKey]=true;this.progress.clearedDungeons=(this.progress.clearedDungeons||0)+1;for(const p of Object.values(this.actors).filter(p=>!p.enemy&&!p.dead&&V.len(V.sub(p.pos,actor.pos))<48).sort((a,b)=>cmp(a.id,b.id)))RPG.gain(p,CFG.rpg.dungeonClear,this,'dungeon');this.emit('dungeon-clear',actor,{structureKey:actor.structureKey});}if(actor.boss){this.progress.boss=true;this.progress.victories=(this.progress.victories||0)+1;this.emit('victory',actor,{source});}this.physics.removeBody(actor);actor.body=null;}
  else{const i=actor.inventory;for(const s of [...i.slots,...i.grid,i.cursor,...Object.values(i.armor)])if(s)this.spawnDrop(s.id,s.count,actor.pos);actor.inventory=Inventory.empty();const b=this.physics.world.getRigidBody(actor.body);b.setBodyType(this.R.RigidBodyType.Fixed,true);}
 }
 tickFurnaces(){for(const key of Object.keys(this.furnaces).sort(cmp)){
  const f=this.furnaces[key],[input,fuel,output]=f.slots,r=input?SMELT[input.id]:null,can=!!r&&(!output||output.id===r.out&&output.count<Inventory.limit(output.id));
  if(f.burn>0)f.burn=Math.max(0,f.burn-CFG.stepMs);
  if(can&&f.burn<=0&&fuel&&FUELS[fuel.id]){f.burn=FUELS[fuel.id];f.burnTotal=f.burn;if(--fuel.count===0)f.slots[1]=null;}
  if(!r||f.recipe&&f.recipe!==input.id){f.progress=0;}f.recipe=input?.id||null;
  if(can&&f.burn>0){f.progress+=CFG.stepMs;if(f.progress>=r.ms){f.progress-=r.ms;if(--input.count===0)f.slots[0]=null;if(output)output.count++;else f.slots[2]={id:r.out,count:1};this.markItem(r.out);}}
  else f.progress=Math.max(0,f.progress-CFG.stepMs*2);
 }}
 ai(actor){const def=ENEMIES[actor.kind],players=Object.values(this.actors).filter(a=>!a.enemy&&!a.dead&&!a.suspended).sort((a,b)=>V.len(V.sub(a.pos,actor.pos))-V.len(V.sub(b.pos,actor.pos))||cmp(a.id,b.id));const target=players[0];if(!target)return{move:{x:0,y:0,z:0},speed:0,jump:false};
  const delta=V.sub(target.pos,actor.pos),dist=V.len(delta),flat=V.norm({x:delta.x,y:0,z:delta.z}),c=actor.combat;actor.facing=V.norm({x:delta.x,y:delta.y,z:delta.z});actor.yaw=Math.atan2(-flat.x,-flat.z);
  actor.ai.cooldown=Math.max(0,actor.ai.cooldown-CFG.stepMs);let speed=def.speed,move=flat;
  if(dist>30||dist<def.reach*.82)speed=0;if(def.ranged&&dist<7){speed=def.speed;move=V.scale(flat,-1);}
  if(c.state==='attack'||c.state==='stagger'){speed=0;if(c.state==='attack'&&c.action.kind==='lunge'&&c.elapsed>c.action.wind&&c.elapsed<c.action.wind+c.action.active){move=c.action.dir;speed=8;}}
  if(c.state==='idle'&&actor.ai.cooldown<=0&&dist<=def.reach&&this.physics.sight(V.add(actor.pos,{x:0,y:actor.offset,z:0}),V.add(target.pos,{x:0,y:1,z:0}),actor)){
   const action={name:'enemy',kind:def.ranged?'spit':'swing',weapon:actor.kind,tier:0,combo:0,wind:def.wind,active:def.active,recovery:def.recovery,reach:def.reach,arc:1.7,damage:def.damage,poise:def.poiseDamage,cost:15,impulse:actor.boss?8:actor.kind==='guardian'?6.5:4.5,dir:{...actor.facing},hits:[],fired:false};
   if(actor.boss){actor.ai.phase=actor.hp<actor.maxHp*.5?2:1;const n=(actor.ai.pattern++)%5;
    const patterns=[{kind:'swing',arc:2.2,wind:900},{kind:'slam',arc:.35,damage:50,poise:75,wind:1250},{kind:'lunge',reach:6,active:700,wind:1050},{kind:'spit',reach:18,wind:800},{kind:'burst',reach:5.5,wind:1500,damage:45}];Object.assign(action,patterns[n]);if(actor.ai.phase===2){action.recovery=Math.round(action.recovery*.75);action.damage=statStep(action.damage*1.25,STAT_SCALE.damage);}}
   if(Combat.start(actor,action,this))actor.ai.cooldown=500;
  }
  const blocked=speed>0&&!this.physics.sight(V.add(actor.pos,{x:0,y:.7,z:0}),V.add(actor.pos,{x:flat.x*1.2,y:.7,z:flat.z*1.2}),actor);return{move,speed,jump:blocked};
 }
  tickDungeonEncounters(players){for(const p of players){for(const s of this.terrain.structuresNear(p.pos,44)){
    if(s.type!=='dungeon'||Math.abs(p.pos.y-(s.y+1))>7)continue;
    const rooms=this.terrain.dungeonRooms(s);if(!rooms.some(r=>Math.abs(p.pos.x-r.x)<r.r+9&&Math.abs(p.pos.z-r.z)<r.r+9))continue;
    const visited='dungeon:'+s.key;if(this.progress[visited])continue;this.progress[visited]='active';
    const theme=this.terrain.dungeonTheme(s),slots=[rooms[0],rooms[1],rooms[3],rooms[5]];
    for(let i=0;i<slots.length;i++){const r=slots[i],kind=theme.enemies[i%theme.enemies.length],pos={x:r.x+.5,y:s.y+1.2,z:r.z+.5};
     if(this.terrain.isSolid(this.terrain.get(pos.x,pos.y,pos.z)))continue;
     const enemy=this.addEnemy(kind,pos);if(enemy)enemy.structureKey=s.key;
    }
    this.emit('dungeon-enter',{id:'structure:'+s.key,pos:{x:s.x,y:s.y+1,z:s.z},enemy:true},{name:theme.name});
   }}}

 step(context){const started=performance.now();this.presentationSequence=0;this.silent=!!(context.recovering||context.replaying);const inputs=new Map(context.inputs.map(i=>[i.playerId,i]));
  const actors=Object.values(this.actors).sort((a,b)=>cmp(a.id,b.id)),playerInputs=new Map();
  for(const e of [...actors,...Object.values(this.drops),...Object.values(this.projectiles)])e.previous={...e.pos};
  for(const actor of actors){actor.anim+=CFG.stepMs;if(!actor.dead)continue;actor.respawn-=CFG.stepMs;if(actor.respawn<=0){if(actor.enemy){delete this.actors[actor.id];continue;}actor.dead=false;actor.hp=actor.maxHp;actor.combat=Combat.state();actor.combat.stamina.value=RPG.staminaMax(actor);this.physics.world.getRigidBody(actor.body).setBodyType(this.R.RigidBodyType.Dynamic,true);this.physics.teleport(actor,this.terrain.spawn);}}
  this.physics.syncTerrain(Object.values(this.actors),[...Object.values(this.drops),...this.companions.bodies()],Object.values(this.projectiles),this.tick);
  // Phase 1: deterministic actor-ID order for commands and ALL voxel edits.
  for(const actor of actors){if(actor.dead||actor.suspended||actor.enemy)continue;const entry=inputs.get(actor.id),input=entry?decodeInput(entry.input):neutralInput();if(actor.inventory.selected!==input.selected)actor.companionSlot=-1;actor.inventory.selected=input.selected;actor.facing=direction(input.yaw,input.pitch);
   for(const command of entry?.commands||[]){try{this.command(actor,decodeCommand(command.payload));}catch(e){this.emit('invalid-command',actor,{message:e.message});}}
   this.physics.flushTerrainChanges();
   const selected=Inventory.stats(actor).item,previous=actor.inputPrevious;
   if(input.enabled&&input.left&&!previous.left){const enemy=this.physics.aimEnemy(actor,Combat.weapon(actor).reach),block=this.aim(actor),canMine=actor.companionSlot<0&&(!selected?.weapon||!!selected?.tool),attackBusy=['charge','attack'].includes(actor.combat.state);previous.primary=!input.attackOnly&&canMine&&block&&!enemy&&!attackBusy?'mine':'attack';}
   this.mine(actor,input.enabled&&(input.mine||input.left&&previous.primary==='mine'));
   if(input.enabled&&input.right&&!previous.right&&!selected?.weapon&&actor.companionSlot<0){if(selected?.id==='bucket'||selected?.id==='waterBucket')this.useBucket(actor);else this.place(actor);}
   this.physics.flushTerrainChanges();
   playerInputs.set(actor.id,{...input,left:input.left&&previous.primary==='attack',right:input.right&&(!!selected?.weapon||actor.companionSlot>=0)});previous.left=input.left;previous.right=input.right;if(!input.left)previous.primary='none';
  }
  this.companions.tick();this.physics.flushTerrainChanges();
  this.terrain.water.step(actors.filter(a=>!a.enemy),this.tick);
  // Phase 2: movement/AI see the final terrain for this tick, independent of renderer jobs.
  for(const actor of Object.values(this.actors).sort((a,b)=>cmp(a.id,b.id))){if(actor.dead||actor.suspended)continue;const control=actor.enemy?this.ai(actor):Combat.updatePlayer(actor,playerInputs.get(actor.id)||neutralInput(),this);Combat.tick(actor,this);this.physics.control(actor,control.move,control.speed,control.jump,control.autoJump!==false,control.swimRise,control.swimDive);}
  // New shots/drops need support before their first integration.
  this.physics.syncTerrain(Object.values(this.actors),[...Object.values(this.drops),...this.companions.bodies()],Object.values(this.projectiles),this.tick,false);
  this.physics.step(this);
  for(const actor of Object.values(this.actors).sort((a,b)=>cmp(a.id,b.id)))if(!actor.enemy&&!actor.dead&&!actor.suspended&&actor.sprinting)Combat.sprintCost(actor,Math.hypot(actor.pos.x-actor.previous.x,actor.pos.z-actor.previous.z));
  for(const actor of Object.values(this.actors))if(!actor.dead&&actor.pos.y<CFG.bottom-6)this.kill(actor,null);
  this.tickFurnaces();
  const players=Object.values(this.actors).filter(a=>!a.enemy&&!a.dead&&!a.suspended).sort((a,b)=>cmp(a.id,b.id));
  for(const id of Object.keys(this.drops).sort(cmp)){const d=this.drops[id];d.age+=CFG.stepMs;for(const p of players){if(d.age<350||V.len(V.sub(V.add(p.pos,{x:0,y:.6,z:0}),d.pos))>1.8)continue;const old=d.count;d.count=Inventory.addTo(p.inventory.slots,d.item,d.count);if(d.count<old){this.markItem(d.item);this.emit('pickup',p,{item:d.item,count:old-d.count});}if(!d.count)break;}
   if(!d.count||d.age>CFG.dropLife||d.pos.y<CFG.bottom-10){this.physics.removeBody(d);delete this.drops[id];}}
  for(const [id,s]of Object.entries(this.projectiles)){s.age+=CFG.stepMs;if(s.age>(s.lifetime??5000)||s.pos.y<CFG.bottom){this.companions.returned(s);this.physics.removeBody(s);delete this.projectiles[id];}}
  if(this.tick>=this.nextSpawn){this.nextSpawn=this.tick+CFG.mobs.spawnEveryTicks;if(CFG.mobs.nightSpawn){const night=this.night(),enemyCount=Object.values(this.actors).filter(a=>a.enemy&&!a.dead).length;if(!night){for(const e of Object.values(this.actors)){if(!e.enemy||e.boss||e.dead||e.structureKey)continue;if(players.every(p=>V.len(V.sub(p.pos,e.pos))>32)){this.physics.removeBody(e);delete this.actors[e.id];}}}let spawned=0;for(const p of night?players:[]){if(enemyCount+spawned>=10)break;const h=hash3(this.tick,0,hashStr(p.id),this.terrain.seed),x=Math.floor(p.pos.x)+((h%2)?1:-1)*(10+h%8),z=Math.floor(p.pos.z)+(((h>>>4)%2)?1:-1)*(8+(h>>>8)%8),y=this.terrain.height(x,z)+1.2;
    if(y<CFG.sea+1||Math.hypot(x,z)<8||this.terrain.get(x,Math.floor(y),z))continue;if(this.addEnemy(['beetle','spore','guardian'][h%3],{x:x+.5,y,z:z+.5}))spawned++;}}if(CFG.mobs.dungeonEncounters)this.tickDungeonEncounters(players);}
  this.tick=context.tick+1;this.revision++;this.silent=false;METRICS.add('simulation.tick',performance.now()-started);
 }
 dayPhase(){return ((this.tick*CFG.stepMs)%CFG.dayMs)/CFG.dayMs;}
 daylight(){const altitude=Math.cos(TAU*this.dayPhase());const t=clamp((altitude+.25)/.5,0,1);return t*t*(3-2*t);}
 night(){return Math.cos(TAU*this.dayPhase())<-.25;}
 clock(){const minutes=Math.floor(((.5+this.dayPhase())%1)*24*60);return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}

 applyMembership({epoch,players,activePlayers=players,joined=[],left=[]}){this.epoch=epoch;for(const id of left){const a=this.actors[id];if(a){this.companions.unavailable(a);Inventory.close(a,this);this.physics.removeBody(a);delete this.actors[id];}}
  for(const id of [...joined].sort(cmp))this.addPlayer(id);
  for(const id of players){const a=this.actors[id];if(!a)throw Error('참가자 배우 없음');const inactive=!activePlayers.includes(id);if(a.suspended!==inactive){if(inactive)this.companions.unavailable(a);a.suspended=inactive;a.combat=Combat.state();const b=this.physics.world.getRigidBody(a.body);if(b){b.setLinvel({x:0,y:0,z:0},true);b.setBodyType(inactive?this.R.RigidBodyType.Fixed:this.R.RigidBodyType.Dynamic,true);}}}
 }
 meta(){return{companions:this.companions.snapshot(),version:SNAPSHOT_VERSION,seed:this.terrain.seed,tick:this.tick,epoch:this.epoch,sequence:this.sequence,actionSequence:this.actionSequence,actors:Object.values(this.actors).sort((a,b)=>cmp(a.id,b.id)),drops:Object.values(this.drops).sort((a,b)=>cmp(a.id,b.id)),projectiles:Object.values(this.projectiles).sort((a,b)=>cmp(a.id,b.id)),furnaces:Object.entries(this.furnaces).sort(([a],[b])=>cmp(a,b)),progress:this.progress,edits:this.terrain.snapshot(),fluid:this.terrain.water.snapshot(),terrainState:{editSerial:this.terrain.editSerial,physicsRevisions:[...this.terrain.physicsRevisions.entries()].sort(([a],[b])=>cmp(a,b))},nextSpawn:this.nextSpawn,physics:this.physics.metadata()};}
 save(){this.physics.flushTerrainChanges();const json=new TextEncoder().encode(JSON.stringify(this.meta())),phys=this.physics.snapshot(),out=new Uint8Array(12+json.length+phys.length),v=new DataView(out.buffer);v.setUint32(0,0x424C4D41,true);v.setUint32(4,json.length,true);v.setUint32(8,phys.length,true);out.set(json,12);out.set(phys,12+json.length);return out;}
 parse(bytes){if(!(bytes instanceof Uint8Array)||bytes.length<12||bytes.length>32*1024*1024)throw Error('저장 크기 오류');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),jl=v.getUint32(4,true),pl=v.getUint32(8,true);if(v.getUint32(0,true)!==0x424C4D41||12+jl+pl!==bytes.length||!pl)throw Error('물리 상태 없는 저장 또는 손상된 파일');const m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(12,12+jl)));
  if(m.version!==SNAPSHOT_VERSION)throw Error('현재 '+SNAPSHOT_VERSION+' 저장만 지원합니다. 이전 버전은 새 월드가 필요합니다.');
  if(!Number.isInteger(m.seed)||!Number.isInteger(m.tick)||m.tick<0||m.actors.length>32||m.drops.length>300||m.projectiles.length>80)throw Error('저장 버전 또는 용량 불일치');const ids=new Set();for(const a of m.actors){if(ids.has(a.id)||!a.pos||!Object.values(a.pos).every(Number.isFinite)||!Inventory.validate(a.inventory)||!a.combat||(!a.enemy&&(!a.rpg||!Number.isInteger(a.rpg.level)||!Number.isInteger(a.rpg.xp)||!Number.isInteger(a.rpg.points)||!a.rpg.skills||Object.keys(RPG_SKILLS).some(k=>!Number.isInteger(a.rpg.skills[k]))))||!Number.isFinite(a.hp))throw Error('배우 상태 손상');ids.add(a.id);}Companions.validate(m.companions,m.actors,m.projectiles);return{meta:m,physics:bytes.subarray(12+jl)};
 }
 load(bytes){const {meta:m,physics:payload}=this.parse(bytes),terrain=VoxelWorld.restore(m.seed,m.edits);
  terrain.editSerial=m.terrainState?.editSerial??m.edits.length;terrain.physicsRevisions=new Map(m.terrainState?.physicsRevisions||[]);
  terrain.water.restore(m.fluid);const physics=Physics.restore(this.R,terrain,payload,m.physics);
  try{for(const a of m.actors){if(a.body===null)continue;if(!physics.world.getRigidBody(a.body))throw Error('물리 배우 매핑 손상');}for(const e of [...m.drops,...m.projectiles,...Object.values(m.companions?.units||{}).filter(u=>u.body!==null)]){const b=physics.world.getRigidBody(e.body);if(!b||!physics.world.getCollider(e.collider))throw Error('물리 객체 매핑 손상');}
   for(const u of Object.values(m.companions?.units||{}).filter(u=>u.body!==null)){const tag=physics.tags.get(u.collider),col=physics.world.getCollider(u.collider);if(tag?.type!=='companion'||tag.id!==u.id||col?.parent()?.handle!==u.body)throw Error('동료 물리 소유권 손상');}
  }catch(e){physics.free();throw e;}
  // A Rapier snapshot owns its saved timestep. Rebase tick-based clocks only when that rate changes.
  const savedStepMs=Math.round(physics.world.timestep*1e6)/1000;
  if(Math.abs(savedStepMs-CFG.stepMs)>.001){const scale=savedStepMs/CFG.stepMs,toTick=t=>t<0?t:Math.round(t*scale);
   m.tick=toTick(m.tick);m.nextSpawn=toTick(m.nextSpawn);terrain.water.lastSeedTick=toTick(terrain.water.lastSeedTick);
   physics.lastPrefetchTick=toTick(physics.lastPrefetchTick);for(const entry of physics.loaded.values())entry.until=toTick(entry.until);
   physics.world.timestep=CFG.stepMs/1000;
  }
  this.physics.free();this.terrain=terrain;this.physics=physics;this.tick=m.tick;this.epoch=m.epoch;this.sequence=m.sequence;this.actionSequence=m.actionSequence;this.actors=Object.fromEntries(m.actors.map(a=>[a.id,a]));this.drops=Object.fromEntries(m.drops.map(a=>[a.id,a]));this.projectiles=Object.fromEntries(m.projectiles.map(a=>[a.id,a]));this.furnaces=Object.fromEntries(m.furnaces);this.progress=m.progress;this.nextSpawn=m.nextSpawn;this.companions=new Companions(this,m.companions);for(const a of Object.values(this.actors))a.companionSlot??=-1;this.effects=[];this.revision++;
 }
 adapter(){return{save:()=>this.save(),load:b=>this.load(b),validateSnapshot:(b,c)=>{try{const m=this.parse(b).meta;return(c.tick===undefined||m.tick===c.tick)&&(!c.players||JSON.stringify(m.actors.filter(a=>!a.enemy).map(a=>a.id).sort())===JSON.stringify([...c.players].sort()));}catch{return false;}},step:c=>this.step(c),applyMembership:c=>this.applyMembership(c)};}
 free(){this.physics.free();}
}
function neutralInput(){return{enabled:false,left:false,right:false,roll:false,jump:false,sprint:false,mine:false,attackOnly:false,swimRise:false,swimDive:false,x:0,z:0,yaw:0,pitch:0,selected:0};}
function encodeInputObject(i){const b=new Uint8Array(CFG.net.inputSize),v=new DataView(b.buffer);let flags=(i.enabled?1:0)|(i.left?2:0)|(i.right?4:0)|(i.roll?8:0)|(i.jump?16:0)|(i.sprint?32:0)|(i.mine?64:0)|(i.attackOnly?128:0)|(i.swimRise?256:0)|(i.swimDive?512:0);v.setUint16(0,flags,true);v.setInt8(2,Math.round(clamp(i.x,-1,1)*127));v.setInt8(3,Math.round(clamp(i.z,-1,1)*127));v.setInt16(4,Math.round(((i.yaw%(TAU))+TAU)%TAU/TAU*32767),true);v.setInt16(6,Math.round(clamp(i.pitch,-1.5,1.5)/1.5*32767),true);b[8]=i.selected|0;return b;}
function decodeInput(b){if(!b||b.length!==CFG.net.inputSize)return neutralInput();const v=new DataView(b.buffer,b.byteOffset,b.byteLength),f=v.getUint16(0,true);return{enabled:!!(f&1),left:!!(f&2),right:!!(f&4),roll:!!(f&8),jump:!!(f&16),sprint:!!(f&32),mine:!!(f&64),attackOnly:!!(f&128),swimRise:!!(f&256),swimDive:!!(f&512),x:v.getInt8(2)/127,z:v.getInt8(3)/127,yaw:v.getInt16(4,true)/32767*TAU,pitch:v.getInt16(6,true)/32767*1.5,selected:clamp(b[8],0,8)};}
const encodeCommand=c=>new TextEncoder().encode(JSON.stringify(c));
function decodeCommand(b){if(b.byteLength>2048)throw Error('명령 크기');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));}


