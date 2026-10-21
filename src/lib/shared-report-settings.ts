"use client";

import { useEffect, useSyncExternalStore } from "react";
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { recordFirestoreRead } from "@/lib/firestore-metrics";

type State = { groupId: string; reportName: string; loading: boolean; error: string };
const initial: State = { groupId: "", reportName: "", loading: true, error: "" };
type Entry = { value: State; listeners: Set<() => void>; stop?: Unsubscribe; release?: ReturnType<typeof setTimeout> };
const entries = new Map<string, Entry>();
function entryFor(key: string) {
  let entry = entries.get(key);
  if (!entry) { entry = { value: initial, listeners: new Set() }; entries.set(key, entry); }
  return entry;
}
export function useSharedReportSettings(name: "mart_minas" | "oesa_nova_safra") {
  const { crmUser } = useAuth();
  const uid = crmUser?.status === "approved" ? crmUser.uid : "";
  const key = `${uid}:${name}`;
  const state = useSyncExternalStore(listener => {
    if (!uid) return () => {};
    const entry = entryFor(key);
    clearTimeout(entry.release);
    entry.listeners.add(listener);
    if (!entry.stop) {
      entry.stop = onSnapshot(doc(db, "settings", name), snapshot => {
        recordFirestoreRead(`settings/${name}`, snapshot.exists() ? 1 : 0, snapshot.metadata.fromCache);
        entry.value = { groupId: snapshot.data()?.groupId ?? "", reportName: snapshot.data()?.reportName ?? "", loading: false, error: "" };
        entry.listeners.forEach(notify => notify());
      }, () => {
        entry.value = { ...initial, loading: false, error: "Não foi possível carregar a configuração do relatório." };
        entry.listeners.forEach(notify => notify());
      });
    }
    return () => {
      entry.listeners.delete(listener);
      // Avoid reconnecting for Strict Mode's setup/cleanup/setup cycle.
      if (!entry.listeners.size) entry.release = setTimeout(() => { entry.stop?.(); entries.delete(key); }, 0);
    };
  }, () => uid ? entryFor(key).value : initial, () => initial);
  useEffect(() => {
    for (const [otherKey, entry] of entries) if (!uid || !otherKey.startsWith(`${uid}:`)) {
      clearTimeout(entry.release); entry.stop?.(); entries.delete(otherKey);
    }
  }, [uid]);
  return state;
}
