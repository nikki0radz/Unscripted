/* Reading controls apply live, and remain on this device between visits. */
(() => {
  const fonts={"Soft sans":'"DM Sans",system-ui,sans-serif',"System":'system-ui,sans-serif',"Classic serif":'Georgia,serif',"Clean Arial":'Arial,sans-serif',"Open Verdana":'Verdana,sans-serif'};
  const defaults={font:"Soft sans",headingFont:"Diary serif",bodySize:14,headingSize:24,questionSize:16};
  function read(){try{return {...defaults,...JSON.parse(localStorage.getItem("unscripted-text-style")||"{}")};}catch{return {...defaults};}}
  function apply(value=read()){
    const style=document.documentElement.style;
    style.setProperty("--reading-font",fonts[value.font]||fonts[defaults.font]);style.setProperty("--heading-font",value.headingFont==="Diary serif"?'Fraunces,Georgia,serif':fonts[value.headingFont]||fonts[value.font]||fonts[defaults.font]);
    for(const [key,css,min,max] of [["bodySize","--reading-size",12,22],["headingSize","--heading-size",18,34],["questionSize","--question-size",13,26]])style.setProperty(css,Math.max(min,Math.min(max,Number(value[key])||defaults[key]))+"px");
  }
  function render(){const root=document.getElementById("textStyleControls");if(!root)return;root.replaceChildren();let value=read();const save=()=>{localStorage.setItem("unscripted-text-style",JSON.stringify(value));apply(value);window.dispatchEvent(new Event("unscripted-change"));};
    for(const [key,title,options] of [["font","Reading font",Object.keys(fonts)],["headingFont","Heading font",["Diary serif",...Object.keys(fonts)]]]){const label=document.createElement("label"),select=document.createElement("select");label.className="reading-font-field";label.textContent=title;for(const text of options){const option=document.createElement("option");option.value=text;option.textContent=text;select.append(option);}select.value=value[key];select.onchange=()=>{value[key]=select.value;save();};label.append(select);root.append(label);}
    for(const [key,title,min,max] of [["bodySize","Reading size",12,22],["headingSize","Heading size",18,34],["questionSize","Question size",13,26]]){const label=document.createElement("label"),row=document.createElement("span"),output=document.createElement("output"),input=document.createElement("input"),name=document.createElement("span");label.className="style-slider";name.textContent=title;output.textContent=value[key]+" px";row.append(name,output);input.type="range";input.min=min;input.max=max;input.step=1;input.value=value[key];input.setAttribute("aria-label",title);input.oninput=()=>{value[key]=Number(input.value);output.textContent=value[key]+" px";save();};label.append(row,input);root.append(label);}
    const sample=document.createElement("div");sample.className="reading-preview";const heading=document.createElement("h3"),q=document.createElement("p"),body=document.createElement("p");heading.textContent="A little moment";q.className="reading-preview-question";q.textContent="What made you smile today?";body.textContent="Your thoughts, with a little room to breathe.";sample.append(heading,q,body);root.append(sample);
    const reset=document.createElement("button");reset.type="button";reset.className="text-action";reset.textContent="Reset text style";reset.onclick=()=>{value={...defaults};save();render();};root.append(reset);
  }
  apply();render();window.addEventListener("unscripted-settings",()=>{apply();render();});window.addEventListener("storage",e=>{if(e.key==="unscripted-text-style")apply();});
  window.UnscriptedTextStyle={apply,read};
})();
