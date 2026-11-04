'use strict';
/* D-165 shoulder-camera controls. A click on the world locks the pointer: mouse movement turns the camera (Renderer.look)
 * and the crosshair at the screen centre is the aim. Unlocked (Esc, a menu open, or a browser without pointer lock) the
 * visible OS cursor aims instead. Either way the renderer picks the block face or actor under the aim point every frame
 * (Renderer.pickAt), and every input packet carries the aim toward that point plus the target block face.
 * Left button (D-123): the sim decides from the held ticks in the packets: released within CFG.mining.holdTicks (0.2 s) it
 * is the basic attack toward the cursor; held longer it mines the first block on the ray from the head toward the cursor
 * (within reach), re-aimed every tick, until released. Nothing walks by itself. A right click places/uses at the cursor
 * face, and in mid-air with the cursor on the player it places under the feet. The wheel or a pinch zooms.
 * Touch (D-124): a long press always mines (the left button held with the hold flag, the target follows the finger); a tap
 * is the right click when it places or uses (a placeable block, a potion or bucket held, or a gate/station tapped with no
 * weapon held), else the basic attack. Dragging a finger on the world turns the camera. The joystick moves; the airborne
 * 발밑 설치 button places under the feet. */
class Controls {
 constructor(app){this.app=app;this.actions=new app.gamekit.input.ActionState();this.buttons={left:false,right:false};this.actionQueue={left:[],right:[]};this.emitted={left:false,right:false};this.source={left:'mouse',right:'mouse'};this.underFeet=false;this.hold=false;this.joy={x:0,z:0};this.joySprint=false;this.pointer={x:innerWidth*.5,y:innerHeight*.5,shown:!matchMedia('(pointer:coarse)').matches};app.renderer.pointer=this.pointer;this.touches=new Map();this.gestures=new Map();this.gestureHoldMs=250;this.gestureSlop=13;this.pinch=0;this.lastAim={yaw:0,pitch:0};const canvas=app.renderer.canvas;
  this.domInput=app.gamekit.input.createDOMInput({target:canvas,state:this.actions,keys:{KeyW:'move.forward',KeyS:'move.back',KeyA:'move.left',KeyD:'move.right',ControlLeft:'move.sprint',ControlRight:'move.sprint',ShiftLeft:'move.context',ShiftRight:'move.context',Space:'move.jump'},touchAction:'none',excludeTarget:(target)=>app.modal()||!!target?.closest?.('input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),[data-gamekit-ui]')});
  document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select,[contenteditable]'))return;const active=!app.modal(),bag=e.code==='Tab'||e.code==='KeyI';
   if(['KeyF','KeyG','KeyI','KeyJ','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9'].includes(e.code)||bag&&(active||!$('inventory').hidden))e.preventDefault();
   if(e.code==='Escape'){app.closeAll();return;}if(e.repeat)return;
   
   // Tab or I opens and closes the bag; Tab keeps moving focus inside other menus.
   if(bag&&(active||!$('inventory').hidden)){app.toggleInventory();return;}if(e.code==='KeyJ'){app.toggleJournal();return;}if(!active)return;
   // G throws the held item forward (Ctrl+G the stack).
   if(e.code==='KeyF')app.command({op:'interact'});if(e.code==='KeyG')app.command({op:'drop',all:e.ctrlKey});
   if(/^Digit[1-9]$/.test(e.code))app.select(+e.code.slice(-1)-1);
  });
  canvas.addEventListener('pointerdown',e=>{if(app.modal())return;if(e.pointerType==='mouse'){canvas.focus({preventScroll:true});
   if(this.locked())this.centerPointer();else{this.setPointer(e.clientX,e.clientY);canvas.requestPointerLock?.();}
   if(e.button===0)this.primary(this.pointer.x,this.pointer.y,'mouse');if(e.button===2)this.secondary(this.pointer.x,this.pointer.y,'mouse');
  }else{e.preventDefault();this.setPointer(e.clientX,e.clientY,true);canvas.setPointerCapture(e.pointerId);this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
   const gesture={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,held:false,timer:null};this.gestures.set(e.pointerId,gesture);
   // A long press mines at the press point (held until the finger lifts; moving the finger moves the target).
   gesture.timer=setTimeout(()=>{if(gesture.moved||this.touches.size!==1||app.modal())return;gesture.held=true;this.setPointer(gesture.x,gesture.y,true);this.pressAction('left','touch',false,true);},this.gestureHoldMs);
   if(this.touches.size===2){this.pinch=this.touchDistance();for(const v of this.gestures.values()){clearTimeout(v.timer);v.moved=true;}}
  }});
  document.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){if(e.button===0)this.releaseAction('left');if(e.button===2)this.releaseAction('right');}
   else this.finishGesture(e.pointerId,false);
   this.touches.delete(e.pointerId);this.pinch=0;});
  canvas.addEventListener('pointercancel',e=>{this.finishGesture(e.pointerId,true);this.touches.delete(e.pointerId);this.pinch=0;});
  canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')return;const prev=this.touches.get(e.pointerId);if(!prev)return;
   const g=this.gestures.get(e.pointerId);if(g){g.x=e.clientX;g.y=e.clientY;if(g.held)this.setPointer(g.x,g.y,true);else if(Math.hypot(g.x-g.startX,g.y-g.startY)>this.gestureSlop){g.moved=true;clearTimeout(g.timer);}
    // A one-finger drag that is not a long press turns the camera.
    if(g.moved&&!g.held&&this.touches.size===1&&!app.modal()){const k=CFG.camera.touchSensitivity;app.renderer.look((e.clientX-prev.x)*k,(e.clientY-prev.y)*k);}}
   this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.touches.size===2){const dist=this.touchDistance();if(this.pinch)app.renderer.setZoom(app.renderer.camera.distance*this.pinch/dist);this.pinch=dist;}});
  document.addEventListener('mousemove',e=>{if(e.sourceCapabilities?.firesTouchEvents)return;
   if(this.locked()){const k=CFG.camera.mouseSensitivity;app.renderer.look(e.movementX*k,e.movementY*k);this.centerPointer();return;}
   this.setPointer(e.clientX,e.clientY);if(app.modal())app.moveCursor();});
  document.addEventListener('pointerlockchange',()=>{const on=this.locked();document.body.classList.toggle('aim-locked',on);if(on)this.centerPointer();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('wheel',e=>{e.preventDefault();if(!app.modal()&&e.deltaY)app.renderer.zoomCamera(e.deltaY>0?1:-1);},{passive:false});
  const joy=$('joystick');let id=null,center=null;
  const update=e=>{if(e.pointerId!==id)return;const x=(e.clientX-center.x)/42,z=(e.clientY-center.y)/42,raw=Math.hypot(x,z),length=Math.max(1,raw);this.joy={x:x/length,z:z/length};const forward=raw>0?-z/raw:0;this.joySprint=raw>=CFG.input.sprintOuter&&forward>=CFG.input.sprintForward;joy.classList.toggle('sprinting',this.joySprint);$('stick').style.transform=`translate(${this.joy.x*29}px,${this.joy.z*29}px)`;};
  joy.addEventListener('pointerdown',e=>{e.preventDefault();id=e.pointerId;const r=joy.getBoundingClientRect();center={x:r.left+r.width/2,y:r.top+r.height/2};joy.setPointerCapture(id);update(e);});joy.addEventListener('pointermove',update);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(event,e=>{if(e.pointerId!==id)return;id=null;this.joy={x:0,z:0};this.joySprint=false;joy.classList.remove('sprinting');$('stick').style.transform='';});
  for(const b of document.querySelectorAll('[data-touch]')){const key=b.dataset.touch;b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(key==='jump')this.actions.set('move.jump','touch-swim-rise',true);else if(key==='roll')this.actions.set('move.context','touch-context',true);});for(const evt of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(evt,()=>{if(key==='jump')this.actions.set('move.jump','touch-swim-rise',false);else if(key==='roll')this.actions.set('move.context','touch-context',false);});}
  // 0.36.0 on-screen under-feet placement (mobile pillar-up): the same right press with the under-feet bit as a mid-air
  // right click on the player. Shown by updatePlaceButton only while airborne with a placeable block held.
  const place=$('mobile-place');place.addEventListener('pointerdown',e=>{e.preventDefault();if(app.modal())return;place.setPointerCapture(e.pointerId);this.pressAction('right','touch',true);});
  for(const evt of ['pointerup','pointercancel','lostpointercapture'])place.addEventListener(evt,()=>this.releaseAction('right'));
  $('rotate-request').onclick=async()=>{try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen();if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch(err){app.toast('기기 자동 회전을 켜고 가로로 돌려주세요.');}};
 }
 // The under-feet button is contextual: airborne (not swimming), alive, no menu, holding a placeable non-egg block.
 updatePlaceButton(){const a=this.app.actor(),s=a&&Inventory.selected(a.inventory),def=s&&ITEMS[s.id],show=!!a&&!a.dead&&!a.grounded&&!a.swim?.inWater&&!this.app.modal()&&!!def?.block,b=$('mobile-place');if(b.hidden===show)b.hidden=!show;}
 locked(){return document.pointerLockElement===this.app.renderer.canvas;}
 centerPointer(){const c=this.app.renderer.canvas;this.pointer.x=c.clientWidth/2;this.pointer.y=c.clientHeight/2;this.pointer.shown=true;}
 // The cursor highlight shows for a mouse, and for a touch only while the finger is down (and briefly after).
 setPointer(x,y,touch=false){this.pointer.x=x;this.pointer.y=y;this.pointer.shown=true;clearTimeout(this.hideTimer);if(touch)this.hideTimer=setTimeout(()=>{if(![...this.gestures.values()].some(g=>g.held))this.pointer.shown=false;},900);}
 // Left press: the sim turns it into an attack (short) or mining (held), see the header.
 primary(x,y,source){const a=this.app.actor();if(!a||a.dead)return;this.pressAction('left',source);}
 // A touch tap: the right click when it places or uses something, else the basic attack (left press and release).
 tap(x,y){const app=this.app,a=app.actor();if(!a||a.dead)return;const pick=app.renderer.pickAt(x,y),item=Inventory.stats(a).item,def=pick?.block&&BLOCKS[pick.block.id];
  const use=(!!item?.throwable||item?.id==='bucket'||item?.id==='waterBucket'||!pick?.entity&&(!!item?.block||!item?.weapon&&!!(def?.gate||def?.station)));
  if(use){this.secondary(x,y,'touch');this.releaseAction('right');}else{this.primary(x,y,'touch');this.releaseAction('left');}}
 // Right click: place/use at the cursor face; in mid-air with the cursor on (or next to) the player, under the feet.
 secondary(x,y,source){const app=this.app,a=app.actor();if(!a||a.dead)return;const pick=app.renderer.pickAt(x,y);this.pressAction('right',source,!!pick?.self&&!a.grounded);}
 finishGesture(id,cancel){const g=this.gestures.get(id);if(!g)return;clearTimeout(g.timer);this.gestures.delete(id);
  if(g.held){this.releaseAction('left');this.setPointer(g.x,g.y,true);return;}
  if(cancel||g.moved||this.app.modal())return;
  this.setPointer(g.x,g.y,true);this.tap(g.x,g.y);
 }
 pressAction(key,source,underFeet=false,hold=false){
  if(this.buttons[key])return;
  this.buttons[key]=true;
  this.actionQueue[key].push({down:true,source,underFeet,hold});
  if(this.actionQueue[key].length>64)this.actionQueue[key].splice(0,2);
 }
 releaseAction(key){
  if(!this.buttons[key])return;
  this.buttons[key]=false;
  this.actionQueue[key].push({down:false,source:this.source[key],underFeet:false,hold:false});
 }
 buttonSample(key){
  const next=this.actionQueue[key].shift();
  if(next){this.emitted[key]=next.down;if(next.down){this.source[key]=next.source;if(key==='right')this.underFeet=next.underFeet;else this.hold=next.hold;}}
  return {down:this.emitted[key],touch:this.source[key]==='touch',underFeet:key==='right'&&this.emitted[key]&&this.underFeet,hold:key==='left'&&this.emitted[key]&&!!this.hold};
 }
 touchDistance(){const t=[...this.touches.values()];return Math.hypot(t[0].x-t[1].x,t[0].y-t[1].y);}
 release(){this.domInput.releaseAll();this.actions.releaseSource('touch-context');this.actions.releaseSource('touch-swim-rise');this.actions.consume();this.buttons={left:false,right:false};this.actionQueue={left:[],right:[]};this.emitted={left:false,right:false};this.source={left:'mouse',right:'mouse'};this.underFeet=false;this.hold=false;this.joy={x:0,z:0};this.joySprint=false;document.getElementById('joystick')?.classList.remove('sprinting');for(const g of this.gestures.values())clearTimeout(g.timer);this.gestures.clear();this.touches.clear();}
 // WASD and the joystick move in the camera's directions (W = where the camera looks, flattened); the aim yaw/pitch looks
 // from the eye at the aim point and the target names the block face under it.
 sample(){const c=this.app.renderer.camera,active=!this.app.modal()&&!document.hidden,s={};
  // A menu needs the OS cursor: opening one releases the pointer (a click on the world locks it again).
  if(this.locked()){if(this.app.modal())document.exitPointerLock();else this.centerPointer();}const held=name=>(this.actions.sampleInto(name,s),s.held),pressed=name=>(this.actions.sampleInto(name,s),s.pressed);let x=(held('move.right')?1:0)-(held('move.left')?1:0)+this.joy.x,z=(held('move.back')?1:0)-(held('move.forward')?1:0)+this.joy.z;const length=Math.max(1,Math.hypot(x,z));x/=length;z/=length;const wx=x*cosQ(c.yaw)+z*sinQ(c.yaw),wz=-x*sinQ(c.yaw)+z*cosQ(c.yaw);
  const left=active?this.buttonSample('left'):{down:false,touch:false},right=active?this.buttonSample('right'):{down:false,touch:false,underFeet:false};if(!active){this.actionQueue.left.length=0;this.actionQueue.right.length=0;this.emitted.left=false;this.emitted.right=false;}
  const a=this.app.actor(),pick=this.app.renderer.cursor;if(a&&pick){const d=V.sub(pick.point,{x:a.pos.x,y:a.pos.y+CFG.player.eyeHeight,z:a.pos.z}),len=V.len(d);if(len>.05)this.lastAim={yaw:Math.atan2(-d.x,-d.z),pitch:Math.asin(clamp(-d.y/len,-1,1))};}
  const target=active&&pick?.block?{x:pick.block.x,y:pick.block.y,z:pick.block.z,normal:pick.block.normal}:null;
  const forwardInput=z<-.35,sprintKey=held('move.sprint'),roll=pressed('move.context'),jump=pressed('move.jump');const i={enabled:active,x:active?wx:0,z:active?wz:0,yaw:this.lastAim.yaw,pitch:this.lastAim.pitch,selected:this.app.selected,left:left.down,hold:active&&!!left.hold,right:right.down,underFeet:active&&!!right.underFeet,target,roll:active&&roll,jump:active&&jump,swimRise:active&&held('move.jump'),swimDive:active&&held('move.context'),sprint:active&&forwardInput&&(this.joySprint||sprintKey)};this.actions.consume();return encodeInputObject(i);
 }
 dispose(){this.release();this.domInput.dispose();}
}
