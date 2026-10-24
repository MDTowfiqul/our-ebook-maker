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
  var fileEl = $('file'), titleEl = $('title'), authorEl = $('author'), licenseEl = $('license');
  var testBtn = $('testBtn'), runBtn = $('runBtn'), cancelBtn = $('cancelBtn'), txtBtn = $('txtBtn');
  var bar = $('bar'), statusEl = $('status'), previewEl = $('preview'), fileinfoEl = $('fileinfo');
  var resultsEl = $('results'), summaryEl = $('summary');
  var coverFileEl = $('coverFile'), coverOnlineBtn = $('coverOnlineBtn'), coverTextBtn = $('coverTextBtn');
  var coverAnotherBtn = $('coverAnotherBtn');
  var coverImg = $('coverImg'), coverDownloadBtn = $('coverDownloadBtn'), coverStatusEl = $('coverStatus');
  var langToggle = $('lang-toggle'), langLabel = $('lang-label');
  var resumeBox = $('resumeBox'), resumeInfo = $('resumeInfo'), resumeBtn = $('resumeBtn'), discardBtn = $('discardBtn');
  var autoProofCard = $('autoProofCard'), proofKeyEl = $('proofKey'), proofProviderEl = $('proofProvider');
  var proofModelSelect = $('proofModelSelect'), proofModelInput = $('proofModelInput');
  var proofLoadModelsBtn = $('proofLoadModelsBtn'), proofKeyStatsEl = $('proofKeyStats');
  var keyHelpBtn = $('keyHelpBtn'), keyHelpModal = $('keyHelpModal'), keyHelpText = $('keyHelpText');
  var keyHelpLink = $('keyHelpLink'), keyHelpClose = $('keyHelpClose');
  var autoProofBtn = $('autoProofBtn'), proofCancelBtn = $('proofCancelBtn');
  var proofBar = $('proofBar'), proofStatusEl = $('proofStatus'), proofStatsEl = $('proofStats');
  var proofDownloadBtn = $('proofDownloadBtn'), proofDocxBtn = $('proofDocxBtn'), proofEpubBtn = $('proofEpubBtn');

  var state = { pages: null, fullText: '', proofText: '', cancelled: false, running: false, proofCancelled: false, wakeLock: null, proofStartedAt: 0 };

  var LICENSE_TEXT = '\n\nThis book is licensed under the Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0).\n\nYou are free to:\n- Share - copy and redistribute the material in any medium or format\n- Adapt - remix, transform, and build upon the material for any purpose, even commercially\n\nUnder the following terms:\n- Attribution - You must give appropriate credit, provide a link to the license, and indicate if changes were made.\n- ShareAlike - If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.\n- No additional restrictions - You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits.\n';

  var PROOF_PROMPT = 'Act as an expert Digital Archivist, Master Typographer, and EPUB Formatter. Your task is to digitize raw, unformatted text (often containing OCR errors) from old, copyright-free (public domain) books and convert it into pristine, beautifully structured Markdown optimized for professional EPUB conversion. This message contains ONE chunk of a longer book; process only this chunk, do not invent missing parts. Rules: use # only for the book title if it appears, ## for chapter/major-section titles, ### for sub-sections, *** for scene breaks; remove page numbers, running headers and footers; join fragmented sentences into cohesive paragraphs; correct common OCR errors ("scannos") without altering meaning and without modernizing archaic vocabulary; replace -- with em-dashes and spaced hyphens with en-dashes where appropriate; standardize quotation marks and use *italics* for emphasis, book titles and foreign words; blockquotes with > , poetry with double-space line breaks, footnotes next to their number in superscript within third brackets; for Bangla, correct OCR spelling (য় mistaken as য), centre titles/headings, justify text; for Arabic, correct errors, add harkat, no brackets, right-align, and format Quranic ayahs as in the example: آيه ۝١٩١. Output ONLY the formatted Markdown for this chunk, no conversational filler.';

  /* ---- Language (EN/BN toggle, like Our Boighar) ---- */
  var LANG = localStorage.getItem('oem-lang') || 'en';
  var DYNAMIC_IDS = { status: 1, summary: 1, fileinfo: 1, coverStatus: 1, preview: 1, resumeInfo: 1, proofStatus: 1 };
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
    try { localStorage.setItem('oem-lang', LANG); } catch (e) {}
  }
  if (langToggle) langToggle.addEventListener('click', function () {
    LANG = LANG === 'bn' ? 'en' : 'bn';
    applyLang();
  });
  applyLang();

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
    try {
      for (var n = start; n <= upto; n++) {
        if (state.cancelled) break;
        var text = await ocrPage(pdf, n, worker);
        pages.push({ num: n, text: text });
        if (!limit) {
          saveProgress({ key: progressKeyFor(file), totalPages: total, title: titleEl.value, author: authorEl.value, licence: licenseEl.checked, pages: pages });
        }
        setProgress(Math.round((n / upto) * 100));
        setStatus(L('Page ' + n + ' of ' + upto + (total > upto ? ' (of ' + total + ' total)' : ''),
          'পৃষ্ঠা ' + n + ' / ' + upto + (total > upto ? ' (মোট ' + total + ')' : '')));
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
    if (licenseEl.checked) full += LICENSE_TEXT;
    state.fullText = full;
    clearProgress();
    savedProgress = null;
    if (resumeBox) resumeBox.classList.add('hidden');
    summaryEl.textContent = L(pages.length + ' pages read with OCR, about ' + full.length.toLocaleString() + ' characters.',
      pages.length + ' পৃষ্ঠা OCR করা হয়েছে, প্রায় ' + full.length.toLocaleString() + ' অক্ষর।');
    resultsEl.classList.remove('hidden');
    if (autoProofCard) autoProofCard.classList.remove('hidden');
    setStatus(L('Done. Download the .txt below, proofread it here, or proofread it automatically.',
      'শেষ। নিচে .txt ডাউনলোড করুন, এখানে প্রুফরিড করুন, অথবা স্বয়ংক্রিয়ভাবে প্রুফরিড করুন।'));
    setProgress(100);
  }

  async function refreshResumeBox() {
    if (!resumeBox || !fileEl.files[0]) return;
    var prog = await loadProgress();
    savedProgress = null;
    if (prog && prog.key === progressKeyFor(fileEl.files[0]) && prog.pages && prog.pages.length > 0 && prog.pages.length < prog.totalPages) {
      savedProgress = prog;
      resumeInfo.textContent = L('Saved progress for this file: ' + prog.pages.length + ' of ' + prog.totalPages + ' pages done. Nothing is lost.',
        'এই ফাইলের সেভ করা অগ্রগতি: ' + prog.pages.length + ' / ' + prog.totalPages + ' পৃষ্ঠা শেষ। কিছু হারায়নি।');
      resumeBox.classList.remove('hidden');
    } else {
      resumeBox.classList.add('hidden');
    }
  }

  fileEl.addEventListener('change', function () {
    var f = fileEl.files[0];
    if (!f) return;
    fileinfoEl.textContent = f.name + ' — ' + (f.size / 1048576).toFixed(1) + ' MB';
    if (!titleEl.value) titleEl.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    resultsEl.classList.add('hidden');
    if (autoProofCard) autoProofCard.classList.add('hidden');
    refreshResumeBox();
  });
  cancelBtn.addEventListener('click', function () {
    state.cancelled = true;
    setStatus(L('Stopping after this page — progress stays saved.', 'এই পৃষ্ঠার পর থামছে — অগ্রগতি সেভ থাকবে।'));
  });
  if (discardBtn) discardBtn.addEventListener('click', function () {
    clearProgress();
    savedProgress = null;
    resumeBox.classList.add('hidden');
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

  /* ---- Cover: upload first, else online, else text cover ---- */
  function showCover(src, filename) {
    coverImg.src = src;
    coverImg.classList.remove('hidden');
    coverDownloadBtn.href = src;
    coverDownloadBtn.download = filename;
    coverDownloadBtn.classList.remove('hidden');
  }
  if (coverFileEl) coverFileEl.addEventListener('change', function () {
    var f = coverFileEl.files[0];
    if (!f) return;
    showCover(URL.createObjectURL(f), f.name);
    coverStatusEl.textContent = L('Cover uploaded — download it below for your final EPUB.',
      'কভার আপলোড হয়েছে — চূড়ান্ত ইবুকের জন্য নিচে ডাউনলোড করুন।');
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
        showCover(src, 'cover.jpg');
        coverStatusEl.textContent = L('Cover found online. Tap download to save it for your final EPUB.',
          'অনলাইনে কভার পাওয়া গেছে। চূড়ান্ত ইবুকের জন্য ডাউনলোড করুন।');
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

  /* Text cover styles: "Generate another style" cycles through these. */
  var COVER_STYLES = [
    { bg0: '#33248f', bg1: '#171233', accent: '#ff9e6e', author: '#d9d4ff' },
    { bg0: '#0b6b4f', bg1: '#083b2c', accent: '#f5c86e', author: '#cdeede' },
    { bg0: '#7a1f2b', bg1: '#3d0f16', accent: '#f0d9a0', author: '#f3d9d9' },
    { bg0: '#1e3a5f', bg1: '#0d1b2e', accent: '#7fd1c8', author: '#cfe6f5' },
    { bg0: '#2b2b2b', bg1: '#111111', accent: '#e8b84b', author: '#e8e0cf' }
  ];
  var coverStyleIdx = 0;
  function drawTextCover() {
    var title = (titleEl.value || 'Untitled').trim();
    var author = (authorEl.value || '').trim();
    var st = COVER_STYLES[coverStyleIdx % COVER_STYLES.length];
    var cv = document.createElement('canvas');
    cv.width = 600; cv.height = 900;
    var ctx = cv.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, 0, 900);
    grad.addColorStop(0, st.bg0); grad.addColorStop(1, st.bg1);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 600, 900);
    ctx.fillStyle = st.accent; ctx.fillRect(240, 120, 120, 6);
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
    var y = 420 - (lines.length - 1) * 34;
    lines.forEach(function (ln) { ctx.fillText(ln, 300, y); y += 68; });
    if (author) {
      ctx.font = '500 30px "Hind Siliguri", sans-serif';
      ctx.fillStyle = st.author;
      ctx.fillText(author, 300, 780);
    }
    cv.toBlob(function (blob) {
      showCover(URL.createObjectURL(blob), 'cover.png');
      coverStatusEl.textContent = L('Text cover ready (style ' + (coverStyleIdx + 1) + ' of ' + COVER_STYLES.length + ') — download it for your final EPUB, or tap "Generate another style" for a different look.',
        'লেখা-প্রচ্ছদ তৈরি (স্টাইল ' + (coverStyleIdx + 1) + ' / ' + COVER_STYLES.length + ') — চূড়ান্ত ইবুকের জন্য ডাউনলোড করুন, অথবা অন্য লুকের জন্য "আরেকটি স্টাইল বানান" চাপুন।');
    }, 'image/png');
  }
  if (coverTextBtn) coverTextBtn.addEventListener('click', function () { drawTextCover(); });
  if (coverAnotherBtn) coverAnotherBtn.addEventListener('click', function () {
    coverStyleIdx = (coverStyleIdx + 1) % COVER_STYLES.length;
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
      ? L('Free, no card needed: 1) Open the API key page below and sign in with your Google account. 2) Tap "Create API key". 3) Copy the key and paste it above. The key is free — Gemini Flash models have a generous free daily limit, and if it ever runs out, this tool saves your progress so you can continue the next day.',
        'ফ্রি, কার্ড লাগে না: ১) নিচের API key পেজ খুলে Google অ্যাকাউন্ট দিয়ে সাইন ইন করুন। ২) "Create API key" চাপুন। ৩) Key কপি করে উপরে পেস্ট করুন। Key ফ্রি — Gemini Flash মডেলের ফ্রি দৈনিক লিমিট যথেষ্ট উদার, আর লিমিট শেষ হলেও এই টুল অগ্রগতি সেভ রাখে, পরের দিন একই জায়গা থেকে চালাতে পারবেন।')
      : L('1) Open openrouter.ai/keys and sign in. 2) Create a key and add credits. 3) Copy the key and paste it above. Cost depends on the model you pick.',
        '১) openrouter.ai/keys খুলে সাইন ইন করুন। ২) Key বানিয়ে ক্রেডিট যোগ করুন। ৩) Key কপি করে উপরে পেস্ট করুন। খরচ নির্ভর করে কোন মডেল বাছলেন তার উপর।');
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
  function showProofOutputs() {
    if (proofDownloadBtn) proofDownloadBtn.classList.remove('hidden');
    if (proofDocxBtn) proofDocxBtn.classList.remove('hidden');
    if (proofEpubBtn) proofEpubBtn.classList.remove('hidden');
  }
  function hideProofOutputs() {
    if (proofDownloadBtn) proofDownloadBtn.classList.add('hidden');
    if (proofDocxBtn) proofDocxBtn.classList.add('hidden');
    if (proofEpubBtn) proofEpubBtn.classList.add('hidden');
  }
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
    hideProofOutputs();
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
      proofStatusEl.textContent = L('Proofreading already complete — download below.',
        'প্রুফরিড আগেই শেষ — নিচে ডাউনলোড করুন।');
      showProofOutputs();
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
        proofStatusEl.textContent = L('Proofreading done: ' + chunks.length + ' chunks. Choose a download below — .md, .docx, or a finished EPUB.',
          'প্রুফরিড শেষ: ' + chunks.length + 'টি অংশ। নিচে ডাউনলোড বাছুন — .md, .docx, অথবা তৈরি EPUB।');
        if (proofStatsEl) proofStatsEl.textContent = L('Stats: ' + chunks.length + ' chunks • about ' + words.toLocaleString('en-US') + ' words • ' + mins + ' min',
          'পরিসংখ্যান: ' + chunks.length + 'টি অংশ • প্রায় ' + words.toLocaleString('en-US') + ' শব্দ • ' + mins + ' মিনিট');
        showProofOutputs();
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
  function buildDocx(md, title, author) {
    if (typeof JSZip === 'undefined') throw new Error('The document library did not load — check connection and try again.');
    var blocks = mdToBlocks(md);
    var paras = blocks.map(function (b) {
      var text = b.t === 'ul' ? b.items.map(mdPlain).join('\n') : (b.t === 'hr' ? '***' : mdPlain(b.text || ''));
      var style = b.t === 'h1' ? 'Title' : (b.t === 'h2' ? 'Heading1' : (b.t === 'h3' ? 'Heading2' : null));
      var lines = text.split('\n').map(function (ln) {
        return '<w:r><w:t xml:space="preserve">' + escapeXml(ln) + '</w:t></w:r>';
      }).join('<w:r><w:br/></w:r>');
      return '<w:p>' + (style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : '') + lines + '</w:p>';
    }).join('');
    var now = new Date().toISOString();
    var zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paras + '</w:body></w:document>');
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="56"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>');
    zip.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>' + escapeXml(title) + '</dc:title><dc:creator>' + escapeXml(author) + '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + now + '</dcterms:created></cp:coreProperties>');
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  if (proofDocxBtn) proofDocxBtn.addEventListener('click', async function () {
    if (!state.proofText) return;
    proofDocxBtn.disabled = true;
    proofStatusEl.textContent = L('Building the document file…', 'ডকুমেন্ট ফাইল বানানো হচ্ছে…');
    try {
      var blob = await buildDocx(state.proofText, (titleEl.value || 'book').trim(), (authorEl.value || '').trim());
      download(blob, safeName((titleEl.value || 'book').trim()) + '-proofread.docx');
      proofStatusEl.textContent = L('Document downloaded. Next, as in the guide: convert the .docx to EPUB with an online docx-to-EPUB converter.',
        'ডকুমেন্ট ডাউনলোড হয়েছে। এরপর গাইডের মতো: অনলাইন docx-to-EPUB converter দিয়ে EPUB বানান।');
    } catch (e) {
      proofStatusEl.textContent = L('Document build failed: ' + e.message, 'ডকুমেন্ট বানানো ব্যর্থ: ' + e.message);
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
      if (b.t === 'h2') chapters.push({ title: b.text, blocks: [] });
      else if (b.t === 'h1' && chapters.length === 1 && !chapters[0].blocks.length) { /* title goes to the title page */ }
      else chapters[chapters.length - 1].blocks.push(b);
    });
    chapters = chapters.filter(function (c, i) { return i === 0 || c.blocks.length; });
    if (!chapters[0].blocks.length) chapters[0].blocks = [{ t: 'h1', text: title }].concat(author ? [{ t: 'p', text: author }] : []);
    var lang = detectLang(md);
    var uid = 'urn:uuid:oem-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
    var cover = null;
    try {
      if (coverImg && !coverImg.classList.contains('hidden') && coverImg.src) {
        var cres = await fetch(coverImg.src);
        if (cres.ok && typeof cres.blob === 'function') {
          var cblob = await cres.blob();
          if (cblob && cblob.size) cover = { blob: cblob, ext: (cblob.type || '').indexOf('jpeg') !== -1 ? 'jpg' : 'png', type: (cblob.type || 'image/png') };
        }
      }
    } catch (e) { cover = null; }
    var zip = new JSZip();
    zip.file('mimetype', 'application/epub', { compression: 'STORE' });
    zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    var manifest = '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>';
    var spine = '';
    chapters.forEach(function (ch, i) {
      var file = 'chap' + (i + 1) + '.xhtml';
      manifest += '<item id="chap' + (i + 1) + '" href="' + file + '" media-type="application/xhtml+xml"/>';
      spine += '<itemref idref="chap' + (i + 1) + '"/>';
      var body = ch.blocks.map(blockToXhtml).join('\n');
      zip.file('OEBPS/' + file, '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>' + escapeHtml(ch.title) + '</title><style>body{font-family:serif;line-height:1.6}h1,h2,h3{text-align:center}p{text-align:justify}</style></head><body>' + body + '</body></html>');
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
    proofStatusEl.textContent = L('Building your EPUB…', 'EPUB বানানো হচ্ছে…');
    try {
      var blob = await buildEpub(state.proofText, (titleEl.value || 'book').trim(), (authorEl.value || '').trim());
      download(blob, safeName((titleEl.value || 'book').trim()) + '.epub');
      proofStatusEl.textContent = L('EPUB downloaded — finished, with your cover if you made one. No manual steps left.',
        'EPUB ডাউনলোড হয়েছে — প্রচ্ছদসহ তৈরি। আর হাতে কিছু করতে হবে না।');
    } catch (e) {
      proofStatusEl.textContent = L('EPUB build failed: ' + e.message, 'EPUB বানানো ব্যর্থ: ' + e.message);
    }
    proofEpubBtn.disabled = false;
  });
})();
