const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const elements=new Map(),store=new Map(),events={};let stopTask,profileCalls=0;
function el(){return{hidden:false,disabled:false,value:"",textContent:"",children:[],classList:{toggle(){}},append(...children){this.children.push(...children)},replaceChildren(){this.children=[]}};}
function $(id){if(!elements.has(id))elements.set(id,el());return elements.get(id);}
class Recorder{static isTypeSupported(){return true}constructor(){this.mimeType="audio/webm";this.state="inactive"}start(){this.state="recording"}stop(){this.state="inactive";this.ondataavailable({data:new Blob(["voice"],{type:"audio/webm"})});stopTask=this.onstop();}}
const context={console,Blob,FormData,MediaRecorder:Recorder,setTimeout:()=>1,clearTimeout(){},confirm:()=>true,
localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},document:{getElementById:$,createElement:el},Event,
navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},
window:{UnscriptedConfirm:async()=>true,MediaRecorder:Recorder,dispatchEvent(){},addEventListener:(name,fn)=>events[name]=fn,UnscriptedDiary:{recording:()=>false,activeAI:()=>true,toast(){},callAI:async(path,body)=>{
 if(path==="/transcribe")return{text:"A transcribed answer."};
 if(body.action==="question")return{question:"Question "+(body.answers.length+1)+" about "+body.mode+"?"};
 profileCalls++;return{profile:body.answers.map(x=>x.answer).join("; ")};
}}}};
vm.runInNewContext(fs.readFileSync("profile-quiz.js","utf8"),context);
(async()=>{
 await $("knowQuiz").children[0].onclick();
 for(let i=0;i<6;i++){$("quizAnswer").value="My answer "+i;await $("quizNext").onclick();}
 assert.match(store.get("unscripted-personal-profile"),/My answer 5/);
 assert.equal(JSON.parse(store.get("unscripted-know-quiz")).answers.length,6);
 assert.equal(profileCalls,1);
 $("quizReview").children[0].children[2].onclick();$("quizAnswer").value="Updated name and tone";await $("quizNext").onclick();
 assert.match(store.get("unscripted-personal-profile"),/Updated name/);assert.equal(profileCalls,2);
 $("quizClose").onclick();await $("reflectionQuiz").children[0].onclick();
 $("quizAnswer").value="Unfinished draft";$("quizClose").onclick();await $("reflectionQuiz").children[0].onclick();
 assert.equal($("quizAnswer").value,"Unfinished draft","partial typed answer survives closing");
 await $("quizVoice").onclick();await $("quizVoice").onclick();await stopTask;
 assert.match($("quizAnswer").value,/transcribed answer/);
 await $("quizNext").onclick();
 assert.match(JSON.parse(store.get("unscripted-reflection-quiz")).answers[0].answer,/transcribed/);
 console.log("Passed: six-question UI flow, saved profile, editing answers refreshes context, draft resume and editable voice transcription.");
})().catch(e=>{console.error(e);process.exit(1)});
