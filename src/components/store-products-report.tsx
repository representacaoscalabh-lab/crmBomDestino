"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, X } from "lucide-react";
import type { Customer, CustomerGroup, Order, Product } from "@/lib/types";
import { buildStoreProducts, summarizeStoreProducts, PRODUCT_STATES } from "@/lib/store-products";
import { useTableSort } from "@/components/sort-heading";

const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export function StoreProductsReport({ customers, group, products, orders, end, scope, sidebar }: { customers: Customer[]; group: CustomerGroup; products: Product[]; orders: Order[]; end: string; scope: string; sidebar: ReactNode }) {
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [state, setState] = useState("");
  const [activity, setActivity] = useState("history");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const viewport = useRef<HTMLDivElement>(null), scrollbar = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const data = useMemo(() => buildStoreProducts(customers, group, products, orders, end, scope), [customers, group, products, orders, end, scope]);
  const stores = [...new Map(data.rows.map(row => [row.customerId, { id: row.customerId, name: `${row.customer} · ${row.store || row.code}` }])).values()];
  const catalog = [...new Map(data.rows.map(row => [row.productId, { id: row.productId, name: row.product }])).values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const activeCustomer = stores.some(store => store.id === customerId) ? customerId : "";
  const activeProduct = catalog.some(product => product.id === productId) ? productId : "";
  const rows = data.rows.filter(row => (!activeCustomer || row.customerId === activeCustomer) && (!activeProduct || row.productId === activeProduct) && (!state || row.state === state) && (activity === "all" || (activity === "current" ? row.quantity > 0 : row.quantity > 0 || row.history.some(value => value > 0))) && normalize(`${row.customer} ${row.code} ${row.store} ${row.product} ${row.productCode} ${row.city}`).includes(normalize(search.trim())));
  const storeSummaries = summarizeStoreProducts(rows);
  const { sorted, heading } = useTableSort(storeSummaries);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const selectedStore = storeSummaries.find(store => store.id === selectedStoreId);
  const dialog = useRef<HTMLDialogElement>(null);
  const activeStoreId = selectedStore?.id;
  useEffect(() => {
    if (!activeStoreId) { dialog.current?.close(); return; }
    if (!dialog.current?.open) dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [activeStoreId]);
  useEffect(() => {
    const container = viewport.current, table = container?.querySelector("table");
    if (!container || !table) return;
    const measure = () => setWidth(container.scrollWidth);
    const observer = new ResizeObserver(measure); observer.observe(container); observer.observe(table); measure();
    return () => observer.disconnect();
  }, []);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0), totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  async function exportReport(storeId?: string) {
    if (exporting) return;
    setExporting(true); setError("");
    try {
      const { createProductsWorkbook, downloadReportXls } = await import("@/lib/store-report-export");
      const filters = `Loja: ${storeId ? selectedStore?.customer + " - " + selectedStore?.store : stores.find(store => store.id === activeCustomer)?.name || "Todas"}; Produto: ${catalog.find(product => product.id === activeProduct)?.name || "Todos"}; Situação: ${state || "Todas"}; Movimento: ${activity}; Busca: ${search || "Todas"}`;
      downloadReportXls(createProductsWorkbook(data, sorted.filter(store => !storeId || store.id === storeId).flatMap(store => store.items), scope === "ours" ? "WRRJ" : scope === "external" ? "Sul de Minas" : "Mesclado", filters), `produtos-por-loja-${data.month}${storeId ? `-loja-${selectedStore?.store || selectedStore?.code || "selecionada"}` : ""}.xls`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível exportar o XLS."); }
    finally { setExporting(false); }
  }
  return <div className="mart-commission-workspace">
    <aside className="mart-workspace-sidebar"><div className="panel mart-workspace-filter-panel"><h2>Filtros</h2>{sidebar}<div className="commission-filters">
      <label>Buscar<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Loja, produto, código..." /></label>
      <details className="mart-filter-more"><summary>Mais filtros{[activeCustomer, activeProduct, state, activity !== "history" ? activity : ""].filter(Boolean).length > 0 && <span>{[activeCustomer, activeProduct, state, activity !== "history" ? activity : ""].filter(Boolean).length}</span>}</summary><div>      <label>Loja<select value={activeCustomer} onChange={event => setCustomerId(event.target.value)}><option value="">Todas as lojas</option>{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label>Produto<select value={activeProduct} onChange={event => setProductId(event.target.value)}><option value="">Todos os produtos</option>{catalog.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
      <label>Situação<select value={state} onChange={event => setState(event.target.value)}><option value="">Todas as situações</option>{[...PRODUCT_STATES, "Sem base comparável"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Exibir<select value={activity} onChange={event => setActivity(event.target.value)}><option value="history">Com movimento recente</option><option value="current">Compraram no mês</option><option value="all">Todos, inclusive sem compra</option></select></label>
</div></details>
      <button type="button" className="button button-outline" onClick={() => { setCustomerId(""); setProductId(""); setState(""); setActivity("history"); setSearch(""); }}>Limpar filtros</button>
    </div></div></aside>
    <section className="panel mart-report-section commission-report products-store-report" aria-label="Produtos por loja">
      <div className="mart-section-heading"><div><h2>Produtos por loja</h2><p>{data.start.split("-").reverse().join("/")} a {end.split("-").reverse().join("/")} · Quantidades em unidades</p></div><button type="button" className="button button-primary" disabled={exporting || !rows.length} onClick={() => void exportReport()}><Download size={16} />{exporting ? "Gerando..." : "Exportar XLS"}</button></div>

      <div className="commission-overview products-overview"><article className="commission-overview-card"><span className="commission-card-label">Quantidade comprada</span><strong>{number(totalQuantity)} un.</strong></article><article className="commission-overview-card"><span className="commission-card-label">Valor dos produtos</span><strong>{money(totalRevenue)}</strong></article><article className="commission-overview-card"><span className="commission-card-label">Sem recompra</span><strong>{rows.filter(row => row.state === "Sem recompra").length}</strong><small>produtos por loja</small></article><article className="commission-overview-card"><span className="commission-card-label">Retomadas</span><strong>{rows.filter(row => row.state === "Retomou a compra").length}</strong><small>produtos por loja</small></article></div>
      <div className="commission-table-intro"><div><h3>Lojas</h3><span>{storeSummaries.length} lojas · Selecione uma loja</span></div></div>
      <div className="commission-horizontal-scroll" ref={scrollbar} role="region" aria-label="Rolagem horizontal da tabela" tabIndex={0} onScroll={event => { if (viewport.current) viewport.current.scrollLeft = event.currentTarget.scrollLeft; }}><div style={{ width, height: 1 }} /></div>
      <div className="mart-report-table" ref={viewport} onScroll={event => { if (scrollbar.current) scrollbar.current.scrollLeft = event.currentTarget.scrollLeft; }}><table><thead><tr>{heading("customer", "Cliente", row => row.customer)}{heading("store", "Loja", row => row.store)}{heading("city", "Cidade", row => row.city)}{heading("responsible", "Responsável", row => row.responsible)}{heading("products", "Produtos comprados", row => row.products)}{heading("quantity", "Quantidade (un.)", row => row.quantity)}{heading("lost", "Sem recompra", row => row.lost)}{heading("resumed", "Retomadas", row => row.resumed)}{heading("revenue", "Valor atual", row => row.revenue)}<th>Produtos</th></tr></thead><tbody>{sorted.map(store => <tr key={store.id} className="products-store-clickable" onClick={() => setSelectedStoreId(store.id)}><td>{store.customer}<small>{store.code} · {store.document || "CNPJ não informado"}</small></td><td>{store.store || "—"}</td><td>{store.city || "—"}</td><td>{store.responsible}</td><td>{store.products}</td><td><strong>{number(store.quantity)}</strong></td><td>{store.lost}</td><td>{store.resumed}</td><td>{money(store.revenue)}</td><td><button type="button" className="button button-outline" aria-label={`Ver produtos de ${store.customer}, loja ${store.store || store.code}`} onClick={event => { event.stopPropagation(); setSelectedStoreId(store.id); }}>Ver produtos</button></td></tr>)}{!sorted.length && <tr><td colSpan={10}>Nenhuma loja encontrada. Ajuste os filtros.</td></tr>}</tbody><tfoot><tr><td colSpan={5}>Total após filtros</td><td>{number(totalQuantity)}</td><td>{rows.filter(row => row.state === "Sem recompra").length}</td><td>{rows.filter(row => row.state === "Retomou a compra").length}</td><td>{money(totalRevenue)}</td><td /></tr></tfoot></table></div>

      <details className="products-method"><summary>Como interpretar as situações e quantidades</summary><p>Uma linha por loja no resumo; abra a loja para consultar os produtos. Os filtros também se aplicam ao modal e ao XLS. Unidades individuais consolidadas entre caixa e meia caixa; o peso é mostrado separadamente. Os meses históricos no XLS são completos; a comparação percentual usa os mesmos dias do mês anterior. “Sem recompra” é ausência de pedido até a data final. Retomada exige compra em mês anterior ao último mês e nenhuma compra no último mês. Os dados mostram pedidos registrados, não consumo, estoque ou vendas no varejo. Início do histórico: outubro de 2026.</p></details>
      {error && <p role="alert" className="form-error">{error}</p>}
    </section>
    <dialog ref={dialog} className="store-products-dialog" aria-labelledby="store-products-dialog-title" onClose={() => setSelectedStoreId(null)} onCancel={() => setSelectedStoreId(null)} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setSelectedStoreId(null); } }}>
      {selectedStore && <StoreProductDetails key={selectedStore.id} store={selectedStore} hasComparison={data.hasComparison} month={data.month} exporting={exporting} error={error} onClose={() => { dialog.current?.close(); setSelectedStoreId(null); }} onExport={() => void exportReport(selectedStore.id)} />}
    </dialog>
  </div>;
}


export function StoreProductDetails({ store, hasComparison, month, exporting, error, onClose, onExport }: { store: ReturnType<typeof summarizeStoreProducts>[number]; hasComparison: boolean; month: string; exporting: boolean; error: string; onClose: () => void; onExport: () => void }) {
  const productViewport = useRef<HTMLDivElement>(null), productScrollbar = useRef<HTMLDivElement>(null);
  const [productWidth, setProductWidth] = useState(0);
  useEffect(() => {
    const viewport = productViewport.current, table = viewport?.querySelector("table");
    if (!viewport || !table) return;
    const measure = () => setProductWidth(viewport.scrollWidth);
    const observer = new ResizeObserver(measure); observer.observe(viewport); observer.observe(table); measure();
    return () => observer.disconnect();
  }, []);
  const { sorted, heading } = useTableSort(store.items);
  return <div className="store-products-dialog-content">
    <header className="store-products-dialog-heading"><div><p className="eyebrow">PRODUTOS DA LOJA · {month.split("-").reverse().join("/")}</p><h2 id="store-products-dialog-title">{store.customer} · Loja {store.store || store.code}</h2><p>{store.city || ""} · {store.responsible} · {store.document || "CNPJ não informado"}</p></div><button type="button" className="icon-button" aria-label="Fechar produtos da loja" onClick={onClose} autoFocus><X size={20} /></button></header>
    <div className="store-products-dialog-summary"><span><strong>{store.products}</strong> produtos com compra</span><span><strong>{number(store.quantity)} un.</strong> no período</span><span><strong>{money(store.revenue)}</strong> em pedidos</span><button type="button" className="button button-primary" disabled={exporting} onClick={onExport}><Download size={16} />{exporting ? "Gerando..." : "XLS desta loja"}</button></div>
    <p className="store-products-dialog-note">{sorted.length} produtos conforme os filtros da página. Comparação por unidades com o mesmo intervalo do mês anterior.</p>
    <div className="commission-horizontal-scroll" ref={productScrollbar} role="region" aria-label="Rolagem horizontal dos produtos da loja" tabIndex={0} onScroll={event => { if (productViewport.current) productViewport.current.scrollLeft = event.currentTarget.scrollLeft; }}><div style={{ width: productWidth, height: 1 }} /></div>
    <div className="store-products-dialog-table" ref={productViewport} onScroll={event => { if (productScrollbar.current) productScrollbar.current.scrollLeft = event.currentTarget.scrollLeft; }}><table><thead><tr>{heading("product", "Produto", row => row.product)}{heading("previous", "Anterior (un.)", row => row.previous)}{heading("quantity", "Atual (un.)", row => row.quantity)}{heading("delta", "Diferença (un.)", row => row.delta)}{heading("growth", "Variação", row => row.growth ?? -Infinity)}{heading("state", "Situação", row => row.state)}{heading("weight", "Peso (kg)", row => row.weight)}{heading("revenue", "Valor atual", row => row.revenue)}{heading("lastPurchase", "Última compra", row => row.lastPurchase)}</tr></thead><tbody>{sorted.map(row => <tr key={row.id}><td>{row.product}<small>{row.productCode}</small></td><td>{hasComparison ? number(row.previous) : "—"}</td><td><strong>{number(row.quantity)}</strong></td><td>{hasComparison ? number(row.delta) : "—"}</td><td>{row.growth === null ? "—" : <span className={`growth-badge growth-${row.delta > 0 ? "up" : row.delta < 0 ? "down" : "flat"}`}>{row.delta > 0 ? "+" : ""}{number(row.growth)}%</span>}</td><td><span className={`growth-badge growth-${["Cresceu", "Retomou a compra"].includes(row.state) ? "up" : ["Queda", "Sem recompra"].includes(row.state) ? "down" : row.state === "Sem alteração" ? "flat" : "none"}`}>{row.state}</span></td><td>{number(row.weight)}</td><td>{money(row.revenue)}</td><td>{row.lastPurchase ? row.lastPurchase.split("-").reverse().join("/") : "—"}</td></tr>)}</tbody><tfoot><tr><td colSpan={2}>Total desta loja</td><td>{number(store.quantity)}</td><td colSpan={3} /><td>{number(store.weight)}</td><td>{money(store.revenue)}</td><td /></tr></tfoot></table></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="store-products-dialog-footer"><span>Quantidades, comparação e situações seguem o período e os filtros selecionados.</span><button type="button" className="button button-outline" onClick={onClose}>Fechar</button></footer>
  </div>;
}
