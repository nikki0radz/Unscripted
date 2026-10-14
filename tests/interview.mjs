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
