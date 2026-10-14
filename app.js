/* Unscripted · private, local-first voice diary */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const DB_NAME = "unscripted-diary";
  const DB_VERSION = 1;
  const CLIP_MS = 120000; // independently playable, auto-saved two-minute clips
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  const state = { db: null, entries: [], view: "home", selected: null, topic: "All", recording: null, urls: [], processing: new Set(), editorCallback: null, toastTimeout: null, openTranscript: false };
  const fmtDate = (iso, full = false) => new Date(iso).toLocaleString(undefined, full ? { weekday: "long", year: "numeric", month: "long", day: "numeric" } : { day: "numeric", month: "short", year: "numeric" });
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const fmtDuration = (ms) => { const m = Math.floor((ms || 0) / 60000); const s = Math.floor(((ms || 0) % 60000) / 1000); return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0"); };
  const audioTime = (ms) => ms >= 60000 ? Math.round(ms / 60000) + " min" : Math.max(1, Math.ceil((ms || 0) / 1000)) + " sec";
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const make = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  function showToast(message) { const toast = $("toast"); toast.textContent = message; toast.hidden = false; clearTimeout(state.toastTimeout); state.toastTimeout = setTimeout(() => toast.hidden = true, 4200); }
  function notice(id, text, error = false) { const el = $(id); el.hidden = !text; el.textContent = text || ""; el.classList.toggle("error", !!error); }
  function getDb() { return new Promise((resolve, reject) => { const req = indexedDB.open(DB_NAME, DB_VERSION); req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains("entries")) db.createObjectStore("entries", { keyPath: "id" }); if (!db.objectStoreNames.contains("audio")) db.createObjectStore("audio", { keyPath: "id" }); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  function transaction(storeName, mode, operation) { return new Promise((resolve, reject) => { const tx = state.db.transaction(storeName, mode); const req = operation(tx.objectStore(storeName)); tx.oncomplete = () => resolve(req?.result); tx.onerror = () => reject(tx.error || req?.error); tx.onabort = () => reject(tx.error || new Error("Storage transaction aborted")); }); }
  const saveEntry = async (entry) => { entry.updatedAt = new Date().toISOString(); await transaction("entries", "readwrite", (s) => s.put(entry)); window.dispatchEvent(new Event("unscripted-change")); };
  const getAudio = (id) => transaction("audio", "readonly", (s) => s.get(id)).then((row) => row?.blob);
  const saveAudio = (id, blob) => transaction("audio", "readwrite", (s) => s.put({ id, blob }));
  const deleteAudio = (id) => transaction("audio", "readwrite", (s) => s.delete(id));
  async function refreshEntries() { state.entries = (await transaction("entries", "readonly", (s) => s.getAll()) || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  const currentEntry = () => state.entries.find((entry) => entry.id === state.selected);
  const allParts = (entry) => entry.parts || [];
  const allClips = (entry) => allParts(entry).filter((p) => p.type === "recording").flatMap((p) => p.clips || []);
  const totalTime = (entry) => allClips(entry).reduce((sum, clip) => sum + (clip.duration || 0), 0);
  const transcriptText = (entry) => allParts(entry).map((part) => part.type === "note" ? (part.text || "") : (part.clips || []).map((c) => c.transcript || "").join(" ")).join("\n");
  const sortedParts = (entry) => allParts(entry).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  function privateHost() { return !!document.querySelector('meta[name="unscripted-private-host"]'); }
  function activeAI() { const { url, code } = getApiConfig(); return /^https:\/\//.test(url) && (!!code || privateHost()); }
  function switchView(view) {
    if (state.recording) { showToast("Save or pause your recording first."); return; }
    if (view !== "entry") document.querySelectorAll?.(".recording-player").forEach(player => player.pause());
    state.view = view;
    for (const id of ["homeView", "entryView", "askView", "settingsView"]) $(id).hidden = id !== ({ home: "homeView", entry: "entryView", ask: "askView", settings: "settingsView" }[view]);
    $("navLibrary").classList.toggle("selected", view === "home" || view === "entry");
    $("navAsk").classList.toggle("selected", view === "ask");
    window.scrollTo({ top: 0, behavior: "instant" });
    if (view === "home") renderHome();
    if (view === "entry") renderEntry();
    if (view === "settings") renderSettings();
  }
  function searchMatches(entry, query) { return [entry.title, entry.summary, (entry.tags || []).join(" "), transcriptText(entry)].join(" ").toLowerCase().includes(query.toLowerCase()); }
  function renderHome() {
    const list = $("entriesList"); list.replaceChildren();
    $("entryCount").textContent = state.entries.length + (state.entries.length === 1 ? " entry" : " entries");
    const last = state.entries[0]; $("continueLastButton").hidden = !last;
    if (last) $("continueLastButton").textContent = "↗ Continue “" + (last.title || "your last entry") + "”";
    const tags = [...new Set(state.entries.flatMap((e) => e.tags || []))].sort((a, b) => a.localeCompare(b));
    if (state.topic !== "All" && !tags.includes(state.topic)) state.topic = "All";
    const filters = $("topicFilters"); filters.replaceChildren();
    for (const topic of ["All", ...tags]) {
      const chip = make("button", "filter-chip" + (state.topic === topic ? " selected" : ""), topic);
      chip.type = "button"; chip.onclick = () => { state.topic = topic; renderHome(); }; filters.append(chip);
    }
    const query = $("searchInput").value.trim();
    const selected = state.entries.filter((e) => (state.topic === "All" || (e.tags || []).includes(state.topic)) && (!query || searchMatches(e, query)));
    if (!selected.length) {
      const empty = make("div", "empty-state"); empty.append(make("strong", "", query || state.topic !== "All" ? "Nothing found, yet." : "Your thoughts will live here."), make("span", "", query || state.topic !== "All" ? "Try another search or category." : "Start recording and make this space your own.")); list.append(empty); return;
    }
    for (const entry of selected) {
      const card = make("button", "entry-card"); card.type = "button"; card.onclick = () => openEntry(entry.id);
      const top = make("div", "card-top"); top.append(make("span", "", fmtDate(entry.createdAt)), make("span", "", `${allParts(entry).length} part${allParts(entry).length === 1 ? "" : "s"} · ${audioTime(totalTime(entry))} audio`));
      if(entry.kind==="interview"){const badge=make("span","interview-badge","✦ Interview"+(entry.interview?.complete?"":" · in progress"));top.replaceChildren(badge,make("span","",fmtDate(entry.createdAt)));}
      card.append(top, make("h3", "", entry.title || "Untitled thought"), make("p", "", entry.summary || (transcriptText(entry) ? transcriptText(entry).slice(0, 200) : "A thought worth keeping. Tap to add more or read it.")));
      const row = make("div", "tag-row"); for (const tag of (entry.tags || []).slice(0, 4)) row.append(make("span", "tag", tag)); card.append(row); list.append(card);
    }
  }
  function revokeUrls() { state.urls.forEach((url) => URL.revokeObjectURL(url)); state.urls = []; }
  function openEntry(id) { state.selected = id; state.openTranscript = false; $("transcriptArea").hidden = true; $("transcriptToggle").setAttribute("aria-expanded", "false"); switchView("entry"); }
  function renderEntry() {
    const entry = currentEntry(); if (!entry) { switchView("home"); return; }
    renderReflection(entry);
    document.querySelectorAll(".recording-player").forEach(player => player.dispose());
    revokeUrls();
    $("entryDate").textContent = fmtDate(entry.createdAt, true).toUpperCase();
    $("entryTitle").textContent = entry.title || "Untitled thought";
    $("interviewEntryStatus").hidden=entry.kind!=="interview";
    $("interviewEntryStatus").textContent=entry.kind==="interview"?"✦ Interview · "+(entry.interview?.goal||"Explore your thoughts"):"";
    const clips = allClips(entry);
    $("entryDuration").textContent = `${sortedParts(entry).filter((p) => p.type === "recording").length} recording(s) · ${audioTime(totalTime(entry))} of audio · ${sortedParts(entry).filter((p) => p.type === "note").length} written note(s)`;
    const container = $("entryParts"); container.replaceChildren();
    sortedParts(entry).forEach((part, index) => {
      const box = make("div", "part-card"); const head = make("div", "part-head");
      head.append(make("strong", "", part.type === "note" ? (part.interviewQuestion ? "✦ Interview question " : "✎ Written addition ") + (index + 1) : "🎙 Recording " + (index + 1)), make("small", "", fmtDate(part.createdAt) + " · " + fmtTime(part.createdAt)));
      box.append(head);
      if (part.type === "note") {
        box.append(make("p", "", part.text || ""));
        if(part.interviewQuestion)for(const id of part.sourceIds||[]){const source=state.entries.find(item=>item.id===id);if(!source)continue;const link=make("button","source-link",fmtDate(source.createdAt)+" · "+source.title);link.type="button";link.onclick=()=>openEntry(id);box.append(link);}
        const edit = make("button", "", "Edit note"); edit.type = "button"; edit.onclick = () => openEditor("Edit note", part.text || "", async (value) => { part.text = value; await saveEntry(entry); await refreshEntries(); renderEntry(); if (activeAI()) processEntry(entry.id); }); box.append(edit);
      } else {
        const segments = part.clips || [];
        const audio = window.UnscriptedRecordingPlayer.create(segments, getAudio, "recording " + (index + 1));
        box.append(audio);
        const pending = segments.filter((s) => !s.transcript).length;
        if (pending) box.append(make("div", "tiny", "Awaiting transcription"));
      }
      container.append(box);
    });
    if (!entry.parts?.length) container.append(make("div", "empty-state", "Add a recording or a written note to begin."));
    const busy = state.processing.has(entry.id);
    $("transcribeButton").disabled = busy; $("summaryActionLabel").innerHTML = busy ? "Refreshing<br>summary…" : "Refresh<br>summary";
    notice("entryStatus", busy ? "Working on your transcripts and summary. Keep the page open while it finishes." : entry.aiError ? entry.aiError : (!activeAI() && clips.some((c) => !c.transcript) ? "Audio saved. Connect your private AI backend in Settings to transcribe it automatically." : ""), !!entry.aiError);
    $("entrySummary").textContent = entry.summary || (transcriptText(entry) ? "No summary yet. You can write one yourself or connect AI." : "No summary yet. Your original audio is saved; nothing has been invented.");
    const tags = $("entryTags"); tags.replaceChildren();
    if (!(entry.tags || []).length) tags.append(make("span", "muted", "No topics yet."));
    else (entry.tags || []).forEach((tag) => tags.append(make("span", "tag", tag)));
    $("transcriptArrow").textContent = state.openTranscript ? "⌃" : "⌄";
    $("transcriptArea").hidden = !state.openTranscript;
    if (state.openTranscript) renderTranscript(entry);
  }
  function renderTranscript(entry) {
    const target = $("transcriptArea"); target.replaceChildren();
    for (const part of sortedParts(entry)) {
      const div = make("div", "transcript-part"); div.append(make("div", "transcript-head", (part.type === "note" ? "Written note" : "Voice recording") + " · " + fmtDate(part.createdAt) + " at " + fmtTime(part.createdAt)));
      const body = part.type === "note" ? part.text : (part.clips || []).map((c) => c.transcript || "[Audio waiting for transcription]").join("\n\n");
      div.append(make("p", "", body || "No transcript yet.")); target.append(div);
    }
  }
  function openEditor(title, value, callback, label = "Your text") { state.editorCallback = callback; $("editorTitle").textContent = title; $("editorLabel").textContent = label; $("editorInput").value = value; $("editorModal").hidden = false; $("editorInput").focus(); }
  function closeEditor() { $("editorModal").hidden = true; state.editorCallback = null; }
  async function submitEditor() { const cb = state.editorCallback; if (!cb) return; const value = $("editorInput").value.trim(); closeEditor(); try { await cb(value); } catch (error) { showToast("Could not save: " + error.message); } }
  function openChoice() { if (!currentEntry()) return; $("choiceModal").hidden = false; }
  function closeChoice() { $("choiceModal").hidden = true; }
  function newEntry() { const now = new Date().toISOString(); return { id: uid(), title: "A thought from " + fmtDate(now), summary: "", tags: [], parts: [], createdAt: now, updatedAt: now, aiError: "" }; }
  async function writeThought(id) {
    if (!id) { const entry = newEntry(); await saveEntry(entry); await refreshEntries(); id = entry.id; }
    openEntry(id);
    openEditor("Add a written thought", "", async (value) => {
      if (!value) return;
      const entry = state.entries.find((e) => e.id === id); if (!entry) return;
      entry.parts.push({ type: "note", id: uid(), createdAt: new Date().toISOString(), text: value });
      await saveEntry(entry); await refreshEntries(); renderEntry(); if (activeAI()) processEntry(id);
    }, "What would you like to add?");
  }
  function supportedMime() { if (!window.MediaRecorder) return ""; return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type)) || ""; }
  async function startRecording(entryId) {
    if (state.recording) return;
    if (window.UnscriptedQuiz?.recording()) {showToast("Finish your quiz voice answer first.");return;}
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !window.indexedDB) { showToast("This browser does not support recording. Use Chrome on HTTPS or localhost."); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }); }
    catch (error) { showToast("Microphone access was not granted: " + (error.message || "check permissions")); return; }
    try {
      let entry = state.entries.find((e) => e.id === entryId);
      if (!entry) { entry = newEntry(); await saveEntry(entry); await refreshEntries(); }
      const part = { type: "recording", id: uid(), createdAt: new Date().toISOString(), clips: [] };
      entry.parts.push(part); await saveEntry(entry); await refreshEntries();
      const recording = { entryId: entry.id, partId: part.id, stream, recorder: null, mime: supportedMime(), paused: false, closing: false, saving: false, totalMs: 0, clipStarted: 0, ticker: null, rotation: null };
      state.recording = recording;
      $("recordTarget").textContent = entry.parts.length === 1 ? "A new entry" : "Adding to “" + entry.title + "”";
      $("recorderSheet").hidden = false;
      $("recordTimer").textContent="00:00"; startClip(recording); updateRecorderUI();
      if (!recording.closing) recording.ticker = setInterval(() => updateRecorderUI(), 500);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      state.recording = null; $("recorderSheet").hidden = true;
      showToast("Could not start recording: " + error.message);
    }
  }
  function startClip(rec) {
    if (rec.closing || rec.paused) return;
    let recorder;
    try { recorder = new MediaRecorder(rec.stream, { ...(rec.mime ? { mimeType: rec.mime } : {}), audioBitsPerSecond: 48000 }); }
    catch (error) { try { recorder = new MediaRecorder(rec.stream); } catch (err) { handleRecordingError(rec, err); return; } }
    rec.recorder = recorder;
    let pieces = [];
    recorder.ondataavailable = (event) => { if (event.data && event.data.size) pieces.push(event.data); };
    recorder.onerror = (event) => { handleRecordingError(rec, event.error || new Error("Recorder error")); };
    recorder.onstop = async () => {
      if (rec !== state.recording) return;
      if (rec.cancelled) {await finishRecordingSession(rec);return;}
      clearTimeout(rec.rotation);
      const duration = Math.max(0, Date.now() - rec.clipStarted);
      rec.totalMs += duration;
      rec.saving = true;
      updateRecorderUI();
      try {
        const blob = new Blob(pieces, { type: (pieces[0] && pieces[0].type) || recorder.mimeType || rec.mime || "audio/webm" });
        if (blob.size > 0) {
          const audioId = uid();
          await saveAudio(audioId, blob);
          const entry = state.entries.find((e) => e.id === rec.entryId);
          const part = entry?.parts.find((p) => p.id === rec.partId);
          if (!part) throw new Error("Recording entry missing");
          part.clips.push({ id: audioId, duration, mime: blob.type, transcript: "" });
          await saveEntry(entry);
        }
      } catch (error) {
        // In particular, quota errors must not be silently swallowed.
        rec.paused = true;
        showToast("Audio could not be saved: " + error.message);
      }
      rec.saving = false;
      if (rec.closing) { await finishRecordingSession(rec); }
      else if (!rec.paused) startClip(rec);
      else updateRecorderUI();
    };
    try { recorder.start(); rec.clipStarted = Date.now(); rec.rotation = setTimeout(() => flushClip(rec), CLIP_MS); }
    catch (error) { handleRecordingError(rec, error); }
  }
  function flushClip(rec) { if (!rec || rec.saving || rec.recorder?.state !== "recording") return; clearTimeout(rec.rotation); try { rec.recorder.stop(); } catch (error) { handleRecordingError(rec, error); } }
  function handleRecordingError(rec, error) { console.error(error); showToast("Recording stopped: " + (error.message || "audio failure")); rec.closing = true; if (rec.recorder?.state === "recording") flushClip(rec); else finishRecordingSession(rec); }
  function updateRecorderUI() {
    const rec = state.recording; if (!rec) return;
    const current = !rec.clipStarted || rec.saving || rec.paused || rec.closing ? 0 : Math.max(0, Date.now() - rec.clipStarted);
    $("recordTimer").textContent = fmtDuration(rec.totalMs + current);
    $("recorderSheet").classList.toggle("paused", rec.paused || rec.saving);
    $("recordState").textContent = rec.saving ? "Saving this audio clip..." : rec.closing ? "Finishing and saving..." : rec.paused ? "Paused · tap Resume to keep going" : "Recording · your thoughts are being saved in short clips";
    $("pauseRecording").textContent = rec.paused ? "▶ Resume" : "Ⅱ Pause";
    $("pauseRecording").disabled = rec.saving || rec.closing;
    $("finishRecording").disabled = rec.closing;
  }
  function togglePause() {
    const rec = state.recording; if (!rec || rec.saving || rec.closing) return;
    if (rec.paused) { rec.paused = false; startClip(rec); }
    else { rec.paused = true; if (rec.recorder?.state === "recording") flushClip(rec); }
    updateRecorderUI();
  }
  function stopRecording() {
    const rec = state.recording; if (!rec || rec.closing) return;
    rec.closing = true;
    if (rec.recorder?.state === "recording") flushClip(rec);
    else if (!rec.saving) finishRecordingSession(rec);
    updateRecorderUI();
  }
  function requestCancelRecording() {
    const rec=state.recording;if(!rec||rec.closing)return;
    $("cancelRecordingModal").hidden=false;
  }
  function cancelRecording() {
    const rec=state.recording;if(!rec||rec.closing)return;
    $("cancelRecordingModal").hidden=true;
    rec.cancelled=true;rec.closing=true;
    clearTimeout(rec.rotation);clearInterval(rec.ticker);
    if(rec.recorder?.state==="recording")rec.recorder.stop();
    else if(!rec.saving)finishRecordingSession(rec);
    rec.stream.getTracks().forEach(track=>track.stop());
    updateRecorderUI();
  }
  async function finishRecordingSession(rec) {
    if (rec !== state.recording || rec.finishing) return;
    rec.finishing=true;
    clearTimeout(rec.rotation); clearInterval(rec.ticker);
    rec.stream.getTracks().forEach((track) => track.stop());
    if(rec.cancelled) {
      try {
        const entry=await transaction("entries","readonly",store=>store.get(rec.entryId));
        if(entry){
          const discarded=entry.parts.find(part=>part.id===rec.partId);
          entry.parts=entry.parts.filter(part=>part.id!==rec.partId);
          await new Promise((resolve,reject)=>{
            const tx=state.db.transaction(["entries","audio"],"readwrite");
            for(const clip of discarded?.clips||[])tx.objectStore("audio").delete(clip.id);
            if(entry.parts.length){entry.updatedAt=new Date().toISOString();tx.objectStore("entries").put(entry);}
            else tx.objectStore("entries").delete(entry.id);
            tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("Cancellation failed"));
          });
        }
        $("recorderSheet").hidden=true;state.recording=null;await refreshEntries();
        window.dispatchEvent(new Event("unscripted-change"));
        if(state.entries.some(e=>e.id===rec.entryId))openEntry(rec.entryId);else switchView("home");
        showToast("Recording discarded. Earlier entries are unchanged.");
      } catch(error) {
        $("recorderSheet").hidden=true;state.recording=null;await refreshEntries();switchView("home");
        showToast("Could not discard recording: "+error.message+". Check the saved entry.");
      }
      return;
    }
    $("recorderSheet").hidden = true; state.recording = null;
    await refreshEntries(); openEntry(rec.entryId);
    showToast("Recording saved to your diary ✦");
    if (activeAI()) processEntry(rec.entryId);
  }
  async function saveInterview(document, id) {
    let entry=id?await transaction("entries","readonly",store=>store.get(id)):null;
    if(!entry||entry.kind!=="interview"){
      if(!document.answers.some(answer=>answer.answer?.trim()))return null;
      entry=newEntry();entry.kind="interview";entry.title="Interview · "+(document.goal||"A little of everything").slice(0,70);
    }
    const notes=document.answers.map((answer,index)=>({
      type:"note",id:answer.id||uid(),createdAt:answer.createdAt||new Date().toISOString(),interviewQuestion:true,
      text:"Question "+(index+1)+": "+answer.question+"\n\n"+(answer.skipped?"Skipped":"Your answer: "+answer.answer),
      sourceIds:Array.isArray(answer.sourceIds)?answer.sourceIds:[]
    }));
    entry.parts=[...notes,...allParts(entry).filter(part=>!part.interviewQuestion)];
    entry.interview={goal:document.goal,complete:!!document.complete,answers:document.answers,updatedAt:new Date().toISOString()};
    entry.tags=[...new Set([...(entry.tags||[]),"Interview"])];
    entry.userTags=[...new Set([...(entry.userTags||[]),"Interview"])];
    await saveEntry(entry);await refreshEntries();if(state.view==="home")renderHome();
    if(document.complete&&activeAI())processEntry(entry.id);
    return entry.id;
  }
  function profileData() {
    const keys=["unscripted-personal-profile","unscripted-reflection-profile","unscripted-know-quiz","unscripted-reflection-quiz","unscripted-interview-draft"];
    return Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)||""]));
  }
  function restoreProfileData(profiles) {
    if(!profiles||typeof profiles!=="object")return;
    for(const key of Object.keys(profileData())){
      const value=profiles[key];if(typeof value!=="string"||value.length>60000)continue;
      if(key.endsWith("-quiz")||key==="unscripted-interview-draft"){
        let parsed;try{parsed=JSON.parse(value);}catch{continue;}
        if(!Array.isArray(parsed.answers)||parsed.answers.length>6||parsed.answers.some(x=>typeof x.question!=="string"||typeof x.answer!=="string"))continue;
      }
      localStorage.setItem(key,value);
    }
    window.dispatchEvent(new Event("unscripted-settings"));
  }
  function getApiConfig() { return { url: (privateHost() ? location.origin : localStorage.getItem("unscripted-api-url") || "").replace(/\/+$/, ""), code: sessionStorage.getItem("unscripted-access-code") || localStorage.getItem("unscripted-access-code") || "" }; }
  async function callAI(path, body, asForm = false) {
    const { url, code } = getApiConfig(); if (!/^https:\/\//.test(url) || (!code && !privateHost())) throw new Error("Connect your private AI backend in Settings first.");
    const response = await fetch(url + path, { method: "POST", credentials: "same-origin", headers: { ...(code ? { Authorization: "Bearer " + code } : {}), ...(asForm ? {} : { "Content-Type": "application/json" }) }, body: asForm ? body : JSON.stringify(body) });
    const raw = await response.text(); let result; try { result = JSON.parse(raw); } catch (_) { throw new Error("AI server returned a non-JSON response."); }
    if (!response.ok || result.error) throw new Error(result.error || "AI request failed (" + response.status + ")");
    return result;
  }
  async function processEntry(id) {
    if (state.processing.has(id)) return;
    state.processing.add(id); if (state.view === "entry" && state.selected === id) renderEntry();
    try {
      const entry = state.entries.find((e) => e.id === id); if (!entry) return;
      entry.aiError = "";
      for (const part of sortedParts(entry)) {
        if (part.type !== "recording") continue;
        for (const clip of part.clips || []) {
          if (clip.transcript) continue;
          const blob = await getAudio(clip.id); if (!blob) throw new Error("Missing audio clip on this device.");
          if (blob.size > 24 * 1024 * 1024) throw new Error("A clip is over 24 MB. Add it manually in smaller parts.");
          const form = new FormData(); const mime = blob.type || clip.mime || "audio/webm";
          const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
          form.append("file", blob, "diary-clip." + ext);
          const data = await callAI("/transcribe", form, true);
          clip.transcript = typeof data.text === "string" ? data.text.trim() : "";
          await saveEntry(entry); // progressive saving: don't lose successful transcripts on failure
          if (state.view === "entry" && state.selected === id) renderEntry();
        }
      }
      const content = sortedParts(entry).map((part) => ({ createdAt: part.createdAt, type: part.type, text: part.type === "note" ? part.text : (part.clips || []).map((c) => c.transcript || "").join(" ") })).filter((p) => p.text?.trim());
      if (!content.length) throw new Error("There's no transcribed or written text to summarise yet.");
      const data = await callAI("/organize", { content, existingTitle: entry.title, existingTags: entry.tags || [], personalProfile: (localStorage.getItem("unscripted-personal-profile") || "").slice(0,4000) });
      if (typeof data.title === "string" && data.title.trim() && !entry.titleEdited) entry.title = data.title.trim().slice(0, 120);
      if (typeof data.summary === "string" && !entry.summaryEdited) entry.summary = data.summary.trim();
      if (Array.isArray(data.tags)) {
        const tags = data.tags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim().slice(0, 45));
        // Preserve manually added tags, plus fresh AI suggestions.
        entry.tags = [...new Set([...(entry.userTags || []), ...tags])].slice(0, 15);
      }
      entry.aiError = ""; await saveEntry(entry); showToast("Transcription and summary ready ✦");
    } catch (error) {
      const entry = state.entries.find((e) => e.id === id);
      if (entry) { entry.aiError = "AI processing paused: " + error.message + " Your original audio is still saved. Tap 'Transcribe' to retry."; await saveEntry(entry).catch(() => {}); }
    } finally { state.processing.delete(id); await refreshEntries().catch(() => {}); if (state.view === "entry" && state.selected === id) renderEntry(); else if (state.view === "home") renderHome(); }
  }
  function renderSettings() { $("apiUrl").value = getApiConfig().url; $("apiUrl").readOnly = privateHost(); $("privateSignOut").hidden = !privateHost(); window.dispatchEvent(new Event("unscripted-settings")); $("accessCode").value = sessionStorage.getItem("unscripted-access-code") || localStorage.getItem("unscripted-access-code") || ""; $("rememberCode").checked = !!localStorage.getItem("unscripted-access-code"); $("accentSwatch").style.background = getComputedStyle(document.documentElement).getPropertyValue("--accent"); }
  function saveApiSettings() { const url = $("apiUrl").value.trim().replace(/\/+$/, ""); if (url && (!url.startsWith("https://") || !URL.canParse(url))) { notice("settingsStatus", "Use a full HTTPS backend address.", true); return; } localStorage.setItem("unscripted-api-url", url); sessionStorage.setItem("unscripted-access-code", $("accessCode").value.trim()); if ($("rememberCode").checked) localStorage.setItem("unscripted-access-code", $("accessCode").value.trim()); else localStorage.removeItem("unscripted-access-code"); notice("settingsStatus", activeAI() ? "Connection saved for this browser tab. New recordings will be transcribed automatically when you save them." : "Saved. Add a backend address and access code to enable AI."); }
  function chooseAskSources(question) {
    const words = question.toLowerCase().split(/\W+/).filter((x) => x.length > 3);
    const entries = state.entries.filter((e) => transcriptText(e).trim());
    const scored = entries.map((entry) => ({ entry, score: words.reduce((t, w) => t + (transcriptText(entry).toLowerCase().includes(w) ? 2 : 0) + ((entry.title + " " + (entry.tags || []).join(" ")).toLowerCase().includes(w) ? 4 : 0), 0) }));
    // Include both recent and older entries so historical comparisons have chronological coverage.
    scored.sort((a, b) => b.score - a.score);
    const selected = scored.slice(0, 32).map((v) => v.entry);
    const old = entries.slice(-8); for (const e of old) if (!selected.includes(e)) selected.push(e);
    selected.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let used = 0, truncated = false;
    const sources = [];
    for (const entry of selected) {
      const prefix = `[${entry.id}] ${entry.createdAt} ${entry.title}\nTags: ${(entry.tags || []).join(", ")}\n`;
      const full = sortedParts(entry).map((p) => `[${p.createdAt}] ` + (p.type === "note" ? p.text : (p.clips || []).map((c) => c.transcript || "").join(" "))).join("\n");
      const remaining = 125000 - used - prefix.length;
      if (remaining <= 100) { truncated = true; break; }
      const body = full.slice(0, Math.min(remaining, 11000));
      if (body.length < full.length) truncated = true;
      sources.push({ id: entry.id, date: entry.createdAt, title: entry.title, text: prefix + body }); used += prefix.length + body.length;
    }
    if (selected.length < entries.length) truncated = true;
    return { sources, truncated };
  }
  async function askDiary(event) {
    event.preventDefault(); const question = $("askInput").value.trim(); if (!question) return;
    if (!activeAI()) { notice("askStatus", "Connect your private AI backend in Settings first.", true); return; }
    const { sources, truncated } = chooseAskSources(question);
    if (!sources.length) { notice("askStatus", "Add and transcribe some recordings (or written thoughts) before asking your diary.", true); return; }
    $("askSubmit").disabled = true; $("askResult").hidden = true; notice("askStatus", "Reading your recorded thoughts...");
    try {
      const result = await callAI("/ask", { question, sources, truncated });
      notice("askStatus", truncated ? "Some source entries or transcript text were excluded due to context limits. Treat this as a partial-history analysis." : "");
      const target = $("askResult"); target.replaceChildren(); target.append(make("div", "", result.answer || "No answer returned."));
      const heading = make("h3", "", "Sources from your diary"); heading.style.cssText = "font-size:15px;margin:20px 0 8px"; target.append(heading);
      const references = (Array.isArray(result.sourceIds) ? result.sourceIds : []).filter((id) => sources.some((x) => x.id === id));
      if (!references.length) target.append(make("div", "tiny", "No specific entries cited. Treat this analysis cautiously."));
      for (const id of references) { const entry = state.entries.find((e) => e.id === id); if (!entry) continue; const b = make("button", "source-link", fmtDate(entry.createdAt) + " · " + entry.title); b.type = "button"; b.onclick = () => openEntry(id); target.append(b); }
      target.hidden = false;
    } catch (error) { notice("askStatus", "Could not analyse diary: " + error.message, true); }
    finally { $("askSubmit").disabled = false; }
  }
  const reflecting = new Set();
  function renderReflection(entry) {
    const last = (entry.reflections || []).at(-1);
    $("reflectionQuestion").textContent = last?.question || "";
    $("reflectionQuestion").hidden = !last;
    $("reflectButton").disabled = reflecting.has(entry.id);
    $("perspectiveActionLabel").innerHTML = reflecting.has(entry.id) ? "Finding a<br>perspective…" : "Another<br>perspective";
    const target = $("reflectionSources"); target.replaceChildren();
    for (const id of last?.sourceIds || []) {
      const source = state.entries.find(e => e.id === id); if (!source) continue;
      const button = make("button", "source-link", fmtDate(source.createdAt) + " · " + source.title);
      button.type = "button"; button.onclick = () => openEntry(id); target.append(button);
    }
  }
  async function reflectEntry() {
    const entry = currentEntry(); if (!entry || reflecting.has(entry.id)) return;
    notice("reflectionStatus", "");
    if (!activeAI()) { notice("reflectionStatus", "Connect AI in Settings first.", true); return; }
    const text = transcriptText(entry).trim();
    if (!text) { notice("reflectionStatus", "Transcribe this recording first, or add a written thought.", true); return; }
    reflecting.add(entry.id); renderReflection(entry);
    try {
      const { sources, truncated } = chooseAskSources(entry.title + " " + (entry.tags || []).join(" ") + " " + text.slice(-2500));
      const history = sources.filter(x => x.id !== entry.id).slice(0,12).map(x => ({...x, text:x.text.slice(0,2500)}));
      const result = await callAI("/reflect", {
        entry: { id: entry.id, date: entry.createdAt, text: text.slice(0,24000) },
        sources: history, profile: ("ABOUT ME: "+(localStorage.getItem("unscripted-personal-profile")||"").slice(0,2000)+"\nREFLECTION CONTEXT: "+(localStorage.getItem("unscripted-reflection-profile")||"").slice(0,2000)).slice(0,4100),
        previous: (entry.reflections || []).slice(-12).map(x => x.question),
        truncated: truncated || text.length > 24000 || sources.length > history.length + 1
      });
      if (typeof result.question !== "string" || !result.question.trim()) throw new Error("No reflection question returned.");
      // Retrieve the freshest row so edits made during the request are preserved.
      const fresh = await transaction("entries", "readonly", s => s.get(entry.id));
      if (!fresh) return;
      fresh.reflections = [...(fresh.reflections || []), {question: result.question, sourceIds: result.sourceIds || [], createdAt: new Date().toISOString()}].slice(-50);
      await saveEntry(fresh); await refreshEntries();
      if (state.selected === entry.id) {
        renderReflection(currentEntry());
        notice("reflectionStatus", "Based on this entry, your saved context and selected diary excerpts. History may be incomplete.");
      }
    } catch (error) { if (state.selected === entry.id) notice("reflectionStatus", error.message, true); }
    finally { reflecting.delete(entry.id); if (state.selected === entry.id && currentEntry()) renderReflection(currentEntry()); }
  }
  async function deleteEntry() { const entry = currentEntry(); if (!entry || !await window.UnscriptedConfirm("Delete this entry and all its audio? This cannot be undone. Older cloud backups may still contain it.",{title:"Delete this entry?",confirmLabel:"Delete entry",danger:true})) return; try { for (const clip of allClips(entry)) await deleteAudio(clip.id); await transaction("entries", "readwrite", (s) => s.delete(entry.id)); await refreshEntries(); window.dispatchEvent(new Event("unscripted-change")); switchView("home"); showToast("Entry deleted. Older cloud backups may still contain this entry."); } catch (error) { showToast("Delete failed: " + error.message); } }
  function blobToDataURL(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }
  async function exportBackup() {
    const button = $("exportBackup"); button.disabled = true; button.textContent = "Preparing backup...";
    try {
      const audios = [];
      for (const entry of state.entries) for (const clip of allClips(entry)) {
        const blob = await getAudio(clip.id); if (blob) audios.push({ id: clip.id, content: await blobToDataURL(blob) });
      }
      const data = { app: "unscripted", version: 1, profiles: profileData(), profile: localStorage.getItem("unscripted-reflection-profile") || "", exportedAt: new Date().toISOString(), entries: state.entries, audios };
      const file = new Blob([JSON.stringify(data)], { type: "application/json" });
      const link = document.createElement("a"); const url = URL.createObjectURL(file);
      link.href = url; link.download = "unscripted-backup-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      showToast("Backup ready. Keep it somewhere private."); return true;
    } catch (error) { showToast("Could not export backup: " + error.message); return false; }
    finally { button.disabled = false; button.textContent = "↓ Export backup"; }
  }
  function dataURLtoBlob(data) { const parts = data.match(/^data:([^;]+);base64,(.+)$/s); if (!parts) throw new Error("Invalid audio in backup"); const binary = atob(parts[2]); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return new Blob([bytes], { type: parts[1] }); }
  async function importBackup(file) {
    if (!file) return;
    if (!await window.UnscriptedConfirm("Entries with matching IDs will be replaced. Other entries will stay.",{title:"Import this backup?",confirmLabel:"Import backup"})) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "unscripted" || data.version !== 1 || !Array.isArray(data.entries) || !Array.isArray(data.audios)) throw new Error("Not an Unscripted v1 backup.");
      for (const row of data.audios) if (typeof row.id === "string" && typeof row.content === "string") await saveAudio(row.id, dataURLtoBlob(row.content));
      for (const entry of data.entries) if (typeof entry.id === "string" && Array.isArray(entry.parts)) await saveEntry(entry);
      if (typeof data.profile === "string") localStorage.setItem("unscripted-reflection-profile", data.profile.slice(0,4000)); restoreProfileData(data.profiles);
      await refreshEntries(); switchView("home"); showToast("Backup imported ✦");
    } catch (error) { showToast("Import failed: " + error.message); }
    $("backupInput").value = "";
  }
  // Colour picker: the same hue/saturation wheel, brightness and recents as Friend Dossier.
  const accent = { h: 0, s: 0, v: 1, colour: "#b8d2ab", pointer: null };
  function hexRgb(hex) { return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]; }
  function rgbHsv(hex) { let [r,g,b] = hexRgb(hex).map(x=>x/255); const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min; let h=0; if(d){if(max===r)h=60*(((g-b)/d)%6);else if(max===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4);}return {h:(h+360)%360,s:max===0?0:d/max,v:max}; }
  function hsvHex(h,s,v) {const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let r=0,g=0,b=0;if(h<60){r=c;g=x}else if(h<120){r=x;g=c}else if(h<180){g=c;b=x}else if(h<240){g=x;b=c}else if(h<300){r=x;b=c}else{r=c;b=x}return "#"+[r,g,b].map(n=>Math.round((n+m)*255).toString(16).padStart(2,"0")).join("");}
  function applyAccent(hex) { if (!/^#[\da-f]{6}$/i.test(hex)) return; document.documentElement.style.setProperty("--accent",hex); $("accentSwatch").style.background=hex; document.querySelector('meta[name="theme-color"]').content = "#151719"; accent.colour=hex; }
  function updatePicker(){const hex=hsvHex(accent.h,accent.s,accent.v);applyAccent(hex);$("hexReadout").textContent=hex.toUpperCase();$("colourPreview").style.background=hex;const base=hsvHex(accent.h,accent.s,1);$("brightness").style.setProperty("--picker-base",base);$("colourWheel").style.setProperty("--wheel-darkness",String((1-accent.v)*.72));const radius=$("colourWheel").clientWidth/2,angle=accent.h*Math.PI/180;$("colourCursor").style.left=(radius+Math.cos(angle)*accent.s*radius*.92)+"px";$("colourCursor").style.top=(radius+Math.sin(angle)*accent.s*radius*.92)+"px";}
  function setPicker(hex){Object.assign(accent,rgbHsv(hex));$("brightness").value=Math.round(accent.v*100);updatePicker();}
  function openPicker(){ $("colourModal").hidden=false; setPicker(accent.colour); const recents=JSON.parse(localStorage.getItem("unscripted-accent-recents")||"[]");const target=$("recentColours");target.replaceChildren();recents.filter(c=>/^#[\da-f]{6}$/i.test(c)).slice(0,8).forEach(hex=>{const b=make("button");b.style.background=hex;b.title=hex;b.setAttribute("aria-label",hex);b.onclick=()=>setPicker(hex);target.append(b);}); }
  function closePicker(save){$("colourModal").hidden=true;if(save){localStorage.setItem("unscripted-accent",accent.colour);let recent=[];try{recent=JSON.parse(localStorage.getItem("unscripted-accent-recents")||"[]")}catch{}recent=[accent.colour,...recent.filter(x=>x!==accent.colour)].slice(0,8);localStorage.setItem("unscripted-accent-recents",JSON.stringify(recent));}else applyAccent(localStorage.getItem("unscripted-accent")||"#b8d2ab");}
  function chooseWheel(e){const rect=$("colourWheel").getBoundingClientRect();const dx=e.clientX-(rect.left+rect.width/2),dy=e.clientY-(rect.top+rect.height/2),radius=rect.width/2;accent.h=(Math.atan2(dy,dx)*180/Math.PI+360)%360;accent.s=Math.min(Math.hypot(dx,dy)/(radius*.92),1);updatePicker();}
  function bindEvents() {
    $("homeLogo").onclick=()=>switchView("home");$("navLibrary").onclick=()=>switchView("home");$("navAsk").onclick=()=>switchView("ask");$("settingsButton").onclick=()=>switchView("settings");$("settingsBack").onclick=()=>switchView("home");$("entryBack").onclick=()=>switchView("home");
    $("startNewButton").onclick=()=>startRecording(null);$("navRecord").onclick=()=>startRecording(null);$("continueLastButton").onclick=()=>{if(state.entries[0])startRecording(state.entries[0].id);};$("searchInput").oninput=renderHome;
    $("cancelRecordingButton").onclick=requestCancelRecording;$("keepRecordingButton").onclick=()=>{$("cancelRecordingModal").hidden=true;};$("confirmCancelRecording").onclick=cancelRecording;
    $("pauseRecording").onclick=togglePause;$("finishRecording").onclick=stopRecording;
    $("addToEntryButton").onclick=openChoice;$("choiceClose").onclick=closeChoice;$("choiceRecord").onclick=()=>{const id=state.selected;closeChoice();startRecording(id);};$("choiceWrite").onclick=()=>{const id=state.selected;closeChoice();writeThought(id);};$("addNoteButton").onclick=()=>writeThought(state.selected);
    $("editTitleButton").onclick=()=>{const entry=currentEntry();if(entry)openEditor("Give it a title",entry.title,async value=>{entry.title=value||"Untitled thought";entry.titleEdited=true;await saveEntry(entry);await refreshEntries();renderEntry();});};
    $("editSummaryButton").onclick=()=>{const entry=currentEntry();if(entry)openEditor("Edit summary",entry.summary||"",async value=>{entry.summary=value;entry.summaryEdited=true;await saveEntry(entry);await refreshEntries();renderEntry();});};
    $("addTopicButton").onclick=()=>{const entry=currentEntry();if(entry)openEditor("Edit topics",(entry.tags||[]).join(", "),async value=>{entry.tags=[...new Set(value.split(",").map(x=>x.trim()).filter(Boolean))].slice(0,15);entry.userTags=entry.tags.slice();await saveEntry(entry);await refreshEntries();renderEntry();},"Separate topics with commas");};
    $("transcriptToggle").onclick=()=>{state.openTranscript=!state.openTranscript;renderEntry();};$("transcribeButton").onclick=()=>{const entry=currentEntry();if(entry)processEntry(entry.id);};$("deleteEntryButton").onclick=deleteEntry;
    $("closeEditor").onclick=closeEditor;$("editorCancel").onclick=closeEditor;$("editorSave").onclick=submitEditor;$("editorModal").onclick=(e)=>{if(e.target===$("editorModal"))closeEditor();};
    $("choiceModal").onclick=(e)=>{if(e.target===$("choiceModal"))closeChoice();};
    $("reflectButton").onclick=()=>{document.querySelector(".reflection-card").scrollIntoView({behavior:"smooth",block:"start"});reflectEntry();};

    $("privateSignOut").onclick=async()=>{if(state.recording){showToast("Save your recording first.");return;}try{const r=await fetch("/logout",{method:"POST"});if(!r.ok)throw Error("Sign-out failed");localStorage.removeItem("unscripted-access-code");sessionStorage.removeItem("unscripted-access-code");if("caches" in window)for(const name of await caches.keys())if(name.startsWith("unscripted-"))await caches.delete(name);location.reload();}catch(e){showToast(e.message);}};
    $("saveApiSettings").onclick=saveApiSettings;$("askForm").onsubmit=askDiary;document.querySelectorAll(".suggestion").forEach(b=>b.onclick=()=>{$("askInput").value=b.textContent;$("askInput").focus();});
    $("exportBackup").onclick=exportBackup;$("importBackup").onclick=()=>$("backupInput").click();$("backupInput").onchange=(e)=>importBackup(e.target.files[0]);
    $("accentPickerButton").onclick=openPicker;$("colourClose").onclick=()=>closePicker(false);$("doneAccent").onclick=()=>closePicker(true);$("resetAccent").onclick=()=>setPicker("#b8d2ab");$("colourModal").onclick=(e)=>{if(e.target===$("colourModal"))closePicker(false);};
    $("brightness").oninput=()=>{accent.v=Number($("brightness").value)/100;updatePicker();};
    $("colourWheel").addEventListener("pointerdown",e=>{accent.pointer=e.pointerId;$("colourWheel").setPointerCapture(e.pointerId);chooseWheel(e);});$("colourWheel").addEventListener("pointermove",e=>{if(accent.pointer===e.pointerId)chooseWheel(e);});for(const event of ["pointerup","pointercancel"])$("colourWheel").addEventListener(event,e=>{if(accent.pointer===e.pointerId)accent.pointer=null;});
    window.addEventListener("resize",()=>{if(!$("colourModal").hidden)updatePicker();});
    document.addEventListener("keydown",(e)=>{if(e.key==="Escape"){if(!$("cancelRecordingModal").hidden){$("cancelRecordingModal").hidden=true;return;}if(!$("quizModal").hidden){$("quizClose").click();return;}if(!$("colourModal").hidden)closePicker(false);else if(!$("editorModal").hidden)closeEditor();else if(!$("choiceModal").hidden)closeChoice();}});
    window.addEventListener("beforeunload",(e)=>{if(state.recording){e.preventDefault();e.returnValue="";}});
    document.addEventListener("visibilitychange",()=>{if(document.hidden && state.recording && !state.recording.paused)flushClip(state.recording);});
  }
  async function init() {
    bindEvents(); applyAccent(localStorage.getItem("unscripted-accent") || "#b8d2ab");
    try { state.db = await getDb(); await refreshEntries(); renderHome(); }
    catch (error) { showToast("Private storage unavailable: " + error.message); $("startNewButton").disabled=true; $("navRecord").disabled=true; }
    if("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
    if("storage" in navigator && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
  }
  window.UnscriptedDiary = {
    config: getApiConfig, entries: () => state.entries, ready: () => !!state.db, recording: () => !!state.recording,
    audio: getAudio, clips: allClips, exportBackup, callAI, activeAI, toast:showToast, profiles:profileData, restoreProfiles:restoreProfileData, saveInterview, openEntry, sources:chooseAskSources,
    freshEntries: () => transaction("entries", "readonly", s => s.getAll()),
    restore: (entries, audios) => new Promise((resolve,reject) => {
      const tx = state.db.transaction(["entries","audio"], "readwrite");
      for (const row of audios) tx.objectStore("audio").put(row);
      for (const entry of entries) tx.objectStore("entries").put(entry);
      tx.oncomplete = async () => {await refreshEntries();switchView("home");resolve();};
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error("Restore aborted"));
    })
  };
  init();
})();
