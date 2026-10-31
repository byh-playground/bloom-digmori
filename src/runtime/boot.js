'use strict';
/* Loads three.js (pinned ESM) and the player parts, then starts the app. Failures stay visible on screen. */
function withTimeout(promise,ms,label){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' 시간 초과('+ms+'ms)')),ms))])}
function showError(error){const box=document.getElementById('error-dialog');document.getElementById('error-text').value=(error&&error.stack)||String(error);box.hidden=false;document.getElementById('loading').hidden=true}
addEventListener('error',e=>showError(e.error||e.message));addEventListener('unhandledrejection',e=>showError(e.reason));
(async()=>{
 const status=document.getElementById('load-status');
 status.textContent='three.js 로딩 중';const THREE=await withTimeout(import(DEPENDENCIES.three.url),DEPENDENCIES.three.timeoutMs,'three.js 로딩');
 status.textContent='캐릭터 부품 로딩 중';const rig=await PlayerRig.load('src/assets/player/');
 const app=new App(THREE,rig);window.Bloom={app,VERSION,CFG};app.start();
 document.getElementById('loading').hidden=true;
})().catch(showError);
