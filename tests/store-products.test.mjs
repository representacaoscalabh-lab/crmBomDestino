import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
function load(name, resolve = require) {
  const code = ts.transpileModule(fs.readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, resolve);
  return exports;
}
const { buildStoreProducts } = load('lib/store-products.ts');
const exports = load('lib/store-report-export.ts');
const group = { id: 'g', name: 'Mart Minas', externalStoreSellers: { b: 'Sul de Minas' } };
const customers = [{ id: 'a', groupId: 'g', name: 'Loja A', code: '001', store: '01', city: 'BH' }, { id: 'b', groupId: 'g', name: 'Loja B', code: '002', store: '02' }];
const products = [{ id: 'p', codeBox: '0001', codeHalfBox: '0001M', description: 'Queijo' }, { id: 'q', codeBox: '0002', description: 'Manteiga' }];
const item = (quantity, extra = {}) => ({ productId: 'p', productCode: '0001', description: 'Queijo', unitQuantity: quantity, packageQuantity: 1, packagePrice: quantity * 10, subtotal: quantity * 10, totalWeight: quantity * 2, ...extra });
const order = (date, quantity, extra = {}) => ({ customerId: 'a', issueDate: date, status: 'normal', items: [item(quantity)], ...extra });
const report = (orders, end = '2026-12-20', scope = 'ours') => buildStoreProducts(customers, group, products, orders, end, scope);
const row = data => data.rows.find(row => row.productId === 'p' && row.customerId === 'a');
test('produtos por loja consolida caixa/meia caixa, compara unidades e reconcilia financeiro', () => {
  const result = report([order('2026-11-10', 10), order('2026-11-25', 100), order('2026-12-10', 15), order('2026-12-11', 5, { items: [item(5, { productId: '', productCode: '0001M' })] }), order('2026-12-25', 1000)]);
  assert.equal(row(result).quantity, 20);
  assert.equal(row(result).previous, 10);
  assert.equal(row(result).growth, 100);
  assert.equal(row(result).state, 'Cresceu');
  assert.equal(row(result).weight, 40);
  assert.equal(row(result).revenue, 200);
  assert.deepEqual(row(result).history, [0, 110]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].state, 'Sem compra');
});
test('classifica queda, estabilidade, sem recompra, retomada e primeira compra registrada', () => {
  for (const [orders, state] of [
    [[order('2026-11-10', 10), order('2026-12-10', 5)], 'Queda'],
    [[order('2026-11-10', 10), order('2026-12-10', 10)], 'Sem alteração'],
    [[order('2026-11-10', 10)], 'Sem recompra'],
    [[order('2026-10-10', 10), order('2026-12-10', 10)], 'Retomou a compra'],
    [[order('2026-12-10', 10)], 'Primeira compra registrada'],
  ]) assert.equal(row(report(orders)).state, state);
  const initial = row(report([order('2026-09-10', 100), order('2026-10-10', 10)], '2026-10-20'));
  assert.equal(initial.state, 'Sem comparação');
  assert.equal(initial.growth, null);
  assert.equal(initial.quantity, 10);
});
test('recorta responsavel e nao inclui pedidos fora da base ou do periodo', () => {
  const data = report([order('2026-12-10', 10), order('2026-12-10', 30, { customerId: 'b' }), order('2026-12-10', 1000, { customerId: 'outside' }), order('2026-12-10', 1000, { status: 'wallet' })], '2026-12-20', 'all');
  assert.equal(data.rows.reduce((sum, row) => sum + row.quantity, 0), 40);
  assert.equal(report([order('2026-12-10', 30, { customerId: 'b' })], '2026-12-20', 'external').rows[0].quantity, 30);
});
test('XLS de produtos preserva unidades, codigos, status, periodos e resumo por loja', () => {
  const XLS = require('@e965/xlsx');
  const data = report([order('2026-11-10', 10), order('2026-12-10', 20)]);
  const rows = [row(data)];
  const book = exports.createProductsWorkbook(data, rows, 'WRRJ', 'Loja A');
  const read = XLS.read(XLS.write(book, { bookType: 'biff8', type: 'buffer' }), { type: 'buffer' });
  assert.deepEqual(read.SheetNames, ['Resumo', 'Detalhamento', 'Resumo por loja', 'Quantidades por loja']);
  const values = XLS.utils.sheet_to_json(read.Sheets.Detalhamento, { header: 1 });
  const cell = title => values[1][values[0].indexOf(title)];
  assert.equal(cell('Código cliente'), '001');
  assert.equal(cell('Código produto'), '0001');
  assert.equal(cell('Atual (un.)'), 20);
  assert.equal(cell('Crescimento (%)'), 1);
  assert.equal(cell('Valor atual'), 200);
  assert.equal(cell('Situação'), 'Cresceu');
  assert.equal(read.Sheets['Resumo por loja'].E2.v, 200);
  assert.equal(read.Sheets['Quantidades por loja'].E2.v, 20);
});
test('XLS de crescimento segue meses ativos e nao fabrica comparacao inicial', () => {
  const { buildStoreGrowth } = load('lib/store-growth.ts');
  const data = buildStoreGrowth(customers, group, [{ customerId: 'a', issueDate: '2026-10-10', status: 'normal', totalWeight: 30, totalValue: 300 }], '2026-10-01', '2026-10-20', 'ours');
  const book = exports.createGrowthWorkbook(data.rows, data.months, '2026-10-01', '2026-10-20', 'WRRJ', '');
  assert.equal(book.Sheets.Detalhamento.H2.v, 30);
  assert.equal(book.Sheets.Detalhamento.L2.v, 300);
  assert.ok(!book.Sheets.Detalhamento.J2);
  assert.throws(() => exports.createReportWorkbook('Teste', [], ['A'], Array(65535).fill([1])), /65.534/);
});
test('produtos por loja renderiza tabela, filtros e exportacao no inicio do historico', () => {
  const model = load('lib/store-products.ts');
  const sorting = load('components/sort-heading.tsx');
  const { StoreProductsReport } = load('components/store-products-report.tsx', id => id === '@/lib/store-products' ? model : id === '@/components/sort-heading' ? sorting : id === '@/lib/mart-minas-analytics' ? { saoPauloToday: () => '2026-10-20' } : require(id));
  const html = renderToStaticMarkup(React.createElement(StoreProductsReport, { customers, group, products, orders: [order('2026-10-10', 10)], end: '2026-10-20', scope: 'ours', sidebar: null, onMonthChange: () => {} }));
  assert.match(html, /Produtos por loja/);
  assert.match(html, /Exportar XLS/);
  assert.match(html, /Ver produtos/);
  assert.doesNotMatch(html, /role="dialog"/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});


test('XLS separa matriz com mais de 200 produtos para respeitar limite do formato', () => {
  const XLS = require('@e965/xlsx');
  const productList = Array.from({ length: 205 }, (_, index) => ({ id: `p${index}`, codeBox: String(index).padStart(4, '0'), description: `Produto ${index}` }));
  const data = buildStoreProducts(customers, group, productList, [], '2026-10-20', 'ours');
  const book = exports.createProductsWorkbook(data, data.rows, 'WRRJ', 'Todos');
  assert.ok(book.Sheets['Quantidades 1']);
  assert.ok(book.Sheets['Quantidades 2']);
  const roundtrip = XLS.read(XLS.write(book, { bookType: 'biff8', type: 'buffer' }), { type: 'buffer' });
  assert.equal(XLS.utils.sheet_to_json(roundtrip.Sheets['Quantidades 1'], { header: 1 })[0].length, 204);
  assert.equal(XLS.utils.sheet_to_json(roundtrip.Sheets['Quantidades 2'], { header: 1 })[0].length, 9);
});


test('resumo de produtos exibe cada loja uma vez e reconcilia quantidades e valores', () => {
  const { summarizeStoreProducts } = load('lib/store-products.ts');
  const data = report([order('2026-11-10', 10), order('2026-12-10', 20), order('2026-12-10', 3, { items: [item(3, { productId: 'q', productCode: '0002', description: 'Manteiga' })] })]);
  const summaries = summarizeStoreProducts(data.rows);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].items.length, 2);
  assert.equal(summaries[0].products, 2);
  assert.equal(summaries[0].quantity, 23);
  assert.equal(summaries[0].revenue, 230);
  assert.equal(summaries[0].weight, 46);
  assert.equal(summaries[0].id, 'a');
  assert.equal(summarizeStoreProducts(data.rows.filter(row => row.productId === 'q'))[0].quantity, 3);
});
test('detalhes do modal mostram apenas produtos da loja e permitem XLS individual', () => {
  const model = load('lib/store-products.ts');
  const sorting = load('components/sort-heading.tsx');
  const { StoreProductDetails } = load('components/store-products-report.tsx', id => id === '@/lib/store-products' ? model : id === '@/components/sort-heading' ? sorting : id === '@/lib/mart-minas-analytics' ? { saoPauloToday: () => '2026-10-20' } : require(id));
  const data = report([order('2026-10-10', 10)], '2026-10-20');
  const store = model.summarizeStoreProducts(data.rows)[0];
  const html = renderToStaticMarkup(React.createElement(StoreProductDetails, { store, hasComparison: false, month: '2026-10', exporting: false, error: '', onClose: () => {}, onExport: () => {} }));
  assert.match(html, /Loja A/);
  assert.match(html, /Queijo/);
  assert.match(html, /XLS desta loja/);
  assert.match(html, /Sem compara\u00e7\u00e3o/);
  assert.doesNotMatch(html, /Loja B|NaN|Infinity|undefined/);
});


