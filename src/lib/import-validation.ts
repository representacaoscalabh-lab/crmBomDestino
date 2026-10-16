export const SPREADSHEET_ROW_NUMBER = Symbol("spreadsheetRowNumber");

export class ImportValidationError extends Error {
  constructor(message: string, public readonly warnings: string[] = []) {
    super(message);
    this.name = "ImportValidationError";
  }
}

export function normalizeCnpj(value: string) {
  return value.trim().toUpperCase().replace(/[.\/\-\s]/g, "");
}

export function customerValidation(customer: { code: string; name: string; document?: string }, options: { cnpjOnly?: boolean } = {}) {
  const errors: string[] = [];
  if (!options.cnpjOnly && !customer.name.trim()) errors.push("Informe o nome do cliente.");
  if (!options.cnpjOnly && !customer.code.trim()) errors.push("Informe o código do cliente.");
  if (!customer.document?.trim()) errors.push("Informe o CNPJ do cliente.");
  else if (!/^[A-Z0-9]{14}$/.test(normalizeCnpj(customer.document))) errors.push("CNPJ deve ter 14 caracteres, com ou sem pontuação. Na planilha, formate a coluna como texto para preservar os zeros iniciais.");
  return errors;
}

export function importFailureMessage(cause: unknown, fallback: string) {
  if (cause instanceof ImportValidationError) return cause.message;
  const code = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : "";
  if (code.includes("permission-denied")) return "Seu acesso não permite salvar estes dados. Peça ao administrador para verificar as permissões.";
  if (code.includes("unavailable") || code.includes("network")) return "Não foi possível conectar ao banco de dados. Verifique a conexão e tente novamente.";
  return fallback;
}
