/* Our Ebook Maker — scanned PDF to text, fully in the browser.
   Every page is read with OCR (tesseract.js, Bengali + English + Arabic
   together, so no language has to be picked). The result is raw scanned
   text for proofreading — there is deliberately no EPUB download here,
   because a scanned text must be proofread before it becomes an ebook.
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
  var coverOnlineBtn = $('coverOnlineBtn'), coverTextBtn = $('coverTextBtn');
  var coverImg = $('coverImg'), coverDownloadBtn = $('coverDownloadBtn'), coverStatusEl = $('coverStatus');
  var langToggle = $('lang-toggle'), langLabel = $('lang-label');

  var state = { pages: null, fullText: '', cancelled: false, wakeLock: null };

  var LICENSE_TEXT = '\n\nThis book is licensed under the Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0).\n\nYou are free to:\n- Share - copy and redistribute the material in any medium or format\n- Adapt - remix, transform, and build upon the material for any purpose, even commercially\n\nUnder the following terms:\n- Attribution - You must give appropriate credit, provide a link to the license, and indicate if changes were made.\n- ShareAlike - If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.\n- No additional restrictions - You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits.\n';

  /* ---- Language (EN/BN toggle, like Our Boighar) ---- */
  var LANG = localStorage.getItem('oem-lang') || 'en';
  var DYNAMIC_IDS = { status: 1, summary: 1, fileinfo: 1, coverStatus: 1, preview: 1 };
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

  async function extractPages(limit) {
    var file = fileEl.files[0];
    if (!file) { alert(L('Please choose a PDF file first.', 'আগে একটি PDF ফাইল বাছুন।')); return null; }
    if (!/\.pdf$/i.test(file.name)) { alert(L('Please choose a PDF file.', 'একটি PDF ফাইল বাছুন।')); return null; }
    state.cancelled = false;
    var buf = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var total = pdf.numPages;
    var upto = limit ? Math.min(limit, total) : total;
    setStatus(L('Loading OCR (Bengali + English + Arabic)… first time downloads language data, then it is cached.',
      'OCR লোড হচ্ছে (বাংলা + ইংরেজি + আরবি)… প্রথমবার ভাষার ডেটা ডাউনলোড হবে, পরে ক্যাশে থাকবে।'));
    var worker = await Tesseract.createWorker('ben+eng+ara');
    var pages = [];
    try {
      for (var n = 1; n <= upto; n++) {
        if (state.cancelled) break;
        var text = await ocrPage(pdf, n, worker);
        pages.push({ num: n, text: text });
        setProgress(Math.round((n / upto) * 100));
        setStatus(L('Page ' + n + ' of ' + upto + (total > upto ? ' (of ' + total + ' total)' : ''),
          'পৃষ্ঠা ' + n + ' / ' + upto + (total > upto ? ' (মোট ' + total + ')' : '')));
        await new Promise(function (r) { setTimeout(r, 0); });
      }
    } finally {
      try { await worker.terminate(); } catch (e) {}
    }
    if (state.cancelled) { setStatus(L('Cancelled.', 'বাতিল করা হয়েছে।')); return null; }
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
  }

  fileEl.addEventListener('change', function () {
    var f = fileEl.files[0];
    if (!f) return;
    fileinfoEl.textContent = f.name + ' — ' + (f.size / 1048576).toFixed(1) + ' MB';
    if (!titleEl.value) titleEl.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    resultsEl.classList.add('hidden');
  });
  cancelBtn.addEventListener('click', function () {
    state.cancelled = true;
    setStatus(L('Cancelling after this page…', 'এই পৃষ্ঠার পর বাতিল হচ্ছে…'));
  });

  testBtn.addEventListener('click', function () {
    withWakeLock(async function () {
      setBusy(true); setProgress(0);
      var pages = await extractPages(5);
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
      var pages = await extractPages(0);
      if (!pages) { setBusy(false); return; }
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
      summaryEl.textContent = L(pages.length + ' pages read with OCR, about ' + full.length.toLocaleString() + ' characters.',
        pages.length + ' পৃষ্ঠা OCR করা হয়েছে, প্রায় ' + full.length.toLocaleString() + ' অক্ষর।');
      resultsEl.classList.remove('hidden');
      setStatus(L('Done. Download the .txt below, or proofread it here.',
        'শেষ। নিচে .txt ডাউনলোড করুন, অথবা এখানে প্রুফরিড করুন।'));
      setProgress(100); setBusy(false);
    });
  });

  txtBtn.addEventListener('click', function () {
    if (!state.fullText) return;
    download(new Blob([state.fullText], { type: 'text/plain;charset=utf-8' }),
      safeName((titleEl.value || 'book').trim()) + '.txt');
  });

  /* ---- Cover: try online first, else make a simple text cover ---- */
  function showCover(src, filename) {
    coverImg.src = src;
    coverImg.classList.remove('hidden');
    coverDownloadBtn.href = src;
    coverDownloadBtn.download = filename;
    coverDownloadBtn.classList.remove('hidden');
  }
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
})();
