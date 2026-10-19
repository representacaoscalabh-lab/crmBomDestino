"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Box,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Gift,
  ShoppingCart,
} from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { getExternalCustomerIds } from "@/lib/dashboard-scope";
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
            {isHovered && <div className="dashboard-column-tooltip"><strong>{item.label}</strong><span>weight: {number.format(item.weight)} kg</span>{showCustomers && <small>Positivações: {item.customers ?? 0} clientes</small>}</div>}
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
  const { customers: allCustomers, customerGroups, products, orders: allOrders, bonifications: allBonifications } = useCrmStore();
  const { customers, orders, bonifications } = useMemo(() => {
    const excluded = getExternalCustomerIds(allCustomers, customerGroups);
    return {
      customers: allCustomers.filter((customer) => !excluded.has(customer.id)),
      orders: allOrders.filter((order) => !excluded.has(order.customerId)),
      bonifications: allBonifications.filter((bonus) => !excluded.has(bonus.customerId)),
    };
  }, [allCustomers, customerGroups, allOrders, allBonifications]);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const { normalOrders, walletOrders, yearOrders, periodBonifications, monthlyChart, positiveCustomers, segmentChart, cityChart, productChart, customerGrowthChart } = useMemo(() => {
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
    const walletOrders = orders.filter((order) => order.status === "wallet" && inSelectedPeriod(order.issueDate));
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
      .filter((item) => item.growth > 0)
      .sort((a, b) => b.growth - a.growth || a.label.localeCompare(b.label, "pt-BR"))
      .slice(0, 5);
    return {
      normalOrders,
      walletOrders,
      yearOrders,
      periodBonifications,
      monthlyChart,
      positiveCustomers: new Set(normalOrders.map((order) => order.customerId).filter(Boolean)).size,
      segmentChart: topEntries(segmentWeights, 8),
      cityChart: topEntries(cityWeights, 8),
      productChart: topEntries(productWeights, 6),
      customerGrowthChart,
    };
  }, [customers, customerGroups, products, orders, bonifications, month, startDate, endDate]);

  const activeCustomers = customers.filter((customer) => customer.status === "Ativo").length;
  const monthWeight = normalOrders.reduce((sum, order) => sum + order.totalWeight, 0);
  const monthOrderValue = normalOrders.reduce((sum, order) => sum + order.totalValue, 0);
  const annualWeight = yearOrders.reduce((sum, order) => sum + order.totalWeight, 0);
  const walletWeight = walletOrders.reduce((sum, order) => sum + order.totalWeight, 0);
  const conversion = activeCustomers ? (positiveCustomers / activeCustomers) * 100 : 0;
  const cards = [
    { title: "Peso do mês", value: `${number.format(monthWeight)} kg`, detail: "Peso faturado no período", icon: Box },
    { title: "Valor total dos pedidos", value: currency.format(monthOrderValue), detail: "Faturamento dos pedidos no período", icon: ShoppingCart },
    { title: "Peso anual", value: `${number.format(annualWeight)} kg`, detail: `Acumulado de ${month.getFullYear()}`, icon: BarChart3 },
    { title: "Carteira (mês atual)", value: `${number.format(walletWeight)} kg`, detail: "Peso em carteira no período selecionado", icon: ShoppingCart },
    { title: "Pedidos", value: `${normalOrders.length}`, detail: "Pedidos faturados no período", icon: ShoppingCart },
    { title: "Bonificações", value: `${number.format(periodBonifications.reduce((sum, bonus) => sum + bonus.totalWeight, 0))} kg`, detail: `${periodBonifications.length} amostra(s) · fora das vendas`, icon: Gift },
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
  }

  function clearPeriod() {
    setStartDate("");
    setEndDate("");
    setCustomStart("");
    setCustomEnd("");
  }

  return (
    <div className="page-content dashboard-page">
      <section className="panel dashboard-filter-panel">
        <div className="dashboard-filter-header">
          <div>
            <p className="eyebrow">DASHBOARD COMERCIAL</p>
            <h1>Visão de vendas <span className="month-chip">{monthName(month)}</span></h1>
          </div>
          <div className="dashboard-controls">
            <div className="month-controls">
              <button className="button button-outline" onClick={() => shiftMonth(-1)}><ArrowLeft size={15} /> Mês anterior</button>
              <button className="button button-selected" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); clearPeriod(); }}>Mês atual</button>
              <button className="button button-outline" onClick={() => shiftMonth(1)}>Próximo mês <ArrowRight size={15} /></button>
            </div>
            <div className="read-status"><span className="read-indicator" /><span><strong>Dados do Firestore</strong><small>Atualização em tempo real</small></span><button title="A atualização ocorre automaticamente">Atualizado</button></div>
          </div>
        </div>
        <div className="custom-period">
          <strong>Período personalizado</strong>
          <label>Data início<input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
          <label>Data fim<input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
          <button className="button button-primary" onClick={applyPeriod}>Aplicar período</button>
          <button className="button button-outline" onClick={clearPeriod}>Limpar período</button>
        </div>
      </section>

      <section className="dashboard-metrics" aria-label="Indicadores de vendas">
        {cards.map(({ title, value, detail, icon: Icon }) => <article className="metric-card" key={title}><div className="metric-card-top"><span>{title}</span><span className="metric-icon"><Icon size={19} /></span></div><strong>{value}</strong><small>{detail}</small></article>)}
      </section>

      <DashboardCommission customers={allCustomers} groups={customerGroups} orders={normalOrders} />

      <section className="panel executive-panel">
        <div className="executive-heading"><div><p className="eyebrow">RESUMO EXECUTIVO</p><h2>Performance geral</h2></div><span className="goal-count">0 metas ativas</span></div>
        <div className="executive-metrics">
          <article><span>Clientes na Carteira</span><strong>{activeCustomers}</strong><small>Clientes ativos</small></article>
          <article className="executive-highlight"><span>Clientes positivados</span><strong>{positiveCustomers}</strong><small>Compraram no período</small></article>
          <article><span>Conversão</span><strong>{conversion.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong><small>Sobre carteira</small></article>
        </div>
        <div className="no-goals">Nenhuma meta ativa encontrada. <Link href="/metas">Criar uma meta <ArrowRight size={14} /></Link></div>
      </section>

      <section className="dashboard-chart-grid">
        <article className="panel chart-panel"><div className="chart-heading"><div><p className="eyebrow">PESO</p><h2>Peso mensal</h2></div><button className="chart-type"><CalendarDays size={13} /> Colunas <ChevronDown size={13} /></button></div>
          <DashboardColumns items={monthlyChart.map((item) => ({ id: item.id, label: item.label, weight: item.weight }))} emptyTitle="Nenhum dado para exibir" emptyDescription="Os pedidos importados aparecerão neste gráfico." />
        </article>
        <article className="panel chart-panel"><div className="chart-heading"><div><p className="eyebrow">POSITIVAÇÃO</p><h2>Clientes ativos por mês</h2></div><button className="chart-type"><CalendarDays size={13} /> Colunas <ChevronDown size={13} /></button></div>
          <DashboardColumns items={monthlyChart.map((item) => ({ id: item.id, label: item.label, weight: item.weight, customers: item.customers }))} showCustomers tone="dark" emptyTitle="Sem compras neste período" emptyDescription="A positivação de clientes será calculada pelos pedidos." />
        </article>
        <article className="panel chart-panel"><div className="chart-heading"><div><p className="eyebrow">SEGMENTO</p><h2>Peso por segmento</h2></div><span className="chart-type">Pizza</span></div><DashboardPie items={segmentChart} emptyTitle="Sem dados de segmento" emptyDescription="Adicione segmentos aos clientes para visualizar esta análise." /></article>
        <article className="panel chart-panel"><div className="chart-heading"><div><p className="eyebrow">CIDADE</p><h2>Peso por cidade</h2></div><span className="chart-type">Pizza</span></div><DashboardPie items={cityChart} emptyTitle="Sem dados de cidade" emptyDescription="Cadastre a cidade nos clientes para gerar o gráfico." /></article>
        <article className="panel chart-panel"><div className="chart-heading"><div><p className="eyebrow">PRODUTOS</p><h2>Top produtos por peso</h2></div><span className="chart-type">Maior peso</span></div><DashboardRanking items={productChart} emptyTitle={products.length ? "Importe pedidos para analisar produtos" : "Cadastre produtos e importe pedidos"} emptyDescription="Os itens vendidos serão classificados pelo peso total." /></article>
        <article className="panel chart-panel"><div className="chart-heading"><div><p className="eyebrow">CLIENTES</p><h2>Top 5 clientes com crescimento</h2></div><span className="chart-type">vs. período anterior</span></div><DashboardGrowthRanking items={customerGrowthChart} emptyTitle="Sem crescimento no período" emptyDescription="Os clientes com maior aumento de peso em relação ao período anterior de mesma duração aparecerão aqui." /></article>
      </section>
    </div>
  );
}
