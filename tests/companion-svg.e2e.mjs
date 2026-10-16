import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {inflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

function decodePng(png){
 assert(png.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),'invalid PNG signature');
 let width=0,height=0,bitDepth=0,colorType=0,interlace=0;const chunks=[];
 for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+length);offset+=length+12;if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9];interlace=data[12];}else if(type==='IDAT')chunks.push(data);else if(type==='IEND')break;}
 assert.equal(bitDepth,8,'browser screenshot PNG must use 8-bit samples');assert.equal(interlace,0,'browser screenshot PNG must not be interlaced');
 const channels=colorType===6?4:colorType===2?3:0;assert(channels,'browser screenshot PNG must be RGB or RGBA');
 const stride=width*channels,encoded=inflateSync(Buffer.concat(chunks)),pixels=Buffer.alloc(height*stride);let source=0;
 for(let y=0;y<height;y++){
  const filter=encoded[source++],row=y*stride,prev=row-stride;
  for(let x=0;x<stride;x++){
   const raw=encoded[source++],a=x>=channels?pixels[row+x-channels]:0,b=y?pixels[prev+x]:0,c=y&&x>=channels?pixels[prev+x-channels]:0;
   let value=raw;if(filter===1)value+=a;else if(filter===2)value+=b;else if(filter===3)value+=Math.floor((a+b)/2);else if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);value+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}else assert.equal(filter,0,'unsupported PNG filter');pixels[row+x]=value&255;
  }
 }
 return{width,height,channels,pixels};
}
function roiDelta(a,b,x,y,radiusX,radiusY){
 assert.equal(a.width,b.width);assert.equal(a.height,b.height);let total=0,changed=0;
 for(let py=Math.max(0,y-radiusY);py<Math.min(a.height,y+radiusY);py++)for(let px=Math.max(0,x-radiusX);px<Math.min(a.width,x+radiusX);px++){
  const aa=(py*a.width+px)*a.channels,bb=(py*b.width+px)*b.channels;let delta=0;for(let c=0;c<3;c++)delta+=Math.abs(a.pixels[aa+c]-b.pixels[bb+c]);total+=delta;if(delta>24)changed++;
 }
 return{total,changed};
}

