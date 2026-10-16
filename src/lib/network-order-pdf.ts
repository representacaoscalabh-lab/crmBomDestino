import type { Bonification, Customer, Order, OrderItem, Product } from "@/lib/types";
import { getPackageValues } from "@/lib/product-packaging";

export type NetworkDocumentType = "order" | "bonification";

export type NetworkOrderPdfLine = {
  supplierCode: string;
  quantity: number;
  canceledQuantity: number;
  unitPackagePrice: number;
};

export type NetworkOrderPdf = {
  orderNumber: string;
  customerCnpj: string;
  issueDate: string;
  documentType: NetworkDocumentType;
  documentTitle: string;
  totalGrossWeight?: number;
  totalGrossValue?: number;
  lines: NetworkOrderPdfLine[];
  warnings?: string[];
};

export type NetworkOrderImportResult = {
  orders: Order[];
  warnings: string[];
};

type TextItem = {
  str: string;
  transform: number[];
  width?: number;
};

type TextLine = {
  top: number;
  items: Array<{ text: string; x: number; width?: number }>;
};

const digitsOnly = (value: string) => value.replace(/\D/g, "");
const normalizeCode = (value: string) => value.trim().toLocaleUpperCase("pt-BR");

function parsePdfNumber(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "");
  if (!cleaned) return NaN;
  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");
  const normalized = comma > dot
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  return Number(normalized);
}

function makeTextLines(items: TextItem[], pageHeight: number): TextLine[] {
  const lines: TextLine[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const top = pageHeight - item.transform[5];
    let line = lines.find((candidate) => Math.abs(candidate.top - top) < 1.5);
    if (!line) {
      line = { top, items: [] };
      lines.push(line);
    }
    line.items.push({ text: item.str.trim(), x: item.transform[4], width: item.width });
  }
  return lines
    .map((line) => ({ ...line, items: line.items.sort((left, right) => left.x - right.x) }))
    .sort((left, right) => left.top - right.top);
}

function lineText(line: TextLine) {
  return line.items.map((item) => item.text).join(" ");
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR");
}

export function classifyNetworkOrderTitle(title: string): NetworkDocumentType | null {
  // PDF fonts may emit accented letters as separate text items.
  const normalized = normalizeText(title).replace(/[^A-Z0-9]/g, "");
  if (normalized.startsWith("PEDIDODEBONIFICACAO")) return "bonification";
  if (/^PEDIDODECOMPRAS?(?:\d|$)/.test(normalized)) return "order";
  return null;
}

function readDocumentTitle(lines: TextLine[]) {
  const headerLines = lines.filter((line) => line.top < 120);
  const titleIndex = headerLines.findIndex((line) => normalizeText(lineText(line)).replace(/[^A-Z0-9]/g, "").startsWith("PEDIDO"));
  if (titleIndex < 0) return "";
  let title = "";
  for (const line of headerLines.slice(titleIndex, titleIndex + 3)) {
    if (line.top - headerLines[titleIndex].top > 20) break;
    title = `${title} ${lineText(line).replace(/\d{6,}\s*\/\s*L\b/gi, "")}`.trim();
    if (classifyNetworkOrderTitle(title)) break;
  }
  return title;
}

function readOrderNumber(lines: TextLine[]) {
  const header = lines.filter((line) => line.top < 120).map(lineText).join(" ");
  return header.match(/(\d{6,})\s*\/\s*L\b/i)?.[1] ?? "";
}

function readCustomerCnpj(lines: TextLine[], pageWidth: number) {
  const billing = lines.find((line) => /DADOS\s+PARA\s+FATURAMENTO/.test(normalizeText(lineText(line))));
  if (!billing) return "";
  const end = lines.find((line) => line.top > billing.top && /(?:ENDERECO\s+PARA|DADOS\s+PARA\s+COBRANCA)/.test(normalizeText(lineText(line))))?.top ?? billing.top + 85;
  for (const line of lines.filter((line) => line.top > billing.top && line.top < end)) {
    const right = words(line).filter((item) => item.x >= pageWidth / 2);
    const label = right.findIndex((item) => /^CNPJ:?$/i.test(item.text));
    if (label < 0) continue;
    const value = right.slice(label + 1).map((item) => item.text).join("");
    const match = value.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    if (match) return digitsOnly(match[0]);
  }
  return "";
}

