"use client";

import { normalizeCustomerGroup } from "@/lib/responsibility";
import { normalizeOrder } from "@/lib/order-status";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { addDoc, collection, deleteDoc, deleteField, doc, getDocs, runTransaction, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { crmQueryCache, invalidateResource, onResourceInvalidated } from "@/lib/query-cache";
import { recordFirestoreRead } from "@/lib/firestore-metrics";
import { useAuth } from "@/lib/auth";
import { customerReservationsEnabled, saveCustomerWithReservation, deleteCustomerWithReservation } from "@/lib/customer-document-reservation";
import { findCustomersByDocuments } from "@/lib/customer-document-query";
import { validateCustomerBatch } from "@/lib/customer-import";
import { ImportValidationError } from "@/lib/import-validation";
import type { Bonification, Customer, CustomerGroup, Goal, NewCustomer, NewProduct, Order, PaymentTerm, Product } from "@/lib/types";

type CrmStore = {
  customers: Customer[];
  customerGroups: CustomerGroup[];
  products: Product[];
  orders: Order[];
  bonifications: Bonification[];
  goals: Goal[];
  paymentTerms: PaymentTerm[];
  addGoal: (goal: Omit<Goal, "id">) => Promise<void>;
  updateGoal: (id: string, goal: Omit<Goal, "id">) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  deleteGoals: (ids: string[]) => Promise<void>;
  addPaymentTerm: (term: Omit<PaymentTerm, "id">) => Promise<void>;
  updatePaymentTerm: (id: string, term: Omit<PaymentTerm, "id">) => Promise<void>;
  deletePaymentTerm: (id: string) => Promise<void>;
  dataError: string;
  loadingResources: string[];
  requireResource: (name: string) => () => void;
  refreshData: () => Promise<void>;
  addCustomer: (customer: NewCustomer) => Promise<void>;
  addCustomers: (customers: NewCustomer[]) => Promise<void>;
  updateCustomer: (id: string, customer: NewCustomer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  deleteCustomers: (ids: string[]) => Promise<void>;
  saveCustomerGroup: (id: string | null, name: string, customerIds: string[], externalStoreSellers?: Record<string, string>) => Promise<string>;
  deleteCustomerGroup: (id: string) => Promise<void>;
  addProduct: (product: NewProduct) => Promise<void>;
  updateProduct: (id: string, product: NewProduct) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addOrders: (orders: Order[], remittanceId?: string) => Promise<void>;
  updateOrder: (id: string, order: Order) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  deleteOrders: (ids: string[]) => Promise<void>;
  addBonification: (bonification: Omit<Bonification, "id">) => Promise<void>;
  addBonifications: (bonifications: Omit<Bonification, "id">[], remittanceId?: string) => Promise<void>;
  updateBonification: (id: string, bonification: Omit<Bonification, "id">) => Promise<void>;
  deleteBonification: (id: string) => Promise<void>;
};

const StoreContext = createContext<CrmStore | null>(null);

function getOrderDocumentId(preOrder: string, customerId?: string) {
  const orderKey = preOrder.trim().toUpperCase();
  return encodeURIComponent(customerId ? `${customerId}:${orderKey}` : orderKey);
}

function invalidateAfter<A extends unknown[], R>(operation: (...args: A) => Promise<R>, resource: string) {
  return async (...args: A): Promise<R> => {
    try { return await operation(...args); }
    finally { invalidateResource(resource); if (resource === "customer_groups") invalidateResource("customers"); }
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { crmUser } = useAuth();
  const sessionKey = crmUser?.status === "approved" ? crmUser.uid : "signed-out";
  return <SessionStore key={sessionKey}>{children}</SessionStore>;
}

function SessionStore({ children }: { children: ReactNode }) {
  const { crmUser } = useAuth();
  const pathname = usePathname();
  const isApproved = crmUser?.status === "approved";
  const uid = isApproved ? crmUser.uid : "";
  const [demands, setDemands] = useState<Record<string, number>>({});
  const requireResource = useCallback((name: string) => {
    setDemands(current => ({ ...current, [name]: (current[name] ?? 0) + 1 }));
    return () => setDemands(current => ({ ...current, [name]: Math.max(0, (current[name] ?? 0) - 1) }));
  }, []);
  const [loadingResources, setLoadingResources] = useState<string[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [bonifications, setBonifications] = useState<Bonification[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [dataError, setDataError] = useState("");

  const resources = useMemo(() => {
    const resources = new Set(Object.keys(demands).filter(name => demands[name] > 0));
    const isReport = pathname.startsWith("/relatorios");
    if (pathname !== "/produtos") { resources.add("customers"); resources.add("customer_groups"); }
    if (pathname === "/" || isReport || ["/produtos", "/exportacao"].some(path => pathname.startsWith(path))) resources.add("products");
    if (pathname.startsWith("/metas")) resources.add("goals");
    if (["/configuracoes", "/clientes", "/exportacao"].some(path => pathname.startsWith(path))) resources.add("payment_terms");
    return [...resources].sort();
  }, [pathname, demands]);

  useEffect(() => {
    if (!uid) {
      crmQueryCache.clear();
      return;
    }
    let disposed = false;
    const errors = new Map<string, string>();
    const setters: Record<string, (rows: never[]) => void> = {
      customers: setCustomers, customer_groups: setCustomerGroups, products: setProducts,
      orders: setOrders, bonifications: setBonifications, goals: setGoals, payment_terms: setPaymentTerms,
    };
    async function load(resource: string) {
      setLoadingResources(current => current.includes(resource) ? current : [...current, resource]);
      try {
        const rows = await crmQueryCache.read(`${resource}:${uid}:all`, async () => {
          const snapshot = await getDocs(collection(db, resource));
          recordFirestoreRead(resource, snapshot.size, snapshot.metadata.fromCache);
          return snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
        }, ["orders", "bonifications"].includes(resource) ? 120_000 : 600_000);
        if (disposed) return;
        const normalized = resource === "orders" ? rows.map(row => normalizeOrder(row as Order))
          : resource === "customer_groups" ? rows.map(row => normalizeCustomerGroup(row as CustomerGroup)) : rows;
        setters[resource](normalized as never[]);
        errors.delete(resource);
      } catch (cause) {
        recordFirestoreRead(resource, 0, false, true);
        if (disposed) return;
        errors.set(resource, `N?o foi poss?vel atualizar ${resource}. Tente atualizar a p?gina.`);
        console.error("Falha na consulta do CRM", resource, cause);
      } finally {
        if (!disposed) { setLoadingResources(current => current.filter(item => item !== resource)); setDataError([...errors.values()].join(" ")); }
      }
    }
    queueMicrotask(() => { if (!disposed) resources.forEach(resource => void load(resource)); });
    const off = onResourceInvalidated(resource => { if (resources.includes(resource)) void load(resource); });
    const onFocus = () => resources.forEach(resource => void load(resource));
    window.addEventListener("focus", onFocus);
    return () => { disposed = true; off(); window.removeEventListener("focus", onFocus); };
  }, [uid, resources]);

  // Refresh the current resource only, rather than downloading seven collections.
  const refreshData = useCallback(async () => {
    const resource = pathname.startsWith("/pedidos") ? "orders" : pathname.startsWith("/bonificacoes") ? "bonifications" : null;
    if (resource) invalidateResource(resource);
  }, [pathname]);

  const addCustomer = useCallback(async (customer: NewCustomer) => {
    validateCustomerBatch([customer], customers);
    validateCustomerBatch([customer], await findCustomersByDocuments([customer]));
    if (customerReservationsEnabled) { await saveCustomerWithReservation(null, customer); return; }
    await addDoc(collection(db, "customers"), { ...customer, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }, [customers]);

  const addCustomers = useCallback(async (newCustomers: NewCustomer[]) => {
    validateCustomerBatch(newCustomers, customers, undefined, { cnpjOnly: true });
    validateCustomerBatch(newCustomers, await findCustomersByDocuments(newCustomers), undefined, { cnpjOnly: true });
    let saved = 0;
    try {
      if (customerReservationsEnabled) {
        for (const customer of newCustomers) { await saveCustomerWithReservation(null, customer); saved++; }
        return;
      }
      for (let start = 0; start < newCustomers.length; start += 450) {
        const batch = writeBatch(db);
        newCustomers.slice(start, start + 450).forEach((customer) => {
          batch.set(doc(collection(db, "customers")), {
            ...customer,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
        saved += Math.min(450, newCustomers.length - start);
      }
    } catch {
      throw new ImportValidationError(`Importação interrompida: ${saved} cliente(s) salvo(s) e ${newCustomers.length - saved} não confirmado(s). Confira a lista atualizada antes de tentar novamente.`, ["Clientes já salvos serão identificados pelo CNPJ na próxima importação."]);
    }
  }, [customers]);

  const updateCustomer = useCallback(async (id: string, customer: NewCustomer) => {
    validateCustomerBatch([customer], customers, id);
    validateCustomerBatch([customer], await findCustomersByDocuments([customer]), id);
    if (customerReservationsEnabled) { await saveCustomerWithReservation(id, customer); return; }
    await updateDoc(doc(db, "customers", id), { ...customer, updatedAt: serverTimestamp() });
  }, [customers]);

  const deleteCustomer = useCallback(async (id: string) => {
    if (customerReservationsEnabled) { await deleteCustomerWithReservation(id); return; }
    await deleteDoc(doc(db, "customers", id));
  }, []);

  const deleteCustomers = useCallback(async (ids: string[]) => {
    const uniqueIds = [...new Set(ids)];
    let deleted = 0;
    try {
      if (customerReservationsEnabled) {
        for (const id of uniqueIds) { await deleteCustomerWithReservation(id); deleted++; }
        return;
      }
      for (let start = 0; start < uniqueIds.length; start += 450) {
        const batch = writeBatch(db);
        uniqueIds.slice(start, start + 450).forEach((id) => batch.delete(doc(db, "customers", id)));
        await batch.commit();
        deleted += Math.min(450, uniqueIds.length - start);
      }
    } catch {
      throw new Error(`Exclusão interrompida: ${deleted} cliente(s) excluído(s). Confira a lista atualizada e tente novamente para os restantes.`);
    }
  }, []);

  const saveCustomerGroup = useCallback(async (id: string | null, name: string, customerIds: string[], externalStoreSellers: Record<string, string> = {}) => {
    const groupRef = id ? doc(db, "customer_groups", id) : doc(collection(db, "customer_groups"));
    const selectedIds = new Set(customerIds);
    const sellers = Object.fromEntries(Object.entries(externalStoreSellers)
      .filter(([customerId, seller]) => selectedIds.has(customerId) && seller.trim())
      .map(([customerId]) => [customerId, "Sul de Minas"]));
    const changes = customers
      .filter((customer) => customer.groupId === groupRef.id && !selectedIds.has(customer.id))
      .map((customer) => ({ id: customer.id, groupId: null as string | null }))
      .concat(customerIds.map((customerId) => ({ id: customerId, groupId: groupRef.id })));
    const batches: ReturnType<typeof writeBatch>[] = [];
    for (let start = 0; start < changes.length; start += 449) {
      batches.push(writeBatch(db));
    }
    if (batches.length === 0) batches.push(writeBatch(db));
    batches.forEach((batch, index) => {
      if (index === 0) batch.set(groupRef, { name: name.trim(), externalStoreSellers: sellers, updatedAt: serverTimestamp() }, { mergeFields: ["name", "externalStoreSellers", "updatedAt"] });
      changes.slice(index * 449, (index + 1) * 449).forEach((change) => {
        batch.update(doc(db, "customers", change.id), {
          groupId: change.groupId ?? deleteField(),
          updatedAt: serverTimestamp(),
        });
      });
    });
    for (const batch of batches) await batch.commit();
    return groupRef.id;
  }, [customers]);

  const deleteCustomerGroup = useCallback(async (id: string) => {
    const members = customers.filter((customer) => customer.groupId === id);
    const batches: ReturnType<typeof writeBatch>[] = [];
    for (let start = 0; start < members.length; start += 449) batches.push(writeBatch(db));
    if (batches.length === 0) batches.push(writeBatch(db));
    batches.forEach((batch, index) => {
      members.slice(index * 449, (index + 1) * 449).forEach((customer) => {
        batch.update(doc(db, "customers", customer.id), { groupId: deleteField(), updatedAt: serverTimestamp() });
      });
      if (index === batches.length - 1) batch.delete(doc(db, "customer_groups", id));
    });
    for (const batch of batches) await batch.commit();
  }, [customers]);

  const addProduct = useCallback(async (product: NewProduct) => {
    await addDoc(collection(db, "products"), { ...product, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }, []);

  const updateProduct = useCallback(async (id: string, product: NewProduct) => {
    await updateDoc(doc(db, "products", id), { ...product, updatedAt: serverTimestamp() });
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "products", id));
  }, []);

  const addPaymentTerm = useCallback(async (term: Omit<PaymentTerm, "id">) => {
    await addDoc(collection(db, "payment_terms"), { ...term, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }, []);

  const updatePaymentTerm = useCallback(async (id: string, term: Omit<PaymentTerm, "id">) => {
    await updateDoc(doc(db, "payment_terms", id), { ...term, updatedAt: serverTimestamp() });
  }, []);

  const deletePaymentTerm = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "payment_terms", id));
  }, []);

  const addGoal = useCallback(async (goal: Omit<Goal, "id">) => {
    await addDoc(collection(db, "goals"), { ...goal, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }, []);

  const updateGoal = useCallback(async (id: string, goal: Omit<Goal, "id">) => {
    await updateDoc(doc(db, "goals", id), { ...goal, updatedAt: serverTimestamp() });
  }, []);

  const deleteGoal = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "goals", id));
  }, []);

  const deleteGoals = useCallback(async (ids: string[]) => {
    for (let start = 0; start < ids.length; start += 450) {
      const batch = writeBatch(db);
      ids.slice(start, start + 450).forEach((id) => batch.delete(doc(db, "goals", id)));
      await batch.commit();
    }
  }, []);

  const addOrders = useCallback(async (newOrders: Order[], remittanceId?: string) => {
    const ids = new Set<string>();
    for (const order of newOrders) {
      const id = getOrderDocumentId(order.preOrder, order.customerId);
      if (!order.preOrder.trim() || !order.customerId || !order.items.length) throw new ImportValidationError("Pedido sem número, cliente ou produtos. Confira a prévia antes de salvar.");
      if (ids.has(id)) throw new ImportValidationError(`Pedido ${order.preOrder} repetido para o mesmo cliente no lote. Nenhum pedido deste lote foi salvo.`);
      ids.add(id);
      const numbers = [order.totalValue, order.totalWeight, ...order.items.flatMap((item) => Object.values(item).filter((value): value is number => typeof value === "number"))];
      if (numbers.some((value) => !Number.isFinite(value))) throw new ImportValidationError(`Pedido ${order.preOrder}: valores ou quantidades inválidos. Confira o cadastro dos produtos e o PDF.`);
    }
    let saved = 0;
    try {
      for (let start = 0; start < newOrders.length; start += 50) {
        const chunk = newOrders.slice(start, start + 50);
        await runTransaction(db, async (transaction) => {
          const refs = chunk.map((order) => doc(db, "orders", getOrderDocumentId(order.preOrder, order.customerId)));
          const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
          const duplicateIndex = snapshots.findIndex((snapshot) => snapshot.exists());
          if (duplicateIndex !== -1) throw new ImportValidationError(`Pedido ${chunk[duplicateIndex].preOrder} já existe para este cliente. Leia o PDF novamente para atualizar a prévia; o pedido existente não foi alterado.`);
          chunk.forEach((order, index) => transaction.set(refs[index], { ...normalizeOrder(order), ...(remittanceId ? { remittanceId } : {}), itemCount: order.items.length, id: refs[index].id, updatedAt: serverTimestamp() }));
        });
        saved += chunk.length;
      }
    } catch (cause) {
      const reason = cause instanceof ImportValidationError ? cause.message : "Falha de conexão ou permissão ao gravar os pedidos.";
      throw new ImportValidationError(`${reason} ${saved} pedido(s) salvo(s) nesta tentativa. Confira os registros e leia o PDF novamente antes de tentar importar os restantes.`);
    }
  }, []);

  const updateOrder = useCallback(async (id: string, order: Order) => {
    const nextId = getOrderDocumentId(order.preOrder, order.customerId);
    await runTransaction(db, async transaction => {
      const nextRef = doc(db, "orders", nextId);
      if (id !== nextId && (await transaction.get(nextRef)).exists()) throw new ImportValidationError(`Pedido ${order.preOrder} já existe para este cliente.`);
      transaction.set(nextRef, { ...normalizeOrder(order), itemCount: order.items.length, id: nextId, updatedAt: serverTimestamp() });
      if (id !== nextId) transaction.delete(doc(db, "orders", id));
    });
  }, []);

  const deleteOrder = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "orders", id));
  }, []);

  const deleteOrders = useCallback(async (ids: string[]) => {
    for (let start = 0; start < ids.length; start += 450) {
      const batch = writeBatch(db);
      ids.slice(start, start + 450).forEach((id) => batch.delete(doc(db, "orders", id)));
      await batch.commit();
    }
  }, []);

  const addBonification = useCallback(async (bonification: Omit<Bonification, "id">) => {
    await addDoc(collection(db, "bonifications"), { ...bonification, itemCount: bonification.items.length, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }, []);

  const addBonifications = useCallback(async (newBonifications: Omit<Bonification, "id">[], remittanceId?: string) => {
    for (let start = 0; start < newBonifications.length; start += 450) {
      const batch = writeBatch(db);
      newBonifications.slice(start, start + 450).forEach((bonification) => {
        batch.set(doc(collection(db, "bonifications")), {
          ...bonification,
          ...(remittanceId ? { remittanceId } : {}),
          itemCount: bonification.items.length,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  }, []);

  const updateBonification = useCallback(async (id: string, bonification: Omit<Bonification, "id">) => {
    await updateDoc(doc(db, "bonifications", id), { ...bonification, itemCount: bonification.items.length, updatedAt: serverTimestamp() });
  }, []);

  const deleteBonification = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "bonifications", id));
  }, []);

  const value = useMemo(
    () => ({
      customers: isApproved ? customers : [],
      customerGroups: isApproved ? customerGroups : [],
      products: isApproved ? products : [],
      orders: isApproved ? orders : [],
      bonifications: isApproved ? bonifications : [],
      goals: isApproved ? goals : [],
      paymentTerms: isApproved ? paymentTerms : [],
      addGoal: invalidateAfter(addGoal, "goals"),
      updateGoal: invalidateAfter(updateGoal, "goals"),
      deleteGoal: invalidateAfter(deleteGoal, "goals"),
      deleteGoals: invalidateAfter(deleteGoals, "goals"),
      addPaymentTerm: invalidateAfter(addPaymentTerm, "payment_terms"),
      updatePaymentTerm: invalidateAfter(updatePaymentTerm, "payment_terms"),
      deletePaymentTerm: invalidateAfter(deletePaymentTerm, "payment_terms"),
      dataError,
      loadingResources,
      requireResource,
      refreshData,
      addCustomer: invalidateAfter(addCustomer, "customers"),
      addCustomers: invalidateAfter(addCustomers, "customers"),
      updateCustomer: invalidateAfter(updateCustomer, "customers"),
      deleteCustomer: invalidateAfter(deleteCustomer, "customers"),
      deleteCustomers: invalidateAfter(deleteCustomers, "customers"),
      saveCustomerGroup: invalidateAfter(saveCustomerGroup, "customer_groups"),
      deleteCustomerGroup: invalidateAfter(deleteCustomerGroup, "customer_groups"),
      addProduct: invalidateAfter(addProduct, "products"),
      updateProduct: invalidateAfter(updateProduct, "products"),
      deleteProduct: invalidateAfter(deleteProduct, "products"),
      addOrders: invalidateAfter(addOrders, "orders"),
      updateOrder: invalidateAfter(updateOrder, "orders"),
      deleteOrder: invalidateAfter(deleteOrder, "orders"),
      deleteOrders: invalidateAfter(deleteOrders, "orders"),
      addBonification: invalidateAfter(addBonification, "bonifications"),
      addBonifications: invalidateAfter(addBonifications, "bonifications"),
      updateBonification: invalidateAfter(updateBonification, "bonifications"),
      deleteBonification: invalidateAfter(deleteBonification, "bonifications"),
    }),
    [isApproved, loadingResources, requireResource, customers, customerGroups, products, orders, bonifications, goals, paymentTerms, dataError, refreshData, addPaymentTerm, updatePaymentTerm, deletePaymentTerm, addGoal, updateGoal, deleteGoal, deleteGoals, addCustomer, addCustomers, updateCustomer, deleteCustomer, deleteCustomers, saveCustomerGroup, deleteCustomerGroup, addProduct, updateProduct, deleteProduct, addOrders, updateOrder, deleteOrder, deleteOrders, addBonification, addBonifications, updateBonification, deleteBonification],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useCrmStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useCrmStore precisa ser usado dentro de StoreProvider.");
  return store;
}

/** Register resources needed only while an editor/importer is open. */
export function useCrmResources(names: string[], enabled = true) {
  const { requireResource } = useCrmStore();
  const key = names.join(",");
  useEffect(() => {
    if (!enabled) return;
    const releases = key.split(",").filter(Boolean).map(requireResource);
    return () => releases.forEach(release => release());
  }, [key, enabled, requireResource]);
}
