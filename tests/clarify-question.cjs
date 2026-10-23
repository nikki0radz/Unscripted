const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements=new Map();
function node(){return{hidden:false,disabled:false,textContent:'',children:[],append(...n){this.children.push(...n)},replaceChildren(){this.children=[]},setAttribute(k,v){this[k]=v}}}
function el(id){if(!elements.has(id))elements.set(id,node());return elements.get(id)}
let question='What values does this reflect?',calls=0,pending;
const result={meaning:'Which things matter to you here?',howToAnswer:'Pick one thing you care about and say why.',example:'For example, someone might say: I care about fairness.'};
const ctx={document:{getElementById:el,createElement:node},window:{UnscriptedDiary:{callAI:async(path,body)=>{calls++;assert.equal(path,'/clarify-question');assert.equal(body.question,question);return result}}}};
vm.runInNewContext(fs.readFileSync('clarify-question.js','utf8'),ctx);
(async()=>{
const controller=ctx.window.UnscriptedClarify.create({buttonId:'button',panelId:'panel',question:()=>question,context:()=>'A reflection question'});
assert(el('button').hidden);controller.reset(true);await el('button').onclick();assert.equal(calls,1);assert(!el('panel').hidden);assert.equal(el('panel').children[4].textContent,'An example (made up)');
await el('button').onclick();assert(el('panel').hidden);await el('button').onclick();assert.equal(calls,1,'reopening uses cached explanation');
controller.reset(true);ctx.window.UnscriptedDiary.callAI=()=>new Promise(resolve=>pending=resolve);const old=el('button').onclick();question='A different question?';controller.reset(true);pending(result);await old;assert(el('panel').hidden,'late response cannot explain the next question');
ctx.window.UnscriptedDiary.callAI=async()=>{throw Error('Offline')};await el('button').onclick();assert.match(el('panel').textContent,/Offline/);assert.equal(el('button').disabled,false);assert.equal(el('button').textContent,'Try explanation again');
const source=fs.readFileSync('api/worker.js','utf8');const fn=source.slice(source.indexOf('async function clarifyQuestion'),source.indexOf('async function ask'));
let instructions;
const {styleInstructions}=await import('../api/diary-style.js');
const clarify=new Function('styleInstructions','parseJSON','openAIText',fn+';return clarifyQuestion')(styleInstructions,JSON.parse,async(env,prompt,input)=>{instructions=prompt;assert(JSON.parse(input).question);return JSON.stringify(result)});
await assert.rejects(clarify({question:''},{}));assert.deepEqual(await clarify({question:'What values?'},{}),result);assert.match(instructions,/never childish or patronising/);assert.match(instructions,/hypothetical/);
console.log('Passed: plain-language explanation, cached toggle, stale response protection, retry after failure, input validation and hypothetical-example prompt.');
})().catch(e=>{console.error(e);process.exit(1)});
