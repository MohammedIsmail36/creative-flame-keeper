import ExcelJS from "exceljs";

interface ExportOptions {
  filename: string;
  sheetName: string;
  headers: string[];
  rows: any[][];
}

/**
 * Export data as an Excel file using ExcelJS (secure alternative to xlsx/SheetJS)
 * Supports two signatures:
 *   exportToExcel(options: ExportOptions)
 *   exportToExcel(data: Record[], sheetName, fileName) — legacy
 */
export async function exportToExcel(
  dataOrOptions: Record<string, any>[] | ExportOptions,
  sheetName?: string,
  fileName?: string
) {
  const workbook = new ExcelJS.Workbook();

  if (Array.isArray(dataOrOptions)) {
    // Legacy signature
    const data = dataOrOptions;
    const worksheet = workbook.addWorksheet(sheetName || "Sheet1");
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      cell.border = { bottom: { style: "thin" } };
    });
    data.forEach((row) => worksheet.addRow(Object.values(row)));
    fileName = fileName || "export.xlsx";
  } else {
    // New options signature
    const opts = dataOrOptions;
    const worksheet = workbook.addWorksheet(opts.sheetName);
    const headerRow = worksheet.addRow(opts.headers);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      cell.border = { bottom: { style: "thin" } };
    });
    opts.rows.forEach((row) => worksheet.addRow(row));
    fileName = opts.filename + ".xlsx";
  }

  // Auto-fit column widths
  workbook.worksheets[0].columns.forEach((column) => {
    let maxLength = 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const cellLength = cell.value ? String(cell.value).length : 0;
      if (cellLength > maxLength) maxLength = cellLength;
    });
    column.width = Math.min(maxLength + 2, 40);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName!;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Read an Excel file and return rows as arrays (for import functionality)
 */
export async function readExcelFile(file: File): Promise<{ sheetNames: string[]; rows: any[][] }> {
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  const sheetNames = workbook.worksheets.map((ws) => ws.name);
  const rows: any[][] = [];

  sheet.eachRow((row) => {
    rows.push(row.values as any[]);
  });

  return { sheetNames, rows };
}
