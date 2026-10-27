"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import { NetworkProductsReport } from "@/components/network-products-report";
import { StoreProductsReport } from "@/components/store-products-report";
import { StoreGrowthReport } from "@/components/store-growth-report";
import { NetworkCommissionReport } from "@/components/network-commission-report";
import { NetworkRemittancesReport } from "@/components/network-remittances-report";
import { usePeriodRecords } from "@/lib/use-period-records";
import { useOrderRemittances } from "@/lib/order-remittances";
import type { Order } from "@/lib/types";
import { useCrmStore } from "@/lib/store";
import { saoPauloToday } from "@/lib/mart-minas-analytics";
import "@/app/relatorios/mart-minas/report.css";
import "@/app/relatorios/mart-minas/workspace.css";
import "@/app/relatorios/mart-minas/clean.css";

export function NetworkReportsPage({ settings, defaultTitle }: { settings: { groupId: string; reportName: string; loading: boolean; error: string }; defaultTitle: string }) {
  const { customers, customerGroups, products } = useCrmStore();
  const { groupId, reportName, loading, error } = settings;
  const today = saoPauloToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [scope, setScope] = useState("ours");
  const [reportView, setReportView] = useState("commission");
  const [remittanceId, setRemittanceId] = useState("all");
  const group = customerGroups.find((entry) => entry.id === groupId);
  const remittanceData = useOrderRemittances(groupId, !!groupId);
  const sellers = [...new Set(Object.values(group?.externalStoreSellers ?? {}).map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const activeScope = scope.startsWith("seller:") && !sellers.includes(scope.slice(7)) ? "ours" : scope;
  const scopeOptions = [{ value: "ours", label: "WRRJ" }, { value: "all", label: "Mesclado" }, { value: "external", label: "Sul de Minas" }];
  const selectedScopeIndex = scopeOptions.findIndex((option) => option.value === activeScope);
  const periodMonth = end.slice(0, 7) || start.slice(0, 7) || today.slice(0, 7);
  const validPeriod = !!start && !!end && start >= "2026-10-01" && start <= end && end <= today;
  const scopeLabel = activeScope === "ours" ? "WRRJ" : activeScope === "external" ? "Sul de Minas" : "Mesclado";
  const orderData = usePeriodRecords<Order>("orders", reportView === "commission" || reportView === "catalog" ? start : "2026-10-01", end, validPeriod && !!group);
  const orders = useMemo(() => remittanceId === "all" ? orderData.rows : orderData.rows.filter(order => remittanceId === "unassigned" ? !order.remittanceId : order.remittanceId === remittanceId), [orderData.rows, remittanceId]);
  const report = useMemo(() => {
    if (!group || !validPeriod || orderData.loading || orderData.error) return null;
    const totals = new Map<string, { revenue: number; orders: number }>();
    for (const order of orders) {
      if (order.status !== "normal" || order.issueDate < start || order.issueDate > end) continue;
      const total = totals.get(order.customerId) ?? { revenue: 0, orders: 0 };
      total.revenue += order.totalValue;
      total.orders++;
      totals.set(order.customerId, total);
    }
    const allStores = customers.filter((customer) => customer.groupId === group.id).map((customer) => ({
      customer,
      seller: group.externalStoreSellers?.[customer.id]?.trim() || "",
      current: totals.get(customer.id) ?? { revenue: 0, orders: 0 },
    }));
    const stores = allStores.filter(({ seller }) => activeScope === "all" || (activeScope === "ours" ? !seller : activeScope === "external" ? !!seller : seller === activeScope.slice(7)));
    return { stores, allStores, currentPeriod: { start, end } };
  }, [group, validPeriod, orderData.loading, orderData.error, orders, customers, start, end, activeScope]);

  function selectMonth(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < "2026-10" || month > today.slice(0, 7)) return;
    const [year, number] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
    setStart(`${month}-01`); setEnd(lastDay < today ? lastDay : today);
  }
  const sidebar = <><nav className="mart-report-options" aria-label="Relatórios"><button type="button" aria-pressed={reportView === "commission"} onClick={() => setReportView("commission")}>Comissões</button><button type="button" aria-pressed={reportView === "growth"} onClick={() => setReportView("growth")}>Crescimento</button><button type="button" aria-pressed={reportView === "products"} onClick={() => { setReportView("products"); setStart(`${periodMonth}-01`); }}>Produtos por loja</button><button type="button" aria-pressed={reportView === "catalog"} onClick={() => setReportView("catalog")}>Produtos</button><button type="button" aria-pressed={reportView === "remittances"} onClick={() => setReportView("remittances")}>Remessas</button></nav><section className="mart-remittance-filter" aria-label="Filtrar relatórios por remessa">
        <label htmlFor="network-remittance-filter">Remessa</label><select id="network-remittance-filter" value={remittanceId} onChange={event => setRemittanceId(event.target.value)} disabled={remittanceData.loading || !!remittanceData.error}>
          <option value="all">Todas as remessas</option><option value="unassigned">Sem remessa</option>
          {remittanceData.remittances.map(remittance => <option key={remittance.id} value={remittance.id}>{remittance.name}</option>)}
        </select>
        {remittanceData.error && <small className="mart-remittance-filter-error" role="alert">{remittanceData.error}</small>}
      </section><section className="mart-workspace-period" aria-label="Período e responsável">
        <div className="mart-filter-section-title">Período</div>
        {reportView === "products" ? <label>Mês<input aria-label="Mês de acompanhamento" type="month" min="2026-10" max={today.slice(0, 7)} value={periodMonth} onChange={event => selectMonth(event.target.value)} /></label> :         <label>De<input aria-label="Data inicial" type="date" min="2026-10-01" max={today} value={start} onChange={(event) => setStart(event.target.value)} /></label>}
        <label>Até<input aria-label="Data final" type="date" min={reportView === "products" ? `${periodMonth}-01` : start || "2026-10-01"} max={reportView === "products" ? [today, new Date(Date.UTC(Number(periodMonth.slice(0, 4)), Number(periodMonth.slice(5, 7)), 0)).toISOString().slice(0, 10)].sort()[0] : today} value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        <div className="mart-responsible-field"><span id="mart-responsible-label">Responsável</span><div className="mart-scope-scroll"><div className="mart-scope-bar" role="group" aria-labelledby="mart-responsible-label" style={{ gridTemplateColumns: `repeat(${scopeOptions.length}, minmax(0, 1fr))` }}><span className="mart-scope-indicator" aria-hidden="true" style={{ width: `calc((100% - 8px) / ${scopeOptions.length})`, transform: `translateX(${selectedScopeIndex * 100}%)` }} />{scopeOptions.map((option) => <button key={option.value} type="button" aria-pressed={activeScope === option.value} title={option.label} onClick={(event) => { setScope(option.value); event.currentTarget.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "nearest" }); }}>{option.label}</button>)}</div></div></div>
        <button type="button" className="button button-outline" onClick={() => { setStart(monthStart); setEnd(today); }}>Mês atual</button>
      </section></>;

  return <div className="page-content mart-report mart-commission-page mart-clean">
    <header className="mart-report-heading"><div><p className="eyebrow">RELATÓRIOS</p><h1>{reportName || defaultTitle}</h1></div></header>
    {loading ? <div className="panel page-empty" role="status">Carregando configuração...</div> : error ? <p className="form-error" role="alert">{error}</p> : !group ? <div className="panel page-empty"><strong>Nenhuma rede disponível</strong><p>Selecione a rede do Mart Minas em Redes e comissões.</p><Link className="button button-outline" href="/configuracoes">Abrir configurações</Link></div> : <>
      {orderData.loading && <p role="status">Carregando dados do período...</p>}
      {orderData.error && <p role="alert">{orderData.error}</p>}
      {!validPeriod && <div className="mart-commission-workspace"><aside className="mart-workspace-sidebar"><div className="panel mart-workspace-filter-panel"><h2>Filtros</h2>{sidebar}</div></aside><section className="panel mart-report-section commission-report mart-invalid-period"><div><CalendarDays size={28} /><h2>Selecione o período</h2><p role="alert">Escolha datas entre outubro de 2026 e hoje.</p></div></section></div>}
      {report && reportView === "commission" && <NetworkCommissionReport key={group.id} group={group} report={report} scopeLabel={scopeLabel} status="normal" sidebar={sidebar} />}
      {report && reportView === "growth" && <StoreGrowthReport customers={customers} group={group} orders={orders} start={start} end={end} scope={activeScope} sidebar={sidebar} />}      {report && reportView === "products" && <StoreProductsReport customers={customers} group={group} products={products} orders={orders} end={end} scope={activeScope} sidebar={sidebar} />}
      {report && reportView === "catalog" && <NetworkProductsReport customers={customers} group={group} products={products} orders={orders} start={start} end={end} scope={activeScope} sidebar={sidebar} />}
      {validPeriod && reportView === "remittances" && <NetworkRemittancesReport group={group} customers={customers} start={start} end={end} scope={activeScope} sidebar={sidebar} remittanceFilter={remittanceId} remittances={remittanceData.remittances} remittancesLoading={remittanceData.loading} remittancesError={remittanceData.error} />}
    </>}
  </div>;
}
