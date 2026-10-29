import type { NetworkOrderPdf } from "@/lib/network-order-pdf";
import type { Bonification, Customer, Order, Product } from "@/lib/types";

/** Account for every document, including skipped ones; keep kg and boxes distinct. */
export function networkImportReview(parsed: NetworkOrderPdf[], orders: Order[], bonuses: Omit<Bonification, "id">[], warnings: string[], customers: Customer[], products: Product[]) {
  let ready = 0, duplicates = 0, blocked = 0;
  const documents = parsed.map((document) => {
    const number = `${document.orderNumber}/L`;
    const customerIds = new Set(customers.filter((customer) => customer.document?.replace(/\D/g, "") === document.customerCnpj).map((customer) => customer.id));
    const prepared = document.documentType === "order"
      ? orders.find((order) => order.preOrder === number && customerIds.has(order.customerId))
      : bonuses.find((bonus) => bonus.bonusNumber === number && customerIds.has(bonus.customerId));
    const reasons = [...new Set([...(document.warnings ?? []), ...warnings.filter((warning) => warning.includes(document.orderNumber))])];
    const duplicate = !prepared && reasons.some((reason) => reason.includes("já existe"));
    const status = prepared ? "PRONTO" : duplicate ? "JÁ EXISTE NO CRM" : "BLOQUEADO";
    if (prepared) ready += 1;
    else if (duplicate) duplicates += 1;
    else blocked += 1;
    const lines = document.lines.map((line) => {
      const item = prepared?.items.find((item) => item.productCode === line.supplierCode);
      const code = line.supplierCode.trim().toUpperCase();
      const product = products.find((product) => [product.codeBox, product.codeHalfBox].some((value) => value?.trim().toUpperCase() === code));
      const weight = product ? product.weightPerBox / (product.codeHalfBox?.trim().toUpperCase() === code ? 2 : 1) : undefined;
      return `  Produto ${line.supplierCode}: Emb ${line.measure ?? "CX"}; Qtde PDF ${line.quantity}; cancelada ${line.canceledQuantity}${line.measure === "KG" ? `; peso cadastrado por embalagem ${weight ?? "não cadastrado"} kg` : ""}; caixas CRM ${item ? item.boxQuantity ?? item.packageQuantity : "não preparado"}`;
    });
    return [
      `${number} | ${document.documentType === "order" ? "Compra" : "Bonificação"} | CNPJ ${document.customerCnpj} | ${status}`,
      `  Páginas: ${document.sourcePages?.join(", ") || "não informadas"}; linhas de produtos: ${document.lines.length}; total PDF: ${document.totalGrossValue ?? "não identificado"}`,
      ...lines,
      ...reasons.map((reason) => `  Motivo: ${reason}`),
      ...(document.notices ?? []).map((notice) => `  Informação: ${notice}`),
    ].join("\n");
  });
  return [`Documentos identificados: ${parsed.length} | Prontos: ${ready} | Já existentes: ${duplicates} | Bloqueados: ${blocked}`, ...documents].join("\n\n");
}
