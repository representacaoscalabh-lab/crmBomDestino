import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizeCnpj } from "@/lib/import-validation";
import type { Customer, NewCustomer } from "@/lib/types";

export const customerReservationsEnabled = process.env.NEXT_PUBLIC_FIREBASE_CNPJ_RESERVATIONS === "true";

/** Activate only after the reservation backfill. The matching rules enforce the same invariant. */
export async function saveCustomerWithReservation(id: string | null, customer: NewCustomer) {
  const ref = id ? doc(db, "customers", id) : doc(collection(db, "customers"));
  const normalized = normalizeCnpj(customer.document ?? "");
  await runTransaction(db, async transaction => {
    const previous = await transaction.get(ref);
    const old = previous.data()?.documentNormalized as string | undefined;
    const reservation = normalized ? doc(db, "customer_documents", normalized) : null;
    const snapshot = reservation ? await transaction.get(reservation) : null;
    if (snapshot?.exists() && snapshot.data().customerId !== ref.id) throw new Error("Este CNPJ já está cadastrado para outro cliente.");
    if (old && old !== normalized) transaction.delete(doc(db, "customer_documents", old));
    if (reservation) transaction.set(reservation, { customerId: ref.id });
    const record = { ...customer, documentNormalized: normalized, updatedAt: serverTimestamp(), ...(!previous.exists() ? { createdAt: serverTimestamp() } : {}) };
    if (previous.exists()) transaction.update(ref, record); else transaction.set(ref, record);
  });
  return ref.id;
}

export async function deleteCustomerWithReservation(id: string) {
  await runTransaction(db, async transaction => {
    const ref = doc(db, "customers", id);
    const previous = await transaction.get(ref);
    const normalized = (previous.data() as Customer & { documentNormalized?: string } | undefined)?.documentNormalized;
    if (normalized) transaction.delete(doc(db, "customer_documents", normalized));
    transaction.delete(ref);
  });
}
