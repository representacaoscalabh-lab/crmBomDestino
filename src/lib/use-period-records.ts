"use client";

import { useEffect, useState } from "react";
import { collection, documentId, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { crmQueryCache, onResourceInvalidated } from "@/lib/query-cache";
import { recordFirestoreRead } from "@/lib/firestore-metrics";
import { normalizeOrder } from "@/lib/order-status";
import type { DailyRecord } from "@/lib/daily-records";
import type { Bonification, Order } from "@/lib/types";

/** Complete report dataset for an explicit date interval, fetched in bounded batches. */
export function usePeriodRecords<T extends Order | Bonification | DailyRecord>(resource: "orders" | "bonifications" | "daily_orders" | "daily_bonifications", start: string, end: string, enabled = true) {
  const { crmUser } = useAuth();
  const uid = crmUser?.status === "approved" ? crmUser.uid : "";
  const [revision, setRevision] = useState(0);
  const key = `${resource}:period:${uid}:${start}:${end}:${revision}`;
  const [state, setState] = useState<{ key: string; rows?: T[]; error?: string }>({ key: "" });
  const dateField = resource.startsWith("daily_") ? "date" : "issueDate";
  const valid = enabled && !!uid && !!start && !!end && start <= end;
  useEffect(() => {
    if (!valid) return;
    let disposed = false;
    crmQueryCache.read(key, async () => {
      const rows: T[] = [];
      let cursor: QueryDocumentSnapshot | undefined;
      do {
        const snapshot = await getDocs(query(collection(db, resource), where(dateField, ">=", start), where(dateField, "<=", end), orderBy(dateField), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(250)));
        recordFirestoreRead(`${resource}/period`, snapshot.size, snapshot.metadata.fromCache);
        rows.push(...snapshot.docs.map(item => resource === "orders" ? normalizeOrder({ ...item.data(), id: item.id } as Order) as T : { ...item.data(), id: item.id } as T));
        cursor = snapshot.size === 250 ? snapshot.docs.at(-1) : undefined;
      } while (cursor);
      return rows;
    }).then(rows => { if (!disposed) setState({ key, rows }); }, error => { if (!disposed) setState({ key, error: error.message }); });
    return () => { disposed = true; };
  }, [key, valid, resource, start, end, dateField]);
  useEffect(() => onResourceInvalidated(changed => { if (changed === resource || changed === resource.replace("daily_", "")) setRevision(value => value + 1); }), [resource]);
  return { rows: state.key === key ? state.rows ?? [] : [], loading: valid && state.key !== key, error: state.key === key ? state.error : undefined };
}
