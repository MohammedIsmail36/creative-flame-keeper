import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import {
  generateEntityCode,
  generateProductBarcode,
} from "@/lib/code-generation";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Upload,
  FileSpreadsheet,
  Check,
  AlertTriangle,
  Download,
} from "lucide-react";

interface ImportRow {
  code: string;
  name: string;
  description?: string;
  category?: string;
  unit?: string;
  brand?: string;
  model_number?: string;
  barcode?: string;
  purchase_price?: number;
  selling_price?: number;
  quantity_on_hand?: number;
  min_stock_level?: number;
  status?: "valid" | "error";
  error?: string;
}

export default function ProductImport() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    updated: number;
    failed: number;
    skipped: number;
  } | null>(null);
  const [categories, setCategories] = useState<
    { id: string; name: string; parent_id: string | null }[]
  >([]);
  const [categoryNameMap, setCategoryNameMap] = useState<Map<string, string>>(
    new Map(),
  );
  const [units, setUnits] = useState<Map<string, string>>(new Map());
  const [brands, setBrands] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetchLookups();
  }, []);

  // Build full path map for categories (e.g. "ملابس / قمصان" -> id)
  const buildCategoryPathMap = (
    cats: { id: string; name: string; parent_id: string | null }[],
  ): Map<string, string> => {
    const map = new Map<
      string,
      { id: string; name: string; parent_id: string | null }
    >();
    cats.forEach((c) => map.set(c.id, c));
    const getPath = (id: string): string => {
      const parts: string[] = [];
      let current = map.get(id);
      while (current) {
        parts.unshift(current.name);
        current = current.parent_id ? map.get(current.parent_id) : undefined;
      }
      return parts.join(" / ");
    };
    const pathMap = new Map<string, string>();
    cats.forEach((c) => {
      pathMap.set(getPath(c.id), c.id); // full path match
      // Also allow matching by leaf name only if unique
      if (![...pathMap.values()].includes(c.id) || !pathMap.has(c.name)) {
        pathMap.set(c.name, c.id);
      }
    });
    return pathMap;
  };

  const fetchLookups = async () => {
    const [catRes, unitRes, brandRes] = await Promise.all([
      (supabase.from("product_categories") as any)
        .select("id, name, parent_id")
        .eq("is_active", true),
      (supabase.from("product_units") as any)
        .select("id, name")
        .eq("is_active", true),
      (supabase.from("product_brands") as any)
        .select("id, name")
        .eq("is_active", true),
    ]);
    const cats = catRes.data || [];
    setCategories(cats);
    setCategoryNameMap(buildCategoryPathMap(cats));
    setUnits(new Map((unitRes.data || []).map((u) => [u.name, u.id])));
    setBrands(new Map((brandRes.data || []).map((b) => [b.name, b.id])));
  };

  // Resolve or create hierarchical category path like "ملابس / قمصان"
  const resolveOrCreateCategory = async (
    categoryPath: string,
  ): Promise<string | null> => {
    if (!categoryPath.trim()) return null;
    // Try direct match first (full path or leaf name)
    if (categoryNameMap.has(categoryPath))
      return categoryNameMap.get(categoryPath)!;

    // Split path and create each level
    const parts = categoryPath
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean);
    let parentId: string | null = null;

    for (const part of parts) {
      // Check if this part exists under the current parent
      const existing = categories.find(
        (c) => c.name === part && c.parent_id === parentId,
      );
      if (existing) {
        parentId = existing.id;
      } else {
        const payload: any = { name: part, parent_id: parentId };
        const { data } = await (
          supabase.from("product_categories") as any
        )
          .insert(payload)
          .select("id, name, parent_id")
          .single();
        if (data) {
          categories.push(data);
          categoryNameMap.set(part, data.id);
          parentId = data.id;
        } else {
          return null;
        }
      }
    }
    return parentId;
  };

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xlsx", "xls"].includes(ext)) {
      toast({
        title: "خطأ",
        description: "نوع الملف غير مدعوم. يرجى رفع ملف CSV أو Excel (.xlsx)",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "خطأ",
        description: "حجم الملف يتجاوز الحد الأقصى (5 ميغابايت)",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    const { readExcelFile } = await import("@/lib/excel-export");
    const { rows: rawRows } = await readExcelFile(file);
    // Skip header row (index 0), ExcelJS row.values has index-1 offset
    const json = rawRows.slice(1).map((row) => {
      const headers = rawRows[0].slice(1); // remove undefined at index 0
      const vals = row.slice(1);
      const obj: any = {};
      headers.forEach((h: any, i: number) => {
        obj[String(h)] = vals[i];
      });
      return obj;
    });

    const parsed: ImportRow[] = json.map((row: any) => {
      const code = String(row["الكود"] || row["code"] || "").trim();
      const name = String(row["الاسم"] || row["name"] || "").trim();
      const r: ImportRow = {
        code,
        name,
        description: row["الوصف"] || row["description"] || "",
        category: row["التصنيف"] || row["category"] || "",
        unit: row["الوحدة"] || row["unit"] || "",
        brand: row["الماركة"] || row["brand"] || "",
        model_number: row["رقم الموديل"] || row["model_number"] || "",
        barcode: row["الباركود"] || row["barcode"] || "",
        purchase_price:
          parseFloat(row["سعر الشراء"] || row["purchase_price"]) || 0,
        selling_price:
          parseFloat(row["سعر البيع"] || row["selling_price"]) || 0,
        quantity_on_hand:
          parseFloat(row["الكمية"] || row["quantity_on_hand"]) || 0,
        min_stock_level:
          parseFloat(row["الحد الأدنى"] || row["min_stock_level"]) || 0,
      };
      if (!name) {
        r.status = "error";
        r.error = "الاسم مطلوب";
      } else if (
        r.purchase_price! < 0 ||
        r.selling_price! < 0 ||
        r.quantity_on_hand! < 0 ||
        r.min_stock_level! < 0
      ) {
        r.status = "error";
        r.error = "القيم الرقمية يجب أن تكون 0 أو أكثر";
      } else {
        r.status = "valid";
      }
      return r;
    });

    // Mark duplicate codes within the file
    const codeCounts = new Map<string, number>();
    parsed.forEach((r) => {
      if (r.code) codeCounts.set(r.code, (codeCounts.get(r.code) || 0) + 1);
    });
    parsed.forEach((r) => {
      if (r.status === "valid" && r.code && (codeCounts.get(r.code) || 0) > 1) {
        r.status = "error";
        r.error = "كود مكرر في الملف";
      }
    });

    setRows(parsed);
    setImported(false);
    setImportResult(null);
  };

  const handleImport = async () => {
    const validRows = rows.filter((r) => r.status === "valid");
    if (validRows.length === 0) {
      toast({
        title: "تنبيه",
        description: "لا توجد صفوف صالحة للاستيراد",
        variant: "destructive",
      });
      return;
    }
    setImporting(true);

    // Batch-create missing lookups (deduplicated to avoid race conditions)
    const uniqueCategories = [
      ...new Set(validRows.map((r) => r.category).filter(Boolean)),
    ] as string[];
    for (const cat of uniqueCategories) {
      if (!categoryNameMap.has(cat)) {
        const catId = await resolveOrCreateCategory(cat);
        if (catId) categoryNameMap.set(cat, catId);
      }
    }

    const uniqueUnits = [
      ...new Set(validRows.map((r) => r.unit).filter(Boolean)),
    ] as string[];
    for (const unitName of uniqueUnits) {
      if (!units.has(unitName)) {
        const { data } = await (supabase.from("product_units") as any)
          .insert({ name: unitName })
          .select("id, name")
          .single();
        if (data) units.set(data.name, data.id);
      }
    }

    const uniqueBrands = [
      ...new Set(validRows.map((r) => r.brand).filter(Boolean)),
    ] as string[];
    for (const brandName of uniqueBrands) {
      if (!brands.has(brandName)) {
        const { data } = await (supabase.from("product_brands") as any)
          .insert({ name: brandName })
          .select("id, name")
          .single();
        if (data) brands.set(data.name, data.id);
      }
    }

    // Pre-fetch existing products keyed by (brand_id|model_number) for upsert matching
    const { data: existingProds } = await (supabase.from("products") as any)
      .select("id, code, brand_id, model_number");
    const upsertKey = (brandId: string | null, model: string | null) =>
      `${brandId || ""}::${(model || "").trim().toLowerCase()}`;
    const existingByKey = new Map<string, { id: string; code: string }>();
    (existingProds || []).forEach((p: any) => {
      if (p.brand_id && p.model_number) {
        existingByKey.set(upsertKey(p.brand_id, p.model_number), {
          id: p.id,
          code: p.code,
        });
      }
    });

    // Import products one-by-one to track individual failures
    let successCount = 0;
    let updatedCount = 0;
    let failCount = 0;
    const updatedRows = [...rows];
    const prefix = settings?.product_code_prefix || "PRD-";

    for (const row of validRows) {
      const brandId = (row.brand && brands.get(row.brand)) || null;
      const modelNo = row.model_number?.trim() || null;
      const matchKey = brandId && modelNo ? upsertKey(brandId, modelNo) : null;
      const existing = matchKey ? existingByKey.get(matchKey) : null;

      // Auto-generate code only for new products
      let productCode = row.code;
      if (!productCode && !existing) {
        try {
          productCode = await generateEntityCode("products", prefix);
        } catch {
          productCode = "";
        }
      }

      // Auto-generate barcode only for new products
      let productBarcode: string | null = row.barcode || null;
      if (!productBarcode && !existing) {
        try {
          productBarcode = await generateProductBarcode();
        } catch {
          productBarcode = null;
        }
      }

      const productPayload: any = {
        name: row.name,
        description: row.description || null,
        category_id:
          (row.category && categoryNameMap.get(row.category)) || null,
        unit_id: (row.unit && units.get(row.unit)) || null,
        brand_id: brandId,
        model_number: modelNo,
        purchase_price: row.purchase_price || 0,
        selling_price: row.selling_price || 0,
        min_stock_level: row.min_stock_level || 0,
      };

      const idx = updatedRows.findIndex((r) => r === row);
      let error: any = null;

      if (existing) {
        // UPDATE existing product (preserve code/barcode/quantity)
        const { error: updErr } = await supabase
          .from("products")
          .update(productPayload)
          .eq("id", existing.id);
        error = updErr;
        if (!error) {
          updatedCount++;
          if (idx !== -1) {
            updatedRows[idx] = { ...updatedRows[idx], code: existing.code };
          }
        }
      } else {
        // INSERT new product
        const insertPayload = {
          ...productPayload,
          code: productCode,
          barcode: productBarcode,
          quantity_on_hand: row.quantity_on_hand || 0,
        };
        const { error: insErr } = await supabase
          .from("products")
          .insert(insertPayload);
        error = insErr;
        if (!error) {
          successCount++;
          if (idx !== -1 && !row.code) {
            updatedRows[idx] = { ...updatedRows[idx], code: productCode };
          }
        }
      }

      if (error) {
        failCount++;
        if (idx !== -1) {
          updatedRows[idx] = {
            ...updatedRows[idx],
            status: "error",
            error: error.message,
          };
        }
      }
    }

    setRows(updatedRows);
    const skippedCount = rows.length - validRows.length;
    setImportResult({
      success: successCount,
      updated: updatedCount,
      failed: failCount,
      skipped: skippedCount,
    });

    const totalProcessed = successCount + updatedCount;
    if (failCount === 0 && totalProcessed > 0) {
      const parts: string[] = [];
      if (successCount > 0) parts.push(`أُضيف ${successCount} منتج جديد`);
      if (updatedCount > 0) parts.push(`تم تحديث ${updatedCount} منتج موجود`);
      if (skippedCount > 0) parts.push(`تم تخطي ${skippedCount}`);
      toast({ title: "تم الاستيراد", description: parts.join(" • ") });
      setImported(true);
    } else if (totalProcessed > 0) {
      toast({
        title: "استيراد جزئي",
        description: `جديد ${successCount} • محدّث ${updatedCount} • فشل ${failCount}${skippedCount > 0 ? ` • تخطي ${skippedCount}` : ""}`,
        variant: "destructive",
      });
      setImported(true);
    } else {
      toast({
        title: "فشل الاستيراد",
        description: `فشل استيراد جميع المنتجات (${failCount})`,
        variant: "destructive",
      });
    }
    setImporting(false);
  };

  const downloadTemplate = async () => {
    const { exportToExcel } = await import("@/lib/excel-export");
    const template = [
      {
        الكود: "P001",
        الاسم: "منتج تجريبي",
        الوصف: "",
        التصنيف: "ملابس / قمصان",
        الوحدة: "قطعة",
        الماركة: "",
        "رقم الموديل": "",
        الباركود: "",
        "سعر الشراء": 100,
        "سعر البيع": 150,
        الكمية: 50,
        "الحد الأدنى": 10,
      },
    ];
    await exportToExcel(template, "Products", "products-template.xlsx");
  };

  const validCount = rows.filter((r) => r.status === "valid").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
      <PageHeader
        icon={Upload}
        title="استيراد المنتجات"
        description="رفع ملف Excel أو CSV لإضافة منتجات جديدة"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">رفع ملف Excel أو CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            قم برفع ملف Excel يحتوي على بيانات المنتجات. <strong>الاسم</strong> إلزامي. الكود
            والباركود اختياريان وسيتم إنشاؤهما تلقائياً عند عدم توفرهما.
            <br />
            <strong className="text-foreground">تحديث المنتجات الموجودة:</strong> إذا تطابقت
            <strong> الماركة</strong> و<strong>رقم الموديل</strong> مع منتج موجود، سيتم
            تحديث بياناته بدلاً من إنشاء منتج جديد.
            <br />
            يمكنك كتابة مسار التصنيف الهرمي بالفاصل "/" مثل:{" "}
            <strong>ملابس / قمصان</strong>
          </p>
          <div className="flex gap-3">
            <label className="flex-1">
              <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  اضغط لاختيار ملف Excel أو CSV
                </p>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFile}
              />
            </label>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={downloadTemplate}
          >
            <Download className="h-4 w-4" />
            تحميل قالب Excel
          </Button>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
              {validCount} صالح
            </Badge>
            {errorCount > 0 && (
              <Badge variant="destructive">{errorCount} خطأ</Badge>
            )}
          </div>

          {importResult && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-3">
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <span className="font-medium">نتيجة الاستيراد:</span>
                  {importResult.success > 0 && (
                    <span className="text-green-600">
                      جديد: {importResult.success}
                    </span>
                  )}
                  {importResult.updated > 0 && (
                    <span className="text-blue-600">
                      محدّث: {importResult.updated}
                    </span>
                  )}
                  {importResult.failed > 0 && (
                    <span className="text-destructive">
                      فشل: {importResult.failed}
                    </span>
                  )}
                  {importResult.skipped > 0 && (
                    <span className="text-muted-foreground">
                      تخطي: {importResult.skipped}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-right w-12">#</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">الكود</TableHead>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">التصنيف</TableHead>
                      <TableHead className="text-right">الوحدة</TableHead>
                      <TableHead className="text-right">سعر الشراء</TableHead>
                      <TableHead className="text-right">سعر البيع</TableHead>
                      <TableHead className="text-right">الكمية</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow
                        key={i}
                        className={
                          row.status === "error" ? "bg-destructive/5" : ""
                        }
                      >
                        <TableCell className="text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          {row.status === "valid" ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono">{row.code}</TableCell>
                        <TableCell>
                          {row.name}
                          {row.error && (
                            <p className="text-xs text-destructive">
                              {row.error}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell className="font-mono">
                          {row.purchase_price}
                        </TableCell>
                        <TableCell className="font-mono">
                          {row.selling_price}
                        </TableCell>
                        <TableCell className="font-mono">
                          {row.quantity_on_hand}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setRows([]);
                setImported(false);
                setImportResult(null);
              }}
            >
              مسح
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || imported || validCount === 0}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {importing
                ? "جاري الاستيراد..."
                : imported
                  ? "تم الاستيراد"
                  : `استيراد ${validCount} منتج`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
