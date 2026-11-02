const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const secret='test recovery password with several words';
const storage=new Map([['unscripted-cloud-enabled','1']]),objects=new Map();let remembered='',vaultScope='',tamper=false,fail=false;
const entries=[{id:'e1',parts:[{id:'p1',clips:[{id:'c1'}]}]}];
function app(){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',value:'',checked:true,hidden:false,disabled:false,children:[],classList:{toggle(){}},focus(){},replaceChildren(){this.children=[]},append(x){this.children.push(x)}});return nodes.get(id)};
 const events={};
 const bridge={saveBackupKey(scope,data){vaultScope=scope;remembered=data;return ''},loadBackupKey(scope){return scope===vaultScope?remembered:''},forgetBackupKey(){remembered='';}};
 const D={config:()=>({url:'https://example.invalid',code:'test-access'}),entries:()=>entries,freshEntries:async()=>entries,ready:()=>true,recording:()=>false,clips:e=>e.parts.flatMap(p=>p.clips),audio:async()=>new Blob(['original audio'],{type:'audio/mp4'}),profiles:()=>({})};
 const context={crypto,TextEncoder,TextDecoder,Uint8Array,Map,Set,Blob,structuredClone,Date,JSON,Error,document:{getElementById:node,querySelector:()=>({}),createElement:()=>({})},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:()=>1,clearTimeout(){},window:{UnscriptedAndroid:bridge,UnscriptedDiary:D,addEventListener:(name,fn)=>events[name]=fn},fetch:async(url,opt)=>{
 if(fail)throw Error('Connection interrupted');
 if(url.endsWith('/backup/list'))return {ok:true,json:async()=>({snapshots:[...objects.keys()].filter(k=>k.startsWith('snapshots/')).map(key=>({key,createdAt:'2026-11-02'}))})};
 const key=decodeURIComponent(url.split('?key=')[1]);
 if(url.includes('/backup/put')){objects.set(key,new Uint8Array(opt.body));return {ok:true,json:async()=>({saved:true})};}
 const bytes=new Uint8Array(objects.get(key));if(tamper&&key.startsWith('snapshots/'))bytes[bytes.length-1]^=1;
 return {ok:true,arrayBuffer:async()=>bytes.buffer};
 }};
 vm.createContext(context);vm.runInContext(fs.readFileSync('backup-crypto.js','utf8'),context);vm.runInContext(fs.readFileSync('cloud-backup.js','utf8'),context);
 return {node,events,context};
}
async function settle(){for(let i=0;i<8;i++)await new Promise(r=>setTimeout(r,5));}
(async()=>{
 let a=app();await settle();a.node('cloudPassword').value=secret;await a.node('cloudUnlock').onclick();
 assert(remembered);assert(!remembered.includes(secret));const saved=JSON.parse(remembered);assert.equal(saved.key.length,64);assert.equal(saved.salt.length,32);
 await a.node('cloudNow').onclick();assert.match(a.node('cloudStatus').textContent,/completed and checked/);assert(storage.get('unscripted-cloud-last'));
 const first=storage.get('unscripted-cloud-last');assert.equal(a.node('cloudLastSuccess').textContent,first);
 a=app();await settle();assert.match(a.node('cloudStatus').textContent,/remembers/);await a.node('cloudNow').onclick();assert.match(a.node('cloudStatus').textContent,/completed and checked/);
 await a.node('cloudRestore').onclick();assert.match(a.node('cloudStatus').textContent,/recovery password/,'Remembering a key must not bypass restore password');
 const last=storage.get('unscripted-cloud-last');tamper=true;await a.node('cloudNow').onclick();assert.match(a.node('cloudStatus').textContent,/verification failed/);assert.equal(storage.get('unscripted-cloud-last'),last);tamper=false;
 fail=true;await a.node('cloudNow').onclick();assert.match(a.node('cloudStatus').textContent,/Connection interrupted/);assert.equal(storage.get('unscripted-cloud-last'),last);fail=false;
 a.node('cloudLock').onclick();assert.equal(remembered,'');await a.node('cloudNow').onclick();assert.equal(a.node('backupAdvanced').open,true);assert.match(a.node('cloudStatus').textContent,/once/);
 a.node('cloudPassword').value='wrong recovery password';await a.node('cloudUnlock').onclick();assert.equal(remembered,'');assert.match(a.node('cloudStatus').textContent,/incorrect/);
 remembered='corrupted';a=app();await settle();assert.match(a.node('cloudStatus').textContent,/setting up again/);
 const bytes=await a.context.UnscriptedCrypto.decrypt(objects.get([...objects.keys()].find(k=>k.startsWith('clips/'))),secret);assert.equal(new TextDecoder().decode(bytes),'original audio');
 console.log('Passed: remembered key (not password), reopen/manual backup, restore password gate, failure and corrupt read-back preserve last success, forgotten/corrupt access, unchanged audio encryption.');
})().catch(e=>{console.error(e);process.exitCode=1});
