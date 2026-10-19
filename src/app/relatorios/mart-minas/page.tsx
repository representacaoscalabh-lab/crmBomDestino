"use client";

import Link from "next/link";
import { NetworkCommissionReport } from "@/components/network-commission-report";
import { useMemo, useRef, useState } from "react";
import { Download, Network } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCrmStore } from "@/lib/store";
import { useMartMinasSettings } from "@/lib/mart-minas-settings";
import { buildMartMinasAnalytics, saoPauloToday, MART_MINAS_START } from "@/lib/mart-minas-analytics";
import { MartMinasAnalysis, dateLabel, monthLabel, money, number } from "@/components/mart-minas-analysis";
import { downloadMartMinasReport } from "@/lib/mart-minas-export";
import "./report.css";

export default function MartMinasReportPage() {
  const { crmUser } = useAuth();
  const { customers, customerGroups, orders, bonifications } = useCrmStore();
  const { groupId, reportName, loading, error } = useMartMinasSettings();
  const today = saoPauloToday();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const endDateRef = useRef<HTMLInputElement>(null);
  const custom = !!start || !!end;
  const validRange = !custom || (!!start && !!end && start <= end && end <= today && start >= MART_MINAS_START);
  const [scope, setScope] = useState("ours");
  const [status, setStatus] = useState("normal");
  const [historyMonths, setHistoryMonths] = useState(6);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const group = customerGroups.find((item) => item.id === groupId);
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= today.slice(0, 7) && month >= MART_MINAS_START.slice(0, 7);
  const report = useMemo(() => group && validMonth && validRange ? buildMartMinasAnalytics({ group, customers, orders, bonifications, month, scope, status, historyMonths, today, start, end }) : null, [group, validMonth, validRange, start, end, customers, orders, bonifications, month, scope, status, historyMonths, today]);
  const previousPeriod = report?.periods.at(-2);
  const sellerNames = [...new Set(Object.values(group?.externalStoreSellers ?? {}).map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const scopeLabel = scope === "ours" ? "Somente Representação WRRJ" : scope === "external" ? "Somente outros vendedores" : scope === "all" ? "Dados mesclados da rede" : scope.slice(7);
  async function exportReport() {
    if (!report || !group || exporting) return;
    setExporting(true); setExportError("");
    try {
      await downloadMartMinasReport(report, group.name, scopeLabel, status);
    } catch { setExportError("Não foi possível exportar o relatório. Tente novamente."); }
    finally { setExporting(false); }
  }
  return <div className="page-content mart-report">
    <header className="mart-report-heading"><div><p className="eyebrow">ACOMPANHAMENTO COMERCIAL</p><h1>{reportName || "Mart Minas"}</h1><p>{group ? `${group.name} · Lojas e produtos` : "Acompanhe o resultado da rede."}</p></div><Network size={30} /></header>
    {loading ? <div className="panel page-empty" role="status">Carregando configuração do relatório...</div> : error ? <p className="form-error" role="alert">{error}</p> : !group ? <div className="panel page-empty"><strong>{groupId ? "A rede configurada não está mais disponível" : "Nenhuma rede configurada"}</strong><p>Um administrador precisa escolher a rede nas Configurações.</p>{crmUser?.role === "admin" && <Link className="button button-primary" href="/configuracoes">Abrir Configurações</Link>}</div> : <>
      <section className="panel mart-report-filters" aria-label="Filtros do relatório">
        <label>Mês de referência<input type="month" min={MART_MINAS_START.slice(0, 7)} max={today.slice(0, 7)} value={month} onChange={(event) => { setMonth(event.target.value); setStart(""); setEnd(""); }} /></label>
        <div className="mart-date-range" role="group" aria-label="Período personalizado">
          <label>De<input type="date" min={MART_MINAS_START} max={today} value={start} onChange={(event) => {
            const value = event.target.value;
            setStart(value);
            if (end && value > end) setEnd("");
            if (!value || !event.target.validity.valid) return;
            const input = endDateRef.current;
            if (!input) return;
            input.min = value;
            input.focus();
            try { input.showPicker?.(); } catch { /* The focused field remains available when native pickers are unsupported. */ }
          }} /></label>
          <span className="mart-date-range-separator" aria-hidden="true">→</span>
          <label>Até<input ref={endDateRef} type="date" min={start || MART_MINAS_START} max={today} value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        </div>
        {custom && <button type="button" className="button button-outline" onClick={() => { setStart(""); setEnd(""); }}>Voltar ao mês</button>}
        <label>Dados do relatório<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="ours">Somente Representação WRRJ</option><option value="all">Mesclar com outros vendedores</option><option value="external">Somente outros vendedores</option>{sellerNames.map((seller) => <option key={seller} value={`seller:${seller}`}>{seller}</option>)}</select></label>
        <label>Pedidos<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="normal">Normais</option><option value="wallet">Em carteira</option><option value="all">Todos (normal + carteira)</option></select></label>
        <label>{custom ? "Períodos no histórico" : "Histórico"}<select value={historyMonths} onChange={(event) => setHistoryMonths(Number(event.target.value))}><option value={6}>{custom ? "6 períodos" : "6 meses"}</option><option value={12}>{custom ? "12 períodos" : "12 meses"}</option></select></label>
        <button type="button" className="button button-primary" onClick={() => void exportReport()} disabled={!report || exporting}><Download size={16} />{exporting ? "Exportando..." : "Exportar análise"}</button>
      </section>
      {!validMonth && <p className="form-error" role="alert">Escolha um mês válido entre outubro de 2026 e o mês atual.</p>}
      {!validRange && <p className="form-error" role="alert">Preencha De e Até com um intervalo válido, sem datas futuras.</p>}
      {exportError && <p className="form-error" role="alert">{exportError}</p>}
      {report && <>
        <div className="mart-period-banner"><strong>{scopeLabel} · {report.custom ? "Período personalizado" : monthLabel(month)} {report.custom ? `· ${report.duration} dias` : report.cutoff ? "· mês em andamento" : "· mês completo"}</strong><span>{dateLabel(report.currentPeriod.start)} a {dateLabel(report.currentPeriod.end)}{previousPeriod && <> · comparado a {dateLabel(previousPeriod.start)} a {dateLabel(previousPeriod.end)}</>}</span></div>
        {report.historyCoverage.some((period) => !period.hasOrders) && <p className="mart-data-note" role="status">Sem registros na comparação: {report.historyCoverage.filter((period) => !period.hasOrders).map((period) => report.custom ? `${dateLabel(period.start)} a ${dateLabel(period.end)}` : monthLabel(period.month)).join(", ")}. Confira as importações; a média inclui zeros.</p>}
        {!report.hasPrevious && <p className="mart-data-note">Início do acompanhamento: outubro de 2026. As comparações aparecerão conforme o histórico for formado.</p>}
        <NetworkCommissionReport key={group.id} group={group} report={report} scopeLabel={scopeLabel} status={status} />
        <MartMinasAnalysis key={`${group.id}-${month}-${scope}-${status}-${historyMonths}-${start}-${end}`} report={report} />
        <section className="panel mart-report-section"><div className="mart-section-heading"><div><h2>Bonificações · {scopeLabel}</h2></div></div><div className="mart-detail-stats"><span>Registros: <strong>{report.bonus.count}</strong></span><span>Peso: <strong>{number(report.bonus.weight)} kg</strong></span><span>Valor de referência: <strong>{money(report.bonus.revenue)}</strong></span><span>Kg bonificados / kg comprados: <strong>{status === "normal" && report.current.weight > 0 ? `${number(report.bonus.weight / report.current.weight * 100)}%` : "—"}</strong></span></div>
          <details className="mart-record-details"><summary>Ver bonificações ({report.bonifications.length})</summary><div className="mart-report-table"><table><thead><tr><th>Controle</th><th>Emissão</th><th>Loja</th><th>Responsável</th><th>Motivo</th><th>Peso</th><th>Valor de referência</th></tr></thead><tbody>{report.bonifications.map((bonus) => <tr key={bonus.id}><td>{bonus.bonusNumber}</td><td>{dateLabel(bonus.issueDate)}</td><td>{bonus.customerName}<small>Loja {bonus.store || "—"}</small></td><td>{group.externalStoreSellers?.[bonus.customerId] || "Representação WRRJ"}</td><td>{bonus.reason}</td><td>{number(bonus.totalWeight)} kg</td><td>{money(bonus.totalValue)}</td></tr>)}</tbody></table></div></details>
        </section>
        <section className="panel mart-report-section"><div className="mart-section-heading"><div><h2>Resultado por responsável · {scopeLabel}</h2></div></div><div className="mart-report-table"><table><thead><tr><th>Responsável</th><th>Pedidos</th><th>Peso</th><th>Valor</th></tr></thead><tbody>{report.sellerTotals.map((row) => <tr key={row.seller}><td>{row.seller || "Representação WRRJ"}</td><td>{row.orders}</td><td>{number(row.weight)} kg</td><td>{money(row.revenue)}</td></tr>)}</tbody><tfoot><tr><td>Total selecionado</td><td>{report.sellerTotals.reduce((value, row) => value + row.orders, 0)}</td><td>{number(report.sellerTotals.reduce((value, row) => value + row.weight, 0))} kg</td><td>{money(report.sellerTotals.reduce((value, row) => value + row.revenue, 0))}</td></tr></tfoot></table></div></section>
        <details className="panel mart-methodology"><summary>Como interpretar os indicadores</summary><ul><li>Variação = (atual − anterior) ÷ anterior × 100. Sem base anterior positiva, a porcentagem não é calculada.</li><li>A média usa os três períodos anteriores, incluindo os sem registros. No modo mensal, o mês atual compara os mesmos dias de cada mês. Com De e Até, compara intervalos consecutivos com a mesma quantidade de dias.</li><li>Primeira compra registrada não significa cliente novo. Retomada indica compra atual, ausência no período anterior e alguma compra anterior no histórico disponível.</li><li>Loja sem recompra comprou no período anterior e não tem pedido no período atual. A ausência de registros pode refletir importação incompleta.</li><li>Preço médio por kg é valor ÷ peso: muda com preços e mix, sem isolar reajustes. Valor dos pedidos não comprova faturamento ou recebimento.</li><li>As oportunidades refletem compras das outras lojas selecionadas. Estes dados não medem estoque, giro no varejo, margem ou venda ao consumidor.</li><li>Kg dos produtos usam o peso registrado nos itens; kg da loja usam o total do pedido. Divergências de origem devem ser conferidas nos pedidos.</li></ul></details>
      </>}
    </>}
  </div>;
}
