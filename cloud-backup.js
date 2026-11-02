/* Incremental encrypted backups; automatic while the app is open and unlocked. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const C = globalThis.UnscriptedCrypto;
  const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  let key = null, salt = null, timer = null, busy = false, dirty = true, restoring = false;
  let generation = 0, password = "", uploaded = new Map(), keyScope = "";
  const vault = window.UnscriptedAndroid;
  const deviceId = localStorage.getItem("unscripted-backup-device") || hex(crypto.getRandomValues(new Uint8Array(16)));
  localStorage.setItem("unscripted-backup-device", deviceId);
  function status(message, error = false) {
    $("cloudStatus").hidden = false; $("cloudStatus").textContent = message;
    $("cloudStatus").classList.toggle("error", error);
  }
  function dedicated() { return !!document.querySelector('meta[name="unscripted-private-host"]'); }
  function render() {
    $("cloudEnabled").checked = localStorage.getItem("unscripted-cloud-enabled") === "1";
    $("cloudLastSuccess").textContent=localStorage.getItem("unscripted-cloud-last")||"No successful backup recorded on this phone";
    $("cloudAutoNote").textContent=!$("cloudEnabled").checked?"Paused. You can still back up manually.":key?"On while the app is open.":"Paused until you set up backup access below.";
    if (!dedicated()) status("Connect your private diary storage before enabling cloud backups. You can still save a backup file.");
    else if (!key && !$("cloudStatus").textContent) status("Set up backup access once in Advanced backup settings.");
  }
  async function scope() {
    const config=window.UnscriptedDiary.config();
    return config.url+":"+hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(config.code||""))));
  }
  async function remember(derived,nextSalt,expectedScope,attempt){
    const raw=new Uint8Array(await crypto.subtle.exportKey("raw",derived));
    try { if(attempt!==generation)return ""; return vault.saveBackupKey(expectedScope,JSON.stringify({key:hex(raw),salt:hex(nextSalt)})); }
    finally { raw.fill(0); }
  }
  async function resumeAccess(){
    if(!dedicated()||!vault?.loadBackupKey)return;
    const attempt=generation,current=await scope();
    if(attempt!==generation)return;
    if(key&&keyScope===current)return;
    key=null;password="";salt=null;uploaded.clear();
    const saved=vault.loadBackupKey(current);if(!saved)return;
    try {
      const data=JSON.parse(saved);
      if(!/^[a-f0-9]{64}$/.test(data.key)||!/^[a-f0-9]{32}$/.test(data.salt))throw Error();
      const bytes=hexText=>new Uint8Array(hexText.match(/../g).map(x=>parseInt(x,16)));
      const raw=bytes(data.key);let restored;
      try{restored=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);}finally{raw.fill(0);}
      if(attempt!==generation)return;
      key=restored;salt=bytes(data.salt);keyScope=current;
      const lastError=localStorage.getItem("unscripted-cloud-last-error");
      status(lastError||"Ready to back up. This phone remembers your backup access.",!!lastError);
    }catch{status("Backup access needs setting up again. Enter your recovery password in Advanced settings.",true);}
    render();
  }
  async function request(path, body, binary = false) {
    const config = window.UnscriptedDiary.config();
    const headers = { ...(config.code ? { Authorization: "Bearer " + config.code } : {}), "Content-Type": binary ? "application/octet-stream" : "application/json" };
    const response = await fetch(config.url + path, { method: "POST", credentials: "same-origin", headers, body: binary ? body : JSON.stringify(body || {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Cloud backup request failed (" + response.status + ").");
    }
    return response;
  }
  async function upload(objectKey, bytes) {
    const response=await request("/backup/put?key="+objectKey,bytes,true);
    const ack=await response.json().catch(()=>null);
    if(!ack || ack.saved!==true)throw new Error("Cloud storage did not acknowledge the upload.");
  }
  async function snapshots() {
    const data = await (await request("/backup/list")).json();
    if (data.truncated) throw new Error("Too many cloud snapshots to list safely. Manage old device backups in Cloudflare.");
    return data.snapshots.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function download(objectKey) {
    return new Uint8Array(await (await request("/backup/get?key=" + encodeURIComponent(objectKey))).arrayBuffer());
  }
  async function unlock() {
    if (!dedicated()) { render(); return; }
    if (busy || restoring) { status("Wait until the current backup or restore finishes."); return; }
    $("cloudUnlock").disabled = true;
    const attempt = ++generation;
    key = null; password = ""; uploaded.clear();
    try {
      const entered = $("cloudPassword").value;
      if (entered.length < 16) throw new Error("Use at least 16 characters, ideally several random words. Keep it in your password manager.");
      status("Checking private cloud storage...");
      const list = await snapshots();
      let nextSalt = crypto.getRandomValues(new Uint8Array(16));
      if (list.length) {
        const bytes = await download(list[0].key);
        await C.decrypt(bytes, entered); // Verify existing recovery password before writing anything.
        nextSalt = C.header(bytes).salt;
      }
      const currentScope=await scope();
      const canRemember=!!vault?.saveBackupKey;
      const nextKey = await C.derive(entered, nextSalt,canRemember);
      if (generation !== attempt) return;
      salt = nextSalt; key = nextKey; password = entered; keyScope=currentScope;
      $("cloudPassword").value = "";
      localStorage.setItem("unscripted-cloud-enabled", $("cloudEnabled").checked ? "1" : "0");
      let warning="";
      if(canRemember)warning=await remember(nextKey,nextSalt,currentScope,attempt);
      if(attempt!==generation)return;
      status(warning||(canRemember?"Ready. This phone will remember backup access; your recovery password is not saved.":"Ready for this session. Reopen the Android app to remember backup access."),!!warning);
      render();
      // Do not replace a cloud snapshot with an empty newly installed diary.
      if (window.UnscriptedDiary.entries().length && $("cloudEnabled").checked) schedule();
      else if (list.length) status("Backups unlocked. You can now restore a saved backup from Advanced settings.");
    } catch (error) { status(error.message, true); }
    finally { $("cloudUnlock").disabled = false; }
  }
  function schedule() {
    dirty = true; clearTimeout(timer);
    if (!key || restoring || localStorage.getItem("unscripted-cloud-enabled") !== "1") return;
    timer = setTimeout(() => run(false), 15000);
  }
  async function run(manual = true) {
    if($("cloudUnlock").disabled)return;
    await resumeAccess();
    if (!key) { $("backupAdvanced").open=true;$("cloudPassword").focus();status("Enter your recovery password once to set up this phone.", true); return; }
    if (busy || restoring) return;
    const D = window.UnscriptedDiary;
    if (D.recording()) { status("Waiting for your recording to finish before backing up."); schedule(); return; }
    if (!D.ready()) { schedule(); return; }
    if (!D.entries().length) { status("No entries on this device to back up. Existing cloud snapshots stay untouched."); return; }
    busy = true; dirty = false; $("cloudNow").disabled = true;
    const activeKey = key, activeSalt = salt;
    try {
      status("Encrypting and backing up your diary...");
      const entries = structuredClone(await D.freshEntries());
      const audios = [];
      for (const entry of entries) for (const clip of D.clips(entry)) {
        const blob = await D.audio(clip.id);
        if (!blob) throw new Error("A recording is missing on this device. Restore it before making a complete backup.");
        if (blob.size > 24 * 1024 * 1024) throw new Error("One audio clip exceeds the 24 MB backup limit.");
        const data = new Uint8Array(await blob.arrayBuffer());
        const salted = new Uint8Array(activeSalt.length + data.length); salted.set(activeSalt); salted.set(data, activeSalt.length);
        const objectKey = "clips/" + hex(new Uint8Array(await crypto.subtle.digest("SHA-256", salted)));
        if (!uploaded.has(objectKey)) {
          const encryptedAudio=await C.encrypt(data, activeKey, activeSalt);
          await upload(objectKey, encryptedAudio);
          const verifiedAudio=await download(objectKey);
          if(verifiedAudio.length!==encryptedAudio.length||!verifiedAudio.every((v,i)=>v===encryptedAudio[i]))throw Error("Audio verification failed. Please try again.");
          uploaded.set(objectKey, true);
        }
        audios.push({ id: clip.id, key: objectKey, type: blob.type, size: blob.size });
      }
      const snapshot = { app: "unscripted-cloud", version: 1, createdAt: new Date().toISOString(), entries, audios, profile: localStorage.getItem("unscripted-reflection-profile") || "", profiles: D.profiles?.() || {} };
      const plain = new TextEncoder().encode(JSON.stringify(snapshot));
      if (plain.length > 8 * 1024 * 1024 - 48) throw new Error("Diary text exceeds the snapshot size limit. Export a local backup.");
      const objectKey = "snapshots/" + deviceId + "/" + Date.now() + "-" + hex(crypto.getRandomValues(new Uint8Array(8)));
      const encrypted=await C.encrypt(plain, activeKey, activeSalt);
      await upload(objectKey,encrypted);
      const readBack=await download(objectKey);
      if(readBack.length!==encrypted.length || !readBack.every((value,index)=>value===encrypted[index]))throw new Error("Cloud read-back verification failed. No successful backup has been confirmed.");
      const when = new Date().toLocaleString();
      localStorage.setItem("unscripted-cloud-last", when);
      render();
      localStorage.removeItem("unscripted-cloud-last-error");
      status("Backup completed and checked. Your diary and recordings are backed up.");
    } catch (error) { dirty = true; const message="Backup not completed: " + error.message + " Your local entries are still saved.";localStorage.setItem("unscripted-cloud-last-error",message);status(message, true); }
    finally {
      busy = false; $("cloudNow").disabled = false;
      if (dirty && key && localStorage.getItem("unscripted-cloud-enabled") === "1") { clearTimeout(timer); timer = setTimeout(() => run(false), 60000); }
    }
  }
  async function listSnapshots() {
    const select = $("cloudSnapshots"); select.replaceChildren(); $("cloudRestore").disabled = true;
    try {
      const list = await snapshots();
      for (const item of list) {
        const option = document.createElement("option"); option.value = item.key;
        option.textContent = new Date(item.createdAt).toLocaleString() + " · device " + item.key.split("/")[1].slice(0,6);
        select.append(option);
      }
      $("cloudRestore").disabled = !list.length;
      status(list.length ? "Choose a backup to restore. Local entries with matching IDs will be replaced." : "No cloud backups yet.");
    } catch (error) { status(error.message, true); }
  }
  async function restore() {
    if (!key || !password) { $("backupAdvanced").open=true;$("cloudPassword").focus();status("Enter your recovery password and tap Unlock before restoring.", true); return; }
    if (busy || window.UnscriptedDiary.recording()) { status("Finish your recording or backup first."); return; }
    const chosen = $("cloudSnapshots").value;
    if (!chosen) return;
    if (!await window.UnscriptedConfirm("Entries with matching IDs will be replaced; other local entries stay. Your current local diary will also be downloaded as a safety backup.",{title:"Restore this cloud backup?",confirmLabel:"Restore backup"})) return;
    restoring = true; clearTimeout(timer); $("cloudRestore").disabled = true;
    try {
      status("Downloading and decrypting your backup...");
      const snapshot = JSON.parse(new TextDecoder().decode(await C.decrypt(await download(chosen), password, key, salt)));
      if (snapshot.app !== "unscripted-cloud" || snapshot.version !== 1 || !Array.isArray(snapshot.entries) || !Array.isArray(snapshot.audios)) throw new Error("Invalid cloud snapshot.");
      if (snapshot.entries.some(e => !e || typeof e.id !== "string" || !Array.isArray(e.parts))) throw new Error("Invalid diary entries.");
      const audioRows = []; let bytes = 0;
      for (const row of snapshot.audios) {
        if (typeof row.id !== "string" || !/^clips\/[a-f0-9]{64}$/.test(row.key)) throw new Error("Invalid audio reference.");
        const data = await C.decrypt(await download(row.key), password, key, salt);
        bytes += data.length;
        if (bytes > 250 * 1024 * 1024) throw new Error("This backup exceeds the 250 MB restore limit on this version. Local data has not been changed.");
        audioRows.push({ id: row.id, blob: new Blob([data], { type: row.type || "audio/webm" }) });
      }
      const present = new Set(audioRows.map(x => x.id));
      if (snapshot.entries.some(e => window.UnscriptedDiary.clips(e).some(c => !present.has(c.id)))) throw new Error("Backup is missing audio. Local data has not been changed.");
      if (window.UnscriptedDiary.entries().length) if (!await window.UnscriptedDiary.exportBackup()) throw new Error("Could not export the local safety backup. Restore cancelled.");
      await window.UnscriptedDiary.restore(snapshot.entries, audioRows);
      if (typeof snapshot.profile === "string") localStorage.setItem("unscripted-reflection-profile", snapshot.profile.slice(0,4000));
      window.UnscriptedDiary.restoreProfiles?.(snapshot.profiles);
      uploaded.clear(); dirty = false;
      status("Cloud backup restored. Your original local entries were exported before replacement.");
    } catch (error) { status("Restore failed: " + error.message, true); }
    finally { restoring = false; $("cloudRestore").disabled = false; }
  }
  $("cloudUnlock").onclick = unlock;
  $("cloudNow").onclick = () => run(true);
  $("cloudList").onclick = listSnapshots;
  $("cloudRestore").onclick = restore;
  $("cloudLock").onclick = () => {
    if (busy || restoring) { status("Wait until the current backup or restore finishes."); return; }
    vault?.forgetBackupKey?.();
    generation++; key = null; password = ""; salt = null; uploaded.clear(); clearTimeout(timer); $("cloudPassword").value = ""; status("Saved backup access removed from this phone. Cloud backups are unchanged. Automatic uploads are paused.");render();
  };
  $("cloudEnabled").onchange = () => { localStorage.setItem("unscripted-cloud-enabled", $("cloudEnabled").checked ? "1" : "0"); if ($("cloudEnabled").checked) schedule(); else { clearTimeout(timer); status("Automatic backups paused."); } render(); };
  window.addEventListener("unscripted-change", schedule);
  window.addEventListener("online", schedule);
  window.addEventListener("unscripted-settings", render);
  render();
  resumeAccess().then(()=>{render();schedule();}).catch(()=>status("Could not load backup access. Open Advanced settings to set it up again.",true));
})();
