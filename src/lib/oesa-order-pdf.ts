import { loadPdfRuntime } from "@/lib/pdf-runtime";
import type { Customer, Order, OrderItem, Product } from "@/lib/types";

type TextItem = { str: string; transform: number[]; width?: number };
export type OesaLine = { supplierCode: string; description?: string; measure: "UN" | "KG" | "PO"; quantity: number; price: number };
export type OesaOrder = { orderNumber: string; customerCnpj: string; issueDate: string; lines: OesaLine[]; warnings: string[]; expectedItemCount?: number; detectedItemCount?: number };
const digits = (text: string) => text.replace(/\D/g, "");
const code = (text: string) => {
  const value = text.trim().toUpperCase();
  return /^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, "") : value;
};
const number = (text: string) => Number(text.replace(/\./g, "").replace(",", "."));

function descriptionMatches(source: string, catalog: string) {
  const tokens = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/\b(?:MUSSARELA|MUZZARELA|MOZZARELA|MOZZARELLA|MOZZ)\b/g, "MUSSARELA")
    .split(/[^A-Z]+/).filter((word) => word.length >= 4 && !["QUEIJO", "BUFALA", "UNIDADE", "QUILO"].includes(word));
  const sourceWords = tokens(source);
  const catalogWords = tokens(catalog);
  return sourceWords.some((word) => catalogWords.some((other) => word.includes(other) || other.includes(word) || word.slice(0, 4) === other.slice(0, 4)));
}

export function updateOesaItem(product: Product, boxes: number, unitPrice: number): OrderItem {
  const quantity = Math.max(1, Math.round(boxes));
  const units = quantity * product.quantityPerBox;
  const weight = quantity * product.weightPerBox;
  return { productId: product.id, productCode: product.codeBox, description: product.description, packageKind: "Caixa", packageQuantity: quantity, boxQuantity: quantity, unitQuantity: units, pieces: units, packagePrice: unitPrice * product.quantityPerBox, unitPrice, discountPercent: 0, subtotal: Math.round(units * unitPrice * 100) / 100, totalWeight: weight, grossWeight: weight, netWeight: 0 };
}

export function updateOesaOrder(order: Order, items: OrderItem[]): Order {
  return { ...order, items, totalValue: Math.round(items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0) * 100) / 100, totalWeight: items.reduce((sum, item) => sum + item.totalWeight, 0) };
}

export function parseOesaOrderPage(items: TextItem[]): OesaOrder | null {
  const rows: { y: number; items: TextItem[] }[] = [];
  for (const item of items.filter((item) => item.str.trim())) {
    let row = rows.find((row) => Math.abs(row.y - item.transform[5]) < 2);
    if (!row) { row = { y: item.transform[5], items: [] }; rows.push(row); }
    row.items.push(item);
  }
  const lines = rows.sort((a, b) => b.y - a.y).map((row) => row.items.sort((a, b) => a.transform[4] - b.transform[4]).map((item) => item.str.trim()).join(" "));
  const text = lines.join("\n");
  const orderNumber = text.match(/N[uú]mero\s+do\s+Pedido\s*:\s*(\d+)/i)?.[1];
  // Only the purchaser block is eligible: the supplier also has a CNPJ.
  const purchaser = text.split(/Fornecedor\s*:/i)[0];
  const customerCnpj = purchaser.match(/CNPJ\s*\/\s*CPF\s*:\s*([\d./-]+)/i)?.[1];
  if (!orderNumber || !customerCnpj || digits(customerCnpj).length !== 14) return null;
  const date = text.match(/Data\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const result: OesaOrder = { orderNumber, customerCnpj: digits(customerCnpj), issueDate: date ? `${date[3]}-${date[2]}-${date[1]}` : "", lines: [], warnings: [] };
  result.expectedItemCount = Number(text.match(/\b(\d+)\s+Itens\b/i)?.[1]) || undefined;
  result.detectedItemCount = 0;
  let inTable = false;
  for (const line of lines) {
    if (/Qt\.?\s*Pedida/i.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (/\bItens\b|Tot\.?\s*P[. ]?Compra|Previs[aã]o\s+Pagamento/i.test(line)) { inTable = false; continue; }
    if (!/^\d+\s/.test(line)) {
      if (/\b(?:UN|KG|PO)\s+[\d.,]+/i.test(line)) result.warnings.push(`Pedido ${orderNumber}: linha de produto sem código inicial reconhecível; não importada: ${line}`);
      continue;
    }
    result.detectedItemCount += 1;
    const match = line.match(/\s(\d+)\s+(?:QUILO|UNIDADE|POTE|CAIXA|KG|UN)\s+(UN|KG|PO)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i);
    if (!match) { result.warnings.push(`Pedido ${orderNumber}: linha não reconhecida: ${line}`); continue; }
    const quantity = number(match[3]);
    const price = number(match[5]);
    if (!(quantity > 0) || !Number.isFinite(price) || price < 0) { result.warnings.push(`Pedido ${orderNumber}: quantidade ou preço inválido: ${line}`); continue; }
    const description = line.slice(0, match.index).replace(/^\d+\s+/, "").trim();
    result.lines.push({ supplierCode: match[1], description, measure: match[2].toUpperCase() as OesaLine["measure"], quantity, price });
  }
  return result;
}

export async function parseOesaOrderPdf(data: Uint8Array, onProgress: (value: number) => void): Promise<OesaOrder[]> {
  const pdfjs = await loadPdfRuntime();
  const document = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const orders = new Map<string, OesaOrder>();
  try {
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i);
      const content = await page.getTextContent();
      const parsed = parseOesaOrderPage(content.items.filter((item) => "str" in item).map((item) => ({ str: item.str, transform: item.transform, width: item.width })));
      if (!parsed) throw new Error(`Página ${i}: não foi possível identificar o pedido e o CNPJ da empresa OESA. Confira o PDF original.`);
      const key = `${parsed.customerCnpj}:${parsed.orderNumber}`;
      const previous = orders.get(key);
      parsed.warnings = parsed.warnings.map((warning) => `Página ${i}: ${warning}`);
      orders.set(key, previous ? { ...previous, lines: [...previous.lines, ...parsed.lines], warnings: [...previous.warnings, ...parsed.warnings], expectedItemCount: Math.max(previous.expectedItemCount ?? 0, parsed.expectedItemCount ?? 0) || undefined, detectedItemCount: (previous.detectedItemCount ?? previous.lines.length) + (parsed.detectedItemCount ?? parsed.lines.length) } : parsed);
      onProgress(i / document.numPages);
    }
  } finally { await document.destroy(); }
  if (![...orders.values()].some((order) => order.lines.length)) throw new Error(["Nenhum produto foi lido. Use o PDF original OESA com texto pesquisável e as colunas Cód.Fáb., Un., Qt.Pedida e P.Compra.", ...[...orders.values()].flatMap((order) => order.warnings)].join("\n"));
  return [...orders.values()];
}

