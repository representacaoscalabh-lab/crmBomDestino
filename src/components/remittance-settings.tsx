"use client";

import { useOrderRemittances } from "@/lib/order-remittances";

const date = (value?: { toDate: () => Date }) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(value.toDate()) : "Registrando...";
const labels: Record<string, string> = { created: "Criação manual", import_started: "Importação iniciada", import_completed: "Importação concluída", import_failed: "Importação falhou", renamed: "Nome alterado", records_assigned: "Registros vinculados", records_deleted: "Registros excluídos", deleted: "Remessa excluída" };

export function RemittanceSettings() {
  const { remittances, events, loading, error } = useOrderRemittances("", true, true, true);
  return <section className="panel settings-section-panel">
    <div className="settings-section-heading"><div><h2>Remessas e histórico</h2><p>Informações e logs de todas as redes. O histórico permanece após a exclusão.</p></div></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {loading ? <p role="status">Carregando remessas e histórico...</p> : <>
      <h3>Remessas ({remittances.length})</h3>
      <div className="settings-request-list">{remittances.map(item => <article className="settings-request-card" key={item.id}><div className="request-copy"><strong>{item.name}</strong><small>{item.source === "manual" ? "Criada manualmente" : "Importada de PDF"} · {item.network === "mart_minas" ? "Mart Minas" : "OESA"} · {item.status === "deleting" ? "Exclusão em andamento" : item.status === "processing" ? "Importando" : item.status === "failed" ? "Falha na importação" : "Pronta"}</small><small>{item.sourceFile && `Arquivo: ${item.sourceFile} · `}Criada por {item.createdByName || "Usuário não informado"} · {date(item.createdAt)}</small><small>ID: {item.id} · Rede: {item.groupId}</small></div></article>)}</div>
      {!remittances.length && <p>Nenhuma remessa cadastrada.</p>}
      <h3>Histórico de todas as remessas ({events.length})</h3>
      <div className="settings-request-list">{events.map(event => <article className="settings-request-card" key={event.id}><div className="request-copy"><strong>{labels[event.type] || event.type} · {event.remittanceName}</strong><p>{event.details}</p><small>{event.actorName || "Usuário"} · {date(event.createdAt)}</small><small>Remessa: {event.remittanceId} · Rede: {event.groupId}</small></div></article>)}</div>
      {!events.length && <p>Nenhum evento registrado.</p>}
    </>}
  </section>;
}
