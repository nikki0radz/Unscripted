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
