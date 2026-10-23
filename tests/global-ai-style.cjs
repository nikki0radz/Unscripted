const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const style={friendliness:'casual like a friend',voiceTone:'warm',gossip:2,blunt:0,emojis:'lots'},calls=[];
const context={crypto:{},Map,Set,Date,AbortController,setTimeout,clearTimeout,window:{},document:{getElementById:()=>null,querySelector:()=>null},localStorage:{getItem:key=>key==='unscripted-summary-style'?JSON.stringify(style):key==='unscripted-api-url'?'https://diary.test':null},sessionStorage:{getItem:()=> 'test-code'},fetch:async(url,options)=>{calls.push({url,options});return{ok:true,text:async()=>JSON.stringify({question:'What made you smile?'})}}};
vm.runInNewContext(fs.readFileSync('app.js','utf8').replace('  init();','  globalThis.call=callAI;'),context);
(async()=>{for(const path of ['/ask','/interview','/reflect','/clarify-question','/profile-quiz']){await context.call(path,{question:'Q?'});for(const [key,value] of Object.entries(style))assert.equal(JSON.parse(calls.at(-1).options.body).style[key],value,path+' uses current global style');}
await context.call('/organize',{style:{friendliness:'neutral'}});assert.deepEqual(JSON.parse(calls.at(-1).options.body).style,{friendliness:'neutral'},'entry override is preserved');
const audio={marker:'form-data'};await context.call('/transcribe',audio,true);assert.equal(calls.at(-1).options.body,audio,'transcription audio is not modified');
console.log('Passed: latest global AI style reaches all JSON features, entry overrides remain, and audio uploads stay untouched.');})().catch(e=>{console.error(e);process.exit(1)});
