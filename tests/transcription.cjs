const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:"",disabled:false,style:{},children:[],append(...nodes){this.children.push(...nodes)},replaceChildren(){this.children=[]},setAttribute(key,value){this[key]=value},classList:{toggle(){}}});return elements.get(id);};
const entries=new Map(),audios=new Map();
const db={transaction(names,mode){const staged=[],requests=[];let aborted=false;const tx={abort(){aborted=true;},error:null,objectStore(name){const data=name==="entries"?entries:audios;return{get(id){const req={result:structuredClone(data.get(id))};requests.push(req);return req},put(row){staged.push(()=>data.set(row.id,structuredClone(row)));return{}},delete(id){staged.push(()=>data.delete(id));return{}},getAll(){return{result:structuredClone([...data.values()])}}}}};setImmediate(()=>{for(const req of requests)req.onsuccess?.();if(aborted){tx.onabort?.();return;}for(const fn of staged)fn();tx.oncomplete?.();});return tx;}};
let stopTask=null;
class Recorder{static isTypeSupported(){return true}constructor(){this.state="inactive";this.mimeType="audio/webm"}start(){this.state="recording"}stop(){this.state="inactive";this.ondataavailable?.({data:new Blob(["new audio"],{type:"audio/webm"})});stopTask=this.onstop?.();}}
const context={console,crypto:globalThis.crypto,Blob,Date,Map,Set,structuredClone,Promise,Event,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},MediaRecorder:Recorder,
document:{getElementById:element,createElement:tag=>({tag,style:{},children:[],append(...nodes){this.children.push(...nodes)},setAttribute(key,value){this[key]=value}})},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},
localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},
window:{MediaRecorder:Recorder,indexedDB:{},dispatchEvent(){}}};
let source=fs.readFileSync("app.js","utf8");
source=source.replace("  init();", '  state.db = globalThis.fixtureDb; showToast=message=>{globalThis.lastToast=message};openEntry=id=>{state.selected=id};switchView=view=>{state.view=view};activeAI=()=>false;globalThis.testRecording={state,startRecording,startClip,flushClip,cancelRecording,updateRecorderUI,saveInterview,savePerspective,searchMatches,chooseAskSources,allClips,processEntry,renderTranscriptionProgress,savePerspectiveClip,finishPerspective,discardPerspective};renderEntry=()=>{};renderHome=()=>{};callAI=(...args)=>globalThis.fakeAI(...args);');
context.fixtureDb=db;
vm.runInNewContext(source,context);
const T=context.testRecording;

(async()=>{
 const entry={id:"entry",title:"Diary",createdAt:new Date().toISOString(),parts:[{id:"part",type:"recording",clips:[{id:"done",transcript:"Already saved"},{id:"empty",transcript:"",transcriptionComplete:true},{id:"next",transcript:""},{id:"last",transcript:""}]}]};
 entries.set(entry.id,entry);for(const id of ["next","last"])audios.set(id,{id,blob:new Blob(["audio"])});
 T.state.entries=structuredClone([...entries.values()]);let calls=0;
 context.FormData=class{append(){}};
 context.fakeAI=async path=>{assert.equal(path,"/transcribe");if(++calls===2)throw Error("Offline");return{text:"New transcript"}};
 await T.processEntry("entry");
 assert.equal(calls,2);assert.equal(entries.get("entry").parts[0].clips[2].transcript,"New transcript");
 assert.match(entries.get("entry").aiError,/Offline/);assert(!T.state.processing.has("entry"));
 calls=0;
 context.fakeAI=async path=>{if(path==="/transcribe"){calls++;return{text:""}}return{title:"Finished",summary:"Summary",tags:[]}};
 await T.processEntry("entry");
 assert.equal(calls,1,"retry skips both saved speech and completed silent clips");
 assert.equal(entries.get("entry").parts[0].clips[3].transcriptionComplete,true);
 assert.equal(entries.get("entry").summary,"Summary");assert.equal(entries.get("entry").aiError,"");
 await T.processEntry("entry");assert.equal(calls,1,"silent clip remains completed on later runs");

 const pauseEntry={id:"pause-entry",title:"Pause test",createdAt:new Date().toISOString(),parts:[{type:"recording",clips:[{id:"next"},{id:"last"}]}]};
 entries.set(pauseEntry.id,pauseEntry);T.state.entries=structuredClone([...entries.values()]);
 let requests=0;
 context.fakeAI=async path=>{assert.equal(path,"/transcribe");requests++;T.state.pauseTranscription.add(pauseEntry.id);return{text:"Saved before pause"}};
 await T.processEntry(pauseEntry.id);
 assert.equal(requests,1,"pause finishes the current clip and prevents the next request and summary");
 assert.equal(entries.get(pauseEntry.id).parts[0].clips[0].transcript,"Saved before pause");
 assert(!entries.get(pauseEntry.id).parts[0].clips[1].transcriptionComplete);
 assert(!T.state.processing.has(pauseEntry.id));
 T.renderTranscriptionProgress(entries.get(pauseEntry.id));
 const panel=element("transcriptionProgress");
 assert.equal(panel.hidden,false);
 assert.match(panel.children[0].children[0].textContent,/1 \/ 2 clips/);
 assert.equal(panel.children[1]["aria-label"],"Resume transcription");
 T.state.processing.add(pauseEntry.id);T.renderTranscriptionProgress(entries.get(pauseEntry.id));
 panel.children[1].onclick();assert(T.state.pauseTranscription.has(pauseEntry.id));
 T.state.processing.delete(pauseEntry.id);
 context.fakeAI=async path=>path==="/transcribe"?{text:"Resumed"}:{summary:"All done",tags:[]};
 await T.processEntry(pauseEntry.id);
 T.renderTranscriptionProgress(entries.get(pauseEntry.id));
 assert.equal(panel.hidden,true,"completed transcription controls disappear");

 const reflectionId=await T.savePerspectiveClip("entry",null,{question:"What else?",sourceIds:[]},new Blob(["voice"]),120000);
 let reflected=entries.get("entry").parts.find(p=>p.id===reflectionId);
 assert(reflected.reflectionDraft);assert(audios.has(reflected.clips[0].id));
 await T.finishPerspective("entry",reflectionId,"Extra note");
 context.fakeAI=async path=>path==="/transcribe"?{text:"My long reflection"}:{summary:"A warm summary",bulletPoints:["A specific concern","A concrete example"],tags:[]};
 await T.processEntry("entry");
 reflected=entries.get("entry").parts.find(p=>p.id===reflectionId);
 assert.match(reflected.answer,/Extra note/);assert.match(reflected.answer,/My long reflection/);
 assert.equal(reflected.summary,"A warm summary");assert.equal(reflected.bulletPoints.length,2);
 const clipId=reflected.clips[0].id;
 await T.discardPerspective("entry",reflectionId);
 assert(!audios.has(clipId));assert(!entries.get("entry").parts.some(p=>p.id===reflectionId));
 const audioCount=audios.size;
 await assert.rejects(T.savePerspectiveClip("missing",null,{question:"Q"},new Blob(["orphan"]),100));
 assert.equal(audios.size,audioCount,"missing entries cannot create orphan reflection audio");
 console.log("Passed: saved progress, retries, silence, pause after current clip, resume and compact controls hidden on completion.");
})().catch(e=>{console.error(e);process.exit(1)});
