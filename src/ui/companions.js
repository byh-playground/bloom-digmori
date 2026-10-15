class CompanionPanel {
 constructor(app){this.app=app;this.key='';$('companions-btn').onclick=()=>this.toggle();$('rotate-companions').onclick=()=>this.toggle(true);$('companions-close').onclick=()=>this.toggle(false);
  $('companions').onclick=e=>{const b=e.target.closest('button[data-companion-action]');if(!b)return;app.command({op:'companion',action:b.dataset.companionAction,id:b.dataset.id,kind:b.dataset.kind,location:b.dataset.location,slot:b.dataset.slot===undefined?undefined:Number(b.dataset.slot)});};
  $('companion-collect').onclick=()=>app.command({op:'companion',action:'collect'});
  $('companion-bar').onclick=e=>{const b=e.target.closest('[data-companion-slot]');if(b)app.command({op:'companion',action:'select',slot:Number(b.dataset.companionSlot)});};
 }
 toggle(force){const open=force??$('companions').hidden;if(open)this.app.open('companions');else{$('companions').hidden=true;this.app.controls.release();$('world').focus({preventScroll:true});}document.body.classList.toggle('companions-open',open);this.key='';this.refresh(true);}
 refresh(force=false){const app=this.app,a=app.actor();if(!a)return;const system=app.sim.companions,units=system.owned(a.id),base=system.base(a.id),near=system.nearBase(a),key=JSON.stringify([units.map(u=>[u.id,u.kind,u.location,u.slot,u.pending]),a.companionSlot,base?.slots,near]);
  if(force||key!==this.key){this.key=key;
   $('companion-bar').innerHTML=Array.from({length:COMPANION_SLOTS},(_,slot)=>{const u=system.equipped(a,slot);return '<button data-companion-slot="'+slot+'" '+(!u?'disabled':'')+' class="'+(a.companionSlot===slot?'active':'')+'">'+['Z','X','C'][slot]+' '+(u?COMPANION_TYPES[u.kind].icon:'—')+'</button>';}).join('')+'<button data-companion-slot="-1">손도구</button>';
   $('companion-recruit').innerHTML=Object.entries(COMPANION_TYPES).map(([kind,def])=>'<button data-companion-action="recruit" data-kind="'+kind+'" '+(units.some(u=>u.kind===kind)||V.len(V.sub(a.pos,app.sim.terrain.spawn))>8?'disabled':'')+'>'+def.icon+' '+def.name+' · 함께하기</button>').join('');
   $('companion-cards').innerHTML=units.map(u=>{const def=COMPANION_TYPES[u.kind],button=(label,location,slot)=>'<button data-companion-action="assign" data-id="'+u.id+'" data-location="'+location+'" '+(slot===undefined?'':'data-slot="'+slot+'"')+' '+(location==='work'&&!near?'disabled':'')+'>'+label+'</button>';return '<article class="companion-card"><h3>'+def.icon+' '+def.name+'</h3><p>기초 채집 · 운반 · '+(def.art==='ball'?'공형 발사·복귀':'생물 검')+'</p><strong data-companion-status="'+u.id+'"></strong><div class="companion-actions">'+button('거점 작업','work')+button('회수','reserve')+Array.from({length:COMPANION_SLOTS},(_,n)=>button('장착 '+(n+1),'combat',n)).join('')+'</div></article>';}).join('')||'<p>시작 지점에서 두 동료를 만나보세요.</p>';
   $('companion-storage').textContent=base?base.slots.filter(Boolean).map(s=>ITEMS[s.id].name+' ×'+s.count).join(' · ')||'비어 있어요':'동료와 함께하면 시작 지점이 거점이 됩니다.';
   $('companion-collect').disabled=!near;$('companion-base-note').textContent=base?'거점 '+[base.pos.x,base.pos.y,base.pos.z].map(Math.floor).join(' / ')+' · '+(near?'근처 자원을 채집해 이 보관함에 운반합니다.':'거점에서 7m 이내로 돌아와 배치·수령하세요.'):'같은 동료를 노동과 전투에 동시에 배치할 수 없습니다.';
  }
  const labels={idle:'대기',travel:'자원으로 이동',gather:'채집 중',carry:'거점으로 운반',flight:'발사 중',return:'손으로 복귀'};
  for(const u of units){const el=document.querySelector('[data-companion-status="'+u.id+'"]');if(el)el.textContent=(u.location==='work'?'거점 작업':u.location==='combat'?'전투 슬롯 '+(u.slot+1):'보관')+' · '+labels[u.phase]+(u.cargo?' · '+ITEMS[u.cargo.id].name+' ×'+u.cargo.count:'')+(u.cooldown>0?' · '+(u.cooldown/1000).toFixed(1)+'초':'')+(u.pending?' · 복귀 후 배치 변경':'');}
 }
}
