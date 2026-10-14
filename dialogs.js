/* Promise-based, app-styled confirmations. Never put secrets into dialog markup. */
(() => {
  let pending = null, previousFocus = null;
  const $ = id => document.getElementById(id);
  function close(value) {
    if (!pending) return;
    $("appConfirmModal").hidden = true;
    const resolve = pending; pending = null;
    previousFocus?.focus?.(); resolve(value);
  }
  window.UnscriptedConfirm = (message, {title="Are you sure?",confirmLabel="Continue",danger=false}={}) => {
    if (pending) return Promise.resolve(false);
    previousFocus = document.activeElement;
    $("appConfirmTitle").textContent=title; $("appConfirmMessage").textContent=message;
    $("appConfirmYes").textContent=confirmLabel; $("appConfirmYes").classList.toggle("danger-action",danger);
    $("appConfirmModal").hidden=false; $("appConfirmNo").focus();
    return new Promise(resolve=>{pending=resolve;});
  };
  $("appConfirmNo").onclick=()=>close(false);$("appConfirmClose").onclick=()=>close(false);$("appConfirmYes").onclick=()=>close(true);
  $("appConfirmModal").onclick=e=>{if(e.target===$("appConfirmModal"))close(false);};
  document.addEventListener("keydown",e=>{
    if(!pending)return;
    if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();close(false);}
    if(e.key==="Tab"){
      const buttons=[$("appConfirmClose"),$("appConfirmNo"),$("appConfirmYes")],i=buttons.indexOf(document.activeElement);
      e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
    }
  },true);
})();
