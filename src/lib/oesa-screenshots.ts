import type { Customer, Order, OrderItem, Product } from "@/lib/types";

export type ScreenshotText = { name: string; text: string };
type IdentityRow = { code: string; description: string; quantity: number };
type ValueRow = { quantity: number; price: number; discount: number; subtotal: number; boxes: number; pieces?: number };
const numeric = "\\d+(?:[.,]\\d+)?";
const normalizeCode = (value: string) => value.trim().replace(/^0+(?=\d)/, "").toUpperCase();
const num = (value: string) => Number(value.replace(",", "."));

export function parseOesaScreenshot(text: string, pricesAndPieces = false) {
  const identities: IdentityRow[] = [];
  const values: ValueRow[] = [];
  const warnings: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[|]/g, " ").trim();
    if (!line) continue;
    const identity = line.match(new RegExp(`^(\\d{2,})\\s+(.+?[A-Za-z].*?)\\s+(${numeric})$`));
    const value = line.match(new RegExp(`^(${numeric})\\s+(${numeric})\\s+(${numeric})\\s+(${numeric})\\s+(${numeric})$`));
    if (value) {
      values.push(pricesAndPieces
        ? { quantity: 0, price: num(value[1]), discount: num(value[2]), subtotal: num(value[3]), boxes: num(value[4]), pieces: num(value[5]) }
        : { quantity: num(value[1]), price: num(value[2]), discount: num(value[3]), subtotal: num(value[4]), boxes: num(value[5]) });
    } else if (identity) {
      identities.push({ code: identity[1], description: identity[2], quantity: num(identity[3]) });
    } else if (/^\d/.test(line)) {
      warnings.push(`Linha não reconhecida: ${raw}`);
    }
  }
  return { identities, values, warnings };
}

