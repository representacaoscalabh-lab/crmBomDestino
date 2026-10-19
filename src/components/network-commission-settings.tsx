"use client";

import { useState } from "react";
import { Network, Percent, Save } from "lucide-react";
import { deleteField, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useCrmStore } from "@/lib/store";
import { useMartMinasSettings } from "@/lib/mart-minas-settings";
import { useOesaNovaSafraSettings } from "@/lib/oesa-nova-safra-settings";
import { parseCommissionPercent } from "@/lib/network-commission";
import "./network-commission-settings.css";

function NetworkCard({ settingId, label, groupId, loading, error }: { settingId: string; label: string; groupId: string; loading: boolean; error: string }) {
  const { customerGroups, customers } = useCrmStore();
  const [selection, setSelection] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [percentDraft, setPercentDraft] = useState<string | null>(null);
  const [sellerDraft, setSellerDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const selected = selection ?? groupId;
  const group = customerGroups.find((entry) => entry.id === selected);
  const name = nameDraft ?? group?.name ?? "";
  const percent = percentDraft ?? (group?.commissionPercent === undefined ? "" : String(group.commissionPercent));
  const sellerPercent = sellerDraft ?? (group?.sellerCommissionPercent === undefined ? "" : String(group.sellerCommissionPercent));
  const sellerBase = "orders";
  const count = customers.filter((customer) => customer.groupId === selected).length;
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage(""); setFailed(false);
    const value = parseCommissionPercent(percent);
    const sellerValue = sellerPercent.trim() ? parseCommissionPercent(sellerPercent) : null;
    if (selected && sellerPercent.trim() && (sellerValue === null || !["orders", "representation"].includes(sellerBase))) { setFailed(true); setMessage("Informe o percentual do vendedor de 0 a 100% e escolha a base de cálculo."); return; }
    if (selected && (!group || !name.trim() || value === null)) { setFailed(true); setMessage("Informe o nome e uma comissão de 0 a 100% para a rede selecionada."); return; }
    if (group && customerGroups.some((entry) => entry.id !== group.id && entry.name.trim().toLocaleLowerCase("pt-BR") === name.trim().toLocaleLowerCase("pt-BR"))) { setFailed(true); setMessage("Já existe outra rede com esse nome."); return; }
    setBusy(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "settings", settingId), { groupId: selected, reportName: selected ? name.trim() : label, updatedAt: serverTimestamp() });
      if (group) batch.update(doc(db, "customer_groups", group.id), { name: name.trim(), commissionPercent: value, sellerCommissionPercent: sellerValue ?? deleteField(), sellerCommissionBase: sellerValue !== null ? sellerBase : deleteField(), updatedAt: serverTimestamp() });
      await batch.commit();
      setMessage("Rede e comissão salvas.");
    } catch { setFailed(true); setMessage("Não foi possível salvar. Confira a conexão e as permissões do Firestore."); }
    finally { setBusy(false); }
  }
  return <form className="network-settings-card" onSubmit={(event) => void save(event)}>
    <header><span className="network-settings-icon"><Network size={21} /></span><div><small>RELATÓRIO DA REDE</small><h3>{label}</h3></div><span className={`network-settings-badge ${group ? "is-configured" : ""}`}>{group ? `${count} loja${count === 1 ? "" : "s"}` : "Não configurado"}</span></header>
    <fieldset disabled={busy || loading || !!error}>
      <label>Rede vinculada<select value={selected} onChange={(event) => { setSelection(event.target.value); setNameDraft(null); setPercentDraft(null); setSellerDraft(null); setMessage(""); }}><option value="">Nenhuma rede selecionada</option>{selected && !group && <option value={selected}>Rede removida — escolha outra</option>}{customerGroups.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      {group && <div className="network-settings-fields"><label>Nome da rede e do relatório<input required maxLength={100} value={name} onChange={(event) => { setNameDraft(event.target.value); setMessage(""); }} placeholder="Nome para identificar a rede" /><small>Atualiza o cadastro da rede e o nome exibido no relatório.</small></label><label>Nossa comissão<div className="network-percent-input"><input required inputMode="decimal" value={percent} onChange={(event) => { setPercentDraft(event.target.value); setMessage(""); }} placeholder="Ex.: 3,5" aria-label={`Percentual de comissão de ${label}`} /><span>%</span></div><small>Comissão da representação sobre o valor dos pedidos.</small></label></div>}
      {group && <div className="network-settings-fields"><label>Comissão do vendedor<div className="network-percent-input"><input inputMode="decimal" value={sellerPercent} onChange={(event) => { setSellerDraft(event.target.value); setMessage(""); }} placeholder="Não cadastrada" aria-label={`Comissão do vendedor em ${label}`} /><span>%</span></div><small>Percentual sobre o valor dos pedidos, independente da nossa comissão. Deixe vazio se ainda não estiver definido.</small></label></div>}
    </fieldset>
    {(error || message) && <p className={error || failed ? "form-error" : "network-settings-success"} role={error || failed ? "alert" : "status"}>{error || message}</p>}
    <footer><span>{group?.commissionPercent !== undefined ? `Comissão cadastrada: ${group.commissionPercent.toLocaleString("pt-BR")}%` : "Comissão ainda não cadastrada"}</span><button className="button button-primary" type="submit" disabled={busy || loading || !!error}><Save size={15} />{busy ? "Salvando..." : "Salvar alterações"}</button></footer>
  </form>;
}

export function NetworkCommissionSettings() {
  const { crmUser } = useAuth();
  const mart = useMartMinasSettings();
  const oesa = useOesaNovaSafraSettings();
  if (crmUser?.role !== "admin") return null;
  return <section className="panel settings-section-panel network-commission-settings"><div className="settings-section-heading"><span className="settings-section-icon"><Percent size={20} /></span><div><h2>Redes e comissões</h2><p>Escolha as redes dos relatórios, personalize os nomes e cadastre a comissão de cada uma.</p></div></div><div className="network-settings-list"><NetworkCard settingId="mart_minas" label="Mart Minas" {...mart} /><NetworkCard settingId="oesa_nova_safra" label="OESA - Nova Safra" {...oesa} /></div><p className="settings-note">O percentual pertence à rede vinculada. Alterar o nome preserva as lojas e o histórico de pedidos.</p></section>;
}
