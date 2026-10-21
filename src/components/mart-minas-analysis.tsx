"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useTableSort } from "@/components/sort-heading";
import { variation, type MartMinasAnalytics, type ProductResult, type StoreResult } from "@/lib/mart-minas-analytics";

export const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
export const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dateLabel = (value: string) => value ? value.split("-").reverse().join("/") : "—";
export const monthLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${value}-01T00:00:00Z`));
export function Change({ current, previous, available = true }: { current: number; previous: number; available?: boolean }) {
  const value = available ? variation(current, previous) : null;
  return <span className={value === null || value === 0 ? "mart-neutral" : value > 0 ? "mart-positive" : "mart-negative"}>{value === null ? "Sem base" : `${value > 0 ? "+" : ""}${number(value)}%`}</span>;
}

function ProductTable({ rows, report, compact = false }: { rows: ProductResult[]; report: MartMinasAnalytics; compact?: boolean }) {
  const { sorted, heading } = useTableSort(rows);
  return rows.length ? <div className="mart-report-table"><table><thead><tr>
    {heading("name", "Produto", (row) => row.name)}
    {heading("current", "Kg atuais", (row) => row.current)}
    {heading("previous", "Kg anteriores", (row) => row.previous)}
    {heading("delta", "Diferença kg", (row) => row.delta)}
    <th>Variação</th>{heading("average", "Média recente kg", (row) => row.average)}<th>Vs. média</th>
    {heading("revenue", "Valor", (row) => row.revenue)}{heading("units", "Unidades", (row) => row.units)}
    {!compact && <>{heading("share", "Participação kg", (row) => row.share)}{heading("stores", "Lojas compradoras", (row) => row.stores)}<th>Lojas sem recompra</th></>}
  </tr></thead><tbody>{sorted.map((row) => <tr key={row.id}>
    <td className="mart-product-name"><strong>{row.name}</strong><small>Cód. {row.code || "—"}</small></td>
    <td>{number(row.current)}</td><td>{(report.hasPrevious ? number(row.previous) : "—")}</td><td className={row.delta < 0 ? "mart-negative" : "mart-neutral"}>{report.hasPrevious && row.delta > 0 ? "+" : ""}{(report.hasPrevious ? number(row.delta) : "—")}</td>
    <td><Change available={report.hasPrevious} current={row.current} previous={row.previous} /></td><td>{(report.averageCount ? number(row.average) : "—")}</td><td><Change available={report.hasPrevious} current={row.current} previous={row.average} /></td>
    <td>{money(row.revenue)}</td><td>{number(row.units)}</td>
    {!compact && <><td>{number(row.share)}%</td><td>{row.stores} <small>Anterior: {report.hasPrevious ? row.previousStores : "—"}</small></td><td>{row.lostStores.length ? <details><summary>{row.lostStores.length} loja(s)</summary>{row.lostStores.map((id) => { const store = report.members.find((customer) => customer.id === id); return <small key={id}>{store?.name} · Loja {store?.store || store?.code}</small>; })}</details> : "—"}</td></>}
  </tr>)}</tbody></table></div> : <p className="mart-section-note">Nenhum produto com compra registrada no histórico selecionado.</p>;
}

function StoreDetail({ store, report, close }: { store: StoreResult; report: MartMinasAnalytics; close: () => void }) {
  const bought = new Set(store.products.filter((row) => row.current > 0).map((row) => row.id));
  const opportunities = report.products.filter((row) => row.current > 0 && !bought.has(row.id));
  return <section className="panel mart-report-section mart-store-detail" aria-label="Detalhamento da loja">
    <div className="mart-section-heading"><div><h2>{store.customer.name} · Loja {store.customer.store || store.customer.code}</h2><p>{store.customer.city} · {store.seller || "Representação WRRJ"} · {store.state}</p></div><button type="button" className="button button-outline" onClick={close}>Fechar detalhe</button></div>
    <div className="mart-detail-stats"><span>Peso atual: <strong>{number(store.current.weight)} kg</strong></span><span>Valor atual: <strong>{money(store.current.revenue)}</strong></span><span>Última compra: <strong>{dateLabel(store.lastPurchase)}</strong></span><span>Sem comprar: <strong>{store.daysSince === null ? "Sem histórico" : `${store.daysSince} dias`}</strong></span><span>Intervalo habitual: <strong>{store.usualGap === null ? "Histórico insuficiente" : `${number(store.usualGap)} dias`}</strong></span><span>Mix: <strong>{store.current.mix} produtos · anterior: {report.hasPrevious ? store.previous.mix : "—"}</strong></span><span>Kg/pedido: <strong>{store.current.orders ? number(store.current.weight / store.current.orders) : "—"} · anterior: {store.previous.orders ? number(store.previous.weight / store.previous.orders) : "—"}</strong></span></div>
    <h3 className="mart-subheading">Produtos que explicam o resultado</h3><ProductTable rows={[...store.products].sort((a, b) => a.delta - b.delta)} report={report} compact />
    <h3 className="mart-subheading">Oportunidades de mix a avaliar</h3><p className="mart-section-note">Produtos comprados por outras lojas e ausentes nesta loja.</p>
    {opportunities.length ? <div className="mart-opportunities">{opportunities.slice(0, 10).map((row) => <div key={row.id}><strong>{row.name}</strong><span>{row.stores} loja(s) compraram · {number(row.current)} kg</span></div>)}</div> : <p className="mart-section-note">Nenhuma oportunidade identificada nessa comparação.</p>}
  </section>;
}

export function MartMinasAnalysis({ report }: { report: MartMinasAnalytics }) {
  const [search, setSearch] = useState("");
  const [storeState, setStoreState] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productMode, setProductMode] = useState("all");
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const visibleStores = report.stores.filter((row) => normalize(`${row.customer.name} ${row.customer.code} ${row.customer.store} ${row.customer.city} ${row.seller}`).includes(normalize(search)) && (storeState === "all" || (storeState === "overdue" ? row.overdue : row.state === storeState)));
  const { sorted, heading } = useTableSort(visibleStores);
  const selected = report.stores.find((store) => store.customer.id === selectedId);
  const products = report.products.filter((row) => normalize(`${row.name} ${row.code}`).includes(normalize(productSearch)) && (productMode === "all" || (productMode === "fall" ? row.delta < 0 : productMode === "lost" ? row.current === 0 && row.previous > 0 : row.delta > 0)));
  const periodLabel = (period: MartMinasAnalytics["currentPeriod"]) => report.custom ? `${dateLabel(period.start)} a ${dateLabel(period.end)}` : monthLabel(period.month);
  const maxWeight = Math.max(1, ...report.monthly.map((item) => item.weight));
  const drops = report.stores.filter((row) => row.delta < 0).slice(0, 5);
  const overdue = report.stores.filter((row) => row.overdue).sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0)).slice(0, 5);
  const totalLoss = report.stores.reduce((total, store) => total + Math.max(0, -store.delta), 0);
  return <>
    <div className="mart-report-cards mart-kpis">
      <section className="panel mart-report-card"><h2>Peso comprado</h2><strong>{number(report.current.weight)} kg</strong><span><Change available={report.hasPrevious} current={report.current.weight} previous={report.previous.weight} /> vs. anterior</span><small>Anterior: {(report.hasPrevious ? number(report.previous.weight) : "—")} kg · Média recente: {(report.averageCount ? number(report.average) : "—")} kg</small><span><Change available={report.hasPrevious} current={report.current.weight} previous={report.average} /> vs. média</span></section>
      <section className="panel mart-report-card"><h2>Valor dos pedidos</h2><strong>{money(report.current.revenue)}</strong><span><Change available={report.hasPrevious} current={report.current.revenue} previous={report.previous.revenue} /> vs. anterior</span><small>{report.current.orders} pedidos · Ticket médio: {report.current.orders ? money(report.current.revenue / report.current.orders) : "—"}</small><small>Preço médio/kg: {report.current.weight > 0 ? money(report.current.revenue / report.current.weight) : "—"} · anterior: {report.previous.weight > 0 ? money(report.previous.revenue / report.previous.weight) : "—"}</small></section>
      <section className="panel mart-report-card"><h2>Lojas com compra</h2><strong>{report.current.activeStores} / {report.members.length}</strong><span>Anterior: {report.hasPrevious ? report.previous.activeStores : "—"} · Sem recompra: {report.lost.length}</span><small>{report.resumed.length} retomadas · {report.first.length} primeiras compras registradas</small><small>Mix da carteira: {report.current.mix} produtos · anterior: {report.previous.mix}</small></section>
      {report.hasPrevious && <section className="panel mart-report-card"><h2>Mesmas lojas compradoras</h2><strong><Change available={report.hasPrevious} current={report.sameStores.current} previous={report.sameStores.previous} /></strong><span>{report.sameStores.count} lojas compraram nos dois períodos</span><small>{number(report.sameStores.current)} kg · anterior: {number(report.sameStores.previous)} kg</small></section>}
      {report.previousYearPeriod.start >= report.trackingStart && <section className="panel mart-report-card"><h2>Mesmo período do ano anterior</h2><strong>{report.previousYear.orders ? <Change available={report.hasPrevious} current={report.current.weight} previous={report.previousYear.weight} /> : "Sem base"}</strong><span>{dateLabel(report.previousYearPeriod.start)} a {dateLabel(report.previousYearPeriod.end)}</span><small>{report.previousYear.orders ? `${number(report.previousYear.weight)} kg · ${report.previousYear.orders} pedidos` : "Sem pedidos registrados na comparação."}</small></section>}
      <section className="panel mart-report-card"><h2>Kg por pedido</h2><strong>{report.current.orders ? number(report.current.weight / report.current.orders) : "—"}</strong><span>Anterior: {report.previous.orders ? number(report.previous.weight / report.previous.orders) : "—"}</span></section>
      <section className="panel mart-report-card"><h2>Peso bonificado</h2><strong>{number(report.bonus.weight)} kg</strong><span>{report.bonus.count} bonificação(ões)</span><small>Valor de referência: {money(report.bonus.revenue)}</small></section>
    </div>
    <section className="panel mart-report-section"><div className="mart-section-heading"><div><h2>{report.custom ? "Evolução por período" : "Evolução mensal"}</h2><p>{report.custom ? `Intervalos consecutivos de ${report.duration} dias, sem sobreposição.` : report.cutoff ? `Comparação até o dia ${report.cutoff}.` : "Meses completos."}</p></div></div>
      <div className="mart-month-chart" role="img" aria-label="Peso comprado por mês. Valores detalhados na tabela a seguir.">{report.monthly.map((item) => <div key={item.period.start} className={item.period.start === report.currentPeriod.start ? "mart-month-current" : ""}><span>{number(item.weight)} kg</span><div className="mart-bar-track"><div className="mart-bar" style={{ height: `${item.weight / maxWeight * 100}%` }} /></div><strong>{periodLabel(item.period)}</strong></div>)}</div>
      <div className="mart-report-table"><table><thead><tr><th>Período</th><th>Peso</th><th>Valor</th><th>Pedidos</th><th>Lojas com compra</th><th>Mix</th></tr></thead><tbody>{report.monthly.map((item) => <tr key={item.period.start}><td>{periodLabel(item.period)}<small>Até {dateLabel(item.period.end)}</small></td><td>{number(item.weight)} kg</td><td>{money(item.revenue)}</td><td>{item.orders}</td><td>{item.activeStores}</td><td>{item.mix}</td></tr>)}</tbody></table></div>
    </section>
    <section className="panel mart-report-section"><div className="mart-section-heading"><div><h2>Prioridades de acompanhamento</h2></div></div>
      <div className="mart-alert-grid"><div><h3>Maiores perdas de volume</h3>{drops.length ? drops.map((row) => {
        const lostProducts = row.products.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 2);
        return <button type="button" key={row.customer.id} className="mart-alert" onClick={() => setSelectedId(row.customer.id)}><strong>{row.customer.name} · Loja {row.customer.store || row.customer.code}</strong><span className="mart-negative">{number(-row.delta)} kg a menos · <Change available={report.hasPrevious} current={row.current.weight} previous={row.previous.weight} /></span><small>{lostProducts.length ? `${lostProducts.map((item) => item.name).join(" e ")} somam ${number(lostProducts.reduce((total, item) => total - item.delta, 0))} kg de redução.` : row.state}</small></button>;
      }) : <p>{report.hasPrevious ? "Sem quedas frente ao período anterior." : "Aguardando histórico para comparação."}</p>}<p className="mart-section-note">Perdas nas lojas: {number(totalLoss)} kg.</p></div>
      <div><h3>Acima do intervalo habitual</h3>{overdue.length ? overdue.map((row) => <button type="button" className="mart-alert" key={row.customer.id} onClick={() => setSelectedId(row.customer.id)}><strong>{row.customer.name} · Loja {row.customer.store || row.customer.code}</strong><span>{row.daysSince} dias sem compra; habitual: {number(row.usualGap!)} dias.</span><small>Última compra: {dateLabel(row.lastPurchase)}</small></button>) : <p>Sem atrasos detectados ou histórico insuficiente.</p>}<p className="mart-section-note">Atraso acima de 1,5× o intervalo habitual.</p></div></div>
    </section>
    {selected && <div ref={detailRef}><StoreDetail store={selected} report={report} close={() => setSelectedId("")} /></div>}
    <section className="panel mart-report-section"><div className="mart-section-heading"><div><h2>Comparativo por loja</h2><p>Selecione uma loja para ver os produtos.</p></div></div>
      <div className="mart-inline-filters"><label>Buscar loja<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, código, loja, cidade ou Sul de Minas" /></label><label>Situação<select value={storeState} onChange={(event) => setStoreState(event.target.value)}><option value="all">Todas as situações</option>{["Mês inicial", "Queda", "Crescimento", "Sem recompra", "Retomada", "Primeira compra registrada", "Sem compra no período", "Estável"].map((state) => <option key={state}>{state}</option>)}<option value="overdue">Acima do intervalo habitual</option></select></label><span>{visibleStores.length} loja(s)</span></div>
      <div className="mart-report-table mart-store-table-container" role="region" aria-label="Comparativo por loja com rolagem" tabIndex={0}><table><thead><tr>{heading("name", "Loja", (row) => row.customer.name)}{heading("seller", "Responsável", (row) => row.seller || "Representação WRRJ")}<th>Situação</th>{report.periods.map((period) => <Fragment key={period.start}>{heading(period.start, `${periodLabel(period)} kg`, (row) => row.history[report.periods.indexOf(period)].weight)}</Fragment>)}{heading("delta", "Diferença kg", (row) => row.delta)}<th>Variação</th>{heading("average", "Média recente kg", (row) => row.average)}<th>Vs. média</th>{heading("value", "Valor atual", (row) => row.current.revenue)}{heading("perOrder", "Kg/pedido", (row) => row.current.orders ? row.current.weight / row.current.orders : 0)}{heading("orders", "Pedidos", (row) => row.current.orders)}{heading("mix", "Mix", (row) => row.current.mix)}{heading("last", "Última compra", (row) => row.lastPurchase)}{heading("days", "Dias sem comprar", (row) => row.daysSince ?? -1)}</tr></thead><tbody>{sorted.map((row) => <tr key={row.customer.id} className={row.customer.id === selectedId ? "mart-selected-row" : ""}><td><button type="button" className="mart-store-link" onClick={() => setSelectedId(row.customer.id)}>{row.customer.name}</button><small>Cód. {row.customer.code} · Loja {row.customer.store || "—"} · {row.customer.city}</small></td><td>{row.seller || "Representação WRRJ"}</td><td><span className={row.delta < 0 ? "mart-negative" : "mart-neutral"}>{row.state}</span></td>{row.history.map((value, index) => <td key={report.periods[index].start}>{number(value.weight)}</td>)}<td className={row.delta < 0 ? "mart-negative" : "mart-neutral"}>{report.hasPrevious && row.delta > 0 ? "+" : ""}{(report.hasPrevious ? number(row.delta) : "—")}</td><td><Change available={report.hasPrevious} current={row.current.weight} previous={row.previous.weight} /></td><td>{(report.averageCount ? number(row.average) : "—")}</td><td><Change available={report.hasPrevious} current={row.current.weight} previous={row.average} /></td><td>{money(row.current.revenue)}</td><td>{row.current.orders ? number(row.current.weight / row.current.orders) : "—"}</td><td>{row.current.orders}<small>Anterior: {report.hasPrevious ? row.previous.orders : "—"}</small></td><td>{row.current.mix}<small>Anterior: {report.hasPrevious ? row.previous.mix : "—"}</small></td><td>{dateLabel(row.lastPurchase)}</td><td>{row.daysSince ?? "—"}{row.overdue && <small className="mart-negative">Acima do habitual</small>}</td></tr>)}</tbody></table></div>{!visibleStores.length && <p className="mart-section-note">Nenhuma loja corresponde aos filtros.</p>}
    </section>
    <section className="panel mart-report-section"><div className="mart-section-heading"><div><h2>Produtos e mudanças no mix</h2></div></div>
      <div className="mart-inline-filters"><label>Buscar produto<input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Nome ou código" /></label><label>Comparação<select value={productMode} onChange={(event) => setProductMode(event.target.value)}><option value="all">Todos os produtos</option><option value="fall">Com queda</option><option value="growth">Com crescimento</option><option value="lost">Sem recompra no período</option></select></label></div>
      <ProductTable rows={products} report={report} />
    </section>
  </>;
}
