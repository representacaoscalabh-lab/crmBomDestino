import ExcelJS from "exceljs";
import { variation, type MartMinasAnalytics } from "./mart-minas-analytics";

export function createMartMinasWorkbook(report: MartMinasAnalytics, groupName: string, scope: string, status: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CRM Bom Destino";
  const pct = (current: number, previous: number) => report.hasPrevious ? variation(current, previous) ?? "Sem base" : "Sem histórico";
  const previous = (value: number) => report.hasPrevious ? value : "Sem histórico";
  const average = (value: number) => report.averageCount ? value : "Sem histórico";
  function sheet(name: string, headers: string[], rows: (string | number)[][]) {
    const ws = workbook.addWorksheet(name);
    ws.addRow(headers);
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF722F37" } };
    ws.columns = headers.map((header, index) => ({ width: index === 0 ? 34 : Math.min(32, Math.max(16, header.length + 3)) }));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, ws.rowCount), column: headers.length } };
    ws.eachRow((row, index) => {
      if (index === 1) return;
      row.eachCell((cell) => { if (typeof cell.value === "number") cell.numFmt = "#,##0.00"; });
    });
  }
  sheet("Resumo", ["Indicador", "Valor", "Contexto"], [
    ["Rede", groupName, ""], ["Carteira", scope, "Responsável atual de cada loja"],
    ["Pedidos", status, "Bonificações separadas dos pedidos"],
    ["Início", report.currentPeriod.start, ""], ["Fim", report.currentPeriod.end, report.custom ? `Intervalos consecutivos de ${report.duration} dias` : report.cutoff ? `Comparações até o dia ${report.cutoff}, limitado ao fim do mês` : "Meses completos"],
    ["Kg atuais", report.current.weight, ""], ["Kg anteriores", previous(report.previous.weight), ""],
    ["Variação %", pct(report.current.weight, report.previous.weight), "Sem base quando anterior não é positivo"],
    ["Média recente kg", average(report.average), `${report.averageCount} período(s) disponível(is) desde ${report.trackingStart}`],
    ["Vs. média %", pct(report.current.weight, report.average), ""],
    ["Valor dos pedidos", report.current.revenue, "Não comprova faturamento ou recebimento"],
    ["Pedidos", report.current.orders, ""], ["Lojas com compra", report.current.activeStores, ""],
    ["Lojas cadastradas", report.members.length, ""], ["Sem recompra", report.lost.length, "Compraram no período anterior"],
    ["Retomadas", report.resumed.length, "Ausentes no período anterior, com compra antiga registrada"],
    ["Primeiras compras registradas", report.first.length, "Não comprova cliente novo"],
    ["Mesmas lojas: kg atuais", report.sameStores.current, `${report.sameStores.count} lojas com compra nos dois períodos`],
    ["Mesmas lojas: kg anteriores", report.sameStores.previous, ""],
    ...(report.previousYearPeriod.start >= report.trackingStart ? [["Mesmo período do ano anterior kg", report.previousYear.weight, `${report.previousYearPeriod.start} a ${report.previousYearPeriod.end}`]] : []),
    ["Bonificações kg", report.bonus.weight, "Somente a carteira selecionada"],
    ["Bonificações valor de referência", report.bonus.revenue, "Não soma às vendas"],
    ["Qualidade dos dados", "Ausência de registros não comprova ausência de compras", "Confira as importações antes de interpretar quedas"],
  ]);
  sheet("Evolução", ["Mês", "Início", "Fim", "Kg", "Valor", "Pedidos", "Lojas com compra", "Mix"], report.monthly.map((row) => [row.period.month, row.period.start, row.period.end, row.weight, row.revenue, row.orders, row.activeStores, row.mix]));
  sheet("Lojas", ["Loja", "Código", "Número loja", "Cidade", "Responsável", "Situação", ...report.periods.map((period) => `${period.start} a ${period.end} kg`), "Diferença kg", "Variação %", "Média recente kg", "Vs. média %", "Valor", "Pedidos", "Mix", "Última compra", "Dias sem comprar", "Intervalo habitual dias", "Acima do habitual"], report.stores.map((row) => [row.customer.name, row.customer.code, row.customer.store, row.customer.city, row.seller || "Representação WRRJ", row.state, ...row.history.map((item) => item.weight), previous(row.delta), pct(row.current.weight, row.previous.weight), average(row.average), pct(row.current.weight, row.average), row.current.revenue, row.current.orders, row.current.mix, row.lastPurchase, row.daysSince ?? "Sem histórico", row.usualGap ?? "Histórico insuficiente", row.overdue ? "Sim" : "Não"]));
  sheet("Produtos", ["Produto", "Código", "Kg atuais", "Kg anteriores", "Diferença kg", "Variação %", "Média recente kg", "Vs. média %", "Valor", "Unidades", "Participação kg %", "Lojas compradoras", "Lojas anteriores", "Lojas sem recompra"], report.products.map((row) => [row.name, row.code, row.current, previous(row.previous), previous(row.delta), pct(row.current, row.previous), average(row.average), pct(row.current, row.average), row.revenue, row.units, row.share, row.stores, row.previousStores, row.lostStores.map((id) => { const customer = report.members.find((item) => item.id === id); return `${customer?.name} · Loja ${customer?.store || customer?.code}`; }).join("; ")]));
  sheet("Produtos por loja", ["Loja", "Código loja", "Número loja", "Responsável", "Produto", "Código produto", "Kg atuais", "Kg anteriores", "Diferença kg", "Variação %", "Média recente kg", "Valor", "Unidades"], report.stores.flatMap((store) => store.products.map((row) => [store.customer.name, store.customer.code, store.customer.store, store.seller || "Representação WRRJ", row.name, row.code, row.current, previous(row.previous), previous(row.delta), pct(row.current, row.previous), average(row.average), row.revenue, row.units])));
  const sellerById = new Map(report.stores.map((store) => [store.customer.id, store.seller || "Representação WRRJ"]));
  sheet("Pedidos", ["Pedido", "Emissão", "Cliente", "Código", "Loja", "Responsável", "Situação", "Peso kg", "Valor"], report.currentOrders.map((order) => [order.preOrder, order.issueDate, order.customerName, order.customerCode, order.store, sellerById.get(order.customerId)!, order.status === "normal" ? "Normal" : "Em carteira", order.totalWeight, order.totalValue]));
  sheet("Bonificações", ["Controle", "Emissão", "Cliente", "Código", "Loja", "Responsável", "Motivo", "Peso kg", "Valor de referência"], report.bonifications.map((bonus) => [bonus.bonusNumber, bonus.issueDate, bonus.customerName, bonus.customerCode, bonus.store, sellerById.get(bonus.customerId)!, bonus.reason, bonus.totalWeight, bonus.totalValue]));
  sheet("Responsáveis", ["Responsável", "Pedidos", "Peso kg", "Valor", "Abrangência"], report.sellerTotals.map((row) => [row.seller || "Representação WRRJ", row.orders, row.weight, row.revenue, scope]));
  return workbook;
}

export async function downloadMartMinasReport(report: MartMinasAnalytics, groupName: string, scope: string, status: string) {
  const buffer = await createMartMinasWorkbook(report, groupName, scope, status).xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url; link.download = `mart-minas-${report.currentPeriod.start}-${report.currentPeriod.end}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
