"use client";

import { useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useCrmStore } from "@/lib/store";
import { useMartMinasSettings } from "@/lib/mart-minas-settings";

export function MartMinasSettings() {
  const { crmUser } = useAuth();
  const { customerGroups } = useCrmStore();
  const { groupId, loading, error } = useMartMinasSettings();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const selected = draft ?? groupId;
  if (crmUser?.role !== "admin") return null;
  return <section className="panel settings-section-panel">
    <div className="settings-section-heading"><div><h2>Relatório Mart Minas</h2><p>Escolha a rede usada nesta página. Somente administradores podem alterar esta configuração.</p></div></div>
    <form className="settings-term-form" onSubmit={async (event) => {
      event.preventDefault();
      if (saving || (selected && !customerGroups.some((group) => group.id === selected))) return;
      setSaving(true); setMessage("");
      try {
        await setDoc(doc(db, "settings", "mart_minas"), { groupId: selected, updatedAt: serverTimestamp() });
        setMessage("Rede do relatório salva.");
      } catch { setMessage("Não foi possível salvar. Confira a conexão e as permissões do Firestore."); }
      finally { setSaving(false); }
    }}>
      <label>Rede do relatório<select value={selected} disabled={loading || !!error || saving} onChange={(event) => { setDraft(event.target.value); setMessage(""); }}>
        <option value="">Nenhuma rede selecionada</option>
        {groupId && !customerGroups.some((group) => group.id === groupId) && <option value={groupId}>Rede removida — escolha outra</option>}
        {customerGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select></label>
      <button className="button button-primary" disabled={loading || !!error || saving}>{saving ? "Salvando..." : "Salvar rede"}</button>
    </form>
    {(message || error) && <p role="status">{error || message}</p>}
    <p className="settings-note">O relatório separa Representação WRRJ, Sul de Minas e o consolidado, conforme o cadastro atual das lojas na rede.</p>
  </section>;
}
