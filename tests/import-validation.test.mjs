import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToString } from "react-dom/server";
const nodeRequire = createRequire(import.meta.url);
const testRoot = path.dirname(fileURLToPath(import.meta.url));

const cache = new Map();
function load(name) {
  const filename = path.resolve(testRoot, "..", "src", "lib", `${name}.ts`);
  if (cache.has(filename)) return cache.get(filename);
  let source = fs.readFileSync(filename, "utf8");
  source = source.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href));
  if (name === "network-order-pdf") source += "\nexport { readOrderLines };";
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  cache.set(filename, exports);
  vm.runInNewContext(output, {
    exports,
    require: (id) => id.startsWith("@/lib/") ? load(id.slice(6)) : nodeRequire(id),
    Date, Map, Set, Error, Number, console,
  }, { filename });
  return exports;
}

const { prepareCustomerImport, validateCustomerBatch } = load("customer-import");
const { SPREADSHEET_ROW_NUMBER, ImportValidationError } = load("import-validation");
const { isExportPeriodWithinLimit } = load("export-period");
const { readOrderLines, parseNetworkOrderPage, classifyNetworkOrderTitle, buildNetworkOrderImport, buildNetworkBonificationImport } = load("network-order-pdf");
const { assembleNetworkOrderPages } = load("network-order-pdf");
const { ocrPageTextItems } = load("pdf-ocr");
const { networkImportReview } = load("network-import-review");
const customer = { id: "c1", code: "21000", name: "Loja", document: "04.737.552/0015-33", store: "1", city: "Alfenas", status: "Ativo" };

test("export period helper enforces valid dates and a maximum of 31 inclusive days", () => {
  assert.equal(isExportPeriodWithinLimit("2026-10-01", "2026-10-31"), true);
  assert.equal(isExportPeriodWithinLimit("2026-02-01", "2026-02-28"), true);
  assert.equal(isExportPeriodWithinLimit("2026-10-01", "2026-11-01"), false);
  assert.equal(isExportPeriodWithinLimit("2026-10-02", "2026-10-01"), false);
  assert.equal(isExportPeriodWithinLimit("2026-02-31", "2026-03-01"), false);
});
const row = (document, name = "Loja", code = "21000") => ({ "Código": code, Cliente: name, CNPJ: document });
const product = { id: "p1", description: "Produto", codeBox: "13444", codeHalfBox: "13444-M", quantityPerBox: 12, weightPerBox: 6, pricePerBox: 102, status: "Ativo" };
const pdf = { orderNumber: "6388342", customerCnpj: "04737552001533", issueDate: "2026-10-08", documentType: "order", documentTitle: "PEDIDO DE COMPRAS", lines: [{ supplierCode: "13444", quantity: 2, canceledQuantity: 0, unitPackagePrice: 106 }] };

const { parseOesaOrderPage, buildOesaOrderImport, updateOesaItem, updateOesaOrder } = load("oesa-order-pdf");
const { parseCommissionPercent, buildNetworkCommission, filterCommissionRows, sumCommissionRows } = load("network-commission");
const { buildDashboardCommission } = load("dashboard-commission");
const { validateTeamEdit } = load("team-access");
test("edicao de acesso valida perfil e situacao e protege o proprio administrador", () => {
  const changes = validateTeamEdit("admin-1", "user-2", " Maria ", "admin", "approved");
  assert.equal(changes.name, "Maria");
  assert.equal(changes.role, "admin");
  assert.equal(validateTeamEdit("admin-1", "user-2", "Maria", "user", "rejected").status, "rejected");
  assert.equal(validateTeamEdit("admin-1", "admin-1", "Admin", "admin", "approved").role, "admin");
  assert.throws(() => validateTeamEdit("a", "a", "Admin", "user", "approved"), /próprio acesso/);
  assert.throws(() => validateTeamEdit("a", "a", "Admin", "admin", "rejected"), /próprio acesso/);
  assert.throws(() => validateTeamEdit("a", "b", "", "user", "approved"), /nome/);
  assert.throws(() => validateTeamEdit("a", "b", "Nome", "superadmin", "approved"), /inválido/);
});
test("dashboard soma comissoes por loja, separa bases sem percentual e exclui carteira e outros vendedores", () => {
  const groups = [{ id: "g1", name: "Mart", commissionPercent: 3.5, externalStoreSellers: { c2: "Outro" } }, { id: "g2", name: "OESA", commissionPercent: 5 }, { id: "g3", name: "Pendente" }, { id: "g4", name: "Zero", commissionPercent: 0 }];
  const customers = [
    { ...customer, id: "c1", groupId: "g1" }, { ...customer, id: "c2", groupId: "g1" },
    { ...customer, id: "c3", groupId: "g2" }, { ...customer, id: "c4", groupId: "g3" },
    { ...customer, id: "c5" }, { ...customer, id: "c6", groupId: "g4" },
  ];
  const entry = (customerId, totalValue, status = "normal") => ({ customerId, totalValue, status });
  const result = buildDashboardCommission(customers, groups, [entry("c1", 50), entry("c1", 50.05), entry("c2", 1000), entry("c3", 200), entry("c4", 300), entry("c5", 400), entry("c6", 50), entry("c1", 1000, "wallet")]);
  assert.equal(result.commission, 13.5);
  assert.equal(result.coveredBase, 350.05);
  assert.equal(result.uncoveredBase, 700);
  assert.equal(result.pendingStores, 2);
  assert.equal(result.rows.find((row) => row.id === "g1").stores, 1);
  assert.equal(result.rows.find((row) => row.id === "g1").orders, 2);
  assert.equal(result.rows.find((row) => row.id === "g4").commission, 0);
  assert.equal(result.rows.find((row) => row.id === "g3").commission, null);
  assert.equal(buildDashboardCommission([], [], []).commission, 0);
});
test("comissao de rede aceita decimal brasileiro e rejeita percentuais invalidos", () => {
  assert.equal(parseCommissionPercent("3,5"), 3.5);
  assert.equal(parseCommissionPercent(" 2.75 "), 2.75);
  assert.equal(parseCommissionPercent("0"), 0);
  assert.equal(parseCommissionPercent("100"), 100);
  for (const value of ["", " ", "-1", "100,01", "abc", "1,2,3", "Infinity", "0x10"]) assert.equal(parseCommissionPercent(value), null);
});

test("comissao por loja arredonda centavos e total geral reconcilia com filtros", () => {
  const stores = [
    { customer: { ...customer, id: "c1", name: "Loja São João", city: "Oliveira", document: "12.345.678/0001-00" }, seller: "", current: { revenue: 100.05, orders: 2 } },
    { customer: { ...customer, id: "c2", name: "Loja B", city: "Contagem" }, seller: "Maria", current: { revenue: 200.15, orders: 1 } },
    { customer: { ...customer, id: "c3", name: "Loja C", city: "Oliveira" }, seller: "", current: { revenue: 0, orders: 0 } },
  ];
  const rows = buildNetworkCommission(stores, 3.5);
  assert.equal(rows[0].commission, 3.5);
  assert.equal(rows[1].commission, 0);
  assert.equal(sumCommissionRows(rows).commission, 3.5);
  assert.equal(sumCommissionRows(rows).base, 300.2);
  assert.equal(sumCommissionRows(rows).orders, 3);
  assert.equal(filterCommissionRows(rows, "sao joao", "", "all").length, 1);
  assert.equal(filterCommissionRows(rows, "12345678000100", "", "all").length, 1);
  assert.equal(filterCommissionRows(rows, "", "Oliveira", "with").length, 1);
  assert.equal(filterCommissionRows(rows, "", "Oliveira", "without").length, 1);
  assert.equal(sumCommissionRows(filterCommissionRows(rows, "Maria", "", "all")).commission, 0);
  assert.equal(buildNetworkCommission(stores, 0)[0].commission, 0);
  assert.throws(() => buildNetworkCommission(stores, NaN), /comissão/);
  assert.throws(() => buildNetworkCommission(stores, 101), /comissão/);
});

