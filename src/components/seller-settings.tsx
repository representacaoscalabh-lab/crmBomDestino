"use client";

import { useState } from "react";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useSellers } from "@/lib/sellers";

export function SellerSettings() {
  const { sellers, loading, error } = useSellers();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  return <section className="panel settings-section-panel">
    <div className="settings-section-heading"><div><h2>Vendedores</h2><p>Cadastre os vendedores disponíveis no gerenciamento de redes.</p></div><span className="request-count">{sellers.length}</span></div>
    <form className="settings-term-form" onSubmit={async (event) => {
      event.preventDefault();
      const trimmed = name.trim().replace(/\s+/g, " ");
      if (!trimmed || saving || loading || error) return;
      setSaving(true); setMessage("");
      try {
        const ref = doc(db, "sellers", encodeURIComponent(trimmed.normalize("NFC").toLocaleLowerCase("pt-BR")));
        await runTransaction(db, async (transaction) => {
          if ((await transaction.get(ref)).exists()) throw new Error("duplicate");
          transaction.set(ref, { name: trimmed, createdAt: serverTimestamp() });
        });
        setName(""); setMessage("Vendedor cadastrado.");
      } catch (cause) {
        setMessage(cause instanceof Error && cause.message === "duplicate" ? "Este vendedor já está cadastrado." : "Não foi possível cadastrar o vendedor.");
      } finally { setSaving(false); }
    }}>
      <label>Nome do vendedor<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do vendedor" /></label>
      <button className="button button-primary" disabled={saving || loading || !!error}>{saving ? "Salvando..." : "Cadastrar vendedor"}</button>
    </form>
    {(error || message) && <p role="status">{error || message}</p>}
    <div className="settings-request-list">{sellers.map((seller) => <article className="settings-request-card" key={seller.id}><strong>{seller.name}</strong></article>)}</div>
    {!loading && !error && sellers.length === 0 && <p className="settings-note">Nenhum vendedor cadastrado.</p>}
  </section>;
}