test('relatorio consolidado soma embalagens e usa preco do ultimo pedido sem perder descontos', () => {
  const { buildNetworkProducts } = load('lib/network-products.ts');
  const source = [
    { ...order('2026-10-10', 10), id: 'o1', preOrder: '10', customerName: 'Loja A', store: '01', items: [item(10, { packageKind: 'Caixa', packageQuantity: 2, unitPrice: 10, discountPercent: 10, subtotal: 90 })] },
    { ...order('2026-10-15', 5), id: 'o2', preOrder: '11', customerName: 'Loja A', store: '01', items: [item(5, { packageKind: 'Meia caixa', unitPrice: 12, subtotal: 60 })] },
    { ...order('2026-10-25', 1000), id: 'future', preOrder: '99' },
  ];
  const rows = buildNetworkProducts(customers, group, products, source, '2026-10-01', '2026-10-20', 'ours');
  const row = rows.find(row => row.id === 'p');
  assert.equal(row.units, 15); assert.equal(row.boxes, 2); assert.equal(row.halfBoxes, 1);
  assert.equal(row.value, 150); assert.equal(row.lastUnitPrice, 12); assert.equal(row.lastValue, 60);
  assert.equal(row.orders, 2); assert.equal(row.stores, 1); assert.equal(row.lastOrder, '11');
  const book = exports.createNetworkProductsWorkbook(rows, '2026-10-01', '2026-10-20', 'WRRJ', 'Todos');
  assert.equal(book.Sheets.Detalhamento.A2.v, '0001');
  assert.equal(book.Sheets.Detalhamento.C2.v, 12);
  assert.equal(book.Sheets.Detalhamento.D2.v, 150);
  const past = buildNetworkProducts(customers, group, products, source, '2026-11-01', '2026-11-20', 'ours')[0];
  assert.equal(past.value, 0); assert.equal(past.lastDate, '2026-10-25');
});


