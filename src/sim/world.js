'use strict';
/* Grass-biome arena as an integer grid. Cell (cx,cz) covers [cx*Q,(cx+1)*Q). Columns taller than 0 block movement. */
const BLOCK=Object.freeze({floor:0,flower:1,wall:2,grassTop:3,ore:4,leaf:5});
class World{
 constructor(seed,radius){
  this.radius=radius;this.random={seed};this.columns=new Map();this.blocks=[];
  const r2=radius*radius;
  for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++){
   const d2=x*x+z*z;if(d2>r2+radius)continue;
   this.blocks.push({x,y:-1,z,kind:nextRandom(this.random)%20===0?BLOCK.flower:BLOCK.floor});
   const edge=r2-d2<radius*5;
   if(edge){const height=1+nextRandom(this.random)%3+(r2-d2<radius*2?1:0);this.setColumn(x,z,height);
    for(let y=0;y<height;y++)this.blocks.push({x,y,z,kind:y===height-1?BLOCK.grassTop:(nextRandom(this.random)%10===0?BLOCK.ore:BLOCK.wall)})}
   else if(d2>36&&nextRandom(this.random)%18===0&&!this.columns.has(x+','+z)){this.setColumn(x,z,2);this.blocks.push({x,y:0,z,kind:BLOCK.leaf},{x,y:1,z,kind:BLOCK.flower})}
  }
 }
 setColumn(cx,cz,height){this.columns.set(cx+','+cz,height)}
 solid(cx,cz){return(this.columns.get(cx+','+cz)||0)>0}
 // True when a circle of `radius` at (x,z) overlaps a blocking cell.
 blocked(x,z,radius){
  const x0=Math.floor((x-radius)/Q),x1=Math.floor((x+radius)/Q),z0=Math.floor((z-radius)/Q),z1=Math.floor((z+radius)/Q);
  for(let cx=x0;cx<=x1;cx++)for(let cz=z0;cz<=z1;cz++)if(this.solid(cx,cz))return true;
  return false;
 }
}
