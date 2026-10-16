"use client";

import Link from "next/link";
import { Fragment, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Download, Filter, Search } from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { useTableSort } from "@/components/sort-heading";
import { saoPauloToday } from "@/lib/mart-minas-analytics";
import { buildCommercialReport, COMMERCIAL_REPORTS, REPORT_START, validReportPeriod, type CommercialReportId, type ReportFilters, type CommercialRow, type ReportColumn } from "@/lib/commercial-reports";
import { downloadXlsx } from "@/lib/xlsx";
import "./commercial-reports.css";

const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) => value.split("-").reverse().join("/");
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const defaults = (today: string): ReportFilters => ({ start: `${today.slice(0, 7)}-01`, end: today, scope: "ours", network: "", city: "", segment: "", customerStatus: "Ativo", customer: "", product: "", orderStatus: "normal" });
function cell(value: CommercialRow[string], column: ReportColumn) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value !== "number") return column.format === "date" ? date(value) : value;
  return column.format === "money" ? money(value) : column.format === "percent" ? `${number(value)}%` : number(value);
}

function ReportResults({ rows, columns, reportId, start, end }: { rows: CommercialRow[]; columns: ReportColumn[]; reportId: CommercialReportId; start: string; end: string }) {
  const { sorted, heading } = useTableSort(rows);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const pages = Math.max(1, Math.ceil(sorted.length / 50)), currentPage = Math.min(page, pages - 1);
  return <>
    <div className="cr-results-heading"><strong>{rows.length} resultado(s)</strong><button type="button" className="button button-primary" disabled={exporting || !rows.length} onClick={async () => {
      if (exporting) return;
      setExporting(true); setError("");
      try { await downloadXlsx(`relatorio-${reportId}-${start}-${end}.xlsx`, "Resultados", columns.map((column) => column.title), sorted.map((row) => columns.map((column) => row[column.key] ?? "Sem base"))); }
      catch { setError("Não foi possível exportar. Tente novamente."); }
      finally { setExporting(false); }
    }}><Download size={16} />{exporting ? "Exportando..." : "Exportar resultados"}</button></div>
    {error && <p className="cr-error" role="alert">{error}</p>}
    <div className="cr-table-scroll" role="region" aria-label="Resultados com rolagem" tabIndex={0}><table><thead><tr>{columns.map((column) => <Fragment key={column.key}>{heading(column.key, column.title, (row) => row[column.key] ?? undefined)}</Fragment>)}</tr></thead><tbody>{sorted.slice(currentPage * 50, (currentPage + 1) * 50).map((row) => <tr key={row.id}>{columns.map((column) => <td key={column.key} className={column.key === "change" || column.key === "delta" ? Number(row[column.key]) < 0 ? "cr-negative" : Number(row[column.key]) > 0 ? "cr-positive" : "" : ""}>{cell(row[column.key], column)}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="cr-empty">Nenhum resultado para os filtros selecionados.</div>}</div>
    <div className="cr-pagination"><span>{rows.length ? `${currentPage * 50 + 1}–${Math.min((currentPage + 1) * 50, rows.length)} de ${rows.length}` : "0 resultados"}</span><div><button type="button" className="button button-outline" aria-label="Página anterior" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><span>{currentPage + 1} / {pages}</span><button type="button" className="button button-outline" aria-label="Próxima página" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div></div>
  </>;
}

export function ReportCenter() {
  const data = useCrmStore();
  const today = saoPauloToday();
  const [reportId, setReportId] = useState<CommercialReportId>("customers");
  const [draft, setDraft] = useState<ReportFilters>(() => defaults(today));
  const [applied, setApplied] = useState<ReportFilters>(() => defaults(today));
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("all");
  const [filterError, setFilterError] = useState("");
  const endRef = useRef<HTMLInputElement>(null);
  const result = useMemo(() => validReportPeriod(applied.start, applied.end, today) ? buildCommercialReport(data, applied, reportId) : null, [data, applied, reportId, today]);
  const report = COMMERCIAL_REPORTS.find((item) => item.id === reportId)!;
  const changed = JSON.stringify(draft) !== JSON.stringify(applied);
  const scope = applied.scope === "ours" ? "Representação WRRJ" : applied.scope === "all" ? "Dados mesclados" : applied.scope === "external" ? "Outros vendedores" : applied.scope.slice(7);
  const sellers = [...new Set(data.customerGroups.flatMap((group) => Object.values(group.externalStoreSellers ?? {})).map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const unique = (key: "city" | "segment") => [...new Set(data.customers.map((customer) => customer[key]).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const patch = (key: keyof ReportFilters, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const visibleRows = result?.rows.filter((row) => result.columns.some((column) => normalize(String(row[column.key] ?? "")).includes(normalize(query))) && (activity === "all" || (activity === "with" ? Number(row.weight) > 0 : Number(row.weight) === 0))) ?? [];
  function apply(event: FormEvent) {
    event.preventDefault();
    if (!validReportPeriod(draft.start, draft.end, today)) { setFilterError("Informe De e Até entre 01/10/2026 e hoje, com início anterior ou igual ao fim."); return; }
    setApplied({ ...draft }); setFilterError(""); setQuery(""); setActivity("all");
  }
  function preset(kind: string) {
    const start = kind === "all" ? REPORT_START : kind === "month" ? `${today.slice(0, 7)}-01` : new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
    setDraft((current) => ({ ...current, start: start < REPORT_START ? REPORT_START : start, end: today }));
  }
  return <div className="page-content commercial-reports">
    <header className="cr-heading"><div><p className="eyebrow">GESTÃO COMERCIAL</p><h1>Relatórios</h1></div><Link href="/relatorios/mart-minas" className="button button-outline">Mart Minas <ArrowRight size={16} /></Link></header>
    <div className="cr-workspace"><aside className="panel cr-navigation"><span className="cr-nav-label">ANÁLISES</span><nav aria-label="Tipos de relatório">{COMMERCIAL_REPORTS.map((item) => <button type="button" key={item.id} aria-current={reportId === item.id ? "page" : undefined} className={reportId === item.id ? "cr-nav-active" : ""} onClick={() => { setReportId(item.id); setQuery(""); setActivity("all"); }}><strong>{item.title}</strong><small>{item.description}</small></button>)}</nav></aside>
    <section className="cr-main" aria-label="Relatório selecionado">
      <form className="panel cr-filters" onSubmit={apply}><div className="cr-filter-heading"><h2><Filter size={17} /> Filtros</h2><div className="cr-presets"><button type="button" onClick={() => preset("week")}>7 dias</button><button type="button" onClick={() => preset("month")}>Este mês</button><button type="button" onClick={() => preset("all")}>Desde o início</button></div></div>
        <div className="cr-filter-grid"><div className="cr-date-range"><label>De<input type="date" required min={REPORT_START} max={today} value={draft.start} onChange={(event) => {
          const value = event.target.value; patch("start", value);
          if (draft.end < value) patch("end", value);
          if (value && event.target.validity.valid && endRef.current) { endRef.current.min = value; endRef.current.focus(); try { endRef.current.showPicker?.(); } catch { /* Keep keyboard entry available. */ } }
        }} /></label><span aria-hidden="true">→</span><label>Até<input ref={endRef} type="date" required min={draft.start || REPORT_START} max={today} value={draft.end} onChange={(event) => patch("end", event.target.value)} /></label></div>
          <label>Dados<select value={draft.scope} onChange={(event) => patch("scope", event.target.value)}><option value="ours">Somente Representação WRRJ</option><option value="all">Mesclar com outros vendedores</option><option value="external">Somente outros vendedores</option>{sellers.map((seller) => <option key={seller} value={`seller:${seller}`}>{seller}</option>)}</select></label>
          <label>Situação dos pedidos<select value={draft.orderStatus} onChange={(event) => patch("orderStatus", event.target.value)}><option value="normal">Normais</option><option value="wallet">Em carteira</option><option value="all">Normais + em carteira</option></select></label>
        </div>
        <details className="cr-more-filters"><summary>Rede, cidade, segmento, cliente e produto</summary><div className="cr-filter-grid cr-advanced-grid">
          <label>Rede<select value={draft.network} onChange={(event) => patch("network", event.target.value)}><option value="">Todas</option><option value="none">Sem rede</option>{data.customerGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <label>Cidade<select value={draft.city} onChange={(event) => patch("city", event.target.value)}><option value="">Todas</option>{unique("city").map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Segmento<select value={draft.segment} onChange={(event) => patch("segment", event.target.value)}><option value="">Todos</option>{unique("segment").map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Status do cliente<select value={draft.customerStatus} onChange={(event) => patch("customerStatus", event.target.value)}><option value="">Todos</option>{["Ativo", "Inativo", "Prospect"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Cliente<select value={draft.customer} onChange={(event) => patch("customer", event.target.value)}><option value="">Todos</option>{[...data.customers].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((customer) => <option key={customer.id} value={customer.id}>{customer.name || customer.code} · {customer.code} · Loja {customer.store || "—"}</option>)}</select></label>
          <label>Produto<select value={draft.product} onChange={(event) => patch("product", event.target.value)}><option value="">Todos</option>{[...data.products].sort((a, b) => a.description.localeCompare(b.description, "pt-BR")).map((product) => <option key={product.id} value={product.id}>{product.description} · {product.codeBox}</option>)}</select></label>
        </div></details>
        <div className="cr-filter-actions"><span>{changed ? "Filtros alterados; aplique para atualizar." : "Filtros aplicados"}</span><button type="button" className="button button-outline" onClick={() => { const initial = defaults(today); setDraft(initial); setApplied(initial); setQuery(""); setActivity("all"); setFilterError(""); }}>Limpar</button><button type="submit" className="button button-primary">Aplicar filtros</button></div>{filterError && <p className="cr-error" role="alert">{filterError}</p>}
      </form>
      {result && <>
        <div className="cr-context"><strong>{scope}</strong><span>{date(applied.start)} a {date(applied.end)}</span><span>{applied.customerStatus || "Todos os status"}</span>{applied.network && <span>{data.customerGroups.find((group) => group.id === applied.network)?.name || "Sem rede"}</span>}{applied.city && <span>{applied.city}</span>}{applied.segment && <span>{applied.segment}</span>}{applied.customer && <span>{data.customers.find((customer) => customer.id === applied.customer)?.name || applied.customer}</span>}{applied.product && <span>{data.products.find((product) => product.id === applied.product)?.description}</span>}</div>
        <div className="cr-summary" aria-label="Resumo do período filtrado"><article className="panel"><span>Peso comprado</span><strong>{number(result.summary.weight)} kg</strong><small>{result.summary.orders} pedidos</small></article><article className="panel"><span>Valor dos pedidos</span><strong>{money(result.summary.value)}</strong><small>{applied.orderStatus === "normal" ? "Pedidos normais" : "Inclui pedidos em carteira"}</small></article><article className="panel"><span>Clientes com compra</span><strong>{result.summary.buyers} / {result.summary.customers}</strong><small>{number(result.summary.customers ? result.summary.buyers / result.summary.customers * 100 : 0)}% de positivação</small></article><article className="panel"><span>Peso bonificado</span><strong>{number(result.summary.bonusWeight)} kg</strong><small>Separado dos pedidos</small></article></div>
        <section className="panel cr-results"><div className="cr-section-heading"><div><h2>{report.title}</h2><p>{report.description}</p></div><div className="cr-result-filters"><label className="cr-search"><Search size={16} /><input aria-label="Buscar no resultado" placeholder="Buscar no resultado" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{reportId !== "inactive" && reportId !== "bonuses" && <select aria-label="Filtrar resultado por volume" value={activity} onChange={(event) => setActivity(event.target.value)}><option value="all">Todos os resultados</option><option value="with">Com volume</option><option value="without">Sem volume</option></select>}</div></div>
          <ReportResults key={`${reportId}-${JSON.stringify(applied)}-${query}-${activity}`} rows={visibleRows} columns={result.columns} reportId={reportId} start={applied.start} end={applied.end} />
        </section>
        {result.unmatchedOrders > 0 && <p className="cr-warning" role="status">{result.unmatchedOrders} pedido(s) sem cliente vinculado ficaram fora da análise. Confira os cadastros.</p>}
        <details className="panel cr-method"><summary>Critérios do relatório</summary><ul><li>Início do acompanhamento: outubro de 2026. {result.hasComparison ? `Comparação com ${date(result.previousStart)} a ${date(result.previousEnd)}, com a mesma quantidade de dias.` : "Comparações serão exibidas quando houver um período anterior completo desde o início do acompanhamento."}</li><li>A representação segue o vendedor atual de cada loja. Última compra e frequência usam o histórico registrado até a data final e a situação dos pedidos selecionada.</li><li>Intervalo médio usa até oito datas distintas de compra; sem duas datas, aparece “—”. Sem base anterior positiva, a variação também aparece “—”.</li><li>Selecionar um produto restringe os pesos e valores aos itens desse produto. Sem compra significa ausência de pedidos registrados no período, considerando os filtros.</li><li>Bonificações respeitam os filtros de cliente e produto e não possuem situação de pedido. Sua proporção só é calculada com pedidos normais e peso comprado positivo.</li><li>Valores são de pedidos, sem comprovação de faturamento. O Excel exporta todos os resultados da busca, na ordenação selecionada, além da página visível.</li></ul></details>
      </>}
    </section></div>
  </div>;
}
