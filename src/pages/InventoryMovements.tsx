import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatProductDisplay } from "@/lib/product-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/DatePickerInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import {
  Package,
  TrendingUp,
  TrendingDown,
  Activity,
  Coins,
  ExternalLink,
  Check,
  ChevronsUpDown,
  Search,
} from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";
import { useSettings } from "@/contexts/SettingsContext";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const movementTypeLabels: Record<string, string> = {
  opening_balance: "رصيد افتتاحي",
  purchase: "شراء",
  purchase_return: "مرتجع شراء",
  sale: "بيع",
  sale_return: "مرتجع بيع",
  adjustment: "تسوية",
};

const movementTypeColors: Record<string, string> = {
  opening_balance: "bg-blue-100 text-blue-800",
  purchase: "bg-emerald-100 text-emerald-700",
  purchase_return: "bg-orange-100 text-orange-800",
  sale: "bg-rose-100 text-rose-700",
  sale_return: "bg-purple-100 text-purple-800",
  adjustment: "bg-muted text-muted-foreground",
};

const inTypes = ["opening_balance", "purchase", "sale_return"];

const referenceRouteMap: Record<string, string> = {
  purchase_invoice: "/purchases",
  sales_invoice: "/sales",
  purchase_return: "/purchase-returns",
  sales_return: "/sales-returns",
  inventory_adjustment: "/inventory-adjustments",
};

interface MovementRow {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  movement_date: string;
  notes: string | null;
  reference_id: string | null;
  reference_type: string | null;
  products: { code: string; name: string; model_number?: string; product_brands?: { name: string } | null } | null;
  cumulativeBalance: number;
}

