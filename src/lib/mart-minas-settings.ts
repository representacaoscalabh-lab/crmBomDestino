"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export function useMartMinasSettings() {
  const { crmUser } = useAuth();
  const [state, setState] = useState({ groupId: "", loading: true, error: "" });
  useEffect(() => {
    if (crmUser?.status !== "approved") return;
    return onSnapshot(doc(db, "settings", "mart_minas"), (snapshot) => {
      setState({ groupId: snapshot.data()?.groupId ?? "", loading: false, error: "" });
    }, () => setState({ groupId: "", loading: false, error: "Não foi possível carregar a rede do relatório. Confira a conexão e as regras do Firestore." }));
  }, [crmUser?.status]);
  return state;
}
