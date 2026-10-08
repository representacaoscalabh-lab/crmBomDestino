"use client";

import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, Download, Filter, Search, X } from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { downloadXlsx } from "@/lib/xlsx";
import type { Customer, Order, Product } from "@/lib/types";

type ReportId =
  | "clients-no-purchase"
  | "preferred-day"
  | "purchase-frequency"
  | "client-list"
  | "clients-by-segment"
  | "weight-by-client"
  | "weight-by-segment"
  | "customer-positivity"
  | "product-positivity"
  | "customer-growth";

type ReportRow = Record<string, string | number>;

const reports: { id: ReportId; title: string; description: string }[] = [
  { id: "clients-no-purchase", title: "Clientes Sem Compra", description: "Clientes sem pedidos no período selecionado." },
  { id: "preferred-day", title: "Dia preferido de compra", description: "Dia da semana com mais pedidos por cliente." },
  { id: "purchase-frequency", title: "Frequência de Compra", description: "Intervalo médio entre compras por cliente." },
  { id: "client-list", title: "Lista de Clientes", description: "Cadastros de clientes com filtros de status e segmento." },
  { id: "clients-by-segment", title: "Lista de Clientes por Segmento", description: "Clientes agrupados por segmento comercial." },
  { id: "weight-by-client", title: "Peso por Cliente", description: "Peso líquido e bruto comprado por cliente." },
  { id: "weight-by-segment", title: "Peso por Segmento", description: "Peso comercial consolidado por segmento." },
  { id: "customer-positivity", title: "Positivação de Clientes", description: "Clientes compradores e percentual de positivação." },
  { id: "product-positivity", title: "Positivação de Produtos", description: "Produtos vendidos, clientes compradores e volumes." },
];

const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const monthInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const twelveMonthsAgo = (date: Date) => new Date(date.getFullYear(), date.getMonth() - 11, 1);
const dateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthBounds = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  const start = `${value}-01`;
  const end = new Date(year, month, 0).getDate();
  return { start, end: `${value}-${String(end).padStart(2, "0")}` };
};
const monthLabel = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
};
const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const percent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
function customerMatchesOrder(customer: Customer, order: Order) {
  return order.customerId === customer.id ||
    (!order.customerId && order.customerCode.toLowerCase() === customer.code.toLowerCase() && order.store === customer.store);
}

function ordersForCustomer(orders: Order[], customer: Customer) {
  return orders.filter((order) => customerMatchesOrder(customer, order));
}

function itemWeight(item: Order["items"][number], field: "net" | "gross") {
  return field === "net" ? item.netWeight ?? 0 : item.grossWeight ?? item.totalWeight;
}

function productForItem(item: Order["items"][number], products: Product[]) {
  return products.find((product) => product.id === item.productId) ??
    products.find((product) => product.codeBox === item.productCode || product.codeHalfBox === item.productCode);
}

