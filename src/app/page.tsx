"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  ShoppingCart,
  UsersRound,
} from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { getExternalCustomerIds } from "@/lib/dashboard-scope";
import { useDashboardRecords } from "@/lib/use-dashboard-records";
import type { Order, Bonification } from "@/lib/types";
import { DashboardCommission } from "@/components/dashboard-commission";

const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const monthName = (date: Date) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
const chartColors = ["#722f37", "#a6535d", "#c77c83", "#d9a3a8", "#8a6670", "#ad8f76", "#71869a", "#9eabb8"];
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

type ChartEntry = { id: string; label: string; value: number };
type GrowthChartEntry = ChartEntry & { previousValue: number; growth: number };

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
        <div className="dashboard-donut-center"><strong>{number.format(total)}</strong><small>kg no período</small></div>
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

function DashboardColumns({ items, emptyTitle, emptyDescription, showCustomers = false, tone = "brand" }: {
  items: { id: string; label: string; weight: number; customers?: number }[];
  emptyTitle: string;
  emptyDescription: string;
  showCustomers?: boolean;
  tone?: "brand" | "dark";
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const maxValue = Math.max(...items.map((item) => showCustomers ? item.customers ?? 0 : item.weight), 0);
  if (!items.length || maxValue <= 0) {
    return <div className="chart-empty"><span><CircleHelp size={19} /></span><strong>{emptyTitle}</strong><p>{emptyDescription}</p></div>;
  }
  const rawStep = maxValue / 4 || 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalizedStep = rawStep / magnitude;
  const step = (normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 2.5 ? 2.5 : normalizedStep <= 5 ? 5 : 10) * magnitude;
  const axisMaximum = step * 4;
  const ticks = Array.from({ length: 5 }, (_, index) => axisMaximum * (4 - index) / 4);

  return <div className={`dashboard-column-chart ${tone === "dark" ? "dashboard-column-chart-dark" : ""}`}>
    <div className="dashboard-column-axis" aria-hidden="true">{ticks.map((tick) => <span key={tick}>{number.format(tick)}</span>)}</div>
    <div className="dashboard-column-plot">
      <div className="dashboard-column-grid" aria-hidden="true">{ticks.map((tick) => <i key={tick} />)}</div>
      <div className="dashboard-column-bars">
        {items.map((item) => {
          const columnValue = showCustomers ? item.customers ?? 0 : item.weight;
          const isHovered = hovered === item.id;
          return <div className={`dashboard-column-item ${isHovered ? "dashboard-column-item-hovered" : ""}`} key={item.id} onMouseEnter={() => setHovered(item.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(item.id)} onBlur={() => setHovered(null)} tabIndex={0} aria-label={`${item.label}: ${number.format(item.weight)} kg${showCustomers ? `, ${item.customers ?? 0} clientes positivados` : ""}`}>
            {isHovered && <div className="dashboard-column-tooltip"><strong>{item.label}</strong><span>{showCustomers ? `${item.customers ?? 0} clientes` : `${number.format(item.weight)} kg`}</span>{showCustomers && <small>Positivações: {item.customers ?? 0} clientes</small>}</div>}
            <i style={{ height: `${Math.max(item.weight > 0 ? 1 : 0, columnValue / axisMaximum * 100)}%` }} />
            <small>{item.label}</small>
          </div>;
        })}
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
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const periodOptions = useRef<HTMLDetailsElement>(null);

  const rangeStart = startDate || dateKey(new Date(month.getFullYear(), month.getMonth(), 1));
  const rangeEnd = endDate || dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const spanDays = (Date.parse(`${rangeEnd}T00:00:00Z`) - Date.parse(`${rangeStart}T00:00:00Z`)) / 86400000 + 1;
  const previousStart = startDate && endDate ? new Date(Date.parse(`${rangeStart}T00:00:00Z`) - spanDays * 86400000).toISOString().slice(0, 10) : dateKey(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const reportStart = previousStart < `${month.getFullYear()}-01-01` ? previousStart : `${month.getFullYear()}-01-01`;
  const reportEnd = rangeEnd > `${month.getFullYear()}-12-31` ? rangeEnd : `${month.getFullYear()}-12-31`;
  const orderData = useDashboardRecords<Order>("orders", reportStart, reportEnd);
  const bonusData = useDashboardRecords<Bonification>("bonifications", rangeStart, rangeEnd);
  const allOrders = orderData.rows;
  const allBonifications = bonusData.rows;
  const { customers, orders, bonifications } = useMemo(() => {
    const excluded = getExternalCustomerIds(allCustomers, customerGroups);
    return {
      customers: allCustomers.filter((customer) => !excluded.has(customer.id)),
      orders: allOrders.filter((order) => !excluded.has(order.customerId)),
      bonifications: allBonifications.filter((bonus) => !excluded.has(bonus.customerId)),
    };
  }, [allCustomers, customerGroups, allOrders, allBonifications]);
  const { normalOrders, commissionOrders, yearOrders, periodBonifications, monthlyChart, positiveCustomers, segmentChart, cityChart, productChart, customerGrowthChart } = useMemo(() => {
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
    const yearStart = `${month.getFullYear()}-01-01`;
    const yearEnd = `${month.getFullYear() + 1}-01-01`;
    const inSelectedPeriod = (date: string) => date >= periodStart && date < periodEndExclusive;
    const normalOrders = orders.filter((order) => order.status === "normal" && inSelectedPeriod(order.issueDate));
    const previousNormalOrders = orders.filter((order) => order.status === "normal" && order.issueDate >= previousPeriodStart && order.issueDate < periodStart);
    const periodBonifications = bonifications.filter((bonus) => inSelectedPeriod(bonus.issueDate));
    const yearOrders = orders.filter((order) => order.status === "normal" && order.issueDate >= yearStart && order.issueDate < yearEnd);
    const monthlyChart = Array.from({ length: 12 }, (_, index) => {
      const monthStart = dateKey(new Date(month.getFullYear(), index, 1));
      const monthEnd = dateKey(new Date(month.getFullYear(), index + 1, 1));
      const group = orders.filter((order) => order.status === "normal" && order.issueDate >= monthStart && order.issueDate < monthEnd);
      return {
        id: `${month.getFullYear()}-${index}`,
        label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(month.getFullYear(), index, 1)).replace(".", ""),
        weight: group.reduce((sum, order) => sum + order.totalWeight, 0),
        customers: new Set(group.map((order) => order.customerId).filter(Boolean)).size,
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
      commissionOrders: allOrders.filter(order => order.status === "normal" && inSelectedPeriod(order.issueDate)),
      yearOrders,
      periodBonifications,
      monthlyChart,
      positiveCustomers: new Set(normalOrders.map((order) => order.customerId).filter(Boolean)).size,
      segmentChart: topEntries(segmentWeights, 8),
      cityChart: topEntries(cityWeights, 8),
      productChart: topEntries(productWeights, 6),
      customerGrowthChart,
    };
  }, [customers, customerGroups, products, orders, allOrders, bonifications, month, startDate, endDate]);

  const activeCustomers = customers.filter((customer) => customer.status === "Ativo").length;
  const monthWeight = normalOrders.reduce((sum, order) => sum + order.totalWeight, 0);
  const monthOrderValue = normalOrders.reduce((sum, order) => sum + order.totalValue, 0);
  const annualWeight = yearOrders.reduce((sum, order) => sum + order.totalWeight, 0);
  const cards = [
    { title: "Valor dos pedidos", value: currency.format(monthOrderValue), detail: "No período", icon: ShoppingCart },
    { title: "Peso vendido", value: `${number.format(monthWeight)} kg`, detail: "No período", icon: Box },
    { title: "Pedidos", value: `${normalOrders.reduce((sum, order) => sum + (order.recordCount ?? 1), 0)}`, detail: "Registrados no período", icon: ShoppingCart },
    { title: "Clientes com compra", value: `${positiveCustomers}`, detail: `${activeCustomers} clientes ativos na base`, icon: UsersRound },
  ];

  function shiftMonth(value: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + value, 1));
    setStartDate("");
    setEndDate("");
  }

  function applyPeriod() {
    if (!customStart || !customEnd || customStart > customEnd) return;
    setStartDate(customStart);
    setEndDate(customEnd);
    if (periodOptions.current) periodOptions.current.open = false;
  }

  function clearPeriod() {
    setStartDate("");
    setEndDate("");
    setCustomStart("");
    setCustomEnd("");
    if (periodOptions.current) periodOptions.current.open = false;
  }

  if (orderData.error || bonusData.error) return <div className="page-content"><section className="panel page-empty" role="alert"><strong>Não foi possível carregar a dashboard</strong><p>{orderData.error || bonusData.error}</p></section></div>;
  if (orderData.loading || bonusData.loading) return <div className="page-content"><section className="panel page-empty" role="status">Carregando indicadores do período...</section></div>;
  return (
    <div className="page-content dashboard-page dashboard-clean">
      <header className="dash-heading"><div><span className="dash-scope">WRRJ</span><h1>Visão geral</h1></div><Link href="/relatorios" className="dash-report-link">Relatórios <ArrowRight size={16} /></Link></header>
      <section className="dash-period-bar" aria-label="Período do dashboard">
        <div className="dash-month-picker"><button type="button" className="icon-button" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}><ArrowLeft size={17} /></button><strong>{startDate && endDate ? `${startDate.split("-").reverse().join("/")} – ${endDate.split("-").reverse().join("/")}` : monthName(month)}</strong><button type="button" className="icon-button" aria-label="Próximo mês" onClick={() => shiftMonth(1)}><ArrowRight size={17} /></button></div>
        <div className="dash-period-actions"><button type="button" className="button button-outline" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); clearPeriod(); }}>Mês atual</button><details className="dash-date-options" ref={periodOptions}><summary><CalendarDays size={16} /> Personalizar</summary><div className="dash-date-fields"><label>De<input type="date" value={customStart} onChange={event => setCustomStart(event.target.value)} /></label><label>Até<input type="date" min={customStart || undefined} value={customEnd} onChange={event => setCustomEnd(event.target.value)} /></label><button type="button" className="button button-primary" disabled={!customStart || !customEnd || customStart > customEnd} onClick={applyPeriod}>Aplicar</button><button type="button" className="button button-outline" onClick={clearPeriod}>Limpar</button></div></details></div>
      </section>
      <section className="dashboard-metrics" aria-label="Indicadores de vendas">
        {cards.map(({ title, value, detail, icon: Icon }) => <article className="metric-card" key={title}><div className="metric-card-top"><span>{title}</span><span className="metric-icon"><Icon size={18} /></span></div><strong>{value}</strong><small>{detail}</small></article>)}
      </section>
      {(orderData.loading || bonusData.loading) && <p role="status">Carregando dados do período...</p>}
      {(orderData.error || bonusData.error) && <p role="alert">{orderData.error || bonusData.error}</p>}
      <DashboardCommission customers={allCustomers} groups={customerGroups} orders={commissionOrders} />
      <section className="dashboard-chart-grid dash-primary-charts" aria-label="Principais resultados">
        <article className="panel chart-panel"><div className="chart-heading"><h2>Evolução do peso</h2><span className="dash-chart-unit">kg · {month.getFullYear()}</span></div><DashboardColumns items={monthlyChart.map(item => ({ id: item.id, label: item.label, weight: item.weight }))} emptyTitle="Sem pedidos no ano" emptyDescription="" /></article>
        <article className="panel chart-panel"><div className="chart-heading"><h2>Produtos mais vendidos</h2><span className="dash-chart-unit">por peso</span></div><DashboardRanking items={productChart} emptyTitle="Sem produtos vendidos no período" emptyDescription="" /></article>
      </section>
      <details className="panel dash-more-analysis"><summary><div><strong>Mais análises</strong><span>Explore os resultados de clientes, regiões e segmentos</span></div><span className="dash-analysis-action"><span className="dash-analysis-expand">Clique para ver mais</span><span className="dash-analysis-collapse">Recolher análises</span><ChevronDown size={18} aria-hidden="true" /></span></summary><div className="dash-extra-content">
        <div className="dash-secondary-metrics"><span>Peso em {month.getFullYear()} <strong>{number.format(annualWeight)} kg</strong></span><span>Amostras e bonificações no período <strong>{number.format(periodBonifications.reduce((sum, bonus) => sum + bonus.totalWeight, 0))} kg</strong></span></div>
        <div className="dashboard-chart-grid">
          <article className="panel chart-panel"><div className="chart-heading"><h2>Clientes com compra por mês</h2></div><DashboardColumns items={monthlyChart.map(item => ({ id: item.id, label: item.label, weight: item.weight, customers: item.customers }))} showCustomers tone="dark" emptyTitle="Sem compras no ano" emptyDescription="" /></article>
          <article className="panel chart-panel"><div className="chart-heading"><h2>Clientes com crescimento</h2><span className="dash-chart-unit">vs. período anterior</span></div><DashboardGrowthRanking items={customerGrowthChart} emptyTitle="Sem crescimento com base anterior" emptyDescription="" /></article>
          <article className="panel chart-panel"><div className="chart-heading"><h2>Peso por cidade</h2></div><DashboardPie items={cityChart} emptyTitle="Sem dados de cidade" emptyDescription="" /></article>
          <article className="panel chart-panel"><div className="chart-heading"><h2>Peso por segmento</h2></div><DashboardPie items={segmentChart} emptyTitle="Sem dados de segmento" emptyDescription="" /></article>
        </div>
      </div></details>
    </div>
  );
}
