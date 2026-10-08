import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Construction } from "lucide-react";

export function ModulePlaceholder({ title, description, icon: Icon = Construction, actionHref = "/", actionLabel = "Voltar ao dashboard" }: {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionHref?: string;
  actionLabel?: string;
}) {
  return <div className="page-content module-content"><section className="panel module-panel"><div className="module-heading"><span className="module-title-icon"><Icon size={21} /></span><div className="module-title-copy"><p className="eyebrow">CRM BOM DESTINO</p><h1>{title}</h1></div></div><div className="module-placeholder-body"><span className="placeholder-icon"><Icon size={24} /></span><strong>Esta área está sendo preparada</strong><p>{description}</p><Link className="button button-outline" href={actionHref}>{actionLabel} <ArrowRight size={14} /></Link></div></section></div>;
}
