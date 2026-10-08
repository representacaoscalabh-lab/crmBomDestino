"use client";

import { FormEvent, useMemo, useState } from "react";
import { Building2, Download, MapPin, Network, Pencil, Plus, Search, Trash2, Upload, UsersRound, X } from "lucide-react";
import { SpreadsheetImportModal } from "@/components/spreadsheet-import-modal";
import { useCrmStore } from "@/lib/store";
import { downloadXlsx, downloadXlsxTemplate, readSpreadsheetRows } from "@/lib/xlsx";
import type { Customer } from "@/lib/types";

const segments = ["FOOD", "ATACADO", "DISTRIBUIDOR", "VAREJO", "INDUSTRIA", "REDES"];
const customerHeadings = ["Código", "Cliente", "CNPJ", "Nome fantasia", "Loja", "Segmento", "Prazo de pagamento", "Cidade", "UF", "Status", "Telefone", "Email", "Endereço", "Bairro", "Representante"];
const cleanHeader = (value: string) => value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

function customerRow(customer: Customer): (string | number)[] {
  return [
    customer.code, customer.name, customer.document ?? "", customer.fantasyName ?? "", customer.store,
    customer.segment ?? "", customer.paymentTerm ?? "", customer.city, customer.state ?? "", customer.status, customer.phone ?? "",
    customer.email ?? "", customer.address ?? "", customer.neighborhood ?? "", customer.representative ?? "",
  ];
}

