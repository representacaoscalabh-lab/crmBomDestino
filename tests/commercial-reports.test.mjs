import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const nodeRequire = createRequire(import.meta.url);
function load(relative, resolve = nodeRequire) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, resolve);
  return exports;
}
const lib = load("../src/lib/commercial-reports.ts");
const { buildCommercialReport: build, validReportPeriod } = lib;
const customers = [
  { id: "c1", code: "001", name: "Loja A", store: "1", city: "BH", status: "Ativo", groupId: "g1", segment: "REDES", phone: "123" },
  { id: "c2", code: "002", name: "Loja B", store: "2", city: "BH", status: "Ativo", groupId: "g1", segment: "REDES" },
  { id: "c3", code: "003", name: "Loja C", store: "3", city: "Betim", status: "Ativo", segment: "VAREJO" },
  { id: "c4", code: "004", name: "Loja D", store: "4", city: "BH", status: "Inativo", segment: "REDES" },
];
const products = [{ id: "p1", codeBox: "P1", codeHalfBox: "P1M", description: "Queijo" }, { id: "p2", codeBox: "P2", description: "Manteiga" }, { id: "p3", codeBox: "P3", description: "Sem compra" }];
const item = (id, weight) => ({ productId: id, productCode: id === "p1" ? "P1" : "P2", description: id, totalWeight: weight, packagePrice: weight * 10, packageQuantity: 1, unitQuantity: weight * 2, subtotal: weight * 10 });
const order = (id, customerId, issueDate, weight, extra = {}) => ({ id, preOrder: id, customerId, issueDate, status: "normal", totalWeight: weight, totalValue: weight * 10, items: [item("p1", weight)], ...extra });
const data = {
  customers, products, customerGroups: [{ id: "g1", name: "Rede", externalStoreSellers: { c2: "Ana" } }],
  orders: [order("o1", "c1", "2026-10-05", 10), order("o2", "c2", "2026-10-05", 90), order("o3", "c3", "2026-10-10", 20), order("wallet", "c1", "2026-10-10", 200, { status: "wallet" }), order("future", "c1", "2026-11-01", 1000)],
  bonifications: [{ id: "b1", customerId: "c1", issueDate: "2026-10-06", totalWeight: 2, totalValue: 20, items: [item("p1", 2)] }, { id: "b2", customerId: "c2", issueDate: "2026-10-06", totalWeight: 8, totalValue: 80, items: [item("p1", 8)] }],
};
const filters = { start: "2026-10-01", end: "2026-10-16", scope: "ours", network: "", city: "", segment: "", customerStatus: "Ativo", customer: "", product: "", orderStatus: "normal" };
const report = (id = "customers", patch = {}, source = data) => build(source, { ...filters, ...patch }, id);

test("somente WRRJ, mesclados e vendedor isolam pedidos e bonificações", () => {
  const ours = report(), all = report("customers", { scope: "all" }), seller = report("customers", { scope: "seller:Ana" });
  assert.equal(ours.summary.weight, 30); assert.equal(ours.summary.bonusWeight, 2);
  assert.equal(all.summary.weight, 120); assert.equal(all.summary.bonusWeight, 10);
  assert.equal(seller.summary.weight, 90); assert.equal(seller.summary.customers, 1);
  assert.equal(ours.rows.some((row) => row.id === "c2"), false);
});

test("rede, cidade, segmento, cliente e status respeitam a base selecionada", () => {
  assert.equal(report("customers", { network: "g1" }).summary.weight, 10);
  assert.equal(report("customers", { network: "none" }).summary.weight, 20);
  assert.equal(report("customers", { city: "Betim" }).summary.customers, 1);
  assert.equal(report("customers", { segment: "VAREJO" }).summary.weight, 20);
  assert.equal(report("customers", { customer: "c1" }).summary.orders, 1);
  assert.equal(report("customers", { customerStatus: "" }).summary.customers, 3);
  assert.equal(report("customers", { orderStatus: "wallet" }).summary.weight, 200);
});

test("produto específico recorta itens em vez de somar o pedido inteiro", () => {
  const source = { ...data, orders: [order("mix", "c1", "2026-10-05", 100, { items: [item("p1", 10), item("p2", 90)] })] };
  const result = report("customers", { product: "p1" }, source);
  assert.equal(result.summary.weight, 10); assert.equal(result.summary.value, 100);
  assert.equal(result.rows[0].mix, 1); assert.equal(result.summary.bonusWeight, 2);
});

