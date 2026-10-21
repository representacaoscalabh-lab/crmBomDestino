"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, FileText, Filter, Gift, PackageCheck, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { RecordPagination } from "@/components/record-pagination";
import { getRecordDetail, useRecordPage } from "@/lib/use-record-page";
import { currentRecordMonth } from "@/lib/record-query";
import { useCrmStore, useCrmResources } from "@/lib/store";
import { getExternalCustomerIds } from "@/lib/dashboard-scope";
import { getPackageValues } from "@/lib/product-packaging";
import type { Bonification, Customer, OrderItem, Product } from "@/lib/types";
import "./bonifications.css";

const dateToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};
const money = (value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kg = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`;
const normalizeText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

function BonusMultiFilter({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (values: string[]) => void }) {
  const [search, setSearch] = useState("");
  const visible = options.filter(option => normalizeText(option).includes(normalizeText(search)));
  return <div className="filter-field"><span>{label}</span><details className="bonus-multi" onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
    <summary>{selected.length ? `${selected.length} selecionado(s)` : label === "Cidades" ? "Todas as cidades" : "Todos os motivos"}<span aria-hidden="true">⌄</span></summary>
    <div className="bonus-multi-menu">
      <div className="search-field"><Search size={14} /><input aria-label={`Buscar ${label.toLocaleLowerCase("pt-BR")}`} placeholder="Buscar opção..." value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} /></div>
      <div className="bonus-multi-tools"><button type="button" onClick={() => onChange([...new Set([...selected, ...visible])])}>Selecionar visíveis</button><button type="button" onClick={() => onChange([])}>Limpar</button></div>
      <div className="bonus-multi-options">{visible.map(option => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => onChange(selected.includes(option) ? selected.filter(value => value !== option) : [...selected, option])} /><span>{option}</span></label>)}{!visible.length && <p>Nenhuma opção encontrada.</p>}</div>
    </div>
  </details></div>;
}

function makeBonusItem(product: Product, packageKind: OrderItem["packageKind"], packageQuantity: number): OrderItem {
  const pack = getPackageValues(product, packageKind === "Meia caixa");
  const unitPrice = product.unitPrice ?? product.pricePerBox / Math.max(1, product.quantityPerBox);
  const unitQuantity = pack.unitQuantity * packageQuantity;
  const totalWeight = pack.weight * packageQuantity;
  return {
    productId: product.id,
    productCode: packageKind === "Caixa" ? product.codeBox : product.codeHalfBox,
    description: product.description,
    packageKind,
    packageQuantity,
    unitQuantity,
    packagePrice: pack.price,
    unitPrice,
    totalWeight,
    discountPercent: 0,
    subtotal: Math.round(pack.price * packageQuantity * 100) / 100,
    boxQuantity: packageKind === "Caixa" ? packageQuantity : 0,
    pieces: unitQuantity,
    netWeight: 0,
    grossWeight: totalWeight,
  };
}

export default function BonificationsPage() {
  const { customers, customerGroups, products, dataError, addBonification, updateBonification, deleteBonification } = useCrmStore();
  const [selectedRecords, setSelectedRecords] = useState<Map<string, Bonification>>(() => new Map());
  const selectedIds = new Set(selectedRecords.keys());
  const monthRange = currentRecordMonth();
  const [portfolio, setPortfolio] = useState("all");
  const externalCustomerIds = useMemo(() => getExternalCustomerIds(customers, customerGroups), [customers, customerGroups]);
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [reasonFilter, setReasonFilter] = useState<string[]>([]);
  const [startDateFilter, setStartDateFilter] = useState(monthRange.start);
  const [endDateFilter, setEndDateFilter] = useState(monthRange.end);
  const [appliedFilters, setAppliedFilters] = useState({ query: "", city: [] as string[], reason: [] as string[], start: monthRange.start, end: monthRange.end });
  const [showForm, setShowForm] = useState(false);
  useCrmResources(["products"], showForm);
  const [editing, setEditing] = useState<Bonification | null>(null);
  const [viewing, setViewing] = useState<Bonification | null>(null);
  const [deleting, setDeleting] = useState<Bonification | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [bonusNumber, setBonusNumber] = useState("");
  const [issueDate, setIssueDate] = useState(dateToday);
  const [reason, setReason] = useState("Amostra");
  const [notes, setNotes] = useState("");
  const [productId, setProductId] = useState("");
  const [packageKind, setPackageKind] = useState<OrderItem["packageKind"]>("Caixa");
  const [packageQuantity, setPackageQuantity] = useState(1);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const page = useRecordPage("bonifications", { ...appliedFilters, portfolio });
  const filtered = page.rows.map(row => ({ ...row, items: [] })) as unknown as Array<Bonification & { itemCount?: number }>;
  const sorted = filtered;
  const cities = [...new Set([...customers.map(customer => customer.city), ...filtered.map(bonus => bonus.customerCity || "")].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const reasons = [...new Set(["Amostra", "Cortesia", "Bonificação", "Bonificação sem incidência de custo", ...filtered.map(bonus => bonus.reason)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const invalidDateRange = !startDateFilter || !endDateFilter || startDateFilter > endDateFilter;
  const selectedBonifications = [...selectedRecords.values()];
  const selectedVisibleCount = filtered.filter(bonus => selectedIds.has(bonus.id)).length;
  const allVisibleSelected = filtered.length > 0 && selectedVisibleCount === filtered.length;
  function toggleSelection(id: string) {
    setSelectedRecords(current => {
      const next = new Map(current);
      if (next.has(id)) next.delete(id); else { const row = filtered.find(item => item.id === id); if (row) next.set(id, row); }
      return next;
    });
  }
  function toggleAllVisible() {
    setSelectedRecords(current => {
      const next = new Map(current);
      for (const bonus of filtered) { if (allVisibleSelected) next.delete(bonus.id); else next.set(bonus.id, bonus); }
      return next;
    });
  }
  function heading(key: string, label: string, value: (bonus: Bonification) => unknown) {
    void value;
    const field = ({ date: "issueDate" } as Record<string, string>)[key];
    return <th key={key} aria-sort={field === page.sort ? page.direction === "asc" ? "ascending" : "descending" : undefined}>{field ? <button className="sort-heading" type="button" onClick={() => page.setSort(field)}>{label}{field === page.sort ? page.direction === "asc" ? " ↑" : " ↓" : " ↕"}</button> : label}</th>;
  }
  async function openDetails(bonus: Bonification, edit: boolean) {
    setError("");
    try { const record = await getRecordDetail<Bonification>("bonifications", bonus.id); if (edit) openEdit(record); else setViewing(record); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao abrir bonificação."); }
  }
  const activeFilterCount = [appliedFilters.query, ...appliedFilters.city, ...appliedFilters.reason].filter(Boolean).length + Number(appliedFilters.start !== monthRange.start || appliedFilters.end !== monthRange.end);
  const hasFilters = activeFilterCount > 0 || Boolean(query || cityFilter.length || reasonFilter.length || startDateFilter !== monthRange.start || endDateFilter !== monthRange.end);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invalidDateRange) setAppliedFilters({ query: query.trim(), city: cityFilter, reason: reasonFilter, start: startDateFilter, end: endDateFilter });
  }

  function clearFilters() {
    setQuery("");
    setCityFilter([]);
    setReasonFilter([]);
    setStartDateFilter(monthRange.start);
    setEndDateFilter(monthRange.end);
    setAppliedFilters({ query: "", city: [] as string[], reason: [] as string[], start: monthRange.start, end: monthRange.end });
  }

  const totalWeight = items.reduce((sum, item) => sum + (item.grossWeight ?? item.totalWeight), 0);
  const totalValue = items.reduce((sum, item) => sum + (item.subtotal ?? item.packagePrice * item.packageQuantity), 0);

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setError("");
  }

  function openCreate() {
    setEditing(null);
    setCustomerId("");
    setBonusNumber(`BON-${Date.now().toString().slice(-7)}`);
    setIssueDate(dateToday());
    setReason("Amostra");
    setNotes("");
    setProductId("");
    setPackageKind("Caixa");
    setPackageQuantity(1);
    setItems([]);
    setError("");
    setShowForm(true);
  }

  function openEdit(bonus: Bonification) {
    setEditing(bonus);
    setCustomerId(bonus.customerId);
    setBonusNumber(bonus.bonusNumber);
    setIssueDate(bonus.issueDate);
    setReason(bonus.reason);
    setNotes(bonus.notes);
    setProductId("");
    setPackageKind("Caixa");
    setPackageQuantity(1);
    setItems(bonus.items);
    setError("");
    setShowForm(true);
  }

  function addItem() {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product || packageQuantity <= 0) {
      setError("Selecione um produto e informe uma quantidade maior que zero.");
      return;
    }
    setItems((current) => [...current, makeBonusItem(product, packageKind, packageQuantity)]);
    setProductId("");
    setPackageKind("Caixa");
    setPackageQuantity(1);
    setError("");
  }

  function changeItemQuantity(index: number, quantity: number) {
    if (!Number.isFinite(quantity) || quantity < 0) return;
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!product) return { ...item, packageQuantity: quantity, unitQuantity: 0, totalWeight: 0, grossWeight: 0, subtotal: 0, boxQuantity: 0, pieces: 0 };
      return makeBonusItem(product, item.packageKind, quantity);
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const customer = customers.find((candidate) => candidate.id === customerId);
    if (!customer) {
      setError("Selecione o cliente que receberá a bonificação.");
      return;
    }
    if (!bonusNumber.trim()) {
      setError("Informe o número de controle da bonificação.");
      return;
    }
    if (!items.length || items.every((item) => item.packageQuantity <= 0)) {
      setError("Adicione pelo menos um produto com quantidade maior que zero.");
      return;
    }
    const record: Omit<Bonification, "id"> = {
      bonusNumber: bonusNumber.trim(),
      issueDate,
      customerId: customer.id,
      customerName: customer.name,
      customerCode: customer.code,
      store: customer.store,
      customerCity: customer.city,
      reason: reason.trim() || "Amostra",
      notes: notes.trim(),
      items: items.filter((item) => item.packageQuantity > 0),
      totalValue,
      totalWeight,
    };
    setSaving(true);
    setError("");
    try {
      if (editing) { await updateBonification(editing.id, record); setSelectedRecords(current => { if (!current.has(editing.id)) return current; return new Map(current).set(editing.id, { ...record, id: editing.id }); }); }
      else await addBonification(record);
      closeForm();
    } catch (cause) {
      console.error("Falha ao salvar bonificação.", cause);
      setError("Não foi possível salvar a bonificação. Verifique sua conexão e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setSaving(true);
    try {
      await deleteBonification(deleting.id);
      setSelectedRecords(current => { const next = new Map(current); next.delete(deleting.id); return next; });
      setDeleting(null);
    } catch (cause) {
      console.error("Falha ao excluir bonificação.", cause);
      setError("Não foi possível excluir a bonificação. Tente novamente.");
      setDeleting(null);
    } finally {
      setSaving(false);
    }
  }

  function customerFor(bonus: Bonification): Customer | undefined {
    return customers.find((candidate) => candidate.id === bonus.customerId);
  }

  return <div className="page-content module-content order-page bonification-page">
    <section className="panel module-panel order-module-panel">
      <div className="orders-page-heading">
        <div className="orders-page-title"><span className="module-title-icon"><Gift size={21} /></span><div><h1>Bonificações</h1><p className="bonus-page-description">Amostras e cortesias, em um só lugar.</p></div></div>
        <div className="orders-page-actions"><Link href="/exportacao" className="button button-outline"><FileText size={16} /> Importar PDF</Link><button type="button" className="button button-primary" onClick={openCreate}><Plus size={16} /> Nova bonificação</button></div>
      </div>
      <div className="bonus-scope-bar"><div><h2>Visão das bonificações</h2><p>{portfolio === "all" ? "WRRJ e Sul de Minas juntos, com os totais consolidados." : "Totais da carteira selecionada."}</p></div><div className="bonus-scope-switch" role="group" aria-label="Carteira das bonificações">{[{ id: "all", label: "Mesclado" }, { id: "ours", label: "WRRJ" }, { id: "external", label: "Sul de Minas" }].map(option => <button type="button" key={option.id} aria-pressed={portfolio === option.id} onClick={() => { setSelectedRecords(new Map()); setPortfolio(option.id); }}>{option.label}</button>)}</div></div>
      <form className="order-filter-card bonus-filter-card" onSubmit={applyFilters}>
        <div className="order-filter-heading"><span className="order-filter-icon"><Filter size={17} /></span><div><h2>Filtros</h2><p>Combine busca e período com várias cidades e motivos.</p></div><span className="order-filter-count">{activeFilterCount ? `${activeFilterCount} filtro(s) ativo(s)` : "Sem filtros ativos"}</span></div>
        <div className="bonus-filter-grid">
          <label className="filter-field"><span>Controle ou cliente</span><div className="search-field"><Search size={16} /><input aria-label="Buscar bonificações" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Número, nome, código ou observação" /></div></label>
          <BonusMultiFilter label="Cidades" options={cities} selected={cityFilter} onChange={setCityFilter} />
          <BonusMultiFilter label="Motivos" options={reasons} selected={reasonFilter} onChange={setReasonFilter} />
          <label className="filter-field"><span>Período</span><div className="order-date-range"><div className="date-input-wrap"><input aria-label="Data inicial das bonificações" type="date" max={endDateFilter || undefined} value={startDateFilter} onChange={(event) => setStartDateFilter(event.target.value)} /></div><span aria-hidden="true">até</span><div className="date-input-wrap"><input aria-label="Data final das bonificações" type="date" min={startDateFilter || undefined} value={endDateFilter} onChange={(event) => setEndDateFilter(event.target.value)} /></div></div></label>
        </div>
        <div className="order-filter-actions"><span>Valor de referência · não compõe faturamento</span><div><button type="submit" className="button button-primary" disabled={invalidDateRange}>Aplicar filtros</button><button type="button" className="button button-light" onClick={clearFilters} disabled={!hasFilters}><X size={14} /> Limpar filtros</button></div></div>
        {activeFilterCount > 0 && <div className="bonus-active-filters" aria-label="Filtros aplicados"><span>Aplicados</span>{appliedFilters.query && <button type="button" onClick={() => { setQuery(""); setAppliedFilters(current => ({ ...current, query: "" })); }}>Busca: {appliedFilters.query}<X size={12} /></button>}{(["city", "reason"] as const).flatMap(key => appliedFilters[key].map(value => <button type="button" key={`${key}-${value}`} aria-label={`Remover filtro ${value}`} onClick={() => { const next = appliedFilters[key].filter(item => item !== value); if (key === "city") setCityFilter(next); else setReasonFilter(next); setAppliedFilters(current => ({ ...current, [key]: next })); }}>{value}<X size={12} /></button>))}{(appliedFilters.start !== monthRange.start || appliedFilters.end !== monthRange.end) && <button type="button" onClick={() => { setStartDateFilter(monthRange.start); setEndDateFilter(monthRange.end); setAppliedFilters(current => ({ ...current, start: monthRange.start, end: monthRange.end })); }}>Período: {appliedFilters.start.split("-").reverse().join("/")} a {appliedFilters.end.split("-").reverse().join("/")}<X size={12} /></button>}</div>}
        {invalidDateRange && <p className="bonus-filter-error" role="alert">A data inicial não pode ser posterior à data final.</p>}
      </form>
    </section>

    <div className="bonus-summary" aria-label="Resumo dos resultados filtrados">
      <article><span className="bonus-summary-icon"><Gift size={19} /></span><div><span>Bonificações</span><strong>{page.totals ? page.totals.count : "—"}</strong></div></article>
      <article><span className="bonus-summary-icon"><PackageCheck size={19} /></span><div><span>Peso bonificado</span><strong>{page.totals ? kg(page.totals.weight) : "—"}</strong></div></article>
      <article><span className="bonus-summary-currency">R$</span><div><span>Valor de referência</span><strong>{page.totals ? money(page.totals.value) : "—"}</strong></div></article>
    </div>

    {!page.totals && <div className="bonus-total-prompt"><span>{page.calculatingTotals ? "Calculando os totais de todos os resultados…" : "Os totais completos são calculados sob demanda quando há filtros adicionais."}</span><button className="button button-outline" type="button" disabled={page.calculatingTotals} onClick={() => void page.calculateTotals()}>Calcular totais do filtro</button></div>}
    {(page.error || page.totalError || dataError) && <p className="import-feedback feedback-warning" role="alert">{page.error || page.totalError || dataError}</p>}
    {error && !showForm && <div className="import-feedback feedback-warning" role="alert">{error}</div>}
    <section className="panel order-list-panel bonus-list-panel" aria-label="Lista de bonificações">
      <div className="order-count-bar"><span><strong>{filtered.length}</strong> nesta página{page.totals ? ` · ${page.totals.count} no filtro` : ""}</span><span className="bonus-list-hint">Selecione uma ou todas desta página</span></div>
      {selectedBonifications.length > 0 && <div className="bonus-selection-bar" role="status"><div><strong>{selectedBonifications.length} selecionada(s)</strong><span>{kg(selectedBonifications.reduce((sum, bonus) => sum + bonus.totalWeight, 0))} · {money(selectedBonifications.reduce((sum, bonus) => sum + bonus.totalValue, 0))} em valor de referência</span></div><button type="button" onClick={() => setSelectedRecords(new Map())}><X size={14} /> Limpar seleção</button></div>}
      {filtered.length > 0 ? <div className="table-wrap bonification-table-wrap"><table><thead><tr>
        <th className="bonus-checkbox-cell"><input type="checkbox" aria-label="Selecionar todas as bonificações desta página" checked={allVisibleSelected} ref={node => { if (node) node.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected; }} onChange={toggleAllVisible} /></th>
        {heading("date", "Data", (bonus) => bonus.issueDate)}
        {heading("control", "Controle", (bonus) => bonus.bonusNumber)}
        {heading("customer", "Cliente / loja", (bonus) => bonus.customerName)}
        {heading("city", "Cidade", (bonus) => bonus.customerCity || customerFor(bonus)?.city)}
        {heading("seller", "Responsável", (bonus) => customerGroups.find((group) => group.id === customerFor(bonus)?.groupId)?.externalStoreSellers?.[bonus.customerId] || "Representação WRRJ")}
        {heading("reason", "Motivo", (bonus) => bonus.reason)}
        {heading("items", "Itens", (bonus) => bonus.items.length)}
        {heading("weight", "Peso", (bonus) => bonus.totalWeight)}
        {heading("value", "Valor ref.", (bonus) => bonus.totalValue)}
        <th className="bonus-actions-heading">Ações</th>
      </tr></thead><tbody>{sorted.map((bonus) => <tr key={bonus.id} className={selectedIds.has(bonus.id) ? "bonus-row-selected" : undefined}>
        <td className="bonus-checkbox-cell"><input type="checkbox" aria-label={`Selecionar bonificação ${bonus.bonusNumber}`} checked={selectedIds.has(bonus.id)} onChange={() => toggleSelection(bonus.id)} /></td>
        <td className="bonus-date-cell">{new Date(`${bonus.issueDate}T12:00:00`).toLocaleDateString("pt-BR")}</td>
        <td><span className="bonus-control-code">{bonus.bonusNumber}</span></td>
        <td className="bonus-customer-cell"><strong>{bonus.customerName}</strong><small>Cód. {bonus.customerCode || "—"}{bonus.store ? ` · Loja ${bonus.store}` : ""}</small></td>
        <td>{bonus.customerCity || customerFor(bonus)?.city || "—"}</td>
        <td><span className={`bonus-portfolio-tag ${externalCustomerIds.has(bonus.customerId) ? "is-external" : ""}`}>{externalCustomerIds.has(bonus.customerId) ? "Sul de Minas" : "WRRJ"}</span></td>
        <td><span className="bonus-reason-tag">{bonus.reason || "—"}</span></td>
        <td>{bonus.itemCount ?? "—"}</td><td className="bonus-numeric-cell">{kg(bonus.totalWeight)}</td><td className="bonus-numeric-cell bonus-value-cell">{money(bonus.totalValue)}</td>
        <td><div className="order-row-actions"><button type="button" aria-label={`Visualizar ${bonus.bonusNumber}`} title="Visualizar" onClick={() => void openDetails(bonus, false)}><Eye size={16} /></button><button type="button" aria-label={`Editar ${bonus.bonusNumber}`} title="Editar" onClick={() => void openDetails(bonus, true)}><Pencil size={15} /></button><button type="button" className="bonus-delete-action" aria-label={`Excluir ${bonus.bonusNumber}`} title="Excluir" onClick={() => setDeleting(bonus)}><Trash2 size={15} /></button></div></td>
      </tr>)}</tbody></table></div> : <div className="page-empty bonus-empty"><span className="page-empty-icon"><Gift size={26} /></span><strong>{page.loading ? "Carregando bonificações…" : page.error ? "Não foi possível carregar" : page.hasNext ? "Continue a busca na próxima página" : "Nenhuma bonificação encontrada"}</strong><p>{page.hasNext ? "Há mais registros no período para verificar com estes filtros." : "Ajuste os filtros ou registre uma nova bonificação."}</p></div>}
      <RecordPagination page={page} />
    </section>

    {showForm && <div className="modal-backdrop order-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeForm(); }}>
      <form className="modal-card bonification-modal" role="dialog" aria-modal="true" aria-labelledby="bonification-form-title" onSubmit={(event) => void save(event)}>
        <div className="order-editor-heading"><div className="order-editor-icon"><Gift size={21} /></div><div><p className="eyebrow">AMOSTRAS E CORTESIAS</p><h2 id="bonification-form-title">{editing ? "Editar bonificação" : "Nova bonificação"}</h2><p>Registro independente para controle de amostras e cortesias.</p></div><button type="button" className="icon-button" aria-label="Fechar" disabled={saving} onClick={closeForm}><X size={20} /></button></div>
        <div className="bonification-form-body">
          <section className="order-form-section">
            <div className="order-section-title"><span>01</span><div><h3>Identificação e cliente</h3><p>Informe quem recebeu a amostra e o motivo.</p></div></div>
            <div className="bonification-form-grid">
              <label>Número de controle<input required value={bonusNumber} onChange={(event) => setBonusNumber(event.target.value)} /></label>
              <label>Data<input required type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></label>
              <label>Cliente / loja<select required value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Selecione o cliente...</option>{customers.filter((customer) => customer.status !== "Inativo").sort((left, right) => left.name.localeCompare(right.name)).map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.code} · {customer.city}</option>)}</select></label>
              <label>Motivo<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Amostra, cortesia..." /></label>
              <label className="bonification-notes-field">Observações<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Observações opcionais" /></label>
            </div>
          </section>
          <section className="order-form-section">
            <div className="order-section-title"><span>02</span><div><h3>Produtos bonificados</h3><p>Peso e valor de referência usam os dados do catálogo; não são contabilizados como venda.</p></div></div>
            <div className="bonification-add-item">
              <label>Produto<select value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Selecione um produto...</option>{products.filter((product) => product.status === "Ativo").sort((left, right) => left.description.localeCompare(right.description)).map((product) => <option key={product.id} value={product.id}>{product.codeBox} · {product.description}</option>)}</select></label>
              <label>Embalagem<select value={packageKind} onChange={(event) => setPackageKind(event.target.value as OrderItem["packageKind"])}><option value="Caixa">Caixa</option><option value="Meia caixa" disabled={!products.find((product) => product.id === productId)?.codeHalfBox}>Meia caixa</option></select></label>
              <label>Quantidade<input type="number" min="0.001" step="0.001" value={packageQuantity} onChange={(event) => setPackageQuantity(Number(event.target.value))} /></label>
              <button type="button" className="button button-outline" onClick={addItem}><Plus size={15} /> Adicionar</button>
            </div>
            {items.length ? <div className="table-wrap bonification-items-wrap"><table><thead><tr><th>PRODUTO</th><th>CÓDIGO</th><th>EMBALAGEM</th><th>QTD. EMB.</th><th>UNIDADES</th><th>PESO</th><th>VALOR REF.</th><th></th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.productId}-${index}`}><td>{item.description}</td><td>{item.productCode}</td><td>{item.packageKind}</td><td><input aria-label={`Quantidade de ${item.description}`} type="number" min="0" step="0.001" value={item.packageQuantity} onChange={(event) => changeItemQuantity(index, Number(event.target.value))} /></td><td>{item.unitQuantity}</td><td>{kg(item.grossWeight ?? item.totalWeight)}</td><td>{money(item.subtotal ?? item.packagePrice * item.packageQuantity)}</td><td><button type="button" className="order-line-remove" aria-label={`Remover ${item.description}`} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div> : <div className="order-items-empty"><PackageCheck size={20} /><span>Adicione os produtos entregues como amostra ou cortesia.</span></div>}
            <div className="bonification-form-totals"><span>{items.length} produto(s) · {kg(totalWeight)} bonificados</span><strong>Valor de referência: {money(totalValue)}</strong></div>
          </section>
          {error && <div className="import-feedback feedback-warning" role="alert">{error}</div>}
        </div>
        <div className="order-editor-footer"><button type="button" className="button button-light" disabled={saving} onClick={closeForm}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Salvando..." : editing ? "Salvar alterações" : "Registrar bonificação"}</button></div>
      </form>
    </div>}

    {viewing && <div className="modal-backdrop order-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewing(null); }}>
      <section className="modal-card order-view-modal bonification-view-modal" role="dialog" aria-modal="true" aria-labelledby="bonification-view-title">
        <div className="order-editor-heading"><div className="order-editor-icon"><Gift size={21} /></div><div><p className="eyebrow">AMOSTRA / CORTESIA · FORA DOS PEDIDOS</p><h2 id="bonification-view-title">{viewing.bonusNumber}</h2><p>{viewing.customerName} · {new Date(`${viewing.issueDate}T12:00:00`).toLocaleDateString("pt-BR")}</p></div><button className="icon-button" aria-label="Fechar" onClick={() => setViewing(null)}><X size={20} /></button></div>
        <div className="order-view-body">
          <div className="order-view-section"><div className="order-view-section-heading"><Gift size={16} /><h3>Destinatário e controle</h3></div><div className="order-view-summary order-view-customer"><div><span>Cliente / loja</span><strong>{viewing.customerName}</strong></div><div><span>Código do cliente</span><strong>{viewing.customerCode || customerFor(viewing)?.code || "—"}</strong></div><div><span>CNPJ / CPF</span><strong>{customerFor(viewing)?.document || "Não informado"}</strong></div><div><span>Cidade</span><strong>{viewing.customerCity || customerFor(viewing)?.city || "—"}</strong></div><div><span>Motivo</span><strong>{viewing.reason}</strong></div><div><span>Observações</span><strong>{viewing.notes || "—"}</strong></div></div></div>
          <div className="order-view-section"><div className="order-view-section-heading"><PackageCheck size={16} /><h3>Produtos entregues <span>{viewing.items.length}</span></h3></div><div className="table-wrap bonification-items-wrap"><table><thead><tr><th>PRODUTO</th><th>CÓDIGO</th><th>EMBALAGEM</th><th>QTD. EMB.</th><th>UNIDADES</th><th>PESO BRUTO</th><th>VALOR REF.</th></tr></thead><tbody>{viewing.items.map((item, index) => <tr key={`${item.productId}-${index}`}><td>{item.description}</td><td>{item.productCode}</td><td>{item.packageKind}</td><td>{item.packageQuantity}</td><td>{item.unitQuantity}</td><td>{kg(item.grossWeight ?? item.totalWeight)}</td><td>{money(item.subtotal ?? item.packagePrice * item.packageQuantity)}</td></tr>)}</tbody></table></div></div>
          <div className="bonification-view-total"><span>Total bonificado <strong>{kg(viewing.totalWeight)}</strong></span><span>Valor de referência (não faturado) <strong>{money(viewing.totalValue)}</strong></span></div>
        </div>
        <div className="order-editor-footer"><button className="button button-light" onClick={() => setViewing(null)}>Fechar</button><button className="button button-primary" onClick={() => { setViewing(null); openEdit(viewing); }}><Pencil size={15} /> Editar bonificação</button></div>
      </section>
    </div>}
    {deleting && <div className="modal-backdrop"><section className="modal-card order-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-bonification-title"><div className="order-editor-icon order-delete-icon"><Trash2 size={21} /></div><h2 id="delete-bonification-title">Excluir bonificação?</h2><p>A bonificação <strong>{deleting.bonusNumber}</strong> de <strong>{deleting.customerName}</strong> será removida permanentemente.</p><div className="order-editor-footer"><button className="button button-light" disabled={saving} onClick={() => setDeleting(null)}>Cancelar</button><button className="button button-danger" disabled={saving} onClick={() => void confirmDelete()}>{saving ? "Excluindo..." : "Excluir bonificação"}</button></div></section></div>}
  </div>;
}
