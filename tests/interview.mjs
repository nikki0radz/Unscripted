import assert from "node:assert/strict";
import {interview} from "../api/interview.js";
const sources=[{id:"past",date:"2026-07-14",text:"I was worried about confidence at work."}];
let received;
const result=await interview({goal:"Build self confidence",answers:[],sources,profile:"I value fairness."},async(instructions,input)=>{
  received=JSON.parse(input);assert.match(instructions,/hypothetical/);assert.match(instructions,/Do not invent/);assert.match(instructions,/Skipping is a boundary/);
  return JSON.stringify({question:"What has changed since your July entry about confidence at work?",sourceIds:["past","invented"]});
});
assert.equal(received.goal,"Build self confidence");assert.deepEqual(result.sourceIds,["past"]);
await assert.rejects(()=>interview({answers:Array(6).fill({question:"Q?",answer:"A"})},async()=>"{}"));
await assert.rejects(()=>interview({},async()=>JSON.stringify({question:"Why? What next?"})));
await assert.rejects(()=>interview({answers:[{question:"What matters to you?",answer:"Fairness"}]},async()=>JSON.stringify({question:"What matters to you?"})));
console.log("Passed: goal-aware interview context, grounded history references, skipped-question boundaries, question limits and duplicate rejection.");

{
  const sourceId="79c57132-ec35-4d97-81ba-8d8d2b0ca03d";
  const cleaned=await interview({sources:[{id:sourceId,text:"A creative project"}]},async instructions=>{
    assert.match(instructions,/ONLY in the sourceIds array/);
    return JSON.stringify({question:"Thinking about your project (source "+sourceId+"), what has changed?",sourceIds:[]});
  });
  assert.equal(cleaned.question,"Thinking about your project, what has changed?");
  assert.deepEqual(cleaned.sourceIds,[sourceId],"source reference survives cleanup as structured metadata");
}

const dilemma={scenario:"Imagine a runaway trolley will hit five people unless you divert it onto a track with one person.",choices:["Divert it, saving five but harming one.","Leave it on its current track."],question:"Which would you choose, and why?",sourceIds:["past"]};
let moralCalls=0;
const ethical=await interview({goal:"Moral dilemmas",sources,answers:[]},async(instructions,input)=>{
  moralCalls++;const data=JSON.parse(input);assert.equal(data.questionNumber,1);assert.match(instructions,/Do NOT ask a generic question/);assert.match(instructions,/Start with a concrete dilemma/);assert(!('sources' in data),"fictional dilemmas must not be presented as diary events");return JSON.stringify(dilemma);
});
assert.equal(moralCalls,1);assert.match(ethical.question,/A\. Divert/);assert.match(ethical.question,/B\. Leave/);assert.deepEqual(ethical.sourceIds,[]);
let retries=0;
await interview({goal:"Big questions & moral dilemmas",answers:[]},async()=>JSON.stringify(++retries===1?{question:"What values matter to you?"}:dilemma));
assert.equal(retries,2,"retry a generic response rather than show it as an ethical dilemma");
await interview({goal:"Friendships",answers:[{question:"What happened?",answer:"We had a disagreement."}]},async(instructions,input)=>{
  assert.match(instructions,/selected topic is mandatory for EVERY question/);assert.doesNotMatch(JSON.parse(input).suggestedAngle,/warm-up/);return JSON.stringify({question:"What made that disagreement with your friend difficult?",sourceIds:[]});
});
console.log("Passed: first-question ethical scenarios with two choices, legacy moral topic, off-format retry, and topic priority over generic warm-ups.");
