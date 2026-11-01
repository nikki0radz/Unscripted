const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('native-android.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 const events={},results=new Map(),requests=[],acks=[],imports=[],timers=[];
 let data={active:false,clips:[]},allowImport=true,permissionCalls=0;
 const bridge={available:()=>true,microphoneGranted:()=>true,permissions(){permissionCalls++;},command(action,raw){const m=JSON.parse(raw);if(action==='start'){data={...data,active:true,metadata:m,error:''};}if(action==='stop'){data.active=false;}if(action==='cancel'){data.active=false;data.clips=[];}return JSON.stringify(data);},ack(id){acks.push(id);data.clips=data.clips.filter(c=>c.id!==id);},result:id=>results.get(id)||'',forget:id=>results.delete(id),http(id,path,json,file,code){requests.push({id,path,json,file,code});return '';},exportBackup(){}};
 class Reader{readAsDataURL(blob){blob.arrayBuffer().then(v=>{this.result='data:'+blob.type+';base64,'+Buffer.from(v).toString('base64');this.onload();});}}
 const window={UnscriptedAndroid:bridge,Blob,addEventListener:(name,fn)=>events[name]=fn,UnscriptedDiary:{ready:()=>true,async nativeImport(c,b){if(!allowImport)throw Error('disk full');imports.push([c,b]);},nativeStatus(){},toast(){}}};
 const context={window,navigator:{mediaDevices:{}},crypto:globalThis.crypto,Blob,FileReader:Reader,fetch:async()=>({ok:true,blob:async()=>new Blob(['aac'],{type:'audio/mp4'})}),setInterval:fn=>timers.push(fn),setTimeout,Event,console,document:{addEventListener(){}}};
 vm.runInNewContext(source,context);
 return{window,bridge,results,requests,acks,imports,timers,events,context,permissionCalls:()=>permissionCalls,setData:v=>data=v,setImport:v=>allowImport=v};
}
(async()=>{
 const T=setup(),N=T.window.UnscriptedNative;
 await N.start('entry','part');assert.equal(N.status().active,true);assert.equal(T.permissionCalls(),1,'notification permission must be checked even with existing microphone access');
 // Independent clips are replayed in chronological order, even when disk UUID order differs.
 T.setData({active:false,clips:[{id:'b',entryId:'entry',partId:'part',createdAt:'2026-10-31T12:02:00Z'},{id:'a',entryId:'entry',partId:'part',createdAt:'2026-10-31T12:00:00Z'}]});
 T.setImport(false);await N.sync();assert.equal(T.acks.length,0,'failed IndexedDB write must retain native audio');
 T.setImport(true);await N.sync();assert.deepEqual(T.imports.map(x=>x[0].id),['a','b']);assert.deepEqual(T.acks,['a','b']);
 // A completed request survives the JavaScript page and is consumed without charging for another upload.
 T.results.set('transcribe-clip1',JSON.stringify({text:'Saved result'}));
 const form={get:()=>({name:'native-clip1.m4a',type:'audio/mp4',arrayBuffer:async()=>new TextEncoder().encode('voice').buffer})};
 assert.equal((await N.callAI('/transcribe',form,true,'')).text,'Saved result');assert.equal(T.requests.length,0);assert(T.results.has('transcribe-clip1'),'result retained until diary write acknowledges it');N.ackTranscript('clip1');assert(!T.results.has('transcribe-clip1'));
 const p=N.callAI('/organize',{content:[]},false,'');await tick();assert.equal(T.requests.length,1);const id=T.requests[0].id;T.context.document.hidden=true;T.results.set(id,JSON.stringify({summary:'Done'}));T.events['unscripted-native']();await tick();assert.equal((await p).summary,'Done');assert(!T.results.has(id));
 // The voice-answer adapter emits a playable MP4 file and keeps its native copy until committed.
 const rec=new T.window.MediaRecorder();let audio,stopped=false;rec.ondataavailable=e=>audio=e.data;rec.onstop=async()=>{stopped=true;};rec.start();await tick();
 T.setData({active:true,metadata:{token:rec.token,simple:true},clips:[{id:'simpleclip',token:rec.token,simple:true}]});rec.stop();await tick();await tick();assert(stopped);assert.equal(audio.type,'audio/mp4');assert.equal(audio.nativeClipId,'simpleclip');const combined=new T.window.Blob([audio],{type:audio.type});assert.equal(combined.nativeClipId,'simpleclip');N.commit(combined);assert(T.acks.includes('simpleclip'));
 console.log('Passed: Android recording startup, chronological recovery, failed-save retention, background result persistence, duplicate-upload prevention, native voice adapter and commit acknowledgement.');
})().catch(e=>{console.error(e);process.exitCode=1;});
