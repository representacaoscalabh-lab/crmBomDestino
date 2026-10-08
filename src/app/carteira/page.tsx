"use client";

import { ShoppingCart, Wallet } from "lucide-react";
import { useMemo } from "react";
import { useCrmStore } from "@/lib/store";

export default function WalletPage() {
  const { orders } = useCrmStore();
  const walletOrders = useMemo(() => orders.filter((order) => order.status === "wallet"), [orders]);
  const totalWeight = walletOrders.reduce((sum, order) => sum + order.totalWeight, 0);
  return <div className="page-content module-content"><section className="panel module-panel"><div className="module-heading"><span className="module-title-icon"><Wallet size={21} /></span><div className="module-title-copy"><p className="eyebrow">ACOMPANHAMENTO</p><h1>Carteira de pedidos</h1></div></div><div className="wallet-summary"><article><span>Pedidos em carteira</span><strong>{walletOrders.length}</strong></article><article><span>Peso em carteira</span><strong>{totalWeight.toLocaleString("pt-BR")} kg</strong></article></div>{walletOrders.length ? <div className="table-wrap customer-table-wrap"><table><thead><tr><th>PRÉ-PEDIDO</th><th>CLIENTE</th><th>DATA</th><th>PESO</th><th>VALOR</th></tr></thead><tbody>{walletOrders.map((order) => <tr key={order.id}><td>{order.preOrder}</td><td>{order.customerName}</td><td>{new Date(`${order.issueDate}T12:00:00`).toLocaleDateString("pt-BR")}</td><td>{order.totalWeight.toLocaleString("pt-BR")} kg</td><td>R$ {order.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td></tr>)}</tbody></table></div> : <div className="page-empty"><span className="page-empty-icon"><ShoppingCart size={23} /></span><strong>Nenhum pedido em carteira</strong><p>Pedidos classificados como carteira aparecerão aqui.</p></div>}</section></div>;
}
