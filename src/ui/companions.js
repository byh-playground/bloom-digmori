class CompanionPanel {
 constructor(app){
  this.app=app;this.tab='companions';this.page=0;this.detail=null;this.key='';this.lastFocus='tab-companions';this.request=null;
  $('companions-btn').onclick=()=>this.toggle();$('rotate-companions').onclick=()=>this.toggle(true);$('companions-close').onclick=()=>this.toggle(false);
  $('companions').onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;
   if(b.dataset.companionTab){this.tab=b.dataset.companionTab;this.detail=null;this.refresh();return;}
   if(b.dataset.companionPage!==undefined){this.page=Number(b.dataset.companionPage);this.detail=null;this.refresh();return;}
   if(b.dataset.companionDetail){this.detail=b.dataset.companionDetail;this.page=Object.keys(COMPANION_TYPES).indexOf(this.detail);this.refresh();$('companion-detail-back').focus({preventScroll:true});return;}
   if(b.id==='companion-detail-back'){this.detail=null;this.refresh();this.focus('info-'+Object.keys(COMPANION_TYPES)[this.page]);return;}
   if(b.dataset.companionUnequip!==undefined){const u=app.sim.companions.equipped(app.actor(),Number(b.dataset.companionUnequip));if(u)this.send({action:'assign',id:u.id,location:'reserve'});else this.message('아래 동료 카드를 눌러 빈 슬롯에 장착하세요.');return;}
   if(b.dataset.companionAction)this.act(b);
  };
  $('companions').addEventListener('focusin',e=>{const key=e.target.dataset.focusKey;if(key&&key!=='close')this.lastFocus=key;});
  $('companions').addEventListener('keydown',e=>{
   if(e.key==='Tab'){const buttons=[...$('companions').querySelectorAll('button:not(:disabled)')].filter(b=>b.getClientRects().length),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
   if(e.target.getAttribute('role')==='tab'&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();const tabs=[...$('companion-tabs').children],at=tabs.indexOf(e.target),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(at+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[next].click();tabs[next].focus();}
  });
  $('companion-collect').onclick=$('companion-quick-collect').onclick=()=>{if(!this.request){this.send({action:'collect'});this.message('수령 요청 중 · 가방에 못 담은 자원은 그대로 남아요.');}};
  $('companion-bar').onclick=e=>{const b=e.target.closest('[data-companion-slot]');if(b)app.command({op:'companion',action:'select',slot:Number(b.dataset.companionSlot)});};
 }
 toggle(force){const open=force??$('companions').hidden;if(open){this.app.open('companions');this.refresh(true);this.focus(this.lastFocus);}else{$('companions').hidden=true;this.app.controls.release();$('world').focus({preventScroll:true});}document.body.classList.toggle('companions-open',open);}
 focus(key){const b=$('companions').querySelector('[data-focus-key="'+key+'"]');(b&&!b.disabled&&b.getClientRects().length?b:$('companion-tab-'+this.tab)).focus({preventScroll:true});}
 message(text){$('companion-feedback').textContent=text;}
 signature(){const s=this.app.sim.companions,a=this.app.actor();return JSON.stringify([s.owned(a.id).map(u=>[u.id,u.location,u.slot,u.pending]),s.base(a.id)?.slots,a.inventory.slots]);}
 send(command){if(this.request)return;this.request={signature:this.signature(),until:performance.now()+2500};this.app.command({op:'companion',...command});this.message('요청 중 · 실제 배치가 반영되면 카드가 바뀝니다.');this.refresh();}
 act(button){
  const action=button.dataset.companionAction,kind=button.dataset.kind,s=this.app.sim.companions,a=this.app.actor(),u=s.owned(a.id).find(u=>u.kind===kind);
  if(action==='meet'){this.tab='companions';this.page=Object.keys(COMPANION_TYPES).indexOf(kind);this.refresh();this.focus('card-'+kind);return;}
  if(this.request)return;
  if(action==='recruit'){this.send({action:'recruit',kind});return;}
  if(!u||u.pending)return;
  if(action==='recall'){this.send({action:'assign',id:u.id,location:'reserve'});return;}
  if(action==='work'){this.send({action:'assign',id:u.id,location:'work'});return;}
  if(action==='equip'){
   const slot=Array.from({length:COMPANION_SLOTS},(_,i)=>i).find(i=>!s.equipped(a,i)&&!s.owned(a.id).some(u=>u.pending?.location==='combat'&&u.pending.slot===i));
   if(slot===undefined){this.message('전투 슬롯이 가득 찼어요. 장착된 카드나 슬롯을 눌러 먼저 비우세요.');return;}
   this.send({action:'assign',id:u.id,location:'combat',slot});
  }
 }
 status(u){
  if(!u)return '아직 만나지 않았어요';
  const phase={idle:'대기',travel:'자원으로 이동',gather:'채집 중',carry:'거점으로 운반',flight:'발사 중',return:'손으로 복귀'},location=u.location==='work'?'작업 중':u.location==='combat'?'전투 '+(u.slot+1):'대기';
  const pending=u.pending?(u.pending.location==='combat'?'전투 '+(u.pending.slot+1):u.pending.location==='work'?'작업':'대기'):null;
  return location+' · '+phase[u.phase]+(u.cargo?' · '+ITEMS[u.cargo.id].name+' ×'+u.cargo.count:'')+(pending?' → 복귀 후 '+pending:'')+(u.cooldown>0?' · '+(u.cooldown/1000).toFixed(1)+'초':'');
 }
 card(kind,index,units,near,canMeet){
  const def=COMPANION_TYPES[kind],u=units.find(u=>u.kind===kind),work=this.tab==='work';let action,label,reason='',disabled=!!this.request||!!u?.pending;
  if(!u){action=work?'meet':'recruit';label=work?'동료 탭에서 만나기':'함께하기';if(!work&&!canMeet){disabled=true;reason='시작 거점 8m 안에서 만날 수 있어요.';}}
  else if(u.pending){action='recall';label='복귀 후 배치 변경';reason='운반·비행이 끝나면 요청한 배치로 옮겨요.';}
  else if(work){action=u.location==='work'?'recall':'work';label=u.location==='work'?'작업 회수':'거점 작업 보내기';if(action==='work'&&!near){disabled=true;reason='거점 7m 안으로 돌아오면 배치할 수 있어요.';}}
  else{action=u.location==='combat'?'recall':'equip';label=u.location==='combat'?'전투 '+(u.slot+1)+' · 탭하여 해제':'첫 빈 슬롯에 장착';if(u.location==='reserve'&&u.cargo){disabled=true;reason='보관함에서 운반 자원을 먼저 받아주세요.';}}
  const role=work?def.capabilities.gather.blocks.map(id=>BLOCKS[BID[id]].name).join(' · '):(def.art==='ball'?'포물선 발사 · 자동 복귀':'근접 검 · 길게 눌러 차지');
  const quickAction=work?(u?.location==='combat'?'recall':'equip'):(u?.location==='work'?'recall':'work'),quickLabel=work?(u?.location==='combat'?'전투 해제':'전투 장착'):(u?.location==='work'?'작업 회수':'작업 보내기');
  if(u&&!near&&quickAction==='work'&&!reason)reason='작업 배치는 거점 7m 안에서';
  const quick=u?'<button type="button" data-focus-key="quick-'+kind+'" data-companion-action="'+quickAction+'" data-kind="'+kind+'" '+(this.request||u.pending||quickAction==='work'&&!near||quickAction==='equip'&&u.location==='reserve'&&u.cargo?'disabled ':'')+'>'+quickLabel+'</button>':'';
  return '<article class="companion-card" data-card-kind="'+kind+'" data-card-page="'+index+'">'+
   '<button type="button" class="companion-card-tap" data-focus-key="card-'+kind+'" data-companion-action="'+action+'" data-kind="'+kind+'" '+(u?'data-id="'+u.id+'" data-location="'+(action==='work'?'work':action==='equip'?'combat':'reserve')+'" ':'')+(disabled?'disabled ':'')+'aria-label="'+def.name+' · '+label+'">'+
   '<span class="companion-face '+def.art+'" aria-hidden="true">'+def.icon+'</span><span class="companion-card-copy"><strong>'+def.name+'</strong><span class="companion-role">'+escapeHtml(role)+'</span><span class="companion-status" data-companion-status="'+kind+'">'+escapeHtml(this.status(u))+'</span></span><span class="companion-card-action">'+(this.request?'요청 반영 중…':label)+'</span></button>'+
   '<div class="companion-card-bottom"><span>'+escapeHtml(reason||'한 동료 · 한 배치')+'</span>'+quick+'<button type="button" data-companion-detail="'+kind+'" data-focus-key="info-'+kind+'" aria-label="'+def.name+' 상세">상세</button></div></article>';
 }
 renderDetail(kind){
  const def=COMPANION_TYPES[kind],attack=def.capabilities.attack,gather=def.capabilities.gather;
  return '<section class="companion-detail"><div class="companion-detail-head"><button type="button" id="companion-detail-back" data-focus-key="detail-back">← 카드로</button><h3>'+def.icon+' '+def.name+'</h3></div><div class="companion-detail-body"><h4>전투</h4><p>'+(def.art==='ball'?'누른 뒤 놓으면 실제 구체를 포물선으로 발사합니다. 적·지형의 첫 충돌 뒤 손으로 돌아오며 복귀 중에는 피해를 주지 않아요.':'공격을 누른 뒤 놓으면 베기, 길게 누르면 차지합니다. 기존 무기와 같은 기력과 근접 판정을 사용해요.')+'</p><div class="companion-facts"><span>피해 '+attack.damage+'</span><span>재사용 '+attack.cooldown/1000+'초</span></div><h4>거점 작업</h4><p>'+gather.blocks.map(id=>escapeHtml(BLOCKS[BID[id]].name)).join(' · ')+' 채집 → 한 개씩 운반 → 9칸 보관함. 거점 7m 안에서 배치하고, 회수는 어디서든 요청할 수 있어요.</p><p>한 동료는 한 곳에만 배치됩니다. 운반·비행 중 배치 변경은 복귀 후 반영되며 자원은 보존돼요.</p></div></section>';
 }
 refresh(force=false){
  const app=this.app,a=app.actor();if(!a)return;const system=app.sim.companions,units=system.owned(a.id),base=system.base(a.id),near=system.nearBase(a),canMeet=V.len(V.sub(a.pos,app.sim.terrain.spawn))<=8;
  if(this.request){if(this.request.signature!==this.signature()){this.request=null;this.message('상태가 반영됐어요. 카드에서 현재 배치를 확인하세요.');}else if(performance.now()>this.request.until){this.request=null;this.message('현재 상태를 확인하세요. 가방에 못 담은 자원은 보관됩니다.');}}
  const barKey=JSON.stringify([units.map(u=>[u.id,u.kind,u.location,u.slot]),a.companionSlot]);
  if(barKey!==this.barKey){this.barKey=barKey;$('companion-bar').innerHTML=Array.from({length:COMPANION_SLOTS},(_,slot)=>{const u=system.equipped(a,slot);return '<button data-companion-slot="'+slot+'" '+(!u?'disabled':'')+' class="'+(a.companionSlot===slot?'active':'')+'" aria-label="전투 '+(slot+1)+' '+(u?COMPANION_TYPES[u.kind].name:'빈 슬롯')+'">'+['Z','X','C'][slot]+' '+(u?COMPANION_TYPES[u.kind].icon:'—')+'</button>';}).join('')+'<button data-companion-slot="-1">손도구</button>';}
  if($('companions').hidden)return;
  const key=JSON.stringify([units.map(u=>[u.id,u.kind,u.location,u.slot,u.pending]),base?.slots,near,canMeet,this.tab,this.page,this.detail,!!this.request]);
  if(force||key!==this.key){this.key=key;const focused=document.activeElement?.dataset.focusKey;
   $('companions').dataset.page=String(this.page);$('companions').dataset.tab=this.tab;$('companions').dataset.detail=String(!!this.detail);
   for(const b of $('companion-tabs').children){const active=b.dataset.companionTab===this.tab;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}
   $('companion-stage').setAttribute('aria-labelledby','companion-tab-'+this.tab);
   $('companion-slots').innerHTML=Array.from({length:COMPANION_SLOTS},(_,slot)=>{const equipped=system.equipped(a,slot),u=equipped||units.find(u=>u.pending?.location==='combat'&&u.pending.slot===slot),pending=u&&!equipped;return '<button type="button" data-companion-unequip="'+slot+'" data-focus-key="slot-'+slot+'" '+(this.request||u?.pending?'disabled ':'')+'aria-label="전투 '+(slot+1)+' · '+(u?COMPANION_TYPES[u.kind].name+(pending?' 복귀 후 장착':' 해제'):'빈 슬롯')+'"><span class="companion-slot-index">'+(slot+1)+' · '+['Z','X','C'][slot]+'</span><strong>'+(u?COMPANION_TYPES[u.kind].icon+' '+COMPANION_TYPES[u.kind].name:'＋ 빈 슬롯')+'</strong><small>'+(pending?'복귀 후 장착':u?'탭하여 해제':'카드로 장착')+'</small></button>';}).join('');
   const kinds=Object.keys(COMPANION_TYPES);$('companion-pages').innerHTML=kinds.map((kind,i)=>'<button type="button" data-companion-page="'+i+'" data-focus-key="page-'+kind+'" aria-pressed="'+(this.page===i)+'">'+COMPANION_TYPES[kind].icon+' '+COMPANION_TYPES[kind].name+' <small>'+(i+1)+'/'+kinds.length+'</small></button>').join('');
   if(!this.detail||this.detail!==this.renderedDetail)$('companion-cards').innerHTML=this.detail?this.renderDetail(this.detail):kinds.map((kind,i)=>this.card(kind,i,units,near,canMeet)).join('');this.renderedDetail=this.detail;
   $('companion-storage').innerHTML=Array.from({length:9},(_,i)=>{const item=base?.slots[i],def=item&&ITEMS[item.id];return '<div class="companion-storage-slot" '+(def?'data-item="'+item.id+'"':'')+'><small>'+(i+1)+'</small><span>'+(def?def.icon:'·')+'</span><strong>'+(def?escapeHtml(def.name)+' ×'+item.count:'비어 있음')+'</strong></div>';}).join('');
   $('companion-storage-count').textContent=(base?.slots.filter(Boolean).length||0)+' / 9칸';
   const stored=(base?.slots||[]).reduce((n,s)=>n+(s?.count||0),0)+units.filter(u=>u.location==='reserve').reduce((n,u)=>n+(u.cargo?.count||0),0);
   $('companion-quick-collect').textContent=stored?'자원 '+stored+'개 받기':'받을 자원 없음';
   $('companion-collect').disabled=$('companion-quick-collect').disabled=!!this.request||!near||!stored;
   $('companion-storage-note').textContent=!base?'동료를 만나면 거점 보관함을 사용할 수 있어요.':!near?'거점 7m 안으로 돌아오면 받을 수 있어요.':'가방에 못 담은 자원은 여기 남아요.';
   if(focused)this.focus(focused);
  }
  $('companion-base-note').textContent=!base&&canMeet?'⌂ 시작 거점 · 카드로 동료를 만나세요.':near?'⌂ 시작 거점 · 배치·수령 가능':'⌂ 시작 거점까지 '+Math.ceil(V.len(V.sub(a.pos,base?.pos||app.sim.terrain.spawn)))+'m · '+(base?'회수·전투 장착 가능':'8m 안에서 동료 만나기');
  for(const u of units){const el=$('companions').querySelector('[data-companion-status="'+u.kind+'"]');if(el)el.textContent=this.status(u);}
 }
}
