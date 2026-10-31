'use strict';
/* Fixed 30 Hz simulation with interpolated rendering. Single player is a one-person lockstep: commands go through step(). */
class App{
 constructor(THREE,rig){
  this.sim=new Simulation();this.renderer=new Renderer(THREE,document.getElementById('world'),this.sim.world,rig);
  this.controls=new Controls(window,step=>this.renderer.rotate(step));
  this.previous={x:0,z:0};this.accumulator=0;this.last=0;this.seconds=0;this.started=false;this.commands=[];
 }
 start(){this.started=true;this.last=performance.now();requestAnimationFrame(t=>this.frame(t))}
 tick(){
  const p=this.sim.player,cmd=this.controls.command(this.renderer.yawStep,p.tier);
  this.previous={x:p.x,z:p.z};this.sim.step(cmd);this.commands.push(cmd);if(this.commands.length>900)this.commands.shift();
 }
 frame(now){
  const step=1000/CFG.tickRate,dt=Math.min(250,now-this.last);this.last=now;this.accumulator+=dt;this.seconds+=dt/1000;
  while(this.accumulator>=step){this.tick();this.accumulator-=step}
  this.renderer.render(this.sim,this.previous,this.accumulator/step,this.seconds);this.hud();
  requestAnimationFrame(t=>this.frame(t));
 }
 hud(){const p=this.sim.player,text=CFG.tiers[p.tier]+(p.tier?' · '+{sword:'검',greatsword:'대검',spear:'창',axe:'도끼'}[p.weapon]:'');
  if(this.hudText!==text){this.hudText=text;document.getElementById('equip').textContent=text}}
}
