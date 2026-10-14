import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
vm.runInThisContext(fs.readFileSync(new URL("../backup-crypto.js",import.meta.url),"utf8"));
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{value:"",checked:false,hidden:false,disabled:false,textContent:"",classList:{toggle(){}},replaceChildren(){this.options=[]},append(x){(this.options||=[]).push(x);if(!this.value)this.value=x.value}});return elements.get(id);}
const memory=new Map(), events={}, objects=new Map(), timers=new Map();let sequence=0, entries=[],mutations=0, badAck=false, badRead=false;
const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v))};
const context={crypto,TextEncoder,TextDecoder,Uint8Array,Blob,structuredClone,URL,Date,Map,Set,console,
  UnscriptedCrypto:globalThis.UnscriptedCrypto,localStorage:storage,
  setTimeout:(f)=>{timers.set(++sequence,f);return sequence},clearTimeout:id=>timers.delete(id),
  confirm:()=>true,document:{getElementById:element,querySelector:()=>({}),createElement:()=>({})},
  window:{UnscriptedConfirm:async()=>true,addEventListener:(name,fn)=>events[name]=fn,UnscriptedDiary:{config:()=>({url:"https://private.test",code:""}),entries:()=>entries,freshEntries:async()=>entries,recording:()=>false,ready:()=>true,clips:e=>e.parts.flatMap(p=>p.clips||[]),audio:async()=>new Blob(["audio bytes"],{type:"audio/webm"}),exportBackup:async()=>true,restore:async()=>{mutations++}}},
  fetch:async(url,options)=>{
    assert.equal(options.credentials,"same-origin");
    const u=new URL(url);
    if(u.pathname==="/backup/list")return new Response(JSON.stringify({snapshots:[...objects.keys()].filter(k=>k.startsWith("snapshots/")).map(key=>({key,createdAt:new Date().toISOString()})),truncated:false}));
    if(u.pathname==="/backup/put" && badAck)return new Response(JSON.stringify({saved:false}));
    if(u.pathname==="/backup/put"){objects.set(u.searchParams.get("key"),options.body);return new Response(JSON.stringify({saved:true}));}
    if(u.pathname==="/backup/get" && badRead)return new Response(new Uint8Array([1,2,3]));
    if(u.pathname==="/backup/get")return new Response(objects.get(u.searchParams.get("key")));
    throw Error("Unexpected request");
  }
};
vm.runInNewContext(fs.readFileSync(new URL("../cloud-backup.js",import.meta.url),"utf8"),context);
element("cloudPassword").value="test only long recovery passphrase";element("cloudEnabled").checked=true;
await element("cloudUnlock").onclick();
await element("cloudNow").onclick();
assert.equal(objects.size,0,"empty new install must not create a snapshot");
entries=[{id:"entry",createdAt:new Date().toISOString(),parts:[{type:"recording",clips:[{id:"clip"}]}]}];
events["unscripted-change"]();assert(timers.size>0,"changes should schedule an automatic backup");
await element("cloudNow").onclick();
assert.equal(objects.size,2,"a clip and complete metadata snapshot should be uploaded");
const snapshotKey=[...objects.keys()].find(k=>k.startsWith("snapshots/"));
const snapshot=JSON.parse(new TextDecoder().decode(await UnscriptedCrypto.decrypt(objects.get(snapshotKey),"test only long recovery passphrase")));
assert.equal(snapshot.entries[0].id,"entry");
assert.equal(new TextDecoder().decode(await UnscriptedCrypto.decrypt(objects.get(snapshot.audios[0].key),"test only long recovery passphrase")),"audio bytes");
assert(!new TextDecoder().decode(objects.get(snapshotKey)).includes('"entries"'),"server should not see plaintext entries");
element("cloudLock").onclick();element("cloudPassword").value="wrong recovery passphrase long enough";
await element("cloudUnlock").onclick();
assert.match(element("cloudStatus").textContent,/incorrect|damaged/);
await element("cloudRestore").onclick();assert.equal(mutations,0,"wrong password must not alter local entries");
element("cloudPassword").value="test only long recovery passphrase";await element("cloudUnlock").onclick();
await element("cloudList").onclick();element("cloudSnapshots").value=snapshotKey;
await element("cloudRestore").onclick();assert.equal(mutations,1);
badAck=true;await element("cloudNow").onclick();assert.match(element("cloudStatus").textContent,/acknowledge/);
badAck=false;badRead=true;await element("cloudNow").onclick();assert.match(element("cloudStatus").textContent,/read-back verification failed/);
console.log("Passed: automatic scheduling, empty-device protection, encrypted audio/text round-trip, wrong-password non-mutation and cloud restore.");
