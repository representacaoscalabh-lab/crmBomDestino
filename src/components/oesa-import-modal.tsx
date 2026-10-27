"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { findImportRecords } from "@/lib/import-existing-records";
import { useCrmStore } from "@/lib/store";
import { useOesaNovaSafraSettings } from "@/lib/oesa-nova-safra-settings";
import { createOrderRemittance, failOrderRemittanceImport, finishOrderRemittanceImport } from "@/lib/order-remittances";
import { buildOesaOrderImport, parseOesaOrderPdf, updateOesaItem, updateOesaOrder } from "@/lib/oesa-order-pdf";
import type { Order } from "@/lib/types";
import { ImportIssues } from "@/components/import-issues";

export function OesaImportModal({ onClose }: { onClose: () => void }) {
  const { customers, products, orders, addOrders } = useCrmStore();
  const { crmUser } = useAuth();
  const oesaSettings = useOesaNovaSafraSettings();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<Order[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [summaries, setSummaries] = useState<ReturnType<typeof buildOesaOrderImport>["summaries"]>([]);
  function editItem(orderId: string, index: number, changes: { productId?: string; boxes?: number; unitPrice?: number }) {
    setPreview((current) => current.map((order) => {
      if (order.id !== orderId) return order;
      const items = order.items.map((item, position) => {
        if (position !== index) return item;
        const product = products.find((product) => product.id === (changes.productId ?? item.productId));
        const boxes = changes.boxes ?? item.packageQuantity;
        const price = changes.unitPrice ?? item.unitPrice ?? 0;
        if (!product || !Number.isFinite(boxes) || boxes <= 0 || !Number.isFinite(price) || price < 0 || !(product.quantityPerBox > 0) || !Number.isFinite(product.quantityPerBox) || !Number.isFinite(product.weightPerBox) || product.weightPerBox < 0) return item;
        return updateOesaItem(product, boxes, price);
      });
      return updateOesaOrder(order, items);
    }));
  }
  function removeItem(orderId: string, index: number) {
    setPreview((current) => current.map((order) => order.id === orderId ? updateOesaOrder(order, order.items.filter((_, position) => position !== index)) : order).filter((order) => order.items.length));
  }
  async function read() {
    if (!file || busy) return;
    setBusy(true); setError(""); setPreview([]); setWarnings([]); setSummaries([]); setProgress(0);
    try {
      const parsed = await parseOesaOrderPdf(new Uint8Array(await file.arrayBuffer()), setProgress);
      const existing = await findImportRecords("orders", parsed.map(order => order.orderNumber));
      const result = buildOesaOrderImport(parsed, customers, products, existing as Order[]);
      setPreview(result.orders); setWarnings(result.warnings); setSummaries(result.summaries);
      if (!result.orders.length) setError("Nenhum pedido pronto para importar. Confira os avisos.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível ler o PDF."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (busy || !preview.length) return;
    setBusy(true); setError("");
    let remittance: { id: string; groupId: string; name: string } | null = null;
    const actor = { id: crmUser?.uid ?? "", name: crmUser?.name || crmUser?.email || "Usuário" };
    try {
      if (!oesaSettings.groupId) throw new Error("Configure a rede OESA em Configurações antes de importar para uma remessa.");
      if (preview.some((order) => !order.preOrder.trim() || !order.issueDate)) throw new Error("Preencha o número e a data de todos os pedidos.");
      const identities = preview.map((order) => `${order.customerId}:${order.preOrder.trim()}`);
      if (new Set(identities).size !== identities.length) throw new Error("Existem pedidos com o mesmo número para o mesmo cliente na conferência.");
      const duplicates = preview.filter((incoming) => orders.some((order) => order.customerId === incoming.customerId && order.preOrder === incoming.preOrder.trim()));
      if (duplicates.length) throw new Error("Um dos pedidos já foi salvo. Leia o PDF novamente para atualizar a conferência.");
      const validated = preview.map((order) => updateOesaOrder({ ...order, preOrder: order.preOrder.trim() }, order.items.map((item) => {
        const product = products.find((product) => product.id === item.productId);
        if (!product || !Number.isFinite(item.unitPrice) || (item.unitPrice ?? -1) < 0 || !(product.quantityPerBox > 0) || !Number.isFinite(product.quantityPerBox) || !Number.isFinite(item.packageQuantity) || item.packageQuantity <= 0) throw new Error("Confira os produtos, caixas e preços antes de importar.");
        return updateOesaItem(product, item.packageQuantity, item.unitPrice!);
      })));
      const sourceFile = file?.name ?? "";
      const name = sourceFile.replace(/\.pdf$/i, "").trim().slice(0, 100) || `OESA ${new Intl.DateTimeFormat("pt-BR").format(new Date())}`;
      const id = await createOrderRemittance({ groupId: oesaSettings.groupId, network: "oesa", name, source: "oesa_pdf", sourceFile, actor });
      remittance = { id, groupId: oesaSettings.groupId, name };
      await addOrders(validated, id);
      await finishOrderRemittanceImport(remittance, validated.length, 0, actor);
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível salvar os pedidos.";
      if (remittance) {
        try { await failOrderRemittanceImport(remittance, message, actor); }
        catch (logError) {
          console.error("Falha ao registrar o resultado da importação OESA.", logError);
          setError(`${message} Não foi possível atualizar o histórico da remessa; atualize a página e confira os registros antes de repetir.`);
          return;
        }
      }
      setError(message);
    }
    finally { setBusy(false); }
  }
  const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return <div className="modal-backdrop order-image-import-backdrop"><section className="modal-card order-image-import-modal network-order-import-modal oesa-import-modal" role="dialog" aria-modal="true" aria-labelledby="oesa-import-title">
    <div className="order-editor-heading"><div><p className="eyebrow">IMPORTAÇÃO OESA</p><h2 id="oesa-import-title">Importar pedidos OESA</h2><p>Selecione o PDF original e confira os itens antes de salvar.</p></div><button className="icon-button" aria-label="Fechar" disabled={busy} onClick={onClose}>×</button></div>
    <div className="order-image-import-body">
      <label className="order-image-dropzone"><span>PDF OESA · até 50 MB</span><input type="file" accept=".pdf,application/pdf" disabled={busy} onChange={(event) => {
        const selected = event.target.files?.[0] ?? null;
        setPreview([]); setWarnings([]); setSummaries([]); setProgress(0);
        if (selected && selected.size > 50 * 1024 * 1024) { setFile(null); setError("O PDF excede 50 MB."); }
        else { setFile(selected); setError(""); }
      }} /></label>
      <div className="order-image-guide"><span>O CNPJ da empresa identifica o cliente. Cód.Fáb. é comparado sem zeros à esquerda; o pedido usa o código do cadastro. Correspondências ambíguas são bloqueadas.</span><span>Caixas = Qt.Pedida ÷ unidades por caixa, arredondadas para o inteiro mais próximo, com mínimo de 1. Preço por unidade = P.Compra do PDF. Confira os ajustes antes de salvar.</span></div>
      {busy && <p role="status">Processando… {Math.round(progress * 100)}%</p>}
      {summaries.length > 0 && <section className="oesa-import-summary" aria-label="Resultado da leitura" aria-live="polite"><strong>Resultado da leitura do PDF</strong>{summaries.map((summary, index) => <p key={index}>Pedido {summary.orderNumber}: <b>{summary.total}</b> itens no documento/detectados · <b>{summary.read}</b> lidos · <b>{summary.prepared}</b> preparados · <b>{summary.rejected}</b> não preparados</p>)}<small>Na seleção atual: {preview.reduce((sum, order) => sum + order.items.length, 0)} itens. Os números da leitura não incluem suas exclusões manuais.</small></section>}
      <ImportIssues error={error} warnings={warnings} fileName={file?.name} title="Relatório de erros e itens não importados — OESA" guidance="Cada aviso indica o motivo da rejeição. Corrija o cadastro ou o PDF e leia novamente. Você pode copiar ou baixar este log." />
      <p>Edite os campos abaixo ou exclua itens antes de importar. Ler o PDF novamente descarta as edições.</p>
      {preview.map((order) => <section key={order.id}>
        <h3>Pedido {order.preOrder} · {order.customerName} · {money(order.totalValue)}</h3>
        <label>Número do pedido <input aria-label="Número do pedido OESA" disabled={busy} value={order.preOrder} onChange={(event) => setPreview((current) => current.map((entry) => entry.id === order.id ? { ...entry, preOrder: event.target.value } : entry))} /></label>
        <label>Data de emissão <input type="date" disabled={busy} value={order.issueDate} onChange={(event) => setPreview((current) => current.map((entry) => entry.id === order.id ? { ...entry, issueDate: event.target.value } : entry))} /></label>
        <button className="button button-light" disabled={busy} onClick={() => setPreview((current) => current.filter((entry) => entry.id !== order.id))}>Excluir pedido</button>
        <div className="table-wrap"><table><thead><tr><th>CÓDIGO</th><th>PRODUTO</th><th>UNIDADES</th><th>CAIXAS</th><th>PREÇO / UN.</th><th>SUBTOTAL</th><th>AÇÕES</th></tr></thead>
          <tbody>{order.items.map((item, index) => <tr key={`${order.id}:${index}`}>
            <td>{item.productCode}</td>
            <td><select style={{ minWidth: 240, maxWidth: 360 }} aria-label={`Produto do item ${index + 1}`} disabled={busy} value={item.productId} onChange={(event) => editItem(order.id, index, { productId: event.target.value })}>{products.map((product) => <option key={product.id} value={product.id}>{product.codeBox} · {product.description}</option>)}</select></td>
            <td>{item.unitQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 6 })}</td>
            <td><input style={{ width: 85 }} aria-label={`Caixas do item ${index + 1}`} type="number" min="1" step="1" disabled={busy} value={item.packageQuantity} onChange={(event) => editItem(order.id, index, { boxes: event.target.valueAsNumber })} /></td>
            <td><input style={{ width: 110 }} aria-label={`Preço por unidade do item ${index + 1}`} type="number" min="0" step="any" disabled={busy} value={item.unitPrice ?? 0} onChange={(event) => editItem(order.id, index, { unitPrice: event.target.valueAsNumber })} /></td>
            <td>{money(item.subtotal ?? 0)}</td><td><button className="button button-light" disabled={busy} aria-label={`Excluir item ${index + 1}`} onClick={() => removeItem(order.id, index)}>Excluir</button></td>
          </tr>)}</tbody>
        </table></div>
      </section>)}
    </div>
    <div className="order-editor-footer"><button className="button button-light" disabled={busy} onClick={onClose}>Cancelar</button><button className="button button-outline" disabled={busy || !file} onClick={() => void read()}>Ler e conferir PDF</button><button className="button button-primary" disabled={busy || !preview.length} onClick={() => void save()}>Importar pedidos ({preview.length})</button></div>
  </section></div>;
}
