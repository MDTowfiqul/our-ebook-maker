/* Our Ebook Maker v9 — Muse-first.
   The book comes from a Muse chat: the user attaches a scanned PDF
   there, pastes the full prompt from Step 2, answers "continue" after
   each DONE, and gets a formatted Google Doc. They download the .docx
   from that Doc and upload it here in Step 3. This site then builds
   EPUB and PDF in the browser (plus the manual online-convert and
   Calibre paths for Kindle formats), with the cover and credit page
   from Step 1. Nothing is uploaded anywhere by this site: the .docx
   is read locally with JSZip, and the PDF itself only ever goes to
   the user's own Muse chat. Libraries (CDN): JSZip only. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var titleEl = $('title'), authorEl = $('author'), creatorEl = $('creator');
  var coverFileEl = $('coverFile'), coverOnlineBtn = $('coverOnlineBtn'), coverTextBtn = $('coverTextBtn'), coverUseBtn = $('coverUseBtn');
  var coverImg = $('coverImg'), coverStatusEl = $('coverStatus'), coverCarouselWrap = $('coverCarouselWrap'), coverCarousel = $('coverCarousel'), coverPrevBtn = $('coverPrevBtn'), coverNextBtn = $('coverNextBtn');
  var langToggle = $('lang-toggle'), langLabel = $('lang-label');
  var docFileEl = $('docFile'), docFileStatusEl = $('docFileStatus'), finalStatusEl = $('finalStatus');
  var proofEpubBtn = $('proofEpubBtn');
  var proofPdfBtn = $('proofPdfBtn');
  var navHome = $('navHome'), navMuse = $('navMuse'), navEbook = $('navEbook'), navGuide = $('navGuide');
  var state = { proofText: '', coverBlob: null, coverExt: 'png', textCoverBlob: null };

  /* ---- Language (EN/BN toggle, like Our Boighar) ---- */
  var LANG = localStorage.getItem('oem-lang') || 'en';
  var DYNAMIC_IDS = { coverStatus: 1, docFileStatus: 1, finalStatus: 1 };
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
  function setNavActive(btn) {
    document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('accent-soft-bg', 'accent-text'); });
    if (btn) btn.classList.add('accent-soft-bg', 'accent-text');
  }
  if (navHome) navHome.addEventListener('click', function () { setNavActive(navHome); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  if (navMuse) navMuse.addEventListener('click', function () { setNavActive(navMuse); var el = $('museRoute'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  if (navEbook) navEbook.addEventListener('click', function () { setNavActive(navEbook); var el = $('finalFormats'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  /* Guide pop-ups (v7): the maker no longer navigates to guide.html for the
     proofreading links — the necessary information opens here instead. */
  document.querySelectorAll('.guide-open').forEach(function (b) {
    b.addEventListener('click', function () { closeDrawer(); openModal($('guideModal')); });
  });
  document.querySelectorAll('.guide-close').forEach(function (b) {
    b.addEventListener('click', function () { closeModal($('guideModal')); });
  });
  document.querySelectorAll('.privacy-open').forEach(function (b) {
    b.addEventListener('click', function () { closeDrawer(); openModal($('privacyModal')); });
  });
  document.querySelectorAll('.privacy-close').forEach(function (b) {
    b.addEventListener('click', function () { closeModal($('privacyModal')); });
  });
  if (navGuide) navGuide.addEventListener('click', function () { setNavActive(navGuide); openModal($('guideModal')); });
  ['guideModal', 'museDirectModal', 'privacyModal'].forEach(function (id) {
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

  function download(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function safeName(s) { return s.replace(/[^a-zA-Z0-9\u0980-\u09FF\u0600-\u06FF _-]+/g, '').trim().replace(/\s+/g, '-') || 'book'; }

  function openModal(m) { if (m) m.classList.remove('hidden'); }
  function closeModal(m) { if (m) m.classList.add('hidden'); }
  /* v10: a .docx paragraph is XML — its properties (<w:pPr>, <w:rPr>,
     fonts, spacing, justification) are NOT text. The old code only
     unwrapped <w:t> elements and left every other tag in place, so a
     Google Doc .docx came out as raw XML in the EPUB. Now only the
     <w:t> run texts are collected, in order, and joined exactly as
     written (spaces live inside the runs, so no separator is added).
     Tabs and line breaks become spaces; XML entities are decoded. */
  function decodeXmlEntities(t) {
    return String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
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
      var body = p.replace(/<w:tab[^>]*\/>/g, ' ').replace(/<w:br[^>]*\/>/g, ' ');
      var parts = [], tm;
      var tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      while ((tm = tRe.exec(body)) !== null) parts.push(tm[1]);
      var text = decodeXmlEntities(parts.join('')).trim();
      if (!text) continue;
      if (/^Title/i.test(style)) md.push('# ' + text);
      else if (/^Heading\s*1/i.test(style)) md.push('## ' + text);
      else if (/^Heading\s*2/i.test(style)) md.push('### ' + text);
      else md.push(text);
    }
    return md.join('\n\n');
  }
  /* ---- Cover: upload first, else online, else text cover ---- */
  function showCover(src, filename, blob) {
    coverImg.src = src;
    coverImg.classList.remove('hidden');
    if (coverUseBtn) coverUseBtn.classList.add('hidden');
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
  /* v11: the old code showed only ONE online cover as a preview URL and
     never put it in the ebook (coverBlob stayed null) — that is why
     search "did not work". Now every cover with an image is shown in a
     swipeable strip, and "Use as cover" fetches that image and sets it
     as the cover at once — no download-and-upload round trip. */
  async function searchCovers(params) {
    var url = 'https://openlibrary.org/search.json?' + params;
    var res = await fetch(url);
    if (!res.ok) return [];
    var data = await res.json();
    var seen = {}, out = [];
    (data.docs || []).forEach(function (d) {
      if (d.cover_i && !seen[d.cover_i]) {
        seen[d.cover_i] = true;
        out.push({ src: 'https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg',
          title: (d.title || ''), author: ((d.author_name || [])[0] || '') });
      }
    });
    return out.slice(0, 12);
  }
  function renderCoverCarousel(covers) {
    if (!coverCarousel) return;
    coverCarousel.innerHTML = '';
    covers.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'shrink-0 w-32 snap-start';
      var img = document.createElement('img');
      img.src = c.src; img.alt = c.title; img.className = 'w-32 rounded-xl shadow';
      img.addEventListener('click', function () { coverImg.src = c.src; coverImg.classList.remove('hidden'); });
      var btn = document.createElement('button');
      btn.className = 'accent-bg text-white rounded-xl px-3 py-2 font-bold text-[13px] w-full mt-2';
      btn.textContent = 'Use as cover';
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        coverStatusEl.textContent = L('Setting this cover…', 'কভার সেট করা হচ্ছে…');
        try {
          var r = await fetch(c.src);
          if (!r.ok) throw new Error('cover fetch failed');
          var blob = await r.blob();
          showCover(URL.createObjectURL(blob), 'cover.jpg', blob);
          coverStatusEl.textContent = L('Cover set — this is the cover that will go into your final ebook.',
            'কভার সেট হয়েছে — এই কভারটাই চূড়ান্ত ইবুকে যাবে।');
        } catch (e) {
          coverStatusEl.textContent = L('Could not fetch that cover — try another one.',
            'এই কভার আনা যায়নি — আরেকটি চেষ্টা করুন।');
        }
        btn.disabled = false;
      });
      card.appendChild(img); card.appendChild(btn);
      coverCarousel.appendChild(card);
    });
    if (coverCarouselWrap) coverCarouselWrap.classList.remove('hidden');
  }
  /* v12: Open Library has nothing for many Bengali titles (0 results
     for "হিমু"), so Google Books is the second source before giving up. */
  async function searchGoogleBooks(query) {
    var url = 'https://www.googleapis.com/books/v1/volumes?q=' + encodeURIComponent(query) + '&maxResults=10';
    var res = await fetch(url);
    if (!res.ok) return [];
    var data = await res.json();
    var out = [];
    (data.items || []).forEach(function (it) {
      var links = (it.volumeInfo || {}).imageLinks || {};
      var thumb = links.thumbnail || links.smallThumbnail;
      if (thumb) out.push({ src: thumb.replace(/^http:/, 'https:'), title: (it.volumeInfo.title || ''), author: ((it.volumeInfo.authors || [])[0] || '') });
    });
    return out;
  }
  if (coverPrevBtn) coverPrevBtn.addEventListener('click', function () { if (coverCarousel) coverCarousel.scrollBy({ left: -160, behavior: 'smooth' }); });
  if (coverNextBtn) coverNextBtn.addEventListener('click', function () { if (coverCarousel) coverCarousel.scrollBy({ left: 160, behavior: 'smooth' }); });
  coverOnlineBtn.addEventListener('click', async function () {
    var title = (titleEl.value || '').trim();
    var author = (authorEl.value || '').trim();
    if (!title) { coverStatusEl.textContent = L('Enter the book title first.', 'আগে বইয়ের নাম লিখুন।'); return; }
    coverOnlineBtn.disabled = true;
    coverStatusEl.textContent = L('Searching online for a cover…', 'অনলাইনে কভার খোঁজা হচ্ছে…');
    try {
      var covers = await searchCovers('title=' + encodeURIComponent(title) + (author ? '&author=' + encodeURIComponent(author) : ''));
      if (!covers.length) covers = await searchCovers('title=' + encodeURIComponent(title));
      if (!covers.length) covers = await searchCovers('q=' + encodeURIComponent(title));
      if (!covers.length) covers = await searchGoogleBooks('intitle:' + title + (author ? ' inauthor:' + author : ''));
      if (!covers.length) covers = await searchGoogleBooks(title);
      if (covers.length) {
        renderCoverCarousel(covers);
        coverStatusEl.textContent = L(covers.length + ' covers found — swipe left/right and tap "Use as cover" on the one you like.',
          covers.length + 'টি কভার পাওয়া গেছে — ডানে/বামে সোয়াইপ করে পছন্দেরটিতে "Use as cover" চাপুন।');
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
      /* v12: preview only — the cover is set when "Use as cover" is
         tapped, so the button the user asked for always exists. */
      state.textCoverBlob = blob;
      coverImg.src = URL.createObjectURL(blob);
      coverImg.classList.remove('hidden');
      if (coverUseBtn) coverUseBtn.classList.remove('hidden');
      coverStatusEl.textContent = L('Text cover ready (design #' + (coverStyleIdx + 1) + ', unlimited styles) — tap "Use as cover" below it to set it for your final ebook. Tap "Make a text cover" again for a brand-new design.',
        'লেখা-প্রচ্ছদ তৈরি (ডিজাইন #' + (coverStyleIdx + 1) + ', স্টাইলের শেষ নেই) — চূড়ান্ত ইবুকের জন্য সেট করতে নিচের "Use as cover" চাপুন। নতুন ডিজাইনের জন্য "Make a text cover" আবার চাপুন।');
    }, 'image/png');
  }
  /* v12: one button — first tap makes the cover, every later tap
     advances the style, so there is no second button to maintain. */
  var textCoverMade = false;
  if (coverTextBtn) coverTextBtn.addEventListener('click', function () {
    if (textCoverMade) coverStyleIdx += 1;
    textCoverMade = true;
    drawTextCover();
  });
  if (coverUseBtn) coverUseBtn.addEventListener('click', function () {
    if (!state.textCoverBlob) return;
    showCover(URL.createObjectURL(state.textCoverBlob), 'cover.png', state.textCoverBlob);
    coverStatusEl.textContent = L('Cover set — this is the cover that will go into your final ebook.',
      'কভার সেট হয়েছে — এই কভারটাই চূড়ান্ত ইবুকে যাবে।');
  });

  /* ---- Automatic proofreading (visitor's own Gemini or OpenRouter key) ---- */
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
  /* v11: credit page like his own books — "ইবুক নির্মাতা: <name>" then
     "সৌজন্যে: Our Ebook Maker ও Our Boighar" (labels follow the book's
     language: Bengali for Bengali books, English otherwise). */
  function creditBlockHtml(title) {
    var bn = detectLang(title || '') === 'bn';
    var html = '<h2>' + (bn ? 'এই ইবুক সম্পর্কে' : 'About this ebook') + '</h2>';
    if (creditName()) html += '<p>' + (bn ? 'ইবুক নির্মাতা: ' : 'Ebook creator: ') + escapeHtml(creditName()) + '</p>';
    html += '<p>' + (bn ? 'সৌজন্যে: ' : 'Courtesy: ')
      + '<a href="https://mdtowfiqul.github.io/our-ebook-maker/">Our Ebook Maker</a>'
      + (bn ? ' ও ' : ' and ')
      + '<a href="https://mdtowfiqul.github.io/our-boighar/">Our Boighar</a></p>';
    return html;
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
  function blockToXhtml(b) {
    if (b.t === 'h1') return '<h1>' + mdInline(b.text) + '</h1>';
    if (b.t === 'h2') return '<h2>' + mdInline(b.text) + '</h2>';
    if (b.t === 'h3') return '<h3>' + mdInline(b.text) + '</h3>';
    if (b.t === 'hr') return '<hr/>';
    if (b.t === 'ul') return '<ul>' + b.items.map(function (it) { return '<li>' + mdInline(it) + '</li>'; }).join('') + '</ul>';
    return '<p>' + mdInline(b.text) + '</p>';
  }
  /* v15: shared chapter split. A Google Doc often styles the book
     title itself as Heading 1, which mdToBlocks turns into a chapter
     — and the builders add their own title page on top, so the title
     appeared twice. If the first headed chapter IS the book title,
     it is not a chapter: its blocks merge into the front matter. */
  function splitChapters(blocks, title) {
    var chapters = [{ title: title, blocks: [] }];
    blocks.forEach(function (b) {
      if (b.t === 'h2') chapters.push({ title: b.text, blocks: [], heading: true });
      else if (b.t === 'h1' && chapters.length === 1 && !chapters[0].blocks.length) { /* title goes to the title page */ }
      else chapters[chapters.length - 1].blocks.push(b);
    });
    chapters = chapters.filter(function (c, i) { return i === 0 || c.blocks.length; });
    var norm = function (t) { return (t || '').replace(/\s+/g, ' ').trim().toLowerCase(); };
    for (var i = 1; i < chapters.length; i++) {
      if (chapters[i].heading && norm(chapters[i].title) === norm(title)) {
        chapters[0].blocks = chapters[0].blocks.concat(chapters[i].blocks);
        chapters.splice(i, 1);
        break;
      }
    }
    return chapters;
  }
  async function buildEpub(md, title, author) {
    if (typeof JSZip === 'undefined') throw new Error('The EPUB library did not load — check connection and try again.');
    var blocks = mdToBlocks(md);
    var chapters = splitChapters(blocks, title);
    if (!chapters[0].blocks.length) chapters[0].blocks = [{ t: 'h1', text: title }].concat(author ? [{ t: 'p', text: author }] : []);
    /* Title page first, credit page last — like a real book. */
    var titleHtml = '<div style="text-align:center;margin-top:30%"><h1>' + escapeHtml(title) + '</h1>' + (author ? '<p>' + escapeHtml(author) + '</p>' : '') + '</div>';
    var creditHtml = creditBlockHtml(title);
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
    /* v10: embed Hind Siliguri (open-licensed, shipped in this repo)
       so Bengali shapes correctly in readers whose default font cannot
       shape it (Google Play Books' default font is the reported case).
       Same-origin first, CDN fallback; without it the EPUB still builds
       and falls back to the reader's font. */
    var fontBuf = null;
    var fontUrls = ['HindSiliguri-Regular.ttf', 'fonts/HindSiliguri-Regular.ttf',
      'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/hindsiliguri/HindSiliguri-Regular.ttf'];
    for (var fi = 0; fi < fontUrls.length && !fontBuf; fi++) {
      try {
        var fres = await fetch(fontUrls[fi]);
        if (fres && fres.ok) fontBuf = await fres.arrayBuffer();
      } catch (e) { fontBuf = null; }
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
      var epubCss = (fontBuf ? "@font-face{font-family:'Hind Siliguri';src:url('fonts/HindSiliguri-Regular.ttf');}" : '')
        + "body{font-family:'Hind Siliguri',serif;line-height:1.7}h1,h2,h3{text-align:center}p{text-align:justify;margin:0 0 1em 0}";
      zip.file('OEBPS/' + file, '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>' + escapeHtml(ch.title) + '</title><style>' + epubCss + '</style></head><body>' + body + '</body></html>');
    });
    if (cover) {
      manifest += '<item id="cover" href="cover.' + cover.ext + '" media-type="' + cover.type + '"/>';
      zip.file('OEBPS/cover.' + cover.ext, cover.blob);
    }
    if (fontBuf) {
      manifest += '<item id="font-bn" href="fonts/HindSiliguri-Regular.ttf" media-type="application/x-font-ttf"/>';
      zip.file('OEBPS/fonts/HindSiliguri-Regular.ttf', fontBuf);
    }
    zip.file('OEBPS/content.opf', '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><dc:title>' + escapeXml(title) + '</dc:title><dc:creator>' + escapeXml(author || creditName()) + '</dc:creator><dc:language>' + lang + '</dc:language><dc:identifier id="bookid">' + uid + '</dc:identifier>' + (cover ? '<meta name="cover" content="cover"/>' : '') + '</metadata><manifest>' + manifest + '</manifest><spine toc="ncx">' + spine + '</spine></package>');
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
  /* v13 one-click PDF: the book page is rendered in a hidden iframe
     and rasterised to a real PDF with html2canvas + jsPDF — one tap,
     no print dialog. Honest trade-off, stated in the guide: the PDF
     pages are images, so the text is not selectable. Rasterising
     (not a script text layout) is what keeps Bengali/Arabic shaping
     correct, which text-based PDF libraries break. */
  function buildBookHtml(md, title, author) {
    var blocks = mdToBlocks(md);
    var chapters = splitChapters(blocks, title);
    var sections = ['<section class="titlepage"><h1>' + escapeHtml(title) + '</h1>' + (author ? '<p>' + escapeHtml(author) + '</p>' : '') + '</section>'];
    /* v11: the first, heading-less section is the book's front matter
       (title repeat, মূল / অনুবাদ / প্রকাশনা lines) — centre it like
       the title page, but only when real chapters follow it. */
    var hasHeaded = chapters.some(function (c) { return c.heading; });
    chapters.forEach(function (ch, ci) {
      var cls = (hasHeaded && ci === 0 && !ch.heading) ? 'chapter frontmatter' : 'chapter';
      sections.push('<section class="' + cls + '">' + (ch.heading ? '<h2>' + escapeHtml(ch.title) + '</h2>' : '') + ch.blocks.map(blockToXhtml).join('\n') + '</section>');
    });
    sections.push('<section class="chapter">' + creditBlockHtml(title) + '</section>');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapeHtml(title) + '</title><link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;700&family=Noto+Serif+Bengali:wght@500;700&display=swap" rel="stylesheet"><style>'
      + 'body{font-family:"Hind Siliguri","Noto Serif Bengali",serif;line-height:1.7;max-width:700px;margin:0 auto;padding:24px}'
      + 'h1,h2,h3{text-align:center}p{text-align:justify;margin:0 0 1em 0}'
      + '.titlepage{text-align:center;margin-top:30%}.titlepage p{text-align:center}.frontmatter p{text-align:center}.chapter{page-break-before:always}.titlepage{page-break-before:auto}'
      + '</style></head><body>'
      + sections.join('\n') + '</body></html>';
  }
  /* v14: paginate BEFORE rasterising. A browser canvas caps at
     16,384 px tall — a long chapter rendered as one canvas silently
     comes back blank, which is why v13 PDFs had a good first/last
     page and blank pages between. Each page-group below is one A4
     page tall (~990 px), so no canvas ever nears the cap, and a
     paragraph is never cut in half across pages. */
  var pdfRasterCode = [
  "(function () {",
  "  function fail() { try { window.parent.postMessage('oem-pdf-error', '*'); } catch (e) {} }",
  "  function makePage(sec, w) {",
  "    var d = document.createElement('div');",
  "    d.className = sec.className;",
  "    d.style.width = w + 'px';",
  "    document.body.appendChild(d);",
  "    return d;",
  "  }",
  "  function paginate() {",
  "    var pages = [];",
  "    var sections = document.querySelectorAll('section');",
  "    var pagePx = 0;",
  "    for (var si = 0; si < sections.length; si++) {",
  "      var sec = sections[si];",
  "      var w = sec.clientWidth || 700;",
  "      if (!pagePx) pagePx = Math.round(w * 297 / 210);",
  "      var pageDiv = makePage(sec, w);",
  "      var kids = Array.prototype.slice.call(sec.children);",
  "      for (var ki = 0; ki < kids.length; ki++) {",
  "        var kid = kids[ki];",
  "        var tag = kid.tagName;",
  "        if ((tag === 'H2' || tag === 'H3') && pageDiv.children.length > 0 && pageDiv.offsetHeight > pagePx * 0.85) {",
  "          pages.push(pageDiv); pageDiv = makePage(sec, w);",
  "        }",
  "        pageDiv.appendChild(kid);",
  "        if (pageDiv.offsetHeight > pagePx && pageDiv.children.length > 1) {",
  "          var last = pageDiv.lastChild;",
  "          pages.push(pageDiv);",
  "          pageDiv = makePage(sec, w);",
  "          pageDiv.appendChild(last);",
  "        }",
  "      }",
  "      if (pageDiv.children.length) pages.push(pageDiv);",
  "    }",
  "    return pages;",
  "  }",
  "  function start() {",
  "    try {",
  "      var pages = paginate();",
  "      var pdf = new jspdf.jsPDF('p', 'mm', 'a4');",
  "      var firstPage = true;",
  "      var idx = 0;",
  "      function next() {",
  "        if (idx >= pages.length) {",
  "          try { pdf.save(document.title + '.pdf'); } catch (e) { fail(); return; }",
  "          try { window.parent.postMessage('oem-pdf-done', '*'); } catch (e) {}",
  "          return;",
  "        }",
  "        try { window.parent.postMessage({ type: 'oem-pdf-progress', page: idx + 1, total: pages.length }, '*'); } catch (e) {}",
  "        html2canvas(pages[idx], { scale: 1.5, backgroundColor: '#ffffff' }).then(function (canvas) {",
  "          var pxPerMm = canvas.width / 210;",
  "          var imgHmm = canvas.height / pxPerMm;",
  "          var y = 0;",
  "          while (y < imgHmm) {",
  "            var sliceHmm = Math.min(297, imgHmm - y);",
  "            var slicePx = Math.max(1, Math.round(sliceHmm * pxPerMm));",
  "            var sc = document.createElement('canvas');",
  "            sc.width = canvas.width; sc.height = slicePx;",
  "            var ctx = sc.getContext('2d');",
  "            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, sc.width, sc.height);",
  "            ctx.drawImage(canvas, 0, -Math.round(y * pxPerMm));",
  "            if (!firstPage) pdf.addPage(); else firstPage = false;",
  "            pdf.addImage(sc.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, sliceHmm);",
  "            y += sliceHmm;",
  "          }",
  "          idx++; next();",
  "        }).catch(fail);",
  "      }",
  "      next();",
  "    } catch (e) { fail(); }",
  "  }",
  "  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { setTimeout(start, 300); }); }",
  "  else { setTimeout(start, 800); }",
  "})();"
  ].join("\n");
  function makePdfDownload(md, title, author) {
    finalStatusEl.textContent = L('Making the PDF… (one click — no print dialog. Long books can take a while.)',
      'PDF বানানো হচ্ছে… (এক ক্লিকেই — কোনো প্রিন্ট ডায়ালগ নয়। বড় বইয়ে কিছুটা সময় লাগতে পারে।)');
    var html = buildBookHtml(md, title, author);
    var frame = document.createElement('iframe');
    frame.style.position = 'fixed'; frame.style.left = '-12000px'; frame.style.top = '0';
    frame.style.width = '794px'; frame.style.border = '0';
    document.body.appendChild(frame);
    var fdoc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
    function cleanup() { if (frame.remove) frame.remove(); window.removeEventListener('message', onMsg); }
    function fail() {
      finalStatusEl.textContent = L('PDF could not be made — check your connection and try again.',
        'PDF বানানো যায়নি — সংযোগ দেখে আবার চেষ্টা করুন।');
      cleanup();
    }
    function onMsg(e) {
      if (e.source !== frame.contentWindow) return;
      if (e.data && e.data.type === 'oem-pdf-progress') {
        finalStatusEl.textContent = L('Making the PDF… page ' + e.data.page + ' of ' + e.data.total + '.',
          'PDF বানানো হচ্ছে… ' + e.data.total + ' পৃষ্ঠার মধ্যে ' + e.data.page + ' নম্বর।');
        return;
      }
      if (e.data === 'oem-pdf-done') {
        finalStatusEl.textContent = L('PDF downloaded.', 'PDF ডাউনলোড হয়েছে।');
        cleanup();
      } else if (e.data === 'oem-pdf-error') { fail(); }
    }
    window.addEventListener('message', onMsg);
    try {
      fdoc.open(); fdoc.write(html); fdoc.close();
      if (fdoc.body && fdoc.body.scrollHeight) { try { frame.style.height = fdoc.body.scrollHeight + 'px'; } catch (e) {} }
    } catch (e) { fail(); return; }
    var s1 = fdoc.createElement('script');
    s1.onerror = fail;
    s1.onload = function () {
      var s2 = fdoc.createElement('script');
      s2.onerror = fail;
      s2.onload = function () {
        var s3 = fdoc.createElement('script');
        s3.textContent = pdfRasterCode;
        fdoc.body.appendChild(s3);
      };
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      fdoc.body.appendChild(s2);
    };
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    fdoc.body.appendChild(s1);
  }
  if (proofPdfBtn) proofPdfBtn.addEventListener('click', function () {
    if (!state.proofText) return;
    makePdfDownload(state.proofText, (titleEl.value || 'book').trim(), (authorEl.value || '').trim());
  });

  /* ---- Step 3: Google Doc .docx in, EPUB/PDF out ---- */
  if (docFileEl) docFileEl.addEventListener('change', async function () {
    var f = docFileEl.files[0];
    if (!f) return;
    try {
      state.proofText = await parseDocxToMd(f);
      if (!titleEl.value) titleEl.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      docFileStatusEl.textContent = '✓ ' + L('Document loaded: ', 'ডকুমেন্ট লোড হয়েছে: ') + f.name
        + L(' — EPUB and PDF below are ready.', ' — নিচে EPUB আর PDF তৈরি।');
      if (proofEpubBtn) proofEpubBtn.disabled = false;
      if (proofPdfBtn) proofPdfBtn.disabled = false;
      finalStatusEl.textContent = L('Document loaded — pick a format below.',
        'ডকুমেন্ট লোড হয়েছে — নিচে ফরম্যাট বাছুন।');
    } catch (e) {
      docFileStatusEl.textContent = L('Could not read that .docx: ', 'এই .docx পড়া যায়নি: ') + e.message;
    }
  });
})(); 
