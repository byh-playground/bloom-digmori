'use strict';
/* Owns the world and the player; the only place that advances game state. */
class Simulation{
 constructor(seed=CFG.world.seed){this.seed=seed;this.world=new World(seed,CFG.world.radius);this.player=new Player();this.tick=0}
 step(cmd){this.player.step(cmd,this.world);this.tick++}
 checksum(){return hashInts([this.tick,this.seed,...this.player.checksumValues()])}
}
const NO_COMMAND=Object.freeze({move:-1,roll:0,attack:0});
