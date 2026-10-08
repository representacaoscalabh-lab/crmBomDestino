"use client";

import { FormEvent, useMemo, useState } from "react";
import { Download, Package, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { SpreadsheetImportModal } from "@/components/spreadsheet-import-modal";
import { useCrmStore } from "@/lib/store";
import { getPackageValues } from "@/lib/product-packaging";
import { parseSpreadsheetNumber, parseUnitWeight } from "@/lib/product-spreadsheet";
import type { NewProduct, Product } from "@/lib/types";
import { downloadXlsx, downloadXlsxTemplate, readSpreadsheetRows } from "@/lib/xlsx";

const productHeadings = ["Descrição do Produto", "Preço", "Cod CX", "Meia CX", "Medida", "Peso Unidade", "Peso", "Validade", "QTD CX", "Status", "Associado"];

function productRow(product: Product): (string | number)[] {
  return [
    product.description,
    product.unitPrice ?? product.pricePerBox / product.quantityPerBox,
    product.codeBox,
    product.codeHalfBox,
    product.measure ?? "KG",
    product.unitWeight ?? product.weightPerBox / product.quantityPerBox,
    product.weightType ?? "Fixo",
    product.expiration ?? "",
    product.quantityPerBox,
    product.status,
    product.associated ?? "",
  ];
}

function downloadProducts(products: Product[]) {
  return downloadXlsx("produtos-bom-destino.xlsx", "Produtos", productHeadings, products.map(productRow));
}

export default function ProductsPage() {
  const { products, addProduct, updateProduct, deleteProduct } = useCrmStore();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Todos");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [unitWeightInput, setUnitWeightInput] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [measureInput, setMeasureInput] = useState<"KG" | "UN">("KG");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const filtered = useMemo(() => products.filter((product) => {
    const matches = `${product.description} ${product.codeBox} ${product.codeHalfBox}`.toLowerCase().includes(search.toLowerCase());
    return matches && (status === "Todos" || product.status === status);
  }), [products, search, status]);
  const previewQuantity = Number(quantityInput) || 0;
  const previewUnitWeight = Number(unitWeightInput) || 0;
  const previewUnitPrice = Number(unitPriceInput) || 0;

  async function downloadTemplate() {
    await downloadXlsxTemplate(
      "modelo-importacao-produtos.xlsx",
      "Produtos",
      productHeadings,
      ["Produto exemplo", 15, "BD100", "BD100-M", "KG", 0.5, "Fixo", "30 dias", 8, "Ativo", "Marca exemplo"],
    );
  }

  async function exportFiltered() {
    try {
      await downloadProducts(filtered);
    } catch (cause) {
      console.error("Falha ao exportar produtos.", cause);
      setError("Não foi possível exportar os produtos.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const quantityPerBox = Number(form.get("quantityPerBox"));
    const unitWeight = Number(form.get("unitWeight"));
    const unitPrice = Number(form.get("unitPrice"));
    const codeBox = String(form.get("codeBox")).trim();
    const codeHalfBox = String(form.get("codeHalfBox")).trim();
    const measure = form.get("measure") === "UN" ? "UN" : "KG";
    const weightType = form.get("weightType") === "Variável" ? "Variável" : "Fixo";
    if (!Number.isInteger(quantityPerBox) || quantityPerBox < 2 || quantityPerBox % 2 !== 0) {
      setError("A quantidade por caixa precisa ser um número par para calcular a meia caixa.");
      return;
    }
    if (!Number.isFinite(unitWeight) || unitWeight <= 0) {
      setError("Informe um peso por unidade válido e maior que zero.");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setError("Informe um preço por unidade válido.");
      return;
    }
    if (!codeBox || (codeHalfBox && codeBox.toLowerCase() === codeHalfBox.toLowerCase())) {
      setError("Informe um código para a caixa e, se houver, um código diferente para meia caixa.");
      return;
    }
    if (products.some((product) => product.id !== editingProduct?.id && [product.codeBox, product.codeHalfBox].filter(Boolean).some((code) => code.toLowerCase() === codeBox.toLowerCase() || (codeHalfBox && code.toLowerCase() === codeHalfBox.toLowerCase())))) {
      setError("Os códigos da caixa e da meia caixa devem ser únicos no catálogo.");
      return;
    }
    try {
      const productData: NewProduct = {
        codeBox,
        codeHalfBox,
        description: String(form.get("description")).trim(),
        associated: String(form.get("associated")).trim(),
        quantityPerBox,
        weightPerBox: unitWeight * quantityPerBox,
        unitWeight,
        unitPrice,
        measure,
        weightType,
        expiration: String(form.get("expiration")).trim(),
        pricePerBox: unitPrice * quantityPerBox,
        status: String(form.get("status")) as Product["status"],
      };
      if (editingProduct) {
        await updateProduct(editingProduct.id, productData);
      } else {
        await addProduct(productData);
      }
      formElement.reset();
      setError("");
      setShowForm(false);
      setEditingProduct(null);
    } catch (cause) {
      console.error(editingProduct ? "Falha ao atualizar produto." : "Falha ao salvar produto.", cause);
      setError(editingProduct ? "Não foi possível atualizar o produto. Verifique sua conexão e tente novamente." : "Não foi possível salvar o produto. Verifique sua conexão e tente novamente.");
    }
  }

  function openNewProductForm() {
    setError("");
    setEditingProduct(null);
    setUnitPriceInput("");
    setUnitWeightInput("");
    setQuantityInput("");
    setMeasureInput("KG");
    setShowForm(true);
  }

  function openEditProductForm(product: Product) {
    setError("");
    setEditingProduct(product);
    setUnitPriceInput(String(product.unitPrice ?? product.pricePerBox / product.quantityPerBox));
    setUnitWeightInput(String(product.unitWeight ?? product.weightPerBox / product.quantityPerBox));
    setQuantityInput(String(product.quantityPerBox));
    setMeasureInput(product.measure ?? "KG");
    setShowForm(true);
  }

  async function confirmDeleteProduct() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError("");
    try {
      await deleteProduct(pendingDelete.id);
      setPendingDelete(null);
    } catch (cause) {
      console.error("Falha ao excluir produto.", cause);
      setError("Não foi possível excluir o produto. Verifique sua conexão e suas permissões e tente novamente.");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function importProducts(file: File): Promise<string> {
      const rows = await readSpreadsheetRows(file);
      if (!rows.length) throw new Error("A planilha está vazia ou não contém linhas de produtos.");
      const valueAt = (row: Record<string, unknown>, ...names: string[]) => {
        for (const [key, value] of Object.entries(row)) {
          const normalized = key.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
          if (names.includes(normalized) && value !== undefined && value !== null && String(value).trim()) return String(value).trim();
        }
        return "";
      };
      let imported = 0;
      let skipped = 0;
      const usedCodes = new Set(products.flatMap((product) => [product.codeBox, product.codeHalfBox]).map((code) => code.toLowerCase()));
      const productsToAdd: NewProduct[] = [];
      for (const row of rows) {
        const quantity = parseSpreadsheetNumber(valueAt(row, "qtdcx", "unidadescaixa", "quantidadeporcaixa", "quantidade"));
        const unitPriceValue = valueAt(row, "precounidade", "precoporunidade", "precounitario", "preco");
        const boxPriceValue = valueAt(row, "precocaixa");
        const unitPrice = unitPriceValue ? parseSpreadsheetNumber(unitPriceValue) : parseSpreadsheetNumber(boxPriceValue) / quantity;
        const importedUnitWeight = parseUnitWeight(valueAt(row, "pesounidade", "pesounitario"));
        const legacyBoxWeight = parseUnitWeight(valueAt(row, "pesocaixakg", "pesocaixa"));
        const unitWeight = Number.isFinite(importedUnitWeight) ? importedUnitWeight : legacyBoxWeight / quantity;
        const measureValue = valueAt(row, "medida", "unidade").toUpperCase();
        const weightTypeValue = valueAt(row, "peso", "tipopeso").toLowerCase();
        const measure: "KG" | "UN" = measureValue === "UN" ? "UN" : "KG";
        const weightType: "Variável" | "Fixo" = weightTypeValue === "variavel" || weightTypeValue === "variável" ? "Variável" : "Fixo";
        const codeBox = valueAt(row, "codcx", "codigocaixa", "codigoproduto", "codigo");
        const codeHalfBox = valueAt(row, "meiacx", "codigomeiacaixa", "codigomeia");
        const description = valueAt(row, "descricaodoproduto", "descricao", "produto", "nome");
        const associated = valueAt(row, "associado", "fornecedor", "marca");
        const expiration = valueAt(row, "validade", "prazo");
        const statusValue = valueAt(row, "status").toLowerCase();
        const productStatus: Product["status"] = statusValue === "inativo" ? "Inativo" : "Ativo";
        if (!codeBox || !description || !Number.isInteger(quantity) || quantity < 2 || quantity % 2 !== 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(unitWeight) || unitWeight <= 0) {
          skipped += 1;
          continue;
        }
        const normalizedBoxCode = codeBox.toLowerCase();
        const normalizedHalfCode = codeHalfBox.toLowerCase();
        if ((normalizedHalfCode && normalizedBoxCode === normalizedHalfCode) || usedCodes.has(normalizedBoxCode) || (normalizedHalfCode && usedCodes.has(normalizedHalfCode))) {
          skipped += 1;
          continue;
        }
        productsToAdd.push({
          codeBox,
          codeHalfBox,
          description,
          associated,
          quantityPerBox: quantity,
          pricePerBox: unitPrice * quantity,
          weightPerBox: unitWeight * quantity,
          unitWeight,
          unitPrice,
          measure,
          weightType,
          expiration,
          status: productStatus,
        });
        usedCodes.add(normalizedBoxCode);
        if (normalizedHalfCode) usedCodes.add(normalizedHalfCode);
      }
      if (!productsToAdd.length) throw new Error("Nenhum produto válido foi encontrado. Preencha Descrição do Produto, Preço, Cod CX, Peso Unidade e uma QTD CX inteira e par; valores de preço podem incluir R$ e o peso pode estar em KG ou G.");
      for (const product of productsToAdd) {
        await addProduct(product);
        imported += 1;
      }
      return `${imported} produto(s) importado(s). ${skipped ? `${skipped} linha(s) ignorada(s) por dados inválidos ou códigos repetidos.` : ""}`;
  }

  return (
    <div className="page-content module-content">
      <section className="panel module-panel">
        <div className="module-heading">
          <span className="module-title-icon"><Package size={21} /></span>
          <div className="module-title-copy"><p className="eyebrow">PRODUTOS</p><h1>Cadastro e gestão de produtos</h1></div>
          <div className="module-actions"><button className="button button-outline" onClick={() => { setError(""); setShowImport(true); }}><Upload size={15} /> Importar</button><button className="button button-primary" onClick={openNewProductForm}><Plus size={16} /> Cadastrar produto</button></div>
        </div>
        {error && !showForm && <div className="import-feedback feedback-warning" role="status">{error}</div>}
        <div className="product-filters"><div className="search-field"><Search size={16} /><input aria-label="Pesquisar produtos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por descrição ou código..." /></div><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrar produtos por status"><option>Todos</option><option>Ativo</option><option>Inativo</option></select><button className="button button-outline" onClick={() => { void exportFiltered(); }}><Download size={14} /> Exportar XLSX</button><span className="results-summary">{filtered.length} produtos</span></div>
        {filtered.length ? <div className="table-wrap customer-table-wrap product-table-wrap"><table><thead><tr><th>DESCRIÇÃO</th><th>PREÇO / UNIDADE</th><th>PREÇO / CX</th><th>COD CX</th><th>MEIA CX</th><th>MEDIDA</th><th>PESO UNIDADE</th><th>PESO CAIXA</th><th>PESO</th><th>VALIDADE</th><th>QTD CX</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>{filtered.map((product) => { const half = getPackageValues(product, true); const measure = product.measure ?? "KG"; const unitPrice = product.unitPrice ?? product.pricePerBox / product.quantityPerBox; const unitWeight = product.unitWeight ?? product.weightPerBox / product.quantityPerBox; return <tr key={product.id}><td className="table-primary">{product.description}</td><td>R$ {unitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td>R$ {product.pricePerBox.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}<small className="customer-detail">Meia: R$ {half.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</small></td><td><span className="code-chip">{product.codeBox}</span></td><td><span className="code-chip half-code">{product.codeHalfBox}</span></td><td>{measure}</td><td>{unitWeight.toLocaleString("pt-BR")} {measure}</td><td>{product.weightPerBox.toLocaleString("pt-BR")} {measure}</td><td>{product.weightType ?? "Fixo"}</td><td>{product.expiration || "—"}</td><td>{product.quantityPerBox}</td><td><span className={`status-pill ${product.status === "Ativo" ? "status-green" : "status-neutral"}`}>{product.status}</span></td><td><div className="product-row-actions"><button className="table-action" aria-label={`Editar ${product.description}`} title="Editar produto" onClick={() => openEditProductForm(product)}><Pencil size={15} /></button><button className="table-action product-delete-action" aria-label={`Excluir ${product.description}`} title="Excluir produto" onClick={() => { setError(""); setPendingDelete(product); }}><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div> : <div className="page-empty"><span className="page-empty-icon"><Package size={23} /></span><strong>{search ? "Nenhum produto encontrado" : "Cadastre seu primeiro produto"}</strong><p>{search ? "Confira os códigos e tente novamente." : "Registre os códigos de caixa e meia caixa para usar no cadastro e na importação de pedidos."}</p>{!search && <button className="button button-outline" onClick={openNewProductForm}><Plus size={16} /> Cadastrar produto</button>}</div>}
      </section>
      {showForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}>
          <section className="customer-modal product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
            <div className="modal-heading">
              <div><p className="eyebrow">CATÁLOGO COMERCIAL</p><h2 id="product-modal-title">{editingProduct ? "Editar produto" : "Novo produto"}</h2><p>Preencha os dados comerciais e de embalagem.</p></div>
              <button className="icon-button" aria-label="Fechar" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <form className="modal-form product-form" onSubmit={submit}>
              <section className="product-form-section">
                <div className="product-form-section-heading"><div><h3>Identificação</h3><p>Informações usadas na busca e nos pedidos.</p></div></div>
                <div className="product-form-grid">
                  <label><span>Cod CX <i>*</i></span><input name="codeBox" required placeholder="Ex.: PROD001" defaultValue={editingProduct?.codeBox ?? ""} autoFocus /></label>
                  <label className="product-description-field"><span>Descrição <i>*</i></span><input name="description" required placeholder="Nome do produto" defaultValue={editingProduct?.description ?? ""} /></label>
                  <label>Meia CX<input name="codeHalfBox" placeholder="Opcional — Ex.: PROD001-M" defaultValue={editingProduct?.codeHalfBox ?? ""} /></label>
                  <label>Associado<input name="associated" placeholder="Fornecedor ou marca" defaultValue={editingProduct?.associated ?? ""} /></label>
                  <label>Status<select name="status" defaultValue={editingProduct?.status ?? "Ativo"}><option>Ativo</option><option>Inativo</option></select></label>
                </div>
              </section>
              <section className="product-form-section">
                <div className="product-form-section-heading"><div><h3>Unidade e caixa</h3><p>Informe os dados de uma unidade e quantas unidades formam uma caixa.</p></div></div>
                <div className="product-form-grid product-unit-grid">
                  <label><span>Preço de 1 unidade (R$) <i>*</i></span><span className="product-input-prefix"><b>R$</b><input name="unitPrice" required type="number" min="0" step="0.01" placeholder="0,00" value={unitPriceInput} onChange={(event) => setUnitPriceInput(event.target.value)} /></span></label>
                  <label><span>Peso de 1 unidade <i>*</i></span><div className="product-input-suffix"><input name="unitWeight" required type="number" min="0.001" step="0.001" placeholder="0,000" value={unitWeightInput} onChange={(event) => setUnitWeightInput(event.target.value)} /><select name="measure" value={measureInput} onChange={(event) => setMeasureInput(event.target.value as "KG" | "UN")} aria-label="Unidade de medida"><option value="KG">KG</option><option value="UN">UN</option></select></div></label>
                  <label><span>Quantidade por caixa <i>*</i></span><input name="quantityPerBox" required type="number" min="2" step="2" placeholder="Ex.: 8" value={quantityInput} onChange={(event) => setQuantityInput(event.target.value)} /></label>
                  <label>Tipo de peso<select name="weightType" defaultValue={editingProduct?.weightType ?? "Fixo"}><option value="Variável">Variável</option><option value="Fixo">Fixo</option></select></label>
                  <label>Validade<input name="expiration" placeholder="Ex.: 30 dias" defaultValue={editingProduct?.expiration ?? ""} /></label>
                </div>
                <div className="product-calculation-preview">
                  <div><span>Peso calculado da caixa</span><strong>{(previewUnitWeight * previewQuantity).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {measureInput}</strong><small>{previewQuantity || 0} × {previewUnitWeight.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {measureInput}</small></div>
                  <div><span>Preço calculado da caixa</span><strong>R$ {(previewUnitPrice * previewQuantity).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong><small>{previewQuantity || 0} × R$ {previewUnitPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</small></div>
                </div>
              </section>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="modal-footer"><button type="button" className="button button-outline" onClick={() => { setShowForm(false); setEditingProduct(null); setError(""); }}>Cancelar</button><button className="button button-primary" type="submit"><Plus size={15} /> {editingProduct ? "Salvar alterações" : "Cadastrar produto"}</button></div>
            </form>
          </section>
        </div>
      )}
      {pendingDelete && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!deleting && event.target === event.currentTarget) setPendingDelete(null); }}>
        <section className="customer-modal product-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title" aria-describedby="delete-product-description">
          <div className="modal-heading">
            <div><p className="eyebrow">EXCLUIR PRODUTO</p><h2 id="delete-product-title">Confirmar exclusão</h2><p id="delete-product-description">Esta ação remove o produto do catálogo permanentemente.</p></div>
            <button className="icon-button" aria-label="Fechar" disabled={deleting} onClick={() => setPendingDelete(null)}><X size={20} /></button>
          </div>
          <div className="product-delete-body"><strong>{pendingDelete.description}</strong><span>Código caixa: {pendingDelete.codeBox} · Meia caixa: {pendingDelete.codeHalfBox}</span><p>Pedidos já importados mantêm os dados registrados; este produto deixa de estar disponível para novas importações.</p>{error && <p className="form-error" role="alert">{error}</p>}</div>
          <div className="modal-footer product-delete-footer"><button className="button button-outline" disabled={deleting} onClick={() => setPendingDelete(null)}>Cancelar</button><button className="button product-delete-confirm" disabled={deleting} onClick={() => { void confirmDeleteProduct(); }}><Trash2 size={15} /> {deleting ? "Excluindo..." : "Excluir permanentemente"}</button></div>
        </section>
      </div>}
      <SpreadsheetImportModal open={showImport} title="Importar produtos" description="Adicione vários produtos a partir de uma planilha." formatDescription="Arquivos XLSX ou XLS de até 10 MB" formatHint="Descrição, Preço, Cod CX, Meia CX, Medida, Peso Unidade, Peso, Validade e QTD CX." onTemplate={downloadTemplate} onImport={importProducts} onClose={() => setShowImport(false)} />
    </div>
  );
}
