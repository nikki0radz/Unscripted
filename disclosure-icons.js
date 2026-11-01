/* One small, centred indicator for native disclosure headings and custom pickers. */
(() => {
  const selector='summary,.topic-chevron,#libraryKindButton';
  function indicator(){
    const circle=document.createElement('span');circle.className='soft-disclosure-icon';circle.setAttribute('aria-hidden','true');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('focusable','false');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M4 6 8 10 12 6');svg.append(path);circle.append(svg);return circle;
  }
  function decorate(el){
    if(el.querySelector(':scope > .soft-disclosure-icon'))return;
    if(el.matches('.topic-chevron'))el.replaceChildren();
    if(el.id==='libraryKindButton')el.querySelector(':scope > svg')?.remove();
    el.querySelector(':scope > .settings-group-chevron')?.remove();
    // Rich question headings retain their stacked text; only the indicator is new.
    el.classList.add('soft-disclosure');el.append(indicator());
  }
  function scan(node){if(node.nodeType!==1)return;if(node.matches(selector))decorate(node);node.querySelectorAll(selector).forEach(decorate);}
  scan(document.body);
  new MutationObserver(records=>{
    for(const record of records){
      if(record.target.nodeType===1&&record.target.matches(selector))decorate(record.target);
      for(const node of record.addedNodes)scan(node);
    }
  }).observe(document.body,{childList:true,subtree:true});
})();
