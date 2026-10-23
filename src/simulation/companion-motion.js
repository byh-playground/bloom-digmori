'use strict';
/* Local articulated attack points. The authored atlas and Rapier sweeps share these poses. */
const companionEase=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function clawPose(action,elapsed){
 const wind=elapsed<action.wind,active=!wind&&elapsed<action.wind+action.active;
 const stage=wind?'wind':active?'active':'recover',p=clamp(wind?elapsed/action.wind:active?(elapsed-action.wind)/action.active:(elapsed-action.wind-action.active)/action.recovery,0,1);
 const reach=wind?.05:active?companionEase(p/.48):1-companionEase(p),open=wind?lerp(.14,1,companionEase(p)):active?1-.94*companionEase((p-.08)/.50):lerp(.06,.72,companionEase(p));
 const crouch=wind?companionEase(p)*.16:active?.16*(1-p):.04*(1-p),body={x:0,y:.52-crouch,z:.05+reach*.14},arms=[];
 for(const sign of[-1,1]){const shoulder={x:sign*.27,y:.49-crouch,z:.12},elbow={x:sign*(.55+open*.10-reach*.08),y:.47-crouch,z:.35+reach*.20},wrist={x:sign*(.37+open*.16-reach*.30),y:.70-crouch*.4,z:.60+reach*.65};
  const tips=[-1,1].map(jaw=>({x:wrist.x+jaw*(.04+open*.24),y:wrist.y+.02,z:wrist.z+.48+reach*.12}));arms.push({shoulder,elbow,wrist,tips});}
 return{stage,p,body,arms,crouch,reach,open,feet:[{x:-.25-reach*.1,y:.06,z:-.12+reach*.15},{x:.25+reach*.1,y:.06,z:-.12-reach*.1}]};
}
function companionRoot(actor,dir=actor.facing,lateral=.63){const f=V.norm({x:dir.x,y:0,z:dir.z}),side={x:-f.z,y:0,z:f.x};return V.add(actor.pos,V.add(V.scale(f,.72),V.scale(side,lateral)));}
function clawWorldPose(actor,action,elapsed){const local=clawPose(action,elapsed),root=companionRoot(actor,action.dir,1.1),f=V.norm({x:action.dir.x,y:0,z:action.dir.z}),side={x:-f.z,y:0,z:f.x};
 const point=p=>V.add(root,{x:side.x*p.x+f.x*p.z,y:p.y,z:side.z*p.x+f.z*p.z});
 return{root,origin:point({x:0,y:.65,z:.1}),tips:local.arms.flatMap(a=>a.tips.map(point)),local};
}
function isClawAction(action){return !!action?.companionId&&SPECIES[action.companionKind]?.capabilities.attack.mode==='claw';}

