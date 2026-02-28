import React, { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Upload, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { readExcelFile, exportToExcel } from "@/lib/excel-export";

interface LookupImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "categories" | "brands";
  onImportComplete: () => void;
}

const CONFIG = {
  categories: {
    table: "product_categories",
    title: "التصنيفات",
    headers: ["الاسم", "الوصف", "التصنيف الأب"],
    templateRows: [["إلكترونيات", "أجهزة إلكترونية", ""], ["هواتف", "هواتف ذكية", "إلكترونيات"]],
    nameKey: "name",
    extraKeys: [{ header: "الوصف", key: "description" }],
    parentSupport: true,
  },
  brands: {
    table: "product_brands",
    title: "الماركات",
    headers: ["الاسم", "بلد المنشأ"],
    templateRows: [["سامسونج", "كوريا الجنوبية"], ["أبل", "الولايات المتحدة"]],
    nameKey: "name",
    extraKeys: [{ header: "بلد المنشأ", key: "country" }],
    parentSupport: false,
  },
};

export function LookupImportDialog({ open, onOpenChange, type, onImportComplete }: LookupImportDialogProps) {
  const config = CONFIG[type];
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ success: number; errors: string[] } | null>(null);

  const downloadTemplate = async () => {
    await exportToExcel({
      filename: `قالب_${config.title}`,
      sheetName: config.title,
      headers: config.headers,
      rows: config.templateRows,
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setResults(null);

    try {
      const { rows } = await readExcelFile(file);
      if (rows.length < 2) {
        toast({ title: "خطأ", description: "الملف فارغ أو لا يحتوي على بيانات", variant: "destructive" });
        setImporting(false);
        return;
      }

      // rows[0] is header (ExcelJS returns 1-indexed, first element is undefined)
      const dataRows = rows.slice(1).filter(r => r && r[1]); // r[1] is name (1-indexed)
      let success = 0;
      const errors: string[] = [];

      if (type === "categories" && config.parentSupport) {
        // First pass: insert categories without parents
        const nameToId: Record<string, string> = {};
        
        // Fetch existing categories
        const { data: existing } = await (supabase.from("product_categories") as any).select("id, name");
        existing?.forEach((c: any) => { nameToId[c.name] = c.id; });

        for (const row of dataRows) {
          const name = String(row[1] || "").trim();
          const description = String(row[2] || "").trim() || null;
          const parentName = String(row[3] || "").trim();

          if (!name) continue;
          if (nameToId[name]) { errors.push(`"${name}" موجود مسبقاً`); continue; }

          const parent_id = parentName ? nameToId[parentName] || null : null;
          if (parentName && !parent_id) {
            // Create parent first
            const { data: parentData, error: parentErr } = await (supabase.from("product_categories") as any)
              .insert({ name: parentName }).select("id").single();
            if (parentErr) { errors.push(`خطأ في إنشاء التصنيف الأب "${parentName}": ${parentErr.message}`); continue; }
            nameToId[parentName] = parentData.id;
          }

          const finalParentId = parentName ? nameToId[parentName] || null : null;
          const { data: inserted, error } = await (supabase.from("product_categories") as any)
            .insert({ name, description, parent_id: finalParentId }).select("id").single();
          if (error) {
            const msg = error.message?.includes("duplicate") ? `"${name}" موجود مسبقاً` : error.message;
            errors.push(msg);
          } else {
            nameToId[name] = inserted.id;
            success++;
          }
        }
      } else {
        // Brands - simple insert
        for (const row of dataRows) {
          const name = String(row[1] || "").trim();
          const country = String(row[2] || "").trim() || null;

          if (!name) continue;
          const { error } = await (supabase.from("product_brands") as any).insert({ name, country });
          if (error) {
            const msg = error.message?.includes("duplicate") ? `"${name}" موجودة مسبقاً` : error.message;
            errors.push(msg);
          } else {
            success++;
          }
        }
      }

      setResults({ success, errors });
      if (success > 0) {
        toast({ title: "تم الاستيراد", description: `تم استيراد ${success} عنصر بنجاح` });
        onImportComplete();
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            استيراد {config.title} من Excel
          </DialogTitle>
          <DialogDescription>قم بتحميل القالب وتعبئته ثم ارفع الملف</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button variant="outline" className="w-full gap-2" onClick={downloadTemplate}>
            <Download className="h-4 w-4" />
            تحميل قالب Excel
          </Button>

          <div className="relative">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={importing}
            />
            <Button variant="secondary" className="w-full gap-2" disabled={importing}>
              {importing ? (
                <><Loader2 className="h-4 w-4 animate-spin" />جارٍ الاستيراد...</>
              ) : (
                <><Upload className="h-4 w-4" />رفع ملف Excel</>
              )}
            </Button>
          </div>

          {results && (
            <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
              {results.success > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  تم استيراد {results.success} عنصر بنجاح
                </div>
              )}
              {results.errors.map((err, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
