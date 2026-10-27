import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const nodeRequire = createRequire(import.meta.url);

const source = fs.readFileSync(new URL("../src/lib/mart-minas-analytics.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function("exports", output)(exports);
const { buildMartMinasAnalytics: build, monthPeriod, shiftMonth, variation, saoPauloToday } = exports;
const group = { id: "g1", name: "Mart Minas", externalStoreSellers: { c2: "Ana" } };
const customers = ["c1", "c2", "c3"].map((id) => ({ id, code: id, name: `Loja ${id}`, store: id, city: "BH", status: "Ativo", groupId: "g1" }));
function order(id, customerId, issueDate, weight, extra = {}) {
  return { id, preOrder: id, customerId, issueDate, totalWeight: weight, totalValue: weight * 10, status: "normal", items: [{ productId: "p1", productCode: "CX", description: "Queijo", totalWeight: weight, unitQuantity: weight * 2, packagePrice: weight * 10, packageQuantity: 1, subtotal: weight * 10 }], ...extra };
}
function report(orders, extra = {}) {
  return build({ group, customers, orders, bonifications: [], month: "2026-10", today: "2026-10-16", scope: "ours", status: "normal", historyMonths: 6, trackingStart: "2000-01-01", ...extra });
}

test("mês parcial compara os mesmos dias e a média dos três períodos anteriores", () => {
  const result = report([
    order("jul", "c1", "2026-07-10", 30), order("ago", "c1", "2026-08-10", 60),
    order("set", "c1", "2026-09-10", 90), order("set-tarde", "c1", "2026-09-25", 1000),
    order("out", "c1", "2026-10-10", 45), order("futuro", "c1", "2026-10-20", 2000),
  ]);
  assert.equal(result.current.weight, 45);
  assert.equal(result.previous.weight, 90);
  assert.equal(result.average, 60);
  assert.equal(result.currentPeriod.end, "2026-10-16");
  assert.equal(result.periods.at(-2).end, "2026-09-16");
  assert.equal(result.products[0].current, 45);
  assert.equal(result.stores.find((row) => row.customer.id === "c1").lastPurchase, "2026-10-10");
});

test("carteiras separam pedidos, produtos e bonificações sem alterar o total da rede", () => {
  const orders = [order("a", "c1", "2026-10-02", 20), order("b", "c2", "2026-10-02", 80)];
  const bonifications = [{ id: "b1", customerId: "c1", issueDate: "2026-10-02", totalWeight: 2, totalValue: 20 }, { id: "b2", customerId: "c2", issueDate: "2026-10-02", totalWeight: 8, totalValue: 80 }];
  const ours = report(orders, { bonifications });
  const external = report(orders, { bonifications, scope: "external" });
  const seller = report(orders, { bonifications, scope: "seller:Ana" });
  const all = report(orders, { bonifications, scope: "all" });
  assert.equal(ours.current.weight, 20); assert.equal(ours.bonus.weight, 2);
  assert.equal(external.current.weight, 80); assert.equal(external.bonus.weight, 8);
  assert.equal(seller.current.weight, 80); assert.equal(all.current.weight, 100);
  assert.equal(all.bonus.weight, 10); assert.equal(ours.products[0].current, 20);
  assert.equal(ours.sellerTotals.reduce((total, row) => total + row.weight, 0), 20);
  assert.equal(ours.sellerTotals.length, 1);
  assert.equal(all.sellerTotals.reduce((total, row) => total + row.weight, 0), 100);
});

test("lojas sem pedidos entram no relatório e lojas de fora da rede não entram", () => {
  const result = report([order("a", "c1", "2026-09-01", 100), order("fora", "x", "2026-10-02", 999)]);
  assert.equal(result.stores.length, 2);
  const lost = result.stores.find((row) => row.customer.id === "c1");
  assert.equal(lost.state, "Sem recompra"); assert.equal(lost.delta, -100);
  assert.equal(result.lost.length, 1); assert.equal(result.current.weight, 0);
  assert.equal(result.stores.find((row) => row.customer.id === "c3").daysSince, null);
});

test("produtos consolidam caixa e meia caixa pelo id e identificam lojas sem recompra", () => {
  const half = order("b", "c1", "2026-10-02", 5);
  half.items[0].productCode = "MEIA";
  const result = report([order("a", "c1", "2026-09-02", 30), half, order("c", "c1", "2026-10-03", 10), order("d", "c3", "2026-09-02", 20)]);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].current, 15);
  assert.equal(result.products[0].previous, 50);
  assert.equal(result.products[0].delta, -35);
  assert.equal(result.products[0].lostStores.join(","), "c3");
  assert.equal(result.current.mix, 1);
});

