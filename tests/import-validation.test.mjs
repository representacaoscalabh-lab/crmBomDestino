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
const { readOrderLines, parseNetworkOrderPage, classifyNetworkOrderTitle, buildNetworkOrderImport, buildNetworkBonificationImport } = load("network-order-pdf");
const customer = { id: "c1", code: "21000", name: "Loja", document: "04.737.552/0015-33", store: "1", city: "Alfenas", status: "Ativo" };
const row = (document, name = "Loja", code = "21000") => ({ "Código": code, Cliente: name, CNPJ: document });
const product = { id: "p1", description: "Produto", codeBox: "13444", codeHalfBox: "13444-M", quantityPerBox: 12, weightPerBox: 6, pricePerBox: 102, status: "Ativo" };
const pdf = { orderNumber: "6388342", customerCnpj: "04737552001533", issueDate: "2026-10-08", documentType: "order", documentTitle: "PEDIDO DE COMPRAS", lines: [{ supplierCode: "13444", quantity: 2, canceledQuantity: 0, unitPackagePrice: 106 }] };

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
  const line = { top: 215, items: [{ x: 15, text: "13444" }, { x: 280, text: "2,00" }, { x: 390, text: "102,0000" }, { x: 459, width: 28, text: "212,00" }] };
  const warnings = [];
  const result = readOrderLines([header, line, { ...line, items: line.items.filter((item) => item.x !== 459) }], warnings);
  assert.equal(result.length, 1);
  assert.equal(result[0].unitPackagePrice, 106);
  assert.match(warnings[0], /13444.*Custo Bruto/);
  const canceled = { ...line, items: [...line.items, { x: 330, text: "3,00" }] };
  assert.equal(readOrderLines([header, canceled], warnings).length, 0);
});

test("pedidos e bonificacoes mantem custo bruto, quantidade, peso e avisos", () => {
  const parsed = { ...pdf, warnings: ["Pedido: item inválido ignorado"] };
  const result = buildNetworkOrderImport([parsed], [customer], [product], []);
  assert.equal(result.orders[0].totalValue, 212);
  assert.equal(result.orders[0].totalWeight, 12);
  assert.equal(result.orders[0].items[0].unitQuantity, 24);
  assert.ok(result.warnings.includes(parsed.warnings[0]));
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
  const filename = path.resolve(testRoot, "..", "src", "lib", "store.tsx");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require: (id) => {
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
    add(code, 15, top, 22); add(quantity, 294, top, 20);
    add("0,00", 325, top, 20); add(unitPrice, 377, top, 35);
    add("0,00", 435, top, 25); add(gross, 475, top, 32); add("0,00", 520, top, 20);
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
    assert.equal(Math.round(order.lines.reduce((sum, line) => sum + line.quantity * line.unitPackagePrice, 0) * 100), 111615);
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
    assert.equal(Math.round(order.lines.reduce((sum, line) => sum + line.quantity * line.unitPackagePrice, 0) * 100), 105532);
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