function readIssueDate(lines: TextLine[]) {
  const dateLine = lines.find((line) => /DATA\s+DA\s+EMISS/.test(normalizeText(lineText(line))));
  if (!dateLine) return "";
  const text = lineText(dateLine);
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function readOrderTotalWeight(lines: TextLine[]) {
  return readLabeledNumber(lines, /PESO\s+TOTAL\s+PEDIDO/);
}

function words(line: TextLine): TextLine["items"] {
  return line.items.flatMap((item) => [...item.text.matchAll(/\S+/g)].map((match) => ({
    text: match[0],
    x: item.x + (match.index ?? 0) / item.text.length * (item.width ?? 0),
    width: match[0].length / item.text.length * (item.width ?? 0),
  })));
}

const numericField = (text: string) => /^-?\d+(?:\.\d{3})*(?:,\d+)?$/.test(text.trim());
const center = (item: TextLine["items"][number]) => item.x + (item.width ?? 0) / 2;

function readLabeledNumber(lines: TextLine[], label: RegExp) {
  const line = lines.find((candidate) => label.test(normalizeText(lineText(candidate))));
  if (!line) return undefined;
  const field = words(line).find((item) => numericField(item.text));
  const value = field ? parsePdfNumber(field.text) : NaN;
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readOrderLines(lines: TextLine[], warnings: string[] = []): NetworkOrderPdfLine[] {
  const result: NetworkOrderPdfLine[] = [];
  const costHeaderLine = lines.find((line) => line.top > 100 && words(line).some((item) => /^CUSTO$/i.test(item.text)));
  const headers = costHeaderLine ? words(costHeaderLine).filter((item) => !/^(BRUTO|ITEM|IPI|UNIT\.?)$/i.test(item.text)) : [];
  const costHeader = headers.find((item) => /^CUSTO$/i.test(item.text));
  const costIndex = costHeader ? headers.indexOf(costHeader) : -1;
  const previousHeader = headers[costIndex - 1];
  const nextHeader = headers[costIndex + 1];
  const costLeft = costHeader && previousHeader ? (center(previousHeader) + center(costHeader)) / 2 : NaN;
  const costRight = costHeader && nextHeader ? (center(costHeader) + center(nextHeader)) / 2 : NaN;
  const headerWords = lines.filter((line) => costHeaderLine && Math.abs(line.top - costHeaderLine.top) < 22).flatMap(words);
  const quantityHeader = headerWords.find((item) => /^QTDE\.?$/i.test(item.text));
  const canceledHeader = headerWords.find((item) => /^QTD\.?CANC\.?$/i.test(item.text));
  const packageHeader = headerWords.find((item) => /^EMB\.?$/i.test(item.text));
  const unitHeader = headerWords.find((item) => /^UNIT\.?$/i.test(item.text) && (!canceledHeader || item.x > canceledHeader.x));
  const sequenceHeader = headerWords.find((item) => /^SEQ\.?$/i.test(item.text));
  if (!costHeaderLine || !costHeader || !quantityHeader || !canceledHeader || !Number.isFinite(costLeft) || !Number.isFinite(costRight)) {
    warnings.push("Não foi possível identificar as colunas Qtde, Qtd.Canc. e Custo Bruto. Nenhum produto desta página foi importado; confira o PDF original.");
    return [];
  }
  const quantityGap = Math.abs(center(canceledHeader) - center(quantityHeader));
  const quantityLeft = packageHeader ? (center(quantityHeader) + center(packageHeader)) / 2 : center(quantityHeader) - quantityGap;
  const quantityRight = (center(quantityHeader) + center(canceledHeader)) / 2;
  const nextAmountHeader = headers.find((item) => item.x > canceledHeader.x && /^VALOR$/i.test(item.text));
  const amountHeader = unitHeader ?? nextAmountHeader;
  const canceledRight = amountHeader ? (center(canceledHeader) + center(amountHeader)) / 2 : center(canceledHeader) + quantityGap;
  const tableTop = costHeaderLine.top;
  const tableBottom = lines.find((line) => line.top > tableTop && /\bTOTAIS\b/.test(normalizeText(lineText(line))))?.top ?? Infinity;
  for (const line of lines) {
    if (line.top <= tableTop || line.top >= tableBottom) continue;
    const fields = words(line);
    const codeField = fields.find((item) => item.x < (sequenceHeader ? sequenceHeader.x / 2 : quantityHeader.x / 4) && /^\d{3,10}$/.test(item.text));
    if (!codeField) continue;

    const quantityField = fields.find((item) => center(item) >= quantityLeft && center(item) < quantityRight && numericField(item.text));
    const canceledField = fields.find((item) => center(item) >= quantityRight && center(item) < canceledRight && numericField(item.text));
    const grossCostField = fields.find((item) => center(item) >= costLeft && center(item) < costRight && numericField(item.text));
    const quantity = quantityField ? parsePdfNumber(quantityField.text) : NaN;
    const canceledQuantity = canceledField ? parsePdfNumber(canceledField.text) : 0;
    // Custo Bruto is the total for the line, so convert it to a package price.
    const unitPackagePrice = grossCostField && quantity > 0
      ? parsePdfNumber(grossCostField.text) / quantity
      : NaN;
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(canceledQuantity) || canceledQuantity < 0 || canceledQuantity > quantity) {
      warnings.push(`Código de produto ${codeField.text}: Qtde ou Qtd.Canc. inválida; item ignorado. Confira as quantidades no PDF.`);
      continue;
    }
    if (!Number.isFinite(unitPackagePrice) || unitPackagePrice < 0) {
      warnings.push(`Código de produto ${codeField.text}: Custo Bruto ausente, inválido ou negativo; item ignorado. Confira a coluna no PDF.`);
      continue;
    }
    result.push({
      supplierCode: codeField.text,
      quantity,
      canceledQuantity,
      unitPackagePrice,
    });
  }
  return result;
}

export function parseNetworkOrderPage(items: TextItem[], pageHeight: number, pageWidth: number) {
  const lines = makeTextLines(items, pageHeight);
  const documentTitle = readDocumentTitle(lines);
  const documentType = classifyNetworkOrderTitle(documentTitle);
  const orderNumber = readOrderNumber(lines);
  const customerCnpj = readCustomerCnpj(lines, pageWidth);
  const warnings: string[] = [];
  const orderLines = readOrderLines(lines, warnings);
  const order: NetworkOrderPdf | null = orderNumber && customerCnpj && documentType ? {
    orderNumber, customerCnpj, documentType, documentTitle,
    issueDate: readIssueDate(lines), lines: orderLines, warnings,
    totalGrossWeight: readOrderTotalWeight(lines),
    totalGrossValue: readLabeledNumber(lines, /VALOR\s+TOTAL\s+D[OE]\s+PEDIDO/),
  } : null;
  return { order, itemCount: orderLines.length, warnings, recognizedTitle: documentType !== null,
    diagnostic: { documentTitle, documentType, orderNumber, customerCnpj } };
}

export async function parseNetworkOrderPdf(
  data: Uint8Array,
  onProgress: (progress: number) => void,
): Promise<NetworkOrderPdf[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const orders = new Map<string, NetworkOrderPdf>();
  let hasText = false;
  let recognizedItems = 0;
  const fileWarnings: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const textItems = content.items
        .filter((item) => "str" in item)
        .map((item) => ({ str: item.str, transform: item.transform, width: item.width }));
      hasText ||= textItems.some((item) => item.str.trim());
      const parsed = parseNetworkOrderPage(textItems, page.view[3] - page.view[1], page.view[2] - page.view[0]);
      recognizedItems += parsed.itemCount;

      if (parsed.order) {
        const incoming = parsed.order;
        const key = `${incoming.documentType}:${incoming.orderNumber}:${incoming.customerCnpj}`;
        const previous = orders.get(key);
        const warnings = (incoming.warnings ?? []).map((warning) => `Documento ${incoming.orderNumber}, página ${pageNumber}: ${warning}`);
        orders.set(key, previous ? {
          ...previous, lines: [...previous.lines, ...incoming.lines], warnings: [...(previous.warnings ?? []), ...warnings],
          issueDate: previous.issueDate || incoming.issueDate,
          totalGrossWeight: incoming.totalGrossWeight ?? previous.totalGrossWeight,
          totalGrossValue: incoming.totalGrossValue ?? previous.totalGrossValue,
        } : { ...incoming, warnings });
      } else if (parsed.itemCount || parsed.warnings.length || parsed.recognizedTitle) {
        const detail = parsed.diagnostic;
        fileWarnings.push(`Página ${pageNumber}: documento não preparado. Título lido: ${detail.documentTitle || "não identificado"}; tipo: ${detail.documentType === "bonification" ? "bonificação" : detail.documentType === "order" ? "compra" : "não identificado"}; número: ${detail.orderNumber || "não identificado"}; CNPJ: ${detail.customerCnpj || "não identificado"}; produtos lidos: ${parsed.itemCount}. Confira o cabeçalho desta página.`);
      }
      onProgress(pageNumber / document.numPages);
    }
  } finally {
    await document.destroy();
  }

  if (![...orders.values()].some((order) => order.lines.length)) {
    if (!hasText) throw new Error("O PDF não contém texto pesquisável. Exporte o pedido original em PDF; arquivos digitalizados como imagem não podem ser lidos nesta importação.");
    if (orders.size) throw new Error(["Identifiquei o pedido e o CNPJ, mas não consegui ler os produtos com Custo Bruto. Confira se o PDF contém as colunas Cod Forn, Qtde e Custo Bruto no layout do Mart Minas.", ...[...orders.values()].flatMap((order) => order.warnings ?? [])].join("\n"));
    if (recognizedItems) throw new Error("Identifiquei produtos, mas não consegui identificar o cabeçalho do pedido ou o CNPJ da loja. Confira o número do pedido, o título e os dados de faturamento no PDF.");
    throw new Error("O PDF contém texto, mas o layout não foi reconhecido. Confira se é o PDF original de pedido ou bonificação do Mart Minas, com número do pedido, CNPJ da loja e coluna Custo Bruto.");
  }
  const result = [...orders.values()];
  result.forEach((order) => {
    order.warnings = [...fileWarnings, ...(order.warnings ?? [])];
    if (order.totalGrossValue !== undefined && !order.lines.some((line) => line.canceledQuantity > 0)) {
      const readValue = order.lines.reduce((sum, line) => sum + line.unitPackagePrice * line.quantity, 0);
      if (Math.abs(readValue - order.totalGrossValue) > 0.02) order.warnings.push(`Documento ${order.orderNumber}: a soma do Custo Bruto lido (${readValue.toFixed(2)}) difere do total do PDF (${order.totalGrossValue.toFixed(2)}). Confira os itens antes de importar.`);
    }
  });
  return result;
}

