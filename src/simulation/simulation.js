'use strict';
class Simulation {
 constructor(R,seed=CFG.worldSeed){this.R=R;this.terrain=new VoxelWorld(seed);this.physics=new Physics(R,this.terrain);this.companions=new Companions(this);this.tick=0;this.epoch=0;this.actors={};this.drops={};this.projectiles={};this.furnaces={};this.chests={};this.regrow={};this.eggs={};this.progress={};this.sequence=0;this.actionSequence=0;this.effects=[];this.nextSpawn=CFG.creatures.initialEncounterTicks;this.aiSequence=0;this.presentationSequence=0;this.silent=false;this.revision=0;}
 createActor(id,pos,speciesId=null,boss=false){const d=speciesId?(boss?SPECIES[speciesId]?.boss:SPECIES[speciesId]?.wild):null;return{id,pos:{...pos},previous:{...pos},velocity:{x:0,y:0,z:0},facing:{x:0,y:0,z:-1},yaw:0,pitch:0,hp:d?.hp||CFG.player.hp,maxHp:d?.hp||CFG.player.hp,rpg:d?null:RPG.create(),scale:d?.size||1,enemy:false,kind:speciesId,speciesId,wildState:speciesId?'neutral':null,targetId:null,homePos:null,boss,suspended:false,dead:false,respawn:0,grounded:false,knock:0,inventory:Inventory.empty(),companionSlot:-1,combat:Combat.state(),mine:{target:null,elapsed:0},ai:{cooldown:500,phase:1,pattern:0},inputPrevious:{jump:false,roll:false,right:false,left:false,primary:'none'},anim:0,motion:motionState(),sprinting:false,swim:{inWater:false,underwater:false,depth:0,immersion:0,surface:-1,flow:{x:0,y:0,z:0}}};}
 addPlayer(id){if(this.actors[id])return;const count=Object.values(this.actors).filter(a=>!a.enemy&&!a.speciesId&&!a.boss).length,p={x:.5+count*1.7,y:5.1,z:.5};const a=this.createActor(id,p);this.actors[id]=a;this.physics.syncTerrain(Object.values(this.actors),Object.values(this.drops),Object.values(this.projectiles),this.tick);this.physics.addActor(a);return a;}
 addCreature(speciesId,pos,structureKey=null){if(!SPECIES[speciesId]||!structureKey&&Object.values(this.actors).filter(a=>a.speciesId&&!a.boss&&!a.dead&&!a.structureKey).length>=CFG.creatures.maxWild)return null;const id='creature:'+ ++this.sequence,a=this.createActor(id,pos,speciesId);a.homePos={...pos};a.structureKey=structureKey;a.ai.cooldown=0;this.actors[id]=a;this.physics.addActor(a);return a;}
 // A structure boss is the species body x3 with its hat (rig stage 'boss'); one live boss per structure, at most four at once.
 addBoss(speciesId,pos,structureKey=null){const live=Object.values(this.actors).filter(a=>a.boss&&!a.dead);if(!SPECIES[speciesId]?.boss||live.length>=4||structureKey&&live.some(a=>a.structureKey===structureKey))return null;const id='boss:'+ ++this.sequence,a=this.createActor(id,pos,speciesId,true);a.homePos={...pos};a.structureKey=structureKey;a.ai.cooldown=600;this.actors[id]=a;this.physics.addActor(a);return a;}
 // Enclosure queries over the current terrain (a load or new world swaps the terrain, and with it the cache).
 get ranch(){if(this.ranchCache?.terrain!==this.terrain)this.ranchCache=new Ranch(this.terrain);return this.ranchCache;}
 emit(type,actor,data={}){if(this.silent)return;if(this.effects.length>=CFG.presentation.maxBuffered)throw Error('표현 이벤트 버퍼 초과');const sequence=this.presentationSequence++;this.effects.push({id:this.epoch+':'+this.tick+':'+sequence,tick:this.tick,sequence,type,pos:{...actor.pos},actorId:actor.id,enemy:actor.enemy,...data});}
 drainEffects(){const events=this.effects;this.effects=[];return events;}
 // A mushroom stem is wood too (0.35.1: it drops itself and crafts into planks), so it completes the first-wood step.
 markItem(id){this.progress[id]=true;if(id==='stem')this.progress.log=true;}
 // A thrown drop (Q, D-105 feeding) flies along `toss` and nobody picks it up for 1.5 s, so it lands where it was thrown.
 spawnDrop(item,count,pos,toss=null){if(!ITEMS[item]||count<=0||Object.keys(this.drops).length>=CFG.maxDrops)return false;const id='drop:'+ ++this.sequence,h=hash3(this.sequence,0,this.tick,this.terrain.seed),drop={id,type:'drop',item,count,pos:{x:pos.x,y:pos.y+.35,z:pos.z},age:0,...(toss?{pickupMs:1500}:{})};this.drops[id]=drop;
  this.physics.addBall(drop,.16,toss?{x:toss.x*4.5,y:2.2+toss.y*3,z:toss.z*4.5}:{x:((h%99)/99-.5)*1.5,y:2.5,z:(((h>>>8)%99)/99-.5)*1.5});return true;}
  fire(actor,action){if(Object.keys(this.projectiles).length>=64)return;const dir=V.norm(action.dir),eye=V.add(actor.pos,{x:0,y:actor.offset*1.65,z:0}),origin=action.companionId?V.add(companionRoot(actor,dir),{x:0,y:.9,z:0}):action.origin?{...action.origin}:V.add(eye,V.scale(dir,.65*(actor.scale||1)));
  if(!this.physics.sight(eye,origin,actor)){this.emit('wall',actor);return;}const projectile=action.projectile||(action.companionId?SPECIES[action.companionKind]?.capabilities.attack.projectile:null)||{speed:actor.enemy?13:26,lift:0,gravity:.2,radius:.11},velocity=V.add(V.scale(dir,projectile.speed),{x:0,y:projectile.lift,z:0});const id='shot:'+ ++this.sequence,shot={id,type:'shot',source:actor.id,companionId:action.companionId||null,companionKind:action.companionKind||null,lifetime:action.companionId?action.reach/projectile.speed*1000:5000,enemy:actor.enemy,damage:action.damage,heavy:!!action.heavy,impulse:action.impulse,weapon:action.weapon,sequence:action.sequence,dir:{...dir},pos:origin,age:0,...(action.companionId?{spent:false,throwPhase:'flight',groundMs:0,supportTicks:0}:{})};this.projectiles[id]=shot;
  // One native CCD sphere: initial velocity plus the same world gravity as actors. Rendering reads its integrated position.
  this.physics.addBall(shot,projectile.radius,velocity,projectile.gravity);this.companions.launched(shot);this.emit('shot',actor);}
 // D-104: the merge potion is thrown like a splash potion (one physics ball) and bursts on its first contact.
 throwPotion(actor){const i=actor.inventory,s=Inventory.selected(i),P=RANCH_RULES.potion;if(s?.id!=='mergePotion'||Object.keys(this.projectiles).length>=64)return false;
  const dir=V.norm(actor.facing),eye=V.add(actor.pos,{x:0,y:CFG.player.eyeHeight,z:0}),origin=V.add(eye,V.scale(dir,.55));if(!this.physics.sight(eye,origin,actor)){this.emit('wall',actor);return false;}
  const id='shot:'+ ++this.sequence,shot={id,type:'shot',source:actor.id,potion:true,item:'mergePotion',companionId:null,companionKind:null,lifetime:P.lifetime,enemy:false,dir:{...dir},pos:origin,age:0};this.projectiles[id]=shot;
  this.physics.addBall(shot,P.ballRadius,V.add(V.scale(dir,P.speed),{x:0,y:P.lift,z:0}),P.gravity);if(--s.count===0)i.slots[i.selected]=null;this.emit('potion-throw',actor,{point:{...origin}});return true;}
 splashPotion(shot){const owner=this.actors[shot.source],point={...shot.pos},P=RANCH_RULES.potion;this.physics.removeBody(shot);delete this.projectiles[shot.id];if(!owner)return;
  const hit=this.companions.owned(owner.id).filter(u=>V.len(V.sub(u.pos,point))<=P.radius),merged=this.companions.merge(owner,hit);
  this.emit('potion-splash',owner,{point,radius:P.radius,hit:hit.length,merged:merged.length});
  for(const m of merged){this.progress.merged=true;this.emit('unit-merge',owner,{...m,pos:m.pos,name:SPECIES[m.species].name});}}
 projectileContact(id,tag){const shot=this.projectiles[id];if(!shot||!tag||tag.type==='drop'||tag.type==='companion'||tag.type==='shot'||tag.id===shot.source)return;
  if(shot.potion){this.splashPotion(shot);return;}
  if(shot.companionId){if(shot.spent)return;shot.spent=true;}
   let contact=null,accepted=false;
  if(tag.type==='actor'){const target=this.actors[tag.id],col=target&&this.physics.world.getCollider(target.collider),other=this.physics.world.getCollider(shot.collider),pair=col&&other?col.contactCollider(other,.20):null;
   if(pair)contact={point:{...pair.point1},normal:{...pair.normal1}};
   if(target)accepted=Combat.hit(shot.source,target,shot,this,contact);
  }
  if(!accepted)this.emit('spark',{id:shot.id,pos:shot.pos,enemy:shot.enemy},{point:contact?.point||{...shot.pos},normal:contact?.normal||V.scale(V.norm(shot.flightVelocity||shot.velocity||shot.dir),-1),weapon:shot.weapon||'shot'});
  if(shot.companionId){shot.throwPhase='fall';return;}
  this.physics.removeBody(shot);delete this.projectiles[id];
 }
 stationInReach(actor,key,kind){if(!actor||!key)return false;const xyz=key.split(',').map(Number);if(xyz.length!==3||!xyz.every(Number.isFinite))return false;const id=this.terrain.get(...xyz);return BLOCKS[id]?.station===kind&&V.len(V.sub({x:xyz[0]+.5,y:xyz[1],z:xyz[2]+.5},actor.pos))<=CFG.reach+1;}
 aim(actor){return this.terrain.ray(V.add(actor.pos,{x:0,y:CFG.player.eyeHeight,z:0}),actor.facing,CFG.reach);}
  interact(actor){const hit=this.aim(actor);if(!hit)return this.useConsumable(actor);const block=BLOCKS[hit.id];if(block.gate)return this.toggleGate(actor,hit);if(!block.station)return this.useConsumable(actor);const key=blockKey(hit.x,hit.y,hit.z);
   if(block.station==='loot')return this.openChest(actor,hit);
   if(block.station==='chest'&&!this.chests[key])return false;
  actor.inventory.station=key;if(block.station==='furnace'&&!this.furnaces[key])this.furnaces[key]={slots:[null,null,null],burn:0,burnTotal:0,progress:0,recipe:null};this.emit('open-station',actor,{station:block.station,key});return true;}
  // A gate opens and closes in place (right-click or F). It does not close on a player or a unit standing in it.
  toggleGate(actor,hit){const open=BLOCKS[hit.id].gate==='open',pos={x:hit.x+.5,y:hit.y+.5,z:hit.z+.5};
   if(open&&(this.physics.overlapActors(pos,.49).length||this.companions.all().some(u=>u.location==='ranch'&&[u.cell,u.next].some(c=>c&&c.x===hit.x&&c.y===hit.y&&c.z===hit.z)))){this.emit('place-blocked',actor,{reason:'gate',pos});return false;}
   if(this.terrain.set(hit.x,hit.y,hit.z,BID[open?'fenceGate':'fenceGateOpen'])===false)return false;this.emit('gate',actor,{pos,open:!open});return true;}
  useConsumable(actor){const i=actor.inventory,s=Inventory.selected(i);if(!s||actor.hp>=actor.maxHp||!['food','healingSalve'].includes(s.id))return false;
   actor.hp=Math.min(actor.maxHp,actor.hp+(s.id==='healingSalve'?50:25));if(--s.count===0)i.slots[i.selected]=null;this.emit('heal',actor,{item:s.id});return true;
  }
  openChest(actor,hit){const key=blockKey(hit.x,hit.y,hit.z),opened='chest:'+key;
   if(this.progress[opened]||this.terrain.get(hit.x,hit.y,hit.z)!==BID.lootChest)return false;
   const structure=this.terrain.structuresNear({x:hit.x,y:hit.y,z:hit.z},50).find(s=>s.type==='dungeon'||s.type==='mine');
   const dungeon=structure?.type==='dungeon',deep=hit.y< -15,loot=dungeon?
     [['crystalShard',1+(hash3(hit.x,1,hit.z,this.terrain.seed)%3)],['rawGold',2],['iron',2],['relic',deep?1:0],['food',2]]:
     [['coal',4],['rawIron',3],['food',2]];
   const changed=this.terrain.set(hit.x,hit.y,hit.z,BID.planks);if(changed===false)return false;
   this.progress[opened]=true;this.progress.chests=(this.progress.chests||0)+1;if(dungeon&&!this.progress['cleared:'+structure.key]){this.progress['cleared:'+structure.key]=true;this.progress.clearedDungeons=(this.progress.clearedDungeons||0)+1;}
   for(const [id,count] of loot){if(count<=0)continue;const remains=Inventory.addTo(actor.inventory.slots,id,count);this.markItem(id);if(remains)this.spawnDrop(id,remains,{x:hit.x+.5,y:hit.y+1.4,z:hit.z+.5});}
   RPG.gain(actor,CFG.rpg.chest,this,'chest');this.emit('chest-open',actor,{pos:{x:hit.x+.5,y:hit.y+.6,z:hit.z+.5},loot:loot.filter(x=>x[1]>0).map(([id,n])=>({id,count:n}))});return true;
  }
 useBucket(actor){const selected=Inventory.selected(actor.inventory),water=this.terrain.water,eye=V.add(actor.pos,{x:0,y:CFG.player.eyeHeight,z:0});if(!selected)return false;
  if(selected.id==='bucket'){const source=water.raySource(eye,actor.facing);if(!source||!water.source(source.x,source.y,source.z,false))return false;selected.id='waterBucket';this.emit('water-collect',actor,{pos:source});return true;}
  if(selected.id==='waterBucket'){const hit=this.terrain.ray(eye,actor.facing);if(!hit)return false;const x=hit.x+hit.normal.x,y=hit.y+hit.normal.y,z=hit.z+hit.normal.z;
   if(!water.source(x,y,z,true))return false;selected.id='bucket';this.emit('water-place',actor,{pos:{x:x+.5,y:y+.5,z:z+.5}});return true;}
  return false;}
 place(actor){const inv=actor.inventory,stack=Inventory.selected(inv),def=stack?ITEMS[stack.id]:null;if(!def?.block){this.emit('place-blocked',actor,{reason:'item'});return false;}const hit=this.aim(actor);if(!hit){this.emit('place-blocked',actor,{reason:'target'});return false;}const x=hit.x+hit.normal.x,y=hit.y+hit.normal.y,z=hit.z+hit.normal.z,egg=eggSpecies(def.block);
  // D-103: an egg is set down on the ground (the top face of a solid block) and hatches where it lies. It is not solid,
  // so a player standing on the spot does not block it.
  if(egg&&(hit.normal.y!==1||!this.terrain.isSolid(hit.id)||Object.keys(this.eggs).length>=64)){this.emit('place-blocked',actor,{reason:'egg',pos:{x:x+.5,y:y+.5,z:z+.5}});return false;}
  if(this.terrain.get(x,y,z)||!egg&&this.physics.overlapActors({x:x+.5,y:y+.5,z:z+.5},.49).length){this.emit('place-blocked',actor,{pos:{x:x+.5,y:y+.5,z:z+.5}});return false;}
  if(this.terrain.set(x,y,z,def.block)===false)return false;if(--stack.count===0)inv.slots[inv.selected]=null;
  if(egg){const key=blockKey(x,y,z);this.eggs[key]={key,x,y,z,species:egg,owner:actor.id,placedTick:this.tick,hatchTick:this.tick+ticksForMs(EGG_RULES.hatchMs)};this.emit('egg-place',actor,{pos:{x:x+.5,y,z:z+.5},species:egg,key});}
  if(stack.id==='furnace')this.furnaces[blockKey(x,y,z)]={slots:[null,null,null],burn:0,burnTotal:0,progress:0,recipe:null};if(stack.id==='storageChest')this.chests[blockKey(x,y,z)]={slots:Array(RANCH_RULES.chestSlots).fill(null)};this.emit('place',actor,{pos:{x:x+.5,y:y+.5,z:z+.5},color:BLOCKS[def.block].color,normal:hit.normal,blockId:def.block});return true;}
 mine(actor,held){if(!held){actor.mine.target=null;actor.mine.elapsed=0;return;}const hit=this.aim(actor);if(!hit||Object.keys(this.drops).length>=CFG.maxDrops)return;
  const b=BLOCKS[hit.id],key=blockKey(hit.x,hit.y,hit.z),item=Inventory.stats(actor).item;
  if(!Number.isFinite(b.hardness))return;
  if(actor.mine.target!==key){actor.mine.target=key;actor.mine.elapsed=0;}
  const proper=b.tool===item?.tool,speed=proper?item.miningSpeed||1:1;
  if(b.tier>0&&(!proper||item.tier<b.tier)){actor.mine.elapsed=0;return;}
  // 0.35.1 equipment penalty: the realm's gathering factor (곡괭이 below its tier ×0.35, diamond bonus ×1.5), per-mille.
  actor.mine.elapsed+=CFG.stepMs*speed*Gear.status(actor,this.terrain).gather/1000;if(actor.mine.elapsed<b.hardness)return;
  actor.mine.elapsed=0;this.harvest(actor,hit);
 }
 // Everything one harvest of block `id` at (x,y,z) yields, as [[item,count]]: the block's drop (itself when it has none),
 // and the extras — leaves add the leaf item and a fruit 1 in 4, a mushroom cap adds a fruit 1 in 3 (0.35.1: the cap
 // itself is now the main drop, so a placed-cap farm still yields fruit). The rolls hash the cell and the tick, so a
 // block that regrows in the same cell is rolled again each time.
 blockDrops(id,x,y,z){const b=BLOCKS[id],out=[[b.drop||b.id,1]],roll=hash3(x*31+y,z,this.tick,this.terrain.seed+911);
  if(id===BID.leaves){out.push(['leaves',1]);if(roll%4===0)out.push(['food',1]);}
  if(id===BID.cap&&roll%3===0)out.push(['food',1]);
  return out;}
 // `by`: the owned unit harvesting for its owner (chest labor); the owner still gets the mining experience. A labor harvest
 // spawns no drops: it returns the yield as stacks for the unit to carry, all of it, to the chest (0.35.1).
 harvest(actor,hit,by=null){
  const b=BLOCKS[hit.id],key=blockKey(hit.x,hit.y,hit.z);if(this.terrain.get(hit.x,hit.y,hit.z)!==hit.id||!Number.isFinite(b?.hardness)||!by&&Object.keys(this.drops).length>=CFG.maxDrops)return false;const id=this.terrain.set(hit.x,hit.y,hit.z,0);if(id===false)return false;
  const pos={x:hit.x+.5,y:hit.y+.5,z:hit.z+.5},yields=[];for(const [item,count]of this.blockDrops(hit.id,hit.x,hit.y,hit.z)){const s=yields.find(s=>s.id===item);if(s)s.count+=count;else yields.push({id:item,count});}
  if(!by)for(const s of yields)this.spawnDrop(s.id,s.count,pos);if(b.egg)delete this.eggs[key];
  if(CFG.rpg.mining[b.id])RPG.gain(actor,CFG.rpg.mining[b.id],this,'mine');
  const furnace=this.furnaces[key];if(furnace){for(const s of furnace.slots)if(s)this.spawnDrop(s.id,s.count,pos);delete this.furnaces[key];}
  const chest=this.chests[key];if(chest){for(const s of chest.slots)if(s)this.spawnDrop(s.id,s.count,pos);delete this.chests[key];}
  this.emit('mine',actor,{pos,color:b.color,normal:hit.normal,blockId:hit.id,...(by?{by}:{})});return by?yields:true;
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
   case 'drop':{const i=actor.inventory,s=i.cursor||Inventory.selected(i);if(!s)return false;const n=c.all?s.count:1,toss=V.norm({x:actor.facing.x,y:Math.max(-.3,actor.facing.y),z:actor.facing.z}),eye=V.add(actor.pos,{x:0,y:1.05,z:0}),from=V.add(eye,V.scale(V.norm({x:toss.x,y:0,z:toss.z}),.75));
    // Thrown forward (Minecraft Q); against a wall it falls at the feet instead of entering the block.
    if(!this.spawnDrop(s.id,n,this.physics.sight(eye,from)?{...from,y:from.y-.35}:V.add(actor.pos,{x:0,y:.4,z:0}),toss))return false;s.count-=n;if(!s.count){if(i.cursor===s)i.cursor=null;else i.slots[i.selected]=null;}return true;}
  }return false;
 }
 kill(actor,source){
  if(actor.dead)return;if(!actor.enemy&&!actor.speciesId&&!actor.boss)this.companions.unavailable(actor);actor.dead=true;Combat.resetCombo(actor.combat);actor.combat.state='dead';actor.combat.action=null;actor.respawn=CFG.respawn;this.emit('death',actor);
  if(actor.speciesId){this.physics.removeBody(actor);actor.body=null;if(actor.boss)this.completeBoss(actor,source);else for(const [id,count]of SPECIES[actor.speciesId].wild.loot)this.spawnDrop(id,count,actor.pos);this.clearDungeonIfEmpty(actor.structureKey,actor);}
  else{const i=actor.inventory;for(const s of [...i.slots,...i.grid,i.cursor,...Object.values(i.armor)])if(s)this.spawnDrop(s.id,s.count,actor.pos);actor.inventory=Inventory.empty();const b=this.physics.world.getRigidBody(actor.body);b.setBodyType(this.R.RigidBodyType.Fixed,true);}
 }
 // D-107 egg rule: a player's first kill of each boss species always drops its egg, later kills roll EGG_RULES.chance.
 completeBoss(actor,source){const killer=this.actors[source],player=killer&&!killer.enemy&&!killer.speciesId&&!killer.boss?killer:null,species=actor.speciesId,first=!this.progress.boss;if(player)RPG.gain(player,CFG.rpg.xp.boss,this,'combat');for(const [id,count]of BOSS_LOOT)this.spawnDrop(id,count,actor.pos);
  // Every kill also drops the boss's crown (0.35.1); into the killer's bag if the drop cap is reached, like the egg.
  const crown=SPECIES[species].boss.crown;if(crown&&!this.spawnDrop(crown,1,actor.pos)&&player)Inventory.addTo(player.inventory.slots,crown,1);
  const firstKey=player?'egg:'+player.id+':'+species:null,guaranteed=!!firstKey&&!this.progress[firstKey],egg=guaranteed||hash3(hashStr(actor.id),this.tick,this.terrain.seed,4127)%100<EGG_RULES.chance;
  if(guaranteed)this.progress[firstKey]=true;if(egg&&!this.spawnDrop(SPECIES[species].egg,1,actor.pos)&&player)Inventory.addTo(player.inventory.slots,SPECIES[species].egg,1);
  if(actor.structureKey)this.progress['boss:'+actor.structureKey]=this.tick;this.progress.boss=true;this.progress.victories=(this.progress.victories||0)+1;this.emit('victory',actor,{source,species,first,egg,guaranteed});}
 clearDungeonIfEmpty(structureKey,sourceActor){
  if(!structureKey)return false;const key='dungeon:'+structureKey;if(this.progress[key]!=='active')return false;
  if(Object.values(this.actors).some(a=>a.speciesId&&!a.dead&&a.structureKey===structureKey))return false;
  this.progress[key]='cleared';this.progress['cleared:'+structureKey]=true;this.progress.clearedDungeons=(this.progress.clearedDungeons||0)+1;
  const pos=sourceActor?.pos||{x:0,y:0,z:0};for(const p of Object.values(this.actors).filter(p=>!p.enemy&&!p.speciesId&&!p.boss&&!p.dead&&!p.suspended&&V.len(V.sub(p.pos,pos))<48).sort((a,b)=>cmp(a.id,b.id)))RPG.gain(p,CFG.rpg.dungeonClear,this,'dungeon');
  this.emit('dungeon-clear',sourceActor||{id:'structure:'+structureKey,pos,enemy:false},{structureKey});return true;
 }

 tickFurnaces(){for(const key of Object.keys(this.furnaces).sort(cmp)){
  const f=this.furnaces[key],[input,fuel,output]=f.slots,r=input?SMELT[input.id]:null,can=!!r&&(!output||output.id===r.out&&output.count<Inventory.limit(output.id));
  if(f.burn>0)f.burn=Math.max(0,f.burn-CFG.stepMs);
  if(can&&f.burn<=0&&fuel&&FUELS[fuel.id]){f.burn=FUELS[fuel.id];f.burnTotal=f.burn;if(--fuel.count===0)f.slots[1]=null;}
  if(!r||f.recipe&&f.recipe!==input.id){f.progress=0;}f.recipe=input?.id||null;
  if(can&&f.burn>0){f.progress+=CFG.stepMs;if(f.progress>=r.ms){f.progress-=r.ms;if(--input.count===0)f.slots[0]=null;if(output)output.count++;else f.slots[2]={id:r.out,count:1};this.markItem(r.out);}}
  else f.progress=Math.max(0,f.progress-CFG.stepMs*2);
 }}
 ai(actor){const players=Object.values(this.actors).filter(a=>!a.enemy&&!a.speciesId&&!a.boss&&!a.dead&&!a.suspended).sort((a,b)=>V.len(V.sub(a.pos,actor.pos))-V.len(V.sub(b.pos,actor.pos))||cmp(a.id,b.id)),def=actor.boss?SPECIES[actor.speciesId].boss:SPECIES[actor.speciesId]?.wild;
  // A structure boss guards its home: it engages the nearest player inside the aggro radius and lets go past the leash.
  if(actor.boss&&actor.wildState!=='retaliating'){const home=actor.homePos||actor.pos,next=players.find(p=>V.len(V.sub(p.pos,home))<=CFG.creatures.bossAggro&&Math.abs(p.pos.y-home.y)<8);if(next){actor.wildState='retaliating';actor.enemy=true;actor.targetId=next.id;}}
  let target=actor.wildState==='retaliating'?this.actors[actor.targetId]:null;
  if(actor.wildState==='retaliating'&&(!target||target.dead||target.suspended||V.len(V.sub(target.pos,actor.boss?actor.homePos||actor.pos:actor.pos))>(actor.boss?CFG.creatures.bossLeash:CFG.creatures.leash))){actor.targetId=null;actor.wildState='neutral';actor.enemy=false;target=null;const c=actor.combat;if(c.state==='attack'){Combat.resetCombo(c);c.state='idle';c.elapsed=0;c.action=null;}}
  if(!target){if(actor.speciesId){const delta=V.sub(actor.homePos||actor.pos,actor.pos),dist=V.len(delta),flat=V.norm({x:delta.x,y:0,z:delta.z}),speed=dist>1.4?Math.min(def.speed*.45,dist):0;return{move:flat,speed,jump:false};}return{move:{x:0,y:0,z:0},speed:0,jump:false};}
  const delta=V.sub(target.pos,actor.pos),dist=V.len(delta),flat=V.norm({x:delta.x,y:0,z:delta.z}),c=actor.combat;actor.facing=V.norm({x:delta.x,y:delta.y,z:delta.z});actor.yaw=Math.atan2(-flat.x,-flat.z);
  actor.ai.cooldown=Math.max(0,actor.ai.cooldown-CFG.stepMs);let speed=def.speed,move=flat;if(dist>30||dist<def.reach*.82)speed=0;
  if(c.state==='attack'){speed=0;if(c.state==='attack'&&c.action.kind==='lunge'&&c.elapsed>c.action.wind&&c.elapsed<c.action.wind+c.action.active){move=c.action.dir;speed=8;}}
  if(c.state==='idle'&&actor.ai.cooldown<=0&&dist<=def.reach&&this.physics.sight(V.add(actor.pos,{x:0,y:actor.offset,z:0}),V.add(target.pos,{x:0,y:1,z:0}),actor)){
   const action={name:'enemy',kind:'swing',weapon:actor.kind,combo:0,wind:def.wind,active:def.active,recovery:def.recovery,reach:def.reach,arc:1.7,damage:def.damage,heavy:!!def.heavy,impulse:actor.boss?8:4.5,dir:{...actor.facing},hits:[],fired:false};
   if(actor.boss){actor.ai.phase=actor.hp<actor.maxHp*.5?2:1;const n=(actor.ai.pattern++)%5;const patterns=[{kind:'swing',arc:2.2,wind:900},{kind:'slam',arc:.35,damage:50,heavy:true,wind:1250},{kind:'lunge',reach:6,active:700,wind:1050},{kind:'spit',reach:18,wind:800},{kind:'burst',reach:5.5,wind:1500,damage:45}];Object.assign(action,patterns[n]);if(actor.ai.phase===2){action.recovery=Math.round(action.recovery*.75);action.damage=statStep(action.damage*1.25,STAT_SCALE.damage);}}
   if(Combat.start(actor,action,this))actor.ai.cooldown=500;
  }
  const blocked=speed>0&&!this.physics.sight(V.add(actor.pos,{x:0,y:.7,z:0}),V.add(actor.pos,{x:flat.x*1.2,y:.7,z:flat.z*1.2}),actor);return{move,speed,jump:blocked};
 }
 spawnCreature(players){if(!players.length)return;const candidates=Object.values(this.actors).filter(a=>a.speciesId&&!a.boss&&!a.dead&&!a.structureKey);for(const c of candidates)if(!c.structureKey&&players.every(p=>V.len(V.sub(c.pos,p.pos))>CFG.creatures.despawnRadius)){this.physics.removeBody(c);delete this.actors[c.id];}const active=candidates.filter(c=>this.actors[c.id]);if(active.length>=CFG.creatures.maxWild)return;
  const counts=new Map(players.map(p=>[p.id,active.filter(c=>V.len(V.sub(c.pos,p.pos))<CFG.creatures.encounterRadius).length]));const player=players.filter(p=>(counts.get(p.id)||0)<CFG.creatures.perPlayer).sort((a,b)=>(counts.get(a.id)||0)-(counts.get(b.id)||0)||cmp(a.id,b.id))[0];if(!player)return;
  const seed=hash3(this.tick,0,hashStr(player.id),this.terrain.seed+1181),start=seed%4096;
  if(this.terrain.realm(player.pos.x,player.pos.y,player.pos.z)==='cave'){this.spawnCaveCreature(players,player,seed);return;}
  for(let attempt=0;attempt<16;attempt++){const angle=((start+attempt*1597)%4096)/4096*TAU,radius=8+((seed>>>(attempt%4*6))%6000)/1000,x=Math.floor(player.pos.x+Math.cos(angle)*radius),z=Math.floor(player.pos.z+Math.sin(angle)*radius),h=this.terrain.height(x,z),realm=BIOMES[this.terrain.climate(x,z).id].realm;
   if(!realm||h<CFG.sea+1||h>19||Math.abs(h+1.1-player.pos.y)>3.5||Math.hypot(x,z)<8)continue;let low=h,high=h;for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const n=this.terrain.height(x+dx,z+dz);low=Math.min(low,n);high=Math.max(high,n);}if(high-low>2)continue;
   const px=x+.5,pz=z+.5,y=h+1.1;if(this.terrain.get(x,h,z)===0||this.terrain.get(x,h+1,z)!==0||this.terrain.get(x,h+2,z)!==0||this.terrain.get(x,h+3,z)!==0)continue;
   if(players.some(p=>Math.hypot(p.pos.x-px,p.pos.z-pz)<7.5))continue;if(Object.values(this.actors).some(a=>!a.dead&&Math.hypot(a.pos.x-px,a.pos.z-pz)<5.5))continue;
   this.addCreature(REALMS[realm].species,{x:px,y,z:pz});return;
  }
 }
 // Underground the cave realm spawns rock chicks on a cave floor near the player's depth (open cell with a solid sole).
 spawnCaveCreature(players,player,seed){
  for(let attempt=0;attempt<24;attempt++){const h=hash3(seed,attempt,7,this.terrain.seed+1187),angle=(h%4096)/4096*TAU,radius=7+((h>>>12)%7000)/1000,x=Math.floor(player.pos.x+Math.cos(angle)*radius),z=Math.floor(player.pos.z+Math.sin(angle)*radius);
   for(let dy=-3;dy<=3;dy++){const y=Math.floor(player.pos.y)+dy;if(!this.terrain.isSolid(this.terrain.get(x,y-1,z))||[0,1,2].some(k=>this.terrain.get(x,y+k,z)!==0)||this.terrain.realm(x+.5,y,z+.5)!=='cave')continue;
    const pos={x:x+.5,y:y+.1,z:z+.5};if(players.some(p=>V.len(V.sub(p.pos,pos))<6)||Object.values(this.actors).some(a=>!a.dead&&V.len(V.sub(a.pos,pos))<4.5))continue;
    this.addCreature(REALMS.cave.species,pos);return;}}
 }
 tickDungeonEncounters(players){
  for(const p of players)for(const structure of this.terrain.structuresNear(p.pos,44)){
   if(structure.type!=='dungeon'||Math.abs(p.pos.y-(structure.y+1))>7)continue;
   const rooms=this.terrain.dungeonRooms(structure);if(!rooms.some(r=>Math.abs(p.pos.x-r.x)<r.r+9&&Math.abs(p.pos.z-r.z)<r.r+9))continue;
   const visited='dungeon:'+structure.key;if(this.progress[visited])continue;
   const theme=this.terrain.dungeonTheme(structure),slots=[rooms[0],rooms[1],rooms[3]].slice(0,CFG.creatures.dungeonPackSize);let spawned=0;
   for(let i=0;i<slots.length;i++){
    const room=slots[i];if(!room)continue;const pos={x:room.x+.5,y:structure.y+1.1,z:room.z+.5},x=Math.floor(pos.x),y=Math.floor(pos.y),z=Math.floor(pos.z);
    if(!this.terrain.isSolid(this.terrain.get(x,y-1,z))||this.terrain.isSolid(this.terrain.get(x,y,z))||this.terrain.isSolid(this.terrain.get(x,y+1,z))||this.terrain.isSolid(this.terrain.get(x,y+2,z)))continue;
    const choices=(theme.species||[]).filter(kind=>SPECIES[kind]);if(!choices.length)continue;const speciesId=choices[(i+Math.abs(structure.hash||0))%choices.length];if(this.addCreature(speciesId,pos,structure.key))spawned++;
   }
   if(!spawned)continue;this.progress[visited]='active';this.emit('dungeon-enter',{id:'structure:'+structure.key,pos:{x:structure.x,y:structure.y+1,z:structure.z},enemy:false},{name:theme.name,creatures:spawned});
  }
 }

 // Structure bosses wake when a player walks up to their structure, leave when every player is far away,
 // and come back EGG_RULES.respawnMs after a defeat (D-102/D-107).
 bossSpot(structure){if(structure.type==='dungeon'){const vault=this.terrain.dungeonRooms(structure)[5];return{x:vault.x+.5,y:structure.y+1.1,z:vault.z+.5};}return{x:structure.x+.5,y:structure.y+1.1,z:structure.z+.5};}
 bossSpecies(structure){return structure.type==='dungeon'?REALMS.cave.species:BOSS_STRUCTURES[structure.type]?.species||null;}
 tickBossStructures(players){
  for(const b of Object.values(this.actors).filter(a=>a.boss&&!a.dead).sort((a,b)=>cmp(a.id,b.id)))if(players.every(p=>V.len(V.sub(p.pos,b.pos))>CFG.creatures.despawnRadius)){this.physics.removeBody(b);delete this.actors[b.id];}
  for(const p of players)for(const structure of this.terrain.structuresNear(p.pos,CFG.creatures.bossTrigger+48)){const species=this.bossSpecies(structure);if(!species)continue;const spot=this.bossSpot(structure);
   if(Math.hypot(p.pos.x-spot.x,p.pos.z-spot.z)>CFG.creatures.bossTrigger||Math.abs(p.pos.y-spot.y)>8)continue;
   const defeated=this.progress['boss:'+structure.key];if(Number.isInteger(defeated)&&this.tick-defeated<ticksForMs(EGG_RULES.respawnMs))continue;
   const boss=this.addBoss(species,spot,structure.key);if(boss)this.emit('boss-spawn',boss,{species,structureKey:structure.key,structure:structure.type});}
 }
 // D-103: an egg block hatches in place into a baby owned by the player who set it down (who must be present).
 tickEggs(){for(const key of Object.keys(this.eggs).sort(cmp)){const e=this.eggs[key];if(this.tick<e.hatchTick)continue;
  if(this.terrain.get(e.x,e.y,e.z)!==BID[SPECIES[e.species].egg]){delete this.eggs[key];continue;}
  const owner=this.actors[e.owner];if(!owner||owner.suspended)continue;const unit=this.companions.hatch(owner,e);if(!unit)continue;
  this.terrain.set(e.x,e.y,e.z,0);delete this.eggs[key];this.progress.hatched=true;this.emit('egg-hatch',owner,{pos:{x:e.x+.5,y:e.y,z:e.z+.5},species:e.species,companionId:unit.id,name:SPECIES[e.species].name});}}
 // D-106 regrowth: a block taken by chest labor grows back in place regrowTicks later, once its cell is empty of players
 // and units. Anything the player put there first cancels it.
 tickRegrow(){for(const key of Object.keys(this.regrow).sort(cmp)){const g=this.regrow[key];if(this.tick<g.tick)continue;if(this.terrain.get(g.x,g.y,g.z)!==0){delete this.regrow[key];continue;}
  if(this.physics.overlapActors({x:g.x+.5,y:g.y+.5,z:g.z+.5},.49).length||this.companions.all().some(u=>u.location==='ranch'&&[u.cell,u.next].some(c=>c&&c.x===g.x&&c.y===g.y&&c.z===g.z)))continue;
  if(this.terrain.set(g.x,g.y,g.z,g.id)===false)continue;delete this.regrow[key];this.emit('regrow',{id:'regrow:'+key,pos:{x:g.x+.5,y:g.y,z:g.z+.5},enemy:false},{blockId:g.id,color:BLOCKS[g.id].color});}}
 // 0.35.1 realm hazard (doc §3.3): armor below the realm's tier in 동굴(추위) or 균류 숲(포자 독) drains `damage` HP every
 // `everyTicks` ticks of exposure, never below `floor`. Leaving the hazard (or wearing the tier) resets the count.
 tickHazards(players){for(const p of players){const s=Gear.status(p,this.terrain),h=s.hazard?GEAR_RULES.hazards[s.hazard]:null;if(!h){p.hazardTicks=0;continue;}
  p.hazardTicks=(p.hazardTicks||0)+1;if(p.hazardTicks<h.everyTicks)continue;p.hazardTicks=0;
  if(p.hp>h.floor){const before=p.hp;p.hp=Math.max(h.floor,p.hp-h.damage);this.emit('hazard',p,{hazard:s.hazard,damage:before-p.hp});}}}
 tickCreatureEncounters(players){
  if(this.tick<this.nextSpawn)return;this.nextSpawn=this.tick+CFG.creatures.encounterCheckTicks;
  if(!this.night()&&this.tick>0&&this.tick%CFG.creatures.spawnTicks===0)this.spawnCreature(players);
  this.tickDungeonEncounters(players);this.tickBossStructures(players);
 }

 step(context){const started=performance.now();this.presentationSequence=0;this.silent=!!(context.recovering||context.replaying);const inputs=new Map(context.inputs.map(i=>[i.playerId,i]));
  const actors=Object.values(this.actors).sort((a,b)=>cmp(a.id,b.id)),playerInputs=new Map();
  for(const e of [...actors,...Object.values(this.drops),...Object.values(this.projectiles)])e.previous={...e.pos};
  for(const actor of actors){actor.anim+=CFG.stepMs;if(!actor.dead)continue;actor.respawn-=CFG.stepMs;if(actor.respawn<=0){if(actor.enemy||actor.speciesId||actor.boss){delete this.actors[actor.id];continue;}actor.dead=false;actor.hp=actor.maxHp;actor.combat=Combat.state();this.physics.world.getRigidBody(actor.body).setBodyType(this.R.RigidBodyType.Dynamic,true);this.physics.teleport(actor,this.terrain.spawn);}}
  this.physics.syncTerrain(Object.values(this.actors),Object.values(this.drops),Object.values(this.projectiles),this.tick);
  // Phase 1: deterministic actor-ID order for commands and ALL voxel edits.
  for(const actor of actors){if(actor.dead||actor.suspended||actor.enemy||actor.speciesId||actor.boss)continue;const entry=inputs.get(actor.id),input=entry?decodeInput(entry.input):neutralInput();if(actor.inventory.selected!==input.selected)actor.companionSlot=-1;actor.inventory.selected=input.selected;actor.facing=direction(input.yaw,input.pitch);
   for(const command of entry?.commands||[]){try{this.command(actor,decodeCommand(command.payload));}catch(e){this.emit('invalid-command',actor,{message:e.message});}}
   this.physics.flushTerrainChanges();
   const selected=Inventory.stats(actor).item,previous=actor.inputPrevious;
   if(input.enabled&&input.left&&!previous.left){const enemy=this.physics.aimEnemy(actor,Combat.weapon(actor,this).reach),block=this.aim(actor),canMine=actor.companionSlot<0&&(!selected?.weapon||!!selected?.tool),attackBusy=actor.combat.state==='attack';previous.primary=!input.attackOnly&&canMine&&block&&!enemy&&!attackBusy?'mine':'attack';}
   this.mine(actor,input.enabled&&(input.mine||input.left&&previous.primary==='mine'));
   if(input.enabled&&input.right&&!previous.right&&!selected?.weapon&&actor.companionSlot<0){const aimed=this.aim(actor);
    // Right-click works a gate or opens a storage chest before anything is placed against it (Minecraft order).
    if(aimed&&BLOCKS[aimed.id].gate)this.toggleGate(actor,aimed);else if(aimed&&BLOCKS[aimed.id].station==='chest')this.interact(actor);
    else if(selected?.throwable)this.throwPotion(actor);else if(selected?.id==='bucket'||selected?.id==='waterBucket')this.useBucket(actor);else this.place(actor);}
   this.physics.flushTerrainChanges();
   playerInputs.set(actor.id,{...input,left:input.left&&previous.primary==='attack',right:input.right&&(!!selected?.weapon||actor.companionSlot>=0)});previous.left=input.left;previous.right=input.right;if(!input.left)previous.primary='none';
  }
  this.companions.tick();this.tickEggs();this.tickRegrow();this.physics.flushTerrainChanges();
  this.terrain.water.step(actors.filter(a=>!a.enemy&&!a.speciesId&&!a.boss),this.tick);
  // Phase 2: movement/AI see the final terrain for this tick, independent of renderer jobs.
  for(const actor of Object.values(this.actors).sort((a,b)=>cmp(a.id,b.id))){if(actor.dead||actor.suspended)continue;const control=actor.enemy||actor.speciesId?this.ai(actor):Combat.updatePlayer(actor,playerInputs.get(actor.id)||neutralInput(),this);Combat.tick(actor,this);this.physics.control(actor,control.move,control.speed,control.jump,control.autoJump!==false,control.swimRise,control.swimDive);}
  // New shots/drops need support before their first integration.
  this.physics.syncTerrain(Object.values(this.actors),Object.values(this.drops),Object.values(this.projectiles),this.tick,false);
  this.physics.step(this);
  for(const actor of Object.values(this.actors))if(!actor.dead&&actor.pos.y<CFG.bottom-6)this.kill(actor,null);
  this.tickFurnaces();
  const players=Object.values(this.actors).filter(a=>!a.enemy&&!a.speciesId&&!a.boss&&!a.dead&&!a.suspended).sort((a,b)=>cmp(a.id,b.id));
  for(const id of Object.keys(this.drops).sort(cmp)){const d=this.drops[id];d.age+=CFG.stepMs;for(const p of players){if(d.age<(d.pickupMs??350)||V.len(V.sub(V.add(p.pos,{x:0,y:.6,z:0}),d.pos))>1.8)continue;const old=d.count;d.count=Inventory.addTo(p.inventory.slots,d.item,d.count);if(d.count<old){this.markItem(d.item);this.emit('pickup',p,{item:d.item,count:old-d.count});}if(!d.count)break;}
   if(!d.count||d.age>CFG.dropLife||d.pos.y<CFG.bottom-10){this.physics.removeBody(d);delete this.drops[id];}}
  for(const [id,s]of Object.entries(this.projectiles)){s.age+=CFG.stepMs;if(s.companionId){this.companions.updateThrow(s);continue;}if(s.potion){if(s.age>s.lifetime||s.pos.y<CFG.bottom)this.splashPotion(s);continue;}if(s.age>(s.lifetime??5000)||s.pos.y<CFG.bottom){this.companions.returned(s);this.physics.removeBody(s);delete this.projectiles[id];}}
  this.tickHazards(players);this.tickCreatureEncounters(players);
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
 meta(){return{companions:this.companions.snapshot(),version:SNAPSHOT_VERSION,seed:this.terrain.seed,tick:this.tick,epoch:this.epoch,sequence:this.sequence,actionSequence:this.actionSequence,actors:Object.values(this.actors).sort((a,b)=>cmp(a.id,b.id)),drops:Object.values(this.drops).sort((a,b)=>cmp(a.id,b.id)),projectiles:Object.values(this.projectiles).sort((a,b)=>cmp(a.id,b.id)),furnaces:Object.entries(this.furnaces).sort(([a],[b])=>cmp(a,b)),chests:Object.entries(this.chests).sort(([a],[b])=>cmp(a,b)),regrow:Object.values(this.regrow).sort((a,b)=>cmp(a.key,b.key)),eggs:Object.values(this.eggs).sort((a,b)=>cmp(a.key,b.key)),progress:this.progress,edits:this.terrain.snapshot(),fluid:this.terrain.water.snapshot(),terrainState:{editSerial:this.terrain.editSerial,physicsRevisions:[...this.terrain.physicsRevisions.entries()].sort(([a],[b])=>cmp(a,b))},nextSpawn:this.nextSpawn,physics:this.physics.metadata()};}
 save(){this.physics.flushTerrainChanges();const json=new TextEncoder().encode(JSON.stringify(this.meta())),phys=this.physics.snapshot(),out=new Uint8Array(12+json.length+phys.length),v=new DataView(out.buffer);v.setUint32(0,0x424C4D41,true);v.setUint32(4,json.length,true);v.setUint32(8,phys.length,true);out.set(json,12);out.set(phys,12+json.length);return out;}
 // One-time save migration, idempotent on current saves. Retired hostile kinds (<=0.27) and the 0.28-0.32 species
 // (shell, leaf) become the nearest new species (LEGACY_SPECIES); the old altar-summoned warden boss and the old
 // neutral-candidate field are retired. Owned units keep their ID and placement and become adults of grade 1.
 migrateLegacyActors(meta){
   const retained=[],retiredBodies=[];for(const actor of meta.actors){
    if(actor.dead&&(actor.boss||actor.enemy&&!actor.speciesId))continue;
    if(actor.boss&&!SPECIES[actor.speciesId]?.boss){if(actor.body!==null&&actor.body!==undefined)retiredBodies.push(actor);continue;}
    const legacy=!SPECIES[actor.speciesId]&&(actor.speciesId||actor.candidateCompanion||actor.enemy),speciesId=legacy?LEGACY_SPECIES[actor.speciesId]||LEGACY_SPECIES[actor.candidateCompanion]||LEGACY_SPECIES[actor.kind]||'rock-chick':null;
    if(speciesId){const def=SPECIES[speciesId].wild,ratio=actor.maxHp>0?clamp(actor.hp/actor.maxHp,0,1):1;actor.speciesId=speciesId;actor.kind=speciesId;actor.wildState='neutral';actor.enemy=false;actor.targetId=null;actor.homePos=actor.homePos||{...actor.pos};actor.rpg=null;actor.combat=Combat.state();actor.hp=def.hp*ratio;actor.maxHp=def.hp;}
    delete actor.candidateCompanion;
    // An owned unit's in-progress strike was described with the retired species; restart it from idle.
    if(actor.combat?.action?.companionId&&!SPECIES[actor.combat.action.companionKind]){Combat.resetCombo(actor.combat);actor.combat.state='idle';actor.combat.elapsed=0;actor.combat.action=null;}
    retained.push(actor);
   }
   for(const u of Object.values(meta.companions?.units||{})){if(!SPECIES[u.kind])u.kind=LEGACY_SPECIES[u.kind]||'root';u.stage??='adult';u.grade??=1;u.yaw??=0;
    // The new species' gather list may not contain an old target block: drop the target and search again.
    if(u.target&&!SPECIES[u.kind].capabilities.gather.blocks.includes(BLOCKS[u.target.id]?.id)){u.target=null;u.progress=0;}}
   for(const shot of meta.projectiles||[])if(shot.companionKind&&!SPECIES[shot.companionKind])shot.companionKind=LEGACY_SPECIES[shot.companionKind]||'rock-chick';
   meta.retiredBodies=retiredBodies;meta.eggs??=[];
   meta.actors=retained;meta.progress||={};for(const [key,value]of Object.entries(meta.progress))if(key.startsWith('dungeon:')&&value==='active'&&!retained.some(a=>a.speciesId&&!a.dead&&a.structureKey===key.slice(8)))delete meta.progress[key];
  }
  // 0.29.0 removed charge, guard, stamina, poise, and weapon skills. Same-version saves may still
  // carry those fields; drop them and return endurance points so old worlds load unchanged otherwise.
  retireCombatResources(meta){
   for(const actor of meta.actors||[]){delete actor.maxPoise;const c=actor.combat;
    if(c){for(const key of ['stamina','poise','charge','right','secondary'])delete c[key];if(['charge','secondary','guard','stagger'].includes(c.state)){c.state='idle';c.elapsed=0;c.action=null;}}
    const skills=actor.rpg?.skills;if(skills&&Object.hasOwn(skills,'endurance')){if(Number.isInteger(skills.endurance)&&Number.isInteger(actor.rpg.points))actor.rpg.points+=Math.max(0,skills.endurance);delete skills.endurance;}
   }
   for(const shot of meta.projectiles||[])for(const key of ['poise','cost','tier','staminaRefunded','name','combo'])delete shot[key];
  }
  // 0.31.0 trimmed equipment: greatsword, dagger, bow, shield, arrows, shovels, gold weapons/tools/armor and
  // leggings are gone. Same-version saves drop those stacks wherever they sit; retired drops and in-flight
  // player arrows are listed in meta.retiredBodies so load() can remove their physics bodies.
  retireEquipment(meta){
   const retired=id=>RETIRED_ITEM_IDS.has(id),keep=s=>s&&retired(s.id)?null:s,retiredBodies=meta.retiredBodies||[];
   for(const actor of meta.actors||[]){const i=actor.inventory;
    if(i){for(const area of ['slots','grid'])if(Array.isArray(i[area]))i[area]=i[area].map(keep);i.cursor=keep(i.cursor??null);
     if(i.armor){delete i.armor.legs;for(const k of ARMOR_SLOTS)i.armor[k]=keep(i.armor[k]??null);}}
    const c=actor.combat;if(c&&(retired(c.comboWeapon)||retired(c.action?.weaponKey))){Combat.resetCombo(c);if(c.state==='attack'){c.state='idle';c.elapsed=0;c.action=null;}}
   }
   for(const [,f]of meta.furnaces||[])if(Array.isArray(f?.slots))f.slots=f.slots.map(keep);
   for(const b of Object.values(meta.companions?.bases||{}))if(Array.isArray(b.slots))b.slots=b.slots.map(keep);
   for(const u of Object.values(meta.companions?.units||{}))if(u.cargo){const list=(Array.isArray(u.cargo)?u.cargo:[u.cargo]).filter(s=>!retired(s?.id));u.cargo=list.length?list:null;}
   meta.drops=(meta.drops||[]).filter(d=>retired(d.item)?(retiredBodies.push(d),false):true);
   meta.projectiles=(meta.projectiles||[]).filter(shot=>{if(shot.weapon!=='bow')return true;if(shot.companionId){shot.weapon='ball';return true;}retiredBodies.push(shot);return false;});
   meta.retiredBodies=retiredBodies;
  }
  // 0.34.0 replaced the base work menu (거점 작업 배치, base storage, quick collect) with ranching and chest labor (D-106).
  // Same-version saves: 'reserve' and 'work' units move to the ranch where they stand (a working unit's physics ball is
  // retired), their cargo and every stored base stack go to meta.retiredBaseStorage, which load() puts into a storage
  // chest placed at the old base spot (or the owner's bag, or the ground). Ranch walk fields start empty.
  retireBaseWork(meta){const c=meta.companions;if(!c)return;const retiredBodies=meta.retiredBodies||[],storage=[];
   for(const [owner,b]of Object.entries(c.bases||{}).sort(([a],[b])=>cmp(a,b)))storage.push({owner,pos:b?.pos?{...b.pos}:null,stacks:(Array.isArray(b?.slots)?b.slots:[]).filter(s=>s&&ITEMS[s.id]&&Number.isInteger(s.count)&&s.count>0).map(s=>({id:s.id,count:s.count}))});
   delete c.bases;
   for(const u of Object.values(c.units||{}).sort((a,b)=>cmp(a.id,b.id))){
    if(u.cargo&&!('cell' in u)){let entry=storage.find(s=>s.owner===u.owner);if(!entry)storage.push(entry={owner:u.owner,pos:null,stacks:[]});for(const s of [].concat(u.cargo))entry.stacks.push({...s});u.cargo=null;}
    // 0.35.1: cargo is the list of stacks one labor harvest yielded; a 0.34 single stack becomes a one-stack list.
    if(u.cargo&&!Array.isArray(u.cargo))u.cargo=[u.cargo];
    if(u.location==='reserve'||u.location==='work'){if(u.body!==null&&u.body!==undefined)retiredBodies.push({body:u.body,collider:u.collider});u.body=null;u.collider=null;
     u.location='ranch';u.slot=null;if(['travel','gather','carry'].includes(u.phase))u.phase='idle';u.target=null;u.progress=0;}
    if(u.pending&&['reserve','work'].includes(u.pending.location))u.pending={location:'ranch'};
    delete u.retry;u.fed??=0;if(!('cell' in u))Object.assign(u,Companions.ranchState(null));}
   meta.retiredBodies=retiredBodies;meta.retiredBaseStorage=storage.filter(s=>s.stacks.length);meta.chests??=[];meta.regrow??=[];
  }
  // Runs after load() installs the restored world: base storage from retireBaseWork lands in a chest at the old base.
  restoreBaseStorage(list){for(const entry of list||[]){const owner=this.actors[entry.owner],stacks=entry.stacks.map(s=>({...s}));let placed=null;
    if(entry.pos){const x=Math.floor(entry.pos.x),z=Math.floor(entry.pos.z),y0=Math.floor(entry.pos.y+.05);
     for(const y of [y0,y0+1,y0+2,y0+3]){const key=blockKey(x,y,z);if(this.terrain.get(x,y,z)!==0||!this.terrain.isSolid(this.terrain.get(x,y-1,z))||this.chests[key]||this.terrain.set(x,y,z,BID.storageChest)===false)continue;this.chests[key]={slots:Array(RANCH_RULES.chestSlots).fill(null)};placed={key,x,y,z};break;}}
    const left=[];for(const s of stacks){const rest=placed?Inventory.addTo(this.chests[placed.key].slots,s.id,s.count):s.count;if(rest)left.push({id:s.id,count:rest});}
    for(const s of left){const rest=owner?Inventory.addTo(owner.inventory.slots,s.id,s.count):s.count;if(rest)this.spawnDrop(s.id,rest,placed?{x:placed.x+.5,y:placed.y+1,z:placed.z+.5}:owner?.pos||entry.pos||this.terrain.spawn);}
    this.progress['baseStorage:'+entry.owner]=placed?placed.key:'inventory';}
   this.physics.flushTerrainChanges();}
  parse(bytes){if(!(bytes instanceof Uint8Array)||bytes.length<12||bytes.length>32*1024*1024)throw Error('저장 크기 오류');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),jl=v.getUint32(4,true),pl=v.getUint32(8,true);if(v.getUint32(0,true)!==0x424C4D41||12+jl+pl!==bytes.length||!pl)throw Error('물리 상태 없는 저장 또는 손상된 파일');const m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(12,12+jl)));this.migrateLegacyActors(m);this.retireCombatResources(m);this.retireEquipment(m);this.retireBaseWork(m);
  if(m.version!==SNAPSHOT_VERSION)throw Error('현재 '+SNAPSHOT_VERSION+' 저장만 지원합니다. 이전 버전은 새 월드가 필요합니다.');
  if(!Number.isInteger(m.seed)||!Number.isInteger(m.tick)||m.tick<0||m.actors.length>32||m.drops.length>300||m.projectiles.length>80)throw Error('저장 버전 또는 용량 불일치');if(!Array.isArray(m.eggs)||m.eggs.length>64||m.eggs.some(e=>!e||!['x','y','z','placedTick','hatchTick'].every(k=>Number.isInteger(e[k]))||e.key!==blockKey(e.x,e.y,e.z)||!SPECIES[e.species]||typeof e.owner!=='string'))throw Error('알 상태 손상');
  if(!Array.isArray(m.chests)||m.chests.length>4096||m.chests.some(([key,c])=>typeof key!=='string'||!Array.isArray(c?.slots)||c.slots.length!==RANCH_RULES.chestSlots||!c.slots.every(Inventory.validateStack.bind(Inventory)))||!Array.isArray(m.regrow)||m.regrow.length>512||m.regrow.some(g=>!g||!['x','y','z','id','tick'].every(k=>Number.isInteger(g[k]))||g.key!==blockKey(g.x,g.y,g.z)||!BLOCKS[g.id]))throw Error('상자·재생 상태 손상');const ids=new Set();for(const a of m.actors){if(ids.has(a.id)||a.enemy&&!a.speciesId&&!a.boss||!a.pos||!Object.values(a.pos).every(Number.isFinite)||!Inventory.validate(a.inventory)||!a.combat||(!a.enemy&&!a.speciesId&&!a.boss&&(!a.rpg||!Number.isInteger(a.rpg.level)||!Number.isInteger(a.rpg.xp)||!Number.isInteger(a.rpg.points)||!a.rpg.skills||Object.keys(RPG_SKILLS).some(k=>!Number.isInteger(a.rpg.skills[k]))))||!Number.isFinite(a.hp))throw Error('배우 상태 손상');ids.add(a.id);}Companions.validate(m.companions,m.actors,m.projectiles);return{meta:m,physics:bytes.subarray(12+jl)};
 }
 load(bytes){const {meta:m,physics:payload}=this.parse(bytes),terrain=VoxelWorld.restore(m.seed,m.edits);
  terrain.editSerial=m.terrainState?.editSerial??m.edits.length;terrain.physicsRevisions=new Map(m.terrainState?.physicsRevisions||[]);
  terrain.water.restore(m.fluid);const physics=Physics.restore(this.R,terrain,payload,m.physics);
  try{for(const e of m.retiredBodies)if(physics.world.getRigidBody(e.body))physics.removeBody(e);for(const a of m.actors){if(a.body===null)continue;if(!physics.world.getRigidBody(a.body))throw Error('물리 배우 매핑 손상');}for(const e of [...m.drops,...m.projectiles,...Object.values(m.companions?.units||{}).filter(u=>u.body!==null)]){const b=physics.world.getRigidBody(e.body);if(!b||!physics.world.getCollider(e.collider))throw Error('물리 객체 매핑 손상');}
   for(const u of Object.values(m.companions?.units||{}).filter(u=>u.body!==null)){const tag=physics.tags.get(u.collider),col=physics.world.getCollider(u.collider);if(tag?.type!=='companion'||tag.id!==u.id||col?.parent()?.handle!==u.body)throw Error('동료 물리 소유권 손상');}
  }catch(e){physics.free();throw e;}
  // A Rapier snapshot owns its saved timestep. Rebase tick-based clocks only when that rate changes.
  const savedStepMs=Math.round(physics.world.timestep*1e6)/1000;
  if(Math.abs(savedStepMs-CFG.stepMs)>.001){const scale=savedStepMs/CFG.stepMs,toTick=t=>t<0?t:Math.round(t*scale);
   m.tick=toTick(m.tick);m.nextSpawn=toTick(m.nextSpawn);terrain.water.lastSeedTick=toTick(terrain.water.lastSeedTick);
   physics.lastPrefetchTick=toTick(physics.lastPrefetchTick);for(const entry of physics.loaded.values())entry.until=toTick(entry.until);
   physics.world.timestep=CFG.stepMs/1000;
  }
  this.physics.free();this.terrain=terrain;this.physics=physics;this.tick=m.tick;this.epoch=m.epoch;this.sequence=m.sequence;this.actionSequence=m.actionSequence;this.actors=Object.fromEntries(m.actors.map(a=>[a.id,a]));this.drops=Object.fromEntries(m.drops.map(a=>[a.id,a]));this.projectiles=Object.fromEntries(m.projectiles.map(a=>[a.id,a]));this.furnaces=Object.fromEntries(m.furnaces);this.chests=Object.fromEntries(m.chests);this.regrow=Object.fromEntries(m.regrow.map(g=>[g.key,g]));this.eggs=Object.fromEntries(m.eggs.map(e=>[e.key,e]));this.progress=m.progress;this.nextSpawn=m.nextSpawn??(this.tick+CFG.creatures.encounterCheckTicks);this.companions=new Companions(this,m.companions);for(const a of Object.values(this.actors))a.companionSlot??=-1;this.effects=[];this.restoreBaseStorage(m.retiredBaseStorage);this.effects=[];this.revision++;
 }
 adapter(){return{save:()=>this.save(),load:b=>this.load(b),validateSnapshot:(b,c)=>{try{const m=this.parse(b).meta;return(c.tick===undefined||m.tick===c.tick)&&(!c.players||JSON.stringify(m.actors.filter(a=>!a.enemy&&!a.speciesId&&!a.boss).map(a=>a.id).sort())===JSON.stringify([...c.players].sort()));}catch{return false;}},step:c=>this.step(c),applyMembership:c=>this.applyMembership(c)};}
 free(){this.physics.free();}
}
function neutralInput(){return{enabled:false,left:false,right:false,roll:false,jump:false,sprint:false,mine:false,attackOnly:false,swimRise:false,swimDive:false,x:0,z:0,yaw:0,pitch:0,selected:0};}
function encodeInputObject(i){const b=new Uint8Array(CFG.net.inputSize),v=new DataView(b.buffer);let flags=(i.enabled?1:0)|(i.left?2:0)|(i.right?4:0)|(i.roll?8:0)|(i.jump?16:0)|(i.sprint?32:0)|(i.mine?64:0)|(i.attackOnly?128:0)|(i.swimRise?256:0)|(i.swimDive?512:0);v.setUint16(0,flags,true);v.setInt8(2,Math.round(clamp(i.x,-1,1)*127));v.setInt8(3,Math.round(clamp(i.z,-1,1)*127));v.setInt16(4,Math.round(((i.yaw%(TAU))+TAU)%TAU/TAU*32767),true);v.setInt16(6,Math.round(clamp(i.pitch,-1.5,1.5)/1.5*32767),true);b[8]=i.selected|0;return b;}
function decodeInput(b){if(!b||b.length!==CFG.net.inputSize)return neutralInput();const v=new DataView(b.buffer,b.byteOffset,b.byteLength),f=v.getUint16(0,true);return{enabled:!!(f&1),left:!!(f&2),right:!!(f&4),roll:!!(f&8),jump:!!(f&16),sprint:!!(f&32),mine:!!(f&64),attackOnly:!!(f&128),swimRise:!!(f&256),swimDive:!!(f&512),x:v.getInt8(2)/127,z:v.getInt8(3)/127,yaw:v.getInt16(4,true)/32767*TAU,pitch:v.getInt16(6,true)/32767*1.5,selected:clamp(b[8],0,8)};}
const encodeCommand=c=>new TextEncoder().encode(JSON.stringify(c));
function decodeCommand(b){if(b.byteLength>2048)throw Error('명령 크기');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));}



