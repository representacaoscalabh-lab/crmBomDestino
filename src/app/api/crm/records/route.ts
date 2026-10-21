import { NextResponse } from "next/server";
import { AggregateField, FieldPath, type Query } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase-admin";
import { QueryCache } from "@/lib/query-cache";
import { hasAdvancedFilters, matchesRecord, type RecordCursor, type RecordFilters, type RecordResource } from "@/lib/record-query";

export const runtime = "nodejs";
const cache = new QueryCache();
const headerFields = ["issueDate", "customerId", "customerName", "customerCode", "store", "customerCity", "totalValue", "totalWeight", "preOrder", "invoice", "paymentTerm", "status", "bonusNumber", "reason", "notes", "itemCount"];
const allowedSort = new Set(["issueDate", "totalValue", "totalWeight", "customerName"]);

export async function POST(request: Request) {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return NextResponse.json({ code: "server-not-configured" }, { status: 503 });
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) return NextResponse.json({ error: "Sessão ausente." }, { status: 401 });
    const { adminAuth, adminDb } = getAdminServices();
    let uid: string;
    try { uid = (await adminAuth.verifyIdToken(token)).uid; }
    catch { return NextResponse.json({ error: "Sessão inválida." }, { status: 401 }); }
    // Admin SDK bypasses rules. Always recheck current access before any cache hit.
    const user = await adminDb.collection("users").doc(uid).get();
    if (user.data()?.status !== "approved") return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
    const body = await request.json();
    if (body.mode === "invalidate") {
      if (["orders", "bonifications"].includes(body.resource)) cache.invalidate(`${body.resource}:`);
      if (["customers", "customer_groups"].includes(body.resource)) { cache.invalidate("metadata:"); cache.invalidate("orders:"); cache.invalidate("bonifications:"); }
      return NextResponse.json({ ok: true });
    }
    const resource: RecordResource = body.resource;
    if (!["orders", "bonifications"].includes(resource)) return NextResponse.json({ error: "Consulta inválida." }, { status: 400 });
    if (body.mode === "detail") {
      if (typeof body.id !== "string" || !body.id || body.id.includes("/") || body.id.length > 1500) return NextResponse.json({ error: "Registro inválido." }, { status: 400 });
      const value = await cache.read(`${resource}:detail:${body.id}`, async () => {
        const snapshot = await adminDb.collection(resource).doc(body.id).get();
        return snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null;
      }, 120_000);
      return NextResponse.json(value, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (!["list", "summary", "facets"].includes(body.mode)) return NextResponse.json({ error: "Operação inválida." }, { status: 400 });
    const filters = body.filters as RecordFilters;
    if (filters && [filters.query, filters.customerName].some(value => value !== undefined && typeof value !== "string")) return NextResponse.json({ error: "Filtros inválidos." }, { status: 400 });
    if (!filters || !/^\d{4}-\d{2}-\d{2}$/.test(filters.start) || !/^\d{4}-\d{2}-\d{2}$/.test(filters.end) || filters.start > filters.end || filters.query && filters.query.length > 200 || filters.customerName && filters.customerName.length > 200) {
      return NextResponse.json({ error: "Informe um período válido para consultar os registros." }, { status: 400 });
    }
    for (const values of [filters.city, filters.reason]) if (values !== undefined && (!Array.isArray(values) || values.length > 100 || values.some(value => typeof value !== "string" || value.length > 200))) return NextResponse.json({ error: "Filtros inválidos." }, { status: 400 });
    for (const value of [filters.portfolio, filters.network, filters.segment]) if (value !== undefined && (typeof value !== "string" || value.length > 200)) return NextResponse.json({ error: "Filtros inválidos." }, { status: 400 });
    const sort = allowedSort.has(body.sort) ? body.sort : "issueDate";
    const direction = body.direction === "asc" ? "asc" : "desc";
    const size = body.pageSize === 50 ? 50 : 25;
    const cursor = body.cursor as RecordCursor | null;
    if (cursor && (typeof cursor.id !== "string" || cursor.id.includes("/") || !["string", "number"].includes(typeof cursor.value))) return NextResponse.json({ error: "Página inválida." }, { status: 400 });
    const key = `${resource}:${JSON.stringify({ ...body, filters })}`;
    const result = await cache.read(key, async () => {
      let base: Query = adminDb.collection(resource).where("issueDate", ">=", filters.start).where("issueDate", "<=", filters.end);
      // Simple categorical filters are pushed into the query when the operator budget permits.
      if (filters.reason?.length && filters.reason.length <= 30) base = base.where("reason", "in", filters.reason);
      const advanced = hasAdvancedFilters(filters);
      if (body.mode === "summary" && !advanced) {
        const totals = await base.aggregate({ count: AggregateField.count(), value: AggregateField.sum("totalValue"), weight: AggregateField.sum("totalWeight") }).get();
        return { totals: totals.data(), next: null, scanned: 0 };
      }
      let customers = new Map<string, { city?: string; groupId?: string; segment?: string; document?: string }>();
      const external = new Set<string>();
      if (advanced || body.mode === "facets") {
        const metadata = await cache.read("metadata:customers", async () => {
          const [customers, groups] = await Promise.all([adminDb.collection("customers").select("city", "groupId", "segment", "document").get(), adminDb.collection("customer_groups").select("externalStoreSellers").get()]);
          return { customers: customers.docs.map(doc => ({ id: doc.id, ...doc.data() } as { id: string; city?: string; groupId?: string; segment?: string; document?: string })), groups: groups.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
        }, 600_000);
        customers = new Map(metadata.customers.map(customer => [customer.id, customer]));
        const byGroup = new Map(metadata.groups.map(group => [group.id, group as { id: string; externalStoreSellers?: Record<string, string> }]));
        for (const [id, customer] of customers) if (customer.groupId && byGroup.get(customer.groupId)?.externalStoreSellers?.[id]?.trim()) external.add(id);
      }
      // Text substring and legacy city fallback cannot be expressed by a standard Firestore index.
      // Scan only lightweight headers in bounded batches within the selected period, never items.
      const scanSort = body.mode === "list" ? sort : "issueDate";
      const scanDirection = body.mode === "list" ? direction : "desc";
      base = base.orderBy(scanSort, scanDirection).orderBy(FieldPath.documentId(), scanDirection).select(...headerFields);
      if (cursor) base = base.startAfter(cursor.value, cursor.id);
      const rows: object[] = [];
      const totals = { count: 0, value: 0, weight: 0 };
      const cities = new Set<string>(), reasons = new Set<string>();
      let next: RecordCursor | null = null, scanned = 0;
      const budget = body.mode === "list" ? 250 : 500;
      while (scanned < budget) {
        const batchSize = body.mode === "list" ? Math.min(size - rows.length, budget - scanned) : Math.min(100, budget - scanned);
        const snapshot = await base.limit(batchSize).get();
        if (snapshot.empty) { next = null; break; }
        for (const doc of snapshot.docs) {
          scanned++;
          const row = doc.data();
          next = { value: row[scanSort], id: doc.id };
          const customer = customers.get(row.customerId);
          if (body.mode === "facets") {
            if (row.customerCity || customer?.city) cities.add(String(row.customerCity || customer?.city).trim());
            if (row.reason) reasons.add(String(row.reason).trim());
          } else if (matchesRecord(row, filters, customer, external.has(row.customerId), resource)) {
            if (body.mode === "list") rows.push({ ...row, id: doc.id });
            totals.count++; totals.value += Math.round(Number(row.totalValue ?? 0) * 100); totals.weight += Number(row.totalWeight ?? 0);
          }
        }
        if (snapshot.size < batchSize) { next = null; break; }
        if (body.mode === "list" && rows.length === size) break;
        base = base.startAfter(next!.value, next!.id);
      }
      return body.mode === "list" ? { rows, next, scanned } : body.mode === "facets" ? { cities: [...cities], reasons: [...reasons], next } : { totals: { ...totals, value: totals.value / 100 }, next, scanned };
    }, 120_000);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    console.error("Falha na consulta delimitada do CRM", cause instanceof Error ? cause.message : "unknown");
    const missingIndex = typeof cause === "object" && cause !== null && "code" in cause && cause.code === 9;
    return NextResponse.json({ error: missingIndex ? "Esta consulta precisa de um índice do Firebase. Publique os índices do projeto para continuar." : "Não foi possível consultar os registros. Verifique a conexão e a configuração do servidor." }, { status: 503 });
  }
}
