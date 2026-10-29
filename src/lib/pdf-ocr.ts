import type { Page, Worker } from "tesseract.js";
import type { PDFPageProxy } from "pdfjs-dist";
import { loadOcrRuntime } from "@/lib/pdf-runtime";

// Keep words in their original columns, using each OCR line's baseline to align rows.
export function ocrPageTextItems(data: Pick<Page, "blocks">, pageHeight: number, scale: number) {
  return (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) =>
    line.words.filter((word) => word.text.trim()).map((word) => ({
      str: word.text.trim(),
      width: (word.bbox.x1 - word.bbox.x0) / scale,
      transform: [1, 0, 0, 1, word.bbox.x0 / scale, pageHeight - (line.baseline.y0 + line.baseline.y1) / 2 / scale],
    })))));
}

export async function createPdfOcrReader() {
  const { createWorker, PSM } = await loadOcrRuntime();
  let currentProgress: ((progress: number) => void) | undefined;
  const worker: Worker = await createWorker("eng", 1, {
    workerPath: "/vendor/ocr-7/worker.min.js", workerBlobURL: false,
    corePath: "/vendor/ocr-7", langPath: "/vendor/ocr-7", gzip: false,
    logger: (message) => { if (message.status === "recognizing text") currentProgress?.(message.progress); },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
  } catch (cause) { await worker.terminate(); throw cause; }
  return {
    async read(page: PDFPageProxy, onProgress?: (progress: number) => void) {
      currentProgress = onProgress;
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, Math.sqrt(12000000 / (base.width * base.height)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try {
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível preparar a página do PDF para leitura.");
        await page.render({ canvasContext: context, viewport }).promise;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0;
        for (let index = 0; index < pixels.length; index += 16) {
          if (pixels[index] < 200 || pixels[index + 1] < 200 || pixels[index + 2] < 200) ink += 1;
        }
        const isBlank = ink === 0;
        const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
        return { items: ocrPageTextItems(data, base.height, scale), height: base.height, width: base.width, isBlank };
      } finally { canvas.width = 0; canvas.height = 0; currentProgress = undefined; }
    },
    terminate: () => worker.terminate(),
  };
}
