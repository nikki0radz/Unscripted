import assert from 'node:assert/strict';
import {interview} from '../api/interview.js';
let calls=0;
const result=await interview({goal:'Likes & dislikes',excludedQuestions:['What song makes you smile?'],variationSeed:'fresh-visit'},async(instructions)=>{
 assert.match(instructions,/NOVELTY/);assert.match(instructions,/fresh-visit/);assert.match(instructions,/What song makes you smile/);
 return JSON.stringify({question:++calls===1?'What song makes you smile?':'Which food would you happily eat every week?',sourceIds:[]});
});
assert.equal(calls,2);assert.match(result.question,/food/);
console.log('Passed: the backend receives cross-interview exclusions and retries a repeated opener.');
