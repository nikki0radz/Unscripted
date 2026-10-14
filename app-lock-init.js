// Run before the diary renders, including when opened from the offline cache.
try { if(localStorage.getItem('unscripted-always-lock')==='true')document.documentElement.dataset.diaryLocked='true'; } catch { document.documentElement.dataset.diaryLocked='true'; }
