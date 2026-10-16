"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export function useSellers() {
  const { crmUser } = useAuth();
  const approved = crmUser?.status === "approved";
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!approved) return;
    return onSnapshot(collection(db, "sellers"), (snapshot) => {
      setSellers(snapshot.docs.map((item) => ({ id: item.id, name: String(item.data().name ?? "") })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setLoading(false);
      setError("");
    }, () => {
      setLoading(false);
      setError("Não foi possível carregar os vendedores. Confira a conexão e as permissões do Firestore.");
    });
  }, [approved]);
  return { sellers, loading, error };
}
