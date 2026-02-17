import { jsPDF } from "jspdf";

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
