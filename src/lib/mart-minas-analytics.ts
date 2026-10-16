import type { Bonification, Customer, CustomerGroup, Order, OrderItem } from "./types";

export const MART_MINAS_START = "2026-10-01";

export type Totals = { weight: number; revenue: number; orders: number; mix: number };
export type MonthPeriod = { month: string; start: string; end: string; partial: boolean };
export type ProductResult = {
  id: string; name: string; code: string; current: number; previous: number; average: number;
  revenue: number; units: number; stores: number; previousStores: number; lostStores: string[];
  history: number[]; delta: number; share: number;
};
export type StoreResult = {
  customer: Customer; seller: string; current: Totals; previous: Totals; average: number;
  history: Totals[]; delta: number; lastPurchase: string; daysSince: number | null;
  usualGap: number | null; overdue: boolean; state: string; products: ProductResult[];
};
const iso = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
export function saoPauloToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map((key) => parts.find((part) => part.type === key)!.value).join("-");
}
export function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year, number - 1 + offset, 1));
  return iso(value.getUTCFullYear(), value.getUTCMonth() + 1, 1).slice(0, 7);
}
export function monthPeriod(month: string, cutoff?: number): MonthPeriod {
  const [year, number] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const day = Math.min(days, cutoff ?? days);
  return { month, start: `${month}-01`, end: iso(year, number, day), partial: day < days };
}
export function variation(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous * 100 : null;
}
const inPeriod = (date: string, period: MonthPeriod) => date >= period.start && date <= period.end;
const productKey = (item: OrderItem) => item.productId || item.productCode || item.description;
const dayDistance = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
function sum(orders: Order[]): Totals {
  return {
    weight: orders.reduce((total, order) => total + order.totalWeight, 0),
    revenue: orders.reduce((total, order) => total + order.totalValue, 0),
    orders: orders.length, mix: new Set(orders.flatMap((order) => order.items.map(productKey))).size,
  };
}

function productRows(orders: Order[], periods: MonthPeriod[]): ProductResult[] {
  const rows = new Map<string, { name: string; code: string; history: number[]; revenue: number; units: number; stores: Set<string>[] }>();
  for (const order of orders) {
    const index = periods.findIndex((period) => inPeriod(order.issueDate, period));
    if (index < 0) continue;
    for (const item of order.items) {
      const id = productKey(item);
      const row = rows.get(id) ?? { name: item.description, code: item.productCode, history: periods.map(() => 0), revenue: 0, units: 0, stores: periods.map(() => new Set<string>()) };
      row.history[index] += item.totalWeight;
      row.stores[index].add(order.customerId);
      if (index === periods.length - 1) {
        row.revenue += item.subtotal ?? item.packagePrice * item.packageQuantity * (1 - (item.discountPercent ?? 0) / 100);
        row.units += item.unitQuantity;
      }
      rows.set(id, row);
    }
  }
  const total = [...rows.values()].reduce((value, row) => value + row.history.at(-1)!, 0);
  return [...rows].map(([id, row]) => {
    const current = row.history.at(-1)!, previous = row.history.at(-2) ?? 0;
    const currentStores = row.stores.at(-1)!, previousStores = row.stores.at(-2) ?? new Set<string>();
    return { id, name: row.name, code: row.code, current, previous,
      average: row.history.slice(-4, -1).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(3, periods.length - 1)),
      revenue: row.revenue, units: row.units, stores: currentStores.size, previousStores: previousStores.size,
      lostStores: [...previousStores].filter((id) => !currentStores.has(id)), history: row.history,
      delta: periods.length > 1 ? current - previous : 0, share: total > 0 ? current / total * 100 : 0 };
  }).sort((a, b) => b.current - a.current || a.name.localeCompare(b.name, "pt-BR"));
}

