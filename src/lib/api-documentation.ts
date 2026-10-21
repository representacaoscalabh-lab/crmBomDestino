import { apiConfig } from "@/cfg/api";
import { buildApiOpenApi } from "@/lib/api-openapi";

export function openApiDocument(origin: string) {
  return { ...buildApiOpenApi(), servers: [{ url: origin || "/" }] };
}

export function apiDocumentation(origin: string) {
  const base = `${origin}${apiConfig.basePath}`;
  return [
    `# ${apiConfig.name} — ${apiConfig.version}`,
    `Base: ${base}\nMétodo: GET (leitura)\nAutenticação: Authorization: Bearer <Firebase ID token>`,
    "Obtenha o token após login com await auth.currentUser.getIdToken(). O usuário deve estar aprovado. users e access_requests exigem administrador. Nunca compartilhe o token.",
    `## Endpoints\nGET ${base}\nGET ${base}/collections\nGET ${base}/openapi\nGET ${base}/collections/{collection}?limit=25\nGET ${base}/collections/{collection}/{id}`,
    `## Paginação\nlimit: 1 a ${apiConfig.maxLimit} (padrão ${apiConfig.defaultLimit}). Ordenação por ID crescente. Use pagination.next como after, codificado com encodeURIComponent, até next ser null.`,
    'Lista: { "data": [...], "pagination": { "limit": 25, "next": null } }\nDetalhe: { "data": {...} }\nErro: { "error": { "code": "...", "message": "..." } }',
    "## Formatos\nDatas comerciais: YYYY-MM-DD. Timestamps: ISO 8601 UTC. Valores: reais; valueCents: centavos. Pesos: kg. Campos ausentes ou adicionais de documentos legados são preservados. Pedidos e bonificações incluem items completos.",
    "## Acesso e erros\n400: parâmetro inválido. 401: token ausente, inválido ou expirado. 403: acesso negado. 404: coleção ou documento indisponível. 503: serviço indisponível. settings expõe somente mart_minas, oesa_nova_safra e read_optimization. aggregate_states é interna e não expõe dados. Consultas exigem servidor Next.js com Firebase Admin e contam como leituras do Firestore.",
    `## Exemplo\ncurl -H "Authorization: Bearer $TOKEN" "${base}/collections/orders?limit=25"`,
    `## Catálogo completo de coleções e campos\n\n${JSON.stringify(apiConfig.collections, null, 2)}`,
    `## OpenAPI completo\n\n${JSON.stringify(openApiDocument(origin), null, 2)}`,
  ].join("\n\n");
}

export function downloadApiDocument(origin: string) {
  const blob = new Blob([JSON.stringify(openApiDocument(origin), null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "crm-api-openapi.json";
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}

export async function copyApiText(text: string) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  } catch { /* Fall back to selection when clipboard access is restricted. */ }
  const active = document.activeElement;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;left:-9999px;top:0;";
  document.body.appendChild(textarea);
  try {
    textarea.select();
    if (!document.execCommand("copy")) throw new Error("O navegador bloqueou a cópia. Permita o acesso à área de transferência e tente novamente.");
  } finally { textarea.remove(); if (active instanceof HTMLElement) active.focus(); }
}