test("nossa carteira recebe somente nossa comissao", () => {
  const stores = [{ customer, seller: "", current: { revenue: 1000, orders: 1 } }];
  const rows = buildNetworkCommission(stores, 5, 2, "orders");
  assert.equal(rows[0].commission, 50);
  assert.equal(rows[0].sellerCommission, 0);
  assert.equal(rows[0].sellerPercent, 0);
  assert.equal(sumCommissionRows(rows).sellerCommission, 0);
  assert.equal(buildNetworkCommission(stores, 5)[0].sellerCommission, 0);
  assert.equal(buildNetworkCommission(stores, 5, 0, "orders")[0].sellerCommission, 0);
  const result = buildDashboardCommission([{ ...customer, groupId: "g1" }], [{ id: "g1", name: "Rede", commissionPercent: 5, sellerCommissionPercent: 2 }], [{ customerId: customer.id, status: "normal", totalValue: 1000 }]);
  assert.equal(result.commission, 50);
  assert.equal(result.sellerCommission, 0);
  assert.equal(result.rows[0].sellerPercent, 2);
  assert.equal(result.pendingSellerStores, 0);
  const { createCommissionWorkbook } = load("network-commission-export");
  const workbook = createCommissionWorkbook(rows, { name: "Rede", start: "2026-10-01", end: "2026-10-19", scope: "Nossa carteira", status: "Normais", percent: 5, sellerPercent: 2, search: "", city: "", activity: "all" });
  assert.equal(workbook.Sheets["Comissão por loja"].J15.v, 50);
  assert.equal(workbook.Sheets["Comissão por loja"].K15.v, 0);
  assert.equal(workbook.Sheets["Comissão por loja"].L15.v, 0);
});

test("XLS de comissao inclui somente as lojas exibidas e resume os filtros aplicados", () => {
  const { createCommissionWorkbook } = load("network-commission-export");
  const XLS = nodeRequire("@e965/xlsx");
  const rows = buildNetworkCommission([
    { customer: { ...customer, id: "c1", name: "Loja A", code: "0002" }, seller: "", current: { revenue: 100, orders: 1 } },
    { customer: { ...customer, id: "c2", name: "Loja B", code: "02815" }, seller: "Maria", current: { revenue: 200, orders: 2 } },
  ], 5, 2, "orders");
  const context = { name: "Nova Safra", start: "2026-10-01", end: "2026-10-19", scope: "Dados mesclados", status: "Normais", percent: 5, search: "Loja B", city: "", activity: "with" };
  const workbook = createCommissionWorkbook([rows[1]], context);
  const data = XLS.write(workbook, { bookType: "biff8", type: "buffer" });
  const read = XLS.read(data, { type: "buffer" });
  const sheet = read.Sheets["Comissão por loja"];
  assert.deepEqual(read.SheetNames, ["Comissão por loja"]);
  assert.equal(sheet.B15.v, "02815");
  assert.equal(sheet.J15.v, 0);
  assert.equal(sheet.J16.v, 0);
  assert.equal(sheet.B5.v, 200);
  assert.equal(sheet.B7.v, 0);
  assert.equal(sheet.B8.v, 4);
  assert.equal(sheet.B9.v, 4);
  assert.match(sheet.B10.v, /Busca: Loja B; cidade: Todas; movimentação: Com pedidos/);
  assert.equal(sheet.A16.v, "TOTAL APÓS FILTROS");
  assert.equal(sheet.A14.v, "Cliente");
});

const { parseOesaScreenshot, buildOesaScreenshotImport, pendingOesaScreenshotReview } = load("oesa-screenshots");

test("prints OESA pareiam arquivos em qualquer ordem pela sequencia incluindo quantidades repetidas", () => {
  const sources = [{ name: "valores.png", text: "Quant. Preco Desconto Subtotal Caixas\n24.0 43.7 0.0 1048.80 1\n24.0 7.665 0.0 183.96 1\n48.0 5.313 0.0 255.02 2" }, { name: "produtos.png", text: "Codigo Produto Quant.\n00002 Q MOZZ BARRA G 24.0\n02404 Q PROVOLONE 24.0\n02405 Q MOZZ FATIADA 48.0" }];
  const catalog = ["0002", "02404", "02405"].map((codeBox, index) => ({ ...product, id: `prints-${index}`, codeBox, codeHalfBox: "" }));
  const result = buildOesaScreenshotImport(sources, customer, catalog, "PRINT-1", "2026-10-19");
  assert.equal(result.warnings.length, 0);
  assert.equal(result.detected, 3);
  assert.equal(result.order.items.length, 3);
  assert.equal(result.order.items[0].unitQuantity, 24);
  assert.equal(result.order.items[0].boxQuantity, 1);
  assert.equal(result.order.items[0].unitPrice, 43.7);
  assert.equal(result.order.items[1].unitPrice, 7.665);
  assert.equal(result.order.items[2].subtotal, 255.02);
  assert.equal(result.order.customerId, customer.id);
  assert.equal(result.order.preOrder, "PRINT-1");
});

test("prints OESA bloqueiam sequencias divergentes, pares ambiguos e erros de subtotal", () => {
  const identities = { name: "produtos.png", text: "13444 Produto 12.0" };
  const values = { name: "valores.png", text: "12.0 10.0 0.0 120.0 1" };
  const build = (sources) => buildOesaScreenshotImport(sources, customer, [product], "P1", "2026-10-19");
  assert.equal(build([identities, values]).order.items.length, 1);
  assert.equal(build([identities, values, { ...values, name: "duplicado.png" }]).order.items.length, 0);
  assert.equal(build([identities, { ...identities, name: "duplicado.png" }, values]).order.items.length, 0);
  assert.equal(build([identities, { ...values, text: "24.0 10.0 0.0 240.0 1" }]).order.items.length, 0);
  const wrongTotal = build([identities, { ...values, text: "12.0 10.0 0.0 999.0 1" }]);
  assert.equal(wrongTotal.order.items.length, 1);
  assert.equal(pendingOesaScreenshotReview(wrongTotal.order, wrongTotal.review).length, 1);
  assert.match(wrongTotal.warnings.join(" "), /subtotal/);
  const illegible = build([identities, { ...values, text: values.text + "\n24.? ilegivel" }]);
  assert.equal(illegible.order.items.length, 0);
  assert.match(illegible.warnings.join(" "), /ileg/);
  const discount = build([identities, { ...values, text: "12,0 10,0 10,0 108,0 1" }]);
  assert.equal(discount.order.items[0].subtotal, 108);
  assert.equal(parseOesaScreenshot("00002 Q MOZZ 24.0").identities[0].code, "00002");
});

