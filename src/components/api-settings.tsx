"use client";

import { useRef, useState } from "react";
import { BookOpen, Check, ChevronRight, Copy, Download, LoaderCircle, Play, Search, ShieldCheck } from "lucide-react";
import { apiConfig } from "@/cfg/api";
import { auth } from "@/lib/firebase";
import { apiDocumentation, copyApiText, downloadApiDocument } from "@/lib/api-documentation";
import "./api-settings.css";

type Result = { path: string; text: string; error: boolean; status?: number };
export function ApiSettings() {
  const [selected, setSelected] = useState("orders");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [working, setWorking] = useState("");
  const [copied, setCopied] = useState("");
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const sequence = useRef(0);
  const collection = apiConfig.collections.find(item => item.name === selected)!;
  const path = `${apiConfig.basePath}/collections/${selected}`;
  const visible = apiConfig.collections.filter(item => `${item.name} ${item.description}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const example = `curl -H "Authorization: Bearer $TOKEN" \\\n  "https://SEU-DOMINIO${path}?limit=25"`;

  async function copy(text: string, key: string) {
    try { await copyApiText(text); setCopied(key); setNotice({ text: key === "all" ? "Documentação completa copiada: coleções, campos, exemplos e OpenAPI." : "Conteúdo copiado." }); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : "Não foi possível copiar.", error: true }); }
  }

  function download() {
    try { downloadApiDocument(window.location.origin); setNotice({ text: "Download solicitado: crm-api-openapi.json. Confira os downloads do navegador." }); }
    catch { setNotice({ text: "Não foi possível iniciar o download. Confira as permissões do navegador.", error: true }); }
  }

  async function load(requestPath: string) {
    const current = ++sequence.current;
    setWorking(requestPath); setResult(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Entre na sua conta para consultar a API.");
      const response = await fetch(requestPath, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`A API não retornou JSON (HTTP ${response.status}). Verifique se o servidor da API está publicado.`); }
      if (current !== sequence.current) return;
      setResult({ path: requestPath, text: JSON.stringify(data, null, 2), error: !response.ok, status: response.status });
    } catch (error) {
      if (current === sequence.current) setResult({ path: requestPath, text: error instanceof Error ? error.message : "Falha ao consultar a API.", error: true });
    } finally { if (current === sequence.current) setWorking(""); }
  }

  return <section className="panel settings-section-panel api-settings">
    <header className="api-header"><div className="api-title"><span className="api-title-icon"><BookOpen size={22} /></span><div><div className="api-title-line"><h2>API do CRM</h2><span className="api-badge">v{apiConfig.version}</span></div><p>Explore as coleções e conecte seus dados.</p></div></div>
      <div className="api-actions"><button type="button" className="button button-outline" onClick={() => void copy(apiDocumentation(window.location.origin), "all")}>{copied === "all" ? <Check size={16} /> : <Copy size={16} />}{copied === "all" ? "Copiado!" : "Copiar tudo"}</button><button type="button" className="button button-primary" onClick={download}><Download size={16} />Baixar OpenAPI</button></div>
    </header>
    <div className="api-content">
      {notice && <div className={`api-feedback${notice.error ? " api-feedback-error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.error ? null : <Check size={16} />}<span>{notice.text}</span><button type="button" aria-label="Fechar aviso" onClick={() => setNotice(null)}>×</button></div>}
      <div className="api-overview"><div><small>ENDEREÇO BASE</small><code>{apiConfig.basePath}</code></div><div><small>AUTENTICAÇÃO</small><strong><ShieldCheck size={15} />Firebase Bearer token</strong></div><div><small>CONSULTAS</small><strong>GET · até {apiConfig.maxLimit} registros / página</strong></div></div>
      <details className="api-guide"><summary>Comece aqui: autenticação, paginação e respostas</summary><div className="api-guide-content"><p>Após o login, obtenha o token com <code>await auth.currentUser.getIdToken()</code> e envie <code>Authorization: Bearer &lt;token&gt;</code>. O usuário precisa estar aprovado; usuários e solicitações de acesso exigem administrador.</p><p>Use <code>limit</code> entre 1 e {apiConfig.maxLimit} (padrão {apiConfig.defaultLimit}). Envie <code>pagination.next</code> como <code>after</code>, codificado com <code>encodeURIComponent</code>, até receber <code>null</code>. A ordenação é por ID crescente.</p><p>Datas comerciais: YYYY-MM-DD. Auditoria: ISO 8601 UTC. Valores em reais e pesos em kg; <code>valueCents</code> em centavos. Campos ausentes ou adicionais de documentos antigos são preservados.</p><p>400: parâmetro inválido · 401: token inválido · 403: acesso negado · 404: registro indisponível · 503: serviço indisponível.</p><div className="api-actions"><button type="button" className="button button-outline" disabled={!!working} onClick={() => void load(apiConfig.basePath)}>Verificar conexão</button><button type="button" className="button button-outline" disabled={!!working} onClick={() => void load(`${apiConfig.basePath}/collections`)}>Consultar catálogo JSON</button></div></div></details>
      <div className="api-explorer">
        <aside className="api-sidebar"><div className="api-sidebar-heading"><h3>Coleções</h3><span>{apiConfig.collections.length}</span></div><label className="api-search"><Search size={16} /><input aria-label="Buscar coleção" placeholder="Buscar coleção…" value={search} onChange={event => setSearch(event.target.value)} /></label><nav aria-label="Coleções da API">{visible.map(item => <button type="button" key={item.name} className={selected === item.name ? "api-collection active" : "api-collection"} aria-current={selected === item.name ? "true" : undefined} onClick={() => { setSelected(item.name); setResult(null); setCopied(""); sequence.current++; setWorking(""); }}><span><strong>{item.name}</strong><small>{item.access === "internal" ? "Uso interno" : item.access === "admin" ? "Administrador" : "Consulta JSON"}</small></span><ChevronRight size={15} /></button>)}</nav>{!visible.length && <p className="api-no-results">Nenhuma coleção encontrada.</p>}</aside>
        <div className="api-detail"><div className="api-detail-heading"><div><h3>{collection.name}</h3><p>{collection.description}</p></div><span className="api-badge">{collection.access === "admin" ? "Administrador" : collection.access === "internal" ? "Interna" : "Usuário aprovado"}</span></div>
          {collection.access !== "internal" ? <><div className="api-endpoint"><span>GET</span><code>{path}</code><button type="button" aria-label="Copiar endereço da coleção" title="Copiar endereço" onClick={() => void copy(`${window.location.origin}${path}`, "path")}><Copy size={16} /></button></div><div className="api-code-heading"><h4>Exemplo de consulta</h4><button type="button" className="api-text-button" onClick={() => void copy(example.replace("https://SEU-DOMINIO", window.location.origin), "example")}><Copy size={14} />{copied === "example" ? "Copiado" : "Copiar exemplo"}</button></div><pre>{example}</pre><div className="api-query-actions"><span>Teste com uma amostra de 5 registros.</span><button type="button" className="button button-primary" disabled={!!working} onClick={() => void load(`${path}?limit=5`)}>{working ? <LoaderCircle size={15} className="api-spinner" /> : <Play size={15} />}{working ? "Consultando…" : "Testar consulta"}</button></div><details className="api-endpoint-help"><summary>Outras consultas desta coleção</summary><pre>{`GET ${path}?limit=25&after=<pagination.next>\nGET ${path}/<id>`}</pre></details></> : <p className="api-internal-note">Coleção interna de controle. Os campos estão documentados abaixo; os dados não são expostos pela API.</p>}
          {collection.name === "settings" && <p className="api-internal-note">Documentos disponíveis: mart_minas, oesa_nova_safra e read_optimization.</p>}
          <div className="api-code-heading"><h4>Campos da coleção</h4><span className="api-field-count">{collection.fields.length} campos</span></div><FieldTable fields={collection.fields} />
          {"itemFields" in collection && collection.itemFields && <details className="api-item-fields"><summary>Campos de items ({collection.itemFields.length})</summary><FieldTable fields={collection.itemFields} /></details>}
        </div>
      </div>
      {(working || result) && <section className="api-response" aria-label="Resultado da consulta" aria-busy={!!working}><div className="api-code-heading"><h3>Resposta da API</h3>{result && <><span className={`api-badge${result.error ? " api-badge-error" : ""}`}>{result.status ? `HTTP ${result.status}` : "Falha na consulta"}</span><button type="button" className="api-text-button" onClick={() => void copy(result.text, "result")}><Copy size={14} />{copied === "result" ? "Copiado" : "Copiar resposta"}</button></>}</div>{working ? <p role="status">Consultando a API…</p> : result && <><p><code>{result.path}</code></p><pre className="api-result" role={result.error ? "alert" : undefined}>{result.text}</pre></>}</section>}
      <p className="api-footnote">“Copiar tudo” inclui a documentação de todas as coleções, campos, exemplos e OpenAPI. O download contém a especificação OpenAPI, sem dados de clientes ou tokens. Consultas ao vivo exigem a API publicada e contam como leituras do Firestore.</p>
    </div>
  </section>;
}

function FieldTable({ fields }: { fields: { name: string; type: string; optional: boolean }[] }) {
  return <div className="api-table"><table><thead><tr><th>Campo</th><th>Tipo</th><th>Presença no modelo</th></tr></thead><tbody>{fields.map(field => <tr key={field.name}><td><code>{field.name}</code></td><td><code>{field.type}</code></td><td><span className="api-presence">{field.optional || field.type.includes("?") ? "Opcional" : "Padrão"}</span></td></tr>)}</tbody></table></div>;
}
