const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const els=new Map(),events={},rotations=[];const el=id=>{if(!els.has(id))els.set(id,{value:'',hidden:true,disabled:false,textContent:'',classList:{toggle(){}},focus(){},querySelectorAll:()=>[]});return els.get(id)};
let saves=[],clips=[],discarded=[],processed=[],questionCount=0,stopTask,tracksStopped=0,clock=0,failSave=false;
class Clock extends Date{static now(){return clock}}
class Recorder{static isTypeSupported(){return true}constructor(){this.state='inactive';this.mimeType='audio/webm'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['voice'],{type:'audio/webm'})});stopTask=this.onstop();}}
const D={recording:()=>false,toast(){},perspectiveQuestion:async()=>({question:'Question '+(++questionCount)+'?',sourceIds:['past']}),
savePerspective:async(id,doc)=>saves.push({id,...doc}),
savePerspectiveClip:async(id,part,doc,blob,duration)=>{if(failSave){failSave=false;throw Error('Disk full')}clips.push({id,part,blob,duration,parentQuestionId:doc.parentQuestionId});return part||'reflection-'+clips.length},
finishPerspective:async(id,part,answer)=>saves.push({id,part,answer}),discardPerspective:async(id,part)=>discarded.push(part),processEntry:id=>processed.push(id)};
const context={console,Blob,Date:Clock,MediaRecorder:Recorder,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){tracksStopped++}}]})}},
setTimeout:(fn,ms)=>{if(ms===120000)rotations.push(fn);else setImmediate(fn);return 1},setInterval:()=>1,clearInterval(){},clearTimeout(){},cancelAnimationFrame(){},
document:{getElementById:el,activeElement:el('trigger'),addEventListener:(name,fn)=>events[name]=fn},
window:{addEventListener:(name,fn)=>events[name]=fn,UnscriptedDiary:D,UnscriptedConfirm:async()=>true}};
vm.runInNewContext(fs.readFileSync('perspective.js','utf8'),context);
(async()=>{
const P=context.window.UnscriptedPerspective;
await P.open('entry');assert.equal(questionCount,1);await el('perspectiveAnother').onclick();assert.equal(questionCount,2);
el('perspectiveAnswer').value='Typed answer';await el('perspectiveSave').onclick();assert.equal(saves[0].answer,'Typed answer');assert.equal(processed.length,1);
await P.open('entry');await el('perspectiveRecord').onclick();assert(P.recording());assert.equal(el('perspectiveIndicator').hidden,false);
for(let i=0;i<6;i++){clock+=120000;rotations.at(-1)();await stopTask;}
assert(P.recording(),'continues recording after twelve minutes');
assert.equal(clips.length,6,'each two minute clip is saved progressively');
el('perspectivePause').onclick();await stopTask;assert.equal(el('perspectiveRecordState').textContent,'Paused');
el('perspectivePause').onclick();assert.equal(el('perspectiveRecordState').textContent,'Recording');
clock+=42000;await el('perspectiveRecord').onclick();await stopTask;assert(!P.recording());
await el('perspectiveSave').onclick();assert(saves[1].part);assert.equal(processed.length,2);assert.equal(el('perspectiveModal').hidden,true);
await P.open('entry');await el('perspectiveRecord').onclick();clock+=2000;await el('perspectiveRecord').onclick();await stopTask;await el('perspectiveCancel').onclick();assert.equal(discarded.length,1,'cancel explicitly discards autosaved draft');
await P.open('entry');await el('perspectiveRecord').onclick();failSave=true;clock+=2000;await el('perspectiveRecord').onclick();await stopTask;assert.match(el('perspectiveStatus').textContent,/Could not save/);await el('perspectiveSave').onclick();assert.equal(processed.length,3,'failed final clip retried on save');assert.equal(el('perspectiveModal').hidden,true);
assert(tracksStopped>=3);
D.entries=()=>[{id:'entry',parts:[{id:'q1',question:'Original interview question?'}]}];
const count=questionCount;await P.addToQuestion('entry','q1');assert.equal(questionCount,count,'adding a thought does not generate a new question');assert.equal(el('perspectiveAnother').hidden,true);
await el('perspectiveRecord').onclick();clock+=2000;await el('perspectiveRecord').onclick();await stopTask;assert.equal(clips.at(-1).parentQuestionId,'q1');await el('perspectiveSave').onclick();
await P.addToQuestion('entry','q1');el('perspectiveAnswer').value='After our discussion, another thought.';await el('perspectiveSave').onclick();assert.equal(saves.at(-1).parentQuestionId,'q1');assert.match(saves.at(-1).answer,/discussion/);

console.log('Passed: typed save, 12-minute recording with independent saved clips, pause/resume, stop/save processing, cancel cleanup and failed-clip retry.');
})().catch(e=>{console.error(e);process.exit(1)});
