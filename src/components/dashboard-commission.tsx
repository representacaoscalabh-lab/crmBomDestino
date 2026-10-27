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
  const customerGroups = new Map(customers.map(customer => [customer.id, customer.groupId]));
  const networkOrders = group ? orders.filter(order => order.status === "normal" && customerGroups.get(order.customerId) === group.id) : [];
  const weight = networkOrders.reduce((total, order) => total + (order.totalWeight ?? 0), 0);
  const orderCount = networkOrders.reduce((total, order) => total + (order.recordCount ?? 1), 0);

  return <section className="panel dashboard-commission" aria-label="Resumo Mart Minas" aria-busy={loading}>
    <header className="dc-heading">
      <div className="dc-title"><span className="dc-icon"><Percent size={20} aria-hidden="true" /></span><div><h2>Mart Minas</h2><p>Resultado do período selecionado</p></div></div>
      <Link className="dc-report" href="/relatorios/mart-minas">Ver relatório <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </header>
    <div className="dc-summary">
      <div className="dc-earned"><span className="dc-label">Faturamento Mart Minas</span><strong>{loading ? "—" : money(row.base)}</strong><span className="dc-caption">{loading ? "Carregando informações…" : settings.error ? "Não foi possível atualizar a configuração da rede." : !group ? "Vincule a rede Mart Minas nas configurações." : !row.orders ? "Nenhum pedido no período selecionado." : !configured ? "Configure o percentual para visualizar a comissão." : row.pendingStores ? `${row.stores} lojas com compra · comissão parcial` : `${row.stores} ${row.stores === 1 ? "loja realizou" : "lojas realizaram"} compras`}</span></div>
      <dl className="dc-metrics">
        <div><dt>Peso vendido</dt><dd>{loading ? "—" : `${weight.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`}</dd></div>
        <div><dt>Pedidos</dt><dd>{loading ? "—" : orderCount.toLocaleString("pt-BR")}</dd></div>
        <div><dt>Lojas com compra</dt><dd>{loading ? "—" : row.stores}</dd></div>
        <div><dt>Comissão total</dt><dd>{loading || !configured ? "—" : money(row.total)}</dd></div>
        <div><dt>Comissão WRRJ</dt><dd>{loading || !configured ? "—" : money(row.commission)}</dd></div>
        <div><dt>Comissão Sul de Minas</dt><dd>{loading || !configured ? "—" : row.pendingStores ? "Pendente" : money(row.sellerCommission)}</dd></div>
      </dl>
    </div>
    <footer className="dc-footer"><span>Valores do período selecionado na dashboard.</span>{!loading && (!configured || row.pendingStores > 0) && <Link href="/configuracoes">Configurar comissão <ArrowUpRight size={14} aria-hidden="true" /></Link>}</footer>
  </section>;
}
