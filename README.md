# Our Ebook Maker

Turn a scanned PDF into a clean ebook, with Muse. The book's text,
proofreading and formatted document all come from a Muse chat; this
site then turns that document into EPUB, PDF and Kindle formats.

**Live site:** https://mdtowfiqul.github.io/our-ebook-maker/

## How it works — 3 steps, all visible

1. **Your book** — title, author, ebook creator name (right below
   the author, shown on the credit page), and a cover. Upload a cover if you have one, find one
   online, or make a text cover (tap "Generate another style" as
   many times as you like — the algorithm never repeats a fixed
   cycle). The scanned PDF itself does not go here.
2. **Muse route — scanned PDF to Google Doc** — open a Muse chat,
   attach the scanned PDF, and paste the full prompt (Copy button
   on the page, or the pop-up with the whole text). Muse extracts
   the text — converting legacy Bijoy/SutonnyMJ fonts to Unicode
   Bangla — proofreads the whole book automatically (no
   DONE/continue round trip) and sends a formatted Google Doc
   link that reads like a main published book. The Doc
   begins directly with the book title, with no cover-page or
   artwork notes. This site itself cannot call Muse or your Drive;
   that part happens in the Muse chat. Then download the .docx
   from the Doc (File → Download → Microsoft Word) and upload it
   in Step 3.
3. **Final ebook — from document to ebook** — upload the Google Doc
   .docx and the EPUB, Download PDF and .docx-download buttons
   unlock at once (Download PDF opens the print dialog
   automatically — choose Save as PDF). EPUB and PDF are built
   automatically in the browser (the EPUB embeds the Hind
   Siliguri font so Bengali renders correctly in Play Books'
   default font; the credit page reads "ইবুক নির্মাতা: <name>"
   and "সৌজন্যে: Our Ebook Maker ও Our Boighar"; title
   page, chapters on new pages, centred headings, justified text
   with Arabic right-aligned, your cover, credit page); AZW3 / MOBI
   go through online-convert (manual, linked in the step), and
   AZW3 / MOBI / KFX through Calibre.

The header, menu and bottom bar follow Our Boighar: a hamburger opens
a slide-in drawer (steps, language, 5 theme colours, Day/Night, Help
& Policies chips, GitHub), a moon/sun button at the top right
switches Day/Night, and a floating pill bottom bar has Home, Muse
(jumps to Step 2), Ebook (jumps to Step 3) and Guide (opens the guide
pop-up). Guide links on the Maker open pop-ups with the necessary
information instead of navigating to the guide page; the full guide
page is still linked from the guide pop-up and drawer.

## Before you make an ebook — read this first

The site itself carries this notice above the book form, because every
user should see it before starting:

- First, check whether the book is already on Our Boighar.
- **For yourself only:** any PDF book, old or new, is fine — just do
  not share the finished ebook online if the book is less than 10
  years old.
- **For everyone, to share with everyone:** share only when the book
  is 10+ years old, OR the writer or publisher has published the PDF
  publicly themselves or has no problem with it being shared online.

## What this site does NOT do anymore

Earlier versions did browser OCR (tesseract.js + pdf.js), inline
proofreading with the visitor's own Gemini/OpenRouter key, and
.docx building from proofread text. All of that was removed in v9:
everyone uses the Muse route now, so the OCR engine, the
proofreading panels, the API-key help and the document builder are
gone. The only library left is JSZip (for reading the uploaded
.docx and building the EPUB).

## Privacy

There is no server and no sign-up. The .docx is read and the
EPUB/PDF are built entirely in the visitor's browser tab. The
scanned PDF goes only to the visitor's own Muse chat — this site
never sees it and never uploads anything.