function buildReportRows(
  id: ReportId,
  customers: Customer[],
  products: Product[],
  orders: Order[],
  start: string,
  end: string,
  mainMonth: string,
  compareMonth: string,
) {
  const periodOrders = orders.filter((order) =>
    order.status === "normal" &&
    order.issueDate >= start &&
    order.issueDate <= end &&
    customers.some((customer) => customerMatchesOrder(customer, order)),
  );
  const columns: string[] = [];
  let rows: ReportRow[] = [];

  if (id === "customer-growth") {
    const main = monthBounds(mainMonth);
    const compare = monthBounds(compareMonth);
    columns.push("Cliente", "Cidade", `${monthLabel(mainMonth)} (kg)`, `${monthLabel(compareMonth)} (kg)`, "Variação (%)");
    rows = customers.map((customer) => {
      const forCustomer = ordersForCustomer(orders, customer).filter((order) => order.status === "normal");
      const mainWeight = forCustomer.filter((order) => order.issueDate >= main.start && order.issueDate <= main.end).reduce((sum, order) => sum + order.totalWeight, 0);
      const compareWeight = forCustomer.filter((order) => order.issueDate >= compare.start && order.issueDate <= compare.end).reduce((sum, order) => sum + order.totalWeight, 0);
      const variation = compareWeight === 0 ? mainWeight === 0 ? 0 : 100 : ((mainWeight - compareWeight) / compareWeight) * 100;
      return { Cliente: `${customer.name} — ${customer.code}`, Cidade: customer.city || "—", [columns[2]]: mainWeight, [columns[3]]: compareWeight, "Variação (%)": variation };
    });
  } else if (id === "clients-no-purchase") {
    columns.push("Código", "Cliente", "Loja", "Cidade", "Segmento", "Última compra", "Status");
    rows = customers.filter((customer) => !ordersForCustomer(periodOrders, customer).length).map((customer) => ({
      Código: customer.code, Cliente: customer.name, Loja: customer.store || "—", Cidade: customer.city || "—",
      Segmento: customer.segment || "—", "Última compra": customer.lastPurchase || "—", Status: customer.status,
    }));
  } else if (id === "preferred-day") {
    columns.push("Código", "Cliente", "Dia preferido", "Pedidos no dia", "Total de pedidos", "Percentual");
    rows = customers.map((customer) => {
      const counts = Array(7).fill(0) as number[];
      ordersForCustomer(periodOrders, customer).forEach((order) => {
        const day = new Date(`${order.issueDate}T12:00:00`).getDay();
        counts[day] += 1;
      });
      const max = Math.max(...counts);
      const total = counts.reduce((sum, count) => sum + count, 0);
      const preferredDay = max ? ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][counts.indexOf(max)] : "Sem compras";
      return { Código: customer.code, Cliente: customer.name, "Dia preferido": preferredDay, "Pedidos no dia": max, "Total de pedidos": total, Percentual: total ? (max / total) * 100 : 0 };
    }).filter((row) => row["Total de pedidos"] > 0);
  } else if (id === "purchase-frequency") {
    columns.push("Código", "Cliente", "Compras", "Intervalo médio (dias)", "Última compra");
    rows = customers.map((customer) => {
      const dates = ordersForCustomer(periodOrders, customer).map((order) => order.issueDate).sort();
      const intervals = dates.slice(1).map((date, index) => (new Date(`${date}T12:00:00`).getTime() - new Date(`${dates[index]}T12:00:00`).getTime()) / 86400000);
      return { Código: customer.code, Cliente: customer.name, Compras: dates.length, "Intervalo médio (dias)": intervals.length ? intervals.reduce((sum, days) => sum + days, 0) / intervals.length : 0, "Última compra": dates.at(-1) ?? "—" };
    }).filter((row) => row.Compras > 0);
  } else if (id === "client-list") {
    columns.push("Código", "Cliente", "CNPJ", "Loja", "Cidade", "UF", "Segmento", "Status");
    rows = customers.map((customer) => ({ Código: customer.code, Cliente: customer.name, CNPJ: customer.document || "—", Loja: customer.store || "—", Cidade: customer.city || "—", UF: customer.state || "—", Segmento: customer.segment || "—", Status: customer.status }));
  } else if (id === "clients-by-segment") {
    columns.push("Segmento", "Código", "Cliente", "Loja", "Cidade", "Status");
    rows = customers.map((customer) => ({ Segmento: customer.segment || "Sem segmento", Código: customer.code, Cliente: customer.name, Loja: customer.store || "—", Cidade: customer.city || "—", Status: customer.status })).sort((a, b) => String(a.Segmento).localeCompare(String(b.Segmento), "pt-BR"));
  } else if (id === "weight-by-client") {
    columns.push("Código", "Cliente", "Cidade", "Pedidos", "Peso líquido (kg)", "Peso bruto (kg)");
    rows = customers.map((customer) => {
      const customerOrders = ordersForCustomer(periodOrders, customer);
      const totals = customerOrders.flatMap((order) => order.items).reduce((sum, item) => ({ net: sum.net + itemWeight(item, "net"), gross: sum.gross + itemWeight(item, "gross") }), { net: 0, gross: 0 });
      return { Código: customer.code, Cliente: customer.name, Cidade: customer.city || "—", Pedidos: customerOrders.length, "Peso líquido (kg)": totals.net, "Peso bruto (kg)": totals.gross };
    }).filter((row) => row.Pedidos > 0);
  } else if (id === "weight-by-segment") {
    columns.push("Segmento", "Clientes compradores", "Pedidos", "Peso líquido (kg)", "Peso bruto (kg)");
    const groups = new Map<string, { clients: Set<string>; orders: number; net: number; gross: number }>();
    customers.forEach((customer) => {
      const customerOrders = ordersForCustomer(periodOrders, customer);
      if (!customerOrders.length) return;
      const key = customer.segment || "Sem segmento";
      const group = groups.get(key) ?? { clients: new Set<string>(), orders: 0, net: 0, gross: 0 };
      group.clients.add(customer.id);
      group.orders += customerOrders.length;
      customerOrders.flatMap((order) => order.items).forEach((item) => {
        group.net += itemWeight(item, "net");
        group.gross += itemWeight(item, "gross");
      });
      groups.set(key, group);
    });
    rows = [...groups].map(([segment, value]) => ({ Segmento: segment, "Clientes compradores": value.clients.size, Pedidos: value.orders, "Peso líquido (kg)": value.net, "Peso bruto (kg)": value.gross }));
  } else if (id === "customer-positivity") {
    const buyers = new Set(periodOrders.flatMap((order) => customers.filter((customer) => customerMatchesOrder(customer, order)).map((customer) => customer.id)));
    const positive = customers.filter((customer) => buyers.has(customer.id));
    const inactive = customers.filter((customer) => !buyers.has(customer.id));
    columns.push("Indicador", "Quantidade", "Percentual");
    rows = [
      { Indicador: "Clientes positivados", Quantidade: positive.length, Percentual: customers.length ? positive.length / customers.length * 100 : 0 },
      { Indicador: "Clientes sem compra", Quantidade: inactive.length, Percentual: customers.length ? inactive.length / customers.length * 100 : 0 },
      { Indicador: "Total de clientes", Quantidade: customers.length, Percentual: customers.length ? 100 : 0 },
    ];
  } else {
    columns.push("Código", "Produto", "Clientes compradores", "Caixas", "Unidades", "Peso bruto (kg)", "Faturamento (R$)");
    const productGroups = new Map<string, { product: Product | undefined; buyers: Set<string>; boxes: number; units: number; weight: number; sales: number }>();
    periodOrders.forEach((order) => order.items.forEach((item) => {
      const product = productForItem(item, products);
      const key = product?.id ?? item.productCode;
      const value = productGroups.get(key) ?? { product, buyers: new Set<string>(), boxes: 0, units: 0, weight: 0, sales: 0 };
      const matchedCustomer = customers.find((customer) => customerMatchesOrder(customer, order));
      if (matchedCustomer) value.buyers.add(matchedCustomer.id);
      value.boxes += item.boxQuantity ?? item.packageQuantity;
      value.units += item.unitQuantity;
      value.weight += itemWeight(item, "gross");
      value.sales += item.subtotal ?? item.packagePrice * item.packageQuantity;
      productGroups.set(key, value);
    }));
    rows = [...productGroups].map(([code, value]) => ({ Código: value.product?.codeBox || code, Produto: value.product?.description || [...periodOrders].flatMap((order) => order.items).find((item) => item.productCode === code)?.description || "Produto sem descrição", "Clientes compradores": value.buyers.size, Caixas: value.boxes, Unidades: value.units, "Peso bruto (kg)": value.weight, "Faturamento (R$)": value.sales }));
  }
  return { columns, rows };
}

