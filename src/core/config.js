'use strict';
/* Simulation numbers are integers: 1 m = Q units, time = ticks at CFG.tickRate. */
const VERSION='0.29.0';
const Q=1024;
const CFG=Object.freeze({
 tickRate:30,
 world:Object.freeze({radius:14,seed:20261031}),
 player:Object.freeze({
  radius:300,
  walkPerTick:157,
  roll:Object.freeze({speedPerTick:283,cooldownTicks:12,invulnerable:Object.freeze([2,9]),
   curvePermille:Object.freeze([1290,1271,1251,1231,1212,1192,1173,1153,1133,1114,1060,928,796,663,531,399,266])})
 }),
 /* Attack phases in ticks: windup end, strike end, hold end, recover end. Heavy weapons are 1.3x slower. */
 attack:Object.freeze({
  light:Object.freeze({windup:5,strike:7,hold:15,recover:24,lungePerTick:60}),
  heavy:Object.freeze({windup:7,strike:9,hold:20,recover:31,lungePerTick:50}),
  comboLength:3
 }),
 weapons:Object.freeze({sword:'light',greatsword:'heavy',spear:'light',axe:'heavy'}),
 tiers:Object.freeze(['맨손','철','청수정'])
});
const DEPENDENCIES=Object.freeze({
 three:Object.freeze({url:'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',timeoutMs:20000})
});
