import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const {default:worker}=await import('../api/worker.js');
const origin='https://diary.test',token='test-only-private-diary-access-code-123456789',calls=[];
const sources=[{id:'a',date:'2026-10-01',text:'I was waiting again.'},{id:'b',date:'2026-10-02',text:'I was waiting again.'},{id:'c',date:'2026-10-03',text:'I was waiting again.'}];
const original=globalThis.fetch;
globalThis.fetch=async(url,request)=>{const body=JSON.parse(request.body);calls.push(body);assert.equal(body.store,false);const value=calls.length===1?{themes:[{theme:'Being kept waiting',evidence:sources.map(s=>({id:s.id,quote:s.text}))}],people:[]}:{answer:'You return to feeling kept waiting.',sourceIds:['a','invented']};return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});};
try{
 const r=await worker.fetch(new Request(origin+'/ask',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({question:'Is there a recurring theme?',sources,style:{gossip:2,emojis:'lots'}})}),{DIARY_ACCESS_TOKEN:token,OPENAI_API_KEY:'test-only-key'});
 assert.equal(r.status,200);const result=await r.json();assert.deepEqual(result.sourceIds,['a']);assert.equal(calls.length,3);assert.match(calls[1].input,/"distinctDays":3/);assert.match(calls[1].instructions,/ACTUAL question/);assert.doesNotMatch(calls[1].instructions,/Style for the summary AND bullet points/);assert.match(calls[1].instructions,/No source links/);
}finally{globalThis.fetch=original;}
console.log('Passed: authenticated Ask Diary verifies recurrence before answering, uses chat-specific style and rejects invented source IDs.');
