"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Search,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { collection, onSnapshot, query, where, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { useCrmStore } from "@/lib/store";
import type { PaymentTerm } from "@/lib/types";
import "./settings.css";
import { MartMinasSettings } from "@/components/mart-minas-settings";

import { SellerSettings } from "@/components/seller-settings";

type AccessRequest = { id: string; uid: string; email: string; name: string; status: string };
type SettingsSection = "access" | "payment-terms" | "mart-minas" | "sellers";

export default function SettingsPage() {
  const { crmUser } = useAuth();
  const { paymentTerms, addPaymentTerm, updatePaymentTerm, deletePaymentTerm } = useCrmStore();
  const [section, setSection] = useState<SettingsSection>("access");
  const [paymentCode, setPaymentCode] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [editingTerm, setEditingTerm] = useState<PaymentTerm | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [savingTerm, setSavingTerm] = useState(false);
  const [termSearch, setTermSearch] = useState("");
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  const visibleTerms = paymentTerms.filter((term) => `${term.code} ${term.term}`.toLocaleLowerCase("pt-BR").includes(termSearch.toLocaleLowerCase("pt-BR"))).sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));

  useEffect(() => {
    if (crmUser?.role !== "admin") return;
    return onSnapshot(query(collection(db, "access_requests"), where("status", "==", "pending")), (snapshot) => {
      setRequests(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as AccessRequest));
      setError("");
    }, (cause) => {
      console.error("Falha ao carregar solicitações de acesso.", cause);
      setError("Não foi possível carregar as solicitações. Confira as regras do Firestore.");
    });
  }, [crmUser?.role]);

  useEffect(() => {
    if (!selectedRequest) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !working) setSelectedRequest(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedRequest, working]);

  async function savePaymentTerm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = paymentCode.trim();
    const term = paymentDescription.trim();
    if (paymentTerms.some((item) => item.id !== editingTerm?.id && item.code.toLowerCase() === code.toLowerCase())) {
      setPaymentError("Este código já está cadastrado.");
      return;
    }
    setSavingTerm(true);
    setPaymentError("");
    try {
      if (editingTerm) await updatePaymentTerm(editingTerm.id, { code, term });
      else await addPaymentTerm({ code, term });
      setPaymentCode("");
      setPaymentDescription("");
      setEditingTerm(null);
    } catch (cause) {
      console.error("Falha ao salvar condição de pagamento.", cause);
      setPaymentError("Não foi possível salvar o prazo de pagamento.");
    } finally {
      setSavingTerm(false);
    }
  }

  function editPaymentTerm(term: PaymentTerm) {
    setEditingTerm(term);
    setPaymentCode(term.code);
    setPaymentDescription(term.term);
    setPaymentError("");
  }

  async function removePaymentTerm(term: PaymentTerm) {
    setPaymentError("");
    try {
      await deletePaymentTerm(term.id);
    } catch (cause) {
      console.error("Falha ao excluir condição de pagamento.", cause);
      setPaymentError("Não foi possível excluir este prazo.");
    }
  }

  async function resolveRequest(request: AccessRequest, status: "approved" | "rejected") {
    setWorking(request.id);
    setError("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "users", request.uid), { status, updatedAt: serverTimestamp() });
      batch.update(doc(db, "access_requests", request.id), { status, resolvedAt: serverTimestamp(), resolvedBy: crmUser?.uid });
      await batch.commit();
      setSelectedRequest(null);
    } catch (cause) {
      console.error("Falha ao atualizar a solicitação de acesso.", cause);
      setError("Não foi possível atualizar a solicitação. Tente novamente.");
    } finally {
      setWorking("");
    }
  }

  function cancelPaymentEdit() {
    setEditingTerm(null);
    setPaymentCode("");
    setPaymentDescription("");
    setPaymentError("");
  }

  if (crmUser?.role !== "admin") return <div className="page-content"><div className="panel page-empty"><span className="page-empty-icon"><ShieldCheck size={23} /></span><strong>Área exclusiva para administradores</strong><p>Seu perfil não tem permissão para gerenciar acessos.</p></div></div>;

  return (
    <div className="page-content settings-page">
      <section className="settings-hero">
        <div className="settings-hero-copy">
          <div><p className="eyebrow">SEU ESPAÇO DE GESTÃO</p><h1>Configurações</h1><p>Organize os acessos e as condições comerciais da sua equipe.</p></div>
        </div>
        <span className="admin-pill"><BadgeCheck size={16} /> Administrador</span>
      </section>

      {error && <div className="import-feedback feedback-warning" role="alert">{error}</div>}

      <div className="settings-workspace">
      <aside className="settings-menu">
      <p className="settings-menu-label">GERENCIAR</p>
      <nav className="settings-tabs" aria-label="Seções de configurações">
        <button type="button" className={section === "access" ? "settings-tab settings-tab-active" : "settings-tab"} onClick={() => setSection("access")} aria-current={section === "access" ? "page" : undefined}>
          <UsersRound size={18} /><span className="settings-tab-copy"><strong>Acessos da equipe</strong><small>Revise novas solicitações</small></span><span className="settings-tab-count">{requests.length}</span>
        </button>
        <button type="button" className={section === "payment-terms" ? "settings-tab settings-tab-active" : "settings-tab"} onClick={() => setSection("payment-terms")} aria-current={section === "payment-terms" ? "page" : undefined}>
          <CreditCard size={18} /><span className="settings-tab-copy"><strong>Condições de pagamento</strong><small>Prazos usados nos pedidos</small></span>
        </button>
      <button type="button" className={section === "mart-minas" ? "settings-tab settings-tab-active" : "settings-tab"} onClick={() => setSection("mart-minas")} aria-current={section === "mart-minas" ? "page" : undefined}><span className="settings-tab-copy"><strong>Relatório Mart Minas</strong><small>Defina a rede do relatório</small></span></button>
        <button type="button" className={section === "sellers" ? "settings-tab settings-tab-active" : "settings-tab"} onClick={() => setSection("sellers")} aria-current={section === "sellers" ? "page" : undefined}><UsersRound size={18} /><span className="settings-tab-copy"><strong>Vendedores</strong><small>Vendedores das redes</small></span></button>
      </nav>
      <div className="settings-account"><span className="settings-account-avatar"><UserRound size={18} /></span><div><strong>{crmUser.name || "Administrador"}</strong><small>{crmUser.email}</small></div><BadgeCheck size={16} /></div>
      </aside>
      <div className="settings-main">

      {section === "sellers" ? <SellerSettings /> : section === "mart-minas" ? <MartMinasSettings /> : section === "access" ? (
        <section className="panel settings-section-panel">
          <div className="settings-section-heading">
            <span className="settings-section-icon"><UserRound size={19} /></span>
            <div><h2>Acessos da equipe</h2><p>Revise os dados e decida quem pode acessar o CRM.</p></div>
            <span className="request-count">{requests.length}</span>
          </div>
          {requests.length ? (
            <div className="settings-request-list">
              {requests.map((request) => <article className="settings-request-card" key={request.id}>
                <span className="request-avatar"><UserRound size={19} /></span>
                <div className="request-copy"><strong>{request.name || "Usuário sem nome"}</strong><small>{request.email}</small></div>
                <span className="settings-pending-status"><Clock3 size={14} /> Aguardando</span>
                <button className="button button-outline" type="button" onClick={() => setSelectedRequest(request)}>Revisar acesso</button>
              </article>)}
            </div>
          ) : (
            <div className="settings-empty-state">
              <span><CheckCircle2 size={28} /></span><strong>Todos os acessos em dia</strong><p>Novas solicitações aparecerão aqui para sua revisão.</p>
            </div>
          )}
          <div className="settings-note"><ShieldCheck size={16} /><span>Somente administradores podem aprovar ou recusar novos acessos.</span></div>
        </section>
      ) : (
        <section className="panel settings-section-panel settings-terms-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon settings-terms-icon"><CreditCard size={19} /></span>
            <div><h2>Condições de pagamento</h2><p>Defina os prazos disponíveis para clientes e pedidos.</p></div><span className="request-count">{paymentTerms.length}</span>
          </div>
          <div className="settings-form-title"><strong>{editingTerm ? "Editar condição" : "Adicionar condição"}</strong><span>{editingTerm ? "Atualize o código e a descrição abaixo." : "Use um código curto e uma descrição fácil de identificar."}</span></div>
          <form className="settings-term-form" onSubmit={(event) => void savePaymentTerm(event)}>
            <label><span>Código</span><input required maxLength={30} value={paymentCode} onChange={(event) => setPaymentCode(event.target.value)} placeholder="Ex.: 28" /></label>
            <label><span>Descrição do prazo</span><input required maxLength={80} value={paymentDescription} onChange={(event) => setPaymentDescription(event.target.value)} placeholder="Ex.: 28 dias" /></label>
            <div className="settings-term-actions">
              <button className="button button-primary" type="submit" disabled={savingTerm}>{savingTerm ? "Salvando..." : editingTerm ? <><Check size={15} /> Salvar alteração</> : <><Plus size={16} /> Cadastrar prazo</>}</button>
              {editingTerm && <button className="button button-outline" type="button" onClick={cancelPaymentEdit}>Cancelar</button>}
            </div>
          </form>
          {paymentError && <div className="import-feedback feedback-warning" role="alert">{paymentError}</div>}
          <div className="settings-list-toolbar"><span>{visibleTerms.length} de {paymentTerms.length} condições</span><label className="search-field"><Search size={17} /><input aria-label="Buscar condições de pagamento" placeholder="Buscar código ou descrição" value={termSearch} onChange={(event) => setTermSearch(event.target.value)} /></label></div>
          {visibleTerms.length ? (
            <div className="settings-term-list">
              {visibleTerms.map((term) => <article className="settings-term-card" key={term.id}>
                <span className="settings-term-code">{term.code}</span><div><strong>{term.term}</strong><small>Condição de pagamento</small></div>
                <div className="product-row-actions"><button className="table-action" type="button" aria-label={`Editar prazo ${term.code}`} onClick={() => editPaymentTerm(term)}><Pencil size={15} /></button><button className="table-action product-delete-action" type="button" aria-label={`Excluir prazo ${term.code}`} onClick={() => void removePaymentTerm(term)}><Trash2 size={15} /></button></div>
              </article>)}
            </div>
          ) : (
            <div className="settings-empty-state settings-terms-empty"><span><CreditCard size={23} /></span><strong>{termSearch ? "Nenhuma condição encontrada" : "Nenhuma condição cadastrada"}</strong><p>{termSearch ? "Tente outro código ou descrição." : "Adicione uma condição acima para usá-la nos pedidos."}</p>{termSearch && <button type="button" className="button button-outline" onClick={() => setTermSearch("")}>Limpar busca</button>}</div>
          )}
        </section>
      )}

      <p className="settings-footnote"><ShieldCheck size={14} /> Configurações disponíveis apenas para administradores.</p>
      </div>
      </div>

      {selectedRequest && <div className="modal-backdrop settings-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) setSelectedRequest(null); }}>
        <section className="settings-approval-modal" role="dialog" aria-modal="true" aria-labelledby="settings-approval-title">
          <div className="settings-modal-heading">
            <span><ShieldCheck size={21} /></span><button className="icon-button" type="button" aria-label="Fechar modal" onClick={() => setSelectedRequest(null)} disabled={Boolean(working)}><X size={19} /></button>
          </div>
          <p className="eyebrow">REVISÃO DE ACESSO</p><h2 id="settings-approval-title">Aprovar usuário?</h2>
          <p className="settings-modal-description">Confirme os dados antes de conceder acesso ao sistema.</p>
          <div className="settings-user-detail"><span className="request-avatar"><UserRound size={21} /></span><div><strong>{selectedRequest.name || "Usuário sem nome"}</strong><small>{selectedRequest.email}</small></div></div>
          <div className="settings-approval-info"><CheckCircle2 size={16} /><span>Após a aprovação, o usuário poderá acessar os dados comerciais do CRM.</span></div>
          {error && <div className="import-feedback feedback-warning" role="alert">{error}</div>}
          <div className="settings-modal-actions">
            <button className="button button-outline reject-button" type="button" disabled={Boolean(working)} onClick={() => void resolveRequest(selectedRequest, "rejected")}>{working === selectedRequest.id ? "Processando..." : "Recusar acesso"}</button>
            <button className="button button-primary" type="button" disabled={Boolean(working)} onClick={() => void resolveRequest(selectedRequest, "approved")}><Check size={16} /> {working === selectedRequest.id ? "Processando..." : "Aprovar usuário"}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
