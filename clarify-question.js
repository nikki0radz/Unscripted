/* Explain the current question without changing it or the user's draft. */
(() => {
  function create({buttonId,panelId,question,context}) {
    const button=document.getElementById(buttonId),panel=document.getElementById(panelId);
    let revision=0,last="",cached=null;
    function reset(available=true){revision++;last="";cached=null;panel.replaceChildren();panel.hidden=true;button.hidden=!available;button.disabled=false;button.textContent="What do you mean?";button.setAttribute("aria-expanded","false");}
    function show(result){
      panel.replaceChildren();
      for(const [label,key] of [["In plain English","meaning"],["How to answer","howToAnswer"],["An example (made up)","example"]]){
        const title=document.createElement("strong"),text=document.createElement("p");
        title.textContent=label;text.textContent=result[key];panel.append(title,text);
      }
      panel.hidden=false;button.textContent="Hide explanation";button.setAttribute("aria-expanded","true");
    }
    button.onclick=async()=>{
      const q=question()?.trim();if(!q)return;
      if(!panel.hidden&&cached){panel.hidden=true;button.textContent="What do you mean?";button.setAttribute("aria-expanded","false");return;}
      if(cached&&last===q){show(cached);return;}
      const token=++revision;button.disabled=true;button.textContent="Explaining…";panel.hidden=true;
      try{
        const result=await window.UnscriptedDiary.callAI("/clarify-question",{question:q,context:context?.()||""});
        if(token!==revision||question()?.trim()!==q)return;
        if(!["meaning","howToAnswer","example"].every(k=>typeof result[k]==="string"&&result[k].trim()))throw Error("No explanation returned.");
        cached=result;last=q;show(result);
      }catch(error){
        if(token!==revision)return;
        panel.replaceChildren();panel.textContent="Could not explain that question: "+error.message;panel.hidden=false;button.textContent="Try explanation again";button.setAttribute("aria-expanded","true");
      }finally{if(token===revision)button.disabled=false;}
    };
    button.setAttribute("aria-controls",panelId);reset(false);return {reset};
  }
  window.UnscriptedClarify={create};
})();
