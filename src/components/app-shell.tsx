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
  FileSpreadsheet,
  Gift,
  LayoutGrid,
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
  const [areaChooserOpen, setAreaChooserOpen] = useState(true);
  const activeLabel = [...navigation, ...reportLinks].find((item) => item.href === pathname)?.label ?? (pathname === "/configuracoes" ? "Configurações" : "Bom Destino");

  function toggleTheme() {
    setDarkMode((current) => {
      const next = !current;
      document.documentElement.classList.toggle("dark-theme", next);
      return next;
    });
  }

  if (areaChooserOpen) {
    const startAreas = [
      { href: "/", label: "Dashboard", description: "Indicadores e visão geral das vendas", icon: LayoutGrid, color: "dashboard" },
      { href: "/clientes", label: "Clientes", description: "Consulte e gerencie sua carteira", icon: UsersRound, color: "customers" },
      { href: "/pedidos", label: "Pedidos", description: "Digite e acompanhe os pedidos", icon: ShoppingCart, color: "orders" },
      { href: "/relatorios/mart-minas", label: "Relatórios e exportação Mart Minas", description: "Analise os resultados e exporte os dados exibidos", icon: FileSpreadsheet, color: "reports" },
    ];
    return (
      <main className="start-screen">
        <section className="start-screen-content" aria-labelledby="start-screen-title">
          <div className="start-brand-mark" aria-hidden="true"><Image src="/logo-bom-destino.jpg" alt="" width={44} height={44} priority /></div>
          <span className="start-brand-name">BOM DESTINO · CRM COMERCIAL</span>
          <h1 id="start-screen-title">Onde você quer começar?</h1>
          <p>Escolha a área do Bom Destino que você quer consultar.</p>
          <nav className="start-area-grid" aria-label="Escolha uma área do CRM">
            {startAreas.map(({ href, label, description, icon: Icon, color }) => (
              <Link href={href} key={href} className={`start-area-card start-area-${color}`} onClick={() => setAreaChooserOpen(false)}>
                <span className="start-area-icon"><Icon size={20} strokeWidth={2} /></span>
                <strong>{label}</strong>
                <span className="start-area-description">{description}</span>
              </Link>
            ))}
          </nav>
          <button type="button" className="start-screen-signout" onClick={() => void signOutUser()}><LogOut size={16} /> Sair da conta</button>
        </section>
      </main>
    );
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
