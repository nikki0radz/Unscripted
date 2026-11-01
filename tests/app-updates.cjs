const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nodes=new Map(),banners=[];function node(){return{hidden:false,disabled:false,checked:false,textContent:'',children:[],classList:{toggle(){}},append(...x){this.children.push(...x);}};}function el(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}
const state={installedVersion:'1.0.7',installedCode:8,automatic:true,checking:false,lastChecked:0,error:'',available:false};let checks=0,downloads=0,allow=false;
const events={},bridge={updateStatus:()=>JSON.stringify(state),checkAppUpdates(){checks++;state.checking=true;},setAutomaticUpdates(value){state.automatic=value;},downloadAppUpdate(){downloads++;}};
const window={UnscriptedAndroid:bridge,UnscriptedConfirm:async()=>allow,UnscriptedDiary:{recording:()=>false},addEventListener:(name,fn)=>events[name]=fn};
vm.runInNewContext(fs.readFileSync('app-updates.js','utf8'),{window,document:{getElementById:el,createElement:node,body:{append:x=>banners.push(x)}},Date});
(async()=>{
 assert.equal(el('installedAppVersion').textContent,'Unscripted 1.0.7');assert(el('automaticUpdates').checked);assert(el('downloadAppUpdate').hidden);assert(banners[0].hidden);
 el('checkAppUpdates').onclick();assert.equal(checks,1);assert(el('checkAppUpdates').disabled);assert.match(el('appUpdateStatus').textContent,/Checking/);
 state.checking=false;state.error='The update feed has not been published yet.';events['unscripted-native']();assert.match(el('appUpdateStatus').textContent,/not been published/);assert(!el('appUpdateStatus').textContent.includes('up to date'),'unavailable feed must not claim success');
 state.error='';state.available=true;state.release={versionName:'1.0.8'};events['unscripted-native']();assert(!el('downloadAppUpdate').hidden);assert(!banners[0].hidden);
 await el('downloadAppUpdate').onclick();assert.equal(downloads,0,'declining confirmation does not download');allow=true;await el('downloadAppUpdate').onclick();assert.equal(downloads,1,'download only after user action and confirmation');
 window.UnscriptedDiary.recording=()=>true;events['unscripted-change']();assert(banners[0].hidden,'update banner does not cover recording');
 el('automaticUpdates').checked=false;el('automaticUpdates').onchange();assert(!state.automatic);
 state.available=false;state.lastChecked=Date.now();events['unscripted-native']();assert.match(el('appUpdateStatus').textContent,/up to date/);
 console.log('Passed: update UI loading, unpublished feed reporting, available-release banner, download confirmation, recording protection and automatic-check toggle.');
})().catch(error=>{console.error(error);process.exitCode=1;});
