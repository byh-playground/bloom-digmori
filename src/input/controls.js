'use strict';
/* Keyboard to per-tick commands. Edge-triggered actions (roll, attack) are latched until the next tick reads them. */
const KEY_BINDINGS=Object.freeze({
 left:['KeyA','ArrowLeft'],right:['KeyD','ArrowRight'],up:['KeyW','ArrowUp'],down:['KeyS','ArrowDown'],
 roll:['Space','ShiftLeft'],attack:['KeyJ'],turnLeft:['KeyQ'],turnRight:['KeyE'],tier:['KeyT'],
 weapons:Object.freeze({Digit1:'sword',Digit2:'greatsword',Digit3:'spear',Digit4:'axe'})
});
class Controls{
 constructor(target,onTurn){
  this.down=new Set();this.latch={roll:0,attack:0,weapon:null,tierStep:0};this.onTurn=onTurn;
  const has=(name,code)=>KEY_BINDINGS[name].includes(code);
  target.addEventListener('keydown',e=>{if(e.repeat)return;this.down.add(e.code);
   if(has('roll',e.code))this.latch.roll=1;if(has('attack',e.code))this.latch.attack=1;if(has('tier',e.code))this.latch.tierStep=1;
   if(KEY_BINDINGS.weapons[e.code])this.latch.weapon=KEY_BINDINGS.weapons[e.code];
   if(has('turnLeft',e.code))onTurn(-1);if(has('turnRight',e.code))onTurn(1);
   if(e.code==='Space')e.preventDefault()});
  target.addEventListener('keyup',e=>this.down.delete(e.code));
  target.addEventListener('blur',()=>this.down.clear());
  target.addEventListener('pointerdown',e=>{if(e.button===0&&e.target.tagName==='CANVAS')this.latch.attack=1});
 }
 held(name){return KEY_BINDINGS[name].some(c=>this.down.has(c))}
 // yawStep: camera step 0..7; currentTier: player's tier so T cycles it.
 command(yawStep,currentTier){
  const mx=(this.held('right')?1:0)-(this.held('left')?1:0),mz=(this.held('down')?1:0)-(this.held('up')?1:0);
  const cmd={move:worldDirection(mx,mz,yawStep),roll:this.latch.roll,attack:this.latch.attack};
  if(this.latch.weapon)cmd.weapon=this.latch.weapon;if(this.latch.tierStep)cmd.tier=(currentTier+1)%CFG.tiers.length;
  this.latch={roll:0,attack:0,weapon:null,tierStep:0};return cmd;
 }
}