test('ultimo preco consolida linhas do mesmo produto e da meia caixa com media ponderada', () => {
  const { buildNetworkProducts } = load('lib/network-products.ts');
  const source = [{ id: 'last', preOrder: '10', customerId: 'a', customerName: 'Loja A', store: '01', status: 'normal', issueDate: '2026-10-10', items: [item(10, { unitPrice: 5, subtotal: 50, packageKind: 'Caixa' }), item(30, { productId: '', productCode: '0001M', unitPrice: 9, subtotal: 270, packageKind: 'Meia caixa' })] }];
  const result = buildNetworkProducts(customers, group, products, source, '2026-10-01', '2026-10-20', 'ours');
  assert.equal(result[0].lastUnitPrice, 8);
  assert.equal(result[0].lastUnits, 40);
  assert.equal(result[0].value, 320);
  assert.equal(result[0].orders, 1);
  assert.equal(result[1].lastUnitPrice, null);
});
test('relatorio de produtos renderiza embalagem, peso, preco e exportacao', () => {
  const model = load('lib/network-products.ts');
  const sorting = load('components/sort-heading.tsx');
  const { NetworkProductsReport } = load('components/network-products-report.tsx', id => id === '@/lib/network-products' ? model : id === '@/components/sort-heading' ? sorting : require(id));
  const html = renderToStaticMarkup(React.createElement(NetworkProductsReport, { customers, group, products, orders: [{ ...order('2026-10-10', 10), id: '1', preOrder: '1', customerName: 'Loja A', store: '01' }], start: '2026-10-01', end: '2026-10-20', scope: 'ours', sidebar: null }));
  assert.match(html, /Exportar XLS/);
  assert.match(html, /Meias caixas/);
  assert.match(html, /Unidades/);
  assert.match(html, /Queijo/);
  assert.doesNotMatch(html, /NaN|undefined|Infinity/);
});

test('dashboard de comissoes mostra somente Mart Minas e separa WRRJ e Sul', () => {
  const commission = load('lib/network-commission.ts');
  const scope = load('lib/dashboard-scope.ts');
  const dashboard = load('lib/dashboard-commission.ts', id => id === '@/lib/dashboard-scope' ? scope : commission);
  const { DashboardCommission } = load('components/dashboard-commission.tsx', id => id === '@/lib/dashboard-commission' ? dashboard : id === '@/lib/mart-minas-settings' ? { useMartMinasSettings: () => ({ groupId: group.id, loading: false }) } : id.endsWith('.css') ? {} : require(id));
  for (const [orders, groups, expected] of [
    [[{ customerId: 'a', status: 'normal', totalValue: 100 }], [{ ...group, commissionPercent: 4 }], 'WRRJ + Sul de Minas no per\u00edodo selecionado.'],
    [[{ customerId: 'a', status: 'normal', totalValue: 100 }], [group], 'Percentual de comiss\u00e3o n\u00e3o configurado'],
    [[], [{ ...group, commissionPercent: 4 }], 'Nenhum pedido no per\u00edodo'],
  ]) {
    const html = renderToStaticMarkup(React.createElement(DashboardCommission, { customers, groups, orders }));
    assert.ok(html.includes(expected));
    assert.match(html, /Comiss\u00e3o WRRJ/);
    assert.match(html, /Comiss\u00e3o Sul de Minas/);
    assert.doesNotMatch(html, /<table|<details|NaN|Infinity|undefined/);
  }
});