export default function InventoryMovements() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [productComboOpen, setProductComboOpen] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, quantity_on_hand, purchase_price")
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["inventory-movements", selectedProduct, selectedType, dateFrom, dateTo],
    queryFn: async () => {
      let query = (supabase.from("inventory_movements" as any) as any)
        .select("*, products(code, name, model_number, product_brands(name))")
        .order("movement_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (selectedProduct !== "all") query = query.eq("product_id", selectedProduct);
      if (selectedType !== "all") query = query.eq("movement_type", selectedType);
      if (dateFrom) query = query.gte("movement_date", dateFrom);
      if (dateTo) query = query.lte("movement_date", dateTo);

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  const movementsWithBalance: MovementRow[] = useMemo(() => {
    const balances: Record<string, number> = {};
    return movements.map((m: any) => {
      const pid = m.product_id;
      if (!(pid in balances)) balances[pid] = 0;
      if (m.movement_type === "adjustment") {
        // Adjustments store signed quantity: positive = gain, negative = loss
        balances[pid] += Number(m.quantity);
      } else {
        const isIn = inTypes.includes(m.movement_type);
        balances[pid] += isIn ? Number(m.quantity) : -Number(m.quantity);
      }
      return { ...m, cumulativeBalance: balances[pid] };
    });
  }, [movements]);

  const totalIn = movementsWithBalance
    .filter((m) => m.movement_type === "adjustment" ? Number(m.quantity) > 0 : inTypes.includes(m.movement_type))
    .reduce((s, m) => s + Math.abs(Number(m.quantity)), 0);
  const totalOut = movementsWithBalance
    .filter((m) => m.movement_type === "adjustment" ? Number(m.quantity) < 0 : !inTypes.includes(m.movement_type))
    .reduce((s, m) => s + Math.abs(Number(m.quantity)), 0);
  const totalValue = movementsWithBalance.reduce((s, m) => {
    if (m.movement_type === "adjustment") {
      return s + (Number(m.quantity) > 0 ? Number(m.total_cost) : -Number(m.total_cost));
    }
    const isIn = inTypes.includes(m.movement_type);
    return s + (isIn ? Number(m.total_cost) : -Number(m.total_cost));
  }, 0);

  const handleReferenceClick = (referenceType: string | null, referenceId: string | null) => {
    if (!referenceType || !referenceId) return;
    const basePath = referenceRouteMap[referenceType];
    if (basePath) {
      navigate(`${basePath}/${referenceId}`);
    }
  };

  const getReferenceLabel = (referenceType: string | null): string => {
    if (!referenceType) return "-";
    const labels: Record<string, string> = {
      purchase_invoice: "فاتورة شراء",
      sales_invoice: "فاتورة بيع",
      purchase_return: "مرتجع شراء",
      sales_return: "مرتجع بيع",
      inventory_adjustment: "تسوية مخزون",
    };
    return labels[referenceType] || referenceType;
  };

  const columns: ColumnDef<MovementRow, any>[] = [
    {
      accessorKey: "movement_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="التاريخ" />,
      cell: ({ row }) => <span className="text-muted-foreground whitespace-nowrap">{row.original.movement_date}</span>,
    },
    {
      id: "reference",
      header: "المرجع",
      cell: ({ row }) => {
        const { reference_type, reference_id } = row.original;
        if (!reference_type || !reference_id) return <span className="text-muted-foreground">-</span>;
        const hasRoute = !!referenceRouteMap[reference_type];
        return hasRoute ? (
          <button
            onClick={() => handleReferenceClick(reference_type, reference_id)}
            className="flex items-center gap-1.5 text-primary hover:text-primary/80 font-medium text-xs transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {getReferenceLabel(reference_type)}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">{getReferenceLabel(reference_type)}</span>
        );
      },
    },
    {
      accessorKey: "movement_type",
      header: "نوع الحركة",
      cell: ({ row }) => (
        <Badge variant="secondary" className={movementTypeColors[row.original.movement_type] || ""}>
          {movementTypeLabels[row.original.movement_type] || row.original.movement_type}
        </Badge>
      ),
    },
    {
      id: "product",
      header: ({ column }) => <DataTableColumnHeader column={column} title="المنتج" />,
      accessorFn: (row) => row.products?.name || "",
      cell: ({ row }) => {
        const p = row.original.products as any;
        const displayName = p ? formatProductDisplay(p.name, p.product_brands?.name, p.model_number) : "";
        return (
          <div>
            <div className="font-bold text-foreground">{displayName}</div>
          </div>
        );
      },
    },
    {
      id: "in_qty",
      header: "الوارد",
      cell: ({ row }) => {
        const mt = row.original.movement_type;
        const qty = Number(row.original.quantity);
        const isIn = mt === "adjustment" ? qty > 0 : inTypes.includes(mt);
        return isIn ? (
          <span className="font-bold text-emerald-600 font-mono">
            +{Math.abs(qty).toLocaleString()}
          </span>
        ) : (
          <span className="text-muted-foreground/30">-</span>
        );
      },
    },
    {
      id: "out_qty",
      header: "الصادر",
      cell: ({ row }) => {
        const mt = row.original.movement_type;
        const qty = Number(row.original.quantity);
        const isOut = mt === "adjustment" ? qty < 0 : !inTypes.includes(mt);
        return isOut ? (
          <span className="font-bold text-rose-600 font-mono">-{Math.abs(qty).toLocaleString()}</span>
        ) : (
          <span className="text-muted-foreground/30">-</span>
        );
      },
    },
    {
      accessorKey: "unit_cost",
      header: ({ column }) => <DataTableColumnHeader column={column} title="التكلفة" />,
      cell: ({ row }) => <span className="font-mono">{Number(row.original.unit_cost).toLocaleString()}</span>,
    },
    {
      accessorKey: "total_cost",
      header: ({ column }) => <DataTableColumnHeader column={column} title="القيمة" />,
      cell: ({ row }) => (
        <span className="font-mono font-bold">{Number(row.original.total_cost).toLocaleString()}</span>
      ),
    },
    {
      id: "balance",
      header: "الرصيد",
      cell: ({ row }) => (
        <span className="font-black font-mono text-foreground">{row.original.cumulativeBalance.toLocaleString()}</span>
      ),
    },
    {
      accessorKey: "notes",
      header: "ملاحظات",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-[120px] truncate block">{row.original.notes || "-"}</span>
      ),
    },
  ];

  const exportRows = movementsWithBalance.map((m) => {
    const p = m.products as any;
    return [
      m.movement_date,
      p ? formatProductDisplay(p.name, p.product_brands?.name, p.model_number) : "",
      p?.code || "",
      movementTypeLabels[m.movement_type] || m.movement_type,
      inTypes.includes(m.movement_type) ? m.quantity : "",
      !inTypes.includes(m.movement_type) ? m.quantity : "",
      m.unit_cost,
      m.total_cost,
      m.cumulativeBalance,
    ];
  });

  const exportConfig = {
    filenamePrefix: "حركات-المخزون",
    sheetName: "حركات المخزون",
    pdfTitle: "حركات المخزون",
    headers: ["التاريخ", "المنتج", "الكود", "نوع الحركة", "الوارد", "الصادر", "التكلفة", "القيمة", "الرصيد التراكمي"],
    rows: exportRows,
    settings,
    pdfOrientation: "landscape" as const,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Package className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-foreground">حركة المخزون</h1>
            <p className="text-sm text-muted-foreground">متابعة تفصيلية لعمليات التوريد والمنصرف</p>
          </div>
        </div>
        <ExportMenu config={exportConfig} disabled={movementsWithBalance.length === 0} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-muted-foreground text-sm mb-1">إجمالي الحركات</p>
            <div className="flex items-end justify-between">
              <h3 className="text-2xl font-black text-foreground font-mono">
                {movementsWithBalance.length.toLocaleString()}
              </h3>
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-muted-foreground text-sm mb-1">قيمة المخزون</p>
            <div className="flex items-end justify-between">
              <h3 className="text-2xl font-black text-foreground font-mono">{totalValue.toLocaleString()}</h3>
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Coins className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-muted-foreground text-sm mb-1">الوارد</p>
            <div className="flex items-end justify-between">
              <h3 className="text-2xl font-black text-emerald-600 font-mono">+{totalIn.toLocaleString()}</h3>
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-muted-foreground text-sm mb-1">الصادر</p>
            <div className="flex items-end justify-between">
              <h3 className="text-2xl font-black text-rose-600 font-mono">-{totalOut.toLocaleString()}</h3>
              <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center">
                <TrendingDown className="w-4 h-4 text-rose-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-muted-foreground text-sm mb-1">صافي الحركة</p>
            <div className="flex items-end justify-between">
              <h3
                className={`text-2xl font-black font-mono ${totalIn - totalOut >= 0 ? "text-emerald-600" : "text-rose-600"}`}
              >
                {(totalIn - totalOut).toLocaleString()}
              </h3>
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <Package className="w-4 h-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={movementsWithBalance}
        searchPlaceholder="بحث بالمنتج أو الملاحظات..."
        isLoading={isLoading}
        emptyMessage="لا توجد حركات مخزون"
        toolbarContent={
          <div className="flex gap-2 flex-wrap">
            <Popover open={productComboOpen} onOpenChange={setProductComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={productComboOpen}
                  className={cn(
                    "w-56 justify-between h-9 font-normal text-sm shadow-xs transition-colors hover:bg-accent/50",
                    selectedProduct === "all" && "text-muted-foreground",
                    productComboOpen && "ring-2 ring-ring/20 border-ring",
                  )}
                >
                  <span className="truncate flex-1 text-right">
                    {selectedProduct !== "all"
                      ? (() => {
                          const p = products.find((p) => p.id === selectedProduct);
                          return p ? `${p.code} - ${p.name}` : "جميع المنتجات";
                        })()
                      : "جميع المنتجات"}
                  </span>
                  <ChevronsUpDown className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0 shadow-lg border-border/80"
                align="start"
                sideOffset={5}
              >
                <Command dir="rtl" className="rounded-md">
                  <CommandInput placeholder="ابحث بالكود أو الاسم..." className="h-10 text-sm" />
                  <CommandList>
                    <CommandEmpty>
                      <div className="flex flex-col items-center gap-1.5">
                        <Search className="h-5 w-5 text-muted-foreground/40" />
                        <span>لا توجد نتائج</span>
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="جميع المنتجات"
                        onSelect={() => {
                          setSelectedProduct("all");
                          setProductComboOpen(false);
                        }}
                        className="gap-2.5"
                      >
                        <span className="flex-1">جميع المنتجات</span>
                        <Check
                          className={cn(
                            "mr-auto h-4 w-4 shrink-0 text-primary transition-opacity",
                            selectedProduct === "all" ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                      {products.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.code} ${p.name}`}
                          onSelect={() => {
                            setSelectedProduct(p.id);
                            setProductComboOpen(false);
                          }}
                          className="gap-2.5"
                        >
                          <span className="inline-flex items-center justify-center min-w-[3rem] rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            {p.code}
                          </span>
                          <span className="flex-1 truncate">{p.name}</span>
                          <Check
                            className={cn(
                              "mr-auto h-4 w-4 shrink-0 text-primary transition-opacity",
                              selectedProduct === p.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="جميع الأنواع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأنواع</SelectItem>
                {Object.entries(movementTypeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DatePickerInput value={dateFrom} onChange={setDateFrom} placeholder="من تاريخ" className="w-[150px]" />
            <DatePickerInput value={dateTo} onChange={setDateTo} placeholder="إلى تاريخ" className="w-[150px]" />
          </div>
        }
      />
    </div>
  );
}