export function buildMartMinasAnalytics(input: {
  group: CustomerGroup; customers: Customer[]; orders: Order[]; bonifications: Bonification[];
  month: string; scope: string; status: string; historyMonths: number; today: string;
  start?: string; end?: string; trackingStart?: string;
}) {
  const { group, customers, scope, status, today } = input;
  const trackingStart = input.trackingStart ?? MART_MINAS_START;
  const custom = !!input.start && !!input.end;
  const month = custom ? input.end!.slice(0, 7) : input.month;
  const cutoff = !custom && month === today.slice(0, 7) ? Number(today.slice(8, 10)) : undefined;
  const length = Math.max(4, input.historyMonths);
  const duration = custom ? dayDistance(input.start!, input.end!) + 1 : 0;
  if (custom && duration <= 0) throw new Error("Período inválido.");
  const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const periods = Array.from({ length }, (_, index): MonthPeriod => {
    if (!custom) return monthPeriod(shiftMonth(month, index - length + 1), cutoff);
    const offset = (index - length + 1) * duration;
    const start = addDays(input.start!, offset), end = addDays(input.end!, offset);
    return { month: end.slice(0, 7), start, end, partial: true };
  }).filter((period) => period.start >= trackingStart);
  if (!periods.length) throw new Error("Selecione um período a partir do início do acompanhamento.");
  const hasPrevious = periods.length > 1;
  const averageCount = Math.min(3, periods.length - 1);
  const currentPeriod = periods.at(-1)!;
  const yearBefore = (date: string) => {
    const target = shiftMonth(date.slice(0, 7), -12);
    return monthPeriod(target, Number(date.slice(8))).end;
  };
  const previousYearPeriod = custom ? { month: shiftMonth(month, -12), start: yearBefore(input.start!), end: yearBefore(input.end!), partial: true } : monthPeriod(shiftMonth(month, -12), cutoff);
  const sellerFor = (id: string) => group.externalStoreSellers?.[id]?.trim() || "";
  const allMembers = customers.filter((customer) => customer.groupId === group.id);
  const members = allMembers.filter((customer) => scope === "all" || (scope === "ours" ? !sellerFor(customer.id) : scope === "external" ? !!sellerFor(customer.id) : sellerFor(customer.id) === scope.slice(7)));
  const memberIds = new Set(members.map((customer) => customer.id));
  const networkIds = new Set(allMembers.map((customer) => customer.id));
  const networkOrders = input.orders.filter((order) => networkIds.has(order.customerId) && order.issueDate >= trackingStart && order.issueDate <= currentPeriod.end && (status === "all" || order.status === status));
  const orders = networkOrders.filter((order) => memberIds.has(order.customerId));
  const monthly = periods.map((period) => {
    const selected = orders.filter((order) => inPeriod(order.issueDate, period));
    return { period, ...sum(selected), activeStores: new Set(selected.map((order) => order.customerId)).size };
  });
  const current = monthly.at(-1)!, previous = monthly.at(-2) ?? { period: currentPeriod, weight: 0, revenue: 0, orders: 0, mix: 0, activeStores: 0 };
  const average = monthly.slice(-4, -1).reduce((total, item) => total + item.weight, 0) / Math.max(1, averageCount);
  const yearOrders = orders.filter((order) => inPeriod(order.issueDate, previousYearPeriod));
  const previousYear = sum(yearOrders);
  const products = productRows(orders, periods);
  const stores: StoreResult[] = members.map((customer) => {
    const customerOrders = orders.filter((order) => order.customerId === customer.id);
    const history = periods.map((period) => sum(customerOrders.filter((order) => inPeriod(order.issueDate, period))));
    const current = history.at(-1)!, previous = history.at(-2) ?? { weight: 0, revenue: 0, orders: 0, mix: 0 };
    const dates = [...new Set(customerOrders.map((order) => order.issueDate))].sort();
    const lastPurchase = dates.at(-1) ?? "";
    // A recent baseline limits the effect of old pauses; at least four purchase dates are required.
    const recentDates = dates.filter((date) => date >= `${shiftMonth(month, -5)}-01`).slice(-8);
    const gaps = recentDates.slice(1).map((date, i) => dayDistance(recentDates[i], date)).sort((a, b) => a - b);
    const middle = Math.floor(gaps.length / 2);
    const usualGap = gaps.length >= 3 ? gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2 : null;
    const daysSince = lastPurchase ? dayDistance(lastPurchase, currentPeriod.end) : null;
    const hadOlderPurchase = customerOrders.some((order) => order.issueDate < currentPeriod.start);
    return { customer, seller: sellerFor(customer.id), current, previous, history,
      average: history.slice(-4, -1).reduce((total, item) => total + item.weight, 0) / Math.max(1, Math.min(3, periods.length - 1)),
      delta: hasPrevious ? current.weight - previous.weight : 0, lastPurchase, daysSince, usualGap,
      overdue: usualGap !== null && daysSince !== null && daysSince > usualGap * 1.5,
      state: !hasPrevious ? current.orders > 0 ? "Mês inicial" : "Sem compra no período" : current.orders === 0 ? previous.orders > 0 ? "Sem recompra" : "Sem compra no período" : previous.orders === 0 ? hadOlderPurchase ? "Retomada" : "Primeira compra registrada" : current.weight < previous.weight ? "Queda" : current.weight > previous.weight ? "Crescimento" : "Estável",
      products: productRows(customerOrders, periods) };
  }).sort((a, b) => a.delta - b.delta || a.customer.name.localeCompare(b.customer.name, "pt-BR"));
  const retained = stores.filter((store) => store.current.orders > 0 && store.previous.orders > 0);
  const sameStores = { count: retained.length, current: retained.reduce((total, store) => total + store.current.weight, 0), previous: retained.reduce((total, store) => total + store.previous.weight, 0) };
  const selectedBonifications = input.bonifications.filter((bonus) => memberIds.has(bonus.customerId) && inPeriod(bonus.issueDate, currentPeriod));
  const bonus = { count: selectedBonifications.length, weight: selectedBonifications.reduce((total, item) => total + item.totalWeight, 0), revenue: selectedBonifications.reduce((total, item) => total + item.totalValue, 0) };
  const currentOrders = orders.filter((order) => inPeriod(order.issueDate, currentPeriod)).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const sellerNames = [...new Set(allMembers.map((customer) => sellerFor(customer.id)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const selectedSellers = scope === "all" ? ["", ...sellerNames] : scope === "ours" ? [""] : scope === "external" ? sellerNames : [scope.slice(7)];
  const sellerTotals = selectedSellers.map((seller) => ({ seller, ...sum(orders.filter((order) => inPeriod(order.issueDate, currentPeriod) && sellerFor(order.customerId) === seller)) }));
  const historyCoverage = periods.slice(-4, -1).map((period) => ({ ...period, hasOrders: networkOrders.some((order) => inPeriod(order.issueDate, period)) }));
  return { periods, currentPeriod, previousYearPeriod, monthly, current, previous, average, previousYear, stores, products,
    sameStores, bonus, bonifications: selectedBonifications, currentOrders, sellerNames, sellerTotals, historyCoverage,
    members, cutoff, custom, duration, trackingStart, hasPrevious, averageCount, lost: stores.filter((store) => store.previous.orders > 0 && store.current.orders === 0),
    resumed: stores.filter((store) => store.state === "Retomada"),
    first: stores.filter((store) => store.state === "Primeira compra registrada") };
}

export type MartMinasAnalytics = ReturnType<typeof buildMartMinasAnalytics>;
