import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(path, require = () => ({})) {
  const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, require);
  return exports;
}
const lib = load('../src/lib/network-commission.ts');
const store = (id, seller) => ({ customer: { id, name: id, code: id, store: '', city: '' }, seller, current: { revenue: 23000, orders: 1 } });
test('comissao pertence exclusivamente ao responsavel pela loja', () => {
  const rows = lib.buildNetworkCommission([store('nossa', ''), store('vendedor', 'Ana')], 4, 1, 'orders');
  assert.deepEqual(rows.map(r => [r.percent, r.commission, r.sellerPercent, r.sellerCommission]), [[4, 920, 0, 0], [0, 0, 1, 230]]);
  assert.equal(lib.sumCommissionRows(rows).commission, 920);
  assert.equal(lib.sumCommissionRows(rows).sellerCommission, 230);
});
test('percentual ausente nao cria comissao para outro responsavel', () => {
  const rows = lib.buildNetworkCommission([store('nossa', ''), store('vendedor', 'Ana')], 4);
  assert.equal(rows[0].sellerCommission, 0);
  assert.equal(rows[1].commission, 0);
  assert.equal(rows[1].sellerCommission, null);
});
test('dashboard da nossa carteira nao calcula comissao de vendedor', () => {
  const scope = load('../src/lib/dashboard-scope.ts');
  const dashboard = load('../src/lib/dashboard-commission.ts', id => id.endsWith('dashboard-scope') ? scope : lib);
  const data = dashboard.buildDashboardCommission([{ id: 'a', groupId: 'g' }, { id: 'b', groupId: 'g' }], [{ id: 'g', name: 'Rede', commissionPercent: 4, sellerCommissionPercent: 1, externalStoreSellers: { b: 'Ana' } }], ['a', 'b'].map(customerId => ({ customerId, status: 'normal', totalValue: 23000 })));
  assert.equal(data.commission, 920);
  assert.equal(data.sellerCommission, 0);
  assert.equal(data.pendingSellerStores, 0);
});


test('pedidos antigos passam a ser pedidos comuns sem perder dados', () => {
  const { normalizeOrder } = load('../src/lib/order-status.ts');
  const legacy = { id: 'antigo', status: 'wallet', totalValue: 23000, items: [{ productId: 'p1' }] };
  const normalized = normalizeOrder(legacy);
  assert.deepEqual(normalized, { ...legacy, status: 'normal' });
  assert.equal(legacy.status, 'wallet');
  assert.deepEqual(normalizeOrder(normalized), normalized);
});

test('telas nao oferecem mais pedidos em carteira', () => {
  for (const file of ['../src/app/pedidos/page.tsx', '../src/components/commercial-report-center.tsx', '../src/app/relatorios/oesa-nova-safra/page.tsx', '../src/components/app-shell.tsx', '../src/app/page.tsx']) {
    const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /value="wallet"|Em carteira|em carteira|href: "\/carteira"|walletOrders/);
  }
});

test('crescimento usa peso e media fixa dos tres meses anteriores, inclusive meses zerados', () => {
  const { buildStoreGrowth } = load('../src/lib/store-growth.ts');
  const customers = ['a', 'b', 'c'].map(id => ({ id, groupId: 'g', name: id }));
  const group = { id: 'g', externalStoreSellers: { b: 'Ana' } };
  const order = (customerId, issueDate, totalWeight, totalValue = 100) => ({ customerId, issueDate, totalWeight, totalValue, status: 'normal' });
  const orders = [order('a', '2026-10-10', 30), order('a', '2026-11-10', 60), order('a', '2026-12-10', 90), order('a', '2027-01-10', 90, 999), order('a', '2027-01-25', 900), order('b', '2026-12-10', 30), order('c', '2027-01-10', 5)];
  const result = buildStoreGrowth(customers, group, orders, '2027-01-01', '2027-01-20', 'all');
  assert.deepEqual(result.months, ['2026-10', '2026-11', '2026-12']);
  assert.equal(result.rows[0].average, 60);
  assert.equal(result.rows[0].growth, 50);
  assert.equal(result.rows[0].revenue, 999);
  assert.equal(result.rows[0].averageRevenue, 100);
  assert.equal(result.rows[1].average, 10);
  assert.equal(result.rows[1].growth, -100);
  assert.equal(result.rows[1].trend, 'down');
  assert.equal(result.rows[2].growth, null);
  assert.equal(buildStoreGrowth(customers, group, [], '2027-01-01', '2027-01-20', 'ours').rows[0].trend, 'flat');
  assert.deepEqual(buildStoreGrowth(customers, group, [], '2027-01-01', '2027-01-20', 'ours').months, ['2026-10', '2026-11', '2026-12']);
  assert.deepEqual(buildStoreGrowth(customers, group, orders, '2027-01-01', '2027-01-20', 'external').rows.map(r => r.id), ['b']);
});


