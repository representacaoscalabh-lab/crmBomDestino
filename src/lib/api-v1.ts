import { NextResponse } from "next/server";
import { FieldPath, Timestamp, GeoPoint, DocumentReference } from "firebase-admin/firestore";
import { getAdminServices } from "@/lib/firebase-admin";
import { apiConfig, getApiCollection } from "@/cfg/api";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function apiJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function apiHandler(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof ApiError) return apiJson({ error: { code: error.code, message: error.message } }, error.status);
    console.error("Falha na API v1", error instanceof Error ? error.message : "unknown");
    return apiJson({ error: { code: "service-unavailable", message: "Não foi possível consultar o Firebase. Confira a configuração do servidor." } }, 503);
  }
}

export async function authorizeApi(request: Request) {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new ApiError(401, "unauthenticated", "Informe um Firebase ID token no cabeçalho Authorization: Bearer <token>.");
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new ApiError(503, "server-not-configured", "A credencial Firebase Admin não está configurada no servidor.");
  const { adminAuth, adminDb } = getAdminServices();
  let uid: string;
  try { uid = (await adminAuth.verifyIdToken(match[1], true)).uid; }
  catch { throw new ApiError(401, "invalid-token", "Token inválido, revogado ou expirado."); }
  // Admin SDK bypasses Firestore rules: always verify the current user document.
  const user = (await adminDb.collection("users").doc(uid).get()).data();
  if (user?.status !== "approved") throw new ApiError(403, "forbidden", "Seu acesso ao CRM não está aprovado.");
  return { adminDb, uid, admin: user.role === "admin" };
}

export function requireApiCollection(name: string, admin: boolean) {
  const collection = getApiCollection(name);
  if (!collection || collection.access === "internal") throw new ApiError(404, "collection-not-found", "Coleção não disponível na API.");
  if (collection.access === "admin" && !admin) throw new ApiError(403, "forbidden", "Esta coleção exige perfil administrador.");
  return collection;
}

export function validDocumentId(id: string) {
  if (!id || id.includes("/") || id === "." || id === ".." || Buffer.byteLength(id) > 1500) {
    throw new ApiError(400, "invalid-id", "ID de documento inválido.");
  }
  return id;
}

export function parseApiPagination(url: URL) {
  for (const key of url.searchParams.keys()) {
    if (!["limit", "after"].includes(key) || url.searchParams.getAll(key).length !== 1) throw new ApiError(400, "invalid-query", "Use apenas limit e after, sem repetir parâmetros.");
  }
  const raw = url.searchParams.get("limit");
  const limit = raw === null ? apiConfig.defaultLimit : Number(raw);
  if (raw !== null && !/^\d+$/.test(raw) || !Number.isInteger(limit) || limit < 1 || limit > apiConfig.maxLimit) {
    throw new ApiError(400, "invalid-limit", `limit deve ser um inteiro entre 1 e ${apiConfig.maxLimit}.`);
  }
  const after = url.searchParams.get("after");
  if (after !== null) validDocumentId(after);
  return { limit, after };
}

/** Keep Firestore values predictable in JSON, including nested item fields. */
export function serializeApiValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof GeoPoint) return { latitude: value.latitude, longitude: value.longitude };
  if (value instanceof DocumentReference) return value.path;
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map(serializeApiValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeApiValue(item)]));
  return value;
}

export async function listApiDocuments(request: Request, name: string) {
  const { adminDb, admin } = await authorizeApi(request);
  requireApiCollection(name, admin);
  const { limit, after } = parseApiPagination(new URL(request.url));
  // Only known settings documents are exposed, never future server secrets.
  let query = adminDb.collection(name).orderBy(FieldPath.documentId());
  if (name === "settings") query = query.where(FieldPath.documentId(), "in", ["mart_minas", "oesa_nova_safra", "read_optimization"]);
  if (after) query = query.startAfter(after);
  const snapshot = await query.limit(limit + 1).get();
  const documents = snapshot.docs.slice(0, limit);
  return apiJson({ data: documents.map(doc => ({ ...serializeApiValue(doc.data()) as object, id: doc.id })), pagination: { limit, next: snapshot.size > limit ? documents.at(-1)!.id : null } });
}

export async function getApiDocument(request: Request, name: string, id: string) {
  const { adminDb, admin } = await authorizeApi(request);
  requireApiCollection(name, admin);
  validDocumentId(id);
  if (name === "settings" && !["mart_minas", "oesa_nova_safra", "read_optimization"].includes(id)) throw new ApiError(404, "document-not-found", "Documento não disponível na API.");
  const snapshot = await adminDb.collection(name).doc(id).get();
  if (!snapshot.exists) throw new ApiError(404, "document-not-found", "Documento não encontrado.");
  return apiJson({ data: { ...serializeApiValue(snapshot.data()) as object, id: snapshot.id } });
}
