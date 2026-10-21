import { apiHandler, getApiDocument } from "@/lib/api-v1";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ collection: string; id: string }> }) {
  return apiHandler(async () => {
    const { collection, id } = await context.params;
    return getApiDocument(request, collection, id);
  });
}
