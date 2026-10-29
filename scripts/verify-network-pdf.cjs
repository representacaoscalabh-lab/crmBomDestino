// Offline verification using the production parser, PDF.js rendering and Tesseract.
// Usage: node scripts/verify-network-pdf.cjs input.pdf [output.json]
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const canvas = require("@napi-rs/canvas");
const tesseract = require("tesseract.js");
const root = path.resolve(__dirname, "..");

async function main() {
  if (!process.argv[2]) throw new Error("Usage: node scripts/verify-network-pdf.cjs input.pdf [output.json]");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  global.document = { createElement: () => canvas.createCanvas(1, 1) };
  const runtime = {
    loadPdfRuntime: async () => pdfjs,
    loadOcrRuntime: async () => ({ ...tesseract, createWorker: async () => {
      const worker = await tesseract.createWorker("eng", 1, { langPath: root, gzip: false, cacheMethod: "none" });
      const recognize = worker.recognize.bind(worker);
      worker.recognize = (image, ...args) => recognize(image.toBuffer("image/png"), ...args);
      return worker;
    } }),
  };
  const cache = new Map();
  function load(name) {
    if (name === "pdf-runtime") return runtime;
    if (cache.has(name)) return cache.get(name);
    const filename = path.join(root, "src/lib", `${name}.ts`);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const exports = {};
    cache.set(name, exports);
    new Function("require", "exports", code)((id) => id.startsWith("@/lib/") ? load(id.slice(6)) : require(id), exports);
    return exports;
  }
  const parsed = await load("network-order-pdf").parseNetworkOrderPdf(new Uint8Array(fs.readFileSync(process.argv[2])),
    (progress) => console.log(`Read ${Math.round(progress * 100)}%`));
  for (const order of parsed) {
    console.log(`${order.orderNumber}/L: ${order.lines.length} items; quantities ${order.lines.map((line) => line.quantity).join(", ")}; total ${order.totalGrossValue}; warnings ${order.warnings.length}`);
  }
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(parsed, null, 2));
  if (parsed.some((order) => order.warnings.length)) process.exitCode = 1;
}
main().catch((cause) => { console.error(cause); process.exitCode = 1; });
