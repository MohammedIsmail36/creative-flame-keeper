// import React, { useState, useEffect } from "react";
// import { PageSkeleton } from "@/components/PageSkeleton";
// import { supabase } from "@/integrations/supabase/client";
// import { useAuth } from "@/contexts/AuthContext";
// import { formatProductDisplay } from "@/lib/product-utils";
// import { useNavigate, useParams } from "react-router-dom";
// import {
//   MOVEMENT_TYPE_LABELS_DETAIL,
//   MOVEMENT_TYPE_COLORS,
// } from "@/lib/constants";
// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";
// import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
// import { toast } from "@/hooks/use-toast";
// import {
//   Pencil,
//   Package,
//   Barcode,
//   Tag,
//   Ruler,
//   Factory,
//   Hash,
//   ArrowDown,
//   ArrowUp,
//   ArrowLeftRight,
//   FileText,
//   BarChart3,
//   Images,
// } from "lucide-react";
// import { Dialog, DialogContent } from "@/components/ui/dialog";

// export default function ProductView() {
//   const { role } = useAuth();
//   const navigate = useNavigate();
//   const { id } = useParams();
//   const [product, setProduct] = useState<any>(null);
//   const [gallery, setGallery] = useState<{ id: string; image_url: string }[]>(
//     [],
//   );
//   const [movements, setMovements] = useState<any[]>([]);
//   const [avgPurchasePrice, setAvgPurchasePrice] = useState<number>(0);
//   const [avgSellingPrice, setAvgSellingPrice] = useState<number>(0);
//   const [totalSalesRevenue, setTotalSalesRevenue] = useState<number>(0);
//   const [totalUnitsSold, setTotalUnitsSold] = useState<number>(0);
//   const [loading, setLoading] = useState(true);
//   const [lightboxImg, setLightboxImg] = useState<string | null>(null);
//   const [selectedGalleryIdx, setSelectedGalleryIdx] = useState(0);
//   const canEdit = role === "admin" || role === "accountant";

//   useEffect(() => {
//     fetchProduct();
//   }, [id]);

//   const fetchProduct = async () => {
//     setLoading(true);
//     const { data, error } = await supabase
//       .from("products")
//       .select(
//         "*, product_categories(name), product_units(name, symbol), product_brands(name, country)" as any,
//       )
//       .eq("id", id!)
//       .single();
//     if (error || !data) {
//       toast({
//         title: "خطأ",
//         description: "لم يتم العثور على المنتج",
//         variant: "destructive",
//       });
//       navigate("/products");
//       return;
//     }
//     setProduct(data);
//     const { data: imgs } = await (supabase.from("product_images") as any)
//       .select("*")
//       .eq("product_id", id!)
//       .order("sort_order");
//     setGallery(imgs || []);

//     // Fetch recent movements
//     const { data: mvData } = await supabase
//       .from("inventory_movements")
//       .select("*")
//       .eq("product_id", id!)
//       .order("movement_date", { ascending: false })
//       .limit(5);
//     setMovements(mvData || []);

//     // Fetch average prices and sales stats
//     const [{ data: avgPurch }, { data: avgSell }, { data: salesItems }] =
//       await Promise.all([
//         supabase.rpc("get_avg_purchase_price", { _product_id: id! }),
//         supabase.rpc("get_avg_selling_price", { _product_id: id! }),
//         (supabase.from("sales_invoice_items") as any)
//           .select("quantity, total, invoice_id, sales_invoices!inner(status)")
//           .eq("product_id", id!)
//           .eq("sales_invoices.status", "posted"),
//       ]);
//     setAvgPurchasePrice(Number(avgPurch) || 0);
//     setAvgSellingPrice(Number(avgSell) || 0);
//     const salesItemsArr = salesItems || [];
//     setTotalSalesRevenue(
//       salesItemsArr.reduce((s: number, i: any) => s + Number(i.total), 0),
//     );
//     setTotalUnitsSold(
//       salesItemsArr.reduce((s: number, i: any) => s + Number(i.quantity), 0),
//     );

//     setLoading(false);
//   };

//   if (loading) return <PageSkeleton variant="cards" />;
//   if (!product) return null;

//   const formatCurrency = (val: number) =>
//     `${Number(val).toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP`;
//   const catName = product.product_categories?.name || product.category || "-";
//   const unitSymbol = product.product_units?.symbol || "";
//   const unitName = product.product_units?.name || product.unit || "-";
//   const brandName = product.product_brands?.name || "-";
//   const brandCountry = product.product_brands?.country;
//   const margin = product.selling_price - product.purchase_price;
//   const marginPct =
//     product.purchase_price > 0
//       ? ((margin / product.purchase_price) * 100).toFixed(1)
//       : "0";

//   const allImages = [
//     ...(product.main_image_url ? [product.main_image_url] : []),
//     ...gallery.map((g) => g.image_url),
//   ];
//   const activeImage = allImages[selectedGalleryIdx] || null;

//   const getStockBadge = () => {
//     if (product.quantity_on_hand <= 0)
//       return (
//         <Badge
//           variant="destructive"
//           className="px-4 py-1 rounded-full text-xs font-bold"
//         >
//           نفذ من المخزون
//         </Badge>
//       );
//     if (product.quantity_on_hand <= product.min_stock_level)
//       return (
//         <Badge className="bg-warning/10 text-warning border-warning/20 px-4 py-1 rounded-full text-xs font-bold">
//           مخزون منخفض
//         </Badge>
//       );
//     return (
//       <Badge className="bg-success/10 text-success border-success/20 px-4 py-1 rounded-full text-xs font-bold">
//         متوفر
//       </Badge>
//     );
//   };

//   const getMovementIcon = (type: string) => {
//     if (type === "sale" || type === "sale_return")
//       return <ArrowDown className="h-4 w-4" />;
//     if (type === "purchase" || type === "purchase_return")
//       return <ArrowUp className="h-4 w-4" />;
//     return <ArrowLeftRight className="h-4 w-4" />;
//   };

//   const getMovementColor = (type: string) => {
//     return MOVEMENT_TYPE_COLORS[type] || "bg-muted text-muted-foreground";
//   };

