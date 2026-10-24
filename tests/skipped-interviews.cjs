const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('app.js','utf8');
const extract=name=>source.match(new RegExp('const '+name+' = \\(entry\\) => ([^;]+);'))[1];
const allParts=e=>e.parts||[];
const sortedParts=new Function('allParts','return entry=>'+extract('sortedParts'))(allParts);
const transcriptText=new Function('allParts','return entry=>'+extract('transcriptText'))(allParts);
const entry={parts:[{id:'skip',type:'note',interviewQuestion:true,skipped:true,text:'Question: skipped subject\nSkipped',createdAt:'2026-01-01'},{id:'answer',type:'note',interviewQuestion:true,text:'My real answer',createdAt:'2026-01-02'}]};
assert.deepEqual(sortedParts(entry).map(x=>x.id),['answer']);assert.equal(transcriptText(entry),'My real answer');
const start=source.indexOf('  async function saveInterview(document, id)');const end=source.indexOf('  function profileData()',start);
let saved;
const save=new Function('transaction','newEntry','uid','allParts','saveEntry','refreshEntries','state','renderHome','activeAI','processEntry',source.slice(start,end)+'return saveInterview;')(
async()=>null,()=>({id:'interview',parts:[]}),()=> 'id',allParts,async e=>{saved=e},async()=>{},{view:'entry'},()=>{},()=>false,()=>{});
(async()=>{await save({goal:'Surprise me',complete:true,answers:[{id:'s',question:'Skipped question?',answer:'',skipped:true},{id:'a',question:'Answered question?',answer:'Something real',skipped:false}]});assert.equal(saved.parts.length,1);assert.equal(saved.interview.answers.length,1);assert.doesNotMatch(saved.parts[0].text,/Skipped/);assert.match(saved.parts[0].text,/Something real/);console.log('Passed: skipped prompts are absent from saved interview parts, archive display, transcript and summary inputs; answered questions remain.');})();
