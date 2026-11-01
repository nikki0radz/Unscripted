const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const pipeline=source.slice(source.indexOf('  async function processEntry(id) {'),source.indexOf('  function renderSettings()'));
async function run({note='Not Tiffy, Pippy',fail=false,count=1}={}){
 let saved={id:'entry',summaryCorrection:note,summary:'Old summary about Tiffy',parts:Array.from({length:count},(_,i)=>({id:'p'+i,type:'recording',createdAt:'2026-11-01',clips:[{id:'c'+i,transcript:'Tiffy called me. Detail '+i}]}))};
 const original=JSON.stringify(saved.parts),calls=[],state={entries:[structuredClone(saved)],processing:new Set(),pauseTranscription:new Set(),view:'home'};
 const context={state,window:{},localStorage:{getItem:()=>null},sortedParts:e=>e.parts,allParts:e=>e.parts,allClips:e=>e.parts.flatMap(p=>p.clips||[]),showToast(){},renderEntry(){},renderHome(){},refreshEntries:async()=>{},summaryStyle:()=>({}),
 transaction:async(_,__,fn)=>fn({get:()=>structuredClone(saved)}),saveEntry:async e=>{saved=structuredClone(e)},callAI:async(path,body)=>{calls.push({path,body});if(fail)throw Error('offline');return {summary:'Pippy called you.',bulletPoints:['Pippy called.']};}};
 vm.createContext(context);vm.runInContext(pipeline+'\nthis.run=processEntry;',context);await context.run('entry');
 assert.equal(JSON.stringify(saved.parts),original,'Original transcripts and audio metadata must not change');
 assert.equal(calls.length,1);assert.equal(calls[0].path,'/organize','A correction must not retranscribe completed audio');
 assert.equal(calls[0].body.content.length,count);assert.ok(calls[0].body.content.every((p,i)=>p.text.includes('Detail '+i)),'No recording text dropped to make room for a correction');
 if(note)assert.ok(calls[0].body.content.slice(0,100).some(p=>p.text.includes(note)),'Correction must reach the existing backend within its content limit');
 else assert.ok(calls[0].body.content.every(p=>!p.text.includes('OWNER CORRECTION')));
 assert.equal(saved.summary,fail?'Old summary about Tiffy':'Pippy called you.');assert.equal(saved.summaryCorrection,note);
 return saved;
}
(async()=>{await run();await run({count:100});await run({note:''});await run({fail:true});
 const helper=source.slice(source.indexOf('  const correctionDrafts='),source.indexOf('  function renderSummaryCorrection'));
 let saved={id:'entry',summary:'Manual summary',summaryEdited:true},processing=0;
 const context={state:{processing:new Set()},activeAI:()=>true,transaction:async(_,__,f)=>f({get:()=>structuredClone(saved)}),saveEntry:async e=>{saved=structuredClone(e)},refreshEntries:async()=>{},processEntry:async()=>processing++};
 vm.createContext(context);vm.runInContext(helper+'\nthis.apply=applySummaryCorrection;',context);
 await context.apply('entry','Not Tiffy, Pippy');assert.equal(saved.summaryCorrection,'Not Tiffy, Pippy');assert.equal(saved.summary,'Manual summary');assert.equal(saved.summaryEdited,false);assert.equal(processing,1);
 context.state.processing.add('entry');await assert.rejects(context.apply('entry','Changed'),/Wait/);assert.equal(saved.summaryCorrection,'Not Tiffy, Pippy');
 console.log('Passed: entry-scoped persistent corrections, no retranscription, unchanged originals, 100-part preservation, failure retention, manual-summary refresh and busy guard.');
})().catch(e=>{console.error(e);process.exitCode=1});
