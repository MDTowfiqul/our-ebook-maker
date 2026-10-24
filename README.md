# Our Ebook Maker

Turn a PDF into text, entirely in your browser — the first step to making a clean ebook.

**Live site:** https://mdtowfiqul.github.io/our-ebook-maker/

## Before you make an ebook — read this first

The site itself carries this notice above the upload form, because every
user should see it before starting:

- **Check Our Boighar first** (https://mdtowfiqul.github.io/our-boighar/) —
  if the book is already there, there is no need to make it again.
  (You may still make your own copy if you want to.)
- **Two purposes:**
  1. **For yourself only** — you may convert any PDF book, old or new.
     Just do not share the finished ebook online if the book is less
     than 10 years old.
  2. **For everyone** — share it only when the book is 10+ years old,
     OR the writer or publisher has published the PDF publicly
     themselves or has no problem with it being shared online.
- A shareable finished ebook can be sent to the Our Boighar community
  (Facebook group / Telegram linked on the site's About page) so it can
  be checked and added to the library.

## What it does

- **PDF → text:** every page is read with OCR in the browser
  (tesseract.js, Bengali + English + Arabic together — no language to pick).
- **Test first 5 pages** before running a whole book, so you can judge OCR
  quality first.
- **Resume, don't restart:** progress is saved after every page (IndexedDB,
  with a localStorage fallback). If the browser pauses the scan when you
  switch apps, or the phone sleeps, tap Resume to continue exactly where
  it stopped. Note honestly: a phone browser cannot be forced to keep
  running in the background — resume is what makes a pause harmless.
- **Cover, right under the author name:** upload your own cover image,
  find one online (Open Library), or make a gradient text cover from the
  title and author. Don't like a style? "Generate another style" cycles
  through five looks.
- **Download the raw .txt** for proofreading, with the CC BY-SA 4.0 licence
  text appended at the end (optional, on by default).
- **Proofread, four ways:**
  1. **Automatic, in the Maker** — with your own Google Gemini API key
     (free, the default) or an OpenRouter key. The text is sent in
     chunks of about 8,000 characters with the full proofreading prompt.
     After you enter a Gemini key, the tool loads the free models
     actually available on that key and shows their free-tier stats.
     If a free key hits its limit, the tool waits and retries on its
     own, and progress is saved after every chunk — nothing is lost,
     and you can continue from the same place the next day. A "No key
     yet?" popup walks a new user through getting a free Gemini key.
     The key stays only in the visitor's browser and is sent directly
     to Google or OpenRouter; it never reaches any server of ours
     (there is none).
  2. **Manual, with Gemini / Google AI Studio** — the guide page
     reproduces the full workflow step by step, with the full
     proofreading prompt to copy.
  3. **Manual, with Muse** — download the .txt, upload it to your own
     Muse chat, paste the ready-made instruction from the guide, and
     say "continue" chunk by chunk. No API key needed.
  4. **Manual, with vFlat** — the guide also keeps the vFlat alternative
     for the first step.
- **After automatic proofreading, two finishes:**
  1. **Download .docx** and continue by hand as in the guide
     (docx-to-EPUB converter).
  2. **Make EPUB automatically** — the finished EPUB is built right
     here from the proofread text, with your cover if you made one.
     No manual steps left.

## What it deliberately does NOT do

There is **no EPUB download of raw OCR text**. OCR text must be
proofread first; only then does it become a clean ebook. That is why
the EPUB button appears only after automatic proofreading.

## Privacy and cost

There is no server and no sign-up. The PDF, the OCR and the text building
all happen in the visitor's browser tab. Nothing is uploaded anywhere
(except, for automatic proofreading only, text chunks sent directly to
Google or OpenRouter with the visitor's own key), so the site costs
nothing to run on GitHub Pages.

## How it is built

Plain HTML/JavaScript with Tailwind CDN, in the Our Boighar visual style
(gradient hero, Hind Siliguri font, EN/BN toggle). No build step, no Jekyll
needed. GitHub Pages serves the repo root.

- [pdf.js](https://mozilla.github.io/pdf.js/) — page rendering for OCR
- [tesseract.js](https://tesseract.projectnaptha.com/) (v5) — in-browser OCR
- [JSZip](https://stuk.github.io/jszip/) — the .docx and EPUB builders
- [Open Library](https://openlibrary.org/) — optional cover search, no key needed
- [Google Gemini API](https://aistudio.google.com/apikey) / [OpenRouter](https://openrouter.ai/)
  — optional automatic proofreading, visitor's key

## Honest limits

OCR on old, faded or low-resolution Bengali scans will still make mistakes,
and curved phone-camera page photos are the hardest of all — flat scans
work best. That is why the site has a 5-page quality test, resume, and a
full proofreading guide: the tool does the heavy lifting, proofreading
does the finishing. Free API limits change over time — the tool is built
to wait, retry, and save progress rather than depend on any one number.

## Family

Part of the Our series: Our Days, Our Boighar, Our Islamic Archive.
