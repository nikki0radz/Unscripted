(() => {
  const $=id=>document.getElementById(id),key='unscripted-always-lock';
  const screen=$('diaryLockScreen'),toggle=$('alwaysLock');if(!screen||!toggle)return;
  let verifying=false;
  const enabled=()=>localStorage.getItem(key)==='true';
  function cover(locked){document.documentElement.dataset.diaryLocked=String(locked);screen.hidden=!locked;for(const child of document.body.children)if(child!==screen&&!['SCRIPT'].includes(child.tagName))child.inert=locked;if(locked){window.UnscriptedDiary?.pauseForLock();document.querySelectorAll('.recording-player').forEach(p=>p.pause());}else $('diaryUnlockCode').value='';}
  function lock(){if(enabled())cover(true);}
  async function authenticate(){if(!window.UnscriptedPasskeys)throw Error('Sign-in is still loading. Try again.');await window.UnscriptedPasskeys.authenticate();}
  async function unlock(check){if(verifying)return;verifying=true;$('diaryUnlockButton').disabled=true;$('diaryUnlockSubmit').disabled=true;$('diaryLockStatus').textContent='Follow your fingerprint, face or device PIN prompt…';try{await check();if(document.hidden)throw Error('The app was left during sign-in. Please unlock again.');cover(false);$('diaryLockStatus').textContent='';}catch(e){$('diaryLockStatus').textContent=e.name==='NotAllowedError'?'Unlock cancelled. Your diary remains locked.':e.message;}finally{verifying=false;$('diaryUnlockButton').disabled=false;$('diaryUnlockSubmit').disabled=false;}}
  $('diaryUnlockButton').onclick=()=>unlock(authenticate);
  $('diaryUnlockForm').onsubmit=event=>{event.preventDefault();return unlock(async()=>{const r=await fetch('/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:$('diaryUnlockCode').value})});const data=await r.json();if(!r.ok||!data.signedIn)throw Error(data.error||'Could not verify your diary code.');});};
  toggle.checked=enabled();
  toggle.onchange=async()=>{if(!toggle.checked){localStorage.removeItem(key);cover(false);return;}toggle.checked=false;toggle.disabled=true;$('alwaysLockStatus').textContent='Confirm your passkey to enable app locking…';try{await authenticate();localStorage.setItem(key,'true');toggle.checked=true;$('alwaysLockStatus').textContent='Enabled on this device. Leave and return to test it.';if(document.hidden)lock();}catch(e){$('alwaysLockStatus').textContent='Not enabled. Set up fingerprint / face sign-in first, then try again. '+(e.name==='NotAllowedError'?'The check was cancelled.':e.message);}finally{toggle.disabled=false;}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){lock();}});
  window.addEventListener('pagehide',lock);window.addEventListener('pageshow',()=>{if(enabled())cover(true);});
  window.addEventListener('unscripted-settings',()=>{toggle.checked=enabled();});
  if(!document.querySelector('meta[name="unscripted-private-host"]')){$('alwaysLockArea').hidden=true;}
  cover(document.documentElement.dataset.diaryLocked==='true');
})();
