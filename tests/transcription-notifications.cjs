const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const pipeline=source.slice(source.indexOf('  async function processEntry(id) {'),source.indexOf('  function renderSettings()'));
async function run(options={}){
 let saved={id:'entry',parts:[{type:'recording',clips:[{id:'a',transcript:options.done?'already saved':''},{id:'b',transcript:options.done?'already saved':''}]}]};
 const notices=[],calls=[],state={entries:[structuredClone(saved)],processing:new Set(),pauseTranscription:new Set(),view:'home'};
 const clips=e=>e.parts.flatMap(p=>p.clips||[]);
 const context={state,window:{UnscriptedNative:{ackTranscript(){},transcriptionFinished(id,revision){assert(clips(saved).every(c=>c.transcript||c.transcriptionComplete),'notification must follow committed transcripts');notices.push({id,revision});}}},
  localStorage:{getItem:()=>null,setItem(){}},sortedParts:e=>e.parts,allParts:e=>e.parts,allClips:clips,showToast(){},renderEntry(){},renderHome(){},refreshEntries:async()=>{},summaryStyle:()=>'',FormData,Blob,
  transaction:async(_,__,fn)=>fn({get:()=>structuredClone(saved)}),
  saveEntry:async entry=>{if(options.failSave)throw Error('disk full');saved=structuredClone(entry);},
  getAudio:async()=>new Blob(['voice'],{type:'audio/mp4'}),
  callAI:async path=>{calls.push(path);if(path==='/transcribe'){
   const count=calls.filter(p=>p==='/transcribe').length;
   if(options.failSecond&&count===2)throw Error('offline');
   if(options.pause&&count===1)state.pauseTranscription.add('entry');
   if(options.addClip&&count===2)saved.parts[0].clips.push({id:'new',transcript:''});
   return {text:options.silent?'':'transcribed'};
  }if(options.failSummary)throw Error('summary failed');return {summary:'ready'};}
 };
 vm.createContext(context);vm.runInContext(pipeline+'\nthis.run=processEntry;',context);await context.run('entry');
 return {saved,notices,calls};
}
(async()=>{
 const success=await run();assert.equal(success.notices.length,1);assert.equal(success.notices[0].revision,'a,b');
 assert.equal((await run({done:true})).notices.length,0,'summary refresh must not notify');
 assert.equal((await run({failSecond:true})).notices.length,0,'partial failure must not notify');
 assert.equal((await run({pause:true})).notices.length,0,'paused partial transcription must not notify');
 assert.equal((await run({failSave:true})).notices.length,0,'failed persistence must not notify');
 assert.equal((await run({failSummary:true})).notices.length,1,'saved transcript should notify even if summary fails');
 assert.equal((await run({silent:true})).notices.length,1,'no-speech clips still count as completed');
 assert.equal((await run({addClip:true})).notices.length,0,'concurrent pending audio must prevent completion alert');
 console.log('Passed: saved multi-clip completion, no summary-only/partial/failed-save alerts, independent summary failure, no-speech completion and concurrent audio.');
})().catch(e=>{console.error(e);process.exitCode=1;});
