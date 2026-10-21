import * as XLS from "@e965/xlsx";
import { sumCommissionRows, type CommissionRow } from "@/lib/network-commission";

export type CommissionExportContext = { name: string; start: string; end: string; scope: string; status: string; percent: number; sellerPercent?: number; search: string; city: string; activity: string };

export function createCommissionWorkbook(_rows: CommissionRow[], allRows: CommissionRow[], context: CommissionExportContext) {
  const total = sumCommissionRows(allRows);
  const partial = allRows.some(row => row.orders > 0 && row.sellerCommission === null);
  const summary = [
    ["RELATÓRIO DE COMISSÃO POR LOJA", context.name],
    ["De", context.start, "Até", context.end],
    ["Responsáveis", "WRRJ e Sul de Minas · Todas as lojas da rede"],
    ["Percentual WRRJ", context.percent / 100, "Percentual Sul de Minas", context.sellerPercent === undefined ? "Não cadastrado" : context.sellerPercent / 100],
    ["Base total dos pedidos", total.base],
    ["Pedidos", total.orders, "Lojas", total.stores],
    ["Comissão WRRJ", total.commission],
    ["Comissão Sul de Minas", partial ? "Parcial: percentual não cadastrado" : total.sellerCommission],
    ["Comissão total calculada", (Math.round(total.commission * 100) + Math.round(total.sellerCommission * 100)) / 100],
    ["Abrangência", "Todas as lojas no período. Busca, cidade, movimentação e responsável da tela não limitam o XLS."],
    ["Critério", "Comissão exclusiva de quem atende a loja. Amostras e bonificações fora da base."],
    [],
    ["DETALHAMENTO POR LOJA"],
  ];
  const headerRow = summary.length;
  if (allRows.length + headerRow + 2 > 65536) throw new Error("O XLS excede o limite de 65.536 linhas com o resumo. Reduza o número de lojas.");
  const sheet = XLS.utils.aoa_to_sheet([
    ...summary,
    ["Cliente", "Código", "Loja", "CNPJ", "Cidade", "Responsável", "Pedidos", "Base dos pedidos", "WRRJ (%)", "Comissão WRRJ (R$)", "Sul de Minas (%)", "Comissão Sul de Minas (R$)"],
    ...allRows.map(row => [row.name, row.code, row.store, row.document, row.city, row.seller === "Representação WRRJ" || !row.seller ? "WRRJ" : "Sul de Minas", row.orders, row.base, row.percent / 100, row.commission, row.sellerPercent === null ? "Não cadastrado" : row.sellerPercent / 100, row.sellerCommission ?? "Não cadastrada"]),
    ["TOTAL GERAL", "", "", "", "", "", total.orders, total.base, "", total.commission, "", total.sellerCommission],
  ]);
  sheet["!cols"] = [34, 19, 24, 24, 25, 24, 14, 22, 17, 24, 21, 28].map(wch => ({ wch }));
  sheet["!autofilter"] = { ref: `A${headerRow + 1}:L${headerRow + allRows.length + 1}` };
  sheet["!merges"] = [0, 9, 10, 12].map(row => ({ s: { r: row, c: row === 9 || row === 10 ? 1 : 0 }, e: { r: row, c: row === 0 ? 8 : 11 } }));
  // Keep the title separate from the network name when the cells are merged.
  sheet.A1.v = `RELATÓRIO DE COMISSÃO · ${context.name}`;
  delete sheet.B1;
  for (const address of ["B5", "B7", "B8", "B9"]) if (typeof sheet[address]?.v === "number") sheet[address].z = '"R$" #,##0.00';
  for (const address of ["B4", "D4"]) if (typeof sheet[address]?.v === "number") sheet[address].z = "0.00%";
  for (let index = headerRow + 2; index <= headerRow + allRows.length + 2; index++) {
    for (const col of ["H", "J", "L"]) if (typeof sheet[`${col}${index}`]?.v === "number") sheet[`${col}${index}`].z = '"R$" #,##0.00';
    if (index <= headerRow + allRows.length + 1) for (const col of ["I", "K"]) if (typeof sheet[`${col}${index}`]?.v === "number") sheet[`${col}${index}`].z = "0.00%";
  }
  const workbook = XLS.utils.book_new();
  XLS.utils.book_append_sheet(workbook, sheet, "Comissão por loja");
  return workbook;
}

export function downloadCommissionXls(rows: CommissionRow[], allRows: CommissionRow[], context: CommissionExportContext) {
  const workbook = createCommissionWorkbook(rows, allRows, context);
  const data = XLS.write(workbook, { bookType: "biff8", type: "array" });
  const url = URL.createObjectURL(new Blob([data], { type: "application/vnd.ms-excel" }));
  const link = document.createElement("a");
  const name = context.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  link.href = url; link.download = `comissao-${name}-${context.start}-${context.end}.xls`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
