"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { Pencil, Search, Trash2, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { validateTeamEdit, type TeamMember } from "@/lib/team-access";
import "./team-access-members.css";

const statusLabel = { approved: "Ativo", pending: "Aguardando aprovação", rejected: "Acesso bloqueado" };

export function TeamAccessMembers() {
  const { crmUser } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState<TeamMember | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("user");
  const [status, setStatus] = useState("approved");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (crmUser?.role !== "admin") return;
    return onSnapshot(collection(db, "users"), (snapshot) => {
      setMembers(snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id } as TeamMember)).sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || "", "pt-BR")));
      setLoading(false); setLoadError("");
    }, () => { setLoadError("Não foi possível carregar a equipe. Confira a conexão e as permissões."); setLoading(false); });
  }, [crmUser?.role]);
  useEffect(() => {
    if (!editing && !deleting) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { setEditing(null); setDeleting(null); setError(""); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [editing, deleting, busy]);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy || crmUser?.role !== "admin") return;
    setError(""); setBusy(true);
    try {
      const changes = validateTeamEdit(crmUser.uid, editing.id, name, role, status);
      await runTransaction(db, async (transaction) => {
        const ref = doc(db, "users", editing.id);
        const request = doc(db, "access_requests", editing.id);
        const userSnapshot = await transaction.get(ref);
        const requestSnapshot = await transaction.get(request);
        if (!userSnapshot.exists()) throw new Error("O usuário foi removido. Atualize a lista.");
        transaction.update(ref, { ...changes, updatedAt: serverTimestamp() });
        if (requestSnapshot.exists()) transaction.update(request, { name: changes.name, status: changes.status, resolvedBy: crmUser.uid, resolvedAt: serverTimestamp() });
      });
      setEditing(null); setMessage("Acesso atualizado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o acesso."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting || busy || crmUser?.role !== "admin") return;
    if (deleting.id === crmUser.uid) { setError("Você não pode excluir seu próprio acesso."); return; }
    setBusy(true); setError("");
    try {
      await runTransaction(db, async (transaction) => {
        const ref = doc(db, "users", deleting.id);
        const request = doc(db, "access_requests", deleting.id);
        const snapshot = await transaction.get(ref);
        const requestSnapshot = await transaction.get(request);
        if (!snapshot.exists()) throw new Error("O usuário já foi removido.");
        transaction.delete(ref);
        if (requestSnapshot.exists()) transaction.delete(request);
      });
      setDeleting(null); setMessage("Cadastro de acesso removido do CRM.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir o acesso."); }
    finally { setBusy(false); }
  }
  if (crmUser?.role !== "admin") return null;
  const visible = members.filter((member) => `${member.name} ${member.email}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")) && (filter === "all" || member.status === filter));
  return <div className="team-members">
    <div className="team-members-toolbar"><label className="search-field"><Search size={16} /><input aria-label="Buscar usuário cadastrado" placeholder="Buscar nome ou email" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filtrar situação do acesso" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Todos os acessos</option><option value="approved">Ativos</option><option value="pending">Aguardando</option><option value="rejected">Bloqueados</option></select><span>{visible.length} de {members.length} usuários</span></div>
    {loadError && <p className="form-error" role="alert">{loadError}</p>}{message && <p className="team-members-success" role="status">{message}</p>}
    {loading ? <p role="status">Carregando equipe...</p> : <div className="table-wrap"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Acesso</th><th>Ações</th></tr></thead><tbody>{visible.map((member) => <tr key={member.id}><td><strong>{member.name || "Sem nome"}{member.id === crmUser.uid ? " (você)" : ""}</strong><small>{member.email}</small></td><td>{member.role === "admin" ? "Administrador" : "Usuário"}</td><td><span className={`team-member-status ${member.status}`}>{statusLabel[member.status] ?? member.status}</span></td><td><div className="team-member-actions"><button type="button" className="button button-outline button-small" onClick={() => { setEditing(member); setName(member.name || ""); setRole(member.role); setStatus(member.status); setError(""); setMessage(""); }}><Pencil size={14} /> Editar acesso</button><button type="button" className="icon-button" disabled={member.id === crmUser.uid} aria-label={`Excluir acesso de ${member.name || member.email}`} title={member.id === crmUser.uid ? "Seu próprio acesso não pode ser excluído" : "Excluir acesso"} onClick={() => { setDeleting(member); setError(""); setMessage(""); }}><Trash2 size={16} /></button></div></td></tr>)}{!visible.length && <tr><td colSpan={4}>Nenhum usuário corresponde aos filtros.</td></tr>}</tbody></table></div>}
    {(editing || deleting) && <div className="modal-backdrop settings-modal-backdrop"><section className="settings-approval-modal team-access-modal" role="dialog" aria-modal="true" aria-labelledby="team-access-title"><div className="team-access-modal-heading"><h2 id="team-access-title">{editing ? "Editar acesso" : "Excluir acesso?"}</h2><button className="icon-button" aria-label="Fechar" disabled={busy} onClick={() => { setEditing(null); setDeleting(null); setError(""); }}><X size={20} /></button></div>
      {editing ? <form onSubmit={(event) => void save(event)}><label>Nome<input required maxLength={150} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label><label>Email<input readOnly value={editing.email} /></label><label>Perfil<select value={role} disabled={busy || editing.id === crmUser.uid} onChange={(event) => setRole(event.target.value)}><option value="user">Usuário</option><option value="admin">Administrador</option></select></label><label>Situação do acesso<select value={status} disabled={busy || editing.id === crmUser.uid} onChange={(event) => setStatus(event.target.value)}><option value="approved">Ativo</option><option value="pending">Aguardando aprovação</option><option value="rejected">Bloqueado</option></select></label>{editing.id === crmUser.uid && <p>Você pode editar seu nome. Peça a outro administrador para alterar seu perfil ou acesso.</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="settings-modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Salvando..." : "Salvar acesso"}</button></div></form> : <><p><strong>{deleting?.name || deleting?.email}</strong></p><p>O cadastro e a solicitação de acesso serão removidos do CRM. Os dados comerciais serão preservados. A conta Google não é excluída; um novo login precisará de nova aprovação.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="settings-modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button><button type="button" className="button button-danger" disabled={busy} onClick={() => void remove()}>{busy ? "Excluindo..." : "Excluir acesso"}</button></div></>}
    </section></div>}
  </div>;
}
