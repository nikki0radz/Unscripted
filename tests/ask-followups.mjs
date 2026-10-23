import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {replyPlan,replyFits,standoutEvidence,enforceReplyContract} from '../api/ask-focus.js';
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const {default:worker}=await import('../api/worker.js');
const question='Is there anything that stands out to you specifically?';
const history=[{role:'user',content:'Are there any recurring themes?'},{role:'assistant',content:'A long broad recap of creativity, relationships and home.'}];
const plan=replyPlan(question,history);assert.equal(plan.kind,'standout');assert.equal(plan.maxSentences,2);assert.match(plan.analysisQuestion,/recurring themes/);assert.equal(plan.previousQuestion,history[0].content);
assert.equal(replyPlan('Explain this in detail',history).detailed,true);
assert.equal(replyPlan('What time did I say I would leave?',history).previousQuestion,'','a new specific question must not inherit the previous theme query');
const sources=['2026-10-01','2026-10-02','2026-10-03'].map((date,i)=>({id:String(i),date,text:'I felt left waiting after making plans.'}));sources.push({id:'cake',date:'2026-10-04',text:'I made a cake with pink icing.'});
const patterns={themes:[{theme:'Feeling left waiting after making plans',distinctDays:3,evidence:sources.slice(0,3).map(s=>({id:s.id,date:s.date,quote:s.text}))}],people:[]};
assert(!standoutEvidence(plan,patterns,sources).sources.some(s=>s.id==='cake'),'a standout answer only receives evidence for the chosen observation');
const long='Your creativity and relationships are deeply intertwined with your day-to-day feelings. '.repeat(16);
assert(!replyFits(long,plan));
const fallback=await enforceReplyContract({answer:long},{plan,question,patterns,sources},async()=>JSON.stringify({answer:long,sourceIds:[]}));assert(replyFits(fallback.answer,plan),'even a failed rewrite cannot show a wall of text');
const original=globalThis.fetch,token='test-only-token-long-enough-for-private-diary-1234',origin='https://diary.test';
async function run(noTheme=false){const calls=[];globalThis.fetch=async(url,request)=>{const body=JSON.parse(request.body);calls.push(body);let value;if(calls.length===1)value=noTheme?{themes:[],people:[]}:{themes:patterns.themes,people:[]};else if(calls.length===2){assert.match(body.instructions,/Maximum 60 words and 2 sentences/);assert.doesNotMatch(body.input,/pink icing/);assert.doesNotMatch(body.input,/long broad recap/i);value={answer:long,sourceIds:['0']};}else value={answer:'Feeling left waiting after making plans is one specific concern that repeats. I’d focus on that rather than treating everything you mention as a pattern.',sourceIds:['0']};return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});};const response=await worker.fetch(new Request(origin+'/ask',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({question,history,sources})}),{DIARY_ACCESS_TOKEN:token,OPENAI_API_KEY:'test-only-key'});assert.equal(response.status,200);const answer=await response.json();assert(replyFits(answer.answer,plan));assert.equal(calls.length,noTheme?1:3);if(noTheme)assert.match(answer.answer,/not seeing one clear recurring theme/);}
try{await run();await run(true);}finally{globalThis.fetch=original;}
console.log('Passed: exact standout follow-up inherits recurrence, receives only relevant evidence, rewrites overlong replies, and returns a short honest answer when no theme stands out.');