test("retomadas, primeiras compras e mesmas lojas são separadas", () => {
  const result = report([order("a", "c1", "2026-08-02", 10), order("b", "c1", "2026-10-02", 20), order("c", "c3", "2026-10-02", 30)]);
  assert.equal(result.resumed.length, 1); assert.equal(result.first.length, 1);
  assert.equal(result.sameStores.count, 0);
  const retained = report([order("a", "c1", "2026-09-02", 100), order("b", "c1", "2026-10-02", 80), order("c", "c3", "2026-10-02", 50)]);
  assert.equal(retained.sameStores.current, 80); assert.equal(retained.sameStores.previous, 100);
});

test("mediana de frequência exige quatro datas e não usa pedidos futuros", () => {
  const result = report(["01", "06", "11", "16"].map((day) => order(day, "c1", `2026-09-${day}`, 1)).concat(order("futuro", "c1", "2026-11-01", 100)));
  const store = result.stores.find((row) => row.customer.id === "c1");
  assert.equal(store.usualGap, 5); assert.equal(store.daysSince, 30); assert.equal(store.overdue, true);
  const short = report([order("a", "c1", "2026-09-01", 1)]).stores.find((row) => row.customer.id === "c1");
  assert.equal(short.usualGap, null); assert.equal(short.overdue, false);
});

test("comparação anual, meses fechados e filtro de situação", () => {
  const result = report([order("ano", "c1", "2025-10-10", 40), order("ano-tarde", "c1", "2025-10-20", 100), order("out", "c1", "2026-10-10", 60), order("carteira", "c1", "2026-10-11", 200, { status: "wallet" })]);
  assert.equal(result.previousYear.weight, 40); assert.equal(result.current.weight, 60);
  const closed = report([order("fim", "c1", "2026-09-30", 10)], { month: "2026-09" });
  assert.equal(closed.cutoff, undefined); assert.equal(closed.current.weight, 10);
  assert.equal(report([order("carteira", "c1", "2026-10-01", 200, { status: "wallet" })], { status: "wallet" }).current.weight, 200);
});

test("datas respeitam virada de ano, fevereiro e fuso de São Paulo", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(monthPeriod("2024-02", 31).end, "2024-02-29");
  assert.equal(monthPeriod("2026-02", 31).end, "2026-02-28");
  assert.equal(saoPauloToday(new Date("2026-10-17T01:00:00Z")), "2026-10-16");
  assert.equal(variation(10, 0), null); assert.equal(variation(0, 20), -100);
});

test("intervalo personalizado cruza meses e compara períodos iguais sem sobreposição", () => {
  const result = report([
    order("anterior", "c1", "2026-09-15", 80),
    order("inicio", "c1", "2026-09-20", 10),
    order("fim", "c1", "2026-10-05", 20),
    order("fora", "c1", "2026-10-06", 1000),
  ], { start: "2026-09-20", end: "2026-10-05" });
  assert.equal(result.duration, 16);
  assert.equal(result.current.weight, 30);
  assert.equal(result.previous.weight, 80);
  assert.equal(result.products[0].current, 30);
  assert.equal(result.periods.at(-2).start, "2026-09-04");
  assert.equal(result.periods.at(-2).end, "2026-09-19");
  assert.equal(result.previousYearPeriod.start, "2025-09-20");
  assert.equal(result.previousYearPeriod.end, "2025-10-05");
});

test("intervalo de um dia não duplica produtos entre períodos e mantém bonificações filtradas", () => {
  const result = report([order("a", "c1", "2026-10-05", 10), order("b", "c1", "2026-10-04", 20)], {
    start: "2026-10-05", end: "2026-10-05",
    bonifications: [{ customerId: "c1", issueDate: "2026-10-05", totalWeight: 2, totalValue: 20 }, { customerId: "c1", issueDate: "2026-10-06", totalWeight: 100, totalValue: 1000 }],
  });
  assert.equal(result.current.weight, 10);
  assert.equal(result.previous.weight, 20);
  assert.equal(result.products[0].current, 10);
  assert.equal(result.bonus.weight, 2);
});

