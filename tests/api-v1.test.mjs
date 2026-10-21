import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const catalog = JSON.parse(fs.readFileSync(new URL('../src/cfg/api-collections.json', import.meta.url), 'utf8'));
const config = { name: 'API CRM Bom Destino', version: '1.0.0', basePath: '/api/v1', defaultLimit: 25, maxLimit: 100, collections: catalog };
const sdk = require('firebase-admin/firestore');
function load(file, resolve) {
  const code = ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, resolve);
  return exports;
}

function fixture({ user = { status: 'approved', role: 'user' }, invalidToken = false, records = [] } = {}) {
  const calls = [];
  const query = {
    orderBy: (...args) => { calls.push(['orderBy', ...args]); return query; },
    where: (...args) => { calls.push(['where', ...args]); return query; },
    startAfter: id => { calls.push(['after', id]); return query; },
    limit: size => { calls.push(['limit', size]); return query; },
    get: async () => ({ docs: records.map(([id, data]) => ({ id, data: () => data })), size: records.length }),
    doc: id => ({ get: async () => ({ id, exists: records.some(([key]) => key === id), data: () => records.find(([key]) => key === id)?.[1] }) }),
  };
  const lib = load('src/lib/api-v1.ts', id => {
    if (id === 'next/server') return { NextResponse: { json: (data, init) => Response.json(data, init) } };
    if (id === 'firebase-admin/firestore') return sdk;
    if (id === '@/cfg/api') return { apiConfig: config, getApiCollection: name => catalog.find(item => item.name === name) };
    if (id === '@/lib/firebase-admin') return { getAdminServices: () => ({
      adminAuth: { verifyIdToken: async (token, revoked) => { calls.push(['verify', token, revoked]); if (invalidToken) throw new Error('expired'); return { uid: 'u' }; } },
      adminDb: { collection: name => { calls.push(['collection', name]); return name === 'users' ? { ...query, doc: id => ({ get: async () => ({ id, exists: true, data: () => user }) }) } : query; } },
    }) };
    return require(id);
  });
  return { lib, calls };
}
function request(query = '', token = 'valid') {
  return new Request(`https://crm.example/api/v1/collections/orders${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

test('API exige token valido e aprovacao antes de ler dados comerciais', async () => {
  const old = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';
  try {
    for (const options of [{ token: '', status: 401 }, { invalidToken: true, status: 401 }, { user: { status: 'pending', role: 'admin' }, status: 403 }, { user: undefined, status: 200 }]) {
      const { lib, calls } = fixture(options);
      const response = await lib.apiHandler(() => lib.listApiDocuments(request('', options.token), 'orders'));
      assert.equal(response.status, options.status);
      if (options.status !== 200) assert.equal(calls.some(call => call[0] === 'collection' && call[1] === 'orders'), false);
      else assert.ok(calls.some(call => call[0] === 'verify' && call[2] === true));
    }
  } finally { if (old === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON; else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = old; }
});

test('API limita colecoes por perfil e bloqueia colecoes internas ou caminhos arbitrarios', () => {
  const { lib } = fixture();
  for (const name of ['users', 'access_requests']) {
    assert.throws(() => lib.requireApiCollection(name, false), error => error.status === 403);
    assert.equal(lib.requireApiCollection(name, true).name, name);
  }
  for (const name of ['aggregate_states', 'secrets', '../users', 'customers/secret']) assert.throws(() => lib.requireApiCollection(name, true), error => error.status === 404);
  assert.equal(lib.requireApiCollection('orders', false).name, 'orders');
});

test('API valida limites, cursor e parametros desconhecidos', () => {
  const { lib } = fixture();
  assert.deepEqual(lib.parseApiPagination(new URL('https://crm.example')), { limit: 25, after: null });
  assert.deepEqual(lib.parseApiPagination(new URL('https://crm.example?limit=100&after=cliente%20a')), { limit: 100, after: 'cliente a' });
  for (const query of ['limit=0', 'limit=101', 'limit=-1', 'limit=1.5', 'limit=', 'limit=2&limit=3', 'query=x', 'after=', 'after=..', 'after=a%2Fb']) {
    assert.throws(() => lib.parseApiPagination(new URL(`https://crm.example?${query}`)), error => error.status === 400, query);
  }
  assert.throws(() => lib.validDocumentId('é'.repeat(751)), error => error.status === 400);
});

test('API pagina documentos completos sem permitir sobrescrever ID e restringe settings', async () => {
  const old = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';
  try {
    const { lib, calls } = fixture({ records: [['a', { id: 'falso', items: [{ productId: 'p' }], totalValue: 10 }], ['b', {}], ['c', {}]] });
    const response = await lib.listApiDocuments(request('?limit=2&after=anterior'), 'orders');
    const body = await response.json();
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(body.data.length, 2); assert.equal(body.data[0].id, 'a');
    assert.deepEqual(body.data[0].items, [{ productId: 'p' }]);
    assert.deepEqual(body.pagination, { limit: 2, next: 'b' });
    assert.ok(calls.some(call => call[0] === 'limit' && call[1] === 3));
    assert.ok(calls.some(call => call[0] === 'after' && call[1] === 'anterior'));
    await lib.listApiDocuments(request(), 'settings');
    assert.ok(calls.some(call => call[0] === 'where' && call[2] === 'in' && call[3].length === 3));
    const denied = await lib.apiHandler(() => lib.getApiDocument(request(), 'settings', 'secret'));
    assert.equal(denied.status, 404);
    const detail = await (await lib.getApiDocument(request(), 'orders', 'a')).json();
    assert.equal(detail.data.id, 'a');
    const missing = await lib.apiHandler(() => lib.getApiDocument(request(), 'orders', 'missing'));
    assert.equal(missing.status, 404);
  } finally { if (old === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON; else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = old; }
});

test('API serializa timestamps aninhados, coordenadas e bytes', () => {
  const { lib } = fixture();
  assert.deepEqual(lib.serializeApiValue({ items: [{ at: sdk.Timestamp.fromDate(new Date('2026-10-21T12:00:00Z')) }], point: new sdk.GeoPoint(-20, -40), bytes: Buffer.from('crm') }), {
    items: [{ at: '2026-10-21T12:00:00.000Z' }], point: { latitude: -20, longitude: -40 }, bytes: 'Y3Jt',
  });
});

test('OpenAPI documenta colecoes expostas e os itens dos pedidos', () => {
  const { buildApiOpenApi } = load('src/lib/api-openapi.ts', id => id === '@/cfg/api' ? { apiConfig: config } : require(id));
  const spec = buildApiOpenApi();
  assert.equal(spec.openapi, '3.0.3');
  for (const collection of catalog.filter(item => item.access !== 'internal')) {
    assert.ok(spec.paths[`/api/v1/collections/${collection.name}`]);
    assert.ok(spec.paths[`/api/v1/collections/${collection.name}/{id}`]);
  }
  assert.equal(spec.paths['/api/v1/collections/aggregate_states'], undefined);
  const order = spec.paths['/api/v1/collections/orders'].get.responses[200].content['application/json'].schema.properties.data.items;
  assert.equal(order.properties.items.items.properties.productId.type, 'string');
  assert.deepEqual(order.properties.status.enum, ['normal']);
  assert.ok(catalog.find(item => item.name === 'customers').fields.some(field => field.name === 'documentNormalized'));
});
