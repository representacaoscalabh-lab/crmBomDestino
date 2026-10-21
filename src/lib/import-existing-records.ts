import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { recordFirestoreRead } from "@/lib/firestore-metrics";
import type { Bonification, Order } from "@/lib/types";

export async function findImportRecords(resource: "orders" | "bonifications", numbers: string[]) {
  const unique = [...new Set(numbers.filter(Boolean))];
  const rows: Array<Order | Bonification> = [];
  for (let offset = 0; offset < unique.length; offset += 30) {
    const snapshot = await getDocs(query(collection(db, resource), where(resource === "orders" ? "preOrder" : "bonusNumber", "in", unique.slice(offset, offset + 30))));
    recordFirestoreRead(`${resource}/import-validation`, snapshot.size, snapshot.metadata.fromCache);
    rows.push(...snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as Order | Bonification));
  }
  return rows;
}
