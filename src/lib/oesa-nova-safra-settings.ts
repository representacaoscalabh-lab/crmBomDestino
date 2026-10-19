"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export function useOesaNovaSafraSettings() {
  const { crmUser } = useAuth();
  const [state, setState] = useState({ groupId: "", reportName: "", loading: true, error: "" });
  useEffect(() => {
    if (crmUser?.status !== "approved") return;
    return onSnapshot(doc(db, "settings", "oesa_nova_safra"), (snapshot) => {
      setState({ groupId: snapshot.data()?.groupId ?? "", reportName: snapshot.data()?.reportName ?? "", loading: false, error: "" });
    }, () => setState({ groupId: "", reportName: "", loading: false, error: "Não foi possível carregar a rede do relatório. Confira a conexão e as regras do Firestore." }));
  }, [crmUser?.status]);
  return state;
}
