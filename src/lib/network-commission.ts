import type { StoreResult } from "@/lib/mart-minas-analytics";

export function parseCommissionPercent(input: string): number | null {
  const text = input.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export type CommissionRow = {
  id: string; name: string; code: string; store: string; city: string; document: string;
  seller: string; orders: number; base: number; percent: number; commission: number;
  sellerPercent: number | null; sellerCommission: number | null;
};

export function calculateSellerCommission(base: number, representation: number, percent?: number, mode?: "orders" | "representation"): number | null {
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100 || !mode) return null;
  const cents = Math.round((mode === "orders" ? base : representation) * 100);
  return Math.round(cents * percent / 100) / 100;
}

export function buildNetworkCommission(stores: StoreResult[], percent: number, sellerPercent?: number, sellerBase?: "orders" | "representation"): CommissionRow[] {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("Cadastre uma comissão de 0 a 100% para a rede.");
  return stores.map(({ customer, seller, current }) => {
    if (!Number.isFinite(current.revenue)) throw new Error(`Valor de pedidos inválido na loja ${customer.name}.`);
    const baseCents = Math.round(current.revenue * 100);
    const commission = Math.round(baseCents * percent / 100) / 100;
    const sellerCommission = calculateSellerCommission(baseCents / 100, commission, sellerPercent, sellerBase);
    return { id: customer.id, name: customer.name, code: customer.code, store: customer.store, city: customer.city, document: customer.document ?? "", seller: seller || "Representação WRRJ", orders: current.orders, base: baseCents / 100, percent, commission, sellerPercent: sellerCommission === null ? null : sellerPercent!, sellerCommission };
  });
}

export function filterCommissionRows(rows: CommissionRow[], search: string, city: string, activity: string) {
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const query = normalize(search.trim());
  return rows.filter((row) => (!city || row.city === city)
    && (activity === "all" || (activity === "with" ? row.orders > 0 : row.orders === 0))
    && normalize(`${row.name} ${row.code} ${row.store} ${row.city} ${row.document} ${row.document.replace(/\D/g, "")} ${row.seller}`).includes(query));
}

export function sumCommissionRows(rows: CommissionRow[]) {
  return { stores: rows.length, orders: rows.reduce((sum, row) => sum + row.orders, 0), base: rows.reduce((sum, row) => sum + Math.round(row.base * 100), 0) / 100, commission: rows.reduce((sum, row) => sum + Math.round(row.commission * 100), 0) / 100, sellerCommission: rows.reduce((sum, row) => sum + Math.round((row.sellerCommission ?? 0) * 100), 0) / 100 };
}
