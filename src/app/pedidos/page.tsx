"use client";

import { ImportIssues } from "@/components/import-issues";
import { OesaImportModal } from "@/components/oesa-import-modal";
import { OesaScreenshotsModal } from "@/components/oesa-screenshots-modal";

import { findImportRecords } from "@/lib/import-existing-records";
import { RecordPagination } from "@/components/record-pagination";
import { getRecordDetail, useRecordPage } from "@/lib/use-record-page";
import { importFailureMessage } from "@/lib/import-validation";

import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, Database, Download, Eye, FileText, PackageCheck, Pencil, Plus, RefreshCw, Search, ShoppingCart, SlidersHorizontal, Trash2, Upload, UserRound, X } from "lucide-react";
import { useCrmStore, useCrmResources } from "@/lib/store";
import { getPackageValues } from "@/lib/product-packaging";
import { downloadXlsx } from "@/lib/xlsx";
import { buildNetworkBonificationImport, buildNetworkOrderImport, parseNetworkOrderPdf } from "@/lib/network-order-pdf";
import type { Bonification, Customer, Order, OrderItem, Product } from "@/lib/types";
import "./orders-filters.css";

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
const currentMonthRange = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const lastDay = String(new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()).padStart(2, "0");
  return { start: `${date.getFullYear()}-${month}-01`, end: `${date.getFullYear()}-${month}-${lastDay}` };
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
  const { orders: legacyOrders, products, customers, customerGroups, paymentTerms, addOrders, addBonifications, updateOrder, deleteOrder, deleteOrders, dataError } = useCrmStore();
  const defaultDateRange = currentMonthRange();
  const [searchDraft, setSearchDraft] = useState("");
  const [customerNameDraft, setCustomerNameDraft] = useState("");
  const [cityDraft, setCityDraft] = useState("");
  const [segmentDraft, setSegmentDraft] = useState("");
  const [networkDraft, setNetworkDraft] = useState("");
  const [startDraft, setStartDraft] = useState(defaultDateRange.start);
  const [endDraft, setEndDraft] = useState(defaultDateRange.end);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [filters, setFilters] = useState({ search: "", customerName: "", city: "", segment: "", network: "", start: defaultDateRange.start, end: defaultDateRange.end });
  const [showNetworkImportModal, setShowNetworkImportModal] = useState(false);
  const [showOesaImportModal, setShowOesaImportModal] = useState(false);
  const [showOesaPrints, setShowOesaPrints] = useState(false);
  const [networkPdf, setNetworkPdf] = useState<File | null>(null);
  const [networkProgress, setNetworkProgress] = useState(0);
  const [networkError, setNetworkError] = useState("");
  const [networkImporting, setNetworkImporting] = useState(false);
  const [networkProcessed, setNetworkProcessed] = useState(false);
  const [networkPreview, setNetworkPreview] = useState<Order[]>([]);
  const [networkBonificationsPreview, setNetworkBonificationsPreview] = useState<Omit<Bonification, "id">[]>([]);
  const [networkDetected, setNetworkDetected] = useState({ orders: 0, bonifications: 0 });
  const [networkWarnings, setNetworkWarnings] = useState<string[]>([]);
  const [showOrderModal, setShowOrderModal] = useState(false);
  useCrmResources(["products", "payment_terms"], showOrderModal || showNetworkImportModal || showOesaImportModal || showOesaPrints);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);
  useCrmResources(["payment_terms"], !!viewingOrder);
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectionRecords, setSelectionRecords] = useState<Record<string, Order>>({});
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [preOrder, setPreOrder] = useState("");
  const [issueDate, setIssueDate] = useState(localDate);
  const [invoice, setInvoice] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [exportError, setExportError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const filterOptions = useMemo(() => {
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));
    const uniqueValues = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt-BR"));
    return {
      cities: uniqueValues([...customers.map((customer) => customer.city), ...legacyOrders.map((order) => order.customerCity ?? customersById.get(order.customerId)?.city ?? "")]),
      segments: uniqueValues(customers.map((customer) => customer.segment ?? "")),
    };
  }, [customers, legacyOrders]);
  const page = useRecordPage("orders", { start: filters.start, end: filters.end, query: filters.search, customerName: filters.customerName, city: filters.city ? [filters.city] : [], network: filters.network, segment: filters.segment });
  const orders = page.rows.map(row => ({ ...row, items: [] })) as unknown as Array<Order & { itemCount?: number }>;
  const filtered = orders;
  const sorted = orders;
  function heading(key: string, label: string, value: (order: Order) => unknown) {
    void value;
    const field = ["issueDate"].includes(key) ? key : null;
    return <th key={key} aria-sort={field === page.sort ? page.direction === "asc" ? "ascending" : "descending" : undefined}>{field ? <button className="sort-heading" type="button" onClick={() => page.setSort(field)}>{label}{field === page.sort ? page.direction === "asc" ? " ↑" : " ↓" : " ↕"}</button> : label}</th>;
  }
  async function openOrderDetails(order: Order, edit: boolean) {
    try { const detail = await getRecordDetail<Order>("orders", order.id); if (edit) openEditOrder(detail); else setViewingOrder(detail); }
    catch (cause) { setExportError(cause instanceof Error ? cause.message : "Falha ao abrir pedido."); }
  }
  const invalidFilterDateRange = Boolean(startDraft && endDraft && startDraft > endDraft);
  const additionalFilterCount = [customerNameDraft, cityDraft, segmentDraft, networkDraft].filter(Boolean).length;
  const hasDraftFiltersToClear = Boolean(searchDraft || customerNameDraft || cityDraft || segmentDraft || networkDraft
    || startDraft !== defaultDateRange.start || endDraft !== defaultDateRange.end
    || filters.search || filters.customerName || filters.city || filters.segment || filters.network
    || filters.start !== defaultDateRange.start || filters.end !== defaultDateRange.end);
  const suggestedCustomers = useMemo(() => customerQuery.trim().length < 2 ? [] : customers.filter((customer) => `${customer.name} ${customer.code} ${customer.city}`.toLowerCase().includes(customerQuery.toLowerCase())).slice(0, 6), [customers, customerQuery]);
  const suggestedProducts = useMemo(() => productQuery.trim().length < 2 ? [] : products.filter((product) => `${product.codeBox} ${product.codeHalfBox} ${product.description}`.toLowerCase().includes(productQuery.toLowerCase())).slice(0, 6), [products, productQuery]);
  const totalValue = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const totalWeight = lines.reduce((sum, line) => sum + (line.grossWeight || line.totalWeight), 0);
  const totalNetWeight = lines.reduce((sum, line) => sum + line.netWeight, 0);
  const totalUnits = lines.reduce((sum, line) => sum + line.unitQuantity, 0);
  const viewingCustomer = viewingOrder ? customers.find((customer) => customer.id === viewingOrder.customerId) : undefined;
  const viewingPaymentTerm = viewingOrder ? paymentTerms.find((term) => term.code === viewingOrder.paymentTerm) : undefined;
  const viewingGrossWeight = viewingOrder?.items.reduce((sum, item) => sum + (item.grossWeight ?? item.totalWeight), 0) ?? 0;
  const viewingNetWeight = viewingOrder?.items.reduce((sum, item) => sum + (item.netWeight ?? 0), 0) ?? 0;
  const viewingUnitCount = viewingOrder?.items.reduce((sum, item) => sum + item.unitQuantity, 0) ?? 0;
  const viewingPackageCount = viewingOrder?.items.reduce((sum, item) => sum + (item.boxQuantity ?? item.packageQuantity), 0) ?? 0;
  const selectedOrders = selectedOrderIds.map(id => selectionRecords[id]).filter((order): order is Order => !!order);
  const allFilteredOrdersSelected = filtered.length > 0 && filtered.every((order) => selectedOrderIds.includes(order.id));

  function resetOrderForm() {
    setEditingOrder(null);
    setPreOrder(orderNumber());
    setIssueDate(localDate());
    setInvoice("");
    setPaymentTerm("");
    setCustomerQuery("");
    setSelectedCustomer(null);
    setProductQuery("");
    setLines([]);
    setFormError("");
  }

  function startNetworkImport() {
    setNetworkPdf(null);
    setNetworkProgress(0);
    setNetworkError("");
    setNetworkProcessed(false);
    setNetworkPreview([]);
    setNetworkBonificationsPreview([]);
    setNetworkDetected({ orders: 0, bonifications: 0 });
    setNetworkWarnings([]);
    setShowNetworkImportModal(true);
  }

  async function readNetworkPdf() {
    if (networkImporting) return;
    if (!networkPdf) {
      setNetworkError("Selecione o PDF dos pedidos da rede.");
      return;
    }
    setNetworkError("");
    setNetworkImporting(true);
    setNetworkProgress(0);
    setNetworkProcessed(false);
    try {
      setNetworkPreview([]);
      setNetworkBonificationsPreview([]);
      setNetworkDetected({ orders: 0, bonifications: 0 });
      setNetworkWarnings([]);
      const parsedOrders = await parseNetworkOrderPdf(new Uint8Array(await networkPdf.arrayBuffer()), setNetworkProgress);
      setNetworkDetected({ orders: parsedOrders.filter((entry) => entry.documentType === "order").length, bonifications: parsedOrders.filter((entry) => entry.documentType === "bonification").length });
      const numbers = parsedOrders.map(record => `${record.orderNumber}/L`);
      const [existingOrders, existingBonuses] = await Promise.all([findImportRecords("orders", numbers), findImportRecords("bonifications", numbers)]);
      const result = buildNetworkOrderImport(parsedOrders, customers, products, existingOrders as Order[]);
      const bonusResult = buildNetworkBonificationImport(parsedOrders, customers, products, existingBonuses as Bonification[]);
      setNetworkPreview(result.orders);
      setNetworkBonificationsPreview(bonusResult.bonifications);
      setNetworkWarnings([...new Set([...result.warnings, ...bonusResult.warnings])]);
      setNetworkProcessed(true);
      if (!result.orders.length && !bonusResult.bonifications.length) setNetworkError("Nenhum pedido ou bonificação pôde ser importado. Confira os CNPJs, os códigos de produto e os avisos abaixo.");
    } catch (cause) {
      setNetworkError(cause instanceof Error ? cause.message : "Não foi possível ler o PDF selecionado.");
    } finally {
      setNetworkImporting(false);
    }
  }

  async function saveNetworkOrders() {
    if (networkImporting || (!networkPreview.length && !networkBonificationsPreview.length)) return;
    setNetworkImporting(true);
    setNetworkError("");
    try {
      if (networkPreview.length) {
        await addOrders(networkPreview);
        setNetworkPreview([]);
      }
      if (networkBonificationsPreview.length) {
        await addBonifications(networkBonificationsPreview);
        setNetworkBonificationsPreview([]);
      }
      setShowNetworkImportModal(false);
      setNetworkPreview([]);
      setNetworkWarnings([]);
    } catch (cause) {
      setNetworkError(importFailureMessage(cause, "Não foi possível salvar os pedidos. Verifique a conexão e tente novamente."));
    } finally {
      setNetworkImporting(false);
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
    if (orders.some((order) => order.preOrder.toUpperCase() === normalizedNumber
      && (order.customerId === selectedCustomer.id || !order.customerId)
      && order.id !== editingOrder?.id)) {
      setFormError("Já existe um pedido com esse número para este cliente.");
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
      status: "normal",
      items,
      totalValue: items.reduce((sum, item) => sum + (item.subtotal ?? item.packagePrice * item.packageQuantity), 0),
      totalWeight: items.reduce((sum, item) => sum + (item.grossWeight ?? item.totalWeight), 0),
    };
    try {
      setSaving(true);
      if (editingOrder) await updateOrder(editingOrder.id, order);
      else await addOrders([order]);
      if (editingOrder) setSelectedOrderIds(current => current.filter(id => id !== editingOrder.id));
      setShowOrderModal(false);
    } catch (error) {
      console.error("Falha ao salvar pedido.", error);
      setFormError(importFailureMessage(error, "Não foi possível salvar o pedido. Verifique sua conexão e tente novamente."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteOrder() {
    if (!deletingOrder) return;
    try {
      await deleteOrder(deletingOrder.id);
      setSelectedOrderIds(current => current.filter(id => id !== deletingOrder.id));
      setDeletingOrder(null);
    } catch (error) {
      console.error("Falha ao excluir pedido.", error);
      setExportError("Não foi possível excluir o pedido. Tente novamente.");
      setDeletingOrder(null);
    }
  }

  async function confirmDeleteSelectedOrders() {
    const ids = selectedOrders.map((order) => order.id);
    if (!ids.length) {
      setConfirmBulkDelete(false);
      return;
    }
    setBulkDeleting(true);
    try {
      await deleteOrders(ids);
      setSelectedOrderIds((selected) => selected.filter((id) => !ids.includes(id)));
      setConfirmBulkDelete(false);
    } catch (error) {
      console.error("Falha ao excluir pedidos selecionados.", error);
      setExportError("Não foi possível excluir todos os pedidos selecionados. Verifique a conexão e tente novamente.");
    } finally {
      setBulkDeleting(false);
    }
  }

  function toggleFilteredOrderSelection(checked: boolean) {
    if (checked) setSelectionRecords(current => ({ ...current, ...Object.fromEntries(filtered.map(order => [order.id, order])) }));
    setSelectedOrderIds((selected) => {
      if (checked) return [...new Set([...selected, ...filtered.map((order) => order.id)])];
      const filteredIds = new Set(filtered.map((order) => order.id));
      return selected.filter((id) => !filteredIds.has(id));
    });
  }

  function toggleOrderSelection(id: string, checked: boolean) {
    if (checked) { const order = orders.find(row => row.id === id); if (order) setSelectionRecords(current => ({ ...current, [id]: order })); }
    setSelectedOrderIds((selected) => checked
      ? [...new Set([...selected, id])]
      : selected.filter((selectedId) => selectedId !== id));
  }

  async function downloadSingleOrder(order: Order) {
    try { setExportError(""); await exportOrders([await getRecordDetail<Order>("orders", order.id)]); }
    catch (error) { console.error("Falha ao exportar pedido.", error); setExportError("Não foi possível exportar o pedido."); }
  }

  async function refreshOrders() {
    setRefreshing(true);
    setExportError("");
    try { await page.refresh(); }
    catch (error) { console.error("Falha ao atualizar pedidos.", error); setExportError("Não foi possível atualizar os dados."); }
    finally { setRefreshing(false); }
  }

  return <div className="page-content module-content order-page">
    <section className="panel module-panel order-module-panel">
      <div className="orders-page-heading">
        <div className="orders-page-title"><span className="module-title-icon"><ShoppingCart size={21} /></span><h1>Pedidos</h1></div>
        <div className="orders-page-actions">
          <div className="orders-sync-control">
            <div className="orders-firebase-badge"><span className="orders-database-icon"><Database size={15} /></span><span><strong>Firebase</strong><small>Consulta por página</small></span></div>
            <button className="orders-refresh-button" onClick={() => void refreshOrders()} disabled={refreshing} title={refreshing ? "Atualizando pedidos" : "Atualizar pedidos"} aria-label={refreshing ? "Atualizando pedidos" : "Atualizar pedidos"}><RefreshCw size={14} className={refreshing ? "spin" : ""} /></button>
          </div>
          <button className="button button-outline orders-import-button" onClick={startNetworkImport}><FileText size={15} /> Importar PDF Mart Minas</button>
          <button className="button button-outline orders-import-button" onClick={() => setShowOesaImportModal(true)}><FileText size={15} /> Importar PDF OESA</button>
          <button className="button button-outline orders-import-button" onClick={() => setShowOesaPrints(true)}><Upload size={15} /> Importar por print</button>
          <button className="button button-primary orders-new-button" onClick={openCreateOrder}><Plus size={16} /> Novo pedido</button>
        </div>
      </div>
      <form className="order-filter-card orders-compact-filters" onSubmit={(event) => { event.preventDefault(); if (!invalidFilterDateRange) setFilters({ search: searchDraft, customerName: customerNameDraft, city: cityDraft, segment: segmentDraft, network: networkDraft, start: startDraft, end: endDraft }); }}>
        <div className="orders-quick-filters">
          <div className="search-field"><Search size={17} /><input aria-label="Buscar pedidos por número, nota fiscal, código ou CNPJ" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Buscar pedido, NF, código ou CNPJ" /></div>
          <div className="orders-compact-period" role="group" aria-label="Período de emissão"><input aria-label="Data inicial" type="date" max={endDraft || undefined} value={startDraft} onChange={(event) => setStartDraft(event.target.value)} /><span aria-hidden="true">até</span><input aria-label="Data final" type="date" min={startDraft || undefined} value={endDraft} onChange={(event) => setEndDraft(event.target.value)} /></div>
          <button type="button" className={`button button-outline orders-filter-toggle ${showMoreFilters ? "orders-filter-toggle-active" : ""}`} aria-expanded={showMoreFilters} aria-controls="orders-extra-filters" onClick={() => setShowMoreFilters((show) => !show)}><SlidersHorizontal size={15} /> Filtros{additionalFilterCount > 0 && <span>{additionalFilterCount}</span>}</button>
          <button type="submit" className="button button-primary" disabled={invalidFilterDateRange}>Aplicar</button>
          <button type="button" className="icon-button orders-clear-filters" title="Limpar filtros" aria-label="Limpar filtros e restaurar o mês atual" disabled={!hasDraftFiltersToClear} onClick={() => { setSearchDraft(""); setCustomerNameDraft(""); setCityDraft(""); setSegmentDraft(""); setNetworkDraft(""); setStartDraft(defaultDateRange.start); setEndDraft(defaultDateRange.end); setFilters({ search: "", customerName: "", city: "", segment: "", network: "", start: defaultDateRange.start, end: defaultDateRange.end }); }}><X size={17} /></button>
        </div>
        {showMoreFilters && <div className="orders-extra-filters" id="orders-extra-filters">
          <label><span>Nome do cliente</span><div className="search-field"><Search size={15} /><input value={customerNameDraft} onChange={(event) => setCustomerNameDraft(event.target.value)} placeholder="Buscar por nome" /></div></label>
          <label><span>Cidade</span><select value={cityDraft} onChange={(event) => setCityDraft(event.target.value)}><option value="">Todas as cidades</option>{filterOptions.cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
          <label><span>Rede</span><select value={networkDraft} onChange={(event) => setNetworkDraft(event.target.value)}><option value="">Todas as redes</option>{customerGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <label><span>Segmento</span><select value={segmentDraft} onChange={(event) => setSegmentDraft(event.target.value)}><option value="">Todos os segmentos</option>{filterOptions.segments.map((segment) => <option key={segment} value={segment}>{segment}</option>)}</select></label>
        </div>}
      </form>
      {invalidFilterDateRange && <div className="import-feedback feedback-warning" role="alert">A data inicial não pode ser posterior à data final.</div>}
      {(page.error || dataError) && <div className="import-feedback feedback-warning" role="alert">{page.error || dataError}</div>}
      {page.loading && <p role="status">Carregando pedidos...</p>}
      {exportError && <div className="import-feedback feedback-warning" role="alert">{exportError}</div>}
    </section>

    <section className="panel order-list-panel">
      <div className="order-count-bar"><span>{filtered.length} pedido(s) nesta página{page.totals ? ` · ${page.totals.count} no período` : ""}</span>{selectedOrders.length > 0 && <div className="order-bulk-actions"><span>{selectedOrders.length} selecionado(s)</span><button type="button" className="button button-danger" onClick={() => setConfirmBulkDelete(true)}><Trash2 size={14} /> Excluir selecionados</button></div>}</div>
      {filtered.length ? <div className="table-wrap order-table-wrap"><table><thead><tr><th className="order-select-heading"><input type="checkbox" aria-label="Selecionar todos os pedidos desta página" checked={allFilteredOrdersSelected} onChange={(event) => toggleFilteredOrderSelection(event.target.checked)} /></th>{heading("issueDate", "Data", (r) => r.issueDate)}{heading("customerName", "Cliente", (r) => r.customerName)}{heading("customerCity", "Cidade", (r) => r.customerCity ?? customers.find((c) => c.id === r.customerId)?.city)}{heading("totalValue", "Total", (r) => r.totalValue)}{heading("totalWeight", "Peso", (r) => r.totalWeight)}{heading("items", "Itens", (r) => r.items.length)}<th className="order-actions-heading">AÇÕES</th></tr></thead><tbody>{sorted.map((order) => {
        const customer = customers.find((entry) => entry.id === order.customerId);
        return <tr key={order.id}>
          <td className="order-select-cell"><input type="checkbox" aria-label={`Selecionar pedido ${order.preOrder}`} checked={selectedOrderIds.includes(order.id)} onChange={(event) => toggleOrderSelection(order.id, event.target.checked)} /></td>
          <td className="order-date-cell">{order.issueDate}</td>
          <td><strong className="order-customer-name">{order.customerName}</strong><small className="order-customer-code">Cód. {order.customerCode || "—"}</small></td>
          <td>{order.customerCity || customer?.city || "—"}</td><td className="order-value">{money(order.totalValue)}</td><td>{kg(order.totalWeight)}</td><td>{order.itemCount ?? "—"}</td>
          <td><div className="order-row-actions"><button aria-label={`Baixar pedido ${order.preOrder}`} title="Baixar pedido" onClick={() => { void downloadSingleOrder(order); }}><Download size={15} /></button><button aria-label={`Ver pedido ${order.preOrder}`} title="Ver pedido" onClick={() => void openOrderDetails(order, false)}><Eye size={16} /></button><button aria-label={`Editar pedido ${order.preOrder}`} title="Editar pedido" onClick={() => void openOrderDetails(order, true)}><Pencil size={15} /></button><button aria-label={`Excluir pedido ${order.preOrder}`} title="Excluir pedido" onClick={() => setDeletingOrder(order)}><Trash2 size={15} /></button></div></td>
        </tr>;
      })}</tbody></table></div> : <div className="page-empty"><span className="page-empty-icon"><ShoppingCart size={23} /></span><strong>{page.loading ? "Carregando pedidos..." : page.error ? "Falha ao carregar pedidos" : page.hasNext ? "Continue na próxima página" : "Nenhum pedido encontrado"}</strong><p>Ajuste o período e os filtros ou cadastre um novo pedido.</p><button className="button button-primary" type="button" onClick={openCreateOrder}><Plus size={16} /> Novo pedido</button></div>}
      <RecordPagination page={page} />
    </section>

    {showOesaImportModal && <OesaImportModal onClose={() => setShowOesaImportModal(false)} />}
    {showOesaPrints && <OesaScreenshotsModal onClose={() => setShowOesaPrints(false)} />}
    {showNetworkImportModal && <div className="modal-backdrop order-image-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !networkImporting) setShowNetworkImportModal(false); }}>
      <section className="modal-card order-image-import-modal network-order-import-modal" role="dialog" aria-modal="true" aria-labelledby="network-order-import-title">
        <div className="order-editor-heading">
          <div className="order-editor-icon"><FileText size={21} /></div>
          <div><p className="eyebrow">IMPORTAÇÃO DE REDE</p><h2 id="network-order-import-title">Pedidos e bonificações do PDF</h2><p>O título de cada página define o tipo; o CNPJ de faturamento identifica a loja.</p></div>
          <button type="button" className="icon-button" aria-label="Fechar" disabled={networkImporting} onClick={() => setShowNetworkImportModal(false)}><X size={20} /></button>
        </div>
        <div className="order-image-import-body">
          <section className="order-import-step">
            <div className="order-import-step-heading"><span>1</span><div><strong>Selecione o PDF da rede</strong><small>O arquivo é lido localmente neste navegador.</small></div></div>
            <label className={`order-image-dropzone ${networkImporting ? "order-image-dropzone-disabled" : ""}`}>
              <input type="file" accept=".pdf,application/pdf" disabled={networkImporting} onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                setNetworkProcessed(false);
                setNetworkPreview([]);
                setNetworkBonificationsPreview([]);
                setNetworkDetected({ orders: 0, bonifications: 0 });
                setNetworkWarnings([]);
                setNetworkProgress(0);
                if (file && file.size > 50 * 1024 * 1024) {
                  setNetworkError("O PDF excede o limite de 50 MB.");
                  setNetworkPdf(null);
                } else {
                  setNetworkError("");
                  setNetworkPdf(file);
                }
                event.currentTarget.value = "";
              }} />
              <span className="order-image-drop-icon"><Upload size={21} /></span><span><strong>{networkPdf ? networkPdf.name : "Escolher PDF"}</strong><small>PDF · até 50 MB</small></span>
              <span className="button button-outline">Selecionar arquivo</span>
            </label>
            <div className="order-image-guide"><strong>Campos utilizados:</strong><span>CNPJ identifica o cliente/filial; Cod Forn corresponde ao código do produto; a quantidade importada é Qtde menos Qtd.Canc.</span><span>Custo Bruto dividido pela Qtde define o preço por embalagem. O peso usa o cadastro dos produtos e o peso total do PDF, quando disponível.</span></div>
          </section>
          {networkImporting && <div className="order-image-progress" role="status"><div><span>Lendo páginas do PDF...</span><strong>{Math.round(networkProgress * 100)}%</strong></div><progress max="100" value={Math.round(networkProgress * 100)} /></div>}
          <ImportIssues error={networkError} warnings={networkWarnings} fileName={networkPdf?.name} />
          {networkProcessed && <section className="network-import-results" aria-live="polite">
            <div className="network-import-summary"><strong>Prontos para salvar: {networkPreview.length} compra(s) · {networkBonificationsPreview.length} bonificação(ões)</strong><span>Identificados no PDF: {networkDetected.orders} compra(s) · {networkDetected.bonifications} bonificação(ões). {networkWarnings.length} aviso(s).</span></div>
            {networkPreview.length > 0 && <h3 className="network-import-type-heading">Pedidos de compra</h3>}
            {networkPreview.length > 0 && <div className="table-wrap network-import-table-wrap"><table><thead><tr><th>PEDIDO</th><th>CLIENTE / CNPJ</th><th>ITENS</th><th>VALOR</th><th>PESO</th></tr></thead><tbody>{networkPreview.map((order) => <tr key={order.id}><td>{order.preOrder}</td><td><strong>{order.customerName}</strong><small>{order.customerCode} · {order.customerId ? customers.find((customer) => customer.id === order.customerId)?.document : ""}</small></td><td>{order.items.length}</td><td>{money(order.totalValue)}</td><td>{kg(order.totalWeight)}</td></tr>)}</tbody></table></div>}

            {networkBonificationsPreview.length > 0 && <><h3 className="network-import-type-heading">Bonificações · registradas em Bonificações</h3><div className="table-wrap network-import-table-wrap"><table><thead><tr><th>CONTROLE</th><th>CLIENTE / CNPJ</th><th>ITENS</th><th>VALOR BRUTO</th><th>PESO</th></tr></thead><tbody>{networkBonificationsPreview.map((bonus) => <tr key={`${bonus.customerId}:${bonus.bonusNumber}`}><td>{bonus.bonusNumber}</td><td><strong>{bonus.customerName || customers.find((customer) => customer.id === bonus.customerId)?.document}</strong><small>{customers.find((customer) => customer.id === bonus.customerId)?.document}</small></td><td>{bonus.items.length}</td><td>{money(bonus.totalValue)}</td><td>{kg(bonus.totalWeight)}</td></tr>)}</tbody></table></div></>}
          </section>}
          <p className="order-image-privacy">Nenhum dado do PDF é enviado para um serviço externo. Confira os pedidos e avisos antes de confirmar a importação.</p>
        </div>
        <div className="order-editor-footer">
          <button type="button" className="button button-light" disabled={networkImporting} onClick={() => setShowNetworkImportModal(false)}>Cancelar</button>
          {networkProcessed && <button type="button" className="button button-outline" disabled={networkImporting || !networkPdf} onClick={() => void readNetworkPdf()}>Ler PDF novamente</button>}
          {networkProcessed
            ? <button type="button" className="button button-primary" disabled={networkImporting || (!networkPreview.length && !networkBonificationsPreview.length)} onClick={() => void saveNetworkOrders()}>{networkImporting ? "Salvando..." : `Importar registros (${networkPreview.length + networkBonificationsPreview.length})`}</button>
            : <button type="button" className="button button-primary" disabled={networkImporting || !networkPdf} onClick={() => void readNetworkPdf()}>{networkImporting ? "Lendo PDF..." : "Ler e conferir pedidos"}</button>}
        </div>
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
        </div>
        <div className="order-editor-footer"><button type="button" className="button button-light" onClick={() => setShowOrderModal(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Salvando..." : editingOrder ? "Salvar alterações" : "Salvar pedido"}</button></div>
      </form>
    </section></div>}

    {viewingOrder && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingOrder(null); }}>
      <section className="modal-card order-view-modal" role="dialog" aria-modal="true" aria-labelledby="order-view-title">
        <div className="order-editor-heading">
          <div className="order-editor-icon"><ClipboardList size={21} /></div>
          <div><p className="eyebrow">DETALHES DO PEDIDO</p><h2 id="order-view-title">{viewingOrder.preOrder}</h2><p>{viewingOrder.customerName} · {new Date(`${viewingOrder.issueDate}T12:00:00`).toLocaleDateString("pt-BR")}</p></div>
          <button className="icon-button" aria-label="Fechar" onClick={() => setViewingOrder(null)}><X size={20} /></button>
        </div>
        <div className="order-view-body">
          <section className="order-view-section">
            <div className="order-view-section-heading"><ClipboardList size={16} /><h3>Resumo do pedido</h3></div>
            <div className="order-view-summary">
              <div><span>Número do pedido</span><strong>{viewingOrder.preOrder}</strong></div>
              <div><span>Data</span><strong>{new Date(`${viewingOrder.issueDate}T12:00:00`).toLocaleDateString("pt-BR")}</strong></div>
              <div><span>Status</span><strong>Pedido</strong></div>
              <div><span>Nota fiscal</span><strong>{viewingOrder.invoice || "Não informada"}</strong></div>
              <div><span>Condição de pagamento</span><strong>{viewingPaymentTerm ? `${viewingPaymentTerm.code} — ${viewingPaymentTerm.term}` : viewingOrder.paymentTerm || "Não informada"}</strong></div>
            </div>
          </section>
          <section className="order-view-section">
            <div className="order-view-section-heading"><UserRound size={16} /><h3>Dados do cliente / loja</h3></div>
            <div className="order-view-summary order-view-customer">
              <div><span>Razão/nome</span><strong>{viewingOrder.customerName}</strong></div>
              <div><span>Código do cliente</span><strong>{viewingOrder.customerCode || viewingCustomer?.code || "—"}</strong></div>
              <div><span>CNPJ / CPF</span><strong>{viewingCustomer?.document || "Não informado"}</strong></div>
              <div><span>Loja</span><strong>{viewingOrder.store || viewingCustomer?.store || "—"}</strong></div>
              <div><span>Cidade / UF</span><strong>{[viewingOrder.customerCity || viewingCustomer?.city, viewingCustomer?.state].filter(Boolean).join(" / ") || "Não informada"}</strong></div>
              <div className="order-view-customer-wide"><span>Endereço</span><strong>{[viewingCustomer?.address, viewingCustomer?.neighborhood].filter(Boolean).join(" — ") || "Não informado"}</strong></div>
              <div><span>Telefone</span><strong>{viewingCustomer?.phone || "Não informado"}</strong></div>
              <div><span>E-mail</span><strong>{viewingCustomer?.email || "Não informado"}</strong></div>
            </div>
          </section>
          <section className="order-view-section">
            <div className="order-view-section-heading"><PackageCheck size={16} /><h3>Itens do pedido <span>{viewingOrder.items.length}</span></h3></div>
            {viewingOrder.items.length > 0
              ? <div className="order-items-table-wrap"><table className="order-items-table order-view-items-table"><thead><tr><th>PRODUTO</th><th>CÓDIGO</th><th>EMBALAGEM</th><th>QUANTIDADE</th><th>CAIXAS</th><th>PEÇAS</th><th>PREÇO / UN.</th><th>SUBTOTAL</th><th>P. LÍQ.</th><th>P. BRUTO</th></tr></thead><tbody>{viewingOrder.items.map((item, index) => <tr key={`${item.productId}-${index}`}><td><strong>{item.description}</strong></td><td>{item.productCode}</td><td>{item.packageKind}</td><td>{item.unitQuantity}</td><td>{item.boxQuantity ?? item.packageQuantity}</td><td>{item.pieces ?? item.unitQuantity}</td><td>{money(item.unitPrice ?? item.packagePrice / Math.max(1, item.unitQuantity / Math.max(1, item.packageQuantity)))}</td><td>{money(item.subtotal ?? item.packagePrice * item.packageQuantity)}</td><td>{kg(item.netWeight ?? 0)}</td><td>{kg(item.grossWeight ?? item.totalWeight)}</td></tr>)}</tbody></table></div>
              : <div className="order-view-no-items">Este pedido não possui itens cadastrados.</div>}
          </section>
          <div className="order-view-metrics">
            <div><span>Produtos</span><strong>{viewingOrder.items.length}</strong></div>
            <div><span>Caixas</span><strong>{viewingPackageCount}</strong></div>
            <div><span>Peças</span><strong>{viewingUnitCount}</strong></div>
            <div><span>Peso líquido</span><strong>{kg(viewingNetWeight)}</strong></div>
            <div><span>Peso bruto</span><strong>{kg(viewingGrossWeight)}</strong></div>
            <div className="order-view-grand-total"><span>Valor total do pedido</span><strong>{money(viewingOrder.totalValue)}</strong></div>
          </div>
        </div>
        <div className="order-editor-footer"><button className="button button-light" onClick={() => setViewingOrder(null)}>Fechar</button><button className="button button-primary" onClick={() => { setViewingOrder(null); openEditOrder(viewingOrder); }}><Pencil size={15} /> Editar pedido</button></div>
      </section>
    </div>}
    {deletingOrder && <div className="modal-backdrop" role="presentation"><section className="modal-card order-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-order-title"><div className="order-editor-icon order-delete-icon"><Trash2 size={21} /></div><h2 id="delete-order-title">Excluir pedido?</h2><p>O pedido <strong>{deletingOrder.preOrder}</strong> de <strong>{deletingOrder.customerName}</strong> será removido permanentemente.</p><div className="order-editor-footer"><button className="button button-light" onClick={() => setDeletingOrder(null)}>Cancelar</button><button className="button button-danger" onClick={() => void confirmDeleteOrder()}>Excluir pedido</button></div></section></div>}
    {confirmBulkDelete && <div className="modal-backdrop" role="presentation"><section className="modal-card order-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-selected-orders-title"><div className="order-editor-icon order-delete-icon"><Trash2 size={21} /></div><h2 id="delete-selected-orders-title">Excluir pedidos selecionados?</h2><p><strong>{selectedOrders.length} pedido(s)</strong> serão removidos permanentemente do Firebase.</p><div className="order-editor-footer"><button className="button button-light" disabled={bulkDeleting} onClick={() => setConfirmBulkDelete(false)}>Cancelar</button><button className="button button-danger" disabled={bulkDeleting || !selectedOrders.length} onClick={() => void confirmDeleteSelectedOrders()}>{bulkDeleting ? "Excluindo..." : "Excluir pedidos"}</button></div></section></div>}
  </div>;
}
