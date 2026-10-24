# Our Ebook Maker

Turn a scanned PDF into text, entirely in your browser — the first step to making a clean ebook.

**Live site:** https://mdtowfiqul.github.io/our-ebook-maker/

## What it does

- **Scanned PDF → text:** every page is read with OCR in the browser
  (tesseract.js, Bengali + English + Arabic together — no language to pick).
- **Test first 5 pages** before running a whole book, so you can judge OCR
  quality first.
- **Resume, don't restart:** progress is saved after every page (IndexedDB,
  with a localStorage fallback). If the browser pauses the scan when you
  switch apps, or the phone sleeps, tap Resume to continue exactly where
  it stopped. Note honestly: a phone browser cannot be forced to keep
  running in the background — resume is what makes a pause harmless.
- **Download the raw .txt** for proofreading, with the CC BY-SA 4.0 licence
  text appended at the end (optional, on by default).
- **Proofread here, two ways:** (a) the guide page reproduces the full
  manual workflow step by step (Google AI Studio / Gemini, Google Docs,
  docx-to-EPUB converter, phone paste rules, NB notes), with the full
  proofreading prompt to copy; (b) **automatic proofreading** with the
  visitor's own OpenRouter API key — the text is sent in chunks with the
  same prompt and joined into a proofread file. The key stays only in
  the visitor's browser and is sent directly to OpenRouter; it never
  reaches any server of ours (there is none).
- **Cover:** upload your own cover image, or try to find one online
  (Open Library), or make a simple gradient text cover — for the final
  EPUB after proofreading.

## What it deliberately does NOT do

There is **no EPUB download from scanned text**. A scanned text must be
proofread first; only then does it become a clean ebook. The guide covers
that finishing path: proofread text → Google Docs → .docx → an online
docx-to-EPUB converter.

## Privacy and cost

There is no server and no sign-up. The PDF, the OCR and the text building
all happen in the visitor's browser tab. Nothing is uploaded anywhere
(except, for automatic proofreading only, text chunks sent directly to
OpenRouter with the visitor's own key), so the site costs nothing to run
on GitHub Pages.

## How it is built

Plain HTML/JavaScript with Tailwind CDN, in the Our Boighar visual style
(gradient hero, Hind Siliguri font, EN/BN toggle). No build step, no Jekyll
needed. GitHub Pages serves the repo root.

- [pdf.js](https://mozilla.github.io/pdf.js/) — page rendering for OCR
- [tesseract.js](https://tesseract.projectnaptha.com/) (v5) — in-browser OCR
- [Open Library](https://openlibrary.org/) — optional cover search, no key needed
- [OpenRouter](https://openrouter.ai/) — optional automatic proofreading, visitor's key

## Honest limits

OCR on old, faded or low-resolution Bengali scans will still make mistakes,
and curved phone-camera page photos are the hardest of all — flat scans
work best. That is why the site has a 5-page quality test, resume, and a
full proofreading guide: the tool does the heavy lifting, proofreading
does the finishing.

## Family

Part of the Our series: Our Days, Our Boighar, Our Islamic Archive.
