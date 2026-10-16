import type { Bonification, Customer, CustomerGroup, Order, OrderItem, Product } from "./types";

export const REPORT_START = "2026-10-01";
export const COMMERCIAL_REPORTS = [
  { id: "customers", title: "Clientes", description: "Volume, valor, mix e frequência de compra." },
  { id: "inactive", title: "Clientes sem compra", description: "Clientes para retomar contato." },
  { id: "products", title: "Produtos", description: "Mais comprados, participação e cobertura." },
  { id: "segments", title: "Segmentos", description: "Resultado por segmento comercial." },
  { id: "cities", title: "Cidades", description: "Distribuição das compras por cidade." },
  { id: "networks", title: "Redes", description: "Resultado consolidado das redes." },
  { id: "bonuses", title: "Bonificações", description: "Peso e valor de referência por cliente." },
] as const;
export type CommercialReportId = typeof COMMERCIAL_REPORTS[number]["id"];
export type ReportFilters = { start: string; end: string; scope: string; network: string; city: string; segment: string; customerStatus: string; customer: string; product: string; orderStatus: string };
export type CommercialRow = { id: string; [key: string]: string | number | null };
export type ReportColumn = { key: string; title: string; format?: "money" | "weight" | "percent" | "date" | "number" };
type Data = { customers: Customer[]; customerGroups: CustomerGroup[]; products: Product[]; orders: Order[]; bonifications: Bonification[] };
const days = (start: string, end: string) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
const shiftDays = (value: string, offset: number) => new Date(Date.parse(`${value}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const sum = (orders: Order[]) => ({ weight: orders.reduce((total, order) => total + order.totalWeight, 0), value: orders.reduce((total, order) => total + order.totalValue, 0) });
const change = (current: number, previous: number, available: boolean) => available && previous > 0 ? (current - previous) / previous * 100 : null;
const itemValue = (item: OrderItem) => item.subtotal ?? item.packagePrice * item.packageQuantity * (1 - (item.discountPercent ?? 0) / 100);
export function validReportPeriod(start: string, end: string, today: string) {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  return validDate(start) && validDate(end) && start >= REPORT_START && start <= end && end <= today;
}

export function buildCommercialReport(data: Data, filters: ReportFilters, reportId: CommercialReportId) {
  const groups = new Map(data.customerGroups.map((group) => [group.id, group]));
  const seller = (customer: Customer) => groups.get(customer.groupId ?? "")?.externalStoreSellers?.[customer.id]?.trim() || "";
  const customers = data.customers.filter((customer) => {
    const owner = seller(customer);
    return (filters.scope === "all" || (filters.scope === "ours" ? !owner : filters.scope === "external" ? !!owner : owner === filters.scope.slice(7)))
      && (!filters.network || (filters.network === "none" ? !customer.groupId : customer.groupId === filters.network))
      && (!filters.city || customer.city === filters.city) && (!filters.segment || customer.segment === filters.segment)
      && (!filters.customerStatus || customer.status === filters.customerStatus) && (!filters.customer || customer.id === filters.customer);
  });
  const ids = new Set(customers.map((customer) => customer.id));
  const products = new Map(data.products.map((product) => [product.id, product]));
  const codes = new Map(data.products.flatMap((product) => [[product.codeBox, product.id], [product.codeHalfBox, product.id]] as [string, string][]).filter(([code]) => !!code));
  const productKey = (item: OrderItem) => products.has(item.productId) ? item.productId : codes.get(item.productCode) || item.productId || item.productCode;
  function selectItems<T extends Order | Bonification>(entry: T): T | null {
    if (!filters.product) return entry;
    const items = entry.items.filter((item) => productKey(item) === filters.product);
    return items.length ? { ...entry, items, totalWeight: items.reduce((total, item) => total + item.totalWeight, 0), totalValue: items.reduce((total, item) => total + itemValue(item), 0) } : null;
  }
  const history = data.orders.filter((order) => ids.has(order.customerId) && order.issueDate >= REPORT_START && order.issueDate <= filters.end && (filters.orderStatus === "all" || order.status === filters.orderStatus)).map(selectItems).filter((order): order is Order => order !== null);
  const orders = history.filter((order) => order.issueDate >= filters.start);
  const previousEnd = shiftDays(filters.start, -1), previousStart = shiftDays(filters.start, -(days(filters.start, filters.end) + 1));
  const hasComparison = previousStart >= REPORT_START;
  const previousOrders = hasComparison ? history.filter((order) => order.issueDate >= previousStart && order.issueDate <= previousEnd) : [];
  const bonuses = data.bonifications.filter((bonus) => ids.has(bonus.customerId) && bonus.issueDate >= filters.start && bonus.issueDate <= filters.end).map(selectItems).filter((bonus): bonus is Bonification => bonus !== null);
  const currentMap = new Map<string, Order[]>(), previousMap = new Map<string, Order[]>(), historyMap = new Map<string, Order[]>();
  for (const [entries, map] of [[orders, currentMap], [previousOrders, previousMap], [history, historyMap]] as const) for (const order of entries) { const rows = map.get(order.customerId) ?? []; rows.push(order); map.set(order.customerId, rows); }
  const customerRows: CommercialRow[] = customers.map((customer) => {
    const current = currentMap.get(customer.id) ?? [], previous = previousMap.get(customer.id) ?? [];
    const dates = [...new Set((historyMap.get(customer.id) ?? []).map((order) => order.issueDate))].sort();
    const recent = dates.slice(-8), intervals = recent.slice(1).map((date, index) => days(recent[index], date));
    const last = dates.at(-1) ?? "", totals = sum(current), baseline = sum(previous);
    return { id: customer.id, code: customer.code, customer: customer.name || customer.fantasyName || `Cliente ${customer.code}`, store: customer.store, city: customer.city,
      segment: customer.segment || "Sem segmento", network: groups.get(customer.groupId ?? "")?.name || "Sem rede", seller: seller(customer) || "Representação WRRJ",
      orders: current.length, weight: totals.weight, value: totals.value, previous: hasComparison ? baseline.weight : null, delta: hasComparison ? totals.weight - baseline.weight : null,
      change: change(totals.weight, baseline.weight, hasComparison), ticket: current.length ? totals.value / current.length : null,
      mix: new Set(current.flatMap((order) => order.items.map(productKey))).size, last: last || null, days: last ? days(last, filters.end) : null,
      frequency: intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null, status: customer.status, phone: customer.phone || "—" };
  });
  let columns: ReportColumn[] = [], rows: CommercialRow[] = [];
  const identity: ReportColumn[] = [{ key: "code", title: "Código" }, { key: "customer", title: "Cliente" }, { key: "store", title: "Loja" }, { key: "city", title: "Cidade" }, { key: "seller", title: "Responsável" }];
  const performance: ReportColumn[] = [{ key: "orders", title: "Pedidos", format: "number" }, { key: "weight", title: "Peso (kg)", format: "weight" }, { key: "value", title: "Valor dos pedidos", format: "money" }];
  const comparisons: ReportColumn[] = hasComparison ? [{ key: "previous", title: "Kg anteriores", format: "weight" }, { key: "delta", title: "Diferença kg", format: "weight" }, { key: "change", title: "Variação %", format: "percent" }] : [];
  if (reportId === "customers") {
    columns = [...identity, ...performance, ...comparisons, { key: "ticket", title: "Ticket médio", format: "money" }, { key: "mix", title: "Produtos distintos", format: "number" }, { key: "last", title: "Última compra", format: "date" }, { key: "frequency", title: "Intervalo médio (dias)", format: "number" }];
    rows = customerRows.sort((a, b) => Number(b.weight) - Number(a.weight));
  } else if (reportId === "inactive") {
    columns = [...identity, { key: "segment", title: "Segmento" }, { key: "last", title: "Última compra", format: "date" }, { key: "days", title: "Dias sem comprar", format: "number" }, { key: "phone", title: "Telefone" }, { key: "status", title: "Status" }];
    rows = customerRows.filter((row) => row.orders === 0).sort((a, b) => Number(b.days ?? -1) - Number(a.days ?? -1));
  } else if (reportId === "products") {
    const grouped = new Map<string, { name: string; code: string; weight: number; value: number; units: number; buyers: Set<string>; previous: number }>();
    for (const product of data.products.filter((product) => !filters.product || product.id === filters.product)) grouped.set(product.id, { name: product.description, code: product.codeBox, weight: 0, value: 0, units: 0, buyers: new Set(), previous: 0 });
    for (const [entries, current] of [[orders, true], [previousOrders, false]] as const) for (const order of entries) for (const item of order.items) {
      const key = productKey(item), row = grouped.get(key) ?? { name: item.description, code: item.productCode, weight: 0, value: 0, units: 0, buyers: new Set<string>(), previous: 0 };
      if (current) { row.weight += item.totalWeight; row.value += itemValue(item); row.units += item.unitQuantity; row.buyers.add(order.customerId); } else row.previous += item.totalWeight;
      grouped.set(key, row);
    }
    const totalWeight = [...grouped.values()].reduce((total, row) => total + row.weight, 0);
    columns = [{ key: "code", title: "Código" }, { key: "product", title: "Produto" }, { key: "weight", title: "Peso (kg)", format: "weight" }, { key: "value", title: "Valor dos itens", format: "money" }, { key: "units", title: "Unidades", format: "number" }, { key: "buyers", title: "Clientes compradores", format: "number" }, { key: "coverage", title: "Cobertura %", format: "percent" }, { key: "share", title: "Participação kg %", format: "percent" }, ...comparisons];
    rows = [...grouped].map(([id, row]) => ({ id, code: row.code, product: row.name, weight: row.weight, value: row.value, units: row.units, buyers: row.buyers.size, coverage: customers.length ? row.buyers.size / customers.length * 100 : 0, share: totalWeight > 0 ? row.weight / totalWeight * 100 : 0, previous: hasComparison ? row.previous : null, delta: hasComparison ? row.weight - row.previous : null, change: change(row.weight, row.previous, hasComparison) })).sort((a, b) => b.weight - a.weight);
  } else if (reportId === "bonuses") {
    columns = [...identity, { key: "count", title: "Bonificações", format: "number" }, { key: "weight", title: "Peso bonificado (kg)", format: "weight" }, { key: "value", title: "Valor de referência", format: "money" }, { key: "ratio", title: "Kg bônus / kg comprado %", format: "percent" }];
    const grouped = new Map<string, Bonification[]>();
    for (const bonus of bonuses) { const entries = grouped.get(bonus.customerId) ?? []; entries.push(bonus); grouped.set(bonus.customerId, entries); }
    rows = customerRows.filter((row) => grouped.has(row.id)).map((row) => {
      const entries = grouped.get(row.id)!, weight = entries.reduce((total, entry) => total + entry.totalWeight, 0);
      return { ...row, count: entries.length, weight, value: entries.reduce((total, entry) => total + entry.totalValue, 0), ratio: filters.orderStatus === "normal" && Number(row.weight) > 0 ? weight / Number(row.weight) * 100 : null };
    }).sort((a, b) => Number(b.weight) - Number(a.weight));
  } else {
    const key = reportId === "segments" ? "segment" : reportId === "cities" ? "city" : "network";
    const title = reportId === "segments" ? "Segmento" : reportId === "cities" ? "Cidade" : "Rede";
    const grouped = new Map<string, CommercialRow[]>();
    for (const row of customerRows) { const label = String(row[key] || `Sem ${title.toLowerCase()}`), entries = grouped.get(label) ?? []; entries.push(row); grouped.set(label, entries); }
    columns = [{ key: "group", title }, { key: "customers", title: "Clientes na base", format: "number" }, { key: "buyers", title: "Com compra", format: "number" }, { key: "inactive", title: "Sem compra", format: "number" }, { key: "coverage", title: "Positivação %", format: "percent" }, ...performance, ...comparisons];
    rows = [...grouped].map(([label, entries]) => {
      const buyers = entries.filter((row) => Number(row.orders) > 0).length, total = (key: string) => entries.reduce((value, row) => value + Number(row[key] ?? 0), 0);
      return { id: label, group: label, customers: entries.length, buyers, inactive: entries.length - buyers, coverage: buyers / entries.length * 100, orders: total("orders"), weight: total("weight"), value: total("value"), previous: hasComparison ? total("previous") : null, delta: hasComparison ? total("delta") : null, change: change(total("weight"), total("previous"), hasComparison) };
    }).sort((a, b) => b.weight - a.weight);
  }
  const knownIds = new Set(data.customers.map((customer) => customer.id));
  return { columns, rows, hasComparison, previousStart, previousEnd, summary: { ...sum(orders), orders: orders.length, customers: customers.length, buyers: currentMap.size, bonusWeight: bonuses.reduce((total, entry) => total + entry.totalWeight, 0) }, unmatchedOrders: data.orders.filter((order) => order.issueDate >= filters.start && order.issueDate <= filters.end && !knownIds.has(order.customerId) && (filters.orderStatus === "all" || order.status === filters.orderStatus)).length };
}