//   const getMovementLabel = (type: string) => {
//     return MOVEMENT_TYPE_LABELS_DETAIL[type] || type;
//   };

//   const getMovementQtyDisplay = (mv: any) => {
//     if (mv.movement_type === "sale" || mv.movement_type === "purchase_return") {
//       return (
//         <span className="text-xs font-bold text-destructive">
//           -{mv.quantity} وحدة
//         </span>
//       );
//     }
//     return (
//       <span className="text-xs font-bold text-success">
//         +{mv.quantity} وحدة
//       </span>
//     );
//   };

//   const specs = [
//     {
//       label: "العلامة التجارية",
//       value: `${brandName}${brandCountry ? ` (${brandCountry})` : ""}`,
//     },
//     { label: "الموديل", value: product.model_number || "-" },
//     { label: "الباركود", value: product.barcode || "-" },
//     {
//       label: "وحدة القياس",
//       value: `${unitName}${unitSymbol ? ` (${unitSymbol})` : ""}`,
//     },
//     { label: "كود المنتج", value: product.code },
//     { label: "التصنيف", value: catName },
//   ];

//   return (
//     <div className="space-y-8 max-w-[1400px] mx-auto" dir="rtl">
//       {/* Hero Section */}
//       <section className="bg-card rounded-xl border border-border shadow-sm p-8">
//         <div className="flex flex-col md:flex-row-reverse gap-10 items-start">
//           {/* Product Info */}
//           <div className="flex-1 text-right">
//             <div className="flex items-center justify-start gap-3 mb-4">
//               <Badge className="bg-accent text-accent-foreground px-3 py-1 rounded-full text-xs font-bold">
//                 {catName}
//               </Badge>
//               {getStockBadge()}
//             </div>
//             <h1 className="text-3xl md:text-4xl font-black text-foreground mb-3 leading-tight">
//               {formatProductDisplay(
//                 product.name,
//                 brandName,
//                 product.model_number,
//               )}
//             </h1>
//             {product.description && (
//               <p className="text-muted-foreground text-base leading-relaxed mb-4 max-w-3xl">
//                 {product.description}
//               </p>
//             )}
//             {canEdit && (
//               <div className="flex items-center justify-start gap-3 mb-6">
//                 <Button
//                   onClick={() => navigate(`/products/${id}/edit`)}
//                   className="gap-2 font-bold shadow-sm"
//                 >
//                   <Pencil className="h-4 w-4" />
//                   تعديل
//                 </Button>
//               </div>
//             )}
//             {/* Stats Grid */}
//             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
//               {[
//                 {
//                   label: "إجمالي المخزون",
//                   value: product.quantity_on_hand,
//                   suffix: "قطعة",
//                   highlight: false,
//                 },
//                 {
//                   label: "سعر البيع",
//                   value: Number(product.selling_price).toLocaleString("en-US"),
//                   suffix: "EGP",
//                   highlight: true,
//                 },
//                 {
//                   label: "سعر الشراء",
//                   value: Number(product.purchase_price).toLocaleString("en-US"),
//                   suffix: "EGP",
//                   highlight: false,
//                 },
//                 {
//                   label: "حد إعادة الطلب",
//                   value: product.min_stock_level,
//                   suffix: "قطعة",
//                   highlight: true,
//                 },
//               ].map((stat) => (
//                 <div
//                   key={stat.label}
//                   className="bg-muted/30 rounded-xl p-4 text-center border border-border/50"
//                 >
//                   <p className="text-muted-foreground text-xs font-medium mb-1">
//                     {stat.label}
//                   </p>
//                   <p
//                     className={`text-2xl font-bold font-mono ${stat.highlight ? "text-primary" : "text-foreground"}`}
//                   >
//                     {stat.value}{" "}
//                     <span className="text-sm font-normal text-muted-foreground">
//                       {stat.suffix}
//                     </span>
//                   </p>
//                 </div>
//               ))}
//             </div>
//           </div>

//           {/* Product Image */}
//           <div className="w-full md:w-[300px] shrink-0 relative">
//             <div
//               className="bg-muted rounded-2xl overflow-hidden aspect-square flex items-center justify-center border border-border cursor-pointer"
//               onClick={() => activeImage && setLightboxImg(activeImage)}
//             >
//               {activeImage ? (
//                 <img
//                   src={activeImage}
//                   alt={product.name}
//                   className="w-full h-full object-contain transition-transform hover:scale-105"
//                 />
//               ) : (
//                 <Package className="h-20 w-20 text-muted-foreground/20" />
//               )}
//             </div>
//           </div>
//         </div>
//       </section>

//       {/* Gallery Section */}
//       {allImages.length > 0 && (
//         <section className="bg-card rounded-xl border border-border shadow-sm p-6">
//           <div className="flex items-center gap-2 mb-5 border-b border-border/50 pb-4">
//             <Images className="h-5 w-5 text-primary" />
//             <h3 className="font-bold text-foreground">معرض صور المنتج</h3>
//           </div>
//           <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
//             {allImages.map((img, i) => (
//               <div
//                 key={i}
//                 className={`rounded-lg p-2 aspect-square flex items-center justify-center overflow-hidden cursor-pointer transition-colors ${
//                   i === selectedGalleryIdx
//                     ? "border-2 border-primary bg-accent/30"
//                     : "border border-border bg-muted/30 hover:border-primary"
//                 }`}
//                 onClick={() => setSelectedGalleryIdx(i)}
//                 onDoubleClick={() => setLightboxImg(img)}
//               >
//                 <img
//                   src={img}
//                   alt={`صورة ${i + 1}`}
//                   className={`max-h-full object-contain transition-transform hover:scale-105 ${i !== selectedGalleryIdx ? "opacity-70 hover:opacity-100" : ""} transition-opacity`}
//                 />
//               </div>
//             ))}
//           </div>
//         </section>
//       )}

