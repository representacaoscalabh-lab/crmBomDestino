import type { Customer, CustomerGroup, Order, Product } from "./types";

export const PRODUCT_STATES = ["Cresceu", "Queda", "Sem alteração", "Retomou a compra", "Primeira compra registrada", "Sem recompra", "Sem compra", "Sem comparação"] as const;
export function buildStoreProducts(customers: Customer[], group: CustomerGroup, products: Product[], orders: Order[], end: string, scope: string) {
  const month = end.slice(0, 7), start = `${month}-01`;
  const [year, monthNumber, day] = end.split("-").map(Number);
  const previousMonth = new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7);
  const previousEnd = `${previousMonth}-${String(Math.min(day, new Date(Date.UTC(year, monthNumber - 1, 0)).getUTCDate())).padStart(2, "0")}`;
  const hasComparison = previousMonth >= "2026-10";
  const historyMonths = [3, 2, 1].map(offset => new Date(Date.UTC(year, monthNumber - 1 - offset, 1)).toISOString().slice(0, 7)).filter(value => value >= "2026-10");
  const catalog = new Map(products.map(product => [product.id, { id: product.id, code: product.codeBox, name: product.description }]));
  const byCode = new Map(products.flatMap(product => [product.codeBox, product.codeHalfBox].filter(Boolean).map(code => [code, product.id] as const)));
  const members = customers.filter(customer => customer.groupId === group.id && (scope === "all" || (scope === "ours" ? !group.externalStoreSellers?.[customer.id]?.trim() : !!group.externalStoreSellers?.[customer.id]?.trim())));
  const memberIds = new Set(members.map(customer => customer.id));
  type Totals = { quantity: number; weight: number; revenue: number; previous: number; previousRevenue: number; earlier: boolean; lastPurchase: string; history: number[] };
  const totals = new Map<string, Map<string, Totals>>();
  for (const order of orders) {
    if (order.status !== "normal" || !memberIds.has(order.customerId) || order.issueDate < "2026-10-01" || order.issueDate > end) continue;
    let store = totals.get(order.customerId);
    if (!store) { store = new Map(); totals.set(order.customerId, store); }
    for (const item of order.items) {
      const id = (catalog.has(item.productId) ? item.productId : byCode.get(item.productCode)) || item.productId || `code:${item.productCode || item.description}`;
      if (!catalog.has(id)) catalog.set(id, { id, code: item.productCode, name: item.description });
      const entry = store.get(id) ?? { quantity: 0, weight: 0, revenue: 0, previous: 0, previousRevenue: 0, earlier: false, lastPurchase: "", history: historyMonths.map(() => 0) };
      const quantity = Number.isFinite(item.unitQuantity) ? item.unitQuantity : 0;
      const revenue = item.subtotal ?? item.packagePrice * item.packageQuantity * (1 - (item.discountPercent ?? 0) / 100);
      if (order.issueDate >= start) { entry.quantity += quantity; entry.weight += item.totalWeight; entry.revenue += revenue; }
      if (hasComparison && order.issueDate >= `${previousMonth}-01` && order.issueDate <= previousEnd) { entry.previous += quantity; entry.previousRevenue += revenue; }
      if (order.issueDate < `${previousMonth}-01` && quantity > 0) entry.earlier = true;
      const index = historyMonths.indexOf(order.issueDate.slice(0, 7));
      if (index >= 0) entry.history[index] += quantity;
      if (quantity > 0 && order.issueDate > entry.lastPurchase) entry.lastPurchase = order.issueDate;
      store.set(id, entry);
    }
  }
  const rows = members.flatMap(customer => [...catalog.values()].map(product => {
    const entry = totals.get(customer.id)?.get(product.id) ?? { quantity: 0, weight: 0, revenue: 0, previous: 0, previousRevenue: 0, earlier: false, lastPurchase: "", history: historyMonths.map(() => 0) };
    const delta = entry.quantity - entry.previous;
    const hadPreviousMonth = (entry.history.at(-1) ?? 0) > 0;
    const state = !hasComparison ? (entry.quantity > 0 ? "Sem comparação" : "Sem compra") : entry.quantity > 0 ? entry.previous > 0 ? delta > 0.000001 ? "Cresceu" : delta < -0.000001 ? "Queda" : "Sem alteração" : entry.earlier && !hadPreviousMonth ? "Retomou a compra" : !entry.lastPurchase || (!entry.earlier && !hadPreviousMonth) ? "Primeira compra registrada" : "Sem base comparável" : entry.previous > 0 || hadPreviousMonth ? "Sem recompra" : "Sem compra";
    return { id: JSON.stringify([customer.id, product.id]), customerId: customer.id, customer: customer.name, code: customer.code, store: customer.store, city: customer.city, document: customer.document ?? "", responsible: group.externalStoreSellers?.[customer.id]?.trim() ? "Sul de Minas" : "WRRJ", productId: product.id, product: product.name, productCode: product.code, ...entry, delta, state, growth: hasComparison && entry.previous > 0 ? delta / entry.previous * 100 : null };
  }));
  return { rows, month, start, end, previousMonth, previousEnd, hasComparison, historyMonths };
}
export type StoreProductReport = ReturnType<typeof buildStoreProducts>;


export function summarizeStoreProducts(rows: StoreProductReport["rows"]) {
  const stores = new Map<string, { id: string; customer: string; code: string; store: string; city: string; document: string; responsible: string; quantity: number; previous: number; revenue: number; weight: number; products: number; lost: number; resumed: number; items: StoreProductReport["rows"] }>();
  for (const row of rows) {
    const store = stores.get(row.customerId) ?? { id: row.customerId, customer: row.customer, code: row.code, store: row.store, city: row.city, document: row.document, responsible: row.responsible, quantity: 0, previous: 0, revenue: 0, weight: 0, products: 0, lost: 0, resumed: 0, items: [] };
    store.quantity += row.quantity; store.previous += row.previous; store.revenue += row.revenue; store.weight += row.weight;
    if (row.quantity > 0) store.products++;
    if (row.state === "Sem recompra") store.lost++;
    if (row.state === "Retomou a compra") store.resumed++;
    store.items.push(row);
    stores.set(row.customerId, store);
  }
  return [...stores.values()];
}
