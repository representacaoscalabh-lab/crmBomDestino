import * as XLS from "@e965/xlsx";
import ExcelJS from "exceljs";

export type SpreadsheetRow = Record<string, unknown>;

export const MAX_SPREADSHEET_SIZE = 10 * 1024 * 1024;

export async function readSpreadsheetRows(file: File): Promise<SpreadsheetRow[]> {
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    throw new Error("Selecione uma planilha .xlsx ou .xls.");
  }
  if (file.size > MAX_SPREADSHEET_SIZE) {
    throw new Error("O arquivo excede o limite de 10 MB.");
  }
  const workbook = XLS.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const matrix = XLS.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
  const [headerRow, ...dataRows] = matrix;
  const headers = (headerRow ?? []).map((header) => String(header ?? "").trim());
  return dataRows
    .filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

export async function downloadXlsx(
  filename: string,
  sheetName: string,
  headings: string[],
  rows: (string | number)[][],
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  const header = sheet.addRow(headings);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF722F37" } };
  rows.forEach((row) => sheet.addRow(row));
  sheet.columns = headings.map((heading) => ({ width: Math.max(15, heading.length + 4) }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadXlsxTemplate(
  filename: string,
  sheetName: string,
  headings: string[],
  example: (string | number)[],
) {
  return downloadXlsx(filename, sheetName, headings, [example]);
}