const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist'),out=path.join(root,'artifacts/companion-svg');
fs.mkdirSync(out,{recursive:true});
const config=fs.readFileSync(path.join(root,'src/core/config.js'),'utf8');
const expectedSha=config.match(/pebbleMole:Object\.freeze\(\{url:'[^']+',sourcePath:'[^']+',sha256:'([a-f0-9]{64})'/)?.[1];
assert(expectedSha,'The pinned pebble-mole source digest is missing');
const source=fs.readFileSync(path.join(root,'src/assets/companions/pebble-mole.svg'));
assert.equal(createHash('sha256').update(source).digest('hex'),expectedSha,'the authored SVG must match its pinned digest');
assert.deepEqual(source,fs.readFileSync(path.join(dist,'assets/companions/pebble-mole.svg')),'the deployable SVG must be byte-for-byte identical to the authored source');
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert(!html.includes('DIGMORI_VECTOR_RUNTIME'),'the build must not inline a generated vector runtime');
assert(!html.includes('compile-companion-assets'),'the deployed page must not carry the build-time compiler');

const evidence={browser:null,sourceSha256:expectedSha,sourceBytes:source.byteLength,cacheRequests:0,checks:[],camera:null,animation:null,depthPixels:null,screenshots:[]};
const pass=(name,data)=>{evidence.checks.push({name,data});console.log('PASS '+name);};
let server,browser,assetRequests=0;
try{
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const filename=url.pathname==='/'
   ?path.join(dist,'index.html')
   :path.resolve(dist,'.'+decodeURIComponent(url.pathname));
  if(!filename.startsWith(dist+path.sep)&&filename!==path.join(dist,'index.html')){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);res.end();return;}
  if(url.pathname==='/assets/companions/pebble-mole.svg')assetRequests++;
  const type=filename.endsWith('.svg')?'image/svg+xml':filename.endsWith('.json')?'application/json':'text/html; charset=utf-8';
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(fs.readFileSync(filename));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});evidence.browser=browser.version();
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.waitForFunction(()=>window.Bloom?.app?.started&&document.querySelector('#loading').hidden,null,{timeout:60000});
 await page.waitForFunction(()=>window.Bloom?.companionVector?.geometry?.vertices?.length>0,null,{timeout:10000});
 const loaded=await page.evaluate(async()=>{
  const b=window.Bloom,d=b.DEPENDENCIES.vectorAssets.pebbleMole;
  const cached=await b.vectorAssetLoader.load(new URL(d.url,location.href),{sourcePath:d.sourcePath,expectedSha256:d.sha256,maxBytes:d.maxBytes,curveSegments:d.curveSegments,includeSourcePaths:false});
  return{sameObject:cached===b.companionVector,sha256:b.companionVector.sourceSha256,viewBox:b.companionVector.viewBox,vertices:b.companionVector.geometry.vertices.length,parts:b.companionVector.metadata.parts.length,clips:Object.keys(b.companionVector.metadata.clips)};
 });
 assert.equal(loaded.sameObject,true,'the startup loader should return its cached compiled result');
 assert.equal(loaded.sha256,expectedSha);assert.deepEqual(loaded.viewBox,[0,0,256,256]);assert(loaded.vertices>0&&loaded.parts===8);
 assert.equal(assetRequests,1,'one startup fetch and a same-key load must produce only one source request');evidence.cacheRequests=assetRequests;
 pass('byte-identical SVG is fetched once, SHA-verified, compiled through the shared startup loader, and cache-reused',loaded);

 const fixture=await page.evaluate(()=>{
  const app=Bloom.app,sim=app.sim,p=app.actor(),terrain=sim.terrain;
  const eye={x:p.pos.x,y:p.pos.y+Bloom.CFG.player.eyeHeight,z:p.pos.z};
  const normalize=v=>{const n=Math.hypot(v.x,v.y,v.z)||1;return{x:v.x/n,y:v.y/n,z:v.z/n};};
  let candidate=null,details=null;
  outer:for(let radius=8;radius<=13;radius++)for(let n=0;n<48;n++){
   const angle=2*Math.PI*n/48,x=p.pos.x+Math.cos(angle)*radius,z=p.pos.z+Math.sin(angle)*radius,cx=Math.floor(x),cz=Math.floor(z),h=terrain.height(cx,cz);
   if(h<Bloom.CFG.sea+1||h>19)continue;
   let low=h,high=h;for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const y=terrain.height(cx+dx,cz+dz);low=Math.min(low,y);high=Math.max(high,y);}
   if(high-low>1||!terrain.isSolid(terrain.get(cx,h,cz))||terrain.get(cx,h+1,cz)!==0||terrain.get(cx,h+2,cz)!==0||terrain.get(cx,h+3,cz)!==0)continue;
   if(Object.values(sim.actors).some(a=>!a.dead&&Math.hypot(a.pos.x-(cx+.5),a.pos.z-(cz+.5))<5.5))continue;
   const pos={x:cx+.5,y:h+1.1,z:cz+.5},target={x:pos.x,y:pos.y+1.1,z:pos.z},delta={x:target.x-eye.x,y:target.y-eye.y,z:target.z-eye.z},distance=Math.hypot(delta.x,delta.y,delta.z),dir=normalize(delta);
   if(terrain.ray(eye,dir,Math.max(.1,distance-.15)))continue;
   const bx=Math.floor(eye.x+delta.x*.5),by=Math.floor(eye.y+delta.y*.5),bz=Math.floor(eye.z+delta.z*.5);
   if(terrain.get(bx,by,bz)!==0)continue;
   candidate=sim.addCreature('shell',pos);if(!candidate)continue;
   candidate.velocity={x:0,y:0,z:0};candidate.anim=0;candidate.facing=normalize({x:eye.x-target.x,y:0,z:eye.z-target.z});
   details={id:candidate.id,pos:{...candidate.pos},target,eye,block:{x:bx,y:by,z:bz},distance,dir};break outer;
  }
  if(!candidate)throw Error('Could not find a flat, directly visible fixture site with a clear block cell in the camera ray');
  app.localScheduler.stop();app.scene.reset();app.renderer.camera.first=true;details.cameraYaw=Math.atan2(-details.dir.x,-details.dir.z);details.cameraPitch=-Math.asin(details.dir.y);app.renderer.camera.yaw=details.cameraYaw;app.renderer.camera.pitch=details.cameraPitch;app.renderer.camera.distance=0;
  return details;
 });
 await page.waitForFunction(id=>Bloom.app.renderer.companionRenderer.samples.some(s=>s.mode==='svg'&&s.key===id),fixture.id,{timeout:15000});
 const front=await page.evaluate(id=>{
  const app=Bloom.app,r=app.renderer,c=app.sim.actors[id],sample=r.companionRenderer.samples.find(s=>s.mode==='svg'&&s.key===id);
  const state=r.companionRenderer.players.get(id),parts=state.player.partPoses(),metadata=r.companionRenderer.asset.metadata;
  return{sample,frontVisible:parts[metadata.parts.findIndex(p=>p.id==='face-front')].visible,backVisible:parts[metadata.parts.findIndex(p=>p.id==='face-back')].visible,viewProjectionLength:r.vp.length,worldReady:r.worldVisualReady(c.pos,.3)};
 },fixture.id);
 assert.equal(front.sample.expression,'front');assert.equal(front.frontVisible,true);assert.equal(front.backVisible,false);assert.equal(front.viewProjectionLength,16);assert(front.worldReady);
 assert.equal(front.sample.depthTest,true);assert.equal(front.sample.depthWrite,false);assert.equal(front.sample.worldMatrix.length,16);
 pass('the original SVG renders as a retained mesh in the live 3D camera/depth pass with its front expression',front);

 await page.evaluate(()=>{Bloom.app.renderer.camera.yaw+=Math.PI;});
 await page.waitForFunction(id=>Bloom.app.renderer.companionRenderer.samples.some(s=>s.mode==='svg'&&s.key===id&&s.expression==='back'),fixture.id,{timeout:5000});
 const back=await page.evaluate(id=>{const r=Bloom.app.renderer,state=r.companionRenderer.players.get(id),parts=state.player.partPoses(),metadata=r.companionRenderer.asset.metadata;return{expression:r.companionRenderer.samples.find(s=>s.mode==='svg'&&s.key===id).expression,frontVisible:parts[metadata.parts.findIndex(p=>p.id==='face-front')].visible,backVisible:parts[metadata.parts.findIndex(p=>p.id==='face-back')].visible};},fixture.id);
 assert.equal(back.expression,'back');assert.equal(back.frontVisible,false);assert.equal(back.backVisible,true);evidence.camera={front,back};
 await page.evaluate(({yaw,pitch})=>{Bloom.app.renderer.camera.yaw=yaw;Bloom.app.renderer.camera.pitch=pitch;},{yaw:fixture.cameraYaw,pitch:fixture.cameraPitch});
 await page.waitForFunction(id=>Bloom.app.renderer.companionRenderer.samples.some(s=>s.mode==='svg'&&s.key===id&&s.expression==='front'),fixture.id,{timeout:5000});
 pass('camera reversal switches the SVG expression and authored face visibility, then returns to the front view',evidence.camera);

 const animation=await page.evaluate(id=>{
  const r=Bloom.app.renderer,asset=r.companionRenderer.asset,state=r.companionRenderer.players.get(id),player=state.player,body=asset.metadata.parts.findIndex(p=>p.id==='body');
  player.play('walk',0);const start=player.partPoses()[body].transform.slice();player.seek(250);const mid=player.partPoses()[body].transform.slice();
  const changed=Math.hypot(start[4]-mid[4],start[5]-mid[5],start[0]-mid[0],start[3]-mid[3]);
  const sample=r.companionRenderer.samples.find(s=>s.mode==='svg'&&s.key===id);player.play(sample.clip,0);player.seek(sample.timeMs);
  return{clip:'walk',start,mid,changed,sourceTimeMs:sample.timeMs};
 },fixture.id);
 assert(animation.changed>1,'seeking the source-authored animation must move the SVG body mesh');evidence.animation=animation;
 pass('source-authored SVG animation changes retained part transforms at absolute display times',animation);

 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const worldShot=path.join(out,'pebble-mole-live-webgl.png'),worldPng=await page.locator('#world').screenshot({path:worldShot});evidence.screenshots.push(path.relative(root,worldShot));

 const ray=await page.evaluate(({id,block})=>{
  const app=Bloom.app,terrain=app.sim.terrain,actor=app.actor(),c=app.sim.actors[id],target={x:c.pos.x,y:c.pos.y+1.1,z:c.pos.z},eye={x:actor.pos.x,y:actor.pos.y+Bloom.CFG.player.eyeHeight,z:actor.pos.z},d={x:target.x-eye.x,y:target.y-eye.y,z:target.z-eye.z},length=Math.hypot(d.x,d.y,d.z),dir={x:d.x/length,y:d.y/length,z:d.z/length};
  const placed=terrain.set(block.x,block.y,block.z,Bloom.BID.diamondOre);if(placed===false)throw Error('Depth fixture voxel could not be placed');
  return{block,ray:terrain.ray(eye,dir,length+1),target,eye};
 },{id:fixture.id,block:fixture.block});
 assert.deepEqual({x:ray.ray?.x,y:ray.ray?.y,z:ray.ray?.z},fixture.block,'the block must be directly on the live camera ray in front of the SVG');
 await page.waitForFunction(({x,y,z})=>Bloom.app.renderer.readyChunks.has(Math.floor(x/16)+':'+Math.floor(y/16)+':'+Math.floor(z/16)),fixture.block,{timeout:5000});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const occlusionShot=path.join(out,'pebble-mole-world-depth-occlusion.png'),occludedPng=await page.locator('#world').screenshot({path:occlusionShot});evidence.screenshots.push(path.relative(root,occlusionShot));
 const depthOff=await page.evaluate(()=>{
  const meshes=Bloom.app.renderer.companionRenderer.meshes,original=meshes.drawMesh.bind(meshes);
  meshes.drawMesh=(mesh,options)=>original(mesh,{...options,depthTest:false});
  return true;
 });assert(depthOff);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const noDepthShot=path.join(out,'pebble-mole-depth-disabled.png'),noDepthPng=await page.locator('#world').screenshot({path:noDepthShot});evidence.screenshots.push(path.relative(root,noDepthShot));
 const beforeImage=decodePng(worldPng),occludedImage=decodePng(occludedPng),depthDisabledImage=decodePng(noDepthPng),center={x:beforeImage.width>>1,y:beforeImage.height>>1};
 const hidden=roiDelta(beforeImage,occludedImage,center.x,center.y+28,42,42),revealed=roiDelta(occludedImage,depthDisabledImage,center.x,center.y+28,42,42);
 assert(hidden.changed>40&&hidden.total>3000,'the foreground voxel should hide part of the SVG in the actual browser screenshot: '+JSON.stringify({hidden,center,canvas:[beforeImage.width,beforeImage.height]}));
 assert(revealed.changed>40&&revealed.total>3000,'disabling depth in the same live draw should reveal the SVG over the voxel in the actual browser screenshot: '+JSON.stringify({revealed,center,canvas:[beforeImage.width,beforeImage.height]}));
 evidence.depthPixels={center,roi:{width:84,height:84,yOffset:28},depthTestEnabledScreenshotDelta:hidden,depthTestDisabledScreenshotDelta:revealed,block:ray.block,ray:ray.ray};
 pass('the actual WebGL world depth buffer occludes the SVG mesh; the same mesh is visible over the block when depth testing is disabled',evidence.depthPixels);
 assert.deepEqual(errors,[],'page errors: '+errors.join('; '));
 evidence.result='PASS';evidence.elapsedMs=Date.now();
 fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({result:evidence.result,browser:evidence.browser,sourceSha256:expectedSha,checks:evidence.checks.length,screenshots:evidence.screenshots}));
}catch(error){evidence.result='FAIL';evidence.error=error.stack||String(error);fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(evidence,null,2)+'\n');console.error(error);process.exitCode=1;}
finally{await browser?.close();await new Promise(resolve=>server?.close(resolve));}
