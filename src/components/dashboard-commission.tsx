"use client";

import Link from "next/link";
import { ArrowUpRight, Percent } from "lucide-react";
import type { Customer, CustomerGroup, Order } from "@/lib/types";
import { buildNetworkDashboardCommission } from "@/lib/dashboard-commission";
import { useMartMinasSettings } from "@/lib/mart-minas-settings";
import "./dashboard-commission.css";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function DashboardCommission({ customers, groups, orders }: { customers: Customer[]; groups: CustomerGroup[]; orders: Order[] }) {
  const settings = useMartMinasSettings();
  const group = settings.groupId
    ? groups.find(item => item.id === settings.groupId)
    : groups.find(item => item.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase() === "martminas");
  const row = buildNetworkDashboardCommission(customers, group, orders);
  const loading = settings.loading;
  const configured = row.configured;

  return <section className="panel dashboard-commission" aria-label="Comissões Mart Minas" aria-busy={loading}>
    <header className="dc-heading">
      <div className="dc-title"><span className="dc-icon"><Percent size={20} aria-hidden="true" /></span><div><h2>Comissões Mart Minas</h2><p>Mart Minas <span aria-hidden="true">·</span> WRRJ + Sul de Minas</p></div></div>
      <Link className="dc-report" href="/relatorios/mart-minas">Ver relatório <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </header>
    <div className="dc-summary">
      <div className="dc-earned"><span className="dc-label">Comissão do período</span><strong>{loading ? "—" : configured ? money(row.total) : "—"}</strong><span className="dc-caption">{loading ? "Carregando informações…" : settings.error ? "Não foi possível atualizar a configuração da rede." : !group ? "Vincule a rede Mart Minas nas configurações." : !configured ? "Percentual de comissão não configurado." : !row?.orders ? "Nenhum pedido no período selecionado." : row.pendingStores ? "Total parcial: há lojas sem percentual configurado." : "WRRJ + Sul de Minas no período selecionado."}</span></div>
      <dl className="dc-metrics">
        <div><dt>Comissão WRRJ</dt><dd>{loading || !configured ? "—" : money(row.commission)}</dd></div>
        <div><dt>Comissão Sul de Minas</dt><dd>{loading || !configured ? "—" : row.pendingStores ? "Não configurada" : money(row.sellerCommission)}</dd></div>
        <div><dt>Base dos pedidos</dt><dd>{loading ? "—" : money(row?.base ?? 0)}</dd></div>
        <div><dt>Percentual WRRJ</dt><dd>{loading || !configured ? "—" : `${row!.percent!.toLocaleString("pt-BR")}%`}</dd></div>
        <div><dt>Lojas com compra</dt><dd>{loading ? "—" : row?.stores ?? 0}</dd></div>
        <div><dt>Pedidos</dt><dd>{loading ? "—" : row?.orders ?? 0}</dd></div>
      </dl>
    </div>
    <footer className="dc-footer"><span>Valores do período selecionado na dashboard.</span>{!loading && (!configured || row.pendingStores > 0) && <Link href="/configuracoes">Configurar comissão <ArrowUpRight size={14} aria-hidden="true" /></Link>}</footer>
  </section>;
}
