"use client";

import { useMemo, useState } from "react";
import { Download, Filter, Plus, Search, Trash2, TrendingUp, X } from "lucide-react";
import { usePeriodRecords } from "@/lib/use-period-records";
import { useCrmStore } from "@/lib/store";
import { downloadXlsx } from "@/lib/xlsx";
import type { Customer, Order, Product } from "@/lib/types";

type GrowthMode = "customers" | "products";
type GrowthRow = Record<string, string | number>;

const monthInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthBounds = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return { start: `${value}-01`, end: `${value}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}` };
};
const monthLabel = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
};
const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const percent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

function customerMatchesOrder(customer: Customer, order: Order) {
  return order.customerId === customer.id ||
    (!order.customerId && order.customerCode.toLowerCase() === customer.code.toLowerCase() && order.store === customer.store);
}

function itemMatchesProduct(item: Order["items"][number], product: Product) {
  return item.productId === product.id || item.productCode === product.codeBox || item.productCode === product.codeHalfBox;
}

function monthlyCustomerWeight(customer: Customer, orders: Order[], start: string, end: string) {
  return orders
    .filter((order) => order.status === "normal" && order.issueDate >= start && order.issueDate <= end && customerMatchesOrder(customer, order))
    .reduce((sum, order) => sum + order.totalWeight, 0);
}

function monthlyProductVolume(product: Product, orders: Order[], start: string, end: string) {
  return orders
    .filter((order) => order.status === "normal" && order.issueDate >= start && order.issueDate <= end)
    .flatMap((order) => order.items)
    .filter((item) => itemMatchesProduct(item, product))
    .reduce((sum, item) => sum + (product.measure === "UN" ? item.unitQuantity : item.grossWeight ?? item.totalWeight), 0);
}

