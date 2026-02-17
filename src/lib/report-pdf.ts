import autoTable from "jspdf-autotable";
import { createArabicPDF, getAutoTableArabicStyles, addPdfHeader, addPdfFooter } from "@/lib/pdf-arabic";
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
    const cardHeight = 14;

    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, startY, usable, cardHeight, 2, 2, "F");

    summaryCards.forEach((card, i) => {
      const cx = margin + cardWidth * i + cardWidth / 2;
      doc.setFont("Amiri", "normal");
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(card.label, cx, startY + 5, { align: "center" });
      doc.setFont("Amiri", "bold");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text(card.value, cx, startY + 11, { align: "center" });
    });

    startY += cardHeight + 5;
  }

  // Table
  autoTable(doc, {
    startY,
    head: [headers],
    body: rows.map((row) => row.map((cell) => String(cell))),
    styles: { ...styles, fontSize: 8, cellPadding: 2 },
    headStyles: {
      ...styles,
      fillColor: [41, 98, 255],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 15, right: 15 },
  });

  addPdfFooter(doc, settings);
  doc.save(`${filename}.pdf`);
}
