/* AI-led profile interviews. Voice answers are transcribed, then editable before saving. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const modes = { know: { title: "Get to know me", key: "unscripted-know-quiz", context: "unscripted-personal-profile", target: "knowQuiz" }, reflection: { title: "Reflection context", key: "unscripted-reflection-quiz", context: "unscripted-reflection-profile", target: "reflectionQuiz" }, interview: { title:"Interview me", key:"unscripted-interview-draft" } };
  let mode = null, data = null, editing = -1, busy = false, voice = null, epoch = 0;
  function load(which) { try { const saved = JSON.parse(localStorage.getItem(modes[which].key) || "{}"); return { answers: Array.isArray(saved.answers) ? saved.answers.slice(0,6) : [], question: typeof saved.question === "string" ? saved.question : "", complete: !!saved.complete, draft:typeof saved.draft==="string"?saved.draft:"", editing:Number.isInteger(saved.editing)?saved.editing:-1, goal:typeof saved.goal==="string"?saved.goal:"A mix of questions", entryId:typeof saved.entryId==="string"?saved.entryId:null, questionSources:Array.isArray(saved.questionSources)?saved.questionSources:[] }; } catch (_) { return { answers: [], question: "", complete: false }; } }
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
    $("quizNext").disabled = busy || !!voice;
    $("quizSkip").disabled = busy || !!voice;
    $("quizVoice").disabled = busy;
    $("quizAnswer").disabled = busy || !!voice;
    $("quizClose").disabled = busy; $("quizFinishEarly").disabled=busy||!!voice;
  }
  function showQuestion() {
    $("quizReview").hidden = true; $("quizAnswerArea").hidden = false;
    $("quizProgress").textContent = editing >= 0 ? "Edit answer " + (editing + 1) : "Question " + Math.min(data.answers.length+1,6) + " of 6";
    $("quizQuestion").textContent = editing >= 0 ? data.answers[editing].question : data.question;
    $("quizNext").textContent = editing >= 0 ? "Save answer" : data.answers.length === 5 ? "Finish quiz" : "Next question";
    $("quizSkip").hidden = editing >= 0; $("quizFinishEarly").hidden=mode!=="interview"||editing>=0||!data.answers.some(answer=>answer.answer?.trim());
    renderSources(editing>=0?data.answers[editing].sourceIds||[]:data.questionSources||[]);
    buttons();
  }
  function renderSources(ids) {
    $("quizSourceLinks").replaceChildren();
    if(mode!=="interview")return;
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
    busy = true; tell("Thinking of your next question..."); buttons();
    try {
      let result;
      if(mode==="interview"){
        const selected=window.UnscriptedDiary.sources(data.goal+" "+(data.answers.at(-1)?.answer||"")).sources.filter(source=>source.id!==data.entryId);
        const sources=selected.length<=10?selected:Array.from({length:10},(_,index)=>selected[Math.floor(index*(selected.length-1)/9)]);
        const profile=(localStorage.getItem("unscripted-personal-profile")||"")+"\n"+(localStorage.getItem("unscripted-reflection-profile")||"");
        result=await window.UnscriptedDiary.callAI("/interview",{goal:data.goal,answers:data.answers,sources,profile:profile.slice(0,6000),now:new Date().toISOString()});
      }else result = await window.UnscriptedDiary.callAI("/profile-quiz", {mode, action:"question", answers:data.answers});
      data.questionSources=result.sourceIds||[];
      data.question = result.question; save(); tell(""); showQuestion();
    } catch (error) { tell(error.message, true); }
    finally {busy=false;buttons();}
  }
  async function buildContext() {
    busy=true; tell("Putting your answers together...");buttons();
    try {
      if(mode==="interview"){
        if(!data.answers.some(answer=>answer.answer?.trim())){data.complete=true;data.question="";localStorage.removeItem(modes.interview.key);tell("All questions skipped. No diary entry was created.");review();return;}
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
  function review() {
    $("quizAnswerArea").hidden=true;$("quizReview").hidden=false;$("quizQuestion").textContent="Your answers";
    $("quizProgress").textContent=data.answers.length+" answers";$("quizSourceLinks").replaceChildren();
    $("quizReview").replaceChildren();
    data.answers.forEach((answer,index)=>{
      const card=document.createElement("div");card.className="quiz-answer-card";
      const q=document.createElement("strong"),a=document.createElement("p"),edit=document.createElement("button");
      q.textContent=answer.question;a.textContent=answer.answer||"Skipped";
      edit.type="button";edit.className="text-action";edit.textContent="Edit answer";
      edit.onclick=()=>{editing=index;$("quizAnswer").value=answer.answer||"";tell("");showQuestion();};
      card.append(q,a,edit);$("quizReview").append(card);
    });
    const refresh=document.createElement("button");refresh.type="button";refresh.className="button-soft";refresh.textContent=mode==="interview"?(data.entryId?"Open saved interview":"Start another interview"):"Refresh personalised context";refresh.onclick=()=>{if(busy)return;if(mode==="interview"){ $("quizModal").hidden=true;if(data.entryId)window.UnscriptedDiary.openEntry(data.entryId);else $("interviewStartButton").onclick();}else buildContext();};$("quizReview").append(refresh);
  }
  async function open(which, options={}) {
    if(window.UnscriptedDiary.recording()){window.UnscriptedDiary.toast("Save or cancel your diary recording first.");return;}
    if(!window.UnscriptedDiary.activeAI()){window.UnscriptedDiary.toast("Connect AI or sign in to the private diary first.");return;}
    mode=which;data=which==="interview"&&options.fresh?{answers:[],question:"",complete:false,goal:options.goal,entryId:null,questionSources:[]}:load(which);editing=data.draft&&data.editing>=0&&data.editing<data.answers.length?data.editing:-1;epoch++;
    $("quizTitle").textContent=modes[mode].title;$("quizModal").hidden=false;$("quizAnswer").value=data.draft||"";tell("");
    if(editing>=0){showQuestion();return;}
    if(data.complete&&data.draft){editing=-1;$("quizAnswer").value="";}
    if(data.complete){review();return;}
    showQuestion();
    if(data.answers.length>=6){await buildContext();return;}
    if(!data.question)await nextQuestion();
  }
  async function advance(skip=false) {
    if(busy||voice)return;
    if(!data.question&&editing<0){if(data.answers.length>=6)await buildContext();else await nextQuestion();return;}
    const answer=$("quizAnswer").value.trim();
    if(!skip&&!answer){tell("Type an answer, record one, or skip this question.");return;}
    busy=true;buttons();
    try {
      data.draft="";data.editing=-1;
      if(editing>=0){
        data.answers[editing]={...data.answers[editing],answer:answer.slice(0,6000),skipped:!answer};editing=-1;save();await buildContext();return;
      }
      data.answers.push({id:crypto.randomUUID(),createdAt:new Date().toISOString(),question:data.question,answer:skip?"":answer.slice(0,6000),skipped:skip,sourceIds:data.questionSources||[]});
      data.question="";save();$("quizAnswer").value="";
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
      const seconds=Math.floor((Date.now()-started)/1000);
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
        if(voice!==recording||recording.recorder.state!=="recording")return;
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

  async function recordVoice() {
    if(busy)return;
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
  $("quizNext").onclick=()=>advance(false);$("quizSkip").onclick=()=>advance(true);$("quizVoice").onclick=recordVoice;
  $("quizClose").onclick=async()=>{
    if(busy)return;
    if(voice&&!await window.UnscriptedConfirm("Saved quiz answers will stay, but this unfinished voice answer will be discarded.",{title:"Close this voice answer?",confirmLabel:"Discard voice answer",danger:true}))return;
    epoch++;
    if(voice){voice.cancelled=true;voice.recorder.stop();}
    if(mode&&data&&$("quizAnswer").value.trim()){
      // Keep an unfinished typed answer for when the quiz is resumed.
      data.draft=$("quizAnswer").value.slice(0,6000);data.editing=editing;save();
    }
    $("quizModal").hidden=true;
  };
  $("quizFinishEarly").onclick=async()=>{
    if(busy||voice)return;
    const answer=$("quizAnswer").value.trim();
    if(answer&&data.question){
      data.answers.push({id:crypto.randomUUID(),createdAt:new Date().toISOString(),question:data.question,answer:answer.slice(0,6000),skipped:false,sourceIds:data.questionSources||[]});
      $("quizAnswer").value="";data.draft="";save();
    }
    await buildContext();
  };
  $("interviewStartButton").onclick=()=>{
    if(window.UnscriptedDiary.recording()){window.UnscriptedDiary.toast("Finish your recording first.");return;}
    if(!window.UnscriptedDiary.activeAI()){window.UnscriptedDiary.toast("Connect AI or sign in first.");return;}
    const draft=load("interview");$("interviewResume").hidden=!(draft.question||draft.answers.length)&&!draft.entryId;
    $("interviewSetupModal").hidden=false;
  };
  $("interviewSetupClose").onclick=()=>{$("interviewSetupModal").hidden=true;};
  $("interviewFocus").onchange=()=>{$("interviewCustomArea").hidden=$("interviewFocus").value!=="custom";};
  $("interviewResume").onclick=()=>{$("interviewSetupModal").hidden=true;return open("interview");};
  $("interviewBegin").onclick=async()=>{
    const goal=$("interviewFocus").value==="custom"?$("interviewCustomGoal").value.trim():$("interviewFocus").value;
    if(!goal){window.UnscriptedDiary.toast("Add a goal, or choose Surprise me.");return;}
    const draft=load("interview");
    if((draft.answers.length||draft.question)&&!await window.UnscriptedConfirm("A new interview will replace the unfinished quiz. Answers already saved as a diary entry will stay.",{title:"Start a new interview?",confirmLabel:"Start new"}))return;
    $("interviewSetupModal").hidden=true;await open("interview",{fresh:true,goal:goal.slice(0,200)});
  };
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("interviewSetupModal").hidden)$("interviewSetupModal").hidden=true;});
  window.UnscriptedQuiz={recording:()=>!!voice};
  window.addEventListener("unscripted-settings",renderCards);
  renderCards();
})();
