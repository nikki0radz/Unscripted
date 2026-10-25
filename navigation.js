/* Android/browser Back stays inside the diary; existing close handlers protect drafts. */
(() => {
  const stack=[{view:'home'}];let returning=false;
  const same=(a,b)=>a.view===b.view&&a.id===b.id;
  window.addEventListener('unscripted-navigate',event=>{
    if(returning)return;
    const route=event.detail;if(!route||same(stack.at(-1),route))return;
    const previous=stack.findLastIndex(item=>same(item,route));
    if(previous>=0)stack.splice(previous+1);else stack.push(route);
  });
  window.addEventListener("unscripted-back",()=>history.back());
  const panels=[
    ['appConfirmModal','appConfirmNo'],['cancelRecordingModal','keepRecordingButton'],
    ['colourModal','colourClose'],['editorModal','closeEditor'],['choiceModal','choiceClose'],
    ['interviewDoneModal','interviewDoneClose'],['quizModal','quizClose'],
    ['perspectiveModal','perspectiveClose'],['interviewSetupModal','interviewSetupClose'],
    ['recorderSheet','cancelRecordingButton']
  ];
  function guard(){history.pushState({unscriptedBackGuard:true},'',location.href);}
  // One same-document history boundary also protects the home screen in the installed app.
  guard();
  window.addEventListener('popstate',()=>{
    guard();
    for(const [panelId,buttonId] of panels){
      const panel=document.getElementById(panelId);if(!panel||panel.hidden)continue;
      const close=document.getElementById(buttonId);
      if(close&&!close.disabled)close.click();
      return; // A busy modal or a recording must never be bypassed.
    }
    if(window.UnscriptedDiary?.recording())return;
    if(stack.length<=1)return;
    stack.pop();const route=stack.at(-1);
    returning=true;
    try{window.UnscriptedDiary.navigateBack(route);}finally{returning=false;}
  });
})();
