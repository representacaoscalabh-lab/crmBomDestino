"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, ClipboardList, Database, Download, Eye, FileImage, PackageCheck, Pencil, Plus, RefreshCw, Search, ShoppingCart, Trash2, Upload, UserRound, X } from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { getPackageValues } from "@/lib/product-packaging";
import { downloadXlsx } from "@/lib/xlsx";
import { extractOrderLinesFromImages, type OrderScreenshotLine } from "@/lib/order-image-import";
import type { Customer, Order, OrderItem, Product } from "@/lib/types";

type DraftLine = {
  productId: string;
  productCode: string;
  description: string;
  packageKind: "Caixa" | "Meia caixa";
  packageQuantity: number;
  unitQuantity: number;
  packagePrice: number;
  unitPrice: number;
  totalWeight: number;
  discountPercent: number;
  subtotal: number;
  boxQuantity: number;
  pieces: number;
  netWeight: number;
  grossWeight: number;
  boxUnits: number;
  halfUnits: number;
  boxPrice: number;
  halfPrice: number;
  boxWeight: number;
  halfWeight: number;
  originalItem?: OrderItem;
  canChangePackage: boolean;
};

async function exportOrders(orders: Order[]) {
  const heading = ["Pré-pedido", "Data", "Cliente", "Código cliente", "Loja", "NF", "Produto", "Código produto", "Tipo embalagem", "Caixas", "Peças", "Quantidade", "Preço unitário", "Desconto (%)", "Subtotal", "Peso líquido (kg)", "Peso bruto (kg)"];
  const values = orders.flatMap((order) => order.items.map((item) => [order.preOrder, order.issueDate, order.customerName, order.customerCode, order.store, order.invoice, item.description, item.productCode, item.packageKind, item.boxQuantity ?? item.packageQuantity, item.pieces ?? item.unitQuantity, item.unitQuantity, item.unitPrice ?? item.packagePrice, item.discountPercent ?? 0, item.subtotal ?? item.packagePrice * item.packageQuantity, item.netWeight ?? 0, item.grossWeight ?? item.totalWeight]));
  await downloadXlsx("pedidos-bom-destino.xlsx", "Pedidos", heading, values);
}

const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const money = (value: number) => `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kg = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`;
const orderNumber = () => `PED-${Date.now().toString().slice(-7)}`;

function makeDraftLine(product: Product, packageKind: "Caixa" | "Meia caixa" = "Caixa"): DraftLine {
  const box = getPackageValues(product, false);
  const half = getPackageValues(product, true);
  const selected = packageKind === "Caixa" ? box : half;
  const unitPrice = product.unitPrice ?? product.pricePerBox / Math.max(1, product.quantityPerBox);
  return {
    productId: product.id,
    productCode: packageKind === "Caixa" ? product.codeBox : product.codeHalfBox,
    description: product.description,
    packageKind,
    packageQuantity: 1,
    unitQuantity: selected.unitQuantity,
    packagePrice: unitPrice * selected.unitQuantity,
    unitPrice,
    totalWeight: selected.weight,
    discountPercent: 0,
    subtotal: unitPrice * selected.unitQuantity,
    boxQuantity: packageKind === "Caixa" ? 1 : 0,
    pieces: selected.unitQuantity,
    netWeight: 0,
    grossWeight: selected.weight,
    boxUnits: box.unitQuantity,
    halfUnits: half.unitQuantity,
    boxPrice: box.price,
    halfPrice: half.price,
    boxWeight: box.weight,
    halfWeight: half.weight,
    canChangePackage: Boolean(product.codeHalfBox.trim()),
  };
}

function makeExistingLine(item: OrderItem, products: Product[]): DraftLine {
  const product = products.find((entry) => entry.id === item.productId);
  if (product) return {
    ...makeDraftLine(product, item.packageKind),
    productCode: item.productCode,
    packageQuantity: item.packageQuantity,
    unitQuantity: item.unitQuantity,
    packagePrice: item.packagePrice,
    unitPrice: item.unitPrice ?? item.packagePrice / Math.max(1, item.unitQuantity / Math.max(1, item.packageQuantity)),
    totalWeight: item.totalWeight,
    discountPercent: item.discountPercent ?? 0,
    subtotal: item.subtotal ?? item.packagePrice * item.packageQuantity,
    boxQuantity: item.boxQuantity ?? item.packageQuantity,
    pieces: item.pieces ?? item.unitQuantity,
    netWeight: item.netWeight ?? 0,
    grossWeight: item.grossWeight ?? item.totalWeight,
  };
  return {
    ...item,
    boxUnits: item.unitQuantity / Math.max(1, item.packageQuantity),
    halfUnits: item.unitQuantity / Math.max(1, item.packageQuantity),
    boxPrice: item.packagePrice,
    halfPrice: item.packagePrice,
    unitPrice: item.unitPrice ?? item.packagePrice / Math.max(1, item.unitQuantity / Math.max(1, item.packageQuantity)),
    boxWeight: item.totalWeight / Math.max(1, item.packageQuantity),
    halfWeight: item.totalWeight / Math.max(1, item.packageQuantity),
    discountPercent: item.discountPercent ?? 0,
    subtotal: item.subtotal ?? item.packagePrice * item.packageQuantity,
    boxQuantity: item.boxQuantity ?? item.packageQuantity,
    pieces: item.pieces ?? item.unitQuantity,
    netWeight: item.netWeight ?? 0,
    grossWeight: item.grossWeight ?? item.totalWeight,
    originalItem: item,
    canChangePackage: false,
  };
}