export function ReportCenter({ initialReport }: { initialReport?: ReportId }) {
  const { customers, products, orders } = useCrmStore();
  const now = new Date();
  const [activeReport, setActiveReport] = useState<ReportId | null>(initialReport ?? null);
  const [selectorOpen, setSelectorOpen] = useState(!initialReport);
  const [result, setResult] = useState<{ report: ReportId; columns: string[]; rows: ReportRow[]; periodLabel: string; customerCount: number; orderCount: number; filterSummary: string } | null>(null);
  const [startDate, setStartDate] = useState(() => dateInput(twelveMonthsAgo(now)));
  const [endDate, setEndDate] = useState(localToday());
  const [mainMonth, setMainMonth] = useState(monthInput(now));
  const [compareMonth, setCompareMonth] = useState(() => monthInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
  const [clientStatus, setClientStatus] = useState("Ativo");
  const [segment, setSegment] = useState("Todos");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [customerSelectionApplied, setCustomerSelectionApplied] = useState(false);
  const [resultSearch, setResultSearch] = useState("");
  const [exportError, setExportError] = useState("");

  const segments = useMemo(() => [...new Set(customers.map((customer) => customer.segment).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "pt-BR")), [customers]);
  const eligibleCustomers = useMemo(() => customers.filter((customer) =>
    (clientStatus === "Todos" || customer.status === clientStatus) &&
    (segment === "Todos" || customer.segment === segment),
  ), [customers, clientStatus, segment]);
  const visibleCustomers = useMemo(() => eligibleCustomers.filter((customer) =>
    `${customer.name} ${customer.code} ${customer.store} ${customer.city}`.toLowerCase().includes(customerQuery.toLowerCase()),
  ), [eligibleCustomers, customerQuery]);

  function selectReport(id: ReportId) {
    const currentMonth = monthInput(now);
    const previousMonth = monthInput(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const initialStart = dateInput(twelveMonthsAgo(now));
    const initialEnd = localToday();
    const customersInScope = customers.filter((customer) => customer.status === "Ativo");
    const usesDateRange = id !== "client-list" && id !== "clients-by-segment";
    const range = id === "customer-growth" ? monthBounds(currentMonth) : { start: initialStart, end: initialEnd };
    const generated = buildReportRows(id, customersInScope, products, orders, range.start, range.end, currentMonth, previousMonth);
    const periodLabel = id === "customer-growth"
      ? `${monthLabel(currentMonth)} comparado a ${monthLabel(previousMonth)}`
      : usesDateRange
        ? `${new Date(`${range.start}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${range.end}T12:00:00`).toLocaleDateString("pt-BR")}`
        : "Cadastro atual";
    const orderCount = orders.filter((order) =>
      usesDateRange &&
      order.status === "normal" &&
      order.issueDate >= range.start &&
      order.issueDate <= range.end &&
      customersInScope.some((customer) => customerMatchesOrder(customer, order)),
    ).length;
    setActiveReport(id);
    setSelectorOpen(false);
    setExportError("");
    setStartDate(initialStart);
    setEndDate(initialEnd);
    setMainMonth(currentMonth);
    setCompareMonth(previousMonth);
    setClientStatus("Ativo");
    setSegment("Todos");
    setCustomerQuery("");
    setSelectedCustomerIds([]);
    setCustomerSelectionApplied(false);
    setResultSearch("");
    setResult({
      report: id,
      periodLabel,
      customerCount: customersInScope.length,
      orderCount,
      filterSummary: "Ativo · Todos os segmentos",
      ...generated,
    });
  }

  function toggleReportSelector() {
    setSelectorOpen((current) => !current);
  }

  function toggleCustomer(id: string) {
    if (!customerSelectionApplied) {
      setCustomerSelectionApplied(true);
      setSelectedCustomerIds(eligibleCustomers.filter((customer) => customer.id !== id).map((customer) => customer.id));
      return;
    }
    setSelectedCustomerIds((current) => current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id]);
  }

  function toggleVisibleCustomers() {
    const visibleIds = visibleCustomers.map((customer) => customer.id);
    if (!customerSelectionApplied) {
      setCustomerSelectionApplied(true);
      setSelectedCustomerIds(eligibleCustomers.filter((customer) => !visibleIds.includes(customer.id)).map((customer) => customer.id));
      return;
    }
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedCustomerIds.includes(id));
    setSelectedCustomerIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  }

  function includeAllCustomers() {
    setCustomerSelectionApplied(false);
    setSelectedCustomerIds([]);
  }

  function setPeriodPreset(days: number | null) {
    const end = new Date();
    setEndDate(localToday());
    if (days === null) {
      const firstOrder = orders.map((order) => order.issueDate).filter(Boolean).sort()[0];
      setStartDate(firstOrder ?? "2000-01-01");
      return;
    }
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);
    setStartDate(dateInput(start));
  }

  function generateReport() {
    if (!activeReport) return;
    if (activeReport === "customer-growth" && (!mainMonth || !compareMonth)) {
      setExportError("Selecione os dois meses para comparar.");
      return;
    }
    const range = activeReport === "customer-growth" ? monthBounds(mainMonth) : { start: startDate, end: endDate };
    if (!range.start || !range.end || range.start > range.end) {
      setExportError("A data inicial precisa ser anterior à data final.");
      return;
    }
    if (activeReport === "customer-growth" && mainMonth === compareMonth) {
      setExportError("Escolha meses diferentes para comparar o crescimento.");
      return;
    }
    const customersInScope = eligibleCustomers.filter((customer) => !customerSelectionApplied || selectedCustomerIds.includes(customer.id));
    const generated = buildReportRows(activeReport, customersInScope, products, orders, range.start, range.end, mainMonth, compareMonth);
    const resultStart = activeReport === "customer-growth" ? range.start : startDate;
    const resultEnd = activeReport === "customer-growth" ? range.end : endDate;
    const appliedPeriod = activeReport === "customer-growth"
      ? `${monthLabel(mainMonth)} comparado a ${monthLabel(compareMonth)}`
      : needsDateRange
        ? `${new Date(`${startDate}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${endDate}T12:00:00`).toLocaleDateString("pt-BR")}`
        : "Cadastro atual";
    const orderCount = orders.filter((order) =>
      needsDateRange &&
      order.status === "normal" &&
      order.issueDate >= resultStart &&
      order.issueDate <= resultEnd &&
      customersInScope.some((customer) => customerMatchesOrder(customer, order)),
    ).length;
    setResult({
      report: activeReport,
      periodLabel: appliedPeriod,
      customerCount: customersInScope.length,
      orderCount,
      filterSummary: `${clientStatus} · ${segment === "Todos" ? "Todos os segmentos" : segment}`,
      ...generated,
    });
    setExportError("");
  }

  async function exportResult() {
    if (!result) return;
    try {
      await downloadXlsx(`relatorio-${result.report}.xlsx`, "Relatório", result.columns, displayedRows.map((row) => result.columns.map((column) => row[column] ?? "")));
      setExportError("");
    } catch (cause) {
      console.error("Falha ao exportar relatório.", cause);
      setExportError("Não foi possível exportar o relatório. Tente novamente.");
    }
  }

  const selectedCount = customerSelectionApplied ? selectedCustomerIds.filter((id) => eligibleCustomers.some((customer) => customer.id === id)).length : eligibleCustomers.length;
  const outputReport = reports.find((report) => report.id === result?.report);
  const reportGroups = [
    { title: "Clientes", ids: ["clients-no-purchase", "preferred-day", "purchase-frequency", "client-list", "clients-by-segment"] as ReportId[] },
    { title: "Desempenho comercial", ids: ["weight-by-client", "weight-by-segment", "customer-positivity", "product-positivity"] as ReportId[] },
  ];
  const needsDateRange = activeReport !== "client-list" && activeReport !== "clients-by-segment";
  const allVisibleSelected = !customerSelectionApplied || visibleCustomers.length > 0 && visibleCustomers.every((customer) => selectedCustomerIds.includes(customer.id));
  const displayedRows = result?.rows.filter((row) =>
    Object.values(row).join(" ").toLocaleLowerCase("pt-BR").includes(resultSearch.toLocaleLowerCase("pt-BR")),
  ) ?? [];

  return <div className="page-content module-content report-center">
    <div className="report-workspace-heading panel"><div><p className="eyebrow">RELATÓRIOS</p><h1>Análises comerciais</h1></div><div className="report-workspace-status"><span><i /> Dados do sistema</span><strong>{result?.rows.length.toLocaleString("pt-BR") ?? 0} registros</strong></div></div>
    <div className="report-workspace">
      <aside className="report-sidebar">
        <section className="panel report-navigation"><h2><BarChart3 size={15} /> Relatórios</h2><nav>{reportGroups.flatMap((group) => group.ids.map((id) => reports.find((report) => report.id === id))).filter((report): report is typeof reports[number] => Boolean(report)).map((report) => <button type="button" className={activeReport === report.id ? "report-nav-active" : ""} key={report.id} onClick={() => selectReport(report.id)}>{report.title}</button>)}</nav><button type="button" className="report-choose-another" onClick={toggleReportSelector}>Escolher relatório</button></section>
        <section className="panel report-sidebar-filters"><h2><Filter size={15} /> Filtros</h2>
          {activeReport ? <>
            {activeReport === "customer-growth" ? <div className="report-sidebar-field-grid"><label><span>Mês principal</span><input type="month" value={mainMonth} onChange={(event) => setMainMonth(event.target.value)} /></label><label><span>Comparar com</span><input type="month" value={compareMonth} onChange={(event) => setCompareMonth(event.target.value)} /></label></div>
              : needsDateRange && <div className="report-sidebar-date-fields"><label><span>Período</span><div><input aria-label="Data inicial" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /><input aria-label="Data final" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div></label><div className="report-period-presets"><button type="button" onClick={() => setPeriodPreset(7)}>Últimos 7d</button><button type="button" onClick={() => setPeriodPreset(30)}>Últimos 30d</button><button type="button" onClick={() => setPeriodPreset(90)}>Últimos 90d</button><button type="button" onClick={() => setPeriodPreset(null)}>Todo período</button></div></div>}
            <label className="report-sidebar-select"><span>Status</span><select value={clientStatus} onChange={(event) => { setClientStatus(event.target.value); setSelectedCustomerIds([]); setCustomerSelectionApplied(false); }}><option value="Ativo">Ativo</option><option value="Inativo">Inativo</option><option value="Prospect">Prospect</option><option value="Todos">Todos</option></select></label>
            <label className="report-sidebar-select"><span>Segmento</span><select value={segment} onChange={(event) => { setSegment(event.target.value); setSelectedCustomerIds([]); setCustomerSelectionApplied(false); }}><option value="Todos">Todos os segmentos</option>{segments.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="report-sidebar-search"><span>Buscar no resultado</span><div className="search-field"><Search size={14} /><input value={resultSearch} onChange={(event) => setResultSearch(event.target.value)} placeholder="Nome, produto, código..." /></div></label>
            <details className="report-customer-picker report-sidebar-customer-picker"><summary>Clientes específicos <small>{selectedCount} incluído(s)</small></summary><div className="search-field"><Search size={14} /><input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Nome, código ou cidade..." /></div><div className="report-customer-picker-actions"><label className="report-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleCustomers} /> Todos exibidos</label><button type="button" onClick={includeAllCustomers}>Incluir todos</button></div><div className="report-customer-list">{visibleCustomers.map((customer) => <label key={customer.id}><input type="checkbox" checked={!customerSelectionApplied || selectedCustomerIds.includes(customer.id)} onChange={() => toggleCustomer(customer.id)} /><span><strong>{customer.name} · {customer.city || "Cidade não informada"}</strong><small>{customer.code} · {customer.segment || "Sem segmento"}</small></span></label>)}{!visibleCustomers.length && <div className="report-customer-list-empty">Nenhum cliente encontrado.</div>}</div></details>
            {exportError && <p className="form-error" role="alert">{exportError}</p>}
            <div className="report-filter-actions"><button className="button button-primary" onClick={() => generateReport()}>Aplicar</button><button className="button button-outline" onClick={() => generateReport()}>Atualizar</button><button className="button button-outline" onClick={() => selectReport(activeReport)}>Limpar</button></div>
          </> : <p className="report-sidebar-hint">Selecione um relatório para configurar os filtros.</p>}
        </section>
      </aside>
      <main className="report-main-content">
        {activeReport && result ? <>
          <div className="report-active-filters"><span>FILTROS</span><b><CalendarDays size={12} /> {result.periodLabel}</b><b>{result.filterSummary}</b></div>
          <div className="report-summary-cards"><article><small>Total</small><strong>{result.customerCount.toLocaleString("pt-BR")}</strong></article><article><small>Total Pedidos</small><strong>{result.orderCount.toLocaleString("pt-BR")}</strong></article></div>
          <section className="panel report-results-panel">
            <div className="report-results-toolbar"><div><h2>{outputReport?.title}</h2><small>{displayedRows.length.toLocaleString("pt-BR")} resultado(s)</small></div><button className="button button-primary" onClick={() => void exportResult()}><Download size={14} /> Exportar</button></div>
            {exportError && <p className="form-error" role="alert">{exportError}</p>}
            <div className="table-wrap report-table-wrap"><table><thead><tr>{result.columns.map((column) => <th key={column}>{column.toUpperCase()}</th>)}</tr></thead><tbody>{displayedRows.map((row, index) => <tr key={`${String(row.Código ?? row.Cliente ?? row.Segmento ?? row.Indicador ?? index)}-${index}`}>{result.columns.map((column) => {
              const value = row[column];
              const isPercent = column === "Variação (%)" || column === "Percentual";
              const isWeight = column.toLowerCase().includes("(kg)");
              const rendered = typeof value === "number" ? isPercent ? percent(value) : number(value) : value;
              return <td key={column} className={column === result.columns[0] ? "report-first-cell" : ""}>{rendered}{isWeight ? " kg" : ""}</td>;
            })}</tr>)}</tbody></table>{!displayedRows.length && <div className="report-empty">{result.rows.length ? "Nenhum registro corresponde à busca." : "Nenhum registro encontrado com os filtros selecionados."}</div>}</div>
          </section>
        </> : <section className="panel report-no-selection"><BarChart3 size={30} /><h2>{activeReport ? "Configure os filtros" : "Escolha um relatório para começar"}</h2><p>{activeReport ? "Aplique os filtros para gerar e visualizar os dados." : "Selecione uma análise e aplique os filtros para visualizar os dados."}</p><button className="button button-primary" onClick={() => activeReport ? generateReport() : toggleReportSelector()}>{activeReport ? "Aplicar filtros" : "Selecionar relatório"}</button></section>}
      </main>
    </div>
    {selectorOpen && <div className="modal-backdrop report-filter-backdrop report-selector-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && activeReport) setSelectorOpen(false); }}>
      <section className="customer-modal report-selector-modal" role="dialog" aria-modal="true" aria-labelledby="report-selector-title">
        <div className="report-selector-heading"><div><h2 id="report-selector-title">Qual relatório deseja abrir?</h2><p>Selecione uma análise para visualizar os resultados.</p></div><button className="icon-button" aria-label="Fechar" onClick={() => setSelectorOpen(false)}><X size={16} /></button></div>
        <div className="report-selector-grid">{reports.map((report) => <button type="button" className="report-selector-card" key={report.id} onClick={() => selectReport(report.id)}><BarChart3 size={15} /><strong>{report.title}</strong><small>{report.description}</small></button>)}</div>
      </section>
    </div>}
  </div>;
}
