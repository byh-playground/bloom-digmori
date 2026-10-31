'use strict';
/* D-114 cursor controls. The OS cursor stays visible: the renderer picks the block face or actor under it every frame
 * (Renderer.pickAt), and every input packet carries the aim toward that point plus the target block face. A left click
 * on a minable block sends a 'mine' command (the sim walks there and mines it), on anything else it is the basic attack
 * toward the cursor; a right click places/uses at the cursor face, and in mid-air with the cursor on the player it places
 * under the feet. Q/E turn the camera in 45° steps, the wheel or a pinch zooms. Touch: tap = left click, long press =
 * right click, the joystick moves. */
class Controls {
 constructor(app){this.app=app;this.actions=new app.gamekit.input.ActionState();this.buttons={left:false,right:false};this.actionQueue={left:[],right:[]};this.emitted={left:false,right:false};this.source={left:'mouse',right:'mouse'};this.underFeet=false;this.joy={x:0,z:0};this.joySprint=false;this.pointer={x:innerWidth*.5,y:innerHeight*.5,shown:!matchMedia('(pointer:coarse)').matches};app.renderer.pointer=this.pointer;this.touches=new Map();this.gestures=new Map();this.gestureHoldMs=350;this.gestureSlop=13;this.pinch=0;this.lastAim={yaw:0,pitch:0};const canvas=app.renderer.canvas;
  this.domInput=app.gamekit.input.createDOMInput({target:canvas,state:this.actions,keys:{KeyW:'move.forward',KeyS:'move.back',KeyA:'move.left',KeyD:'move.right',ControlLeft:'move.sprint',ControlRight:'move.sprint',ShiftLeft:'move.context',ShiftRight:'move.context',Space:'move.jump'},touchAction:'none',excludeTarget:(target)=>app.modal()||!!target?.closest?.('input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),[data-gamekit-ui]')});
  document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select,[contenteditable]'))return;const active=!app.modal(),bag=e.code==='Tab'||e.code==='KeyI';
   if(['KeyQ','KeyE','KeyF','KeyG','KeyI','KeyJ','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9'].includes(e.code)||bag&&(active||!$('inventory').hidden))e.preventDefault();
   if(e.code==='Escape'){app.closeAll();return;}if(e.repeat)return;
   if(e.code==='KeyK'){app.companionPanel.toggle();return;}if(['KeyZ','KeyX','KeyC'].includes(e.code)&&active){app.command({op:'companion',action:'select',slot:['KeyZ','KeyX','KeyC'].indexOf(e.code)});return;}
   // Tab or I opens and closes the bag (E turns the camera now); Tab keeps moving focus inside other menus.
   if(bag&&(active||!$('inventory').hidden)){app.toggleInventory();return;}if(e.code==='KeyJ'){app.toggleJournal();return;}if(!active)return;
   if(e.code==='KeyQ'){app.renderer.rotateCamera(1);return;}if(e.code==='KeyE'){app.renderer.rotateCamera(-1);return;}
   // G throws the held item forward (Ctrl+G the stack); it was Q before Q/E became the camera turn keys.
   if(e.code==='KeyF')app.command({op:'interact'});if(e.code==='KeyG')app.command({op:'drop',all:e.ctrlKey});
   if(/^Digit[1-9]$/.test(e.code))app.select(+e.code.slice(-1)-1);
  });
  canvas.addEventListener('pointerdown',e=>{if(app.modal())return;this.setPointer(e.clientX,e.clientY,e.pointerType!=='mouse');if(e.pointerType==='mouse'){canvas.focus({preventScroll:true});
   if(e.button===0)this.primary(e.clientX,e.clientY,'mouse');if(e.button===2)this.secondary(e.clientX,e.clientY,'mouse');
  }else{e.preventDefault();canvas.setPointerCapture(e.pointerId);this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
   const gesture={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,held:false,timer:null};this.gestures.set(e.pointerId,gesture);
   // A long press is the right click (place / use) at the press point.
   gesture.timer=setTimeout(()=>{if(gesture.moved||this.touches.size!==1||app.modal())return;gesture.held=true;this.setPointer(gesture.x,gesture.y,true);this.secondary(gesture.x,gesture.y,'touch');this.releaseAction('right');},this.gestureHoldMs);
   if(this.touches.size===2){this.pinch=this.touchDistance();for(const v of this.gestures.values()){clearTimeout(v.timer);v.moved=true;}}
  }});
  document.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){if(e.button===0)this.releaseAction('left');if(e.button===2)this.releaseAction('right');}
   else this.finishGesture(e.pointerId,false);
   this.touches.delete(e.pointerId);this.pinch=0;});
  canvas.addEventListener('pointercancel',e=>{this.finishGesture(e.pointerId,true);this.touches.delete(e.pointerId);this.pinch=0;});
  canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')return;const prev=this.touches.get(e.pointerId);if(!prev)return;
   const g=this.gestures.get(e.pointerId);if(g){g.x=e.clientX;g.y=e.clientY;if(Math.hypot(g.x-g.startX,g.y-g.startY)>this.gestureSlop){g.moved=true;clearTimeout(g.timer);}}
   this.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.touches.size===2){const dist=this.touchDistance();if(this.pinch)app.renderer.setZoom(app.renderer.camera.distance*this.pinch/dist);this.pinch=dist;}});
  document.addEventListener('mousemove',e=>{if(e.sourceCapabilities?.firesTouchEvents)return;this.setPointer(e.clientX,e.clientY);if(app.modal())app.moveCursor();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('wheel',e=>{e.preventDefault();if(!app.modal()&&e.deltaY)app.renderer.zoomCamera(e.deltaY>0?1:-1);},{passive:false});
  const joy=$('joystick');let id=null,center=null;
  const update=e=>{if(e.pointerId!==id)return;const x=(e.clientX-center.x)/42,z=(e.clientY-center.y)/42,raw=Math.hypot(x,z),length=Math.max(1,raw);this.joy={x:x/length,z:z/length};const forward=raw>0?-z/raw:0;this.joySprint=raw>=CFG.input.sprintOuter&&forward>=CFG.input.sprintForward;joy.classList.toggle('sprinting',this.joySprint);$('stick').style.transform=`translate(${this.joy.x*29}px,${this.joy.z*29}px)`;};
  joy.addEventListener('pointerdown',e=>{e.preventDefault();id=e.pointerId;const r=joy.getBoundingClientRect();center={x:r.left+r.width/2,y:r.top+r.height/2};joy.setPointerCapture(id);update(e);});joy.addEventListener('pointermove',update);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(event,e=>{if(e.pointerId!==id)return;id=null;this.joy={x:0,z:0};this.joySprint=false;joy.classList.remove('sprinting');$('stick').style.transform='';});
  for(const b of document.querySelectorAll('[data-touch]')){const key=b.dataset.touch;b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(key==='jump')this.actions.set('move.jump','touch-swim-rise',true);else if(key==='roll')this.actions.set('move.context','touch-context',true);});for(const evt of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(evt,()=>{if(key==='jump')this.actions.set('move.jump','touch-swim-rise',false);else if(key==='roll')this.actions.set('move.context','touch-context',false);});}
  // On-screen camera turn buttons (the Q/E steps).
  for(const b of document.querySelectorAll('[data-turn]'))b.addEventListener('click',e=>{e.preventDefault();if(!app.modal())app.renderer.rotateCamera(+b.dataset.turn);});
  $('rotate-request').onclick=async()=>{try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen();if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch(err){app.toast('기기 자동 회전을 켜고 가로로 돌려주세요.');}};
 }
 // The cursor highlight shows for a mouse, and for a touch only while the finger is down (and briefly after).
 setPointer(x,y,touch=false){this.pointer.x=x;this.pointer.y=y;this.pointer.shown=true;clearTimeout(this.hideTimer);if(touch)this.hideTimer=setTimeout(()=>{this.pointer.shown=false;},900);}
 // Left click: a minable block under the cursor becomes the walk-and-mine task; anything else is the basic attack.
 primary(x,y,source){const app=this.app,a=app.actor();if(!a||a.dead)return;const pick=app.renderer.pickAt(x,y),item=Inventory.stats(a).item,block=pick?.block,def=block&&BLOCKS[block.id];
  if(block&&!pick.entity&&a.companionSlot<0&&(!item?.weapon||item.tool)&&Number.isFinite(def?.hardness)){app.command({op:'mine',x:block.x,y:block.y,z:block.z});return;}
  this.pressAction('left',source);}
 // Right click: place/use at the cursor face; in mid-air with the cursor on (or next to) the player, under the feet.
 secondary(x,y,source){const app=this.app,a=app.actor();if(!a||a.dead)return;const pick=app.renderer.pickAt(x,y);this.pressAction('right',source,!!pick?.self&&!a.grounded);}
 finishGesture(id,cancel){const g=this.gestures.get(id);if(!g)return;clearTimeout(g.timer);this.gestures.delete(id);
  if(g.held||cancel||g.moved||this.app.modal())return;
  this.setPointer(g.x,g.y,true);this.primary(g.x,g.y,'touch');this.releaseAction('left');
 }
 pressAction(key,source,underFeet=false){
  if(this.buttons[key])return;
  this.buttons[key]=true;
  this.actionQueue[key].push({down:true,source,underFeet});
  if(this.actionQueue[key].length>64)this.actionQueue[key].splice(0,2);
 }
 releaseAction(key){
  if(!this.buttons[key])return;
  this.buttons[key]=false;
  this.actionQueue[key].push({down:false,source:this.source[key],underFeet:false});
 }
 buttonSample(key){
  const next=this.actionQueue[key].shift();
  if(next){this.emitted[key]=next.down;if(next.down){this.source[key]=next.source;if(key==='right')this.underFeet=next.underFeet;}}
  return {down:this.emitted[key],touch:this.source[key]==='touch',underFeet:key==='right'&&this.emitted[key]&&this.underFeet};
 }
 touchDistance(){const t=[...this.touches.values()];return Math.hypot(t[0].x-t[1].x,t[0].y-t[1].y);}
 release(){this.domInput.releaseAll();this.actions.releaseSource('touch-context');this.actions.releaseSource('touch-swim-rise');this.actions.consume();this.buttons={left:false,right:false};this.actionQueue={left:[],right:[]};this.emitted={left:false,right:false};this.source={left:'mouse',right:'mouse'};this.underFeet=false;this.joy={x:0,z:0};this.joySprint=false;document.getElementById('joystick')?.classList.remove('sprinting');for(const g of this.gestures.values())clearTimeout(g.timer);this.gestures.clear();this.touches.clear();}
 // WASD and the joystick move in the camera's screen directions (W = screen up); the aim yaw/pitch looks from the eye at
 // the cursor point and the target names the block face under the cursor.
 sample(){const c=this.app.renderer.camera,active=!this.app.modal()&&!document.hidden,s={};const held=name=>(this.actions.sampleInto(name,s),s.held),pressed=name=>(this.actions.sampleInto(name,s),s.pressed);let x=(held('move.right')?1:0)-(held('move.left')?1:0)+this.joy.x,z=(held('move.back')?1:0)-(held('move.forward')?1:0)+this.joy.z;const length=Math.max(1,Math.hypot(x,z));x/=length;z/=length;const wx=x*cosQ(c.yaw)+z*sinQ(c.yaw),wz=-x*sinQ(c.yaw)+z*cosQ(c.yaw);
  const left=active?this.buttonSample('left'):{down:false,touch:false},right=active?this.buttonSample('right'):{down:false,touch:false,underFeet:false};if(!active){this.actionQueue.left.length=0;this.actionQueue.right.length=0;this.emitted.left=false;this.emitted.right=false;}
  const a=this.app.actor(),pick=this.app.renderer.cursor;if(a&&pick){const d=V.sub(pick.point,{x:a.pos.x,y:a.pos.y+CFG.player.eyeHeight,z:a.pos.z}),len=V.len(d);if(len>.05)this.lastAim={yaw:Math.atan2(-d.x,-d.z),pitch:Math.asin(clamp(-d.y/len,-1,1))};}
  const target=active&&pick?.block?{x:pick.block.x,y:pick.block.y,z:pick.block.z,normal:pick.block.normal}:null;
  const forwardInput=z<-.35,sprintKey=held('move.sprint'),roll=pressed('move.context'),jump=pressed('move.jump');const i={enabled:active,x:active?wx:0,z:active?wz:0,yaw:this.lastAim.yaw,pitch:this.lastAim.pitch,selected:this.app.selected,left:left.down,right:right.down,underFeet:active&&!!right.underFeet,target,roll:active&&roll,jump:active&&jump,swimRise:active&&held('move.jump'),swimDive:active&&held('move.context'),sprint:active&&forwardInput&&(this.joySprint||sprintKey)};this.actions.consume();return encodeInputObject(i);
 }
 dispose(){this.release();this.domInput.dispose();}
}
