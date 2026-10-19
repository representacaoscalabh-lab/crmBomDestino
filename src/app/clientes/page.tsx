"use client";

import { useTableSort } from "@/components/sort-heading";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown, Download, MapPin, Network, Pencil, Plus, Search, SlidersHorizontal, Trash2, Upload, UsersRound, X } from "lucide-react";
import { ImportIssues } from "@/components/import-issues";
import { prepareCustomerImport } from "@/lib/customer-import";
import { customerValidation, normalizeCnpj, ImportValidationError, importFailureMessage } from "@/lib/import-validation";
import { SpreadsheetImportModal } from "@/components/spreadsheet-import-modal";
import { useSellers } from "@/lib/sellers";
import { useCrmStore } from "@/lib/store";
import { downloadXlsx, downloadXlsxTemplate, readSpreadsheetRows } from "@/lib/xlsx";
import type { Customer } from "@/lib/types";
import "./customers.css";

const segments = ["FOOD", "ATACADO", "DISTRIBUIDOR", "VAREJO", "INDUSTRIA", "REDES"];
const customerHeadings = ["Código", "Cliente", "CNPJ", "Nome fantasia", "Loja", "Segmento", "Prazo de pagamento", "Cidade", "UF", "Status", "Telefone", "Email", "Endereço", "Bairro", "Representante"];

function customerRow(customer: Customer): (string | number)[] {
  return [
    customer.code, customer.name, customer.document ?? "", customer.fantasyName ?? "", customer.store,
    customer.segment ?? "", customer.paymentTerm ?? "", customer.city, customer.state ?? "", customer.status, customer.phone ?? "",
    customer.email ?? "", customer.address ?? "", customer.neighborhood ?? "", customer.representative ?? "",
  ];
}

