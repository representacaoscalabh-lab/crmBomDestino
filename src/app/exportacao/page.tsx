"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Package, ShoppingCart, UsersRound } from "lucide-react";
import { useCrmStore } from "@/lib/store";
import { downloadXlsx } from "@/lib/xlsx";

export default function ExportPage() {
  const { customers, customerGroups, products, orders } = useCrmStore();
  const [category, setCategory] = useState("Clientes");
  const [exportError, setExportError] = useState("");
  async function exportNetworkSummary() {
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
      { title: "Pedidos e faturamento", description: "Exporta os pedidos registrados com valor e peso.", action: () => downloadXlsx("pedidos-bom-destino.xlsx", "Pedidos", ["Pré-pedido", "Data", "Cliente", "Código cliente", "NF", "Peso (kg)", "Valor (R$)", "Situação"], orders.map((item) => [item.preOrder, item.issueDate, item.customerName, item.customerCode, item.invoice, item.totalWeight, item.totalValue, item.status])) },
    ],
    Produtos: [
      { title: "Produtos", description: "Exporta os dados do catálogo no formato do modelo de importação.", action: () => downloadXlsx("produtos-bom-destino.xlsx", "Produtos", ["Descrição do Produto", "Preço", "Cod CX", "Meia CX", "Medida", "Peso Unidade", "Peso", "Validade", "QTD CX", "Status", "Associado"], products.map((item) => [item.description, item.unitPrice ?? item.pricePerBox / item.quantityPerBox, item.codeBox, item.codeHalfBox, item.measure ?? "KG", item.unitWeight ?? item.weightPerBox / item.quantityPerBox, item.weightType ?? "Fixo", item.expiration ?? "", item.quantityPerBox, item.status, item.associated ?? ""])) },
    ],
  } as const;
  const selected = options[category as keyof typeof options];
  const categories = [{ name: "Clientes", detail: "Cadastros e carteira", icon: UsersRound, count: customers.length }, { name: "Pedidos", detail: "Pedidos e faturamento", icon: ShoppingCart, count: orders.length }, { name: "Produtos", detail: "Catálogo comercial", icon: Package, count: products.length }];
  return <div className="page-content module-content"><section className="panel module-panel export-panel"><div className="module-heading"><span className="module-title-icon"><FileSpreadsheet size={21} /></span><div className="module-title-copy"><p className="eyebrow">DADOS E RELATÓRIOS</p><h1>Central de exportação</h1></div><span className="source-pill">Dados da base atual</span></div><div className="export-category-label">TIPO DE EXPORTAÇÃO</div><div className="export-categories">{categories.map(({ name, detail, icon: Icon, count }) => <button key={name} className={`export-category ${category === name ? "export-category-active" : ""}`} onClick={() => setCategory(name)}><span><Icon size={17} /></span><strong>{name}</strong><small>{detail}</small><i>{count}</i></button>)}</div><div className="export-options"><h2>Exportações de {category.toLowerCase()}</h2>{exportError && <div className="import-feedback feedback-warning" role="alert">{exportError}</div>}<div className="export-card-grid">{selected.map(({ title, description, action }) => <article className="export-card" key={title}><span className="export-card-icon"><Download size={18} /></span><h3>{title}</h3><p>{description}</p><button onClick={() => { setExportError(""); void Promise.resolve(action()).catch((cause: unknown) => { console.error("Falha ao exportar os dados.", cause); setExportError("Não foi possível gerar a planilha. Tente novamente."); }); }}><Download size={15} /> Exportar XLSX</button></article>)}</div></div></section></div>;
}
