import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {styleInstructions} from '../api/diary-style.js';
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const {default:worker}=await import('../api/worker.js');
const origin='https://diary.test',token='test-only-private-access-code-1234567890123',style={friendliness:'casual like a friend',voiceTone:'warm',gossip:2,blunt:0,emojis:'some'},calls=[];
let replies=[];const oldFetch=globalThis.fetch;
globalThis.fetch=async(url,request)=>{calls.push(JSON.parse(request.body));return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(replies.shift())}]}]});};
async function request(path,body,response){replies=[response];const r=await worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({...body,style})}),{DIARY_ACCESS_TOKEN:token,OPENAI_API_KEY:'test-only-key'});assert.equal(r.status,200);const prompt=calls.at(-1).instructions;assert.match(prompt,/casual like a friend/);assert.match(prompt,/gentle and tactful/);return r.json();}
try{
 await request('/interview',{goal:'Likes & dislikes',answers:[]},{question:'What little thing always makes you smile?',sourceIds:[]});
 await request('/profile-quiz',{mode:'know',action:'question',answers:[]},{question:'What do you enjoy doing when you have a little time to yourself?'});
 await request('/reflect',{entry:{id:'e',text:'I felt hurt.'}},{question:'What do you wish they had understood in that moment?',sourceIds:['e']});
 await request('/clarify-question',{question:'What matters most here?'},{meaning:'It asks what feels important to you.',howToAnswer:'Pick one thing you care about.',example:'For example, I want us to listen to each other.'});
 const answer=await request('/ask',{question:'When have I complimented Owen?',sources:[{id:'p',date:'2026-10-01',text:'Owen makes me feel calm, and he never shouts at me.'}]},{answer:'You described feeling calm around Owen and said he never shouts at you. Those are positive descriptions, even if you didn’t frame them as compliments 💭.',sourceIds:['p']});assert.match(answer.answer,/feeling calm/);assert.match(calls.at(-1).instructions,/include grounded positive descriptions and experiences/);assert.match(calls.at(-1).instructions,/Do not add unrelated negative examples/);
 replies=[{answer:'An unnecessarily long analysis. '.repeat(50),sourceIds:['p']},{answer:'You said you feel calm around him 💭.',sourceIds:['p']}];
 const response=await worker.fetch(new Request(origin+'/ask',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({question:'Have I said anything nice about Owen?',sources:[{id:'p',date:'2026-10-01',text:'Owen makes me feel calm.'}],style})}),{DIARY_ACCESS_TOKEN:token,OPENAI_API_KEY:'test-only-key'});assert.equal(response.status,200);assert.match(calls.at(-1).instructions,/Rewrite the overlong/);assert.match(calls.at(-1).instructions,/casual like a friend/,'shortening must preserve warmth');assert.match((await response.json()).answer,/calm/);
 assert.doesNotMatch(styleInstructions(style,'question'),/Style for the summary AND/);
}finally{globalThis.fetch=oldFetch;}
console.log('Passed: global warm style reaches interviews, profile questions, reflections, explanations and chat rewrites; implicit positive examples are recognised without unrelated criticism.');
