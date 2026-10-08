"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
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

type AccessRequest = { id: string; uid: string; email: string; name: string; status: string };
type SettingsSection = "access" | "payment-terms";

export default function SettingsPage() {
  const { crmUser } = useAuth();
  const { paymentTerms, addPaymentTerm, updatePaymentTerm, deletePaymentTerm } = useCrmStore();
  const [section, setSection] = useState<SettingsSection>("access");
  const [paymentCode, setPaymentCode] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [editingTerm, setEditingTerm] = useState<PaymentTerm | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [savingTerm, setSavingTerm] = useState(false);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");

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
          <span className="settings-hero-icon"><ShieldCheck size={22} /></span>
          <div><p className="eyebrow">ADMINISTRAÇÃO DO SISTEMA</p><h1>Configurações</h1><p>Gerencie o acesso da equipe e os prazos usados nos pedidos.</p></div>
        </div>
        <span className="admin-pill"><BadgeCheck size={16} /> Administrador</span>
      </section>

      {error && <div className="import-feedback feedback-warning" role="alert">{error}</div>}

      <section className="settings-overview" aria-label="Resumo das configurações">
        <article className="settings-summary-card">
          <span className="settings-summary-icon settings-summary-access"><UsersRound size={19} /></span>
          <div><small>Solicitações aguardando</small><strong>{requests.length}</strong><span>Acessos pendentes de revisão</span></div>
        </article>
        <article className="settings-summary-card">
          <span className="settings-summary-icon settings-summary-terms"><CreditCard size={19} /></span>
          <div><small>Prazos cadastrados</small><strong>{paymentTerms.length}</strong><span>Disponíveis ao criar pedidos</span></div>
        </article>
      </section>

      <nav className="settings-tabs" aria-label="Seções de configurações">
        <button type="button" className={section === "access" ? "settings-tab settings-tab-active" : "settings-tab"} onClick={() => setSection("access")} aria-current={section === "access" ? "page" : undefined}>
          <UsersRound size={17} /> Aprovação de usuários <span>{requests.length}</span>
        </button>
        <button type="button" className={section === "payment-terms" ? "settings-tab settings-tab-active" : "settings-tab"} onClick={() => setSection("payment-terms")} aria-current={section === "payment-terms" ? "page" : undefined}>
          <CreditCard size={17} /> Prazos de pagamento
        </button>
      </nav>

      {section === "access" ? (
        <section className="panel settings-section-panel">
          <div className="settings-section-heading">
            <span className="settings-section-icon"><UserRound size={19} /></span>
            <div><p className="eyebrow">CONTROLE DE ACESSO</p><h2>Aprovação de usuários</h2><p>Revise cada solicitação antes de liberar o acesso ao CRM.</p></div>
            <span className="request-count">{requests.length}</span>
          </div>
          {requests.length ? (
            <div className="settings-request-list">
              {requests.map((request) => <article className="settings-request-card" key={request.id}>
                <span className="request-avatar"><UserRound size={19} /></span>
                <div className="request-copy"><strong>{request.name || "Usuário sem nome"}</strong><small>{request.email}</small></div>
                <span className="settings-pending-status"><Clock3 size={14} /> Aguardando</span>
                <button className="button button-primary" type="button" onClick={() => setSelectedRequest(request)}>Revisar solicitação</button>
              </article>)}
            </div>
          ) : (
            <div className="settings-empty-state">
              <span><CheckCircle2 size={24} /></span><strong>Tudo em dia</strong><p>Nenhuma solicitação de acesso aguardando aprovação.</p>
            </div>
          )}
          <div className="settings-note"><ShieldCheck size={16} /><span>Somente administradores podem aprovar ou recusar novos acessos.</span></div>
        </section>
      ) : (
        <section className="panel settings-section-panel settings-terms-section">
          <div className="settings-section-heading">
            <span className="settings-section-icon settings-terms-icon"><CreditCard size={19} /></span>
            <div><p className="eyebrow">PEDIDOS</p><h2>Prazos de pagamento</h2><p>Cadastre as condições que poderão ser selecionadas ao registrar um pedido.</p></div>
          </div>
          <form className="settings-term-form" onSubmit={(event) => void savePaymentTerm(event)}>
            <label><span>Código</span><input required maxLength={30} value={paymentCode} onChange={(event) => setPaymentCode(event.target.value)} placeholder="Ex.: 28" /></label>
            <label><span>Descrição do prazo</span><input required maxLength={80} value={paymentDescription} onChange={(event) => setPaymentDescription(event.target.value)} placeholder="Ex.: 28 dias" /></label>
            <div className="settings-term-actions">
              <button className="button button-primary" type="submit" disabled={savingTerm}>{savingTerm ? "Salvando..." : editingTerm ? <><Check size={15} /> Salvar alteração</> : <><Plus size={16} /> Cadastrar prazo</>}</button>
              {editingTerm && <button className="button button-outline" type="button" onClick={cancelPaymentEdit}>Cancelar</button>}
            </div>
          </form>
          {paymentError && <div className="import-feedback feedback-warning" role="alert">{paymentError}</div>}
          {paymentTerms.length ? (
            <div className="settings-term-list">
              {paymentTerms.slice().sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true })).map((term) => <article className="settings-term-card" key={term.id}>
                <span className="settings-term-code">{term.code}</span><div><strong>{term.term}</strong><small>Condição de pagamento</small></div>
                <div className="product-row-actions"><button className="table-action" type="button" aria-label={`Editar prazo ${term.code}`} onClick={() => editPaymentTerm(term)}><Pencil size={15} /></button><button className="table-action product-delete-action" type="button" aria-label={`Excluir prazo ${term.code}`} onClick={() => void removePaymentTerm(term)}><Trash2 size={15} /></button></div>
              </article>)}
            </div>
          ) : (
            <div className="settings-empty-state settings-terms-empty"><span><CreditCard size={23} /></span><strong>Nenhum prazo cadastrado</strong><p>Adicione uma condição acima para disponibilizá-la nos pedidos.</p></div>
          )}
        </section>
      )}

      <div className="info-banner admin-info"><span className="info-banner-icon"><ShieldCheck size={18} /></span><div><strong>Administrador inicial</strong><p>O primeiro administrador é criado pelo servidor quando a conta Google corresponde ao e-mail configurado em <code>FIREBASE_ADMIN_EMAIL</code>.</p></div></div>

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
