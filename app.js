/* Unscripted · private, local-first voice diary */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const DB_NAME = "unscripted-diary";
  const DB_VERSION = 1;
  const CLIP_MS = 120000; // independently playable, auto-saved two-minute clips
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  const state = { db: null, entries: [], view: "home", selected: null, topic: "All", recording: null, urls: [], processing: new Set(), pauseTranscription: new Set(), editorCallback: null, toastTimeout: null, openTranscript: false };
  const fmtDate = (iso, full = false) => new Date(iso).toLocaleString(undefined, full ? { weekday: "long", year: "numeric", month: "long", day: "numeric" } : { day: "numeric", month: "short", year: "numeric" });
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const fmtDuration = (ms) => { const m = Math.floor((ms || 0) / 60000); const s = Math.floor(((ms || 0) % 60000) / 1000); return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0"); };
  const audioTime = (ms) => ms >= 3600000 ? Math.floor(ms/3600000)+" hr "+Math.floor(ms%3600000/60000)+" min" : ms >= 60000 ? Math.round(ms / 60000) + " min" : Math.max(1, Math.ceil((ms || 0) / 1000)) + " sec";
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
  const allClips = (entry) => allParts(entry).filter((p) => p.type === "recording" || p.reflectionAnswer || p.interviewQuestion).flatMap((p) => p.clips || []);
  const totalTime = (entry) => allClips(entry).reduce((sum, clip) => sum + (clip.duration || 0), 0);
  const transcriptText = (entry) => allParts(entry).filter(part=>!part.interviewQuestion||!part.skipped).map((part) => part.type === "note" ? (part.text || "") : (part.clips || []).map((c) => c.transcript || "").join(" ")).join("\n");
  const sortedParts = (entry) => allParts(entry).filter(part=>!part.interviewQuestion||!part.skipped).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  function privateHost() { return !!document.querySelector('meta[name="unscripted-private-host"]'); }
  function activeAI() { const { url, code } = getApiConfig(); return /^https:\/\//.test(url) && (!!code || privateHost()); }
  function switchView(view) {
    if (state.recording) { showToast("Save or pause your recording first."); return; }
    if (view !== "entry") document.querySelectorAll?.(".recording-player").forEach(player => player.pause());
    state.view = view;
    window.dispatchEvent(new CustomEvent("unscripted-navigate",{detail:{view,id:view==="entry"?state.selected:view==="chat"?activeChatId:undefined}}));
    for (const id of ["homeView", "entryView", "askView", "settingsView"]) $(id).hidden = id !== ({ home: "homeView", entry: "entryView", ask: "askView", settings: "settingsView" }[view]);
    $("navLibrary").classList.toggle("selected", view === "home" || view === "entry");
    $("navAsk").classList.toggle("selected", view === "ask" || view === "chat");
    window.scrollTo({ top: 0, behavior: "instant" });
    if (view === "home") renderHome();
    if (view === "entry") renderEntry();
    if (view === "settings") renderSettings();
    if(view==="ask"){renderChatArchive();renderAskSuggestions();}
    if($("chatView"))$("chatView").hidden=view!=="chat";
  }
  function searchMatches(entry, query) { return [entry.title, entry.summary, (entry.tags || []).join(" "), transcriptText(entry)].join(" ").toLowerCase().includes(query.toLowerCase()); }
  function renderHome() {
    const list = $("entriesList"); list.replaceChildren();
    $("entryCount").textContent = state.entries.filter(e=>e.kind!=="diaryChat").length + (state.entries.filter(e=>e.kind!=="diaryChat").length === 1 ? " entry" : " entries");
    const last = state.entries[0]; $("continueLastButton").hidden = true;
    if (last) $("continueLastButton").textContent = "↗ Continue “" + (last.title || "your last entry") + "”";
    const tags = [...new Set(state.entries.flatMap((e) => e.tags || []))].sort((a, b) => a.localeCompare(b));
    if (state.topic !== "All" && !tags.includes(state.topic)) state.topic = "All";
    const filters = $("topicFilters"); filters.replaceChildren();
    for (const topic of ["All", ...tags]) {
      const chip = make("button", "filter-chip" + (state.topic === topic ? " selected" : ""), topic);
      chip.type = "button"; chip.onclick = () => { state.topic = topic; renderHome(); }; filters.append(chip);
    }
    const query = $("searchInput").value.trim();
    if(query){renderSearch(query);return;}
    if($("searchStatus"))$("searchStatus").textContent="";
    const selected = state.entries.filter((e) => e.kind!=="diaryChat" && (state.topic === "All" || (e.tags || []).includes(state.topic)) && (!query || searchMatches(e, query)));
    if (!selected.length) {
      const empty = make("div", "empty-state"); empty.append(make("strong", "", query || state.topic !== "All" ? "Nothing found, yet." : "Your thoughts will live here."), make("span", "", query || state.topic !== "All" ? "Try another search or category." : "Start recording and make this space your own.")); list.append(empty); return;
    }
    for (const entry of selected) {
      const card = make("button", "entry-card"); card.type = "button"; card.onclick = () => openEntry(entry.id);
      const top = make("div", "card-top"); top.append(make("span", "", fmtDate(entry.createdAt)), make("span", "", `${allParts(entry).length} part${allParts(entry).length === 1 ? "" : "s"} · ${audioTime(totalTime(entry))} audio`));
      if(entry.kind==="interview"){const badge=make("span","interview-badge","✦ Interview"+(entry.interview?.complete?"":" · in progress"));top.replaceChildren(badge,make("span","",fmtDate(entry.createdAt)));}
      if(allClips(entry).some(c=>!c.transcript&&!c.transcriptionComplete)||entry.aiError||!entry.summary){card.classList.add("entry-pending");top.append(make("span","pending-label","⚠ "+(allClips(entry).some(c=>!c.transcript&&!c.transcriptionComplete)?"Transcription pending":"Summary pending")));}
      card.append(top, make("h3", "", entry.title || "Untitled thought"), make("p", "", entry.summary || (transcriptText(entry) ? transcriptText(entry).slice(0, 200) : "A thought worth keeping. Tap to add more or read it.")));
      const row = make("div", "tag-row"); for (const tag of (entry.tags || []).slice(0, 4)) row.append(make("span", "tag", tag)); card.append(row); list.append(card);
    }
  }
  function revokeUrls() { state.urls.forEach((url) => URL.revokeObjectURL(url)); state.urls = []; }
  function openEntry(id) { state.searchTarget=null; state.selected = id; state.openTranscript = false; $("transcriptArea").hidden = true; $("transcriptToggle").setAttribute("aria-expanded", "false"); switchView("entry"); }
  function interviewQuestionText(entry,part){return part.question||entry.interview?.answers?.find(x=>x.id===part.id)?.question||part.text?.match(/(?:Interview question|Question(?: \d+)?):\s*([^\n]+)/i)?.[1]||"Interview question";}
  function renderEntry() {
    const entry = currentEntry(); if (!entry) { switchView("home"); return; }
    document.querySelectorAll(".recording-player").forEach(player => player.dispose());
    revokeUrls();
    renderReflection(entry);
    renderToneControls(entry);
    $("entryDate").textContent = fmtDate(entry.createdAt, true).toUpperCase();
    $("entryTitle").textContent = entry.title || "Untitled thought";
    $("interviewEntryStatus").hidden=entry.kind!=="interview";
    $("interviewEntryStatus").textContent=entry.kind==="interview"?"✦ Interview · "+(entry.interview?.goal||"Explore your thoughts"):"";
    const summarySection=$("entrySummary").closest("section");
    if(entry.kind==="interview")$("entryParts").previousElementSibling.before(summarySection);
    else $("entryStatus").after(summarySection);
    const clips = allClips(entry);
    $("entryDuration").textContent = `${sortedParts(entry).filter((p) => p.type === "recording").length} recording(s) · ${audioTime(totalTime(entry))} of audio · ${sortedParts(entry).filter((p) => p.type === "note" && !p.reflectionAnswer).length} written note(s) · ${sortedParts(entry).filter(p=>p.reflectionAnswer).length} reflection(s)`;
    const container = $("entryParts"); container.replaceChildren();
    sortedParts(entry).filter(part => !part.reflectionAnswer).forEach((part, index) => {
      const box = make("div", "part-card"); const head = make("div", "part-head");
      head.append(make("strong", "", part.type === "note" ? (part.interviewQuestion ? "✦ Interview question " : "✎ Written addition ") + (index + 1) : ""), make("small", "", fmtDate(part.createdAt) + " · " + fmtTime(part.createdAt)));
      box.append(head);
      if(part.interviewQuestion){
        box.append(make("h3","reflection-question",interviewQuestionText(entry,part)));
        if(part.clips?.length)box.append(window.UnscriptedRecordingPlayer.create(part.clips,getAudio,"interview answer"));
        const pending=(part.clips||[]).some(c=>!c.transcript&&!c.transcriptionComplete);
        if(pending){const retry=make("button","text-action","⚠ Continue transcription");retry.onclick=()=>processEntry(entry.id);box.append(retry);}
        box.append(summarySwitch(part.id,part.summary,part.bulletPoints,()=>processEntry(entry.id)));
        const details=make("details","reflection-transcript");details.append(make("summary","","Full answer"),make("p","reflection-answer-text",part.answer||part.text||"Audio saved; transcript pending."));box.append(details);
        container.append(box);return;
      }
      if (part.type === "note") {
        box.append(make("p", "", part.text || ""));
        if(part.interviewQuestion)for(const id of part.sourceIds||[]){const source=state.entries.find(item=>item.id===id);if(!source)continue;const link=make("button","source-link",fmtDate(source.createdAt)+" · "+source.title);link.type="button";link.onclick=()=>openEntry(id);box.append(link);}
        const edit = make("button", "", "Edit note"); edit.type = "button"; edit.onclick = () => openEditor("Edit note", part.text || "", async (value) => { part.text = value; await saveEntry(entry); await refreshEntries(); renderEntry(); if (activeAI()) processEntry(entry.id); }); box.append(edit);
      } else {
        const segments = part.clips || [];
        const audio = window.UnscriptedRecordingPlayer.create(segments, getAudio, "recording " + (index + 1));
        box.append(audio);
        const pending = segments.filter((s) => !s.transcript && !s.transcriptionComplete).length;
        if (pending) {
          box.style.borderColor = "#d78080";
          const warning = make("div", "tiny", "⚠ " + pending + " clip" + (pending === 1 ? "" : "s") + " awaiting transcription");
          warning.style.color = "#f1a1a1"; box.append(warning);
        }
      }
      container.append(box);
    });
    if (!entry.parts?.length) container.append(make("div", "empty-state", "Add a recording or a written note to begin."));
    renderTranscriptionProgress(entry);
    const busy = state.processing.has(entry.id);
    $("transcribeButton").disabled = busy; $("summaryActionLabel").innerHTML = busy ? "Processing…" : clips.some(c => !c.transcript && !c.transcriptionComplete) ? "Continue<br>transcription" : "Refresh<br>summary";
    notice("entryStatus", busy ? (clips.some(c => !c.transcript && !c.transcriptionComplete) ? "" : "Refreshing summary…") : entry.aiError ? entry.aiError : (!activeAI() && clips.some((c) => !c.transcript) ? "Audio saved. Connect your private AI backend in Settings to transcribe it automatically." : ""), !!entry.aiError);
    $("entrySummary").textContent = entry.summary || (transcriptText(entry) ? "No summary yet. You can write one yourself or connect AI." : "No summary yet. Your original audio is saved; nothing has been invented.");
    let mainSummary=$("entrySummaryViews");if(!mainSummary){mainSummary=make("div");mainSummary.id="entrySummaryViews";$("entrySummary").after(mainSummary);}
    $("entrySummary").hidden=true;mainSummary.replaceChildren(summarySwitch(entry.id,entry.summary,entry.bulletPoints,()=>processEntry(entry.id)));

    const tags = $("entryTags"); tags.replaceChildren();
    if (!(entry.tags || []).length) tags.append(make("span", "muted", "No topics yet."));
    else (entry.tags || []).forEach((tag) => tags.append(make("span", "tag", tag)));
    $("transcriptArrow").textContent = state.openTranscript ? "⌃" : "⌄";
    $("transcriptArea").hidden = !state.openTranscript;
    if (state.openTranscript) renderTranscript(entry);
    if(state.searchTarget)revealSearchTarget();
  }
  function renderTranscriptionProgress(entry) {
    let panel = $("transcriptionProgress");
    if (!panel) {
      panel = make("section"); panel.id = "transcriptionProgress";
      $("entryParts").after(panel);
    }
    panel.replaceChildren();
    const clips = allParts(entry).filter(p => p.type === "recording" || p.reflectionAnswer || p.interviewQuestion).flatMap(p => p.clips || []);
    const done = clips.filter(c => c.transcript || c.transcriptionComplete).length;
    panel.hidden = !clips.length || done === clips.length;
    if (panel.hidden) return;
    panel.style.cssText = "display:flex;align-items:center;gap:10px;padding:10px 12px;margin:10px 0;border:1px solid #a85e5e;border-radius:12px;background:var(--panel)";
    const busy = state.processing.has(entry.id), pausing = state.pauseTranscription.has(entry.id);
    const details = make("div"); details.style.cssText = "flex:1;min-width:0";
    const label = make("div", "tiny", done + " / " + clips.length + " clips · " + (pausing && busy ? "Pausing…" : busy ? "Transcribing…" : "Paused"));
    label.style.color = "#f1a1a1";
    label.setAttribute("role", "status"); details.append(label);
    const progress = make("progress"); progress.max = clips.length; progress.value = done;
    progress.style.cssText = "display:block;width:100%;height:5px;margin-top:6px;accent-color:#d78080";
    progress.setAttribute("aria-label", "Transcription progress"); details.append(progress);
    const button = make("button", "icon-button small", busy ? "Ⅱ" : "▶");
    button.type = "button"; button.disabled = busy && pausing;
    const action = busy ? "Pause transcription after the current clip" : "Resume transcription";
    button.title = action; button.setAttribute("aria-label", action);
    button.style.cssText = "color:#f1a1a1;border-color:#a85e5e";
    button.onclick = () => {
      if (state.processing.has(entry.id)) {
        state.pauseTranscription.add(entry.id);
        renderTranscriptionProgress(entry);
      } else processEntry(entry.id);
    };
    panel.append(details, button);
  }
  function renderTranscript(entry) {
    const target = $("transcriptArea"); target.replaceChildren();
    for (const part of sortedParts(entry).filter(p=>!p.reflectionAnswer)) {
      const div = make("div", "transcript-part"); div.append(make("div", "transcript-head", (part.reflectionAnswer ? "Reflection · question & answer" : part.type === "note" ? "Written note" : "Voice recording") + " · " + fmtDate(part.createdAt) + " at " + fmtTime(part.createdAt)));
      const body = part.type === "note" ? part.text : (part.clips || []).map((c) => c.transcript || (c.transcriptionComplete ? "[No speech detected]" : "[Audio waiting for transcription]")).join("\n\n");
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
    if (window.UnscriptedPerspective?.recording() || window.UnscriptedQuiz?.recording()) {showToast("Finish your quiz voice answer first.");return;}
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
  async function saveInterviewClip(entryId,answerId,doc,blob,duration) {
    if(!entryId){const entry=newEntry();entry.kind="interview";entry.title="Interview · "+(doc.goal||"Your thoughts");entry.interview={goal:doc.goal,answers:[],complete:false};await saveEntry(entry);entryId=entry.id;}
    const partId=answerId||uid(),clipId=uid();
    await new Promise((resolve,reject)=>{const tx=state.db.transaction(["entries","audio"],"readwrite"),store=tx.objectStore("entries"),req=store.get(entryId);
      req.onsuccess=()=>{const entry=req.result;if(!entry){tx.abort();return;}let part=entry.parts.find(p=>p.id===partId);
        if(!part){part={id:partId,type:"note",interviewQuestion:true,interviewPending:true,createdAt:new Date().toISOString(),question:doc.question,sourceIds:doc.sourceIds||[],typedAnswer:doc.typedAnswer||"",answer:"",text:"Interview question: "+doc.question,clips:[]};entry.parts.push(part);}
        part.clips.push({id:clipId,duration,mime:blob.type,transcript:""});part.summary="";part.bulletPoints=[];tx.objectStore("audio").put({id:clipId,blob});entry.updatedAt=new Date().toISOString();store.put(entry);};
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("Could not save interview audio."));
    });await refreshEntries();window.dispatchEvent(new Event("unscripted-change"));return {entryId,answerId:partId};
  }
  async function transcribeInterviewAnswer(entryId,answerId) {
    await processEntry(entryId);
    const entry=await transaction("entries","readonly",s=>s.get(entryId)),part=entry?.parts.find(p=>p.id===answerId);
    if(!part)throw Error("Saved answer not found.");
    if(part.clips?.some(c=>!c.transcript&&!c.transcriptionComplete)||(!part.summary&&entry.aiError))throw Error(entry.aiError||"Some clips are still waiting. Retry transcription.");
    return {answer:part.answer||"",summary:part.summary||"",bulletPoints:part.bulletPoints||[]};
  }
  function openInterviewSummary(id){openEntry(id);$("entrySummaryViews")?.scrollIntoView({behavior:"smooth",block:"start"});}
  async function saveInterview(document, id) {
    let entry=id?await transaction("entries","readonly",store=>store.get(id)):null;
    if(!entry||entry.kind!=="interview"){
      if(!document.answers.some(answer=>answer.answer?.trim()||answer.hasAudio))return null;
      entry=newEntry();entry.kind="interview";entry.title="Interview · "+(document.goal||"A little of everything").slice(0,70);
    }
    const answered=document.answers.filter(answer=>!answer.skipped&&(answer.answer?.trim()||answer.hasAudio));
    const notes=answered.map((answer,index)=>({
      ...(entry.parts||[]).find(p=>p.id===answer.id),
      interviewPending:false,question:answer.question,answer:answer.answer,skipped:!!answer.skipped,
      type:"note",id:answer.id||uid(),createdAt:answer.createdAt||new Date().toISOString(),interviewQuestion:true,
      text:"Question "+(index+1)+": "+answer.question+"\n\n"+("Your answer: "+(answer.answer||"")),
      sourceIds:Array.isArray(answer.sourceIds)?answer.sourceIds:[]
    }));
    entry.parts=[...notes,...allParts(entry).filter(part=>!part.interviewQuestion||(part.interviewPending&&!notes.some(n=>n.id===part.id)))];
    entry.interview={goal:document.goal,complete:!!document.complete,answers:answered,updatedAt:new Date().toISOString()};
    entry.tags=[...new Set([...(entry.tags||[]),"Interview"])];
    entry.userTags=[...new Set([...(entry.userTags||[]),"Interview"])];
    await saveEntry(entry);await refreshEntries();if(state.view==="home")renderHome();
    if(document.complete&&activeAI())processEntry(entry.id);
    return entry.id;
  }
  function profileData() {
    const keys=["unscripted-text-style","unscripted-summary-style","unscripted-personal-profile","unscripted-reflection-profile","unscripted-know-quiz","unscripted-reflection-quiz","unscripted-interview-draft"];
    return Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)||""]));
  }
  function restoreProfileData(profiles) {
    if(!profiles||typeof profiles!=="object")return;
    for(const key of Object.keys(profileData())){
      const value=profiles[key];if(typeof value!=="string"||value.length>(key==="unscripted-interview-draft"?12000000:60000))continue;
      if(key.endsWith("-quiz")||key==="unscripted-interview-draft"){
        let parsed;try{parsed=JSON.parse(value);}catch{continue;}
        if(!Array.isArray(parsed.answers)||(key!=="unscripted-interview-draft"&&parsed.answers.length>6)||parsed.answers.some(x=>typeof x.question!=="string"||typeof x.answer!=="string"))continue;
      }
      localStorage.setItem(key,value);
    }
    window.dispatchEvent(new Event("unscripted-settings"));
  }
  function getApiConfig() { return { url: (privateHost() ? location.origin : localStorage.getItem("unscripted-api-url") || "").replace(/\/+$/, ""), code: sessionStorage.getItem("unscripted-access-code") || localStorage.getItem("unscripted-access-code") || "" }; }
  async function callAI(path, body, asForm = false) {
    if(!asForm)body={...body,style:body?.style??summaryStyle(null)};
    const { url, code } = getApiConfig(); if (!/^https:\/\//.test(url) || (!code && !privateHost())) throw new Error("Connect your private AI backend in Settings first.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
    const response = await fetch(url + path, { method: "POST", credentials: "same-origin", signal: controller.signal, headers: { ...(code ? { Authorization: "Bearer " + code } : {}), ...(asForm ? {} : { "Content-Type": "application/json" }) }, body: asForm ? body : JSON.stringify(body) });
    if(response.status===429)throw new Error("The AI service is temporarily rate-limited or its usage allowance is exhausted. Please try again shortly; if it persists, check your OpenAI and Cloudflare usage.");
    const raw = await response.text(); let result; try { result = JSON.parse(raw); } catch (_) { throw new Error(response.status>=500?"The AI server is unavailable ("+response.status+"). Please try again shortly.":"AI server returned an unreadable response ("+response.status+"). Please try again."); }
    if (!response.ok || result.error) throw new Error(result.error || "AI request failed (" + response.status + ")");
    return result;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("The request timed out. Continue to retry this clip.");
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async function processEntry(id) {
    if (window.UnscriptedPerspective?.recording()) { showToast("Finish your reflection recording first."); return; }
    if (state.processing.has(id)) return;
    state.pauseTranscription.delete(id);
    state.processing.add(id); if (state.view === "entry" && state.selected === id) renderEntry();
    try {
      let entry = state.entries.find((e) => e.id === id); if (!entry) return;
      entry.aiError = "";
      const persist = async (change) => {
        const fresh = await transaction("entries", "readonly", store => store.get(id));
        if (!fresh) throw new Error("This entry no longer exists.");
        change(fresh); await saveEntry(fresh);
        entry = fresh;
        const index = state.entries.findIndex(e => e.id === id);
        if (index >= 0) state.entries[index] = fresh;
      };
      for (const part of sortedParts(entry)) {
        if (part.type !== "recording" && !part.reflectionAnswer && !part.interviewQuestion) continue;
        for (const clip of part.clips || []) {
          if (state.pauseTranscription.has(id)) return;
          if (clip.transcript || clip.transcriptionComplete) continue;
          const blob = await getAudio(clip.id); if (!blob) throw new Error("Missing audio clip on this device.");
          if (blob.size > 24 * 1024 * 1024) throw new Error("A clip is over 24 MB. Add it manually in smaller parts.");
          const form = new FormData(); const mime = blob.type || clip.mime || "audio/webm";
          const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
          form.append("file", blob, "diary-clip." + ext);
          const data = await callAI("/transcribe", form, true);
          if (typeof data.text !== "string") throw new Error("No transcript was returned. Continue to retry this clip.");
          clip.transcript = data.text.trim();
          clip.transcriptionComplete = true;
          await persist(fresh => {
            const saved = allClips(fresh).find(c => c.id === clip.id);
            if (saved) { saved.transcript = clip.transcript; saved.transcriptionComplete = true; }
            const reflection=allParts(fresh).find(p=>(p.reflectionAnswer||p.interviewQuestion)&&(p.clips||[]).some(c=>c.id===clip.id));
            if(reflection&&!reflection.answerEdited){reflection.answer=[reflection.typedAnswer||"",...(reflection.clips||[]).map(c=>c.transcript||"")].filter(Boolean).join("\n\n");reflection.text=(reflection.interviewQuestion?"Interview question: ":"Reflection question: ")+reflection.question+"\nYour answer: "+reflection.answer;}
            fresh.aiError = "";
          }); // persist each completed clip without overwriting concurrent edits
          if (state.view === "entry" && state.selected === id) renderEntry();
        }
      }
      if (state.pauseTranscription.has(id)) return;
      for(const reflection of allParts(entry).filter(p=>(p.reflectionAnswer||p.interviewQuestion)&&!p.skipped)) {
        if(state.pauseTranscription.has(id))return;
        if(reflection.summary&&reflection.bulletPoints?.length)continue;
        const answer=reflection.answer||reflection.text||"";
        if(!answer.trim())continue;
        const result=await callAI("/organize",{content:[{createdAt:reflection.createdAt,type:"reflection answer",text:"Question (context only): "+(reflection.interviewQuestion?interviewQuestionText(entry,reflection):reflection.question)+"\nYour answer: "+answer}],style:summaryStyle(entry),personalProfile:(localStorage.getItem("unscripted-personal-profile")||"").slice(0,4000)});
        await persist(fresh=>{const part=fresh.parts.find(p=>p.id===reflection.id);if(part){part.summary=result.summary||"";part.bulletPoints=Array.isArray(result.bulletPoints)?result.bulletPoints:[];}});
        if(state.view==="entry"&&state.selected===id)renderEntry();
      }
      if(entry.kind==="interview"&&!entry.interview?.complete)return;
      const content = sortedParts(entry).filter(p=>!p.reflectionAnswer).map((part) => ({ createdAt: part.createdAt, type: part.type, text: part.type === "note" ? part.text : (part.clips || []).map((c) => c.transcript || "").join(" ") })).filter((p) => p.text?.trim());
      if (!content.length) { if(allParts(entry).some(p=>p.reflectionAnswer&&p.summary))return; throw new Error("There's no transcribed or written text to summarise yet."); }
      const data = await callAI("/organize", { content, style:summaryStyle(entry), existingTitle: entry.title, existingTags: entry.tags || [], personalProfile: (localStorage.getItem("unscripted-personal-profile") || "").slice(0,4000) });
      const fresh = await transaction("entries", "readonly", store => store.get(id));
      if (!fresh) return;
      entry = fresh;
      if (allClips(entry).some(c => !c.transcript && !c.transcriptionComplete)) throw new Error("More audio was added. Continue to transcribe the remaining clips.");
      if (typeof data.title === "string" && data.title.trim() && !entry.titleEdited) entry.title = data.title.trim().slice(0, 120);
      if (typeof data.summary === "string" && !entry.summaryEdited) entry.summary = data.summary.trim();
      if (Array.isArray(data.bulletPoints)) entry.bulletPoints=data.bulletPoints;
      if (Array.isArray(data.tags)) {
        const tags = data.tags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim().slice(0, 45));
        // Preserve manually added tags, plus fresh AI suggestions.
        entry.tags = [...new Set([...(entry.userTags || []), ...tags])].slice(0, 15);
      }
      entry.aiError = ""; await saveEntry(entry); showToast("Transcription and summary ready ✦");
    } catch (error) {
      const entry = state.entries.find((e) => e.id === id);
      if (entry) { entry.aiError = "Processing paused: " + error.message; await saveEntry(entry).catch(() => {}); }
    } finally { state.processing.delete(id); state.pauseTranscription.delete(id); await refreshEntries().catch(() => {}); if (state.view === "entry" && state.selected === id) renderEntry(); else if (state.view === "home") renderHome(); }
  }
  function renderSettings() { $("defaultToneControls").replaceChildren(toneControls(null)); $("apiUrl").value = getApiConfig().url; $("apiUrl").readOnly = privateHost(); $("privateSignOut").hidden = !privateHost(); window.dispatchEvent(new Event("unscripted-settings")); $("accessCode").value = sessionStorage.getItem("unscripted-access-code") || localStorage.getItem("unscripted-access-code") || ""; $("rememberCode").checked = !!localStorage.getItem("unscripted-access-code"); $("accentSwatch").style.background = getComputedStyle(document.documentElement).getPropertyValue("--accent"); }
  async function saveSettingsAndReturn(){
    const button=$("saveSettingsButton");if(button.disabled)return;
    button.disabled=true;
    try{
      document.activeElement?.blur();
      const tone=$("defaultToneControls").firstElementChild;
      if(tone?.saveSettings&&!await tone.saveSettings())throw Error("Could not save your AI style. Please try again.");
      $("textStyleControls").saveSettings?.();
      if(!saveApiSettings()){ $("settingsStatus").scrollIntoView({block:"center"});return; }
      window.dispatchEvent(new Event("unscripted-change"));
      showToast("✓ Changes saved");
      await new Promise(resolve=>setTimeout(resolve,700));
      if(state.view==="settings")window.dispatchEvent(new Event("unscripted-back"));
    }catch(error){showToast("Could not save changes: "+error.message);}
    finally{button.disabled=false;}
  }
  function saveApiSettings() { const url = $("apiUrl").value.trim().replace(/\/+$/, ""); if (url && (!url.startsWith("https://") || !URL.canParse(url))) { notice("settingsStatus", "Use a full HTTPS backend address.", true); return false; } localStorage.setItem("unscripted-api-url", url); sessionStorage.setItem("unscripted-access-code", $("accessCode").value.trim()); if ($("rememberCode").checked) localStorage.setItem("unscripted-access-code", $("accessCode").value.trim()); else localStorage.removeItem("unscripted-access-code"); notice("settingsStatus", activeAI() ? "Connection saved for this browser tab. New recordings will be transcribed automatically when you save them." : "Saved. Add a backend address and access code to enable AI."); return true; }
  function askExcerpt(text,words,limit,spread=false){
    if(text.length<=limit)return text;
    const gap="\n[… excerpt gap …]\n",size=Math.max(200,Math.floor((limit-gap.length*3)/4)),chunks=[];
    for(let start=0;start<text.length;start+=size){const body=text.slice(start,start+size),lower=body.toLocaleLowerCase();chunks.push({start,body,score:words.reduce((n,w)=>n+(lower.includes(w)?1:0),0)});}
    let chosen;
    if(!spread&&chunks.some(c=>c.score))chosen=chunks.slice().sort((a,b)=>b.score-a.score).slice(0,4);
    else chosen=[0,1,2,3].map(i=>chunks[Math.round(i*(chunks.length-1)/3)]);
    return [...new Set(chosen)].sort((a,b)=>a.start-b.start).map(c=>c.body).join(gap).slice(0,limit);
  }
  function chooseAskSources(question) {
    const positiveLookup=/compliment|said.{0,25}(?:nice|good|positive)|good (?:qualities|characteristics|traits)|positive.{0,25}about/i.test(question);
    const retrievalQuestion=question+(positiveLookup?" calm safe gentle kind patient supportive respectful caring listens comfort appreciate reassuring shouting":"");
    const words = retrievalQuestion.toLowerCase().split(/\W+/).filter((x) => x.length > 3&&!new Set(["what","which","when","where","have","does","there","about","that","this","keep","coming","going","things","anything","something","diary","often","most","themes","theme","recurring"]).has(x));
    const entries = state.entries.filter((e) => e.kind!=="diaryChat" && transcriptText(e).trim());
    const scored = entries.map((entry) => ({ entry, score: words.reduce((t, w) => t + (transcriptText(entry).toLowerCase().includes(w) ? 2 : 0) + ((entry.title + " " + (entry.tags || []).join(" ")).toLowerCase().includes(w) ? 4 : 0), 0) }));
    // Include both recent and older entries so historical comparisons have chronological coverage.
    scored.sort((a, b) => b.score - a.score);
    const recurring=/recurr|keep (?:coming|going|talking|mentioning|returning)|coming back to|again and again|repeated|constantly|\bthemes?\b|\bpatterns?\b/i.test(question);
    const selected = recurring?(entries.length<=40?entries.slice():Array.from({length:40},(_,i)=>entries[Math.round(i*(entries.length-1)/39)])):scored.slice(0, 32).map((v) => v.entry);
    const old = entries.slice(-8); for (const e of old) if (!selected.includes(e)) selected.push(e);
    selected.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let used = 0, truncated = false;
    const sources = [];
    for (const entry of selected) {
      const prefix = `[${entry.id}] ${entry.createdAt}\n`;
      const full = searchableParts(entry).filter(x=>!x.part.skipped).map(x=>`[${x.part.createdAt}] `+x.text).join("\n");
      const remaining = 125000 - used - prefix.length;
      if (remaining <= 100) { truncated = true; break; }
      const cap=Math.min(remaining,recurring?Math.max(500,Math.floor(118000/Math.max(1,selected.length))):11000);
      const body = askExcerpt(full,words,cap,recurring);
      if (body.length < full.length) truncated = true;
      sources.push({ id: entry.id, date: entry.createdAt, title: entry.title, text: body }); used += prefix.length + body.length;
    }
    if (selected.length < entries.length) truncated = true;
    return { sources, truncated };
  }
  async function askDiary(event) {
    event.preventDefault();if(chatBusy){showToast("Wait for your diary to finish replying first.");return;}const question=$("askInput").value.trim();if(!question)return;
    if(!activeAI()){notice("askStatus","Connect AI in Settings first.",true);return;}
    const now=new Date().toISOString();const chat={id:uid(),kind:"diaryChat",title:question.slice(0,120),createdAt:now,updatedAt:now,parts:[],messages:[]};
    await saveEntry(chat);await refreshEntries();activeChatId=chat.id;$("askInput").value="";openChat(chat.id);await sendChat(question);
  }
  const styleDefaults={perspective:"you",friendliness:"very friendly",length:"medium",emojis:"some",gossip:0,blunt:0,humour:0,challenge:1,voiceTone:"warm",styleNotes:""};
  function summaryStyle(entry){let saved={};try{saved=JSON.parse(localStorage.getItem("unscripted-summary-style")||"{}");}catch{}return {...styleDefaults,...saved,...entry?.summaryStyle};}
  function toneControls(entry){
    const wrap=make("div","tone-controls personal-style-controls"),style=summaryStyle(entry),status=make("p","style-save-status");status.setAttribute("role","status");
    const persist=async()=>{try{if(entry){const fresh=await transaction("entries","readonly",s=>s.get(entry.id));if(!fresh)return false;fresh.summaryStyle={...style};await saveEntry(fresh);await refreshEntries();}else {localStorage.setItem("unscripted-summary-style",JSON.stringify(style));window.dispatchEvent(new Event("unscripted-change"));}status.textContent=entry?"Saved for this entry’s next summary":"Saved for new AI replies, questions and summaries";return true;}catch(e){status.textContent="Could not save: "+e.message;return false;}};
    const preview=make("div","tone-preview"),previewLabel=make("span","tiny","Style preview"),previewText=make("p");preview.append(previewLabel,previewText);
    const level=v=>v===true?2:Math.max(0,Math.min(3,Number(v)||0));
    function updatePreview(){const who=style.perspective==="I"?"I’m":style.perspective==="third person"?"They’re":"You’re";let text=who+" figuring out what matters and what to do next.";if(level(style.gossip)>1)text+=" There’s a bit to unpack here.";if(level(style.blunt)>1)text+=" Time to be honest about it.";if(style.emojis!=="none")text+=style.emojis==="lots"?" 💭✨😊":" 💭";previewText.textContent=text;}
    function chips(key,title,choices){const group=make("div","style-chip-group"),heading=make("div","style-control-label",title),row=make("div","style-chip-row");row.setAttribute("role","group");row.setAttribute("aria-label",title);function draw(){row.replaceChildren();for(const [value,label] of choices){const b=make("button","style-chip"+(style[key]===value?" selected":""),label);b.type="button";b.setAttribute("aria-pressed",style[key]===value);b.onclick=()=>{style[key]=value;draw();updatePreview();persist();};row.append(b);}}draw();group.append(heading,row);wrap.append(group);}
    chips("perspective","Tell it as…",[["I","I / my"],["you","You / your"],["third person","Third person"]]);
    chips("length","Summary length",[["short","A little"],["medium","Balanced"],["detailed","The details"]]);
    chips("voiceTone","Personality",[["warm","☀ Warm"],["playful","✦ Playful"],["reflective","☾ Thoughtful"],["matter-of-fact","◎ Matter-of-fact"],["supportive","♡ Encouraging"],["curious","↗ Curious"]]);
    function slider(key,title,labels,get,set){const label=make("label","style-slider"),top=make("span"),name=make("span","",title),output=make("output"),input=make("input");input.type="range";input.min=0;input.max=labels.length-1;input.step=1;input.value=get();input.setAttribute("aria-label",title);function draw(){output.textContent=labels[Number(input.value)];input.setAttribute("aria-valuetext",output.textContent);}input.oninput=()=>{set(Number(input.value));draw();updatePreview();if(!entry)persist();};input.onchange=persist;draw();top.append(name,output);label.append(top,input);wrap.append(label);}
    const warmth=["neutral","warm","very friendly","casual like a friend"];
    slider("friendliness","Friendliness",["Neutral","Warm","Friendly","Like a friend"],()=>Math.max(0,warmth.indexOf(style.friendliness)),v=>style.friendliness=warmth[v]);
    slider("gossip","Chatty / gossipy",["None","A little","Chatty","Full catch-up"],()=>level(style.gossip),v=>style.gossip=v);
    slider("blunt","Directness",["Gentle","Clear","Blunt","Straight to it"],()=>level(style.blunt),v=>style.blunt=v);
    slider("humour","Humour",["None","A touch","Playful","Very playful"],()=>level(style.humour),v=>style.humour=v);
    slider("challenge","Challenge my thinking",["Just reflect","Ask gently","Challenge me","Push back clearly"],()=>level(style.challenge),v=>style.challenge=v);
    const emoji=["none","some","lots"];
    slider("emojis","Emojis",["None","A few","Expressive"],()=>Math.max(0,emoji.indexOf(style.emojis)),v=>style.emojis=emoji[v]);
    const label=make("label","style-notes-label","Anything else about how I should sound?"),notes=make("textarea");notes.rows=2;notes.maxLength=800;notes.value=style.styleNotes||"";notes.placeholder="e.g. Simple English, a little cheeky, no therapy jargon";notes.onchange=()=>{style.styleNotes=notes.value;persist();};label.append(notes);wrap.append(label,preview,status);updatePreview();wrap.saveSettings=()=>{style.styleNotes=notes.value;return persist();};
    if(entry){const b=make("button","button-soft","Apply to this entry ↻");b.type="button";b.onclick=async()=>{if(state.processing.has(entry.id)){showToast("Wait for transcription to finish first.");return;}if(!await persist())return;const fresh=await transaction("entries","readonly",s=>s.get(entry.id));if(!fresh)return;fresh.summaryEdited=false;for(const part of fresh.parts||[])if(part.reflectionAnswer||part.interviewQuestion){part.summary="";part.bulletPoints=[];}await saveEntry(fresh);await refreshEntries();processEntry(entry.id);};wrap.append(b,make("p","tiny","Apply when you want a new version. Your current summary stays until then."));}
    return wrap;
  }
  function renderToneControls(entry){let panel=$("entryToneControls");if(!panel){panel=make("details","entry-block tone-panel");panel.id="entryToneControls";$("deleteEntryButton").before(panel);}const expanded=panel.open;panel.replaceChildren(make("summary","","✦ Summary style"),toneControls(entry));panel.open=expanded;}
  let searchRevision=0,semanticResults=null,activeChatId=null,chatBusy=false;
  function searchableParts(entry){return sortedParts(entry).map(part=>({part,text:part.type==="note"?((part.interviewQuestion||part.reflectionAnswer)?(part.answer||part.text?.split(/Your answer:\s*/i)[1]||""):(part.text||"")):(part.clips||[]).map(c=>c.transcript||"").join("\n\n")}));}
  function markText(el,text,ranges){let at=0;for(const r of ranges.sort((a,b)=>a.start-b.start)){if(r.start<at)continue;el.append(document.createTextNode(text.slice(at,r.start)));el.append(make("mark","",text.slice(r.start,r.end)));at=r.end;}el.append(document.createTextNode(text.slice(at)));}
  function literalHits(query){
    const hits=[],words=query.toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu)||[];
    for(const entry of state.entries.filter(e=>e.kind!=="diaryChat"&&(state.topic==="All"||(e.tags||[]).includes(state.topic))))for(const {part,text} of searchableParts(entry)){
      const lower=text.toLocaleLowerCase();let pos=0,found=false;
      while(query&&((pos=lower.indexOf(query.toLocaleLowerCase(),pos))>=0)){hits.push({entryId:entry.id,partId:part.id,start:pos,end:pos+query.length,text,score:100});pos+=Math.max(1,query.length);found=true;}
      if(!found&&words.length>1){let offset=0;for(const sentence of text.split(/(?<=[.!?\n])\s+/)){const ranges=[];for(const word of new Set(words)){let at=sentence.toLocaleLowerCase().indexOf(word);if(at>=0)ranges.push({start:offset+at,end:offset+at+word.length});}if(ranges.length>=Math.max(2,Math.ceil(new Set(words).size*.5)))hits.push({entryId:entry.id,partId:part.id,start:ranges[0].start,end:ranges[0].end,text,ranges,score:ranges.length});offset+=sentence.length;while(/\s/.test(text[offset]||"")&&offset<text.length)offset++;}}
    }return hits.sort((a,b)=>b.score-a.score);
  }
  function renderSearch(query){const target=$("entriesList");target.replaceChildren();const hits=semanticResults?.query===query?semanticResults.hits:literalHits(query);$("searchStatus").textContent=hits.length+" matches";
    if(!hits.length){target.append(make("p","tiny","No transcript matches. Try fewer words or Search by meaning."));return;}
    for(const hit of hits){const entry=state.entries.find(e=>e.id===hit.entryId);if(!entry)continue;const b=make("button","entry-card search-hit");b.type="button";b.append(make("small","",fmtDate(entry.createdAt)+" · "+entry.title));const snippet=make("div","search-snippet"),start=Math.max(0,hit.start-25),end=Math.min(hit.text.length,hit.end+130),text=hit.text.slice(start,end);const ranges=(hit.ranges||[{start:hit.start,end:hit.end}]).filter(r=>r.end>start&&r.start<end).map(r=>({start:Math.max(0,r.start-start),end:Math.min(text.length,r.end-start)}));markText(snippet,text,ranges);b.append(snippet);b.onclick=()=>{openEntry(entry.id);state.searchTarget=hit;state.openTranscript=true;renderEntry();};target.append(b);}
  }
  function revealSearchTarget(){const hit=state.searchTarget;if(!hit)return;const entry=currentEntry(),part=allParts(entry).find(p=>p.id===hit.partId);if(!part)return;$("transcriptArea").hidden=false;$("transcriptToggle").setAttribute("aria-expanded","true");const target=$("transcriptArea");target.replaceChildren();let focus;
    for(const item of searchableParts(entry)){const section=make("section","transcript-part");section.append(make("div","transcript-head",fmtDate(item.part.createdAt)+" · "+fmtTime(item.part.createdAt)));const body=make("p");if(item.part.id===part.id){markText(body,item.text,hit.ranges||[{start:hit.start,end:hit.end}]);focus=body.querySelector("mark");}else body.textContent=item.text;section.append(body);target.append(section);}focus?.scrollIntoView({behavior:"smooth",block:"center"});
  }
  async function searchByMeaning(){const query=$("searchInput").value.trim();if(!query)return;if(!activeAI()){showToast("Connect AI to search by meaning.");return;}const revision=++searchRevision;const hits=[],chunks=[];
    for(const entry of state.entries.filter(e=>e.kind!=="diaryChat"&&(state.topic==="All"||(e.tags||[]).includes(state.topic))))for(const {part,text} of searchableParts(entry)){for(let start=0;start<text.length;start+=1300)chunks.push({id:String(chunks.length),entryId:entry.id,partId:part.id,start,text:text.slice(start,start+1500),full:text});}
    $("semanticSearch").disabled=true;try{for(let i=0;i<chunks.length;i+=20){if(revision!==searchRevision)return;$("searchStatus").textContent="Searching excerpts "+Math.min(i+20,chunks.length)+" / "+chunks.length;const batch=chunks.slice(i,i+20),result=await callAI("/search",{query,excerpts:batch.map(c=>({id:c.id,text:c.text}))});if(revision!==searchRevision)return;for(const match of result.matches||[]){const c=batch.find(c=>c.id===match.id);if(!c||typeof match.quote!=="string")continue;const local=c.text.toLowerCase().indexOf(match.quote.toLowerCase());if(local<0||!match.quote.trim())continue;const start=c.start+local,end=start+match.quote.length;if(hits.some(h=>h.partId===c.partId&&Math.abs(h.start-start)<120))continue;hits.push({entryId:c.entryId,partId:c.partId,text:c.full,start,end});}semanticResults={query,hits:[...hits]};renderSearch(query);}}catch(e){$("searchStatus").textContent="Search paused: "+e.message+". Matches found so far are shown.";}finally{$("semanticSearch").disabled=false;}}
  function cleanAnswer(text,sources){let answer=String(text||"");for(const source of sources){answer=answer.split("["+source.id+"]").join("");answer=answer.split(source.id).join("");}answer=answer.replace(/\s*[([]\s*(?:sources?\s*:?\s*)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\s*[)\]]/gi,"");return answer.replace(/\(\s*(?:source\s*:?)?\s*\)/gi,"").replace(/\[\s*\]/g,"").replace(/ +([.,!?])/g,"$1").replace(/ {2,}/g," ").trim();}
  function relativeDate(iso){const days=Math.floor((Date.now()-new Date(iso).getTime())/86400000);if(days===0)return "Today";if(days===1)return "Yesterday";if(days<7)return days+" days ago";if(days<28)return Math.floor(days/7)+" weeks ago";return new Date(iso).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});}
  function openChat(id){activeChatId=id;switchView("chat");renderChat();}
  let suggestionRound=0;
  const suggestionIdeas=["Is there one theme I return to across different days?","What have I felt genuinely excited about lately?","Is there something I said I’d do but haven’t followed up on?","Have my feelings about anything changed?","What seems to drain my energy?","When have I sounded most like myself?","What small wins have I mentioned?","What am I still undecided about?","Have I described the same problem in different situations?"];
  function renderAskSuggestions(){const target=$("askSuggestions");if(!target)return;target.replaceChildren();for(let i=0;i<3;i++){const text=suggestionIdeas[(suggestionRound*3+i)%suggestionIdeas.length],button=make("button","suggestion");const icon=make("span","suggestion-icon","✦"),label=make("span","",text);icon.setAttribute("aria-hidden","true");button.type="button";button.append(icon,label);button.onclick=()=>{$("askInput").value=text;$("askInput").focus();};target.append(button);}suggestionRound++;}
  function renderChatArchive(){const target=$("chatArchive");if(!target)return;target.replaceChildren();const chats=state.entries.filter(e=>e.kind==="diaryChat");if(!chats.length)return;target.append(make("h3","","Your chats"));for(const chat of chats){const b=make("button","entry-card chat-archive-row",chat.title+" · "+relativeDate(chat.createdAt));b.type="button";b.onclick=()=>openChat(chat.id);target.append(b);}}
  function renderChat(){const chat=state.entries.find(e=>e.id===activeChatId);if(!chat)return;$("chatTitle").textContent=chat.title;const target=$("chatMessages");target.replaceChildren();for(const m of chat.messages||[]){const bubble=make("div","chat-bubble "+m.role);bubble.append(make("span","chat-speaker",m.role==="user"?"You":"Your diary"),make("div","chat-text",cleanAnswer(m.content,state.entries)));target.append(bubble);}$("chatContextNote").textContent=chat.truncated?"Based on selected diary excerpts; some history falls outside the context available for this reply.":"Based on the diary excerpts available when each reply was written.";}
  async function sendChat(question,retry=false){if(chatBusy)return;const chat=state.entries.find(e=>e.id===activeChatId);if(!chat)return;chatBusy=true;$("chatSend").disabled=true;$("deleteChat").disabled=true;try{if(!retry){chat.messages.push({role:"user",content:question});await saveEntry(chat);}renderChat();notice("chatStatus","Thinking…");const history=chat.messages.slice(-16,-1).map(m=>({role:m.role,content:m.content}));const {sources,truncated}=chooseAskSources(chat.messages.filter(m=>m.role==="user").slice(-3).map(m=>m.content).join(" "));if(!sources.length)throw Error("Transcribe a recording first so your diary has something to draw on.");const result=await callAI("/ask",{question,sources,truncated,history,now:new Date().toISOString(),personalProfile:localStorage.getItem("unscripted-personal-profile")||"",style:summaryStyle(null)});chat.messages.push({role:"assistant",content:cleanAnswer(result.answer,sources),sourceIds:(result.sourceIds||[]).filter(id=>sources.some(s=>s.id===id)),createdAt:new Date().toISOString()});chat.truncated=truncated;await saveEntry(chat);await refreshEntries();renderChat();notice("chatStatus","");}catch(e){notice("chatStatus","Could not reply: "+e.message,true);const b=make("button","button-soft","Retry reply");b.type="button";b.onclick=()=>sendChat(question,true);$("chatStatus").append(b);}finally{chatBusy=false;$("chatSend").disabled=false;$("deleteChat").disabled=false;}}
  function bindEnhancements(){
    $("searchButton").onclick=()=>{semanticResults=null;searchRevision++;renderHome();if($("searchInput").value.trim().split(/\s+/).length>=4&&activeAI())searchByMeaning();};$("searchInput").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();$("searchButton").click();}};$("semanticSearch").onclick=searchByMeaning;
    $("followUpButton").onclick=()=>window.UnscriptedQuiz?.startFollowUp();
    $("chatBack").onclick=()=>switchView("ask");$("chatForm").onsubmit=e=>{e.preventDefault();const q=$("chatInput").value.trim();if(!q)return;$("chatInput").value="";sendChat(q);};
    $("deleteChat").onclick=async()=>{if(chatBusy||!activeChatId)return;if(!await window.UnscriptedConfirm("Delete this saved conversation? Older backups may still contain it.",{title:"Delete chat?",confirmLabel:"Delete chat",danger:true}))return;await transaction("entries","readwrite",s=>s.delete(activeChatId));await refreshEntries();window.dispatchEvent(new Event("unscripted-change"));switchView("ask");};
    $("quizAnswerArea").prepend($("quizVoice"));$("quizTypedAnswer").hidden=false;$("quizAnswer").placeholder="Or type your answer here…";$("quizAnswer").rows=3;
    $("defaultToneControls").replaceChildren(toneControls(null));
    $("shuffleAskSuggestions").onclick=renderAskSuggestions;renderAskSuggestions();
  }

  const summaryViews = new Map();
  function summarySwitch(key, summary, points, onRefresh) {
    const wrap = make("div", "summary-switch");
    const tabs = make("div", "summary-tabs"); tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", "Summary format");
    const body = make("div", "summary-body");
    function draw(view) {
      summaryViews.set(key, view); tabs.replaceChildren(); body.replaceChildren();
      for (const mode of ["summary", "bullets"]) {
        const b = make("button", mode === view ? "selected" : "", mode === "summary" ? "Summary" : "Bullet points");
        b.type="button"; b.setAttribute("aria-pressed", mode===view); b.onclick=()=>draw(mode); tabs.append(b);
      }
      if(view==="summary") body.append(make("p","summary-text",summary||"No summary yet."));
      else if(Array.isArray(points)&&points.length){const list=make("ul","summary-bullets");for(const point of points)list.append(make("li","",point));body.append(list);}
      else {body.append(make("p","tiny","Generate detailed bullet points for this recording."));const b=make("button","text-action","Generate bullet points");b.type="button";b.onclick=onRefresh;body.append(b);}
    }
    draw(summaryViews.get(key)||"summary"); wrap.append(tabs,body);return wrap;
  }
  function renderReflection(entry) {
    $("reflectionQuestion").hidden=true;
    const target=$("reflectionSources");target.replaceChildren();
    const saved=sortedParts(entry).filter(part=>part.reflectionAnswer);
    const legacy=(entry.reflections||[]).map(item=>({...item,legacy:true}));
    for(const item of [...legacy,...saved]){
      const card=make("section","reflection-answer-card");
      card.append(make("div","tiny",fmtDate(item.createdAt,true)),make("h3","reflection-question",item.question));
      if(!item.legacy){
        if(item.clips?.length)card.append(window.UnscriptedRecordingPlayer.create(item.clips,getAudio,"reflection answer"));
        const pending=(item.clips||[]).filter(c=>!c.transcript&&!c.transcriptionComplete).length;
        if(pending){const status=make("div","reflection-pending","⚠ "+pending+" audio clip"+(pending===1?"":"s")+" awaiting transcription");const retry=make("button","text-action",state.processing.has(entry.id)?"Transcribing…":"Continue transcription");retry.disabled=state.processing.has(entry.id);retry.onclick=()=>processEntry(entry.id);status.append(retry);card.append(status);}
        card.append(summarySwitch(item.id,item.summary,item.bulletPoints,()=>processEntry(entry.id)));
        const details=make("details","reflection-transcript"),heading=make("summary","","Full transcript");
        details.append(heading,make("p","reflection-answer-text",item.answer||"Your audio is saved. Transcript pending."));
        const edit=make("button","text-action","Edit transcript");edit.type="button";edit.onclick=()=>openEditor("Edit reflection transcript",item.answer||"",async value=>{
          if(!value.trim())return;
          const fresh=await transaction("entries","readonly",store=>store.get(entry.id));
          const part=fresh?.parts.find(p=>p.id===item.id);if(!part)throw Error("This reflection no longer exists.");
          part.answer=value;part.answerEdited=true;part.text="Reflection question: "+part.question+"\nYour answer: "+value;part.summary="";part.bulletPoints=[];
          await saveEntry(fresh);await refreshEntries();renderEntry();processEntry(entry.id);
        });details.append(edit);card.append(details);
      }
      for(const id of item.sourceIds||[]){const source=state.entries.find(e=>e.id===id);if(!source)continue;const button=make("button","source-link",fmtDate(source.createdAt)+" · "+source.title);button.type="button";button.onclick=()=>openEntry(id);card.append(button);}
      target.append(card);
    }
  }
  async function perspectiveQuestion(id,previous=[]) {
    if(state.processing.has(id))throw Error("Wait for this entry’s summary to finish, then try again.");
    const entry=state.entries.find(e=>e.id===id);if(!entry)throw Error("This entry no longer exists.");
    if(!activeAI())throw Error("Connect AI in Settings first.");
    const text=transcriptText(entry).trim();if(!text)throw Error("Refresh the summary to transcribe your recording first, or add a written thought.");
    const {sources,truncated}=chooseAskSources(entry.title+" "+(entry.tags||[]).join(" ")+" "+text.slice(-2500));
    const history=sources.filter(x=>x.id!==entry.id).slice(0,12).map(x=>({...x,text:x.text.slice(0,2500)}));
    const result=await callAI("/reflect",{entry:{id:entry.id,date:entry.createdAt,text:text.slice(0,24000)},sources:history,
      profile:("ABOUT ME: "+(localStorage.getItem("unscripted-personal-profile")||"").slice(0,2000)+"\nREFLECTION CONTEXT: "+(localStorage.getItem("unscripted-reflection-profile")||"").slice(0,2000)).slice(0,4100),
      previous:[...(entry.reflections||[]).map(x=>x.question),...allParts(entry).filter(p=>p.reflectionAnswer).map(p=>p.question),...previous].slice(-12),
      truncated:truncated||text.length>24000||sources.length>history.length+1});
    if(typeof result.question!=="string"||!result.question.trim())throw Error("No question returned. Try again.");
    return {...result,sourceIds:(result.sourceIds||[]).filter(id=>id===entry.id||history.some(x=>x.id===id))};
  }
  async function savePerspectiveClip(id, partId, doc, blob, duration) {
    const clipId=uid(), reflectionId=partId||uid();
    await new Promise((resolve,reject)=>{
      const tx=state.db.transaction(["entries","audio"],"readwrite"),store=tx.objectStore("entries"),req=store.get(id);
      req.onsuccess=()=>{const entry=req.result;if(!entry){tx.abort();return;}
        let part=entry.parts.find(p=>p.id===reflectionId);
        if(!part){part={id:reflectionId,type:"note",reflectionAnswer:true,reflectionDraft:true,createdAt:new Date().toISOString(),question:doc.question,sourceIds:doc.sourceIds||[],answer:"",text:"Reflection question: "+doc.question,clips:[]};entry.parts.push(part);}
        part.clips.push({id:clipId,duration,mime:blob.type,transcript:""});
        tx.objectStore("audio").put({id:clipId,blob});entry.updatedAt=new Date().toISOString();store.put(entry);
      };tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("Could not save this audio."));
    });
    await refreshEntries();window.dispatchEvent(new Event("unscripted-change"));return reflectionId;
  }
  async function finishPerspective(id,partId,answer) {
    const fresh=await transaction("entries","readonly",s=>s.get(id)),part=fresh?.parts.find(p=>p.id===partId);
    if(!part)throw Error("Saved recording missing.");
    part.reflectionDraft=false;part.typedAnswer=answer.trim();
    part.answer=[part.typedAnswer,...part.clips.map(c=>c.transcript||"")].filter(Boolean).join("\n\n");
    part.text="Reflection question: "+part.question+"\nYour answer: "+part.answer;
    await saveEntry(fresh);await refreshEntries();if(state.selected===id)renderEntry();
  }
  async function discardPerspective(id,partId) {
    await new Promise((resolve,reject)=>{const tx=state.db.transaction(["entries","audio"],"readwrite"),store=tx.objectStore("entries"),req=store.get(id);
      req.onsuccess=()=>{const entry=req.result;if(!entry)return;const part=entry.parts.find(p=>p.id===partId);for(const c of part?.clips||[])tx.objectStore("audio").delete(c.id);entry.parts=entry.parts.filter(p=>p.id!==partId);store.put(entry);};
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });await refreshEntries();window.dispatchEvent(new Event("unscripted-change"));if(state.selected===id)renderEntry();
  }
  async function savePerspective(id,doc) {
    if(state.processing.has(id))throw Error("Wait for the summary to finish, then save again.");
    if(!doc.answer?.trim()||!doc.question?.trim())throw Error("Answer the question before saving.");
    const audioRows=(doc.audio||[]).map(row=>({id:uid(),blob:row.blob,duration:row.duration}));
    await new Promise((resolve,reject)=>{
      const tx=state.db.transaction(["entries","audio"],"readwrite"),entries=tx.objectStore("entries"),req=entries.get(id);
      req.onsuccess=()=>{const entry=req.result;if(!entry){tx.abort();return;}
        const part={id:uid(),type:"note",reflectionAnswer:true,createdAt:new Date().toISOString(),question:doc.question,answer:doc.answer.trim(),sourceIds:doc.sourceIds||[],
          text:"Reflection question: "+doc.question+"\nYour answer: "+doc.answer.trim(),clips:audioRows.map(row=>({id:row.id,duration:row.duration,mime:row.blob.type,transcript:doc.answer.trim()}))};
        for(const row of audioRows)tx.objectStore("audio").put({id:row.id,blob:row.blob});
        entry.parts=[...(entry.parts||[]),part];entry.updatedAt=part.createdAt;entries.put(entry);
      };
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("Could not save this reflection. The entry may have been deleted."));
    });
    await refreshEntries();window.dispatchEvent(new Event("unscripted-change"));
    if(state.selected===id){renderEntry();document.querySelector(".reflection-card").scrollIntoView({behavior:"smooth",block:"start"});}
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
      window.UnscriptedTextStyle?.apply();await refreshEntries(); switchView("home"); showToast("Backup imported ✦");
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
    $("startNewButton").onclick=()=>startRecording(null);$("navRecord").onclick=()=>startRecording(null);$("continueLastButton").onclick=()=>{if(state.entries[0])startRecording(state.entries[0].id);};$("searchInput").oninput=()=>{searchRevision++;semanticResults=null;renderHome();};
    $("cancelRecordingButton").onclick=requestCancelRecording;$("keepRecordingButton").onclick=()=>{$("cancelRecordingModal").hidden=true;};$("confirmCancelRecording").onclick=cancelRecording;
    $("pauseRecording").onclick=togglePause;$("finishRecording").onclick=stopRecording;
    $("addToEntryButton").onclick=openChoice;$("choiceClose").onclick=closeChoice;$("choiceRecord").onclick=()=>{const id=state.selected;closeChoice();startRecording(id);};$("choiceWrite").onclick=()=>{const id=state.selected;closeChoice();writeThought(id);};$("addNoteButton").onclick=()=>writeThought(state.selected);
    $("editTitleButton").onclick=()=>{const entry=currentEntry();if(entry)openEditor("Give it a title",entry.title,async value=>{entry.title=value||"Untitled thought";entry.titleEdited=true;await saveEntry(entry);await refreshEntries();renderEntry();});};
    $("editSummaryButton").onclick=()=>{const entry=currentEntry();if(entry)openEditor("Edit summary",entry.summary||"",async value=>{entry.summary=value;entry.summaryEdited=true;await saveEntry(entry);await refreshEntries();renderEntry();});};
    $("addTopicButton").onclick=()=>{const entry=currentEntry();if(entry)openEditor("Edit topics",(entry.tags||[]).join(", "),async value=>{entry.tags=[...new Set(value.split(",").map(x=>x.trim()).filter(Boolean))].slice(0,15);entry.userTags=entry.tags.slice();await saveEntry(entry);await refreshEntries();renderEntry();},"Separate topics with commas");};
    $("transcriptToggle").onclick=()=>{state.searchTarget=null;state.openTranscript=!state.openTranscript;renderEntry();};$("transcribeButton").onclick=()=>{const entry=currentEntry();if(entry)processEntry(entry.id);};$("deleteEntryButton").onclick=deleteEntry;
    $("closeEditor").onclick=closeEditor;$("editorCancel").onclick=closeEditor;$("editorSave").onclick=submitEditor;$("editorModal").onclick=(e)=>{if(e.target===$("editorModal"))closeEditor();};
    $("choiceModal").onclick=(e)=>{if(e.target===$("choiceModal"))closeChoice();};
    $("reflectButton").onclick=()=>{const entry=currentEntry();if(entry)window.UnscriptedPerspective.open(entry.id);};

    $("privateSignOut").onclick=async()=>{if(state.recording){showToast("Save your recording first.");return;}try{const r=await fetch("/logout",{method:"POST"});if(!r.ok)throw Error("Sign-out failed");localStorage.removeItem("unscripted-access-code");sessionStorage.removeItem("unscripted-access-code");if("caches" in window)for(const name of await caches.keys())if(name.startsWith("unscripted-"))await caches.delete(name);location.reload();}catch(e){showToast(e.message);}};
    $("saveSettingsButton").onclick=saveSettingsAndReturn;
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
    bindEvents(); bindEnhancements(); applyAccent(localStorage.getItem("unscripted-accent") || "#b8d2ab");
    try { state.db = await getDb(); await refreshEntries(); renderHome(); }
    catch (error) { showToast("Private storage unavailable: " + error.message); $("startNewButton").disabled=true; $("navRecord").disabled=true; }
    if("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
    if("storage" in navigator && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
  }
  window.UnscriptedDiary = {
    pauseForLock: () => { const rec=state.recording;if(rec&&!rec.closing){rec.paused=true;if(rec.recorder?.state==="recording")flushClip(rec);updateRecorderUI();} },
    navigateBack: route => {if(route.view==="entry"){if(state.entries.some(e=>e.id===route.id))openEntry(route.id);else switchView("home");}else if(route.view==="chat"){if(state.entries.some(e=>e.id===route.id))openChat(route.id);else switchView("ask");}else switchView(route.view);},
    config: getApiConfig, entries: () => state.entries, ready: () => !!state.db, recording: () => !!state.recording,
    audio: getAudio, clips: allClips, exportBackup, callAI, activeAI, toast:showToast, saveInterviewClip, transcribeInterviewAnswer, openInterviewSummary, summarySwitch, savePerspectiveClip, finishPerspective, discardPerspective, processEntry, profiles:profileData, restoreProfiles:restoreProfileData, saveInterview, savePerspective, perspectiveQuestion, openEntry, sources:chooseAskSources,
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
