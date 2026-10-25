/* Independent font choices with optical sizing and a combined live preview. */
(() => {
  const choices=[
    {name:'Simple',key:'Soft sans',family:'"DM Sans",system-ui,sans-serif',scale:1},
    {name:'Handwriting',key:'Handwritten',family:'"Caveat",cursive',scale:1.3},
    {name:'Calligraphy',key:'Calligraphy',family:'"Dancing Script",cursive',scale:1.3},
    {name:'Gothic',key:'Gothic',family:'"UnifrakturCook",cursive',scale:1.08},
    {name:'Typewriter',key:'Typewriter',family:'"Special Elite",monospace',scale:1},
    {name:'Brush',key:'Brush',family:'"Permanent Marker",cursive',scale:1.08}
  ];
  const legacy={'Classic serif':'Georgia,serif','Clean Arial':'Arial,sans-serif','Open Verdana':'Verdana,sans-serif','System':'system-ui,sans-serif','Diary serif':'Fraunces,Georgia,serif'};
  const defaults={font:'Soft sans',headingFont:'Soft sans',questionFont:'Soft sans',overallScale:100,bodySize:14,headingSize:24,questionSize:16};
  const fields=[['bodySize','Text size',4,26],['headingSize','Heading size',6,40],['questionSize','Question size',4,30]];
  const roles=[['headingFont','Heading font'],['questionFont','Question font'],['font','Text font']];
  const bounded=(v,min,max,fallback)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):fallback));
  const choice=key=>choices.find(x=>x.key===key);
  const family=key=>choice(key)?.family||legacy[key]||choices[0].family;
  const factor=key=>choice(key)?.scale||1;
  function migrate(saved={}){
    const old={soft:['Soft sans','Soft sans'],classic:['Classic serif','Classic serif'],handwritten:['Handwritten','Handwritten'],calligraphy:['Calligraphy','Calligraphy'],gothic:['Gothic','Gothic'],typewriter:['Typewriter','Typewriter'],diary:['Soft sans','Diary serif'],clean:['System','System'],roomy:['Open Verdana','Open Verdana']}[saved.fontPreset];
    const value={...defaults,...saved};
    if(old){value.font=old[0];value.headingFont=old[1];}
    if(!saved.questionFont)value.questionFont=value.font;
    delete value.fontPreset;
    for(const [key] of roles)if(!choice(value[key])&&!legacy[value[key]])value[key]=defaults[key];
    return value;
  }
  function read(){let saved={};try{saved=JSON.parse(localStorage.getItem('unscripted-text-style')||'{}');}catch{}return migrate(saved);}
  function sizes(value){const scale=bounded(value.overallScale,10,180,100)/100;return Object.fromEntries(fields.map(([key,,min,max])=>[key,Math.round(bounded(value[key],min,max,defaults[key])*scale*100)/100]));}
  function apply(value=read()){
    const v=migrate(value),style=document.documentElement.style,actual=sizes(v);
    style.setProperty('--text-scale',String(bounded(v.overallScale,10,180,100)/100));
    for(const [key,variable] of [['font','--reading-font'],['headingFont','--heading-font'],['questionFont','--question-font']])style.setProperty(variable,family(v[key]));
    for(const [key,variable,fontKey] of [['bodySize','--reading-size','font'],['headingSize','--heading-size','headingFont'],['questionSize','--question-size','questionFont']])style.setProperty(variable,Math.round(actual[key]*factor(v[fontKey])*100)/100+'px');
  }
  function render(){
    const root=document.getElementById('textStyleControls');if(!root)return;root.replaceChildren();let value=read();
    const save=()=>{localStorage.setItem('unscripted-text-style',JSON.stringify(value));apply(value);window.dispatchEvent(new Event('unscripted-change'));};root.saveSettings=save;
    for(const [key,title] of roles){
      const group=document.createElement('section'),heading=document.createElement('h3'),grid=document.createElement('div');
      group.className='font-role-section';heading.className='font-role-title';heading.textContent=title;grid.className='font-bubble-grid';grid.setAttribute('role','group');grid.setAttribute('aria-label',title);
      function draw(){grid.replaceChildren();for(const font of choices){const button=document.createElement('button');button.type='button';button.className='font-choice-bubble';button.textContent=font.name;button.style.fontFamily=font.family;button.style.fontSize=(15*font.scale)+'px';button.setAttribute('aria-label',title+': '+font.name);button.setAttribute('aria-pressed',String(value[key]===font.key));button.onclick=()=>{value[key]=font.key;save();draw();grid.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});};grid.append(button);}}
      draw();group.append(heading,grid);root.append(group);
    }
    const preview=document.createElement('section');preview.className='reading-preview live-reading-preview';preview.setAttribute('aria-label','Combined font preview');
    const caption=document.createElement('div');caption.className='text-preview-title';caption.textContent='Your preview';preview.append(caption);
    for(const [tag,text,cls] of [['h3','A little moment',''],['p','What made you smile today?','reading-preview-question'],['p','A small thought, a long conversation, and something lovely to remember.','reading-preview-body']]){const row=document.createElement('div'),sample=document.createElement(tag);row.className='text-preview-row';sample.className=cls;sample.textContent=text;row.append(sample);preview.append(row);}root.append(preview);
    function slider(key,title,min,max,unit){const label=document.createElement('label'),row=document.createElement('span'),name=document.createElement('span'),output=document.createElement('output'),input=document.createElement('input');label.className='style-slider'+(key==='overallScale'?' overall-text-slider':'');name.textContent=title;output.textContent=value[key]+unit;row.append(name,output);input.type='range';input.min=min;input.max=max;input.step=1;input.value=value[key];input.setAttribute('aria-label',title);input.oninput=()=>{value[key]=Number(input.value);output.textContent=value[key]+unit;save();};label.append(row,input);root.append(label);}
    slider('overallScale','Overall text size',10,180,'%');for(const [key,title,min,max] of fields)slider(key,title,min,max,' px');
    const reset=document.createElement('button');reset.type='button';reset.className='text-action';reset.textContent='Reset fonts & sizes';reset.onclick=()=>{value={...defaults};save();render();};root.append(reset);
  }
  apply();render();window.addEventListener('unscripted-settings',()=>{apply();render();});window.addEventListener('storage',e=>{if(e.key==='unscripted-text-style'){apply();render();}});
  window.UnscriptedTextStyle={apply,read,sizes,choices,migrate};
})();