//       {/* Tabs */}
//       <Tabs defaultValue="specs" className="w-full" dir="rtl">
//         <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start gap-8 h-auto p-0">
//           <TabsTrigger
//             value="specs"
//             className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none rounded-none pb-4 bg-transparent gap-2 text-sm font-medium"
//           >
//             <FileText className="h-4 w-4" />
//             المواصفات العامة
//           </TabsTrigger>
//           <TabsTrigger
//             value="movements"
//             className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none rounded-none pb-4 bg-transparent gap-2 text-sm font-medium"
//           >
//             <ArrowLeftRight className="h-4 w-4" />
//             حركة المنتج
//           </TabsTrigger>
//           <TabsTrigger
//             value="stats"
//             className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none rounded-none pb-4 bg-transparent gap-2 text-sm font-medium"
//           >
//             <BarChart3 className="h-4 w-4" />
//             إحصائيات البيع
//           </TabsTrigger>
//         </TabsList>

//         <TabsContent value="specs" className="mt-8">
//           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
//             {/* Specs Card */}
//             <div className="lg:col-span-8">
//               <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
//                 <div className="px-6 py-4 border-b border-border bg-muted/30">
//                   <h3 className="font-bold text-foreground">
//                     المواصفات الفنية
//                   </h3>
//                 </div>
//                 <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-12">
//                   {specs.map(({ label, value }) => (
//                     <div
//                       key={label}
//                       className="flex justify-between border-b border-dashed border-border pb-2"
//                     >
//                       <span className="text-muted-foreground text-sm">
//                         {label}
//                       </span>
//                       <span className="font-medium text-foreground text-sm">
//                         {value}
//                       </span>
//                     </div>
//                   ))}
//                 </div>
//                 {/* Profit Margin */}
//                 <div className="px-6 pb-6">
//                   <div className="mt-2 p-4 rounded-xl bg-primary/5 border border-primary/10 text-center">
//                     <span className="text-sm text-muted-foreground">
//                       هامش الربح:{" "}
//                     </span>
//                     <strong className="text-primary text-lg font-mono">
//                       {formatCurrency(margin)}
//                     </strong>
//                     <span className="text-sm text-muted-foreground">
//                       {" "}
//                       ({marginPct}%)
//                     </span>
//                   </div>
//                 </div>
//               </div>
//             </div>

//             {/* Recent Activity */}
//             <div className="lg:col-span-4">
//               <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
//                 <div className="px-6 py-4 border-b border-border bg-muted/30">
//                   <h3 className="font-bold text-foreground">النشاط الأخير</h3>
//                 </div>
//                 <div className="p-6 space-y-5">
//                   {movements.length === 0 && (
//                     <p className="text-sm text-muted-foreground text-center py-4">
//                       لا توجد حركات بعد
//                     </p>
//                   )}
//                   {movements.map((mv) => (
//                     <div key={mv.id} className="flex gap-4">
//                       <div
//                         className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center ${getMovementColor(mv.movement_type)}`}
//                       >
//                         {getMovementIcon(mv.movement_type)}
//                       </div>
//                       <div className="flex-1 min-w-0">
//                         <p className="text-sm font-semibold text-foreground truncate">
//                           {getMovementLabel(mv.movement_type)}
//                           {mv.notes ? ` - ${mv.notes}` : ""}
//                         </p>
//                         <div className="flex justify-between mt-1">
//                           <span className="text-[10px] text-muted-foreground">
//                             {new Date(mv.movement_date).toLocaleDateString(
//                               "en-GB",
//                             )}
//                           </span>
//                           {getMovementQtyDisplay(mv)}
//                         </div>
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//                 {movements.length > 0 && (
//                   <div className="px-6 py-4 bg-muted/30 text-center border-t border-border">
//                     <button
//                       onClick={() => navigate("/inventory/movements")}
//                       className="text-xs font-bold text-primary hover:underline"
//                     >
//                       عرض جميع الحركات
//                     </button>
//                   </div>
//                 )}
//               </div>
//             </div>
//           </div>
//         </TabsContent>

//         <TabsContent value="movements" className="mt-8">
//           <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
//             <div className="px-6 py-4 border-b border-border bg-muted/30">
//               <h3 className="font-bold text-foreground">سجل حركات المنتج</h3>
//             </div>
//             <div className="p-6">
//               {movements.length === 0 ? (
//                 <p className="text-sm text-muted-foreground text-center py-8">
//                   لا توجد حركات مسجلة لهذا المنتج
//                 </p>
//               ) : (
//                 <div className="space-y-4">
//                   {movements.map((mv) => (
//                     <div
//                       key={mv.id}
//                       className="flex items-center gap-4 p-4 rounded-lg bg-muted/20 border border-border/50"
//                     >
//                       <div
//                         className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${getMovementColor(mv.movement_type)}`}
//                       >
//                         {getMovementIcon(mv.movement_type)}
//                       </div>
//                       <div className="flex-1 min-w-0">
//                         <p className="text-sm font-semibold text-foreground">
//                           {getMovementLabel(mv.movement_type)}
//                         </p>
//                         <p className="text-xs text-muted-foreground mt-0.5">
//                           {mv.notes || "-"}
//                         </p>
//                       </div>
//                       <div className="text-left">
//                         {getMovementQtyDisplay(mv)}
//                         <p className="text-[10px] text-muted-foreground mt-1">
//                           {new Date(mv.movement_date).toLocaleDateString(
//                             "en-GB",
//                           )}
//                         </p>
//                       </div>
//                       <div className="text-left">
//                         <p className="text-xs font-mono text-foreground">
//                           {formatCurrency(mv.total_cost)}
//                         </p>
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               )}
//             </div>
//           </div>
//         </TabsContent>

