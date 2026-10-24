# Our Ebook Maker

Turn a scanned PDF into text, entirely in your browser — the first step to making a clean ebook.

**Live site:** https://mdtowfiqul.github.io/our-ebook-maker/

## What it does

- **Scanned PDF → text:** every page is read with OCR in the browser
  (tesseract.js, Bengali + English + Arabic together — no language to pick).
- **Test first 5 pages** before running a whole book, so you can judge OCR
  quality first.
- **Download the raw .txt** for proofreading, with the CC BY-SA 4.0 licence
  text appended at the end (optional, on by default).
- **Proofread here:** a button in the download section opens the guide,
  which explains proofreading with Gemini / Google AI Studio step by step
  and carries the full proofreading prompt to copy.
- **Cover (optional):** try to find a cover online (Open Library), or make
  a simple text cover on a gradient — for the final EPUB after proofreading.

## What it deliberately does NOT do

There is **no EPUB download from scanned text**. A scanned text must be
proofread first; only then does it become a clean ebook. The guide covers
that finishing path: proofread text → Google Docs → .docx → an online
docx-to-EPUB converter.

## Privacy and cost

There is no server and no sign-up. The PDF, the OCR and the text building
all happen in the visitor's browser tab. Nothing is uploaded anywhere, so
the site costs nothing to run on GitHub Pages.

## How it is built

Plain HTML/JavaScript with Tailwind CDN, in the Our Boighar visual style
(gradient hero, Hind Siliguri font, EN/BN toggle). No build step, no Jekyll
needed. GitHub Pages serves the repo root.

- [pdf.js](https://mozilla.github.io/pdf.js/) — page rendering for OCR
- [tesseract.js](https://tesseract.projectnaptha.com/) (v5) — in-browser OCR
- [Open Library](https://openlibrary.org/) — optional cover search, no key needed

## Honest limits

OCR on old, faded or low-resolution Bengali scans will still make mistakes,
and curved phone-camera page photos are the hardest of all — flat scans
work best. That is why the site has a 5-page quality test and a full
proofreading guide: the tool does the heavy lifting, proofreading does
the finishing.

## Family

Part of the Our series: Our Days, Our Boighar, Our Islamic Archive.