export default function CustomersPage() {
  const { sellers, loading: sellersLoading, error: sellersError } = useSellers();
  const { customers, customerGroups, paymentTerms, addCustomer, addCustomers, updateCustomer, deleteCustomer, deleteCustomers, saveCustomerGroup, deleteCustomerGroup } = useCrmStore();
  const [searchDraft, setSearchDraft] = useState("");
  const [moreFilters, setMoreFilters] = useState(false);
  const actionsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) actionsRef.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && actionsRef.current) actionsRef.current.open = false; };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, []);
  const [statusDraft, setStatusDraft] = useState("Ativo");
  const [segmentDraft, setSegmentDraft] = useState("Todos");
  const [cityDraft, setCityDraft] = useState("Todas");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Ativo");
  const [segment, setSegment] = useState("Todos");
  const [city, setCity] = useState("Todas");
  const [groupDraft, setGroupDraft] = useState("Todos");
  const [groupFilter, setGroupFilter] = useState("Todos");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [customerIssues, setCustomerIssues] = useState<string[]>([]);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const customerSaveLock = useRef(false);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupCustomerIds, setGroupCustomerIds] = useState<string[]>([]);
  const [groupSellers, setGroupSellers] = useState<Record<string, string>>({});
  const [groupSearch, setGroupSearch] = useState("");
  const [groupError, setGroupError] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupTab, setGroupTab] = useState<"stores" | "sellers">("stores");
  const [onlySelectedStores, setOnlySelectedStores] = useState(false);
  const [confirmingGroupDelete, setConfirmingGroupDelete] = useState(false);
  const [error, setError] = useState("");
  const cities = useMemo(() => [...new Set(customers.map((customer) => customer.city.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt-BR")), [customers]);
  const filtered = useMemo(() => customers.filter((customer) => {
    const groupName = customerGroups.find((group) => group.id === customer.groupId)?.name ?? "";
    const matches = `${customer.name} ${customer.fantasyName ?? ""} ${customer.code} ${customer.document ?? ""} ${customer.city} ${customer.store} ${customer.segment ?? ""} ${groupName}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
    return matches && (status === "Todos" || customer.status === status) && (segment === "Todos" || customer.segment === segment)
      && (city === "Todas" || customer.city === city)
      && (groupFilter === "Todos" || customer.groupId === groupFilter);
  }), [customers, customerGroups, search, status, segment, city, groupFilter]);
  const { sorted, heading } = useTableSort(filtered);
  const selectedCustomers = filtered.filter((customer) => selectedIds.includes(customer.id));

  function applyFilters() {
    setSearch(searchDraft.trim());
    setStatus(statusDraft);
    setSegment(segmentDraft);
    setCity(cityDraft);
    setGroupFilter(groupDraft);
    setSelectedIds([]);
  }

  function clearFilters() {
    setSearchDraft("");
    setStatusDraft("Todos");
    setSegmentDraft("Todos");
    setCityDraft("Todas");
    setSearch("");
    setStatus("Todos");
    setSegment("Todos");
    setCity("Todas");
    setGroupDraft("Todos");
    setGroupFilter("Todos");
    setSelectedIds([]);
  }

  async function exportCustomers(rows: Customer[]) {
    const headings = [...customerHeadings, "Rede"];
    await downloadXlsx("clientes-bom-destino.xlsx", "Clientes", headings, rows.map((customer) => [
      ...customerRow(customer),
      customerGroups.find((group) => group.id === customer.groupId)?.name ?? "",
    ]));
  }

  async function downloadTemplate() {
    await downloadXlsxTemplate("modelo-importacao-clientes.xlsx", "Clientes", customerHeadings, [
      "1024", "Mercado Exemplo", "00.000.000/0000-00", "Mercado Exemplo", "01", "VAREJO",
      "28", "São Paulo", "SP", "Ativo", "(11) 99999-9999", "contato@exemplo.com.br", "Rua Exemplo, 10", "Centro", "Representante",
    ]);
  }

  async function importCustomers(file: File) {
    const rows = await readSpreadsheetRows(file);
    const { imports, warnings } = prepareCustomerImport(rows, customers, paymentTerms);
    await addCustomers(imports);
    return { message: `${imports.length} cliente(s) importado(s). ${warnings.length} linha(s) ignorada(s).`, warnings };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (customerSaveLock.current) return;
    setError("");
    setCustomerIssues([]);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const customer: Omit<Customer, "id"> = {
      code: String(form.get("code")).trim(),
      name: String(form.get("name")).trim(),
      fantasyName: String(form.get("fantasyName")).trim(),
      store: String(form.get("store")).trim(),
      document: String(form.get("document")).trim(),
      segment: String(form.get("segment")),
      paymentTerm: String(form.get("paymentTerm") ?? ""),
      status: String(form.get("status")) as Customer["status"],
      representative: String(form.get("representative")).trim(),
      lastPurchase: String(form.get("lastPurchase")),
      address: String(form.get("address")).trim(),
      neighborhood: String(form.get("neighborhood")).trim(),
      city: String(form.get("city")).trim(),
      state: String(form.get("state")).trim().toUpperCase(),
      phone: String(form.get("phone")).trim(),
      email: String(form.get("email")).trim(),
      ...(editingCustomer?.groupId ? { groupId: editingCustomer.groupId } : {}),
    };
    const issues = customerValidation(customer);
    const duplicate = customers.find((existing) => existing.id !== editingCustomer?.id && normalizeCnpj(existing.document ?? "") === normalizeCnpj(customer.document ?? ""));
    if (duplicate && customer.document) issues.push(`CNPJ ${customer.document} já cadastrado para ${duplicate.name} (código ${duplicate.code}). Código e nome podem se repetir; use um CNPJ diferente.`);
    if (issues.length) {
      setError("Revise os dados do cliente antes de salvar.");
      setCustomerIssues(issues);
      const field = !customer.name ? "name" : !customer.code ? "code" : "document";
      formElement.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus();
      return;
    }
    customerSaveLock.current = true;
    setSavingCustomer(true);
    try {
      if (editingCustomer) await updateCustomer(editingCustomer.id, customer);
      else await addCustomer(customer);
      formElement.reset();
      setError("");
      setShowForm(false);
      setEditingCustomer(null);
    } catch (cause) {
      setError(importFailureMessage(cause, "Não foi possível salvar o cliente. Verifique a conexão e tente novamente."));
      if (cause instanceof ImportValidationError) setCustomerIssues(cause.warnings);
    } finally {
      customerSaveLock.current = false;
      setSavingCustomer(false);
    }
  }

  async function confirmBulkDelete() {
    if (bulkDeleting || !bulkDeleteIds.length) return;
    setBulkDeleting(true);
    setBulkDeleteError("");
    try {
      await deleteCustomers(bulkDeleteIds);
      setSelectedIds((ids) => ids.filter((id) => !bulkDeleteIds.includes(id)));
      setBulkDeleteIds([]);
    } catch (cause) {
      setBulkDeleteError(cause instanceof Error ? cause.message : "Não foi possível excluir os clientes. Tente novamente.");
    } finally {
      setBulkDeleting(false);
    }
  }

  function startNewGroup() {
    setGroupTab("stores");
    setOnlySelectedStores(false);
    setGroupSellers({});
    setEditingGroupId(null);
    setGroupName("");
    setGroupCustomerIds(selectedIds);
    setGroupSearch("");
    setGroupError("");
    setConfirmingGroupDelete(false);
  }

  function editGroup(groupId: string) {
    setGroupTab("stores");
    setOnlySelectedStores(false);
    const group = customerGroups.find((item) => item.id === groupId);
    if (!group) return;
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupSellers({ ...group.externalStoreSellers });
    setGroupCustomerIds(customers.filter((customer) => customer.groupId === group.id).map((customer) => customer.id));
    setGroupSearch("");
    setGroupError("");
    setConfirmingGroupDelete(false);
  }

  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingGroup) return;
    if (!groupName.trim()) {
      setGroupError("Informe um nome para a rede.");
      return;
    }
    if (groupCustomerIds.length < 2) {
      setGroupTab("stores");
      setGroupError("Selecione pelo menos duas lojas para formar uma rede.");
      return;
    }
    if (customerGroups.some((group) => group.id !== editingGroupId && group.name.trim().toLowerCase() === groupName.trim().toLowerCase())) {
      setGroupError("Já existe uma rede com esse nome. Escolha outro nome para diferenciá-la.");
      return;
    }
    setSavingGroup(true);
    try {
      if (groupCustomerIds.some((id) => id in groupSellers && !groupSellers[id].trim())) {
        setGroupTab("sellers");
        setGroupError("Informe o vendedor de cada loja marcada como Outro vendedor.");
        return;
      }
      await saveCustomerGroup(editingGroupId, groupName, groupCustomerIds, groupSellers);
      setGroupSellers({});
      setGroupError("");
      setEditingGroupId(null);
      setGroupName("");
      setGroupCustomerIds([]);
      setConfirmingGroupDelete(false);
    } catch (cause) {
      console.error("Falha ao salvar rede de clientes.", cause);
      setGroupError("Não foi possível salvar a rede. Verifique a conexão e tente novamente.");
    } finally {
      setSavingGroup(false);
    }
  }

  async function removeGroup() {
    if (!editingGroupId) return;
    setSavingGroup(true);
    try {
      await deleteCustomerGroup(editingGroupId);
      setEditingGroupId(null);
      setGroupName("");
      setGroupCustomerIds([]);
      setGroupError("");
      setConfirmingGroupDelete(false);
    } catch (cause) {
      console.error("Falha ao excluir rede de clientes.", cause);
      setGroupError("Não foi possível excluir a rede. Tente novamente.");
    } finally {
      setSavingGroup(false);
    }
  }

  const groupCustomers = customers.filter((customer) => (!onlySelectedStores || groupCustomerIds.includes(customer.id)) && `${customer.name} ${customer.code} ${customer.city} ${customer.store} ${customer.document ?? ""}`.toLowerCase().includes(groupSearch.toLowerCase()));

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteCustomer(pendingDelete.id);
      setPendingDelete(null);
      setSelectedIds((current) => current.filter((id) => id !== pendingDelete.id));
    } catch (cause) {
      console.error("Falha ao excluir cliente.", cause);
      setError("Não foi possível excluir o cliente. Verifique sua conexão e permissões.");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page-content module-content customer-directory">
      <section className="customer-controls">
        <div className="customer-page-heading">
          <div><h1>Clientes</h1><p>Gerencie sua carteira de clientes.</p></div>
          <div className="customer-page-actions">
            <details className="customer-actions-menu" ref={actionsRef}>
              <summary>Mais ações <ChevronDown size={15} /></summary>
              <div className="customer-actions-dropdown" onClick={() => { if (actionsRef.current) actionsRef.current.open = false; }}>
                <button type="button" onClick={() => { void exportCustomers(selectedCustomers.length ? selectedCustomers : filtered).catch(() => setError("Não foi possível exportar clientes. Tente novamente.")); }}><Download size={16} /><span>Exportar {selectedCustomers.length ? `selecionados (${selectedCustomers.length})` : "resultados"}</span></button>
                <button type="button" onClick={() => { setError(""); setShowImport(true); }}><Upload size={16} /><span>Importar clientes</span></button>
                <button type="button" onClick={() => { void downloadTemplate().catch(() => setError("Não foi possível baixar o modelo. Tente novamente.")); }}><Download size={16} /><span>Baixar modelo de planilha</span></button>
                <button type="button" onClick={() => { startNewGroup(); setShowGroups(true); }}><Network size={16} /><span>Gerenciar redes</span><small>{customerGroups.length}</small></button>
              </div>
            </details>
            <button type="button" className="button button-primary" onClick={() => { setEditingCustomer(null); setError(""); setShowForm(true); }}><Plus size={16} /> Novo cliente</button>
          </div>
        </div>
        <form className="customer-toolbar" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
          <div className="customer-quick-filters">
            <div className="search-field customer-search-control"><Search size={17} /><input aria-label="Buscar cliente" placeholder="Buscar por nome, código ou CNPJ" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} /></div>
            <select aria-label="Filtrar status" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}><option value="Todos">Todos os status</option><option>Ativo</option><option>Inativo</option><option>Prospect</option></select>
            <button type="button" className={`button button-outline customer-filter-toggle ${moreFilters ? "customer-filter-toggle-active" : ""}`} aria-expanded={moreFilters} aria-controls="customer-extra-filters" onClick={() => setMoreFilters((open) => !open)}><SlidersHorizontal size={15} /> Filtros{[segmentDraft !== "Todos", cityDraft !== "Todas", groupDraft !== "Todos"].filter(Boolean).length > 0 && <span>{[segmentDraft !== "Todos", cityDraft !== "Todas", groupDraft !== "Todos"].filter(Boolean).length}</span>}</button>
            <button type="submit" className="button button-primary">Aplicar</button>
            <button type="button" className="icon-button customer-clear-filters" onClick={clearFilters} aria-label="Limpar filtros" title="Limpar filtros"><X size={17} /></button>
          </div>
          {moreFilters && <div className="customer-extra-filters" id="customer-extra-filters">
            <label><span>Segmento</span><select value={segmentDraft} onChange={(event) => setSegmentDraft(event.target.value)}><option value="Todos">Todos os segmentos</option>{segments.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Cidade</span><select value={cityDraft} onChange={(event) => setCityDraft(event.target.value)}><option value="Todas">Todas as cidades</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span>Rede</span><select value={groupDraft} onChange={(event) => setGroupDraft(event.target.value)}><option value="Todos">Todas as redes</option>{customerGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          </div>}
        </form>
        {error && !showForm && <div className="form-error customer-page-error" role="alert">{error}</div>}
      </section>
      <div className="customer-results-toolbar">
        <span>{filtered.length} de {customers.length} cliente(s)</span>
        <div className="customer-selection-actions">
          {selectedCustomers.length > 0 && <><span className="customer-selection-count">{selectedCustomers.length} selecionado(s)</span><button type="button" className="button button-danger button-small" onClick={() => { setBulkDeleteError(""); setBulkDeleteIds(selectedCustomers.map((customer) => customer.id)); }}><Trash2 size={14} /> Excluir</button></>}
          {filtered.length > 0 && <button type="button" className="customer-selection-toggle" onClick={() => setSelectedIds(filtered.every((customer) => selectedIds.includes(customer.id)) ? [] : filtered.map((customer) => customer.id))}>{filtered.every((customer) => selectedIds.includes(customer.id)) ? "Limpar seleção" : "Selecionar todos"}</button>}
        </div>
      </div>
      <section className="panel customer-directory-table">
        {filtered.length ? <div className="table-wrap customer-table-wrap"><table><thead><tr><th className="customer-select-cell"><input aria-label="Selecionar todos os clientes" type="checkbox" checked={filtered.length > 0 && filtered.every((customer) => selectedIds.includes(customer.id))} onChange={(event) => setSelectedIds(event.target.checked ? filtered.map((customer) => customer.id) : [])} /></th>{heading("code", "Código", (r) => r.code)}{heading("name", "Cliente / Rede", (r) => r.name)}{heading("segment", "Segmento", (r) => r.segment)}{heading("city", "Cidade", (r) => r.city)}{heading("status", "Status", (r) => r.status)}<th>Ações</th></tr></thead><tbody>{sorted.map((customer) => {
          const group = customerGroups.find((item) => item.id === customer.groupId);
          return <tr key={customer.id}><td className="customer-select-cell"><input aria-label={`Selecionar ${customer.name}`} type="checkbox" checked={selectedIds.includes(customer.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, customer.id] : current.filter((id) => id !== customer.id))} /></td><td><span className="code-chip">{customer.code}</span></td><td><strong className="customer-name">{customer.name}</strong><small className="customer-detail">{group && <span className="customer-group-badge"><Network size={11} /> {group.name}</span>}{customer.document && <span className="customer-document-preview">CNPJ {customer.document}</span>}{!group && !customer.document && (customer.fantasyName || "Sem rede")}</small></td><td>{customer.segment || "—"}</td><td>{customer.city || "—"}</td><td><span className={`status-pill ${customer.status === "Ativo" ? "status-green" : "status-neutral"}`}>{customer.status}</span></td><td><div className="product-row-actions"><button className="table-action" aria-label={`Editar ${customer.name}`} title="Editar cliente" onClick={() => { setEditingCustomer(customer); setError(""); setShowForm(true); }}><Pencil size={15} /></button><button className="table-action product-delete-action" aria-label={`Excluir ${customer.name}`} title="Excluir cliente" onClick={() => { setError(""); setPendingDelete(customer); }}><Trash2 size={15} /></button></div></td></tr>;
        })}</tbody></table></div> : <div className="page-empty"><span className="page-empty-icon"><UsersRound size={23} /></span><strong>{search || segment !== "Todos" || status !== "Todos" || city !== "Todas" || groupFilter !== "Todos" ? "Nenhum cliente encontrado" : "Sua carteira está pronta para começar"}</strong><p>{customers.length ? "Experimente ajustar a busca ou os filtros." : "Cadastre seu primeiro cliente para começar a organizar a carteira."}</p>{!customers.length && <button className="button button-outline" onClick={() => { setEditingCustomer(null); setShowForm(true); }}><Plus size={16} /> Cadastrar cliente</button>}</div>}
      </section>
      {showGroups && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingGroup) setShowGroups(false); }}>
        <section className="customer-group-modal network-editor" role="dialog" aria-modal="true" aria-labelledby="customer-group-title">
          <div className="modal-heading"><div><p className="eyebrow">CARTEIRA COMERCIAL</p><h2 id="customer-group-title">Redes de clientes</h2><p>Agrupe lojas de um mesmo cliente para consultar o resultado de cada loja e o consolidado da rede.</p></div><button type="button" className="icon-button" aria-label="Fechar" disabled={savingGroup} onClick={() => setShowGroups(false)}><X size={20} /></button></div>
          <div className="customer-group-content">
            <div className="customer-group-picker"><label>Rede existente<select value={editingGroupId ?? ""} onChange={(event) => event.target.value ? editGroup(event.target.value) : startNewGroup()}><option value="">Criar uma nova rede</option>{customerGroups.map((group) => <option key={group.id} value={group.id}>{group.name} ({customers.filter((customer) => customer.groupId === group.id).length} lojas)</option>)}</select></label><button type="button" className="button button-outline" onClick={startNewGroup}><Plus size={15} /> Nova rede</button></div>
            <form className="network-editor-form" onSubmit={(event) => void submitGroup(event)}>
              <label className="customer-group-name-field">Nome da rede<input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Ex.: Rede Mercado Bom Preço" /></label>
              <div className="network-editor-tabs" role="tablist" aria-label="Configurar rede">
                <button type="button" id="network-stores-tab" role="tab" aria-selected={groupTab === "stores"} aria-controls="network-stores-panel" onClick={() => setGroupTab("stores")}><Building2 size={16} /> Lojas <span>{groupCustomerIds.length}</span></button>
                <button type="button" id="network-sellers-tab" role="tab" aria-selected={groupTab === "sellers"} aria-controls="network-sellers-panel" onClick={() => setGroupTab("sellers")}><UsersRound size={16} /> Responsáveis</button>
              </div>
              <fieldset className="network-editor-scroll" disabled={savingGroup}>
              <div id="network-stores-panel" role="tabpanel" aria-labelledby="network-stores-tab" hidden={groupTab !== "stores"}>
              <label className="network-selected-filter"><input type="checkbox" checked={onlySelectedStores} onChange={(event) => setOnlySelectedStores(event.target.checked)} /> Mostrar apenas selecionadas</label>
              <div className="customer-group-select-heading"><div><strong>Selecione as lojas</strong><span>{groupCustomerIds.length} loja(s) selecionada(s)</span></div><div><button type="button" onClick={() => setGroupCustomerIds((current) => Array.from(new Set([...current, ...groupCustomers.map((customer) => customer.id)])))}>Selecionar visíveis</button><button type="button" onClick={() => setGroupCustomerIds([])}>Limpar</button></div></div>
              <div className="customer-group-search"><Search size={16} /><input aria-label="Buscar lojas para adicionar à rede" value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder="Buscar por nome, código ou cidade..." /></div>
              <div className="customer-group-members">{groupCustomers.map((customer) => {
                const otherGroup = customerGroups.find((group) => group.id === customer.groupId && group.id !== editingGroupId);
                return <label key={customer.id} className="customer-group-member"><input type="checkbox" checked={groupCustomerIds.includes(customer.id)} onChange={(event) => setGroupCustomerIds((current) => event.target.checked ? [...current, customer.id] : current.filter((id) => id !== customer.id))} /><span><strong>{customer.name}</strong><small>Cód. {customer.code} · {customer.city || "Cidade não informada"} · Loja {customer.store || "—"}</small></span>{otherGroup && <em>Será movida de {otherGroup.name}</em>}</label>;
              })}{groupCustomers.length === 0 && <p className="customer-group-empty">Nenhum cadastro corresponde à busca.</p>}</div>
              </div>
              <section className="customer-group-sellers" id="network-sellers-panel" role="tabpanel" aria-labelledby="network-sellers-tab" hidden={groupTab !== "sellers"}>
                <strong>Quem atende cada loja?</strong>
                {sellersError && <p role="alert">{sellersError}</p>}
                {!sellersLoading && !sellersError && sellers.length === 0 && <p>Cadastre os vendedores em Configurações → Vendedores.</p>}
                <p>Lojas de outro vendedor continuam na rede e recebem pedidos normalmente, mas ficam fora de todas as métricas do dashboard. A seleção vale também para pedidos já importados.</p>
                {customers.filter((customer) => groupCustomerIds.includes(customer.id)).map((customer) => <div className="customer-group-seller-row" key={customer.id}>
                  <span><strong>{customer.name}</strong><small>Cód. {customer.code} · Loja {customer.store || "—"} · {customer.city}</small></span>
                  <select aria-label={`Responsável pela loja ${customer.code} ${customer.store}`} value={customer.id in groupSellers ? "external" : "ours"} onChange={(event) => setGroupSellers((current) => {
                    const next = { ...current };
                    if (event.target.value === "external") next[customer.id] = "";
                    else delete next[customer.id];
                    return next;
                  })}><option value="ours">Representação WRRJ</option><option value="external">Outro vendedor</option></select>
                  {customer.id in groupSellers && <label>Vendedor<select value={groupSellers[customer.id]} onChange={(event) => setGroupSellers((current) => ({ ...current, [customer.id]: event.target.value }))}>
                    <option value="">{sellersLoading ? "Carregando vendedores..." : "Selecione o vendedor"}</option>
                    {groupSellers[customer.id] && !sellers.some((seller) => seller.name === groupSellers[customer.id]) && <option value={groupSellers[customer.id]}>{groupSellers[customer.id]} (cadastro anterior)</option>}
                    {sellers.map((seller) => <option key={seller.id} value={seller.name}>{seller.name}</option>)}
                  </select></label>}
                </div>)}
                <small>{groupCustomerIds.filter((id) => id in groupSellers).length} loja(s) de outro vendedor · {groupCustomerIds.filter((id) => !(id in groupSellers)).length} na Representação WRRJ</small>
              </section>
              </fieldset>
              {groupError && <p className="form-error" role="alert">{groupError}</p>}
              {confirmingGroupDelete && <div className="customer-group-delete-confirm" role="alert"><span>Excluir esta rede? As lojas continuarão cadastradas e seus pedidos serão preservados.</span><button type="button" onClick={() => setConfirmingGroupDelete(false)}>Cancelar</button><button type="button" disabled={savingGroup} onClick={() => void removeGroup()}>{savingGroup ? "Excluindo..." : "Confirmar exclusão"}</button></div>}
              <div className="customer-group-footer">{editingGroupId && !confirmingGroupDelete && <button type="button" className="button button-outline customer-group-delete" disabled={savingGroup} onClick={() => setConfirmingGroupDelete(true)}><Trash2 size={15} /> Excluir rede</button>}<button type="button" className="button button-outline" disabled={savingGroup} onClick={() => setShowGroups(false)}>Cancelar</button><span className="customer-group-report-hint">Os relatórios serão consolidados usando os pedidos de cada loja.</span><button type="submit" className="button button-primary" disabled={savingGroup}>{savingGroup ? "Salvando..." : editingGroupId ? "Salvar rede" : "Criar rede"}</button></div>
            </form>
          </div>
        </section>
      </div>}
      {showForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!savingCustomer && event.target === event.currentTarget) setShowForm(false); }}>
        <section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title">
          <div className="modal-heading"><div><p className="eyebrow">CADASTRO DE CLIENTES</p><h2 id="customer-modal-title">{editingCustomer ? "Editar cliente" : "Novo cliente"}</h2><p>Nome, código e CNPJ são obrigatórios. Somente o CNPJ precisa ser único.</p></div><button className="icon-button" aria-label="Fechar" disabled={savingCustomer} onClick={() => setShowForm(false)}><X size={20} /></button></div>
          <form className="modal-form customer-form" onSubmit={submit}>
            <div className="modal-section customer-required-section"><div className="customer-section-heading"><span className="customer-section-icon"><Building2 size={17} /></span><div><h3>Identificação do cliente</h3><p>Campos com <strong>*</strong> são obrigatórios</p></div><span className="required-badge">3 campos</span></div><div className="modal-fields customer-required-fields">
              <label className="field-wide"><span>Nome do cliente <i className="required-mark">*</i></span><input name="name" required defaultValue={editingCustomer?.name ?? ""} placeholder="Razão social ou nome do cliente" autoFocus /></label>
              <label><span>Código <i className="required-mark">*</i></span><input name="code" required defaultValue={editingCustomer?.code ?? ""} placeholder="Código interno" /></label>
              <label><span>CNPJ <i className="required-mark">*</i></span><input name="document" required defaultValue={editingCustomer?.document ?? ""} placeholder="00.000.000/0000-00" inputMode="numeric" /></label>
            </div></div>
            <div className="modal-section"><div className="customer-section-heading"><span className="customer-section-icon"><Building2 size={17} /></span><div><h3>Informações comerciais</h3><p>Complementos opcionais para organizar sua carteira</p></div><span className="optional-badge">Opcional</span></div><div className="modal-fields">
              <label>Nome fantasia<input name="fantasyName" defaultValue={editingCustomer?.fantasyName ?? ""} /></label><label>Loja<input name="store" defaultValue={editingCustomer?.store ?? ""} /></label>
              <label>Segmento<select name="segment" defaultValue={editingCustomer?.segment ?? ""}><option value="">Sem segmento</option>{segments.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Prazo de pagamento<select name="paymentTerm" defaultValue={editingCustomer?.paymentTerm ?? ""}><option value="">Sem prazo definido</option>{editingCustomer?.paymentTerm && !paymentTerms.some((term) => term.code === editingCustomer.paymentTerm) && <option value={editingCustomer.paymentTerm}>{editingCustomer.paymentTerm}</option>}{paymentTerms.slice().sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true })).map((term) => <option key={term.id} value={term.code}>{term.code} — {term.term}</option>)}</select></label>
              <label>Status<select name="status" defaultValue={editingCustomer?.status ?? "Ativo"}><option>Ativo</option><option>Inativo</option><option>Prospect</option></select></label>
              <label>Representante<input name="representative" defaultValue={editingCustomer?.representative ?? ""} /></label><label>Última compra<input name="lastPurchase" type="date" defaultValue={editingCustomer?.lastPurchase ?? ""} /></label>
            </div></div>
            <div className="modal-section"><div className="customer-section-heading"><span className="customer-section-icon"><MapPin size={17} /></span><div><h3>Localização e contato</h3><p>Adicione formas de contato e endereço</p></div><span className="optional-badge">Opcional</span></div><div className="modal-fields">
              <label className="field-wide">Endereço<input name="address" defaultValue={editingCustomer?.address ?? ""} /></label><label>Bairro<input name="neighborhood" defaultValue={editingCustomer?.neighborhood ?? ""} /></label>
              <label>Cidade<input name="city" defaultValue={editingCustomer?.city ?? ""} /></label><label>UF<input name="state" maxLength={2} defaultValue={editingCustomer?.state ?? ""} /></label>
              <label>Telefone<input name="phone" type="tel" defaultValue={editingCustomer?.phone ?? ""} /></label><label>Email<input name="email" type="email" defaultValue={editingCustomer?.email ?? ""} /></label>
            </div></div>
            {error && <ImportIssues error={error} warnings={customerIssues} title="Revise o cadastro do cliente" guidance="Ajuste os campos indicados e salve novamente. Seus dados preenchidos foram mantidos." />}
            <div className="modal-footer"><button type="button" className="button button-outline" disabled={savingCustomer} onClick={() => { setShowForm(false); setEditingCustomer(null); setError(""); }}>Cancelar</button><button className="button button-primary" type="submit" disabled={savingCustomer}><Plus size={16} /> {savingCustomer ? "Salvando..." : editingCustomer ? "Salvar alterações" : "Cadastrar cliente"}</button></div>
          </form>
        </section>
      </div>}
      {bulkDeleteIds.length > 0 && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!bulkDeleting && event.target === event.currentTarget) setBulkDeleteIds([]); }}>
        <section className="customer-modal product-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="bulk-delete-customers-title">
          <div className="modal-heading"><div><p className="eyebrow">EXCLUSÃO DE CLIENTES</p><h2 id="bulk-delete-customers-title">Excluir {bulkDeleteIds.length} cliente(s)?</h2><p>Os cadastros selecionados serão removidos permanentemente.</p></div><button type="button" className="icon-button" aria-label="Fechar" disabled={bulkDeleting} onClick={() => setBulkDeleteIds([])}><X size={20} /></button></div>
          <div className="product-delete-body"><strong>{bulkDeleteIds.length} cliente(s) selecionado(s)</strong><p>Pedidos e bonificações já registrados mantêm o histórico. Revise a seleção antes de confirmar.</p>{bulkDeleteError && <ImportIssues error={bulkDeleteError} title="Não foi possível concluir a exclusão" />}</div>
          <div className="modal-footer"><button type="button" className="button button-outline" disabled={bulkDeleting} onClick={() => setBulkDeleteIds([])}>Cancelar</button><button type="button" className="button button-danger" disabled={bulkDeleting} onClick={() => void confirmBulkDelete()}><Trash2 size={15} />{bulkDeleting ? "Excluindo..." : `Excluir ${bulkDeleteIds.length} cliente(s)`}</button></div>
        </section>
      </div>}
      {pendingDelete && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!deleting && event.target === event.currentTarget) setPendingDelete(null); }}>
        <section className="customer-modal product-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-customer-title">
          <div className="modal-heading"><div><p className="eyebrow">EXCLUIR CLIENTE</p><h2 id="delete-customer-title">Confirmar exclusão</h2><p>O cadastro será removido permanentemente.</p></div><button className="icon-button" aria-label="Fechar" disabled={deleting} onClick={() => setPendingDelete(null)}><X size={20} /></button></div>
          <div className="product-delete-body"><strong>{pendingDelete.name}</strong><span>Código: {pendingDelete.code}</span><p>Pedidos já registrados mantêm o histórico de cliente associado.</p></div>
          <div className="modal-footer product-delete-footer"><button className="button button-outline" disabled={deleting} onClick={() => setPendingDelete(null)}>Cancelar</button><button className="button product-delete-confirm" disabled={deleting} onClick={() => { void confirmDelete(); }}><Trash2 size={15} /> {deleting ? "Excluindo..." : "Excluir permanentemente"}</button></div>
        </section>
      </div>}
      <SpreadsheetImportModal open={showImport} title="Importar clientes" description="Adicione vários clientes a partir de uma planilha." formatDescription="Arquivos XLSX ou XLS de até 10 MB" formatHint="Somente o CNPJ é obrigatório. Nome, código e demais campos são opcionais. CNPJs repetidos serão ignorados." onTemplate={downloadTemplate} onImport={importCustomers} onClose={() => setShowImport(false)} />
    </div>
  );
}
