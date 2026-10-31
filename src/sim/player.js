'use strict';
/* Player state machine. One state at a time (DEV-002); every field is an integer. */
const PLAYER_STATE=Object.freeze({idle:0,move:1,roll:2,attack:3});
class Player{
 constructor(){
  this.x=0;this.z=0;this.facing=4;this.state=PLAYER_STATE.idle;this.ticks=0;
  this.rollDir=4;this.rollCooldown=0;this.combo=0;this.queued=0;
  this.weapon='sword';this.tier=1;
 }
 timing(){return CFG.attack[CFG.weapons[this.weapon]]}
 enter(state){this.state=state;this.ticks=0}
 // cmd: {move:-1|0..15, roll:0|1, attack:0|1, weapon?:string, tier?:0..2}
 step(cmd,world){
  if(cmd.weapon&&CFG.weapons[cmd.weapon]&&this.state!==PLAYER_STATE.attack)this.weapon=cmd.weapon;
  if(cmd.tier>=0&&cmd.tier<CFG.tiers.length&&this.state!==PLAYER_STATE.attack)this.tier=cmd.tier;
  if(this.rollCooldown>0)this.rollCooldown--;
  if(cmd.roll&&this.state!==PLAYER_STATE.roll&&this.rollCooldown===0){
   this.rollDir=cmd.move>=0?cmd.move:this.facing;this.facing=this.rollDir;this.queued=0;this.enter(PLAYER_STATE.roll);
  }
  else if(cmd.attack)this.requestAttack();
  if(this.state===PLAYER_STATE.roll)this.stepRoll(world);
  else if(this.state===PLAYER_STATE.attack)this.stepAttack(world);
  else this.stepMove(cmd,world);
  this.ticks++;
 }
 requestAttack(){
  if(this.state!==PLAYER_STATE.attack){this.combo=0;this.enter(PLAYER_STATE.attack);return}
  this.queued=1; // buffered: the next hit starts at this swing's hold point

 }
 stepMove(cmd,world){
  if(cmd.move<0){if(this.state!==PLAYER_STATE.idle)this.enter(PLAYER_STATE.idle);return}
  this.facing=cmd.move;if(this.state!==PLAYER_STATE.move)this.enter(PLAYER_STATE.move);
  this.slide(cmd.move,CFG.player.walkPerTick,world);
 }
 stepRoll(world){
  const roll=CFG.player.roll,curve=roll.curvePermille;
  if(this.ticks>=curve.length){this.rollCooldown=roll.cooldownTicks;this.enter(PLAYER_STATE.idle);return}
  this.slide(this.rollDir,scaleQ(roll.speedPerTick,curve[this.ticks]),world);
 }
 stepAttack(world){
  const t=this.timing();
  if(this.ticks>=t.windup&&this.ticks<t.strike)this.slide(this.facing,t.lungePerTick,world);
  if(this.queued&&this.ticks>=t.hold){this.queued=0;this.combo=(this.combo+1)%CFG.attack.comboLength;this.enter(PLAYER_STATE.attack);return}
  if(this.ticks>=t.recover){this.combo=0;this.enter(PLAYER_STATE.idle)}
 }
 invulnerable(){const w=CFG.player.roll.invulnerable;return this.state===PLAYER_STATE.roll&&this.ticks>=w[0]&&this.ticks<w[1]}
 // Axis-separated move so walls slide instead of stopping dead.
 slide(dir,amount,world){
  const d=stepAlong(dir,amount),r=CFG.player.radius;
  if(!world.blocked(this.x+d[0],this.z,r))this.x+=d[0];
  if(!world.blocked(this.x,this.z+d[1],r))this.z+=d[1];
 }
 checksumValues(){return[this.x,this.z,this.facing,this.state,this.ticks,this.rollDir,this.rollCooldown,this.combo,this.queued,this.tier,Object.keys(CFG.weapons).indexOf(this.weapon)]}
}
