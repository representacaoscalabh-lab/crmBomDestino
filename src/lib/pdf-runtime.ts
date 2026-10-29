import type * as PdfJs from "pdfjs-dist";
import type * as Tesseract from "tesseract.js";

let pdfRuntime: Promise<typeof PdfJs> | undefined;
let ocrRuntime: Promise<typeof Tesseract> | undefined;

export function loadPdfRuntime(): Promise<typeof PdfJs> {
  const moduleUrl = "/vendor/pdfjs-4.10.38/pdf.mjs";
  pdfRuntime ??= import(/* webpackIgnore: true */ moduleUrl).then((runtime: typeof PdfJs) => {
    runtime.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs-4.10.38/pdf.worker.min.mjs";
    return runtime;
  }).catch((cause: unknown) => {
    pdfRuntime = undefined;
    throw new Error("Não foi possível carregar o leitor de PDF. Atualize a página e tente novamente.", { cause });
  });
  return pdfRuntime;
}

export function loadOcrRuntime(): Promise<typeof Tesseract> {
  ocrRuntime ??= new Promise<typeof Tesseract>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/ocr-7/tesseract.min.js";
    script.onload = () => {
      const runtime = (window as unknown as { Tesseract?: typeof Tesseract }).Tesseract;
      if (runtime?.createWorker) resolve(runtime);
      else { script.remove(); reject(new Error("O leitor de imagens do PDF não foi carregado corretamente. Atualize a página e tente novamente.")); }
    };
    script.onerror = () => { script.remove(); reject(new Error("Não foi possível carregar a leitura de imagens do PDF. Atualize a página e tente novamente.")); };
    document.head.appendChild(script);
  }).catch((cause: unknown) => { ocrRuntime = undefined; throw cause; });
  return ocrRuntime;
}