test('historico do Mart Minas inicia em outubro sem criar comparacao inexistente', () => {
  const { buildStoreGrowth } = load('../src/lib/store-growth.ts');
  const customers = [{ id: 'a', groupId: 'g', name: 'Loja' }];
  const group = { id: 'g' };
  const orders = [{ customerId: 'a', issueDate: '2026-10-10', totalWeight: 60, totalValue: 600, status: 'normal' }];
  const october = buildStoreGrowth(customers, group, orders, '2026-10-01', '2026-10-20', 'ours');
  assert.deepEqual(october.months, []);
  assert.equal(october.rows[0].growth, null);
  assert.equal(october.rows[0].trend, 'none');
  assert.equal(october.rows[0].hasComparison, false);
  assert.equal(october.rows[0].weight, 60);
  const november = buildStoreGrowth(customers, group, orders, '2026-11-01', '2026-11-20', 'ours');
  assert.deepEqual(november.months, ['2026-10']);
  assert.equal(november.rows[0].average, 60);
  assert.equal(november.rows[0].growth, -100);
});

test('meses de comparacao podem ser reordenados ou inativados sem duplicar a media', () => {
  const { buildStoreGrowth } = load('../src/lib/store-growth.ts');
  const customers = [{ id: 'a', name: 'Loja', groupId: 'g' }];
  const orders = ['2026-10', '2026-11', '2026-12'].map((month, index) => ({ customerId: 'a', status: 'normal', issueDate: `${month}-10`, totalWeight: (index + 1) * 30, totalValue: (index + 1) * 300 }));
  const build = months => buildStoreGrowth(customers, { id: 'g' }, orders, '2027-01-01', '2027-01-20', 'ours', months);
  const reordered = build(['2026-12', '', '2026-10']);
  assert.deepEqual(reordered.months, ['2026-12', '2026-10']);
  assert.deepEqual(reordered.rows[0].history, [90, 30]);
  assert.equal(reordered.rows[0].average, 60);
  assert.equal(reordered.rows[0].averageRevenue, 600);
  assert.equal(build(['', '', '']).rows[0].hasComparison, false);
  assert.deepEqual(build(['2026-10', '2026-10', '2027-01']).months, ['2026-10']);
});

test('responsaveis antigos sao consolidados em Sul de Minas sem alterar a rede', () => {
  const { normalizeCustomerGroup } = load('../src/lib/responsibility.ts');
  const group = { id: 'g', name: 'Mart Minas', commissionPercent: 4, externalStoreSellers: { a: 'Ana', b: 'Fabrica', c: 'Sul de Minas', d: ' ' } };
  const result = normalizeCustomerGroup(group);
  assert.deepEqual(result.externalStoreSellers, { a: 'Sul de Minas', b: 'Sul de Minas', c: 'Sul de Minas' });
  assert.equal(result.commissionPercent, 4);
  assert.equal(group.externalStoreSellers.a, 'Ana');
  assert.deepEqual(normalizeCustomerGroup(result), result);
});

test('resumo consolidado soma WRRJ e Sul de Minas apenas da rede selecionada', () => {
  const scope = load('../src/lib/dashboard-scope.ts');
  const dashboard = load('../src/lib/dashboard-commission.ts', id => id.endsWith('dashboard-scope') ? scope : lib);
  const customers = [{ id: 'a', groupId: 'g' }, { id: 'b', groupId: 'g' }, { id: 'c', groupId: 'other' }];
  const group = { id: 'g', commissionPercent: 4, sellerCommissionPercent: 1, externalStoreSellers: { b: 'Sul de Minas' } };
  const orders = ['a', 'b', 'c'].map(customerId => ({ customerId, status: 'normal', totalValue: 23000 }));
  const result = dashboard.buildNetworkDashboardCommission(customers, group, orders);
  assert.equal(result.commission, 920);
  assert.equal(result.sellerCommission, 230);
  assert.equal(result.total, 1150);
  assert.equal(result.base, 46000);
  assert.equal(result.stores, 2);
  assert.equal(result.orders, 2);
  const representation = dashboard.buildNetworkDashboardCommission(customers, { ...group, sellerCommissionPercent: 10, sellerCommissionBase: 'representation' }, orders);
  assert.equal(representation.sellerCommission, 92);
  assert.equal(representation.total, 1012);
  const pending = dashboard.buildNetworkDashboardCommission(customers, { ...group, sellerCommissionPercent: undefined }, orders);
  assert.equal(pending.pendingStores, 1);
  assert.equal(pending.total, 920);
});