test("OCR que le 11.1 como 11 ou 1.1 preserva itens e exige corrigir antes de salvar", () => {
  const sources = [{ name: "1.png", text: "02815 Q MOZZ CEREJA 90.0\n02817 Q MOZZ MEDIA 72.0" }, { name: "2.png", text: "11 0.0 999.0 5 90\n1.1 0.0 799.2 4 72" }];
  const catalog = ["02815", "02817"].map((codeBox, index) => ({ ...product, id: `ocr-${index}`, codeBox, codeHalfBox: "" }));
  const result = buildOesaScreenshotImport(sources, customer, catalog, "OCR1", "2026-10-19", "ordered");
  assert.equal(result.order.items.length, 2);
  assert.equal(result.order.items[0].unitPrice, 11);
  assert.equal(result.order.items[1].unitPrice, 1.1);
  assert.equal(pendingOesaScreenshotReview(result.order, result.review).length, 2);
  assert.ok(result.review.every((entry) => Math.abs(entry.suggestedPrice - 11.1) < 0.00001));
  assert.match(result.warnings.join(" "), /produto cadastrado e mantido/);
  const corrected = updateOesaOrder(result.order, result.order.items.map((item) => ({ ...item, unitPrice: 11.1, subtotal: Math.round(item.unitQuantity * 11.1 * 100) / 100 })));
  assert.equal(pendingOesaScreenshotReview(corrected, result.review).length, 0);
  assert.equal(corrected.totalValue, 1798.2);
  assert.equal(pendingOesaScreenshotReview(updateOesaOrder(result.order, []), result.review).length, 0);
});

test("prints OESA ordenados usam quantidade da imagem 1 e pecas da imagem 2", () => {
  const first = { name: "1.png", text: "Codigo Produto Quant.\n00002 Q MOZZ BARRA 24.0\n00003 Q MOZZ MANTA 9.0\n05877 Q MOZZ BARRA G2 20.0" };
  const second = { name: "2.png", text: "Preco Desconto Sub-total Caixas Pecas\n43.7 0.0 1048.80 1 6\n58.4 0.0 525.60 1 25\n43.7 0.0 874.00 1 9" };
  const catalog = ["00002", "00003", "05877"].map((codeBox, index) => ({ ...product, id: `ordered-${index}`, codeBox, codeHalfBox: "" }));
  const build = (sources) => buildOesaScreenshotImport(sources, customer, catalog, "ORD-1", "2026-10-19", "ordered");
  const result = build([first, second]);
  assert.equal(result.order.items.length, 3);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.order.items[0].unitQuantity, 24);
  assert.equal(result.order.items[0].pieces, 6);
  assert.equal(result.order.items[0].unitPrice, 43.7);
  assert.equal(result.order.items[1].unitQuantity, 9);
  assert.equal(result.order.items[1].pieces, 25);
  assert.equal(result.order.items[1].boxQuantity, 1);
  assert.equal(result.order.items[1].subtotal, 525.6);
  assert.equal(result.order.items[2].pieces, 9);
  assert.equal(build([second, first]).order.items.length, 0);
  const incomplete = build([first, { ...second, text: "43.7 0.0 1048.80 1 6\n58.4 0.0 525.60 1 25" }]);
  assert.equal(incomplete.order.items.length, 0);
  assert.match(incomplete.warnings.join(" "), /imagem 1 tem 3 produtos.*imagem 2 tem 2/);
});
test("OESA usa CNPJ da empresa e Cod.Fab., nao codigo interno nem CNPJ fornecedor", () => {
  const rows = ["210 - Emitir Pedido de Compra", "Número do Pedido: 575455 Data : 13/10/2026", "Empresa: OESA CNPJ/CPF: 04737552001533", "Fornecedor: FABRICA CNPJ/CPF: 26.189.084/0001-47", "Código Descrição Cód.Fáb. Emb Un. Qt.Pedida Qt. Entreg. P.Compra", "134436 Produto 13444 UNIDADE UN 20,00 0,00 33,000000 0,00", "13 Itens"];
  const parsed = parseOesaOrderPage(rows.map((str, i) => ({ str, transform: [1, 0, 0, 1, 0, 800 - i * 12] })));
  assert.equal(parsed.customerCnpj, "04737552001533");
  assert.equal(parsed.lines[0].supplierCode, "13444");
  const result = buildOesaOrderImport([parsed], [customer], [product], []);
  const item = result.orders[0].items[0];
  assert.equal(item.unitQuantity, 24);
  assert.equal(item.boxQuantity, 2);
  assert.equal(item.unitPrice, 33);
  assert.equal(item.subtotal, 792);
  assert.equal(result.orders[0].preOrder, "575455");
  assert.equal(buildOesaOrderImport([parsed], [customer], [product], result.orders).orders.length, 0);
});

test("OESA usa Qt.Pedida como unidades e P.Compra direto mesmo com KG", () => {
  const parsed = { orderNumber: "575455", customerCnpj: "04737552001533", issueDate: "2026-10-13", warnings: [], lines: [{ supplierCode: "13444", measure: "KG", quantity: 19.92, price: 58.4 }] };
  const result = buildOesaOrderImport([parsed], [customer], [product], []);
  const item = result.orders[0].items[0];
  assert.equal(item.packageQuantity, 2);
  assert.equal(item.totalWeight, 12);
  assert.equal(item.unitPrice, 58.4);
  assert.equal(item.subtotal, 1401.6);
  assert.equal(buildOesaOrderImport([parsed], [customer], [{ ...product, quantityPerBox: 0 }], []).orders.length, 0);
  assert.equal(buildOesaOrderImport([parsed], [], [product], []).orders.length, 0);
  assert.equal(buildOesaOrderImport([parsed], [customer, { ...customer, id: "c2" }], [product], []).orders.length, 0);
});

test("conferencia OESA arredonda, edita produto e preco e recalcula exclusoes", () => {
  const item = updateOesaItem(product, 1.007, 10);
  assert.equal(item.packageQuantity, 1);
  assert.equal(item.unitQuantity, 12);
  assert.equal(updateOesaItem(product, 0.019, 10).packageQuantity, 1);
  assert.equal(updateOesaItem(product, 1.5, 10).packageQuantity, 2);
  const changed = updateOesaItem({ ...product, id: "p2", quantityPerBox: 6, weightPerBox: 3 }, 3, 20);
  assert.equal(changed.productId, "p2");
  assert.equal(changed.unitQuantity, 18);
  assert.equal(changed.subtotal, 360);
  assert.equal(changed.totalWeight, 9);
  const order = { items: [item, changed], totalValue: 480, totalWeight: 15 };
  assert.equal(updateOesaOrder(order, [changed]).totalValue, 360);
  assert.equal(updateOesaOrder(order, [changed]).totalWeight, 9);
  assert.equal(updateOesaOrder(order, []).totalValue, 0);
});

test("OESA bloqueia descricao divergente mesmo com zeros diferentes e mantem P.Compra", () => {
  const entry = { orderNumber: "575455", customerCnpj: "04737552001533", issueDate: "2026-10-13", warnings: [], lines: [{ supplierCode: "05877", description: "QUEIJO MUSSARELA BUFALA +2KG", measure: "KG", quantity: 20.14, price: 43.7 }] };
  const catalog = { ...product, codeBox: "05877", quantityPerBox: 10, description: "Q MOZZ BUFALA BARRA G2" };
  const result = buildOesaOrderImport([entry], [customer], [catalog], []);
  assert.equal(result.orders[0].items[0].boxQuantity, 2);
  assert.equal(result.orders[0].items[0].unitPrice, 43.7);
  assert.equal(result.orders[0].items[0].subtotal, 874);
  const wrong = { ...entry, lines: [{ ...entry.lines[0], supplierCode: "0003", description: "QUEIJO MUSSARELA MANTA BUFALA" }] };
  assert.equal(buildOesaOrderImport([wrong], [customer], [{ ...catalog, codeBox: "3", description: "rere" }], []).orders.length, 0);
  const mismatch = buildOesaOrderImport([wrong], [customer], [{ ...catalog, codeBox: "0003", description: "rere" }], []);
  assert.equal(mismatch.orders.length, 0);
  assert.match(mismatch.warnings.join(" "), /Item bloqueado/);
});

