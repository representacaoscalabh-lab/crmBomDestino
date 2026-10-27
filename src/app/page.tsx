"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Box,
  CalendarDays,
  CircleHelp,
  ShoppingCart,
  UsersRound,
} from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { getExternalCustomerIds } from "@/lib/dashboard-scope";
import { useDashboardRecords } from "@/lib/use-dashboard-records";
import type { Order } from "@/lib/types";
import { DashboardCommission } from "@/components/dashboard-commission";
import "./dashboard.css";

const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const compactNumber = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactCurrency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const monthName = (date: Date) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
const chartColors = ["#722f37", "#a6535d", "#c77c83", "#d9a3a8", "#8a6670", "#ad8f76", "#71869a", "#9eabb8"];
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

type ChartEntry = { id: string; label: string; value: number };
type GrowthChartEntry = ChartEntry & { previousValue: number; growth: number };

function comparisonLabel(current: number, previous: number) {
  if (previous === 0) return current > 0 ? "Novo período" : "Sem variação";
  const percent = (current - previous) / previous * 100;
  const Icon = percent > 0 ? ArrowUpRight : percent < 0 ? ArrowDownRight : null;
  return <span className={`dashboard-comparison-delta ${percent > 0 ? "positive" : percent < 0 ? "negative" : ""}`}>{Icon && <Icon size={13} />}{percent > 0 ? "+" : ""}{percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. período anterior</span>;
}

function donutSlicePath(startPercent: number, endPercent: number) {
  if (endPercent - startPercent > 99.999) return "M 100 22 A 78 78 0 1 1 100 178 A 78 78 0 1 1 100 22 M 100 62 A 38 38 0 1 0 100 138 A 38 38 0 1 0 100 62 Z";
  const startAngle = startPercent * 3.6 - 90;
  const endAngle = endPercent * 3.6 - 90;
  const point = (angle: number, radius: number) => {
    const radians = angle * Math.PI / 180;
    return { x: 100 + Math.cos(radians) * radius, y: 100 + Math.sin(radians) * radius };
  };
  const outerStart = point(startAngle, 78);
  const outerEnd = point(endAngle, 78);
  const innerEnd = point(endAngle, 38);
  const innerStart = point(startAngle, 38);
  const largeArc = endPercent - startPercent > 50 ? 1 : 0;
  return `M ${outerStart.x} ${outerStart.y} A 78 78 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A 38 38 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
}

function DashboardPie({ items, emptyTitle, emptyDescription }: { items: ChartEntry[]; emptyTitle: string; emptyDescription: string }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!items.length || total <= 0) {
    return <div className="chart-empty"><span><CircleHelp size={19} /></span><strong>{emptyTitle}</strong><p>{emptyDescription}</p></div>;
  }

  const slices = items.reduce<{ offset: number; entries: { item: ChartEntry; start: number; end: number; color: string }[] }>((result, item, index) => {
    const nextOffset = result.offset + item.value / total * 100;
    return {
      offset: nextOffset,
      entries: [...result.entries, { item, start: result.offset, end: nextOffset, color: chartColors[index % chartColors.length] }],
    };
  }, { offset: 0, entries: [] }).entries;
  const hoveredItem = items.find((item) => item.id === hovered);

  return (
    <div className="dashboard-pie-content">
      <div className="dashboard-donut-wrap">
        <svg className="dashboard-donut" viewBox="0 0 200 200" role="img" aria-label={`Distribuição de peso: ${items.map((item) => `${item.label}, ${number.format(item.value)} kg`).join("; ")}`}>
          {slices.map(({ item, start, end, color }) => <path
            key={item.id}
            d={donutSlicePath(start, end)}
            fill={color}
            tabIndex={0}
            aria-label={`${item.label}: ${number.format(item.value)} kg`}
            onMouseEnter={() => setHovered(item.id)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(item.id)}
            onBlur={() => setHovered(null)}
          />)}
        </svg>
        <div className="dashboard-donut-center"><strong title={`${number.format(total)} kg`}>{compactNumber.format(total)}</strong><small>kg no período</small></div>
        {hoveredItem && <div className="dashboard-pie-tooltip" role="status"><strong>{hoveredItem.label}</strong><span>{number.format(hoveredItem.value)} kg</span></div>}
      </div>
      <div className="dashboard-chart-legend">
        {items.map((item, index) => <div className="dashboard-legend-row" key={item.id} title={`${item.label}: ${number.format(item.value)} kg`} onMouseEnter={() => setHovered(item.id)} onMouseLeave={() => setHovered(null)}>
          <span className="dashboard-legend-label"><i style={{ background: chartColors[index % chartColors.length] }} />{item.label}</span>
          <strong>{number.format(item.value)} kg</strong>
          <small>{(item.value / total * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</small>
        </div>)}
      </div>
    </div>
  );
}

function DashboardRevenueTrend({ items, selectedMonth }: { items: { id: string; label: string; value: number; weight: number }[]; selectedMonth: number }) {
  const maximum = Math.max(...items.map(item => item.value), 0);
  if (!items.length || maximum <= 0 && items.every(item => item.weight <= 0)) return <div className="chart-empty"><span><CircleHelp size={19} /></span><strong>Sem vendas registradas neste ano</strong><p>Faturamento e peso aparecerão após o registro dos pedidos.</p></div>;
  return <div className="dashboard-revenue-chart" role="group" aria-label={`Faturamento e peso mensais de ${items.map(item => `${item.label}: ${currency.format(item.value)}, ${number.format(item.weight)} kg`).join("; ")}`}>
    <div className="dashboard-revenue-axis" aria-hidden="true"><span>{compactCurrency.format(maximum)}</span><span>{compactCurrency.format(maximum / 2)}</span><span>R$ 0</span></div>
    <div className="dashboard-revenue-plot">
      <div className="dashboard-revenue-grid" aria-hidden="true"><i /><i /><i /></div>
      <div className="dashboard-revenue-bars">
        {items.map((item, index) => <div className={`dashboard-revenue-month ${index === selectedMonth ? "selected" : ""}`} key={item.id} tabIndex={0} aria-describedby={`dashboard-revenue-tooltip-${item.id}`} aria-label={`${item.label}: faturamento ${currency.format(item.value)}, peso ${number.format(item.weight)} kg`}>
          <div className="dashboard-revenue-tooltip" id={`dashboard-revenue-tooltip-${item.id}`} role="tooltip"><strong>{item.label}</strong><span>Faturamento <b>{currency.format(item.value)}</b></span><span>Peso <b>{number.format(item.weight)} kg</b></span></div>
          <div className="dashboard-revenue-track"><i style={{ height: `${maximum > 0 && item.value > 0 ? Math.max(2, item.value / maximum * 100) : 0}%` }} /></div>
          <small>{item.label}</small>
        </div>)}
      </div>
    </div>
  </div>;
}

function DashboardRanking({ items, emptyTitle, emptyDescription }: { items: ChartEntry[]; emptyTitle: string; emptyDescription: string }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(...items.map((item) => item.value), 0);
  if (!items.length || max <= 0) {
    return <div className="chart-empty"><span><CircleHelp size={19} /></span><strong>{emptyTitle}</strong><p>{emptyDescription}</p></div>;
  }

  return <div className="dashboard-ranking">
    {items.map((item, index) => <div className={`dashboard-ranking-row ${hovered === item.id ? "dashboard-ranking-row-hovered" : ""}`} key={item.id} title={`${item.label}: ${number.format(item.value)} kg`} onMouseEnter={() => setHovered(item.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(item.id)} onBlur={() => setHovered(null)} tabIndex={0}>
      <span className="dashboard-ranking-label">{index + 1}. {item.label}</span>
      <span className="dashboard-ranking-track"><i style={{ width: `${item.value / max * 100}%` }} />{hovered === item.id && <span className="dashboard-ranking-tooltip">{item.label}: {number.format(item.value)} kg</span>}</span>
      <strong>{number.format(item.value)} kg</strong>
    </div>)}
  </div>;
}

function DashboardGrowthRanking({ items, emptyTitle, emptyDescription }: { items: GrowthChartEntry[]; emptyTitle: string; emptyDescription: string }) {
  const max = Math.max(...items.map((item) => item.growth), 0);
  if (!items.length || max <= 0) {
    return <div className="chart-empty"><span><CircleHelp size={19} /></span><strong>{emptyTitle}</strong><p>{emptyDescription}</p></div>;
  }

  return <div className="dashboard-ranking dashboard-growth-ranking">
    {items.map((item, index) => <div className="dashboard-ranking-row dashboard-growth-row" key={item.id} title={`${item.label}: atual ${number.format(item.value)} kg, período anterior ${number.format(item.previousValue)} kg`}>
      <span className="dashboard-growth-customer">
        <span className="dashboard-ranking-label">{index + 1}. {item.label}</span>
        <small>Atual {number.format(item.value)} kg · Anterior {number.format(item.previousValue)} kg</small>
      </span>
      <span className="dashboard-ranking-track"><i style={{ width: `${item.growth / max * 100}%` }} /></span>
      <strong>+{number.format(item.growth)} kg</strong>
    </div>)}
  </div>;
}

export default function HomePage() {
  const { customers: allCustomers, customerGroups, products } = useCrmStore();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customStart, setCustomStart] = useState(() => {
    const now = new Date();
    return dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [customEnd, setCustomEnd] = useState(() => dateKey(new Date()));
  const [periodPreset, setPeriodPreset] = useState<"month" | "previous-month" | "year" | "custom">("month");

  const today = dateKey(new Date());
  const rangeStart = startDate || dateKey(new Date(month.getFullYear(), month.getMonth(), 1));
  const monthEnd = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const rangeEnd = endDate || (monthEnd < today ? monthEnd : today);
  const spanDays = (Date.parse(`${rangeEnd}T00:00:00Z`) - Date.parse(`${rangeStart}T00:00:00Z`)) / 86400000 + 1;
  const previousStart = startDate && endDate ? new Date(Date.parse(`${rangeStart}T00:00:00Z`) - spanDays * 86400000).toISOString().slice(0, 10) : dateKey(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const reportStart = previousStart < `${month.getFullYear()}-01-01` ? previousStart : `${month.getFullYear()}-01-01`;
  const reportEnd = rangeEnd > `${month.getFullYear()}-12-31` ? rangeEnd : `${month.getFullYear()}-12-31`;
  const orderData = useDashboardRecords<Order>("orders", reportStart, reportEnd);
  const allOrders = orderData.rows;
  const { customers, orders } = useMemo(() => {
    const excluded = getExternalCustomerIds(allCustomers, customerGroups);
    return {
      customers: allCustomers.filter((customer) => !excluded.has(customer.id)),
      orders: allOrders.filter((order) => !excluded.has(order.customerId)),
    };
  }, [allCustomers, customerGroups, allOrders]);
  const { normalOrders, previousNormalOrders, commissionOrders, monthlyChart, positiveCustomers, previousPositiveCustomers, segmentChart, cityChart, productChart, customerGrowthChart } = useMemo(() => {
    const monthStart = dateKey(new Date(month.getFullYear(), month.getMonth(), 1));
    const nextMonth = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1));
    const periodStart = startDate || monthStart;
    const [endYear, endMonthNumber, endDay] = endDate.split("-").map(Number);
    const periodEndExclusive = startDate && endDate ? dateKey(new Date(endYear, endMonthNumber - 1, endDay + 1)) : nextMonth;
    const periodDays = (Date.parse(`${periodEndExclusive}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`)) / 86400000;
    const [startYear, startMonthNumber, startDay] = periodStart.split("-").map(Number);
    const previousPeriodStart = startDate && endDate
      ? dateKey(new Date(startYear, startMonthNumber - 1, startDay - periodDays))
      : dateKey(new Date(month.getFullYear(), month.getMonth() - 1, 1));
    const inSelectedPeriod = (date: string) => date >= periodStart && date < periodEndExclusive;
    const normalOrders = orders.filter((order) => order.status === "normal" && inSelectedPeriod(order.issueDate));
    const previousNormalOrders = orders.filter((order) => order.status === "normal" && order.issueDate >= previousPeriodStart && order.issueDate < periodStart);
    const monthlyChart = Array.from({ length: 12 }, (_, index) => {
      const monthStart = dateKey(new Date(month.getFullYear(), index, 1));
      const monthEnd = dateKey(new Date(month.getFullYear(), index + 1, 1));
      const group = orders.filter((order) => order.status === "normal" && order.issueDate >= monthStart && order.issueDate < monthEnd);
      return {
        id: `${month.getFullYear()}-${index}`,
        label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(month.getFullYear(), index, 1)).replace(".", ""),
        weight: group.reduce((sum, order) => sum + order.totalWeight, 0),
        value: group.reduce((sum, order) => sum + order.totalValue, 0),
      };
    });
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const groupById = new Map(customerGroups.map((group) => [group.id, group]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const segmentWeights = new Map<string, number>();
    const cityWeights = new Map<string, number>();
    const productWeights = new Map<string, ChartEntry>();
    const currentCustomerWeights = new Map<string, ChartEntry>();
    const previousCustomerWeights = new Map<string, ChartEntry>();

    for (const order of normalOrders) {
      const customer = customerById.get(order.customerId);
      const segment = customer?.segment?.trim() || "Sem segmento";
      const city = customer?.city?.trim() || order.customerCity?.trim() || "Sem cidade";
      segmentWeights.set(segment, (segmentWeights.get(segment) ?? 0) + order.totalWeight);
      cityWeights.set(city, (cityWeights.get(city) ?? 0) + order.totalWeight);

      const network = customer?.groupId ? groupById.get(customer.groupId) : undefined;
      const customerKey = network?.id || order.customerId || order.customerName || "Cliente sem identificação";
      const customerLabel = network?.name || customer?.name || order.customerName || "Cliente sem identificação";
      const customerEntry = currentCustomerWeights.get(customerKey) ?? { id: customerKey, label: customerLabel, value: 0 };
      customerEntry.value += order.totalWeight;
      currentCustomerWeights.set(customerKey, customerEntry);

      for (const item of order.items ?? []) {
        const product = productById.get(item.productId) ?? products.find((candidate) => candidate.codeBox === item.productCode || candidate.codeHalfBox === item.productCode);
        const productKey = product?.id || item.productCode || item.description;
        const productEntry = productWeights.get(productKey) ?? { id: productKey, label: product?.description || item.description || item.productCode || "Produto sem identificação", value: 0 };
        productEntry.value += item.grossWeight ?? item.totalWeight;
        productWeights.set(productKey, productEntry);
      }
    }
    for (const order of previousNormalOrders) {
      const customer = customerById.get(order.customerId);
      const network = customer?.groupId ? groupById.get(customer.groupId) : undefined;
      const customerKey = network?.id || order.customerId || order.customerName || "Cliente sem identificação";
      const customerLabel = network?.name || customer?.name || order.customerName || "Cliente sem identificação";
      const customerEntry = previousCustomerWeights.get(customerKey) ?? { id: customerKey, label: customerLabel, value: 0 };
      customerEntry.value += order.totalWeight;
      previousCustomerWeights.set(customerKey, customerEntry);
    }
    const topEntries = (map: Map<string, number> | Map<string, ChartEntry>, limit: number): ChartEntry[] => [...map].map(([id, entry]) => typeof entry === "number" ? { id, label: id, value: entry } : entry).filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, limit);
    const customerGrowthChart = [...currentCustomerWeights.values()]
      .map((item) => {
        const previousValue = previousCustomerWeights.get(item.id)?.value ?? 0;
        return { ...item, previousValue, growth: item.value - previousValue };
      })
      .filter((item) => item.previousValue > 0 && item.growth > 0)
      .sort((a, b) => b.growth - a.growth || a.label.localeCompare(b.label, "pt-BR"))
      .slice(0, 5);
    return {
      normalOrders,
      previousNormalOrders,
      commissionOrders: allOrders.filter(order => order.status === "normal" && inSelectedPeriod(order.issueDate)),
      monthlyChart,
      positiveCustomers: new Set(normalOrders.map((order) => order.customerId).filter(Boolean)).size,
      previousPositiveCustomers: new Set(previousNormalOrders.map((order) => order.customerId).filter(Boolean)).size,
      segmentChart: topEntries(segmentWeights, 8),
      cityChart: topEntries(cityWeights, 8),
      productChart: topEntries(productWeights, 6),
      customerGrowthChart,
    };
  }, [customers, customerGroups, products, orders, allOrders, month, startDate, endDate]);

  const monthWeight = normalOrders.reduce((sum, order) => sum + order.totalWeight, 0);
  const monthOrderValue = normalOrders.reduce((sum, order) => sum + order.totalValue, 0);
  const previousWeight = previousNormalOrders.reduce((sum, order) => sum + order.totalWeight, 0);
  const previousOrderValue = previousNormalOrders.reduce((sum, order) => sum + order.totalValue, 0);
  const previousOrderCount = previousNormalOrders.reduce((sum, order) => sum + (order.recordCount ?? 1), 0);
  const orderCount = normalOrders.reduce((sum, order) => sum + (order.recordCount ?? 1), 0);
  const periodLabel = startDate && endDate ? `${startDate.split("-").reverse().join("/")} – ${endDate.split("-").reverse().join("/")}` : monthName(month);
  const cards = [
    { title: "Valor dos pedidos", value: currency.format(monthOrderValue), comparison: comparisonLabel(monthOrderValue, previousOrderValue), previous: currency.format(previousOrderValue), icon: ShoppingCart },
    { title: "Peso vendido", value: `${number.format(monthWeight)} kg`, comparison: comparisonLabel(monthWeight, previousWeight), previous: `${number.format(previousWeight)} kg`, icon: Box },
    { title: "Pedidos", value: `${orderCount}`, comparison: comparisonLabel(orderCount, previousOrderCount), previous: `${previousOrderCount} no período anterior`, icon: ShoppingCart },
    { title: "Clientes com compra", value: `${positiveCustomers}`, comparison: comparisonLabel(positiveCustomers, previousPositiveCustomers), previous: `${previousPositiveCustomers} no período anterior`, icon: UsersRound },
  ];

  function choosePeriod(preset: Exclude<typeof periodPreset, "custom">) {
    const now = new Date();
    const currentStart = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));
    const previousStart = dateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const previousEnd = dateKey(new Date(now.getFullYear(), now.getMonth(), 0));
    const start = preset === "month" ? currentStart : preset === "previous-month" ? previousStart : `${now.getFullYear()}-01-01`;
    const end = preset === "previous-month" ? previousEnd : today;
    setStartDate(start);
    setEndDate(end);
    setCustomStart(start);
    setCustomEnd(end);
    setPeriodPreset(preset);
    const anchor = preset === "year" ? now : new Date(`${start}T00:00:00`);
    setMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  }

  function applyPeriod() {
    if (!customStart || !customEnd || customStart > customEnd) return;
    setStartDate(customStart);
    setEndDate(customEnd);
    setPeriodPreset("custom");
    const [year, selectedMonth] = customStart.split("-").map(Number);
    setMonth(new Date(year, selectedMonth - 1, 1));
  }

  function clearPeriod() {
    choosePeriod("month");
  }

  if (orderData.error) return <div className="page-content"><section className="panel page-empty" role="alert"><strong>Não foi possível carregar a dashboard</strong><p>{orderData.error}</p></section></div>;
  if (orderData.loading) return <div className="page-content"><section className="panel page-empty" role="status">Carregando indicadores do período...</section></div>;
  return (
    <div className="page-content dashboard-page dashboard-redesign">
      <header className="dash-heading dashboard-titlebar">
        <div className="dash-title-group">
          <span className="dash-title-icon"><BarChart3 size={22} /></span>
          <div><span className="dash-scope">BOM DESTINO · GESTÃO COMERCIAL</span><h1>Dashboard</h1><p>Uma leitura clara das vendas e da carteira no período selecionado.</p></div>
        </div>
        <Link href="/relatorios/mart-minas" className="dash-report-link">Relatório Mart Minas <ArrowRight size={16} /></Link>
      </header>
      <section className="dashboard-filter-card" aria-label="Filtros da dashboard">
        <div className="dashboard-filter-top">
          <div><span className="dashboard-filter-icon"><CalendarDays size={17} /></span><div><h2>Período de análise</h2><p>Escolha um intervalo para atualizar os indicadores.</p></div></div>
          <span className="dashboard-active-period">{periodLabel}</span>
        </div>
        <div className="dashboard-filter-content">
          <div className="dashboard-period-presets" role="group" aria-label="Períodos rápidos">
            <button type="button" aria-pressed={periodPreset === "month"} onClick={() => choosePeriod("month")}>Mês atual</button>
            <button type="button" aria-pressed={periodPreset === "previous-month"} onClick={() => choosePeriod("previous-month")}>Mês anterior</button>
            <button type="button" aria-pressed={periodPreset === "year"} onClick={() => choosePeriod("year")}>Ano atual</button>
          </div>
          <div className="dashboard-date-range">
            <label>De<input aria-label="Data inicial do período" type="date" max={today} value={customStart || rangeStart} onChange={event => { setCustomStart(event.target.value); setPeriodPreset("custom"); }} /></label>
            <span aria-hidden="true">até</span>
            <label>Até<input aria-label="Data final do período" type="date" min={customStart || undefined} max={today} value={customEnd || rangeEnd} onChange={event => { setCustomEnd(event.target.value); setPeriodPreset("custom"); }} /></label>
            <button type="button" className="button button-primary" disabled={!customStart || !customEnd || customStart > customEnd || customEnd > today} onClick={applyPeriod}>Aplicar período</button>
            {periodPreset === "custom" && <button type="button" className="button button-outline dashboard-reset-period" onClick={clearPeriod}>Limpar</button>}
          </div>
        </div>
      </section>
      <section className="dashboard-performance" aria-labelledby="dashboard-performance-title">
        <div className="dashboard-section-heading"><div><span className="dash-scope">VISÃO GERAL</span><h2 id="dashboard-performance-title">Resultados do período</h2></div><span>Comparação com o intervalo anterior</span></div>
        <div className="dashboard-metrics" aria-label="Indicadores de vendas">
          {cards.map(({ title, value, comparison, previous, icon: Icon }) => <article className="metric-card" key={title}><div className="metric-card-top"><span>{title}</span><span className="metric-icon"><Icon size={18} /></span></div><strong>{value}</strong><div className="metric-card-comparison">{comparison}</div><small>Anterior: {previous}</small></article>)}
        </div>
      </section>
      <section className="dashboard-overview-grid" aria-label="Faturamento anual e resumo Mart Minas">
        <article className="panel dashboard-revenue-panel">
          <div className="chart-heading"><div><span className="dash-scope">EVOLUÇÃO ANUAL</span><h2>Faturamento por mês</h2><p>Total do ano: <strong>{currency.format(monthlyChart.reduce((sum, item) => sum + item.value, 0))}</strong></p></div><span className="dash-chart-unit">{month.getFullYear()}</span></div>
          <DashboardRevenueTrend items={monthlyChart} selectedMonth={month.getMonth()} />
        </article>
        <DashboardCommission customers={allCustomers} groups={customerGroups} orders={commissionOrders} />
      </section>
      <section className="dashboard-insights" aria-labelledby="dashboard-insights-title">
        <div className="dashboard-section-heading"><div><span className="dash-scope">DETALHAMENTO</span><h2 id="dashboard-insights-title">O que está por trás dos resultados</h2></div></div>
        <div className="dashboard-insight-grid">
          <article className="panel chart-panel"><div className="chart-heading"><div><h2>Produtos mais vendidos</h2><p>Classificados pelo peso no período</p></div><span className="dash-chart-unit">kg</span></div><DashboardRanking items={productChart} emptyTitle="Sem produtos vendidos no período" emptyDescription="Os produtos aparecerão após o registro de pedidos." /></article>
          <article className="panel chart-panel"><div className="chart-heading"><div><h2>Clientes em crescimento</h2><p>Comparação com o período anterior</p></div><span className="dash-chart-unit">kg</span></div><DashboardGrowthRanking items={customerGrowthChart} emptyTitle="Sem crescimento para destacar" emptyDescription="É necessário haver compras nos dois períodos para comparar." /></article>
          <article className="panel chart-panel"><div className="chart-heading"><div><h2>Peso por cidade</h2><p>Distribuição das vendas no período</p></div></div><DashboardPie items={cityChart} emptyTitle="Sem dados de cidade" emptyDescription="Cadastre as cidades dos clientes para visualizar a distribuição." /></article>
          <article className="panel chart-panel"><div className="chart-heading"><div><h2>Peso por segmento</h2><p>Distribuição das vendas no período</p></div></div><DashboardPie items={segmentChart} emptyTitle="Sem dados de segmento" emptyDescription="Cadastre segmentos nos clientes para visualizar a distribuição." /></article>
        </div>
      </section>
    </div>
  );
}
