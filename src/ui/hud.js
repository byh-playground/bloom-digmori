const $=id=>document.getElementById(id);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* Client-only world HUD. HP comes directly from actors; animation never feeds back into it. */
const HEALTH_HUD=Object.freeze({range:32,width:116,mobileWidth:108,height:38,gap:5,trailDelay:140,trailDuration:420,headHeight:2*64/56*.84+.08});
function healthMeter(hp,maxHp){const maximum=Number.isFinite(maxHp)&&maxHp>0?maxHp:1,value=clamp(Number.isFinite(hp)?hp:0,0,maximum);return{value,maximum,ratio:value/maximum,text:Math.ceil(value)+' / '+Math.ceil(maximum)};}
function projectWorldToScreen(m,pos,width,height){
 if(!m||width<=0||height<=0||!pos||!Object.values(pos).every(Number.isFinite))return null;
 const x=pos.x,y=pos.y,z=pos.z,w=m[3]*x+m[7]*y+m[11]*z+m[15];if(w<=.001)return null;
 const nx=(m[0]*x+m[4]*y+m[8]*z+m[12])/w,ny=(m[1]*x+m[5]*y+m[9]*z+m[13])/w,depth=(m[2]*x+m[6]*y+m[10]*z+m[14])/w;
 if(![nx,ny,depth].every(Number.isFinite)||depth< -1||depth>1)return null;
 return{x:(nx*.5+.5)*width,y:(.5-ny*.5)*height,depth,w};
}
class EnemyHealthHUD {
 constructor(renderer){this.r=renderer;this.root=document.getElementById('enemy-labels');this.nodes=new Map();this.world=null;this.samples=[];this.clock=0;this.mobile=matchMedia('(pointer:coarse)').matches;}
 reset(){for(const v of this.nodes.values())v.node.remove();this.nodes.clear();this.world=null;this.clock=0;this.samples=[];}
 create(a){const node=document.createElement('div');node.className='enemy-label';node.dataset.actorId=a.id;node.classList.toggle('candidate',!!a.speciesId);
  const caption=document.createElement('div');caption.className='enemy-caption';const name=document.createElement('span');name.className='enemy-name';name.textContent=a.speciesId?SPECIES[a.speciesId].name+(a.wildState==='retaliating'?' · 반격 중':' · 야생 후보'):a.boss?BOSS.name:a.enemy?'적대 생물':'플레이어 · '+String(a.id).slice(0,6);
  const warning=document.createElement('span');warning.className='enemy-warning';warning.textContent='!';warning.hidden=true;caption.append(name,warning);
  const bar=document.createElement('div');bar.className='enemy-health';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label',name.textContent+' 생명력');
  const trail=document.createElement('i');trail.className='enemy-health-trail';const fill=document.createElement('i');fill.className='enemy-health-fill';bar.append(trail,fill);
  const number=document.createElement('div');number.className='enemy-hp-value';node.append(caption,bar,number);this.root.append(node);
  const meter=healthMeter(a.hp,a.maxHp),entry={node,bar,fill,trail,number,name,warning,hp:meter.value,max:meter.maximum,trailRatio:meter.ratio,changedAt:-Infinity,flashUntil:0};this.nodes.set(a.id,entry);return entry;
 }
 visible(terrain,eye,point){const delta=V.sub(point,eye),length=V.len(delta);if(length<.03)return true;const hit=terrain.ray(eye,V.scale(delta,1/length),length);return !hit||hit.distance>=length-.05;}
 update(sim,local,dt=0,actors,authority){if(!this.root)return;if(this.world!==sim.terrain){this.reset();this.world=sim.terrain;}
  this.clock+=Math.max(0,Math.min(dt,100));this.samples=[];
  const alive=new Set(Object.values(actors).filter(a=>a.id!==local.id&&!a.dead&&!a.suspended).map(a=>a.id));
  for(const [id,e]of this.nodes){if(!alive.has(id)){e.node.remove();this.nodes.delete(id);}else e.node.hidden=true;}
  const blocked=['inventory','journal','menu','network','ending','loading'].some(id=>{const e=document.getElementById(id);return e&&!e.hidden;});this.root.hidden=blocked||local.dead;
  if(this.root.hidden||!this.r.eye)return;
  const width=this.r.canvas.clientWidth,height=this.r.canvas.clientHeight,barWidth=this.mobile?HEALTH_HUD.mobileWidth:HEALTH_HUD.width,half=barWidth/2;
  const aim=sim.physics.aimEnemy(authority,HEALTH_HUD.range),player=local.pos,candidates=[];
  for(const a of Object.values(actors)){
   if(!alive.has(a.id)||!this.r.entityVisualReady(a))continue;const pos=a.pos,distance=V.len(V.sub(player,pos));if(distance>HEALTH_HUD.range)continue;
   const scale=a.scale||1,head=V.add(pos,{x:0,y:HEALTH_HUD.headHeight*scale,z:0}),center=V.add(pos,{x:0,y:a.offset,z:0}),p=this.r.projected(head),body=this.r.projected(center);
   if(!p||!body||body.x< -half||body.x>width+half||body.y< -HEALTH_HUD.height||body.y>height+HEALTH_HUD.height)continue;
   const forehead=V.add(pos,{x:0,y:HEALTH_HUD.headHeight*scale*.83,z:0});
   if(!this.visible(sim.terrain,this.r.eye,forehead)&&!this.visible(sim.terrain,this.r.eye,center))continue;
   const meter=healthMeter(a.hp,a.maxHp),entry=this.nodes.get(a.id)||this.create(a);
   if(entry.max!==meter.maximum||meter.value>entry.hp){entry.trailRatio=meter.ratio;entry.changedAt=-Infinity;}
   else if(meter.value<entry.hp){entry.trailRatio=Math.max(entry.trailRatio,entry.hp/entry.max);entry.changedAt=this.clock;entry.flashUntil=this.clock+170;}
   entry.hp=meter.value;entry.max=meter.maximum;
   if(this.clock-entry.changedAt>HEALTH_HUD.trailDelay)entry.trailRatio=Math.max(meter.ratio,entry.trailRatio-Math.max(0,dt)/HEALTH_HUD.trailDuration);
   entry.name.textContent=a.speciesId?SPECIES[a.speciesId].name+(a.wildState==='retaliating'?' · 반격 중':' · 야생 후보'):a.boss?BOSS.name:a.enemy?'적대 생물':'플레이어 · '+String(a.id).slice(0,6);entry.node.classList.toggle('candidate',!!a.speciesId);entry.node.classList.toggle('retaliating',a.wildState==='retaliating');entry.number.textContent=meter.text;entry.fill.style.transform='scaleX('+meter.ratio+')';entry.trail.style.transform='scaleX('+Math.max(entry.trailRatio,meter.ratio)+')';
   entry.bar.setAttribute('aria-valuemin','0');entry.bar.setAttribute('aria-valuemax',String(meter.maximum));entry.bar.setAttribute('aria-valuenow',String(meter.value));entry.bar.setAttribute('aria-valuetext',meter.text);
   entry.node.dataset.hp=String(meter.value);entry.node.dataset.maxHp=String(meter.maximum);entry.node.classList.toggle('targeted',a.id===aim);entry.node.classList.toggle('critical',meter.ratio<=.25);entry.node.classList.toggle('damaged',this.clock<entry.flashUntil);entry.node.classList.toggle('boss',!!a.boss);entry.node.classList.toggle('player',!a.enemy&&!a.speciesId&&!a.boss);
   entry.warning.hidden=!(a.combat.state==='attack'&&a.combat.action&&a.combat.elapsed<a.combat.action.wind);
   candidates.push({id:a.id,entry,x:clamp(p.x,half+6,width-half-6),y:clamp(p.y,HEALTH_HUD.height+10,height-8),anchor:p,body,distance,targeted:a.id===aim,hp:meter.value,max:meter.maximum});
  }
  // Near/aimed labels keep their anchor. Move other overlapping labels upward, with a small leader.
  candidates.sort((a,b)=>Number(b.targeted)-Number(a.targeted)||a.distance-b.distance||cmp(a.id,b.id));const occupied=[];
  // Keep labels out of fixed UI, especially the guide in a close first-person view.
  const exclusions=['#guide','#topbar > div:first-child','#topbar > .toolbar','#bossbar'].map(selector=>document.querySelector(selector)).filter(node=>node&&!node.hidden).map(node=>node.getBoundingClientRect()).filter(b=>b.width>0&&b.height>0);
  const avoidHUD=(x,y)=>{for(const b of exclusions)if(x+half>b.left-3&&x-half<b.right+3&&y>b.top-3&&y-HEALTH_HUD.height<b.bottom+3)y=Math.min(height-8,b.bottom+HEALTH_HUD.height+6);return y;};
  for(const c of candidates){const naturalY=c.y;let y=c.y;
   for(let n=0;n<5;n++){const hit=occupied.find(b=>Math.abs(c.x-b.x)<barWidth+4&&Math.abs(y-b.y)<HEALTH_HUD.height+HEALTH_HUD.gap);if(!hit)break;y=hit.y-HEALTH_HUD.height-HEALTH_HUD.gap;}
   y=avoidHUD(c.x,Math.max(HEALTH_HUD.height+6,y));c.entry.node.style.left=c.x.toFixed(2)+'px';c.entry.node.style.top=y.toFixed(2)+'px';c.entry.node.style.setProperty('--leader',Math.max(0,naturalY-y).toFixed(1)+'px');c.entry.node.hidden=false;occupied.push({x:c.x,y});
   this.samples.push({id:c.id,x:c.x,y,anchor:c.anchor,hp:c.hp,maxHp:c.max,ratio:c.hp/c.max,distance:c.distance,targeted:c.targeted});
  }
 }
}