test("OESA ignora apenas zeros iniciais numericos, usa codigo cadastrado e bloqueia ambiguidades", () => {
  const entry = { orderNumber: "575455", customerCnpj: "04737552001533", issueDate: "2026-10-13", warnings: [], lines: [{ supplierCode: "0002", quantity: 24, price: 43.7, measure: "UN" }, { supplierCode: "2815", quantity: 12, price: 11, measure: "UN" }] };
  const catalog = [{ ...product, id: "p2", codeBox: "00002", codeHalfBox: "" }, { ...product, id: "p3", codeBox: "02815", codeHalfBox: "" }];
  const result = buildOesaOrderImport([entry], [customer], catalog, []);
  assert.equal(result.orders[0].items.length, 2);
  assert.equal(result.orders[0].items[0].productCode, "00002");
  assert.equal(result.orders[0].items[1].productCode, "02815");
  assert.equal(result.orders[0].items[0].unitPrice, 43.7);
  assert.equal(result.summaries[0].rejected, 0);
  const ambiguous = buildOesaOrderImport([{ ...entry, lines: [entry.lines[0]] }], [customer], [...catalog, { ...product, id: "p4", codeBox: "2", codeHalfBox: "" }], []);
  assert.equal(ambiguous.orders.length, 0);
  assert.match(ambiguous.warnings.join("\n"), /ambíguo/);
  const alpha = buildOesaOrderImport([{ ...entry, lines: [{ ...entry.lines[0], supplierCode: "02A" }] }], [customer], [{ ...product, codeBox: "2A", codeHalfBox: "" }], []);
  assert.equal(alpha.orders.length, 0);
});

test("log OESA contabiliza cadastro ausente, linha invalida e itens nao detectados", () => {
  const rows = ["Número do Pedido: 575455 Data: 13/10/2026", "Empresa: OESA CNPJ/CPF: 04737552001533", "Fornecedor: FABRICA", "Código Descrição Cód.Fáb. Emb Un. Qt.Pedida Qt. Entreg. P.Compra", "134436 Produto 13444 UNIDADE UN 24,00 0,00 33,000000", "134437 Produto ausente 99999 UNIDADE UN 12,00 0,00 10,000000", "134438 Produto ilegivel sem colunas", "4 Itens"];
  const parsed = parseOesaOrderPage(rows.map((str, i) => ({ str, transform: [1, 0, 0, 1, 0, 800 - i * 12] })));
  assert.equal(parsed.expectedItemCount, 4);
  assert.equal(parsed.detectedItemCount, 3);
  const result = buildOesaOrderImport([parsed], [customer], [product], []);
  assert.equal(result.summaries[0].total, 4);
  assert.equal(result.summaries[0].read, 2);
  assert.equal(result.summaries[0].prepared, 1);
  assert.equal(result.summaries[0].rejected, 3);
  assert.match(result.warnings.join("\n"), /134438/);
  assert.match(result.warnings.join("\n"), /99999.*ausente.*não cadastrado/);
  assert.match(result.warnings.join("\n"), /PDF informa 4 itens/);
  const blocked = buildOesaOrderImport([parsed], [], [product], []);
  assert.equal(blocked.summaries[0].prepared, 0);
  assert.equal(blocked.summaries[0].rejected, 4);
  assert.match(blocked.warnings.join("\n"), /CNPJ.*não encontrado/);
});

test("clientes permitem mesmo nome, codigo e loja com CNPJs diferentes", () => {
  const result = prepareCustomerImport([row("11.222.333/0001-81"), row("00.123.456/0001-00")], [customer], []);
  assert.equal(result.imports.length, 2);
  assert.equal(result.warnings.length, 0);
  validateCustomerBatch(result.imports, [customer]);
});

test("CNPJ duplicado no banco ou na propria planilha e informado com a linha correta", () => {
  const rows = [row("04737552001533"), row("11.222.333/0001-81"), { ...row("11222333000181"), [SPREADSHEET_ROW_NUMBER]: 9 }];
  const result = prepareCustomerImport(rows, [customer], []);
  assert.equal(result.imports.length, 1);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /Linha 2.*já cadastrado/);
  assert.match(result.warnings[1], /Linha 9.*linha 3/);
});

test("validacao final bloqueia CNPJ repetido e permite editar o proprio cadastro", () => {
  assert.throws(() => validateCustomerBatch([{ ...customer, document: "04737552001533" }], [customer]), ImportValidationError);
  validateCustomerBatch([customer], [customer], customer.id);
  assert.throws(() => validateCustomerBatch([customer, { ...customer }], []), ImportValidationError);
});

test("planilhas invalidas mostram faltas e preservam zeros e prazo de pagamento", () => {
  assert.throws(() => prepareCustomerImport([], [], []), /vazia/);
  assert.throws(() => prepareCustomerImport([{ Cliente: "Loja" }], [], []), /Coluna CNPJ/);
  assert.throws(() => prepareCustomerImport([row("4.73755E+11")], [], []), (error) => error.warnings.some((warning) => warning.includes("14 caracteres")));
  const result = prepareCustomerImport([{ ...row("00.123.456/0001-00"), Prazo: "28 dias" }], [], [{ id: "t1", code: "28", term: "28 dias" }]);
  assert.equal(result.imports[0].document, "00.123.456/0001-00");
  assert.equal(result.imports[0].paymentTerm, "28");
});

test("importacao aceita planilha somente com CNPJ sem inventar nome ou codigo", () => {
  const result = prepareCustomerImport([{ CNPJ: "11.222.333/0001-81" }], [], []);
  assert.equal(result.imports.length, 1);
  assert.equal(result.imports[0].name, "");
  assert.equal(result.imports[0].code, "");
  assert.equal(result.imports[0].document, "11.222.333/0001-81");
  validateCustomerBatch(result.imports, [], undefined, { cnpjOnly: true });
  assert.throws(() => validateCustomerBatch(result.imports, []), ImportValidationError);
  assert.throws(() => prepareCustomerImport([{ CNPJ: "" }], [], []), ImportValidationError);
});

test("custo bruto segue o cabecalho e linha invalida gera aviso", () => {
  const header = { top: 180, items: [{ x: 220, text: "Emb" }, { x: 280, text: "Qtde" }, { x: 320, text: "Qtd.Canc." }, { x: 390, text: "Unit." }, { x: 425, width: 20, text: "Valor" }, { x: 465, width: 24, text: "Custo" }, { x: 505, width: 20, text: "Valor" }] };
  const line = { top: 215, items: [{ x: 15, text: "13444" }, { x: 220, text: "CX" }, { x: 280, text: "2,00" }, { x: 390, text: "102,0000" }, { x: 459, width: 28, text: "212,00" }] };
  const warnings = [];
  const result = readOrderLines([header, line, { ...line, items: line.items.filter((item) => item.x !== 459) }], warnings);
  assert.equal(result.length, 1);
  assert.equal(result[0].unitPackagePrice, 102);
  assert.equal(result[0].grossLineTotal, 212);
  assert.match(warnings[0], /13444.*Custo Bruto/);
  const canceled = { ...line, items: [...line.items, { x: 330, text: "3,00" }] };
  assert.equal(readOrderLines([header, canceled], warnings).length, 0);
});

test("pedidos e bonificacoes mantem custo bruto, quantidade, peso e avisos", () => {
  const parsed = { ...pdf, warnings: ["Pedido: item inválido ignorado"] };
  const result = buildNetworkOrderImport([pdf], [customer], [product], []);
  assert.equal(result.orders[0].totalValue, 212);
  assert.equal(result.orders[0].totalWeight, 12);
  assert.equal(result.orders[0].items[0].unitQuantity, 24);
  assert.equal(buildNetworkOrderImport([parsed], [customer], [product], []).orders.length, 0);
  const bonuses = buildNetworkBonificationImport([{ ...pdf, documentType: "bonification" }], [customer], [product], []);
  assert.equal(bonuses.bonifications[0].totalValue, 212);
});

