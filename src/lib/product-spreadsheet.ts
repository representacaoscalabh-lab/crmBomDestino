export function parseSpreadsheetNumber(value: string) {
  const match = value.replace(/\s/g, "").match(/[-+]?\d[\d.,]*/);
  if (!match) return NaN;
  const numeric = match[0];
  const comma = numeric.lastIndexOf(",");
  const dot = numeric.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? /\./g : /,/g;
    return Number(numeric.replace(thousandsSeparator, "").replace(decimalSeparator, "."));
  }
  const separator = comma >= 0 ? "," : dot >= 0 ? "." : "";
  if (!separator) return Number(numeric);
  const parts = numeric.split(separator);
  const decimalDigits = parts.at(-1)?.length ?? 0;
  const isThousandsSeparator = decimalDigits === 3 && parts[0] !== "0";
  return Number(isThousandsSeparator ? numeric.replace(/[.,]/g, "") : numeric.replace(separator, "."));
}

export function parseUnitWeight(value: string) {
  const weight = parseSpreadsheetNumber(value);
  if (!Number.isFinite(weight)) return weight;
  const normalized = value.trim().toLowerCase();
  return /(?:^|\d)\s*g(?:r|r(?:ama)?s?)?\s*$/i.test(normalized) && !/kg\s*$/i.test(normalized)
    ? weight / 1000
    : weight;
}
