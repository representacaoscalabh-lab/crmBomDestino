import type { Customer, CustomerGroup, Order } from "./types";

const HISTORY_START = "2026-10-01";

export function defaultGrowthMonths(start: string) {
  const [year, month] = start.split("-").map(Number);
  return [3, 2, 1].map((offset) => new Date(Date.UTC(year, month - 1 - offset, 1)).toISOString().slice(0, 7)).filter((month) => month >= HISTORY_START.slice(0, 7));
}

export function buildStoreGrowth(customers: Customer[], group: CustomerGroup, orders: Order[], start: string, end: string, scope: string, comparisonMonths?: string[]) {
  const months = [...new Set(comparisonMonths ?? defaultGrowthMonths(start))].filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month >= HISTORY_START.slice(0, 7) && month < start.slice(0, 7)).slice(0, 3);
  const totals = new Map<string, { weight: number; revenue: number; history: number[]; historyRevenue: number[] }>();
  for (const order of orders) {
    if (order.status !== "normal" || order.issueDate < HISTORY_START) continue;
    const current = order.issueDate >= start && order.issueDate <= end;
    const index = months.indexOf(order.issueDate.slice(0, 7));
    if (!current && index < 0) continue;
    const entry = totals.get(order.customerId) ?? { weight: 0, revenue: 0, history: months.map(() => 0), historyRevenue: months.map(() => 0) };
    if (current) { entry.weight += order.totalWeight; entry.revenue += order.totalValue; }
    else { entry.history[index] += order.totalWeight; entry.historyRevenue[index] += order.totalValue; }
    totals.set(order.customerId, entry);
  }
  const rows = customers.filter((customer) => customer.groupId === group.id).map((customer) => {
    const seller = group.externalStoreSellers?.[customer.id]?.trim() || "";
    const entry = totals.get(customer.id) ?? { weight: 0, revenue: 0, history: months.map(() => 0), historyRevenue: months.map(() => 0) };
    const average = entry.history.reduce((sum, value) => sum + value, 0) / Math.max(1, months.length);
    const averageRevenue = entry.historyRevenue.reduce((sum, value) => sum + value, 0) / Math.max(1, months.length);
    const hasComparison = months.length > 0;
    const delta = entry.weight - average;
    return { id: customer.id, name: customer.name, document: customer.document ?? "", code: customer.code, store: customer.store, city: customer.city, seller, ...entry, average, averageRevenue, delta, hasComparison, growth: !hasComparison ? null : average > 0 ? delta / average * 100 : entry.weight === 0 ? 0 : null, trend: !hasComparison ? "none" : delta > 0.000001 ? "up" : delta < -0.000001 ? "down" : "flat" };
  }).filter(({ seller }) => scope === "all" || (scope === "ours" ? !seller : !!seller));
  return { months, rows };
}
