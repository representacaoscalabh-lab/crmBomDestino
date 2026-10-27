import { collection, documentId, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { crmQueryCache } from "@/lib/query-cache";
import { recordFirestoreRead } from "@/lib/firestore-metrics";
import { isExportPeriodWithinLimit } from "@/lib/export-period";
export { isExportPeriodWithinLimit } from "@/lib/export-period";

/** Full historical exports are explicit actions; opening the export page never invokes this. */
export async function loadExportRecords<T>(resource: "orders" | "bonifications", signal?: AbortSignal, progress?: (count: number) => void): Promise<T[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sessão ausente.");
  const rows: T[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  do {
    if (signal?.aborted) throw new Error("Exportação cancelada.");
    const page = await crmQueryCache.read(`${resource}:export:${uid}:${cursor?.id ?? "first"}`, async () => {
      const snapshot = await getDocs(query(collection(db, resource), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(250)));
      recordFirestoreRead(`${resource}/export`, snapshot.size, snapshot.metadata.fromCache);
      return { rows: snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as T), cursor: snapshot.size === 250 ? snapshot.docs.at(-1) : undefined };
    });
    if (signal?.aborted) throw new Error("Exportação cancelada.");
    rows.push(...page.rows); cursor = page.cursor;
    progress?.(rows.length);
  } while (cursor);
  return rows;
}

/** Explicit, date-bounded exports must not read more than one 31-day window. */
export async function loadPeriodExportRecords<T>(resource: "orders" | "bonifications", start: string, end: string, signal?: AbortSignal, progress?: (count: number) => void): Promise<T[]> {
  if (!isExportPeriodWithinLimit(start, end)) throw new Error("O período de exportação deve ter no máximo 31 dias.");
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sessão ausente.");
  const rows: T[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  do {
    if (signal?.aborted) throw new Error("Exportação cancelada.");
    const key = `${resource}:period-export:${uid}:${start}:${end}:${cursor?.id ?? "first"}`;
    const page = await crmQueryCache.read(key, async () => {
      const snapshot = await getDocs(query(collection(db, resource), where("issueDate", ">=", start), where("issueDate", "<=", end), orderBy("issueDate"), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(250)));
      recordFirestoreRead(`${resource}/period-export`, snapshot.size, snapshot.metadata.fromCache);
      return { rows: snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as T), cursor: snapshot.size === 250 ? snapshot.docs.at(-1) : undefined };
    });
    if (signal?.aborted) throw new Error("Exportação cancelada.");
    rows.push(...page.rows);
    cursor = page.cursor;
    progress?.(rows.length);
  } while (cursor);
  return rows;
}
