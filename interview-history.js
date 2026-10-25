/* Keep seen questions across new, unfinished and completed interviews. */
(() => {
  const key='unscripted-interview-question-history',month=30*24*60*60*1000;
  const normalise=text=>String(text||'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
  function read(){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter(x=>typeof x.question==='string'):[];}catch{return [];}}
  function remember(question,status='shown',at=Date.now(),seed=false){
    if(!question?.trim())return;
    const rows=read(),old=rows.find(x=>normalise(x.question)===normalise(question));
    if(old){if(old.status==='answered'||(seed&&status!=='answered'))return;if(status!=='shown'||old.status==='skipped'){old.status=status;old.at=at;}}
    else rows.push({question:question.slice(0,900),status,at});
    localStorage.setItem(key,JSON.stringify(rows));
  }
  function excluded(entries=[],draft={},now=Date.now()){
    for(const entry of entries)for(const answer of entry.interview?.answers||[])if(answer.question)remember(answer.question,answer.skipped?'skipped':'answered',Date.parse(answer.createdAt||entry.createdAt)||now,true);
    for(const answer of draft.answers||[])if(answer.question)remember(answer.question,answer.skipped?'skipped':'answered',Date.parse(answer.createdAt)||now,true);
    if(draft.question)remember(draft.question);
    return read().filter(x=>x.status!=='skipped'||now-x.at<month).map(x=>x.question);
  }
  function repeated(question,questions){const text=normalise(question),words=new Set(text.split(' ').filter(w=>w.length>3));return questions.some(q=>{const other=normalise(q);if(text===other)return true;const set=new Set(other.split(' ').filter(w=>w.length>3)),overlap=[...words].filter(w=>set.has(w)).length;return Math.min(words.size,set.size)>=8&&overlap/Math.max(words.size,set.size)>.82;});}
  window.UnscriptedInterviewHistory={remember,excluded,repeated};
})();
