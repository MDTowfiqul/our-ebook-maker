/* Our Ebook Maker — PDF to text, fully in the browser.
   Every page is read with OCR (tesseract.js, Bengali + English + Arabic
   together, so no language has to be picked). The result is raw OCR
   text for proofreading — there is deliberately no EPUB download of
   raw OCR text, because OCR text must be proofread before it becomes
   an ebook. Progress is saved after every page, so a scan paused by
   switching apps (or by the phone sleeping) can resume exactly where
   it stopped. Automatic proofreading uses the visitor's own Google
   Gemini key (default, free) or OpenRouter key: the key stays in
   their browser and is sent only to Google or OpenRouter, never to
   any server of ours (we have none). After proofreading, the finished
   text downloads as .md, as a .docx document, or as a finished EPUB
   built right here (with the cover, if one was made).
   Libraries (CDN): pdf.js for page rendering, tesseract.js for OCR,
   JSZip for the .docx and EPUB builders. No file is ever uploaded
   anywhere except the text chunks sent to the visitor's own AI provider
   during automatic proofreading. */
(function () {
  'use strict';
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  var $ = function (id) { return document.getElementById(id); };
  var fileEl = $('file'), titleEl = $('title'), authorEl = $('author'), creatorEl = $('creator');
  var testBtn = $('testBtn'), runBtn = $('runBtn'), cancelBtn = $('cancelBtn'), txtBtn = $('txtBtn');
  var screenOnBtn = $('screenOnBtn'), screenOnNote = $('screenOnNote');
  var bar = $('bar'), statusEl = $('status'), previewEl = $('preview'), fileinfoEl = $('fileinfo');
  var resultsEl = $('results'), summaryEl = $('summary');
  /* v6: proofreading is inline in Step 4 — the old manual/auto pop-ups are gone. */
  var coverFileEl = $('coverFile'), coverOnlineBtn = $('coverOnlineBtn'), coverTextBtn = $('coverTextBtn');
  var coverAnotherBtn = $('coverAnotherBtn');
  var coverImg = $('coverImg'), coverDownloadBtn = $('coverDownloadBtn'), coverStatusEl = $('coverStatus');
  var langToggle = $('lang-toggle'), langLabel = $('lang-label');
  var resumeBox = $('resumeBox'), resumeInfo = $('resumeInfo'), resumeBtn = $('resumeBtn'), discardBtn = $('discardBtn');
  var txtFileEl = $('txtFile'), txtFileStatusEl = $('txtFileStatus');
  var proofFileEl = $('proofFile'), proofFileStatusEl = $('proofFileStatus');
  var docFileEl = $('docFile'), docFileStatusEl = $('docFileStatus'), finalStatusEl = $('finalStatus');
  var vflatBtn = $('vflatBtn'), vflatModal = $('vflatModal'), vflatClose = $('vflatClose'), vflatUploadBtn = $('vflatUploadBtn');
  var proofKeyEl = $('proofKey'), proofProviderEl = $('proofProvider');
  var proofModelSelect = $('proofModelSelect'), proofModelInput = $('proofModelInput');
  var proofLoadModelsBtn = $('proofLoadModelsBtn'), proofKeyStatsEl = $('proofKeyStats');
  var keyHelpBtn = $('keyHelpBtn'), keyHelpModal = $('keyHelpModal'), keyHelpText = $('keyHelpText');
  var keyHelpLink = $('keyHelpLink'), keyHelpClose = $('keyHelpClose');
  var autoProofBtn = $('autoProofBtn'), proofCancelBtn = $('proofCancelBtn');
  var proofBar = $('proofBar'), proofStatusEl = $('proofStatus'), proofStatsEl = $('proofStats');
  var proofDownloadBtn = $('proofDownloadBtn'), proofDocxBtn = $('proofDocxBtn'), proofEpubBtn = $('proofEpubBtn');
  var proofPdfBtn = $('proofPdfBtn'), proofCalibreBtn = $('proofCalibreBtn'), calibreNote = $('calibreNote');

  var state = { pages: null, fullText: '', proofText: '', cancelled: false, running: false, proofCancelled: false, wakeLock: null, proofStartedAt: 0, coverBlob: null, coverExt: 'png', screenLock: null, docBlob: null, docIsOriginal: false };


  var PROOF_PROMPT = 'Act as an expert Digital Archivist, Master Typographer, and EPUB Formatter. Your task is to digitize raw, unformatted text (often containing OCR errors) from old, copyright-free (public domain) books and convert it into pristine, beautifully structured Markdown optimized for professional EPUB conversion. This message contains ONE chunk of a longer book; process only this chunk, do not invent missing parts. Rules: use # only for the book title if it appears, ## for chapter/major-section titles, ### for sub-sections, *** for scene breaks; remove page numbers, running headers and footers; join fragmented sentences into cohesive paragraphs; correct common OCR errors ("scannos") without altering meaning and without modernizing archaic vocabulary; replace -- with em-dashes and spaced hyphens with en-dashes where appropriate; standardize quotation marks and use *italics* for emphasis, book titles and foreign words; blockquotes with > , poetry with double-space line breaks, footnotes next to their number in superscript within third brackets; for Bangla, correct OCR spelling (য় mistaken as য), centre titles/headings, justify text; for Arabic, correct errors, add harkat, no brackets, right-align, and format Quranic ayahs as in the example: آيه ۝١٩١. Output ONLY the formatted Markdown for this chunk, no conversational filler.';

  /* ---- Language (EN/BN toggle, like Our Boighar) ---- */
  var LANG = localStorage.getItem('oem-lang') || 'en';
  var DYNAMIC_IDS = { status: 1, summary: 1, fileinfo: 1, coverStatus: 1, preview: 1, resumeInfo: 1, proofStatus: 1, txtFileStatus: 1, proofFileStatus: 1, docFileStatus: 1, finalStatus: 1, docStatus: 1, proofStats: 1, proofKeyStats: 1 };
  function L(en, bn) { return LANG === 'bn' ? bn : en; }
  function applyLang() {
    document.querySelectorAll('[data-bn]').forEach(function (el) {
      if (DYNAMIC_IDS[el.id]) return;
      el.textContent = LANG === 'bn' ? el.getAttribute('data-bn') : el.getAttribute('data-en');
    });
    document.querySelectorAll('[data-bn-ph]').forEach(function (el) {
      el.placeholder = LANG === 'bn' ? el.getAttribute('data-bn-ph') : el.getAttribute('data-en-ph');
    });
    document.documentElement.lang = LANG;
    if (langLabel) langLabel.textContent = LANG === 'bn' ? 'BN' : 'EN';
    var dl = $('drawer-lang-label'); if (dl) dl.textContent = LANG === 'bn' ? 'বাংলা' : 'English';
    try { localStorage.setItem('oem-lang', LANG); } catch (e) {}
  }
  function toggleLang() { LANG = LANG === 'bn' ? 'en' : 'bn'; applyLang(); }
  if (langToggle) langToggle.addEventListener('click', toggleLang);
  var drawerLangBtn = $('drawer-lang');
  if (drawerLangBtn) drawerLangBtn.addEventListener('click', toggleLang);
  applyLang();

  /* ---- v7: Boighar-style theme, drawer, collapsibles, panels, nav, guide pop-ups ---- */
  function paintTheme() {
    var dark = document.documentElement.classList.contains('dark');
    var tt = $('theme-toggle'); if (tt) tt.textContent = dark ? '☀️' : '🌙';
    var di = $('drawer-theme-icon'); if (di) di.textContent = dark ? '☀️' : '🌙';
    var dl2 = $('drawer-theme-label'); if (dl2) dl2.textContent = dark ? L('Dark', 'অন্ধকার') : L('Light', 'আলো');
    var cur = localStorage.getItem('oem-color') || 'purple';
    document.querySelectorAll('.swatch').forEach(function (s) { s.classList.toggle('on', s.getAttribute('data-setcolor') === cur); });
  }
  function toggleTheme() {
    var on = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('oem-theme', on ? 'dark' : 'light'); } catch (e) {}
    paintTheme();
  }
  var themeToggle = $('theme-toggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
  var drawerThemeBtn = $('drawer-theme-btn');
  if (drawerThemeBtn) drawerThemeBtn.addEventListener('click', toggleTheme);
  document.querySelectorAll('.swatch').forEach(function (s) {
    s.addEventListener('click', function () {
      document.documentElement.setAttribute('data-color', s.getAttribute('data-setcolor'));
      try { localStorage.setItem('oem-color', s.getAttribute('data-setcolor')); } catch (e) {}
      paintTheme();
    });
  });
  paintTheme();
  function openDrawer() {
    var d = $('drawer'), o = $('drawer-overlay');
    if (d) d.classList.remove('-translate-x-full');
    if (o) { o.classList.remove('opacity-0', 'pointer-events-none'); }
  }
  function closeDrawer() {
    var d = $('drawer'), o = $('drawer-overlay');
    if (d) d.classList.add('-translate-x-full');
    if (o) { o.classList.add('opacity-0', 'pointer-events-none'); }
  }
  var menuBtn = $('menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', openDrawer);
  var drawerClose = $('drawer-close');
  if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
  var drawerOverlay = $('drawer-overlay');
  if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);
  document.querySelectorAll('.drawer-link').forEach(function (b) {
    b.addEventListener('click', function () {
      closeDrawer();
      var t = b.getAttribute('data-scroll');
      if (t === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
      else { var el = $(t); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
  function setCollapse(id, open) {
    var body = $(id); if (!body) return;
    body.classList.toggle('hidden', !open);
    var btn = document.querySelector('.collapse-toggle[data-target="' + id + '"]');
    if (btn) { var chev = btn.querySelector('.collapse-chev'); if (chev) chev.textContent = open ? '▲' : '▼'; }
  }
  document.querySelectorAll('.collapse-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-target');
      var body = $(id); if (body) setCollapse(id, body.classList.contains('hidden'));
    });
  });
  function setPanel(which) {
    var mp = $('manualPanel'), ap = $('autoPanel');
    var mb = $('manualToggleBtn'), ab = $('autoToggleBtn');
    var manualOpen = which === 'manual' && mp && mp.classList.contains('hidden');
    var autoOpen = which === 'auto' && ap && ap.classList.contains('hidden');
    if (mp) mp.classList.add('hidden');
    if (ap) ap.classList.add('hidden');
    if (mb) mb.classList.remove('accent-soft-bg', 'accent-text');
    if (ab) ab.classList.remove('accent-soft-bg', 'accent-text');
    if (manualOpen && mp) { mp.classList.remove('hidden'); if (mb) mb.classList.add('accent-soft-bg', 'accent-text'); }
    if (autoOpen && ap) { ap.classList.remove('hidden'); if (ab) ab.classList.add('accent-soft-bg', 'accent-text'); }
  }
  var manualToggleBtn = $('manualToggleBtn'), autoToggleBtn = $('autoToggleBtn');
  if (manualToggleBtn) manualToggleBtn.addEventListener('click', function () { setPanel('manual'); });
  if (autoToggleBtn) autoToggleBtn.addEventListener('click', function () { setPanel('auto'); });
  function setNavActive(btn) {
    document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('accent-soft-bg', 'accent-text'); });
    if (btn) btn.classList.add('accent-soft-bg', 'accent-text');
  }
  var navHome = $('navHome'), navProofread = $('navProofread'), navEbook = $('navEbook'), navGuide = $('navGuide');
  if (navHome) navHome.addEventListener('click', function () { setNavActive(navHome); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  if (navProofread) navProofread.addEventListener('click', function () { setNavActive(navProofread); var el = $('results'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  if (navEbook) navEbook.addEventListener('click', function () { setNavActive(navEbook); var el = $('finalFormats'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  /* Guide pop-ups (v7): the maker no longer navigates to guide.html for the
     proofreading links — the necessary information opens here instead. */
  document.querySelectorAll('.guide-open').forEach(function (b) {
    b.addEventListener('click', function () { closeDrawer(); openModal($('guideModal')); });
  });
  document.querySelectorAll('.guide-close').forEach(function (b) {
    b.addEventListener('click', function () { closeModal($('guideModal')); });
  });
  document.querySelectorAll('.proofsteps-open').forEach(function (b) {
    b.addEventListener('click', function () { closeDrawer(); closeModal($('guideModal')); openModal($('proofStepsModal')); });
  });
  document.querySelectorAll('.proofsteps-close').forEach(function (b) {
    b.addEventListener('click', function () { closeModal($('proofStepsModal')); });
  });
  document.querySelectorAll('.muse-open').forEach(function (b) {
    b.addEventListener('click', function () { closeDrawer(); closeModal($('guideModal')); openModal($('museModal')); });
  });
  document.querySelectorAll('.muse-close').forEach(function (b) {
    b.addEventListener('click', function () { closeModal($('museModal')); });
  });
  document.querySelectorAll('.privacy-open').forEach(function (b) {
    b.addEventListener('click', function () { closeDrawer(); openModal($('privacyModal')); });
  });
  document.querySelectorAll('.privacy-close').forEach(function (b) {
    b.addEventListener('click', function () { closeModal($('privacyModal')); });
  });
  if (navGuide) navGuide.addEventListener('click', function () { setNavActive(navGuide); openModal($('guideModal')); });
  var drawerKeyhelp = $('drawer-keyhelp');
  if (drawerKeyhelp) drawerKeyhelp.addEventListener('click', function () { closeDrawer(); openModal($('keyHelpModal')); });
  ['guideModal', 'proofStepsModal', 'museModal', 'museDirectModal', 'privacyModal'].forEach(function (id) {
    var m = $(id);
    if (m) m.addEventListener('click', function (ev) { if (ev.target === m) closeModal(m); });
  });
  function copyTextarea(id, btn, doneBn, doneEn) {
    var ta = $(id); if (!ta) return;
    var done = function () {
      var old = btn.textContent;
      btn.textContent = L(doneEn, doneBn);
      setTimeout(function () { btn.textContent = old; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(done).catch(function () { ta.select(); document.execCommand('copy'); done(); });
    } else { ta.select(); document.execCommand('copy'); done(); }
  }
  var copyProofBtn = $('copyProofPromptBtn');
  if (copyProofBtn) copyProofBtn.addEventListener('click', function () { copyTextarea('proofPromptText', copyProofBtn, 'কপি হয়েছে!', 'Copied!'); });
  var copyMuseBtn = $('copyMusePromptBtn');
  if (copyMuseBtn) copyMuseBtn.addEventListener('click', function () { copyTextarea('musePromptText', copyMuseBtn, 'কপি হয়েছে!', 'Copied!'); });
  /* v8: Muse direct route — full prompt modal + direct copy buttons. */
  document.querySelectorAll('.museDirect-open').forEach(function (b) { b.addEventListener('click', function () { openModal($('museDirectModal')); }); });
  document.querySelectorAll('.museDirect-close').forEach(function (b) { b.addEventListener('click', function () { closeModal($('museDirectModal')); }); });
  var copyMuseDirectBtn = $('copyMuseDirectBtn');
  if (copyMuseDirectBtn) copyMuseDirectBtn.addEventListener('click', function () { copyTextarea('museDirectPromptText', copyMuseDirectBtn, 'কপি হয়েছে!', 'Copied!'); });
  document.querySelectorAll('.copy-direct-prompt').forEach(function (b) {
    b.addEventListener('click', function () {
      var ta = $('museDirectPromptText');
      if (!ta) return;
      copyTextarea('museDirectPromptText', b, 'কপি হয়েছে!', 'Copied!');
      var st = $('directCopyStatus');
      if (st) st.textContent = L('প্রম্পট কপি হয়েছে — Muse চ্যাটে PDF-এর সঙ্গে পেস্ট করুন।', 'Prompt copied — paste it in a Muse chat together with the PDF.');
    });
  });

  /* ---- Saved progress: IndexedDB when available, else localStorage ---- */
  var PROGRESS_KEY = 'oem-progress-v1';
  function idb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') return reject(new Error('no-idb'));
      var req = indexedDB.open('oem-db', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbPut(obj) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(obj, PROGRESS_KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbGet() {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readonly');
        var req = tx.objectStore('kv').get(PROGRESS_KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function idbDelete() {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').delete(PROGRESS_KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function saveProgress(obj) {
    // Fire-and-forget: a failed save must never stop the scan itself.
    idbPut(obj).catch(function () {
      try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(obj)); } catch (e) {}
    });
  }
  function loadProgress() {
    return idbGet().catch(function () {
      try {
        var raw = localStorage.getItem(PROGRESS_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    });
  }
  function clearProgress() {
    idbDelete().catch(function () {});
    try { localStorage.removeItem(PROGRESS_KEY); } catch (e) {}
  }
  function progressKeyFor(file) { return file.name + '|' + file.size; }
  var savedProgress = null;

  function setStatus(msg) { statusEl.textContent = msg; }
  function setProgress(pct) { bar.style.width = Math.max(0, Math.min(100, pct)) + '%'; }
  function showPreview(text) {
    previewEl.classList.remove('hidden');
    previewEl.textContent = text;
  }
  function cleanPageText(raw) {
    var text = (raw || '').replace(/(\w)-\n(\w)/g, '$1$2');
    var lines = text.split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); });
    lines = lines.filter(function (l) { return !/^\d{1,4}$/.test(l); });
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function ocrPage(pdf, pageNum, worker) {
    var page = await pdf.getPage(pageNum);
    var viewport = page.getViewport({ scale: 2 });
    var canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    var ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    var res = await worker.recognize(canvas);
    return cleanPageText(res.data.text || '');
  }

  /* limit = pages to read (0 = all). resume = saved progress object or null. */
  async function extractPages(limit, resume) {
    var file = fileEl.files[0];
    if (!file) { alert(L('Please choose a PDF file first.', 'আগে একটি PDF ফাইল বাছুন।')); return null; }
    if (!/\.pdf$/i.test(file.name)) { alert(L('Please choose a PDF file.', 'একটি PDF ফাইল বাছুন।')); return null; }
    state.cancelled = false;
    state.running = true;
    var buf = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var total = pdf.numPages;
    var upto = limit ? Math.min(limit, total) : total;
    var pages = [];
    var start = 1;
    if (resume && resume.totalPages === total && Array.isArray(resume.pages)) {
      pages = resume.pages.slice();
      start = pages.length + 1;
      if (start > total) start = total + 1;
    }
    setStatus(L('Loading OCR (Bengali + English + Arabic)… first time downloads language data, then it is cached.',
      'OCR লোড হচ্ছে (বাংলা + ইংরেজি + আরবি)… প্রথমবার ভাষার ডেটা ডাউনলোড হবে, পরে ক্যাশে থাকবে।'));
    var worker = await Tesseract.createWorker('ben+eng+ara');
    var pageTimes = [];
    function fmtDur(ms) {
      var s = Math.round(ms / 1000);
      if (s < 60) return s + 's';
      return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    }
    try {
      for (var n = start; n <= upto; n++) {
        if (state.cancelled) break;
        var t0 = Date.now();
        var text = await ocrPage(pdf, n, worker);
        pageTimes.push(Math.max(1, Date.now() - t0));
        pages.push({ num: n, text: text });
        if (!limit) {
          saveProgress({ key: progressKeyFor(file), totalPages: total, title: titleEl.value, author: authorEl.value, pages: pages });
        }
        setProgress(Math.round((n / upto) * 100));
        var avg = pageTimes.reduce(function (a, b) { return a + b; }, 0) / pageTimes.length;
        var eta = (upto - n) > 0 ? L(' • about ' + fmtDur(avg * (upto - n)) + ' left', ' • বাকি প্রায় ' + fmtDur(avg * (upto - n))) : '';
        setStatus(L('Page ' + n + ' of ' + upto + (total > upto ? ' (of ' + total + ' total)' : '') + ' • ~' + (avg / 1000).toFixed(1) + 's per page' + eta,
          'পৃষ্ঠা ' + n + ' / ' + upto + (total > upto ? ' (মোট ' + total + ')' : '') + ' • প্রতি পৃষ্ঠায় ~' + (avg / 1000).toFixed(1) + ' সেকেন্ড' + eta));
        await new Promise(function (r) { setTimeout(r, 0); });
      }
    } finally {
      try { await worker.terminate(); } catch (e) {}
      state.running = false;
    }
    if (state.cancelled) {
      setStatus(L('Paused — progress is saved. Tap Resume to continue from page ' + (pages.length + 1) + '.',
        'থেমে গেছে — অগ্রগতি সেভ আছে। ' + (pages.length + 1) + ' নম্বর পৃষ্ঠা থেকে চালাতে Resume চাপুন।'));
      return null;
    }
    return pages;
  }

  function download(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function safeName(s) { return s.replace(/[^a-zA-Z0-9\u0980-\u09FF\u0600-\u06FF _-]+/g, '').trim().replace(/\s+/g, '-') || 'book'; }

  async function withWakeLock(fn) {
    try { if (navigator.wakeLock) state.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
    try { await fn(); } finally {
      try { if (state.wakeLock) await state.wakeLock.release(); } catch (e) {}
      state.wakeLock = null;
    }
  }
  /* "Keep screen on" button: a manual wake lock for leaving the phone untouched.
     It only works while this tab stays in front — switching apps releases it,
     which is exactly why Resume exists. */
  /* Circular screen-on button, right of its description: sun when off,
     a check when on (emerald fill). Text is never written into the circle. */
  function setScreenOnUI(on) {
    if (!screenOnBtn) return;
    screenOnBtn.textContent = on ? '✓' : '🔆';
    screenOnBtn.className = 'shrink-0 w-16 h-16 rounded-full text-2xl font-bold shadow ' + (on
      ? 'accent-bg text-white border-2 border-transparent'
      : 'bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-600');
  }
  if (screenOnBtn) screenOnBtn.addEventListener('click', async function () {
    if (!navigator.wakeLock) {
      if (screenOnNote) screenOnNote.textContent = L('This browser does not support keeping the screen awake. Keep the tab open and the phone plugged in instead.',
        'এই ব্রাউজারে স্ক্রিন জাগিয়ে রাখা যায় না। ট্যাব খোলা রেখে ফোন চার্জে দিন।');
      return;
    }
    try {
      if (state.screenLock) {
        await state.screenLock.release();
        state.screenLock = null;
        setScreenOnUI(false);
      } else {
        state.screenLock = await navigator.wakeLock.request('screen');
        state.screenLock.addEventListener('release', function () { state.screenLock = null; setScreenOnUI(false); });
        setScreenOnUI(true);
      }
    } catch (e) {
      if (screenOnNote) screenOnNote.textContent = L('Could not keep the screen awake (' + e.message + ').',
        'স্ক্রিন জাগিয়ে রাখা যায়নি (' + e.message + ')।');
    }
  });
  /* vFlat pop-up only: proofreading itself is inline in Step 4, no pop-ups. */
  function openModal(m) { if (m) m.classList.remove('hidden'); }
  function closeModal(m) { if (m) m.classList.add('hidden'); }
  if (vflatBtn) vflatBtn.addEventListener('click', function () { openModal(vflatModal); });
  if (vflatClose) vflatClose.addEventListener('click', function () { closeModal(vflatModal); });
  if (vflatUploadBtn) vflatUploadBtn.addEventListener('click', function () {
    closeModal(vflatModal);
    setCollapse('collapse-txt', true);
    if (txtFileEl) txtFileEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  if (vflatModal) vflatModal.addEventListener('click', function (ev) { if (ev.target === vflatModal) closeModal(vflatModal); });
  /* v8 split: Step 5 (formatted document) unlocks on proofread text;
     Step 6 (final ebook) unlocks only when the document exists — made in
     Step 5, or uploaded as a formatted .docx (including a Google Doc .docx from the Muse route). */
  function unlockStep3() {
    if (txtBtn) txtBtn.disabled = false;
    if (autoProofBtn) autoProofBtn.disabled = false;
    summaryEl.textContent = L('Text ready — proofread it below (by hand or automatically), then go to Step 5.',
      'লেখা তৈরি — নিচে হাতে বা স্বয়ংক্রিয়ভাবে প্রুফরিড করুন, তারপর ধাপ ৪-এ যান।');
  }
  function unlockDoc(msg) {
    showDocOutputs();
    var ds = $('docStatus');
    if (ds) ds.textContent = msg || L('Proofread text ready — make the formatted document below.',
      'প্রুফরিড লেখা তৈরি — নিচে ফরম্যাট করা ডকুমেন্ট বানান।');
  }
  function unlockEbook(msg) {
    showEbookOutputs();
    if (finalStatusEl) finalStatusEl.textContent = msg || L('Document ready — pick an ebook format below.',
      'ডকুমেন্ট তৈরি — নিচে ইবুক ফরম্যাট বাছুন।');
  }
  function setBusy(busy) {
    testBtn.disabled = busy; runBtn.disabled = busy; cancelBtn.disabled = !busy;
    if (resumeBtn) resumeBtn.disabled = busy;
  }
  function finishFullRun(pages) {
    state.pages = pages;
    var title = (titleEl.value || '').trim();
    var author = (authorEl.value || '').trim();
    var head = '';
    if (title) head += title + '\n';
    if (author) head += author + '\n';
    if (head) head += '\n';
    var full = head + pages.map(function (p) { return p.text; }).join('\n\n');
    state.fullText = full;
    clearProgress();
    savedProgress = null;
    if (resumeBox) resumeBox.classList.add('hidden');
    summaryEl.textContent = L(pages.length + ' pages read with OCR, about ' + full.length.toLocaleString() + ' characters.',
      pages.length + ' পৃষ্ঠা OCR করা হয়েছে, প্রায় ' + full.length.toLocaleString() + ' অক্ষর।');
    if (resumeBtn) resumeBtn.disabled = true;
    unlockStep3();
    setStatus(L('Done. Proofread below in Step 4 — by hand or automatically.',
      'শেষ। নিচে ধাপ ৩-এ হাতে বা স্বয়ংক্রিয়ভাবে প্রুফরিড করুন।'));
    setProgress(100);
  }

  async function refreshResumeBox() {
    if (!fileEl.files[0]) { if (resumeBtn) resumeBtn.disabled = true; return; }
    var prog = await loadProgress();
    savedProgress = null;
    if (prog && prog.key === progressKeyFor(fileEl.files[0]) && prog.pages && prog.pages.length > 0 && prog.pages.length < prog.totalPages) {
      savedProgress = prog;
      if (resumeInfo) resumeInfo.textContent = L('Saved progress for this file: ' + prog.pages.length + ' of ' + prog.totalPages + ' pages done. Nothing is lost — tap Resume above.',
        'এই ফাইলের সেভ করা অগ্রগতি: ' + prog.pages.length + ' / ' + prog.totalPages + ' পৃষ্ঠা শেষ। কিছু হারায়নি — উপরে Resume চাপুন।');
      if (resumeBox) resumeBox.classList.remove('hidden');
      if (resumeBtn) resumeBtn.disabled = false;
    } else {
      if (resumeBox) resumeBox.classList.add('hidden');
      if (resumeBtn && !state.running) resumeBtn.disabled = true;
    }
  }

  /* File status: the browser's own filename label and this line must never
     contradict each other. Update on change, on input, and whenever the
     window regains focus (some Android pickers return without a change
     event firing reliably). */
  function updateFileInfo() {
    var f = fileEl.files[0];
    if (!f) return;
    fileinfoEl.textContent = '✓ ' + L('Selected: ', 'বাছা হয়েছে: ') + f.name + ' — ' + (f.size / 1048576).toFixed(1) + ' MB';
  }
  fileEl.addEventListener('change', function () {
    var f = fileEl.files[0];
    if (!f) return;
    updateFileInfo();
    if (!titleEl.value) titleEl.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    state.fullText = ''; state.proofText = ''; state.docBlob = null; state.docIsOriginal = false;
    hideDocOutputs(); hideEbookOutputs();
    summaryEl.textContent = L('Run the full book first — Step 4 unlocks when the text is ready.',
      'পুরো বই চালানোর পর লেখা তৈরি হলে ধাপ ৩ খুলবে।');
    if (txtBtn) txtBtn.disabled = true;
    if (autoProofBtn) autoProofBtn.disabled = true;
    refreshResumeBox();
  });
  fileEl.addEventListener('input', updateFileInfo);
  window.addEventListener('focus', updateFileInfo);
  cancelBtn.addEventListener('click', function () {
    state.cancelled = true;
    setStatus(L('Stopping after this page — progress stays saved.', 'এই পৃষ্ঠার পর থামছে — অগ্রগতি সেভ থাকবে।'));
  });
  if (discardBtn) discardBtn.addEventListener('click', function () {
    clearProgress();
    savedProgress = null;
    if (resumeBox) resumeBox.classList.add('hidden');
    if (resumeBtn) resumeBtn.disabled = true;
    setStatus(L('Saved progress cleared. Start fresh when ready.', 'সেভ করা অগ্রগতি মুছে দেওয়া হয়েছে। নতুন করে শুরু করতে পারেন।'));
  });
  if (resumeBtn) resumeBtn.addEventListener('click', function () {
    if (!savedProgress) return;
    withWakeLock(async function () {
      setBusy(true); setProgress(Math.round((savedProgress.pages.length / savedProgress.totalPages) * 100));
      var pages = await extractPages(0, savedProgress);
      setBusy(false);
      if (pages) finishFullRun(pages);
      else refreshResumeBox();
    });
  });
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.running) {
        setStatus(L('Paused in the background — progress is saved after every page. Come back and tap Resume if it does not continue.',
          'ব্যাকগ্রাউন্ডে থেমে গেছে — প্রতি পৃষ্ঠার পর অগ্রগতি সেভ হয়। ফিরে এসে না চললে Resume চাপুন।'));
        refreshResumeBox();
      } else if (!document.hidden) {
        /* Returning to the tab must re-show Resume: this was the v5 bug —
           the paused status mentioned Resume, but the button stayed hidden. */
        refreshResumeBox();
      }
    });
  }

  testBtn.addEventListener('click', function () {
    withWakeLock(async function () {
      setBusy(true); setProgress(0);
      var pages = await extractPages(5, null);
      setBusy(false);
      if (!pages) return;
      state.pages = pages;
      var text = pages.map(function (p) { return '--- ' + L('Page ', 'পৃষ্ঠা ') + p.num + ' ---\n' + p.text; }).join('\n\n');
      showPreview(text.slice(0, 6000) + (text.length > 6000 ? '\n\n…(preview cut at 6,000 characters)' : ''));
      setStatus(L('Test done: ' + pages.length + ' pages. Read the preview — if it looks clean, run the full book.',
        'পরীক্ষা শেষ: ' + pages.length + ' পৃষ্ঠা। প্রিভিউ পড়ুন — পরিষ্কার মনে হলে পুরো বই চালান।'));
      setProgress(100);
    });
  });

  runBtn.addEventListener('click', function () {
    withWakeLock(async function () {
      setBusy(true); setProgress(0);
      setStatus(L('Starting…', 'শুরু হচ্ছে…'));
      clearProgress();
      var pages = await extractPages(0, null);
      setBusy(false);
      if (pages) finishFullRun(pages);
      else refreshResumeBox();
    });
  });

  txtBtn.addEventListener('click', function () {
    if (!state.fullText) return;
    download(new Blob([state.fullText], { type: 'text/plain;charset=utf-8' }),
      safeName((titleEl.value || 'book').trim()) + '.txt');
  });

  /* ---- Skip paths: an existing .txt skips Step 3; a proofread file or a
     formatted .docx skips straight to Step 5. ---- */
  function setTextFromUpload(text, filename, statusEl) {
    state.fullText = (text || '').trim();
    if (!state.fullText) { statusEl.textContent = L('That file looks empty.', 'ফাইলটি খালি মনে হচ্ছে।'); return; }
    if (!titleEl.value) titleEl.value = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    statusEl.textContent = '✓ ' + L('Loaded: ', 'লোড হয়েছে: ') + filename + ' — ' + state.fullText.length.toLocaleString() + L(' characters. Step 4 is now open.', ' অক্ষর। ধাপ ৪ এখন খোলা।');
    unlockStep3();
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (txtFileEl) txtFileEl.addEventListener('change', async function () {
    var f = txtFileEl.files[0];
    if (!f) return;
    setTextFromUpload(await f.text(), f.name, txtFileStatusEl);
  });
  async function parseDocxToMd(file) {
    if (typeof JSZip === 'undefined') throw new Error('The document library did not load — check connection and try again.');
    var zip = await JSZip.loadAsync(await file.arrayBuffer());
    var doc = zip.file('word/document.xml');
    if (!doc) throw new Error('Not a readable .docx file.');
    var xml = await doc.async('string');
    var md = [];
    var paraRe = /<w:p[ >][\s\S]*?<\/w:p>/g, m;
    while ((m = paraRe.exec(xml)) !== null) {
      var p = m[0];
      var style = (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
      var text = p.replace(/<w:tab[^/]*\/>/g, ' ').replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, '$1').trim();
      if (!text) continue;
      if (/^Title/i.test(style)) md.push('# ' + text);
      else if (/^Heading1/i.test(style)) md.push('## ' + text);
      else if (/^Heading2/i.test(style)) md.push('### ' + text);
      else md.push(text);
    }
    return md.join('\n\n');
  }
  if (proofFileEl) proofFileEl.addEventListener('change', async function () {
    var f = proofFileEl.files[0];
    if (!f) return;
    try {
      var isDocx = /\.docx$/i.test(f.name);
      state.proofText = isDocx ? await parseDocxToMd(f) : (await f.text()).trim();
      if (!state.proofText) { proofFileStatusEl.textContent = L('That file looks empty.', 'ফাইলটি খালি মনে হচ্ছে।'); return; }
      if (!titleEl.value) titleEl.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      proofFileStatusEl.textContent = '✓ ' + L('Proofread file loaded: ', 'প্রুফরিড ফাইল লোড হয়েছে: ') + f.name;
      if (isDocx) {
        /* A .docx uploaded here is already a formatted document, so it
           unlocks both Step 5 (hand it back) and Step 6 (make ebooks). */
        state.docBlob = f; state.docIsOriginal = true;
        unlockDoc(L('Formatted document loaded — Step 5 is open, and Step 6 (final ebook) is open too.',
          'ফরম্যাট করা ডকুমেন্ট লোড হয়েছে — ধাপ ৪ খোলা, আর ধাপ ৫ (ফাইনাল ইবুক) ও খোলা।'));
        unlockEbook(L('Formatted document loaded — pick an ebook format below.',
          'ফরম্যাট করা ডকুমেন্ট লোড হয়েছে — নিচে ইবুক ফরম্যাট বাছুন।'));
      } else {
        state.docBlob = null; state.docIsOriginal = false;
        unlockDoc(L('Proofread file loaded — Step 5 (formatted document) is now open.',
          'প্রুফরিড ফাইল লোড হয়েছে — ধাপ ৪ (ফরম্যাট করা ডকুমেন্ট) এখন খোলা।'));
      }
      document.getElementById('docStep').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      proofFileStatusEl.textContent = L('Could not read that file: ', 'ফাইলটি পড়া যায়নি: ') + e.message;
    }
  });
  if (docFileEl) docFileEl.addEventListener('change', async function () {
    var f = docFileEl.files[0];
    if (!f) return;
    try {
      state.proofText = await parseDocxToMd(f);
      state.docBlob = f; state.docIsOriginal = true;
      if (!titleEl.value) titleEl.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      docFileStatusEl.textContent = '✓ ' + L('Formatted document loaded: ', 'ফরম্যাট করা ডকুমেন্ট লোড হয়েছে: ') + f.name + L(' — Steps 1–5 skipped, you are in the final step.', ' — ধাপ ১–৫ বাদ গেল, আপনি এখন ফাইনাল ধাপে।');
      showDocOutputs();
      unlockEbook(L('Formatted document loaded — pick an ebook format below.',
        'ফরম্যাট করা ডকুমেন্ট লোড হয়েছে — নিচে ইবুক ফরম্যাট বাছুন।'));
    } catch (e) {
      docFileStatusEl.textContent = L('Could not read that .docx: ', 'এই .docx পড়া যায়নি: ') + e.message;
    }
  });

  /* ---- Cover: upload first, else online, else text cover ---- */
  function showCover(src, filename, blob) {
    coverImg.src = src;
    coverImg.classList.remove('hidden');
    coverDownloadBtn.href = src;
    coverDownloadBtn.download = filename;
    coverDownloadBtn.classList.remove('hidden');
    /* The uploaded/generated file itself is what the ebook builder embeds. */
    state.coverBlob = blob || null;
    state.coverExt = (blob && blob.type && blob.type.indexOf('jpeg') !== -1) ? 'jpg' : 'png';
  }
  if (coverFileEl) coverFileEl.addEventListener('change', function () {
    var f = coverFileEl.files[0];
    if (!f) return;
    showCover(URL.createObjectURL(f), f.name, f);
    coverStatusEl.textContent = L('Cover uploaded — this is the cover that will go into your final ebook.',
      'কভার আপলোড হয়েছে — এই কভারটাই চূড়ান্ত ইবুকে যাবে।');
  });
  async function searchCover(params) {
    var url = 'https://openlibrary.org/search.json?' + params;
    var res = await fetch(url);
    if (!res.ok) return null;
    var data = await res.json();
    var doc = (data.docs || []).find(function (d) { return d.cover_i; });
    return doc ? 'https://covers.openlibrary.org/b/id/' + doc.cover_i + '-L.jpg' : null;
  }
  coverOnlineBtn.addEventListener('click', async function () {
    var title = (titleEl.value || '').trim();
    var author = (authorEl.value || '').trim();
    if (!title) { coverStatusEl.textContent = L('Enter the book title first.', 'আগে বইয়ের নাম লিখুন।'); return; }
    coverOnlineBtn.disabled = true;
    coverStatusEl.textContent = L('Searching online for a cover…', 'অনলাইনে কভার খোঁজা হচ্ছে…');
    try {
      var src = await searchCover('title=' + encodeURIComponent(title) + (author ? '&author=' + encodeURIComponent(author) : ''));
      if (!src) src = await searchCover('title=' + encodeURIComponent(title));
      if (src) {
        showCover(src, 'cover.jpg', null);
        coverStatusEl.textContent = L('Cover found online. Download it, then upload it above — the uploaded file is what goes into your final ebook.',
          'অনলাইনে কভার পাওয়া গেছে। ডাউনলোড করে উপরে আপলোড করুন — আপলোড করা ফাইলটাই চূড়ান্ত ইবুকে যাবে।');
      } else {
        coverStatusEl.textContent = L('No cover found online — make a text cover instead.',
          'অনলাইনে কভার পাওয়া যায়নি — লেখা-প্রচ্ছদ বানিয়ে নিন।');
      }
    } catch (e) {
      coverStatusEl.textContent = L('Could not reach the cover search — make a text cover instead.',
        'কভার খোঁজা যায়নি — লেখা-প্রচ্ছদ বানিয়ে নিন।');
    }
    coverOnlineBtn.disabled = false;
  });

  /* Text cover styles: unlimited, generated by an algorithm. Each tap
     advances the seed, so the design never repeats in a fixed cycle:
     hue rotates by the golden angle, lightness and layout vary by seed. */
  var coverStyleIdx = 0;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function coverStyleFor(seed) {
    var rnd = mulberry32(seed * 1000 + 7);
    var h1 = Math.floor((seed * 137.508) % 360);
    var h2 = (h1 + 30 + Math.floor(rnd() * 40)) % 360;
    var ha = (h1 + 150 + Math.floor(rnd() * 60)) % 360;
    var layout = seed % 3;
    return {
      bg0: 'hsl(' + h1 + ', ' + (55 + Math.floor(rnd() * 20)) + '%, ' + (24 + Math.floor(rnd() * 10)) + '%)',
      bg1: 'hsl(' + h2 + ', ' + (60 + Math.floor(rnd() * 20)) + '%, ' + (10 + Math.floor(rnd() * 8)) + '%)',
      accent: 'hsl(' + ha + ', 85%, ' + (60 + Math.floor(rnd() * 10)) + '%)',
      author: 'hsl(' + h1 + ', 70%, 85%)',
      layout: layout
    };
  }
  function drawTextCover() {
    var title = (titleEl.value || 'Untitled').trim();
    var author = (authorEl.value || '').trim();
    var st = coverStyleFor(coverStyleIdx);
    var cv = document.createElement('canvas');
    cv.width = 600; cv.height = 900;
    var ctx = cv.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, 0, 900);
    grad.addColorStop(0, st.bg0); grad.addColorStop(1, st.bg1);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 600, 900);
    ctx.fillStyle = st.accent;
    if (st.layout === 0) { ctx.fillRect(240, 120, 120, 6); }
    else if (st.layout === 1) { ctx.fillRect(200, 840, 200, 6); }
    else { ctx.fillRect(240, 100, 120, 6); ctx.fillRect(240, 840, 120, 6); }
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    var size = 54;
    var lines = [];
    function wrap() {
      lines = [];
      ctx.font = '700 ' + size + 'px "Hind Siliguri", "Noto Serif Bengali", sans-serif';
      var words = title.split(/\s+/), line = '';
      words.forEach(function (w) {
        var test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > 480 && line) { lines.push(line); line = w; }
        else line = test;
      });
      if (line) lines.push(line);
    }
    wrap();
    while (lines.length > 7 && size > 30) { size -= 4; wrap(); }
    var baseY = st.layout === 1 ? 380 : (st.layout === 2 ? 450 : 420);
    var y = baseY - (lines.length - 1) * 34;
    lines.forEach(function (ln) { ctx.fillText(ln, 300, y); y += 68; });
    if (author) {
      ctx.font = '500 30px "Hind Siliguri", sans-serif';
      ctx.fillStyle = st.author;
      ctx.fillText(author, 300, 780);
    }
    cv.toBlob(function (blob) {
      showCover(URL.createObjectURL(blob), 'cover.png', blob);
      coverStatusEl.textContent = L('Text cover ready (design #' + (coverStyleIdx + 1) + ', unlimited styles) — download it, then upload it above so it goes into your final ebook. Tap "Generate another style" for a brand-new design.',
        'লেখা-প্রচ্ছদ তৈরি (ডিজাইন #' + (coverStyleIdx + 1) + ', স্টাইলের শেষ নেই) — ডাউনলোড করে উপরে আপলোড করুন, তাহলে চূড়ান্ত ইবুকে যাবে। নতুন ডিজাইনের জন্য "আরেকটি স্টাইল বানান" চাপুন।');
    }, 'image/png');
  }
  if (coverTextBtn) coverTextBtn.addEventListener('click', function () { drawTextCover(); });
  if (coverAnotherBtn) coverAnotherBtn.addEventListener('click', function () {
    coverStyleIdx += 1;
    drawTextCover();
  });

  /* ---- Automatic proofreading (visitor's own Gemini or OpenRouter key) ---- */
  function proofProvider() { return (proofProviderEl && proofProviderEl.value) || 'gemini'; }
  function keyStoreKey(p) { return p === 'gemini' ? 'oem-gemini-key' : 'oem-proof-key'; }
  function currentModel() {
    if (proofProvider() === 'gemini') return (proofModelSelect && proofModelSelect.value) || 'gemini-2.5-flash';
    return ((proofModelInput && proofModelInput.value) || '').trim() || 'google/gemini-2.5-flash';
  }
  function setKeyStats(msg) { if (proofKeyStatsEl) proofKeyStatsEl.textContent = msg; }
  function applyProviderUI() {
    var p = proofProvider();
    var isGemini = p === 'gemini';
    if (proofModelSelect) proofModelSelect.classList.toggle('hidden', !isGemini);
    if (proofModelInput) proofModelInput.classList.toggle('hidden', isGemini);
    if (proofLoadModelsBtn) proofLoadModelsBtn.classList.toggle('hidden', !isGemini);
    if (proofKeyEl) proofKeyEl.placeholder = isGemini ? 'AIza…' : 'sk-or-…';
    try {
      var saved = localStorage.getItem(keyStoreKey(p));
      if (proofKeyEl) proofKeyEl.value = saved || '';
    } catch (e) {}
    if (isGemini && proofKeyEl && proofKeyEl.value) loadGeminiModels(proofKeyEl.value.trim());
    else if (!isGemini) setKeyStats(L('OpenRouter key: cost comes from your OpenRouter credits. The key is saved in this browser only.',
      'OpenRouter key: খরচ আপনার OpenRouter অ্যাকাউন্ট থেকে কাটবে। Key শুধু এই ব্রাউজারে সেভ থাকে।'));
  }
  if (proofProviderEl) proofProviderEl.addEventListener('change', applyProviderUI);
  /* "How do I get a key?" popup — different steps per provider. */
  function openKeyHelp() {
    var p = proofProvider();
    if (keyHelpText) keyHelpText.textContent = p === 'gemini'
      ? L('Getting a FREE Gemini key, step by step (no bank card, no payment, takes about 2 minutes):\n\n1) Tap the "Open the API key page" button below. A Google page will open.\n2) If it asks you to sign in, sign in with your normal Google/Gmail account — the same one you use on your phone.\n3) You will see a page called "API keys". Tap the button that says "Create API key".\n4) If it asks you to choose a project, just leave the suggested one selected and tap "Create" (or "Create API key in new project").\n5) A long secret code will appear. It starts with "AIza". Tap the copy icon next to it — the code is now copied.\n6) Come back to this page (use your phone Back button or switch back to this tab).\n7) Tap inside the "Your API key" box above and paste the code (long-press, then Paste).\n8) Tap "Check key & show free models". If the key is right, you will see the free models list — pick a Flash model and start proofreading.\n\nKeep your key secret: never post a screenshot of it anywhere. It is free — Gemini Flash models have a generous free daily limit, and if it ever runs out, this tool saves your progress so you can continue the next day.',
        'ফ্রি Gemini key নেওয়ার সহজ ধাপ (কার্ড লাগে না, টাকা লাগে না, প্রায় ২ মিনিট):\n\n১) নিচের "API key পেজ খুলুন" বোতাম চাপুন। Google-এর পেজ খুলবে।\n২) সাইন ইন চাইলে আপনার সাধারণ Google/Gmail অ্যাকাউন্ট দিয়ে সাইন ইন করুন — ফোনে যেটা ব্যবহার করেন সেটাই।\n৩) "API keys" নামের পেজ আসবে। "Create API key" বোতাম চাপুন।\n৪) প্রজেক্ট বাছতে বললে যেটা দেখাচ্ছে সেটাই রেখে "Create" চাপুন।\n৫) একটি লম্বা গোপন কোড আসবে, "AIza" দিয়ে শুরু। পাশের কপি চিহ্ন চাপুন — কোড কপি হয়ে গেল।\n৬) এই পেজে ফিরে আসুন (ফোনের Back বোতাম বা এই ট্যাবে ফিরে)।\n৭) উপরের "আপনার API key" বক্সে চেপে ধরে Paste করুন।\n৮) "Key যাচাই করে ফ্রি মডেল দেখান" চাপুন। Key ঠিক থাকলে ফ্রি মডেলের তালিকা আসবে — Flash মডেল বেছে প্রুফরিড শুরু করুন।\n\nKey গোপন রাখুন: এর স্ক্রিনশট কোথাও পোস্ট করবেন না। Key ফ্রি — Gemini Flash মডেলের ফ্রি দৈনিক লিমিট যথেষ্ট উদার, আর লিমিট শেষ হলেও এই টুল অগ্রগতি সেভ রাখে, পরের দিন একই জায়গা থেকে চালাতে পারবেন।')
      : L('Getting an OpenRouter key, step by step:\n\n1) Tap the button below to open openrouter.ai/keys and sign in (Google or GitHub account works).\n2) Tap "Create API Key". Give it any name and tap Create.\n3) Copy the key (it starts with "sk-or-") and paste it into the "Your API key" box above.\n4) Type a model name (for example google/gemini-2.5-flash) and start proofreading.\n\nNote: OpenRouter is NOT free like Gemini — most models cost a little per use, so you need to add credits to your OpenRouter account first. If you want free, use the Gemini option instead.',
        'OpenRouter key নেওয়ার ধাপ:\n\n১) নিচের বোতামে openrouter.ai/keys খুলে সাইন ইন করুন (Google বা GitHub অ্যাকাউন্ট চলে)।\n২) "Create API Key" চাপুন, যেকোনো নাম দিয়ে Create করুন।\n৩) Key কপি করুন ("sk-or-" দিয়ে শুরু) এবং উপরের বক্সে পেস্ট করুন।\n৪) মডেলের নাম লিখুন (যেমন google/gemini-2.5-flash) এবং প্রুফরিড শুরু করুন।\n\nমনে রাখবেন: OpenRouter Gemini-র মতো ফ্রি নয় — বেশিরভাগ মডেলে একটু খরচ হয়, তাই আগে অ্যাকাউন্টে ক্রেডিট যোগ করতে হয়। ফ্রি চাইলে Gemini অপশনটি ব্যবহার করুন।');
    if (keyHelpLink) keyHelpLink.href = p === 'gemini' ? 'https://aistudio.google.com/apikey' : 'https://openrouter.ai/keys';
    if (keyHelpModal) keyHelpModal.classList.remove('hidden');
  }
  if (keyHelpBtn) keyHelpBtn.addEventListener('click', openKeyHelp);
  if (keyHelpClose) keyHelpClose.addEventListener('click', function () { if (keyHelpModal) keyHelpModal.classList.add('hidden'); });
  if (keyHelpModal) keyHelpModal.addEventListener('click', function (ev) {
    if (ev.target === keyHelpModal) keyHelpModal.classList.add('hidden');
  });
  /* Gemini: fetch the real model list for this key and show the free ones. */
  async function loadGeminiModels(key) {
    if (!key || !proofModelSelect) return;
    setKeyStats(L('Checking key…', 'Key যাচাই হচ্ছে…'));
    try {
      var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key) + '&pageSize=100');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      var ids = (data.models || [])
        .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1; })
        .map(function (m) { return String(m.name || '').replace(/^models\//, ''); })
        .filter(function (n) { return n; });
      if (!ids.length) throw new Error('no models');
      ids.sort(function (a, b) {
        var fa = /flash|lite/.test(a) ? 0 : 1, fb = /flash|lite/.test(b) ? 0 : 1;
        return fa - fb || (a < b ? -1 : 1);
      });
      proofModelSelect.innerHTML = '';
      ids.forEach(function (id) {
        var opt = document.createElement('option');
        opt.value = id;
        opt.textContent = id + (/flash|lite/.test(id) ? ' — free tier' : (/pro/.test(id) ? ' — free tier, low daily limit' : ''));
        proofModelSelect.appendChild(opt);
      });
      setKeyStats(L('Key accepted — ' + ids.length + ' models available. Flash models are the free-tier workhorses; limits change over time, so Google AI Studio shows your current quota.',
        'Key ঠিক আছে — ' + ids.length + 'টি মডেল পাওয়া গেছে। Flash মডেলগুলোই ফ্রি ব্যবহারের মূল ভরসা; লিমিট সময়ের সাথে বদলায়, বর্তমান কোটা Google AI Studio-তে দেখা যায়।'));
    } catch (e) {
      setKeyStats(L('Could not load the model list — check the key and connection. The default Flash models below still work.',
        'মডেলের তালিকা আনা যায়নি — key ও সংযোগ ঠিক আছে কি না দেখুন। নিচের ডিফল্ট Flash মডেলগুলো তবু কাজ করবে।'));
    }
  }
  if (proofLoadModelsBtn) proofLoadModelsBtn.addEventListener('click', function () {
    var key = (proofKeyEl.value || '').trim();
    if (!key) { alert(L('Paste your Gemini API key first.', 'আগে আপনার Gemini API key দিন।')); return; }
    try { localStorage.setItem(keyStoreKey('gemini'), key); } catch (e) {}
    loadGeminiModels(key);
  });
  applyProviderUI();

  function chunkText(text, maxLen) {
    var paras = text.split(/\n\s*\n/);
    var chunks = [], cur = '';
    paras.forEach(function (p) {
      if (cur && (cur.length + p.length + 2) > maxLen) { chunks.push(cur); cur = p; }
      else cur = cur ? cur + '\n\n' + p : p;
    });
    if (cur) chunks.push(cur);
    return chunks;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function proofFp(text) {
    var h = 5381, i;
    for (i = 0; i < text.length; i += 7) { h = ((h * 33) ^ text.charCodeAt(i)) >>> 0; }
    return ((titleEl.value || 'book').trim()) + '|' + text.length + '|' + h;
  }
  function saveProofProgress(fp, done) {
    try { localStorage.setItem('oem-proof-v1', JSON.stringify({ fp: fp, done: done })); } catch (e) {}
  }
  function loadProofProgress() {
    try { var v = JSON.parse(localStorage.getItem('oem-proof-v1') || 'null'); return v && v.fp && v.done ? v : null; } catch (e) { return null; }
  }
  function clearProofProgress() { try { localStorage.removeItem('oem-proof-v1'); } catch (e) {} }
  async function callWithRetry(fn, onWait) {
    var waits = [20000, 40000, 60000];
    for (var a = 0; a <= waits.length; a++) {
      try { return await fn(); } catch (e) {
        var isLimit = /429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(e.message || '');
        if (isLimit && a < waits.length) {
          if (onWait) onWait(L('Daily/minute limit reached — waiting ' + (waits[a] / 1000) + 's and retrying…',
            'দৈনিক/মিনিট লিমিট শেষ — ' + (waits[a] / 1000) + ' সেকেন্ড অপেক্ষা করে আবার চেষ্টা করা হচ্ছে…'));
          await sleep(waits[a]);
        } else throw e;
      }
    }
    throw new Error('retry failed');
  }
  async function callGemini(key, model, chunk) {
    var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: PROOF_PROMPT }] },
        contents: [{ parts: [{ text: chunk }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 16384 }
      })
    });
    if (!res.ok) {
      var errText = '';
      try { errText = await res.text(); } catch (e) {}
      throw new Error('HTTP ' + res.status + (errText ? ' — ' + errText.slice(0, 160) : ''));
    }
    var data = await res.json();
    var cand = data && data.candidates && data.candidates[0];
    if (!cand) {
      var reason = data && data.promptFeedback ? (data.promptFeedback.blockReason || '') : '';
      throw new Error('No response from the model' + (reason ? ' (blocked: ' + reason + ')' : ''));
    }
    if (cand.finishReason === 'MAX_TOKENS') throw new Error('Output was cut off (chunk too large)');
    var parts = (cand.content && cand.content.parts) || [];
    return parts.map(function (p) { return p.text || ''; }).join('');
  }
  async function callOpenRouter(key, model, chunk) {
    var res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'X-Title': 'Our Ebook Maker' },
      body: JSON.stringify({ model: model, messages: [{ role: 'system', content: PROOF_PROMPT }, { role: 'user', content: chunk }] })
    });
    if (!res.ok) {
      var errText = '';
      try { errText = await res.text(); } catch (e) {}
      throw new Error('HTTP ' + res.status + (errText ? ' — ' + errText.slice(0, 120) : ''));
    }
    var data = await res.json();
    return data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
  }
  function showDocOutputs() {
    if (proofDownloadBtn) proofDownloadBtn.classList.remove('hidden');
    if (proofDocxBtn) proofDocxBtn.classList.remove('hidden');
  }
  function hideDocOutputs() {
    if (proofDownloadBtn) proofDownloadBtn.classList.add('hidden');
    if (proofDocxBtn) proofDocxBtn.classList.add('hidden');
  }
  function showEbookOutputs() {
    if (proofEpubBtn) proofEpubBtn.classList.remove('hidden');
    if (proofPdfBtn) proofPdfBtn.classList.remove('hidden');
    if (proofCalibreBtn) proofCalibreBtn.classList.remove('hidden');
  }
  function hideEbookOutputs() {
    if (proofEpubBtn) proofEpubBtn.classList.add('hidden');
    if (proofPdfBtn) proofPdfBtn.classList.add('hidden');
    if (proofCalibreBtn) proofCalibreBtn.classList.add('hidden');
    if (calibreNote) calibreNote.classList.add('hidden');
  }
  if (proofCalibreBtn) proofCalibreBtn.addEventListener('click', function () {
    if (calibreNote) calibreNote.classList.toggle('hidden');
  });
  if (proofCancelBtn) proofCancelBtn.addEventListener('click', function () {
    state.proofCancelled = true;
    proofStatusEl.textContent = L('Stopping after this chunk… progress stays saved, run again to continue.',
      'এই অংশের পর থামছে… অগ্রগতি সেভ থাকবে, আবার চালালে একই জায়গা থেকে চলবে।');
  });
  if (autoProofBtn) autoProofBtn.addEventListener('click', async function () {
    var provider = proofProvider();
    var key = (proofKeyEl.value || '').trim();
    var model = currentModel();
    if (!key) { alert(L('Paste your API key first.', 'আগে আপনার API key দিন।')); return; }
    if (!state.fullText) { alert(L('Run the full book OCR first.', 'আগে পুরো বইয়ের OCR চালান।')); return; }
    try { localStorage.setItem(keyStoreKey(provider), key); } catch (e) {}
    state.proofCancelled = false;
    state.proofStartedAt = Date.now();
    autoProofBtn.disabled = true;
    proofCancelBtn.disabled = false;
    hideDocOutputs(); hideEbookOutputs();
    var chunks = chunkText(state.fullText, provider === 'gemini' ? 8000 : 6000);
    var fp = proofFp(state.fullText);
    var out = [];
    var saved = loadProofProgress();
    if (saved && saved.fp === fp && saved.done.length > 0 && saved.done.length < chunks.length) {
      out = saved.done.slice();
      proofStatusEl.textContent = L('Resuming proofreading from chunk ' + (out.length + 1) + ' of ' + chunks.length + ' (saved progress).',
        'সেভ করা অগ্রগতি থেকে প্রুফরিড চালু হচ্ছে: অংশ ' + (out.length + 1) + ' / ' + chunks.length + '।');
    } else if (saved && saved.fp === fp && saved.done.length >= chunks.length) {
      state.proofText = saved.done.join('\n\n');
      proofBar.style.width = '100%';
      proofStatusEl.textContent = L('Proofreading already complete — your document is ready in Step 5 below.',
        'প্রুফরিড আগেই শেষ — আপনার ডকুমেন্ট নিচে ধাপ ৪-এ তৈরি।');
      unlockDoc();
      autoProofBtn.disabled = false;
      proofCancelBtn.disabled = true;
      return;
    }
    try {
      for (var i = out.length; i < chunks.length; i++) {
        if (state.proofCancelled) break;
        if (i > out.length) await sleep(provider === 'gemini' ? 6000 : 1000);
        proofBar.style.width = Math.round((i / chunks.length) * 100) + '%';
        proofStatusEl.textContent = L('Proofreading chunk ' + (i + 1) + ' of ' + chunks.length + '…',
          'প্রুফরিড হচ্ছে: অংশ ' + (i + 1) + ' / ' + chunks.length + '…');
        var waitMsg = function (m) { proofStatusEl.textContent = m + ' ' + L('(chunk ' + (i + 1) + ' of ' + chunks.length + ')', '(অংশ ' + (i + 1) + ' / ' + chunks.length + ')'); };
        var call = provider === 'gemini'
          ? function () { return callGemini(key, model, chunks[i]); }
          : function () { return callOpenRouter(key, model, chunks[i]); };
        var content = await callWithRetry(call, waitMsg);
        out.push(content || '');
        saveProofProgress(fp, out);
      }
      if (state.proofCancelled) {
        proofStatusEl.textContent = L('Proofreading stopped. Progress is saved — run again to continue from chunk ' + (out.length + 1) + '.',
          'প্রুফরিড থেমে গেছে। অগ্রগতি সেভ আছে — আবার চালালে অংশ ' + (out.length + 1) + ' থেকে চলবে।');
      } else {
        state.proofText = out.join('\n\n');
        clearProofProgress();
        proofBar.style.width = '100%';
        var words = state.fullText.split(/\s+/).filter(Boolean).length;
        var mins = Math.max(0.1, (Date.now() - state.proofStartedAt) / 60000).toFixed(1);
        proofStatusEl.textContent = L('Proofreading done: ' + chunks.length + ' chunks. Your formatted document is ready in Step 5 below — .md or .docx.',
          'প্রুফরিড শেষ: ' + chunks.length + 'টি অংশ। আপনার ফরম্যাট করা ডকুমেন্ট নিচে ধাপ ৪-এ তৈরি — .md বা .docx।');
        if (proofStatsEl) proofStatsEl.textContent = L('Stats: ' + chunks.length + ' chunks • about ' + words.toLocaleString('en-US') + ' words • ' + mins + ' min',
          'পরিসংখ্যান: ' + chunks.length + 'টি অংশ • প্রায় ' + words.toLocaleString('en-US') + ' শব্দ • ' + mins + ' মিনিট');
        unlockDoc();
      }
    } catch (e) {
      proofStatusEl.textContent = L('Proofreading failed: ' + e.message + ' Progress up to chunk ' + out.length + ' is saved — check your key/model and run again to continue.',
        'প্রুফরিড ব্যর্থ: ' + e.message + ' ' + out.length + 'টি অংশ পর্যন্ত অগ্রগতি সেভ আছে — key/মডেল ঠিক করে আবার চালালে একই জায়গা থেকে চলবে।');
    }
    autoProofBtn.disabled = false;
    proofCancelBtn.disabled = true;
  });
  if (proofDownloadBtn) proofDownloadBtn.addEventListener('click', function () {
    if (!state.proofText) return;
    download(new Blob([state.proofText], { type: 'text/markdown;charset=utf-8' }),
      safeName((titleEl.value || 'book').trim()) + '-proofread.md');
  });

  /* ---- From proofread Markdown to .docx and EPUB ---- */
  function escapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeHtml(s) {
    return escapeXml(s).replace(/'/g, '&#39;');
  }
  function mdInline(s) {
    return escapeHtml(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
  function mdPlain(s) {
    return String(s).replace(/\*([^*]+)\*/g, '$1').trim();
  }
  function mdToBlocks(md) {
    var blocks = [], para = [], ul = [];
    function flushPara() { if (para.length) { blocks.push({ t: 'p', text: para.join(' ') }); para = []; } }
    function flushUl() { if (ul.length) { blocks.push({ t: 'ul', items: ul.slice() }); ul = []; } }
    md.split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (!line) { flushPara(); flushUl(); return; }
      if (/^#{1,3}\s+/.test(line)) {
        flushPara(); flushUl();
        var level = line.match(/^#+/)[0].length;
        blocks.push({ t: 'h' + level, text: line.replace(/^#+\s+/, '') });
      } else if (line === '***' || line === '---') {
        flushPara(); flushUl(); blocks.push({ t: 'hr' });
      } else if (line.indexOf('> ') === 0) {
        flushUl(); para.push(line.slice(2));
      } else if (line.indexOf('- ') === 0) {
        flushPara(); ul.push(line.slice(2));
      } else {
        flushUl(); para.push(line);
      }
    });
    flushPara(); flushUl();
    return blocks;
  }
  function detectLang(text) {
    if (/[\u0980-\u09FF]/.test(text)) return 'bn';
    if (/[\u0600-\u06FF]/.test(text)) return 'ar';
    return 'en';
  }
  function creditName() { return (creatorEl && creatorEl.value ? creatorEl.value : '').trim(); }
  function creditLines() {
    var lines = [];
    if (creditName()) lines.push('Ebook creator: ' + creditName());
    lines.push('Made with Our Ebook Maker (https://mdtowfiqul.github.io/our-ebook-maker/)');
    lines.push('Shared on Our Boighar (https://mdtowfiqul.github.io/our-boighar/)');
    return lines;
  }
  function docxPara(text, style, jc, pageBreakBefore) {
    var lines = String(text).split('\n').map(function (ln) {
      return '<w:r><w:t xml:space="preserve">' + escapeXml(ln) + '</w:t></w:r>';
    }).join('<w:r><w:br/></w:r>');
    var pr = '<w:pPr>'
      + (style ? '<w:pStyle w:val="' + style + '"/>' : '')
      + (jc ? '<w:jc w:val="' + jc + '"/>' : '')
      + (pageBreakBefore ? '<w:pageBreakBefore/>' : '')
      + '<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>' + '</w:pPr>';
    return '<w:p>' + pr + lines + '</w:p>';
  }
  function buildDocx(md, title, author) {
    if (typeof JSZip === 'undefined') throw new Error('The document library did not load — check connection and try again.');
    var blocks = mdToBlocks(md);
    /* Real-book layout: centred title page, then every chapter on a new
       page with a centred heading, justified body text. */
    var paras = [];
    paras.push(docxPara(title, 'Title', 'center', false));
    if (author) paras.push(docxPara(author, null, 'center', false));
    blocks.forEach(function (b) {
      if (b.t === 'h1') paras.push(docxPara(mdPlain(b.text), 'Title', 'center', false));
      else if (b.t === 'h2') paras.push(docxPara(mdPlain(b.text), 'Heading1', 'center', true));
      else if (b.t === 'h3') paras.push(docxPara(mdPlain(b.text), 'Heading2', null, false));
      else if (b.t === 'hr') paras.push(docxPara('***', null, 'center', false));
      else if (b.t === 'ul') b.items.forEach(function (it) { paras.push(docxPara('• ' + mdPlain(it), null, null, false)); });
      else paras.push(docxPara(mdPlain(b.text || ''), null, detectLang(b.text || '') === 'ar' ? 'right' : 'both', false));
    });
    paras.push(docxPara('About this ebook', 'Heading2', null, true));
    creditLines().forEach(function (ln) { paras.push(docxPara(ln, null, null, false)); });
    paras = paras.join('');
    var now = new Date().toISOString();
    var zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paras + '</w:body></w:document>');
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Noto Serif Bengali" w:hAnsi="Noto Serif Bengali" w:cs="Noto Serif Bengali"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="56"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>');
    zip.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>' + escapeXml(title) + '</dc:title><dc:creator>' + escapeXml(author) + '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + now + '</dcterms:created></cp:coreProperties>');
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  if (proofDocxBtn) proofDocxBtn.addEventListener('click', async function () {
    if (!state.proofText && !state.docBlob) return;
    proofDocxBtn.disabled = true;
    var docStatusEl = $('docStatus');
    if (docStatusEl) docStatusEl.textContent = L('Getting the document file…', 'ডকুমেন্ট ফাইল নেওয়া হচ্ছে…');
    try {
      if (state.docIsOriginal && state.docBlob) {
        /* A formatted .docx the user uploaded is already the document —
           hand it straight back, untouched, instead of rebuilding it. */
        download(state.docBlob, state.docBlob.name);
      } else {
        var blob = await buildDocx(state.proofText, (titleEl.value || 'book').trim(), (authorEl.value || '').trim());
        download(blob, safeName((titleEl.value || 'book').trim()) + '-proofread.docx');
      }
      /* Making the document is what unlocks Step 6 (final ebook). */
      unlockEbook(L('Document ready — Step 6 (final ebook) is now open below: EPUB, PDF, or online-convert for AZW3/MOBI.',
        'ডকুমেন্ট তৈরি — নিচে ধাপ ৫ (ফাইনাল ইবুক) খুলে গেছে: EPUB, PDF, অথবা AZW3/MOBI-র জন্য online-convert।'));
      if (docStatusEl) docStatusEl.textContent = L('Document downloaded — Step 6 below is now open.',
        'ডকুমেন্ট ডাউনলোড হয়েছে — নিচে ধাপ ৫ এখন খোলা।');
    } catch (e) {
      if (docStatusEl) docStatusEl.textContent = L('Document build failed: ' + e.message, 'ডকুমেন্ট বানানো ব্যর্থ: ' + e.message);
    }
    proofDocxBtn.disabled = false;
  });
  function blockToXhtml(b) {
    if (b.t === 'h1') return '<h1>' + mdInline(b.text) + '</h1>';
    if (b.t === 'h2') return '<h2>' + mdInline(b.text) + '</h2>';
    if (b.t === 'h3') return '<h3>' + mdInline(b.text) + '</h3>';
    if (b.t === 'hr') return '<hr/>';
    if (b.t === 'ul') return '<ul>' + b.items.map(function (it) { return '<li>' + mdInline(it) + '</li>'; }).join('') + '</ul>';
    return '<p>' + mdInline(b.text) + '</p>';
  }
  async function buildEpub(md, title, author) {
    if (typeof JSZip === 'undefined') throw new Error('The EPUB library did not load — check connection and try again.');
    var blocks = mdToBlocks(md);
    var chapters = [{ title: title, blocks: [] }];
    blocks.forEach(function (b) {
      if (b.t === 'h2') chapters.push({ title: b.text, blocks: [], heading: true });
      else if (b.t === 'h1' && chapters.length === 1 && !chapters[0].blocks.length) { /* title goes to the title page */ }
      else chapters[chapters.length - 1].blocks.push(b);
    });
    chapters = chapters.filter(function (c, i) { return i === 0 || c.blocks.length; });
    if (!chapters[0].blocks.length) chapters[0].blocks = [{ t: 'h1', text: title }].concat(author ? [{ t: 'p', text: author }] : []);
    /* Title page first, credit page last — like a real book. */
    var titleHtml = '<div style="text-align:center;margin-top:30%"><h1>' + escapeHtml(title) + '</h1>' + (author ? '<p>' + escapeHtml(author) + '</p>' : '') + '</div>';
    var creditHtml = '<h2>About this ebook</h2>' + creditLines().map(function (ln) { return '<p>' + escapeHtml(ln) + '</p>'; }).join('')
      + '<p>Made with <a href="https://mdtowfiqul.github.io/our-ebook-maker/">Our Ebook Maker</a></p>'
      + '<p>Shared on <a href="https://mdtowfiqul.github.io/our-boighar/">Our Boighar</a></p>';
    chapters.unshift({ title: title, html: titleHtml });
    chapters.push({ title: 'About this ebook', html: creditHtml });
    var lang = detectLang(md);
    var uid = 'urn:uuid:oem-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
    var cover = null;
    if (state.coverBlob && state.coverBlob.size) {
      cover = { blob: state.coverBlob, ext: state.coverExt || 'png', type: state.coverBlob.type || 'image/png' };
    } else {
      try {
        if (coverImg && !coverImg.classList.contains('hidden') && coverImg.src) {
          var cres = await fetch(coverImg.src);
          if (cres.ok && typeof cres.blob === 'function') {
            var cblob = await cres.blob();
            if (cblob && cblob.size) cover = { blob: cblob, ext: (cblob.type || '').indexOf('jpeg') !== -1 ? 'jpg' : 'png', type: (cblob.type || 'image/png') };
          }
        }
      } catch (e) { cover = null; }
    }
    var zip = new JSZip();
    zip.file('mimetype', 'application/epub', { compression: 'STORE' });
    zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    var manifest = '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>';
    var spine = '';
    chapters.forEach(function (ch, i) {
      var file = 'chap' + (i + 1) + '.xhtml';
      manifest += '<item id="chap' + (i + 1) + '" href="' + file + '" media-type="application/xhtml+xml"/>';
      spine += '<itemref idref="chap' + (i + 1) + '"/>';
      var body = ch.html ? ch.html : (ch.heading ? '<h2>' + escapeHtml(ch.title) + '</h2>\n' : '') + ch.blocks.map(blockToXhtml).join('\n');
      zip.file('OEBPS/' + file, '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>' + escapeHtml(ch.title) + '</title><style>body{font-family:serif;line-height:1.7}h1,h2,h3{text-align:center}p{text-align:justify;margin:0 0 1em 0}</style></head><body>' + body + '</body></html>');
    });
    if (cover) {
      manifest += '<item id="cover" href="cover.' + cover.ext + '" media-type="' + cover.type + '"/>';
      zip.file('OEBPS/cover.' + cover.ext, cover.blob);
    }
    zip.file('OEBPS/content.opf', '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><dc:title>' + escapeXml(title) + '</dc:title><dc:creator>' + escapeXml(author) + '</dc:creator><dc:language>' + lang + '</dc:language><dc:identifier id="bookid">' + uid + '</dc:identifier>' + (cover ? '<meta name="cover" content="cover"/>' : '') + '</metadata><manifest>' + manifest + '</manifest><spine toc="ncx">' + spine + '</spine></package>');
    var nav = chapters.map(function (ch, i) {
      return '<navPoint id="nav' + (i + 1) + '" playOrder="' + (i + 1) + '"><navLabel><text>' + escapeXml(ch.title) + '</text></navLabel><content src="chap' + (i + 1) + '.xhtml"/></navPoint>';
    }).join('');
    zip.file('OEBPS/toc.ncx', '<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="' + uid + '"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head><docTitle><text>' + escapeXml(title) + '</text></docTitle><navMap>' + nav + '</navMap></ncx>');
    return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  }
  if (proofEpubBtn) proofEpubBtn.addEventListener('click', async function () {
    if (!state.proofText) return;
    proofEpubBtn.disabled = true;
    finalStatusEl.textContent = L('Building your EPUB…', 'EPUB বানানো হচ্ছে…');
    try {
      var blob = await buildEpub(state.proofText, (titleEl.value || 'book').trim(), (authorEl.value || '').trim());
      download(blob, safeName((titleEl.value || 'book').trim()) + '.epub');
      finalStatusEl.textContent = L('EPUB downloaded — finished, with your cover if you made one. No manual steps left.',
        'EPUB ডাউনলোড হয়েছে — প্রচ্ছদসহ তৈরি। আর হাতে কিছু করতে হবে না।');
    } catch (e) {
      finalStatusEl.textContent = L('EPUB build failed: ' + e.message, 'EPUB বানানো ব্যর্থ: ' + e.message);
    }
    proofEpubBtn.disabled = false;
  });
  /* Proper PDF: a print-ready book page rendered by the browser itself,
     so Bengali/Arabic shaping stays correct. The user saves it as PDF
     from the browser's print dialog — that is what makes it a real PDF
     instead of a broken script rendering. */
  function buildBookHtml(md, title, author) {
    var blocks = mdToBlocks(md);
    var chapters = [{ title: title, blocks: [] }];
    blocks.forEach(function (b) {
      if (b.t === 'h2') chapters.push({ title: b.text, blocks: [], heading: true });
      else if (b.t === 'h1' && chapters.length === 1 && !chapters[0].blocks.length) { /* title goes to the title page */ }
      else chapters[chapters.length - 1].blocks.push(b);
    });
    chapters = chapters.filter(function (c, i) { return i === 0 || c.blocks.length; });
    var sections = ['<section class="titlepage"><h1>' + escapeHtml(title) + '</h1>' + (author ? '<p>' + escapeHtml(author) + '</p>' : '') + '</section>'];
    chapters.forEach(function (ch) {
      sections.push('<section class="chapter">' + (ch.heading ? '<h2>' + escapeHtml(ch.title) + '</h2>' : '') + ch.blocks.map(blockToXhtml).join('\n') + '</section>');
    });
    sections.push('<section class="chapter"><h2>About this ebook</h2>' + creditLines().map(function (ln) { return '<p>' + escapeHtml(ln) + '</p>'; }).join('')
      + '<p>Made with <a href="https://mdtowfiqul.github.io/our-ebook-maker/">Our Ebook Maker</a></p>'
      + '<p>Shared on <a href="https://mdtowfiqul.github.io/our-boighar/">Our Boighar</a></p></section>');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title><style>'
      + 'body{font-family:"Noto Serif Bengali",serif;line-height:1.7;max-width:700px;margin:0 auto;padding:24px}'
      + 'h1,h2,h3{text-align:center}p{text-align:justify;margin:0 0 1em 0}'
      + '.titlepage{text-align:center;margin-top:30%}.chapter{page-break-before:always}.titlepage{page-break-before:auto}'
      + '@media print{.noprint{display:none}}'
      + '</style></head><body>'
      + '<div class="noprint" style="font-family:sans-serif;border:1px solid #ccc;padding:12px;margin-bottom:24px">'
      + '<b>Save this book as PDF:</b> press the Print button below, then in the print dialog choose <b>Save as PDF</b> as the destination.'
      + ' <button onclick="window.print()" style="padding:8px 16px;font-weight:bold">Print / Save as PDF</button></div>'
      + sections.join('\n') + '</body></html>';
  }
  if (proofPdfBtn) proofPdfBtn.addEventListener('click', function () {
    if (!state.proofText) return;
    var html = buildBookHtml(state.proofText, (titleEl.value || 'book').trim(), (authorEl.value || '').trim());
    var w = window.open('', '_blank');
    if (!w) {
      finalStatusEl.textContent = L('Pop-up was blocked — allow pop-ups for this site and tap the PDF button again.',
        'পপ-আপ ব্লক হয়েছে — এই সাইটের জন্য পপ-আপ অনুমতি দিয়ে আবার PDF বোতাম চাপুন।');
      return;
    }
    w.document.write(html);
    w.document.close();
    finalStatusEl.textContent = L('PDF view opened in a new tab — in the print dialog, choose "Save as PDF".',
      'নতুন ট্যাবে PDF ভিউ খুলেছে — প্রিন্ট ডায়ালগে "Save as PDF" বাছুন।');
  });
})();
