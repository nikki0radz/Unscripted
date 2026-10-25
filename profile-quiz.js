/* AI-led profile interviews. Voice answers are transcribed, then editable before saving. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const answerUid=()=>crypto.randomUUID?crypto.randomUUID():"answer-"+Date.now()+"-"+Math.random().toString(36).slice(2);
  const modes = { know: { title: "Get to know me", key: "unscripted-know-quiz", context: "unscripted-personal-profile", target: "knowQuiz" }, reflection: { title: "Reflection context", key: "unscripted-reflection-quiz", context: "unscripted-reflection-profile", target: "reflectionQuiz" }, interview: { title:"Interview me", key:"unscripted-interview-draft" } };
  let mode = null, data = null, editing = -1, busy = false, voice = null, epoch = 0, unsavedClip = null, setupFollowUp = false;
  const clarification=window.UnscriptedClarify?.create({buttonId:"quizExplain",panelId:"quizExplanation",question:()=>$("quizQuestion").textContent,context:()=>mode==="interview"?"Interview focus: "+(data?.goal||""):"Getting to know the diary owner"});
  function load(which) { try { const saved = JSON.parse(localStorage.getItem(modes[which].key) || "{}"); return { answers: Array.isArray(saved.answers) ? (which==="interview"?saved.answers:saved.answers.slice(0,6)) : [], question: typeof saved.question === "string" ? saved.question : "", complete: !!saved.complete, draft:typeof saved.draft==="string"?saved.draft:"", editing:Number.isInteger(saved.editing)?saved.editing:-1, goal:typeof saved.goal==="string"?saved.goal:"A mix of questions", entryId:typeof saved.entryId==="string"?saved.entryId:null, questionSources:Array.isArray(saved.questionSources)?saved.questionSources:[], currentAnswerId:saved.currentAnswerId||null, followUp:!!saved.followUp, awaitingChoice:!!saved.awaitingChoice, continuation:saved.continuation||"fresh" }; } catch (_) { return { answers: [], question: "", complete: false }; } }
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
    $("quizRecorderControls").hidden=$("quizAnswerArea").hidden;
    $("quizRecorderControls").classList.toggle("is-recording",!!voice);
    for(const id of ["interviewNewQuestion","interviewFollowQuestion","interviewFinish"])$(id).disabled=busy||!!voice||!!unsavedClip;
    $("quizNext").disabled = busy || !!voice || !!unsavedClip;
    $("quizSkip").disabled = busy || !!voice;
    $("quizRefresh").disabled = busy || !!voice || !!data?.currentAnswerId;
    $("quizVoice").disabled = busy || !!voice?.saving;
    $("quizPause").hidden = !voice;
    $("quizAnswer").disabled = busy || !!voice;
    $("quizClose").disabled = busy; $("quizFinishEarly").disabled=busy||!!voice;
  }
function cleanInterviewQuestion(text) {
  const uuid="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  return String(text||"").replace(/(^|\n)([AB])\s*[.):：-]\s*(?:\2\s*[.):：-]\s*)+/gi,"$1$2. ").replace(new RegExp("\\s*[([]\\s*(?:sources?\\s*:?\\s*)?"+uuid+"\\s*[)\\]]","gi"),"").replace(new RegExp("\\b(?:source\\s*:?\\s*)?"+uuid+"\\b","gi"),"").replace(/\s+([,.;?!])/g,"$1").replace(/ {2,}/g," ").trim();
}
  function showQuestion() {
    $("interviewNextChoices").hidden=true;
    $("quizAnswerSummary").replaceChildren();
    showAnswerAudio(editing>=0?data.answers[editing]?.id:data.currentAnswerId);
    $("quizReview").hidden = true; $("quizAnswerArea").hidden = false;$("quizRecorderControls").hidden=false;
    $("quizProgress").textContent = editing >= 0 ? "Edit answer " + (editing + 1) : mode==="interview"?"One question at a time":"Question " + Math.min(data.answers.length+1,6) + " of 6";
    $("quizQuestion").textContent = cleanInterviewQuestion(editing >= 0 ? data.answers[editing].question : data.question);
    clarification?.reset(!!$("quizQuestion").textContent);
    $("quizNext").textContent = editing >= 0 || mode==="interview" ? "Save answer" : data.answers.length === 5 ? "Finish quiz" : "Next question";
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
    const id=await window.UnscriptedDiary.saveInterview({goal:mode==="interview"?data.goal:modes[mode].title,answers:data.answers,complete,followUp:!!data.followUp},data.entryId);
    if(id)data.entryId=id;save();
  }
  function showInterviewChoices(){
    $("quizAnswerArea").hidden=true;$("quizRecorderControls").hidden=true;$("quizReview").hidden=true;$("interviewNextChoices").hidden=false;
    $("quizProgress").textContent="Answer saved";$("quizQuestion").textContent="Where shall we go next?";
    $("quizSourceLinks").replaceChildren();clarification?.reset(false);tell("");buttons();
  }
  async function continueInterview(continuation){
    if(busy||voice||unsavedClip)return;data.awaitingChoice=false;data.continuation=continuation;data.complete=false;save();showQuestion();await nextQuestion();
  }
  $("interviewNewQuestion").onclick=()=>continueInterview("fresh");
  $("interviewFollowQuestion").onclick=()=>continueInterview("follow-up");
  $("interviewFinish").onclick=()=>{if(!busy&&!voice&&!unsavedClip)return buildContext();};
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
        const history=window.UnscriptedInterviewHistory;
        const excluded=history?.excluded(window.UnscriptedDiary.entries(),data)||[];
        const angles=["honesty versus loyalty","fairness versus helping someone in need","privacy versus public benefit","promises versus changed circumstances","personal responsibility versus collective responsibility","protecting nature versus livelihoods","tradition versus individual freedom","forgiveness versus accountability"];
        for(let attempt=0;attempt<3;attempt++){
          const seed=answerUid();const random=new Uint32Array(1);crypto.getRandomValues(random);
          const goal=(data.goal||"Surprise me")+((data.continuation!=="follow-up"&&/moral|ethical/i.test(data.goal))?" — explore "+angles[random[0]%angles.length]+" in an original hypothetical scenario; avoid the standard trolley problem opener":"");
          // Recent seen prompts also reach older backends as skipped context, never as beliefs.
          const recent=excluded.slice(-Math.max(0,12-data.answers.length)).map(question=>({question,answer:"",skipped:true}));
          result=await window.UnscriptedDiary.callAI("/interview",{mode:data.followUp?"follow-up":"curiosity",goal,answers:[...recent,...data.answers].slice(-12),excludedQuestions:excluded.slice(-200),variationSeed:seed,continuation:data.continuation||"fresh",sources,profile,now:new Date().toISOString()});
          if(!result?.question||!history?.repeated(result.question,excluded))break;
          result=null;
        }
        if(!result)throw Error("The AI kept repeating an earlier question. Tap Refresh question to try a different one.");
        history?.remember(result.question);
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
      if(data.entryId)await saveInterviewProgress(true);
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
    $("quizAnswerArea").hidden=true;$("quizRecorderControls").hidden=true;$("quizReview").hidden=false;$("quizQuestion").textContent="Your answers";
    $("quizProgress").textContent=data.answers.length+" answers";$("quizSourceLinks").replaceChildren();
    $("quizReview").replaceChildren();
    data.answers.forEach((answer,index)=>{
      const card=document.createElement("div");card.className="quiz-answer-card";
      const q=document.createElement("strong"),a=document.createElement("p"),edit=document.createElement("button");
      q.textContent=cleanInterviewQuestion(answer.question);a.textContent=answer.answer||"Skipped";
      edit.type="button";edit.className="text-action";edit.textContent="Edit answer";
      edit.onclick=()=>{editing=index;$("quizAnswer").value=answer.answer||"";tell("");showQuestion();};
      card.append(q,a,edit);
      const savedPart=window.UnscriptedDiary.entries().find(e=>e.id===data.entryId)?.parts?.find(p=>p.id===answer.id);
      if(savedPart?.clips?.length&&window.UnscriptedRecordingPlayer)card.append(window.UnscriptedRecordingPlayer.create(savedPart.clips,window.UnscriptedDiary.audio,"saved answer"));
      $("quizReview").append(card);
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
    if(mode==="interview"&&data.awaitingChoice){showInterviewChoices();return;}
    if(mode!=="interview"&&data.answers.length>=6){await buildContext();return;}
    if(!data.question)await nextQuestion();
    else if(data.currentAnswerId)await retryInterviewAnswer();
  }
  async function advance(skip=false) {
    if(busy||voice)return;
    if(!data.question&&editing<0){if(mode==="interview"&&data.awaitingChoice)showInterviewChoices();else if(mode!=="interview"&&data.answers.length>=6)await buildContext();else await nextQuestion();return;}
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
      if(mode==="interview")window.UnscriptedInterviewHistory?.remember(data.question,skip?"skipped":"answered");
      data.answers.push({id:data.currentAnswerId||answerUid(),hasAudio:!!data.currentAnswerId,createdAt:new Date().toISOString(),question:data.question,answer:skip?"":answer.slice(0,mode==="interview"?700000:6000),skipped:skip,sourceIds:data.questionSources||[]});
      data.currentAnswerId=null;data.question="";save();$("quizAnswer").value="";
      if(mode==="interview"){
        data.awaitingChoice=!skip;data.continuation="fresh";save();await saveInterviewProgress(false);
        if(skip)await nextQuestion();else showInterviewChoices();
      }else {if(data.entryId)await saveInterviewProgress(false);if(data.answers.length>=6)await buildContext();else await nextQuestion();}
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


  let answerPlayer=null;
  function showAnswerAudio(answerId=data?.currentAnswerId){
    answerPlayer?.dispose();answerPlayer?.remove();answerPlayer=null;
    const entry=window.UnscriptedDiary.entries().find(e=>e.id===data?.entryId);
    const part=entry?.parts?.find(p=>p.id===answerId);
    if(!part?.clips?.length||!window.UnscriptedRecordingPlayer)return;
    answerPlayer=window.UnscriptedRecordingPlayer.create(part.clips,window.UnscriptedDiary.audio,"your saved answer");
    $("quizAnswerSummary").before(answerPlayer);
  }
  function showAnswerSummary(result) {
    $("quizAnswer").value=result.answer;
    data.draft=result.answer;save();showAnswerAudio();
    $("quizAnswerSummary").replaceChildren(window.UnscriptedDiary.summarySwitch("interview-draft-"+data.currentAnswerId,result.summary,result.bulletPoints,()=>retryInterviewAnswer()));
  }
  async function retryInterviewAnswer(){
    if(busy||voice)return;busy=true;buttons();tell("Transcribing and summarising your answer…");
    try{
      if(unsavedClip){await saveInterviewAudio(unsavedClip.blob,unsavedClip.duration);unsavedClip=null;}
      const result=await window.UnscriptedDiary.transcribeInterviewAnswer(data.entryId,data.currentAnswerId);showAnswerSummary(result);tell("Answer saved. Tap Next question when ready.");$("quizRetryAnswer").hidden=true;
    }catch(e){tell("Your original audio is saved. "+e.message,true);$("quizRetryAnswer").hidden=false;}
    finally{busy=false;buttons();}
  }
  async function saveInterviewAudio(blob,duration){
    const result=await window.UnscriptedDiary.saveInterviewClip(data.entryId,(editing>=0?data.answers[editing].id:data.currentAnswerId),{goal:mode==="interview"?data.goal:modes[mode].title,question:editing>=0?data.answers[editing].question:data.question,sourceIds:data.questionSources,typedAnswer:$("quizAnswer").value.trim()},blob,duration);
    data.entryId=result.entryId;data.currentAnswerId=result.answerId;save();
  }
  function setRecordLabel(recording){
    const icon=document.createElement("span"),label=document.createElement("span");
    icon.className="quiz-record-symbol";icon.textContent=recording?"■":"🎙";
    label.className="quiz-record-label";label.textContent=recording?"Stop & summarise":"Record your answer";
    $("quizVoice").replaceChildren(icon,label);
  }
  function releaseInterviewVoice(v){clearInterval(v.indicatorTimer);clearTimeout(v.rotation);stopVoiceIndicator(v);v.stream.getTracks().forEach(t=>t.stop());if(voice===v)voice=null;setRecordLabel(false);$("quizPause").hidden=true;}
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
      interviewClip(v);startVoiceIndicator(v);setRecordLabel(true);tell("Recording your answer…");
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
    return recordInterviewVoice();
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
    if(voice?.kind==="interview"){await stopInterviewVoice();}
    if(voice&&!await window.UnscriptedConfirm("Saved quiz answers will stay, but this unfinished voice answer will be discarded.",{title:"Close this voice answer?",confirmLabel:"Discard voice answer",danger:true}))return;
    answerPlayer?.pause();
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
    const draft=load("interview");$("interviewResume").hidden=true;
    $("interviewSetupModal").hidden=false;
  };
  $("interviewSetupClose").onclick=()=>{$("interviewSetupModal").hidden=true;};
  $("interviewFocus").onchange=()=>{$("interviewCustomArea").hidden=$("interviewFocus").value!=="custom";};
  $("interviewResume").onclick=()=>{$("interviewSetupModal").hidden=true;return open("interview");};
  $("interviewBegin").onclick=async()=>{
    const goal=$("interviewFocus").value==="custom"?$("interviewCustomGoal").value.trim():($("interviewFocus").value||"Surprise me");
    if(!goal){window.UnscriptedDiary.toast("Add a goal, or choose Surprise me.");return;}
    const draft=load("interview");

    window.UnscriptedInterviewHistory?.excluded(window.UnscriptedDiary.entries(),draft);
    $("interviewSetupModal").hidden=true;await open("interview",{fresh:true,goal:setupFollowUp?"Follow up on recent plans":goal.slice(0,200),followUp:setupFollowUp});
  };
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("interviewSetupModal").hidden)$("interviewSetupModal").hidden=true;});
  window.addEventListener("beforeunload",e=>{if(voice||unsavedClip){e.preventDefault();e.returnValue="";}});
  async function continueSaved(entryId){
    const entry=window.UnscriptedDiary.entries().find(e=>e.id===entryId);if(!entry)return;
    const answers=(entry.parts||[]).filter(p=>p.interviewQuestion&&!p.skipped&&!p.interviewPending).map(p=>({id:p.id,question:p.question,answer:p.answer||'',hasAudio:!!p.clips?.length,createdAt:p.createdAt,skipped:false,sourceIds:p.sourceIds||[]}));
    const pending=(entry.parts||[]).find(p=>p.interviewQuestion&&p.interviewPending);
    const resumed={answers,question:pending?.question||'',draft:pending?.answer||'',currentAnswerId:pending?.id||null,entryId,goal:entry.interview?.goal||'Surprise me',followUp:!!entry.interview?.followUp,complete:false,awaitingChoice:!pending,continuation:'fresh'};
    localStorage.setItem(modes.interview.key,JSON.stringify(resumed));await open('interview');
  }
  window.UnscriptedQuiz={continueSaved,recording:()=>!!voice,startFollowUp:async()=>{
    $("interviewStartButton").onclick();if($("interviewSetupModal").hidden)return;
    setupFollowUp=true;return $("interviewBegin").onclick();
  }};
  window.addEventListener("unscripted-settings",renderCards);
  renderCards();
})();
