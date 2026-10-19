"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Network,
  Package,
  Settings,
  ShoppingCart,
  Sun,
  Target,
  TrendingUp,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useCrmStore } from "@/lib/store";
import { useMartMinasSettings } from "@/lib/mart-minas-settings";
import { useOesaNovaSafraSettings } from "@/lib/oesa-nova-safra-settings";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: UsersRound },
  { href: "/pedidos", label: "Pedidos", icon: ShoppingCart },
  { href: "/bonificacoes", label: "Bonificações", icon: Gift },
  { href: "/carteira", label: "Carteira", icon: Wallet },
  { href: "/exportacao", label: "Importações e exportações", icon: Download },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/metas", label: "Metas", icon: Target },
];

const defaultReportLinks = [
  { href: "/relatorios/mart-minas", label: "Mart Minas", icon: Network },
  { href: "/relatorios/oesa-nova-safra", label: "OESA - Nova Safra", icon: Network },
  { href: "/relatorios", label: "Relatórios", icon: ClipboardList },
  { href: "/crescimento/clientes", label: "Crescimento de Clientes", icon: TrendingUp },
  { href: "/crescimento/produtos", label: "Crescimento de Produtos", icon: Package },
];

export function AppShell({ children }: { children: ReactNode }) {
  const martSettings = useMartMinasSettings();
  const oesaSettings = useOesaNovaSafraSettings();
  const reportLinks = defaultReportLinks.map((link) => ({ ...link, label: link.href === "/relatorios/mart-minas" ? martSettings.reportName || link.label : link.href === "/relatorios/oesa-nova-safra" ? oesaSettings.reportName || link.label : link.label }));
  const pathname = usePathname();
  const { signOutUser } = useAuth();
  const { dataError } = useCrmStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(() => pathname.startsWith("/relatorios") || pathname.startsWith("/crescimento"));
  const [darkMode, setDarkMode] = useState(false);
  const activeLabel = [...navigation, ...reportLinks].find((item) => item.href === pathname)?.label ?? (pathname === "/configuracoes" ? "Configurações" : "Bom Destino");

  function toggleTheme() {
    setDarkMode((current) => {
      const next = !current;
      document.documentElement.classList.toggle("dark-theme", next);
      return next;
    });
  }

  return (
    <div className="app-layout">
      {mobileOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-logo"><Image src="/logo-bom-destino.jpg" alt="" width={38} height={38} priority /></span>
          <span className="brand-copy"><strong>Bom Destino</strong><small>CRM COMERCIAL</small></span>
          <button className="icon-button mobile-close" aria-label="Fechar menu" onClick={() => setMobileOpen(false)}><X size={19} /></button>
        </div>
        <nav className="navigation" aria-label="Navegação principal">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} className={`nav-link ${active ? "nav-link-active" : ""}`} onClick={() => setMobileOpen(false)}>
                <Icon size={18} strokeWidth={1.9} /><span>{label}</span>
              </Link>
            );
          })}
          <button className={`nav-link report-toggle ${reportsOpen ? "report-toggle-open" : ""}`} onClick={() => setReportsOpen((current) => !current)} aria-expanded={reportsOpen}>
            <ClipboardList size={18} strokeWidth={1.9} /><span>Relatórios</span>{reportsOpen ? <ChevronUp className="nav-chevron" size={15} /> : <ChevronDown className="nav-chevron" size={15} />}
          </button>
          {reportsOpen && <div className="report-subnav">{reportLinks.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`report-link ${pathname === href ? "report-link-active" : ""}`} onClick={() => setMobileOpen(false)}><Icon size={14} /><span>{label}</span></Link>)}</div>}
        </nav>
        <div className="sidebar-bottom">
          <button className="theme-toggle" onClick={toggleTheme}><span>{darkMode ? <Sun size={17} /> : <Moon size={17} />}{darkMode ? "Claro" : "Escuro"}</span><span className={`theme-switch ${darkMode ? "theme-switch-on" : ""}`} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="topbar-heading"><span>Visão comercial</span><strong>{activeLabel === "Dashboard" ? "Bom Destino" : activeLabel}</strong></div>
          <div className="topbar-right">
            <button type="button" className="icon-button topbar-control" onClick={() => void signOutUser()} aria-label="Sair da conta" title="Sair da conta"><LogOut size={18} /></button>
            <Link className="icon-button topbar-control" href="/configuracoes" aria-label="Configurações"><Settings size={18} /></Link>
            <Link className="icon-button topbar-control notification-button" href="/notificacoes" aria-label="Notificações"><Bell size={18} /></Link>
          </div>
        </header>
        {dataError && <div className="data-error-banner" role="alert">{dataError}</div>}
        {children}
        <footer className="app-footer"><span>© {new Date().getFullYear()} Bom Destino Laticínios de Búfala</span><span>CRM Bom Destino <b>•</b> Versão 2.0</span></footer>
      </main>
    </div>
  );
}
