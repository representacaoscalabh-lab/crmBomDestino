"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

export type RemittanceNetwork = "mart_minas" | "oesa";
export type RemittanceSource = "manual" | "mart_minas_pdf" | "oesa_pdf";
export type RemittanceStatus = "ready" | "processing" | "failed";
export type RemittanceEventType = "created" | "import_started" | "import_completed" | "import_failed" | "records_assigned" | "renamed";

export type OrderRemittance = {
  id: string;
  groupId: string;
  network: RemittanceNetwork;
  name: string;
  source: RemittanceSource;
  sourceFile?: string;
  status: RemittanceStatus;
  createdAt?: Timestamp;
  createdBy?: string;
  createdByName?: string;
};

export type OrderRemittanceEvent = {
  id: string;
  groupId: string;
  remittanceId: string;
  remittanceName: string;
  type: RemittanceEventType;
  details: string;
  actorId: string;
  actorName: string;
  createdAt?: Timestamp;
};

export type RemittanceRecordRef = { collection: "orders" | "bonifications"; id: string };

type RemittanceSnapshotState = {
  groupId: string;
  remittances: OrderRemittance[];
  events: OrderRemittanceEvent[];
  remittancesError: string;
  eventsError: string;
  remittancesLoaded: boolean;
  eventsLoaded: boolean;
};

const emptyRemittanceState = (groupId = ""): RemittanceSnapshotState => ({
  groupId,
  remittances: [],
  events: [],
  remittancesError: "",
  eventsError: "",
  remittancesLoaded: false,
  eventsLoaded: false,
});

export function useOrderRemittances(groupId: string, enabled = true, includeEvents = true) {
  const { crmUser } = useAuth();
  const [state, setState] = useState<RemittanceSnapshotState>(() => emptyRemittanceState());
  const shouldListen = enabled && crmUser?.status === "approved" && !!groupId;

  useEffect(() => {
    if (!shouldListen) return;

    const remittanceQuery = query(collection(db, "order_remittances"), where("groupId", "==", groupId));
    let active = true;
    const updateState = (update: Partial<RemittanceSnapshotState>) => setState(current => {
      if (!active) return current;
      const base = current.groupId === groupId ? current : emptyRemittanceState(groupId);
      return { ...base, ...update };
    });
    const errorMessage = (cause: Error, collectionName: string) => {
      const code = "code" in cause && typeof cause.code === "string" ? cause.code : "";
      if (code === "permission-denied") {
        console.warn(`A leitura de ${collectionName} foi negada. Verifique a aprovação do usuário e as regras Firestore.`, cause);
        return `Acesso negado ao carregar ${collectionName}. Confirme que seu usuário está aprovado e que as regras Firestore atualizadas foram publicadas no projeto desta aplicação.`;
      }
      console.error(`Falha ao carregar ${collectionName} de remessas.`, cause);
      return "Não foi possível carregar as remessas e o histórico. Verifique sua conexão e tente novamente.";
    };
    const stopRemittances = onSnapshot(remittanceQuery, snapshot => {
      const remittances = snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as OrderRemittance)
        .sort((left, right) => (right.createdAt?.toMillis() ?? 0) - (left.createdAt?.toMillis() ?? 0));
      updateState({ remittances, remittancesError: "", remittancesLoaded: true });
    }, cause => updateState({ remittancesError: errorMessage(cause, "remessas"), remittancesLoaded: true }));
    let stopEvents = () => {};
    if (includeEvents) {
      const eventQuery = query(collection(db, "order_remittance_events"), where("groupId", "==", groupId));
      stopEvents = onSnapshot(eventQuery, snapshot => {
        const events = snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as OrderRemittanceEvent)
          .sort((left, right) => (right.createdAt?.toMillis() ?? 0) - (left.createdAt?.toMillis() ?? 0));
        updateState({ events, eventsError: "", eventsLoaded: true });
      }, cause => updateState({ eventsError: errorMessage(cause, "histórico"), eventsLoaded: true }));
    } else updateState({ events: [], eventsError: "", eventsLoaded: true });
    return () => { active = false; stopRemittances(); stopEvents(); };
  }, [crmUser?.status, groupId, shouldListen, includeEvents]);

  const current = state.groupId === groupId ? state : emptyRemittanceState(groupId);
  return {
    remittances: shouldListen ? current.remittances : [],
    events: shouldListen && includeEvents ? current.events : [],
    error: shouldListen ? [current.remittancesError, includeEvents ? current.eventsError : ""].filter(Boolean).join(" ") : "",
    loading: shouldListen && (!current.remittancesLoaded || (includeEvents && !current.eventsLoaded)),
  };
}

