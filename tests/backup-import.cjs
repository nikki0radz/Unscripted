const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const mimeTypes=['audio/webm;codecs=opus','audio/mp4;codecs="mp4a.40.2"','audio/mp4;codecs="mp4a.40.2,mp4a.40.5"','audio/ogg;codecs=opus','audio/webm','audio/mp4'];
const bytes=Uint8Array.from([0,255,31,127,254,0,129]);
const clips=mimeTypes.map((mime,i)=>({id:'clip-'+i,mime,duration:12345,transcript:'Existing transcript '+i,transcriptionComplete:true}));
const fixture={entries:[{id:'entry',title:'My original title',createdAt:'2026-10-29T12:00:00Z',updatedAt:'2026-10-29T13:00:00Z',summary:'My exact saved summary.',summaryEdited:true,bulletPoints:['Original bullet point'],tags:['Family'],parts:[{id:'part',type:'recording',createdAt:'2026-10-29T12:00:00Z',clips:clips.slice(0,5)},{id:'reflection',type:'note',reflectionAnswer:true,question:'What happened?',answer:'My saved answer',summary:'Saved reflection summary',clips:clips.slice(5)}]}],audio:new Map(clips.map(c=>[c.id,new Blob([bytes],{type:c.mime})])),restores:[],toast:''};
const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',value:''});return elements.get(id);};
const storage=new Map([['unscripted-personal-profile','Existing profile'],['unscripted-reflection-profile','Existing context']]);
class Reader{readAsDataURL(blob){blob.arrayBuffer().then(a=>{this.result='data:'+(blob.type||'application/octet-stream')+';base64,'+Buffer.from(a).toString('base64');this.onload();});}}
const context={console,crypto:globalThis.crypto,Blob,FileReader:Reader,atob,Uint8Array,Date,Map,Set,Promise,Event,fixture,setTimeout,clearTimeout,document:{getElementById:el},navigator:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},sessionStorage:{getItem:()=>null},window:{dispatchEvent(){},UnscriptedConfirm:async()=>true,UnscriptedNative:{exportBackup:text=>fixture.exported=text}}};
let source=fs.readFileSync(process.argv[2]||'app.js','utf8');
source=source.replace('  const getAudio = (id) => transaction("audio", "readonly", (s) => s.get(id)).then((row) => row?.blob);','  const getAudio = async id => fixture.audio.get(id);');
source=source.replace('  init();',`  state.entries=fixture.entries;refreshEntries=async()=>{};switchView=()=>{};showToast=text=>fixture.toast=text;window.UnscriptedDiary.restore=async(entries,audios)=>{fixture.restores.push({entries,audios});};globalThis.testBackup={exportBackup,importBackup,dataURLtoBlob,callAI,setAI:fn=>{callAIRequest=fn;}};`);
vm.runInNewContext(source,context);
(async()=>{
 const T=context.testBackup;
 assert.equal(await T.exportBackup(),true);
 const backup=JSON.parse(fixture.exported);
 assert.match(backup.audios[0].content,/^data:audio\/webm;codecs=opus;base64,/,'exercise actual browser export metadata');
 await T.importBackup({text:async()=>fixture.exported});
 assert.equal(fixture.restores.length,1,fixture.toast);
 const restored=fixture.restores[0];assert.equal(JSON.stringify(restored.entries),JSON.stringify(fixture.entries),'all saved summaries, transcripts, edits, tags and reflections unchanged');
 for(let i=0;i<clips.length;i++){assert.equal(restored.audios[i].blob.type,clips[i].mime);assert.deepEqual(new Uint8Array(await restored.audios[i].blob.arrayBuffer()),bytes,'original audio bytes unchanged');}
 assert.equal(backup.profiles['unscripted-personal-profile'],'Existing profile');
 const legacy=structuredClone(backup);legacy.audios[0].content='data:;base64,'+Buffer.from(bytes).toString('base64');await T.importBackup({text:async()=>JSON.stringify(legacy)});assert.equal(fixture.restores.length,2,fixture.toast);assert.equal(fixture.restores[1].audios[0].blob.type,clips[0].mime,'missing data URL type uses recording metadata');
 for(const value of ['data:audio/webm;codecs=opus;base64,%%broken','data:audio/webm;base64,','blob:https://example.invalid/audio','data:audio/webm,raw']){
  const invalid=structuredClone(backup);invalid.audios[2].content=value;const count=fixture.restores.length;
  await T.importBackup({text:async()=>JSON.stringify(invalid)});assert.equal(fixture.restores.length,count,'invalid audio must not partially import entries or skip clips');assert.match(fixture.toast,/Recording 3 could not be read/);
 }
 const incomplete=structuredClone(backup);incomplete.audios.pop();const count=fixture.restores.length;await T.importBackup({text:async()=>JSON.stringify(incomplete)});assert.equal(fixture.restores.length,count);assert.match(fixture.toast,/Backup is incomplete/);
 let release;T.setAI(()=>new Promise(resolve=>release=resolve));const work=T.callAI('/ask',{});assert.equal(context.window.UnscriptedWorkCount,1,'spinner activity tracks actual pending work');release({answer:'Done'});await work;assert.equal(context.window.UnscriptedWorkCount,0,'spinner clears when completed');T.setAI(async()=>{throw Error('offline')});await assert.rejects(T.callAI('/ask',{}));assert.equal(context.window.UnscriptedWorkCount,0,'spinner clears on failure as well');
 console.log('Passed: real export/import round trip for codec-bearing and legacy MIME types, byte-for-byte audio, unchanged saved summaries/transcripts/reflections/profiles, omitted MIME fallback, and malformed/missing audio rejection before writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
