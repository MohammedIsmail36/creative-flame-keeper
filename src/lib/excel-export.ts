import ExcelJS from "exceljs";

/**
 * Export data as an Excel file using ExcelJS (secure alternative to xlsx/SheetJS)
 */
export async function exportToExcel(
  data: Record<string, any>[],
  sheetName: string,
  fileName: string
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  if (data.length === 0) return;

  // Add headers
  const headers = Object.keys(data[0]);
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };
    cell.border = {
      bottom: { style: "thin" },
    };
  });

  // Add data rows
  data.forEach((row) => {
    worksheet.addRow(Object.values(row));
  });

  // Auto-fit column widths (approximate)
  worksheet.columns.forEach((column) => {
    let maxLength = 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const cellLength = cell.value ? String(cell.value).length : 0;
      if (cellLength > maxLength) maxLength = cellLength;
    });
    column.width = Math.min(maxLength + 2, 40);
  });

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
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
