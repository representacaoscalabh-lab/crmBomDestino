import { apiConfig } from "@/cfg/api";
import { apiHandler, apiJson, authorizeApi } from "@/lib/api-v1";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return apiHandler(async () => {
    const { admin } = await authorizeApi(request);
    return apiJson({ name: apiConfig.name, version: apiConfig.version, basePath: apiConfig.basePath,
      authentication: apiConfig.authentication, defaultLimit: apiConfig.defaultLimit, maxLimit: apiConfig.maxLimit,
      catalog: `${apiConfig.basePath}/collections`, openapi: `${apiConfig.basePath}/openapi`,
      collections: apiConfig.collections.filter(item => item.access !== "internal" && (item.access !== "admin" || admin)).map(item => item.name),
    });
  });
}
