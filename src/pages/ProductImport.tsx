import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, Upload, FileSpreadsheet, Check, AlertTriangle, Download } from "lucide-react";

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
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [categories, setCategories] = useState<Map<string, string>>(new Map());
  const [units, setUnits] = useState<Map<string, string>>(new Map());
  const [brands, setBrands] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetchLookups();
  }, []);

  const fetchLookups = async () => {
    const [catRes, unitRes, brandRes] = await Promise.all([
      (supabase.from("product_categories" as any) as any).select("id, name").eq("is_active", true),
      (supabase.from("product_units" as any) as any).select("id, name").eq("is_active", true),
      (supabase.from("product_brands" as any) as any).select("id, name").eq("is_active", true),
    ]);
    setCategories(new Map((catRes.data || []).map(c => [c.name, c.id])));
    setUnits(new Map((unitRes.data || []).map(u => [u.name, u.id])));
    setBrands(new Map((brandRes.data || []).map(b => [b.name, b.id])));
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { readExcelFile } = await import("@/lib/excel-export");
    const { rows: rawRows } = await readExcelFile(file);
    // Skip header row (index 0), ExcelJS row.values has index-1 offset
    const json = rawRows.slice(1).map((row) => {
      const headers = rawRows[0].slice(1); // remove undefined at index 0
      const vals = row.slice(1);
      const obj: any = {};
      headers.forEach((h: any, i: number) => { obj[String(h)] = vals[i]; });
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
        purchase_price: parseFloat(row["سعر الشراء"] || row["purchase_price"]) || 0,
        selling_price: parseFloat(row["سعر البيع"] || row["selling_price"]) || 0,
        quantity_on_hand: parseFloat(row["الكمية"] || row["quantity_on_hand"]) || 0,
        min_stock_level: parseFloat(row["الحد الأدنى"] || row["min_stock_level"]) || 0,
      };
      if (!code || !name) { r.status = "error"; r.error = "الكود والاسم مطلوبان"; }
      else { r.status = "valid"; }
      return r;
    });
    setRows(parsed);
    setImported(false);
  };

  const handleImport = async () => {
    const validRows = rows.filter(r => r.status === "valid");
    if (validRows.length === 0) { toast({ title: "تنبيه", description: "لا توجد صفوف صالحة للاستيراد", variant: "destructive" }); return; }
    setImporting(true);

    // Auto-create missing lookups
    for (const row of validRows) {
      if (row.category && !categories.has(row.category)) {
        const { data } = await (supabase.from("product_categories" as any) as any).insert({ name: row.category }).select("id, name").single();
        if (data) categories.set(data.name, data.id);
      }
      if (row.unit && !units.has(row.unit)) {
        const { data } = await (supabase.from("product_units" as any) as any).insert({ name: row.unit }).select("id, name").single();
        if (data) units.set(data.name, data.id);
      }
      if (row.brand && !brands.has(row.brand)) {
        const { data } = await (supabase.from("product_brands" as any) as any).insert({ name: row.brand }).select("id, name").single();
        if (data) brands.set(data.name, data.id);
      }
    }

    const payload = validRows.map(r => ({
      code: r.code,
      name: r.name,
      description: r.description || null,
      category_id: (r.category && categories.get(r.category)) || null,
      unit_id: (r.unit && units.get(r.unit)) || null,
      brand_id: (r.brand && brands.get(r.brand)) || null,
      model_number: r.model_number || null,
      barcode: r.barcode || null,
      purchase_price: r.purchase_price || 0,
      selling_price: r.selling_price || 0,
      quantity_on_hand: r.quantity_on_hand || 0,
      min_stock_level: r.min_stock_level || 0,
    }));

    const { error } = await supabase.from("products").insert(payload);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الاستيراد", description: `تم استيراد ${validRows.length} منتج بنجاح` });
      setImported(true);
    }
    setImporting(false);
  };

  const downloadTemplate = async () => {
    const { exportToExcel } = await import("@/lib/excel-export");
    const template = [{ "الكود": "P001", "الاسم": "منتج تجريبي", "الوصف": "", "التصنيف": "عام", "الوحدة": "قطعة", "الماركة": "", "رقم الموديل": "", "الباركود": "", "سعر الشراء": 100, "سعر البيع": 150, "الكمية": 50, "الحد الأدنى": 10 }];
    await exportToExcel(template, "Products", "products-template.xlsx");
  };

  const validCount = rows.filter(r => r.status === "valid").length;
  const errorCount = rows.filter(r => r.status === "error").length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">استيراد المنتجات</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">رفع ملف Excel أو CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            قم برفع ملف Excel يحتوي على بيانات المنتجات. يجب أن يحتوي على أعمدة: الكود، الاسم (إلزامي)، بالإضافة إلى الأعمدة الاختيارية.
          </p>
          <div className="flex gap-3">
            <label className="flex-1">
              <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
                <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">اضغط لاختيار ملف Excel أو CSV</p>
              </div>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            </label>
          </div>
          <Button variant="outline" className="gap-2" onClick={downloadTemplate}>
            <Download className="h-4 w-4" />
            تحميل قالب Excel
          </Button>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">{validCount} صالح</Badge>
            {errorCount > 0 && <Badge variant="destructive">{errorCount} خطأ</Badge>}
          </div>

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
                      <TableRow key={i} className={row.status === "error" ? "bg-destructive/5" : ""}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          {row.status === "valid" ? <Check className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                        </TableCell>
                        <TableCell className="font-mono">{row.code}</TableCell>
                        <TableCell>{row.name}{row.error && <p className="text-xs text-destructive">{row.error}</p>}</TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell className="font-mono">{row.purchase_price}</TableCell>
                        <TableCell className="font-mono">{row.selling_price}</TableCell>
                        <TableCell className="font-mono">{row.quantity_on_hand}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setRows([]); setImported(false); }}>مسح</Button>
            <Button onClick={handleImport} disabled={importing || imported || validCount === 0} className="gap-2">
              <Upload className="h-4 w-4" />
              {importing ? "جاري الاستيراد..." : imported ? "تم الاستيراد" : `استيراد ${validCount} منتج`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
