'use strict';
// Companion panel: the owned units and the three combat slots. Ranching, growth, merging and chest labor happen in the
// world with no menu (D-103…D-106): a unit out of a slot stays on the ranch where it stands.
class CompanionPanel {
 constructor(app){
  this.app=app;this.selectedSlot=null;this.key='';this.lastFocus='close';this.request=null;
  $('companions-btn').onclick=()=>this.toggle();$('rotate-companions').onclick=()=>this.toggle(true);$('companions-close').onclick=()=>this.toggle(false);
  $('companions').onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.dataset.companionSlotTarget!==undefined){this.selectedSlot=Number(b.dataset.companionSlotTarget);this.refresh(true);this.focus('slot-'+this.selectedSlot);return;}
   if(b.dataset.companionRemove){this.send({action:'assign',id:b.dataset.companionRemove,location:'ranch'});return;}
   if(b.dataset.companionAction)this.act(b);
  };
  $('companions').addEventListener('focusin',e=>{const key=e.target.dataset.focusKey;if(key&&key!=='close')this.lastFocus=key;});
  $('companions').addEventListener('keydown',e=>{
   if(e.key==='Tab'){const buttons=[...$('companions').querySelectorAll('button:not(:disabled)')].filter(b=>b.getClientRects().length),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  });
  $('companion-bar').onclick=e=>{const b=e.target.closest('[data-companion-slot]');if(b)app.command({op:'companion',action:'select',slot:Number(b.dataset.companionSlot)});};
 }
 toggle(force){const open=force??$('companions').hidden;if(open){this.app.open('companions');this.refresh(true);this.focus(this.lastFocus);}else{$('companions').hidden=true;this.app.controls.release();$('world').focus({preventScroll:true});}document.body.classList.toggle('companions-open',open);}
 focus(key){const b=$('companions').querySelector('[data-focus-key="'+key+'"]');(b&&!b.disabled&&b.getClientRects().length?b:$('companions-close')).focus({preventScroll:true});}
 message(text){$('companion-feedback').textContent=text;}
 signature(){const s=this.app.sim.companions,a=this.app.actor();return JSON.stringify(s.owned(a.id).map(u=>[u.id,u.location,u.slot,u.pending]));}
 send(command){if(this.request)return;this.request={signature:this.signature(),until:performance.now()+2500};this.app.command({op:'companion',...command});this.message('요청한 배치 변경을 적용하는 중입니다.');this.refresh(true);}
 act(button){const s=this.app.sim.companions,a=this.app.actor(),u=s.owned(a.id).find(v=>v.id===button.dataset.id);if(this.request||!u||u.pending||button.dataset.companionAction!=='equip')return;
  let slot=this.selectedSlot;if(slot===null&&u.location==='combat')slot=u.slot;if(slot===null)slot=Array.from({length:COMPANION_SLOTS},(_,i)=>i).find(i=>!s.equipped(a,i)&&!s.owned(a.id).some(v=>v.pending?.location==='combat'&&v.pending.slot===i));if(slot===undefined){this.message('슬롯을 하나 고르거나 전투 편성을 해제하세요.');return;}
  this.selectedSlot=slot;if(u.location==='combat'&&u.slot===slot){this.app.command({op:'companion',action:'select',slot});return;}this.send({action:'assign',id:u.id,location:'combat',slot});}
 status(u){const pending=u.pending?(u.pending.location==='combat'?'slot '+(u.pending.slot+1):'목장'):null;return(u.location==='combat'?'slot '+(u.slot+1):'목장')+' · '+this.app.sim.companions.activity(u)+(u.cargo?' · '+ITEMS[u.cargo.id].name+' ×'+u.cargo.count:'')+(pending?' · queued '+pending:'');}
 capabilityText(def){const g=def.capabilities.gather,a=def.capabilities.attack;return(a?'공격 '+(a.mode==='ball'?'투척':'근접'):'')+(g?' · 노동 '+g.blocks.map(id=>BLOCKS[BID[id]].name).join(', '):'')+' · 먹이 '+ITEMS[def.food].name;}
 stageText(u){return(u.stage==='adult'?'성체':'아기')+' · '+u.grade+'등급';}
 renderUnit(u){const def=SPECIES[u.kind],placed=u.location==='combat',busy=!!u.pending,baby=u.stage!=='adult',slot=this.selectedSlot===null&&placed?u.slot:this.selectedSlot,occupant=slot===null?null:this.app.sim.companions.equipped(this.app.actor(),slot);
  const label=baby?'성체가 되면 배치':placed&&u.slot===slot?'동료 선택':occupant&&occupant.id!==u.id?(slot+1)+'번과 교체':slot===null?'빈 전투 슬롯에 배치':(slot+1)+'번에 배치';
  const hasOpenSlot=Array.from({length:COMPANION_SLOTS},(_,i)=>i).some(i=>!this.app.sim.companions.equipped(this.app.actor(),i)),disabled=!!this.request||busy||baby||this.selectedSlot===null&&!placed&&!hasOpenSlot;
  const reason=baby?'목장 안에 '+ITEMS[def.food].name+'을(를) 던져(Q) 먹이면 성체가 됩니다 ('+u.fed+'/'+RANCH_RULES.feedToAdult+').':busy?'이동 또는 투척을 마친 뒤 반영됩니다.':placed?'슬롯에서 해제하면 그 자리 목장에 남습니다.':'울타리 안 보관 상자가 있으면 적성 블록을 캐서 넣습니다.';
  return '<article class="companion-card" data-unit-id="'+u.id+'"><button type="button" class="companion-card-tap" data-companion-action="equip" data-id="'+u.id+'" data-focus-key="unit-'+u.id+'" '+(disabled?'disabled ':'')+'><span class="companion-face '+u.kind+'" aria-hidden="true">'+def.icon+'</span><span class="companion-card-copy"><strong>'+escapeHtml(def.name)+' · #'+u.id.split(':').at(-1)+'</strong><span class="companion-role">'+escapeHtml(this.stageText(u)+' · '+this.capabilityText(def))+'</span><span class="companion-status">'+escapeHtml(this.status(u))+'</span></span><span class="companion-card-action">'+label+'</span></button><div class="companion-card-bottom"><span>'+escapeHtml(reason)+'</span></div></article>';
 }
 refresh(force=false){const app=this.app,a=app.actor();if(!a)return;const system=app.sim.companions,units=system.owned(a.id);
  if(this.request){if(this.request.signature!==this.signature()){this.request=null;this.selectedSlot=null;this.message('배치 변경이 적용됐습니다.');}else if(performance.now()>this.request.until){this.request=null;this.message('저장된 배치 상태를 확인해 주세요.');}}
  const barKey=JSON.stringify([units.map(u=>[u.id,u.kind,u.location,u.slot]),a.companionSlot]);if(barKey!==this.barKey){this.barKey=barKey;$('companion-bar').innerHTML=Array.from({length:COMPANION_SLOTS},(_,slot)=>{const u=system.equipped(a,slot);return '<button data-companion-slot="'+slot+'" '+(!u?'disabled':'')+' class="'+(a.companionSlot===slot?'active':'')+'" aria-label="slot '+(slot+1)+' '+(u?SPECIES[u.kind].name:'empty')+'">'+['Z','X','C'][slot]+' '+(u?SPECIES[u.kind].icon:'?')+'</button>';}).join('')+'<button data-companion-slot="-1">clear</button>';}
  if($('companions').hidden)return;
  const key=JSON.stringify([units.map(u=>[u.id,u.kind,u.stage,u.grade,u.fed,u.location,u.slot,u.pending,u.phase,u.task,u.cargo]),this.selectedSlot,!!this.request]);if(!force&&key===this.key)return;this.key=key;
  const focused=document.activeElement?.dataset.focusKey;
  const occupied=new Set(units.filter(u=>u.location==='combat').map(u=>u.slot));for(const u of units)if(u.pending?.location==='combat')occupied.add(u.pending.slot);if(this.selectedSlot===null)this.selectedSlot=Array.from({length:COMPANION_SLOTS},(_,i)=>i).find(i=>!occupied.has(i))??null;
  $('companion-slots').innerHTML=Array.from({length:COMPANION_SLOTS},(_,slot)=>{const u=system.equipped(a,slot),pending=units.find(v=>v.pending?.location==='combat'&&v.pending.slot===slot),show=u||pending;return '<div class="companion-slot-cell"><button type="button" class="'+(this.selectedSlot===slot?'companion-slot-selected':'')+'" data-companion-slot-target="'+slot+'" data-focus-key="slot-'+slot+'" aria-pressed="'+(this.selectedSlot===slot)+'" aria-label="party slot '+(slot+1)+' '+(show?SPECIES[show.kind].name+' #'+show.id.split(':').at(-1):'empty')+'"><span class="companion-slot-index">전투 '+(slot+1)+'번 · '+['Z','X','C'][slot]+'</span><strong>'+(show?SPECIES[show.kind].icon+' '+escapeHtml(SPECIES[show.kind].name)+' #'+show.id.split(':').at(-1):'빈 전투 슬롯')+'</strong><small>'+(pending?'배치 예정':u?'다른 개체로 교체 가능':'보유 개체를 선택')+'</small></button>'+(u?'<button type="button" class="companion-slot-remove" data-companion-remove="'+u.id+'" '+(this.request||u.pending?'disabled ':'')+' aria-label="remove '+escapeHtml(SPECIES[u.kind].name)+'">해제</button>':'')+'</div>';}).join('');
  $('companion-cards').innerHTML=units.map(u=>this.renderUnit(u)).join('')||'<p class="hint-text">아직 보유한 동료가 없습니다. 보스 구조물의 보스를 쓰러뜨려 알을 얻고, 땅에 놓아 부화시키세요.</p>';
  const ranch=units.filter(u=>u.location==='ranch'),babies=ranch.filter(u=>u.stage!=='adult').length;
  $('companion-ranch-note').textContent=units.length?'목장 '+ranch.length+' (아기 '+babies+') · 전투 '+(units.length-ranch.length)+' · 울타리·문으로 가두고 먹이를 던져 키우세요':'알을 땅에 놓으면 그 자리에서 아기가 태어나 목장에 머뭅니다.';if(focused)this.focus(focused);
 }
}
