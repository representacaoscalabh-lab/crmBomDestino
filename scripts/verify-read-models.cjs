const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const { projectRecord, dailyId, applyDelta } = require('../functions/aggregate-core.cjs');

async function eachDocument(db, collection, visit) {
  let cursor;
  do {
    let query = db.collection(collection).orderBy(FieldPath.documentId()).limit(250);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    for (const document of snapshot.docs) await visit(document);
    cursor = snapshot.size === 250 ? snapshot.docs.at(-1) : null;
  } while (cursor);
}

async function main() {
  if (process.loadEnvFile) { try { process.loadEnvFile('.env.local'); } catch { /* external environment */ } }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON no ambiente antes de verificar.');
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  const db = getFirestore();
  for (const resource of ['orders', 'bonifications']) {
    const expected = new Map();
    let sourceCount = 0, actualCount = 0, mismatches = 0;
    await eachDocument(db, resource, document => {
      sourceCount++;
      const projection = projectRecord(resource, document.data());
      if (!projection) throw new Error(`Registro sem data ou cliente válido em ${resource}; revise antes de ativar os resumos.`);
      const id = dailyId(projection);
      expected.set(id, applyDelta(expected.get(id), projection, 1));
    });
    await eachDocument(db, resource === 'orders' ? 'daily_orders' : 'daily_bonifications', document => {
      actualCount++;
      const actual = document.data(), match = expected.get(document.id);
      const close = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;
      const same = match && actual.customerId === match.customerId && actual.date === match.date && actual.count === match.count && actual.valueCents === match.valueCents && close(actual.weight, match.weight)
        && Object.keys(actual.products || {}).length === Object.keys(match.products).length
        && Object.entries(match.products).every(([key, product]) => actual.products[key] && actual.products[key].valueCents === product.valueCents && close(actual.products[key].units, product.units) && close(actual.products[key].weight, product.weight));
      if (!same) mismatches++;
      expected.delete(document.id);
    });
    mismatches += expected.size;
    console.log(JSON.stringify({ resource, sourceCount, dailyDocuments: actualCount, mismatches }));
    if (mismatches) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
