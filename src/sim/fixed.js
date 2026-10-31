'use strict';
/* Integer-only helpers for the deterministic simulation. No floats, no Math.sin/cos/sqrt/random. */
// 16 directions, index 0 = +x, counter-clockwise looking down (+z is "south" on screen). Values are cos/sin * Q.
const DIR16=Object.freeze([
 [1024,0],[946,392],[724,724],[392,946],[0,1024],[-392,946],[-724,724],[-946,392],
 [-1024,0],[-946,-392],[-724,-724],[-392,-946],[0,-1024],[392,-946],[724,-724],[946,-392]
]);
// Camera-relative input (mx right, mz toward camera) to a direction index, before camera yaw.
const INPUT_DIR=Object.freeze({'1,0':0,'1,1':2,'0,1':4,'-1,1':6,'-1,0':8,'-1,-1':10,'0,-1':12,'1,-1':14});
function worldDirection(mx,mz,yawStep){const local=INPUT_DIR[mx+','+mz];return local===undefined?-1:(local+yawStep*2)%16}
function scaleQ(value,permille){return Math.trunc(value*permille/1000)}
function stepAlong(dir,amount){const d=DIR16[dir];return[Math.trunc(d[0]*amount/Q),Math.trunc(d[1]*amount/Q)]}
// Mulberry32 on 32-bit integers; state lives in the owner so snapshots can carry it.
function nextRandom(state){let t=(state.seed=(state.seed+0x6D2B79F5)|0);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return(t^(t>>>14))>>>0}
function hashInts(values){let h=2166136261;for(const v of values){h^=v|0;h=Math.imul(h,16777619)}return h>>>0}
