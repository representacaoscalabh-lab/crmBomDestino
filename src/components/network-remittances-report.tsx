"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Download, X } from "lucide-react";
import type { OrderRemittance } from "@/lib/order-remittances";
import { usePeriodRecords } from "@/lib/use-period-records";
import type { Bonification, Customer, Order, OrderItem } from "@/lib/types";
import type { CustomerGroup } from "@/lib/types";
import { downloadXlsx } from "@/lib/xlsx";

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

type Summary = {
  orders: number;
  orderValue: number;
  totalWeight: number;
  totalItems: number;
  bonuses: number;
  bonusValue: number;
};

type DetailRecord = {
  type: "Pedido" | "Bonificação";
  id: string;
  number: string;
  issueDate: string;
  totalValue: number;
  totalWeight: number;
  itemCount: number;
  items: OrderItem[];
};

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const compactNumber = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const weightText = (value: number) => `${compactNumber(value)} kg`;
const formatDocument = (value?: string) => {
  const document = value?.trim() ?? "";
  const digits = document.replace(/\D/g, "");
  return digits.length === 14
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : document || "CNPJ não informado";
};

export function NetworkRemittancesReport({ group, customers, start, end, scope, sidebar, remittanceFilter, remittances, remittancesLoading, remittancesError }: Props) {
  const ordersData = usePeriodRecords<Order>("orders", start, end);
  const bonusesData = usePeriodRecords<Bonification>("bonifications", start, end);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<{ customer: Customer; remittance: OrderRemittance; records: DetailRecord[] } | null>(null);
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
      totals: new Map<string, Summary>(),
    }]));
    const buildSummary = (): Summary => ({ orders: 0, orderValue: 0, totalWeight: 0, totalItems: 0, bonuses: 0, bonusValue: 0 });
    const addOrder = (customerId: string, remittanceId: string | undefined, order: Order) => {
      if (!remittanceId || !selectedIds.includes(remittanceId)) return;
      const store = stores.get(customerId);
      if (!store) return;
      const totals = store.totals.get(remittanceId) ?? buildSummary();
      totals.orders += 1;
      totals.orderValue += order.totalValue;
      totals.totalWeight += order.totalWeight;
      totals.totalItems += order.items.reduce((sum, item) => sum + (item.unitQuantity || item.packageQuantity || 0), 0);
      store.totals.set(remittanceId, totals);
    };
    const addBonus = (customerId: string, remittanceId: string | undefined, bonus: Bonification) => {
      if (!remittanceId || !selectedIds.includes(remittanceId)) return;
      const store = stores.get(customerId);
      if (!store) return;
      const totals = store.totals.get(remittanceId) ?? buildSummary();
      totals.bonuses += 1;
      totals.bonusValue += bonus.totalValue;
      totals.totalWeight += bonus.totalWeight;
      totals.totalItems += bonus.items.reduce((sum, item) => sum + (item.unitQuantity || item.packageQuantity || 0), 0);
      store.totals.set(remittanceId, totals);
    };
    for (const order of ordersData.rows) addOrder(order.customerId, order.remittanceId, order);
    for (const bonus of bonusesData.rows) addBonus(bonus.customerId, bonus.remittanceId, bonus);
    return [...stores.values()].filter(({ customer }) => customer.groupId === group.id).sort((left, right) => left.customer.name.localeCompare(right.customer.name, "pt-BR"));
  }, [group.id, networkStores, ordersData.rows, bonusesData.rows, selectedIds]);

  const openDetail = (customer: Customer, remittance: OrderRemittance) => {
    const records: DetailRecord[] = [
      ...ordersData.rows.filter(order => order.customerId === customer.id && order.remittanceId === remittance.id).map(order => ({
        type: "Pedido" as const,
        id: order.id,
        number: order.preOrder || order.invoice || "Pedido",
        issueDate: order.issueDate,
        totalValue: order.totalValue,
        totalWeight: order.totalWeight,
        itemCount: order.items.reduce((sum, item) => sum + (item.unitQuantity || item.packageQuantity || 0), 0),
        items: order.items,
      })),
      ...bonusesData.rows.filter(bonus => bonus.customerId === customer.id && bonus.remittanceId === remittance.id).map(bonus => ({
        type: "Bonificação" as const,
        id: bonus.id,
        number: bonus.bonusNumber || "Bonificação",
        issueDate: bonus.issueDate,
        totalValue: bonus.totalValue,
        totalWeight: bonus.totalWeight,
        itemCount: bonus.items.reduce((sum, item) => sum + (item.unitQuantity || item.packageQuantity || 0), 0),
        items: bonus.items,
      })),
    ].sort((left, right) => right.issueDate.localeCompare(left.issueDate));
    if (!records.length) return;
    setDetail({ customer, remittance, records });
  };

  const exportReport = async () => {
    if (!selected.length) return;
    setExporting(true);
    try {
      const headings = [
        "Cidade",
        "CNPJ",
        ...selected.flatMap(remittance => [
          `${remittance.name} · Itens`,
          `${remittance.name} · Preço fat.`,
          `${remittance.name} · Peso`,
          `${remittance.name} · Valor bonif.`,
        ]),
      ];
      const rowsForExport: Array<Array<string | number>> = [];
      for (const { customer, totals } of rows) {
        const values: Array<string | number> = [
          customer.city || "—",
          formatDocument(customer.document),
        ];
        for (const remittance of selected) {
          const summary = totals.get(remittance.id) ?? { orders: 0, orderValue: 0, totalWeight: 0, totalItems: 0, bonuses: 0, bonusValue: 0 };
          values.push(summary.totalItems, summary.orderValue, summary.totalWeight, summary.bonusValue);
        }
        rowsForExport.push(values);
      }
      await downloadXlsx(`${group.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-remessas-${start}-${end}.xlsx`, "Remessas", headings, rowsForExport);
    } catch (cause) {
      console.error("Falha ao exportar comparativo de remessas.", cause);
    } finally {
      setExporting(false);
    }
  };

  const toggleRemittance = (remittanceId: string, checked: boolean) => {
    if (remittanceFilter !== "all") return;
    setSelectedIds(current => {
      if (checked) {
        if (current.includes(remittanceId)) return current;
        if (current.length >= 3) return [...current.slice(1), remittanceId];
        return [...current, remittanceId];
      }
      return current.filter(id => id !== remittanceId);
    });
  };

  const loading = ordersData.loading || bonusesData.loading || remittancesLoading;

  return <div className="mart-commission-workspace">
    <aside className="mart-workspace-sidebar"><div className="panel mart-workspace-filter-panel"><h2>Filtros</h2>{sidebar}</div></aside>
    <section className="panel mart-report-section network-remittance-report">
      <header>
        <div><CalendarClock size={23} /><h2>Comparativo de remessas</h2></div>
        <div className="network-remittance-header-actions">
          <p>Compare pedidos e bonificações por loja no período e responsável selecionados.</p>
          <button type="button" className="button button-primary" disabled={exporting || !selected.length} onClick={() => void exportReport()}>
            <Download size={15} />{exporting ? "Exportando..." : "Exportar XLS"}
          </button>
        </div>
      </header>
      {remittancesError && <p role="alert">{remittancesError}</p>}
      {loading && <p role="status">Carregando remessas, pedidos e bonificações...</p>}
      {(ordersData.error || bonusesData.error) && <p role="alert">Não foi possível carregar os registros do período.</p>}
      {!loading && !remittancesError && remittances.length === 0 && <p className="network-remittance-empty">Ainda não há remessas para esta rede.</p>}
      {remittances.length > 0 && <fieldset className="network-remittance-picker">
        <legend>Selecione as remessas que deseja comparar (até 3)</legend>
        {selectableRemittances.map(remittance => <label key={remittance.id}>
          <input type="checkbox" checked={remittanceFilter === "all" ? selectedIds.includes(remittance.id) : true} disabled={remittanceFilter !== "all"} onChange={event => toggleRemittance(remittance.id, event.target.checked)} />
          <span><strong>{remittance.name}</strong><small>{remittance.status === "ready" ? "Concluída" : remittance.status === "processing" ? "Importando" : "Com falha"}</small></span>
        </label>)}
      </fieldset>}
      {selected.length > 0 && !loading && <div className="table-wrap network-remittance-table-wrap"><table className="network-remittance-table">
        <thead>
          <tr><th rowSpan={2}>Cidade / CNPJ</th>{selected.map(remittance => <th key={remittance.id} colSpan={4} className="network-remittance-column-header"><span className="network-remittance-column-name">{remittance.name}</span></th>)}</tr>
          <tr>{selected.flatMap(remittance => [
            <th key={`${remittance.id}-items`}>Itens</th>,
            <th key={`${remittance.id}-value`}>Preço fat.</th>,
            <th key={`${remittance.id}-weight`}>Peso</th>,
            <th key={`${remittance.id}-bonus`}>Valor bonif.</th>,
          ])}</tr>
        </thead>
        <tbody>{rows.map(({ customer, totals }) => {
          const detailRemittance = selected.find(remittance =>
            ordersData.rows.some(order => order.customerId === customer.id && order.remittanceId === remittance.id)
            || bonusesData.rows.some(bonus => bonus.customerId === customer.id && bonus.remittanceId === remittance.id));
          return <tr key={customer.id}>
          <th className="network-remittance-store-cell">
            <button type="button" className="network-remittance-store-button" aria-label={`Ver itens pedidos por ${customer.name} em ${customer.city || "cidade não informada"}, CNPJ ${formatDocument(customer.document)}`} title={detailRemittance ? `Ver itens de ${customer.name} na remessa ${detailRemittance.name}` : "Nenhum pedido ou bonificação nesta seleção"} disabled={!detailRemittance} onClick={() => detailRemittance && openDetail(customer, detailRemittance)}>
              <span>{customer.city || "Cidade não informada"}</span>
              <small>CNPJ {formatDocument(customer.document)}</small>
            </button>
          </th>
          {selected.map(remittance => {
            const summary = totals.get(remittance.id) ?? { orders: 0, orderValue: 0, totalWeight: 0, totalItems: 0, bonuses: 0, bonusValue: 0 };
            return <Fragment key={`${customer.id}-${remittance.id}`}>
              <td><button type="button" className="network-remittance-metric-button" onClick={() => openDetail(customer, remittance)} disabled={!summary.totalItems}>{summary.totalItems}</button></td>
              <td><button type="button" className="network-remittance-metric-button" onClick={() => openDetail(customer, remittance)} disabled={!summary.orderValue}>{money(summary.orderValue)}</button></td>
              <td><button type="button" className="network-remittance-metric-button" onClick={() => openDetail(customer, remittance)} disabled={!summary.totalWeight}>{weightText(summary.totalWeight)}</button></td>
              <td><button type="button" className="network-remittance-metric-button" onClick={() => openDetail(customer, remittance)} disabled={!summary.bonusValue}>{money(summary.bonusValue)}</button></td>
            </Fragment>;
          })}
        </tr>;
        })}</tbody>
      </table></div>}
      {remittances.length > 0 && !selectableRemittances.length && <p className="network-remittance-empty">Não há uma remessa correspondente a este filtro.</p>}
      {selectableRemittances.length > 0 && selected.length === 0 && <p className="network-remittance-empty">Marque uma ou mais remessas para ver o comparativo.</p>}
      {detail && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}>
        <section className="modal-card network-remittance-detail-modal" role="dialog" aria-modal="true" aria-labelledby="network-remittance-detail-title">
          <div className="order-editor-heading">
            <div className="order-editor-icon"><CalendarClock size={21} /></div>
            <div>
              <p className="eyebrow">REMESSA</p>
              <h2 id="network-remittance-detail-title">{detail.remittance.name}</h2>
              <p>{detail.customer.name}{detail.customer.store ? ` · Loja ${detail.customer.store}` : ""} · {detail.customer.city || "—"} · CNPJ {formatDocument(detail.customer.document)}</p>
            </div>
            <button type="button" className="icon-button" aria-label="Fechar detalhes da remessa" onClick={() => setDetail(null)}><X size={20} /></button>
          </div>
          <div className="network-remittance-detail-summary">
            <strong>{detail.records.length} registros</strong>
            <span>{money(detail.records.reduce((sum, record) => sum + record.totalValue, 0))}</span>
            <span>{weightText(detail.records.reduce((sum, record) => sum + record.totalWeight, 0))}</span>
          </div>
          <div className="network-remittance-detail-list">
            {detail.records.map((record) => <article key={`${record.type}-${record.id}`} className="network-remittance-detail-item">
              <header>
                <div>
                  <strong>{record.type} {record.number}</strong>
                  <small>{record.issueDate.split("-").reverse().join("/")}</small>
                </div>
                <div className="network-remittance-detail-values">
                  <span>{record.itemCount} unidades</span>
                  <strong>{money(record.totalValue)}</strong>
                </div>
              </header>
              <table>
                <thead><tr><th>Produto</th><th>Qtd. (un.)</th><th>Embalagens</th><th>Peso</th><th>Subtotal</th></tr></thead>
                <tbody>{record.items.map((item, index) => <tr key={`${record.id}-${item.productCode}-${index}`}>
                  <td>{item.description || item.productCode}</td>
                  <td>{item.unitQuantity || item.packageQuantity || 0}</td>
                  <td>{compactNumber(item.packageQuantity)} · {item.packageKind}</td>
                  <td>{weightText(item.totalWeight || 0)}</td>
                  <td>{money(item.subtotal ?? item.packagePrice * Math.max(1, item.packageQuantity))}</td>
                </tr>)}</tbody>
              </table>
            </article>)}
          </div>
        </section>
      </div>}
    </section>
  </div>;
}