export function buildNetworkOrderImport(
  parsedOrders: NetworkOrderPdf[],
  customers: Customer[],
  products: Product[],
  existingOrders: Order[],
): NetworkOrderImportResult {
  const customersByCnpj = new Map<string, Customer[]>();
  for (const customer of customers) {
    const cnpj = digitsOnly(customer.document ?? "");
    if (cnpj) customersByCnpj.set(cnpj, [...(customersByCnpj.get(cnpj) ?? []), customer]);
  }
  const existingNumbers = new Set(existingOrders.map((order) => `${normalizeCode(order.preOrder)}:${order.customerId ?? ""}`));
  const warnings: string[] = [...new Set(parsedOrders.filter((entry) => entry.documentType === "order").flatMap((entry) => entry.warnings ?? []))];
  const orders: Order[] = [];

  for (const parsed of parsedOrders.filter((entry) => entry.documentType === "order")) {
    const customerMatches = customersByCnpj.get(digitsOnly(parsed.customerCnpj)) ?? [];
    if (customerMatches.length !== 1) {
      warnings.push(`Pedido ${parsed.orderNumber}: CNPJ ${parsed.customerCnpj} ${customerMatches.length ? "está duplicado no cadastro" : "não encontrado no cadastro"}.`);
      continue;
    }
    const [customer] = customerMatches;
    const preOrder = `${parsed.orderNumber}/L`;
    const orderIdentity = `${normalizeCode(preOrder)}:${customer.id}`;
    if (existingNumbers.has(orderIdentity) || existingNumbers.has(`${normalizeCode(preOrder)}:`)) {
      warnings.push(`Pedido ${preOrder} da loja ${customer.name}: já existe no CRM e foi ignorado.`);
      continue;
    }
    const legacyCombinedOrder = existingOrders.find((order) => order.preOrder.includes("+")
      && order.preOrder.split("+").some((number) => normalizeCode(number.replace(/\/L$/i, "")) === normalizeCode(parsed.orderNumber)));
    if (legacyCombinedOrder) {
      warnings.push(`Pedido ${preOrder}: exclua o pedido antigo combinado ${legacyCombinedOrder.preOrder} antes de importar novamente.`);
      continue;
    }

    const items = buildImportedItems(parsed, products, warnings, preOrder);
    if (!items.length) {
      warnings.push(`Pedido ${preOrder}: nenhum item cadastrado pôde ser importado.`);
      continue;
    }

    applyPdfGrossWeight(parsed, items, warnings, preOrder);

    orders.push({
      id: `${customer.id}:${preOrder}`,
      preOrder,
      issueDate: parsed.issueDate || new Date().toISOString().slice(0, 10),
      invoice: "",
      customerId: customer.id,
      customerName: customer.name,
      customerCode: customer.code,
      store: customer.store,
      customerCity: customer.city,
      paymentTerm: customer.paymentTerm ?? "",
      status: "normal",
      items,
      totalValue: Math.round(items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0) * 100) / 100,
      totalWeight: items.reduce((sum, item) => sum + item.totalWeight, 0),
    });
    existingNumbers.add(orderIdentity);
  }

  return { orders, warnings };
}

