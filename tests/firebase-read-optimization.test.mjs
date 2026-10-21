import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const core = require('../functions/aggregate-core.cjs');

function load(file, resolve = require) {
  const code = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, resolve);
  return exports;
}
const { QueryCache } = load('src/lib/query-cache.ts');
const matching = load('src/lib/record-query.ts');

test('cache compartilha requests simultaneos e invalidacao impede repor resposta antiga', async () => {
  const cache = new QueryCache();
  let finish, reads = 0;
  const loader = () => { reads++; return new Promise(resolve => { finish = resolve; }); };
  const first = cache.read('orders:u:period', loader);
  const second = cache.read('orders:u:period', loader);
  await Promise.resolve();
  assert.equal(reads, 1);
  cache.invalidate('orders:');
  assert.equal(await cache.read('orders:u:period', async () => 'new'), 'new');
  finish('old');
  assert.equal(await first, 'old'); assert.equal(await second, 'old');
  assert.equal(await cache.read('orders:u:period', async () => 'wrong'), 'new');
});

test('cache nao retém falhas e separa usuarios', async () => {
  const cache = new QueryCache();
  await assert.rejects(cache.read('customers:a', async () => { throw new Error('offline'); }));
  assert.equal(await cache.read('customers:a', async () => 1), 1);
  assert.equal(await cache.read('customers:b', async () => 2), 2);
  cache.clear();
  assert.equal(await cache.read('customers:a', async () => 3), 3);
});

function mockClient(records) {
  const cache = new QueryCache();
  let reads = 0;
  const sdk = {
    collection: (_db, name) => name, documentId: () => '__name__',
    query: (name, ...constraints) => ({ name, constraints }),
    where: (field, op, value) => ({ kind: 'where', field, op, value }),
    orderBy: (field, direction) => ({ kind: 'order', field, direction }),
    startAfter: (value, id) => ({ kind: 'cursor', value, id }),
    limit: value => ({ kind: 'limit', value }),
    getDocs: async ({ name, constraints }) => {
      if (name !== 'orders') return { docs: [], size: 0 };
      let values = records.filter(row => constraints.filter(c => c.kind === 'where').every(c => c.op === '>=' ? row[c.field] >= c.value : row[c.field] <= c.value));
      values.sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.id.localeCompare(a.id));
      const cursor = constraints.find(c => c.kind === 'cursor');
      if (cursor) values = values.filter(row => row.issueDate < cursor.value || row.issueDate === cursor.value && row.id < cursor.id);
      const size = constraints.find(c => c.kind === 'limit');
      assert.ok(size, 'Historical record reads must have a limit');
      values = values.slice(0, size.value);
      reads += values.length;
      return { docs: values.map(value => ({ id: value.id, data: () => value })), size: values.length };
    },
  };
  const lib = load('src/lib/client-record-query.ts', id => id === 'firebase/firestore' ? sdk : id === '@/lib/firebase' ? { db: {}, auth: { currentUser: { uid: 'u' } } } : id === '@/lib/query-cache' ? { crmQueryCache: cache } : matching);
  return { ...lib, reads: () => reads };
}

test('paginacao por cursor le 25 registros e nao duplica datas iguais', async () => {
  const records = Array.from({ length: 600 }, (_, index) => ({ id: String(index).padStart(4, '0'), issueDate: '2026-10-10', customerId: 'a', preOrder: String(index), items: [{ productId: 'p' }], totalValue: 1, totalWeight: 2 }));
  const client = mockClient(records);
  const request = { resource: 'orders', mode: 'list', filters: { start: '2026-10-01', end: '2026-10-31' }, pageSize: 25 };
  const first = await client.clientRecordQuery(request);
  assert.equal(first.rows.length, 25); assert.equal(client.reads(), 25);
  assert.equal('items' in first.rows[0], false); assert.equal(first.rows[0].itemCount, 1);
  const second = await client.clientRecordQuery({ ...request, cursor: first.next });
  assert.equal(second.rows.length, 25); assert.equal(client.reads(), 50);
  assert.equal(new Set([...first.rows, ...second.rows].map(row => row.id)).size, 50);
});

