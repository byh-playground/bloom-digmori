class CompanionRenderer {
 constructor(renderer){this.r=renderer;this.atlas=createCompanionCombatAtlas(renderer.gl);this.samples=[];}
 world(out,root,mode,clip,frame,dir={x:0,y:0,z:-1},sizeScale=1){const r=this.r,view=(Math.round(Math.atan2(dir.x*cosQ(r.camera.yaw)-dir.z*sinQ(r.camera.yaw),dir.x*sinQ(r.camera.yaw)+dir.z*cosQ(r.camera.yaw))/(Math.PI/4))+8)%8,
  folded=view>=5?8-view:view,art=this.atlas.frames[mode+'/'+clip+'/'+folded+'/'+frame];if(!art)return;
  r.sprite(out,V.add(root,{x:0,y:-1,z:0}),4*sizeScale,4*sizeScale,art,[1,1,1,1],view>=5);this.samples.push({mode,clip,frame,view,sizeScale,root:{...root}});
 }
 prepare(view,sim,actor,dyn){const r=this.r;this.behind=[];this.front=[];this.samples=[];
  for(const b of Object.values(sim.companions.data.bases))if(r.worldVisualReady(b.pos,.3))r.box(dyn,V.add(b.pos,{x:1,y:.02,z:0}),{x:.9,y:.45,z:.65},[.42,.53,.32]);
  for(const u of Object.values(view.companions)){const a=view.actors[u.owner];if(!a||a.dead||a.suspended)continue;const mode=COMPANION_TYPES[u.kind].art;
   if(u.location==='work'){if(!r.worldVisualReady(u.pos,.3))continue;const progress=u.phase==='gather'?u.progress/Math.max(1,BLOCKS[u.target?.id]?.hardness||650):0;this.world(this.front,V.add(u.pos,{x:0,y:mode==='claw'?-.52:0,z:0}),mode,mode==='claw'&&u.phase==='gather'?'attack':'work',mode==='claw'&&u.phase==='gather'?Math.min(11,Math.floor(progress*12)):Math.min(3,Math.floor(progress*4)),a.facing);continue;}
   if(u.phase==='return'){if(r.worldVisualReady(u.pos,.3)){const frame=Math.floor(sim.tick/3)%4,dir=V.sub(sim.companions.socket(a,u.slot),u.pos);this.world(this.front,V.add(u.pos,{x:0,y:mode==='claw'?-.52:0,z:0}),mode,'return',frame,dir);}continue;}
   if(u.location!=='combat'||u.phase==='flight')continue;
   const visual=r.combatFx.pose(a),c=visual.combat,act=c.action;if(c.state!=='attack'||act?.companionId!==u.id)continue;
   if(mode==='claw'){const timing=actionTiming(act,c.elapsed),stage=timing.stage==='wind'?0:timing.stage==='active'?1:2,frame=stage*4+Math.min(3,Math.floor(timing.phase*4)),compact=Math.min(r.canvas.clientWidth||innerWidth,r.canvas.clientHeight||innerHeight)<=480;this.world(this.front,clawWorldPose(visual,act,c.elapsed).root,'claw','attack',frame,act.dir,compact?1.35:1);}
   else if(!act.fired)this.world(this.front,V.add(companionRoot(visual,act.dir),{x:0,y:.9,z:0}),'ball','prepare',Math.min(7,Math.floor(c.elapsed/act.wind*8)),act.dir);
  }
  for(const p of Object.values(view.projectiles))if(p.companionId&&r.worldVisualReady(p.pos,.3)){
   const clip=p.throwPhase==='ground'?'ground':'flight',frame=clip==='ground'?Math.min(3,Math.floor((p.groundMs||0)/COMPANION_TYPES[p.companionKind].capabilities.attack.groundHoldMs*4)):Math.floor(p.age/100)%4;
   this.world(this.front,p.pos,'ball',clip,frame,p.dir);const radius=COMPANION_TYPES[p.companionKind].capabilities.attack.projectile.radius,origin=V.add(p.pos,{x:0,y:-radius,z:0}),hit=sim.terrain.ray(origin,{x:0,y:-1,z:0},12);
   if(hit&&hit.normal.y>.7){const size=.27/(1+hit.distance*.2);r.box(dyn,{x:p.pos.x,y:origin.y-hit.distance+.012,z:p.pos.z},{x:size*2,y:.01,z:size*1.3},[.20,.30,.22]);}
  }
 }
 draw(front){const vertices=front?this.front:this.behind;if(!vertices.length)return;const r=this.r,gl=r.gl,p=r.spriteProgram;gl.useProgram(p);gl.uniformMatrix4fv(gl.getUniformLocation(p,'vp'),false,r.vp);gl.uniform1f(gl.getUniformLocation(p,'ambient'),r.ambient??1);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.atlas.tex);gl.uniform1i(gl.getUniformLocation(p,'tex'),0);gl.bindBuffer(gl.ARRAY_BUFFER,r.spriteBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);r.attrib(p,'p',3,36,0);r.attrib(p,'uv',2,36,12);r.attrib(p,'tint',4,36,20);gl.drawArrays(gl.TRIANGLES,0,vertices.length/9);}
}
