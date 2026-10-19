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
    const group = byGroup.get(entry.groupId);
    const sellerCommission = calculateSellerCommission(base / 100, row.percent === null ? 0 : Math.round(base * row.percent / 100) / 100, group?.sellerCommissionPercent, group?.sellerCommissionBase ?? "orders");
    if (sellerCommission !== null) sellerCents.set(row.id, (sellerCents.get(row.id) ?? 0) + Math.round(sellerCommission * 100));
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
    pendingSellerStores: visible.filter((row) => row.sellerPercent === null).reduce((sum, row) => sum + row.stores, 0),
    coveredBase: rows.filter((row) => row.percent !== null).reduce((sum, row) => sum + row.baseCents, 0) / 100,
    uncoveredBase: rows.filter((row) => row.percent === null).reduce((sum, row) => sum + row.baseCents, 0) / 100,
    pendingStores: rows.filter((row) => row.percent === null).reduce((sum, row) => sum + row.stores, 0),
  };
}
