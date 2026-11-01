/* Scrolling microphone-level history; no decorative or synthetic movement. */
(() => {
  const normalise=level=>Math.max(0,Math.min(1,(20*Math.log10(Math.max(0.000001,Number(level)||0))+55)/45));
  function start({element,stream,active=()=>true}){
    if(!element)return ()=>{};
    const bars=[...element.querySelectorAll('i')],history=Array(bars.length).fill(0);
    let context,source,analyser,samples,timer,closed=false;
    if(!window.UnscriptedNative){try{const C=window.AudioContext||window.webkitAudioContext;if(C){context=new C();source=context.createMediaStreamSource(stream);analyser=context.createAnalyser();analyser.fftSize=2048;source.connect(analyser);samples=new Float32Array(analyser.fftSize);context.resume().catch(()=>{});}}catch{source?.disconnect();context?.close().catch(()=>{});context=null;}}
    const paint=()=>bars.forEach((bar,i)=>{bar.style.height=(4+history[i]*Math.max(0,(element.clientHeight||36)-6))+'px';});
    const tick=()=>{
      if(closed)return;
      if(!active()||document.hidden){history.fill(0);paint();return;}
      let level=0;
      try{if(window.UnscriptedNative)level=window.UnscriptedNative.meter();else if(analyser){analyser.getFloatTimeDomainData(samples);let sum=0;for(const sample of samples)sum+=sample*sample;level=Math.sqrt(sum/samples.length);}}catch{}
      history.shift();history.push(normalise(level));paint();
    };
    paint();timer=setInterval(tick,60);
    return ()=>{closed=true;clearInterval(timer);source?.disconnect();analyser?.disconnect();context?.close().catch(()=>{});history.fill(0);paint();};
  }
  window.UnscriptedVoiceMeter={start,normalise};
})();
