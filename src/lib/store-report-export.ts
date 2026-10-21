import * as XLS from "@e965/xlsx";
import type { StoreProductReport } from "./store-products";
import type { buildStoreGrowth } from "./store-growth";

type Cell = string | number | null;
export function createReportWorkbook(title: string, context: [string, Cell][], headers: string[], rows: Cell[][], moneyColumns: number[] = [], percentColumns: number[] = []) {
  if (rows.length > 65534) throw new Error("O XLS suporta até 65.534 linhas. Reduza os filtros antes de exportar.");
  const book = XLS.utils.book_new();
  const summary = XLS.utils.aoa_to_sheet([[title], ...context]);
  summary["!cols"] = [{ wch: 32 }, { wch: 100 }];
  XLS.utils.book_append_sheet(book, summary, "Resumo");
  const sheet = XLS.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = headers.map(header => ({ wch: /Cliente|Produto|Situação/.test(header) ? 36 : 22 }));
  sheet["!autofilter"] = { ref: XLS.utils.encode_range({ r: 0, c: 0 }, { r: rows.length, c: headers.length - 1 }) };
  for (let row = 1; row <= rows.length; row++) {
    moneyColumns.forEach(col => { const cell = sheet[XLS.utils.encode_cell({ r: row, c: col })]; if (cell && typeof cell.v === "number") cell.z = '"R$" #,##0.00'; });
    percentColumns.forEach(col => { const cell = sheet[XLS.utils.encode_cell({ r: row, c: col })]; if (cell && typeof cell.v === "number") cell.z = '[Green]0.00%;[Red]-0.00%;[Color6]0.00%'; });
  }
  XLS.utils.book_append_sheet(book, sheet, "Detalhamento");
  return book;
}
export function downloadReportXls(book: XLS.WorkBook, filename: string) {
  const data = XLS.write(book, { bookType: "biff8", type: "array" });
  const url = URL.createObjectURL(new Blob([data], { type: "application/vnd.ms-excel" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function createGrowthWorkbook(rows: ReturnType<typeof buildStoreGrowth>["rows"], months: string[], start: string, end: string, scope: string, search: string) {
  return createReportWorkbook("Crescimento por loja", [["De", start], ["Até", end], ["Responsável", scope], ["Busca", search || "Todas"], ["Meses de comparação", months.join(", ") || "Inativos"], ["Critério", "Crescimento por peso, usando a média somente dos meses ativos. Sem base anterior, o percentual fica vazio."]], ["Cliente", "Código", "Loja", "Cidade", "CNPJ", "Responsável", ...months.map(month => `${month} (kg)`), "Média (kg)", "Peso atual (kg)", "Diferença (kg)", "Crescimento (%)", "Média financeira", "Valor atual"], rows.map(row => [row.name, row.code, row.store, row.city, row.document, row.seller || "WRRJ", ...row.history, row.hasComparison ? row.average : null, row.weight, row.hasComparison ? row.delta : null, row.growth === null ? null : row.growth / 100, row.hasComparison ? row.averageRevenue : null, row.revenue]), [10 + months.length, 11 + months.length], [9 + months.length]);
}
export function createProductsWorkbook(report: StoreProductReport, rows: StoreProductReport["rows"], scope: string, filters: string) {
  const book = createReportWorkbook("Produtos por loja", [["Mês", report.month], ["De", report.start], ["Até", report.end], ["Responsável", scope], ["Filtros", filters], ["Comparação", report.hasComparison ? `${report.previousMonth}-01 a ${report.previousEnd}` : "Sem mês anterior desde outubro de 2026"], ["Quantidade", "Unidades individuais dos itens; caixa e meia caixa consolidadas pelo produto. Pedidos normais; bonificações fora da base."], ["Situação", "Sem recompra significa ausência de pedido até a data final, não comprova interrupção definitiva nem consumo/estoque da loja."]], ["Cliente", "Código cliente", "Loja", "Cidade", "CNPJ", "Responsável", "Produto", "Código produto", ...report.historyMonths.map(month => `${month} (un. mês completo)`), "Anterior comparável (un.)", "Atual (un.)", "Diferença (un.)", "Crescimento (%)", "Situação", "Peso atual (kg)", "Valor anterior", "Valor atual", "Última compra registrada"], rows.map(row => [row.customer, row.code, row.store, row.city, row.document, row.responsible, row.product, row.productCode, ...row.history, report.hasComparison ? row.previous : null, row.quantity, report.hasComparison ? row.delta : null, row.growth === null ? null : row.growth / 100, row.state, row.weight, report.hasComparison ? row.previousRevenue : null, row.revenue, row.lastPurchase]), [14 + report.historyMonths.length, 15 + report.historyMonths.length], [11 + report.historyMonths.length]);
  const stores = new Map<string, { name: string; code: string; store: string; quantity: number; revenue: number; mix: number }>();
  rows.forEach(row => { const store = stores.get(row.customerId) ?? { name: row.customer, code: row.code, store: row.store, quantity: 0, revenue: 0, mix: 0 }; store.quantity += row.quantity; store.revenue += row.revenue; if (row.quantity > 0) store.mix++; stores.set(row.customerId, store); });
  const sheet = XLS.utils.aoa_to_sheet([["Cliente", "Código", "Loja", "Unidades", "Valor", "Produtos com compra"], ...[...stores.values()].map(store => [store.name, store.code, store.store, store.quantity, store.revenue, store.mix])]);
  sheet["!cols"] = [36, 18, 18, 18, 22, 24].map(wch => ({ wch }));
  for (let row = 2; row <= stores.size + 1; row++) if (sheet[`E${row}`]) sheet[`E${row}`].z = '\"R$\" #,##0.00';
  sheet["!autofilter"] = { ref: `A1:F${stores.size + 1}` };
  XLS.utils.book_append_sheet(book, sheet, "Resumo por loja");
  // BIFF8 supports 256 columns: split wide product matrices into readable blocks.
  const productList = [...new Map(rows.map(row => [row.productId, { id: row.productId, name: `${row.productCode} - ${row.product}` }])).values()];
  const quantities = new Map<string, Map<string, number>>();
  const responsibility = new Map<string, string>();
  rows.forEach(row => {
    let values = quantities.get(row.customerId);
    if (!values) { values = new Map(); quantities.set(row.customerId, values); }
    values.set(row.productId, row.quantity);
    responsibility.set(row.customerId, row.responsible);
  });
  for (let offset = 0; offset < productList.length; offset += 200) {
    const block = productList.slice(offset, offset + 200);
    const matrix = XLS.utils.aoa_to_sheet([["Cliente", "Código", "Loja", "Responsável", ...block.map(product => `${product.name} (un.)`)], ...[...stores.entries()].map(([id, store]) => [store.name, store.code, store.store, responsibility.get(id) ?? "", ...block.map(product => quantities.get(id)?.get(product.id) ?? null)])]);
    matrix["!cols"] = [36, 18, 18, 20, ...block.map(() => 28)].map(wch => ({ wch }));
    matrix["!autofilter"] = { ref: XLS.utils.encode_range({ r: 0, c: 0 }, { r: stores.size, c: block.length + 3 }) };
    XLS.utils.book_append_sheet(book, matrix, productList.length <= 200 ? "Quantidades por loja" : `Quantidades ${offset / 200 + 1}`);
  }
  return book;
}
import type { NetworkProductRow } from "./network-products";

export function createNetworkProductsWorkbook(rows: NetworkProductRow[], start: string, end: string, scope: string, filters: string, networkName = "Mart Minas") {
  const book = createReportWorkbook(`Produtos ${networkName}`, [["De", start], ["Até", end], ["Responsável", scope], ["Filtros", filters], ["Preço unitário", "Bruto do último pedido até a data final; média ponderada pelas unidades quando há mais de uma linha no mesmo pedido."], ["Totais", "Somente pedidos do período selecionado, após descontos dos itens. Amostras e bonificações fora da base."], ["Caixas", "Caixas e meias caixas em colunas separadas, sem conversão de embalagem."]], ["Código", "Produto", "Preço unitário último pedido", "Valor total no período", "Peso (kg)", "Caixas", "Meias caixas", "Unidades", "Lojas com compra", "Pedidos", "Data último pedido", "Número último pedido", "Valor no último pedido", "Unidades último pedido", "Peso último pedido (kg)", "Último cliente", "Última loja"], rows.map(row => [row.code, row.name, row.lastUnitPrice, row.value, row.weight, row.boxes, row.halfBoxes, row.units, row.stores, row.orders, row.lastDate, row.lastOrder, row.lastDate ? row.lastValue : null, row.lastDate ? row.lastUnits : null, row.lastDate ? row.lastWeight : null, row.lastCustomer, row.lastStore]), [2, 3, 12]);
  for (let row = 2; row <= rows.length + 1; row++) if (typeof book.Sheets.Detalhamento[`C${row}`]?.v === "number") book.Sheets.Detalhamento[`C${row}`].z = '\"R$\" #,##0.0000';
  return book;
}
