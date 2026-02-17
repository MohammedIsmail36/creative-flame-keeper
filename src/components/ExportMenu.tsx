import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, FileSpreadsheet, FileDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { exportToCsv } from "@/lib/csv-export";
import { exportToExcel } from "@/lib/excel-export";
import { exportReportPdf } from "@/lib/report-pdf";
import type { CompanySettings } from "@/contexts/SettingsContext";

interface ExportConfig {
  filenamePrefix: string;
  sheetName: string;
  pdfTitle: string;
  headers: string[];
  rows: (string | number)[][];
  settings?: CompanySettings | null;
  summaryCards?: { label: string; value: string }[];
  pdfOrientation?: "portrait" | "landscape";
}

interface ExportMenuProps {
  config: ExportConfig;
  disabled?: boolean;
}

export function ExportMenu({ config, disabled }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCSV = () => {
    exportToCsv({ filename: config.filenamePrefix, headers: config.headers, rows: config.rows });
    toast({ title: "تم التصدير", description: "تم التصدير بصيغة CSV" });
    setOpen(false);
  };

  const handleExcel = async () => {
    await exportToExcel({ filename: config.filenamePrefix, sheetName: config.sheetName, headers: config.headers, rows: config.rows });
    toast({ title: "تم التصدير", description: "تم التصدير بصيغة Excel" });
    setOpen(false);
  };

  const handlePDF = async () => {
    await exportReportPdf({
      title: config.pdfTitle,
      settings: config.settings || null,
      headers: config.headers,
      rows: config.rows,
      summaryCards: config.summaryCards,
      orientation: config.pdfOrientation || (config.headers.length > 6 ? "landscape" : "portrait"),
      filename: config.filenamePrefix,
    });
    toast({ title: "تم التصدير", description: "تم التصدير بصيغة PDF" });
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setOpen(!open)} disabled={disabled}>
        <Download className="h-4 w-4" />
        تصدير
      </Button>
      {open && (
        <div className="absolute end-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg p-1 min-w-[150px]">
          <button onClick={handleCSV} className="w-full flex items-center gap-2 text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">
            <FileDown className="h-4 w-4 text-muted-foreground" /> CSV
          </button>
          <button onClick={handleExcel} className="w-full flex items-center gap-2 text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" /> Excel
          </button>
          <button onClick={handlePDF} className="w-full flex items-center gap-2 text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">
            <FileText className="h-4 w-4 text-muted-foreground" /> PDF
          </button>
        </div>
      )}
    </div>
  );
}
