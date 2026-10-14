/* One seekable timeline over independently saved audio clips. */
(() => {
  const clock = seconds => { seconds=Math.max(0,Math.floor(seconds||0)); return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'); };
  function locate(durations,time) {
    let offset=0;
    for(let i=0;i<durations.length;i++){if(time<offset+durations[i]||i===durations.length-1)return {index:i,local:Math.max(0,time-offset)};offset+=durations[i];}
    return {index:0,local:0};
  }
  function create(segments,load,label) {
    const root=document.createElement('div');root.className='recording-player';
    const audio=document.createElement('audio');audio.preload='metadata';
    const button=document.createElement('button');button.type='button';button.textContent='▶';button.setAttribute('aria-label','Play '+label);
    const time=document.createElement('span');time.className='recording-player-time';
    const seek=document.createElement('input');seek.type='range';seek.min=0;seek.step=.1;seek.value=0;seek.setAttribute('aria-label','Seek within '+label);
    const status=document.createElement('span');status.className='tiny';status.setAttribute('role','status');
    root.append(button,time,seek,audio,status);
    const durations=segments.map(s=>Math.max(.001,(s.duration||0)/1000));let sources=[],index=0,pending=null,wantsPlay=false,disposed=false;
    const total=()=>durations.reduce((a,b)=>a+b,0);
    const position=()=>durations.slice(0,index).reduce((a,b)=>a+b,0)+(pending??audio.currentTime??0);
    const render=()=>{seek.max=total();seek.value=Math.min(total(),position());time.textContent=clock(position())+' / '+clock(total());seek.setAttribute('aria-valuetext',time.textContent);button.textContent=wantsPlay?'Ⅱ':'▶';button.setAttribute('aria-label',(wantsPlay?'Pause ':'Play ')+label);};
    function change(target,resume){const point=locate(durations,Math.min(total(),Math.max(0,target)));wantsPlay=resume;pending=point.local;const changed=index!==point.index||!audio.src;index=point.index;if(changed&&sources[index])audio.src=sources[index];else if(audio.readyState>=1){audio.currentTime=pending;pending=null;}render();if(resume&&sources[index])return audio.play();return Promise.resolve();}
    const ready=Promise.all(segments.map(s=>load(s.id))).then(blobs=>{if(disposed)return;if(!blobs.length||blobs.some(b=>!b))throw Error('Audio missing from this device. Try restoring a backup.');sources=blobs.map(b=>URL.createObjectURL(b));audio.src=sources[index];button.disabled=false;seek.disabled=false;});
    ready.catch(error=>{status.textContent=error.message;});button.disabled=true;seek.disabled=true;
    root.play=()=>{wantsPlay=true;render();return ready.then(()=>{if(disposed)throw Error('Recording closed');if(position()>=total()-.05)return change(0,true);return audio.play();}).catch(error=>{wantsPlay=false;render();throw error;});};
    root.pause=()=>{wantsPlay=false;audio.pause();render();};
    root.restartFromBeginning=()=>change(0,false);
    root.dispose=()=>{disposed=true;root.pause();audio.removeAttribute('src');audio.load();sources.forEach(s=>URL.revokeObjectURL(s));};
    button.onclick=()=>{if(wantsPlay)root.pause();else root.play().catch(e=>{status.textContent=e.message;});};
    seek.oninput=()=>change(Number(seek.value),wantsPlay).catch(e=>{root.pause();status.textContent=e.message;});
    audio.addEventListener('loadedmetadata',()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)durations[index]=audio.duration;if(pending!==null){audio.currentTime=Math.min(pending,durations[index]);pending=null;}render();});
    audio.addEventListener('timeupdate',render);
    audio.addEventListener('error',()=>{root.pause();status.textContent='Could not play this recording.';});
    audio.addEventListener('ended',()=>{if(index+1<sources.length){const target=durations.slice(0,index+1).reduce((a,b)=>a+b,0);change(target,true).catch(e=>{root.pause();status.textContent=e.message;});}else{wantsPlay=false;render();root.dispatchEvent(new Event('unscripted-session-ended'));}});
    render();return root;
  }
  window.UnscriptedRecordingPlayer={create,locate,clock};
})();
