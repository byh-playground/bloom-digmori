// Page-side helpers for the cursor aim (D-114, D-165), installed with page.addInitScript(CURSOR_HELPERS). They only read
// renderer state (projection, the same pick the game uses) to find where on screen a real mouse or touch should go.
export const CURSOR_HELPERS=`
// D-165 pointer lock: tests aim with the visible cursor (headless input has no relative mouse motion), so a click does not
// lock by default; window.__allowLock=true makes requestPointerLock lock for real (pointerLockElement + pointerlockchange).
(()=>{let locked=null;Object.defineProperty(Document.prototype,'pointerLockElement',{configurable:true,get(){return locked;}});
 HTMLCanvasElement.prototype.requestPointerLock=function(){if(!window.__allowLock)return;locked=this;document.dispatchEvent(new Event('pointerlockchange'));};
 Document.prototype.exitPointerLock=function(){if(!locked)return;locked=null;document.dispatchEvent(new Event('pointerlockchange'));};})();
window.__faceScreen=(b,n)=>{const r=Bloom.app.renderer,axes=n.x?[{x:0,y:1,z:0},{x:0,y:0,z:1}]:n.y?[{x:1,y:0,z:0},{x:0,y:0,z:1}]:[{x:1,y:0,z:0},{x:0,y:1,z:0}];
 for(const [u,v]of [[0,0],[.22,0],[-.22,0],[0,.22],[0,-.22],[.3,.3],[-.3,-.3],[.3,-.3],[-.3,.3],[.4,0],[-.4,0],[0,.4],[0,-.4]]){
  const pt={x:b.x+.5+n.x*.501+axes[0].x*u+axes[1].x*v,y:b.y+.5+n.y*.501+axes[0].y*u+axes[1].y*v,z:b.z+.5+n.z*.501+axes[0].z*u+axes[1].z*v},s=r.projected(pt);
  if(!s||s.x<2||s.y<2||s.x>r.canvas.clientWidth-2||s.y>r.canvas.clientHeight-2)continue;const pick=r.pickAt(s.x,s.y),k=pick?.block;
  if(k&&k.x===b.x&&k.y===b.y&&k.z===b.z&&k.normal.x===n.x&&k.normal.y===n.y&&k.normal.z===n.z)return{x:s.x,y:s.y};}
 return null;};
window.__entityScreen=id=>{const r=Bloom.app.renderer,a=Bloom.app.sim.actors[id];if(!a)return null;for(const h of [.5,.3,.8,1.1]){const s=r.projected({x:a.pos.x,y:a.pos.y+h*(a.scale||1),z:a.pos.z});if(!s)continue;if(r.pickAt(s.x,s.y)?.entity===id)return{x:s.x,y:s.y};}return null;};
// The screen point whose mine highlight (cursor pick -> head ray, Renderer.minePreview) lands on block b: what a player
// does when the camera itself cannot see the face (a narrow shaft seen from the cave below).
window.__mineScreen=b=>{const r=Bloom.app.renderer,sim=Bloom.app.sim,a=Bloom.app.actor(),W=r.canvas.clientWidth,H=r.canvas.clientHeight;
 for(let step=24;step>=6;step/=2)for(let y=step;y<H-2;y+=step)for(let x=step;x<W-2;x+=step){const k=r.minePreview(sim,a,r.pickAt(x,y))?.block;if(k&&k.x===b.x&&k.y===b.y&&k.z===b.z)return{x,y};}
 return null;};
// The local player on screen: its centre, or (camera pulled in close, the centre off screen) any point the pick calls self.
window.__selfScreen=()=>{const r=Bloom.app.renderer,a=Bloom.app.actor(),W=r.canvas.clientWidth,H=r.canvas.clientHeight,s=r.projected({x:a.pos.x,y:a.pos.y+.9,z:a.pos.z});
 if(s&&s.x>2&&s.y>2&&s.x<W-2&&s.y<H-2&&r.pickAt(s.x,s.y)?.self)return s;
 let best=null,bd=1e9;for(let y=12;y<H-2;y+=24)for(let x=12;x<W-2;x+=24)if(r.pickAt(x,y)?.self){const d=Math.hypot(x-W/2,y-H/2);if(d<bd){bd=d;best={x,y};}}return best||s;};
window.__pointScreen=p=>Bloom.app.renderer.projected(p);
// Turn the shoulder camera through the real locked-mouse path: lock, relative mousemove events, unlock (the cursor aim
// is back afterwards). __look takes radians (yaw left +, pitch down +); __turnToward faces a world point.
window.__look=(dyaw,dpitch=0)=>{const canvas=Bloom.app.renderer.canvas,k=Bloom.CFG.camera.mouseSensitivity,was=window.__allowLock;window.__allowLock=true;canvas.requestPointerLock();
 document.dispatchEvent(new MouseEvent('mousemove',{movementX:Math.round(-dyaw/k),movementY:Math.round(dpitch/k)}));document.exitPointerLock();window.__allowLock=was;return Bloom.app.renderer.camera;};
window.__turnToward=(p,pitch)=>{const a=Bloom.app.actor(),c=Bloom.app.renderer.camera;if(pitch===undefined)pitch=Math.atan2(a.pos.y+Bloom.CFG.camera.target-p.y,Math.hypot(p.x-a.pos.x,p.z-a.pos.z)+Bloom.CFG.camera.initialDistance.desktop*.5);const want=Math.atan2(-(p.x-a.pos.x),-(p.z-a.pos.z)),d=((want-c.yaw)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI;return window.__look(d,pitch-c.pitch);};
`;
