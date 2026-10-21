import { collection, getDocsFromServer, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizeCnpj } from "@/lib/import-validation";
import { recordFirestoreRead } from "@/lib/firestore-metrics";
import type { Customer, NewCustomer } from "@/lib/types";

export function customerDocumentVariants(value: string) {
  const normalized = normalizeCnpj(value);
  const masked = normalized.length === 14 ? normalized.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : normalized;
  return [...new Set([value, value.trim(), normalized, masked].filter(Boolean))];
}

/** Read only documents involved in this operation, retaining masked legacy CNPJ support. */
export async function findCustomersByDocuments(customers: NewCustomer[]) {
  const variants = [...new Set(customers.flatMap(customer => customerDocumentVariants(customer.document ?? "")))];
  const records = new Map<string, Customer>();
  for (let start = 0; start < variants.length; start += 30) {
    const snapshot = await getDocsFromServer(query(collection(db, "customers"), where("document", "in", variants.slice(start, start + 30))));
    recordFirestoreRead("customers/document-validation", snapshot.size);
    for (const item of snapshot.docs) records.set(item.id, { ...item.data(), id: item.id } as Customer);
  }
  return [...records.values()];
}
