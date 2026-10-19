"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Percent, Search } from "lucide-react";
import type { CustomerGroup } from "@/lib/types";
import type { MartMinasAnalytics } from "@/lib/mart-minas-analytics";
import { buildNetworkCommission, filterCommissionRows, sumCommissionRows } from "@/lib/network-commission";
import { useTableSort } from "@/components/sort-heading";
import "./network-commission-report.css";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function NetworkCommissionReport({ group, report, scopeLabel, status }: { group: CustomerGroup; report: MartMinasAnalytics; scopeLabel: string; status: string }) {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [activity, setActivity] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const percent = group.commissionPercent;
  const configured = typeof percent === "number" && Number.isFinite(percent) && percent >= 0 && percent <= 100;
  const rows = useMemo(() => configured ? buildNetworkCommission(report.stores, percent!, group.sellerCommissionPercent, group.sellerCommissionBase ?? "orders") : [], [configured, report.stores, percent, group.sellerCommissionPercent, group.sellerCommissionBase]);
  const cities = [...new Set(rows.map((row) => row.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const activeCity = cities.includes(city) ? city : "";
  const filtered = filterCommissionRows(rows, search, activeCity, activity);
  const { sorted, heading } = useTableSort(filtered);
  const total = sumCommissionRows(rows), selected = sumCommissionRows(filtered);
  async function exportReport() {
    if (exporting || !configured) return;
    setExporting(true); setError("");
    try {
      const { downloadCommissionXls } = await import("@/lib/network-commission-export");
      downloadCommissionXls(sorted, rows, { name: group.name, start: report.currentPeriod.start, end: report.currentPeriod.end, scope: scopeLabel, status: status === "normal" ? "Normais" : status === "wallet" ? "Em carteira" : "Todos", percent: percent!, sellerPercent: group.sellerCommissionPercent, search, city: activeCity, activity });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível exportar a comissão."); }
    finally { setExporting(false); }
  }
  return <section className="panel mart-report-section commission-report" aria-label="Relatório de comissão">
    <div className="mart-section-heading"><div><p className="eyebrow">COMISSÕES DA REDE</p><h2><Percent size={19} /> Comissão por loja</h2><p>Período: {report.currentPeriod.start.split("-").reverse().join("/")} a {report.currentPeriod.end.split("-").reverse().join("/")} · {scopeLabel}</p></div><button type="button" className="button button-primary" disabled={!configured || exporting} onClick={() => void exportReport()}><Download size={16} />{exporting ? "Gerando..." : "Exportar comissão XLS"}</button></div>
    {!configured ? <div className="commission-empty"><strong>Comissão ainda não configurada</strong><p>Cadastre o percentual desta rede em Configurações → Redes e comissões.</p><Link className="button button-outline" href="/configuracoes">Abrir configurações</Link></div> : <>
      <div className="commission-stats"><div><span>Nosso percentual da rede</span><strong>{percent!.toLocaleString("pt-BR")}%</strong></div><div><span>Base geral dos pedidos</span><strong>{money(total.base)}</strong></div><div><span>Nossa comissão geral</span><strong>{money(total.commission)}</strong></div><div><span>Nossa comissão após filtros</span><strong>{money(selected.commission)}</strong></div><div><span>Comissão geral do vendedor</span><strong>{group.sellerCommissionPercent === undefined ? "Não cadastrada" : money(total.sellerCommission)}</strong></div><div><span>Comissão do vendedor após filtros</span><strong>{group.sellerCommissionPercent === undefined ? "Não cadastrada" : money(selected.sellerCommission)}</strong></div></div>
      <div className="commission-filters"><label className="commission-search"><Search size={16} /><input aria-label="Buscar loja no relatório de comissão" value={search} placeholder="Nome, código, loja ou CNPJ" onChange={(event) => setSearch(event.target.value)} /></label><label>Cidade<select value={activeCity} onChange={(event) => setCity(event.target.value)}><option value="">Todas as cidades</option>{cities.map((name) => <option key={name}>{name}</option>)}</select></label><label>Movimentação<select value={activity} onChange={(event) => setActivity(event.target.value)}><option value="all">Todas as lojas</option><option value="with">Com pedidos</option><option value="without">Sem pedidos</option></select></label><button type="button" className="button button-outline" onClick={() => { setSearch(""); setCity(""); setActivity("all"); }}>Limpar filtros</button></div>
      <p className="commission-note">{filtered.length} de {rows.length} lojas · O cálculo usa o percentual atual sobre o valor dos pedidos e arredonda a comissão por loja. Bonificações não entram na base. Período, carteira e situação dos pedidos seguem os filtros acima.</p>
      <div className="mart-report-table"><table><thead><tr>{heading("name", "Cliente", (row) => row.name)}{heading("code", "Código", (row) => row.code)}{heading("store", "Loja", (row) => row.store)}{heading("city", "Cidade", (row) => row.city)}{heading("seller", "Responsável", (row) => row.seller)}{heading("orders", "Pedidos", (row) => row.orders)}{heading("base", "Base dos pedidos", (row) => row.base)}{heading("percent", "Nossa %", (row) => row.percent)}{heading("commission", "Nossa comissão", (row) => row.commission)}{heading("sellerPercent", "Vendedor %", (row) => row.sellerPercent ?? -1)}{heading("sellerCommission", "Comissão vendedor", (row) => row.sellerCommission ?? -1)}</tr></thead><tbody>{sorted.map((row) => <tr key={row.id}><td>{row.name}<small>{row.document || "CNPJ não informado"}</small></td><td>{row.code}</td><td>{row.store || "—"}</td><td>{row.city || "—"}</td><td>{row.seller}</td><td>{row.orders}</td><td>{money(row.base)}</td><td>{row.percent.toLocaleString("pt-BR")}%</td><td><strong>{money(row.commission)}</strong></td><td>{row.sellerPercent === null ? "—" : `${row.sellerPercent.toLocaleString("pt-BR")}%`}</td><td>{row.sellerCommission === null ? "Não cadastrada" : money(row.sellerCommission)}</td></tr>)}{!sorted.length && <tr><td colSpan={11}>Nenhuma loja corresponde aos filtros.</td></tr>}</tbody><tfoot><tr><td colSpan={5}>Total após filtros</td><td>{selected.orders}</td><td>{money(selected.base)}</td><td>{percent!.toLocaleString("pt-BR")}%</td><td>{money(selected.commission)}</td><td>—</td><td>{group.sellerCommissionPercent === undefined ? "—" : money(selected.sellerCommission)}</td></tr></tfoot></table></div>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
