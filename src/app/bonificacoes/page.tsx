"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Eye, Gift, PackageCheck, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { getPackageValues } from "@/lib/product-packaging";
import type { Bonification, Customer, OrderItem, Product } from "@/lib/types";

const dateToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};
const money = (value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kg = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`;
const normalizeText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

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
  const { bonifications, customers, products, addBonification, updateBonification, deleteBonification } = useCrmStore();
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
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

  const cities = useMemo(() => [...new Set(bonifications.map((bonus) => (bonus.customerCity || customers.find((customer) => customer.id === bonus.customerId)?.city || "").trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt-BR")), [bonifications, customers]);
  const reasons = useMemo(() => [...new Set(bonifications.map((bonus) => bonus.reason.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt-BR")), [bonifications]);
  const invalidDateRange = Boolean(startDateFilter && endDateFilter && startDateFilter > endDateFilter);
  const filtered = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    return bonifications
      .filter((bonus) => {
        const customerCity = (bonus.customerCity || customers.find((customer) => customer.id === bonus.customerId)?.city || "").trim();
        const matchesQuery = normalizeText(`${bonus.bonusNumber} ${bonus.customerName} ${bonus.customerCode} ${bonus.store} ${bonus.reason} ${bonus.notes}`).includes(normalizedQuery);
        const matchesCity = !cityFilter || customerCity === cityFilter;
        const matchesReason = !reasonFilter || bonus.reason.trim() === reasonFilter;
        const matchesStart = !startDateFilter || bonus.issueDate >= startDateFilter;
        const matchesEnd = !endDateFilter || bonus.issueDate <= endDateFilter;
        return matchesQuery && matchesCity && matchesReason && matchesStart && matchesEnd;
      })
      .sort((left, right) => right.issueDate.localeCompare(left.issueDate));
  }, [bonifications, cityFilter, customers, endDateFilter, query, reasonFilter, startDateFilter]);
  const activeFilterCount = [query, cityFilter, reasonFilter, startDateFilter, endDateFilter].filter(Boolean).length;

  function clearFilters() {
    setQuery("");
    setCityFilter("");
    setReasonFilter("");
    setStartDateFilter("");
    setEndDateFilter("");
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
      if (editing) await updateBonification(editing.id, record);
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

  return <div className="page-content module-content bonification-page">
    <section className="panel module-panel">
      <div className="module-heading">
        <span className="module-title-icon"><Gift size={21} /></span>
        <div className="module-title-copy"><p className="eyebrow">AMOSTRAS E CORTESIAS</p><h1>Bonificações</h1><p className="bonification-heading-note">Registro e acompanhamento de bonificações.</p></div>
        <div className="module-actions"><button className="button button-primary" onClick={openCreate}><Plus size={16} /> Nova bonificação</button></div>
      </div>
      <div className="bonification-metrics">
        <article><span>Bonificações registradas</span><strong>{bonifications.length}</strong><small>Amostras e cortesias cadastradas</small></article>
        <article><span>Peso total bonificado</span><strong>{kg(bonifications.reduce((sum, bonus) => sum + bonus.totalWeight, 0))}</strong><small>Calculado pelo cadastro dos produtos</small></article>
        <article><span>Valor de referência</span><strong>{money(bonifications.reduce((sum, bonus) => sum + bonus.totalValue, 0))}</strong><small>Informativo; não é faturamento</small></article>
      </div>
      <div className="bonification-toolbar">
        <div className="bonification-filter-grid">
          <label className="search-field"><Search size={15} /><input aria-label="Buscar bonificações" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Número, cliente, código ou observação..." /></label>
          <label className="bonification-filter-field"><span>Cidade</span><select aria-label="Filtrar bonificações por cidade" value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}><option value="">Todas as cidades</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
          <label className="bonification-filter-field"><span>Motivo</span><select aria-label="Filtrar bonificações por motivo" value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)}><option value="">Todos os motivos</option>{reasons.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="bonification-filter-field"><span>Data inicial</span><input aria-label="Data inicial das bonificações" type="date" max={endDateFilter || undefined} value={startDateFilter} onChange={(event) => setStartDateFilter(event.target.value)} /></label>
          <label className="bonification-filter-field"><span>Data final</span><input aria-label="Data final das bonificações" type="date" min={startDateFilter || undefined} value={endDateFilter} onChange={(event) => setEndDateFilter(event.target.value)} /></label>
          <div className="bonification-filter-summary"><span>{filtered.length} de {bonifications.length} bonificação(ões)</span><button type="button" className="button button-light" onClick={clearFilters} disabled={activeFilterCount === 0}><X size={14} /> Limpar filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</button></div>
        </div>
      </div>
      {invalidDateRange && <div className="import-feedback feedback-warning" role="alert">A data inicial não pode ser posterior à data final.</div>}
      {error && !showForm && <div className="import-feedback feedback-warning" role="alert">{error}</div>}
      {filtered.length > 0
        ? <div className="table-wrap bonification-table-wrap"><table><thead><tr><th>DATA</th><th>CONTROLE</th><th>CLIENTE / LOJA</th><th>MOTIVO</th><th>ITENS</th><th>PESO</th><th>VALOR REF.</th><th>AÇÕES</th></tr></thead><tbody>{filtered.map((bonus) => <tr key={bonus.id}><td>{new Date(`${bonus.issueDate}T12:00:00`).toLocaleDateString("pt-BR")}</td><td><strong>{bonus.bonusNumber}</strong></td><td><strong>{bonus.customerName}</strong><small>{bonus.customerCode} · {bonus.customerCity || "Cidade não informada"}</small></td><td>{bonus.reason}</td><td>{bonus.items.length}</td><td>{kg(bonus.totalWeight)}</td><td>{money(bonus.totalValue)}</td><td><div className="order-row-actions"><button aria-label={`Visualizar ${bonus.bonusNumber}`} title="Visualizar" onClick={() => setViewing(bonus)}><Eye size={16} /></button><button aria-label={`Editar ${bonus.bonusNumber}`} title="Editar" onClick={() => openEdit(bonus)}><Pencil size={15} /></button><button aria-label={`Excluir ${bonus.bonusNumber}`} title="Excluir" onClick={() => setDeleting(bonus)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>
        : <div className="page-empty"><span className="page-empty-icon"><Gift size={23} /></span><strong>{bonifications.length ? "Nenhuma bonificação encontrada" : "Nenhuma bonificação cadastrada"}</strong><p>{bonifications.length ? "Ajuste ou limpe os filtros para ver outros registros." : "Registre amostras e cortesias para acompanhar os produtos bonificados."}</p>{bonifications.length ? <button className="button button-outline" onClick={clearFilters}><X size={14} /> Limpar filtros</button> : <button className="button button-primary" onClick={openCreate}><Plus size={16} /> Registrar bonificação</button>}</div>}
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
