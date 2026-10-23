/* AI-led profile interviews. Voice answers are transcribed, then editable before saving. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const answerUid=()=>crypto.randomUUID?crypto.randomUUID():"answer-"+Date.now()+"-"+Math.random().toString(36).slice(2);
  const modes = { know: { title: "Get to know me", key: "unscripted-know-quiz", context: "unscripted-personal-profile", target: "knowQuiz" }, reflection: { title: "Reflection context", key: "unscripted-reflection-quiz", context: "unscripted-reflection-profile", target: "reflectionQuiz" }, interview: { title:"Interview me", key:"unscripted-interview-draft" } };
  let mode = null, data = null, editing = -1, busy = false, voice = null, epoch = 0, unsavedClip = null, setupFollowUp = false;
  const clarification=window.UnscriptedClarify?.create({buttonId:"quizExplain",panelId:"quizExplanation",question:()=>$("quizQuestion").textContent,context:()=>mode==="interview"?"Interview focus: "+(data?.goal||""):"Getting to know the diary owner"});
  function load(which) { try { const saved = JSON.parse(localStorage.getItem(modes[which].key) || "{}"); return { answers: Array.isArray(saved.answers) ? saved.answers.slice(0,6) : [], question: typeof saved.question === "string" ? saved.question : "", complete: !!saved.complete, draft:typeof saved.draft==="string"?saved.draft:"", editing:Number.isInteger(saved.editing)?saved.editing:-1, goal:typeof saved.goal==="string"?saved.goal:"A mix of questions", entryId:typeof saved.entryId==="string"?saved.entryId:null, questionSources:Array.isArray(saved.questionSources)?saved.questionSources:[], currentAnswerId:saved.currentAnswerId||null, followUp:!!saved.followUp }; } catch (_) { return { answers: [], question: "", complete: false }; } }
  function save() { localStorage.setItem(modes[mode].key, JSON.stringify(data)); window.dispatchEvent(new Event("unscripted-change")); renderCards(); }
  function tell(message, error = false) { $("quizStatus").textContent = message; $("quizStatus").hidden = !message; $("quizStatus").classList.toggle("error", error); }
  function renderCards() {
    for (const which of ["know","reflection"]) {
      const saved = load(which), root = $(modes[which].target); root.replaceChildren();
      const button = document.createElement("button"); button.type = "button"; button.className = "button-primary";
      button.textContent = saved.complete ? "Review & edit answers" : saved.answers.length || saved.question ? "Continue quiz" : "Start quiz";
      button.onclick = () => open(which); root.append(button);
      const info = document.createElement("p"); info.className = "tiny"; info.textContent = saved.complete ? "Your answers are saved. Edit any answer to refresh what AI knows." : "Six questions, one at a time. Type or record each answer; skip anything you prefer.";
      root.append(info);
      const context = localStorage.getItem(modes[which].context);
      if (context) { const details = document.createElement("details"), heading = document.createElement("summary"), body = document.createElement("p"); heading.textContent = "What AI currently knows"; body.className = "tiny"; body.textContent = context; details.append(heading,body); root.append(details); }
    }
  }
  function buttons() {
    $("quizNext").disabled = busy || !!voice || !!unsavedClip;
    $("quizSkip").disabled = busy || !!voice;
    $("quizRefresh").disabled = busy || !!voice || !!data?.currentAnswerId;
    $("quizVoice").disabled = busy || !!voice?.saving;
    $("quizPause").hidden = !voice || mode!=="interview";
    $("quizAnswer").disabled = busy || !!voice;
    $("quizClose").disabled = busy; $("quizFinishEarly").disabled=busy||!!voice;
  }
function cleanInterviewQuestion(text) {
  const uuid="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  return String(text||"").replace(new RegExp("\\s*[([]\\s*(?:sources?\\s*:?\\s*)?"+uuid+"\\s*[)\\]]","gi"),"").replace(new RegExp("\\b(?:source\\s*:?\\s*)?"+uuid+"\\b","gi"),"").replace(/\s+([,.;?!])/g,"$1").replace(/ {2,}/g," ").trim();
}
  function showQuestion() {
    $("quizAnswerSummary").replaceChildren();
    $("quizReview").hidden = true; $("quizAnswerArea").hidden = false;
    $("quizProgress").textContent = editing >= 0 ? "Edit answer " + (editing + 1) : "Question " + Math.min(data.answers.length+1,6) + " of 6";
    $("quizQuestion").textContent = cleanInterviewQuestion(editing >= 0 ? data.answers[editing].question : data.question);
    clarification?.reset(!!$("quizQuestion").textContent);
    $("quizNext").textContent = editing >= 0 ? "Save answer" : data.answers.length === 5 ? "Finish quiz" : "Next question";
    $("quizRefresh").hidden = editing >= 0; $("quizSkip").hidden = editing >= 0; $("quizFinishEarly").hidden=mode!=="interview"||editing>=0||!data.answers.some(answer=>answer.answer?.trim()||answer.hasAudio);
    renderSources(editing>=0?data.answers[editing].sourceIds||[]:data.questionSources||[]);
    buttons();
  }
  function renderSources(ids) {
    $("quizSourceLinks").replaceChildren();
    if(mode!=="interview"||!data?.followUp)return;
    for(const id of ids){
      const entry=window.UnscriptedDiary.entries().find(e=>e.id===id);if(!entry)continue;
      const link=document.createElement("button");link.type="button";link.className="source-link";
      link.textContent=new Date(entry.createdAt).toLocaleDateString()+" · "+entry.title;
      link.onclick=async()=>{if(busy||voice)return;await $("quizClose").onclick();window.UnscriptedDiary.openEntry(id);};
      $("quizSourceLinks").append(link);
    }
  }
  async function saveInterviewProgress(complete=false) {
    const id=await window.UnscriptedDiary.saveInterview({goal:data.goal,answers:data.answers,complete},data.entryId);
    if(id)data.entryId=id;save();
  }
  async function nextQuestion() {
    clarification?.reset(false);
    busy = true; tell("Thinking of your next question..."); buttons();
    try {
      let result;
      if(mode==="interview"){
        let sources=[],profile="";
        if(data.followUp){
          const recent=new Set(window.UnscriptedDiary.entries().filter(e=>e.kind!=="diaryChat"&&e.id!==data.entryId).slice(0,12).map(e=>e.id));
          sources=window.UnscriptedDiary.sources("recent plans intentions conversations "+(data.answers.at(-1)?.answer||"")).sources.filter(s=>recent.has(s.id)).slice(-10);
          profile=(localStorage.getItem("unscripted-personal-profile")||"").slice(0,6000);
        }
        result=await window.UnscriptedDiary.callAI("/interview",{mode:data.followUp?"follow-up":"curiosity",goal:data.goal,answers:data.answers,sources,profile,now:new Date().toISOString()});
      }else result = await window.UnscriptedDiary.callAI("/profile-quiz", {mode, action:"question", answers:data.answers});
      if(typeof result.question!=="string"||!result.question.trim())throw new Error("No question returned. Tap Refresh question to retry.");
      data.questionSources=mode==="interview"&&!data.followUp?[]:(result.sourceIds||[]);
      data.question = result.question; save(); tell(""); showQuestion();
    } catch (error) { tell(error.message, true); }
    finally {busy=false;clarification?.reset(!!data.question);buttons();}
  }
  async function buildContext() {
    busy=true; tell("Putting your answers together...");buttons();
    try {
      if(mode==="interview"){
        if(!data.answers.some(answer=>answer.answer?.trim()||answer.hasAudio)){data.complete=true;data.question="";localStorage.removeItem(modes.interview.key);tell("All questions skipped. No diary entry was created.");review();return;}
        data.complete=true;data.question="";await saveInterviewProgress(true);
        localStorage.removeItem(modes.interview.key);
        tell("Interview saved to your diary. Your answers are marked as an interview, with a summary on the way.");
        review();return;
      }
      const result=await window.UnscriptedDiary.callAI("/profile-quiz",{mode,action:"profile",answers:data.answers});
      if(typeof result.profile!=="string")throw new Error("AI did not return your profile. Try saving again.");
      localStorage.setItem(modes[mode].context,result.profile.slice(0,4000));
      data.complete=true;data.question="";save();tell("Saved. Future summaries and reflection questions will use this context.");
      review();
    } catch(error){tell("Your answers are saved, but the profile could not refresh: "+error.message,true);}
    finally{busy=false;buttons();}
  }
  function finishedInterview() {
    $("quizModal").hidden=true;$("interviewDoneModal").hidden=false;
    $("interviewDoneText").textContent=data.entryId?"Your recordings are saved. Your summary and detailed bullet points will appear in your diary.":"No answers were recorded.";
    $("interviewViewSummary").hidden=!data.entryId;
  }
  $("interviewDoneClose").onclick=()=>{$("interviewDoneModal").hidden=true;};
  $("interviewViewSummary").onclick=()=>{$("interviewDoneModal").hidden=true;window.UnscriptedDiary.openInterviewSummary(data.entryId);};
  function review() {
    if(mode==="interview"){finishedInterview();return;}
    clarification?.reset(false);
    $("quizAnswerArea").hidden=true;$("quizReview").hidden=false;$("quizQuestion").textContent="Your answers";
    $("quizProgress").textContent=data.answers.length+" answers";$("quizSourceLinks").replaceChildren();
    $("quizReview").replaceChildren();
    data.answers.forEach((answer,index)=>{
      const card=document.createElement("div");card.className="quiz-answer-card";
      const q=document.createElement("strong"),a=document.createElement("p"),edit=document.createElement("button");
      q.textContent=cleanInterviewQuestion(answer.question);a.textContent=answer.answer||"Skipped";
      edit.type="button";edit.className="text-action";edit.textContent="Edit answer";
      edit.onclick=()=>{editing=index;$("quizAnswer").value=answer.answer||"";tell("");showQuestion();};
      card.append(q,a,edit);$("quizReview").append(card);
    });
    const refresh=document.createElement("button");refresh.type="button";refresh.className="button-soft";refresh.textContent=mode==="interview"?(data.entryId?"Open saved interview":"Start another interview"):"Refresh personalised context";refresh.onclick=()=>{if(busy)return;if(mode==="interview"){ $("quizModal").hidden=true;if(data.entryId)window.UnscriptedDiary.openEntry(data.entryId);else $("interviewStartButton").onclick();}else buildContext();};$("quizReview").append(refresh);
  }
  async function open(which, options={}) {
    if(window.UnscriptedDiary.recording()){window.UnscriptedDiary.toast("Save or cancel your diary recording first.");return;}
    if(!window.UnscriptedDiary.activeAI()){window.UnscriptedDiary.toast("Connect AI or sign in to the private diary first.");return;}
    mode=which;data=which==="interview"&&options.fresh?{answers:[],question:"",complete:false,goal:options.goal,followUp:!!options.followUp,entryId:null,questionSources:[]}:load(which);editing=data.draft&&data.editing>=0&&data.editing<data.answers.length?data.editing:-1;epoch++;
    $("quizTitle").textContent=mode==="interview"&&data.followUp?"Follow up":modes[mode].title;$("quizModal").hidden=false;$("quizAnswer").value=data.draft||"";tell("");
    if(editing>=0){showQuestion();return;}
    if(data.complete&&data.draft){editing=-1;$("quizAnswer").value="";}
    if(data.complete){review();return;}
    showQuestion();
    if(data.answers.length>=6){await buildContext();return;}
    if(!data.question)await nextQuestion();
    else if(mode==="interview"&&data.currentAnswerId)await retryInterviewAnswer();
  }
  async function advance(skip=false) {
    if(busy||voice)return;
    if(!data.question&&editing<0){if(data.answers.length>=6)await buildContext();else await nextQuestion();return;}
    if(skip&&data.currentAnswerId){
      if(!await window.UnscriptedConfirm("Discard this recorded answer and skip the question?",{title:"Skip this answer?",confirmLabel:"Discard & skip",danger:true}))return;
      await window.UnscriptedDiary.discardPerspective(data.entryId,data.currentAnswerId);data.currentAnswerId=null;unsavedClip=null;$("quizAnswer").value="";
    }
    const answer=$("quizAnswer").value.trim();
    if(!skip&&!answer){tell("Type an answer, record one, or skip this question.");return;}
    busy=true;buttons();
    try {
      data.draft="";data.editing=-1;
      if(editing>=0){
        data.answers[editing]={...data.answers[editing],answer:answer.slice(0,mode==="interview"?700000:6000),skipped:!answer};editing=-1;save();await buildContext();return;
      }
      data.answers.push({id:data.currentAnswerId||answerUid(),hasAudio:!!data.currentAnswerId,createdAt:new Date().toISOString(),question:data.question,answer:skip?"":answer.slice(0,mode==="interview"?700000:6000),skipped:skip,sourceIds:data.questionSources||[]});
      data.currentAnswerId=null;data.question="";save();$("quizAnswer").value="";
      if(mode==="interview")await saveInterviewProgress(false);
      if(data.answers.length>=6)await buildContext();else await nextQuestion();
    }catch(error){tell("Your answer is kept in this quiz, but saving failed: "+error.message,true);}
    finally{busy=false;buttons();}
  }

  function startVoiceIndicator(recording) {
    const indicator=$("quizRecordingIndicator"),timer=$("quizRecordingTimer");
    indicator.hidden=false;timer.textContent="00:00";$("quizAudioCaptured").textContent="Listening...";
    const started=Date.now();
    recording.indicatorTimer=setInterval(()=>{
      const seconds=Math.floor((recording.kind==="interview"?(recording.total+(recording.recorder?.state==="recording"?Date.now()-recording.started:0)):Date.now()-started)/1000);
      timer.textContent=String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
    },250);
    try {
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)return;
      const context=new AudioContext(),source=context.createMediaStreamSource(recording.stream),analyser=context.createAnalyser();
      analyser.fftSize=64;source.connect(analyser);
      recording.audioContext=context;context.resume().catch(()=>{});
      const levels=new Uint8Array(analyser.frequencyBinCount),bars=$("quizVoiceMeter").querySelectorAll("i");
      function draw(){
        if(voice!==recording)return;
        analyser.getByteFrequencyData(levels);
        bars.forEach((bar,index)=>{const value=levels[Math.min(levels.length-1,index+2)]/255;bar.style.height=(4+value*28)+"px";});
        recording.meterFrame=requestAnimationFrame(draw);
      }
      draw();
    } catch (_) { /* Timer and captured-audio status remain available without Web Audio. */ }
  }
  function stopVoiceIndicator(recording) {
    clearInterval(recording.indicatorTimer);
    if(recording.meterFrame)cancelAnimationFrame(recording.meterFrame);
    recording.audioContext?.close().catch(()=>{});
    $("quizRecordingIndicator").hidden=true;
  }


  function showAnswerSummary(result) {
    $("quizAnswer").value=result.answer;
    data.draft=result.answer;save();
    $("quizAnswerSummary").replaceChildren(window.UnscriptedDiary.summarySwitch("interview-draft-"+data.currentAnswerId,result.summary,result.bulletPoints,()=>retryInterviewAnswer()));
  }
  async function retryInterviewAnswer(){
    if(busy||voice)return;busy=true;buttons();tell("Transcribing and summarising your answer…");
    try{
      if(unsavedClip){await saveInterviewAudio(unsavedClip.blob,unsavedClip.duration);unsavedClip=null;}
      const result=await window.UnscriptedDiary.transcribeInterviewAnswer(data.entryId,data.currentAnswerId);showAnswerSummary(result);tell("Answer saved. Tap Next question when ready.");$("quizRetryAnswer").hidden=true;
    }catch(e){tell("Your audio is saved in the interview. "+e.message,true);$("quizRetryAnswer").hidden=false;}
    finally{busy=false;buttons();}
  }
  async function saveInterviewAudio(blob,duration){
    const result=await window.UnscriptedDiary.saveInterviewClip(data.entryId,data.currentAnswerId,{goal:data.goal,question:data.question,sourceIds:data.questionSources,typedAnswer:$("quizAnswer").value.trim()},blob,duration);
    data.entryId=result.entryId;data.currentAnswerId=result.answerId;save();
  }
  function releaseInterviewVoice(v){clearInterval(v.indicatorTimer);clearTimeout(v.rotation);stopVoiceIndicator(v);v.stream.getTracks().forEach(t=>t.stop());if(voice===v)voice=null;$("quizVoice").textContent="🎙 Record your answer";$("quizPause").hidden=true;}
  async function stopInterviewVoice(){
    const v=voice;if(!v)return;v.stopping=true;clearTimeout(v.rotation);
    if(v.recorder?.state==="recording")v.recorder.stop();
    else if(!v.saving){releaseInterviewVoice(v);await retryInterviewAnswer();v.resolve();}
    return v.finished;
  }
  function interviewClip(v){
    if(v.paused||v.stopping)return;
    const mime=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(x=>MediaRecorder.isTypeSupported(x));
    const recorder=new MediaRecorder(v.stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:48000}),parts=[];v.recorder=recorder;
    recorder.ondataavailable=e=>{if(e.data?.size)parts.push(e.data)};
    recorder.onstop=async()=>{
      clearTimeout(v.rotation);const duration=Math.max(1,Date.now()-v.started);v.total+=duration;v.saving=true;buttons();
      try{const blob=new Blob(parts,{type:recorder.mimeType||mime||"audio/webm"});if(blob.size){try{await saveInterviewAudio(blob,duration)}catch(e){unsavedClip={blob,duration};throw e;}}$("quizAudioCaptured").textContent="Audio saved";}
      catch(e){v.stopping=true;tell("Could not save this clip: "+e.message,true);$("quizRetryAnswer").hidden=false;}
      finally{v.saving=false;if(v.stopping){releaseInterviewVoice(v);if(!unsavedClip)await retryInterviewAnswer();buttons();v.resolve();}
        else if(!v.paused)interviewClip(v);else buttons();}
    };
    recorder.onerror=()=>{v.stopping=true;tell("Recording stopped. Earlier clips are saved.",true);if(recorder.state==="recording")recorder.stop();else{releaseInterviewVoice(v);v.resolve();buttons();}};
    recorder.start();v.started=Date.now();v.rotation=setTimeout(()=>{if(recorder.state==="recording")recorder.stop()},120000);
  }
  async function recordInterviewVoice(){
    if(unsavedClip)return retryInterviewAnswer();
    if(voice)return stopInterviewVoice();
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){tell("Microphone unavailable. You can type instead.",true);return;}
    const token=epoch;busy=true;buttons();let stream;
    try{stream=await navigator.mediaDevices.getUserMedia({audio:true});if(token!==epoch){stream.getTracks().forEach(t=>t.stop());return;}
      const v={kind:"interview",stream,recorder:null,total:0,started:0,paused:false,stopping:false,saving:false};v.finished=new Promise(resolve=>v.resolve=resolve);voice=v;
      interviewClip(v);startVoiceIndicator(v);$("quizVoice").textContent="■ Stop & summarise";tell("Recording your answer…");
    }catch(e){stream?.getTracks().forEach(t=>t.stop());voice=null;tell(e.message,true)}
    finally{busy=false;buttons();}
  }
  $("quizPause").onclick=()=>{const v=voice;if(!v||v.kind!=="interview"||v.saving)return;
    if(!v.paused){v.paused=true;clearTimeout(v.rotation);if(v.recorder.state==="recording")v.recorder.stop();$("quizPause").textContent="Resume";}
    else{v.paused=false;interviewClip(v);$("quizPause").textContent="Pause";}
  };
  $("quizRetryAnswer").onclick=retryInterviewAnswer;
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&voice?.kind==="interview"&&!voice.paused)$("quizPause").onclick();});
  async function recordVoice() {
    if(busy)return;
    if(mode==="interview")return recordInterviewVoice();
    if(voice){voice.recorder.stop();return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){tell("Voice answers need microphone support. You can type instead.",true);return;}
    const requestEpoch=epoch;busy=true;buttons();
    let stream;
    try {
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(requestEpoch!==epoch){stream.getTracks().forEach(t=>t.stop());return;}
      const mime=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(x=>MediaRecorder.isTypeSupported(x));
      const recorder=new MediaRecorder(stream,mime?{mimeType:mime,audioBitsPerSecond:48000}:{});
      const parts=[];let size=0;
      const recording={recorder,stream,timer:null,cancelled:false};voice=recording;
      recorder.ondataavailable=e=>{if(e.data?.size){parts.push(e.data);size+=e.data.size;$("quizAudioCaptured").textContent="Audio captured";if(size>24*1024*1024&&recorder.state==="recording")recorder.stop();}};
      recorder.onerror=()=>{stopVoiceIndicator(recording);recording.cancelled=true;tell("Voice recording failed. Please type or try again.",true);try{recorder.stop()}catch{};stream.getTracks().forEach(t=>t.stop());};
      recorder.onstop=async()=>{
        stopVoiceIndicator(recording);clearTimeout(recording.timer);stream.getTracks().forEach(t=>t.stop());voice=null;busy=true;$("quizVoice").textContent="Record answer";buttons();
        try {
          if(recording.cancelled)return;
          if(size>24*1024*1024)throw new Error("That answer is too large to transcribe. Try a shorter recording.");
          const blob=new Blob(parts,{type:recorder.mimeType||mime||"audio/webm"});
          if(!blob.size)throw new Error("No audio captured.");
          tell("Transcribing your answer...");
          const form=new FormData();form.append("file",blob,blob.type.includes("mp4")?"answer.m4a":"answer.webm");
          const result=await window.UnscriptedDiary.callAI("/transcribe",form,true);
          if(requestEpoch!==epoch)return;
          $("quizAnswer").value=[$("quizAnswer").value.trim(),result.text||""].filter(Boolean).join("\n");
          tell("Check or edit the transcript, then tap Next. The audio itself is not added to your diary.");
        } catch(error){tell(error.message,true);}
        finally{busy=false;buttons();}
      };
      recorder.start(1000);startVoiceIndicator(recording);recording.timer=setTimeout(()=>{if(recorder.state==="recording")recorder.stop();},300000);
      $("quizVoice").textContent="Stop & transcribe";tell("Recording your answer. Tap Stop & transcribe when finished.");
    } catch(error){if(voice)stopVoiceIndicator(voice);stream?.getTracks().forEach(t=>t.stop());voice=null;tell("Could not record: "+error.message,true);}
    finally{busy=false;buttons();}
  }
  $("quizRefresh").onclick=async()=>{
    if(busy||voice||editing>=0)return;
    if($("quizAnswer").value.trim()&&!await window.UnscriptedConfirm("Refresh the question? Your unfinished answer will stay below.",{title:"Refresh question?",confirmLabel:"Refresh question"}))return;
    data.draft=$("quizAnswer").value;data.editing=editing;save();
    await nextQuestion();
  };
  $("quizNext").onclick=()=>advance(false);$("quizSkip").onclick=()=>advance(true);$("quizVoice").onclick=recordVoice;
  $("quizClose").onclick=async()=>{
    if(busy)return;
    if(mode==="interview"&&voice){await stopInterviewVoice();}
    if(voice&&!await window.UnscriptedConfirm("Saved quiz answers will stay, but this unfinished voice answer will be discarded.",{title:"Close this voice answer?",confirmLabel:"Discard voice answer",danger:true}))return;
    epoch++;clarification?.reset(false);
    if(voice){voice.cancelled=true;voice.recorder.stop();}
    if(mode&&data&&$("quizAnswer").value.trim()){
      // Keep an unfinished typed answer for when the quiz is resumed.
      data.draft=$("quizAnswer").value.slice(0,mode==="interview"?700000:6000);data.editing=editing;save();
    }
    $("quizModal").hidden=true;
  };
  $("quizFinishEarly").onclick=async()=>{
    if(busy||voice)return;
    const answer=$("quizAnswer").value.trim();
    if((answer||data.currentAnswerId)&&data.question){
      data.answers.push({id:data.currentAnswerId||answerUid(),hasAudio:!!data.currentAnswerId,createdAt:new Date().toISOString(),question:data.question,answer:answer.slice(0,mode==="interview"?700000:6000),skipped:false,sourceIds:data.questionSources||[]});
      data.currentAnswerId=null;$("quizAnswer").value="";data.draft="";save();
    }
    await buildContext();
  };
  $("interviewStartButton").onclick=()=>{
    setupFollowUp=false;
    if(window.UnscriptedDiary.recording()){window.UnscriptedDiary.toast("Finish your recording first.");return;}
    if(!window.UnscriptedDiary.activeAI()){window.UnscriptedDiary.toast("Connect AI or sign in first.");return;}
    const draft=load("interview");$("interviewResume").hidden=!(draft.question||draft.answers.length)&&!draft.entryId;
    $("interviewSetupModal").hidden=false;
  };
  $("interviewSetupClose").onclick=()=>{$("interviewSetupModal").hidden=true;};
  $("interviewFocus").onchange=()=>{$("interviewCustomArea").hidden=$("interviewFocus").value!=="custom";};
  $("interviewResume").onclick=()=>{$("interviewSetupModal").hidden=true;return open("interview");};
  $("interviewBegin").onclick=async()=>{
    const goal=$("interviewFocus").value==="custom"?$("interviewCustomGoal").value.trim():($("interviewFocus").value||"Surprise me");
    if(!goal){window.UnscriptedDiary.toast("Add a goal, or choose Surprise me.");return;}
    const draft=load("interview");
    if((draft.answers.length||draft.question)&&!await window.UnscriptedConfirm("A new interview will replace the unfinished quiz. Answers already saved as a diary entry will stay.",{title:"Start a new interview?",confirmLabel:"Start new"}))return;
    $("interviewSetupModal").hidden=true;await open("interview",{fresh:true,goal:setupFollowUp?"Follow up on recent plans":goal.slice(0,200),followUp:setupFollowUp});
  };
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("interviewSetupModal").hidden)$("interviewSetupModal").hidden=true;});
  window.addEventListener("beforeunload",e=>{if(voice||unsavedClip){e.preventDefault();e.returnValue="";}});
  window.UnscriptedQuiz={recording:()=>!!voice,startFollowUp:async()=>{
    $("interviewStartButton").onclick();if($("interviewSetupModal").hidden)return;
    setupFollowUp=true;return $("interviewBegin").onclick();
  }};
  window.addEventListener("unscripted-settings",renderCards);
  renderCards();
})();
