"use client";

import { ImportIssues } from "@/components/import-issues";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download, FileSpreadsheet, FileText, Gift, Package, ShoppingCart, Upload, UsersRound } from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { loadExportRecords } from "@/lib/export-records";
import { findImportRecords } from "@/lib/import-existing-records";
import { downloadXlsx } from "@/lib/xlsx";
import { buildNetworkBonificationImport, buildNetworkOrderImport, parseNetworkOrderPdf, type NetworkOrderPdf } from "@/lib/network-order-pdf";
import type { Bonification, Order } from "@/lib/types";
import { importFailureMessage } from "@/lib/import-validation";

export default function ExportPage() {
  const { customers, customerGroups, products, addOrders, addBonifications } = useCrmStore();
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => () => exportController.current?.abort(), []);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportCount, setExportCount] = useState(0);
  const [category, setCategory] = useState("Clientes");
  const [activeTab, setActiveTab] = useState<"import" | "export">("import");
  const [exportError, setExportError] = useState("");
  const [importMode, setImportMode] = useState<"general" | "network" | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [ordersPreview, setOrdersPreview] = useState<Order[]>([]);
  const [bonificationsPreview, setBonificationsPreview] = useState<Omit<Bonification, "id">[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [detected, setDetected] = useState({ orders: 0, bonifications: 0 });

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
  async function exportNetworkSummary(signal?: AbortSignal) {
    const orders = await loadExportRecords<Order>("orders", signal, setExportCount);
    const headings = ["Rede", "Tipo de linha", "Código da loja", "Loja", "Cliente cadastrado", "Cidade", "Pedidos", "Peso total (kg)", "Faturamento (R$)"];
    const rows = customerGroups.flatMap((group) => {
      const members = customers.filter((customer) => customer.groupId === group.id);
      const totals = { orders: 0, weight: 0, value: 0 };
      const detailRows = members.map((customer) => {
        const customerOrders = orders.filter((order) =>
          order.customerId === customer.id ||
          (!order.customerId && order.customerCode.toLowerCase() === customer.code.toLowerCase() && order.store === customer.store),
        );
        const storeTotals = customerOrders.reduce((sum, order) => ({
          orders: sum.orders + 1,
          weight: sum.weight + order.totalWeight,
          value: sum.value + order.totalValue,
        }), { orders: 0, weight: 0, value: 0 });
        totals.orders += storeTotals.orders;
        totals.weight += storeTotals.weight;
        totals.value += storeTotals.value;
        return [group.name, "Loja", customer.code, customer.store, customer.name, customer.city, storeTotals.orders, storeTotals.weight, storeTotals.value];
      });
      return [
        ...detailRows,
        [group.name, "TOTAL DA REDE", "", "", `${members.length} loja(s)`, "", totals.orders, totals.weight, totals.value],
      ];
    });
    if (!rows.length) throw new Error("Ainda não há redes cadastradas para consolidar.");
    await downloadXlsx("relatorio-consolidado-redes.xlsx", "Redes", headings, rows);
  }
  const options = {
    Clientes: [
      { title: "Clientes", description: "Exporta todos os clientes cadastrados.", action: () => downloadXlsx("clientes-bom-destino.xlsx", "Clientes", ["Código", "Cliente", "CNPJ", "Loja", "Cidade", "UF", "Segmento", "Status"], customers.map((item) => [item.code, item.name, item.document ?? "", item.store, item.city, item.state ?? "", item.segment ?? "", item.status])) },
      { title: "Clientes ativos", description: "Exporta somente clientes com status ativo.", action: () => downloadXlsx("clientes-ativos-bom-destino.xlsx", "Clientes ativos", ["Código", "Cliente", "CNPJ", "Loja", "Cidade", "Status"], customers.filter((item) => item.status === "Ativo").map((item) => [item.code, item.name, item.document ?? "", item.store, item.city, item.status])) },
      { title: "Consolidado por rede", description: "Mostra pedidos, peso e faturamento de cada loja e o total consolidado de todas as lojas de cada rede.", action: exportNetworkSummary },
    ],
    Pedidos: [
      { title: "Pedidos e faturamento", description: "Exporta os pedidos registrados com valor e peso.", action: async (signal?: AbortSignal) => downloadXlsx("pedidos-bom-destino.xlsx", "Pedidos", ["Pré-pedido", "Data", "Cliente", "Código cliente", "NF", "Peso (kg)", "Valor (R$)", "Situação"], (await loadExportRecords<Order>("orders", signal, setExportCount)).map((item) => [item.preOrder, item.issueDate, item.customerName, item.customerCode, item.invoice, item.totalWeight, item.totalValue, item.status])) },
    ],
    Bonificações: [
      { title: "Amostras e cortesias", description: "Exporta bonificações separadamente das vendas e pedidos.", action: async (signal?: AbortSignal) => downloadXlsx("bonificacoes-bom-destino.xlsx", "Bonificações", ["Controle", "Data", "Cliente", "Código cliente", "Motivo", "Produto", "Código produto", "Embalagem", "Quantidade", "Unidades", "Peso (kg)", "Valor de referência (R$)"], (await loadExportRecords<Bonification>("bonifications", signal, setExportCount)).flatMap((bonus) => bonus.items.map((item) => [bonus.bonusNumber, bonus.issueDate, bonus.customerName, bonus.customerCode, bonus.reason, item.description, item.productCode, item.packageKind, item.packageQuantity, item.unitQuantity, item.grossWeight ?? item.totalWeight, item.subtotal ?? item.packagePrice * item.packageQuantity]))) },
    ],
    Produtos: [
      { title: "Produtos", description: "Exporta os dados do catálogo no formato do modelo de importação.", action: () => downloadXlsx("produtos-bom-destino.xlsx", "Produtos", ["Descrição do Produto", "Preço", "Cod CX", "Meia CX", "Medida", "Peso Unidade", "Peso", "Validade", "QTD CX", "Status", "Associado"], products.map((item) => [item.description, item.unitPrice ?? item.pricePerBox / item.quantityPerBox, item.codeBox, item.codeHalfBox, item.measure ?? "KG", item.unitWeight ?? item.weightPerBox / item.quantityPerBox, item.weightType ?? "Fixo", item.expiration ?? "", item.quantityPerBox, item.status, item.associated ?? ""])) },
    ],
  } as const;
  const selected = options[category as keyof typeof options];
  const categories = [{ name: "Clientes", detail: "Cadastros e carteira", icon: UsersRound, count: customers.length }, { name: "Pedidos", detail: "Pedidos e faturamento", icon: ShoppingCart, count: "Sob demanda" }, { name: "Bonificações", detail: "Amostras e cortesias", icon: Gift, count: "Sob demanda" }, { name: "Produtos", detail: "Catálogo comercial", icon: Package, count: products.length }];
  return <div className="page-content module-content import-export-page">
    <section className="panel module-panel export-panel">
      {exportBusy && <div role="status">Preparando exportação: {exportCount} registros carregados. <button type="button" className="button button-light" onClick={() => exportController.current?.abort()}>Cancelar</button></div>}
      <div className="module-heading"><span className="module-title-icon"><FileSpreadsheet size={21} /></span><div className="module-title-copy"><p className="eyebrow">DADOS E RELATÓRIOS</p><h1>Importações e exportações</h1><p>Importe documentos com leitura inteligente ou exporte os dados da base.</p></div><span className="source-pill">Dados da base atual</span></div>
      <div className="import-export-tabs" role="tablist" aria-label="Importar ou exportar dados">
        <button type="button" role="tab" aria-selected={activeTab === "import"} className={activeTab === "import" ? "import-export-tab-active" : ""} onClick={() => setActiveTab("import")}><Upload size={16} /> Importações</button>
        <button type="button" role="tab" aria-selected={activeTab === "export"} className={activeTab === "export" ? "import-export-tab-active" : ""} onClick={() => setActiveTab("export")}><Download size={16} /> Exportações</button>
      </div>
      {activeTab === "import" ? <div className="intelligent-import-area">
        <div className="import-category-label">ESCOLHA O TIPO DE IMPORTAÇÃO</div>
        <div className="intelligent-import-options">
          <article className="intelligent-import-card"><span className="intelligent-import-icon"><FileText size={19} /></span><h2>Pedido separado</h2><p>Importe um print de um único pedido, selecione a loja e confira os itens antes de gravar.</p><Link href="/pedidos" className="button button-outline">Importar print <ArrowRight size={15} /></Link></article>
          <article className={`intelligent-import-card ${importMode === "general" ? "intelligent-import-card-active" : ""}`}><span className="intelligent-import-icon"><FileSpreadsheet size={19} /></span><h2>Pedido geral</h2><p>A leitura inteligente reconhece o tipo do documento e separa pedidos de compra de bonificações sem incidência de custo.</p><button className="button button-outline" onClick={() => { setImportMode("general"); resetImportPreview(); }}>Selecionar PDF</button></article>
          <article className={`intelligent-import-card ${importMode === "network" ? "intelligent-import-card-active" : ""}`}><span className="intelligent-import-icon"><UsersRound size={19} /></span><h2>Rede</h2><p>Usa a leitura atual por páginas, identifica a filial pelo CNPJ e os produtos pelo Cod Forn.</p><button className="button button-outline" onClick={() => { setImportMode("network"); resetImportPreview(); }}>Selecionar PDF da rede</button></article>
        </div>
        {importMode && <section className="intelligent-import-workspace">
          <div className="intelligent-import-workspace-heading"><div><p className="eyebrow">IMPORTAÇÃO INTELIGENTE</p><h2>{importMode === "network" ? "Importar pedidos da rede" : "Importar pedido geral"}</h2></div><button className="button button-light" onClick={() => { setImportMode(null); setImportFile(null); resetImportPreview(); }}>Trocar tipo</button></div>
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
        <div className="export-category-label">TIPO DE EXPORTAÇÃO</div>
        <div className="export-categories">{categories.map(({ name, detail, icon: Icon, count }) => <button key={name} className={`export-category ${category === name ? "export-category-active" : ""}`} onClick={() => setCategory(name)}><span><Icon size={17} /></span><strong>{name}</strong><small>{detail}</small><i>{count}</i></button>)}</div>
        <h2>Exportações de {category.toLowerCase()}</h2>{exportError && <div className="import-feedback feedback-warning" role="alert">{exportError}</div>}
        <div className="export-card-grid">{selected.map(({ title, description, action }) => <article className="export-card" key={title}><span className="export-card-icon"><Download size={18} /></span><h3>{title}</h3><p>{description}</p><button disabled={exportBusy} onClick={() => { setExportError(""); setExportBusy(true); setExportCount(0); const controller = new AbortController(); exportController.current = controller; void Promise.resolve(action(controller.signal)).catch((cause: unknown) => { setExportError(cause instanceof Error ? cause.message : "Falha ao gerar a planilha."); }).finally(() => setExportBusy(false)); }}><Download size={15} /> Exportar XLSX</button></article>)}</div>
      </div>}
    </section>
  </div>;
}
