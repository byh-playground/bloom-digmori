/* A single simulation clock selects poses. Animation never creates hits or moves a body. */
const ANIMATION=Object.freeze({cell:{width:64,height:64},stride:2.1,runStride:2.8,land:175,brake:150,
 clips:{idle:4,walk:8,run:8,swim:8,brake:3,charge:4,light:8,lightReverse:8,heavy:8,heavyReverse:8,overhead:8,thrust:8,thrustReverse:8,guard:4,hurt:4,hurtHeavy:4,stun:4,rise:2,fall:2,land:4,dead:5,gather:4,bow:8,bash:8},rollFrames:12,
 slash:{frames:6,tail:135,windup:70,debugGround:false}});
const easeMotion=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function actionTiming(action,elapsed){if(!action)return{stage:'idle',phase:0,frame:0,active:false};
 if(elapsed<action.wind)return{stage:'wind',phase:clamp(elapsed/Math.max(1,action.wind),0,1),frame:Math.min(2,Math.floor(elapsed/Math.max(1,action.wind)*3)),active:false};
 if(elapsed<action.wind+action.active){const phase=clamp((elapsed-action.wind)/Math.max(1,action.active),0,1);return{stage:'active',phase,frame:3+Math.min(2,Math.floor(phase*3)),active:true};}
 const phase=clamp((elapsed-action.wind-action.active)/Math.max(1,action.recovery),0,1);return{stage:'recover',phase,frame:6+Math.min(1,Math.floor(phase*2)),active:false};
}
function attackClip(action){
 if(['companionBall','arrow','spit','precision','quickshot'].includes(action.kind))return 'bow';
 const motion=attackMotion(action);if(motion==='overhead')return 'overhead';
 if(action.weapon==='shield'||action.kind==='bash')return 'bash';
 if(motion==='thrust'||motion==='thrustReverse'||action.weapon==='fist')return motion==='thrustReverse'?'thrustReverse':'thrust';
 const heavy=action.tier>0||action.weapon==='greatsword'||['cleave','burst'].includes(action.kind);
 return (heavy?'heavy':'light')+(motion==='reverse'?'Reverse':'');
}
function weaponVisualPose(a,act,elapsed){const t=actionTiming(act,elapsed);if(t.stage==='active')return attackPose(a,act,t.phase);
 const first=attackPose(a,act,t.stage==='wind'?0:1),f=V.norm(act.dir),rest=V.norm(V.add(V.scale(f,.70),{x:0,y:-.65,z:0}));
 // Wind-up lands exactly on the first collision pose; recovery starts at the last one.
 const p=t.stage==='wind'?easeMotion(t.phase):1-easeMotion(t.phase),d=V.norm(V.add(V.scale(rest,1-p),V.scale(first.dir,p))),reach=lerp(Math.min(1.25,act.reach),first.reach,p);
 return {...first,dir:d,reach,tip:V.add(first.origin,V.scale(d,reach))};
}
function rollDirection(facing,move){const f=V.norm({x:facing.x,y:0,z:facing.z}),right={x:-f.z,y:0,z:f.x},dir=V.norm(Math.hypot(move.x,move.z)>.1?{x:move.x,y:0,z:move.z}:f),front=V.dot(dir,f),side=V.dot(dir,right);
 return{dir,facing:f,index:(Math.round(Math.atan2(side,front)/(Math.PI/4))+8)%8,front,side};
}
function rollSpeed(action,elapsed){const p=clamp((elapsed+CFG.stepMs*.5)/action.duration,0,1);return action.speed*(1.30-.20*clamp(p/.60,0,1)-.90*clamp((p-.60)/.40,0,1))/.99;}
function motionState(){return{distance:0,land:0,brake:0,speed:0,air:0,grounded:false,impact:0};}
function actorSpritePose(a,cameraYaw,reaction=null){const c=a.combat,act=c.action,m=a.motion||motionState(),speed=Math.hypot(a.velocity.x,a.velocity.z);let clip='idle',frame=0,f=act&&c.state==='roll'?(act.facing||a.facing):c.state==='attack'?act.dir:a.facing;
 // Frozen launch-facing plus captured roll direction: camera motion cannot turn an ongoing roll.
 const view=(Math.round(Math.atan2(f.x*cosQ(cameraYaw)-f.z*sinQ(cameraYaw),f.x*sinQ(cameraYaw)+f.z*cosQ(cameraYaw))/(Math.PI/4))+8)%8;
 if(c.state==='roll'&&act)return{clip:'roll'+(view>=5?(8-(act.directionIndex||0))%8:(act.directionIndex||0)),frame:Math.min(ANIMATION.rollFrames-1,Math.floor(clamp(c.elapsed/act.duration,0,1)*ANIMATION.rollFrames)),view,dir:view>=5?8-view:view,flip:view>=5,kind:'sprout'};
 if(a.dead||c.state==='dead'){clip='dead';frame=4;}
 else if(c.state==='stagger'){clip='stun';frame=Math.min(3,Math.floor(c.elapsed/CFG.poise.stagger*4));}
 else if(reaction&&reaction.age<230){clip=reaction.guard?'guard':reaction.heavy?'hurtHeavy':'hurt';frame=Math.min(3,Math.floor(reaction.age/230*4));}
 else if(c.state==='attack'&&act){clip=attackClip(act);frame=actionTiming(act,c.elapsed).frame;}
 else if(c.state==='guard'){clip='guard';frame=Math.floor(a.anim/160)%4;}
 else if(c.state==='charge'||c.state==='secondary'){clip='charge';frame=Math.min(3,Math.floor(c.charge/260));}
 else if(a.swim?.inWater){clip='swim';frame=Math.floor(a.anim/120)%8;}
 else if(!a.grounded){clip=a.velocity.y>.15?'rise':'fall';frame=Math.abs(a.velocity.y)>3?1:0;}
 else if(m.land>0){clip='land';frame=Math.min(3,Math.floor((1-m.land/ANIMATION.land)*4));}
 else if(m.brake>0){clip='brake';frame=Math.min(2,Math.floor((1-m.brake/ANIMATION.brake)*3));}
 else if(a.mine?.target&&a.mine.elapsed>0){clip='gather';frame=Math.floor(a.mine.elapsed/100)%4;}
 else if(speed>.16&&a.knock<=0){clip=!a.enemy&&a.sprinting?'run':a.enemy&&speed>5?'run':'walk';frame=Math.floor(m.distance/(clip==='run'?ANIMATION.runStride:ANIMATION.stride)*8)%8;}
 else{frame=Math.floor(a.anim/240)%4;}
 return{clip,frame,view,dir:view>=5?8-view:view,flip:view>=5,kind:a.speciesId?SPECIES[a.speciesId].wild.kind:a.boss?BOSS.kind:'sprout'};
}
// Art-only joint controls in source sprite pixels. Keep the approved sprout's head and palette.
function clipArtPose(clip,frame){const reverse=clip.endsWith('Reverse');if(reverse)clip=clip.slice(0,-7);const n=ANIMATION.clips[clip]||4,p=frame/Math.max(1,n-1),cycle=frame/n*TAU;let lean=0,squash=1,bob=0,stride=0,armL=[13,40],armR=[34,40],knee=0,head=0;
 if(clip==='idle')bob=Math.sin(cycle)*.35;
 if(clip==='walk'||clip==='run'){const run=clip==='run';stride=Math.sin(cycle)*(run?5.4:3.5);bob=Math.abs(Math.sin(cycle))*(run?1.8:.8);lean=run?.11:.025;armL=[13-stride*.7,39+stride*.5];armR=[34+stride*.75,39-stride*.5];knee=run?2.2:.7;}
 if(clip==='brake'){lean=-.15*(1-p);squash=1-.12*(1-p);stride=2*(1-p);armL=[10,38];armR=[36,36];}
 if(clip==='charge'){lean=-.08-p*.06;squash=.97-p*.04;armL=[24,29-p*7];armR=[29,26-p*10];}
 if(['light','heavy','overhead','thrust','bow','bash'].includes(clip)){
  const wind=frame<3,hit=frame>=3&&frame<6,t=wind?frame/2:hit?(frame-3)/2:frame-6,heavy=clip==='heavy',overhead=clip==='overhead';
  if(overhead){
   if(wind){lean=-.21*t;squash=1-.13*t;armL=[lerp(16,25,t),lerp(38,5,t)];armR=[lerp(34,30,t),lerp(38,3,t)];stride=-2.8*t;knee=1.5*t;}
   else if(hit){lean=lerp(-.16,.34,t);squash=1-.26*t;armL=[lerp(25,29,t),lerp(5,46,t)];armR=[lerp(30,35,t),lerp(3,45,t)];stride=4.6;knee=4.1*t;head=1;}
   else{lean=.34*(1-t);squash=1-.26*(1-t);armL=[lerp(29,14,t),lerp(46,39,t)];armR=[lerp(35,34,t),lerp(45,39,t)];stride=4.2*(1-t);knee=2.2*(1-t);}
  }else if(clip==='light'||clip==='heavy'){
   const sign=reverse?-1:1,outer=reverse?8:44,finish=reverse?45:8;
   if(wind){lean=-sign*(heavy?.22:.14)*t;squash=1-(heavy?.15:.07)*t;armR=[lerp(reverse?15:34,outer,t),lerp(37,heavy?17:22,t)];armL=heavy?[lerp(16,outer-sign*7,t),lerp(38,23,t)]:[17+sign*t*4,34];stride=-sign*t*(heavy?3.2:2.5);knee=(heavy?2.1:1.1)*t;}
   else if(hit){lean=sign*(heavy?.30:.21)*(t-.18);squash=heavy?.88:.95;armR=[lerp(outer,finish,t),lerp(heavy?17:22,38,t)];armL=heavy?[armR[0]-sign*7,armR[1]+4]:[17-sign*3,34];stride=sign*(heavy?4.8:4.0);head=1;knee=heavy?2.8:1.5;}
   else{lean=sign*(heavy?.14:.11)*(1-t);squash=1-(heavy?.10:.06)*(1-t);armR=[lerp(finish,34,t),lerp(38,39,t)];armL=[16,38];stride=sign*(heavy?2.4:1.8)*(1-t);}
  }else{
   if(wind){lean=-.10*t;armL=[18,35];armR=[32-12*t,35-5*t];stride=-t*2;}
   else if(hit){lean=.14*(1-t*.25);armL=[18,34];armR=[42,30];stride=3.5;}
   else{lean=.07*(1-t);armL=[16,38];armR=[27+7*t,38+2*t];stride=1.5*(1-t);}
   if(reverse){const old=armL;armL=[48-armR[0],armR[1]];armR=[48-old[0],old[1]];lean=-lean;stride=-stride;}
   if(clip==='bow'){armL=[39,31];armR=wind?[31-10*t,30]:[22,31];lean=wind?-.08:.06;}
  }
 }

 if(clip==='swim'){const wave=Math.sin(cycle);lean=.22;squash=.93;bob=wave*.6;armL=[13+wave*5,21+wave*7];armR=[36-wave*5,23-wave*7];stride=wave*3.2;knee=3.5;}
 if(clip==='guard'){lean=-.08;squash=.95;armL=[24,28];armR=[30,23];stride=2;bob=frame%2*.3;}
 if(clip==='hurt'||clip==='hurtHeavy'||clip==='stun'){const heavy=clip!=='hurt',k=1-p;lean=-(heavy?.29:.17)*k;squash=1-(heavy?.18:.09)*Math.sin((p+.2)*Math.PI);armL=[9,31];armR=[39,31];stride=2*k;head=1;}
 if(clip==='rise'){squash=1.02;lean=.09;armL=[11,27];armR=[36,26];stride=2;knee=5;}
 if(clip==='fall'){lean=-.03;armL=[9,29];armR=[39,29];stride=2;knee=2;}
 if(clip==='land'){const k=1-p;squash=1-.28*k;lean=.10*k;armL=[11,38];armR=[37,38];stride=3*k;knee=3*k;}
 if(clip==='dead'){squash=.88;lean=.55+p*.6;armL=[12,38];armR=[34,40];}
 if(clip==='gather'){const k=Math.sin(cycle);lean=.08*k;armR=[33+5*k,29-12*k];}
 return{lean,squash,bob,stride,armL,armR,knee,head};
}

