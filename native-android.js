/* Loaded only by the Android shell; normal browser recording stays unchanged. */
(() => {
  const bridge=window.UnscriptedAndroid;if(!bridge?.available())return;
  const pending=new Map(),ownedTokens=new Set();let syncing=false,simple=null,lastStatus={},permissionRequested=false,notificationRequested=false;
  const command=(action,data={})=>{const result=JSON.parse(bridge.command(action,JSON.stringify(data)));if(result.error&&action!=='status'&&!Array.isArray(result.clips))throw Error(result.error);return result;};
  const status=()=>command('status');
  async function waitStart(token){for(let i=0;i<200;i++){const s=status();if(s.active&&s.metadata?.token===token)return;if(s.error)throw Error(s.error);await sleep(25);}throw Error('The Android recorder could not start. Please try again.');}
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function permissions(){if(!permissionRequested){permissionRequested=true;bridge.permissions();}if(bridge.microphoneGranted())return;for(let i=0;i<120;i++){await sleep(250);if(bridge.microphoneGranted())return;}throw Error('Microphone permission is needed. Enable it in Android Settings → Apps → Unscripted → Permissions.');}
  async function blob(clip){const response=await fetch('/__native/audio/'+clip.id);if(!response.ok)throw Error('Native audio could not be read.');const value=await response.blob();if(!value.size)throw Error('The saved audio is empty.');Object.defineProperty(value,'nativeClipId',{value:clip.id});return value;}
  const OriginalBlob=window.Blob;
  window.Blob=class extends OriginalBlob{constructor(parts=[],options){super(parts,options);if(parts.length===1&&parts[0]?.nativeClipId)Object.defineProperty(this,'nativeClipId',{value:parts[0].nativeClipId});}};
  async function sync(){
    const D=window.UnscriptedDiary;if(syncing||!D?.ready())return;syncing=true;
    try{let s=status();if(s.active&&s.metadata?.simple&&!simple){command('stop');s=status();}lastStatus=s;for(const c of [...(s.clips||[])].sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""))){if(c.simple&&(simple?.token===c.token||ownedTokens.has(c.token)))continue;await D.nativeImport(c,await blob(c));bridge.ack(c.id);}D.nativeStatus(s);if(simple&&simple.state==='recording'&&!s.active&&(s.clips||[]).some(c=>c.token===simple.token)){simple.state='inactive';simple.finish().catch(e=>simple?.onerror?.({error:e}));}for(const [id,p] of pending){const raw=bridge.result(id);if(!raw)continue;const result=JSON.parse(raw);pending.delete(id);if(!id.startsWith('transcribe-'))bridge.forget(id);if(result.error)p.reject(Error(result.error));else p.resolve(result);}}
    catch(e){D.toast(e.message);}finally{syncing=false;}
    const entryId=bridge.notificationEntry?.();if(entryId&&!D.recording?.()&&D.entries?.().some(e=>e.id===entryId)){D.openEntry(entryId);bridge.clearNotificationEntry?.();}
  }
  async function callAI(path,body,asForm,code){
    if(!notificationRequested){notificationRequested=true;bridge.requestNotifications?.();}
    let data=JSON.stringify(body),base64='',clipId='';if(asForm){const audio=body.get('file');if(!audio)throw Error('No audio was supplied.');clipId=/^native-([a-zA-Z0-9_-]+)\.m4a$/.exec(audio.name||'')?.[1]||'';data=audio.type||'audio/mp4';base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(audio);});}
    const id=clipId?'transcribe-'+clipId:crypto.randomUUID();const cached=bridge.result(id);if(cached){const result=JSON.parse(cached);if(!result.error)return result;bridge.forget(id);}return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});const error=bridge.http(id,path,data,base64,code||'');if(error){pending.delete(id);reject(Error(error));}});
  }
  class Recorder {
    static isTypeSupported(type){return type==='audio/mp4';}
    constructor(){this.state='inactive';this.mimeType='audio/mp4';this.token=crypto.randomUUID();this.finishing=false;}
    start(){if(simple)throw Error('Finish your other recording first.');simple=this;this.state='recording';command('start',{simple:true,token:this.token,partId:this.token});this.starting=waitStart(this.token);this.starting.catch(e=>{this.state='inactive';simple=null;this.onerror?.({error:e});});}
    stop(){if(this.state!=='recording')return;this.state='inactive';this.finish().catch(e=>this.onerror?.({error:e}));}
    discard(){this.discarded=true;if(this.state==='recording')this.stop();}
    async finish(){if(this.finishing)return;this.finishing=true;ownedTokens.add(this.token);await this.starting;command('stop');const clips=(status().clips||[]).filter(c=>c.token===this.token);simple=null;try{for(const clip of clips){if(!this.discarded)this.ondataavailable?.({data:await blob(clip)});}await this.onstop?.();if(this.discarded)clips.forEach(c=>bridge.ack(c.id));}catch(e){this.onerror?.({error:e});}finally{ownedTokens.delete(this.token);this.finishing=false;sync();}}
  }
  window.MediaRecorder=Recorder;
  navigator.mediaDevices.getUserMedia=async()=>{await permissions();return {getTracks:()=>[{stop(){}}]};};
  window.UnscriptedNative={
    permissions,callAI,command,status,sync,commit:value=>{if(value?.nativeClipId)bridge.ack(value.nativeClipId);},
    start:async(entryId,partId)=>{await permissions();const token=crypto.randomUUID();command('start',{entryId,partId,token});await waitStart(token);},
    finish:async(cancel=false)=>{command(cancel?'cancel':'stop');while(syncing)await sleep(20);await sync();if(!cancel&&(status().clips||[]).some(c=>!c.simple))throw Error('Audio is still waiting to be saved. Keep Unscripted open and try Save again.');},
    ackTranscript:id=>bridge.forget('transcribe-'+id),
    transcriptionFinished:(entryId,revision)=>bridge.transcriptionFinished?.(entryId,revision),
    exportBackup:(text,name)=>bridge.exportBackup(text,name),
    meter:()=>lastStatus.level||0
  };
  window.addEventListener('unscripted-native',()=>{sync();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
  setInterval(sync,750);
  document.addEventListener('DOMContentLoaded',()=>{fetch('/session/status',{credentials:'same-origin',cache:'no-store'}).catch(()=>{});const hint=document.getElementById('recordingBackgroundHint');if(hint)hint.textContent='Recording continues when you leave the app or lock your screen. Return using the Unscripted notification.';const install=document.getElementById('installAppButton');if(install){install.disabled=true;install.textContent='Android app · 1.0.8';}document.querySelectorAll('#installAppStatus').forEach(x=>x.textContent='Background recording and transcription are available in this app.');});
})();
