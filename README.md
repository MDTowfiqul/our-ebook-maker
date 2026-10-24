# Our Ebook Maker

Turn a PDF or a text file into an EPUB ebook, entirely in your browser.

**Live site:** https://mdtowfiqul.github.io/our-ebook-maker/

## What it does

- **Text PDFs** → EPUB in seconds (the text is already in the file).
- **Scanned PDFs** → page-by-page OCR with Tesseract, in Bengali, English or
  Arabic (or Bengali+English / Arabic+English). Scanned pages are detected
  automatically in Auto mode.
- **Test first 5 pages** before committing to a whole scanned book.
- **.txt upload** → EPUB directly (for text already made with vFlat or elsewhere).
- **Chapter detection** — Chapter / অধ্যায় / পরিচ্ছেদ / পর্ব / Part headings
  become the ebook's table of contents.
- **Two downloads** — the EPUB, and the raw .txt for proofreading in
  Google AI Studio (see `guide.html` for the full proofreading prompt).
- **Optional cover image** and an optional CC BY-SA 4.0 licence page at the end.

## Privacy and cost

There is no server and no sign-up. The PDF, the OCR and the EPUB building
all happen in the visitor's browser tab. Nothing is uploaded anywhere, so
the site costs nothing to run on GitHub Pages.

## How it is built

Plain HTML/CSS/JavaScript, no build step, no Jekyll needed. GitHub Pages
serves the repo root.

- [pdf.js](https://mozilla.github.io/pdf.js/) — PDF text extraction and page rendering
- [tesseract.js](https://tesseract.projectnaptha.com/) (v5) — in-browser OCR
- [JSZip](https://stuk.github.io/jszip/) — builds the EPUB (a ZIP with the
  `mimetype` file first and uncompressed, `META-INF/container.xml`,
  `OEBPS/content.opf`, `OEBPS/toc.ncx`, chapter XHTML files)

The EPUB produced is EPUB 2, which opens in Google Play Books and most
EPUB readers.

## Honest limits

OCR on old, faded or low-resolution Bengali scans will still make mistakes,
and curved phone-camera page photos are the hardest of all — flat scans
work best. That is why the site has a 5-page quality test and a full
proofreading guide: the tool does the heavy lifting, proofreading does
the finishing.

## Family

Part of the Our series: Our Days, Our Boighar, Our Islamic Archive.