export function buildOesaOrderImport(parsed: OesaOrder[], customers: Customer[], products: Product[], existing: Order[]) {
  const orders: Order[] = [];
  const warnings = parsed.flatMap((order) => order.warnings);
  for (const entry of parsed) {
    const matches = customers.filter((customer) => digits(customer.document ?? "") === entry.customerCnpj);
    const prefix = `Pedido OESA ${entry.orderNumber}`;
    if (matches.length !== 1) { warnings.push(`${prefix}: CNPJ ${entry.customerCnpj} ${matches.length ? "duplicado" : "não encontrado"} no cadastro.`); continue; }
    const customer = matches[0];
    if ([...existing, ...orders].some((order) => order.preOrder === entry.orderNumber && order.customerId === customer.id)) { warnings.push(`${prefix}: já existe para este cliente.`); continue; }
    if (!entry.issueDate) { warnings.push(`${prefix}: data de emissão não identificada.`); continue; }
    const items: OrderItem[] = [];
    for (const line of entry.lines) {
      const matches = products.filter((product) => [product.codeBox, product.codeHalfBox].some((value) => value && code(value) === code(line.supplierCode)));
      if (matches.length !== 1) { warnings.push(`${prefix}: Cód.Fáb. ${line.supplierCode} — ${line.description ?? "Descrição não identificada"}: ${matches.length ? "código ambíguo (mais de um produto ao desconsiderar zeros à esquerda)" : "código não cadastrado, mesmo desconsiderando zeros à esquerda"}; item não importado.`); continue; }
      const product = matches[0];
      if (line.description && !descriptionMatches(line.description, product.description)) {
        warnings.push(`${prefix}: código ${line.supplierCode} descreve "${line.description}" no PDF, mas está cadastrado como "${product.description}". Item bloqueado; confira o cadastro.`);
        continue;
      }
      const divisor = product.quantityPerBox;
      if (!(divisor > 0) || !Number.isFinite(divisor) || !(product.quantityPerBox > 0) || !Number.isFinite(product.quantityPerBox) || !Number.isFinite(product.weightPerBox) || product.weightPerBox < 0) { warnings.push(`${prefix}: confira unidades e peso por caixa de ${line.supplierCode}; item ignorado.`); continue; }
      const boxes = Math.max(1, Math.round(line.quantity / divisor));
      items.push(updateOesaItem(product, boxes, line.price));
    }
    if (!items.length) { warnings.push(`${prefix}: nenhum item pôde ser importado.`); continue; }
    orders.push({ id: `oesa:${customer.id}:${entry.orderNumber}`, preOrder: entry.orderNumber, issueDate: entry.issueDate, invoice: "", customerId: customer.id, customerName: customer.name, customerCode: customer.code, customerCity: customer.city, store: customer.store, paymentTerm: customer.paymentTerm ?? "", status: "normal", items, totalValue: Math.round(items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0) * 100) / 100, totalWeight: items.reduce((sum, item) => sum + item.totalWeight, 0) });
  }
  const summaries = parsed.map((entry) => {
    const prepared = orders.find((order) => order.preOrder === entry.orderNumber && customers.some((customer) => customer.id === order.customerId && digits(customer.document ?? "") === entry.customerCnpj))?.items.length ?? 0;
    const detected = Math.max(entry.detectedItemCount ?? 0, entry.lines.length);
    const total = Math.max(entry.expectedItemCount ?? 0, detected);
    if (entry.expectedItemCount !== undefined && entry.expectedItemCount !== detected) warnings.push(`Pedido OESA ${entry.orderNumber}: o PDF informa ${entry.expectedItemCount} itens, mas foram detectadas ${detected} linhas. Há divergência na leitura; confira o PDF original.`);
    if (total > prepared) warnings.push(`Pedido OESA ${entry.orderNumber}: ${total} itens no documento/detectados, ${entry.lines.length} lidos, ${prepared} preparados e ${total - prepared} não preparados. Confira os motivos no relatório; linhas não detectadas precisam ser conferidas no PDF.`);
    return { orderNumber: entry.orderNumber, total, read: entry.lines.length, prepared, rejected: total - prepared };
  });
  return { orders, warnings, summaries };
}
