import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function setup({ role = 'admin', status = 'ready', fail = false } = {}) {
  const records = { orders: Array.from({ length: 405 }, (_, id) => ({ id: String(id), ref: `orders/${id}` })), bonifications: [{ ref: 'bonifications/1' }] };
  const audit = [], invalidated = [];
  let deleted = false, locked = false;
  const firestore = {
    collection: (_, name) => name,
    doc: (...args) => args.length === 1 ? `event/${audit.length}` : args.slice(1).join('/'),
    getDoc: async () => ({ data: () => ({ role, status: 'approved' }) }),
    runTransaction: async (_, work) => work({ get: async () => ({ exists: () => true, data: () => ({ status }) }), update: () => { locked = true; } }),
    query: (resource) => resource, where: () => null, limit: () => null,
    getDocs: async resource => { const docs = records[resource].slice(0, 400); return { empty: !docs.length, docs, size: docs.length }; },
    serverTimestamp: () => 'now',
    writeBatch: () => {
      const removals = [], events = [];
      return { delete: ref => removals.push(ref), set: (_, event) => events.push(event), commit: async () => {
        assert.equal(locked, true);
        if (fail) throw new Error('connection lost');
        assert.ok(removals.length + events.length <= 500);
        for (const ref of removals) {
          if (ref === 'order_remittances/r1') deleted = true;
          else { const resource = ref.split('/')[0]; records[resource] = records[resource].filter(item => item.ref !== ref); }
        }
        audit.push(...events);
      } };
    },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/lib/order-remittances.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'exports', code)(name => {
    if (name === 'firebase/firestore') return firestore;
    if (name === '@/lib/firebase') return { db: {}, auth: { currentUser: { uid: 'admin1' } } };
    if (name === '@/lib/query-cache') return { invalidateResource: name => invalidated.push(name) };
    return {};
  }, exports);
  const remove = () => exports.deleteOrderRemittance({ id: 'r1', name: 'Shipment', groupId: 'g1', source: 'manual' }, { id: 'admin1', name: 'Admin' });
  return { remove, records, audit, invalidated, deleted: () => deleted };
}

test('deletion removes every associated record in bounded audited batches before the parent', async () => {
  const state = setup();
  await state.remove();
  assert.equal(state.records.orders.length, 0);
  assert.equal(state.records.bonifications.length, 0);
  assert.equal(state.deleted(), true);
  assert.deepEqual(state.audit.map(event => event.type), ['records_deleted', 'records_deleted', 'records_deleted', 'deleted']);
  assert.deepEqual(state.invalidated, ['orders', 'bonifications']);
});

test('deletion rejects ordinary users and active imports', async () => {
  for (const options of [{ role: 'user' }, { status: 'processing' }]) {
    const state = setup(options);
    await assert.rejects(state.remove());
    assert.equal(state.deleted(), false);
    assert.equal(state.records.orders.length, 405);
  }
});

test('failed deletion keeps parent and invalidates cached records for retry', async () => {
  const state = setup({ fail: true });
  await assert.rejects(state.remove(), /connection lost/);
  assert.equal(state.deleted(), false);
  assert.deepEqual(state.invalidated, ['orders', 'bonifications']);
});
