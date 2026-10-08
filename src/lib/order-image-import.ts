import { createWorker } from "tesseract.js";

export type OrderScreenshotLine = {
  productCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  subtotal: number;
  boxQuantity: number;
  pieces: number;
  netWeight: number;
  grossWeight: number;
};

type ScreenshotText = { text: string; kind: "products" | "prices" | "weights" | "other" };

const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const normalizeProductCode = (value: string) => value.replace(/[O]/gi, "0").replace(/[Il]/g, "1").replace(/[^a-z0-9]/gi, "").toLowerCase();

function parseNumber(value: string) {
  const cleaned = value.replace(/(\d):(\d)/g, "$1.$2").replace(/[^\d,.-]/g, "");
  if (!cleaned) return NaN;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  const normalized = comma > dot
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  return Number(normalized);
}

function classifyScreenshot(text: string, catalogCodes: string[]): ScreenshotText["kind"] {
  const header = normalize(text);
  if (header.includes("codigo") && header.includes("produto")) return "products";
  if (header.includes("quant") && (header.includes("preco") || header.includes("prego")) && (header.includes("desconto") || header.includes("subtotal"))) return "prices";
  if (header.includes("caixas") && header.includes("pecas") && header.includes("bruto")) return "weights";
  if (readProductRows(text, catalogCodes).length >= 2) return "products";
  const weightRows = readNumericRows(text, 5);
  if (weightRows.length >= 4) return "weights";
  return "other";
}

function readProductRows(text: string, catalogCodes: string[] = []) {
  const rows: Array<{ productCode: string; description: string }> = [];
  const exactCodes = new Map(catalogCodes.map((code) => [normalizeProductCode(code), code]));
  const numericCodes = new Map<string, string[]>();
  for (const code of catalogCodes) {
    const normalized = normalizeProductCode(code);
    if (!/^\d+$/.test(normalized)) continue;
    const withoutLeadingZeros = normalized.replace(/^0+/, "") || "0";
    numericCodes.set(withoutLeadingZeros, [...(numericCodes.get(withoutLeadingZeros) ?? []), code]);
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/[|¦]/g, " ").trim();
    if (catalogCodes.length) {
      let matchedCatalogCode = false;
      for (const match of line.matchAll(/[0-9OIl]{4,8}/gi)) {
        const recognizedCode = normalizeProductCode(match[0]);
        let productCode = exactCodes.get(recognizedCode);
        if (!productCode && /^\d+$/.test(recognizedCode)) {
          const candidates = numericCodes.get(recognizedCode.replace(/^0+/, "") || "0") ?? [];
          if (candidates.length === 1) [productCode] = candidates;
        }
        if (!productCode) continue;
        const description = line.slice((match.index ?? 0) + match[0].length).replace(/^[\s|¦:;,-]+/, "").trim();
        rows.push({ productCode, description });
        matchedCatalogCode = true;
        break;
      }
      if (!matchedCatalogCode) {
        const unmatchedRow = line.match(/(?:^|\s)([0-9OIl]{4,8})(?:\s*[|¦:;,-]\s*|\s+)([A-Z].+)$/i);
        if (unmatchedRow) {
          rows.push({
            productCode: normalizeProductCode(unmatchedRow[1]),
            description: unmatchedRow[2].trim(),
          });
          continue;
        }
      }
      if (rows.length && !rows[rows.length - 1].description && /^[A-Z][A-Z0-9 ]{2,}$/i.test(line) && !/^total\b/i.test(line)) {
        rows[rows.length - 1].description = line;
      }
      continue;
    }
    const match = line.match(/(?:^|\s)([0-9OIl]{4,8})(?:\s*[|¦:;,-]\s*|\s+)([A-Z].+)$/i);
    if (match) {
      const productCode = match[1].replace(/[O]/gi, "0").replace(/[Il]/g, "1");
      rows.push({ productCode, description: match[2].trim() });
      continue;
    }
    if (rows.length && /^[A-Z][A-Z0-9 ]{2,}$/i.test(line) && !/^total\b/i.test(line)) {
      rows[rows.length - 1].description = `${rows[rows.length - 1].description} ${line}`.trim();
    }
  }
  return rows;
}

function readNumericRows(text: string, minimumValues: number) {
  return text.split(/\r?\n/).map((line) => {
    const values = (line.match(/-?\d[\d.,]*/g) ?? []).map(parseNumber).filter(Number.isFinite);
    return values;
  }).filter((values) => values.length >= minimumValues);
}

function readPriceRows(text: string) {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const header = normalize(line);
    return header.includes("quant") && (header.includes("preco") || header.includes("prego"));
  });
  if (headerIndex < 0) return [];
  return readNumericRows(lines.slice(headerIndex + 1).join("\n"), 3);
}

