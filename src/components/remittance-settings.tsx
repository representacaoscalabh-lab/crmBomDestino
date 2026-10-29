"use client";

import { useMemo, useState } from "react";
import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { ChevronDown, Clock3, FileText, History, LoaderCircle, PackageCheck, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import {
  deleteOrderRemittance,
  useOrderRemittances,
  type OrderRemittance,
  type OrderRemittanceEvent,
} from "@/lib/order-remittances";
import type { Bonification, Order } from "@/lib/types";

const REMITTANCE_PAGE_SIZE = 12;
const dateTime = (value?: { toDate: () => Date }) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(value.toDate())
  : "Registrando horário...";
const dateOnly = (value: string) => value ? value.split("-").reverse().join("/") : "Data não informada";
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const quantity = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const labels: Record<string, string> = {
  created: "Remessa criada",
  import_started: "Importação iniciada",
  import_completed: "Importação concluída",
  import_failed: "Importação com falha",
  renamed: "Nome alterado",
  records_assigned: "Registros vinculados",
  records_deleted: "Registros excluídos",
  deleted: "Remessa excluída",
};

type RemittanceDetails = {
  orders: Order[];
  bonifications: Bonification[];
  ordersCursor: QueryDocumentSnapshot | null;
  bonificationsCursor: QueryDocumentSnapshot | null;
  orderCount: number;
  bonificationCount: number;
  ordersHasMore: boolean;
  bonificationsHasMore: boolean;
  loaded: boolean;
  loading: boolean;
  loadingOrders: boolean;
  loadingBonifications: boolean;
  error: string;
};

const emptyDetails = (): RemittanceDetails => ({
  orders: [],
  bonifications: [],
  ordersCursor: null,
  bonificationsCursor: null,
  orderCount: 0,
  bonificationCount: 0,
  ordersHasMore: false,
  bonificationsHasMore: false,
  loaded: false,
  loading: true,
  loadingOrders: false,
  loadingBonifications: false,
  error: "",
});

async function loadRecordPage<T extends Order | Bonification>(
  resource: "orders" | "bonifications",
  remittanceId: string,
  cursor: QueryDocumentSnapshot | null = null,
) {
  const snapshot = await getDocs(query(
    collection(db, resource),
    where("remittanceId", "==", remittanceId),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(REMITTANCE_PAGE_SIZE),
  ));
  const rows = snapshot.docs.map(document => ({ ...document.data(), id: document.id }) as T)
    .sort((left, right) => right.issueDate.localeCompare(left.issueDate));
  return {
    rows,
    cursor: snapshot.docs.at(-1) ?? null,
    hasMore: snapshot.size === REMITTANCE_PAGE_SIZE,
  };
}

function eventDate(event: OrderRemittanceEvent) {
  return dateTime(event.createdAt);
}

export function RemittanceSettings() {
  const { crmUser } = useAuth();
  const { remittances, events, loading, error } = useOrderRemittances("", true, true, true);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, RemittanceDetails>>({});
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");
  const [historyFilter, setHistoryFilter] = useState("");
  const eventsByRemittance = useMemo(() => {
    const grouped = new Map<string, OrderRemittanceEvent[]>();
    for (const event of events) grouped.set(event.remittanceId, [...(grouped.get(event.remittanceId) ?? []), event]);
    return grouped;
  }, [events]);
  const visibleEvents = useMemo(() => {
    const filter = historyFilter.trim().toLocaleLowerCase("pt-BR");
    if (!filter) return events;
    return events.filter(event => `${event.remittanceName} ${event.details} ${event.actorName} ${labels[event.type] ?? event.type}`.toLocaleLowerCase("pt-BR").includes(filter));
  }, [events, historyFilter]);

  async function loadDetails(remittance: OrderRemittance) {
    if (details[remittance.id]?.loaded || details[remittance.id]?.loading) return;
    setDetails(current => ({ ...current, [remittance.id]: emptyDetails() }));
    try {
      const ordersQuery = query(collection(db, "orders"), where("remittanceId", "==", remittance.id));
      const bonificationsQuery = query(collection(db, "bonifications"), where("remittanceId", "==", remittance.id));
      const [orderCount, bonificationCount, orderPage, bonificationPage] = await Promise.all([
        getCountFromServer(ordersQuery),
        getCountFromServer(bonificationsQuery),
        loadRecordPage<Order>("orders", remittance.id),
        loadRecordPage<Bonification>("bonifications", remittance.id),
      ]);
      setDetails(current => ({
        ...current,
        [remittance.id]: {
          ...emptyDetails(),
          loaded: true,
          loading: false,
          orders: orderPage.rows,
          bonifications: bonificationPage.rows,
          ordersCursor: orderPage.cursor,
          bonificationsCursor: bonificationPage.cursor,
          ordersHasMore: orderPage.hasMore,
          bonificationsHasMore: bonificationPage.hasMore,
          orderCount: orderCount.data().count,
          bonificationCount: bonificationCount.data().count,
        },
      }));
    } catch (cause) {
      console.error("Falha ao carregar os registros da remessa nas configurações.", cause);
      setDetails(current => ({
        ...current,
        [remittance.id]: {
          ...emptyDetails(),
          loading: false,
          error: cause instanceof Error ? cause.message : "Não foi possível carregar os registros desta remessa.",
        },
      }));
    }
  }

  async function loadMore(remittance: OrderRemittance, resource: "orders" | "bonifications") {
    const currentDetails = details[remittance.id];
    if (!currentDetails) return;
    const cursor = resource === "orders" ? currentDetails.ordersCursor : currentDetails.bonificationsCursor;
    if (!cursor) return;
    setDetails(current => ({
      ...current,
      [remittance.id]: { ...current[remittance.id], [resource === "orders" ? "loadingOrders" : "loadingBonifications"]: true },
    }));
    try {
      const page = resource === "orders"
        ? await loadRecordPage<Order>("orders", remittance.id, cursor)
        : await loadRecordPage<Bonification>("bonifications", remittance.id, cursor);
      setDetails(current => {
        const existing = current[remittance.id];
        const key = resource === "orders" ? "orders" : "bonifications";
        const rows = [...existing[key], ...page.rows].filter((row, index, list) => list.findIndex(item => item.id === row.id) === index);
        return {
          ...current,
          [remittance.id]: {
            ...existing,
            [key]: rows,
            [resource === "orders" ? "ordersCursor" : "bonificationsCursor"]: page.cursor,
            [resource === "orders" ? "ordersHasMore" : "bonificationsHasMore"]: page.hasMore,
            [resource === "orders" ? "loadingOrders" : "loadingBonifications"]: false,
          },
        };
      });
    } catch (cause) {
      console.error(`Falha ao carregar mais ${resource === "orders" ? "pedidos" : "bonificações"} da remessa.`, cause);
      setDetails(current => ({
        ...current,
        [remittance.id]: {
          ...current[remittance.id],
          [resource === "orders" ? "loadingOrders" : "loadingBonifications"]: false,
          error: cause instanceof Error ? cause.message : "Não foi possível carregar mais registros.",
        },
      }));
    }
  }

  async function removeRemittance(remittance: OrderRemittance) {
    if (busyId || crmUser?.role !== "admin") return;
    if (!window.confirm(`Excluir “${remittance.name}” e todos os pedidos e bonificações vinculados? O histórico será mantido. Esta ação não pode ser desfeita.`)) return;
    setBusyId(remittance.id);
    setActionError("");
    try {
      await deleteOrderRemittance(remittance, { id: crmUser.uid, name: crmUser.name || crmUser.email || "Administrador" });
      setDetails(current => {
        const next = { ...current };
        delete next[remittance.id];
        return next;
      });
    } catch (cause) {
      console.error("Falha ao excluir remessa pelas configurações.", cause);
      setActionError(`${cause instanceof Error ? cause.message : "Não foi possível excluir a remessa."} O histórico foi preservado; confira-o antes de tentar novamente.`);
    } finally {
      setBusyId("");
    }
  }

  function toggleDetails(remittance: OrderRemittance) {
    const isOpen = expanded.includes(remittance.id);
    setExpanded(current => isOpen ? current.filter(id => id !== remittance.id) : [...current, remittance.id]);
    if (!isOpen && !details[remittance.id]) void loadDetails(remittance);
  }

  return <section className="panel settings-section-panel settings-remittance-panel">
    <div className="settings-section-heading">
      <span className="settings-section-icon"><PackageCheck size={19} /></span>
      <div><h2>Remessas e histórico</h2><p>Acompanhe os arquivos importados, seus pedidos e bonificações; exclusões preservam a trilha de auditoria.</p></div>
      <span className="request-count">{remittances.length}</span>
    </div>
    {error && <p role="alert" className="form-error settings-remittance-alert">{error}</p>}
    {actionError && <p role="alert" className="form-error settings-remittance-alert">{actionError}</p>}
    {loading ? <p role="status" className="settings-remittance-loading"><LoaderCircle className="spin" size={17} /> Carregando remessas e histórico...</p> : <>
      <div className="settings-remittance-section-heading"><div><h3>Remessas cadastradas</h3><p>Abra uma remessa para conferir os registros associados.</p></div><span>{remittances.length} remessa(s)</span></div>
      <div className="settings-remittance-list">
        {remittances.map(item => {
          const itemEvents = eventsByRemittance.get(item.id) ?? [];
          const lastImport = itemEvents.find(event => event.type === "import_completed");
          const itemDetails = details[item.id];
          const isExpanded = expanded.includes(item.id);
          const status = item.status === "processing" ? "Importando" : item.status === "failed" ? "Falha na importação" : item.status === "deleting" ? "Exclusão em andamento" : "Pronta";
          return <article className={`settings-remittance-card ${isExpanded ? "is-expanded" : ""}`} key={item.id}>
            <div className="settings-remittance-card-main">
              <span className="settings-remittance-card-icon"><FileText size={18} /></span>
              <div className="settings-remittance-card-copy">
                <div className="settings-remittance-title-row"><h4>{item.name}</h4><span className={`settings-remittance-status status-${item.status}`}>{status}</span></div>
                <p>{item.network === "mart_minas" ? "Mart Minas" : "OESA"} <span>·</span> {item.source === "manual" ? "Criada manualmente" : item.network === "mart_minas" ? "Importada de PDF Mart Minas" : "Importada de PDF OESA"}</p>
                <div className="settings-remittance-meta">
                  <span><Clock3 size={13} /> {dateTime(item.createdAt)}</span>
                  {item.sourceFile && <span className="settings-remittance-source" title={item.sourceFile}>{item.sourceFile}</span>}
                  <span>Por {item.createdByName || "Usuário não informado"}</span>
                </div>
                {lastImport && <p className="settings-remittance-import-summary">{lastImport.details} <span>·</span> {dateTime(lastImport.createdAt)}</p>}
              </div>
              <div className="settings-remittance-card-actions">
                <button type="button" className="button button-outline button-small" aria-expanded={isExpanded} onClick={() => toggleDetails(item)}><ChevronDown size={15} className={isExpanded ? "rotate" : ""} /> {isExpanded ? "Ocultar registros" : "Ver registros"}</button>
                {crmUser?.role === "admin" && <button type="button" className="button button-outline button-small settings-remittance-delete" disabled={busyId === item.id || item.status === "processing"} onClick={() => void removeRemittance(item)}><Trash2 size={14} /> {busyId === item.id ? "Excluindo..." : "Excluir"}</button>}
              </div>
            </div>
            {isExpanded && <div className="settings-remittance-details">
              {itemDetails?.loading && <p role="status" className="settings-remittance-loading"><LoaderCircle className="spin" size={16} /> Carregando pedidos e bonificações...</p>}
              {itemDetails?.error && <p role="alert" className="form-error">{itemDetails.error}</p>}
              {itemDetails && !itemDetails.loading && !itemDetails.error && <>
                <div className="settings-remittance-counts"><span><strong>{itemDetails.orderCount}</strong> pedidos</span><span><strong>{itemDetails.bonificationCount}</strong> bonificações</span></div>
                {!itemDetails.orderCount && !itemDetails.bonificationCount && <p className="settings-remittance-empty">Nenhum pedido ou bonificação vinculado a esta remessa.</p>}
                {!!itemDetails.orders.length && <section className="settings-remittance-record-group"><h5>Pedidos <span>{itemDetails.orderCount}</span></h5>
                  {itemDetails.orders.map(order => <div className="settings-remittance-record" key={order.id}><div><strong>Pedido {order.preOrder}</strong><span>{order.customerName} · {order.customerCode} · {order.store}</span></div><div><span>{dateOnly(order.issueDate)}</span><small>{order.items.length} itens · {quantity.format(order.totalWeight)} kg</small></div><strong>{currency.format(order.totalValue)}</strong></div>)}
                  {itemDetails.ordersHasMore && <button type="button" className="button button-outline button-small" disabled={itemDetails.loadingOrders} onClick={() => void loadMore(item, "orders")}>{itemDetails.loadingOrders ? "Carregando..." : "Carregar mais pedidos"}</button>}
                </section>}
                {!!itemDetails.bonifications.length && <section className="settings-remittance-record-group"><h5>Bonificações <span>{itemDetails.bonificationCount}</span></h5>
                  {itemDetails.bonifications.map(bonus => <div className="settings-remittance-record" key={bonus.id}><div><strong>Bonificação {bonus.bonusNumber}</strong><span>{bonus.customerName} · {bonus.customerCode} · {bonus.store}</span></div><div><span>{dateOnly(bonus.issueDate)}</span><small>{bonus.items.length} itens · {quantity.format(bonus.totalWeight)} kg</small></div><strong>{currency.format(bonus.totalValue)}</strong></div>)}
                  {itemDetails.bonificationsHasMore && <button type="button" className="button button-outline button-small" disabled={itemDetails.loadingBonifications} onClick={() => void loadMore(item, "bonifications")}>{itemDetails.loadingBonifications ? "Carregando..." : "Carregar mais bonificações"}</button>}
                </section>}
              </>}
            </div>}
          </article>;
        })}
        {!remittances.length && <div className="settings-remittance-empty"><FileText size={22} /><strong>Nenhuma remessa cadastrada</strong><span>Remessas criadas e importadas aparecerão nesta lista.</span></div>}
      </div>
      <div className="settings-remittance-history">
        <div className="settings-remittance-section-heading"><div><h3>Histórico de atividades</h3><p>Criações, importações, alterações e exclusões registradas.</p></div><span>{events.length} evento(s)</span></div>
        <label className="settings-remittance-search"><History size={15} /><input value={historyFilter} onChange={event => setHistoryFilter(event.target.value)} placeholder="Buscar por remessa, ação ou usuário..." aria-label="Buscar no histórico de remessas" /></label>
        <div className="settings-remittance-timeline">
          {visibleEvents.map(event => <article className="settings-remittance-event" key={event.id}><span className={`settings-remittance-event-dot event-${event.type}`} /><div><div className="settings-remittance-event-heading"><strong>{labels[event.type] ?? event.type}</strong><time>{eventDate(event)}</time></div><p>{event.remittanceName}</p><small>{event.details}</small><small>{event.actorName || "Usuário"} · {event.remittanceId} · {event.groupId}</small></div></article>)}
          {!visibleEvents.length && <p className="settings-remittance-empty">{events.length ? "Nenhum evento corresponde à busca." : "Nenhuma atividade registrada até o momento."}</p>}
        </div>
      </div>
    </>}
  </section>;
}
