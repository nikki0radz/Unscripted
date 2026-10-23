const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:"",disabled:false,classList:{toggle(){}}});return elements.get(id);};
const entries=new Map(),audios=new Map();
const db={transaction(names,mode){const staged=[],requests=[];let aborted=false;const tx={abort(){aborted=true;},error:null,objectStore(name){const data=name==="entries"?entries:audios;return{get(id){const req={result:structuredClone(data.get(id))};requests.push(req);return req},put(row){staged.push(()=>data.set(row.id,structuredClone(row)));return{}},delete(id){staged.push(()=>data.delete(id));return{}},getAll(){return{result:structuredClone([...data.values()])}}}}};setImmediate(()=>{for(const req of requests)req.onsuccess?.();if(aborted){tx.onabort?.();return;}for(const fn of staged)fn();tx.oncomplete?.();});return tx;}};
let stopTask=null;
class Recorder{static isTypeSupported(){return true}constructor(){this.state="inactive";this.mimeType="audio/webm"}start(){this.state="recording"}stop(){this.state="inactive";this.ondataavailable?.({data:new Blob(["new audio"],{type:"audio/webm"})});stopTask=this.onstop?.();}}
const context={console,crypto:globalThis.crypto,Blob,Date,Map,Set,structuredClone,Promise,Event,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},MediaRecorder:Recorder,
document:{getElementById:element},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},
localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},
window:{MediaRecorder:Recorder,indexedDB:{},dispatchEvent(){}}};
let source=fs.readFileSync("app.js","utf8");
source=source.replace("  init();", '  state.db = globalThis.fixtureDb; showToast=message=>{globalThis.lastToast=message};openEntry=id=>{state.selected=id};switchView=view=>{state.view=view};activeAI=()=>false;globalThis.testRecording={state,startRecording,startClip,flushClip,cancelRecording,updateRecorderUI,saveInterview,savePerspective,searchMatches,chooseAskSources,allClips,processEntry};renderEntry=()=>{};renderHome=()=>{};callAI=(...args)=>globalThis.fakeAI(...args);');
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
 console.log("Passed: interrupted transcription retains progress, resume skips completed clips, empty transcript completes, summary succeeds.");
})().catch(e=>{console.error(e);process.exit(1)});
