import type { Bonification, Order, OrderItem } from "@/lib/types";

export type DailyRecord = {
  id: string; date: string; customerId: string; count: number; valueCents: number; weight: number;
  products: Record<string, { productId: string; productCode: string; description: string; weight: number; valueCents: number; units: number }>;
};

/** Only for dashboard aggregates; never use these synthetic records for editing/exporting orders. */
export function dailyToDashboardRecord(row: DailyRecord): Order & Bonification {
  const items: OrderItem[] = Object.values(row.products).map(product => ({
    productId: product.productId, productCode: product.productCode, description: product.description,
    packageKind: "Caixa", packageQuantity: 1, unitQuantity: product.units, packagePrice: product.valueCents / 100,
    totalWeight: product.weight, grossWeight: product.weight, subtotal: product.valueCents / 100,
  }));
  return { id: row.id, issueDate: row.date, customerId: row.customerId, customerName: "", customerCode: "", store: "", preOrder: "", invoice: "", status: "normal", bonusNumber: "", reason: "", notes: "", items, totalValue: row.valueCents / 100, totalWeight: row.weight, recordCount: row.count };
}