test('busca textual ausente respeita orçamento de leitura e devolve cursor para continuar', async () => {
  const records = Array.from({ length: 600 }, (_, index) => ({ id: String(index).padStart(4, '0'), issueDate: '2026-10-10', customerId: 'a', preOrder: 'normal', items: [] }));
  const client = mockClient(records);
  const result = await client.clientRecordQuery({ resource: 'orders', mode: 'list', filters: { start: '2026-10-01', end: '2026-10-31', query: 'inexistente' } });
  assert.equal(result.rows.length, 0); assert.equal(client.reads(), 250); assert.ok(result.next);
});

test('filtros preservam busca sem acentos, carteira atual, cidades multiplas e motivos', () => {
  const row = { customerName: 'Açúcar', customerId: 'a', bonusNumber: 'BON-1', reason: 'Cortesia', notes: 'ação' };
  const filters = { start: '2026-10-01', end: '2026-10-31', portfolio: 'external', query: 'acucar', city: ['Betim', 'Belo Horizonte'], reason: ['Amostra', 'Cortesia'] };
  assert.equal(matching.matchesRecord(row, filters, { city: 'Betim' }, true, 'bonifications'), true);
  assert.equal(matching.matchesRecord(row, filters, { city: 'Betim' }, false, 'bonifications'), false);
});

function fakeDb() {
  const values = new Map();
  return {
    values,
    collection: collection => ({ doc: id => ({ key: `${collection}/${id}` }) }),
    runTransaction: async callback => {
      const writes = [];
      const result = await callback({
        get: async ref => ({ exists: values.has(ref.key), data: () => structuredClone(values.get(ref.key)) }),
        set: (ref, value) => writes.push(() => values.set(ref.key, structuredClone(value))),
        delete: ref => writes.push(() => values.delete(ref.key)),
      });
      writes.forEach(write => write());
      return result;
    },
  };
}

test('resumos diarios sao idempotentes e corrigem edicao, mudanca de dia e exclusao', async () => {
  const db = fakeDb();
  const order = { customerId: 'a', issueDate: '2026-10-10', totalValue: 10.01, totalWeight: 2, items: [{ productId: 'p', subtotal: 10.01, totalWeight: 2, unitQuantity: 3 }] };
  db.values.set('orders/1', order);
  assert.equal(await core.syncRecord(db, 'orders', '1'), true);
  assert.equal(await core.syncRecord(db, 'orders', '1'), false);
  let summary = [...db.values].find(([key]) => key.startsWith('daily_orders/'))[1];
  assert.equal(summary.count, 1); assert.equal(summary.valueCents, 1001);
  db.values.set('orders/1', { ...order, issueDate: '2026-10-11', totalValue: 20 });
  await core.syncRecord(db, 'orders', '1');
  assert.equal([...db.values.keys()].filter(key => key.startsWith('daily_orders/')).length, 1);
  summary = [...db.values].find(([key]) => key.startsWith('daily_orders/'))[1];
  assert.equal(summary.date, '2026-10-11'); assert.equal(summary.valueCents, 2000);
  db.values.delete('orders/1');
  await core.syncRecord(db, 'orders', '1');
  assert.equal([...db.values.keys()].filter(key => key.startsWith('daily_orders/')).length, 0);
  assert.equal(await core.syncRecord(db, 'orders', '1'), false);
});

test('comissao sobre resumo diario preserva pedidos e arredondamento por loja', () => {
  const daily = load('src/lib/daily-records.ts');
  const commission = load('src/lib/network-commission.ts');
  const dashboard = load('src/lib/dashboard-commission.ts', () => commission);
  const group = { id: 'g', commissionPercent: 4, sellerCommissionPercent: 1, externalStoreSellers: { b: 'Sul de Minas' } };
  const customers = [{ id: 'a', groupId: 'g' }, { id: 'b', groupId: 'g' }];
  const raw = [{ customerId: 'a', status: 'normal', totalValue: 1.01 }, { customerId: 'a', status: 'normal', totalValue: 1.01 }, { customerId: 'b', status: 'normal', totalValue: 3.03 }];
  const aggregate = [{ id: 'a', date: '2026-10-10', customerId: 'a', count: 2, valueCents: 202, weight: 2, products: {} }, { id: 'b', date: '2026-10-10', customerId: 'b', count: 1, valueCents: 303, weight: 3, products: {} }].map(daily.dailyToDashboardRecord);
  assert.deepEqual(dashboard.buildNetworkDashboardCommission(customers, group, aggregate), dashboard.buildNetworkDashboardCommission(customers, group, raw));
});

