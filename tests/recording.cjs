const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:"",disabled:false,classList:{toggle(){}}});return elements.get(id);};
const entries=new Map(),audios=new Map();
const db={transaction(names,mode){const staged=[];const tx={error:null,objectStore(name){const data=name==="entries"?entries:audios;return{get(id){return{result:structuredClone(data.get(id))}},put(row){staged.push(()=>data.set(row.id,structuredClone(row)));return{}},delete(id){staged.push(()=>data.delete(id));return{}},getAll(){return{result:structuredClone([...data.values()])}}}}};setImmediate(()=>{for(const fn of staged)fn();tx.oncomplete?.();});return tx;}};
let stopTask=null;
class Recorder{static isTypeSupported(){return true}constructor(){this.state="inactive";this.mimeType="audio/webm"}start(){this.state="recording"}stop(){this.state="inactive";this.ondataavailable?.({data:new Blob(["new audio"],{type:"audio/webm"})});stopTask=this.onstop?.();}}
const context={console,crypto:globalThis.crypto,Blob,Date,Map,Set,structuredClone,Promise,Event,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},MediaRecorder:Recorder,
document:{getElementById:element},navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},
localStorage:{getItem:()=>null},sessionStorage:{getItem:()=>null},
window:{MediaRecorder:Recorder,indexedDB:{},dispatchEvent(){}}};
let source=fs.readFileSync("app.js","utf8");
source=source.replace("  init();", '  state.db = globalThis.fixtureDb; showToast=message=>{globalThis.lastToast=message};openEntry=id=>{state.selected=id};switchView=view=>{state.view=view};activeAI=()=>false;globalThis.testRecording={state,startRecording,startClip,flushClip,cancelRecording,updateRecorderUI};');
context.fixtureDb=db;
vm.runInNewContext(source,context);
const T=context.testRecording;
(async()=>{
 const old={id:"entry",title:"Earlier entry",createdAt:new Date().toISOString(),parts:[{id:"old-part",type:"recording",clips:[{id:"old-clip"}]}]};
 entries.set(old.id,old);audios.set("old-clip",{id:"old-clip",blob:new Blob(["old"])});
 T.state.entries=structuredClone([...entries.values()]);
 await T.startRecording("entry");const rec=T.state.recording;
 assert.match(element("recordTimer").textContent,/^00:00$/);
 rec.clipStarted=0;T.updateRecorderUI();assert.equal(element("recordTimer").textContent,"00:00","uninitialised timer must never show epoch time");
 rec.clipStarted=Date.now();T.flushClip(rec);await stopTask;
 assert.equal(audios.size,2,"autosaved clip exists");
 T.cancelRecording();await stopTask;
 assert.equal(entries.get("entry").parts.length,1,"earlier part stays");
 assert.equal(audios.size,1,"cancel deletes autosaved current clip");
 assert(audios.has("old-clip"));assert.equal(T.state.recording,null);
 T.state.entries=structuredClone([...entries.values()]);
 await T.startRecording(null);const newId=T.state.recording.entryId;
 T.cancelRecording();await stopTask;
 assert(!entries.has(newId),"cancel removes a new empty entry");
 // Cancel while an autosave is waiting for IndexedDB.
 T.state.entries=structuredClone([...entries.values()]);
 await T.startRecording("entry");const race=T.state.recording;T.flushClip(race);
 T.cancelRecording();await stopTask;
 assert.equal(audios.size,1);assert.equal(entries.get("entry").parts.length,1);
 console.log("Passed: initial timer, cancelling new/continued recordings, autosaved clip deletion and cancellation during an in-flight save.");
})().catch(e=>{console.error(e);process.exit(1)});
