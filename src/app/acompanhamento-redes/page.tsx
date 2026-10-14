"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Download, Network, Package, Store, TrendingUp } from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { downloadXlsx } from "@/lib/xlsx";
import type { Customer, Order } from "@/lib/types";

const monthValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthRange = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return { start: `${month}-01`, end: `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, "0")}` };
};
const monthName = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, number - 1, 1));
};
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const qty = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const change = (current: number, previous: number) => previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / previous) * 100;
const matchesCustomer = (customer: Customer, order: Order) => order.customerId === customer.id || (!order.customerId && order.customerCode.toLowerCase() === customer.code.toLowerCase() && order.store === customer.store);

export default function NetworkTrackingPage() {
  const { customers, customerGroups, orders } = useCrmStore();
  const now = new Date();
  const [networkId, setNetworkId] = useState("");
  const [currentMonth, setCurrentMonth] = useState(monthValue(now));
  const [previousMonth, setPreviousMonth] = useState(monthValue(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
  const selectedNetwork = customerGroups.find((network) => network.id === networkId);
  const members = useMemo(() => customers.filter((customer) => customer.groupId === networkId), [customers, networkId]);
  const currentRange = monthRange(currentMonth);
  const previousRange = monthRange(previousMonth);
  const rows = useMemo(() => members.map((customer) => {
    const customerOrders = orders.filter((order) => order.status === "normal" && matchesCustomer(customer, order));
    const currentOrders = customerOrders.filter((order) => order.issueDate >= currentRange.start && order.issueDate <= currentRange.end);
    const previousOrders = customerOrders.filter((order) => order.issueDate >= previousRange.start && order.issueDate <= previousRange.end);
    const sum = (items: Order[], field: "totalValue" | "totalWeight") => items.reduce((total, order) => total + (order[field] || 0), 0);
    return { customer, currentOrders, previousOrders, currentValue: sum(currentOrders, "totalValue"), previousValue: sum(previousOrders, "totalValue"), currentWeight: sum(currentOrders, "totalWeight") };
  }), [members, orders, currentRange.start, currentRange.end, previousRange.start, previousRange.end]);
  const totals = rows.reduce((total, row) => ({ currentValue: total.currentValue + row.currentValue, previousValue: total.previousValue + row.previousValue, currentWeight: total.currentWeight + row.currentWeight, orders: total.orders + row.currentOrders.length, active: total.active + (row.currentOrders.length ? 1 : 0) }), { currentValue: 0, previousValue: 0, currentWeight: 0, orders: 0, active: 0 });
  const topProducts = useMemo(() => {
    const matchingOrders = orders.filter((order) => order.status === "normal" && order.issueDate >= currentRange.start && order.issueDate <= currentRange.end && members.some((customer) => matchesCustomer(customer, order)));
    const products = new Map<string, { name: string; quantity: number; value: number }>();
    matchingOrders.forEach((order) => order.items.forEach((item) => {
      const key = item.productId || item.productCode;
      const entry = products.get(key) ?? { name: item.description || item.productCode, quantity: 0, value: 0 };
      entry.quantity += item.unitQuantity || item.packageQuantity || 0;
      entry.value += item.subtotal ?? item.packagePrice * item.packageQuantity;
      products.set(key, entry);
    }));
    return [...products.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8);
  }, [members, orders, currentRange.start, currentRange.end]);
  const variation = change(totals.currentValue, totals.previousValue);

  async function exportReport() {
    const columns = ["Loja", "Código", "Cidade", `Vendas ${monthName(currentMonth)}`, `Vendas ${monthName(previousMonth)}`, "Variação (%)", `Peso ${monthName(currentMonth)} (kg)`, `Pedidos ${monthName(currentMonth)}`];
    const values: (string | number)[][] = rows.map(({ customer, currentValue, previousValue, currentWeight, currentOrders }) => [customer.store || customer.name, customer.code, customer.city, currentValue, previousValue, change(currentValue, previousValue), currentWeight, currentOrders.length]);
    values.push([`TOTAL DA REDE · ${selectedNetwork?.name ?? ""}`, "", `${members.length} lojas`, totals.currentValue, totals.previousValue, variation, totals.currentWeight, totals.orders]);
    await downloadXlsx(`acompanhamento-rede-${(selectedNetwork?.name ?? "rede").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx`, "Acompanhamento", columns, values);
  }

  return <div className="page-content module-content network-tracking-page">
    <section className="panel network-tracking-hero"><div><p className="eyebrow">ANÁLISE COMERCIAL · VISÃO POR REDE</p><h1><Network size={22} /> Acompanhamento de Redes</h1><p>Acompanhe as vendas, os produtos e a evolução de cada loja da rede.</p></div>{selectedNetwork && <button className="button button-outline" onClick={() => void exportReport()}><Download size={15} /> Exportar relatório</button>}</section>
    <section className="panel network-tracking-filters"><label><span>Selecione a rede</span><select value={networkId} onChange={(event) => setNetworkId(event.target.value)}><option value="">Escolha uma rede</option>{customerGroups.map((network) => <option key={network.id} value={network.id}>{network.name}</option>)}</select></label><label><span>Período atual</span><input type="month" value={currentMonth} onChange={(event) => setCurrentMonth(event.target.value)} /></label><label><span>Comparar com</span><input type="month" value={previousMonth} onChange={(event) => setPreviousMonth(event.target.value)} /></label></section>
    {!selectedNetwork ? <section className="panel network-tracking-empty"><Network size={28} /><strong>Escolha uma rede para começar</strong><p>O relatório reúne o desempenho geral da rede e detalha as compras de cada loja.</p></section> : <>
      <div className="network-tracking-summary"><div className="panel network-tracking-stat"><span>Vendas · {monthName(currentMonth)}</span><strong>{money(totals.currentValue)}</strong><small className={variation >= 0 ? "growth-positive" : "growth-negative"}>{variation >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{variation >= 0 ? "+" : ""}{variation.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. {monthName(previousMonth)}</small></div><div className="panel network-tracking-stat"><span>Lojas com vendas</span><strong>{totals.active} <small>de {members.length}</small></strong><small><Store size={14} /> {members.length - totals.active} sem pedido no período</small></div><div className="panel network-tracking-stat"><span>Pedidos · {monthName(currentMonth)}</span><strong>{totals.orders}</strong><small><TrendingUp size={14} /> {qty(totals.currentWeight)} kg vendidos</small></div></div>
      <section className="panel network-tracking-section"><div className="network-tracking-section-heading"><div><h2><Store size={18} /> Desempenho por loja</h2><p>Vendas no período atual e comparação com o período anterior.</p></div><span>{rows.length} loja(s)</span></div><div className="table-wrap"><table><thead><tr><th>Loja</th><th>Cidade</th><th>Pedidos</th><th>Vendas atuais</th><th>Vendas anteriores</th><th>Variação</th><th>Peso atual</th></tr></thead><tbody>{[...rows].sort((a, b) => b.currentValue - a.currentValue).map(({ customer, currentOrders, currentValue, previousValue, currentWeight }) => { const delta = change(currentValue, previousValue); return <tr key={customer.id}><td className="network-store-cell"><strong>{customer.store || customer.name}</strong><small>{customer.name}</small></td><td>{customer.city || "—"}</td><td>{currentOrders.length}</td><td>{money(currentValue)}</td><td>{money(previousValue)}</td><td className={delta >= 0 ? "growth-positive" : "growth-negative"}>{delta >= 0 ? "+" : ""}{delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td><td>{qty(currentWeight)} kg</td></tr>; })}</tbody></table>{!rows.length && <div className="report-empty">Esta rede ainda não possui lojas cadastradas.</div>}</div></section>
      <section className="panel network-tracking-section"><div className="network-tracking-section-heading"><div><h2><Package size={18} /> Mais comprados na rede</h2><p>Produtos ordenados pela quantidade de unidades nos pedidos de {monthName(currentMonth)}.</p></div><span>{topProducts.length} produto(s)</span></div>{topProducts.length ? <div className="network-product-list">{topProducts.map((product, index) => <div className="network-product-row" key={product.name}><span className="network-product-rank">{index + 1}</span><strong>{product.name}</strong><span>{qty(product.quantity)} un.</span><b>{money(product.value)}</b></div>)}</div> : <div className="report-empty">Nenhum item vendido para esta rede no período selecionado.</div>}</section>
    </>}
  </div>;
}
