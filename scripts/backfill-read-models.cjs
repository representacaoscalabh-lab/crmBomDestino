/** Additive, resumable migration. Default is a dry run; --apply writes aggregates/counts. */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const { syncRecord } = require('../functions/aggregate-core.cjs');

async function main() {
  if (process.loadEnvFile) { try { process.loadEnvFile('.env.local'); } catch { /* environment may supply credentials */ } }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON no ambiente antes de executar a migração.');
  const args = process.argv.slice(2), apply = args.includes('--apply');
  const resource = args.find(value => value.startsWith('--resource='))?.split('=')[1] || 'orders';
  if (!['orders', 'bonifications'].includes(resource)) throw new Error('Use --resource=orders ou --resource=bonifications.');
  let after = args.find(value => value.startsWith('--after='))?.slice(8);
  const max = Math.max(1, Math.min(10000, Number(args.find(value => value.startsWith('--max='))?.split('=')[1]) || 500));
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  const db = getFirestore();
  let processed = 0, finished = false;
  while (processed < max) {
    const size = Math.min(100, max - processed);
    let query = db.collection(resource).orderBy(FieldPath.documentId()).limit(size);
    if (after) query = query.startAfter(after);
    const snapshot = await query.get();
    if (snapshot.empty) { finished = true; break; }
    for (const document of snapshot.docs) {
      if (apply) {
        await syncRecord(db, resource, document.id);
        const count = Array.isArray(document.data().items) ? document.data().items.length : 0;
        // Prevent overwriting a count if the source changes while migrating.
        await document.ref.update({ itemCount: count }, { lastUpdateTime: document.updateTime });
      }
      processed++; after = document.id;
    }
    if (snapshot.size < size) { finished = true; break; }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', resource, processed, finished, next: finished ? null : after }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
