"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { collection, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { assignRecordsToOrderRemittance, createOrderRemittance, deleteOrderRemittance, renameOrderRemittance, useOrderRemittances, type OrderRemittance, type RemittanceNetwork, type RemittanceRecordRef } from "@/lib/order-remittances";
import type { Bonification, Customer, Order } from "@/lib/types";
import { CalendarClock, FileText, History, Link2, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { normalizeOrder } from "@/lib/order-status";

type NetworkOption = { groupId: string; network: RemittanceNetwork; label: string };
type Props = { networks: NetworkOption[]; customers: Customer[]; onClose: () => void };
type Tab = "remittances" | "history";
type RecordCollection = "orders" | "bonifications";
type LoadedRecords<T> = { rows: T[]; cursor: QueryDocumentSnapshot | null; hasMore: boolean };
const RECORD_PAGE_SIZE = 5;
function appendRecordPage<T extends Order | Bonification>(previous: LoadedRecords<T>, page: LoadedRecords<T>): LoadedRecords<T> {
  const rows = [...previous.rows, ...page.rows].filter((record, index, records) => records.findIndex(item => item.id === record.id) === index);
  return { rows: rows.sort((left, right) => right.issueDate.localeCompare(left.issueDate)), cursor: page.cursor, hasMore: page.hasMore };
}

const formatDateTime = (value?: { toDate: () => Date }) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(value.toDate())
  : "Registrando horário...";

export function OrderRemittancesManager({ networks, customers, onClose }: Props) {
  const { crmUser } = useAuth();
  const [networkId, setNetworkId] = useState(networks[0]?.groupId ?? "");
  const [tab, setTab] = useState<Tab>("remittances");
  const [newName, setNewName] = useState("");
  const [renameId, setRenameId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [assignmentTarget, setAssignmentTarget] = useState<OrderRemittance | null>(null);
  const [search, setSearch] = useState("");
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const network = networks.find(option => option.groupId === networkId);
  const remittanceData = useOrderRemittances(networkId, true);
  const [ordersData, setOrdersData] = useState<LoadedRecords<Order>>({ rows: [], cursor: null, hasMore: false });
  const [bonusesData, setBonusesData] = useState<LoadedRecords<Bonification>>({ rows: [], cursor: null, hasMore: false });
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingBonuses, setLoadingBonuses] = useState(false);
  const networkCustomers = useMemo(() => new Set(customers.filter(customer => customer.groupId === networkId).map(customer => customer.id)), [customers, networkId]);
  const orders = useMemo(() => ordersData.rows.filter(order => networkCustomers.has(order.customerId)), [ordersData.rows, networkCustomers]);
  const bonuses = useMemo(() => bonusesData.rows.filter(bonus => networkCustomers.has(bonus.customerId)), [bonusesData.rows, networkCustomers]);
  const actor = { id: crmUser?.uid ?? "", name: crmUser?.name || crmUser?.email || "Usuário" };
  const loadingRecords = loadingOrders || loadingBonuses;

  async function loadRecordPage<T extends Order | Bonification>(resource: RecordCollection, cursor: QueryDocumentSnapshot | null, searchNumber: string): Promise<LoadedRecords<T>> {
    const constraints = searchNumber
      ? [where(resource === "orders" ? "preOrder" : "bonusNumber", "==", searchNumber)]
      : [orderBy("issueDate", "desc")];
    const snapshot = await getDocs(query(collection(db, resource), ...constraints, ...(cursor ? [startAfter(cursor)] : []), limit(RECORD_PAGE_SIZE)));
    const rows = snapshot.docs.map(document => {
      const data = { ...document.data(), id: document.id };
      return (resource === "orders" ? normalizeOrder(data as Order) : data as Bonification) as T;
    });
    rows.sort((left, right) => right.issueDate.localeCompare(left.issueDate));
    return { rows, cursor: snapshot.docs.at(-1) ?? null, hasMore: snapshot.size === RECORD_PAGE_SIZE };
  }

  async function loadFirstRecords(searchNumber = "") {
    setOrdersData({ rows: [], cursor: null, hasMore: false });
    setBonusesData({ rows: [], cursor: null, hasMore: false });
    setLoadingOrders(true);
    setLoadingBonuses(true);
    const tasks = [
      loadRecordPage<Order>("orders", null, searchNumber).then(page => setOrdersData(page)).catch(cause => {
        console.error("Falha ao carregar pedidos para vincular à remessa.", cause);
        setError("Não foi possível carregar os pedidos. Verifique a conexão e tente novamente.");
      }).finally(() => setLoadingOrders(false)),
      loadRecordPage<Bonification>("bonifications", null, searchNumber).then(page => setBonusesData(page)).catch(cause => {
        console.error("Falha ao carregar bonificações para vincular à remessa.", cause);
        setError("Não foi possível carregar as bonificações. Verifique a conexão e tente novamente.");
      }).finally(() => setLoadingBonuses(false)),
    ];
    await Promise.all(tasks);
  }

  async function loadMoreRecords(resource: RecordCollection) {
    if (resource === "orders") {
      if (!ordersData.hasMore || !ordersData.cursor || loadingOrders) return;
      setLoadingOrders(true);
      setError("");
      try {
        const page = await loadRecordPage<Order>("orders", ordersData.cursor, appliedSearch);
        setOrdersData(previous => appendRecordPage(previous, page));
      } catch (cause) {
        console.error("Falha ao carregar mais pedidos.", cause);
        setError("Não foi possível carregar mais pedidos. Verifique a conexão e tente novamente.");
      } finally { setLoadingOrders(false); }
      return;
    }
    if (!bonusesData.hasMore || !bonusesData.cursor || loadingBonuses) return;
    setLoadingBonuses(true);
    setError("");
    try {
      const page = await loadRecordPage<Bonification>("bonifications", bonusesData.cursor, appliedSearch);
      setBonusesData(previous => appendRecordPage(previous, page));
    } catch (cause) {
      console.error("Falha ao carregar mais bonificações.", cause);
      setError("Não foi possível carregar mais bonificações. Verifique a conexão e tente novamente.");
    } finally { setLoadingBonuses(false); }
  }

  async function createManualRemittance() {
    if (!network || !newName.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await createOrderRemittance({ groupId: network.groupId, network: network.network, name: newName, source: "manual", actor });
      setNewName("");
    } catch (cause) {
      console.error("Falha ao criar remessa manual.", cause);
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a remessa.");
    } finally { setBusy(false); }
  }

  async function removeRemittance(remittance: OrderRemittance) {
    if (busy || crmUser?.role !== "admin") return;
    if (!window.confirm(`Excluir a remessa "${remittance.name}" e TODOS os pedidos e bonificações associados? Esta ação não pode ser desfeita.`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteOrderRemittance(remittance, actor);
      setRenameId("");
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Não foi possível excluir a remessa."} Consulte o histórico antes de tentar novamente; lotes já excluídos não são restaurados.`);
    } finally { setBusy(false); }
  }

  async function saveName(remittance: OrderRemittance) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await renameOrderRemittance(remittance, renameValue, actor);
      setRenameId("");
    } catch (cause) {
      console.error("Falha ao renomear remessa.", cause);
      setError(cause instanceof Error ? cause.message : "Não foi possível renomear a remessa.");
    } finally { setBusy(false); }
  }

  async function assignSelectedRecords() {
    if (!assignmentTarget || !selectedRecords.length || busy) return;
    const ordersById = new Map(ordersData.rows.map(order => [order.id, order]));
    const bonusesById = new Map(bonusesData.rows.map(bonus => [bonus.id, bonus]));
    const records: RemittanceRecordRef[] = [];
    selectedRecords.forEach(id => {
      if (ordersById.has(id)) records.push({ collection: "orders", id });
      else if (bonusesById.has(id)) records.push({ collection: "bonifications", id });
    });
    setBusy(true);
    setError("");
    try {
      await assignRecordsToOrderRemittance(assignmentTarget, records, actor);
      setSelectedRecords([]);
      setAssignmentTarget(null);
    } catch (cause) {
      console.error("Falha ao vincular registros à remessa.", cause);
      setError(cause instanceof Error ? cause.message : "Não foi possível vincular os registros. Confira o histórico antes de repetir.");
    } finally { setBusy(false); }
  }

  function toggleRecord(id: string) {
    setSelectedRecords(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  const eventLabels: Record<string, string> = {
    created: "Remessa criada",
    import_started: "Importação iniciada",
    import_completed: "Importação concluída",
    import_failed: "Falha na importação",
    records_assigned: "Registros vinculados",
    renamed: "Remessa renomeada",
    records_deleted: "Registros excluídos",
    deleted: "Remessa excluída",
  };

  return <div className="modal-backdrop order-modal-backdrop remittance-manager-backdrop" role="presentation" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card remittance-manager" role="dialog" aria-modal="true" aria-labelledby="remittance-manager-title">
      <header className="order-editor-heading">
        <div className="order-editor-icon"><CalendarClock size={20} /></div>
        <div><p className="eyebrow">ORGANIZAÇÃO DE PEDIDOS</p><h2 id="remittance-manager-title">Remessas de pedidos</h2><p>Agrupe pedidos e bonificações para facilitar consultas e comparações.</p></div>
        <button type="button" className="icon-button" aria-label="Fechar remessas" disabled={busy} onClick={onClose}><X size={20} /></button>
      </header>
      <div className="remittance-manager-toolbar">
        <label>Rede<select value={networkId} onChange={event => { setNetworkId(event.target.value); setAssignmentTarget(null); setSelectedRecords([]); setError(""); }}>
          {networks.map(option => <option key={option.groupId} value={option.groupId}>{option.label}</option>)}
        </select></label>
        <div className="remittance-manager-tabs" role="tablist" aria-label="Remessas e histórico">
          <button type="button" role="tab" aria-selected={tab === "remittances"} onClick={() => setTab("remittances")}><FileText size={15} /> Remessas</button>
          <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => { setTab("history"); setAssignmentTarget(null); }}><History size={15} /> Histórico</button>
        </div>
      </div>
      {error && <p className="form-error remittance-manager-error" role="alert">{error}</p>}
      {remittanceData.error && <p className="form-error remittance-manager-error" role="alert">{remittanceData.error}</p>}
      {tab === "remittances" && <div className="remittance-manager-body">
        {!assignmentTarget ? <>
          <form className="remittance-create-form" onSubmit={event => { event.preventDefault(); void createManualRemittance(); }}>
            <label>Nome da nova remessa<input maxLength={100} value={newName} onChange={event => setNewName(event.target.value)} placeholder="Ex.: Pedidos da primeira quinzena" /></label>
            <button type="submit" className="button button-primary" disabled={busy || !newName.trim()}><Plus size={15} /> Criar remessa</button>
          </form>
          {remittanceData.loading ? <p className="remittance-loading" role="status"><LoaderCircle className="spin" size={16} /> Carregando remessas...</p> : <div className="remittance-list" aria-label="Remessas cadastradas">
            {remittanceData.remittances.map(remittance => <article className="remittance-card" key={remittance.id}>
              <div className="remittance-card-copy">
                {renameId === remittance.id
                  ? <form className="remittance-rename-form" onSubmit={event => { event.preventDefault(); void saveName(remittance); }}><input aria-label="Nome da remessa" maxLength={100} autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} /><button type="submit" className="button button-primary button-small" disabled={busy || !renameValue.trim()}>Salvar</button><button type="button" className="button button-outline button-small" disabled={busy} onClick={() => setRenameId("")}>Cancelar</button></form>
                  : <><strong>{remittance.name}</strong><span><b>{remittance.source === "manual" ? "Criada manualmente" : "Importada de PDF"}</b>{remittance.sourceFile ? ` · ${remittance.sourceFile}` : ""} · {formatDateTime(remittance.createdAt)}</span><small>{remittance.status === "deleting" ? "Exclusão em andamento — use Excluir para retomar" : remittance.status === "processing" ? "Importação em andamento" : remittance.status === "failed" ? "Importação com falha — consulte o histórico" : remittance.network === "mart_minas" ? "Mart Minas" : "OESA"}</small></>}
              </div>
              <div className="remittance-card-actions">
                {crmUser?.role === "admin" && <button type="button" className="button button-outline button-small" disabled={busy || remittance.status === "processing"} onClick={() => void removeRemittance(remittance)}><Trash2 size={14} /> Excluir remessa</button>}
                <button type="button" className="button button-outline button-small" disabled={busy || remittance.status === "processing" || remittance.status === "deleting"} onClick={() => { setAssignmentTarget(remittance); setSelectedRecords([]); setSearch(""); setAppliedSearch(""); setError(""); void loadFirstRecords(""); }}><Link2 size={14} /> Vincular registros</button>
                {renameId !== remittance.id && <button type="button" className="icon-button" aria-label={`Renomear ${remittance.name}`} title="Renomear remessa" disabled={busy || remittance.status === "deleting"} onClick={() => { setRenameId(remittance.id); setRenameValue(remittance.name); }}><Pencil size={15} /></button>}
              </div>
            </article>)}
            {!remittanceData.remittances.length && <div className="remittance-empty"><FileText size={22} /><strong>Nenhuma remessa nesta rede</strong><span>Crie uma remessa manual ou importe um PDF de pedidos.</span></div>}
          </div>}
        </> : <>
          <div className="remittance-assignment-heading"><div><strong>Vincular registros a “{assignmentTarget.name}”</strong><span>Os mais recentes aparecem primeiro. Carregamos até 5 registros por vez.</span></div><button type="button" className="button button-outline button-small" onClick={() => { setAssignmentTarget(null); setSelectedRecords([]); }}>Voltar</button></div>
          <form className="remittance-search-form" onSubmit={event => { event.preventDefault(); const value = search.trim(); setAppliedSearch(value); setSelectedRecords([]); setError(""); void loadFirstRecords(value); }}>
            <label className="remittance-search"><Search size={16} /><input aria-label="Buscar pelo número exato do pedido" value={search} onChange={event => setSearch(event.target.value)} placeholder="Número exato do pedido (ex.: 6388364/L)" /></label>
            <button type="submit" className="button button-outline" disabled={loadingRecords}><Search size={15} /> Buscar</button>
            {appliedSearch && <button type="button" className="button button-light" disabled={loadingRecords} onClick={() => { setSearch(""); setAppliedSearch(""); setSelectedRecords([]); setError(""); void loadFirstRecords(""); }}>Limpar</button>}
          </form>
          {error && <p className="form-error remittance-manager-error" role="alert">{error}</p>}
          {loadingOrders && !ordersData.rows.length ? <p className="remittance-loading" role="status"><LoaderCircle className="spin" size={16} /> Carregando pedidos...</p> : <div className="remittance-record-list">
            <strong>Pedidos desta rede ({orders.length})</strong>
            {orders.map(order => <label key={`order:${order.id}`} className="remittance-record-option"><input type="checkbox" checked={selectedRecords.includes(order.id)} onChange={() => toggleRecord(order.id)} /><span><b>Pedido {order.preOrder}</b><small>{order.customerName} · {order.issueDate.split("-").reverse().join("/")} · {order.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</small></span>{order.remittanceId && <em>{order.remittanceId === assignmentTarget.id ? "Nesta remessa" : "Em outra remessa — será movido"}</em>}</label>)}
            {ordersData.hasMore && <button type="button" className="button button-outline remittance-load-more" disabled={loadingOrders} onClick={() => void loadMoreRecords("orders")}>{loadingOrders ? "Carregando…" : "Carregar mais 5 pedidos"}</button>}
            {!orders.length && !loadingOrders && <span className="remittance-no-records">{appliedSearch ? "Nenhum pedido desta rede encontrado com esse número." : "Nenhum pedido desta rede nesta página."}</span>}
          </div>}
          {loadingBonuses && !bonusesData.rows.length ? <p className="remittance-loading" role="status"><LoaderCircle className="spin" size={16} /> Carregando bonificações...</p> : <div className="remittance-record-list">
            <strong>Bonificações desta rede ({bonuses.length})</strong>
            {bonuses.map(bonus => <label key={`bonus:${bonus.id}`} className="remittance-record-option"><input type="checkbox" checked={selectedRecords.includes(bonus.id)} onChange={() => toggleRecord(bonus.id)} /><span><b>Bonificação {bonus.bonusNumber}</b><small>{bonus.customerName} · {bonus.issueDate.split("-").reverse().join("/")} · {bonus.reason || "Sem motivo informado"}</small></span>{bonus.remittanceId && <em>{bonus.remittanceId === assignmentTarget.id ? "Nesta remessa" : "Em outra remessa — será movida"}</em>}</label>)}
            {bonusesData.hasMore && <button type="button" className="button button-outline remittance-load-more" disabled={loadingBonuses} onClick={() => void loadMoreRecords("bonifications")}>{loadingBonuses ? "Carregando…" : "Carregar mais 5 bonificações"}</button>}
            {!bonuses.length && !loadingBonuses && <span className="remittance-no-records">{appliedSearch ? "Nenhuma bonificação desta rede encontrada com esse número." : "Nenhuma bonificação desta rede nesta página."}</span>}
          </div>}
          <div className="remittance-assignment-footer"><span>{selectedRecords.length} registro(s) selecionado(s)</span><button type="button" className="button button-primary" disabled={busy || loadingRecords || !selectedRecords.length} onClick={() => void assignSelectedRecords()}>{busy ? "Vinculando..." : "Vincular à remessa"}</button></div>
        </>}
      </div>}
      {tab === "history" && <div className="remittance-history" aria-label="Histórico de remessas">
        {remittanceData.loading ? <p className="remittance-loading" role="status"><LoaderCircle className="spin" size={16} /> Carregando histórico...</p> : <>
          {remittanceData.events.map(event => <article className="remittance-history-event" key={event.id}><span className={`remittance-history-icon remittance-event-${event.type}`}><History size={15} /></span><div><strong>{eventLabels[event.type] ?? event.type} · {event.remittanceName}</strong><p>{event.details}</p><small>{event.actorName || "Usuário"} · {formatDateTime(event.createdAt)}</small></div></article>)}
          {!remittanceData.events.length && <div className="remittance-empty"><History size={22} /><strong>Sem eventos registrados</strong><span>Criações, importações e vínculos aparecerão aqui.</span></div>}
        </>}
      </div>}
      <footer className="order-editor-footer"><span className="remittance-history-time">Histórico com data e horário do sistema.</span><button type="button" className="button button-light" disabled={busy} onClick={onClose}>Fechar</button></footer>
    </section>
  </div>;
}