test("acompanhamento começa em outubro sem comparar com meses anteriores", () => {
  const result = report([order("antigo", "c1", "2026-09-10", 999), order("atual", "c1", "2026-10-10", 50)], { trackingStart: undefined });
  assert.equal(result.periods.length, 1);
  assert.equal(result.periods[0].month, "2026-10");
  assert.equal(result.hasPrevious, false);
  assert.equal(result.averageCount, 0);
  assert.equal(result.historyCoverage.length, 0);
  assert.equal(result.stores.find((row) => row.customer.id === "c1").state, "Mês inicial");
  assert.equal(result.stores.find((row) => row.customer.id === "c1").delta, 0);
  assert.equal(result.products[0].delta, 0);
});

test("novembro compara apenas outubro e média não inclui meses inexistentes", () => {
  const result = report([order("out", "c1", "2026-10-10", 60), order("nov", "c1", "2026-11-10", 90)], { month: "2026-11", today: "2026-11-16", trackingStart: undefined });
  assert.equal(result.periods.length, 2);
  assert.equal(result.previous.weight, 60);
  assert.equal(result.averageCount, 1);
  assert.equal(result.average, 60);
  assert.equal(result.products[0].average, 60);
  assert.equal(result.stores.find((row) => row.customer.id === "c1").average, 60);
});

test("base vazia mantém valores finitos e sinaliza histórico ausente", () => {
  const result = report([]);
  assert.equal(result.average, 0); assert.equal(result.current.weight, 0);
  assert.equal(result.historyCoverage.every((period) => !period.hasOrders), true);
  assert.equal(result.products.length, 0);
});

function loadModule(relative, resolve) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const result = {};
  new Function("exports", "require", compiled)(result, resolve);
  return result;
}

test("Excel exporta oito abas com totais reconciliados e códigos preservados", async () => {
  const { createMartMinasWorkbook } = loadModule("../src/lib/mart-minas-export.ts", (id) => id === "./mart-minas-analytics" ? exports : nodeRequire(id));
  const result = report([order("0001", "c1", "2026-10-01", 20), order("0002", "c2", "2026-10-01", 80)]);
  const workbook = createMartMinasWorkbook(result, "Mart Minas", "Nossa carteira", "normal");
  assert.equal(workbook.worksheets.length, 8);
  assert.equal(workbook.getWorksheet("Pedidos").rowCount, 2);
  assert.equal(workbook.getWorksheet("Pedidos").getCell("A2").value, "0001");
  assert.equal(workbook.getWorksheet("Pedidos").getCell("H2").value, 20);
  const bytes = await workbook.xlsx.writeBuffer();
  const ExcelJS = nodeRequire("exceljs");
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(bytes);
  assert.equal(reloaded.getWorksheet("Produtos").getCell("C2").value, 20);
  assert.equal(reloaded.getWorksheet("Lojas").views[0].state, "frozen");
  assert.equal(reloaded.getWorksheet("Pedidos").getCell("A2").value, "0001");
});

test("painel renderiza com dados e com base vazia sem números inválidos", () => {
  const sorting = loadModule("../src/components/sort-heading.tsx", nodeRequire);
  const { MartMinasAnalysis } = loadModule("../src/components/mart-minas-analysis.tsx", (id) => id === "@/lib/mart-minas-analytics" ? exports : id === "@/components/sort-heading" ? sorting : nodeRequire(id));
  for (const data of [report([], { trackingStart: undefined }), report([order("inicial", "c1", "2026-10-10", 50)], { trackingStart: undefined }), report([]), report([order("a", "c1", "2026-09-10", 100), order("b", "c1", "2026-10-10", 60)])]) {
    const html = renderToStaticMarkup(React.createElement(MartMinasAnalysis, { report: data }));
    assert.match(html, /Comparativo por loja/);
    assert.match(html, /Produtos e mudanças no mix/);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  }
});

