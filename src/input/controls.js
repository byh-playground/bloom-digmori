class Controls {
 constructor(app){this.app=app;this.actions=new app.gamekit.input.ActionState();this.buttons={left:false,right:false,mine:false,sprint:false};this.actionQueue={left:[],right:[]};this.emitted={left:false,right:false};this.source={left:'mouse',right:'mouse'};this.joy={x:0,z:0};this.joySprint=false;this.pointer={x:innerWidth*.5,y:innerHeight*.5};this.touches=new Map();this.gestures=new Map();this.gestureHoldMs=350;this.gestureSlop=13;this.pinch=0;const canvas=app.renderer.canvas;
  this.domInput=app.gamekit.input.createDOMInput({target:canvas,state:this.actions,keys:{KeyW:'move.forward',KeyS:'move.back',KeyA:'move.left',KeyD:'move.right',ControlLeft:'move.sprint',ControlRight:'move.sprint',ShiftLeft:'move.context',ShiftRight:'move.context',Space:'move.jump'},touchAction:'none',excludeTarget:(target)=>app.modal()||!!target?.closest?.('input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),[data-gamekit-ui]')});
  document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select,[contenteditable]'))return;const active=!app.modal();
   if(['KeyE','KeyF','KeyV','KeyJ','KeyQ','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9'].includes(e.code))e.preventDefault();
   if(e.code==='Escape'){app.closeAll();return;}if(e.repeat)return;
   if(e.code==='KeyK'){app.companionPanel.toggle();return;}if(['KeyZ','KeyX','KeyC'].includes(e.code)&&active){app.command({op:'companion',action:'select',slot:['KeyZ','KeyX','KeyC'].indexOf(e.code)});return;}if(e.code==='KeyE'){app.toggleInventory();return;}if(e.code==='KeyJ'){app.toggleJournal();return;}if(e.code==='KeyV'){app.toggleView();return;}if(!active)return;
   if(e.code==='KeyF')app.command({op:'interact'});if(e.code==='KeyQ')app.command({op:'drop',all:e.ctrlKey});
   if(/^Digit[1-9]$/.test(e.code))app.select(+e.code.slice(-1)-1);
  });
  canvas.addEventListener('pointerdown',e=>{if(app.modal())return;if(e.pointerType==='mouse'){
   if(document.pointerLockElement!==canvas){canvas.requestPointerLock()?.catch?.(err=>app.toast('마우스 잠금: '+err.message));}
   if(e.button===0)this.pressAction('left','mouse');if(e.button===2)this.pressAction('right','mouse');
  }else{e.preventDefault();canvas.setPointerCapture(e.pointerId);this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
   const gesture={startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false,held:false,timer:null};this.gestures.set(e.pointerId,gesture);
   gesture.timer=setTimeout(()=>{if(gesture.moved||this.touches.size!==1||app.modal())return;gesture.held=true;gesture.heldAt=performance.now();
    const a=app.actor(),selected=a?Inventory.stats(a).item:null,enemy=a&&app.sim.physics.aimEnemy(a,Combat.weapon(a).reach),block=a&&app.sim.aim(a);
    if(block&&!enemy&&!selected?.weapon){gesture.heldAction='mine';this.buttons.mine=true;}else{gesture.heldAction='attack';this.pressAction('left','touch');}
   },this.gestureHoldMs);
   if(this.touches.size===2){this.pinch=this.touchDistance();for(const v of this.gestures.values()){clearTimeout(v.timer);v.moved=true;if(v.held){this.buttons.mine=false;this.releaseAction('left');}}}
  }});
  document.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){if(e.button===0)this.releaseAction('left');if(e.button===2)this.releaseAction('right');}
   else this.finishGesture(e.pointerId,false);
   this.touches.delete(e.pointerId);this.pinch=0;});
  canvas.addEventListener('pointercancel',e=>{this.finishGesture(e.pointerId,true);this.touches.delete(e.pointerId);this.pinch=0;});
  canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')return;const prev=this.touches.get(e.pointerId);if(!prev)return;
   const g=this.gestures.get(e.pointerId);if(g){g.x=e.clientX;g.y=e.clientY;if(Math.hypot(g.x-g.startX,g.y-g.startY)>this.gestureSlop){g.moved=true;clearTimeout(g.timer);if(g.held){this.buttons.mine=false;this.releaseAction('left');g.held=false;}}}
   this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.touches.size===1){this.rotate(e.clientX-prev.x,e.clientY-prev.y,.005);}else if(this.touches.size===2){const dist=this.touchDistance();if(this.pinch)this.app.renderer.camera.distance=clamp(this.app.renderer.camera.distance*this.pinch/dist,CFG.camera.minDistance,CFG.camera.maxDistance);this.pinch=dist;}});
  document.addEventListener('mousemove',e=>{this.pointer={x:e.clientX,y:e.clientY};if(document.pointerLockElement===canvas&&!app.modal())this.rotate(e.movementX,e.movementY,.0028);if(!app.modal())return;app.moveCursor();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('wheel',e=>{e.preventDefault();if(!app.modal())app.select((app.selected+(e.deltaY>0?1:8))%9);},{passive:false});
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas){this.releaseAction('left');this.releaseAction('right');}});
  const joy=$('joystick');let id=null,center=null;
  const update=e=>{if(e.pointerId!==id)return;const x=(e.clientX-center.x)/42,z=(e.clientY-center.y)/42,raw=Math.hypot(x,z),length=Math.max(1,raw);this.joy={x:x/length,z:z/length};const forward=raw>0?-z/raw:0;this.joySprint=raw>=CFG.input.sprintOuter&&forward>=CFG.input.sprintForward;joy.classList.toggle('sprinting',this.joySprint);$('stick').style.transform=`translate(${this.joy.x*29}px,${this.joy.z*29}px)`;};
  joy.addEventListener('pointerdown',e=>{e.preventDefault();id=e.pointerId;const r=joy.getBoundingClientRect();center={x:r.left+r.width/2,y:r.top+r.height/2};joy.setPointerCapture(id);update(e);});joy.addEventListener('pointermove',update);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(event,e=>{if(e.pointerId!==id)return;id=null;this.joy={x:0,z:0};this.joySprint=false;joy.classList.remove('sprinting');$('stick').style.transform='';});
  for(const b of document.querySelectorAll('[data-touch]')){const key=b.dataset.touch;b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(key==='jump')this.actions.set('move.jump','touch-swim-rise',true);else if(key==='roll')this.actions.set('move.context','touch-context',true);else if(key==='left'||key==='right')this.pressAction(key,'touch');else this.buttons[key]=true; });for(const evt of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(evt,()=>{if(key==='left'||key==='right')this.releaseAction(key);else if(key==='jump')this.actions.set('move.jump','touch-swim-rise',false);else if(key==='roll')this.actions.set('move.context','touch-context',false);else if(key in this.buttons)this.buttons[key]=false;});}
  // World tap handles interact/place; no extra Use or Mine button.
  $('rotate-request').onclick=async()=>{try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen();if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch(err){app.toast('기기 자동 회전을 켜고 가로로 돌려주세요.');}};
 }
 finishGesture(id,cancel){const g=this.gestures.get(id);if(!g)return;clearTimeout(g.timer);this.gestures.delete(id);
  if(g.held){this.buttons.mine=false;this.releaseAction('left');
   // In a busy mobile frame, the long-press timer may fire while the user's
   // short tap release is queued. A near-immediate release after that timer
   // must still count as a tap (especially while placing blocks).
   if(cancel||g.moved||g.heldAction!=='mine'||performance.now()-g.heldAt>=165)return;
  }else if(cancel||g.moved||this.app.modal())return;
  if(this.app.modal())return;
  const a=this.app.actor();if(!a||a.dead)return;
  const aim=direction(this.app.renderer.camera.yaw,this.app.renderer.camera.pitch);
  // Renderer aim and game input share this camera vector; next tick sets facing before commands.
  const preview={...a,facing:aim},enemy=this.app.sim.physics.aimEnemy(preview,Combat.weapon(a).reach),block=this.app.sim.aim(preview),item=Inventory.stats(a).item;
  if(enemy){this.pressAction('left','touch');this.releaseAction('left');return;}
  if(block&&BLOCKS[block.id]?.station){this.app.command({op:'interact'});return;}
  if(item?.id==='bucket'||item?.id==='waterBucket'){this.pressAction('right','touch');this.releaseAction('right');return;}
  if(block&&item?.block){this.pressAction('right','touch');this.releaseAction('right');return;}
  this.pressAction('left','touch');this.releaseAction('left');
 }
 pressAction(key,source){
  if(this.buttons[key])return;
  this.buttons[key]=true;
  this.actionQueue[key].push({down:true,source});
  if(this.actionQueue[key].length>64)this.actionQueue[key].splice(0,2);
 }
 releaseAction(key){
  if(!this.buttons[key])return;
  this.buttons[key]=false;
  this.actionQueue[key].push({down:false,source:this.source[key]});
 }
 buttonSample(key){
  const next=this.actionQueue[key].shift();
  if(next){this.emitted[key]=next.down;if(next.down)this.source[key]=next.source;}
  return {down:this.emitted[key],touch:this.source[key]==='touch'};
 }
 touchDistance(){const t=[...this.touches.values()];return Math.hypot(t[0].x-t[1].x,t[0].y-t[1].y);}
 rotate(dx,dy,speed){const c=this.app.renderer.camera;c.yaw=(c.yaw-dx*speed)%TAU;c.pitch=clamp(c.pitch+dy*speed,-1.4,1.4);}
 release(){this.domInput.releaseAll();this.actions.releaseSource('touch-context');this.actions.releaseSource('touch-swim-rise');this.actions.consume();this.buttons={left:false,right:false,mine:false,sprint:false};this.actionQueue={left:[],right:[]};this.emitted={left:false,right:false};this.source={left:'mouse',right:'mouse'};this.joy={x:0,z:0};this.joySprint=false;document.getElementById('joystick')?.classList.remove('sprinting');for(const g of this.gestures.values())clearTimeout(g.timer);this.gestures.clear();this.touches.clear();}
 sample(){const c=this.app.renderer.camera,active=!this.app.modal()&&!document.hidden,s={};const held=name=>(this.actions.sampleInto(name,s),s.held),pressed=name=>(this.actions.sampleInto(name,s),s.pressed);let x=(held('move.right')?1:0)-(held('move.left')?1:0)+this.joy.x,z=(held('move.back')?1:0)-(held('move.forward')?1:0)+this.joy.z;const length=Math.max(1,Math.hypot(x,z));x/=length;z/=length;const wx=x*cosQ(c.yaw)+z*sinQ(c.yaw),wz=-x*sinQ(c.yaw)+z*cosQ(c.yaw);
  const left=active?this.buttonSample('left'):{down:false,touch:false},right=active?this.buttonSample('right'):{down:false,touch:false};if(!active){this.actionQueue.left.length=0;this.actionQueue.right.length=0;this.emitted.left=false;this.emitted.right=false;}
  const forwardInput=z<-.35,sprintKey=held('move.sprint'),roll=pressed('move.context'),jump=pressed('move.jump');const i={enabled:active,x:active?wx:0,z:active?wz:0,yaw:c.yaw,pitch:c.pitch,selected:this.app.selected,left:left.down,right:right.down,mine:active&&this.buttons.mine,attackOnly:left.touch,roll:active&&roll,jump:active&&jump,swimRise:active&&held('move.jump'),swimDive:active&&held('move.context'),sprint:active&&forwardInput&&(this.joySprint||sprintKey)};this.actions.consume();return encodeInputObject(i);
 }
 dispose(){this.release();this.domInput.dispose();}
}