export function buildNetworkBonificationImport(
  parsedOrders: NetworkOrderPdf[],
  customers: Customer[],
  products: Product[],
  existingBonifications: Bonification[],
): { bonifications: Omit<Bonification, "id">[]; warnings: string[] } {
  const customersByCnpj = new Map<string, Customer[]>();
  for (const customer of customers) {
    const cnpj = digitsOnly(customer.document ?? "");
    if (cnpj) customersByCnpj.set(cnpj, [...(customersByCnpj.get(cnpj) ?? []), customer]);
  }
  const existingNumbers = new Set(existingBonifications.map((bonus) => normalizeCode(bonus.bonusNumber)));
  const warnings: string[] = [...new Set(parsedOrders.filter((entry) => entry.documentType === "bonification").flatMap((entry) => entry.warnings ?? []))];
  const bonifications: Omit<Bonification, "id">[] = [];

  for (const parsed of parsedOrders.filter((entry) => entry.documentType === "bonification")) {
    const customerMatches = customersByCnpj.get(digitsOnly(parsed.customerCnpj)) ?? [];
    if (customerMatches.length !== 1) {
      warnings.push(`Bonificação ${parsed.orderNumber}: CNPJ ${parsed.customerCnpj} ${customerMatches.length ? "está duplicado no cadastro" : "não encontrado no cadastro"}.`);
      continue;
    }
    const customer = customerMatches[0];
    const bonusNumber = `${parsed.orderNumber}/L`;
    if (existingNumbers.has(normalizeCode(bonusNumber))) {
      warnings.push(`Bonificação ${bonusNumber} da loja ${customer.name}: já existe e foi ignorada.`);
      continue;
    }
    const items = buildImportedItems(parsed, products, warnings, `Bonificação ${bonusNumber}`);
    if (!items.length) {
      warnings.push(`Bonificação ${bonusNumber}: nenhum produto cadastrado pôde ser importado.`);
      continue;
    }
    applyPdfGrossWeight(parsed, items, warnings, `Bonificação ${bonusNumber}`);
    bonifications.push({
      bonusNumber,
      issueDate: parsed.issueDate || new Date().toISOString().slice(0, 10),
      customerId: customer.id,
      customerName: customer.name,
      customerCode: customer.code,
      store: customer.store,
      customerCity: customer.city,
      reason: "Bonificação sem incidência de custo",
      notes: parsed.documentTitle,
      items,
      totalValue: Math.round(items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0) * 100) / 100,
      totalWeight: items.reduce((sum, item) => sum + item.totalWeight, 0),
    });
    existingNumbers.add(normalizeCode(bonusNumber));
  }
  return { bonifications, warnings };
}

