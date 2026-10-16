"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, Copy, Download, Search } from "lucide-react";
import "./import-issues.css";

function issueCategory(message: string) {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (text.includes("cnpj")) return "Clientes / CNPJ";
  if (text.includes("codigo") || text.includes("produto")) return "Produtos";
  if (text.includes("ja existe") || text.includes("combinado")) return "Duplicados";
  return "Outros";
}

export function ImportIssues({ warnings = [], error = "", fileName, title = "Revise a importação", guidance = "Corrija os cadastros indicados e leia o arquivo novamente." }: { warnings?: string[]; error?: string; fileName?: string; title?: string; guidance?: string }) {
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const issues = useMemo(() => warnings.map((message, index) => ({ message, index, category: issueCategory(message) })), [warnings]);
  const categories = ["Todos", ...new Set(issues.map((issue) => issue.category))];
  const activeFilter = categories.includes(filter) ? filter : "Todos";
  const normalizedSearch = search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const visible = issues.filter((issue) => (activeFilter === "Todos" || activeFilter === issue.category) && issue.message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(normalizedSearch));
  const report = [title, fileName && `Arquivo: ${fileName}`, error && `Erro: ${error}`, ...warnings.map((message, index) => `${index + 1}. [${issueCategory(message)}] ${message}`)].filter(Boolean).join("\n");

  async function copy(text: string, key: string) {
    setCopied("");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setManualCopy("");
    } catch {
      setManualCopy(text);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob(["\ufeff", report], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "pendencias-importacao.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!error && !warnings.length) return null;

  return <section className="import-issues" aria-label="Pendências da importação">
    <header className="import-issues-heading"><span className="import-issues-icon"><AlertCircle size={20} /></span><div><h3>{title}</h3><p>{warnings.length ? `${warnings.length} aviso(s) para conferir antes de continuar.` : "Não foi possível concluir esta etapa."}</p></div></header>
    {error && <p className="import-issues-error" role="alert">{error}</p>}
    <div className="import-issues-actions"><button type="button" className="button button-outline button-small" onClick={() => void copy(report, "all")}>{copied === "all" ? <Check size={15} /> : <Copy size={15} />}{copied === "all" ? "Relatório copiado" : "Copiar todos"}</button><button type="button" className="button button-outline button-small" onClick={download}><Download size={15} /> Baixar TXT</button><span role="status" aria-live="polite">{copied && copied !== "all" ? "Aviso copiado." : ""}</span></div>
    {warnings.length > 0 && <>
      <div className="import-issues-filters"><div className="import-issues-categories" aria-label="Filtrar avisos">{categories.map((category) => <button key={category} type="button" aria-pressed={activeFilter === category} onClick={() => setFilter(category)}>{category}<span>{category === "Todos" ? issues.length : issues.filter((issue) => issue.category === category).length}</span></button>)}</div><label className="search-field"><Search size={16} /><input aria-label="Buscar nos avisos da importação" placeholder="Buscar pedido, CNPJ ou código…" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      <div className="import-issues-list" tabIndex={0} aria-label="Lista de avisos">{visible.length ? visible.map((issue) => <article className="import-issue" key={`${issue.index}:${issue.message}`}><div><span className="import-issue-category">{issue.category}</span><p>{issue.message}</p></div><button type="button" className="icon-button" aria-label={`Copiar aviso ${issue.index + 1}`} title="Copiar aviso" onClick={() => void copy(issue.message, String(issue.index))}>{copied === String(issue.index) ? <Check size={16} /> : <Copy size={16} />}</button></article>) : <p className="import-issues-no-results">Nenhum aviso corresponde aos filtros.</p>}</div>
      <footer className="import-issues-footer"><span>{visible.length} de {warnings.length} aviso(s)</span><span>{guidance}</span></footer>
    </>}
    {manualCopy && <div className="import-issues-manual"><label>Não foi possível copiar automaticamente. Selecione o texto abaixo e copie:<textarea readOnly value={manualCopy} onFocus={(event) => event.currentTarget.select()} rows={5} /></label></div>}
  </section>;
}
