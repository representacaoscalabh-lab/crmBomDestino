import { apiConfig } from "@/cfg/api";

export function buildApiOpenApi() {
  const error = { description: "Erro em JSON: { error: { code, message } }" };
  const paths: Record<string, unknown> = {
    "/api/v1": { get: { summary: "Informações da API e coleções permitidas", responses: { 200: { description: "Configuração pública da API, sem credenciais" }, 401: error, 403: error, 503: error } } },
    "/api/v1/collections": { get: { summary: "Catálogo de coleções e campos conforme o perfil", responses: { 200: { description: "{ data: [{ name, description, access, fields, itemFields? }] }" }, 401: error, 403: error, 503: error } } },
    "/api/v1/openapi": { get: { summary: "Este documento OpenAPI", responses: { 200: { description: "OpenAPI 3.0.3" }, 401: error, 403: error, 503: error } } },
  };
  for (const collection of apiConfig.collections.filter(item => item.access !== "internal")) {
    const recordSchema = { type: "object", description: collection.description, additionalProperties: true,
      properties: Object.fromEntries(collection.fields.map(field => [field.name, {
        ...fieldSchema(field.type), description: `${field.type}${field.optional ? " (opcional)" : ""}`,
        ...(field.name === "items" && "itemFields" in collection ? { type: "array", items: { type: "object", properties: Object.fromEntries(collection.itemFields!.map(item => [item.name, { ...fieldSchema(item.type), description: item.type }])) } } : {}),
      }])),
    };
    const responses = { 400: error, 401: error, 403: error, 404: error, 503: error };
    paths[`/api/v1/collections/${collection.name}`] = { get: {
      summary: `Listar ${collection.description}`, tags: [collection.name],
      description: `Leitura ${collection.access === "admin" ? "exclusiva de administradores" : "para usuários aprovados"}. Ordenação por ID ascendente. Campos ausentes em documentos legados são preservados como ausentes.`,
      parameters: [
        { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: apiConfig.maxLimit, default: apiConfig.defaultLimit } },
        { in: "query", name: "after", description: "ID retornado em pagination.next; omita na primeira página", schema: { type: "string" } },
      ],
      responses: { ...responses, 200: { description: "Página de documentos completos, incluindo itens", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: recordSchema }, pagination: { type: "object", properties: { limit: { type: "integer" }, next: { type: "string", nullable: true } } } } } } } } },
    } };
    paths[`/api/v1/collections/${collection.name}/{id}`] = { get: {
      summary: `Consultar documento em ${collection.name}`, tags: [collection.name],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { ...responses, 200: { description: "Documento completo", content: { "application/json": { schema: { type: "object", properties: { data: recordSchema } } } } } },
    } };
  }
  return { openapi: "3.0.3", info: { title: apiConfig.name, version: apiConfig.version, description: "API de leitura do CRM. Timestamps em ISO 8601 UTC; valores monetários em reais, exceto valueCents (centavos); pesos em kg. settings expõe somente mart_minas, oesa_nova_safra e read_optimization." },
    servers: [{ url: "/" }], security: [{ firebaseBearer: [] }],
    components: { securitySchemes: { firebaseBearer: { type: "http", scheme: "bearer", bearerFormat: "Firebase ID token" } } }, paths,
  };
}

function fieldSchema(type: string): Record<string, unknown> {
  if (type === "Timestamp") return { type: "string", format: "date-time" };
  if (["string", "number", "boolean"].includes(type)) return { type };
  if (/^"[^"]+"(\s*\|\s*"[^"]+")*$/.test(type)) return { type: "string", enum: type.match(/"([^"]+)"/g)!.map(value => value.slice(1, -1)) };
  if (type.endsWith("[]")) return { type: "array", items: { type: "object" } };
  if (type.startsWith("string")) return { type: "string" };
  if (type.startsWith("boolean")) return { type: "boolean" };
  return { type: "object", additionalProperties: true };
}
