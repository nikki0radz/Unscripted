/* Appearance data only: no downloaded scripts, HTML, CSS selectors or URLs. */
(() => {
  const KEY = 'unscripted-design-preview-v1';
  const LIMIT = 32768;
  const URL = 'https://nikki0radz.github.io/Unscripted/design-preview.json';
  const scope = ':is(#homeView,#entryView,#askView,#chatView)';
  const targets = Object.freeze({
    titles: 'h1', headings: 'h2', libraryCards: '.entry-card',
    summaries: '.summary-text', summaryBullets: '.summary-bullets',
    recordingCards: '.recording-archive-card', recordingLabels: '.recording-label',
    recordingDates: '.voice-note-date', transcriptToggles: '.recording-transcript > summary',
    transcripts: '.transcript-body', tags: '.tag', tagRows: '.tag-row',
    questions: '.reflection-question', answers: '.reflection-answer-card',
    softButtons: '.button-soft', primaryButtons: '.button-primary',
    sections: '.section-title-row', interviewQuestions: '.interview-question-card'
  });
  const fonts = Object.freeze({system:'system-ui,sans-serif',serif:'Fraunces,Georgia,serif',
    handwritten:'Caveat,cursive'});
  function value(property, input) {
    if (['padding','padding-top','padding-bottom','padding-left','padding-right',
      'margin-top','margin-bottom','gap','border-radius','font-size','letter-spacing'].includes(property)) {
      const min = property === 'font-size' ? 12 : 0;
      const max = property === 'letter-spacing' ? 3 : property === 'font-size' ? 48 : 40;
      if (typeof input !== 'number' || !Number.isFinite(input) || input < min || input > max) throw Error('Unsupported size');
      return property === 'font-size' ? `calc(${input}px * var(--text-scale,1))` : `${input}px`;
    }
    if (property === 'line-height' && typeof input === 'number' && input >= 1.2 && input <= 2) return String(input);
    if (property === 'font-weight' && [400,500,600,700].includes(input)) return String(input);
    if (property === 'font-family' && Object.hasOwn(fonts,input)) return fonts[input];
    if (['color','background-color','border-color'].includes(property) && typeof input === 'string' && /^#[a-f0-9]{6}$/i.test(input)) return input;
    throw Error('Unsupported appearance setting');
  }
  function compile(data) {
    if (!data || data.schema !== 1 || typeof data.revision !== 'string' || !/^[a-zA-Z0-9._-]{1,50}$/.test(data.revision)
      || typeof data.label !== 'string' || data.label.length > 100 || !Array.isArray(data.rules) || data.rules.length > 40) throw Error('Unsupported preview');
    if (data.libraryLayout !== undefined && data.libraryLayout !== "categories") throw Error("Unsupported library layout");
    return data.rules.map(rule => {
      if (!rule || !Object.hasOwn(targets,rule.target) || !rule.styles || typeof rule.styles !== 'object' || Array.isArray(rule.styles)) throw Error('Unsupported preview target');
      const entries = Object.entries(rule.styles);
      if (entries.length > 16) throw Error('Too many appearance settings');
      return `${scope} ${targets[rule.target]}{${entries.map(([p,v]) => `${p}:${value(p,v)} !important`).join(';')}}`;
    }).join('\n');
  }
  // The same validator is exercised in a DOM-free regression harness.
  if (typeof module !== 'undefined' && module.exports) { module.exports = {compile}; return; }
  const $ = id => document.getElementById(id);
  const toggle = $('designPreviewEnabled'), refresh = $('refreshDesignPreview'), status = $('designPreviewStatus');
  if (!toggle || !refresh || !status) return;
  const style = document.createElement('style'); style.id = 'designPreviewStyles'; document.head.append(style);
  const badge = $('designPreviewBadge'), off = $('stopDesignPreview');
  let enabled = false, cached = null, busy = false, request = 0, controller;
  function paint() {
    toggle.checked = enabled; refresh.disabled = busy; off.hidden = !enabled;
    badge.hidden = !enabled; badge.textContent = enabled ? 'Design preview on' : '';
    refresh.textContent = busy ? 'Refreshing…' : 'Refresh preview';
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({enabled,cached})); return true; }
    catch { return false; }
  }
  function sizeLibraryFilter() {
    const select = $('libraryKind');
    if (select?.style?.setProperty) select.style.setProperty('--library-filter-chars',Math.min(28,Math.max(10,select.selectedOptions[0].textContent.length)));
  }
  $('libraryKind')?.addEventListener?.('change',sizeLibraryFilter);
  function applyLibraryLayout(active) {
    const row = $('libraryFiltersRow'), control = $('libraryKindControl'), search = $('librarySearch');
    if (!row?.insertBefore || !control || !search) return;
    const library = row.closest('.library-section');
    if (active) row.insertBefore(control,row.firstChild);
    else search.before(control);
    library.classList.toggle('preview-library-categories',active);
    library.querySelector('.library-preview-divider').hidden = !active;
    sizeLibraryFilter();
  }
  function apply() {
    style.textContent = enabled && cached ? compile(cached) : '';
    applyLibraryLayout(enabled && cached?.libraryLayout === 'categories'); paint();
  }
  function turnOff() {
    request++; controller?.abort(); busy = false; enabled = false; apply();
    status.textContent = save() ? 'Installed design restored.' : 'Installed design restored for this session. Preview preference could not be saved.';
  }
  async function update() {
    const ticket = ++request; controller?.abort(); controller = new AbortController();
    const current = controller; const signal = current.signal; busy = true; paint();
    const timeout = setTimeout(() => current.abort(), 12000);
    try {
      const endpoint = window.UnscriptedAndroid ? '/__native/design-preview' : URL;
      const response = await fetch(endpoint, {cache:'no-store',credentials:'omit',redirect:'error',signal});
      if (!response.ok) throw Error('Preview unavailable');
      if (Number(response.headers.get('content-length')) > LIMIT) throw Error('Preview too large');
      const reader = response.body.getReader(); let bytes = 0; const chunks = [];
      for (;;) { const {done,value:chunk} = await reader.read(); if (done) break; bytes += chunk.byteLength;
        if (bytes > LIMIT) { await reader.cancel(); throw Error('Preview too large'); } chunks.push(chunk); }
      const buffer = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { buffer.set(chunk,offset); offset += chunk.byteLength; }
      const data = JSON.parse(new TextDecoder().decode(buffer)); compile(data);
      if (ticket !== request) return;
      cached = data; enabled = true; apply();
      const persisted = save();
      status.textContent = (data.rules.length || data.libraryLayout ? `${data.label} · ${data.revision}.` : 'Preview connected. No design changes are available yet.')
        + (persisted ? '' : ' Preview could not be saved for next time.');
    } catch {
      if (ticket !== request) return;
      status.textContent = enabled && cached ? 'Could not refresh. Your last preview is still shown; you can switch it off below.' : 'Could not load the preview. Your installed design is unchanged. Try again when online.';
    } finally { clearTimeout(timeout); if (ticket === request) { busy = false; paint(); } }
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && raw.length <= LIMIT + 200) { const saved = JSON.parse(raw);
      if (saved.cached) { compile(saved.cached); cached = saved.cached; enabled = saved.enabled === true; } }
  } catch { enabled = false; cached = null; }
  apply(); status.textContent = enabled ? `${cached.label} · ${cached.revision}. Saved preview; refresh to check for changes.` : 'Using your installed design.';
  toggle.onchange = () => { if (!toggle.checked) turnOff(); else { toggle.checked = enabled; update(); } };
  refresh.onclick = update; off.onclick = turnOff; badge.onclick = turnOff;
})();
