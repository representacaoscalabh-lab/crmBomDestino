"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { addDoc, collection, deleteDoc, deleteField, doc, getDocs, onSnapshot, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import type { Customer, CustomerGroup, Goal, NewCustomer, NewProduct, Order, PaymentTerm, Product } from "@/lib/types";

type CrmStore = {
  customers: Customer[];
  customerGroups: CustomerGroup[];
  products: Product[];
  orders: Order[];
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
  refreshData: () => Promise<void>;
  addCustomer: (customer: NewCustomer) => Promise<void>;
  addCustomers: (customers: NewCustomer[]) => Promise<void>;
  updateCustomer: (id: string, customer: NewCustomer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  saveCustomerGroup: (id: string | null, name: string, customerIds: string[]) => Promise<string>;
  deleteCustomerGroup: (id: string) => Promise<void>;
  addProduct: (product: NewProduct) => Promise<void>;
  updateProduct: (id: string, product: NewProduct) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addOrders: (orders: Order[]) => Promise<void>;
  updateOrder: (id: string, order: Order) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
};

const StoreContext = createContext<CrmStore | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { crmUser } = useAuth();
  const isApproved = crmUser?.status === "approved";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    if (!isApproved) return;
    const handleError = (error: Error) => {
      console.error("Falha ao sincronizar os dados do CRM.", error);
      setDataError("Não foi possível sincronizar os dados. Verifique a conexão e as regras de acesso do Firebase.");
    };
    const handleSnapshot = <T,>(update: (items: T[]) => void, items: T[]) => {
      setDataError("");
      update(items);
    };
    const unsubscribe = [
      onSnapshot(collection(db, "customers"), (snapshot) => handleSnapshot(setCustomers, snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Customer)), handleError),
      onSnapshot(collection(db, "customer_groups"), (snapshot) => handleSnapshot(setCustomerGroups, snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as CustomerGroup)), handleError),
      onSnapshot(collection(db, "products"), (snapshot) => handleSnapshot(setProducts, snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Product)), handleError),
      onSnapshot(collection(db, "orders"), (snapshot) => handleSnapshot(setOrders, snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Order)), handleError),
      onSnapshot(collection(db, "goals"), (snapshot) => handleSnapshot(setGoals, snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Goal)), handleError),
      onSnapshot(collection(db, "payment_terms"), (snapshot) => handleSnapshot(setPaymentTerms, snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as PaymentTerm)), handleError),
    ];
    return () => unsubscribe.forEach((stop) => stop());
  }, [isApproved]);

  const refreshData = useCallback(async () => {
    const [customerSnapshot, groupSnapshot, productSnapshot, orderSnapshot, goalSnapshot, paymentTermSnapshot] = await Promise.all([
      getDocs(collection(db, "customers")),
      getDocs(collection(db, "customer_groups")),
      getDocs(collection(db, "products")),
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "goals")),
      getDocs(collection(db, "payment_terms")),
    ]);
    setCustomers(customerSnapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Customer));
    setCustomerGroups(groupSnapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as CustomerGroup));
    setProducts(productSnapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Product));
    setOrders(orderSnapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Order));
    setGoals(goalSnapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Goal));
    setPaymentTerms(paymentTermSnapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as PaymentTerm));
    setDataError("");
  }, []);

  const addCustomer = useCallback(async (customer: NewCustomer) => {
    await addDoc(collection(db, "customers"), { ...customer, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }, []);

  const addCustomers = useCallback(async (newCustomers: NewCustomer[]) => {
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
    }
  }, []);

  const updateCustomer = useCallback(async (id: string, customer: NewCustomer) => {
    await updateDoc(doc(db, "customers", id), { ...customer, updatedAt: serverTimestamp() });
  }, []);

  const deleteCustomer = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "customers", id));
  }, []);

  const saveCustomerGroup = useCallback(async (id: string | null, name: string, customerIds: string[]) => {
    const groupRef = id ? doc(db, "customer_groups", id) : doc(collection(db, "customer_groups"));
    const selectedIds = new Set(customerIds);
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
      if (index === 0) batch.set(groupRef, { name: name.trim(), updatedAt: serverTimestamp() }, { merge: true });
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

  const addOrders = useCallback(async (newOrders: Order[]) => {
    for (let start = 0; start < newOrders.length; start += 450) {
      const batch = writeBatch(db);
      newOrders.slice(start, start + 450).forEach((order) => {
        batch.set(doc(db, "orders", order.preOrder.trim().toUpperCase()), {
          ...order,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
    }
  }, []);

  const updateOrder = useCallback(async (id: string, order: Order) => {
    const nextId = order.preOrder.trim().toUpperCase();
    const batch = writeBatch(db);
    batch.set(doc(db, "orders", nextId), { ...order, id: nextId, updatedAt: serverTimestamp() });
    if (id !== nextId) batch.delete(doc(db, "orders", id));
    await batch.commit();
  }, []);

  const deleteOrder = useCallback(async (id: string) => {
    await deleteDoc(doc(db, "orders", id));
  }, []);

  const value = useMemo(
    () => ({
      customers: isApproved ? customers : [],
      customerGroups: isApproved ? customerGroups : [],
      products: isApproved ? products : [],
      orders: isApproved ? orders : [],
      goals: isApproved ? goals : [],
      paymentTerms: isApproved ? paymentTerms : [],
      addGoal,
      updateGoal,
      deleteGoal,
      deleteGoals,
      addPaymentTerm,
      updatePaymentTerm,
      deletePaymentTerm,
      dataError,
      refreshData,
      addCustomer,
      addCustomers,
      updateCustomer,
      deleteCustomer,
      saveCustomerGroup,
      deleteCustomerGroup,
      addProduct,
      updateProduct,
      deleteProduct,
      addOrders,
      updateOrder,
      deleteOrder,
    }),
    [isApproved, customers, customerGroups, products, orders, goals, paymentTerms, dataError, refreshData, addPaymentTerm, updatePaymentTerm, deletePaymentTerm, addGoal, updateGoal, deleteGoal, deleteGoals, addCustomer, addCustomers, updateCustomer, deleteCustomer, saveCustomerGroup, deleteCustomerGroup, addProduct, updateProduct, deleteProduct, addOrders, updateOrder, deleteOrder],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useCrmStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useCrmStore precisa ser usado dentro de StoreProvider.");
  return store;
}