test("relatorio OESA usa configuracao propria no mesmo layout sem misturar lojas", () => {
  let selected = "oesa";
  let captured;
  const oesaGroup = { ...group, id: "oesa", name: "Nova Safra" };
  const mocks = {
    "@/lib/store": { useCrmStore: () => ({ customers: [...customers, { ...customers[0], id: "oesa-c1", groupId: "oesa" }], customerGroups: [group, oesaGroup], orders: [order("oesa-1", "oesa-c1", "2026-10-10", 50), order("mart-1", "c1", "2026-10-10", 500)], products: [] }) },
    "@/lib/oesa-nova-safra-settings": { useOesaNovaSafraSettings: () => ({ groupId: selected, reportName: "", loading: false, error: "" }) },
    "@/lib/mart-minas-analytics": { saoPauloToday: () => "2026-10-20" },
    "@/lib/order-remittances": { useOrderRemittances: () => ({ remittances: [{ id: "rem-1", name: "Primeira remessa" }], loading: false, error: "" }) },
    "@/components/network-commission-report": { NetworkCommissionReport: props => { captured = props; return props.sidebar; } },
    "@/components/network-remittances-report": { NetworkRemittancesReport: () => null },
    "@/components/store-growth-report": { StoreGrowthReport: () => null },
    "@/components/store-products-report": { StoreProductsReport: () => null },
    "@/components/network-products-report": { NetworkProductsReport: () => null },
  };
  const resolve = id => id === "@/lib/use-period-records" ? { usePeriodRecords: () => ({ rows: mocks["@/lib/store"].useCrmStore().orders, loading: false }) } : id === "@/components/network-reports-page" ? loadModule("../src/components/network-reports-page.tsx", resolve) : id.endsWith(".css") ? {} : id in mocks ? mocks[id] : nodeRequire(id);
  const { default: Page } = loadModule("../src/app/relatorios/oesa-nova-safra/page.tsx", resolve);
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /OESA - Nova Safra/);
  assert.match(html, /Produtos por loja/);
  assert.equal(captured.group.id, "oesa");
  assert.deepEqual(captured.report.allStores.map(row => row.customer.id), ["oesa-c1"]);
  assert.equal(captured.report.allStores[0].current.revenue, 500);
  selected = "";
  const empty = renderToStaticMarkup(React.createElement(Page));
  assert.match(empty, /Nenhuma rede/);
  assert.doesNotMatch(empty, /NaN|undefined/);
});

test("secao de comissoes renderiza tabela, total e aviso de percentual ausente", () => {
  const sorting = loadModule("../src/components/sort-heading.tsx", nodeRequire);
  const commission = loadModule("../src/lib/network-commission.ts", nodeRequire);
  const { NetworkCommissionReport } = loadModule("../src/components/network-commission-report.tsx", (id) => {
    if (id === "@/components/sort-heading") return sorting;
    if (id === "@/lib/network-commission") return commission;
    if (id.endsWith(".css")) return {};
    return nodeRequire(id);
  });
  const data = report([order("com-1", "c1", "2026-10-10", 50)]);
  const render = (percent) => renderToStaticMarkup(React.createElement(NetworkCommissionReport, { group: { ...group, commissionPercent: percent }, report: data, scopeLabel: "Somente Representação WRRJ", status: "normal" }));
  const html = render(5);
  assert.match(html, /Comissão por loja/);
  assert.match(html, /Nossa comissão geral/);
  assert.match(html, /Exportar XLS/);
  assert.match(html, /Total após filtros/);
  assert.doesNotMatch(html, /NaN|undefined/);
  assert.match(render(undefined), /Comissão ainda não configurada/);
  assert.doesNotMatch(render(0), /Comissão ainda não configurada/);
});