function variation(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

export function GrowthReport({ mode }: { mode: GrowthMode }) {
  const { customers, products } = useCrmStore();
  const now = new Date();
  const previousMonth = monthInput(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const [mainMonth, setMainMonth] = useState(monthInput(now));
  const [compareMonths, setCompareMonths] = useState([previousMonth]);
  const [status, setStatus] = useState("Ativo");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionApplied, setSelectionApplied] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [filterOpen, setFilterOpen] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ columns: string[]; rows: GrowthRow[]; periodLabel: string; selectedCount: number; status: string } | null>(null);

  const candidates = useMemo(() => mode === "customers"
    ? customers.filter((customer) => status === "Todos" || customer.status === status)
    : products.filter((product) => status === "Todos" || product.status === status),
  [customers, mode, products, status]);
  const filteredCandidates = useMemo(() => candidates.filter((item) => {
    const text = mode === "customers"
      ? `${(item as Customer).name} ${(item as Customer).code} ${(item as Customer).city} ${(item as Customer).store}`
      : `${(item as Product).description} ${(item as Product).codeBox} ${(item as Product).codeHalfBox}`;
    return text.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"));
  }), [candidates, mode, query]);
  const visibleCandidates = filteredCandidates.slice(0, visibleLimit);
  const includedCount = selectionApplied
    ? selectedIds.filter((id) => candidates.some((item) => item.id === id)).length
    : candidates.length;
  const chosenMonths = [mainMonth, ...compareMonths];
  const selectedMonths = chosenMonths.filter(value => /^\d{4}-\d{2}$/.test(value)).sort();
  const firstMonth = selectedMonths[0] || "";
  const lastMonth = selectedMonths.at(-1) || "";
  const lastParts = lastMonth.split("-").map(Number);
  const orderData = usePeriodRecords<Order>("orders", firstMonth ? `${firstMonth}-01` : "", lastMonth ? `${lastMonth}-${new Date(lastParts[0], lastParts[1], 0).getDate()}` : "");
  const orders = orderData.rows;


  function isIncluded(id: string) {
    return !selectionApplied || selectedIds.includes(id);
  }

  function toggleItem(id: string) {
    if (!selectionApplied) {
      setSelectionApplied(true);
      setSelectedIds(candidates.filter((item) => item.id !== id).map((item) => item.id));
      return;
    }
    setSelectedIds((current) => current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id]);
  }

  function toggleVisible() {
    const visibleIds = visibleCandidates.map((item) => item.id);
    if (!selectionApplied) {
      setSelectionApplied(true);
      setSelectedIds(candidates.filter((item) => !visibleIds.includes(item.id)).map((item) => item.id));
      return;
    }
    const allVisibleIncluded = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allVisibleIncluded
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  }

  function includeAll() {
    setSelectionApplied(false);
    setSelectedIds([]);
  }

  function addCompareMonth() {
    const occupied = new Set(chosenMonths.filter(Boolean));
    let candidate = mainMonth ? new Date(`${mainMonth}-01T12:00:00`) : new Date();
    for (let offset = 1; offset <= 240; offset += 1) {
      candidate = new Date(candidate.getFullYear(), candidate.getMonth() - 1, 1);
      const value = monthInput(candidate);
      if (!occupied.has(value)) {
        setCompareMonths((current) => [...current, value]);
        return;
      }
    }
    setError("Não foi possível encontrar outro mês para adicionar.");
  }

  function updateCompareMonth(index: number, value: string) {
    setCompareMonths((current) => current.map((month, monthIndex) => monthIndex === index ? value : month));
  }

  function removeCompareMonth(index: number) {
    setCompareMonths((current) => current.filter((_, monthIndex) => monthIndex !== index));
  }

  function generateReport() {
    if (orderData.loading || orderData.error) { setError(orderData.error || "Aguarde o carregamento dos dados do período."); return; }
    if (!mainMonth || !compareMonths.length || compareMonths.some((month) => !month)) {
      setError("Selecione o mês principal e pelo menos um mês para comparar.");
      return;
    }
    if (new Set(chosenMonths).size !== chosenMonths.length) {
      setError("Cada mês da comparação precisa ser diferente.");
      return;
    }

    const selected = candidates.filter((item) => !selectionApplied || selectedIds.includes(item.id));
    const main = monthBounds(mainMonth);
    const comparisons = compareMonths.map((month) => ({ month, ...monthBounds(month) }));
    let columns: string[];
    let rows: GrowthRow[];
    if (mode === "customers") {
      const mainColumn = `${monthLabel(mainMonth)} (kg)`;
      const comparisonColumns = comparisons.map(({ month }) => `${monthLabel(month)} (kg)`);
      const variationColumns = comparisons.map(({ month }) => `Variação vs ${monthLabel(month)} (%)`);
      columns = ["Cliente - Cidade", mainColumn, ...comparisonColumns, ...variationColumns];
      rows = (selected as Customer[]).map((customer) => {
        const currentWeight = monthlyCustomerWeight(customer, orders, main.start, main.end);
        const comparisonWeights = comparisons.map(({ start, end }) => monthlyCustomerWeight(customer, orders, start, end));
        return {
          "Cliente - Cidade": `${customer.name} — ${customer.city || "—"}`,
          [mainColumn]: currentWeight,
          ...Object.fromEntries(comparisonColumns.map((column, index) => [column, comparisonWeights[index]])),
          ...Object.fromEntries(variationColumns.map((column, index) => [column, variation(currentWeight, comparisonWeights[index])])),
        };
      });
    } else {
      const mainColumn = `${monthLabel(mainMonth)} (volume)`;
      const comparisonColumns = comparisons.map(({ month }) => `${monthLabel(month)} (volume)`);
      const variationColumns = comparisons.map(({ month }) => `Variação vs ${monthLabel(month)} (%)`);
      columns = ["Produto", "Código", "Unidade", mainColumn, ...comparisonColumns, ...variationColumns];
      rows = (selected as Product[]).map((product) => {
        const currentVolume = monthlyProductVolume(product, orders, main.start, main.end);
        const comparisonVolumes = comparisons.map(({ start, end }) => monthlyProductVolume(product, orders, start, end));
        return {
          Produto: product.description,
          Código: product.codeBox,
          Unidade: product.measure ?? "KG",
          [mainColumn]: currentVolume,
          ...Object.fromEntries(comparisonColumns.map((column, index) => [column, comparisonVolumes[index]])),
          ...Object.fromEntries(variationColumns.map((column, index) => [column, variation(currentVolume, comparisonVolumes[index])])),
        };
      });
    }
    setResult({
      columns,
      rows,
      periodLabel: `${monthLabel(mainMonth)} comparado a ${compareMonths.map(monthLabel).join(", ")}`,
      selectedCount: selected.length,
      status: status === "Todos" ? "Todos os status" : status,
    });
    setError("");
    setFilterOpen(false);
  }

  async function exportReport() {
    if (!result) return;
    try {
      await downloadXlsx(`crescimento-${mode}.xlsx`, "Crescimento", result.columns, result.rows.map((row) => result.columns.map((column) => row[column] ?? "")));
      setError("");
    } catch (cause) {
      console.error("Falha ao exportar relatório de crescimento.", cause);
      setError("Não foi possível exportar o relatório. Tente novamente.");
    }
  }

  const title = mode === "customers" ? "Crescimento de Clientes" : "Crescimento de Produtos";
  const subtitle = mode === "customers" ? "Compare o peso de cada cliente entre dois meses." : "Compare o volume vendido de cada produto entre dois meses.";
  const allVisibleIncluded = !selectionApplied || visibleCandidates.length > 0 && visibleCandidates.every((item) => selectedIds.includes(item.id));

  return <div className="page-content module-content growth-report-page">
    <section className="panel growth-report-heading"><div><p className="eyebrow">ANÁLISES COMERCIAIS</p><h1><TrendingUp size={19} /> {title}</h1><p>{subtitle}</p></div><button className="button button-primary" onClick={() => { setFilterOpen(true); setError(""); }}><Filter size={14} /> Filtros</button></section>
    <section className="panel growth-report-results">
      <div className="growth-report-toolbar"><span>{result ? `${result.status} · ${result.selectedCount} ${mode === "customers" ? "cliente(s)" : "produto(s)"} exibido(s)` : "Defina os meses e os filtros para exibir os resultados."}</span><button className="button button-outline" disabled={!result} onClick={() => void exportReport()}><Download size={14} /> Exportar exibidos</button></div>
      {result && <div className="table-wrap growth-report-table-wrap"><table><thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{result.rows.map((row, index) => <tr key={`${String(row.Código ?? row["Cliente - Cidade"] ?? index)}-${index}`}>{result.columns.map((column) => {
        const value = row[column];
        const isVariation = column.startsWith("Variação");
        const rendered = typeof value === "number" ? isVariation ? percent(value) : number(value) : value;
        return <td key={column} className={column === result.columns[0] ? "growth-report-first-cell" : isVariation ? typeof value === "number" && value >= 0 ? "growth-positive" : "growth-negative" : ""}>{rendered}</td>;
      })}</tr>)}</tbody></table>{!result.rows.length && <div className="report-empty">Nenhum item corresponde aos filtros selecionados.</div>}</div>}
      {!result && <div className="growth-report-empty"><TrendingUp size={22} /><span>Os resultados da comparação aparecerão aqui.</span></div>}
    </section>
    <nav className="growth-report-tabs" aria-label="Análises de crescimento"><a className={mode === "customers" ? "active" : ""} href="/crescimento/clientes">Crescimento de Clientes</a><a className={mode === "products" ? "active" : ""} href="/crescimento/produtos">Crescimento de Produtos</a><a href="/relatorios">Relatórios Gerais</a></nav>
    {filterOpen && <div className="modal-backdrop growth-filter-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFilterOpen(false); }}>
      <section className="customer-modal growth-filter-modal" role="dialog" aria-modal="true" aria-labelledby="growth-filter-title">
        <div className="growth-filter-heading"><div><h2 id="growth-filter-title">Comparar meses</h2><p>Escolha os períodos e os {mode === "customers" ? "clientes" : "produtos"} do relatório.</p></div><button type="button" className="icon-button" aria-label="Fechar" onClick={() => setFilterOpen(false)}><X size={16} /></button></div>
        <div className="growth-filter-content">
          <div className="growth-filter-months growth-filter-months-multiple">
            <label><span>Mês principal</span><input type="month" value={mainMonth} onChange={(event) => setMainMonth(event.target.value)} /></label>
            {compareMonths.map((month, index) => <label className="growth-comparison-month" key={`comparison-${index}`}><span>Comparar com</span><div><input type="month" value={month} onChange={(event) => updateCompareMonth(index, event.target.value)} /><button type="button" aria-label={`Remover mês ${monthLabel(month)}`} title="Remover mês" disabled={compareMonths.length <= 1} onClick={() => removeCompareMonth(index)}><Trash2 size={15} /></button></div></label>)}
            <button type="button" className="growth-add-month" onClick={addCompareMonth}><Plus size={14} /> Acrescentar mês</button>
          </div>
          <label className="growth-filter-status"><span>{mode === "customers" ? "Status dos clientes" : "Status dos produtos"}</span><select value={status} onChange={(event) => { setStatus(event.target.value); setSelectedIds([]); setSelectionApplied(false); setVisibleLimit(50); }}><option value="Ativo">Ativos</option><option value="Inativo">Inativos</option>{mode === "customers" && <option value="Prospect">Prospects</option>}<option value="Todos">Todos</option></select></label>
          <section className="growth-item-picker"><div className="growth-item-picker-heading"><strong>{mode === "customers" ? "Clientes" : "Produtos"}</strong><small>{includedCount.toLocaleString("pt-BR")} de {candidates.length.toLocaleString("pt-BR")} incluído(s)</small><button type="button" onClick={includeAll}>Incluir todos</button></div><div className="search-field"><Search size={14} /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleLimit(50); }} placeholder={mode === "customers" ? "Pesquisar nome ou código..." : "Pesquisar produto ou código..."} /></div><label className="growth-select-all"><input type="checkbox" checked={allVisibleIncluded} onChange={toggleVisible} /> Selecionar todos de status escolhido</label><div className="growth-item-list">{visibleCandidates.map((item) => {
            const name = mode === "customers" ? (item as Customer).name : (item as Product).description;
            const code = mode === "customers" ? (item as Customer).code : (item as Product).codeBox;
            const detail = mode === "customers" ? [(item as Customer).city, (item as Customer).status].filter(Boolean).join(" · ") : `${(item as Product).codeHalfBox ? `Meia caixa: ${(item as Product).codeHalfBox} · ` : ""}${(item as Product).measure ?? "KG"}`;
            return <label key={item.id}><input type="checkbox" checked={isIncluded(item.id)} onChange={() => toggleItem(item.id)} /><span><strong>{name}</strong><small>{code} · {detail}</small></span></label>;
          })}{!visibleCandidates.length && <div className="growth-item-empty">Nenhum resultado encontrado.</div>}</div>{filteredCandidates.length > visibleCandidates.length && <button type="button" className="growth-load-more" onClick={() => setVisibleLimit((limit) => limit + 50)}>Carregar mais {mode === "customers" ? "clientes" : "produtos"}</button>}<p className="growth-picker-help">Todos os itens do status escolhido estão incluídos. Desmarque itens para selecionar individualmente.</p></section>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <div className="growth-filter-footer"><button className="button button-outline" onClick={() => setFilterOpen(false)}>Cancelar</button><button className="button button-primary" onClick={generateReport}>Exibir relatório</button></div>
      </section>
    </div>}
  </div>;
}
