import * as XLS from "@e965/xlsx";
import { sumCommissionRows, type CommissionRow } from "@/lib/network-commission";

export type CommissionExportContext = { name: string; start: string; end: string; scope: string; status: string; percent: number; sellerPercent?: number; search: string; city: string; activity: string };

export function createCommissionWorkbook(rows: CommissionRow[], allRows: CommissionRow[], context: CommissionExportContext) {
  const workbook = XLS.utils.book_new();
  const filtered = sumCommissionRows(rows), total = sumCommissionRows(allRows);
  const summary = XLS.utils.aoa_to_sheet([
    ["Relatório de comissão", context.name], ["Início", context.start], ["Fim", context.end],
    ["Carteira", context.scope], ["Situação dos pedidos", context.status], ["Comissão cadastrada (%)", context.percent],
    ["Busca", context.search || "Todas"], ["Cidade", context.city || "Todas"], ["Lojas", context.activity === "all" ? "Todas" : context.activity === "with" ? "Com pedidos" : "Sem pedidos"],
    ["Base geral da carteira", total.base], ["Comissão geral da carteira", total.commission],
    ["Base após filtros da tabela", filtered.base], ["Comissão após filtros da tabela", filtered.commission],
    ["Comissão dos vendedores - geral", total.sellerCommission], ["Comissão dos vendedores - filtrada", filtered.sellerCommission], ["Vendedor (%)", context.sellerPercent ?? "Não cadastrado"],
    ["Critério", "Percentual atual da rede sobre o valor dos pedidos do período, arredondado por loja. Bonificações não entram na base."],
  ]);
  summary["!cols"] = [{ wch: 36 }, { wch: 85 }];
  for (const row of [10, 11, 12, 13]) if (summary[`B${row}`]) summary[`B${row}`].z = '"R$" #,##0.00';
  XLS.utils.book_append_sheet(workbook, summary, "Resumo");
  const sheet = XLS.utils.aoa_to_sheet([
    ["Cliente", "Código", "Loja", "CNPJ", "Cidade", "Responsável", "Pedidos", "Base dos pedidos", "Nossa comissão (%)", "Nossa comissão (R$)", "Vendedor (%)", "Comissão vendedor (R$)"],
    ...rows.map((row) => [row.name, row.code, row.store, row.document, row.city, row.seller, row.orders, row.base, row.percent / 100, row.commission, row.sellerPercent === null ? "Não cadastrado" : row.sellerPercent / 100, row.sellerCommission ?? "Não cadastrada"]),
    ["TOTAL FILTRADO", "", "", "", "", "", filtered.orders, filtered.base, "", filtered.commission, "", filtered.sellerCommission],
  ]);
  sheet["!cols"] = [32, 15, 12, 23, 22, 27, 12, 20, 16, 20, 16, 24].map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: `A1:L${rows.length + 1}` };
  for (let index = 2; index <= rows.length + 2; index++) {
    for (const col of ["H", "J", "L"]) if (sheet[`${col}${index}`]) sheet[`${col}${index}`].z = '"R$" #,##0.00';
    if (index <= rows.length + 1) { sheet[`I${index}`].z = "0.00%"; if (typeof sheet[`K${index}`]?.v === "number") sheet[`K${index}`].z = "0.00%"; }
  }
  XLS.utils.book_append_sheet(workbook, sheet, "Comissão por loja");
  return workbook;
}

export function downloadCommissionXls(rows: CommissionRow[], allRows: CommissionRow[], context: CommissionExportContext) {
  if (rows.length > 65534) throw new Error("O formato XLS suporta até 65.534 lojas neste relatório. Reduza os filtros.");
  const workbook = createCommissionWorkbook(rows, allRows, context);
  const data = XLS.write(workbook, { bookType: "biff8", type: "array" });
  const url = URL.createObjectURL(new Blob([data], { type: "application/vnd.ms-excel" }));
  const link = document.createElement("a");
  const name = context.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  link.href = url; link.download = `comissao-${name}-${context.start}-${context.end}.xls`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