test("Mart Minas filtra comissao por periodo e responsavel sem duplicar bases", () => {
  for (const [scope, expectedIds] of [["ours", ["c1", "c3"]], ["external", ["c2"]], ["all", ["c1", "c2", "c3"]], ["seller:Ana", ["c2"]]]) {
    let captured;
    let stateIndex = 0;
    const mocks = {
      react: { ...React, useState: (initial) => React.useState(stateIndex++ === 2 ? scope : initial) },
      "@/lib/store": { useCrmStore: () => ({ customers, customerGroups: [group], orders: [order("ok", "c1", "2026-10-10", 10), order("seller", "c2", "2026-10-12", 20), order("old", "c1", "2026-09-30", 100), order("future", "c1", "2026-10-21", 100), order("wallet", "c1", "2026-10-12", 100, { status: "wallet" })] }) },
      "@/lib/order-remittances": { useOrderRemittances: () => ({ remittances: [{ id: "rem-1", name: "Primeira remessa" }], loading: false, error: "" }) },
      "@/lib/mart-minas-settings": { useMartMinasSettings: () => ({ groupId: "g1", loading: false, error: "" }) },
      "@/lib/mart-minas-analytics": { saoPauloToday: () => "2026-10-20" },
      "@/components/network-commission-report": { NetworkCommissionReport: (props) => { captured = props; return props.sidebar; } },
      "@/components/network-remittances-report": { NetworkRemittancesReport: () => null },
      "./report.css": {},
    "./workspace.css": {},
    "./clean.css": {},
    "@/components/store-growth-report": { StoreGrowthReport: () => null },
    "@/components/store-products-report": { StoreProductsReport: () => null },
    "@/components/network-products-report": { NetworkProductsReport: () => null },
    };
    const resolve = id => id === "@/lib/use-period-records" ? { usePeriodRecords: () => ({ rows: mocks["@/lib/store"].useCrmStore().orders, loading: false }) } : id === "@/components/network-reports-page" ? loadModule("../src/components/network-reports-page.tsx", resolve) : id.endsWith(".css") ? {} : id in mocks ? mocks[id] : nodeRequire(id);
    const { default: Page } = loadModule("../src/app/relatorios/mart-minas/page.tsx", resolve);
    const html = renderToStaticMarkup(React.createElement(Page));
    assert.deepEqual(captured.report.currentPeriod, { start: "2026-10-01", end: "2026-10-20" });
    assert.deepEqual(captured.report.stores.map(row => row.customer.id), expectedIds);
    assert.deepEqual(captured.report.allStores.map(row => row.customer.id), ["c1", "c2", "c3"]);
    assert.equal(captured.report.allStores.find(row => row.customer.id === "c2").current.revenue, 200);
    assert.equal(captured.report.stores.find(row => row.customer.id === "c1")?.current.revenue ?? 100, 100);
    assert.match(html, /type="date"/);
    assert.match(html, /Mesclado/);
    assert.doesNotMatch(html, /Comparativo por loja|Bonifica/);
  }
});

test("filtro de remessa afeta o relatório e oferece a mesma opção em redes configuradas", () => {
  let stateIndex = 0;
  let captured;
  const { NetworkReportsPage } = loadModule("../src/components/network-reports-page.tsx", id => {
    if (id === "react") return { ...React, useState: initial => {
      const index = stateIndex++;
      return React.useState(index === 4 ? "rem-1" : initial);
    } };
    if (id === "@/lib/store") return { useCrmStore: () => ({ customers, customerGroups: [group], products: [] }) };
    if (id === "@/lib/order-remittances") return { useOrderRemittances: () => ({ remittances: [{ id: "rem-1", name: "Primeira remessa" }, { id: "rem-2", name: "Segunda remessa" }], loading: false, error: "" }) };
    if (id === "@/lib/use-period-records") return { usePeriodRecords: () => ({ rows: [
      order("first", "c1", "2026-10-10", 10, { remittanceId: "rem-1" }),
      order("second", "c1", "2026-10-11", 20, { remittanceId: "rem-2" }),
    ], loading: false }) };
    if (id === "@/components/network-commission-report") return { NetworkCommissionReport: props => { captured = props; return props.sidebar; } };
    if (id === "@/components/network-remittances-report") return { NetworkRemittancesReport: () => null };
    if (id === "@/components/store-growth-report" || id === "@/components/store-products-report" || id === "@/components/network-products-report") return { StoreGrowthReport: () => null, StoreProductsReport: () => null, NetworkProductsReport: () => null };
    if (id === "@/lib/mart-minas-analytics") return { saoPauloToday: () => "2026-10-20" };
    if (id.endsWith(".css")) return {};
    return nodeRequire(id);
  });
  const html = renderToStaticMarkup(React.createElement(NetworkReportsPage, {
    settings: { groupId: "g1", reportName: "Mart Minas", loading: false, error: "" },
    defaultTitle: "Mart Minas",
  }));
  assert.equal(captured.report.allStores.find(row => row.customer.id === "c1").current.revenue, 100);
  assert.match(html, /Todas as remessas/);
  assert.match(html, /Primeira remessa/);
  assert.match(html, /Segunda remessa/);
});
