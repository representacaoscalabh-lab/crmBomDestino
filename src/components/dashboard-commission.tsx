"use client";

import Link from "next/link";
import { Percent, ArrowRight } from "lucide-react";
import type { Customer, CustomerGroup, Order } from "@/lib/types";
import { buildDashboardCommission } from "@/lib/dashboard-commission";
import { useTableSort } from "@/components/sort-heading";
import "./dashboard-commission.css";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function DashboardCommission({ customers, groups, orders }: { customers: Customer[]; groups: CustomerGroup[]; orders: Order[] }) {
  const data = buildDashboardCommission(customers, groups, orders);
  const { sorted, heading } = useTableSort(data.rows);
  return <section className="panel dashboard-commission" aria-label="Comissões do período">
    <header><div><p className="eyebrow">COMISSÕES</p><h2><Percent size={21} /> Comissão do período</h2><p>Pedidos normais no mês ou intervalo selecionado acima · Representação WRRJ</p></div><Link className="button button-outline" href="/configuracoes">Configurar comissões <ArrowRight size={15} /></Link></header>
    <div className="dashboard-commission-stats"><article className="dashboard-commission-total"><span>Nossa comissão calculada</span><strong>{money(data.commission)}</strong><small>Soma das comissões por loja</small></article><article><span>Comissão dos vendedores</span><strong>{money(data.sellerCommission)}</strong><small>{data.pendingSellerStores ? `${data.pendingSellerStores} loja(s) sem percentual do vendedor` : "Percentuais próprios cadastrados por rede"}</small></article><article><span>Base com percentual cadastrado</span><strong>{money(data.coveredBase)}</strong><small>Pedidos incluídos no cálculo</small></article><article><span>Base sem comissão cadastrada</span><strong>{money(data.uncoveredBase)}</strong><small>{data.pendingStores} loja(s) aguardando configuração</small></article></div>
    {data.pendingStores > 0 && <p className="dashboard-commission-note" role="status">O total é parcial: há pedidos de redes sem percentual ou de clientes sem rede vinculada. Esses pedidos estão separados abaixo e não entram na comissão calculada.</p>}
    <div className="table-wrap"><table><thead><tr>{heading("name", "Rede", (row) => row.name)}{heading("stores", "Lojas com pedidos", (row) => row.stores)}{heading("orders", "Pedidos", (row) => row.orders)}{heading("base", "Base dos pedidos", (row) => row.base)}{heading("percent", "Nossa %", (row) => row.percent ?? -1)}{heading("commission", "Nossa comissão", (row) => row.commission ?? -1)}{heading("sellerPercent", "Vendedor %", (row) => row.sellerPercent ?? -1)}{heading("sellerCommission", "Comissão vendedor", (row) => row.sellerCommission ?? -1)}</tr></thead><tbody>{sorted.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.stores}</td><td>{row.orders}</td><td>{money(row.base)}</td><td>{row.percent === null ? <span className="dashboard-commission-pending">Não cadastrada</span> : `${row.percent.toLocaleString("pt-BR")}%`}</td><td>{row.commission === null ? "—" : <strong>{money(row.commission)}</strong>}</td><td>{row.sellerPercent === null ? "Não cadastrada" : `${row.sellerPercent.toLocaleString("pt-BR")}%`}</td><td>{row.sellerCommission === null ? "—" : money(row.sellerCommission)}</td></tr>)}{!sorted.length && <tr><td colSpan={8}>Cadastre os percentuais em Redes e comissões para acompanhar os valores aqui.</td></tr>}</tbody><tfoot><tr><td colSpan={3}>Total calculado</td><td>{money(data.coveredBase)}</td><td>—</td><td>{money(data.commission)}</td><td>—</td><td>{money(data.sellerCommission)}</td></tr></tfoot></table></div>
    <p className="dashboard-commission-note">Percentuais atuais da rede aplicados sobre o valor dos pedidos, com arredondamento por loja. Pedidos em carteira, bonificações e lojas de outros vendedores ficam fora deste cálculo.</p>
  </section>;
}