test("CNPJ desconhecido ou ambiguo e codigo ausente nao criam pedidos incorretos", () => {
  assert.equal(buildNetworkOrderImport([pdf], [], [product], []).orders.length, 0);
  assert.equal(buildNetworkOrderImport([pdf], [customer, { ...customer, id: "c2" }], [product], []).orders.length, 0);
  const unknown = buildNetworkOrderImport([pdf], [customer], [], []);
  assert.equal(unknown.orders.length, 0);
  assert.ok(unknown.warnings.some((message) => message.includes("13444")));
});

test("pedido existente e produto com quantidade ou peso invalido sao rejeitados", () => {
  const result = buildNetworkOrderImport([pdf], [customer], [product], []);
  assert.equal(buildNetworkOrderImport([pdf], [customer], [product], result.orders).orders.length, 0);
  for (const invalid of [{ quantityPerBox: 0 }, { weightPerBox: NaN }, { quantityPerBox: Infinity }]) {
    const checked = buildNetworkOrderImport([pdf], [customer], [{ ...product, ...invalid }], []);
    assert.equal(checked.orders.length, 0);
    assert.ok(checked.warnings.length > 0);
  }
});

function mockStore(firestore) {
  firestore = { query: (...parts) => parts, where: (...parts) => parts, ...firestore };
  const filename = path.resolve(testRoot, "..", "src", "lib", "store.tsx");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require: (id) => {
      if (id === "@/lib/customer-document-reservation") return { customerReservationsEnabled: false };
      if (id === "@/lib/customer-document-query") {
        const helper = fs.readFileSync(path.resolve(testRoot, "..", "src/lib/customer-document-query.ts"), "utf8");
        const helperExports = {};
        const helperCode = ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
        new Function("exports", "require", helperCode)(helperExports, name => name === "firebase/firestore" ? firestore : name === "@/lib/firebase" ? { db: {} } : load(name.slice(6)));
        return helperExports;
      }
      if (id === "firebase/firestore") return firestore;
      if (id === "next/navigation") return { usePathname: () => "/clientes" };
      if (id === "@/lib/auth") return { useAuth: () => ({ crmUser: { status: "approved" } }) };
      if (id === "@/lib/firebase") return { db: {} };
      return id.startsWith("@/lib/") ? load(id.slice(6)) : nodeRequire(id);
    },
  }, { filename });
  let store;
  function Probe() { store = exports.useCrmStore(); return null; }
  renderToString(React.createElement(exports.StoreProvider, null, React.createElement(Probe)));
  return store;
}

test("exclusao em lote remove somente IDs selecionados e divide lotes acima de 450", async () => {
  const deleted = [];
  const batches = [];
  const store = mockStore({
    doc: (_db, collection, id) => ({ collection, id }),
    writeBatch: () => {
      const pending = [];
      return { delete: (ref) => pending.push(ref), commit: async () => { batches.push(pending.length); deleted.push(...pending); } };
    },
  });
  const ids = Array.from({ length: 901 }, (_, index) => `customer-${index}`);
  await store.deleteCustomers([...ids, ids[0]]);
  assert.deepEqual(batches, [450, 450, 1]);
  assert.equal(deleted.length, 901);
  assert.ok(deleted.every((ref) => ref.collection === "customers"));
  assert.deepEqual(deleted.map((ref) => ref.id), ids);
});

test("exclusao interrompida informa quantos clientes foram confirmados", async () => {
  let commits = 0;
  const store = mockStore({
    doc: (_db, collection, id) => ({ collection, id }),
    writeBatch: () => ({ delete: () => {}, commit: async () => { if (++commits === 2) throw new Error("offline"); } }),
  });
  await assert.rejects(store.deleteCustomers(Array.from({ length: 451 }, (_, index) => String(index))), /450 cliente/);
});

test("gravacao de cliente confere CNPJ no banco mesmo com lista local vazia", async () => {
  let writes = 0;
  const store = mockStore({
    collection: (_db, name) => name,
    getDocsFromServer: async () => ({ docs: [{ id: customer.id, data: () => customer }] }),
    addDoc: async () => { writes++; }, serverTimestamp: () => "timestamp",
  });
  await assert.rejects(store.addCustomer({ ...customer, document: "04737552001533" }), ImportValidationError);
  assert.equal(writes, 0);
  await store.addCustomer({ ...customer, document: "11.222.333/0001-81" });
  assert.equal(writes, 1);
});

test("gravacao da importacao aceita cliente contendo somente CNPJ", async () => {
  const writes = [];
  const store = mockStore({
    collection: (_db, name) => name,
    getDocsFromServer: async () => ({ docs: [] }),
    doc: () => ({ id: "new-customer" }), serverTimestamp: () => "timestamp",
    writeBatch: () => ({ set: (_ref, value) => writes.push(value), commit: async () => {} }),
  });
  const { imports } = prepareCustomerImport([{ CNPJ: "11.222.333/0001-81" }], [], []);
  await store.addCustomers(imports);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].document, "11.222.333/0001-81");
  assert.equal(writes[0].name, "");
  assert.equal(writes[0].code, "");
  await assert.rejects(store.addCustomers([...imports, ...imports]), ImportValidationError);
  assert.equal(writes.length, 1);
});

test("gravacao de pedidos usa transacao e nao sobrescreve pedido existente", async () => {
  const order = buildNetworkOrderImport([pdf], [customer], [product], []).orders[0];
  let writes = 0;
  let exists = true;
  const store = mockStore({
    doc: (_db, collection, id) => ({ collection, id }), serverTimestamp: () => "timestamp",
    runTransaction: async (_db, callback) => callback({ get: async () => ({ exists: () => exists }), set: () => { writes++; } }),
  });
  await assert.rejects(store.addOrders([order]), /já existe/);
  assert.equal(writes, 0);
  exists = false;
  await store.addOrders([order]);
  assert.equal(writes, 1);
  await assert.rejects(store.addOrders([order, order]), /repetido/);
  await assert.rejects(store.addOrders([{ ...order, totalValue: NaN }]), /inválidos/);
  assert.equal(writes, 1);
});