//         <TabsContent value="stats" className="mt-8">
//           <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
//             <div className="px-6 py-4 border-b border-border bg-muted/30">
//               <h3 className="font-bold text-foreground">إحصائيات المبيعات</h3>
//             </div>
//             <div className="p-6">
//               <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
//                 {[
//                   {
//                     label: "إجمالي المبيعات",
//                     value: totalSalesRevenue,
//                     suffix: "EGP",
//                     icon: <BarChart3 className="h-5 w-5" />,
//                   },
//                   {
//                     label: "الوحدات المباعة",
//                     value: totalUnitsSold,
//                     suffix: "وحدة",
//                     icon: <Package className="h-5 w-5" />,
//                   },
//                   {
//                     label: "إجمالي المشتريات",
//                     value: movements
//                       .filter((m) => m.movement_type === "purchase")
//                       .reduce((s, m) => s + m.total_cost, 0),
//                     suffix: "EGP",
//                     icon: <ArrowUp className="h-5 w-5" />,
//                   },
//                   {
//                     label: "متوسط سعر الشراء",
//                     value: avgPurchasePrice,
//                     suffix: "EGP",
//                     icon: <Tag className="h-5 w-5" />,
//                   },
//                   {
//                     label: "متوسط سعر البيع",
//                     value: avgSellingPrice,
//                     suffix: "EGP",
//                     icon: <Barcode className="h-5 w-5" />,
//                   },
//                 ].map((stat) => (
//                   <div
//                     key={stat.label}
//                     className="bg-muted/30 p-5 rounded-xl border border-border/50 flex items-center gap-4"
//                   >
//                     <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center text-primary">
//                       {stat.icon}
//                     </div>
//                     <div>
//                       <p className="text-sm text-muted-foreground mb-1">
//                         {stat.label}
//                       </p>
//                       <p className="text-xl font-bold font-mono text-foreground">
//                         {typeof stat.value === "number"
//                           ? stat.value.toLocaleString("en-US")
//                           : stat.value}{" "}
//                         <span className="text-sm font-normal text-muted-foreground">
//                           {stat.suffix}
//                         </span>
//                       </p>
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             </div>
//           </div>
//         </TabsContent>
//       </Tabs>

//       {/* Lightbox */}
//       <Dialog open={!!lightboxImg} onOpenChange={() => setLightboxImg(null)}>
//         <DialogContent className="max-w-3xl p-2 bg-black/90 border-none">
//           {lightboxImg && (
//             <img
//               src={lightboxImg}
//               alt="Preview"
//               className="w-full h-auto rounded-lg"
//             />
//           )}
//         </DialogContent>
//       </Dialog>
//     </div>
//   );
// }

import React, { useState, useEffect, useCallback, useRef } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { formatProductDisplay } from "@/lib/product-utils";
import { useNavigate, useParams } from "react-router-dom";
import {
  MOVEMENT_TYPE_LABELS_DETAIL,
  MOVEMENT_TYPE_COLORS,
  MOVEMENT_TYPE_LABELS,
  MOVEMENT_IN_TYPES,
  REFERENCE_ROUTE_MAP,
} from "@/lib/constants";
import { DataTable } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { DatePickerInput } from "@/components/DatePickerInput";
import { ExportMenu } from "@/components/ExportMenu";
import {
  Select as FilterSelect,
  SelectContent as FilterSelectContent,
  SelectItem as FilterSelectItem,
  SelectTrigger as FilterSelectTrigger,
  SelectValue as FilterSelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Pencil,
  Package,
  Barcode,
  Tag,
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  FileText,
  BarChart3,
  Images,
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  AlertCircle,
  Loader2,
  Info,
  ExternalLink,
  X as XIcon,
} from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface ProductCategory {
  name: string;
}

interface ProductUnit {
  name: string;
  symbol: string;
}

interface ProductBrand {
  name: string;
  country?: string;
}

interface Product {
  id: string;
  name: string;
  code: string;
  description?: string;
  main_image_url?: string;
  barcode?: string;
  model_number?: string;
  selling_price: number;
  purchase_price: number;
  quantity_on_hand: number;
  min_stock_level: number;
  category?: string;
  unit?: string;
  product_categories?: ProductCategory;
  product_units?: ProductUnit;
  product_brands?: ProductBrand;
}

interface ProductImage {
  id: string;
  image_url: string;
  sort_order?: number;
}

interface InventoryMovement {
  id: string;
  movement_type: string;
  quantity: number;
  unit_cost?: number;
  total_cost: number;
  movement_date: string;
  notes?: string;
  reference_id?: string | null;
  reference_type?: string | null;
}

interface ProductStats {
  avgPurchasePrice: number;
  avgSellingPrice: number;
  totalSalesRevenue: number;
  totalUnitsSold: number;
  totalPurchaseCost: number;
}

// ─────────────────────────────────────────────
// Custom Hook
// ─────────────────────────────────────────────

