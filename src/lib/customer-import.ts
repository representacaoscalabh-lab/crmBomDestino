import type { Customer, NewCustomer, PaymentTerm } from "@/lib/types";
import { customerValidation, ImportValidationError, normalizeCnpj, SPREADSHEET_ROW_NUMBER } from "@/lib/import-validation";
import type { SpreadsheetRow } from "@/lib/xlsx";

const cleanHeader = (value: string) => value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const codeHeaders = ["codigo", "codigocliente", "codcliente"];
const nameHeaders = ["cliente", "nome", "razaosocial", "nomecliente"];
const documentHeaders = ["cnpj", "cnpjcpf", "documento"];

export function prepareCustomerImport(rows: SpreadsheetRow[], customers: Customer[], paymentTerms: PaymentTerm[]) {
  if (!rows.length) throw new ImportValidationError("A planilha está vazia ou não contém linhas de clientes.");
  const headers = Object.keys(rows[0]).map(cleanHeader);
  if (!documentHeaders.some((alias) => headers.includes(alias))) throw new ImportValidationError("Coluna CNPJ não encontrada. Apenas o CNPJ é obrigatório para importar; mantenha os cabeçalhos na primeira linha.");
  const existingDocuments = new Map(customers.filter((customer) => customer.document).map((customer) => [normalizeCnpj(customer.document!), customer]));
  const fileDocuments = new Map<string, number>();
  const imports: NewCustomer[] = [];
  const warnings: string[] = [];
  rows.forEach((row, index) => {
    const rowNumber = row[SPREADSHEET_ROW_NUMBER] ?? index + 2;
    const valueAt = (...names: string[]) => {
      const key = Object.keys(row).find((header) => names.includes(cleanHeader(header)));
      return key ? String(row[key] ?? "").trim() : "";
    };
    const customer: NewCustomer = {
      code: valueAt(...codeHeaders), name: valueAt(...nameHeaders), document: valueAt(...documentHeaders),
      store: valueAt("loja", "filial"), city: valueAt("cidade"), status: "Ativo",
      fantasyName: valueAt("nomefantasia"), segment: valueAt("segmento"),
      state: valueAt("uf", "estado").toUpperCase(), phone: valueAt("telefone", "fone"), email: valueAt("email"),
      address: valueAt("endereco", "logradouro"), neighborhood: valueAt("bairro"), representative: valueAt("representante"), lastPurchase: valueAt("ultimacompra"),
    };
    const errors = customerValidation(customer, { cnpjOnly: true });
    const prefix = `Linha ${rowNumber}${customer.name ? ` · ${customer.name}` : ""}`;
    if (errors.length) { warnings.push(`${prefix}: ${errors.join(" ")}`); return; }
    const document = normalizeCnpj(customer.document!);
    const existing = existingDocuments.get(document);
    if (existing) { warnings.push(`${prefix}: CNPJ ${customer.document} já cadastrado em ${existing.name} (código ${existing.code}); linha ignorada.`); return; }
    const previousRow = fileDocuments.get(document);
    if (previousRow !== undefined) { warnings.push(`${prefix}: CNPJ ${customer.document} repetido na planilha, já utilizado na linha ${previousRow}; linha ignorada.`); return; }
    const paymentValue = valueAt("prazodepagamento", "prazopagamento", "condicaodepagamento", "prazo");
    customer.paymentTerm = paymentTerms.find((item) => item.code.toLowerCase() === paymentValue.toLowerCase() || item.term.toLowerCase() === paymentValue.toLowerCase())?.code ?? paymentValue;
    const status = valueAt("status").toLowerCase();
    customer.status = status === "inativo" ? "Inativo" : status === "prospect" ? "Prospect" : "Ativo";
    fileDocuments.set(document, rowNumber);
    imports.push(customer);
  });
  if (!imports.length) throw new ImportValidationError("Nenhum cliente novo e válido para importar. Confira as pendências abaixo.", warnings);
  return { imports, warnings };
}

export function validateCustomerBatch(customers: NewCustomer[], existing: Customer[], editingId?: string, options: { cnpjOnly?: boolean } = {}) {
  const seen = new Map(existing.filter((customer) => customer.id !== editingId && customer.document).map((customer) => [normalizeCnpj(customer.document!), customer.name]));
  const warnings: string[] = [];
  for (const customer of customers) {
    warnings.push(...customerValidation(customer, options).map((message) => `${customer.name || customer.document || "Cliente"}: ${message}`));
    const document = normalizeCnpj(customer.document ?? "");
    if (!document) continue;
    if (seen.has(document)) warnings.push(`CNPJ ${customer.document} já cadastrado para ${seen.get(document)}. Código, nome e loja podem se repetir; o CNPJ deve ser único.`);
    else seen.set(document, customer.name);
  }
  if (warnings.length) throw new ImportValidationError("Não foi possível salvar os clientes. Revise os dados abaixo.", warnings);
}