function readWeightRows(text: string) {
  const lines = text.split(/\r?\n/);
  const firstDataIndex = lines.findIndex((line) => (line.match(/-?\d[\d.,]*/g) ?? []).length >= 5);
  if (firstDataIndex < 0) return [];
  return readNumericRows(lines.slice(firstDataIndex).join("\n"), 4);
}

function bestRows<T>(screenshots: ScreenshotText[], kind: ScreenshotText["kind"], parse: (text: string) => T[]) {
  return screenshots
    .filter((screenshot) => screenshot.kind === kind)
    .map((screenshot) => parse(screenshot.text))
    .sort((left, right) => right.length - left.length)[0] ?? [];
}

function mergeScreenshots(screenshots: ScreenshotText[], catalogCodes: string[]): OrderScreenshotLine[] {
  const productRows = screenshots
    .map((screenshot) => readProductRows(screenshot.text, catalogCodes))
    .sort((left, right) => right.length - left.length)[0]
    ?.filter((row) => row.productCode && row.description) ?? [];
  const priceRows = bestRows(screenshots, "prices", readPriceRows);
  const weightRows = bestRows(screenshots, "weights", readWeightRows);

  if (!productRows.length) {
    throw new Error("Não identifiquei a lista com código e descrição dos produtos. Inclua uma captura da aba Produtos.");
  }
  if (!priceRows.length && !weightRows.length) {
    throw new Error("Não identifiquei quantidades, preços ou pesos. Inclua capturas das colunas do pedido.");
  }
  if (priceRows.length && priceRows.length < productRows.length) {
    throw new Error(`Identifiquei ${productRows.length} produtos, mas só ${priceRows.length} linhas de quantidade e preço. Envie uma captura mais nítida para evitar cruzar dados incorretamente.`);
  }
  if (weightRows.length && weightRows.length < productRows.length) {
    throw new Error(`Identifiquei ${productRows.length} produtos, mas só ${weightRows.length} linhas de peso. Envie uma captura mais nítida para evitar cruzar dados incorretamente.`);
  }

  const prices = priceRows.length
    ? priceRows.slice(0, productRows.length)
    : productRows.map(() => []);
  const weights = weightRows.length
    ? weightRows.slice(0, productRows.length)
    : productRows.map(() => []);
  const count = Math.max(productRows.length, prices.length, weights.length);

  return Array.from({ length: count }, (_, index) => {
    const product = productRows[index];
    const price = prices[index] ?? [];
    const weight = weights[index] ?? [];
    const quantity = price[0] ?? 0;
    const unitPrice = price[1] ?? 0;
    const discountPercent = price[2] ?? 0;
    const calculatedSubtotal = Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100;
    const recognizedSubtotal = price[3];
    const subtotal = Number.isFinite(recognizedSubtotal) && Math.abs(recognizedSubtotal - calculatedSubtotal) <= Math.max(1, calculatedSubtotal * 0.03)
      ? recognizedSubtotal
      : calculatedSubtotal;
    return {
      productCode: product?.productCode ?? "",
      description: product?.description ?? "",
      quantity,
      unitPrice,
      discountPercent,
      subtotal,
      boxQuantity: quantity || weight[1] || 0,
      pieces: weight[2] ?? 0,
      netWeight: weight[3] ?? 0,
      grossWeight: weight[4] ?? 0,
    };
  }).filter((row) => row.productCode || row.quantity > 0 || row.grossWeight > 0);
}

export function mergeOrderScreenshotTexts(texts: string[], catalogCodes: string[] = []): OrderScreenshotLine[] {
  return mergeScreenshots(texts.map((text) => ({ text, kind: classifyScreenshot(text, catalogCodes) })), catalogCodes);
}

export async function extractOrderLinesFromImages(
  images: File[],
  onProgress: (progress: number) => void,
  catalogCodes: string[] = [],
): Promise<OrderScreenshotLine[]> {
  if (!images.length) throw new Error("Selecione ao menos uma imagem do pedido.");
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    worker = await createWorker("eng", 1, {
      logger: (message) => {
        if (message.status === "recognizing text") {
          onProgress(message.progress);
        }
      },
    });
    const screenshots: string[] = [];
    for (let index = 0; index < images.length; index += 1) {
      const result = await worker.recognize(images[index]);
      screenshots.push(result.data.text);
      onProgress((index + 1) / images.length);
    }
    return mergeOrderScreenshotTexts(screenshots, catalogCodes);
  } finally {
    await worker?.terminate();
  }
}
