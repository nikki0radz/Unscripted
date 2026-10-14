import {startRegistration,startAuthentication,browserSupportsWebAuthn} from "@simplewebauthn/browser";
const $=id=>document.getElementById(id);
async function request(path,body={}){
  const r=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||"Passkey request failed.");
  return data;
}
function explain(error){
  if(error.name==="NotAllowedError")return "Passkey setup or sign-in was cancelled. You can still use your diary access code.";
  if(error.name==="InvalidStateError")return "A passkey for this diary already exists on this device.";
  return error.message||"Passkeys are not available on this device. Use your diary access code.";
}
async function register(){
  const button=$("registerPasskey"),status=$("passkeyStatus");
  status.hidden=false;button.disabled=true;
  try{
    if(!browserSupportsWebAuthn())throw new Error("This browser does not support passkeys.");
    status.textContent="Follow your phone's fingerprint, face or PIN prompt...";
    const optionsJSON=await request("/passkeys/register/options");
    const credential=await startRegistration({optionsJSON});
    const ack=await request("/passkeys/register/verify",credential);
    if(!ack.registered)throw new Error("Passkey registration was not acknowledged.");
    status.textContent="Passkey saved. Next time the diary asks you to sign in, choose Use fingerprint / face.";
  }catch(error){status.textContent=explain(error);}finally{button.disabled=false;}
}
async function login(){
  const button=$("passkeyLogin"),status=$("status");button.disabled=true;
  try{
    if(!browserSupportsWebAuthn())throw new Error("This browser does not support passkeys.");
    status.textContent="Follow your device's fingerprint, face or PIN prompt...";
    const optionsJSON=await request("/passkeys/login/options");
    const credential=await startAuthentication({optionsJSON});
    const ack=await request("/passkeys/login/verify",credential);
    if(!ack.signedIn)throw new Error("Sign-in was not acknowledged.");
    location.replace("/");
  }catch(error){status.textContent=explain(error);}finally{button.disabled=false;}
}
if($("registerPasskey")){
  $("registerPasskey").onclick=register;
  if(!document.querySelector('meta[name="unscripted-private-host"]'))$("registerPasskey").hidden=true;
}
if($("passkeyLogin")){
  $("passkeyLogin").onclick=login;
  fetch("/session/status",{credentials:"same-origin",cache:"no-store"}).then(r=>r.json()).then(result=>{
    if(result.signedIn)location.replace("/");
    else{$("loginControls").hidden=false;$("status").textContent="";}
  }).catch(()=>{$("loginControls").hidden=false;$("status").textContent="Enter your diary access code or use your passkey.";});
  $("unlock").onsubmit=async event=>{
    event.preventDefault();const button=event.target.querySelector("button");button.disabled=true;
    try{await request("/session",{code:$("code").value});location.replace("/");}
    catch(error){$("status").textContent=explain(error);button.disabled=false;}
  };
}
