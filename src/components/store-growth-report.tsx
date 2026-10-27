"use client";

import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Customer, CustomerGroup, Order } from "@/lib/types";
import { buildStoreGrowth, defaultGrowthMonths } from "@/lib/store-growth";
import { useTableSort } from "@/components/sort-heading";

const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function StoreGrowthReport({ customers, group, orders, start, end, scope, sidebar }: { customers: Customer[]; group: CustomerGroup; orders: Order[]; start: string; end: string; scope: string; sidebar: ReactNode }) {
  const tableViewport = useRef<HTMLDivElement>(null);
  const horizontalScrollbar = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  useEffect(() => {
    const viewport = tableViewport.current;
    const table = viewport?.querySelector("table");
    if (!viewport || !table) return;
    const observer = new ResizeObserver(() => setTableWidth(viewport.scrollWidth));
    observer.observe(viewport);
    observer.observe(table);
    setTableWidth(viewport.scrollWidth);
    return () => observer.disconnect();
  }, []);
  const [search, setSearch] = useState("");
  const [comparisonError, setComparisonError] = useState("");
  const [monthSettings, setMonthSettings] = useState<Record<string, string[]>>({});
  const periodKey = start.slice(0, 7);
  const comparisonSlots = monthSettings[periodKey] ?? [...defaultGrowthMonths(start), "", "", ""].slice(0, 3);
  const availableMonths: string[] = [];
  for (let month = "2026-10"; month < periodKey;) {
    availableMonths.push(month);
    const [year, number] = month.split("-").map(Number);
    month = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 7);
  }
  const comparisonKey = comparisonSlots.join(",");
  const data = useMemo(() => buildStoreGrowth(customers, group, orders, start, end, scope, comparisonKey.split(",")), [customers, group, orders, start, end, scope, comparisonKey]);
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const rows = data.rows.filter((row) => normalize(`${row.name} ${row.code} ${row.store} ${row.city} ${row.seller}`).includes(normalize(search.trim())));
  const { sorted, heading } = useTableSort(rows);
  const sum = (key: "average" | "weight" | "delta" | "averageRevenue" | "revenue") => rows.reduce((total, row) => total + row[key], 0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  async function exportReport() {
    if (exporting) return;
    setExporting(true); setExportError("");
    try {
      const { createGrowthWorkbook, downloadReportXls } = await import("@/lib/store-report-export");
      downloadReportXls(createGrowthWorkbook(sorted, data.months, start, end, scope === "ours" ? "WRRJ" : scope === "external" ? "Sul de Minas" : "Mesclado", search), `crescimento-por-loja-${start}-${end}.xls`);
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : "Não foi possível exportar o XLS."); }
    finally { setExporting(false); }
  }
  const monthLabel = (month: string) => month.split("-").reverse().join("/");
  return <div className="mart-commission-workspace">
    <aside className="mart-workspace-sidebar"><div className="panel mart-workspace-filter-panel"><h2>Filtros de crescimento</h2>{sidebar}<div className="commission-filters report-specific-filters"><label>Buscar loja<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, código, cidade..." /></label></div></div></aside>
    <section className="panel mart-report-section commission-report growth-report" aria-label="Crescimento por loja">
      <div className="mart-section-heading"><div><h2>Crescimento por loja</h2><p>{start.split("-").reverse().join("/")} a {end.split("-").reverse().join("/")} · Comparação por peso (kg)</p></div><button type="button" className="button button-primary" disabled={exporting || !sorted.length} onClick={() => void exportReport()}><Download size={16} />{exporting ? "Gerando..." : "Exportar XLS"}</button></div>
      <div className="mart-comparison-settings"><div className="growth-comparison-controls" role="group" aria-label="Meses de comparação"><div><strong>Meses de comparação</strong><span className="mart-comparison-summary">{data.months.length ? data.months.map(monthLabel).join(" · ") : availableMonths.length ? "Inativa" : "Sem comparação"}</span></div><div className="growth-comparison-slots">{comparisonSlots.map((month, index) => <div className="growth-month-slot" key={index}><label>{index + 1}ª coluna<input type="month" aria-label={`Mês da ${index + 1}ª coluna`} min="2026-10" max={availableMonths.at(-1) ?? "2026-10"} value={month} onChange={(event) => { const value = event.target.value; if (value && (value < "2026-10" || value >= periodKey)) { setComparisonError("Escolha um mês a partir de outubro de 2026 e anterior ao período analisado."); return; } if (value && comparisonSlots.some((selected, slot) => slot !== index && selected === value)) { setComparisonError("Esse mês já está selecionado em outra coluna."); return; } setComparisonError(""); const next = [...comparisonSlots]; next[index] = value; setMonthSettings((previous) => ({ ...previous, [periodKey]: next })); }} /></label><button type="button" className="growth-month-disable" disabled={!month} onClick={() => { const next = [...comparisonSlots]; next[index] = ""; setComparisonError(""); setMonthSettings((previous) => ({ ...previous, [periodKey]: next })); }}>{month ? "Inativar" : "Inativo"}</button></div>)}</div><button type="button" className="button button-outline" onClick={() => setMonthSettings((previous) => { const next = { ...previous }; delete next[periodKey]; return next; })}>Restaurar padrão</button></div></div>
      {comparisonError && <p className="form-error" role="alert">{comparisonError}</p>}

      <div className="commission-table-intro"><div><h3>Lojas</h3><span>{rows.length} de {data.rows.length} lojas · Crescimento por peso</span></div><div className="growth-legend"><span className="growth-up">↑ Cresceu</span><span className="growth-down">↓ Queda</span><span className="growth-flat">= Sem alteração</span></div></div>
      <div className="commission-horizontal-scroll" ref={horizontalScrollbar} role="region" aria-label="Rolagem horizontal da tabela" tabIndex={0} onScroll={(event) => { if (tableViewport.current) tableViewport.current.scrollLeft = event.currentTarget.scrollLeft; }}><div style={{ width: tableWidth, height: 1 }} /></div>
      <div className="mart-report-table" ref={tableViewport} onScroll={(event) => { if (horizontalScrollbar.current) horizontalScrollbar.current.scrollLeft = event.currentTarget.scrollLeft; }}><table><thead><tr>{heading("name", "Cliente", r => r.name)}{heading("code", "Código", r => r.code)}{heading("store", "Loja", r => r.store)}{heading("city", "Cidade", r => r.city)}{heading("seller", "Responsável", r => r.seller)}{data.months.map((month, index) => heading(month, `${monthLabel(month)} (kg)`, r => r.history[index]))}{heading("average", `Média ${data.months.length || "anterior"} ${data.months.length ? "mês(es) " : ""}(kg)`, r => r.average)}{heading("weight", "Peso atual (kg)", r => r.weight)}{heading("delta", "Diferença (kg)", r => r.delta)}{heading("growth", "Crescimento", r => r.growth ?? Number.POSITIVE_INFINITY)}{heading("averageRevenue", "Média financeira", r => r.averageRevenue)}{heading("revenue", "Valor atual", r => r.revenue)}</tr></thead><tbody>{sorted.map(row => <tr key={row.id}><td>{row.name}<small>{row.document || "CNPJ não informado"}</small></td><td>{row.code}</td><td>{row.store || "—"}</td><td>{row.city || "—"}</td><td>{row.seller || "WRRJ"}</td>{row.history.map((value, index) => <td key={index}>{number(value)}</td>)}<td>{row.hasComparison ? number(row.average) : "—"}</td><td><strong>{number(row.weight)}</strong></td><td>{row.hasComparison ? number(row.delta) : "—"}</td><td><span className={`growth-badge growth-${row.trend}`}>{row.trend === "up" ? "↑ " : row.trend === "down" ? "↓ " : row.trend === "flat" ? "= " : ""}{!row.hasComparison ? "Sem comparação" : row.growth === null ? "Sem base anterior" : `${number(row.growth)}%`}</span></td><td>{row.hasComparison ? money(row.averageRevenue) : "—"}</td><td>{money(row.revenue)}</td></tr>)}{!rows.length && <tr><td colSpan={11 + data.months.length}>Nenhuma loja encontrada.</td></tr>}</tbody><tfoot><tr><td colSpan={5}>Total após filtros</td>{data.months.map((month, index) => <td key={month}>{number(rows.reduce((total, row) => total + row.history[index], 0))}</td>)}<td>{data.months.length ? number(sum("average")) : "—"}</td><td>{number(sum("weight"))}</td><td>{data.months.length ? number(sum("delta")) : "—"}</td><td>{data.months.length && sum("average") > 0 ? `${number(sum("delta") / sum("average") * 100)}%` : "—"}</td><td>{data.months.length ? money(sum("averageRevenue")) : "—"}</td><td>{money(sum("revenue"))}</td></tr></tfoot></table></div>


      <details className="products-method"><summary>Critério da comparação</summary><div className="growth-method">{data.months.length ? <>Base: média de {data.months.length} mês(es) anterior(es) disponível(is) ({data.months.map(monthLabel).join(", ")}), até três meses. Meses sem pedidos entram como zero. O período selecionado pode estar incompleto.</> : <>Início do acompanhamento: outubro de 2026. Peso e financeiro do período disponíveis; {availableMonths.length ? "a comparação está inativa. Selecione um mês acima para comparar." : "ainda não há meses anteriores para comparar."}</>}</div></details>
      {exportError && <p className="form-error" role="alert">{exportError}</p>}
    </section>
  </div>;
}
