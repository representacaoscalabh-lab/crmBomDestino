"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import type { Customer, CustomerGroup, Order, Product } from "@/lib/types";
import { buildNetworkProducts } from "@/lib/network-products";
import { useTableSort } from "@/components/sort-heading";

const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
export function NetworkProductsReport({ customers, group, products, orders, start, end, scope, sidebar }: { customers: Customer[]; group: CustomerGroup; products: Product[]; orders: Order[]; start: string; end: string; scope: string; sidebar: ReactNode }) {
  const [search, setSearch] = useState("");
  const [activity, setActivity] = useState("with");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const viewport = useRef<HTMLDivElement>(null), scrollbar = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const data = useMemo(() => buildNetworkProducts(customers, group, products, orders, start, end, scope), [customers, group, products, orders, start, end, scope]);
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const rows = data.filter(row => (activity === "all" || (activity === "with" ? row.orders > 0 : row.orders === 0)) && normalize(`${row.name} ${row.code}`).includes(normalize(search.trim())));
  const { sorted, heading } = useTableSort(rows);
  const total = rows.reduce((sum, row) => ({ units: sum.units + row.units, boxes: sum.boxes + row.boxes, halfBoxes: sum.halfBoxes + row.halfBoxes, weight: sum.weight + row.weight, value: sum.value + row.value }), { units: 0, boxes: 0, halfBoxes: 0, weight: 0, value: 0 });
  useEffect(() => {
    const container = viewport.current, table = container?.querySelector("table"); if (!container || !table) return;
    const measure = () => setWidth(container.scrollWidth);
    const observer = new ResizeObserver(measure); observer.observe(container); observer.observe(table); measure(); return () => observer.disconnect();
  }, []);
  async function exportReport() {
    if (exporting) return;
    setExporting(true); setError("");
    try {
      const { createNetworkProductsWorkbook, downloadReportXls } = await import("@/lib/store-report-export");
      downloadReportXls(createNetworkProductsWorkbook(sorted, start, end, scope === "ours" ? "WRRJ" : scope === "external" ? "Sul de Minas" : "Mesclado", `Busca: ${search || "Todos"}; movimento: ${activity}`, group.name), `produtos-${group.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${start}-${end}.xls`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível exportar."); }
    finally { setExporting(false); }
  }
  return <div className="mart-commission-workspace"><aside className="mart-workspace-sidebar"><div className="panel mart-workspace-filter-panel"><h2>Filtros</h2>{sidebar}<div className="commission-filters"><label>Buscar produto<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou código" /></label><label>Movimentação<select value={activity} onChange={event => setActivity(event.target.value)}><option value="with">Com pedidos no período</option><option value="without">Sem pedidos no período</option><option value="all">Todos os produtos</option></select></label></div></div></aside>
    <section className="panel mart-report-section commission-report" aria-label={`Relatório de produtos ${group.name}`}>
      <div className="mart-section-heading"><div><h2>Relatório de produtos</h2><p>{start.split("-").reverse().join("/")} a {end.split("-").reverse().join("/")} · {group.name}</p></div><button type="button" className="button button-primary" disabled={exporting || !rows.length} onClick={() => void exportReport()}><Download size={16} />{exporting ? "Gerando..." : "Exportar XLS"}</button></div>
      <div className="commission-overview"><article className="commission-overview-card"><span className="commission-card-label">Produtos</span><strong>{rows.length}</strong></article><article className="commission-overview-card"><span className="commission-card-label">Unidades</span><strong>{number(total.units)}</strong><small>{number(total.boxes)} caixas · {number(total.halfBoxes)} meias caixas</small></article><article className="commission-overview-card"><span className="commission-card-label">Peso total</span><strong>{number(total.weight)} kg</strong></article><article className="commission-overview-card"><span className="commission-card-label">Valor total</span><strong>{money(total.value)}</strong></article></div>
      <div className="commission-table-intro"><div><h3>Produtos da rede</h3><span>{rows.length} produtos · Preço unitário bruto</span></div></div>
      <div className="commission-horizontal-scroll" ref={scrollbar} tabIndex={0} role="region" aria-label="Rolagem horizontal dos produtos" onScroll={event => { if (viewport.current) viewport.current.scrollLeft = event.currentTarget.scrollLeft; }}><div style={{ width, height: 1 }} /></div>
      <div className="mart-report-table" ref={viewport} onScroll={event => { if (scrollbar.current) scrollbar.current.scrollLeft = event.currentTarget.scrollLeft; }}><table><thead><tr>{heading("code", "Código", r => r.code)}{heading("name", "Produto", r => r.name)}{heading("lastUnitPrice", "Preço unit. último pedido", r => r.lastUnitPrice ?? -1)}{heading("value", "Valor total no período", r => r.value)}{heading("weight", "Peso (kg)", r => r.weight)}{heading("boxes", "Caixas", r => r.boxes)}{heading("halfBoxes", "Meias caixas", r => r.halfBoxes)}{heading("units", "Unidades", r => r.units)}{heading("stores", "Lojas com compra", r => r.stores)}{heading("orders", "Pedidos", r => r.orders)}{heading("lastDate", "Último pedido", r => r.lastDate)}{heading("lastValue", "Valor no último pedido", r => r.lastValue)}{heading("lastUnits", "Un. último pedido", r => r.lastUnits)}{heading("lastCustomer", "Última loja", r => r.lastCustomer)}</tr></thead><tbody>{sorted.map(row => <tr key={row.id}><td>{row.code}</td><td>{row.name}</td><td>{row.lastUnitPrice === null ? "—" : money(row.lastUnitPrice)}</td><td><strong>{money(row.value)}</strong></td><td>{number(row.weight)}</td><td>{number(row.boxes)}</td><td>{number(row.halfBoxes)}</td><td>{number(row.units)}</td><td>{row.stores}</td><td>{row.orders}</td><td>{row.lastDate ? row.lastDate.split("-").reverse().join("/") : "—"}<small>{row.lastOrder}</small></td><td>{row.lastDate ? money(row.lastValue) : "—"}</td><td>{row.lastDate ? number(row.lastUnits) : "—"}</td><td>{row.lastCustomer || "—"}<small>{row.lastStore ? `Loja ${row.lastStore}` : ""}</small></td></tr>)}{!sorted.length && <tr><td colSpan={14}>Nenhum produto encontrado.</td></tr>}</tbody><tfoot><tr><td colSpan={3}>Total após filtros</td><td>{money(total.value)}</td><td>{number(total.weight)}</td><td>{number(total.boxes)}</td><td>{number(total.halfBoxes)}</td><td>{number(total.units)}</td><td colSpan={6} /></tr></tfoot></table></div>
      <details className="products-method"><summary>Critérios dos preços e quantidades</summary><p>Caixa e meia caixa são consolidadas no mesmo produto e mostradas em colunas separadas. O preço unitário é bruto, antes dos descontos. Se houver várias linhas do produto no último pedido, usamos a média ponderada pelas unidades. O valor total dos itens considera os descontos. Em pedidos na mesma data, o maior número de pedido desempata. Amostras e bonificações não entram na base.</p></details>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section></div>;
}
