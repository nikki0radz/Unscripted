/* Live reading previews, proportional overall scaling and individual fine tuning. */
(() => {
  const fonts={"Soft sans":'"DM Sans",system-ui,sans-serif',"System":'system-ui,sans-serif',"Classic serif":'Georgia,serif',"Clean Arial":'Arial,sans-serif',"Open Verdana":'Verdana,sans-serif'};
  Object.assign(fonts,{"Handwritten":'"Caveat",cursive',"Calligraphy":'"Dancing Script",cursive',"Gothic":'"UnifrakturCook",cursive',"Typewriter":'"Special Elite",monospace'});
  const presets=[
    {id:"soft",name:"Soft & simple",hint:"One rounded, easygoing font",font:"Soft sans",headingFont:"Soft sans"},
    {id:"classic",name:"Classic",hint:"One bookish serif throughout",font:"Classic serif",headingFont:"Classic serif"},
    {id:"handwritten",name:"Handwriting",hint:"Caveat · relaxed handwritten notes",font:"Handwritten",headingFont:"Handwritten"},
    {id:"calligraphy",name:"Calligraphy",hint:"Dancing Script · flowing joined-up lettering",font:"Calligraphy",headingFont:"Calligraphy"},
    {id:"gothic",name:"Gothic",hint:"UnifrakturCook · bold old-world lettering",font:"Gothic",headingFont:"Gothic"},
    {id:"typewriter",name:"Typewriter",hint:"Special Elite · ink-on-paper character",font:"Typewriter",headingFont:"Typewriter"},
    {id:"diary",name:"Diary",hint:"Characterful headings + soft reading",font:"Soft sans",headingFont:"Diary serif"}
  ];
  function pairFor(value){return presets.find(p=>p.id===value.fontPreset)||{font:value.font||"Soft sans",headingFont:value.headingFont||"Diary serif"};}
  const defaults={font:"Soft sans",headingFont:"Diary serif",overallScale:100,bodySize:14,headingSize:24,questionSize:16};
  const fields=[["bodySize","Reading size",4,26],["headingSize","Heading size",6,40],["questionSize","Question size",4,30]];
  const bounded=(v,min,max,fallback)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):fallback));
  function read(){let saved={};try{saved=JSON.parse(localStorage.getItem("unscripted-text-style")||"{}");}catch{}const value={...defaults,...saved};if(!presets.some(p=>p.id===value.fontPreset))value.fontPreset=presets.find(p=>p.font===value.font&&p.headingFont===value.headingFont)?.id||"current";return value;}
  function sizes(value){const scale=bounded(value.overallScale,10,180,100)/100;return Object.fromEntries(fields.map(([key,,min,max])=>[key,Math.round(bounded(value[key],min,max,defaults[key])*scale*100)/100]));}
  function apply(value=read()){
    const style=document.documentElement.style,actual=sizes(value),pair=pairFor(value);
    style.setProperty("--text-scale",String(bounded(value.overallScale,10,180,100)/100));
    style.setProperty("--reading-font",fonts[pair.font]||fonts[defaults.font]);style.setProperty("--heading-font",pair.headingFont==="Diary serif"?'Fraunces,Georgia,serif':fonts[pair.headingFont]||fonts[pair.font]||fonts[defaults.font]);
    for(const [key,css] of [["bodySize","--reading-size"],["headingSize","--heading-size"],["questionSize","--question-size"]])style.setProperty(css,actual[key]+"px");
  }
  function render(){
    const root=document.getElementById("textStyleControls");if(!root)return;root.replaceChildren();let value=read();const labels={};
    function updatePreview(){const actual=sizes(value),pair=pairFor(value);for(const [key,label] of Object.entries(labels))label.textContent=(key==="headingSize"?"Heading · "+pair.headingFont:key==="questionSize"?"Question · "+pair.font:"Reading · "+pair.font)+" · "+actual[key]+" px";}
    const save=()=>{localStorage.setItem("unscripted-text-style",JSON.stringify(value));apply(value);updatePreview();window.dispatchEvent(new Event("unscripted-change"));};
    root.saveSettings=save;
    function slider(key,title,min,max,unit){const label=document.createElement("label"),row=document.createElement("span"),output=document.createElement("output"),input=document.createElement("input"),name=document.createElement("span");label.className="style-slider"+(key==="overallScale"?" overall-text-slider":"");name.textContent=title;output.textContent=value[key]+unit;row.append(name,output);input.type="range";input.min=min;input.max=max;input.step=1;input.value=value[key];input.setAttribute("aria-label",title);input.oninput=()=>{value[key]=Number(input.value);output.textContent=value[key]+unit;save();};label.append(row,input);root.append(label);}
    const picker=document.createElement("div");picker.className="font-style-picker";picker.setAttribute("role","group");picker.setAttribute("aria-label","Font style");
    const pickerTitle=document.createElement("div");pickerTitle.className="font-picker-label";pickerTitle.textContent="Choose one style";root.append(pickerTitle,picker);
    function drawPresets(){picker.replaceChildren();const choices=value.fontPreset==="current"?[{id:"current",name:"Your current style",hint:"Kept from your previous settings",font:value.font,headingFont:value.headingFont},...presets]:presets;
      for(const preset of choices){const button=document.createElement("button"),top=document.createElement("span"),name=document.createElement("strong"),check=document.createElement("span"),heading=document.createElement("span"),body=document.createElement("span"),hint=document.createElement("small");button.type="button";button.className="font-style-card";button.setAttribute("aria-pressed",String(value.fontPreset===preset.id));button.setAttribute("aria-label",preset.name+". "+preset.hint);top.className="font-style-card-top";name.textContent=preset.name;check.textContent=value.fontPreset===preset.id?"✓":"";check.className="font-style-check";check.setAttribute("aria-hidden","true");top.append(name,check);heading.className="font-style-heading-sample";heading.textContent="A little moment";heading.style.fontFamily=preset.headingFont==="Diary serif"?'Fraunces,Georgia,serif':fonts[preset.headingFont]||fonts[defaults.font];body.className="font-style-body-sample";body.textContent="Your thoughts, with room to breathe.";body.style.fontFamily=fonts[preset.font]||fonts[defaults.font];hint.textContent=preset.hint;button.append(top,heading,body,hint);button.onclick=()=>{value.fontPreset=preset.id;value.font=preset.font;value.headingFont=preset.headingFont;save();drawPresets();picker.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});};picker.append(button);}
    }drawPresets();
    slider("overallScale","Overall text size",10,180,"%");
    const hint=document.createElement("p");hint.className="text-scale-hint";hint.textContent="Scales all text together, keeping your proportions. 100% is your normal size.";root.append(hint);
    const preview=document.createElement("section");preview.className="reading-preview live-reading-preview";preview.setAttribute("aria-label","Live text preview");
    const title=document.createElement("div");title.className="text-preview-title";title.textContent="Live text preview";preview.append(title);
    for(const [key,tag,text,cls] of [["headingSize","h3","A little moment",""],["questionSize","p","What made you smile today?","reading-preview-question"],["bodySize","p","Your thoughts, with a little room to breathe. This is how your diary text will look.","reading-preview-body"]]){const row=document.createElement("div"),label=document.createElement("div"),sample=document.createElement(tag);row.className="text-preview-row";label.className="text-preview-caption";sample.className=cls;sample.textContent=text;labels[key]=label;row.append(label,sample);preview.append(row);}root.append(preview);
    for(const [key,title,min,max] of fields)slider(key,title,min,max," px");
    const reset=document.createElement("button");reset.type="button";reset.className="text-action";reset.textContent="Reset text style";reset.onclick=()=>{value={...defaults,fontPreset:"diary"};save();render();};root.append(reset);updatePreview();
  }
  apply();render();window.addEventListener("unscripted-settings",()=>{apply();render();});window.addEventListener("storage",e=>{if(e.key==="unscripted-text-style"){apply();render();}});
  window.UnscriptedTextStyle={apply,read,sizes,presets,pairFor};
})();