test('reserva de CNPJ bloqueia concorrente e troca de documento libera somente a reserva antiga', async () => {
  const values = new Map();
  let serial = 0;
  const sdk = {
    collection: (_db, name) => ({ name }),
    doc: (first, name, id) => id ? { key: `${name}/${id}`, id } : { key: `${first.name}/new${++serial}`, id: `new${serial}` },
    serverTimestamp: () => 'timestamp',
    runTransaction: async (_db, callback) => {
      const writes = [];
      const result = await callback({
        get: async ref => ({ exists: () => values.has(ref.key), data: () => values.get(ref.key) }),
        set: (ref, value) => writes.push(() => values.set(ref.key, value)),
        update: (ref, value) => writes.push(() => values.set(ref.key, { ...values.get(ref.key), ...value })),
        delete: ref => writes.push(() => values.delete(ref.key)),
      });
      writes.forEach(write => write()); return result;
    },
  };
  const lib = load('src/lib/customer-document-reservation.ts', id => id === 'firebase/firestore' ? sdk : id === '@/lib/firebase' ? { db: {} } : load('src/lib/import-validation.ts'));
  await lib.saveCustomerWithReservation('a', { name: 'A', document: '11.222.333/0001-81' });
  await assert.rejects(lib.saveCustomerWithReservation('b', { name: 'B', document: '11222333000181' }), /outro cliente/);
  assert.equal(values.has('customers/b'), false);
  await lib.saveCustomerWithReservation('a', { name: 'A', document: '00.123.456/0001-00' });
  assert.equal(values.has('customer_documents/11222333000181'), false);
  assert.equal(values.get('customer_documents/00123456000100').customerId, 'a');
  await lib.deleteCustomerWithReservation('a');
  assert.equal(values.has('customer_documents/00123456000100'), false);
});

test('bonificacoes exibe totais completos independentes da pagina e checkbox da pagina', () => {
  const page = { rows: [{ id: 'b', bonusNumber: 'BON-1', customerName: 'Loja', customerCode: '001', customerId: 'a', issueDate: '2026-10-10', reason: 'Amostra', totalWeight: 1, totalValue: 10, itemCount: 2 }], totals: { count: 67, weight: 100, value: 1000 }, pageNumber: 1, pageSize: 25, sort: 'issueDate', direction: 'desc', hasNext: true };
  const { default: Page } = load('src/app/bonificacoes/page.tsx', id => {
    if (id === '@/lib/store') return { useCrmStore: () => ({ customers: [{ id: 'a', city: 'Betim' }], customerGroups: [], products: [] }), useCrmResources: () => {} };
    if (id === '@/lib/use-record-page') return { useRecordPage: (_resource, filters) => { assert.equal(filters.portfolio, 'all'); assert.ok(filters.start && filters.end); return page; } };
    if (id === '@/lib/record-query') return matching;
    if (id === '@/lib/dashboard-scope') return { getExternalCustomerIds: () => new Set() };
    if (id === '@/lib/product-packaging') return {};
    if (id === '@/components/record-pagination') return { RecordPagination: () => React.createElement('nav', null, 'Próxima') };
    if (id.endsWith('.css')) return {};
    return require(id);
  });
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /Selecionar todas as bonificações desta página/);
  assert.match(html, /67 no filtro/);
  assert.match(html, /100 kg/);
  assert.match(html, /1\.000,00/);
  assert.doesNotMatch(html, /bonifica\?\?|per\?odo|NaN|undefined/);
});