export default function OrdersPage() {
  const { orders, products, customers, paymentTerms, addOrders, updateOrder, deleteOrder, refreshData } = useCrmStore();
  const [searchDraft, setSearchDraft] = useState("");
  const [customerNameDraft, setCustomerNameDraft] = useState("");
  const [segmentDraft, setSegmentDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [startDraft, setStartDraft] = useState("");
  const [endDraft, setEndDraft] = useState("");
  const [filters, setFilters] = useState({ search: "", customerName: "", segment: "", status: "", start: "", end: "" });
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCustomerQuery, setImportCustomerQuery] = useState("");
  const [importCustomer, setImportCustomer] = useState<Customer | null>(null);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [preOrder, setPreOrder] = useState("");
  const [issueDate, setIssueDate] = useState(localDate);
  const [invoice, setInvoice] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [orderStatus, setOrderStatus] = useState<Order["status"]>("normal");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [formError, setFormError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [exportError, setExportError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => orders.filter((order) => {
    const customer = customers.find((entry) => entry.id === order.customerId);
    return `${order.preOrder} ${order.customerCode} ${order.invoice}`.toLowerCase().includes(filters.search.toLowerCase())
      && order.customerName.toLowerCase().includes(filters.customerName.toLowerCase())
      && (!filters.segment || customer?.segment === filters.segment)
      && (!filters.status || order.status === filters.status)
      && (!filters.start || order.issueDate >= filters.start)
      && (!filters.end || order.issueDate <= filters.end);
  }), [orders, customers, filters]);
  const suggestedCustomers = useMemo(() => customerQuery.trim().length < 2 ? [] : customers.filter((customer) => `${customer.name} ${customer.code} ${customer.city}`.toLowerCase().includes(customerQuery.toLowerCase())).slice(0, 6), [customers, customerQuery]);
  const suggestedProducts = useMemo(() => productQuery.trim().length < 2 ? [] : products.filter((product) => `${product.codeBox} ${product.codeHalfBox} ${product.description}`.toLowerCase().includes(productQuery.toLowerCase())).slice(0, 6), [products, productQuery]);
  const suggestedImportCustomers = useMemo(() => importCustomerQuery.trim().length < 2 ? [] : customers.filter((customer) => `${customer.name} ${customer.code} ${customer.city} ${customer.store}`.toLowerCase().includes(importCustomerQuery.toLowerCase())).slice(0, 8), [customers, importCustomerQuery]);
  const totalValue = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const totalWeight = lines.reduce((sum, line) => sum + (line.grossWeight || line.totalWeight), 0);
  const totalNetWeight = lines.reduce((sum, line) => sum + line.netWeight, 0);
  const totalUnits = lines.reduce((sum, line) => sum + line.unitQuantity, 0);

  function resetOrderForm() {
    setEditingOrder(null);
    setPreOrder(orderNumber());
    setIssueDate(localDate());
    setInvoice("");
    setPaymentTerm("");
    setOrderStatus("normal");
    setCustomerQuery("");
    setSelectedCustomer(null);
    setProductQuery("");
    setLines([]);
    setFormError("");
    setImportNotice("");
  }

  function resetImportForm() {
    setImportCustomerQuery("");
    setImportCustomer(null);
    setImportFiles([]);
    setImportProgress(0);
    setImportError("");
  }

  function startImportOrder() {
    resetImportForm();
    setShowImportModal(true);
  }

  function screenshotLineToDraft(line: OrderScreenshotLine, catalog: Product[]): DraftLine {
    const normalizedCode = line.productCode.trim().toLowerCase();
    const numericCode = normalizedCode.replace(/^0+/, "") || "0";
    const matchesCode = (code: string) => {
      const normalized = code.trim().toLowerCase();
      return normalized === normalizedCode || (/^\d+$/.test(normalized) && (normalized.replace(/^0+/, "") || "0") === numericCode);
    };
    const exactMatches = catalog.flatMap((candidate) => [
      ...(matchesCode(candidate.codeBox) ? [{ product: candidate, packageKind: "Caixa" as const }] : []),
      ...(candidate.codeHalfBox && matchesCode(candidate.codeHalfBox) ? [{ product: candidate, packageKind: "Meia caixa" as const }] : []),
    ]);
    const uniqueMatch = exactMatches.length === 1 ? exactMatches[0] : undefined;
    const product = uniqueMatch?.product;
    const packageKind = uniqueMatch?.packageKind ?? "Caixa";
    const draft = product ? makeDraftLine(product, packageKind) : null;
    const packageQuantity = line.quantity || line.boxQuantity || 1;
    const unitPrice = line.unitPrice > 0 ? line.unitPrice : draft?.unitPrice ?? 0;
    const unitsPerPackage = draft?.unitQuantity ?? 0;
    const quantity = product
      ? packageQuantity * unitsPerPackage
      : line.pieces > 0 ? line.pieces : packageQuantity;
    const discountPercent = Math.min(100, Math.max(0, line.discountPercent));
    const computedSubtotal = Math.round(quantity * unitPrice * (1 - discountPercent / 100) * 100) / 100;
    const grossWeight = line.grossWeight || (draft?.grossWeight ?? 0) * packageQuantity;
    const netWeight = line.netWeight;
    return {
      productId: product?.id ?? "",
      productCode: product ? (packageKind === "Caixa" ? product.codeBox : product.codeHalfBox) : line.productCode,
      description: product?.description || line.description || "Produto sem descrição",
      packageKind,
      packageQuantity,
      unitQuantity: quantity,
      packagePrice: unitPrice * quantity / packageQuantity,
      unitPrice,
      totalWeight: grossWeight,
      discountPercent,
      subtotal: computedSubtotal,
      boxQuantity: packageQuantity,
      pieces: quantity,
      netWeight,
      grossWeight,
      boxUnits: product?.quantityPerBox ?? 0,
      halfUnits: product ? product.quantityPerBox / 2 : 0,
      boxPrice: draft?.boxPrice ?? unitPrice * quantity / packageQuantity,
      halfPrice: draft?.halfPrice ?? unitPrice * quantity / packageQuantity / 2,
      boxWeight: draft?.boxWeight ?? (grossWeight / packageQuantity),
      halfWeight: draft?.halfWeight ?? (grossWeight / packageQuantity / 2),
      canChangePackage: Boolean(product?.codeHalfBox.trim()),
    };
  }

  async function processOrderImages() {
    if (!importCustomer) {
      setImportError("Pesquise e selecione o cliente antes de continuar.");
      return;
    }
    if (!importFiles.length) {
      setImportError("Adicione as imagens da lista de produtos e das colunas do pedido.");
      return;
    }
    setImportError("");
    setImporting(true);
    setImportProgress(0);
    try {
      const productCodes = products.flatMap((product) => [product.codeBox, product.codeHalfBox]).filter(Boolean);
      const capturedLines = await extractOrderLinesFromImages(importFiles, setImportProgress, productCodes);
      const mappedLines = capturedLines.map((line) => ({ source: line, draft: screenshotLineToDraft(line, products) }));
      const draftLines = mappedLines.filter(({ draft }) => Boolean(draft.productId)).map(({ draft }) => draft);
      const missingCodes = [...new Set(mappedLines.filter(({ draft }) => !draft.productId).map(({ source }) => source.productCode || source.description).filter(Boolean))];
      if (!draftLines.length) {
        throw new Error(missingCodes.length
          ? `Nenhum dos ${capturedLines.length} produtos reconhecidos está cadastrado. Confira os códigos no cadastro de produtos antes de importar.`
          : "Nenhum item de produto foi reconhecido nas imagens.");
      }
      resetOrderForm();
      setSelectedCustomer(importCustomer);
      setCustomerQuery(`${importCustomer.name} — ${importCustomer.code}`);
      setPaymentTerm(importCustomer.paymentTerm ?? "");
      setLines(draftLines);
      setImportNotice(missingCodes.length
        ? `${missingCodes.length} produto(s) não encontrado(s) no cadastro e não foram incluídos: ${missingCodes.join(", ")}. Os demais itens foram importados.`
        : "");
      setShowImportModal(false);
      setShowOrderModal(true);
    } catch (cause) {
      console.error("Falha ao interpretar imagens do pedido.", cause);
      setImportError(cause instanceof Error ? cause.message : "Não foi possível ler as imagens. Tente usar capturas mais nítidas.");
    } finally {
      setImporting(false);
    }
  }

  function openCreateOrder() {
    resetOrderForm();
    setShowOrderModal(true);
  }

  function openEditOrder(order: Order) {
    setEditingOrder(order);
    setPreOrder(order.preOrder);
    setIssueDate(order.issueDate);
    setInvoice(order.invoice);
    setPaymentTerm(order.paymentTerm ?? "");
    setOrderStatus(order.status);
    const customer = customers.find((entry) => entry.id === order.customerId) ?? null;
    setSelectedCustomer(customer);
    setCustomerQuery(customer ? `${customer.name} — ${customer.code}` : order.customerName);
    setLines(order.items.map((item) => makeExistingLine(item, products)));
    setProductQuery("");
    setFormError("");
    setShowOrderModal(true);
  }

  function changeLine(index: number, changes: Partial<Pick<DraftLine, "packageKind" | "packageQuantity" | "unitQuantity" | "unitPrice" | "discountPercent" | "boxQuantity" | "pieces" | "netWeight" | "grossWeight">>) {
    setLines((current) => current.map((line, position) => {
      if (position !== index) return line;
      const packageKind = changes.packageKind ?? line.packageKind;
      const packageQuantity = changes.packageQuantity ?? line.packageQuantity;
      const isBox = packageKind === "Caixa";
      const unitPrice = changes.unitPrice ?? line.unitPrice;
      const product = products.find((entry) => entry.id === line.productId);
      const original = line.originalItem;
      const packageUnits = isBox ? line.boxUnits : line.halfUnits;
      const unitQuantity = changes.unitQuantity ?? (changes.packageKind !== undefined || changes.packageQuantity !== undefined
        ? packageUnits * packageQuantity
        : line.unitQuantity);
      const discountPercent = Math.min(100, Math.max(0, changes.discountPercent ?? line.discountPercent));
      const grossWeight = changes.grossWeight ?? (changes.packageKind !== undefined || changes.packageQuantity !== undefined
        ? (isBox ? line.boxWeight : line.halfWeight) * packageQuantity
        : line.grossWeight);
      const subtotal = Math.round(unitPrice * unitQuantity * (1 - discountPercent / 100) * 100) / 100;
      return {
        ...line,
        packageKind,
        packageQuantity,
        productCode: product ? (isBox ? product.codeBox : product.codeHalfBox) : line.productCode,
        unitQuantity,
        unitPrice,
        packagePrice: unitPrice * unitQuantity / Math.max(1, packageQuantity),
        discountPercent,
        subtotal,
        boxQuantity: changes.boxQuantity ?? (isBox ? packageQuantity : line.boxQuantity),
        pieces: changes.pieces ?? (changes.unitQuantity !== undefined || changes.packageKind !== undefined || changes.packageQuantity !== undefined ? unitQuantity : line.pieces),
        netWeight: changes.netWeight ?? line.netWeight,
        grossWeight,
        totalWeight: grossWeight || ((isBox ? line.boxWeight : line.halfWeight) * packageQuantity),
        ...(original && !line.canChangePackage ? { unitQuantity: original.unitQuantity, totalWeight: original.totalWeight, packageQuantity: original.packageQuantity, packageKind: original.packageKind } : {}),
      };
    }));
  }

  function mapLineToProduct(index: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setLines((current) => current.map((line, position) => {
      if (position !== index) return line;
      const productLine = makeDraftLine(product);
      const units = line.boxQuantity > 0
        ? line.boxQuantity * productLine.boxUnits
        : line.unitQuantity || line.pieces || productLine.boxUnits;
      const packageQuantity = line.boxQuantity || Math.max(1, Math.ceil(units / Math.max(1, productLine.boxUnits)));
      const unitPrice = line.unitPrice || productLine.unitPrice;
      const grossWeight = line.grossWeight || productLine.boxWeight * packageQuantity;
      return {
        ...line,
        productId: product.id,
        productCode: product.codeBox,
        description: product.description,
        boxUnits: productLine.boxUnits,
        halfUnits: productLine.halfUnits,
        boxPrice: productLine.boxPrice,
        halfPrice: productLine.halfPrice,
        boxWeight: productLine.boxWeight,
        halfWeight: productLine.halfWeight,
        packageKind: "Caixa",
        packageQuantity,
        boxQuantity: packageQuantity,
        unitQuantity: units,
        pieces: units,
        unitPrice,
        packagePrice: unitPrice * units / packageQuantity,
        subtotal: Math.round(unitPrice * units * (1 - line.discountPercent / 100) * 100) / 100,
        grossWeight,
        totalWeight: grossWeight,
        canChangePackage: Boolean(product.codeHalfBox.trim()),
      };
    }));
  }

  function addProduct(product: Product) {
    setLines((current) => [...current, makeDraftLine(product)]);
    setProductQuery("");
  }

  async function saveOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preOrder.trim() || !selectedCustomer || lines.length === 0) {
      setFormError("Informe o número do pedido, selecione um cliente e adicione pelo menos um produto.");
      return;
    }
    if (lines.some((line) => !Number.isFinite(line.packageQuantity) || line.packageQuantity <= 0 || !Number.isFinite(line.unitQuantity) || line.unitQuantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
      setFormError("Confira se as quantidades são maiores que zero e os preços são válidos.");
      return;
    }
    if (lines.some((line) => !line.productId)) {
      setFormError("Vincule cada item reconhecido a um produto cadastrado antes de salvar.");
      return;
    }
    const normalizedNumber = preOrder.trim().toUpperCase();
    if (orders.some((order) => order.preOrder.toUpperCase() === normalizedNumber && order.id !== editingOrder?.id)) {
      setFormError("Já existe um pedido com esse número.");
      return;
    }
    const items = lines.map((line) => line.originalItem && !line.canChangePackage
      ? { ...line.originalItem, packagePrice: line.packagePrice, unitPrice: line.unitPrice }
      : {
        productId: line.productId,
        productCode: line.packageKind === "Caixa"
          ? products.find((product) => product.id === line.productId)?.codeBox ?? line.productCode
          : products.find((product) => product.id === line.productId)?.codeHalfBox ?? line.productCode,
        description: line.description,
        packageKind: line.packageKind,
        packageQuantity: line.packageQuantity,
        unitQuantity: line.unitQuantity,
        packagePrice: line.packagePrice,
        unitPrice: line.unitPrice,
        totalWeight: line.grossWeight || line.totalWeight,
        discountPercent: line.discountPercent,
        subtotal: line.subtotal,
        boxQuantity: line.boxQuantity,
        pieces: line.pieces,
        netWeight: line.netWeight,
        grossWeight: line.grossWeight || line.totalWeight,
      });
    const order: Order = {
      id: editingOrder?.id ?? normalizedNumber,
      preOrder: normalizedNumber,
      issueDate,
      invoice: invoice.trim(),
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      customerCode: selectedCustomer.code,
      store: selectedCustomer.store,
      customerCity: selectedCustomer.city,
      paymentTerm: paymentTerm.trim(),
      status: orderStatus,
      items,
      totalValue: items.reduce((sum, item) => sum + (item.subtotal ?? item.packagePrice * item.packageQuantity), 0),
      totalWeight: items.reduce((sum, item) => sum + (item.grossWeight ?? item.totalWeight), 0),
    };
    try {
      setSaving(true);
      if (editingOrder) await updateOrder(editingOrder.id, order);
      else await addOrders([order]);
      setShowOrderModal(false);
    } catch (error) {
      console.error("Falha ao salvar pedido.", error);
      setFormError("Não foi possível salvar o pedido. Verifique sua conexão e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteOrder() {
    if (!deletingOrder) return;
    try {
      await deleteOrder(deletingOrder.id);
      setDeletingOrder(null);
    } catch (error) {
      console.error("Falha ao excluir pedido.", error);
      setExportError("Não foi possível excluir o pedido. Tente novamente.");
      setDeletingOrder(null);
    }
  }

  async function downloadSingleOrder(order: Order) {
    try { setExportError(""); await exportOrders([order]); }
    catch (error) { console.error("Falha ao exportar pedido.", error); setExportError("Não foi possível exportar o pedido."); }
  }

  async function refreshOrders() {
    setRefreshing(true);
    setExportError("");
    try { await refreshData(); }
    catch (error) { console.error("Falha ao atualizar pedidos.", error); setExportError("Não foi possível atualizar os dados."); }
    finally { setRefreshing(false); }
  }

  async function exportFiltered() {
    try {
      setExportError("");
      await exportOrders(filtered);
    } catch (error) {
      console.error("Falha ao exportar pedidos.", error);
      setExportError("Não foi possível exportar os pedidos.");
    }
  }

  return <div className="page-content module-content order-page">
    <section className="panel module-panel order-module-panel">
      <div className="orders-page-heading">
        <div className="orders-page-title"><span className="module-title-icon"><ShoppingCart size={21} /></span><h1>Pedidos</h1></div>
        <div className="orders-page-actions">
          <div className="orders-firebase-badge"><span className="orders-database-icon"><Database size={17} /></span><span><strong>Dados do Firebase</strong><small>Atualiza em tempo real</small></span></div>
          <button className="button button-outline orders-refresh-button" onClick={() => void refreshOrders()} disabled={refreshing}><RefreshCw size={14} className={refreshing ? "spin" : ""} /> {refreshing ? "Atualizando" : "Atualizar"}</button>
          <button className="button button-outline orders-import-button" onClick={startImportOrder}><FileImage size={15} /> Importar pedido</button>
          <button className="button button-outline orders-utility-button" onClick={() => { void exportFiltered(); }} title="Exportar pedidos filtrados" aria-label="Exportar pedidos filtrados"><Download size={16} /></button>
          <button className="button button-primary orders-new-button" onClick={openCreateOrder}><Plus size={16} /> Novo pedido</button>
        </div>
      </div>
      <div className="order-filter-card">
        <div className="order-filter-grid">
          <label className="filter-field"><span>Código do cliente</span><div className="search-field"><Search size={15} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Código cliente..." /></div></label>
          <label className="filter-field"><span>Nome do cliente</span><div className="search-field"><Search size={15} /><input value={customerNameDraft} onChange={(event) => setCustomerNameDraft(event.target.value)} placeholder="Nome cliente..." /></div></label>
          <label className="filter-field"><span>Segmento</span><select value={segmentDraft} onChange={(event) => setSegmentDraft(event.target.value)}><option value="">Todos os Segmentos</option>{Array.from(new Set(customers.map((customer) => customer.segment).filter((segment): segment is string => Boolean(segment)))).sort().map((segment) => <option key={segment} value={segment}>{segment}</option>)}</select></label>
          <label className="filter-field"><span>Status do pedido</span><select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}><option value="">Todos os Status</option><option value="normal">Faturado</option><option value="wallet">Em carteira</option></select></label>
          <label className="filter-field"><span>Data De</span><div className="date-input-wrap"><input type="date" value={startDraft} onChange={(event) => setStartDraft(event.target.value)} /></div></label>
          <label className="filter-field"><span>Data Até</span><div className="date-input-wrap"><input type="date" value={endDraft} onChange={(event) => setEndDraft(event.target.value)} /></div></label>
        </div>
        <div className="order-filter-actions"><button className="button button-primary" onClick={() => setFilters({ search: searchDraft, customerName: customerNameDraft, segment: segmentDraft, status: statusDraft, start: startDraft, end: endDraft })}>Aplicar</button><button className="button button-light" onClick={() => { setSearchDraft(""); setCustomerNameDraft(""); setSegmentDraft(""); setStatusDraft(""); setStartDraft(""); setEndDraft(""); setFilters({ search: "", customerName: "", segment: "", status: "", start: "", end: "" }); }}><X size={14} /> Limpar</button></div>
      </div>
      {exportError && <div className="import-feedback feedback-warning" role="alert">{exportError}</div>}
    </section>

    <section className="panel order-list-panel">
      <div className="order-count-bar"><span>Mostrando {filtered.length} de {orders.length} pedido(s)</span></div>
      {filtered.length ? <div className="table-wrap order-table-wrap"><table><thead><tr><th>DATA</th><th>CLIENTE</th><th>CIDADE</th><th>TOTAL</th><th>PESO</th><th>ITENS</th><th className="order-actions-heading">AÇÕES</th></tr></thead><tbody>{filtered.map((order) => {
        const customer = customers.find((entry) => entry.id === order.customerId);
        return <tr key={order.id}>
          <td className="order-date-cell">{order.issueDate}</td>
          <td><strong className="order-customer-name">{order.customerName}</strong><small className="order-customer-code">Cód. {order.customerCode || "—"}</small></td>
          <td>{order.customerCity || customer?.city || "—"}</td><td className="order-value">{money(order.totalValue)}</td><td>{kg(order.totalWeight)}</td><td>{order.items.length}</td>
          <td><div className="order-row-actions"><button aria-label={`Baixar pedido ${order.preOrder}`} title="Baixar pedido" onClick={() => { void downloadSingleOrder(order); }}><Download size={15} /></button><button aria-label={`Ver pedido ${order.preOrder}`} title="Ver pedido" onClick={() => setViewingOrder(order)}><Eye size={16} /></button><button aria-label={`Editar pedido ${order.preOrder}`} title="Editar pedido" onClick={() => openEditOrder(order)}><Pencil size={15} /></button><button aria-label={`Excluir pedido ${order.preOrder}`} title="Excluir pedido" onClick={() => setDeletingOrder(order)}><Trash2 size={15} /></button></div></td>
        </tr>;
      })}</tbody></table></div> : <div className="page-empty"><span className="page-empty-icon"><ShoppingCart size={23} /></span><strong>Nenhum pedido encontrado</strong><p>{orders.length ? "Ajuste os filtros aplicados ou cadastre um novo pedido." : products.length ? "Cadastre ou importe pedidos para acompanhar as vendas por aqui." : "Cadastre produtos primeiro para lançar pedidos."}</p>{orders.length === 0 && (products.length ? <button className="button button-primary" onClick={openCreateOrder}><Plus size={16} /> Criar primeiro pedido</button> : <a href="/produtos" className="button button-outline"><PackageCheck size={16} /> Cadastrar produtos</a>)}</div>}
    </section>

    {showImportModal && <div className="modal-backdrop order-image-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !importing) setShowImportModal(false); }}>
      <section className="modal-card order-image-import-modal" role="dialog" aria-modal="true" aria-labelledby="order-image-import-title">
        <div className="order-editor-heading">
          <div className="order-editor-icon"><FileImage size={21} /></div>
          <div><p className="eyebrow">IMPORTAÇÃO INTELIGENTE</p><h2 id="order-image-import-title">Importar pedido por imagens</h2><p>Selecione o cliente e envie as capturas das telas do pedido.</p></div>
          <button type="button" className="icon-button" aria-label="Fechar" disabled={importing} onClick={() => setShowImportModal(false)}><X size={20} /></button>
        </div>
        <div className="order-image-import-body">
          <section className="order-import-step">
            <div className="order-import-step-heading"><span>1</span><div><strong>Selecione o cliente</strong><small>Digite o código ou nome e confirme a loja correta.</small></div></div>
            {importCustomer ? <div className="order-selected-customer">
              <div className="selected-customer-avatar"><UserRound size={18} /></div><div className="selected-customer-info"><strong>{importCustomer.name}</strong><span>Código {importCustomer.code} · Loja {importCustomer.store || "—"} · {importCustomer.city || "Cidade não informada"}</span></div>
              <button type="button" className="button button-light" disabled={importing} onClick={() => { setImportCustomer(null); setImportCustomerQuery(""); }}><X size={14} /> Trocar</button>
            </div> : <div className="order-autocomplete">
              <div className="search-field"><Search size={17} /><input autoComplete="off" value={importCustomerQuery} onChange={(event) => setImportCustomerQuery(event.target.value)} placeholder="Buscar por nome, código ou cidade..." /></div>
              {importCustomerQuery.trim().length >= 2 && suggestedImportCustomers.length === 0 && <p className="order-no-suggestions">Nenhum cliente encontrado.</p>}
              {suggestedImportCustomers.length > 0 && <div className="order-suggestions">{suggestedImportCustomers.map((customer) => <button type="button" key={customer.id} onClick={() => { setImportCustomer(customer); setImportCustomerQuery(`${customer.name} — ${customer.code}`); setImportError(""); }}><span><strong>{customer.name}</strong><small>Cód. {customer.code} · {customer.city || "Cidade não informada"} · Loja {customer.store || "—"}</small></span><Check size={17} /></button>)}</div>}
            </div>}
          </section>
          <section className="order-import-step">
            <div className="order-import-step-heading"><span>2</span><div><strong>Adicione as capturas das telas</strong><small>As imagens podem ser selecionadas em qualquer ordem. O OCR é processado neste dispositivo.</small></div></div>
            <label className={`order-image-dropzone ${importing ? "order-image-dropzone-disabled" : ""}`}>
              <input type="file" accept="image/*" multiple disabled={importing} onChange={(event) => {
                const selectedFiles = Array.from(event.currentTarget.files ?? []);
                const unsupported = selectedFiles.find((file) => !file.type.startsWith("image/"));
                const tooLarge = selectedFiles.find((file) => file.size > 12 * 1024 * 1024);
                if (unsupported) setImportError(`"${unsupported.name}" não é uma imagem suportada.`);
                else if (tooLarge) setImportError(`"${tooLarge.name}" excede o limite de 12 MB.`);
                else {
                  setImportError("");
                  setImportFiles((current) => [...current, ...selectedFiles.filter((file) => !current.some((existing) => existing.name === file.name && existing.size === file.size))]);
                }
                event.currentTarget.value = "";
              }} />
              <span className="order-image-drop-icon"><Upload size={21} /></span><span><strong>Escolher imagens</strong><small>JPG, PNG ou WEBP · até 12 MB por imagem</small></span>
              <span className="button button-outline">Selecionar arquivos</span>
            </label>
                <div className="order-image-guide"><strong>Leitura das capturas:</strong><span>O código localiza o produto cadastrado; produtos sem correspondência precisam ser vinculados antes de salvar.</span><span>Quant. representa caixas; Preço representa o valor por unidade. A quantidade de unidades é calculada pelo cadastro do produto.</span><span>Envie também a tela com peso líquido e bruto para preencher esses valores.</span></div>
            {importFiles.length > 0 && <div className="order-image-file-list" aria-label="Imagens selecionadas">{importFiles.map((file, index) => <div className="order-image-file" key={`${file.name}-${index}`}><FileImage size={16} /><span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB</small></span><button type="button" aria-label={`Remover ${file.name}`} disabled={importing} onClick={() => setImportFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><X size={15} /></button></div>)}</div>}
          </section>
          {importing && <div className="order-image-progress" role="status"><div><span>Identificando produtos, quantidades, preços e pesos...</span><strong>{Math.round(importProgress * 100)}%</strong></div><progress max="100" value={Math.round(importProgress * 100)} /></div>}
          {importError && <div className="import-feedback feedback-warning" role="alert">{importError}</div>}
          <p className="order-image-privacy">A leitura acontece localmente no navegador. Nenhuma imagem é enviada para um serviço externo; revise todas as informações antes de salvar o pedido.</p>
        </div>
        <div className="order-editor-footer"><button type="button" className="button button-light" disabled={importing} onClick={() => setShowImportModal(false)}>Cancelar</button><button type="button" className="button button-primary" disabled={importing || !importCustomer || !importFiles.length} onClick={() => void processOrderImages()}>{importing ? "Lendo imagens..." : "Ler imagens e revisar pedido"}</button></div>
      </section>
    </div>}

    {showOrderModal && <div className="modal-backdrop order-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowOrderModal(false); }}><section className="modal-card order-editor-modal" role="dialog" aria-modal="true" aria-labelledby="order-editor-title">
      <div className="order-editor-heading">
        <div className="order-editor-icon"><ShoppingCart size={20} /></div>
        <div><h2 id="order-editor-title">{editingOrder ? "Editar pedido" : "Novo pedido"}</h2><p>Preencha os dados e revise os totais antes de salvar.</p></div>
        <button type="button" className="icon-button" aria-label="Fechar" onClick={() => setShowOrderModal(false)}><X size={20} /></button>
      </div>
      <form className="order-editor-form" onSubmit={(event) => void saveOrder(event)}>
        <div className="order-editor-body">
          <section className="order-form-section order-data-section">
            <div className="order-section-title"><span>01</span><div><h3>Dados do pedido</h3><p>Informações de emissão e faturamento</p></div></div>
            <div className="order-form-grid order-data-grid">
              <label className="form-field"><span>Número do pedido <i>*</i></span><span className="order-modal-input-icon"><ClipboardList size={15} /><input required autoFocus={!editingOrder} value={preOrder} onChange={(event) => setPreOrder(event.target.value)} placeholder="Ex.: PED-001" /></span></label>
              <label className="form-field"><span>Data de emissão <i>*</i></span><span className="order-modal-input-icon"><CalendarDays size={15} /><input required type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></span></label>
              <label className="form-field"><span>Prazo do cliente</span><select value={paymentTerm} disabled={!selectedCustomer} onChange={(event) => setPaymentTerm(event.target.value)}><option value="">{selectedCustomer ? "Sem prazo definido" : "Selecione o cliente"}</option>{paymentTerm && !paymentTerms.some((term) => term.code === paymentTerm) && <option value={paymentTerm}>{paymentTerm}</option>}{paymentTerms.slice().sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true })).map((term) => <option key={term.id} value={term.code}>{term.code} — {term.term}</option>)}</select></label>
              <label className="form-field order-data-compact-field"><span>Nota fiscal</span><input value={invoice} onChange={(event) => setInvoice(event.target.value)} placeholder="Opcional" /></label>
              <label className="form-field order-data-compact-field"><span>Status do pedido</span><select value={orderStatus} onChange={(event) => setOrderStatus(event.target.value as Order["status"])}><option value="normal">Faturado</option><option value="wallet">Em carteira</option></select></label>
            </div>
          </section>

          <section className="order-form-section">
            <div className="order-section-title"><span>02</span><div><h3>Cliente <i>*</i></h3><p>Busque por código ou nome.</p></div></div>
            {selectedCustomer ? <div className="order-selected-customer">
              <div className="order-selected-customer-head"><div className="selected-customer-avatar"><UserRound size={19} /></div><div className="selected-customer-info"><strong>{selectedCustomer.name}</strong><span>Código: {selectedCustomer.code} · {selectedCustomer.city || "Cidade não informada"}</span></div><button type="button" className="icon-button" aria-label="Trocar cliente" onClick={() => { setSelectedCustomer(null); setPaymentTerm(""); setCustomerQuery(""); }}><X size={17} /></button></div>
              <div className="order-customer-details"><div><span>Endereço</span><strong>{[selectedCustomer.address, selectedCustomer.neighborhood].filter(Boolean).join(", ") || "—"}</strong></div><div><span>Cidade</span><strong>{[selectedCustomer.city, selectedCustomer.state].filter(Boolean).join(" / ") || "—"}</strong></div><div><span>CNPJ</span><strong>{selectedCustomer.document || "—"}</strong></div></div>
            </div> : <div className="order-autocomplete">
              <div className="search-field"><Search size={17} /><input autoComplete="off" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Digite o código ou nome do cliente..." /></div>
              {customerQuery.trim().length >= 2 && suggestedCustomers.length === 0 && <p className="order-no-suggestions">Nenhum cliente encontrado para esta busca.</p>}
              {suggestedCustomers.length > 0 && <div className="order-suggestions">{suggestedCustomers.map((customer) => <button type="button" key={customer.id} onClick={() => { setSelectedCustomer(customer); setPaymentTerm(customer.paymentTerm ?? ""); setCustomerQuery(`${customer.name} — ${customer.code}`); }}><span><strong>{customer.name}</strong><small>Cód. {customer.code} · {customer.city || "Cidade não informada"} · Loja {customer.store || "—"}</small></span><Plus size={17} /></button>)}</div>}
            </div>}
          </section>

          <section className="order-form-section order-products-section">
            <div className="order-products-toolbar">
              <div className="order-section-title"><span>03</span><div><h3>Itens do pedido</h3><p>Adicione itens e ajuste quantidade, embalagem e preço unitário.</p></div></div>
              <div className="order-product-search"><label>Adicionar produto</label>
              <div className="search-field"><Search size={17} /><input autoComplete="off" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Código ou descrição do produto..." /></div>
              {productQuery.trim().length >= 2 && suggestedProducts.length === 0 && <p className="order-no-suggestions">Nenhum produto encontrado para esta busca.</p>}
              {suggestedProducts.length > 0 && <div className="order-suggestions">{suggestedProducts.map((product) => <button type="button" key={product.id} onClick={() => addProduct(product)}><span><strong>{product.description}</strong><small>Cód. caixa {product.codeBox} · meia caixa {product.codeHalfBox}</small></span><span className="order-add-product-label"><Plus size={14} /> Adicionar</span></button>)}</div>}
              </div>
            </div>
            {lines.length ? <div className="order-items-table-wrap"><table className="order-items-table"><thead><tr><th>CÓDIGO</th><th>PRODUTO</th><th>TIPO</th><th>QUANT.</th><th>CAIXAS</th><th>PEÇAS</th><th>PREÇO / UN.</th><th>DESC. %</th><th>SUBTOTAL</th><th>P. LÍQ.</th><th>P. BRUTO</th><th>AÇÕES</th></tr></thead><tbody>{lines.map((line, index) => <tr key={`${line.productId || line.productCode}-${index}`}>
              <td>{line.productCode || "—"}</td><td className="order-product-cell"><select aria-label={`Produto da linha ${index + 1}`} className={!line.productId ? "order-product-unmatched" : ""} value={line.productId} onChange={(event) => mapLineToProduct(index, event.target.value)}><option value="">Vincular produto...</option>{products.map((product) => <option key={product.id} value={product.id}>{product.codeBox} — {product.description}</option>)}</select><small>{line.description}</small></td>
              <td><select aria-label={`Tipo de embalagem de ${line.description}`} value={line.packageKind} disabled={!line.canChangePackage} onChange={(event) => changeLine(index, { packageKind: event.target.value as "Caixa" | "Meia caixa" })}><option value="Caixa">Caixa</option><option value="Meia caixa">Meia caixa</option></select></td>
              <td><input aria-label={`Quantidade de ${line.description}`} type="number" min="0.001" step="0.001" value={line.unitQuantity} onChange={(event) => changeLine(index, { unitQuantity: Number(event.target.value) })} /></td>
              <td><input aria-label={`Caixas de ${line.description}`} type="number" min="0" step="1" value={line.boxQuantity} onChange={(event) => changeLine(index, { boxQuantity: Number(event.target.value), packageQuantity: Math.max(1, Number(event.target.value)) })} /></td>
              <td><input aria-label={`Peças de ${line.description}`} type="number" min="0" step="0.001" value={line.pieces} onChange={(event) => changeLine(index, { pieces: Number(event.target.value) })} /></td>
              <td><label className="order-price-input"><span className="order-price-currency" aria-hidden="true">R$</span><input aria-label={`Preço unitário de ${line.description}`} type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => changeLine(index, { unitPrice: Number(event.target.value) })} /></label></td>
              <td><input aria-label={`Desconto de ${line.description}`} type="number" min="0" max="100" step="0.01" value={line.discountPercent} onChange={(event) => changeLine(index, { discountPercent: Number(event.target.value) })} /></td>
              <td className="order-line-subtotal">{money(line.subtotal)}</td>
              <td><input aria-label={`Peso líquido de ${line.description}`} type="number" min="0" step="0.001" value={line.netWeight} onChange={(event) => changeLine(index, { netWeight: Number(event.target.value) })} /></td>
              <td><input aria-label={`Peso bruto de ${line.description}`} type="number" min="0" step="0.001" value={line.grossWeight} onChange={(event) => changeLine(index, { grossWeight: Number(event.target.value) })} /></td>
              <td><button type="button" className="order-line-remove" aria-label={`Remover ${line.description}`} onClick={() => setLines((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={15} /></button></td>
            </tr>)}</tbody></table></div> : <div className="order-items-empty"><PackageCheck size={22} /><div><strong>Nenhum produto adicionado</strong><span>Use a busca acima para incluir produtos neste pedido.</span></div></div>}
            <div className="order-totals">
              <div><span>Produtos</span><strong>{lines.length}</strong></div>
              <div><span>Peças</span><strong>{totalUnits}</strong></div>
              <div><span>Peso líquido</span><strong>{kg(totalNetWeight)}</strong></div>
              <div><span>Peso bruto</span><strong>{kg(totalWeight)}</strong></div>
              <div className="order-total-card"><span>Valor total do pedido</span><strong className="order-total-value">{money(totalValue)}</strong></div>
            </div>
          </section>

          {formError && <div className="import-feedback feedback-warning" role="alert">{formError}</div>}
          {importNotice && <div className="import-feedback feedback-warning" role="status">{importNotice}</div>}
        </div>
        <div className="order-editor-footer"><button type="button" className="button button-light" onClick={() => setShowOrderModal(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Salvando..." : editingOrder ? "Salvar alterações" : "Salvar pedido"}</button></div>
      </form>
    </section></div>}

    {viewingOrder && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingOrder(null); }}><section className="modal-card order-view-modal" role="dialog" aria-modal="true" aria-labelledby="order-view-title"><div className="order-editor-heading"><div className="order-editor-icon"><ClipboardList size={21} /></div><div><p className="eyebrow">DETALHES DO PEDIDO</p><h2 id="order-view-title">{viewingOrder.preOrder}</h2><p>{viewingOrder.customerName} · {new Date(`${viewingOrder.issueDate}T12:00:00`).toLocaleDateString("pt-BR")}</p></div><button className="icon-button" aria-label="Fechar" onClick={() => setViewingOrder(null)}><X size={20} /></button></div><div className="order-view-body"><div className="order-view-summary"><div><span>Cliente</span><strong>{viewingOrder.customerName}</strong></div><div><span>Cidade</span><strong>{viewingOrder.customerCity || customers.find((customer) => customer.id === viewingOrder.customerId)?.city || "—"}</strong></div><div><span>Condição</span><strong>{paymentTerms.find((term) => term.code === viewingOrder.paymentTerm) ? `${viewingOrder.paymentTerm} — ${paymentTerms.find((term) => term.code === viewingOrder.paymentTerm)?.term}` : viewingOrder.paymentTerm || "—"}</strong></div><div><span>Nota fiscal</span><strong>{viewingOrder.invoice || "—"}</strong></div></div><div className="order-items-table-wrap"><table className="order-items-table"><thead><tr><th>PRODUTO</th><th>CÓDIGO</th><th>EMBALAGEM</th><th>QUANT.</th><th>CAIXAS</th><th>PEÇAS</th><th>SUBTOTAL</th><th>P. LÍQ.</th><th>P. BRUTO</th></tr></thead><tbody>{viewingOrder.items.map((item, index) => <tr key={`${item.productId}-${index}`}><td><strong>{item.description}</strong></td><td>{item.productCode}</td><td>{item.packageKind}</td><td>{item.unitQuantity}</td><td>{item.boxQuantity ?? item.packageQuantity}</td><td>{item.pieces ?? item.unitQuantity}</td><td>{money(item.subtotal ?? item.packagePrice * item.packageQuantity)}</td><td>{kg(item.netWeight ?? 0)}</td><td>{kg(item.grossWeight ?? item.totalWeight)}</td></tr>)}</tbody></table></div><div className="order-view-totals"><span>{viewingOrder.items.length} produto(s) · {kg(viewingOrder.totalWeight)} peso bruto</span><strong>{money(viewingOrder.totalValue)}</strong></div></div><div className="order-editor-footer"><button className="button button-light" onClick={() => setViewingOrder(null)}>Fechar</button><button className="button button-primary" onClick={() => { setViewingOrder(null); openEditOrder(viewingOrder); }}><Pencil size={15} /> Editar pedido</button></div></section></div>}
    {deletingOrder && <div className="modal-backdrop" role="presentation"><section className="modal-card order-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-order-title"><div className="order-editor-icon order-delete-icon"><Trash2 size={21} /></div><h2 id="delete-order-title">Excluir pedido?</h2><p>O pedido <strong>{deletingOrder.preOrder}</strong> de <strong>{deletingOrder.customerName}</strong> será removido permanentemente.</p><div className="order-editor-footer"><button className="button button-light" onClick={() => setDeletingOrder(null)}>Cancelar</button><button className="button button-danger" onClick={() => void confirmDeleteOrder()}>Excluir pedido</button></div></section></div>}
  </div>;
}