function useProductData(id: string) {
  const [product, setProduct] = useState<Product | null>(null);
  const [gallery, setGallery] = useState<ProductImage[]>([]);
  const [recentMovements, setRecentMovements] = useState<InventoryMovement[]>(
    [],
  );
  const [allMovements, setAllMovements] = useState<InventoryMovement[]>([]);
  const [stats, setStats] = useState<ProductStats>({
    avgPurchasePrice: 0,
    avgSellingPrice: 0,
    totalSalesRevenue: 0,
    totalUnitsSold: 0,
    totalPurchaseCost: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movementsError, setMovementsError] = useState<string | null>(null);

  const fetchProduct = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: productError } = await supabase
      .from("products")
      .select(
        "*, product_categories(name), product_units(name, symbol), product_brands(name, country)",
      )
      .eq("id", id)
      .single();

    if (productError || !data) {
      setError("لم يتم العثور على المنتج");
      setLoading(false);
      return;
    }

    setProduct(data as unknown as Product);

    // Parallel fetch: images + recent movements + stats
    const [
      imagesResult,
      movementsResult,
      avgPurchResult,
      avgSellResult,
      salesResult,
    ] = await Promise.allSettled([
      (supabase.from("product_images") as any)
        .select("*")
        .eq("product_id", id)
        .order("sort_order"),
      supabase
        .from("inventory_movements")
        .select("*")
        .eq("product_id", id)
        .order("movement_date", { ascending: false })
        .limit(5),
      supabase.rpc("get_avg_purchase_price", { _product_id: id }),
      supabase.rpc("get_avg_selling_price", { _product_id: id }),
      (supabase.from("sales_invoice_items") as any)
        .select("quantity, total, invoice_id, sales_invoices!inner(status)")
        .eq("product_id", id)
        .eq("sales_invoices.status", "posted"),
    ]);

    if (imagesResult.status === "fulfilled" && imagesResult.value.data) {
      setGallery(imagesResult.value.data as ProductImage[]);
    }

    if (movementsResult.status === "fulfilled" && movementsResult.value.data) {
      setRecentMovements(movementsResult.value.data as InventoryMovement[]);
    }

    const avgPurch =
      avgPurchResult.status === "fulfilled"
        ? Number(avgPurchResult.value.data) || 0
        : 0;
    const avgSell =
      avgSellResult.status === "fulfilled"
        ? Number(avgSellResult.value.data) || 0
        : 0;

    const salesItems =
      salesResult.status === "fulfilled" && salesResult.value.data
        ? (salesResult.value.data as any[])
        : [];

    const totalRevenue = salesItems.reduce((s, i) => s + Number(i.total), 0);
    const totalUnits = salesItems.reduce((s, i) => s + Number(i.quantity), 0);

    setStats({
      avgPurchasePrice: avgPurch,
      avgSellingPrice: avgSell,
      totalSalesRevenue: totalRevenue,
      totalUnitsSold: totalUnits,
      totalPurchaseCost: 0, // filled when all movements tab loads
    });

    setLoading(false);
  }, [id]);

  const fetchAllMovements = useCallback(async () => {
    if (allMovements.length > 0) return; // already loaded
    setLoadingMovements(true);
    setMovementsError(null);

    const { data, error: mvError } = await supabase
      .from("inventory_movements")
      .select("*")
      .eq("product_id", id)
      .order("movement_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (mvError) {
      setMovementsError("تعذّر تحميل سجل الحركات");
    } else {
      const movements = (data || []) as InventoryMovement[];
      setAllMovements(movements);
      const purchaseCost = movements
        .filter((m) => m.movement_type === "purchase")
        .reduce((s, m) => s + Number(m.total_cost), 0);
      setStats((prev) => ({ ...prev, totalPurchaseCost: purchaseCost }));
    }

    setLoadingMovements(false);
  }, [id, allMovements.length]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  return {
    product,
    gallery,
    recentMovements,
    allMovements,
    stats,
    loading,
    loadingMovements,
    error,
    movementsError,
    fetchAllMovements,
  };
}

// ─────────────────────────────────────────────
// Movement Row Component
// ─────────────────────────────────────────────

function getMovementIcon(type: string) {
  if (type === "sale" || type === "sale_return")
    return <ArrowDown className="h-4 w-4" />;
  if (type === "purchase" || type === "purchase_return")
    return <ArrowUp className="h-4 w-4" />;
  return <ArrowLeftRight className="h-4 w-4" />;
}

function getMovementColor(type: string): string {
  return MOVEMENT_TYPE_COLORS[type] || "bg-muted text-muted-foreground";
}

function getMovementLabel(type: string): string {
  return MOVEMENT_TYPE_LABELS_DETAIL[type] || type;
}

function getMovementQtyDisplay(mv: InventoryMovement) {
  const isOut =
    mv.movement_type === "sale" || mv.movement_type === "purchase_return";
  return isOut ? (
    <span className="text-xs font-bold text-destructive">
      -{mv.quantity} وحدة
    </span>
  ) : (
    <span className="text-xs font-bold text-success">+{mv.quantity} وحدة</span>
  );
}

interface MovementRowProps {
  mv: InventoryMovement;
  compact?: boolean;
  formatCurrency: (val: number) => string;
}

