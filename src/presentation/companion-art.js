/* Authored articulated poses baked once to a pixel atlas. No gameplay or animation timers. */
const COMPANION_SPRITE=Object.freeze({cell:128,pixelsPerMeter:32,size:2048});
function createCompanionCombatAtlas(gl){
 const {cell,pixelsPerMeter:S,size}=COMPANION_SPRITE,canvas=document.createElement('canvas');canvas.width=canvas.height=size;const dest=canvas.getContext('2d'),frames={};let index=0;
 const layouts={claw:{attack:12,work:4,return:4},ball:{prepare:8,flight:4,ground:4,return:4,work:4}};
 for(const [mode,clips]of Object.entries(layouts))for(const [clip,count]of Object.entries(clips))for(let view=0;view<5;view++)for(let frame=0;frame<count;frame++){
  const tile=document.createElement('canvas');tile.width=tile.height=cell;const c=tile.getContext('2d'),angle=view*Math.PI/4,ca=Math.cos(angle),sa=Math.sin(angle),shapes=[];
  const project=p=>({x:64+(-p.x*ca+p.z*sa)*S,y:96-(p.y-(p.x*sa+p.z*ca)*.20)*S,depth:p.x*sa+p.z*ca});
  const add=(points,draw)=>shapes.push({depth:points.reduce((n,p)=>n+project(p).depth,0)/points.length,draw});
  const polygon=(points,color)=>add(points,()=>{c.beginPath();points.forEach((p,i)=>{const q=project(p);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y)});c.closePath();c.fillStyle=color;c.fill();c.strokeStyle='#102b2b';c.lineWidth=1.7;c.lineJoin='round';c.stroke();});
  const ellipse=(p,rx,ry,color,outline=true)=>add([p],()=>{const q=project(p);c.beginPath();c.ellipse(q.x,q.y,rx*S,ry*S,0,0,TAU);c.fillStyle=color;c.fill();if(outline){c.strokeStyle='#102b2b';c.lineWidth=1.7;c.stroke();}});
  const limb=(a,b,width,color)=>add([a,b],()=>{const p=project(a),q=project(b);c.lineCap='round';c.strokeStyle='#102b2b';c.lineWidth=width*S+2.5;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();c.strokeStyle=color;c.lineWidth=width*S;c.stroke();});
  if(mode==='claw'){
   const action={wind:300,active:280,recovery:350},stage=clip==='attack'?Math.floor(frame/4):0,p=clip==='attack'?(frame%4)/3:clip==='work'?frame/3:.05;
   const elapsed=clip==='attack'?(stage===0?p*299:stage===1?300+p*279:580+p*349):clip==='work'?300+p*279:929,pose=clawPose(action,elapsed),b=pose.body;
   for(let i=0;i<2;i++){const foot=pose.feet[i],hip={x:foot.x*.65,y:.33-pose.crouch,z:0};limb(hip,{x:foot.x,y:.18,z:foot.z-.1},.11,'#679b9c');limb({x:foot.x,y:.18,z:foot.z-.1},foot,.11,'#a9d4cf');ellipse(foot,.14,.07,'#264b50');}
   ellipse(b,.35,.36,'#c7a067');ellipse({...b,y:b.y+.09,z:b.z-.02},.30,.28,'#f0d895');
   const back=view>=3;ellipse({...b,y:b.y+.25,z:b.z+.04},.27,.20,back?'#628b86':'#a9d6cc');
   if(!back)for(const x of[-.11,.11]){const eye={x,y:b.y+.29,z:b.z+.16};ellipse(eye,.045,.06,'#112b31',false);ellipse({...eye,x:x-.012,y:eye.y+.02},.015,.02,'#fff6ca',false);}
   else for(const x of[-.13,.13])ellipse({x,y:b.y+.29,z:b.z-.10},.045,.035,'#d3dfb1',false);
   for(const arm of pose.arms){limb(arm.shoulder,arm.elbow,.15,'#538d8b');limb(arm.elbow,arm.wrist,.15,'#9ac9b5');ellipse(arm.wrist,.16,.15,'#d7ad68');
    for(let jaw=0;jaw<2;jaw++){const sign=jaw?1:-1,tip=arm.tips[jaw],w=arm.wrist;polygon([{x:w.x+sign*.14,y:w.y-.11,z:w.z-.06},{x:w.x+sign*.20,y:w.y+.10,z:w.z+.16},{x:tip.x+sign*.055,y:tip.y+.06,z:tip.z},{x:tip.x,y:tip.y,z:tip.z+.08},{x:w.x+sign*.025,y:w.y-.015,z:w.z+.23}],jaw?'#f5d792':'#d9b06e');}}
  }else{
   const p=count===1?0:frame/(count-1),tuck=clip==='prepare'?companionEase(p):clip==='flight'||clip==='return'?1:clip==='ground'?1-companionEase(p):.15,
    squash=clip==='ground'?1-.24*Math.sin(p*Math.PI):1,cy=clip==='ground'?-.08:0;
   for(const sign of[-1,1]){const foot={x:sign*(.25-.11*tuck),y:cy-.24+.19*tuck,z:.08};limb({x:sign*.18,y:cy-.08,z:0},foot,.09,'#79a28c');ellipse(foot,.12,.065,'#d6b778');}
   ellipse({x:0,y:cy,z:0},.30/squash,.29*squash,'#80b6b0');
   polygon([{x:-.26,y:cy+.12,z:.02},{x:-.20+.05*tuck,y:cy+.33-.12*tuck,z:0},{x:0,y:cy+.40-.16*tuck,z:0},{x:.24-.05*tuck,y:cy+.25-.08*tuck,z:0},{x:.28,y:cy+.10,z:.02}],'#c4dc91');
   if(view<3){for(const x of[-.12,.12]){if(tuck>.7)limb({x:x-.035,y:cy+.01,z:.28},{x:x+.035,y:cy+.01,z:.28},.025,'#203d3d');else ellipse({x,y:cy+.02,z:.28},.035,.045,'#17383c',false);}limb({x:-.055,y:cy-.11,z:.27},{x:.055,y:cy-.11,z:.27},.025,'#31534b');}
   else polygon([{x:-.2,y:cy-.1,z:-.18},{x:0,y:cy+.17,z:-.28},{x:.2,y:cy-.1,z:-.18}],'#a1c5a8');
  }
  shapes.sort((a,b)=>a.depth-b.depth);for(const shape of shapes)shape.draw();
  const rgba=c.getImageData(0,0,cell,cell);for(let i=3;i<rgba.data.length;i+=4)rgba.data[i]=rgba.data[i]>=120?255:0;c.putImageData(rgba,0,0);
  const x=index%16*cell,y=Math.floor(index/16)*cell;if(y+cell>size)throw Error('동료 아틀라스 용량 초과');dest.drawImage(tile,x,y);frames[mode+'/'+clip+'/'+view+'/'+frame]={u0:x/size,u1:(x+cell)/size,v0:1-y/size,v1:1-(y+cell)/size,x,y,w:cell,h:cell};index++;
 }
 const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);for(const name of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,name,gl.NEAREST);for(const name of[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,name,gl.CLAMP_TO_EDGE);return{tex,frames,canvas,count:index};
}