export function buildOesaScreenshotImport(sources: ScreenshotText[], customer: Customer, products: Product[], preOrder: string, issueDate: string, mode: "quantity" | "ordered" = "quantity") {
  const parsed = sources.map((source, index) => ({ ...parseOesaScreenshot(source.text, mode === "ordered" && index === 1), name: source.name }));
  const warnings = parsed.flatMap((source) => source.warnings.map((warning) => `${source.name}: ${warning}`));
  const items: OrderItem[] = [];
  const review: { productId: string; subtotal: number; suggestedPrice: number | null }[] = [];
  const used = new Set<number>();
  const seenCodes = new Set<string>();
  const same = (identities: IdentityRow[], values: ValueRow[]) => identities.length === values.length && identities.every((row, index) => Math.abs(row.quantity - values[index].quantity) < 0.0001);
  const orderedValid = mode !== "ordered" || (parsed.length === 2 && parsed[0].identities.length > 0 && parsed[0].identities.length === parsed[1].values.length);
  if (!orderedValid) warnings.push(`Imagens 1 e 2: a imagem 1 tem ${parsed[0]?.identities.length ?? 0} produtos e a imagem 2 tem ${parsed[1]?.values.length ?? 0} linhas de preços. Envie exatamente duas imagens com as mesmas linhas na mesma ordem. Nenhum item foi preparado para evitar deslocar os preços.`);
  for (const source of (orderedValid ? (mode === "ordered" ? parsed.slice(0, 1) : parsed.filter((source) => source.identities.length)) : [])) {
    const candidates = parsed.map((candidate, index) => ({ candidate, index })).filter(({ candidate, index }) => mode === "ordered" ? index === 1 : same(source.identities, candidate.values));
    if (source.warnings.length || candidates.length !== 1 || used.has(candidates[0]?.index)) {
      warnings.push(`${source.name}: ${source.identities.length} produtos não preparados. ${source.warnings.length ? "Há linhas ilegíveis." : candidates.length > 1 ? "Mais de um print de valores tem a mesma sequência de quantidades." : candidates.length === 0 ? "Nenhum print de valores corresponde à sequência completa das quantidades." : "O print de valores já foi utilizado por outro print de produtos."}`);
      continue;
    }
    const { candidate, index } = candidates[0];
    if (mode !== "ordered" && parsed.filter((other) => other.identities.length && same(other.identities, candidate.values)).length !== 1) {
      warnings.push(`${source.name}: mais de um print de produtos corresponde ao mesmo print de valores. Remova duplicatas ou envie pares com sequências diferentes; nenhum desses itens foi importado.`);
      continue;
    }
    used.add(index);
    if (candidate.warnings.length) { warnings.push(`${candidate.name}: pareamento bloqueado por linhas ilegíveis; confira o log.`); continue; }
    source.identities.forEach((row, position) => {
      const value = candidate.values[position];
      const label = `${source.name}, linha ${position + 1}, código ${row.code} (${row.description})`;
      const matches = products.filter((product) => [product.codeBox, product.codeHalfBox].some((code) => code && normalizeCode(code) === normalizeCode(row.code)));
      if (matches.length !== 1) { warnings.push(`${label}: produto ${matches.length ? "ambíguo" : "não cadastrado"}; não importado.`); return; }
      if (seenCodes.has(normalizeCode(row.code))) { warnings.push(`${label}: produto repetido entre prints; não importado novamente. Confira sobreposição.`); return; }
      if (![row.quantity, value.boxes, value.discount, value.price, value.subtotal, value.pieces ?? row.quantity].every(Number.isFinite) || (value.pieces ?? 0) < 0 || !(row.quantity > 0) || !(value.boxes > 0) || !Number.isInteger(value.boxes) || value.discount < 0 || value.discount > 100 || value.price < 0 || value.subtotal < 0) { warnings.push(`${label}: quantidade, caixas, desconto ou preço inválido; não importado.`); return; }
      const subtotal = Math.round(row.quantity * value.price * (1 - value.discount / 100) * 100) / 100;
      const product = matches[0];
      if (!Number.isFinite(product.weightPerBox) || product.weightPerBox < 0) { warnings.push(`${label}: peso por caixa inválido no cadastro; não importado.`); return; }
      seenCodes.add(normalizeCode(row.code));
      if (Math.abs(subtotal - value.subtotal) > 0.05) {
        const divisor = row.quantity * (1 - value.discount / 100);
        const suggestedPrice = divisor > 0 ? value.subtotal / divisor : null;
        review.push({ productId: product.id, subtotal: value.subtotal, suggestedPrice });
        warnings.push(`${label}: produto cadastrado e mantido na conferência. Possível erro de leitura do preço: quantidade ${row.quantity}, preço lido ${value.price}, desconto ${value.discount}%, subtotal do print ${value.subtotal}, cálculo ${subtotal}.${suggestedPrice !== null ? ` Preço compatível com o subtotal: ${suggestedPrice.toFixed(6)}; confirme no print.` : ""} Corrija os campos ou exclua o item antes de salvar.`);
      }
      const weight = product.weightPerBox * value.boxes;
      items.push({ productId: product.id, productCode: product.codeBox, description: product.description, packageKind: "Caixa", packageQuantity: value.boxes, boxQuantity: value.boxes, unitQuantity: row.quantity, pieces: value.pieces ?? row.quantity, unitPrice: value.price, packagePrice: value.price * row.quantity / value.boxes, discountPercent: value.discount, subtotal, totalWeight: weight, grossWeight: weight, netWeight: 0 });
    });
  }
  parsed.forEach((source, index) => {
    if (!source.identities.length && !source.values.length) warnings.push(`${source.name}: nenhum produto ou valor reconhecido. Confira a nitidez e o enquadramento.`);
    if (source.values.length && !used.has(index)) warnings.push(`${source.name}: print com ${source.values.length} linhas de valores sem pareamento seguro; não importado.`);
  });
  const order: Order = { id: `oesa-prints:${customer.id}:${preOrder}`, preOrder, issueDate, invoice: "", customerId: customer.id, customerName: customer.name, customerCode: customer.code, customerCity: customer.city, store: customer.store, paymentTerm: customer.paymentTerm ?? "", status: "normal", items, totalValue: Math.round(items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0) * 100) / 100, totalWeight: items.reduce((sum, item) => sum + item.totalWeight, 0) };
  return { order, warnings, review, detected: parsed.reduce((sum, source) => sum + source.identities.length, 0) };
}

export function pendingOesaScreenshotReview(order: Order | null, review: { productId: string; subtotal: number }[]) {
  return review.filter((entry) => order?.items.some((item) => item.productId === entry.productId && Math.abs((item.subtotal ?? 0) - entry.subtotal) > 0.05));
}

export async function readOesaScreenshots(files: File[], onProgress: (value: number) => void) {
  const { createWorker, PSM } = await import("tesseract.js");
  let current = 0;
  const worker = await createWorker("eng", 1, { logger: (message) => {
    if (message.status === "recognizing text") onProgress((current + message.progress) / files.length);
  } });
  const sources: ScreenshotText[] = [];
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
    for (const file of files) {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > 16000000) throw new Error(`${file.name}: imagem muito grande. Recorte a tabela antes de importar.`);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width * 2; canvas.height = bitmap.height * 2;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível preparar a imagem.");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const { data } = await worker.recognize(canvas);
        sources.push({ name: file.name, text: data.text });
      } finally { bitmap.close(); }
      current += 1; onProgress(current / files.length);
    }
  } finally { await worker.terminate(); }
  return sources;
}