// Text and column positions modeled after the two Mart Minas screenshots.
function martMinasPage(bonus, scale = 1, numberOverride) {
  const height = 595 * scale;
  const entries = [];
  const add = (str, x, top, width = str.length * 3) => entries.push({ str, width: width * scale, transform: [1, 0, 0, 1, x * scale, height - top * scale] });
  add(bonus ? "PEDIDO DE BONIFICAÇÃO SEM INCID CUSTO-" : "PEDIDO DE COMPRAS", 15, 22);
  add(`${numberOverride ?? (bonus ? "6388108" : "6388346")}/L`, 750, 22);
  add("FORNECEDOR", 15, 42);
  add("DADOS PARA FATURAMENTO", 420, 42);
  add("CNPJ", 240, 79); add("26.189.084/0001-47", 320, 79);
  add("CNPJ", 635, 79); add(bonus ? "04.737.552/0011-00" : "04.737.552/0027-77", 700, 79);
  add("ENDEREÇO PARA ENTREGA", 15, 103);
  add("ENDEREÇO PARA COBRANÇA", 420, 103);
  const headerTop = bonus ? 168 : 178;
  add("Cod Forn", 15, headerTop, 35); add("Seq", 105, headerTop); add("Emb", 220, headerTop);
  add("Qtde", 284, headerTop, 18); add("Qtd.Canc.", 307, headerTop, 38);
  add("Valor", 385, headerTop, 20); add("Unit.", 386, headerTop + 10, 18);
  add("Valor", 435, headerTop, 20); add("Item", 435, headerTop + 10, 18);
  add("Custo", 473, headerTop, 23); add("Bruto", 473, headerTop + 10, 23);
  add("Valor", 518, headerTop, 20); add("IPI", 520, headerTop + 10, 12);
  const rows = bonus
    ? [["02815", "3,00", "257,4000", "792,74"], ["00063", "2,00", "126,0000", "262,58"]]
    : [["13444", "1,00", "102,0000", "106,00"], ["13480", "1,00", "192,0000", "219,07"], ["02815", "2,00", "257,4000", "528,50"], ["00063", "2,00", "126,0000", "262,58"]];
  rows.forEach(([code, quantity, unitPrice, gross], index) => {
    const top = (bonus ? 191 : 207) + index * 45;
    add(code, 15, top, 22); add("CX 12", 220, top, 28); add(quantity, 294, top, 20);
    add("0,00", 325, top, 20); add(unitPrice, 377, top, 35);
    add((Number(quantity.replace(",", ".")) * Number(unitPrice.replace(",", "."))).toFixed(2).replace(".", ","), 435, top, 25); add(gross, 475, top, 32); add("0,00", 520, top, 20);
  });
  add("TOTAIS", 70, bonus ? 295 : 378);
  add("Valor total do pedido", 15, bonus ? 315 : 398); add(bonus ? "1.055,32" : "1.116,15", 145, bonus ? 315 : 398);
  add("Data da emissão", 15, bonus ? 365 : 455); add("08/10/2026", 145, bonus ? 365 : 455);
  add("Peso total pedido", 15, bonus ? 391 : 478); add(bonus ? "19,848" : "20,808", 145, bonus ? 391 : 478);
  return { entries, height, width: 842 * scale };
}

test("titulos dos prints classificam compra e bonificacao exclusivamente pelo cabecalho", () => {
  assert.equal(classifyNetworkOrderTitle("PEDIDO DE COMPRAS"), "order");
  assert.equal(classifyNetworkOrderTitle("PEDIDO DE BONIFICAÇÃO SEM INCID CUSTO-"), "bonification");
  assert.equal(classifyNetworkOrderTitle("produto de bonificação"), null);
  assert.equal(classifyNetworkOrderTitle("PEDIDO DE TRANSFERÊNCIA"), null);
});

test("layout de compra le CNPJ de faturamento, quatro produtos, custo bruto, emissao e peso", () => {
  for (const scale of [0.8, 1, 1.25]) {
    const page = martMinasPage(false, scale);
    const { order } = parseNetworkOrderPage(page.entries, page.height, page.width);
    assert.ok(order);
    assert.equal(order.documentType, "order");
    assert.equal(order.customerCnpj, "04737552002777");
    assert.equal(order.orderNumber, "6388346");
    assert.equal(order.lines.length, 4);
    assert.equal(order.issueDate, "2026-10-08");
    assert.equal(order.totalGrossWeight, 20.808);
    assert.equal(order.totalGrossValue, 1116.15);
    assert.equal(Math.round(order.lines.reduce((sum, line) => sum + line.grossLineTotal, 0) * 100), 111615);
  }
});

test("layout de bonificacao preserva primeiro produto acima do antigo limite e nao confunde preco com cancelamento", () => {
  for (const scale of [0.8, 1, 1.25]) {
    const page = martMinasPage(true, scale);
    const { order } = parseNetworkOrderPage(page.entries, page.height, page.width);
    assert.ok(order);
    assert.equal(order.documentType, "bonification");
    assert.equal(order.customerCnpj, "04737552001100");
    assert.equal(order.orderNumber, "6388108");
    assert.equal(order.lines.length, 2);
    assert.equal(order.lines[0].supplierCode, "02815");
    assert.equal(order.lines[0].canceledQuantity, 0);
    assert.equal(order.issueDate, "2026-10-08");
    assert.equal(order.totalGrossWeight, 19.848);
    assert.equal(order.totalGrossValue, 1055.32);
    assert.equal(Math.round(order.lines.reduce((sum, line) => sum + line.grossLineTotal, 0) * 100), 105532);
  }
});

test("PDF misto separa colecoes mesmo quando compra e bonificacao tem o mesmo numero", () => {
  const pages = [martMinasPage(false, 1, "1234567"), martMinasPage(true, 1, "1234567")];
  const parsed = pages.map((page) => parseNetworkOrderPage(page.entries, page.height, page.width).order);
  const clients = [{ ...customer, document: "04737552002777" }, { ...customer, id: "c2", document: "04737552001100" }];
  const products = ["13444", "13480", "02815", "00063"].map((code, index) => ({ ...product, id: `p${index}`, codeBox: code }));
  const orders = buildNetworkOrderImport(parsed, clients, products, []);
  const bonuses = buildNetworkBonificationImport(parsed, clients, products, []);
  assert.equal(orders.orders.length, 1);
  assert.equal(bonuses.bonifications.length, 1);
  assert.equal(orders.orders[0].totalValue, 1116.15);
  assert.equal(bonuses.bonifications[0].totalValue, 1055.32);
  assert.equal(orders.orders[0].customerId, "c1");
  assert.equal(bonuses.bonifications[0].customerId, "c2");
});

test("classificacao tolera letras e acentos separados pelo extrator de PDF", () => {
  assert.equal(classifyNetworkOrderTitle("PEDIDO DE BONIFICA Ç ÃO SEM INCID CUSTO-"), "bonification");
  assert.equal(classifyNetworkOrderTitle("P E D I D O D E B O N I F I C A Ç Ã O"), "bonification");
  assert.equal(classifyNetworkOrderTitle("PEDIDO DE COM PRA S"), "order");
  const page = martMinasPage(true);
  page.entries = page.entries.filter((item) => !item.str.startsWith("PEDIDO DE"));
  page.entries.push(
    { str: "PEDIDO DE BONIFICA", width: 110, transform: [1, 0, 0, 1, 15, page.height - 22] },
    { str: "Ç", width: 5, transform: [1, 0, 0, 1, 126, page.height - 24] },
    { str: "ÃO SEM INCID CUSTO-", width: 90, transform: [1, 0, 0, 1, 131, page.height - 24] },
  );
  const { order } = parseNetworkOrderPage(page.entries, page.height, page.width);
  assert.ok(order);
  assert.equal(order.documentType, "bonification");
  assert.equal(order.lines.length, 2);
});

test("importacao mista grava compra em orders e bonificacao em bonifications", async () => {
  const pages = [martMinasPage(false), martMinasPage(true)];
  const parsed = pages.map((page) => parseNetworkOrderPage(page.entries, page.height, page.width).order);
  const clients = [{ ...customer, document: "04737552002777" }, { ...customer, id: "c2", document: "04737552001100" }];
  const products = ["13444", "13480", "02815", "00063"].map((code, index) => ({ ...product, id: `p${index}`, codeBox: code }));
  const orders = buildNetworkOrderImport(parsed, clients, products, []);
  const bonuses = buildNetworkBonificationImport(parsed, clients, products, []);
  const writes = [];
  const store = mockStore({
    collection: (_db, name) => ({ collection: name }),
    doc: (dbOrCollection, collection, id) => collection ? ({ collection, id }) : ({ ...dbOrCollection, id: "generated" }),
    serverTimestamp: () => "timestamp",
    runTransaction: async (_db, callback) => callback({ get: async () => ({ exists: () => false }), set: (ref, value) => writes.push({ ref, value }) }),
    writeBatch: () => ({ set: (ref, value) => writes.push({ ref, value }), commit: async () => {} }),
  });
  await store.addOrders(orders.orders);
  await store.addBonifications(bonuses.bonifications);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].ref.collection, "orders");
  assert.equal(writes[0].value.preOrder, "6388346/L");
  assert.equal(writes[1].ref.collection, "bonifications");
  assert.equal(writes[1].value.bonusNumber, "6388108/L");
});

