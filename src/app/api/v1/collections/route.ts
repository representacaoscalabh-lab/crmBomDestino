import { apiConfig } from "@/cfg/api";
import { apiHandler, apiJson, authorizeApi } from "@/lib/api-v1";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return apiHandler(async () => {
    const { admin } = await authorizeApi(request);
    return apiJson({ data: apiConfig.collections.filter(item => item.access !== "internal" && (item.access !== "admin" || admin)) });
  });
}