export default function CustomersPage() {
  const { customers, customerGroups, paymentTerms, addCustomer, addCustomers, updateCustomer, deleteCustomer, saveCustomerGroup, deleteCustomerGroup } = useCrmStore();
  const [searchDraft, setSearchDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("Ativo");
  const [segmentDraft, setSegmentDraft] = useState("Todos");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Ativo");
  const [segment, setSegment] = useState("Todos");
  const [groupDraft, setGroupDraft] = useState("Todos");
  const [groupFilter, setGroupFilter] = useState("Todos");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupCustomerIds, setGroupCustomerIds] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupError, setGroupError] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [confirmingGroupDelete, setConfirmingGroupDelete] = useState(false);
  const [error, setError] = useState("");
  const filtered = useMemo(() => customers.filter((customer) => {
    const matches = `${customer.name} ${customer.fantasyName ?? ""} ${customer.code} ${customer.city} ${customer.store} ${customer.segment ?? ""}`.toLowerCase().includes(search.toLowerCase());
    return matches && (status === "Todos" || customer.status === status) && (segment === "Todos" || customer.segment === segment)
      && (groupFilter === "Todos" || customer.groupId === groupFilter);
  }), [customers, search, status, segment, groupFilter]);
  const selectedCustomers = filtered.filter((customer) => selectedIds.includes(customer.id));

  function applyFilters() {
    setSearch(searchDraft.trim());
    setStatus(statusDraft);
    setSegment(segmentDraft);
    setSelectedIds([]);
  }

  function clearFilters() {
    setSearchDraft("");
    setStatusDraft("Todos");
    setSegmentDraft("Todos");
    setSearch("");
    setStatus("Todos");
    setSegment("Todos");
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

  async function importCustomers(file: File): Promise<string> {
    const rows = await readSpreadsheetRows(file);
    if (!rows.length) throw new Error("A planilha está vazia ou não contém linhas de clientes.");
    const existingCodes = new Set(customers.map((customer) => customer.code.trim().toLowerCase()));
    let skipped = 0;
    const imports: Omit<Customer, "id">[] = [];
    rows.forEach((row, index) => {
      const valueAt = (...names: string[]) => {
        const key = Object.keys(row).find((header) => names.includes(cleanHeader(header)));
        return key ? String(row[key] ?? "").trim() : "";
      };
      const code = valueAt("codigo", "codigocliente", "codcliente");
      const name = valueAt("cliente", "nome", "razaosocial", "nomecliente");
      const document = valueAt("cnpj", "cnpjcpf", "documento");
      if (!code || !name || !document) {
        skipped += 1;
        console.warn(`Cliente ignorado na linha ${index + 2}: código, cliente e CNPJ são obrigatórios.`);
        return;
      }
      const normalizedCode = code.toLowerCase();
      if (existingCodes.has(normalizedCode)) {
        skipped += 1;
        return;
      }
      existingCodes.add(normalizedCode);
      const paymentValue = valueAt("prazodepagamento", "prazopagamento", "condicaodepagamento", "prazo");
      const paymentTerm = paymentTerms.find((item) => item.code.toLowerCase() === paymentValue.toLowerCase() || item.term.toLowerCase() === paymentValue.toLowerCase())?.code ?? paymentValue;
      const rawStatus = valueAt("status").toLowerCase();
      const clientStatus: Customer["status"] = rawStatus === "inativo" ? "Inativo" : rawStatus === "prospect" ? "Prospect" : "Ativo";
      imports.push({
        code,
        name,
        document,
        fantasyName: valueAt("nomefantasia"),
        store: valueAt("loja", "filial"),
        segment: valueAt("segmento"),
        paymentTerm,
        city: valueAt("cidade"),
        state: valueAt("uf", "estado").toUpperCase(),
        status: clientStatus,
        phone: valueAt("telefone", "fone"),
        email: valueAt("email", "e-mail"),
        address: valueAt("endereco", "logradouro"),
        neighborhood: valueAt("bairro"),
        representative: valueAt("representante"),
        lastPurchase: valueAt("ultimacompra"),
      });
    });
    if (!imports.length) throw new Error("Nenhum cliente válido para importar. Confira Código, Cliente e CNPJ; códigos existentes serão ignorados.");
    await addCustomers(imports);
    return `${imports.length} cliente(s) importado(s). ${skipped ? `${skipped} linha(s) ignorada(s) por dados obrigatórios ausentes ou código repetido.` : ""}`;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    if (!customer.name || !customer.code || !customer.document) {
      setError("Preencha os campos obrigatórios: nome, código e CNPJ.");
      return;
    }

    if (customers.some((existing) => existing.id !== editingCustomer?.id && existing.code.toLowerCase() === customer.code.toLowerCase() && existing.store.toLowerCase() === customer.store.toLowerCase())) {
      setError("Já existe um cliente com este código nesta loja.");
      return;
    }
    try {
      if (editingCustomer) await updateCustomer(editingCustomer.id, customer);
      else await addCustomer(customer);
      formElement.reset();
      setError("");
      setShowForm(false);
      setEditingCustomer(null);
    } catch (cause) {
      console.error(editingCustomer ? "Falha ao atualizar cliente." : "Falha ao salvar cliente.", cause);
      setError("Não foi possível salvar o cliente. Verifique a conexão e tente novamente.");
    }
  }

  function startNewGroup() {
    setEditingGroupId(null);
    setGroupName("");
    setGroupCustomerIds(selectedIds);
    setGroupSearch("");
    setGroupError("");
    setConfirmingGroupDelete(false);
  }

  function editGroup(groupId: string) {
    const group = customerGroups.find((item) => item.id === groupId);
    if (!group) return;
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupCustomerIds(customers.filter((customer) => customer.groupId === group.id).map((customer) => customer.id));
    setGroupSearch("");
    setGroupError("");
    setConfirmingGroupDelete(false);
  }

  async function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupName.trim()) {
      setGroupError("Informe um nome para a rede.");
      return;
    }
    if (groupCustomerIds.length < 2) {
      setGroupError("Selecione pelo menos duas lojas para formar uma rede.");
      return;
    }
    if (customerGroups.some((group) => group.id !== editingGroupId && group.name.trim().toLowerCase() === groupName.trim().toLowerCase())) {
      setGroupError("Já existe uma rede com esse nome. Escolha outro nome para diferenciá-la.");
      return;
    }
    setSavingGroup(true);
    try {
      await saveCustomerGroup(editingGroupId, groupName, groupCustomerIds);
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

  const groupCustomers = customers.filter((customer) => `${customer.name} ${customer.code} ${customer.city} ${customer.store}`.toLowerCase().includes(groupSearch.toLowerCase()));

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
      <section className="panel module-panel">
        <div className="module-heading">
          <span className="module-title-icon"><UsersRound size={21} /></span>
          <div className="module-title-copy"><p className="eyebrow">CARTEIRA COMERCIAL</p><h1>Clientes</h1></div>
        </div>
        <div className="customer-toolbar">
          <div className="customer-filter-row">
            <div className="search-field customer-search-control"><Search size={16} /><input aria-label="Buscar cliente" placeholder="Buscar cliente..." value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyFilters(); }} /></div>
            <select aria-label="Filtrar segmento" value={segmentDraft} onChange={(event) => setSegmentDraft(event.target.value)}><option value="Todos">Todos os Segmentos</option>{segments.map((item) => <option key={item}>{item}</option>)}</select>
            <select aria-label="Filtrar rede" value={groupDraft} onChange={(event) => setGroupDraft(event.target.value)}><option value="Todos">Todas as redes</option>{customerGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
            <select aria-label="Filtrar status" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}><option value="Todos">Todos os Status</option><option>Ativo</option><option>Inativo</option><option>Prospect</option></select>
            <button className="button button-primary" onClick={() => { applyFilters(); setGroupFilter(groupDraft); }}>Aplicar</button>
            <button className="button button-outline" onClick={clearFilters}><X size={15} /> Limpar</button>
          </div>
          <div className="customer-actions-row">
            <button className="button button-primary" onClick={() => { setEditingCustomer(null); setError(""); setShowForm(true); }}><Plus size={16} /> Novo Cliente</button>
            <button className="button button-outline" onClick={() => { void exportCustomers(selectedCustomers.length ? selectedCustomers : filtered).catch((cause: unknown) => { console.error("Falha ao exportar clientes.", cause); setError("Não foi possível exportar clientes."); }); }}><Download size={16} /> Exportar{selectedCustomers.length ? ` (${selectedCustomers.length})` : ""}</button>
            <button className="button button-outline" onClick={() => { void downloadTemplate().catch((cause: unknown) => { console.error("Falha ao baixar modelo de clientes.", cause); setError("Não foi possível baixar o modelo."); }); }}><Download size={16} /> Template</button>
            <button className="button button-outline" onClick={() => { setError(""); setShowImport(true); }}><Upload size={16} /> Importar</button>
            <button className="button button-outline" onClick={() => { startNewGroup(); setShowGroups(true); }}><Network size={16} /> Redes ({customerGroups.length})</button>
            <div className="customer-source-card"><span className="customer-source-icon"><Building2 size={17} /></span><span><strong>Dados do Firebase</strong><small>Atualizados em tempo real</small></span></div>
          </div>
        </div>
        {error && !showForm && <div className="form-error customer-page-error" role="alert">{error}</div>}
      </section>
      <div className="customer-count-bar">Mostrando {filtered.length} de {customers.length} cliente(s) · {customerGroups.length} rede(s)</div>
      <section className="panel customer-directory-table">
        {filtered.length ? <div className="table-wrap customer-table-wrap"><table><thead><tr><th className="customer-select-cell"><input aria-label="Selecionar todos os clientes" type="checkbox" checked={filtered.length > 0 && filtered.every((customer) => selectedIds.includes(customer.id))} onChange={(event) => setSelectedIds(event.target.checked ? filtered.map((customer) => customer.id) : [])} /></th><th>Código</th><th>Cliente / Rede</th><th>Segmento</th><th>Cidade</th><th>Status</th><th>Ações</th></tr></thead><tbody>{filtered.map((customer) => {
          const group = customerGroups.find((item) => item.id === customer.groupId);
          return <tr key={customer.id}><td className="customer-select-cell"><input aria-label={`Selecionar ${customer.name}`} type="checkbox" checked={selectedIds.includes(customer.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, customer.id] : current.filter((id) => id !== customer.id))} /></td><td><span className="code-chip">{customer.code}</span></td><td><strong className="customer-name">{customer.name}</strong><small className="customer-detail">{group ? <span className="customer-group-badge"><Network size={11} /> {group.name}</span> : customer.fantasyName || customer.document || "Sem rede"}</small></td><td>{customer.segment || "—"}</td><td>{customer.city || "—"}</td><td><span className={`status-pill ${customer.status === "Ativo" ? "status-green" : "status-neutral"}`}>{customer.status}</span></td><td><div className="product-row-actions"><button className="table-action" aria-label={`Editar ${customer.name}`} title="Editar cliente" onClick={() => { setEditingCustomer(customer); setError(""); setShowForm(true); }}><Pencil size={15} /></button><button className="table-action product-delete-action" aria-label={`Excluir ${customer.name}`} title="Excluir cliente" onClick={() => { setError(""); setPendingDelete(customer); }}><Trash2 size={15} /></button></div></td></tr>;
        })}</tbody></table></div> : <div className="page-empty"><span className="page-empty-icon"><UsersRound size={23} /></span><strong>{search || segment !== "Todos" || status !== "Todos" || groupFilter !== "Todos" ? "Nenhum cliente encontrado" : "Sua carteira está pronta para começar"}</strong><p>{customers.length ? "Experimente ajustar a busca ou os filtros." : "Cadastre seu primeiro cliente para começar a organizar a carteira."}</p>{!customers.length && <button className="button button-outline" onClick={() => { setEditingCustomer(null); setShowForm(true); }}><Plus size={16} /> Cadastrar cliente</button>}</div>}
      </section>
      {showGroups && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingGroup) setShowGroups(false); }}>
        <section className="customer-group-modal" role="dialog" aria-modal="true" aria-labelledby="customer-group-title">
          <div className="modal-heading"><div><p className="eyebrow">CARTEIRA COMERCIAL</p><h2 id="customer-group-title">Redes de clientes</h2><p>Agrupe lojas de um mesmo cliente para consultar o resultado de cada loja e o consolidado da rede.</p></div><button type="button" className="icon-button" aria-label="Fechar" onClick={() => setShowGroups(false)}><X size={20} /></button></div>
          <div className="customer-group-content">
            <div className="customer-group-picker"><label>Rede existente<select value={editingGroupId ?? ""} onChange={(event) => event.target.value ? editGroup(event.target.value) : startNewGroup()}><option value="">Criar uma nova rede</option>{customerGroups.map((group) => <option key={group.id} value={group.id}>{group.name} ({customers.filter((customer) => customer.groupId === group.id).length} lojas)</option>)}</select></label><button type="button" className="button button-outline" onClick={startNewGroup}><Plus size={15} /> Nova rede</button></div>
            <form onSubmit={(event) => void submitGroup(event)}>
              <label className="customer-group-name-field">Nome da rede<input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Ex.: Rede Mercado Bom Preço" /></label>
              <div className="customer-group-select-heading"><div><strong>Selecione as lojas</strong><span>{groupCustomerIds.length} loja(s) selecionada(s)</span></div><div><button type="button" onClick={() => setGroupCustomerIds((current) => Array.from(new Set([...current, ...groupCustomers.map((customer) => customer.id)])))}>Selecionar visíveis</button><button type="button" onClick={() => setGroupCustomerIds([])}>Limpar</button></div></div>
              <div className="customer-group-search"><Search size={16} /><input aria-label="Buscar lojas para adicionar à rede" value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder="Buscar por nome, código ou cidade..." /></div>
              <div className="customer-group-members">{groupCustomers.map((customer) => {
                const otherGroup = customerGroups.find((group) => group.id === customer.groupId && group.id !== editingGroupId);
                return <label key={customer.id} className="customer-group-member"><input type="checkbox" checked={groupCustomerIds.includes(customer.id)} onChange={(event) => setGroupCustomerIds((current) => event.target.checked ? [...current, customer.id] : current.filter((id) => id !== customer.id))} /><span><strong>{customer.name}</strong><small>Cód. {customer.code} · {customer.city || "Cidade não informada"} · Loja {customer.store || "—"}</small></span>{otherGroup && <em>Será movida de {otherGroup.name}</em>}</label>;
              })}{groupCustomers.length === 0 && <p className="customer-group-empty">Nenhum cadastro corresponde à busca.</p>}</div>
              {groupError && <p className="form-error" role="alert">{groupError}</p>}
              {confirmingGroupDelete && <div className="customer-group-delete-confirm" role="alert"><span>Excluir esta rede? As lojas continuarão cadastradas e seus pedidos serão preservados.</span><button type="button" onClick={() => setConfirmingGroupDelete(false)}>Cancelar</button><button type="button" disabled={savingGroup} onClick={() => void removeGroup()}>{savingGroup ? "Excluindo..." : "Confirmar exclusão"}</button></div>}
              <div className="customer-group-footer">{editingGroupId && !confirmingGroupDelete && <button type="button" className="button button-outline customer-group-delete" disabled={savingGroup} onClick={() => setConfirmingGroupDelete(true)}><Trash2 size={15} /> Excluir rede</button>}<span className="customer-group-report-hint">Os relatórios serão consolidados usando os pedidos de cada loja.</span><button type="submit" className="button button-primary" disabled={savingGroup}>{savingGroup ? "Salvando..." : editingGroupId ? "Salvar rede" : "Criar rede"}</button></div>
            </form>
          </div>
        </section>
      </div>}
      {showForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}>
        <section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title">
          <div className="modal-heading"><div><p className="eyebrow">CADASTRO DE CLIENTES</p><h2 id="customer-modal-title">{editingCustomer ? "Editar cliente" : "Novo cliente"}</h2><p>Nome, código e CNPJ são obrigatórios; os demais dados são opcionais.</p></div><button className="icon-button" aria-label="Fechar" onClick={() => setShowForm(false)}><X size={20} /></button></div>
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
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="modal-footer"><button type="button" className="button button-outline" onClick={() => { setShowForm(false); setEditingCustomer(null); setError(""); }}>Cancelar</button><button className="button button-primary" type="submit"><Plus size={16} /> {editingCustomer ? "Salvar alterações" : "Cadastrar cliente"}</button></div>
          </form>
        </section>
      </div>}
      {pendingDelete && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!deleting && event.target === event.currentTarget) setPendingDelete(null); }}>
        <section className="customer-modal product-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-customer-title">
          <div className="modal-heading"><div><p className="eyebrow">EXCLUIR CLIENTE</p><h2 id="delete-customer-title">Confirmar exclusão</h2><p>O cadastro será removido permanentemente.</p></div><button className="icon-button" aria-label="Fechar" disabled={deleting} onClick={() => setPendingDelete(null)}><X size={20} /></button></div>
          <div className="product-delete-body"><strong>{pendingDelete.name}</strong><span>Código: {pendingDelete.code}</span><p>Pedidos já registrados mantêm o histórico de cliente associado.</p></div>
          <div className="modal-footer product-delete-footer"><button className="button button-outline" disabled={deleting} onClick={() => setPendingDelete(null)}>Cancelar</button><button className="button product-delete-confirm" disabled={deleting} onClick={() => { void confirmDelete(); }}><Trash2 size={15} /> {deleting ? "Excluindo..." : "Excluir permanentemente"}</button></div>
        </section>
      </div>}
      <SpreadsheetImportModal open={showImport} title="Importar clientes" description="Adicione vários clientes a partir de uma planilha." formatDescription="Arquivos XLSX ou XLS de até 10 MB" formatHint="Prazo de pagamento é opcional. Código, Cliente e CNPJ são obrigatórios. Códigos repetidos serão ignorados." onTemplate={downloadTemplate} onImport={importCustomers} onClose={() => setShowImport(false)} />
    </div>
  );
}
