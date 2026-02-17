import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, Pencil, Package, Barcode, Tag, Ruler, Factory, Hash, DollarSign } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export default function ProductView() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [gallery, setGallery] = useState<{ id: string; image_url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const canEdit = role === "admin" || role === "accountant";

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const fetchProduct = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*, product_categories(name), product_units(name, symbol), product_brands(name, country)" as any)
      .eq("id", id!)
      .single();
    if (error || !data) {
      toast({ title: "خطأ", description: "لم يتم العثور على المنتج", variant: "destructive" });
      navigate("/products");
      return;
    }
    setProduct(data);
    const { data: imgs } = await (supabase.from("product_images" as any) as any).select("*").eq("product_id", id!).order("sort_order");
    setGallery(imgs || []);
    setLoading(false);
  };

  if (loading) return <div className="p-12 text-center text-muted-foreground" dir="rtl">جاري التحميل...</div>;
  if (!product) return null;

  const formatCurrency = (val: number) => `${Number(val).toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP`;
  const catName = product.product_categories?.name || product.category || "-";
  const unitName = product.product_units?.name || product.unit || "-";
  const brandName = product.product_brands?.name || "-";
  const brandCountry = product.product_brands?.country;
  const margin = product.selling_price - product.purchase_price;
  const marginPct = product.purchase_price > 0 ? ((margin / product.purchase_price) * 100).toFixed(1) : "0";

  const getStockBadge = () => {
    if (product.quantity_on_hand <= 0) return <Badge variant="destructive">نفذ من المخزون</Badge>;
    if (product.quantity_on_hand <= product.min_stock_level) return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">مخزون منخفض</Badge>;
    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">متوفر</Badge>;
  };

  const allImages = [
    ...(product.main_image_url ? [product.main_image_url] : []),
    ...gallery.map(g => g.image_url),
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{product.name}</h1>
            <p className="text-sm text-muted-foreground font-mono">{product.code}</p>
          </div>
        </div>
        {canEdit && (
          <Button variant="outline" className="gap-2" onClick={() => navigate(`/products/${id}/edit`)}>
            <Pencil className="h-4 w-4" />
            تعديل
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Images */}
        <div className="lg:col-span-1 space-y-3">
          {product.main_image_url ? (
            <img
              src={product.main_image_url}
              alt={product.name}
              className="w-full aspect-square rounded-xl object-cover border cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setLightboxImg(product.main_image_url)}
            />
          ) : (
            <div className="w-full aspect-square rounded-xl bg-muted flex items-center justify-center border">
              <Package className="h-16 w-16 text-muted-foreground/30" />
            </div>
          )}
          {gallery.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {gallery.map((img, i) => (
                <img
                  key={img.id}
                  src={img.image_url}
                  alt={`Gallery ${i}`}
                  className="h-16 w-16 rounded-lg object-cover border cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setLightboxImg(img.image_url)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">تفاصيل المنتج</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "الباركود", value: product.barcode || "-", icon: Barcode },
                  { label: "رقم الموديل", value: product.model_number || "-", icon: Hash },
                  { label: "التصنيف", value: catName, icon: Tag },
                  { label: "وحدة القياس", value: unitName, icon: Ruler },
                  { label: "الماركة", value: `${brandName}${brandCountry ? ` (${brandCountry})` : ""}`, icon: Factory },
                  { label: "الحالة", value: getStockBadge(), icon: Package },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <div className="font-medium text-sm">{value}</div>
                    </div>
                  </div>
                ))}
              </div>
              {product.description && (
                <div className="mt-4 p-3 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">الوصف</p>
                  <p className="text-sm">{product.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> الأسعار والمخزون</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "سعر الشراء", value: formatCurrency(product.purchase_price) },
                  { label: "سعر البيع", value: formatCurrency(product.selling_price) },
                  { label: "الكمية المتاحة", value: product.quantity_on_hand },
                  { label: "الحد الأدنى", value: product.min_stock_level },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-bold font-mono text-lg">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-3 rounded-lg bg-primary/5 text-center">
                <span className="text-sm text-muted-foreground">هامش الربح: </span>
                <strong className="text-primary">{formatCurrency(margin)}</strong>
                <span className="text-sm text-muted-foreground"> ({marginPct}%)</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Lightbox */}
      <Dialog open={!!lightboxImg} onOpenChange={() => setLightboxImg(null)}>
        <DialogContent className="max-w-3xl p-2 bg-black/90 border-none">
          {lightboxImg && <img src={lightboxImg} alt="Preview" className="w-full h-auto rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
