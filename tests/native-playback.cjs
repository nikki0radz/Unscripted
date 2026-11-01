const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
class Element extends EventTarget{constructor(tag){super();this.tag=tag;this.children=[];this.attrs={};}append(...x){this.children.push(...x)}setAttribute(k,v){this.attrs[k]=v}}
let snapshot={},calls=[],writes=[],tick;
class Reader{readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:audio/mp4;base64,'+Buffer.from(b).toString('base64');this.onload();})}}
const bridge={playbackStatus:()=>JSON.stringify(snapshot),requestNotifications(){},playbackWrite(...args){writes.push(args);return ''},playback(action,data){calls.push([action,JSON.parse(data)]);if(action==='load')snapshot={...JSON.parse(data),active:true,playing:true,duration:120000,position:0};if(action==='pause')snapshot.playing=false;}};
const context={window:{UnscriptedAndroid:bridge},document:{createElement:t=>new Element(t)},Event,FileReader:Reader,setInterval:f=>{tick=f;return 1},clearInterval(){},console};
vm.runInNewContext(fs.readFileSync('recording-player.js','utf8'),context);
(async()=>{
const create=()=>context.window.UnscriptedRecordingPlayer.create([{id:'clip-a',duration:120000}],async()=>new Blob(['audio']),'recording',{entryId:'entry-a',title:'My recording'});
let p=create();await p.play();assert.equal(writes.length,1);assert.equal(calls[0][0],'load');assert.equal(calls[0][1].entryId,'entry-a');tick();assert.equal(p.children[0].attrs['aria-label'],'Pause recording');assert.ok(p.children[0].innerHTML.includes('<svg'));p.pause();assert.equal(calls.at(-1)[0],'pause');tick();assert.equal(p.children[0].attrs['aria-label'],'Play recording');
p.children[2].value=32;p.children[2].oninput();assert.equal(calls.at(-1)[1].position,32000);
p.dispose();assert.notEqual(calls.at(-1)[0],'stop','Re-rendering the entry must not kill background audio');p=create();await p.play();assert.equal(calls.at(-1)[0],'play');assert.equal(writes.length,1,'Reattach without rewriting active native audio');let ended=0;p.addEventListener('unscripted-session-ended',()=>ended++);snapshot.ended=true;snapshot.playing=false;tick();tick();assert.equal(ended,1);
snapshot.active=false;await p.play();assert.equal(calls.at(-1)[0],'load','Restart service after notification Stop');await p.playFrom(35);assert.equal(calls.at(-1)[0],"seek");assert.equal(calls.at(-1)[1].position,35000);p.dispose();
console.log('Passed: native staging, entry routing, pause/play icons, seek, reattachment, completion deduplication and stopped-service restart.');
})().catch(e=>{console.error(e);process.exitCode=1});
