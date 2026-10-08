"use client";

import Image from "next/image";
import { LogOut, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";

export function AuthGate({ children }: { children: ReactNode }) {
  const { firebaseUser, crmUser, loading, error, signIn, signOutUser } = useAuth();

  if (loading) return <div className="auth-screen"><div className="auth-card"><Image src="/logo-bom-destino.jpg" alt="Bom Destino" width={125} height={125} priority /><span className="loading-spinner" /><p>Verificando seu acesso seguro...</p></div></div>;
  if (!firebaseUser) return <div className="auth-screen"><div className="auth-card"><Image src="/logo-bom-destino.jpg" alt="Bom Destino Laticínios de Búfala" width={150} height={150} priority /><p className="eyebrow">GESTÃO COMERCIAL</p><h1>Bem-vindo ao CRM</h1><p>Acesse sua conta para acompanhar clientes, produtos e pedidos Bom Destino.</p>{error && <div className="auth-error" role="alert">{error}</div>}<button className="button button-primary auth-login" onClick={() => void signIn().catch(() => undefined)}><GoogleMark /> Entrar com Google</button><small>Acesso restrito a usuários autorizados.</small></div></div>;
  if (error) return <div className="auth-screen"><div className="auth-card"><Image src="/logo-bom-destino.jpg" alt="Bom Destino" width={125} height={125} priority /><h1>Não foi possível verificar seu acesso</h1><p>{error}</p><button className="button button-outline" onClick={() => void signOutUser()}>Sair e tentar novamente</button></div></div>;
  if (!crmUser || crmUser.status !== "approved") return <div className="auth-screen"><div className="auth-card"><Image src="/logo-bom-destino.jpg" alt="Bom Destino" width={125} height={125} priority /><span className="auth-shield"><ShieldCheck size={25} /></span><p className="eyebrow">ACESSO CONTROLADO</p><h1>{crmUser?.status === "rejected" ? "Acesso não autorizado" : "Solicitação enviada"}</h1><p>{crmUser?.status === "rejected" ? "O acesso a este CRM foi recusado. Entre em contato com o administrador." : "Seu cadastro foi recebido e aguarda aprovação do administrador."}</p><div className="auth-user">{firebaseUser.email}</div><button className="button button-outline" onClick={() => void signOutUser()}><LogOut size={15} /> Sair da conta</button></div></div>;
  return children;
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 18 18" width="17" height="17"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.27h2.92c1.71-1.57 2.68-3.88 2.68-6.63Z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.17l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.95v2.34A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 0 1 3.69 9c0-.59.1-1.16.28-1.71V4.95H.95A9 9 0 0 0 0 9c0 1.45.35 2.82.95 4.05l3.02-2.34Z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .95 4.95l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58Z"/></svg>;
}
