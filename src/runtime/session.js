'use strict';
class LocalSimulationSession {
 constructor(app){this.app=app;this.profile={tickRate:CFG.tickRate,maxCatchupSteps:CFG.timing.maxCatchUp};this.pending=[];this.commandSequence=0;this.closed=false;this.resimulating=false;this.pace=1;}
 get tick(){return this.app.sim?.tick||0;}get epoch(){return this.app.sim?.epoch||0;}get inputSize(){return CFG.net.inputSize;}
 poll(){}
 queueCommand(payload){const sequence=++this.commandSequence;this.pending.push({sequence,payload:payload.slice?.()??structuredClone(payload)});return sequence;}
 advance(input){const sim=this.app.sim;if(!sim)return{status:'held'};const commands=this.pending.splice(0).map(c=>({payload:c.payload})),tick=sim.tick;sim.step({tick,inputs:[{playerId:this.app.localId,input,commands}]});return{status:'advanced',tick:sim.tick,advancedTick:tick};}
 releaseInput(){}
}
class PresentationBridge {
 constructor(app,Gamekit){this.app=app;this.Queue=Gamekit.presentation.PresentationEventQueue;this.rollbackActive=false;this.create();}
 create(){this.queue=new this.Queue({adapters:{game:{start:event=>{this.app.presentEvent(event.payload);}}},retentionTicks:CFG.presentation.retentionTicks,maxPending:CFG.presentation.maxBuffered,nowMs:performance.now()});this.rollbackActive=false;}
 reset(){this.queue?.dispose();this.create();}
 beginRollback(tick){if(this.rollbackActive)return;this.queue.beginRollback(tick);this.rollbackActive=true;}
 ingest(events,confirmedTick){for(const e of events)this.queue.emit({tick:e.tick,sequence:e.sequence,entityId:e.actorId??'world',generation:0,kind:'game',payload:e,policy:'confirmed',durationMs:0});if(this.rollbackActive){this.queue.endRollback();this.rollbackActive=false;}if(Number.isSafeInteger(confirmedTick)&&confirmedTick>=0)this.queue.confirmThrough(confirmedTick);}
 // The journal's initial nowMs uses performance.now(). A rAF timestamp marks
 // the beginning of a frame and can be older than creation/reset time after
 // a long task. The bridge owns one monotonic presentation clock.
 update(){this.queue.update(performance.now());}
 dispose(){this.queue.dispose();}
}
function createAudioConfig(){return {volume:CFG.combat.feedback.volume,headroom:.72,maxVoices:12,storageKey:'bloom-audio-0201',categories:{combat:{volume:1,max:9,gapMs:8,priority:2},world:{volume:.8,max:4,gapMs:20,priority:1}},sounds:{
 swing:{category:'combat',priority:1,layers:[{kind:'noise',hz:1500,ms:115,gain:.20}]},
 hit:{category:'combat',priority:3,layers:[{kind:'noise',hz:2200,ms:135,gain:.48},{kind:'tone',hz:210,end:80,ms:130,gain:.32,type:'sine'}]},
 heavyHit:{category:'combat',priority:4,layers:[{kind:'noise',hz:1800,ms:190,gain:.62},{kind:'tone',hz:125,end:48,ms:185,gain:.52,type:'triangle'}]},
 wall:{category:'combat',priority:2,layers:[{kind:'noise',hz:1100,ms:130,gain:.28},{kind:'tone',hz:160,end:80,ms:125,gain:.20,type:'sine'}]},
 mine:{category:'world',priority:1,layers:[{kind:'tone',hz:285,end:100,ms:130,gain:.20,type:'triangle'}]},
 place:{category:'world',priority:1,layers:[{kind:'tone',hz:180,end:75,ms:130,gain:.18,type:'sine'}]}
 }};}

