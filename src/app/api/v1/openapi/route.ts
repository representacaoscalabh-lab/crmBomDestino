import { buildApiOpenApi } from "@/lib/api-openapi";
import { apiHandler, apiJson, authorizeApi } from "@/lib/api-v1";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return apiHandler(async () => { await authorizeApi(request); return apiJson(buildApiOpenApi()); });
}
