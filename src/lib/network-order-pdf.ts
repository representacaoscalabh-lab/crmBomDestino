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
  lines: NetworkOrderPdfLine[];
};

export type NetworkOrderImportResult = {
  orders: Order[];
  warnings: string[];
};

type TextItem = {
  str: string;
  transform: number[];
};

type TextLine = {
  top: number;
  items: Array<{ text: string; x: number }>;
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
    line.items.push({ text: item.str.trim(), x: item.transform[4] });
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
  const normalized = normalizeText(title);
  if (/BONIFICACAO/.test(normalized)) return "bonification";
  if (/PEDIDO\s+DE\s+COMPRAS?/.test(normalized)) return "order";
  return null;
}

function readDocumentTitle(lines: TextLine[]) {
  return lines.filter((line) => line.top < 55).map(lineText).join(" ").trim();
}

function readOrderNumber(lines: TextLine[]) {
  const header = lines.filter((line) => line.top < 45).map(lineText).join(" ");
  return header.match(/(\d{6,})\s*\/\s*L\b/i)?.[1] ?? "";
}

function readCustomerCnpj(lines: TextLine[]) {
  const cnpjLine = lines.find((line) => line.top >= 65 && line.top <= 95
    && line.items.some((item) => item.x >= 625 && item.x <= 665 && /CNPJ/i.test(item.text)));
  if (!cnpjLine) return "";
  const value = cnpjLine.items.filter((item) => item.x >= 680).map((item) => item.text).join("");
  const match = digitsOnly(value).match(/\d{14}/);
  return match?.[0] ?? "";
}

function readIssueDate(lines: TextLine[]) {
  const dateLine = lines.find((line) => line.top >= 300 && line.top <= 400
    && line.items.some((item) => /Data da emiss/i.test(item.text)));
  if (!dateLine) return "";
  const text = lineText(dateLine);
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function readOrderTotalWeight(lines: TextLine[]) {
  const totalLine = lines.find((line) => line.items.some((item) => /Peso total pedido/i.test(item.text)));
  if (!totalLine) return undefined;
  const value = totalLine.items.filter((item) => item.x >= 100).map((item) => item.text).join(" ");
  const weight = parsePdfNumber(value);
  return Number.isFinite(weight) && weight > 0 ? weight : undefined;
}

function readOrderLines(lines: TextLine[]): NetworkOrderPdfLine[] {
  const result: NetworkOrderPdfLine[] = [];
  for (const line of lines) {
    if (line.top < 195 || line.top > 455) continue;
    const codeField = line.items.find((item) => item.x < 45 && /^\d{3,10}$/.test(item.text));
    if (!codeField) continue;

    const quantityField = line.items.find((item) => item.x >= 270 && item.x < 310 && /[\d]/.test(item.text));
    const canceledField = line.items.find((item) => item.x >= 310 && item.x < 380 && /[\d]/.test(item.text));
    const unitPriceField = line.items.find((item) => item.x >= 375 && item.x < 425 && /[\d]/.test(item.text));
    const quantity = quantityField ? parsePdfNumber(quantityField.text) : NaN;
    const canceledQuantity = canceledField ? parsePdfNumber(canceledField.text) : 0;
    const unitPackagePrice = unitPriceField ? parsePdfNumber(unitPriceField.text) : NaN;
    if (!Number.isFinite(quantity) || !Number.isFinite(canceledQuantity) || !Number.isFinite(unitPackagePrice)) continue;
    result.push({
      supplierCode: codeField.text,
      quantity,
      canceledQuantity,
      unitPackagePrice,
    });
  }
  return result;
}

export async function parseNetworkOrderPdf(
  data: Uint8Array,
  onProgress: (progress: number) => void,
): Promise<NetworkOrderPdf[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const orders = new Map<string, NetworkOrderPdf>();
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const textItems = content.items
        .filter((item) => "str" in item)
        .map((item) => ({ str: item.str, transform: item.transform }));
      const lines = makeTextLines(textItems, page.view[3] - page.view[1]);
      const pageTitle = readDocumentTitle(lines);
      const orderNumber = readOrderNumber(lines);
      const customerCnpj = readCustomerCnpj(lines);
      const orderLines = readOrderLines(lines);
      const totalGrossWeight = readOrderTotalWeight(lines);
      const documentType = classifyNetworkOrderTitle(pageTitle);

      if (orderNumber && customerCnpj && documentType) {
        const key = `${documentType}:${orderNumber}:${customerCnpj}`;
        const order = orders.get(key) ?? {
          orderNumber,
          customerCnpj,
          issueDate: readIssueDate(lines),
          documentType,
          documentTitle: pageTitle,
          lines: [],
        };
        order.lines.push(...orderLines);
        if (!order.issueDate) order.issueDate = readIssueDate(lines);
        if (totalGrossWeight !== undefined) order.totalGrossWeight = totalGrossWeight;
        orders.set(key, order);
      }
      onProgress(pageNumber / document.numPages);
    }
  } finally {
    await document.destroy();
  }

  if (![...orders.values()].some((order) => order.lines.length)) {
    throw new Error("Não encontrei pedidos nesse PDF. Confira se o arquivo contém pedidos de compra em formato pesquisável.");
  }
  return [...orders.values()];
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
  const warnings: string[] = [];
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
      totalValue: items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0),
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
  const warnings: string[] = [];
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
      totalValue: items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0),
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
    if (packageQuantity <= 0 || packageValues.unitQuantity <= 0) {
      warnings.push(`${identifier}: quantidade inválida para o código ${line.supplierCode}; item ignorado.`);
      return [];
    }
    const packagePrice = line.unitPackagePrice;
    const totalWeight = packageValues.weight * packageQuantity;
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