test("sem compra considera o período e última compra não usa pedidos futuros", () => {
  const result = report("inactive", { start: "2026-10-11" });
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.find((row) => row.id === "c1").last, "2026-10-05");
  assert.equal(result.rows.find((row) => row.id === "c1").days, 11);
});

test("primeiro mês não fabrica crescimento e comparação usa intervalo anterior igual", () => {
  const first = report();
  assert.equal(first.hasComparison, false); assert.equal(first.columns.some((column) => column.key === "change"), false);
  const source = { ...data, orders: [order("anterior", "c1", "2026-10-05", 10), order("atual", "c1", "2026-10-15", 15)] };
  const result = report("customers", { start: "2026-10-11", end: "2026-10-20" }, source);
  assert.equal(result.previousStart, "2026-10-01"); assert.equal(result.previousEnd, "2026-10-10");
  assert.equal(result.rows.find((row) => row.id === "c1").change, 50);
});

test("frequência conta datas distintas e não retorna zero com uma única compra", () => {
  const source = { ...data, orders: [order("a", "c1", "2026-10-02", 10), order("b", "c1", "2026-10-02", 10), order("c", "c1", "2026-10-12", 10)] };
  assert.equal(report("customers", {}, source).rows.find((row) => row.id === "c1").frequency, 10);
  assert.equal(report().rows.find((row) => row.id === "c1").frequency, null);
});

test("produtos consolidam meia caixa e incluem catálogo sem compras", () => {
  const half = item("missing", 5); half.productCode = "P1M";
  const source = { ...data, orders: [order("a", "c1", "2026-10-05", 15, { items: [item("p1", 10), half] })] };
  const result = report("products", {}, source);
  assert.equal(result.rows.length, 3); assert.equal(result.rows[0].weight, 15);
  assert.equal(result.rows[0].buyers, 1); assert.equal(result.rows[0].coverage, 50);
  assert.equal(result.rows.find((row) => row.id === "p3").weight, 0);
});

test("segmentos, cidades e redes reconciliam totais e positivação", () => {
  for (const type of ["segments", "cities", "networks"]) {
    const result = report(type);
    assert.equal(result.rows.reduce((total, row) => total + row.weight, 0), 30);
    assert.equal(result.rows.reduce((total, row) => total + row.customers, 0), 2);
    assert.equal(result.rows.every((row) => row.coverage === 100), true);
  }
});

test("bonificações não se somam aos pedidos e proporção exige pedidos normais", () => {
  const bonus = report("bonuses");
  assert.equal(bonus.rows.length, 1); assert.equal(bonus.rows[0].weight, 2); assert.equal(bonus.rows[0].ratio, 20);
  assert.equal(report("bonuses", { orderStatus: "all" }).rows[0].ratio, null);
});

test("validação de datas rejeita calendário inválido, período antigo e futuro", () => {
  assert.equal(validReportPeriod("2026-10-01", "2026-10-16", "2026-10-16"), true);
  for (const [start, end] of [["", "2026-10-16"], ["2026-09-30", "2026-10-16"], ["2026-10-20", "2026-10-16"], ["2026-10-01", "2026-10-17"], ["2026-10-01", "2026-02-30"]]) assert.equal(validReportPeriod(start, end, "2026-10-16"), false);
});

test("central renderiza aberta, sem modal, com base preenchida ou vazia", () => {
  const sorting = load("../src/components/sort-heading.tsx");
  for (const source of [data, { customers: [], customerGroups: [], orders: [], products: [], bonifications: [] }]) {
    const { ReportCenter } = load("../src/components/commercial-report-center.tsx", (id) => {
      if (id === "@/lib/store") return { useCrmStore: () => source };
      if (id === "@/lib/commercial-reports") return lib;
      if (id === "@/lib/mart-minas-analytics") return { saoPauloToday: () => "2026-10-16" };
      if (id === "@/components/sort-heading") return sorting;
      if (id === "./commercial-reports.css" || id === "@/lib/xlsx") return {};
      return nodeRequire(id);
    });
    const html = renderToStaticMarkup(React.createElement(ReportCenter));
    assert.match(html, /Representação WRRJ/); assert.match(html, /Clientes sem compra/);
    assert.doesNotMatch(html, /<th\b[^>]*>(?:(?!<\/th>)[\s\S])*<th\b/);
    assert.doesNotMatch(html, /role="dialog"|NaN|Infinity|undefined/);
  }
});
