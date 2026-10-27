"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { OrderRemittance } from "@/lib/order-remittances";
import { usePeriodRecords } from "@/lib/use-period-records";
import type { Bonification, Customer, Order } from "@/lib/types";
import type { CustomerGroup } from "@/lib/types";
import { CalendarClock } from "lucide-react";

type Props = {
  group: CustomerGroup;
  customers: Customer[];
  start: string;
  end: string;
  scope: string;
  sidebar: ReactNode;
  remittanceFilter: string;
  remittances: OrderRemittance[];
  remittancesLoading: boolean;
  remittancesError: string;
};

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function NetworkRemittancesReport({ group, customers, start, end, scope, sidebar, remittanceFilter, remittances, remittancesLoading, remittancesError }: Props) {
  const ordersData = usePeriodRecords<Order>("orders", start, end);
  const bonusesData = usePeriodRecords<Bonification>("bonifications", start, end);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const networkStores = useMemo(() => customers.filter(customer => customer.groupId === group.id).filter(customer => {
    const seller = group.externalStoreSellers?.[customer.id]?.trim() || "";
    return scope === "all" || (scope === "ours" ? !seller : scope === "external" ? !!seller : seller === scope.slice(7));
  }), [customers, group, scope]);
  const selectableRemittances = remittanceFilter === "all" ? remittances : remittances.filter(remittance => remittance.id === remittanceFilter);
  const selected = remittanceFilter === "all"
    ? selectableRemittances.filter(remittance => selectedIds.includes(remittance.id))
    : selectableRemittances;
  const rows = useMemo(() => {
    const stores = new Map(networkStores.map(customer => [customer.id, {
      customer,
      totals: new Map<string, { orders: number; orderValue: number; bonuses: number; bonusValue: number }>(),
    }]));
    const add = (customerId: string, remittanceId: string | undefined, field: "orders" | "orderValue" | "bonuses" | "bonusValue", amount: number) => {
      if (!remittanceId || !selectedIds.includes(remittanceId)) return;
      const store = stores.get(customerId);
      if (!store) return;
      const totals = store.totals.get(remittanceId) ?? { orders: 0, orderValue: 0, bonuses: 0, bonusValue: 0 };
      if (field === "orders" || field === "bonuses") totals[field] += 1;
      else totals[field] += amount;
      store.totals.set(remittanceId, totals);
    };
    for (const order of ordersData.rows) add(order.customerId, order.remittanceId, "orderValue", order.totalValue);
    for (const order of ordersData.rows) add(order.customerId, order.remittanceId, "orders", 0);
    for (const bonus of bonusesData.rows) add(bonus.customerId, bonus.remittanceId, "bonusValue", bonus.totalValue);
    for (const bonus of bonusesData.rows) add(bonus.customerId, bonus.remittanceId, "bonuses", 0);
    return [...stores.values()].sort((left, right) => left.customer.name.localeCompare(right.customer.name, "pt-BR"));
  }, [networkStores, ordersData.rows, bonusesData.rows, selectedIds]);
  const loading = ordersData.loading || bonusesData.loading || remittancesLoading;

  return <div className="mart-commission-workspace">
    <aside className="mart-workspace-sidebar"><div className="panel mart-workspace-filter-panel"><h2>Filtros</h2>{sidebar}</div></aside>
    <section className="panel mart-report-section network-remittance-report">
      <header><div><CalendarClock size={23} /><h2>Comparativo de remessas</h2></div><p>Compare pedidos e bonificações por loja no período e responsável selecionados.</p></header>
      {remittancesError && <p role="alert">{remittancesError}</p>}
      {loading && <p role="status">Carregando remessas, pedidos e bonificações...</p>}
      {(ordersData.error || bonusesData.error) && <p role="alert">Não foi possível carregar os registros do período.</p>}
      {!loading && !remittancesError && remittances.length === 0 && <p className="network-remittance-empty">Ainda não há remessas para esta rede.</p>}
      {remittances.length > 0 && <fieldset className="network-remittance-picker">
        <legend>Selecione as remessas que deseja comparar</legend>
        {selectableRemittances.map(remittance => <label key={remittance.id}>
          <input type="checkbox" checked={remittanceFilter === "all" ? selectedIds.includes(remittance.id) : true} disabled={remittanceFilter !== "all"} onChange={event => setSelectedIds(current => event.target.checked ? [...current, remittance.id] : current.filter(id => id !== remittance.id))} />
          <span><strong>{remittance.name}</strong><small>{remittance.status === "ready" ? "Concluída" : remittance.status === "processing" ? "Importando" : "Com falha"}</small></span>
        </label>)}
      </fieldset>}
      {selected.length > 0 && !loading && <div className="table-wrap network-remittance-table-wrap"><table className="network-remittance-table">
        <thead><tr><th rowSpan={2}>Loja</th>{selected.map(remittance => <th key={remittance.id} colSpan={4}>{remittance.name}</th>)}</tr><tr>{selected.map(remittance => <Fragment key={remittance.id}><th>Pedidos</th><th>Valor pedidos</th><th>Bonif.</th><th>Valor bonif.</th></Fragment>)}</tr></thead>
        <tbody>{rows.map(({ customer, totals }) => <tr key={customer.id}><th>{customer.store || customer.name}</th>{selected.map(remittance => {
          const value = totals.get(remittance.id) ?? { orders: 0, orderValue: 0, bonuses: 0, bonusValue: 0 };
          return <Fragment key={remittance.id}><td>{value.orders}</td><td>{money(value.orderValue)}</td><td>{value.bonuses}</td><td>{money(value.bonusValue)}</td></Fragment>;
        })}</tr>)}</tbody>
      </table></div>}
      {remittances.length > 0 && !selectableRemittances.length && <p className="network-remittance-empty">Não há uma remessa correspondente a este filtro.</p>}
      {selectableRemittances.length > 0 && selected.length === 0 && <p className="network-remittance-empty">Marque uma ou mais remessas para ver o comparativo.</p>}
    </section>
  </div>;
}
