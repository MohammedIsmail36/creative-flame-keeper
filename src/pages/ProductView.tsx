import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatProductDisplay } from "@/lib/product-utils";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Pencil,
  Package,
  Barcode,
  Tag,
  Ruler,
  Factory,
  Hash,
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  FileText,
  BarChart3,
  Images,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export default function ProductView() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [gallery, setGallery] = useState<{ id: string; image_url: string }[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [avgPurchasePrice, setAvgPurchasePrice] = useState<number>(0);
  const [avgSellingPrice, setAvgSellingPrice] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [selectedGalleryIdx, setSelectedGalleryIdx] = useState(0);
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
    const { data: imgs } = await (supabase.from("product_images" as any) as any)
      .select("*")
      .eq("product_id", id!)
      .order("sort_order");
    setGallery(imgs || []);

    // Fetch recent movements
    const { data: mvData } = await supabase
      .from("inventory_movements")
      .select("*")
      .eq("product_id", id!)
      .order("movement_date", { ascending: false })
      .limit(5);
    setMovements(mvData || []);

    // Fetch average prices
    const [{ data: avgPurch }, { data: avgSell }] = await Promise.all([
      supabase.rpc("get_avg_purchase_price", { _product_id: id! }),
      supabase.rpc("get_avg_selling_price", { _product_id: id! }),
    ]);
    setAvgPurchasePrice(Number(avgPurch) || 0);
    setAvgSellingPrice(Number(avgSell) || 0);

    setLoading(false);
  };

  if (loading)
    return (
      <div className="p-12 text-center text-muted-foreground" dir="rtl">
        جاري التحميل...
      </div>
    );
  if (!product) return null;

  const formatCurrency = (val: number) => `${Number(val).toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP`;
  const catName = product.product_categories?.name || product.category || "-";
  const unitSymbol = product.product_units?.symbol || "";
  const unitName = product.product_units?.name || product.unit || "-";
  const brandName = product.product_brands?.name || "-";
  const brandCountry = product.product_brands?.country;
  const margin = product.selling_price - product.purchase_price;
  const marginPct = product.purchase_price > 0 ? ((margin / product.purchase_price) * 100).toFixed(1) : "0";

  const allImages = [...(product.main_image_url ? [product.main_image_url] : []), ...gallery.map((g) => g.image_url)];
  const activeImage = allImages[selectedGalleryIdx] || null;

  const getStockBadge = () => {
    if (product.quantity_on_hand <= 0)
      return (
        <Badge variant="destructive" className="px-4 py-1 rounded-full text-xs font-bold">
          نفذ من المخزون
        </Badge>
      );
    if (product.quantity_on_hand <= product.min_stock_level)
      return (
        <Badge className="bg-warning/10 text-warning border-warning/20 px-4 py-1 rounded-full text-xs font-bold">
          مخزون منخفض
        </Badge>
      );
    return (
      <Badge className="bg-success/10 text-success border-success/20 px-4 py-1 rounded-full text-xs font-bold">
        متوفر
      </Badge>
    );
  };

  const getMovementIcon = (type: string) => {
    if (type === "sale" || type === "sale_return") return <ArrowDown className="h-4 w-4" />;
    if (type === "purchase" || type === "purchase_return") return <ArrowUp className="h-4 w-4" />;
    return <ArrowLeftRight className="h-4 w-4" />;
  };

  const getMovementColor = (type: string) => {
    if (type === "sale") return "bg-accent text-primary";
    if (type === "purchase") return "bg-success/10 text-success";
    if (type === "sale_return") return "bg-success/10 text-success";
    if (type === "purchase_return") return "bg-accent text-primary";
    return "bg-accent text-primary";
  };

  const getMovementLabel = (type: string) => {
    const labels: Record<string, string> = {
      sale: "مبيعات",
      purchase: "مشتريات",
      sale_return: "مرتجع بيع",
      purchase_return: "مرتجع شراء",
      adjustment: "تسوية مخزون",
      opening_balance: "رصيد افتتاحي",
    };
    return labels[type] || type;
  };

  const getMovementQtyDisplay = (mv: any) => {
    if (mv.movement_type === "sale" || mv.movement_type === "purchase_return") {
      return <span className="text-xs font-bold text-destructive">-{mv.quantity} وحدة</span>;
    }
    return <span className="text-xs font-bold text-success">+{mv.quantity} وحدة</span>;
  };

  const specs = [
    { label: "العلامة التجارية", value: `${brandName}${brandCountry ? ` (${brandCountry})` : ""}` },
    { label: "الموديل", value: product.model_number || "-" },
    { label: "الباركود", value: product.barcode || "-" },
    { label: "وحدة القياس", value: `${unitName}${unitSymbol ? ` (${unitSymbol})` : ""}` },
    { label: "كود المنتج", value: product.code },
    { label: "التصنيف", value: catName },
  ];

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto" dir="rtl">
      {/* Hero Section */}
      <section className="bg-card rounded-xl border border-border shadow-sm p-8">
        <div className="flex flex-col md:flex-row-reverse gap-10 items-start">
          {/* Product Info */}
          <div className="flex-1 text-right">
            <div className="flex items-center justify-start gap-3 mb-4">
              <Badge className="bg-accent text-accent-foreground px-3 py-1 rounded-full text-xs font-bold">
                {catName}
              </Badge>
              {getStockBadge()}
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-foreground mb-3 leading-tight">{formatProductDisplay(product.name, brandName, product.model_number)}</h1>
            {product.description && (
              <p className="text-muted-foreground text-base leading-relaxed mb-4 max-w-3xl">{product.description}</p>
            )}
            {canEdit && (
              <div className="flex items-center justify-start gap-3 mb-6">
                <Button onClick={() => navigate(`/products/${id}/edit`)} className="gap-2 font-bold shadow-sm">
                  <Pencil className="h-4 w-4" />
                  تعديل
                </Button>
              </div>
            )}
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "إجمالي المخزون", value: product.quantity_on_hand, suffix: "قطعة", highlight: false },
                {
                  label: "سعر البيع",
                  value: Number(product.selling_price).toLocaleString("en-US"),
                  suffix: "EGP",
                  highlight: true,
                },
                {
                  label: "سعر الشراء",
                  value: Number(product.purchase_price).toLocaleString("en-US"),
                  suffix: "EGP",
                  highlight: false,
                },
                { label: "حد إعادة الطلب", value: product.min_stock_level, suffix: "قطعة", highlight: true },
              ].map((stat) => (
                <div key={stat.label} className="bg-muted/30 rounded-xl p-4 text-center border border-border/50">
                  <p className="text-muted-foreground text-xs font-medium mb-1">{stat.label}</p>
                  <p className={`text-2xl font-bold font-mono ${stat.highlight ? "text-primary" : "text-foreground"}`}>
                    {stat.value} <span className="text-sm font-normal text-muted-foreground">{stat.suffix}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Product Image */}
          <div className="w-full md:w-[300px] shrink-0 relative">
            <div
              className="bg-muted rounded-2xl overflow-hidden aspect-square flex items-center justify-center border border-border cursor-pointer"
              onClick={() => activeImage && setLightboxImg(activeImage)}
            >
              {activeImage ? (
                <img src={activeImage} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <Package className="h-20 w-20 text-muted-foreground/20" />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      {allImages.length > 0 && (
        <section className="bg-card rounded-xl border border-border shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5 border-b border-border/50 pb-4">
            <Images className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-foreground">معرض صور المنتج</h3>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {allImages.map((img, i) => (
              <div
                key={i}
                className={`rounded-lg p-2 aspect-square flex items-center justify-center overflow-hidden cursor-pointer transition-colors ${
                  i === selectedGalleryIdx
                    ? "border-2 border-primary bg-accent/30"
                    : "border border-border bg-muted/30 hover:border-primary"
                }`}
                onClick={() => setSelectedGalleryIdx(i)}
                onDoubleClick={() => setLightboxImg(img)}
              >
                <img
                  src={img}
                  alt={`صورة ${i + 1}`}
                  className={`max-h-full object-contain ${i !== selectedGalleryIdx ? "opacity-70 hover:opacity-100" : ""} transition-opacity`}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tabs */}
      <Tabs defaultValue="specs" className="w-full" dir="rtl">
        <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start gap-8 h-auto p-0">
          <TabsTrigger
            value="specs"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none rounded-none pb-4 bg-transparent gap-2 text-sm font-medium"
          >
            <FileText className="h-4 w-4" />
            المواصفات العامة
          </TabsTrigger>
          <TabsTrigger
            value="movements"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none rounded-none pb-4 bg-transparent gap-2 text-sm font-medium"
          >
            <ArrowLeftRight className="h-4 w-4" />
            حركة المنتج
          </TabsTrigger>
          <TabsTrigger
            value="stats"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none rounded-none pb-4 bg-transparent gap-2 text-sm font-medium"
          >
            <BarChart3 className="h-4 w-4" />
            إحصائيات البيع
          </TabsTrigger>
        </TabsList>

        <TabsContent value="specs" className="mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Specs Card */}
            <div className="lg:col-span-8">
              <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted/30">
                  <h3 className="font-bold text-foreground">المواصفات الفنية</h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-12">
                  {specs.map(({ label, value }) => (
                    <div key={label} className="flex justify-between border-b border-dashed border-border pb-2">
                      <span className="text-muted-foreground text-sm">{label}</span>
                      <span className="font-medium text-foreground text-sm">{value}</span>
                    </div>
                  ))}
                </div>
                {/* Profit Margin */}
                <div className="px-6 pb-6">
                  <div className="mt-2 p-4 rounded-xl bg-primary/5 border border-primary/10 text-center">
                    <span className="text-sm text-muted-foreground">هامش الربح: </span>
                    <strong className="text-primary text-lg font-mono">{formatCurrency(margin)}</strong>
                    <span className="text-sm text-muted-foreground"> ({marginPct}%)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="lg:col-span-4">
              <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted/30">
                  <h3 className="font-bold text-foreground">النشاط الأخير</h3>
                </div>
                <div className="p-6 space-y-5">
                  {movements.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">لا توجد حركات بعد</p>
                  )}
                  {movements.map((mv) => (
                    <div key={mv.id} className="flex gap-4">
                      <div
                        className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center ${getMovementColor(mv.movement_type)}`}
                      >
                        {getMovementIcon(mv.movement_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {getMovementLabel(mv.movement_type)}
                          {mv.notes ? ` - ${mv.notes}` : ""}
                        </p>
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(mv.movement_date).toLocaleDateString("ar-EG")}
                          </span>
                          {getMovementQtyDisplay(mv)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {movements.length > 0 && (
                  <div className="px-6 py-4 bg-muted/30 text-center border-t border-border">
                    <button
                      onClick={() => navigate("/inventory/movements")}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      عرض جميع الحركات
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="movements" className="mt-8">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <h3 className="font-bold text-foreground">سجل حركات المنتج</h3>
            </div>
            <div className="p-6">
              {movements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">لا توجد حركات مسجلة لهذا المنتج</p>
              ) : (
                <div className="space-y-4">
                  {movements.map((mv) => (
                    <div
                      key={mv.id}
                      className="flex items-center gap-4 p-4 rounded-lg bg-muted/20 border border-border/50"
                    >
                      <div
                        className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${getMovementColor(mv.movement_type)}`}
                      >
                        {getMovementIcon(mv.movement_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{getMovementLabel(mv.movement_type)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{mv.notes || "-"}</p>
                      </div>
                      <div className="text-left">
                        {getMovementQtyDisplay(mv)}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(mv.movement_date).toLocaleDateString("ar-EG")}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-mono text-foreground">{formatCurrency(mv.total_cost)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="stats" className="mt-8">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <h3 className="font-bold text-foreground">إحصائيات المبيعات</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    label: "إجمالي المبيعات",
                    value: movements.filter((m) => m.movement_type === "sale").reduce((s, m) => s + m.total_cost, 0),
                    suffix: "EGP",
                    icon: <BarChart3 className="h-5 w-5" />,
                  },
                  {
                    label: "الوحدات المباعة",
                    value: movements.filter((m) => m.movement_type === "sale").reduce((s, m) => s + m.quantity, 0),
                    suffix: "وحدة",
                    icon: <Package className="h-5 w-5" />,
                  },
                  {
                    label: "إجمالي المشتريات",
                    value: movements
                      .filter((m) => m.movement_type === "purchase")
                      .reduce((s, m) => s + m.total_cost, 0),
                    suffix: "EGP",
                    icon: <ArrowUp className="h-5 w-5" />,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-muted/30 p-5 rounded-xl border border-border/50 flex items-center gap-4"
                  >
                    <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center text-primary">
                      {stat.icon}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                      <p className="text-xl font-bold font-mono text-foreground">
                        {typeof stat.value === "number" ? stat.value.toLocaleString("en-US") : stat.value}{" "}
                        <span className="text-sm font-normal text-muted-foreground">{stat.suffix}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Lightbox */}
      <Dialog open={!!lightboxImg} onOpenChange={() => setLightboxImg(null)}>
        <DialogContent className="max-w-3xl p-2 bg-black/90 border-none">
          {lightboxImg && <img src={lightboxImg} alt="Preview" className="w-full h-auto rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
