import { apiHandler, listApiDocuments } from "@/lib/api-v1";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ collection: string }> }) {
  return apiHandler(async () => listApiDocuments(request, (await context.params).collection));
}
