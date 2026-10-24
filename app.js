/* Our Ebook Maker — PDF/TXT to EPUB, fully in the browser.
   Libraries (CDN): pdf.js for text + page rendering, tesseract.js for OCR,
   JSZip for the EPUB file. No file is ever uploaded anywhere. */
(function () {
  'use strict';
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  var fileEl = document.getElementById('file');
  var titleEl = document.getElementById('title');
  var authorEl = document.getElementById('author');
  var langEl = document.getElementById('lang');
  var modeEl = document.getElementById('mode');
  var coverEl = document.getElementById('cover');
  var licenseEl = document.getElementById('license');
  var testBtn = document.getElementById('testBtn');
  var runBtn = document.getElementById('runBtn');
  var cancelBtn = document.getElementById('cancelBtn');
  var epubBtn = document.getElementById('epubBtn');
  var txtBtn = document.getElementById('txtBtn');
  var bar = document.getElementById('bar');
  var statusEl = document.getElementById('status');
  var previewEl = document.getElementById('preview');
  var fileinfoEl = document.getElementById('fileinfo');
  var resultsEl = document.getElementById('results');
  var summaryEl = document.getElementById('summary');

  var state = { pages: null, title: '', author: '', cover: null, fullText: '', cancelled: false, wakeLock: null };

  var LICENSE_TEXT = '\n\nThis book is licensed under the Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0).\n\nYou are free to:\n- Share - copy and redistribute the material in any medium or format\n- Adapt - remix, transform, and build upon the material for any purpose, even commercially\n\nUnder the following terms:\n- Attribution - You must give appropriate credit, provide a link to the license, and indicate if changes were made.\n- ShareAlike - If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.\n- No additional restrictions - You may not apply legal terms or technological measures that legally restrict others from doing anything the license permits.\n';

  function setStatus(msg) { statusEl.textContent = msg; }
  function setProgress(pct) { bar.style.width = Math.max(0, Math.min(100, pct)) + '%'; }
  function showPreview(text) {
    previewEl.style.display = 'block';
    previewEl.textContent = text;
  }
  function escapeXml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function isArabicLine(line) { return /[\u0600-\u06FF]/.test(line); }

  function cleanPageText(raw) {
    var text = raw.replace(/(\w)-\n(\w)/g, '$1$2'); // dehyphenate
    var lines = text.split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); });
    // Drop isolated page numbers (a line that is only 1-4 digits).
    lines = lines.filter(function (l) { return !/^\d{1,4}$/.test(l); });
    text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  function pageTextFromItems(items) {
    var out = '';
    items.forEach(function (it) {
      out += it.str;
      out += it.hasEOL ? '\n' : ' ';
    });
    return cleanPageText(out);
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

  async function getWorker(lang) {
    // tesseract.js v5: createWorker(language) downloads the trained data once,
    // then it is cached by the browser for the next book.
    var worker = await Tesseract.createWorker(lang);
    return worker;
  }

  async function extractPages(limit, onProgress) {
    var file = fileEl.files[0];
    if (!file) { alert('Please choose a PDF or .txt file first.'); return null; }
    var mode = modeEl.value;
    var lang = langEl.value;
    var pages = [];
    state.cancelled = false;

    if (/\.txt$/i.test(file.name) || file.type === 'text/plain') {
      var txt = await file.text();
      pages.push({ num: 1, text: cleanPageText(txt), scanned: false });
      return pages;
    }
    if (!/\.pdf$/i.test(file.name)) { alert('Please choose a PDF or a .txt file.'); return null; }

    var buf = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var total = pdf.numPages;
    var upto = limit ? Math.min(limit, total) : total;
    var worker = null;
    var needOcr = (mode === 'ocr');
    if (needOcr) {
      setStatus('Loading OCR for ' + lang + ' (first time downloads language data, then it is cached)…');
      worker = await getWorker(lang);
    }
    try {
      for (var n = 1; n <= upto; n++) {
        if (state.cancelled) break;
        var page = await pdf.getPage(n);
        var tc = await page.getTextContent();
        var text = pageTextFromItems(tc.items);
        var scanned = false;
        if (mode === 'ocr' || (mode === 'auto' && text.replace(/\s/g, '').length < 40)) {
          if (!worker) worker = await getWorker(lang);
          var ocrText = await ocrPage(pdf, n, worker);
          if (ocrText.replace(/\s/g, '').length > text.replace(/\s/g, '').length) text = ocrText;
          scanned = true;
        }
        pages.push({ num: n, text: text, scanned: scanned });
        var pct = Math.round((n / upto) * 100);
        setProgress(pct);
        setStatus('Page ' + n + ' of ' + upto + (total > upto ? ' (of ' + total + ' total)' : '') +
          ' — ' + pages.filter(function (p) { return p.scanned; }).length + ' scanned, ' +
          pages.filter(function (p) { return !p.scanned; }).length + ' text');
        if (onProgress) onProgress(n, upto);
        await new Promise(function (r) { setTimeout(r, 0); }); // let the page repaint
      }
    } finally {
      if (worker) { try { await worker.terminate(); } catch (e) {} }
    }
    if (state.cancelled) { setStatus('Cancelled.'); return null; }
    return pages;
  }

  function detectChapters(pages) {
    var full = pages.map(function (p) { return p.text; }).join('\n\n');
    var lines = full.split('\n');
    var chapters = [];
    var current = { title: null, lines: [] };
    var headingRe = /^(chapter|part|section|unit|অধ্যায়|পরিচ্ছেদ|পর্ব|বাব|فصل)\b.{0,100}$/i;
    var headingNumRe = /^(chapter|অধ্যায়|পরিচ্ছেদ)\s+[IVXLCDM0-9]+[.:]?\s*.{0,100}$/i;
    function isHeading(line) {
      if (!line || line.length > 110) return false;
      if (headingRe.test(line) || headingNumRe.test(line)) return true;
      // Short ALL-CAPS English heading, e.g. "THE BEGINNING"
      if (/^[A-Z0-9 ,:'\-&]{4,60}$/.test(line) && /[A-Z]/.test(line) && !/[a-z]/.test(line)) return true;
      return false;
    }
    lines.forEach(function (line) {
      if (isHeading(line)) {
        if (current.lines.join(' ').trim().length > 0) {
          chapters.push(current);
          current = { title: line, lines: [] };
        } else {
          // Heading at the very start: it titles the first chapter, not its body.
          current.title = line;
        }
      } else {
        current.lines.push(line);
      }
    });
    chapters.push(current);
    if (chapters.length && !chapters[0].title) chapters[0].title = 'Beginning';
    return chapters.filter(function (c) { return c.lines.join(' ').trim().length > 0; });
  }

  function chaptersToXhtml(chapters) {
    return chapters.map(function (ch) {
      // PDF/OCR text wraps paragraphs across visual lines: join single line
      // breaks into flowing text, keep blank lines as paragraph breaks.
      var flowed = ch.lines.join('\n')
        .replace(/\n\s*\n/g, '[[OBPARA]]')
        .replace(/\n/g, ' ')
        .replaceAll('[[OBPARA]]', '\n\n');
      var paras = flowed.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
      var body = paras.map(function (p) {
        var dir = isArabicLine(p) ? ' dir="rtl" class="arabic"' : '';
        return '<p' + dir + '>' + escapeXml(p).replace(/\n/g, '<br/>') + '</p>';
      }).join('\n');
      return { title: ch.title, body: body };
    });
  }

  async function readCover() {
    var f = coverEl.files[0];
    if (!f) return null;
    if (/image\/(jpeg|png)/.test(f.type)) {
      return { blob: f, type: f.type, ext: f.type === 'image/png' ? 'png' : 'jpg' };
    }
    // Convert anything else (webp etc.) to JPEG via canvas.
    var url = URL.createObjectURL(f);
    var img = new Image();
    await new Promise(function (res, rej) { img.onload = res; img.onerror = rej; img.src = url; });
    var cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext('2d').drawImage(img, 0, 0);
    var blob = await new Promise(function (res) { cv.toBlob(res, 'image/jpeg', 0.85); });
    URL.revokeObjectURL(url);
    return { blob: blob, type: 'image/jpeg', ext: 'jpg' };
  }

  async function buildEpub() {
    var title = (titleEl.value || '').trim() || (fileEl.files[0] ? fileEl.files[0].name.replace(/\.[^.]+$/, '') : 'Untitled Book');
    var author = (authorEl.value || '').trim();
    var chapters = detectChapters(state.pages);
    if (licenseEl.checked) chapters.push({ title: 'Licence', lines: LICENSE_TEXT.trim().split('\n') });
    var xhtml = chaptersToXhtml(chapters);
    var lang = langEl.value.split('+')[0];
    var langMap = { ben: 'bn', eng: 'en', ara: 'ar' };
    var xmlLang = langMap[lang] || 'en';
    var rtl = (lang === 'ara');
    var cover = await readCover();
    var zip = new JSZip();
    // The mimetype file MUST be first and uncompressed — that is what makes it a valid EPUB.
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file('META-INF/container.xml',
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
      '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    var css = 'body{font-family:"Noto Serif Bengali","Hind Siliguri","Noto Naskh Arabic",serif;line-height:1.7;text-align:justify;margin:5%} ' +
      'h1,h2{text-align:center;line-height:1.3} p{margin:0 0 1em 0} p.arabic{text-align:right;direction:rtl} ' +
      '.cover{margin:0;text-align:center} .cover img{max-width:100%;max-height:100%}';
    zip.file('OEBPS/style.css', css);
    var manifest = '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' +
      '<item id="css" href="style.css" media-type="text/css"/>';
    var spine = '';
    var navPoints = '';
    var files = [];
    files.push({ id: 'title', href: 'title.xhtml', title: 'Title page' });
    xhtml.forEach(function (ch, i) {
      files.push({ id: 'ch' + (i + 1), href: 'chapter' + (i + 1) + '.xhtml', title: ch.title });
    });
    if (cover) files.unshift({ id: 'cover', href: 'cover.' + cover.ext, title: 'Cover', cover: true });
    files.forEach(function (f) {
      if (f.cover) manifest += '<item id="cover" href="cover.' + cover.ext + '" media-type="' + cover.type + '"/>';
      else if (f.id === 'title') manifest += '<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>';
      else manifest += '<item id="' + f.id + '" href="' + f.href + '" media-type="application/xhtml+xml"/>';
    });
    var order = files.filter(function (f) { return !f.cover; });
    order.forEach(function (f) { spine += '<itemref idref="' + f.id + '"/>'; });
    xhtml.forEach(function (ch, i) {
      navPoints += '<navPoint id="np' + (i + 1) + '" playOrder="' + (i + 1) + '"><navLabel><text>' +
        escapeXml(ch.title) + '</text></navLabel><content src="chapter' + (i + 1) + '.xhtml"/></navPoint>';
    });
    var uid = 'urn:uuid:' + (crypto.randomUUID ? crypto.randomUUID() : ('book-' + Date.now()));
    zip.file('OEBPS/content.opf',
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="2.0">' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">' +
      '<dc:title>' + escapeXml(title) + '</dc:title>' +
      '<dc:creator>' + escapeXml(author || 'Unknown') + '</dc:creator>' +
      '<dc:language>' + xmlLang + '</dc:language><dc:identifier id="uid">' + uid + '</dc:identifier>' +
      (cover ? '<meta name="cover" content="cover"/>' : '') +
      '</metadata><manifest>' + manifest + '</manifest><spine toc="ncx">' + spine + '</spine></package>');
    zip.file('OEBPS/toc.ncx',
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head></head>' +
      '<docTitle><text>' + escapeXml(title) + '</text></docTitle><navMap>' + navPoints + '</navMap></ncx>');
    var dirAttr = rtl ? ' dir="rtl"' : '';
    zip.file('OEBPS/title.xhtml',
      '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="' + xmlLang + '" lang="' + xmlLang + '"' + dirAttr + '><head><title>' +
      escapeXml(title) + '</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>' +
      '<h1>' + escapeXml(title) + '</h1>' + (author ? '<h2>' + escapeXml(author) + '</h2>' : '') + '</body></html>');
    xhtml.forEach(function (ch, i) {
      zip.file('OEBPS/chapter' + (i + 1) + '.xhtml',
        '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\n' +
        '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="' + xmlLang + '" lang="' + xmlLang + '"' + dirAttr + '><head><title>' +
        escapeXml(ch.title) + '</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>' +
        '<h2>' + escapeXml(ch.title) + '</h2>\n' + ch.body + '</body></html>');
    });
    if (cover) zip.file('OEBPS/cover.' + cover.ext, cover.blob);
    var blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
    return { blob: blob, title: title, chapters: xhtml.length };
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
    try {
      if (navigator.wakeLock) state.wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {}
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
    resultsEl.style.display = 'none';
  });
  cancelBtn.addEventListener('click', function () { state.cancelled = true; setStatus('Cancelling after this page…'); });

  testBtn.addEventListener('click', function () {
    withWakeLock(async function () {
      setBusy(true); setProgress(0);
      var pages = await extractPages(5);
      setBusy(false);
      if (!pages) return;
      state.pages = pages;
      var scanned = pages.filter(function (p) { return p.scanned; }).length;
      var text = pages.map(function (p) { return '--- Page ' + p.num + (p.scanned ? ' (scanned, OCR)' : ' (text)') + ' ---\n' + p.text; }).join('\n\n');
      showPreview(text.slice(0, 6000) + (text.length > 6000 ? '\n\n…(preview cut at 6,000 characters)' : ''));
      setStatus('Test done: ' + pages.length + ' pages, ' + scanned + ' scanned. Read the preview — if it looks clean, run the full book.');
      setProgress(100);
    });
  });

  runBtn.addEventListener('click', function () {
    withWakeLock(async function () {
      setBusy(true); setProgress(0); setStatus('Starting…');
      var pages = await extractPages(0);
      if (!pages) { setBusy(false); return; }
      state.pages = pages;
      var full = pages.map(function (p) { return p.text; }).join('\n\n');
      if (licenseEl.checked) full += LICENSE_TEXT;
      state.fullText = full;
      var scanned = pages.filter(function (p) { return p.scanned; }).length;
      summaryEl.textContent = pages.length + ' pages converted (' + scanned + ' scanned with OCR, ' +
        (pages.length - scanned) + ' text), about ' + full.length.toLocaleString() + ' characters.';
      resultsEl.style.display = 'block';
      setStatus('Done. Download your EPUB below, or the raw .txt for proofreading.');
      setProgress(100); setBusy(false);
    });
  });

  epubBtn.addEventListener('click', async function () {
    if (!state.pages) return;
    setStatus('Building EPUB…');
    var out = await buildEpub();
    download(out.blob, safeName(out.title) + '.epub');
    setStatus('EPUB downloaded: ' + out.chapters + ' chapters. Open it in Play Books or any EPUB reader to check it.');
  });

  txtBtn.addEventListener('click', function () {
    if (!state.fullText) return;
    var title = (titleEl.value || 'book').trim();
    download(new Blob([state.fullText], { type: 'text/plain;charset=utf-8' }), safeName(title) + '.txt');
  });
})();
