import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, Save, Plus, ImagePlus, X, Trash2 } from "lucide-react";

interface LookupItem { id: string; name: string; }

export default function ProductForm() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [categories, setCategories] = useState<LookupItem[]>([]);
  const [units, setUnits] = useState<LookupItem[]>([]);
  const [brands, setBrands] = useState<LookupItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  // Quick-add dialogs
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");

  // Form fields
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [barcode, setBarcode] = useState("");
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [quantity, setQuantity] = useState(0);
  const [minStock, setMinStock] = useState(0);
  const [mainImageUrl, setMainImageUrl] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<{ id?: string; image_url: string }[]>([]);
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  useEffect(() => {
    fetchLookups();
    if (isEdit) fetchProduct();
  }, [id]);

  const fetchLookups = async () => {
    const [catRes, unitRes, brandRes] = await Promise.all([
      (supabase.from("product_categories" as any) as any).select("id, name").eq("is_active", true).order("name"),
      (supabase.from("product_units" as any) as any).select("id, name").eq("is_active", true).order("name"),
      (supabase.from("product_brands" as any) as any).select("id, name").eq("is_active", true).order("name"),
    ]);
    setCategories(catRes.data || []);
    setUnits(unitRes.data || []);
    setBrands(brandRes.data || []);
  };

  const fetchProduct = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("products").select("*").eq("id", id!).single();
    if (error || !data) {
      toast({ title: "خطأ", description: "لم يتم العثور على المنتج", variant: "destructive" });
      navigate("/products");
      return;
    }
    setCode(data.code);
    setName(data.name);
    setDescription(data.description || "");
    setCategoryId(data.category_id || "");
    setUnitId(data.unit_id || "");
    setBrandId(data.brand_id || "");
    setModelNumber(data.model_number || "");
    setBarcode(data.barcode || "");
    setPurchasePrice(data.purchase_price);
    setSellingPrice(data.selling_price);
    setQuantity(data.quantity_on_hand);
    setMinStock(data.min_stock_level);
    setMainImageUrl(data.main_image_url || null);

    // Fetch gallery
    const { data: imgs } = await (supabase.from("product_images" as any) as any).select("*").eq("product_id", id!).order("sort_order");
    setGalleryImages((imgs || []).map((i: any) => ({ id: i.id, image_url: i.image_url })));
    setLoading(false);
  };

  const uploadImage = async (file: File, path: string): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const filePath = `${path}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(filePath, file);
    if (error) { toast({ title: "خطأ", description: "فشل رفع الصورة", variant: "destructive" }); return null; }
    const { data } = supabase.storage.from("product-images").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleMainImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMain(true);
    const url = await uploadImage(file, "main");
    if (url) setMainImageUrl(url);
    setUploadingMain(false);
  };

  const handleGalleryImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploadingGallery(true);
    const newImages: { image_url: string }[] = [];
    for (const file of Array.from(files)) {
      const url = await uploadImage(file, "gallery");
      if (url) newImages.push({ image_url: url });
    }
    setGalleryImages(prev => [...prev, ...newImages]);
    setUploadingGallery(false);
  };

  const removeGalleryImage = (index: number) => {
    setGalleryImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) {
      toast({ title: "تنبيه", description: "يرجى إدخال كود واسم المنتج", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      code: code.trim(),
      name: name.trim(),
      description: description.trim() || null,
      category_id: categoryId || null,
      unit_id: unitId || null,
      brand_id: brandId || null,
      model_number: modelNumber.trim() || null,
      barcode: barcode.trim() || null,
      purchase_price: purchasePrice,
      selling_price: sellingPrice,
      quantity_on_hand: quantity,
      min_stock_level: minStock,
      main_image_url: mainImageUrl,
    };

    try {
      let productId = id;
      if (isEdit) {
        const { error } = await supabase.from("products").update(payload as any).eq("id", id!);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(payload as any).select("id").single();
        if (error) throw error;
        productId = data.id;
      }

      // Save gallery images
      if (productId) {
        // Delete old gallery images if editing
        if (isEdit) {
          await (supabase.from("product_images" as any) as any).delete().eq("product_id", productId);
        }
        if (galleryImages.length > 0) {
          const rows = galleryImages.map((img, i) => ({
            product_id: productId!,
            image_url: img.image_url,
            sort_order: i,
          }));
          await (supabase.from("product_images" as any) as any).insert(rows);
        }
      }

      toast({ title: isEdit ? "تم التحديث" : "تمت الإضافة", description: isEdit ? "تم تعديل المنتج بنجاح" : "تم إضافة المنتج بنجاح" });
      navigate("/products");
    } catch (error: any) {
      const msg = error.message?.includes("duplicate") ? (error.message.includes("barcode") ? "الباركود موجود مسبقاً" : "كود المنتج موجود مسبقاً") : error.message;
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleQuickAdd = async (table: string, setter: React.Dispatch<React.SetStateAction<LookupItem[]>>, setSelected: (id: string) => void) => {
    if (!newItemName.trim()) return;
    const { data, error } = await (supabase.from(table as any) as any).insert({ name: newItemName.trim() }).select("id, name").single();
    if (error) {
      toast({ title: "خطأ", description: error.message.includes("duplicate") ? "الاسم موجود مسبقاً" : error.message, variant: "destructive" });
      return;
    }
    const item = data as LookupItem;
    setter(prev => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
    setSelected(item.id);
    setNewItemName("");
    setAddCategoryOpen(false);
    setAddUnitOpen(false);
    setAddBrandOpen(false);
  };

  if (loading) return <div className="p-12 text-center text-muted-foreground" dir="rtl">جاري التحميل...</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">{isEdit ? "تعديل منتج" : "إضافة منتج جديد"}</h1>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader><CardTitle className="text-base">المعلومات الأساسية</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>كود المنتج *</Label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="P001" className="font-mono" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>اسم المنتج *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="اسم المنتج" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>الوصف</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف المنتج (اختياري)" rows={2} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>الباركود</Label>
              <Input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="رقم الباركود" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>رقم موديل المصنع</Label>
              <Input value={modelNumber} onChange={e => setModelNumber(e.target.value)} placeholder="رقم الموديل" className="font-mono" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Classification */}
      <Card>
        <CardHeader><CardTitle className="text-base">التصنيف</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>التصنيف</Label>
              <div className="flex gap-2">
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => { setNewItemName(""); setAddCategoryOpen(true); }}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>وحدة القياس</Label>
              <div className="flex gap-2">
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
                  <SelectContent>
                    {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => { setNewItemName(""); setAddUnitOpen(true); }}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>الماركة / المصنع</Label>
              <div className="flex gap-2">
                <Select value={brandId} onValueChange={setBrandId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="اختر الماركة" /></SelectTrigger>
                  <SelectContent>
                    {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => { setNewItemName(""); setAddBrandOpen(true); }}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing & Stock */}
      <Card>
        <CardHeader><CardTitle className="text-base">الأسعار والمخزون</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>سعر الشراء</Label>
              <Input type="number" min="0" step="0.01" value={purchasePrice || ""} onChange={e => setPurchasePrice(parseFloat(e.target.value) || 0)} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>سعر البيع</Label>
              <Input type="number" min="0" step="0.01" value={sellingPrice || ""} onChange={e => setSellingPrice(parseFloat(e.target.value) || 0)} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>الكمية المتاحة</Label>
              <Input type="number" min="0" value={quantity || ""} onChange={e => setQuantity(parseFloat(e.target.value) || 0)} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>الحد الأدنى</Label>
              <Input type="number" min="0" value={minStock || ""} onChange={e => setMinStock(parseFloat(e.target.value) || 0)} className="font-mono" />
            </div>
          </div>
          {sellingPrice > 0 && purchasePrice > 0 && (
            <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
              هامش الربح: <strong className="text-foreground">{(sellingPrice - purchasePrice).toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP</strong>
              {" "}({((sellingPrice - purchasePrice) / purchasePrice * 100).toFixed(1)}%)
            </div>
          )}
        </CardContent>
      </Card>

      {/* Images */}
      <Card>
        <CardHeader><CardTitle className="text-base">الصور</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Main Image */}
          <div className="space-y-2">
            <Label>الصورة الرئيسية</Label>
            <div className="flex items-start gap-4">
              {mainImageUrl ? (
                <div className="relative">
                  <img src={mainImageUrl} alt="Main" className="h-32 w-32 rounded-lg object-cover border" />
                  <Button variant="destructive" size="icon" className="absolute -top-2 -left-2 h-6 w-6" onClick={() => setMainImageUrl(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <label className="h-32 w-32 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground mt-1">{uploadingMain ? "جاري الرفع..." : "رفع صورة"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleMainImage} disabled={uploadingMain} />
                </label>
              )}
            </div>
          </div>

          {/* Gallery */}
          <div className="space-y-2">
            <Label>معرض الصور</Label>
            <div className="flex flex-wrap gap-3">
              {galleryImages.map((img, i) => (
                <div key={i} className="relative">
                  <img src={img.image_url} alt={`Gallery ${i}`} className="h-24 w-24 rounded-lg object-cover border" />
                  <Button variant="destructive" size="icon" className="absolute -top-2 -left-2 h-6 w-6" onClick={() => removeGalleryImage(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <label className="h-24 w-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground mt-1">{uploadingGallery ? "جاري..." : "إضافة"}</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryImages} disabled={uploadingGallery} />
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3 pb-6">
        <Button variant="outline" onClick={() => navigate("/products")}>إلغاء</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "جاري الحفظ..." : isEdit ? "تحديث" : "إضافة"}
        </Button>
      </div>

      {/* Quick-add dialogs */}
      {[
        { open: addCategoryOpen, setOpen: setAddCategoryOpen, title: "إضافة تصنيف جديد", table: "product_categories", setter: setCategories, setSelected: setCategoryId },
        { open: addUnitOpen, setOpen: setAddUnitOpen, title: "إضافة وحدة قياس جديدة", table: "product_units", setter: setUnits, setSelected: setUnitId },
        { open: addBrandOpen, setOpen: setAddBrandOpen, title: "إضافة ماركة جديدة", table: "product_brands", setter: setBrands, setSelected: setBrandId },
      ].map(({ open, setOpen, title, table, setter, setSelected }) => (
        <Dialog key={table} open={open} onOpenChange={setOpen}>
          <DialogContent dir="rtl" className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>أدخل الاسم ثم اضغط إضافة</DialogDescription>
            </DialogHeader>
            <Input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="الاسم" onKeyDown={e => e.key === "Enter" && handleQuickAdd(table, setter, setSelected)} />
            <DialogFooter className="flex-row-reverse gap-2">
              <Button onClick={() => handleQuickAdd(table, setter, setSelected)}>إضافة</Button>
              <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