function MovementRow({
  mv,
  compact = false,
  formatCurrency,
}: MovementRowProps) {
  if (compact) {
    return (
      <div className="flex gap-4">
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
              {new Date(mv.movement_date).toLocaleDateString("en-GB")}
            </span>
            {getMovementQtyDisplay(mv)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/20 border border-border/50">
      <div
        className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${getMovementColor(mv.movement_type)}`}
      >
        {getMovementIcon(mv.movement_type)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {getMovementLabel(mv.movement_type)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {mv.notes || "-"}
        </p>
      </div>
      <div className="text-left">
        {getMovementQtyDisplay(mv)}
        <p className="text-[10px] text-muted-foreground mt-1">
          {new Date(mv.movement_date).toLocaleDateString("en-GB")}
        </p>
      </div>
      <div className="text-left">
        <p className="text-xs font-mono text-foreground">
          {formatCurrency(mv.total_cost)}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Lightbox Component
// ─────────────────────────────────────────────

interface LightboxProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

function Lightbox({ images, initialIndex, onClose }: LightboxProps) {
  const [current, setCurrent] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const prev = useCallback(() => {
    setZoomed(false);
    setCurrent((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const next = useCallback(() => {
    setZoomed(false);
    setCurrent((i) => (i + 1) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") next();
      else if (e.key === "ArrowRight") prev();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next, onClose]);

  // Touch/swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) {
      // RTL: swipe right → previous (visually right in arabic), swipe left → next
      if (delta > 0) prev();
      else next();
    }
    touchStartX.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm -top-10 p-4"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        aria-label="إغلاق"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-white/10 text-white text-sm font-mono">
        {current + 1} / {images.length}
      </div>

      {/* Zoom toggle */}
      <button
        onClick={() => setZoomed((z) => !z)}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        aria-label="تكبير"
      >
        <ZoomIn className="h-5 w-5" />
      </button>

      {/* Prev */}
      {images.length > 1 && (
        <button
          onClick={prev}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all hover:scale-110"
          aria-label="السابق"
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      )}

      {/* Image */}
      <div
        className="w-full h-full flex items-center justify-center p-16 cursor-zoom-in"
        onClick={() => setZoomed((z) => !z)}
      >
        <img
          key={current}
          src={images[current]}
          alt={`صورة ${current + 1}`}
          className={`max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-transform duration-300 select-none ${
            zoomed ? "scale-150 cursor-zoom-out" : "scale-100 cursor-zoom-in"
          }`}
          draggable={false}
        />
      </div>

      {/* Next */}
      {images.length > 1 && (
        <button
          onClick={next}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all hover:scale-110"
          aria-label="التالي"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 px-4 py-2 rounded-2xl bg-black/50 backdrop-blur-sm max-w-[90vw] overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                setZoomed(false);
                setCurrent(i);
              }}
              className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                i === current
                  ? "border-white scale-110 shadow-lg"
                  : "border-transparent opacity-50 hover:opacity-80"
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

export default function ProductView() {
  const { role } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const currency = settings?.default_currency ?? "EGP";

  const {
    product,
    gallery,
    recentMovements,
    allMovements,
    stats,
    loading,
    loadingMovements,
    error,
    movementsError,
    fetchAllMovements,
  } = useProductData(id!);

  const [selectedGalleryIdx, setSelectedGalleryIdx] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const canEdit = role === "admin" || role === "accountant";

  // ── Movements table filters ──
  const [mvType, setMvType] = useState<string>("all");
  const [mvFrom, setMvFrom] = useState<string>("");
  const [mvTo, setMvTo] = useState<string>("");

  // Cumulative balance (asc) → reverse for display (newest first)
  const movementsWithBalance = useMemo(() => {
    let bal = 0;
    const withBal = allMovements.map((m) => {
      if (m.movement_type === "adjustment") {
        bal += Number(m.quantity);
      } else {
        const isIn = MOVEMENT_IN_TYPES.includes(m.movement_type);
        bal += isIn ? Number(m.quantity) : -Number(m.quantity);
      }
      return { ...m, cumulativeBalance: bal };
    });
    return withBal.slice().reverse();
  }, [allMovements]);

  const filteredMovements = useMemo(() => {
    return movementsWithBalance.filter((m) => {
      if (mvType !== "all" && m.movement_type !== mvType) return false;
      if (mvFrom && m.movement_date < mvFrom) return false;
      if (mvTo && m.movement_date > mvTo) return false;
      return true;
    });
  }, [movementsWithBalance, mvType, mvFrom, mvTo]);

  const movementColumns = useMemo<ColumnDef<any, any>[]>(
    () => [
      {
        accessorKey: "movement_date",
        header: "التاريخ",
        cell: ({ row }) => (
          <span className="text-muted-foreground whitespace-nowrap">
            {row.original.movement_date}
          </span>
        ),
      },
      {
        accessorKey: "movement_type",
        header: "نوع الحركة",
        cell: ({ row }) => (
          <Badge
            variant="secondary"
            className={MOVEMENT_TYPE_COLORS[row.original.movement_type] || ""}
          >
            {MOVEMENT_TYPE_LABELS[row.original.movement_type] ||
              row.original.movement_type}
          </Badge>
        ),
      },
      {
        id: "reference",
        header: "المرجع",
        cell: ({ row }) => {
          const { reference_type, reference_id } = row.original;
          if (!reference_type || !reference_id)
            return <span className="text-muted-foreground">-</span>;
          const basePath = REFERENCE_ROUTE_MAP[reference_type];
          const labels: Record<string, string> = {
            purchase_invoice: "فاتورة شراء",
            sales_invoice: "فاتورة بيع",
            purchase_return: "مرتجع شراء",
            sales_return: "مرتجع بيع",
            inventory_adjustment: "تسوية مخزون",
            adjustment: "تسوية مخزون",
          };
          const label = labels[reference_type] || reference_type;
          return basePath ? (
            <button
              onClick={() => navigate(`${basePath}/${reference_id}`)}
              className="flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium text-xs transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {label}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">{label}</span>
          );
        },
      },
      {
        id: "in_qty",
        header: "وارد",
        cell: ({ row }) => {
          const mt = row.original.movement_type;
          const qty = Number(row.original.quantity);
          const isIn =
            mt === "adjustment" ? qty > 0 : MOVEMENT_IN_TYPES.includes(mt);
          return isIn ? (
            <span className="font-bold text-emerald-600 font-mono">
              +{Math.abs(qty).toLocaleString("en-US")}
            </span>
          ) : (
            <span className="text-muted-foreground/30">-</span>
          );
        },
      },
      {
        id: "out_qty",
        header: "صادر",
        cell: ({ row }) => {
          const mt = row.original.movement_type;
          const qty = Number(row.original.quantity);
          const isOut =
            mt === "adjustment" ? qty < 0 : !MOVEMENT_IN_TYPES.includes(mt);
          return isOut ? (
            <span className="font-bold text-rose-600 font-mono">
              -{Math.abs(qty).toLocaleString("en-US")}
            </span>
          ) : (
            <span className="text-muted-foreground/30">-</span>
          );
        },
      },
      {
        accessorKey: "unit_cost",
        header: "تكلفة الوحدة",
        cell: ({ row }) => (
          <span className="font-mono">
            {Number(row.original.unit_cost ?? 0).toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </span>
        ),
      },
      {
        accessorKey: "total_cost",
        header: "إجمالي التكلفة",
        cell: ({ row }) => (
          <span className="font-mono font-bold">
            {Number(row.original.total_cost).toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </span>
        ),
      },
      {
        id: "balance",
        header: "الرصيد بعد",
        cell: ({ row }) => (
          <span className="font-black font-mono text-foreground">
            {Number(row.original.cumulativeBalance).toLocaleString("en-US")}
          </span>
        ),
      },
      {
        accessorKey: "notes",
        header: "ملاحظات",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground max-w-[160px] truncate block">
            {row.original.notes || "-"}
          </span>
        ),
      },
    ],
    [navigate],
  );

  const movementsExportConfig = useMemo(
    () => ({
      filenamePrefix: `حركات-المنتج-${product?.code ?? ""}`,
      sheetName: "حركات المنتج",
      pdfTitle: `سجل حركات المنتج: ${product?.name ?? ""}`,
      headers: [
        "التاريخ",
        "نوع الحركة",
        "وارد",
        "صادر",
        "تكلفة الوحدة",
        "إجمالي التكلفة",
        "الرصيد بعد",
        "ملاحظات",
      ],
      rows: filteredMovements.map((m: any) => {
        const mt = m.movement_type;
        const qty = Number(m.quantity);
        const isIn =
          mt === "adjustment" ? qty > 0 : MOVEMENT_IN_TYPES.includes(mt);
        const isOut =
          mt === "adjustment" ? qty < 0 : !MOVEMENT_IN_TYPES.includes(mt);
        return [
          m.movement_date,
          MOVEMENT_TYPE_LABELS[mt] || mt,
          isIn ? Math.abs(qty) : "",
          isOut ? Math.abs(qty) : "",
          Number(m.unit_cost ?? 0),
          Number(m.total_cost),
          Number(m.cumulativeBalance),
          m.notes || "",
        ];
      }),
      settings,
      pdfOrientation: "landscape" as const,
    }),
    [filteredMovements, product, settings],
  );

  // Redirect on error
  useEffect(() => {
    if (error) {
      toast({ title: "خطأ", description: error, variant: "destructive" });
      navigate("/products");
    }
  }, [error, navigate]);

  if (loading) return <PageSkeleton variant="cards" />;
  if (!product) return null;

  const formatCurrency = (val: number) =>
    `${Number(val).toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP`;

  const catName = product.product_categories?.name || product.category || "-";
  const unitSymbol = product.product_units?.symbol || "";
  const unitName = product.product_units?.name || product.unit || "-";
  const brandName = product.product_brands?.name || "-";
  const brandCountry = product.product_brands?.country;

  // Use actual average prices for margin calculation
  const effectivePurchasePrice =
    stats.avgPurchasePrice > 0
      ? stats.avgPurchasePrice
      : product.purchase_price;
  const effectiveSellingPrice =
    stats.avgSellingPrice > 0 ? stats.avgSellingPrice : product.selling_price;
  const margin = effectiveSellingPrice - effectivePurchasePrice;
  const marginPct =
    effectivePurchasePrice > 0
      ? ((margin / effectivePurchasePrice) * 100).toFixed(1)
      : "0";

  const allImages = [
    ...(product.main_image_url ? [product.main_image_url] : []),
    ...gallery.map((g) => g.image_url),
  ];
  const activeImage = allImages[selectedGalleryIdx] || null;

  const getStockBadge = () => {
    if (product.quantity_on_hand <= 0)
      return (
        <Badge
          variant="destructive"
          className="px-4 py-1 rounded-full text-xs font-bold"
        >
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

  const specs = [
    {
      label: "العلامة التجارية",
      value: `${brandName}${brandCountry ? ` (${brandCountry})` : ""}`,
    },
    { label: "الموديل", value: product.model_number || "-" },
    { label: "الباركود", value: product.barcode || "-" },
    {
      label: "وحدة القياس",
      value: `${unitName}${unitSymbol ? ` (${unitSymbol})` : ""}`,
    },
    { label: "كود المنتج", value: product.code },
    { label: "التصنيف", value: catName },
  ];

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pt-6" dir="rtl">
      {/* ── Hero Section ── */}
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
            <h1 className="text-3xl md:text-4xl font-black text-foreground mb-3 leading-tight">
              {formatProductDisplay(
                product.name,
                brandName,
                product.model_number,
              )}
            </h1>
            {product.description && (
              <p className="text-muted-foreground text-base leading-relaxed mb-4 max-w-3xl">
                {product.description}
              </p>
            )}
            {canEdit && (
              <div className="flex items-center justify-start gap-3 mb-6">
                <Button
                  onClick={() => navigate(`/products/${id}/edit`)}
                  className="gap-2 font-bold shadow-sm"
                >
                  <Pencil className="h-4 w-4" />
                  تعديل
                </Button>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: "إجمالي المخزون",
                  value: product.quantity_on_hand,
                  suffix: product.product_units?.symbol || "وحدة",
                  highlight: false,
                },
                {
                  label: "سعر البيع",
                  value: Number(product.selling_price).toLocaleString("en-US"),
                  suffix: currency,
                  highlight: true,
                },
                {
                  label: "سعر الشراء",
                  value: Number(product.purchase_price).toLocaleString("en-US"),
                  suffix: currency,
                  highlight: false,
                },
                {
                  label: "حد إعادة الطلب",
                  value: product.min_stock_level,
                  suffix: product.product_units?.symbol || "وحدة",
                  highlight: true,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-muted/30 rounded-xl p-4 text-center border border-border/50"
                >
                  <p className="text-muted-foreground text-xs font-medium mb-1">
                    {stat.label}
                  </p>
                  <p
                    className={`text-2xl font-bold font-mono ${
                      stat.highlight ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {stat.value}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      {stat.suffix}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Product Image */}
          <div className="w-full md:w-[300px] shrink-0 relative group">
            <div
              className="bg-muted rounded-2xl overflow-hidden aspect-square flex items-center justify-center border border-border cursor-pointer relative"
              onClick={() => {
                if (activeImage) setLightboxIndex(selectedGalleryIdx);
              }}
            >
              {activeImage ? (
                <>
                  <img
                    src={activeImage}
                    alt={product.name}
                    className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {allImages.length > 1 && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                      {allImages.map((_, i) => (
                        <span
                          key={i}
                          className={`block rounded-full transition-all ${
                            i === selectedGalleryIdx
                              ? "bg-white w-4 h-1.5"
                              : "bg-white/50 w-1.5 h-1.5"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <Package className="h-20 w-20 text-muted-foreground/20" />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Gallery Section ── */}
      {allImages.length > 1 && (
        <section className="bg-card rounded-xl border border-border shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5 border-b border-border/50 pb-4">
            <Images className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-foreground">معرض صور المنتج</h3>
            <span className="text-xs text-muted-foreground mr-auto">
              {allImages.length} صورة · اضغط مرتين للعرض الكامل
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {allImages.map((img, i) => (
              <div
                key={i}
                className={`rounded-xl p-1.5 aspect-square flex items-center justify-center overflow-hidden cursor-pointer transition-all duration-200 ${
                  i === selectedGalleryIdx
                    ? "border-2 border-primary bg-accent/30 shadow-md scale-105"
                    : "border border-border bg-muted/30 hover:border-primary/60 hover:scale-102"
                }`}
                onClick={() => setSelectedGalleryIdx(i)}
                onDoubleClick={() => setLightboxIndex(i)}
              >
                <img
                  src={img}
                  alt={`صورة ${i + 1}`}
                  className={`max-h-full w-full object-contain transition-opacity duration-200 ${
                    i !== selectedGalleryIdx
                      ? "opacity-60 hover:opacity-90"
                      : ""
                  }`}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tabs ── */}
      <Tabs
        defaultValue="specs"
        className="w-full"
        dir="rtl"
        onValueChange={(val) => {
          if (val === "movements") fetchAllMovements();
        }}
      >
        <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start gap-8 h-auto p-0">
          {[
            {
              value: "specs",
              icon: <FileText className="h-4 w-4" />,
              label: "المواصفات العامة",
            },
            {
              value: "movements",
              icon: <ArrowLeftRight className="h-4 w-4" />,
              label: "حركة المنتج",
            },
            {
              value: "stats",
              icon: <BarChart3 className="h-4 w-4" />,
              label: "إحصائيات البيع",
            },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none rounded-none pb-4 bg-transparent gap-2 text-sm font-medium"
            >
              {tab.icon}
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Specs Tab ── */}
        <TabsContent value="specs" className="mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Specs Card */}
            <div className="lg:col-span-8">
              <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted/30">
                  <h3 className="font-bold text-foreground">
                    المواصفات الفنية
                  </h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-12">
                  {specs.map(({ label, value }) => (
                    <div
                      key={label}
                      className="flex justify-between border-b border-dashed border-border pb-2"
                    >
                      <span className="text-muted-foreground text-sm">
                        {label}
                      </span>
                      <span className="font-medium text-foreground text-sm">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Profit Margin – based on actual averages */}
                <div className="px-6 pb-6">
                  <div className="mt-2 p-4 rounded-xl bg-primary/5 border border-primary/10 text-center">
                    <span className="text-sm text-muted-foreground">
                      هامش الربح الفعلي:{" "}
                    </span>
                    <strong className="text-primary text-lg font-mono">
                      {formatCurrency(margin)}
                    </strong>
                    <span className="text-sm text-muted-foreground">
                      {" "}
                      ({marginPct}%)
                    </span>
                    {stats.avgPurchasePrice > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        محسوب من متوسط أسعار الشراء والبيع الفعلية
                      </p>
                    )}
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
                  {recentMovements.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      لا توجد حركات بعد
                    </p>
                  )}
                  {recentMovements.map((mv) => (
                    <MovementRow
                      key={mv.id}
                      mv={mv}
                      compact
                      formatCurrency={formatCurrency}
                    />
                  ))}
                </div>
                {recentMovements.length > 0 && (
                  <div className="px-6 py-4 bg-muted/30 text-center border-t border-border">
                    <button
                      onClick={() =>
                        navigate(`/inventory/movements?product_id=${id}`)
                      }
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

        {/* ── Movements Tab ── */}
        <TabsContent value="movements" className="mt-8">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <h3 className="font-bold text-foreground">
                سجل حركات المنتج الكامل
              </h3>
              {allMovements.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {allMovements.length} حركة مسجلة
                </span>
              )}
            </div>
            <div className="p-6">
              {loadingMovements && (
                <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">جارٍ تحميل الحركات…</span>
                </div>
              )}
              {movementsError && !loadingMovements && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p className="text-sm">{movementsError}</p>
                </div>
              )}
              {!loadingMovements &&
                !movementsError &&
                allMovements.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    لا توجد حركات مسجلة لهذا المنتج
                  </p>
                )}
              {!loadingMovements && allMovements.length > 0 && (
                <div className="space-y-3">
                  {allMovements.map((mv) => (
                    <MovementRow
                      key={mv.id}
                      mv={mv}
                      formatCurrency={formatCurrency}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Stats Tab ── */}
        <TabsContent value="stats" className="mt-8">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <h3 className="font-bold text-foreground">إحصائيات المبيعات</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                {[
                  {
                    label: "إجمالي المبيعات",
                    value: stats.totalSalesRevenue,
                    suffix: currency,
                    icon: <BarChart3 className="h-5 w-5" />,
                  },
                  {
                    label: "الوحدات المباعة",
                    value: stats.totalUnitsSold,
                    suffix: product.product_units?.symbol || "وحدة",
                    icon: <Package className="h-5 w-5" />,
                  },
                  {
                    label: "إجمالي المشتريات",
                    value: stats.totalPurchaseCost,
                    suffix: currency,
                    icon: <ArrowUp className="h-5 w-5" />,
                  },
                  {
                    label: "متوسط سعر الشراء",
                    value: stats.avgPurchasePrice,
                    suffix: currency,
                    icon: <Tag className="h-5 w-5" />,
                    tooltip:
                      "متوسط التكلفة الجاري (Moving WAC):\n(المشتريات + الرصيد الافتتاحي − مرتجعات الشراء)\n÷ صافي الكميات الداخلة\nيُستخدم في حساب تكلفة البضاعة المباعة (COGS).",
                  },
                  {
                    label: "متوسط سعر البيع",
                    value: stats.avgSellingPrice,
                    suffix: currency,
                    icon: <Barcode className="h-5 w-5" />,
                    tooltip:
                      "صافي متوسط سعر البيع:\n(إجمالي صافي المبيعات − إجمالي صافي مرتجعات المبيعات)\n÷ (الكميات المباعة − الكميات المرتجعة)\nيُحسب من فواتير ومرتجعات البيع المُرحَّلة فقط.",
                  },
                ].map((stat: any) => (
                  <div
                    key={stat.label}
                    className="bg-muted/30 p-5 rounded-xl border border-border/50 flex items-center gap-4"
                  >
                    <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center text-primary">
                      {stat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <p className="text-sm text-muted-foreground">
                          {stat.label}
                        </p>
                        {stat.tooltip && (
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="text-muted-foreground/70 hover:text-primary transition-colors"
                                  aria-label="معلومات"
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="max-w-xs whitespace-pre-line text-xs leading-relaxed"
                              >
                                {stat.tooltip}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <p className="text-xl font-bold font-mono text-foreground">
                        {typeof stat.value === "number"
                          ? stat.value.toLocaleString("en-US")
                          : stat.value}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          {stat.suffix}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Lightbox ── */}
      {lightboxIndex !== null && allImages.length > 0 && (
        <Lightbox
          images={allImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