const { getExternalCustomerIds } = load("dashboard-scope");
const { buildMartMinasReport } = load("mart-minas-report");
test("relatorio da rede separa vendedores e reconcilia peso e financeiro", () => {
  const group = { id: "g1", name: "Mart Minas", externalStoreSellers: { c2: "Maria", c3: "João" } };
  const members = [customer, { ...customer, id: "c2" }, { ...customer, id: "c3" }].map((item) => ({ ...item, groupId: "g1" }));
  const order = (id, customerId, totalValue, totalWeight, status = "normal", issueDate = "2026-10-10") => ({ id, preOrder: id, customerId, totalValue, totalWeight, status, issueDate });
  const orders = [order("1", "c1", 100, 10), order("2", "c2", 200, 20), order("3", "c3", 300, 30), order("4", "outside", 900, 90), order("5", "c1", 40, 4, "wallet"), order("6", "c2", 50, 5, "normal", "2026-09-01")];
  const report = buildMartMinasReport(group, members, orders, "2026-10-01", "2026-10-31", "normal");
  assert.equal(report.ours.revenue, 100);
  assert.equal(report.external.revenue, 500);
  assert.equal(report.total.revenue, report.ours.revenue + report.external.revenue);
  assert.equal(report.total.weight, 60);
  assert.equal(report.total.orders, 3);
  assert.equal(report.sellers.length, 2);
  assert.equal(buildMartMinasReport(group, members, orders, "", "", "all").total.revenue, 690);
  assert.equal(buildMartMinasReport(group, members, orders, "", "", "wallet").total.revenue, 40);
  assert.equal(buildMartMinasReport(group, members, orders, "2026-10-10", "2026-10-10", "normal").total.orders, 3);
  assert.equal(buildMartMinasReport(group, members.filter((item) => item.id !== "c2"), orders, "2026-10-01", "2026-10-31", "normal").total.revenue, 400);
  assert.equal(buildMartMinasReport({ ...group, externalStoreSellers: {} }, members, orders, "2026-10-01", "2026-10-31", "normal").ours.revenue, 600);
});
test("dashboard exclui apenas lojas atribuídas a vendedores externos na rede atual", () => {
  const customers = [
    { ...customer, id: "ours", groupId: "g1" },
    { ...customer, id: "external", groupId: "g1" },
    { ...customer, id: "moved", groupId: "g2" },
    { ...customer, id: "ungrouped" },
  ];
  const groups = [{ id: "g1", name: "Rede", externalStoreSellers: { external: "Maria", moved: "João", ungrouped: "João" } }];
  assert.deepEqual([...getExternalCustomerIds(customers, groups)], ["external"]);
  assert.equal(getExternalCustomerIds(customers, [{ ...groups[0], externalStoreSellers: {} }]).size, 0);
  assert.equal(getExternalCustomerIds(customers, [{ id: "g1", name: "Rede antiga" }]).size, 0);
  assert.equal(getExternalCustomerIds(customers, []).size, 0);
});


test("Mart Minas preserves screenshot quantities, item prices and independent gross order total", () => {
  const header = { top: 180, items: [
    { x: 220, text: "Emb" }, { x: 284, width: 61, text: "QtdeQtd.Canc." },
    { x: 385, width: 20, text: "Valor" }, { x: 386, width: 18, text: "Unit." },
    { x: 435, width: 20, text: "Valor" }, { x: 473, width: 23, text: "Custo" }, { x: 518, width: 20, text: "Valor" },
  ] };
  const row = (top, code, quantity, price, gross) => ({ top, items: [
    { x: 15, text: code }, { x: 220, text: code === "4046" ? "KG" : "CX" }, { x: 294, width: 20, text: quantity },
    { x: 377, width: 35, text: price }, { x: 475, width: 32, text: gross },
  ] });
  const warnings = [];
  const lines = readOrderLines([header, row(215, "4046", "10,00", "62,0000", "639,53"), row(250, "2816", "1,00", "217,6800", "223,47")], warnings);
  assert.equal(warnings.length, 0);
  assert.deepEqual(Array.from(lines, line => line.quantity), [10, 1]);
  const products = [{ ...product, codeBox: "4046", weightPerBox: 10 }, { ...product, id: "p2", codeBox: "2816", quantityPerBox: 24 }];
  const result = buildNetworkOrderImport([{ ...pdf, lines, totalGrossValue: 863 }], [customer], products, []);
  const order = result.orders[0];
  assert.equal(order.totalValue, 863);
  assert.deepEqual(Array.from(order.items, item => item.boxQuantity), [1, 1]);
  assert.equal(order.items[1].unitQuantity, 24);
  assert.equal(order.items[0].unitPrice, 62);
  assert.equal(order.items[1].unitPrice, 217.68);
  assert.equal(Math.round(order.items.reduce((sum, item) => sum + item.subtotal, 0) * 100), 83768);
  const incomplete = buildNetworkOrderImport([{ ...pdf, lines, totalGrossValue: 863 }], [customer], products.slice(0, 1), []);
  assert.equal(incomplete.orders.length, 0);
});

const sulminasFixture = JSON.parse(fs.readFileSync(new URL("./fixtures/mart-minas-sulminas-ocr.json", import.meta.url), "utf8"));
function sulminasPages() {
  return sulminasFixture.pages.map((page) => parseNetworkOrderPage(ocrPageTextItems(page.data, page.height, page.scale), page.height, page.width));
}

test("PDF Sulminas: six real OCR pages produce four complete orders without footer errors", () => {
  const pages = sulminasPages();
  for (const index of [2, 5]) {
    assert.equal(pages[index].itemCount, 0);
    assert.equal(pages[index].warnings.length, 0);
  }
  const orders = assembleNetworkOrderPages(pages);
  assert.deepEqual(Array.from(orders, (order) => order.orderNumber), ["6388364", "6388365", "6388372", "6388373"]);
  assert.deepEqual(Array.from(orders, (order) => order.totalGrossValue), [863, 1116.15, 863, 1705.46]);
  assert.deepEqual(Array.from(orders, (order) => Array.from(order.lines, (line) => line.quantity)), [[10, 1], [1, 1, 2, 2], [10, 1], [2, 2, 3, 2]]);
  assert.deepEqual(Array.from(orders[0].lines, (line) => line.measure), ["KG", "CX"]);
  assert.equal(orders.flatMap((order) => order.warnings).length, 0);
  const notices = orders.flatMap((order) => order.notices ?? []);
  assert.equal(notices.length, 2);
  assert.ok(notices.some((notice) => notice.includes("página 3: Página em branco")));
  assert.ok(notices.some((notice) => notice.includes("página 6: Página em branco")));
  const clients = ["04737552005873", "04737552006411"].map((document, index) => ({ ...customer, id: `c${index}`, document }));
  const products = ["4046", "2816", "13444", "13480", "02815", "00063"].map((codeBox, index) => ({ ...product, id: `p${index}`, codeBox, weightPerBox: codeBox === "4046" ? 10 : 6 }));
  const imported = buildNetworkOrderImport(orders, clients, products, []);
  assert.equal(imported.orders.length, 4);
  assert.equal(imported.warnings.length, 0);
  assert.equal(imported.orders.flatMap((order) => order.items).length, 12);
  assert.deepEqual(Array.from(imported.orders[0].items, (item) => item.boxQuantity), [1, 1]);
  assert.deepEqual(Array.from(imported.orders[2].items, (item) => item.boxQuantity), [1, 1]);
  assert.equal(Math.round(imported.orders.reduce((sum, order) => sum + order.totalValue, 0) * 100), 454761);
});

