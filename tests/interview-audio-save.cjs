const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('app.js','utf8'),start=source.indexOf('  async function saveInterview(document, id)'),end=source.indexOf('  function profileData()',start);
let stored={id:'entry',kind:'interview',parts:[{id:'answer',type:'note',interviewQuestion:true,interviewPending:true,question:'A question?',clips:[{id:'clip',duration:125000,transcript:'Spoken answer'}],summary:'A summary',bulletPoints:['A point']}]};
const save=new Function('transaction','newEntry','uid','allParts','saveEntry','refreshEntries','state','renderHome','activeAI','processEntry',source.slice(start,end)+'return saveInterview;')(
async()=>structuredClone(stored),()=>{throw Error('Should reuse existing entry')},()=> 'new-id',e=>e.parts||[],async e=>{stored=structuredClone(e)},async()=>{},{view:'entry'},()=>{},()=>false,()=>{});
(async()=>{
 const doc={goal:'Curiosity',answers:[{id:'answer',question:'A question?',answer:'Edited transcript',hasAudio:true}],complete:false};
 await save(doc,'entry');assert.equal(stored.parts[0].clips[0].id,'clip');assert.equal(stored.parts[0].answer,'Edited transcript');
 await save({...doc,complete:true},'entry');assert.equal(stored.parts[0].clips[0].transcript,'Spoken answer');assert.equal(stored.parts.length,1);
 await save({...doc,answers:[...doc.answers,{id:'skip',question:'Skipped?',skipped:true}],complete:true},'entry');assert.equal(stored.parts.length,1);assert.equal(stored.parts[0].clips[0].duration,125000);
 console.log('Passed: original interview clips survive transcript edits, saving, completion and skips without duplicate answers.');
})().catch(e=>{console.error(e);process.exit(1)});
