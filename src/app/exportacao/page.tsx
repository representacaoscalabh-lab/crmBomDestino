"use client";

import { ImportIssues } from "@/components/import-issues";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Download, FileSpreadsheet, FileText, Gift, Network, Package, ShoppingCart, Upload, UsersRound } from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { isExportPeriodWithinLimit, loadPeriodExportRecords } from "@/lib/export-records";
import { findImportRecords } from "@/lib/import-existing-records";
import { downloadXlsx } from "@/lib/xlsx";
import { buildNetworkBonificationImport, buildNetworkOrderImport, parseNetworkOrderPdf, type NetworkOrderPdf } from "@/lib/network-order-pdf";
import { useMartMinasSettings } from "@/lib/mart-minas-settings";
import { useOesaNovaSafraSettings } from "@/lib/oesa-nova-safra-settings";
import { useOrderRemittances } from "@/lib/order-remittances";
import { buildNetworkCommission } from "@/lib/network-commission";
import { saoPauloToday } from "@/lib/mart-minas-analytics";
import type { Bonification, CustomerGroup, Order } from "@/lib/types";
import { importFailureMessage } from "@/lib/import-validation";

export default function ExportPage() {
  const { customers, customerGroups, products, addOrders, addBonifications } = useCrmStore();
  const martSettings = useMartMinasSettings();
  const oesaSettings = useOesaNovaSafraSettings();
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => () => exportController.current?.abort(), []);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportCount, setExportCount] = useState(0);
  const [category, setCategory] = useState("Comissões");
  const [activeTab, setActiveTab] = useState<"import" | "export">("export");
  const today = saoPauloToday();
  const [commissionMonth, setCommissionMonth] = useState(today.slice(0, 7));
  const [orderStart, setOrderStart] = useState(`${today.slice(0, 7)}-01`);
  const [orderEnd, setOrderEnd] = useState(today);
  const [networkId, setNetworkId] = useState("");
  const [remittanceId, setRemittanceId] = useState("");
  const [exportError, setExportError] = useState("");
  const [importMode, setImportMode] = useState<"general" | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [ordersPreview, setOrdersPreview] = useState<Order[]>([]);
  const [bonificationsPreview, setBonificationsPreview] = useState<Omit<Bonification, "id">[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [detected, setDetected] = useState({ orders: 0, bonifications: 0 });
  const selectedNetworkId = networkId || martSettings.groupId || customerGroups[0]?.id || "";
  const remittanceGroupId = networkId || martSettings.groupId || oesaSettings.groupId;
  const remittanceData = useOrderRemittances(remittanceGroupId, activeTab === "export" && category === "Pedidos", false);
  const selectedGroup = customerGroups.find(group => group.id === selectedNetworkId);
  const selectedRemittance = remittanceData.remittances.find(item => item.id === remittanceId);
  const remittanceNetworks = [martSettings.groupId, oesaSettings.groupId].filter((id, index, list): id is string => !!id && list.indexOf(id) === index);

  function resetImportPreview() {
    setOrdersPreview([]);
    setBonificationsPreview([]);
    setImportWarnings([]);
    setImportError("");
    setImportSuccess("");
    setDetected({ orders: 0, bonifications: 0 });
  }

  async function readIntelligentImport() {
    if (isImporting) return;
    if (!importFile) {
      setImportError("Selecione o PDF de pedidos para iniciar a leitura.");
      return;
    }
    setIsImporting(true);
    setImportError("");
    setImportSuccess("");
    setImportProgress(0);
    try {
      setOrdersPreview([]);
      setBonificationsPreview([]);
      setImportWarnings([]);
      const parsed: NetworkOrderPdf[] = await parseNetworkOrderPdf(new Uint8Array(await importFile.arrayBuffer()), setImportProgress);
      setDetected({ orders: parsed.filter((entry) => entry.documentType === "order").length, bonifications: parsed.filter((entry) => entry.documentType === "bonification").length });
      const numbers = parsed.map(record => `${record.orderNumber}/L`);
      const [existingOrders, existingBonuses] = await Promise.all([findImportRecords("orders", numbers), findImportRecords("bonifications", numbers)]);
      const orderResult = buildNetworkOrderImport(parsed, customers, products, existingOrders as Order[]);
      const bonificationResult = buildNetworkBonificationImport(parsed, customers, products, existingBonuses as Bonification[]);
      setOrdersPreview(orderResult.orders);
      setBonificationsPreview(bonificationResult.bonifications);
      setImportWarnings([...new Set([...orderResult.warnings, ...bonificationResult.warnings])]);
      if (!orderResult.orders.length && !bonificationResult.bonifications.length) {
        setImportError("Nenhum pedido ou bonificação novo pôde ser preparado. Confira o CNPJ, os códigos de produto e os avisos abaixo.");
      }
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : "Não foi possível ler esse PDF.");
    } finally {
      setIsImporting(false);
    }
  }

  async function confirmIntelligentImport() {
    if (isImporting || (!ordersPreview.length && !bonificationsPreview.length)) return;
    const savedOrders = ordersPreview.length > 0;
    const savedBonifications = bonificationsPreview.length > 0;
    setIsImporting(true);
    setImportError("");
    setImportSuccess("");
    try {
      if (savedOrders) {
        await addOrders(ordersPreview);
        setOrdersPreview([]);
      }
      if (savedBonifications) {
        await addBonifications(bonificationsPreview);
        setBonificationsPreview([]);
      }
      setImportSuccess(`${savedOrders ? `${ordersPreview.length} pedido(s)` : ""}${savedOrders && savedBonifications ? " e " : ""}${savedBonifications ? `${bonificationsPreview.length} bonificação(ões)` : ""} importado(s) com sucesso.`);
    } catch (cause) {
      console.error("Falha ao salvar registros da importação inteligente.", cause);
      setImportError(importFailureMessage(cause, "Não foi possível salvar todos os registros. Confira os registros salvos e leia o PDF novamente para atualizar a prévia antes de tentar novamente."));
    } finally {
      setIsImporting(false);
    }
  }
  const endOfMonth = (month: string) => {
    const [year, value] = month.split("-").map(Number);
    const end = new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
    return end < today ? end : today;
  };
  async function loadMonthOrders(signal?: AbortSignal) {
    const start = `${commissionMonth}-01`, end = endOfMonth(commissionMonth);
    if (!isExportPeriodWithinLimit(start, end)) throw new Error("O mês selecionado excede o limite de 31 dias.");
    return loadPeriodExportRecords<Order>("orders", start, end, signal, setExportCount);
  }
  function commissionRowsForGroup(group: CustomerGroup, orders: Order[]) {
    const members = customers.filter(customer => customer.groupId === group.id);
    const totals = new Map<string, { revenue: number; orders: number }>();
    for (const order of orders) {
      if (order.status !== "normal") continue;
      const current = totals.get(order.customerId) ?? { revenue: 0, orders: 0 };
      current.revenue += order.totalValue;
      current.orders += order.recordCount ?? 1;
      totals.set(order.customerId, current);
    }
    if (typeof group.commissionPercent === "number") {
      return buildNetworkCommission(members.map(customer => ({
        customer,
        seller: group.externalStoreSellers?.[customer.id]?.trim() || "",
        current: totals.get(customer.id) ?? { revenue: 0, orders: 0 },
      })), group.commissionPercent, group.sellerCommissionPercent, group.sellerCommissionBase ?? "orders")
        .map(row => [group.name, row.name, row.code, row.store, row.seller, row.orders, row.base, row.percent, row.commission, row.sellerPercent ?? "Não configurado", row.sellerCommission ?? "Não configurada", row.commission + (row.sellerCommission ?? 0)]);
    }
    return members.map(customer => [group.name, customer.name, customer.code, customer.store, group.externalStoreSellers?.[customer.id]?.trim() || "Representação WRRJ", totals.get(customer.id)?.orders ?? 0, totals.get(customer.id)?.revenue ?? 0, "Não configurada", "Não configurada", "Não configurada", "Não configurada", "Não configurada"]);
  }
  const commissionHeadings = ["Rede", "Loja", "Código", "Nº loja", "Responsável", "Pedidos", "Base (R$)", "Comissão WRRJ (%)", "Comissão WRRJ (R$)", "Comissão vendedor (%)", "Comissão vendedor (R$)", "Comissão total (R$)"];
  async function exportGeneralCommissions(signal?: AbortSignal) {
    const orders = await loadMonthOrders(signal);
    const rows = customerGroups.flatMap(group => commissionRowsForGroup(group, orders));
    if (!rows.length) throw new Error("Não há lojas cadastradas em redes para exportar.");
    await downloadXlsx(`comissoes-gerais-${commissionMonth}.xlsx`, "Comissões gerais", commissionHeadings, rows);
  }
  async function exportMartMinasCommissions(signal?: AbortSignal) {
    const group = customerGroups.find(item => item.id === martSettings.groupId);
    if (!group) throw new Error(martSettings.loading ? "A configuração de Mart Minas ainda está carregando." : "Configure a rede Mart Minas antes de exportar as comissões.");
    if (typeof group.commissionPercent !== "number") throw new Error("Configure o percentual de comissão da representação para Mart Minas.");
    const orders = await loadMonthOrders(signal);
    await downloadXlsx(`comissoes-mart-minas-${commissionMonth}.xlsx`, "Comissões Mart Minas", commissionHeadings, commissionRowsForGroup(group, orders));
  }
  async function exportStoresByNetwork() {
    if (!selectedGroup) throw new Error("Selecione uma rede para exportar as lojas.");
    const stores = customers.filter(customer => customer.groupId === selectedGroup.id);
    if (!stores.length) throw new Error("Não há lojas cadastradas nesta rede.");
    const filename = selectedGroup.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    await downloadXlsx(`lojas-${filename}.xlsx`, "Lojas", ["Código", "Cliente", "CNPJ", "Loja", "Cidade", "UF", "Segmento", "Status", "Rede"], stores.map(item => [item.code, item.name, item.document ?? "", item.store, item.city, item.state ?? "", item.segment ?? "", item.status, selectedGroup.name]));
  }
  async function exportCustomers() {
    await downloadXlsx("clientes-bom-destino.xlsx", "Clientes", ["Código", "Cliente", "CNPJ", "Loja", "Cidade", "UF", "Segmento", "Status", "Rede"], customers.map(item => [item.code, item.name, item.document ?? "", item.store, item.city, item.state ?? "", item.segment ?? "", item.status, customerGroups.find(group => group.id === item.groupId)?.name ?? "Sem rede"]));
  }
  async function exportOrders(signal?: AbortSignal) {
    if (!isExportPeriodWithinLimit(orderStart, orderEnd)) throw new Error("Selecione um período válido de no máximo 31 dias para evitar leituras excessivas.");
    if (!remittanceId) throw new Error("Selecione a remessa que deseja exportar.");
    const records = await loadPeriodExportRecords<Order>("orders", orderStart, orderEnd, signal, setExportCount);
    const orders = records.filter(order => order.remittanceId === remittanceId);
    if (!orders.length) throw new Error("Não há pedidos nessa remessa dentro do período selecionado.");
    const remittance = selectedRemittance;
    const name = (remittance?.name ?? "remessa").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    await downloadXlsx(`pedidos-${name}-${orderStart}-${orderEnd}.xlsx`, "Pedidos", ["Remessa", "Pré-pedido", "Data", "Cliente", "Código cliente", "Loja", "NF", "Peso (kg)", "Valor (R$)", "Situação"], orders.map(item => [remittance?.name ?? "", item.preOrder, item.issueDate, item.customerName, item.customerCode, item.store, item.invoice, item.totalWeight, item.totalValue, item.status]));
  }
  async function exportCurrentBonifications(signal?: AbortSignal) {
    const start = `${today.slice(0, 7)}-01`;
    const records = await loadPeriodExportRecords<Bonification>("bonifications", start, today, signal, setExportCount);
    if (!records.length) throw new Error("Não há bonificações no mês atual.");
    await downloadXlsx(`bonificacoes-${today.slice(0, 7)}.xlsx`, "Bonificações", ["Controle", "Data", "Cliente", "Código cliente", "Loja", "Motivo", "Produto", "Código produto", "Embalagem", "Quantidade", "Unidades", "Peso (kg)", "Valor de referência (R$)", "Remessa"], records.flatMap(bonus => bonus.items.map(item => [bonus.bonusNumber, bonus.issueDate, bonus.customerName, bonus.customerCode, bonus.store, bonus.reason, item.description, item.productCode, item.packageKind, item.packageQuantity, item.unitQuantity, item.grossWeight ?? item.totalWeight, item.subtotal ?? item.packagePrice * item.packageQuantity, bonus.remittanceId ?? ""])));
  }
  async function exportProducts() {
    await downloadXlsx("produtos-bom-destino.xlsx", "Produtos", ["Descrição do Produto", "Preço", "Cod CX", "Meia CX", "Medida", "Peso Unidade", "Peso", "Validade", "QTD CX", "Status", "Associado"], products.map(item => [item.description, item.unitPrice ?? item.pricePerBox / item.quantityPerBox, item.codeBox, item.codeHalfBox, item.measure ?? "KG", item.unitWeight ?? item.weightPerBox / item.quantityPerBox, item.weightType ?? "Fixo", item.expiration ?? "", item.quantityPerBox, item.status, item.associated ?? ""]));
  }
  const categories = [
    { name: "Comissões", detail: "Mensal geral e Mart Minas", icon: FileSpreadsheet, count: "2 relatórios" },
    { name: "Lojas por rede", detail: "Todas as lojas da rede", icon: Network, count: customerGroups.length },
    { name: "Clientes", detail: "Cadastro completo", icon: UsersRound, count: customers.length },
    { name: "Pedidos", detail: "Filtrar por remessa e período", icon: ShoppingCart, count: "Até 31 dias" },
    { name: "Bonificações", detail: "Somente mês atual", icon: Gift, count: today.slice(0, 7) },
    { name: "Produtos", detail: "Catálogo comercial", icon: Package, count: products.length },
  ];
  const exportCards = category === "Comissões"
    ? [
      { title: "Comissões mensais gerais", description: "Gera o detalhamento mensal de todas as redes, lojas, bases e comissões configuradas.", icon: FileSpreadsheet, action: exportGeneralCommissions },
      { title: "Comissões Mart Minas", description: "Exporta as comissões mensais da rede Mart Minas, separando WRRJ e Sul de Minas.", icon: Network, action: exportMartMinasCommissions },
    ]
    : category === "Lojas por rede"
      ? [{ title: "Exportar lojas da rede", description: `Exporta todos os cadastros de lojas vinculados a ${selectedGroup?.name || "rede selecionada"}.`, icon: Network, action: exportStoresByNetwork }]
      : category === "Clientes"
        ? [{ title: "Exportar clientes", description: "Exporta o cadastro completo de clientes, incluindo rede, cidade, status e dados comerciais.", icon: UsersRound, action: exportCustomers }]
        : category === "Pedidos"
          ? [{ title: "Exportar pedidos da remessa", description: "Exporta somente os pedidos da remessa selecionada e dentro do período informado.", icon: ShoppingCart, action: exportOrders }]
          : category === "Bonificações"
            ? [{ title: "Exportar bonificações do mês", description: `Exporta as bonificações registradas entre o início do mês atual e ${today.split("-").reverse().join("/")}.`, icon: Gift, action: exportCurrentBonifications }]
            : [{ title: "Exportar produtos", description: "Exporta o catálogo comercial completo para uma planilha.", icon: Package, action: exportProducts }];
  return <div className="page-content module-content import-export-page">
    <section className="panel module-panel export-panel">
      {exportBusy && <div role="status">Preparando exportação: {exportCount} registros carregados. <button type="button" className="button button-light" onClick={() => exportController.current?.abort()}>Cancelar</button></div>}
      <div className="module-heading"><span className="module-title-icon"><FileSpreadsheet size={21} /></span><div className="module-title-copy"><p className="eyebrow">DADOS E RELATÓRIOS</p><h1>Importações e exportações</h1><p>Importe documentos com leitura inteligente ou exporte os dados da base.</p></div><span className="source-pill">Dados da base atual</span></div>
      <div className="import-export-tabs" role="tablist" aria-label="Importar ou exportar dados">
        <button type="button" role="tab" aria-selected={activeTab === "import"} className={activeTab === "import" ? "import-export-tab-active" : ""} onClick={() => setActiveTab("import")}><Upload size={16} /> Importações</button>
        <button type="button" role="tab" aria-selected={activeTab === "export"} className={activeTab === "export" ? "import-export-tab-active" : ""} onClick={() => setActiveTab("export")}><Download size={16} /> Exportações</button>
      </div>
      {activeTab === "import" ? <div className="intelligent-import-area">
        <div className="import-category-label">TIPOS DE IMPORTAÇÃO DISPONÍVEIS NO CRM</div>
        <div className="intelligent-import-options">
          <article className={`intelligent-import-card ${importMode === "general" ? "intelligent-import-card-active" : ""}`}><span className="intelligent-import-icon"><FileSpreadsheet size={19} /></span><h2>PDF geral de pedidos e bonificações</h2><p>Reconhece pedidos de compra e bonificações, mostra uma prévia e permite conferir os registros antes de salvar.</p><button className="button button-outline" onClick={() => { setImportMode("general"); resetImportPreview(); }}>Selecionar PDF</button></article>
          <article className="intelligent-import-card"><span className="intelligent-import-icon"><Network size={19} /></span><h2>PDF Mart Minas</h2><p>Importa pedidos e bonificações, identifica as lojas e cria a remessa automaticamente.</p><Link href="/pedidos" className="button button-outline">Abrir importação de redes <ArrowRight size={15} /></Link></article>
          <article className="intelligent-import-card"><span className="intelligent-import-icon"><Network size={19} /></span><h2>PDF OESA</h2><p>Importa pedidos da rede OESA e gera uma remessa para o arquivo selecionado.</p><Link href="/pedidos" className="button button-outline">Abrir importação de redes <ArrowRight size={15} /></Link></article>
          <article className="intelligent-import-card"><span className="intelligent-import-icon"><FileText size={19} /></span><h2>Pedido por print</h2><p>Importe um pedido individual por imagem, selecione a loja e confira os itens.</p><Link href="/pedidos" className="button button-outline">Abrir pedidos <ArrowRight size={15} /></Link></article>
          <article className="intelligent-import-card"><span className="intelligent-import-icon"><UsersRound size={19} /></span><h2>Clientes por planilha</h2><p>Importe cadastros de clientes a partir de uma planilha XLS ou XLSX.</p><Link href="/clientes" className="button button-outline">Importar clientes <ArrowRight size={15} /></Link></article>
          <article className="intelligent-import-card"><span className="intelligent-import-icon"><Package size={19} /></span><h2>Produtos por planilha</h2><p>Importe e atualize o catálogo comercial a partir de uma planilha.</p><Link href="/produtos" className="button button-outline">Importar produtos <ArrowRight size={15} /></Link></article>
        </div>
        {importMode && <section className="intelligent-import-workspace">
          <div className="intelligent-import-workspace-heading"><div><p className="eyebrow">IMPORTAÇÃO INTELIGENTE</p><h2>Importar PDF geral de pedidos e bonificações</h2></div><button className="button button-light" onClick={() => { setImportMode(null); setImportFile(null); resetImportPreview(); }}>Fechar</button></div>
          <p className="intelligent-import-help">O sistema lê o título de cada documento: <strong>PEDIDO DE COMPRAS</strong> gera pedido; <strong>PEDIDO DE BONIFICAÇÃO SEM INCID CUSTO</strong> gera bonificação em cadastro separado. O PDF é processado localmente.</p>
          <label className="intelligent-import-file"><Upload size={19} /><span><strong>{importFile?.name ?? "Selecione o PDF"}</strong><small>PDF pesquisável · até 50 MB</small></span><input type="file" accept=".pdf,application/pdf" disabled={isImporting} onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            if (file && file.size > 50 * 1024 * 1024) {
              setImportFile(null);
              resetImportPreview();
              setImportError("O PDF excede o limite de 50 MB.");
            } else {
              setImportFile(file);
              resetImportPreview();
            }
            event.currentTarget.value = "";
          }} /></label>
          {isImporting && <div className="order-image-progress" role="status"><div><span>{ordersPreview.length || bonificationsPreview.length ? "Salvando importação..." : "Lendo e classificando páginas..."}</span><strong>{Math.round(importProgress * 100)}%</strong></div><progress max="100" value={Math.round(importProgress * 100)} /></div>}
          <ImportIssues error={importError} warnings={importWarnings} fileName={importFile?.name} />
          {importSuccess && <div className="import-feedback feedback-success" role="status">{importSuccess}</div>}
          {(ordersPreview.length > 0 || bonificationsPreview.length > 0 || importWarnings.length > 0) && <div className="intelligent-import-results">
            <p>Identificados no PDF: {detected.orders} compra(s) e {detected.bonifications} bonificação(ões). A prévia abaixo contém os registros novos com cliente e produtos correspondentes.</p>
            <div className="intelligent-import-counts"><span><ShoppingCart size={16} /><strong>{ordersPreview.length}</strong> pedido(s)</span><span><Gift size={16} /><strong>{bonificationsPreview.length}</strong> bonificação(ões)</span><small>{importWarnings.length} aviso(s)</small></div>
            {ordersPreview.length > 0 && <section><h3>Pedidos de compra</h3><div className="table-wrap network-import-table-wrap"><table><thead><tr><th>PEDIDO</th><th>CLIENTE</th><th>ITENS</th><th>VALOR</th><th>PESO</th></tr></thead><tbody>{ordersPreview.map((order) => <tr key={order.id}><td>{order.preOrder}</td><td>{order.customerName} · {order.customerCode}</td><td>{order.items.length}</td><td>{`R$ ${order.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td><td>{order.totalWeight.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg</td></tr>)}</tbody></table></div></section>}
            {bonificationsPreview.length > 0 && <section><h3>Pedidos de bonificação sem incidência de custo</h3><div className="table-wrap network-import-table-wrap"><table><thead><tr><th>CONTROLE</th><th>CLIENTE</th><th>ITENS</th><th>VALOR REF.</th><th>PESO</th></tr></thead><tbody>{bonificationsPreview.map((bonus) => <tr key={`${bonus.bonusNumber}:${bonus.customerId}`}><td>{bonus.bonusNumber}</td><td>{bonus.customerName} · {bonus.customerCode}</td><td>{bonus.items.length}</td><td>{`R$ ${bonus.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td><td>{bonus.totalWeight.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg</td></tr>)}</tbody></table></div></section>}

            {(ordersPreview.length > 0 || bonificationsPreview.length > 0) && <button type="button" className="button button-primary intelligent-import-confirm" disabled={isImporting} onClick={() => void confirmIntelligentImport()}><Upload size={15} /> Importar registros conferidos</button>}
          </div>}
          <button type="button" className="button button-primary intelligent-import-read" disabled={isImporting || !importFile} onClick={() => void readIntelligentImport()}><FileText size={15} /> {isImporting ? "Processando..." : "Ler e classificar documento"}</button>
        </section>}
      </div> : <div className="export-options">
        <div className="export-category-label">ESCOLHA O QUE DESEJA EXPORTAR</div>
        <div className="export-categories">{categories.map(({ name, detail, icon: Icon, count }) => <button type="button" key={name} aria-pressed={category === name} className={`export-category ${category === name ? "export-category-active" : ""}`} onClick={() => { setCategory(name); setExportError(""); }}><span><Icon size={17} /></span><strong>{name}</strong><small>{detail}</small><i>{count}</i></button>)}</div>
        <div className="export-options-heading"><div><p className="eyebrow">EXPORTAÇÃO</p><h2>{category}</h2><p>Configure os dados e gere somente a planilha necessária.</p></div></div>
        {category === "Comissões" && <div className="export-context-controls"><label><CalendarDays size={16} /> Mês das comissões<input type="month" max={today.slice(0, 7)} value={commissionMonth} onChange={event => setCommissionMonth(event.target.value)} /></label><small>Consulta limitada ao mês selecionado.</small></div>}
        {category === "Lojas por rede" && <div className="export-context-controls"><label><Network size={16} /> Rede<select value={selectedNetworkId} onChange={event => setNetworkId(event.target.value)}><option value="">Selecione uma rede</option>{customerGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><small>Exporta todos os cadastros associados à rede escolhida.</small></div>}
        {category === "Pedidos" && <div className="export-context-controls export-order-controls">
          <label><Network size={16} /> Rede<select value={remittanceGroupId} onChange={event => { setNetworkId(event.target.value); setRemittanceId(""); }}><option value="">Selecione a rede</option>{remittanceNetworks.map(id => { const group = customerGroups.find(item => item.id === id); return group ? <option key={id} value={id}>{group.name}</option> : null; })}</select></label>
          <label>Remessa<select value={remittanceId} onChange={event => setRemittanceId(event.target.value)} disabled={!remittanceGroupId || remittanceData.loading || !!remittanceData.error}><option value="">Selecione a remessa</option>{remittanceData.remittances.map(remittance => <option key={remittance.id} value={remittance.id}>{remittance.name}</option>)}</select></label>
          <label>De<input type="date" max={orderEnd || today} value={orderStart} onChange={event => setOrderStart(event.target.value)} /></label>
          <label>Até<input type="date" min={orderStart} max={today} value={orderEnd} onChange={event => setOrderEnd(event.target.value)} /></label>
          <span className={`export-period-status ${isExportPeriodWithinLimit(orderStart, orderEnd) ? "" : "invalid"}`} role={isExportPeriodWithinLimit(orderStart, orderEnd) ? undefined : "alert"}>{isExportPeriodWithinLimit(orderStart, orderEnd) ? "Período válido · até 31 dias" : "Período inválido · máximo de 31 dias"}</span>
          {remittanceData.error && <small className="export-inline-error" role="alert">{remittanceData.error}</small>}
        </div>}
        {category === "Bonificações" && <p className="export-current-month-note">O arquivo incluirá apenas as bonificações de {today.slice(0, 7)}. Esse limite evita leituras históricas desnecessárias.</p>}
        {exportError && <div className="import-feedback feedback-warning" role="alert">{exportError}</div>}
        <div className="export-card-grid">{exportCards.map(({ title, description, icon: Icon, action }) => <article className="export-card" key={title}><span className="export-card-icon"><Icon size={18} /></span><h3>{title}</h3><p>{description}</p><button type="button" disabled={exportBusy || (category === "Pedidos" && (!selectedRemittance || !isExportPeriodWithinLimit(orderStart, orderEnd) || remittanceData.loading || !!remittanceData.error)) || (category === "Lojas por rede" && !selectedGroup)} onClick={() => { setExportError(""); setExportBusy(true); setExportCount(0); const controller = new AbortController(); exportController.current = controller; void Promise.resolve(action(controller.signal)).catch((cause: unknown) => { setExportError(cause instanceof Error ? cause.message : "Falha ao gerar a planilha."); }).finally(() => setExportBusy(false)); }}><Download size={15} /> Exportar XLSX</button></article>)}</div>
      </div>}
    </section>
  </div>;
}
