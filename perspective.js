/* Long reflection answers use independently playable, progressively saved clips. */
(() => {
  const $=id=>document.getElementById(id),D=()=>window.UnscriptedDiary;
  let draft=null,voice=null,busy=false,saving=false,epoch=0,returnFocus=null;
  const CLIP_MS=120000;
  const clarification=window.UnscriptedClarify?.create({buttonId:"perspectiveExplain",panelId:"perspectiveExplanation",question:()=>draft?.question||"",context:()=>{const entry=D().entries().find(e=>e.id===draft?.entryId);return entry?"Entry: "+entry.title+"\nSummary: "+(entry.summary||""):"";}});
  function tell(text,error=false){$('perspectiveStatus').textContent=text;$('perspectiveStatus').hidden=!text;$('perspectiveStatus').classList.toggle('error',error);}
  function buttons(){const rec=!!voice;$('perspectiveSave').disabled=busy||rec||!draft?.question;$('perspectiveAnother').disabled=busy||rec;$('perspectiveRecord').disabled=busy||!!draft?.unsaved;$('perspectiveAnswer').disabled=busy||rec;$('perspectivePause').hidden=!rec;$('perspectiveClose').disabled=saving;$('perspectiveCancel').disabled=saving;$('perspectiveRecord').textContent=rec?'■ Stop recording':draft?.partId?'🎙 Record more':'🎙 Record your answer';}
  function clean(v){clearInterval(v.ticker);clearTimeout(v.rotation);if(v.frame)cancelAnimationFrame(v.frame);v.context?.close().catch(()=>{});v.stream.getTracks().forEach(t=>t.stop());}
  function elapsed(v){return v.total+(v.recorder?.state==='recording'?Math.max(0,Date.now()-v.started):0);}
  function indicator(v){const ms=elapsed(v);$('perspectiveTimer').textContent=String(Math.floor(ms/60000)).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0');$('perspectiveRecordState').textContent=v.saving?'Saving clip…':v.paused?'Paused':'Recording';$('perspectiveIndicator').classList.toggle('paused',v.paused);$('perspectivePause').textContent=v.paused?'Resume':'Pause';$('perspectivePause').disabled=v.saving||v.stopping;}
  function meter(v){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;v.context=new C();v.context.resume().catch(()=>{});const analyser=v.context.createAnalyser();analyser.fftSize=64;v.context.createMediaStreamSource(v.stream).connect(analyser);const levels=new Uint8Array(analyser.frequencyBinCount),bars=$('perspectiveMeter').querySelectorAll('i');const draw=()=>{if(voice!==v)return;analyser.getByteFrequencyData(levels);bars.forEach((bar,i)=>bar.style.height=(!v.paused?4+levels[Math.min(i+2,levels.length-1)]/255*28:4)+'px');v.frame=requestAnimationFrame(draw);};draw();}catch{}}
  async function saveClip(blob,duration){draft.partId=await D().savePerspectiveClip(draft.entryId,draft.partId,draft,blob,duration);draft.clips++;$('perspectiveCaptured').textContent=draft.clips+' clip'+(draft.clips===1?'':'s')+' saved';}
  function end(v){clean(v);if(voice===v)voice=null;$('perspectiveIndicator').hidden=true;busy=false;buttons();if(!v.failed)tell('Audio saved. Save answer to transcribe and summarise.');}
  function startClip(v){
    if(v.paused||v.stopping||v.cancelled)return;
    const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
    const recorder=new MediaRecorder(v.stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:48000});v.recorder=recorder;const parts=[];
    recorder.ondataavailable=e=>{if(e.data?.size)parts.push(e.data)};
    recorder.onstop=async()=>{
      clearTimeout(v.rotation);const duration=Math.max(1,Date.now()-v.started);v.total+=duration;v.saving=true;indicator(v);
      try{
        const blob=new Blob(parts,{type:recorder.mimeType||mime||'audio/webm'});
        if(!v.cancelled&&blob.size){
          try{await saveClip(blob,duration)}catch(error){draft.unsaved={blob,duration};throw error;}
        }
      }catch(e){v.failed=true;v.stopping=true;tell('Could not save the latest clip: '+e.message+'. Use Save answer to retry.',true);}
      finally{v.saving=false;if(v.cancelled||v.stopping)end(v);else if(!v.paused)startClip(v);else indicator(v);}
    };
    recorder.onerror=()=>{v.failed=true;v.stopping=true;tell('Recording stopped. Previously saved clips are safe.',true);if(recorder.state==='recording')recorder.stop();else end(v)};
    recorder.start();v.started=Date.now();v.rotation=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},CLIP_MS);indicator(v);
  }
  async function stop(){const v=voice;if(!v)return;v.stopping=true;busy=true;buttons();clearTimeout(v.rotation);if(v.recorder?.state==='recording')v.recorder.stop();else if(!v.saving)end(v);}
  function pause(){const v=voice;if(!v||v.saving)return;try{if(!v.paused){v.paused=true;clearTimeout(v.rotation);if(v.recorder?.state==='recording')v.recorder.stop()}else{v.paused=false;startClip(v)}indicator(v)}catch(e){tell(e.message,true)}}
  async function record(){if(busy||!draft)return;if(voice){await stop();return}busy=true;buttons();let stream;const token=epoch;
    try{stream=await navigator.mediaDevices.getUserMedia({audio:true});if(token!==epoch){stream.getTracks().forEach(t=>t.stop());return}
      const v={stream,recorder:null,total:0,started:0,paused:false,stopping:false,cancelled:false,saving:false};voice=v;
      startClip(v);v.ticker=setInterval(()=>indicator(v),250);meter(v);$('perspectiveIndicator').hidden=false;tell('');
    }catch(e){stream?.getTracks().forEach(t=>t.stop());voice=null;tell('Could not record: '+e.message,true)}
    finally{if(token===epoch){busy=false;buttons()}}
  }
  async function close(force=false){
    if(saving)return;
    if(!force&&(voice||draft?.partId||draft?.unsaved||$('perspectiveAnswer').value.trim())&&!await window.UnscriptedConfirm('Discard this answer and its saved recording clips?',{title:'Discard this answer?',confirmLabel:'Discard answer',danger:true}))return;
    if(voice){const v=voice;v.cancelled=true;v.stopping=true;if(v.recorder?.state==='recording')v.recorder.stop();while(v.saving)await new Promise(resolve=>setTimeout(resolve,20));clean(v);voice=null;}
    if(!force&&draft?.partId){try{await D().discardPerspective(draft.entryId,draft.partId)}catch(e){tell('Could not discard saved audio: '+e.message,true);return}}
    epoch++;clarification?.reset(false);draft=null;busy=false;$('perspectiveModal').hidden=true;$('perspectiveIndicator').hidden=true;$('perspectiveAnswer').value='';returnFocus?.focus({preventScroll:true});
  }
  async function question(){clarification?.reset(false);const token=epoch;busy=true;buttons();tell('Finding a question…');try{const result=await D().perspectiveQuestion(draft.entryId,draft.previous);if(token!==epoch)return;draft.question=result.question;draft.sourceIds=result.sourceIds||[];draft.previous.push(result.question);$('perspectiveQuestion').textContent=result.question;tell('')}catch(e){if(token===epoch)tell(e.message,true)}finally{if(token===epoch){busy=false;clarification?.reset(!!draft?.question);buttons()}}}
  async function open(id){if(D().recording()||window.UnscriptedQuiz?.recording()){D().toast('Finish your recording first.');return}if(draft)return;returnFocus=document.activeElement;epoch++;draft={entryId:id,question:'',sourceIds:[],partId:null,clips:0,previous:[]};$('perspectiveQuestion').textContent='';$('perspectiveAnswer').value='';$('perspectiveTyped').open=false;$('perspectiveModal').hidden=false;$('perspectiveClose').focus();await question();}
  $('perspectiveRecord').onclick=record;$('perspectivePause').onclick=pause;$('perspectiveClose').onclick=()=>close();$('perspectiveCancel').onclick=()=>close();
  $('perspectiveAnother').onclick=async()=>{if(busy||voice)return;if((draft.partId||draft.unsaved||$('perspectiveAnswer').value.trim())&&!await window.UnscriptedConfirm('Discard this answer and ask a different question?',{title:'Try another question?',confirmLabel:'Discard & ask another',danger:true}))return;if(draft.partId)await D().discardPerspective(draft.entryId,draft.partId);draft.partId=null;draft.unsaved=null;draft.clips=0;$('perspectiveAnswer').value='';draft.question='';await question();};
  $('perspectiveSave').onclick=async()=>{if(busy||voice||!draft)return;const answer=$('perspectiveAnswer').value.trim();if(!answer&&!draft.partId&&!draft.unsaved){tell('Record an answer or write something first.',true);return}busy=true;saving=true;buttons();tell('Saving…');
    try{if(draft.unsaved){await saveClip(draft.unsaved.blob,draft.unsaved.duration);draft.unsaved=null}
      const id=draft.entryId;if(draft.partId)await D().finishPerspective(id,draft.partId,answer);else await D().savePerspective(id,{...draft,answer});
      saving=false;await close(true);D().toast('Answer saved. Transcription and summaries will continue in the entry.');D().processEntry(id);
    }catch(e){tell('Could not save: '+e.message+'. Your answer is still here.',true)}finally{saving=false;busy=false;buttons()}
  };
  document.addEventListener('keydown',e=>{if($('perspectiveModal').hidden)return;if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const nodes=[...$('perspectiveModal').querySelectorAll('button,input,textarea,summary')].filter(x=>!x.disabled&&!x.hidden&&x.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&voice&&!voice.paused)pause()});
  window.addEventListener('beforeunload',e=>{if(voice){e.preventDefault();e.returnValue=''}});
  window.UnscriptedPerspective={open,recording:()=>!!voice};
})();
