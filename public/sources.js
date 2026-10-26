// Sources, NotebookLM-style: add PDFs, Word files, text or Markdown; each becomes a chip you can
// switch on or off. Text is extracted in the browser; files never leave the device. Only the
// extracted text of the sources you keep switched on is sent with the quiz request.
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
const MAMMOTH = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js";
export const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.text,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_FILE_MB = 25;

let pdfjs = null;
async function loadPdfJs() {
  if (!pdfjs) { pdfjs = await import(PDFJS); pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; }
  return pdfjs;
}
function loadScript(src) {
  return new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("Couldn't load the Word reader. Check your connection.")); document.head.append(s); });
}

export const kindOf = (file) => {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (n.endsWith(".docx")) return "docx";
  if (/\.(txt|md|markdown|text)$/.test(n) || file.type.startsWith("text/")) return "text";
  return null;
};

// Tidy extracted text: join hyphenated line breaks, collapse runs of spaces, keep paragraphs.
export const tidy = (t) => t.replace(/\r/g, "").replace(/(\w)-\n(\w)/g, "$1$2").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();

export async function extract(file, onProgress = () => {}) {
  const kind = kindOf(file);
  if (!kind) throw new Error(`${file.name}: only PDF, Word (.docx), text and Markdown files are supported.`);
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${file.name} is over ${MAX_FILE_MB} MB.`);
  if (kind === "text") return { kind, text: tidy(await file.text()), pages: null };
  if (kind === "docx") {
    if (!window.mammoth) await loadScript(MAMMOTH);
    const { value } = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { kind, text: tidy(value), pages: null };
  }
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const parts = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let line = "", out = "";
    let lastY = null;
    for (const item of content.items) {
      const y = item.transform ? item.transform[5] : null;
      if (lastY != null && y != null && Math.abs(y - lastY) > 2) { out += line.trim() + "\n"; line = ""; }
      line += item.str + (item.hasEOL ? "\n" : " ");
      lastY = y;
    }
    parts.push(out + line);
    onProgress(p, doc.numPages);
  }
  const text = tidy(parts.join("\n\n"));
  if (!text) throw new Error(`${file.name} has no selectable text (it may be a scanned image).`);
  return { kind, text, pages: doc.numPages };
}
