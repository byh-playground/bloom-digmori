// Page-side helpers for the D-114 cursor model, installed with page.addInitScript(CURSOR_HELPERS). They only read
// renderer state (projection, the same pick the game uses) to find where on screen a real mouse or touch should go.
export const CURSOR_HELPERS=`
window.__faceScreen=(b,n)=>{const r=Bloom.app.renderer,axes=n.x?[{x:0,y:1,z:0},{x:0,y:0,z:1}]:n.y?[{x:1,y:0,z:0},{x:0,y:0,z:1}]:[{x:1,y:0,z:0},{x:0,y:1,z:0}];
 for(const [u,v]of [[0,0],[.22,0],[-.22,0],[0,.22],[0,-.22],[.3,.3],[-.3,-.3],[.3,-.3],[-.3,.3],[.4,0],[-.4,0],[0,.4],[0,-.4]]){
  const pt={x:b.x+.5+n.x*.501+axes[0].x*u+axes[1].x*v,y:b.y+.5+n.y*.501+axes[0].y*u+axes[1].y*v,z:b.z+.5+n.z*.501+axes[0].z*u+axes[1].z*v},s=r.projected(pt);
  if(!s||s.x<2||s.y<2||s.x>r.canvas.clientWidth-2||s.y>r.canvas.clientHeight-2)continue;const pick=r.pickAt(s.x,s.y),k=pick?.block;
  if(k&&k.x===b.x&&k.y===b.y&&k.z===b.z&&k.normal.x===n.x&&k.normal.y===n.y&&k.normal.z===n.z)return{x:s.x,y:s.y};}
 return null;};
window.__entityScreen=id=>{const r=Bloom.app.renderer,a=Bloom.app.sim.actors[id];if(!a)return null;for(const h of [.5,.3,.8,1.1]){const s=r.projected({x:a.pos.x,y:a.pos.y+h*(a.scale||1),z:a.pos.z});if(!s)continue;if(r.pickAt(s.x,s.y)?.entity===id)return{x:s.x,y:s.y};}return null;};
window.__selfScreen=()=>{const r=Bloom.app.renderer,a=Bloom.app.actor();return r.projected({x:a.pos.x,y:a.pos.y+.9,z:a.pos.z});};
window.__pointScreen=p=>Bloom.app.renderer.projected(p);
`;