test('dashboard prioriza indicadores e recolhe analises sem exibir metas ou status ficticios', () => {
  const scope = load('lib/dashboard-scope.ts');
  const date = new Date();
  const issueDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  const source = { customers, customerGroups: [group], products, orders: [{ ...order(issueDate, 10), id: 'dashboard', preOrder: '1', totalWeight: 20, totalValue: 100, customerName: 'Loja A' }], bonifications: [] };
  const { default: HomePage } = load('app/page.tsx', id => id === '@/lib/use-dashboard-records' ? { useDashboardRecords: resource => ({ rows: source[resource], loading: false }) } : id === '@/lib/store' ? { useCrmStore: () => source } : id === '@/lib/dashboard-scope' ? scope : id === '@/components/dashboard-commission' ? { DashboardCommission: () => React.createElement('section', null, 'Comissoes') } : id.endsWith('.css') ? {} : require(id));
  const html = renderToStaticMarkup(React.createElement(HomePage));
  assert.match(html, /Valor dos pedidos/);
  assert.match(html, /Produtos mais vendidos/);
  assert.match(html, /Mais análises/);
  assert.match(html, /Personalizar/);
  assert.doesNotMatch(html, /Dados do Firestore|0 metas ativas|Nenhuma meta ativa|Colunas|NaN|Infinity|undefined/);
  assert.match(html, /<details class="panel dash-more-analysis">/);
});

test('resumo de comissao usa total completo da rede mesmo quando a tabela mostra somente Sul', () => {
  const commission = load('lib/network-commission.ts');
  const sorting = load('components/sort-heading.tsx');
  const { NetworkCommissionReport } = load('components/network-commission-report.tsx', id => id === '@/lib/network-commission' ? commission : id === '@/components/sort-heading' ? sorting : id.endsWith('.css') ? {} : require(id));
  const allStores = customers.map((customer, index) => ({ customer, seller: index ? 'Sul de Minas' : '', current: { revenue: (index + 1) * 1000, orders: 1 } }));
  const html = renderToStaticMarkup(React.createElement(NetworkCommissionReport, { group: { ...group, commissionPercent: 4, sellerCommissionPercent: 1 }, report: { stores: [allStores[1]], allStores, currentPeriod: { start: '2026-10-01', end: '2026-10-20' } }, scopeLabel: 'Sul de Minas', status: 'normal', sidebar: React.createElement('span', null, 'Filtros') }));
  const total = html.match(/commission-overview-total[\s\S]*?<strong>(.*?)<\/strong>/)?.[1];
  assert.ok(total?.includes('60,00'));
  assert.match(html, /Mais filtros/);
  assert.match(html, /Exportar XLS/);
  assert.doesNotMatch(html, /Uma comissão por loja|NaN|Infinity|undefined/);
});

test('dashboard isola Mart Minas de outras redes e clientes gerais', () => {
  const commission = load('lib/network-commission.ts');
  const scope = load('lib/dashboard-scope.ts');
  const model = load('lib/dashboard-commission.ts', id => id === '@/lib/dashboard-scope' ? scope : commission);
  const { DashboardCommission } = load('components/dashboard-commission.tsx', id => id === '@/lib/dashboard-commission' ? model : id === '@/lib/mart-minas-settings' ? { useMartMinasSettings: () => ({ groupId: 'g1', loading: false }) } : id.endsWith('.css') ? {} : require(id));
  const clients = [{ id: 'a', groupId: 'g1' }, { id: 'b', groupId: 'g2' }, { id: 'c' }];
  const groups = [{ id: 'g1', name: 'Mart Minas', commissionPercent: 4 }, { id: 'g2', name: 'Outra rede', commissionPercent: 2 }];
  const orders = clients.map(client => ({ customerId: client.id, status: 'normal', totalValue: 1000 }));
  const html = renderToStaticMarkup(React.createElement(DashboardCommission, { customers: clients, groups, orders }));
  assert.match(html, /Mart Minas/);
  assert.match(html, /40,00/);
  assert.doesNotMatch(html, /Outra rede|Gerais|Clientes sem rede|60,00|NaN|undefined/);
});
