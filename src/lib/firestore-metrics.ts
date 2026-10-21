type ReadMetric = { requests: number; documents: number; cacheSnapshots: number; serverSnapshots: number; failures: number };
const counters = new Map<string, ReadMetric>();
/** Local diagnostics only: no IDs, query values, credentials or document data. */
export function recordFirestoreRead(resource: string, documents: number, fromCache = false, failed = false) {
  const metric = counters.get(resource) ?? { requests: 0, documents: 0, cacheSnapshots: 0, serverSnapshots: 0, failures: 0 };
  metric.requests++;
  metric.documents += documents;
  if (fromCache) metric.cacheSnapshots++; else metric.serverSnapshots++;
  if (failed) metric.failures++;
  counters.set(resource, metric);
}
export function getFirestoreReadMetrics() { return Object.fromEntries([...counters].map(([key, value]) => [key, { ...value }])); }
export function clearFirestoreReadMetrics() { counters.clear(); }
