import assert from 'node:assert/strict';
import {styleInstructions} from '../api/diary-style.js';
import {enforceReplyContract,noStandoutReply,replyPlan,replyFits} from '../api/ask-focus.js';
const style={friendliness:'casual like a friend',emojis:'lots',blunt:3};
const plan=replyPlan('Have I said anything nice about Owen?',[]);
const draft={answer:'You said being around Owen makes you feel calm.',sourceIds:['a']};
let calls=0;
const result=await enforceReplyContract(draft,{plan,question:'Have I said anything nice about Owen?',sources:[],style},async instructions=>{
 calls++;assert.match(instructions,/MAXIMUM FRIENDLINESS/);assert.match(instructions,/MAXIMUM EMOJIS/);assert.match(instructions,/preserve the exact factual meaning/);
 return JSON.stringify(draft); // Even if the model ignores the explicit request again.
});
assert.equal(calls,1);assert.match(result.answer,/calm/);assert.match(result.answer,/💭/);assert.deepEqual(result.sourceIds,['a']);assert.ok(replyFits(result.answer,plan));
const unchanged=await enforceReplyContract(draft,{plan,style:{emojis:'none'}},()=>{throw Error('Unnecessary rewrite');});assert.deepEqual(unchanged,draft);
assert.match(noStandoutReply({people:[]},style).answer,/💭🤍/,'directness must not disable emojis');
assert.doesNotMatch(noStandoutReply({people:[]},{emojis:'none'}).answer,/\p{Extended_Pictographic}/u);
for(const target of ['chat','question','summary'])assert.match(styleInstructions(style,target),/MAXIMUM FRIENDLINESS/);
console.log('Passed: maximum personality is explicit, missing emojis trigger a grounded concise rewrite, ignored style preserves facts, and directness does not suppress emojis.');
