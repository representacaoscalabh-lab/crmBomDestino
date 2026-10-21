const crypto = require('node:crypto');

function projectRecord(resource, record) {
  if (!record || !record.customerId || !/^\d{4}-\d{2}-\d{2}$/.test(record.issueDate || '')) return null;
  if (![record.totalValue, record.totalWeight].every(Number.isFinite)) throw new Error('Registro com total inválido; agregação interrompida.');
  const products = {};
  for (const item of record.items || []) {
    const key = `p_${Buffer.from(item.productId || `code:${item.productCode || item.description}`).toString('base64url')}`;
    const entry = products[key] || { productId: item.productId || '', productCode: item.productCode || '', description: item.description || '', weight: 0, valueCents: 0, units: 0 };
    entry.weight += Number(item.grossWeight ?? item.totalWeight ?? 0);
    entry.valueCents += Math.round(Number(item.subtotal ?? (item.packagePrice || 0) * (item.packageQuantity || 0)) * 100);
    entry.units += Number(item.unitQuantity || 0);
    if (![entry.weight, entry.valueCents, entry.units].every(Number.isFinite)) throw new Error('Item com valor inválido; agregação interrompida.');
    products[key] = entry;
  }
  return { resource, date: record.issueDate, customerId: record.customerId, count: 1, valueCents: Math.round(Number(record.totalValue || 0) * 100), weight: Number(record.totalWeight || 0), products };
}

function dailyId(projection) { return encodeURIComponent(`${projection.date}:${projection.customerId}`); }
function projectionHash(projection) { return crypto.createHash('sha256').update(JSON.stringify(projection)).digest('hex'); }

function applyDelta(current, projection, sign) {
  const next = current ? structuredClone(current) : { date: projection.date, customerId: projection.customerId, count: 0, valueCents: 0, weight: 0, products: {} };
  next.count += sign * projection.count;
  next.valueCents += sign * projection.valueCents;
  next.weight += sign * projection.weight;
  for (const [key, product] of Object.entries(projection.products)) {
    const old = next.products[key] || { ...product, weight: 0, valueCents: 0, units: 0 };
    const entry = { ...product, weight: old.weight + sign * product.weight, valueCents: old.valueCents + sign * product.valueCents, units: old.units + sign * product.units };
    if (Math.abs(entry.weight) < 1e-8 && entry.valueCents === 0 && Math.abs(entry.units) < 1e-8) delete next.products[key];
    else next.products[key] = entry;
  }
  if (Math.abs(next.weight) < 1e-8) next.weight = 0;
  return next;
}

/** Re-read the source in the transaction: duplicate/out-of-order events cannot apply stale deltas. */
async function syncRecord(db, resource, id) {
  const source = db.collection(resource).doc(id);
  const state = db.collection('aggregate_states').doc(encodeURIComponent(`${resource}:${id}`));
  return db.runTransaction(async transaction => {
    const [sourceSnapshot, previousSnapshot] = await Promise.all([transaction.get(source), transaction.get(state)]);
    const next = projectRecord(resource, sourceSnapshot.exists ? sourceSnapshot.data() : null);
    const previous = previousSnapshot.exists ? previousSnapshot.data().projection : null;
    const hash = projectionHash(next);
    if (previousSnapshot.exists && previousSnapshot.data().hash === hash || !previous && !next) return false;
    const projections = [previous, next].filter(Boolean);
    const refs = new Map(projections.map(projection => [dailyId(projection), db.collection(resource === 'orders' ? 'daily_orders' : 'daily_bonifications').doc(dailyId(projection))]));
    const snapshots = await Promise.all([...refs].map(async ([key, ref]) => [key, await transaction.get(ref)]));
    const values = new Map(snapshots.map(([key, snapshot]) => [key, snapshot.exists ? snapshot.data() : null]));
    if (previous) values.set(dailyId(previous), applyDelta(values.get(dailyId(previous)), previous, -1));
    if (next) values.set(dailyId(next), applyDelta(values.get(dailyId(next)), next, 1));
    for (const [key, ref] of refs) {
      const value = values.get(key);
      if (!value || value.count <= 0) transaction.delete(ref);
      else transaction.set(ref, value);
    }
    if (next) transaction.set(state, { hash, projection: next }); else transaction.delete(state);
    return true;
  });
}

module.exports = { projectRecord, dailyId, projectionHash, applyDelta, syncRecord };
