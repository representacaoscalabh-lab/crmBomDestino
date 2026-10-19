"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { buildOesaScreenshotImport, pendingOesaScreenshotReview, readOesaScreenshots, type ScreenshotText } from "@/lib/oesa-screenshots";
import { updateOesaOrder } from "@/lib/oesa-order-pdf";
import type { Order } from "@/lib/types";
import { ImportIssues } from "./import-issues";
import "./oesa-screenshots.css";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PrintPreview({ file }: { file: File | null }) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = next;
    return () => URL.revokeObjectURL(next);
  }, [file]);
  // Uploaded files use temporary browser URLs.
  // eslint-disable-next-line @next/next/no-img-element
  return file ? <img ref={imageRef} alt={`Prévia de ${file.name}`} /> : <div className="oesa-print-placeholder"><ImagePlus size={28} /><span>Selecione a imagem</span></div>;
}

export function OesaScreenshotsModal({ onClose }: { onClose: () => void }) {
  const { customers, products, orders, addOrders } = useCrmStore();
  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(today);
  const [files, setFiles] = useState<(File | null)[]>([null, null]);
  const [sources, setSources] = useState<ScreenshotText[]>([]);
  const [preview, setPreview] = useState<Order | null>(null);
  const [detected, setDetected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [review, setReview] = useState<ReturnType<typeof buildOesaScreenshotImport>["review"]>([]);
  const [acceptedAlerts, setAcceptedAlerts] = useState<string[]>([]);
  const divergences = pendingOesaScreenshotReview(preview, review);
  const pending = divergences.filter((entry) => !acceptedAlerts.includes(entry.productId));
  function invalidate() { setPreview(null); setWarnings([]); setError(""); setReview([]); setAcceptedAlerts([]); }
  async function read() {
    const customer = customers.find((customer) => customer.id === customerId);
    if (!customer || !date || files.some((file) => !file) || busy) return;
    setBusy(true); invalidate(); setProgress(0); setSources([]);
    try {
      const texts = await readOesaScreenshots(files.filter((file): file is File => file !== null), setProgress);
      setSources(texts);
      const result = buildOesaScreenshotImport(texts, customer, products, number.trim() || `PRINT-${Date.now()}`, date, "ordered");
      setWarnings(result.warnings); setDetected(result.detected); setReview(result.review);
      if (!result.order.items.length) setError("Nenhum item preparado. Confira o log e o texto reconhecido abaixo.");
      else setPreview(result.order);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na leitura dos prints."); }
    finally { setBusy(false); }
  }
  function edit(index: number, key: "unitQuantity" | "boxQuantity" | "pieces" | "unitPrice" | "discountPercent", value: number) {
    if (!preview || !Number.isFinite(value) || value < 0 || ((key === "unitQuantity" || key === "boxQuantity") && value <= 0)) return;
    if (key === "boxQuantity" && !Number.isInteger(value)) return;
    if (key === "discountPercent" && value > 100) return;
    setAcceptedAlerts((current) => current.filter((id) => id !== preview.items[index].productId));
    const items = preview.items.map((item, position) => {
      if (index !== position) return item;
      const next = { ...item, [key]: value };
      const boxes = next.boxQuantity ?? next.packageQuantity;
      const product = products.find((product) => product.id === item.productId);
      next.packageQuantity = boxes;
      next.packagePrice = (next.unitPrice ?? 0) * next.unitQuantity / boxes;
      next.subtotal = Math.round(next.unitQuantity * (next.unitPrice ?? 0) * (1 - (next.discountPercent ?? 0) / 100) * 100) / 100;
      next.totalWeight = (product?.weightPerBox ?? 0) * boxes; next.grossWeight = next.totalWeight;
      return next;
    });
    setPreview(updateOesaOrder(preview, items));
  }
  async function save() {
    if (!preview?.items.length || busy) return;
    setBusy(true); setError("");
    try {
      if (pending.length) throw new Error("Corrija ou marque os alertas como aceitos antes de importar.");
      if (orders.some((order) => order.customerId === preview.customerId && order.preOrder === preview.preOrder)) throw new Error("Esse pedido já existe para a loja selecionada.");
      await addOrders([preview]); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar pedido."); }
    finally { setBusy(false); }
  }
  const visibleCustomers = customers.filter((customer) => customer.id === customerId || `${customer.name} ${customer.code} ${customer.store} ${customer.city} ${customer.document ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="modal-backdrop order-image-import-backdrop"><section className="modal-card order-image-import-modal oesa-import-modal oesa-prints-modal" role="dialog" aria-modal="true" aria-labelledby="oesa-prints-title">
    <header className="order-editor-heading"><div><p className="eyebrow">IMPORTAÇÃO DIRETA</p><h2 id="oesa-prints-title">Importar por print</h2><p>Escolha a loja e envie as duas partes da tabela.</p></div><button className="icon-button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    <div className="order-image-import-body">
      <fieldset disabled={busy} className="oesa-prints-fields">
        <label className="oesa-prints-wide">Buscar loja<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, código, cidade ou CNPJ" /></label>
        <label className="oesa-prints-wide">Loja<select value={customerId} onChange={(event) => { setCustomerId(event.target.value); invalidate(); }}><option value="">Selecione a loja</option>{visibleCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · Loja {customer.store || "—"} · {customer.city} · {customer.document || customer.code}</option>)}</select></label>
        <label>Número do pedido <small>Opcional</small><input value={number} onChange={(event) => { setNumber(event.target.value); invalidate(); }} placeholder="Gerado automaticamente se vazio" /></label>
        <label>Data de emissão<input type="date" value={date} onChange={(event) => { setDate(event.target.value); invalidate(); }} /></label>
      </fieldset>
      <div className="oesa-pair-heading"><strong>Imagens na ordem de leitura</strong><button type="button" className="button button-outline button-small" disabled={busy || !files.some(Boolean)} onClick={() => { setFiles(([first, second]) => [second, first]); setSources([]); invalidate(); }}>Inverter 1 e 2</button></div>
      <div className="oesa-print-pair">{files.map((file, index) => <section className="oesa-print-slot" key={index}>
        <header><span className="oesa-print-number">{index + 1}</span><div><strong>{index === 0 ? "Produtos e quantidades" : "Valores e caixas"}</strong><small>{index === 0 ? "Código / Produto / Quantidade" : "Preço / Desconto / Subtotal / Caixas / Peças"}</small></div></header>
        <PrintPreview file={file} />
        <label className="oesa-print-upload">{file ? "Trocar imagem" : "Selecionar imagem"} {index + 1}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => {
          const selected = event.target.files?.[0]; event.target.value = "";
          if (!selected) return;
          if (selected.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(selected.type)) { setError("Envie uma imagem PNG, JPG ou WebP de até 10 MB."); return; }
          setFiles((current) => current.map((entry, position) => position === index ? selected : entry)); setSources([]); invalidate();
        }} /></label>
        {file && <div className="oesa-print-file"><span>{file.name}</span><button type="button" className="icon-button" disabled={busy} aria-label={`Remover imagem ${index + 1}`} onClick={() => { setFiles((current) => current.map((entry, position) => position === index ? null : entry)); setSources([]); invalidate(); }}><X size={15} /></button></div>}
      </section>)}</div>
      <p className="oesa-prints-help">Imagem 1 à esquerda, imagem 2 à direita. A primeira linha da imagem 1 corresponde à primeira linha da imagem 2, e assim por diante. Quantidade vem da imagem 1; Peças vem da imagem 2. Mantenha as mesmas linhas, sem cortes. Até 10 MB por imagem.</p>
      {busy && <p role="status">Processando… {Math.round(progress * 100)}%<progress max={1} value={progress} /></p>}
      <ImportIssues error={error} warnings={warnings} fileName={files.map((file) => file?.name).filter(Boolean).join(", ")} title="Log da importação por prints" />
      {pending.length > 0 && <p className="form-error" role="status">{pending.length} item(ns) com divergência na leitura. Corrija os campos, aceite o alerta de cada item ou exclua o item para liberar a importação.</p>}
      {preview && <section><h3>Conferir pedido {preview.preOrder}</h3><p>{detected} linhas de produto lidas · {preview.items.length} itens na seleção · <strong>{money(preview.totalValue)}</strong></p><div className="table-wrap"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Caixas</th><th>Peças</th><th>Preço / un.</th><th>Desc. %</th><th>Subtotal</th><th /></tr></thead><tbody>{preview.items.map((item, index) => <tr key={index}><td><strong>{item.productCode}</strong><small>{item.description}</small>{divergences.some((entry) => entry.productId === item.productId) && <div className="oesa-price-review"><strong>Revisar leitura do preço</strong><span>Subtotal no print: {money(review.find((entry) => entry.productId === item.productId)!.subtotal)}</span><span>Preço calculado para conferir: {review.find((entry) => entry.productId === item.productId)?.suggestedPrice?.toLocaleString("pt-BR", { maximumFractionDigits: 6 }) ?? "—"}</span><span>Confira o print ou aceite os valores atuais.</span><label className="oesa-accept-alert"><input type="checkbox" disabled={busy} checked={acceptedAlerts.includes(item.productId)} onChange={(event) => { setAcceptedAlerts((current) => event.target.checked ? [...current, item.productId] : current.filter((id) => id !== item.productId)); setError(""); }} /> Importar este item mesmo com o alerta</label>{acceptedAlerts.includes(item.productId) && <strong>Alerta aceito. Valores atuais mantidos.</strong>}</div>}</td>{(["unitQuantity", "boxQuantity", "pieces", "unitPrice", "discountPercent"] as const).map((key) => <td key={key}><input aria-label={`${key} de ${item.productCode}`} type="number" min={key === "unitQuantity" || key === "boxQuantity" ? "1" : "0"} max={key === "discountPercent" ? 100 : undefined} step={key === "boxQuantity" ? "1" : "any"} disabled={busy} value={item[key] ?? 0} onChange={(event) => edit(index, key, event.target.valueAsNumber)} /></td>)}<td>{money(item.subtotal ?? 0)}</td><td><button className="icon-button" aria-label={`Excluir ${item.productCode}`} disabled={busy} onClick={() => setPreview(updateOesaOrder(preview, preview.items.filter((_, position) => position !== index)))}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div></section>}
      {sources.length > 0 && <details><summary>Ver texto reconhecido dos prints</summary>{sources.map((source, index) => <div key={index}><strong>{source.name}</strong><pre className="oesa-prints-raw">{source.text}</pre></div>)}</details>}
      <small className="oesa-prints-help">As imagens são lidas no navegador. A primeira leitura baixa os arquivos do leitor de imagens e precisa de internet. Confira todos os números antes de importar.</small>
    </div>
    <footer className="order-editor-footer"><button className="button button-light" disabled={busy} onClick={onClose}>Cancelar</button><button className="button button-outline" disabled={busy || !customerId || !date || files.some((file) => !file)} onClick={() => void read()}>Ler e conferir prints</button><button className="button button-primary" disabled={busy || !preview?.items.length || pending.length > 0} onClick={() => void save()}>Importar pedido</button></footer>
  </section></div>;
}
