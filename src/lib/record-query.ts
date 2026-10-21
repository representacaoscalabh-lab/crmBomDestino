import type { Bonification, Order } from "@/lib/types";

export type RecordResource = "orders" | "bonifications";
export type RecordFilters = { start: string; end: string; query?: string; customerName?: string; city?: string[]; reason?: string[]; portfolio?: string; network?: string; segment?: string };
export type RecordHeader = Omit<Order, "items"> & Partial<Omit<Bonification, "items">> & { itemCount?: number };
export type RecordCursor = { value: string | number; id: string };
export type RecordTotals = { count: number; weight: number; value: number };
export type RecordPage = { rows: RecordHeader[]; next: RecordCursor | null; scanned: number };
export const normalizeRecordText = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

export function matchesRecord(row: Record<string, unknown>, filters: RecordFilters, customer: { city?: string; groupId?: string; segment?: string; document?: string } | undefined, external: boolean, resource: RecordResource) {
  const city = String(row.customerCity || customer?.city || "").trim();
  if (filters.city?.length && !filters.city.includes(city)) return false;
  if (filters.reason?.length && !filters.reason.includes(String(row.reason ?? "").trim())) return false;
  if (filters.portfolio === "ours" && external || filters.portfolio === "external" && !external) return false;
  if (filters.network && filters.network !== customer?.groupId || filters.segment && filters.segment !== customer?.segment) return false;
  if (filters.customerName && !normalizeRecordText(String(row.customerName ?? "")).includes(normalizeRecordText(filters.customerName))) return false;
  const text = resource === "bonifications"
    ? `${row.bonusNumber} ${row.customerName} ${row.customerCode} ${row.store} ${row.reason} ${row.notes}`
    : `${row.preOrder} ${row.customerCode} ${row.invoice} ${customer?.document ?? ""}`;
  return !filters.query || normalizeRecordText(text).includes(normalizeRecordText(filters.query));
}

export function hasAdvancedFilters(filters: RecordFilters) {
  return Boolean(filters.query || filters.customerName || filters.city?.length || filters.reason?.length || filters.network || filters.segment || filters.portfolio && filters.portfolio !== "all");
}

export function currentRecordMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find(part => part.type === "year")!.value;
  const month = parts.find(part => part.type === "month")!.value;
  return { start: `${year}-${month}-01`, end: `${year}-${month}-${new Date(Number(year), Number(month), 0).getDate()}` };
}