type RemittanceActor = { id: string; name: string };
type NewRemittanceInput = {
  groupId: string;
  network: RemittanceNetwork;
  name: string;
  source: RemittanceSource;
  sourceFile?: string;
  actor: RemittanceActor;
};

function eventDocument(remittanceId: string, groupId: string, remittanceName: string, type: RemittanceEventType, details: string, actor: RemittanceActor) {
  return {
    groupId,
    remittanceId,
    remittanceName,
    type,
    details,
    actorId: actor.id,
    actorName: actor.name,
    createdAt: serverTimestamp(),
  };
}

export async function createOrderRemittance(input: NewRemittanceInput) {
  const name = input.name.trim();
  if (!input.groupId || !name) throw new Error("Informe a rede e o nome da remessa.");
  if (name.length > 100) throw new Error("O nome da remessa deve ter até 100 caracteres.");
  const remittanceRef = doc(collection(db, "order_remittances"));
  const eventRef = doc(collection(db, "order_remittance_events"));
  const status: RemittanceStatus = input.source === "manual" ? "ready" : "processing";
  const batch = writeBatch(db);
  batch.set(remittanceRef, {
    groupId: input.groupId,
    network: input.network,
    name,
    source: input.source,
    ...(input.sourceFile ? { sourceFile: input.sourceFile } : {}),
    status,
    createdBy: input.actor.id,
    createdByName: input.actor.name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(eventRef, eventDocument(
    remittanceRef.id,
    input.groupId,
    name,
    input.source === "manual" ? "created" : "import_started",
    input.source === "manual" ? "Remessa criada manualmente." : `Importação iniciada${input.sourceFile ? `: ${input.sourceFile}` : ""}.`,
    input.actor,
  ));
  await batch.commit();
  return remittanceRef.id;
}

export async function finishOrderRemittanceImport(remittance: Pick<OrderRemittance, "id" | "groupId" | "name">, orderCount: number, bonusCount: number, actor: RemittanceActor) {
  const details = `Importação concluída: ${orderCount} pedido(s) e ${bonusCount} bonificação(ões) vinculados.`;
  const batch = writeBatch(db);
  batch.update(doc(db, "order_remittances", remittance.id), { status: "ready", updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, "order_remittance_events")), eventDocument(remittance.id, remittance.groupId, remittance.name, "import_completed", details, actor));
  await batch.commit();
}

export async function failOrderRemittanceImport(remittance: Pick<OrderRemittance, "id" | "groupId" | "name">, details: string, actor: RemittanceActor) {
  const batch = writeBatch(db);
  batch.update(doc(db, "order_remittances", remittance.id), { status: "failed", updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, "order_remittance_events")), eventDocument(remittance.id, remittance.groupId, remittance.name, "import_failed", details.slice(0, 1000), actor));
  await batch.commit();
}

export async function renameOrderRemittance(remittance: Pick<OrderRemittance, "id" | "groupId" | "name">, value: string, actor: RemittanceActor) {
  const name = value.trim();
  if (!name) throw new Error("Informe o nome da remessa.");
  if (name.length > 100) throw new Error("O nome da remessa deve ter até 100 caracteres.");
  if (name === remittance.name) return;
  const batch = writeBatch(db);
  batch.update(doc(db, "order_remittances", remittance.id), { name, updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, "order_remittance_events")), eventDocument(remittance.id, remittance.groupId, name, "renamed", `Nome alterado de “${remittance.name}” para “${name}”.`, actor));
  await batch.commit();
}

export async function assignRecordsToOrderRemittance(remittance: Pick<OrderRemittance, "id" | "groupId" | "name">, records: RemittanceRecordRef[], actor: RemittanceActor) {
  const uniqueRecords = [...new Map(records.map(record => [`${record.collection}:${record.id}`, record])).values()];
  if (!uniqueRecords.length) throw new Error("Selecione ao menos um pedido ou uma bonificação.");
  for (let start = 0; start < uniqueRecords.length; start += 400) {
    const chunk = uniqueRecords.slice(start, start + 400);
    const batch = writeBatch(db);
    chunk.forEach(record => batch.update(doc(db, record.collection, record.id), { remittanceId: remittance.id, updatedAt: serverTimestamp() }));
    batch.set(doc(collection(db, "order_remittance_events")), eventDocument(
      remittance.id,
      remittance.groupId,
      remittance.name,
      "records_assigned",
      `${chunk.length} registro(s) vinculado(s) manualmente à remessa.`,
      actor,
    ));
    await batch.commit();
  }
}
