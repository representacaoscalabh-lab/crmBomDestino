import type { Customer, CustomerGroup, Order } from "./types";

export type NetworkTotals = { orders: number; weight: number; revenue: number };
export function buildMartMinasReport(group: CustomerGroup, customers: Customer[], orders: Order[], start: string, end: string, status: string) {
  const members = new Map(customers.filter((customer) => customer.groupId === group.id).map((customer) => [customer.id, customer]));
  const entries = orders.filter((order) => members.has(order.customerId)
    && (!start || order.issueDate >= start) && (!end || order.issueDate <= end)
    && (status === "all" || order.status === status)).map((order) => ({
      order, customer: members.get(order.customerId)!, seller: group.externalStoreSellers?.[order.customerId]?.trim() || "",
    })).sort((a, b) => b.order.issueDate.localeCompare(a.order.issueDate) || a.order.preOrder.localeCompare(b.order.preOrder));
  const empty = (): NetworkTotals => ({ orders: 0, weight: 0, revenue: 0 });
  const ours = empty(), external = empty(), total = empty();
  const sellers = new Map<string, NetworkTotals>();
  const add = (summary: NetworkTotals, order: Order) => {
    summary.orders++; summary.weight += order.totalWeight; summary.revenue += order.totalValue;
  };
  for (const { order, seller } of entries) {
    add(total, order); add(seller ? external : ours, order);
    if (seller) {
      const summary = sellers.get(seller) ?? empty();
      add(summary, order); sellers.set(seller, summary);
    }
  }
  return { entries, ours, external, total, sellers: [...sellers].sort(([a], [b]) => a.localeCompare(b, "pt-BR")) };
}
