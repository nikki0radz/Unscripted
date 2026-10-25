const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const elements=new Map(),store=new Map(),events={};let stopTask,profileCalls=0,opened=null;const interviews=[],questionRequests=[];let sourceRequests=0;
function el(){return{hidden:false,disabled:false,value:"",textContent:"",children:[],classList:{toggle(){}},append(...children){this.children.push(...children)},replaceChildren(...children){this.children=children}};}
function $(id){if(!elements.has(id))elements.set(id,el());return elements.get(id);}
class Recorder{static isTypeSupported(){return true}constructor(){this.mimeType="audio/webm";this.state="inactive"}start(){this.state="recording"}stop(){this.state="inactive";this.ondataavailable({data:new Blob(["voice"],{type:"audio/webm"})});stopTask=this.onstop();}}
const context={console,crypto:globalThis.crypto,Blob,FormData,MediaRecorder:Recorder,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},confirm:()=>true,
localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},document:{getElementById:$,createElement:el,addEventListener(){}},Event,
navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}},
window:{UnscriptedConfirm:async()=>true,MediaRecorder:Recorder,dispatchEvent(){},addEventListener:(name,fn)=>events[name]=fn,UnscriptedDiary:{recording:()=>false,activeAI:()=>true,toast(){},entries:()=>[{id:"past",title:"Confidence at work",createdAt:"2026-07-14"}],sources:()=>{sourceRequests++;return{sources:[{id:"past",date:"2026-07-14",text:"I wondered about my confidence at work."}]};},saveInterview:async(doc,id)=>{interviews.push(structuredClone(doc));return id||"saved-interview"},openEntry:id=>{opened=id},openInterviewSummary:id=>{opened=id},callAI:async(path,body)=>{
 if(path==="/interview"){questionRequests.push(structuredClone(body));if(body.mode==="follow-up")assert(body.sources.some(x=>x.id==="past"));else{assert.equal(body.sources.length,0);assert.equal(body.profile,"");}return{question:"Interview question "+(body.answers.length+1)+"?",sourceIds:body.mode==="follow-up"?["past"]:[]};}
 if(path==="/transcribe")return{text:"A transcribed answer."};
 if(body.action==="question")return{question:"Question "+(body.answers.length+1)+" about "+body.mode+"?"};
 profileCalls++;return{profile:body.answers.map(x=>x.answer).join("; ")};
}}}};
const profileAudio=[];
Object.assign(context.window.UnscriptedDiary,{
 saveInterviewClip:async(entryId,answerId,doc,blob,duration)=>{profileAudio.push({blob,duration,goal:doc.goal});return {entryId:entryId||"profile-audio",answerId:answerId||"profile-answer"}},
 transcribeInterviewAnswer:async()=>({answer:"A transcribed answer.",summary:"Saved answer",bulletPoints:[]}),
 summarySwitch:()=>el()
});
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
 await $("quizVoice").onclick();assert.equal($("quizRecordingIndicator").hidden,false);assert.equal($("quizRecordingTimer").textContent,"00:00");
 await $("quizVoice").onclick();await stopTask;assert.equal($("quizRecordingIndicator").hidden,true);
 assert.match($("quizAnswer").value,/transcribed answer/);
 assert.equal(profileAudio.length,1);assert.equal(profileAudio[0].goal,"Reflection context");assert(profileAudio[0].blob.size>0,"profile voice audio is durably saved before transcription");
 await $("quizNext").onclick();
 assert.match(JSON.parse(store.get("unscripted-reflection-quiz")).answers[0].answer,/transcribed/);
 assert.equal(interviews.at(-1).answers[0].id,"profile-answer");assert.equal(interviews.at(-1).answers[0].hasAudio,true);
 await $("quizClose").onclick();$("interviewStartButton").onclick();$("interviewFocus").value="Build grounded self-confidence";await $("interviewBegin").onclick();
 const originalAI=context.window.UnscriptedDiary.callAI;
 $("quizAnswer").value="Keep this unfinished answer";
 context.window.UnscriptedDiary.callAI=async()=>{throw Error("Temporary network failure")};
 await $("quizRefresh").onclick();
 assert.match($("quizStatus").textContent,/Temporary network failure/);
 assert.equal($("quizRefresh").disabled,false,"refresh remains available after an error");
 assert.equal($("quizAnswer").value,"Keep this unfinished answer");
 context.window.UnscriptedDiary.callAI=async()=>({});
 await $("quizRefresh").onclick();assert.match($("quizStatus").textContent,/No question returned/);
 context.window.UnscriptedDiary.callAI=originalAI;
 await $("quizRefresh").onclick();
 assert.equal($("quizAnswer").value,"Keep this unfinished answer","retry does not discard typed text");
 assert.equal($("quizStatus").hidden,true,"successful refresh clears the error");
 assert.equal(sourceRequests,0,"Interview Me never retrieves archive excerpts");assert.equal($("quizSourceLinks").children.length,0);const questionsBeforeSave=questionRequests.length;$("quizAnswer").value="I have improved at speaking up.";await $("quizNext").onclick();
 assert.equal($("interviewNextChoices").hidden,false);assert.equal($("quizAnswerArea").hidden,true);
 assert.equal(questionRequests.length,questionsBeforeSave,"saving the first answer does not automatically generate another question");
 await $("quizClose").onclick();await $("interviewResume").onclick();assert.equal($("interviewNextChoices").hidden,false,"saved-answer choices survive reopening");
 await $("interviewFollowQuestion").onclick();assert.equal(questionRequests.at(-1).continuation,"follow-up");
 assert.equal(questionRequests.at(-1).answers.at(-1).answer,"I have improved at speaking up.");
 await $("quizSkip").onclick();assert.equal(interviews.at(-1).answers[1].skipped,true);
 $("quizAnswer").value="A draft to return to";await $("quizClose").onclick();await $("interviewResume").onclick();assert.equal($("quizAnswer").value,"A draft to return to");
 await $("quizFinishEarly").onclick();assert.equal(interviews.at(-1).complete,true);assert.equal(interviews.at(-1).answers.length,3);assert(!store.has("unscripted-interview-draft"));
 $("interviewViewSummary").onclick();assert.equal(opened,"saved-interview");assert.equal($("quizModal").hidden,true);assert.equal($("interviewDoneModal").hidden,true);

 let clock=0;const rotations=[],audioClips=[];context.Date=class extends Date{static now(){return clock}};
 context.setTimeout=(fn,ms)=>{if(ms===120000)rotations.push(fn);return 1};
 const diary=context.window.UnscriptedDiary;
 diary.saveInterviewClip=async(entryId,answerId,doc,blob,duration)=>{audioClips.push({blob,duration,question:doc.question});return{entryId:entryId||"audio-interview",answerId:answerId||"long-answer"}};
 const fullAnswer="A detailed reflection about my week. ".repeat(300);
 diary.transcribeInterviewAnswer=async()=>({answer:fullAnswer,summary:"Short summary",bulletPoints:["Specific detail"]});
 diary.summarySwitch=()=>el();
 await $("interviewBegin").onclick();
 await $("quizVoice").onclick();
 for(let i=0;i<6;i++){clock+=120000;rotations.at(-1)();await stopTask;}
 assert(context.window.UnscriptedQuiz.recording(),"interview continues after twelve minutes");
 assert.equal(audioClips.length,6);
 $("quizPause").onclick();await stopTask;assert.equal($("quizPause").textContent,"Resume");
 $("quizPause").onclick();clock+=3000;
 await $("quizVoice").onclick();await stopTask;
 assert.equal($("quizAnswer").value,fullAnswer);assert($("quizAnswerSummary").children.length);
 await $("quizNext").onclick();
 assert.equal(interviews.at(-1).answers[0].answer.length,fullAnswer.trim().length,"long answers are not cut to 6000 characters");
 assert.equal(interviews.at(-1).answers[0].id,"long-answer","original clips attach to the same answer");
 await $("interviewFinish").onclick();assert.equal(interviews.at(-1).answers.length,1,"one answer is enough to finish");assert.equal($("interviewDoneModal").hidden,false,"finish uses a simple confirmation");assert.equal($("quizModal").hidden,true);
 $("interviewViewSummary").onclick();assert.equal(opened,"audio-interview");
 await $("interviewBegin").onclick();
 for(let i=0;i<8;i++){$("quizAnswer").value="Optional answer "+i;await $("quizNext").onclick();assert.equal($("interviewNextChoices").hidden,false);if(i<7)await $("interviewNewQuestion").onclick();}
 assert.equal(interviews.at(-1).answers.length,8,"optional extra answers are not capped at six");
 assert.equal(questionRequests.at(-1).continuation,"fresh");
 await $("quizClose").onclick();await $("interviewResume").onclick();assert.equal(JSON.parse(store.get("unscripted-interview-draft")).answers.length,8,"resume retains all answers");
 await $("interviewFinish").onclick();
 await context.window.UnscriptedQuiz.startFollowUp();
 assert.equal($("quizTitle").textContent,"Follow up");assert(sourceRequests>0,"separate Follow up retrieves recent diary excerpts");
 assert.match(store.get("unscripted-interview-draft"),/"followUp":true/);
 console.log("Passed: six-question UI flow, saved profile, editing answers refreshes context, draft resume and editable voice transcription.");
})().catch(e=>{console.error(e);process.exit(1)});
