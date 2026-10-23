/* Live reading previews, proportional overall scaling and individual fine tuning. */
(() => {
  const fonts={"Soft sans":'"DM Sans",system-ui,sans-serif',"System":'system-ui,sans-serif',"Classic serif":'Georgia,serif',"Clean Arial":'Arial,sans-serif',"Open Verdana":'Verdana,sans-serif'};
  const defaults={font:"Soft sans",headingFont:"Diary serif",overallScale:100,bodySize:14,headingSize:24,questionSize:16};
  const fields=[["bodySize","Reading size",4,26],["headingSize","Heading size",6,40],["questionSize","Question size",4,30]];
  const bounded=(v,min,max,fallback)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):fallback));
  function read(){try{return {...defaults,...JSON.parse(localStorage.getItem("unscripted-text-style")||"{}")};}catch{return {...defaults};}}
  function sizes(value){const scale=bounded(value.overallScale,10,180,100)/100;return Object.fromEntries(fields.map(([key,,min,max])=>[key,Math.round(bounded(value[key],min,max,defaults[key])*scale*100)/100]));}
  function apply(value=read()){
    const style=document.documentElement.style,actual=sizes(value);
    style.setProperty("--text-scale",String(bounded(value.overallScale,10,180,100)/100));
    style.setProperty("--reading-font",fonts[value.font]||fonts[defaults.font]);style.setProperty("--heading-font",value.headingFont==="Diary serif"?'Fraunces,Georgia,serif':fonts[value.headingFont]||fonts[value.font]||fonts[defaults.font]);
    for(const [key,css] of [["bodySize","--reading-size"],["headingSize","--heading-size"],["questionSize","--question-size"]])style.setProperty(css,actual[key]+"px");
  }
  function render(){
    const root=document.getElementById("textStyleControls");if(!root)return;root.replaceChildren();let value=read();const labels={};
    function updatePreview(){const actual=sizes(value);for(const [key,label] of Object.entries(labels))label.textContent=(key==="headingSize"?"Heading · "+value.headingFont:key==="questionSize"?"Question · "+value.font:"Reading · "+value.font)+" · "+actual[key]+" px";}
    const save=()=>{localStorage.setItem("unscripted-text-style",JSON.stringify(value));apply(value);updatePreview();window.dispatchEvent(new Event("unscripted-change"));};
    function slider(key,title,min,max,unit){const label=document.createElement("label"),row=document.createElement("span"),output=document.createElement("output"),input=document.createElement("input"),name=document.createElement("span");label.className="style-slider"+(key==="overallScale"?" overall-text-slider":"");name.textContent=title;output.textContent=value[key]+unit;row.append(name,output);input.type="range";input.min=min;input.max=max;input.step=1;input.value=value[key];input.setAttribute("aria-label",title);input.oninput=()=>{value[key]=Number(input.value);output.textContent=value[key]+unit;save();};label.append(row,input);root.append(label);}
    slider("overallScale","Overall text size",10,180,"%");
    const hint=document.createElement("p");hint.className="text-scale-hint";hint.textContent="Scales all text together, keeping your proportions. 100% is your normal size.";root.append(hint);
    const preview=document.createElement("section");preview.className="reading-preview live-reading-preview";preview.setAttribute("aria-label","Live text preview");
    const title=document.createElement("div");title.className="text-preview-title";title.textContent="Live text preview";preview.append(title);
    for(const [key,tag,text,cls] of [["headingSize","h3","A little moment",""],["questionSize","p","What made you smile today?","reading-preview-question"],["bodySize","p","Your thoughts, with a little room to breathe. This is how your diary text will look.","reading-preview-body"]]){const row=document.createElement("div"),label=document.createElement("div"),sample=document.createElement(tag);row.className="text-preview-row";label.className="text-preview-caption";sample.className=cls;sample.textContent=text;labels[key]=label;row.append(label,sample);preview.append(row);}root.append(preview);
    for(const [key,title,options] of [["font","Reading font",Object.keys(fonts)],["headingFont","Heading font",["Diary serif",...Object.keys(fonts)]]]){const label=document.createElement("label"),select=document.createElement("select");label.className="reading-font-field";label.textContent=title;for(const text of options){const option=document.createElement("option");option.value=text;option.textContent=text;select.append(option);}select.value=value[key];select.onchange=()=>{value[key]=select.value;save();};label.append(select);root.append(label);}
    for(const [key,title,min,max] of fields)slider(key,title,min,max," px");
    const reset=document.createElement("button");reset.type="button";reset.className="text-action";reset.textContent="Reset text style";reset.onclick=()=>{value={...defaults};save();render();};root.append(reset);updatePreview();
  }
  apply();render();window.addEventListener("unscripted-settings",()=>{apply();render();});window.addEventListener("storage",e=>{if(e.key==="unscripted-text-style"){apply();render();}});
  window.UnscriptedTextStyle={apply,read,sizes};
})();
