"use client";

import { collection, doc, documentId, getAggregateFromServer, getDoc, getDocs, limit, orderBy, query, startAfter, sum, count, where, type QueryConstraint } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { crmQueryCache } from "@/lib/query-cache";
import { hasAdvancedFilters, matchesRecord, type RecordCursor, type RecordFilters, type RecordResource } from "@/lib/record-query";

/** Bounded fallback for installations without Admin credentials. Rules remain enforced by Firestore. */
export async function clientRecordQuery(body: { resource?: RecordResource; mode?: string; id?: string; filters?: RecordFilters; cursor?: RecordCursor | null; pageSize?: number; sort?: string; direction?: string }) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sessão ausente.");
  if (body.mode === "invalidate") return { ok: true };
  const resource = body.resource!;
  if (body.mode === "detail") {
    const snapshot = await getDoc(doc(db, resource, body.id!));
    return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;
  }
  const filters = body.filters!;
  if (!filters.start || !filters.end || filters.start > filters.end) throw new Error("Informe um período válido.");
  const constraints: QueryConstraint[] = [where("issueDate", ">=", filters.start), where("issueDate", "<=", filters.end)];
  // Keep the fallback index-free for legacy projects. Advanced predicates are evaluated in bounded batches.
  if (body.mode === "summary" && !hasAdvancedFilters(filters)) {
    const snapshot = await getAggregateFromServer(query(collection(db, resource), ...constraints), { count: count(), value: sum("totalValue"), weight: sum("totalWeight") });
    return { totals: snapshot.data(), next: null, scanned: 0 };
  }
  const customers = new Map<string, { city?: string; groupId?: string; segment?: string; document?: string }>();
  const external = new Set<string>();
  if (hasAdvancedFilters(filters)) {
    const load = (name: string) => crmQueryCache.read(`${name}:${uid}:all`, async () => {
      const snapshot = await getDocs(collection(db, name));
      return snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
    }, 600_000);
    const [people, groups] = await Promise.all([load("customers"), load("customer_groups")]);
    const groupMap = new Map(groups.map(group => [group.id, group as { id: string; externalStoreSellers?: Record<string, string> }]));
    for (const person of people) {
      const customer = person as typeof person & { groupId?: string };
      customers.set(person.id, customer);
      if (customer.groupId && groupMap.get(customer.groupId)?.externalStoreSellers?.[person.id]?.trim()) external.add(person.id);
    }
  }
  const field = body.mode === "list" ? body.sort || "issueDate" : "issueDate";
  const direction = body.mode === "list" && body.direction === "asc" ? "asc" : "desc";
  constraints.push(orderBy(field, direction), orderBy(documentId(), direction));
  let cursor = body.cursor ?? null;
  const rows: object[] = [], totals = { count: 0, value: 0, weight: 0 };
  let scanned = 0;
  const size = body.pageSize === 50 ? 50 : 25;
  const budget = body.mode === "list" ? 250 : 500;
  while (scanned < budget) {
    const batchSize = body.mode === "list" ? Math.min(size - rows.length, budget - scanned) : Math.min(100, budget - scanned);
    const snapshot = await getDocs(query(collection(db, resource), ...constraints, ...(cursor ? [startAfter(cursor.value, cursor.id)] : []), limit(batchSize)));
    if (snapshot.empty) { cursor = null; break; }
    for (const item of snapshot.docs) {
      scanned++;
      const record = { ...item.data(), id: item.id };
      cursor = { value: record[field as keyof typeof record] as string | number, id: item.id };
      const raw = record as Record<string, unknown>;
      if (!matchesRecord(raw, filters, customers.get(String(raw.customerId)), external.has(String(raw.customerId)), resource)) continue;
      // Reuse the already downloaded details instead of reading them again when opening a modal.
      await crmQueryCache.read(`${resource}:detail:${uid}:${item.id}`, async () => record, 300_000);
      const { items, ...header } = raw;
      if (body.mode === "list") rows.push({ ...header, itemCount: Array.isArray(items) ? items.length : 0 });
      totals.count++; totals.value += Math.round(Number(raw.totalValue ?? 0) * 100); totals.weight += Number(raw.totalWeight ?? 0);
    }
    if (snapshot.size < batchSize) { cursor = null; break; }
    if (body.mode === "list" && rows.length === size) break;
  }
  return body.mode === "list" ? { rows, next: cursor, scanned } : { totals: { ...totals, value: totals.value / 100 }, next: cursor, scanned };
}
