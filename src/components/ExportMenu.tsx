import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, FileSpreadsheet, FileDown, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import type { CompanySettings } from "@/contexts/SettingsContext";

export interface ExportConfig {
  filenamePrefix: string;
  sheetName: string;
  pdfTitle: string;
  headers: string[];
  rows: (string | number)[][];
  settings?: CompanySettings | null;
  summaryCards?: { label: string; value: string }[];
  pdfOrientation?: "portrait" | "landscape";
}

export type ExportProgress = (loaded: number, total: number) => void;

interface ExportMenuProps {
  config: ExportConfig;
  disabled?: boolean;
  /** Called when an export format is chosen (lazy-load full data for export).
   *  Receives an `onProgress(loaded, total)` callback to report fetch progress. */
  onOpen?: (onProgress?: ExportProgress) => void | Promise<void>;
}

export function ExportMenu({ config, disabled, onOpen }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number }>({
    loaded: 0,
    total: 0,
  });
  const configRef = useRef(config);
  configRef.current = config;

  const handleToggle = () => {
    setOpen(!open);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const prepareData = async () => {
    if (onOpen) {
      setProgress({ loaded: 0, total: 0 });
      setPreparing(true);
      try {
        await onOpen((loaded, total) => {
          setProgress({ loaded, total });
        });
      } finally {
        setPreparing(false);
      }
    }
  };

  const handleCSV = async () => {
    setOpen(false);
    await prepareData();
    const cfg = configRef.current;
    const { exportToCsv } = await import("@/lib/csv-export");
    exportToCsv({
      filename: cfg.filenamePrefix,
      headers: cfg.headers,
      rows: cfg.rows,
    });
    toast({ title: "تم التصدير", description: "تم التصدير بصيغة CSV" });
  };

  const handleExcel = async () => {
    setOpen(false);
    await prepareData();
    const cfg = configRef.current;
    const { exportToExcel } = await import("@/lib/excel-export");
    await exportToExcel({
      filename: cfg.filenamePrefix,
      sheetName: cfg.sheetName,
      headers: cfg.headers,
      rows: cfg.rows,
    });
    toast({ title: "تم التصدير", description: "تم التصدير بصيغة Excel" });
  };

  const handlePDF = async () => {
    setOpen(false);
    await prepareData();
    const cfg = configRef.current;
    const { exportReportPdf } = await import("@/lib/report-pdf");
    await exportReportPdf({
      title: cfg.pdfTitle,
      settings: cfg.settings || null,
      headers: cfg.headers,
      rows: cfg.rows,
      summaryCards: cfg.summaryCards,
      orientation:
        cfg.pdfOrientation ||
        (cfg.headers.length > 6 ? "landscape" : "portrait"),
      filename: cfg.filenamePrefix,
    });
    toast({ title: "تم التصدير", description: "تم التصدير بصيغة PDF" });
  };

  return (
    <>
      <div className="relative" ref={ref}>
        <Button
          variant="outline"
          className="gap-1.5 shadow-sm"
          onClick={handleToggle}
          disabled={disabled || preparing}
          aria-busy={preparing}
        >
          <Download className="h-4 w-4" />
          تصدير
        </Button>
        {open && !preparing && (
          <div className="absolute end-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg p-1 min-w-[150px]">
            <button
              onClick={handleCSV}
              className="w-full flex items-center gap-2 text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors"
            >
              <FileDown className="h-4 w-4 text-muted-foreground" /> CSV
            </button>
            <button
              onClick={handleExcel}
              className="w-full flex items-center gap-2 text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" /> Excel
            </button>
            <button
              onClick={handlePDF}
              className="w-full flex items-center gap-2 text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors"
            >
              <FileText className="h-4 w-4 text-muted-foreground" /> PDF
            </button>
          </div>
        )}
      </div>

      <Dialog open={preparing}>
        <DialogContent
          className="sm:max-w-md [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              جاري تحضير البيانات للتصدير
            </DialogTitle>
            <DialogDescription className="text-right">
              يتم الآن جلب كافة السجلات المطابقة للفلاتر الحالية. قد يستغرق ذلك بضع ثوانٍ حسب حجم البيانات.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const pct =
              progress.total > 0
                ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
                : 0;
            const determinate = progress.total > 0;
            return (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>
                    {determinate
                      ? `${progress.loaded.toLocaleString("ar-EG")} من ${progress.total.toLocaleString("ar-EG")} سجل`
                      : "جاري حساب الإجمالي..."}
                  </span>
                  <span className="font-medium text-foreground">
                    {determinate ? `${pct}%` : ""}
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  {determinate ? (
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  ) : (
                    <div className="h-full w-1/3 bg-primary rounded-full animate-pulse" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  يرجى عدم إغلاق النافذة...
                </p>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
