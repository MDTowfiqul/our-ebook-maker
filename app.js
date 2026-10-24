/* Our Ebook Maker — scanned PDF to text, fully in the browser.
   Every page is read with OCR (tesseract.js, Bengali + English + Arabic
   together, so no language has to be picked). The result is raw scanned
   text for proofreading — there is deliberately no EPUB download here,
   because a scanned text must be proofread before it becomes an ebook.
   Progress is saved after every page, so a scan paused by switching apps
   (or by the phone sleeping) can resume exactly where it stopped.
   Optional automatic proofreading uses the visitor's own OpenRouter key:
   the key stays in their browser and is sent only to OpenRouter, never
   to any server of ours (we have none).
   Libraries (CDN): pdf.js for page rendering, tesseract.js for OCR.
   No file is ever uploaded anywhere. */
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
  var coverImg = $('coverImg'), coverDownloadBtn = $('coverDownloadBtn'), coverStatusEl = $('coverStatus');
  var langToggle = $('lang-toggle'), langLabel = $('lang-label');
  var resumeBox = $('resumeBox'), resumeInfo = $('resumeInfo'), resumeBtn = $('resumeBtn'), discardBtn = $('discardBtn');
  var autoProofCard = $('autoProofCard'), proofKeyEl = $('proofKey'), proofModelEl = $('proofModel');
  var autoProofBtn = $('autoProofBtn'), proofCancelBtn = $('proofCancelBtn');
  var proofBar = $('proofBar'), proofStatusEl = $('proofStatus'), proofDownloadBtn = $('proofDownloadBtn');

  var state = { pages: null, fullText: '', proofText: '', cancelled: false, running: false, proofCancelled: false, wakeLock: null };

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

  coverTextBtn.addEventListener('click', function () {
    var title = (titleEl.value || 'Untitled').trim();
    var author = (authorEl.value || '').trim();
    var cv = document.createElement('canvas');
    cv.width = 600; cv.height = 900;
    var ctx = cv.getContext('2d');
    var grad = ctx.createLinearGradient(0, 0, 0, 900);
    grad.addColorStop(0, '#33248f'); grad.addColorStop(1, '#171233');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 600, 900);
    ctx.fillStyle = '#ff9e6e'; ctx.fillRect(240, 120, 120, 6);
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
      ctx.fillStyle = '#d9d4ff';
      ctx.fillText(author, 300, 780);
    }
    cv.toBlob(function (blob) {
      showCover(URL.createObjectURL(blob), 'cover.png');
      coverStatusEl.textContent = L('Text cover ready — download it for your final EPUB.',
        'লেখা-প্রচ্ছদ তৈরি — চূড়ান্ত ইবুকের জন্য ডাউনলোড করুন।');
    }, 'image/png');
  });

  /* ---- Automatic proofreading (visitor's own OpenRouter key) ---- */
  try {
    var savedKey = localStorage.getItem('oem-proof-key');
    if (savedKey && proofKeyEl) proofKeyEl.value = savedKey;
  } catch (e) {}
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
  if (proofCancelBtn) proofCancelBtn.addEventListener('click', function () {
    state.proofCancelled = true;
    proofStatusEl.textContent = L('Stopping after this chunk…', 'এই অংশের পর থামছে…');
  });
  if (autoProofBtn) autoProofBtn.addEventListener('click', async function () {
    var key = (proofKeyEl.value || '').trim();
    var model = (proofModelEl.value || '').trim() || 'google/gemini-2.5-flash';
    if (!key) { alert(L('Paste your OpenRouter API key first.', 'আগে আপনার OpenRouter API key দিন।')); return; }
    if (!state.fullText) { alert(L('Run the full book OCR first.', 'আগে পুরো বইয়ের OCR চালান।')); return; }
    try { localStorage.setItem('oem-proof-key', key); } catch (e) {}
    state.proofCancelled = false;
    autoProofBtn.disabled = true;
    proofCancelBtn.disabled = false;
    proofDownloadBtn.classList.add('hidden');
    var chunks = chunkText(state.fullText, 6000);
    var out = [];
    try {
      for (var i = 0; i < chunks.length; i++) {
        if (state.proofCancelled) break;
        proofBar.style.width = Math.round((i / chunks.length) * 100) + '%';
        proofStatusEl.textContent = L('Proofreading chunk ' + (i + 1) + ' of ' + chunks.length + '…',
          'প্রুফরিড হচ্ছে: অংশ ' + (i + 1) + ' / ' + chunks.length + '…');
        var res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'X-Title': 'Our Ebook Maker' },
          body: JSON.stringify({ model: model, messages: [{ role: 'system', content: PROOF_PROMPT }, { role: 'user', content: chunks[i] }] })
        });
        if (!res.ok) {
          var errText = '';
          try { errText = await res.text(); } catch (e) {}
          throw new Error('HTTP ' + res.status + (errText ? ' — ' + errText.slice(0, 120) : ''));
        }
        var data = await res.json();
        var content = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
        out.push(content || '');
      }
      if (state.proofCancelled) {
        proofStatusEl.textContent = L('Proofreading stopped. The finished chunks are not saved — run again to restart it.',
          'প্রুফরিড থেমে গেছে। শেষ হওয়া অংশগুলো সেভ হয়নি — আবার চালালে নতুন করে শুরু হবে।');
      } else {
        state.proofText = out.join('\n\n');
        proofBar.style.width = '100%';
        proofStatusEl.textContent = L('Proofreading done: ' + chunks.length + ' chunks. Download the proofread file below.',
          'প্রুফরিড শেষ: ' + chunks.length + 'টি অংশ। নিচে প্রুফরিড করা ফাইল ডাউনলোড করুন।');
        proofDownloadBtn.classList.remove('hidden');
      }
    } catch (e) {
      proofStatusEl.textContent = L('Proofreading failed: ' + e.message + ' Check your key and model, then try again.',
        'প্রুফরিড ব্যর্থ: ' + e.message + ' Key ও মডেল ঠিক আছে কি না দেখে আবার চেষ্টা করুন।');
    }
    autoProofBtn.disabled = false;
    proofCancelBtn.disabled = true;
  });
  if (proofDownloadBtn) proofDownloadBtn.addEventListener('click', function () {
    if (!state.proofText) return;
    download(new Blob([state.proofText], { type: 'text/markdown;charset=utf-8' }),
      safeName((titleEl.value || 'book').trim()) + '-proofread.md');
  });
})();
