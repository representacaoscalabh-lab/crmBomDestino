// Regenerate the JSON catalog from the CRM's canonical TypeScript types.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const file = ts.createSourceFile("types.ts", fs.readFileSync(path.join(root, "src/lib/types.ts"), "utf8"), ts.ScriptTarget.Latest, true);
const aliases = new Map(file.statements.filter(ts.isTypeAliasDeclaration).map(node => [node.name.text, node]));
function fields(type) {
  return aliases.get(type).type.members.filter(ts.isPropertySignature).map(member => ({
    name: member.name.getText(file), type: member.type.getText(file), optional: !!member.questionToken,
    ...(member.jsDoc?.length ? { description: member.jsDoc.map(doc => doc.comment || "").join(" ") } : {}),
  }));
}
const collections = [
  ["customers", "Clientes", "Customer"], ["customer_groups", "Redes de clientes e comissões", "CustomerGroup"],
  ["products", "Produtos", "Product"], ["orders", "Pedidos e seus itens", "Order"],
  ["bonifications", "Bonificações e seus itens", "Bonification"], ["goals", "Metas comerciais", "Goal"],
  ["payment_terms", "Condições de pagamento", "PaymentTerm"],
].map(([name, description, type]) => ({ name, description, access: "approved", fields: [...fields(type),
  ...["createdAt", "updatedAt"].map(name => ({ name, type: "Timestamp", optional: true })),
  ...(type === "Customer" ? [{ name: "documentNormalized", type: "string", optional: true }] : []),
  ...(type === "Order" || type === "Bonification" ? [{ name: "itemCount", type: "number", optional: true }] : []),
], ...(type === "Order" || type === "Bonification" ? { itemFields: fields("OrderItem") } : {}) }));
const makeFields = definition => Object.entries(definition).map(([name, type]) => ({ name, type, optional: false }));
for (const [name, description, access, definition] of [
  ["users", "Usuários e autorizações", "admin", { uid: "string", email: "string", name: "string", status: '"pending" | "approved" | "rejected"', role: '"user" | "admin"', createdAt: "Timestamp", updatedAt: "Timestamp" }],
  ["access_requests", "Solicitações de acesso", "admin", { uid: "string", email: "string", name: "string", status: '"pending" | "approved" | "rejected"', requestedAt: "Timestamp", resolvedAt: "Timestamp?", resolvedBy: "string?" }],
  ["sellers", "Responsáveis legados; a aplicação usa responsáveis fixos", "approved", { name: "string", createdAt: "Timestamp" }],
  ["customer_documents", "Reservas de CNPJ; ID é o documento normalizado", "approved", { customerId: "string" }],
  ["aggregate_states", "Controle interno de idempotência das agregações; sem endpoint de dados", "internal", { hash: "string", projection: "{ resource, date, customerId, count, valueCents, weight, products }" }],
  ["settings", "Configurações mart_minas, oesa_nova_safra e read_optimization", "approved", { groupId: "string? (relatórios)", reportName: "string? (relatórios)", updatedAt: "Timestamp?", customerMigration: "boolean? (read_optimization)", customerReservations: "boolean? (read_optimization)" }],
  ...["daily_orders", "daily_bonifications"].map(name => [name, "Resumo diário gerado pelas funções; pode não estar ativado", "approved", { date: "string (YYYY-MM-DD)", customerId: "string", count: "number", valueCents: "number", weight: "number", products: "Record<string, { productId: string; productCode: string; description: string; weight: number; valueCents: number; units: number }>" }]),
]) collections.push({ name, description, access, fields: makeFields(definition) });
fs.mkdirSync(path.join(root, "src/cfg"), { recursive: true });
fs.writeFileSync(path.join(root, "src/cfg/api-collections.json"), JSON.stringify(collections, null, 2) + "\n");
