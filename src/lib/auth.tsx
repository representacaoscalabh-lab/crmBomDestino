"use client";

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { auth, db } from "@/lib/firebase";

export type CrmUser = {
  uid: string;
  email: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  role: "user" | "admin";
};

type AuthState = {
  firebaseUser: User | null;
  crmUser: CrmUser | null;
  loading: boolean;
  error: string;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function ensureCrmUser(user: User) {
  const idToken = await user.getIdToken();
  const bootstrapResponse = await fetch("/api/auth/bootstrap", {
    method: "POST",
    headers: { authorization: `Bearer ${idToken}` },
  });

  if (!bootstrapResponse.ok && bootstrapResponse.status !== 503) {
    const details = await bootstrapResponse.json().catch(() => ({})) as { error?: string };
    throw new Error(details.error ?? "Não foi possível validar o acesso.");
  }

  const userRef = doc(db, "users", user.uid);
  let snapshot = await getDoc(userRef);
  if (!snapshot.exists()) {
    const record: CrmUser = {
      uid: user.uid,
      email: user.email ?? "",
      name: user.displayName ?? "",
      status: "pending",
      role: "user",
    };
    await setDoc(userRef, { ...record, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await setDoc(doc(db, "access_requests", user.uid), {
      uid: user.uid,
      email: record.email,
      name: record.name,
      status: "pending",
      requestedAt: serverTimestamp(),
    });
    snapshot = await getDoc(userRef);
  }
  return snapshot.data() as CrmUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [crmUser, setCrmUser] = useState<CrmUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    setFirebaseUser(user);
    setCrmUser(null);
    setError("");
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await ensureCrmUser(user);
    } catch (cause) {
      console.error("Falha ao carregar a autorização do CRM.", cause);
      setError(cause instanceof Error ? cause.message : "Falha ao carregar a autorização do CRM.");
    } finally {
      setLoading(false);
    }
  }), []);

  useEffect(() => {
    if (!firebaseUser) return;
    return onSnapshot(doc(db, "users", firebaseUser.uid), (snapshot) => {
      if (snapshot.exists()) setCrmUser(snapshot.data() as CrmUser);
    }, (cause) => {
      console.error("Falha ao acompanhar o estado da autorização.", cause);
      setError("Não foi possível acompanhar o estado da sua autorização.");
    });
  }, [firebaseUser]);

  const signIn = useCallback(async () => {
    setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar com o Google.");
      throw cause;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    setCrmUser(null);
  }, []);

  const value = useMemo(() => ({ firebaseUser, crmUser, loading, error, signIn, signOutUser }), [firebaseUser, crmUser, loading, error, signIn, signOutUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth precisa ser usado dentro de AuthProvider.");
  return value;
}
