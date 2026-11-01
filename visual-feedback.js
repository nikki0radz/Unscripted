/* Local interface feedback: meaningful action icons and real AI request activity. */
(() => {
  const paths={refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1a8 8 0 0 1 13.2 3M4.7 14.9a8 8 0 0 0 13.2 3"/>',perspective:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 10h8M8 14h5"/>',write:'<path d="m16 3 5 5-12 12H4v-5L16 3ZM14 5l5 5"/>'};
  for(const [id,name] of [['transcribeButton','refresh'],['reflectButton','perspective'],['addNoteButton','write']]){
    const icon=document.querySelector('#'+id+' .entry-action-icon');if(icon)icon.innerHTML='<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
  }
  const indicator=document.createElement('div');indicator.id='workIndicator';indicator.className='work-indicator';indicator.hidden=true;indicator.setAttribute('role','status');indicator.innerHTML='<span class="ui-spinner" aria-hidden="true"></span><span>Working…</span>';document.body.append(indicator);
  function paint(){const busy=(window.UnscriptedWorkCount||0)>0;indicator.hidden=!busy;document.getElementById('transcribeButton')?.classList.toggle('is-working',busy&&document.getElementById('transcribeButton').disabled);
    for(const button of document.querySelectorAll('button'))button.classList.toggle('is-loading',button.disabled&&/\b(loading|processing|preparing|saving|generating|refreshing|connecting)\b/i.test(button.textContent));
    for(const id of ['quizStatus','perspectiveStatus','askStatus','entryStatus','settingsStatus','interviewSetupStatus','recordState','cloudBackupStatus']){const node=document.getElementById(id);if(node)node.classList.toggle('is-loading',!node.hidden&&/\b(transcribing|processing|loading|summarising|summarizing|generating|finding|thinking|saving|preparing|connecting|refreshing|searching)\b/i.test(node.textContent));}
  }
  window.addEventListener('unscripted-work',paint);
  new MutationObserver(paint).observe(document.body,{childList:true,subtree:true,characterData:true});paint();
})();
