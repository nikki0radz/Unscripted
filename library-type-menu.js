/* App-themed, multi-select library filter. Does not change saved entries. */
(() => {
  const types = [
    ['diary','Diary entries','M6 3h10a2 2 0 0 1 2 2v16H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 5h6m-6 4h6'],
    ['interviews','Interviews','M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5Zm-3 5v1a6 6 0 0 0 12 0v-1m-6 7v4m-4 0h8'],
    ['questions','Interview questions','M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 3-2Zm5 5a2 2 0 1 1 3 2c-1 1-1 1-1 2m0 3h.01'],
    ['perspectives','Another perspective questions','M9 18h6m-5 3h4M8 15a7 7 0 1 1 8 0l-1 3H9l-1-3Z']
  ];
  const valid = types.map(([id])=>id);
  function normalize(value) { return Array.isArray(value) && !value.includes('all') ? valid.filter(id=>value.includes(id)) : []; }
  function toggleType(current,id) {
    const selected=normalize(current);
    if(id==='all')return [];
    if(!valid.includes(id))return selected;
    return normalize(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]);
  }
  function caption(selected) { return selected.length===0?'Everything':selected.length===1?types.find(([id])=>id===selected[0])[1]:selected.length+' types'; }
  if(typeof module!=='undefined'&&module.exports){module.exports={normalize,toggleType,caption};return;}
  const $=id=>document.getElementById(id), modal=$('libraryTypeModal'), trigger=$('libraryKindButton');
  if(!modal||!trigger)return;
  const key='unscripted-library-types-v1'; let selected=[],focusBefore=null,overflowBefore='',inertBefore=false;
  const shell=document.querySelector('.app-shell');
  try{selected=normalize(JSON.parse(localStorage.getItem(key)||'[]'));}catch{}
  const rows=[];
  function icon(path){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',path);svg.append(p);return svg;}
  for(const [id,label,path] of [['all','Everything','m3 7 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 17l9 5 9-5'],...types]){
    const row=document.createElement('label');row.className='library-type-option';
    const text=document.createElement('span');text.textContent=label;
    const input=document.createElement('input');input.type='checkbox';input.value=id;
    input.onchange=()=>{selected=toggleType(selected,id);sync(true);};
    row.append(icon(path),text,input);$('libraryTypeOptions').append(row);rows.push({id,row,input});
  }
  function sync(apply){
    for(const {id,row,input} of rows){const on=id==='all'?selected.length===0:selected.includes(id);input.checked=on;row.classList.toggle('selected',on);}
    $('libraryKindLabel').textContent=caption(selected);
    trigger.setAttribute('aria-label','Filter entry types: '+(selected.length?types.filter(([id])=>selected.includes(id)).map(([,label])=>label).join(', '):'Everything'));
    $('libraryTypeCount').textContent=selected.length?selected.length+(selected.length===1?' type selected':' types selected'):'Showing everything';
    if(apply){try{localStorage.setItem(key,JSON.stringify(selected));}catch{}
      window.UnscriptedDiary?.setLibraryTypes(selected.length?selected:['all']);}
  }
  function close(){if(modal.hidden)return;modal.hidden=true;trigger.setAttribute('aria-expanded','false');document.body.style.overflow=overflowBefore;if(shell)shell.inert=inertBefore;focusBefore?.focus?.();}
  function open(){if(!modal.hidden)return;focusBefore=document.activeElement;overflowBefore=document.body.style.overflow;inertBefore=!!shell?.inert;modal.hidden=false;document.body.style.overflow='hidden';if(shell)shell.inert=true;trigger.setAttribute('aria-expanded','true');rows.find(x=>x.input.checked)?.input.focus();}
  trigger.onclick=open;$('libraryTypeClose').onclick=close;$('libraryTypeDone').onclick=close;
  modal.onclick=e=>{if(e.target===modal)close();};
  document.addEventListener('keydown',e=>{
    if(modal.hidden)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}
    if(e.key==='Tab'){
      const elements=[...modal.querySelectorAll('button,input')].filter(x=>!x.disabled),index=elements.indexOf(document.activeElement);
      e.preventDefault();elements[(index+(e.shiftKey?-1:1)+elements.length)%elements.length].focus();
    }
  },true);
  window.addEventListener('unscripted-navigate',close);
  sync(true);
})();