function buildImportedItems(
  parsed: NetworkOrderPdf,
  products: Product[],
  warnings: string[],
  identifier: string,
): OrderItem[] {
  return parsed.lines.flatMap((line) => {
    const productMatches = products.flatMap((product) => [
      ...(normalizeCode(product.codeBox) === normalizeCode(line.supplierCode) ? [{ product, packageKind: "Caixa" as const }] : []),
      ...(product.codeHalfBox && normalizeCode(product.codeHalfBox) === normalizeCode(line.supplierCode) ? [{ product, packageKind: "Meia caixa" as const }] : []),
    ]);
    if (productMatches.length !== 1) {
      warnings.push(`${identifier}: código de fornecedor ${line.supplierCode} ${productMatches.length ? "corresponde a mais de um produto" : "não encontrado no cadastro"}; item ignorado.`);
      return [];
    }
    const [{ product, packageKind }] = productMatches;
    const packageValues = getPackageValues(product, packageKind === "Meia caixa");
    const packageQuantity = line.quantity - line.canceledQuantity;
    if (!Number.isFinite(packageQuantity) || !Number.isFinite(packageValues.unitQuantity) || packageQuantity <= 0 || packageValues.unitQuantity <= 0) {
      warnings.push(`${identifier}: quantidade inválida para o código ${line.supplierCode}; item ignorado.`);
      return [];
    }
    const packagePrice = line.unitPackagePrice;
    const totalWeight = packageValues.weight * packageQuantity;
    if (!Number.isFinite(packagePrice) || packagePrice < 0 || !Number.isFinite(totalWeight) || totalWeight < 0) {
      warnings.push(`${identifier}: código de produto ${line.supplierCode} com custo bruto ou peso inválido; item ignorado. Confira o PDF e o cadastro do produto.`);
      return [];
    }
    return [{
      productId: product.id,
      productCode: line.supplierCode,
      description: product.description,
      packageKind,
      packageQuantity,
      unitQuantity: packageValues.unitQuantity * packageQuantity,
      packagePrice,
      unitPrice: packagePrice / packageValues.unitQuantity,
      totalWeight,
      discountPercent: 0,
      subtotal: Math.round(packagePrice * packageQuantity * 100) / 100,
      boxQuantity: packageQuantity,
      pieces: packageValues.unitQuantity * packageQuantity,
      netWeight: 0,
      grossWeight: totalWeight,
    }];
  });
}

function applyPdfGrossWeight(parsed: NetworkOrderPdf, items: OrderItem[], warnings: string[], identifier: string) {
  const catalogWeight = items.reduce((sum, item) => sum + item.totalWeight, 0);
  if (parsed.totalGrossWeight !== undefined && catalogWeight > 0 && items.length === parsed.lines.length) {
    const weightScale = parsed.totalGrossWeight / catalogWeight;
    let remainingWeight = parsed.totalGrossWeight;
    items.forEach((item, index) => {
      item.totalWeight = index === items.length - 1
        ? remainingWeight
        : Math.round(item.totalWeight * weightScale * 1000) / 1000;
      remainingWeight -= item.totalWeight;
      item.grossWeight = item.totalWeight;
    });
  } else if (parsed.totalGrossWeight !== undefined && items.length !== parsed.lines.length) {
    warnings.push(`${identifier}: nem todos os itens foram reconhecidos; o peso bruto considera somente os produtos importados.`);
  }
}
