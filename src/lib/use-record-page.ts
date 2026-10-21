"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { crmQueryCache, onResourceInvalidated } from "@/lib/query-cache";
import { hasAdvancedFilters, type RecordCursor, type RecordFilters, type RecordHeader, type RecordPage, type RecordResource, type RecordTotals } from "@/lib/record-query";
import { recordFirestoreRead } from "@/lib/firestore-metrics";

let useClientQueries = false;

export async function recordRequest<T>(body: object): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Entre na sua conta para consultar os registros.");
  if (useClientQueries) return (await import("@/lib/client-record-query")).clientRecordQuery(body) as Promise<T>;
  const response = await fetch("/api/crm/records", { method: "POST", headers: { "Content-Type": "application/json", authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify(body) });
  const result = await response.json();
  if (response.status === 503 && result.code === "server-not-configured") {
    useClientQueries = true;
    return (await import("@/lib/client-record-query")).clientRecordQuery(body) as Promise<T>;
  }
  if (!response.ok) throw new Error(result.error || "Não foi possível consultar os registros.");
  return result as T;
}

export function useRecordPage(resource: RecordResource, filters: RecordFilters) {
  const { crmUser } = useAuth();
  const uid = crmUser?.status === "approved" ? crmUser.uid : "";
  const filterKey = JSON.stringify({ ...filters, query: filters.query?.trim() || "", customerName: filters.customerName?.trim() || "", city: [...new Set(filters.city ?? [])].sort(), reason: [...new Set(filters.reason ?? [])].sort() });
  const [navigation, setNavigation] = useState<{ key: string; cursors: (RecordCursor | null)[]; index: number }>({ key: "", cursors: [null], index: 0 });
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState("issueDate");
  const [direction, setDirection] = useState("desc");
  const [revision, setRevision] = useState(0);
  const navigationKey = `${uid}:${resource}:${filterKey}:${sort}:${direction}:${pageSize}:${revision}`;
  const currentNavigation = navigation.key === navigationKey ? navigation : { key: navigationKey, cursors: [null], index: 0 };
  const cursor = currentNavigation.cursors[currentNavigation.index];
  const [state, setState] = useState<{ key: string; page?: RecordPage; error?: string }>({ key: "" });
  const [totalState, setTotalState] = useState<{ key: string; totals?: RecordTotals; error?: string; calculating?: boolean }>({ key: "" });
  const totalKey = `${uid}:${resource}:${filterKey}:${revision}`;
  const requestKey = `${navigationKey}:${JSON.stringify(cursor)}`;
  const stableFilters = useMemo(() => JSON.parse(filterKey) as RecordFilters, [filterKey]);
  const totalsController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    crmQueryCache.read(`${resource}:page:${requestKey}`, async () => {
      const page = await recordRequest<RecordPage>({ resource, mode: "list", filters: stableFilters, cursor, pageSize, sort, direction });
      recordFirestoreRead(`${resource}/headers`, page.scanned);
      return page;
    }).then(page => { if (!cancelled) setState({ key: requestKey, page }); }, error => { if (!cancelled) setState({ key: requestKey, error: error.message }); });
    return () => { cancelled = true; };
  }, [uid, resource, requestKey, stableFilters, cursor, pageSize, sort, direction]);

  const calculateTotals = useCallback(async () => {
    if (!uid) return;
    totalsController.current?.abort();
    const controller = new AbortController();
    totalsController.current = controller;
    setTotalState({ key: totalKey, calculating: true });
    try {
      const cached = crmQueryCache.peek<RecordTotals>(`${resource}:totals:${totalKey}`);
      if (cached) { setTotalState({ key: totalKey, totals: cached }); return; }
      const totals = await (async () => {
        const sum: RecordTotals = { count: 0, value: 0, weight: 0 };
        let cursor: RecordCursor | null = null;
        do {
          if (controller.signal.aborted) throw new Error("Cálculo cancelado.");
          const part: { totals: RecordTotals; next: RecordCursor | null; scanned: number } = await crmQueryCache.read(`${resource}:summary-part:${totalKey}:${JSON.stringify(cursor)}`, () => recordRequest({ resource, mode: "summary", filters: stableFilters, cursor }));
          if (controller.signal.aborted) throw new Error("Cálculo cancelado.");
          sum.count += part.totals.count; sum.value += part.totals.value; sum.weight += part.totals.weight;
          recordFirestoreRead(`${resource}/summary`, part.scanned);
          cursor = part.next;
        } while (cursor);
        sum.value = Math.round(sum.value * 100) / 100;
        return sum;
      })();
      await crmQueryCache.read(`${resource}:totals:${totalKey}`, async () => totals);
      if (!controller.signal.aborted) setTotalState({ key: totalKey, totals });
    } catch (error) { if (!controller.signal.aborted) setTotalState({ key: totalKey, error: error instanceof Error ? error.message : "Falha ao calcular totais." }); }
  }, [uid, totalKey, resource, stableFilters]);

  // Aggregate queries are cheap for unfiltered periods. Broad text/portfolio totals are explicit.
  useEffect(() => { let disposed = false; queueMicrotask(() => { if (!disposed && !hasAdvancedFilters(stableFilters)) void calculateTotals(); }); return () => { disposed = true; totalsController.current?.abort(); }; }, [stableFilters, calculateTotals]);
  useEffect(() => onResourceInvalidated(changed => {
    if ([resource, "customers", "customer_groups"].includes(changed)) {
      crmQueryCache.invalidate(`${resource}:`);
      // Invalidation precedes reloading, including server-side cached header pages.
      void recordRequest({ mode: "invalidate", resource: changed }).then(() => setRevision(value => value + 1), error => setState({ key: requestKey, error: error.message }));
    }
  }), [resource, requestKey]);
  useEffect(() => {
    const onFocus = () => { if (!crmQueryCache.peek(`${resource}:page:${requestKey}`)) setRevision(value => value + 1); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [resource, requestKey]);

  const page = state.key === requestKey ? state.page : undefined;
  const totals = totalState.key === totalKey ? totalState.totals : undefined;
  return {
    rows: (page?.rows ?? []) as RecordHeader[], loading: state.key !== requestKey, error: state.key === requestKey ? state.error : undefined,
    totals, totalError: totalState.key === totalKey ? totalState.error : undefined,
    calculatingTotals: totalState.key === totalKey && totalState.calculating,
    calculateTotals, pageSize, setPageSize, sort, direction,
    setSort: (value: string) => { if (sort === value) setDirection(current => current === "asc" ? "desc" : "asc"); else { setSort(value); setDirection("desc"); } },
    pageNumber: currentNavigation.index + 1, hasPrevious: currentNavigation.index > 0, hasNext: Boolean(page?.next),
    previous: () => setNavigation({ ...currentNavigation, index: currentNavigation.index - 1 }),
    next: () => { if (page?.next) setNavigation({ key: navigationKey, cursors: [...currentNavigation.cursors.slice(0, currentNavigation.index + 1), page.next], index: currentNavigation.index + 1 }); },
    refresh: () => recordRequest({ mode: "invalidate", resource }).then(() => { crmQueryCache.invalidate(`${resource}:`); setRevision(value => value + 1); }),
  };
}

export async function getRecordDetail<T>(resource: RecordResource, id: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sessão ausente.");
  const record = await crmQueryCache.read(`${resource}:detail:${uid}:${id}`, () => recordRequest<T | null>({ resource, mode: "detail", id }), 300_000);
  if (!record) throw new Error("Este registro não está mais disponível.");
  return record;
}
