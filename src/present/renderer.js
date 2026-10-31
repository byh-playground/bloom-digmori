'use strict';
/* three.js view of the simulation. Reads sim state, never writes it. Camera yaw comes in 45-degree steps so input
   directions stay integer (see worldDirection in sim/fixed.js). */
const RENDER=Object.freeze({canvas:512,ground:420,rigScale:1,spriteMeters:3.84,cameraDistance:8,cameraPitch:.82,
 sky:0xbfe3f5,blockColor:Object.freeze({0:0x76b858,1:0xf4d84a,2:0x8a6a45,3:0x5aa545,4:0x57d8e8,5:0x3f9a45})});
class Renderer{
 constructor(THREE,host,world,rig){
  this.THREE=THREE;this.rig=rig;this.yawStep=0;this.yaw=0;this.lastFlip=false;
  this.gl=new THREE.WebGLRenderer({antialias:true});this.gl.setPixelRatio(Math.min(2,devicePixelRatio||1));this.gl.setClearColor(RENDER.sky,1);host.appendChild(this.gl.domElement);
  this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog(RENDER.sky,18,40);
  this.camera=new THREE.PerspectiveCamera(42,1,.1,120);
  this.scene.add(new THREE.AmbientLight(0xffffff,.95));const sun=new THREE.DirectionalLight(0xffffff,.8);sun.position.set(6,12,4);this.scene.add(sun);
  this.addWorld(world);this.addPlayer();this.resize();addEventListener('resize',()=>this.resize());
 }
 addWorld(world){
  const T=this.THREE,blocks=world.blocks,mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshLambertMaterial({color:0xffffff}),blocks.length),m=new T.Matrix4(),c=new T.Color();
  blocks.forEach((b,i)=>{m.setPosition(b.x+.5,b.y+.5,b.z+.5);mesh.setMatrixAt(i,m);c.setHex(RENDER.blockColor[b.kind]).multiplyScalar(.86+((b.x*7+b.z*13+b.y*5)&7)/50);mesh.setColorAt(i,c)});
  mesh.instanceColor.needsUpdate=true;this.scene.add(mesh);this.worldMesh=mesh;
 }
 addPlayer(){
  const T=this.THREE;this.rigCanvas=document.createElement('canvas');this.rigCanvas.width=this.rigCanvas.height=RENDER.canvas;this.rigCtx=this.rigCanvas.getContext('2d');
  this.rigTexture=new T.CanvasTexture(this.rigCanvas);this.rigTexture.colorSpace=T.SRGBColorSpace;
  this.sprite=new T.Sprite(new T.SpriteMaterial({map:this.rigTexture,transparent:true,alphaTest:.02}));
  const m=RENDER.spriteMeters;this.sprite.scale.set(m,m,1);this.sprite.center.set(.5,1-RENDER.ground/RENDER.canvas);this.scene.add(this.sprite);
 }
 resize(){const w=this.gl.domElement.parentElement.clientWidth||innerWidth,h=this.gl.domElement.parentElement.clientHeight||innerHeight;this.gl.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix()}
 // Turns stay unbounded so the camera eases the short way round; the simulation only sees the 0..7 step.
 rotate(step){this.yawTurns=(this.yawTurns||0)+step;this.yawStep=((this.yawTurns%8)+8)%8}
 // Which drawing to use: the side drawing faces screen-left, so facing screen-right flips it.
 look(player,seconds){
  const psi=player.facing*Math.PI/8,k=this.yawStep*Math.PI/4,sx=Math.cos(psi)*Math.cos(k)+Math.sin(psi)*Math.sin(k),toward=Math.cos(psi)*Math.cos(k+Math.PI/2)+Math.sin(psi)*Math.sin(k+Math.PI/2);
  let view=Math.abs(sx)>=.5?'side':toward>0?'front':'back';const st=player.state,heavy=CFG.weapons[player.weapon]==='heavy';
  if(st===PLAYER_STATE.attack)view='side';
  if(view==='side'&&Math.abs(sx)>=.2)this.lastFlip=sx>0;
  const anim=st===PLAYER_STATE.roll?'roll':st===PLAYER_STATE.attack?'attack':st===PLAYER_STATE.move?'walk':'idle';
  return{anim,view,flip:view==='side'&&this.lastFlip,progress:Math.min(1,(player.ticks+seconds.alpha)/CFG.player.roll.curvePermille.length),
   seconds:(player.ticks+seconds.alpha)/CFG.tickRate,combo:player.combo,heavy,weapon:player.weapon,tier:player.tier};
 }
 render(sim,previous,alpha,seconds){
  const p=sim.player,x=(previous.x+(p.x-previous.x)*alpha)/Q,z=(previous.z+(p.z-previous.z)*alpha)/Q;
  this.yaw+=(((this.yawTurns||0)*Math.PI/4)-this.yaw)*.18;
  const d=RENDER.cameraDistance,pitch=RENDER.cameraPitch,phi=this.yaw+Math.PI/2;
  this.camera.position.set(x+Math.cos(phi)*Math.cos(pitch)*d,Math.sin(pitch)*d,z+Math.sin(phi)*Math.cos(pitch)*d);this.camera.lookAt(x,.8,z);
  this.sprite.position.set(x,0,z);
  const ctx=this.rigCtx;ctx.clearRect(0,0,RENDER.canvas,RENDER.canvas);
  this.rig.draw(ctx,this.look(p,{alpha}),seconds,{x:RENDER.canvas/2,y:RENDER.ground,scale:RENDER.rigScale});
  this.rigTexture.needsUpdate=true;this.gl.render(this.scene,this.camera);
 }
}
