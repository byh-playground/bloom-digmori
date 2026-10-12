/* Inventory: 슬롯/커서/제작 상태만 소유한다. UI는 명령을 제출한다. */
class Inventory {
 static empty(){return{slots:Array(36).fill(null),grid:Array(9).fill(null),cursor:null,armor:{helmet:null,chest:null,legs:null,boots:null},selected:0,station:null};}
 static limit(id){return ITEMS[id]?.stack||0;}
 static validateStack(s){return s===null||!!(s&&ITEMS[s.id]&&Number.isInteger(s.count)&&s.count>0&&s.count<=this.limit(s.id));}
 static validate(i){return !!i&&Array.isArray(i.slots)&&i.slots.length===36&&i.slots.every(this.validateStack.bind(this))&&Array.isArray(i.grid)&&i.grid.length===9&&i.grid.every(this.validateStack.bind(this))&&this.validateStack(i.cursor)&&Number.isInteger(i.selected)&&i.selected>=0&&i.selected<9&&['helmet','chest','legs','boots'].every(k=>this.validateStack(i.armor[k])&&(!i.armor[k]||ITEMS[i.armor[k].id].armor===k));}
 static count(i,id){return i.slots.reduce((n,s)=>n+(s?.id===id?s.count:0),0);}
 static addTo(slots,id,n){let left=n;const max=this.limit(id);if(!max||!Number.isInteger(n)||n<0)return n;
  for(const s of slots)if(s?.id===id&&left){const take=Math.min(max-s.count,left);s.count+=take;left-=take;}
  for(let j=0;j<slots.length&&left;j++)if(!slots[j]){const take=Math.min(max,left);slots[j]={id,count:take};left-=take;}return left;}
 static takeFrom(slots,id,n){if(slots.reduce((t,s)=>t+(s?.id===id?s.count:0),0)<n)return false;for(let j=slots.length-1;j>=0&&n;j--){const s=slots[j];if(s?.id!==id)continue;const k=Math.min(n,s.count);s.count-=k;n-=k;if(!s.count)slots[j]=null;}return true;}
 static selected(i){return i.slots[i.selected];}
 static area(actor,area,sim){const i=actor.inventory;if(area==='bag')return i.slots;if(area==='grid')return i.grid;
  if(area==='furnace'&&i.station&&sim.stationInReach(actor,i.station,'furnace'))return sim.furnaces[i.station]?.slots||null;return null;}
 static click(actor,command,sim){const i=actor.inventory,area=command.area,index=command.index;let target;
  if(area==='armor'){if(!['helmet','chest','legs','boots'].includes(index))return false;target=i.armor;}else{target=this.area(actor,area,sim);if(!target||!Number.isInteger(index)||index<0||index>=target.length)return false;
    if(area==='grid'&&!sim.stationInReach(actor,i.station,'craft')&&![0,1,3,4].includes(index))return false;}
  const stack=target[index],held=i.cursor,accept=s=>!s||area==='armor'?(!s||ITEMS[s.id].armor===index):area==='furnace'?(index===0?!!SMELT[s.id]:index===1?!!FUELS[s.id]:false):true;
  if(command.shift&&stack&&area!=='grid'){
   let range=area==='bag'? (index<9?i.slots.slice(9):i.slots.slice(0,9)):i.slots.slice();let left=this.addTo(range,stack.id,stack.count);
   if(left===stack.count)return false;
   if(area==='bag'){const off=index<9?9:0;for(let j=0;j<range.length;j++)i.slots[off+j]=range[j];}else i.slots=range;
   if(left)target[index]={id:stack.id,count:left};else target[index]=null;return true;
  }
  if(area==='furnace'&&index===2){if(!stack||held&&(held.id!==stack.id||held.count>=this.limit(held.id)))return false;const n=Math.min(stack.count,held?this.limit(held.id)-held.count:this.limit(stack.id));if(held)held.count+=n;else i.cursor={id:stack.id,count:n};stack.count-=n;if(!stack.count)target[index]=null;return true;}
  if(command.button===2){
   if(!held&&stack){const n=Math.ceil(stack.count/2);i.cursor={id:stack.id,count:n};stack.count-=n;if(!stack.count)target[index]=null;return true;}
   if(!held||!accept(held))return false;
   if(!stack)target[index]={id:held.id,count:1};else if(stack.id===held.id&&stack.count<this.limit(stack.id))stack.count++;else return false;
   if(--held.count===0)i.cursor=null;return true;
  }
  if(!held){i.cursor=stack;target[index]=null;return!!stack;}
  if(!accept(held))return false;
  if(!stack){target[index]=held;i.cursor=null;return true;}
  if(stack.id===held.id){const n=Math.min(this.limit(stack.id)-stack.count,held.count);stack.count+=n;held.count-=n;if(!held.count)i.cursor=null;return n>0;}
  target[index]=held;i.cursor=stack;return true;
 }
 /** Double-click matching stack: collect from bag/grid up to stack cap, replay safe. */
 static collect(actor,c,sim){const i=actor.inventory,held=i.cursor;if(!held)return false;const max=this.limit(held.id);if(held.count>=max)return false;
  const areas=[i.slots,i.grid];if(i.station&&sim.stationInReach(actor,i.station,'furnace'))areas.push(sim.furnaces[i.station]?.slots||[]);
  for(const arr of areas)for(let k=0;k<arr.length&&held.count<max;k++){if(arr===i.grid&&!sim.stationInReach(actor,i.station,'craft')&&![0,1,3,4].includes(k))continue;if(arr.length===3&&k===2)continue;const slot=arr[k];if(!slot||slot.id!==held.id)continue;const n=Math.min(max-held.count,slot.count);held.count+=n;slot.count-=n;if(!slot.count)arr[k]=null;}return true;
 }
 /** Minecraft cursor-stack drag distribution: left evenly, right one per cell. */
 static distribute(actor,command,sim){const i=actor.inventory,held=i.cursor;
  if(!held||!Array.isArray(command.targets)||command.targets.length<2||command.targets.length>45)return false;
  const targets=[],seen=new Set();
  for(const t of command.targets){if(!t||typeof t.area!=='string')return false;
   const key=t.area+':'+t.index;if(seen.has(key))continue;seen.add(key);
   const arr=t.area==='armor'?i.armor:this.area(actor,t.area,sim),index=t.index;
   if(!arr)return false;
   if(t.area==='armor'){if(!['helmet','chest','legs','boots'].includes(index)||ITEMS[held.id].armor!==index)continue;}
   else if(!Number.isInteger(index)||index<0||index>=arr.length)continue;
   if(t.area==='grid'&&!sim.stationInReach(actor,i.station,'craft')&&![0,1,3,4].includes(index))continue;
   if(t.area==='furnace'&&(index===2||index===0&&!SMELT[held.id]||index===1&&!FUELS[held.id]))continue;
   const item=arr[index],limit=this.limit(held.id);
   if(item&&item.id!==held.id||item?.count>=limit)continue;
   targets.push({arr,index,room:limit-(item?.count||0)});
  }
  if(targets.length<2)return false;
  const amount=held.count,each=command.button===2?1:Math.floor(amount/targets.length),rem=command.button===2?0:amount%targets.length;
  let moved=0;
  for(let n=0;n<targets.length;n++){const t=targets[n],take=Math.min(t.room,each+(n<rem?1:0),held.count-moved);
   if(take<=0)continue;
   if(t.arr[t.index])t.arr[t.index].count+=take;else t.arr[t.index]={id:held.id,count:take};moved+=take;
  }
  held.count-=moved;if(!held.count)i.cursor=null;return moved>0;
 }
 static matches(recipe,grid,width){
  const positions=[];let minX=3,minY=3,maxX=-1,maxY=-1;
  for(let y=0;y<width;y++)for(let x=0;x<width;x++)if(grid[y*3+x]){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  if(maxX<0||recipe.pattern.length!==maxY-minY+1||recipe.pattern[0].length!==maxX-minX+1)return null;
  for(const mirror of [false,true]){positions.length=0;let ok=true;
   for(let y=0;y<recipe.pattern.length&&ok;y++)for(let x=0;x<recipe.pattern[0].length;x++){
    const char=recipe.pattern[y][mirror?recipe.pattern[0].length-1-x:x],slot=(y+minY)*3+x+minX,s=grid[slot];
    if(char===' '){if(s){ok=false;break;}}else{const key=recipe.keys[char],ids=Array.isArray(key)?key:[key];if(!s||!ids.includes(s.id)){ok=false;break;}positions.push(slot);}
   }if(ok)return[...positions];
  }return null;
 }
 static result(actor,sim){const width=sim.stationInReach(actor,actor.inventory.station,'craft')?3:2;
  for(const r of RECIPES){if(r.station>width||r.unlock&&!sim.progress[r.unlock])continue;const cells=this.matches(r,actor.inventory.grid,width);if(cells)return{recipe:r,cells};}return null;}
 static autoFill(actor,id,sim){const r=RECIPES.find(r=>r.id===id),i=actor.inventory,width=sim.stationInReach(actor,i.station,'craft')?3:2;
  if(!r||r.station>width||r.unlock&&!sim.progress[r.unlock])return false;
  const slots=structuredClone(i.slots),grid=Array(9).fill(null);
  for(const s of i.grid)if(s&&this.addTo(slots,s.id,s.count))return false;
  // The recipe book fills the grid with as many complete crafts as the bag permits.
  // Each round is transactional: never consume a partial recipe.
  let crafts=0;
  for(let round=0;round<64;round++){
   const nextSlots=structuredClone(slots),nextGrid=structuredClone(grid);
   let possible=true;
   for(let y=0;y<r.pattern.length&&possible;y++)for(let x=0;x<r.pattern[0].length;x++){
    const char=r.pattern[y][x];if(char===' ')continue;
    const key=r.keys[char],ids=Array.isArray(key)?key:[key],cell=y*3+x;
    const current=nextGrid[cell];
    const item=current?.id||ids.find(id=>nextSlots.some(s=>s?.id===id));
    if(!item||current?.count>=this.limit(item)||!this.takeFrom(nextSlots,item,1)){possible=false;break;}
    if(current)current.count++;else nextGrid[cell]={id:item,count:1};
   }
   if(!possible)break;
   for(let j=0;j<slots.length;j++)slots[j]=nextSlots[j];
   for(let j=0;j<grid.length;j++)grid[j]=nextGrid[j];
   crafts++;
  }
  if(!crafts)return false;
  i.slots=slots;i.grid=grid;return true;
 }
 static takeResult(actor,sim,all=false){let made=0;for(let n=0;n<(all?64:1);n++){
  const match=this.result(actor,sim);if(!match)break;const {recipe:r,cells}=match,i=actor.inventory;
  if(all){const next=structuredClone(i.slots);if(this.addTo(next,r.out,r.count))break;i.slots=next;}
  else{if(i.cursor&&(i.cursor.id!==r.out||i.cursor.count+r.count>this.limit(r.out)))break;if(i.cursor)i.cursor.count+=r.count;else i.cursor={id:r.out,count:r.count};}
  for(const k of cells){if(--i.grid[k].count===0)i.grid[k]=null;}made++;sim.markItem(r.out);sim.emit('craft',actor,{item:r.out});
 }return made>0;}
 static close(actor,sim){const i=actor.inventory;for(let k=0;k<9;k++){const s=i.grid[k];if(s){const left=this.addTo(i.slots,s.id,s.count);if(left)sim.spawnDrop(s.id,left,actor.pos);i.grid[k]=null;}}
  if(i.cursor){const left=this.addTo(i.slots,i.cursor.id,i.cursor.count);if(left)sim.spawnDrop(i.cursor.id,left,actor.pos);i.cursor=null;}i.station=null;}
 static stats(actor){const i=actor.inventory,held=this.selected(i),item=held?ITEMS[held.id]:null;let load=item?.weight||0,defense=0,poise=CFG.player.poise;
  for(const s of Object.values(i.armor)){if(!s)continue;const a=ITEMS[s.id];load+=a.weight;defense+=a.defense;poise+=a.poise;}
  return{item,weapon:item?.weapon?WEAPONS[item.weapon]:null,material:item?.material?MATERIALS[item.material]:null,load,loadRatio:load/CFG.player.load,weightClass:load/CFG.player.load<.3?0:load/CFG.player.load<.7?1:2,defense,poise};}
}