test("Mart Minas KG rounds boxes using registered weight and preserves requested kg and prices", () => {
  const catalog = { ...product, weightPerBox: 10, quantityPerBox: 4 };
  for (const [quantity, boxes] of [[12, 1], [20, 2], [19.4, 2], [15, 2], [4, 1]]) {
    const parsed = { ...pdf, totalGrossValue: 999, lines: [{ ...pdf.lines[0], measure: "KG", quantity, unitPackagePrice: 62 }] };
    const result = buildNetworkOrderImport([parsed], [customer], [catalog], []);
    assert.equal(result.warnings.length, 0);
    const item = result.orders[0].items[0];
    assert.equal(item.boxQuantity, boxes);
    assert.equal(item.packageQuantity, boxes);
    assert.equal(item.unitQuantity, quantity);
    assert.equal(item.totalWeight, quantity);
    assert.equal(item.pieces, boxes * 4);
    assert.equal(item.unitPrice, 62);
    assert.equal(item.subtotal, Math.round(quantity * 62 * 100) / 100);
    assert.equal(result.orders[0].totalValue, 999);
  }
});

test("Mart Minas subtracts canceled kg before conversion and leaves CX quantities unchanged", () => {
  const catalog = { ...product, measure: "KG", weightPerBox: 10 };
  const kg = { ...pdf, lines: [{ ...pdf.lines[0], measure: "KG", quantity: 25, canceledQuantity: 13 }] };
  const converted = buildNetworkOrderImport([kg], [customer], [catalog], []).orders[0].items[0];
  assert.equal(converted.boxQuantity, 1);
  assert.equal(converted.unitQuantity, 12);
  assert.equal(converted.subtotal, 12 * 106);
  const cx = { ...pdf, lines: [{ ...pdf.lines[0], measure: "CX", quantity: 20 }] };
  assert.equal(buildNetworkOrderImport([cx], [customer], [catalog], []).orders[0].items[0].boxQuantity, 20);
  assert.equal(buildNetworkBonificationImport([{ ...kg, documentType: "bonification" }], [customer], [catalog], []).bonifications[0].items[0].boxQuantity, 1);
});

test("Mart Minas KG blocks missing or invalid box weights instead of guessing boxes", () => {
  const parsed = { ...pdf, lines: [{ ...pdf.lines[0], measure: "KG", quantity: 12 }] };
  for (const weightPerBox of [undefined, 0, -1, NaN, Infinity]) {
    const result = buildNetworkOrderImport([parsed], [customer], [{ ...product, weightPerBox }], []);
    assert.equal(result.orders.length, 0);
    assert.ok(result.warnings.some((warning) => warning.includes("peso por caixa")));
  }
});

test("Mart Minas reads joined KG1 and CX24 cells and blocks an unrecognized Emb", () => {
  const page = sulminasFixture.pages[0];
  const items = ocrPageTextItems(page.data, page.height, page.scale);
  const kg = items.find((item) => item.str === "KG");
  const cx = items.find((item) => item.str === "CX");
  assert.ok(kg && cx);
  kg.str = "KG1"; cx.str = "CX24";
  const parsed = parseNetworkOrderPage(items, page.height, page.width);
  assert.equal(parsed.warnings.length, 0);
  assert.deepEqual(Array.from(parsed.order.lines, (line) => line.measure), ["KG", "CX"]);
  kg.str = "UN";
  assert.ok(parseNetworkOrderPage(items, page.height, page.width).warnings.some((warning) => warning.includes("coluna Emb")));
});

test("footer-only recognition does not suppress broken product tables or missing order pages", () => {
  const page = sulminasFixture.pages[2];
  const footer = ocrPageTextItems(page.data, page.height, page.scale);
  const brokenTable = [...footer, { str: "Qtde", transform: [1, 0, 0, 1, 284, page.height - 178], width: 18 }];
  assert.ok(parseNetworkOrderPage(brokenTable, page.height, page.width).warnings.length > 0);
  assert.throws(() => assembleNetworkOrderPages([parseNetworkOrderPage(footer, page.height, page.width)]));
});

test("an empty page is reported as information without blocking complete orders", () => {
  const pages = sulminasPages();
  pages.splice(1, 0, parseNetworkOrderPage([], 595, 842));
  const orders = assembleNetworkOrderPages(pages);
  assert.equal(orders.length, 4);
  assert.equal(orders.flatMap((order) => order.warnings).length, 0);
  assert.ok(orders.flatMap((order) => order.notices ?? []).some((notice) => notice.includes("página 2: Página em branco")));
});

test("quantity OCR errors block an order when item multiplication or the quantity total differs", () => {
  const page = sulminasFixture.pages[0];
  const items = ocrPageTextItems(page.data, page.height, page.scale);
  const quantity = items.find((item) => item.str === "10,00" && item.transform[4] > 280 && item.transform[4] < 320);
  assert.ok(quantity);
  quantity.str = "1,00";
  const parsed = parseNetworkOrderPage(items, page.height, page.width);
  assert.ok(parsed.warnings.length > 0);
  const assembled = assembleNetworkOrderPages([parsed]);
  const result = buildNetworkOrderImport(assembled, [{ ...customer, document: "04737552005873" }], [{ ...product, codeBox: "2816" }], []);
  assert.equal(result.orders.length, 0);
});

test("original day-14 PDF text retains the two orders around a blank closing page", () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/mart-minas-day14-text.json", import.meta.url), "utf8"));
  const pages = fixture.pages.map((page) => parseNetworkOrderPage(page.items, page.height, page.width));
  assert.equal(pages[2].isBlankPage, true);
  assert.equal(pages[2].warnings.length, 0);
  const documents = assembleNetworkOrderPages(pages);
  assert.deepEqual(Array.from(documents, (document) => document.orderNumber), ["6388114", "6388115"]);
  assert.equal(documents.flatMap((document) => document.warnings).length, 0);
  assert.deepEqual(Array.from(documents[1].sourcePages), [2, 3]);
  assert.equal(documents[0].lines[0].quantity, 10);
  assert.equal(documents[0].lines[0].measure, "KG");
  // Closing-page recognition is independent of page scale and signature position.
  const moved = fixture.pages[2].items.map((item) => ({ ...item, transform: item.transform.map((value, index) => index === 5 ? value - 100 : value) }));
  assert.equal(parseNetworkOrderPage(moved, fixture.pages[2].height, fixture.pages[2].width).isBlankPage, true);
});

test("document review accounts separately for ready, duplicate and blocked documents and kg conversion", () => {
  const parsed = [{ ...pdf, sourcePages: [1, 2], lines: [{ ...pdf.lines[0], quantity: 12, measure: "KG" }] },
    { ...pdf, orderNumber: "6388343" }, { ...pdf, orderNumber: "6388344" }];
  const products = [{ ...product, weightPerBox: 10 }];
  const prepared = buildNetworkOrderImport([parsed[0]], [customer], products, []).orders;
  const review = networkImportReview(parsed, prepared, [], ["Pedido 6388343/L: já existe no CRM.", "Pedido 6388344/L: produto não cadastrado."], [customer], products);
  assert.match(review, /Documentos identificados: 3 \| Prontos: 1 \| Já existentes: 1 \| Bloqueados: 1/);
  assert.match(review, /Páginas: 1, 2/);
  assert.match(review, /Qtde PDF 12; cancelada 0; peso cadastrado por embalagem 10 kg; caixas CRM 1/);
  assert.match(review, /6388343\/L.*JÁ EXISTE NO CRM/);
  assert.match(review, /6388344\/L.*BLOQUEADO/);
});
