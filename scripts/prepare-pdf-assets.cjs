// Serve the PDF/OCR runtime from this build, independently of Next's module chunks.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const target = path.join(root, "public/vendor");
function copy(source, destination) {
  const output = path.join(target, destination);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(path.join(root, source), output);
}
copy("node_modules/pdfjs-dist/build/pdf.mjs", "pdfjs-4.10.38/pdf.mjs");
copy("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "pdfjs-4.10.38/pdf.worker.min.mjs");
copy("node_modules/tesseract.js/dist/tesseract.min.js", "ocr-7/tesseract.min.js");
copy("node_modules/tesseract.js/dist/worker.min.js", "ocr-7/worker.min.js");
for (const name of fs.readdirSync(path.join(root, "node_modules/tesseract.js-core"))) {
  if (/^tesseract-core.*lstm\.wasm(?:\.js)?$/.test(name)) copy(`node_modules/tesseract.js-core/${name}`, `ocr-7/${name}`);
}
copy("eng.traineddata", "ocr-7/eng.traineddata");
console.log("PDF and OCR assets prepared.");
