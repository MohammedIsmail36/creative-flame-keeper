import autoTable from "jspdf-autotable";
import { createArabicPDF, getAutoTableArabicStyles, addPdfHeader, addPdfFooter, toRTL } from "@/lib/pdf-arabic";
import type { CompanySettings } from "@/contexts/SettingsContext";

interface ReportPdfOptions {
  title: string;
  settings: CompanySettings | null;
  headers: string[];
  rows: (string | number)[][];
  summaryCards?: { label: string; value: string }[];
  orientation?: "portrait" | "landscape";
  filename: string;
}

export async function exportReportPdf({
  title,
  settings,
  headers,
  rows,
  summaryCards,
  orientation = "portrait",
  filename,
}: ReportPdfOptions) {
  const doc = await createArabicPDF(orientation);
  const styles = getAutoTableArabicStyles();
  let startY = addPdfHeader(doc, settings, title);

  // Summary cards row
  if (summaryCards && summaryCards.length > 0) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const usable = pageWidth - margin * 2;
    const cardWidth = usable / summaryCards.length;
    const cardHeight = 16;

    doc.setFillColor(240, 243, 248);
    doc.roundedRect(margin, startY, usable, cardHeight, 3, 3, "F");

    summaryCards.forEach((card, i) => {
      const cx = margin + cardWidth * i + cardWidth / 2;
      doc.setFont("Amiri", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(card.label, cx, startY + 6, { align: "center" });
      doc.setFont("Amiri", "bold");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(card.value, cx, startY + 13, { align: "center" });
    });

    startY += cardHeight + 6;
  }

  // Reverse columns for RTL display
  const rtl = toRTL(headers, rows);

  // Table
  autoTable(doc, {
    startY,
    head: [rtl.headers],
    body: rtl.rows.map((row) => row.map((cell) => String(cell))),
    styles: { ...styles, fontSize: 9, cellPadding: 3, lineWidth: 0.1, lineColor: [200, 200, 200] },
    headStyles: {
      ...styles,
      fillColor: [30, 80, 200],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: [245, 247, 252] },
    margin: { left: 15, right: 15 },
  });

  addPdfFooter(doc, settings);
  doc.save(`${filename}.pdf`);
}
