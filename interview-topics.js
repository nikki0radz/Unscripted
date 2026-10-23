/* A searchable, keyboard-friendly topic picker using the diary's own styling. */
(() => {
  const $=id=>document.getElementById(id),select=$("interviewFocus"),toggle=$("interviewTopicToggle"),menu=$("interviewTopicMenu"),search=$("interviewTopicSearch"),list=$("interviewTopicOptions");
  const details={
    "Surprise me":["✦","A little of everything"],"Moral dilemmas":["⚖","Tricky choices. No easy answers."],"Big philosophical questions":["∞","Big ideas, everyday language"],
    "Relationships & boundaries":["♡","Closeness, space and connection"],"Confidence & self-belief":["☀","What makes you, you"],"Likes & dislikes":["☺","Your favourites and little dislikes"],
    "Strengths & self-awareness":["✧","See yourself from a new angle"],"Philosophical ideas":["❝","An idea to turn over in your mind"],"Thought experiments":["◈","Imagine if things were different"],
    "Memories & life stories":["◷","A moment that stayed with you"],"Playful conversation starters":["☄","A curious little rabbit hole"],"Friendships":["☕","People you choose"],
    "Family":["⌂","Roots, roles and belonging"],"Work & caring":["✺","Purpose and everyday life"],"Creativity & projects":["✎","Ideas worth exploring"],
    "Money & habits":["↻","Choices, routines and priorities"],"Identity & belonging":["◎","Who you are and where you fit"],"Difficult conversations":["↔","The things that are hard to say"],
    "Goals & next steps":["↗","Dream a little, think ahead"],"Joy & everyday life":["☀","The good little things"],"Stress & rest":["☾","Making room to breathe"],"custom":["＋","Take the conversation anywhere"]
  };
  function close(focus=false){menu.hidden=true;toggle.setAttribute("aria-expanded","false");if(focus)toggle.focus();}
  function render(){
    list.replaceChildren();const query=search.value.trim().toLocaleLowerCase();let count=0;
    for(const option of select.options){const [icon,hint]=details[option.value]||["✦","Something new to think about"];
      if(query&&!(option.textContent+" "+hint).toLocaleLowerCase().includes(query))continue;
      const b=document.createElement("button"),symbol=document.createElement("span"),text=document.createElement("span"),title=document.createElement("strong"),subtitle=document.createElement("small"),check=document.createElement("span");
      b.type="button";b.className="topic-option";b.setAttribute("aria-pressed",String(select.value===option.value));symbol.className="topic-symbol";symbol.textContent=icon;symbol.setAttribute("aria-hidden","true");title.textContent=option.textContent;subtitle.textContent=hint;text.append(title,subtitle);check.className="topic-check";check.textContent=select.value===option.value?"✓":"";check.setAttribute("aria-hidden","true");b.append(symbol,text,check);
      b.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event("change",{bubbles:true}));update();close(true);if(option.value==="custom")$("interviewCustomGoal").focus();};list.append(b);count++;
    }$("interviewTopicEmpty").hidden=count!==0;
  }
  function update(){const option=select.options[select.selectedIndex]||select.options[0], [icon,hint]=details[option.value]||["✦","Something new to think about"];
    toggle.setAttribute("aria-label","Topic: "+option.textContent+". "+hint);$("interviewTopicLabel").textContent=option.textContent;$("interviewTopicHint").textContent=hint;toggle.querySelector(".topic-toggle-icon").textContent=icon;
  }
  toggle.onclick=()=>{const opening=menu.hidden;menu.hidden=!opening;toggle.setAttribute("aria-expanded",String(opening));if(opening){search.value="";render();search.focus();}};
  search.oninput=render;
  menu.addEventListener("keydown",event=>{
    if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close(true);return;}
    const buttons=[...list.querySelectorAll("button")],index=buttons.indexOf(document.activeElement);
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();if(buttons.length)buttons[index<0?(event.key==="ArrowDown"?0:buttons.length-1):(index+(event.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length].focus();}
    if(event.key==="Enter"&&document.activeElement===search){event.preventDefault();buttons[0]?.click();}
  });
  select.addEventListener("change",update);
  document.addEventListener("click",event=>{if(!menu.hidden&&!menu.contains(event.target)&&!toggle.contains(event.target))close();});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!menu.hidden){event.preventDefault();event.stopPropagation();close(true);}},true);
  $("interviewResume").addEventListener("click",()=>close());
  $("interviewSetupClose").addEventListener("click",()=>close());$("interviewBegin").addEventListener("click",()=>close());
  update();
})();
