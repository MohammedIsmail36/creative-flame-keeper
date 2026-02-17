import { jsPDF } from "jspdf";
import type { CompanySettings } from "@/contexts/SettingsContext";

let fontLoaded = false;
let regularFontBase64 = "";
let boldFontBase64 = "";

async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function loadFonts() {
  if (fontLoaded) return;

  const [regularRes, boldRes] = await Promise.all([
    fetch("/fonts/Amiri-Regular.ttf"),
    fetch("/fonts/Amiri-Bold.ttf"),
  ]);

  const [regularBuf, boldBuf] = await Promise.all([
    regularRes.arrayBuffer(),
    boldRes.arrayBuffer(),
  ]);

  regularFontBase64 = await arrayBufferToBase64(regularBuf);
  boldFontBase64 = await arrayBufferToBase64(boldBuf);
  fontLoaded = true;
}

export async function createArabicPDF(orientation: "portrait" | "landscape" = "portrait"): Promise<jsPDF> {
  await loadFonts();

  const doc = new jsPDF({ orientation });

  doc.addFileToVFS("Amiri-Regular.ttf", regularFontBase64);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");

  doc.addFileToVFS("Amiri-Bold.ttf", boldFontBase64);
  doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");

  doc.setFont("Amiri", "normal");

  return doc;
}

export function getAutoTableArabicStyles() {
  return {
    font: "Amiri",
    halign: "right" as const,
  };
}

/**
 * Add company header to PDF (company name, address, phone, tax number)
 * Returns the Y position after the header for content to start
 */
export function addPdfHeader(doc: jsPDF, settings: CompanySettings | null, title: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const center = pageWidth / 2;
  let y = 12;

  // Company name
  doc.setFont("Amiri", "bold");
  doc.setFontSize(14);
  doc.text(settings?.company_name || "النظام المحاسبي", center, y, { align: "center" });
  y += 6;

  // Business activity
  if (settings?.business_activity) {
    doc.setFont("Amiri", "normal");
    doc.setFontSize(9);
    doc.text(settings.business_activity, center, y, { align: "center" });
    y += 5;
  }

  // Contact info line
  const infoParts: string[] = [];
  if (settings?.phone) infoParts.push(`هاتف: ${settings.phone}`);
  if (settings?.tax_number) infoParts.push(`الرقم الضريبي: ${settings.tax_number}`);
  if (infoParts.length > 0) {
    doc.setFontSize(8);
    doc.text(infoParts.join(" | "), center, y, { align: "center" });
    y += 5;
  }

  // Separator line
  doc.setDrawColor(200, 200, 200);
  doc.line(15, y, pageWidth - 15, y);
  y += 5;

  // Report title
  doc.setFont("Amiri", "bold");
  doc.setFontSize(13);
  doc.text(title, center, y, { align: "center" });
  y += 5;

  // Date and currency
  doc.setFont("Amiri", "normal");
  doc.setFontSize(9);
  doc.text(
    `التاريخ: ${new Date().toLocaleDateString("en-US")} | العملة: ${settings?.default_currency || "EGP"}`,
    center,
    y,
    { align: "center" }
  );
  y += 7;

  return y;
}

/**
 * Add footer to each page of the PDF
 */
export function addPdfFooter(doc: jsPDF, settings: CompanySettings | null) {
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("Amiri", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);

    // Footer text from settings
    if (settings?.invoice_footer) {
      doc.text(settings.invoice_footer, pageWidth / 2, pageHeight - 12, { align: "center" });
    }

    // Page number
    doc.text(`صفحة ${i} من ${pageCount}`, pageWidth / 2, pageHeight - 7, { align: "center" });

    doc.setTextColor(0, 0, 0);
  }
}
