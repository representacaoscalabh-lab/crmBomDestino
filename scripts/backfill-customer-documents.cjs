const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');

async function main() {
  if (process.loadEnvFile) { try { process.loadEnvFile('.env.local'); } catch { /* external environment */ } }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON no ambiente antes de executar a migração.');
  const args = process.argv.slice(2), apply = args.includes('--apply');
  const max = Math.max(1, Math.min(10000, Number(args.find(value => value.startsWith('--max='))?.split('=')[1]) || 500));
  let after = args.find(value => value.startsWith('--after='))?.slice(8);
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  const db = getFirestore(), manifest = db.collection('settings').doc('read_optimization');
  if (apply) {
    // Requires deploying the new rules first; all client customer writes pause during migration.
    await manifest.set({ customerMigration: true }, { merge: true });
  }
  let processed = 0, finished = false;
  const seen = new Set();
  while (processed < max) {
    const size = Math.min(100, max - processed);
    let query = db.collection('customers').orderBy(FieldPath.documentId()).limit(size);
    if (after) query = query.startAfter(after);
    const snapshot = await query.get();
    if (snapshot.empty) { finished = true; break; }
    for (const document of snapshot.docs) {
      const normalized = String(document.data().document || '').replace(/\D/g, '');
      if (normalized && !/^\d{14}$/.test(normalized)) throw new Error(`Documento inválido no cliente ${document.id}; revise o cadastro antes de continuar.`);
      if (normalized && seen.has(normalized)) throw new Error('Existem CNPJs duplicados no lote. Migração interrompida sem ativar as reservas.');
      if (normalized) seen.add(normalized);
      if (apply) await db.runTransaction(async transaction => {
        const ref = normalized ? db.collection('customer_documents').doc(normalized) : null;
        const reservation = ref ? await transaction.get(ref) : null;
        if (reservation?.exists && reservation.data().customerId !== document.id) throw new Error(`Conflito de CNPJ no cliente ${document.id}. Resolva antes de continuar.`);
        if (ref) transaction.set(ref, { customerId: document.id });
        transaction.update(document.ref, { documentNormalized: normalized });
      });
      processed++; after = document.id;
    }
    if (snapshot.size < size) { finished = true; break; }
  }
  if (apply && finished) await manifest.set({ customerMigration: false, customerReservations: true }, { merge: true });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', processed, finished, next: finished ? null : after, note: !apply ? 'A auditoria cobre apenas este lote; o apply verifica reservas também entre lotes.' : finished ? 'Reservas ativas. Use o cliente com NEXT_PUBLIC_FIREBASE_CNPJ_RESERVATIONS=true.' : 'Gravações de clientes pausadas; retome usando --after.' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
