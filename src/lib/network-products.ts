import type { Customer, CustomerGroup, Order, Product } from "./types";

export function buildNetworkProducts(customers: Customer[], group: CustomerGroup, products: Product[], orders: Order[], start: string, end: string, scope: string) {
  const members = new Set(customers.filter(customer => customer.groupId === group.id && (scope === "all" || (scope === "ours" ? !group.externalStoreSellers?.[customer.id]?.trim() : !!group.externalStoreSellers?.[customer.id]?.trim()))).map(customer => customer.id));
  const byCode = new Map(products.flatMap(product => [product.codeBox, product.codeHalfBox].filter(Boolean).map(code => [code, product.id] as const)));
  const catalog = new Map(products.map(product => [product.id, product]));
  const makeRow = (id: string, code: string, name: string) => ({ id, code, name, units: 0, boxes: 0, halfBoxes: 0, weight: 0, value: 0, stores: new Set<string>(), orders: new Set<string>(), lastDate: "", lastOrder: "", lastCustomer: "", lastStore: "", lastGross: 0, lastUnits: 0, lastValue: 0, lastWeight: 0, lastKey: "" });
  const rows = new Map(products.map(product => [product.id, makeRow(product.id, product.codeBox, product.description)]));
  const entries = orders.filter(order => order.status === "normal" && members.has(order.customerId) && order.issueDate >= "2026-10-01" && order.issueDate <= end).sort((a, b) => a.issueDate.localeCompare(b.issueDate) || String(a.preOrder).localeCompare(String(b.preOrder), "pt-BR", { numeric: true }) || a.id.localeCompare(b.id));
  for (const order of entries) for (const item of order.items) {
    const id = (catalog.has(item.productId) ? item.productId : byCode.get(item.productCode)) || item.productId || `code:${item.productCode || item.description}`;
    const row = rows.get(id) ?? makeRow(id, item.productCode, item.description);
    const gross = item.unitPrice !== undefined ? item.unitPrice * item.unitQuantity : item.packagePrice * item.packageQuantity;
    const value = item.subtotal ?? gross * (1 - (item.discountPercent ?? 0) / 100);
    if (order.issueDate >= start) {
      row.units += item.unitQuantity; row.weight += item.totalWeight; row.value += value;
      if (item.packageKind === "Meia caixa") row.halfBoxes += item.boxQuantity ?? item.packageQuantity;
      else row.boxes += item.boxQuantity ?? item.packageQuantity;
      row.stores.add(order.customerId); row.orders.add(order.id);
    }
    if (row.lastKey !== order.id) { row.lastGross = 0; row.lastUnits = 0; row.lastValue = 0; row.lastWeight = 0; }
    row.lastKey = order.id; row.lastDate = order.issueDate; row.lastOrder = order.preOrder; row.lastCustomer = order.customerName; row.lastStore = order.store;
    row.lastGross += gross; row.lastUnits += item.unitQuantity; row.lastValue += value; row.lastWeight += item.totalWeight;
    rows.set(id, row);
  }
  return [...rows.values()].map(row => ({ ...row, value: Math.round(row.value * 100) / 100, lastValue: Math.round(row.lastValue * 100) / 100, stores: row.stores.size, orders: row.orders.size, lastUnitPrice: row.lastUnits > 0 ? row.lastGross / row.lastUnits : null }));
}
export type NetworkProductRow = ReturnType<typeof buildNetworkProducts>[number];
