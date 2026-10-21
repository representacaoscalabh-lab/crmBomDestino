import type { Customer, CustomerGroup, Order } from "@/lib/types";
import { getExternalCustomerIds } from "@/lib/dashboard-scope";
import { calculateSellerCommission } from "@/lib/network-commission";

export function buildDashboardCommission(customers: Customer[], groups: CustomerGroup[], periodOrders: Order[]) {
  const excluded = getExternalCustomerIds(customers, groups);
  const byCustomer = new Map(customers.map((customer) => [customer.id, customer]));
  const byGroup = new Map(groups.map((group) => [group.id, group]));
  const byStore = new Map<string, { groupId: string; base: number; orders: number }>();
  for (const order of periodOrders) {
    if (order.status !== "normal" || excluded.has(order.customerId)) continue;
    const groupId = byCustomer.get(order.customerId)?.groupId ?? "";
    const entry = byStore.get(order.customerId) ?? { groupId: byGroup.has(groupId) ? groupId : "", base: 0, orders: 0 };
    entry.base += order.totalValue; entry.orders++;
    byStore.set(order.customerId, entry);
  }
  const rows = groups.map((group) => ({ id: group.id, name: group.name, percent: typeof group.commissionPercent === "number" && Number.isFinite(group.commissionPercent) && group.commissionPercent >= 0 && group.commissionPercent <= 100 ? group.commissionPercent : null, baseCents: 0, commissionCents: 0, stores: 0, orders: 0 }));
  const ungrouped = { id: "", name: "Clientes sem rede vinculada", percent: null, baseCents: 0, commissionCents: 0, stores: 0, orders: 0 };
  const lookup = new Map(rows.map((row) => [row.id, row]));
  const sellerCents = new Map<string, number>();
  for (const entry of byStore.values()) {
    const row = lookup.get(entry.groupId) ?? ungrouped;
    const base = Math.round(entry.base * 100);
    row.baseCents += base; row.stores++; row.orders += entry.orders;
    if (row.percent !== null) row.commissionCents += Math.round(base * row.percent / 100);

  }
  if (ungrouped.orders) rows.push(ungrouped);
  const visible = rows.filter((row) => row.orders > 0 || row.percent !== null || byGroup.get(row.id)?.sellerCommissionPercent !== undefined).map((row) => {
    const group = byGroup.get(row.id);
    const sellerConfigured = calculateSellerCommission(0, 0, group?.sellerCommissionPercent, group?.sellerCommissionBase ?? "orders") !== null;
    return { id: row.id, name: row.name, percent: row.percent, base: row.baseCents / 100, commission: row.percent === null ? null : row.commissionCents / 100, stores: row.stores, orders: row.orders, sellerPercent: sellerConfigured ? group!.sellerCommissionPercent! : null, sellerCommission: sellerConfigured ? (sellerCents.get(row.id) ?? 0) / 100 : null };
  });
  return {
    rows: visible,
    commission: rows.reduce((sum, row) => sum + row.commissionCents, 0) / 100,
    sellerCommission: [...sellerCents.values()].reduce((sum, value) => sum + value, 0) / 100,
    pendingSellerStores: 0,
    coveredBase: rows.filter((row) => row.percent !== null).reduce((sum, row) => sum + row.baseCents, 0) / 100,
    uncoveredBase: rows.filter((row) => row.percent === null).reduce((sum, row) => sum + row.baseCents, 0) / 100,
    pendingStores: rows.filter((row) => row.percent === null).reduce((sum, row) => sum + row.stores, 0),
  };
}

/** Consolidated network summary, including stores assigned to Sul de Minas. */
export function buildNetworkDashboardCommission(customers: Customer[], group: CustomerGroup | undefined, orders: Order[]) {
  const stores = new Map(customers.filter(customer => customer.groupId === group?.id).map(customer => [customer.id, { customer, baseCents: 0, orders: 0 }]));
  for (const order of orders) {
    const store = stores.get(order.customerId);
    if (!store || order.status !== "normal") continue;
    store.baseCents += Math.round(order.totalValue * 100);
    store.orders += order.recordCount ?? 1;
  }
  const percent = group?.commissionPercent;
  const configured = typeof percent === "number" && Number.isFinite(percent) && percent >= 0 && percent <= 100;
  let commissionCents = 0, sellerCents = 0, pendingStores = 0, baseCents = 0, orderCount = 0, storeCount = 0;
  for (const store of stores.values()) {
    if (!store.orders) continue;
    baseCents += store.baseCents; orderCount += store.orders; storeCount++;
    if (!configured) { pendingStores++; continue; }
    const representation = Math.round(store.baseCents * percent / 100);
    if (group?.externalStoreSellers?.[store.customer.id]?.trim()) {
      const seller = calculateSellerCommission(store.baseCents / 100, representation / 100, group.sellerCommissionPercent, group.sellerCommissionBase ?? "orders");
      if (seller === null) pendingStores++;
      else sellerCents += Math.round(seller * 100);
    } else commissionCents += representation;
  }
  return { configured, percent, commission: commissionCents / 100, sellerCommission: sellerCents / 100, total: (commissionCents + sellerCents) / 100, pendingStores, base: baseCents / 100, orders: orderCount, stores: storeCount };
}
