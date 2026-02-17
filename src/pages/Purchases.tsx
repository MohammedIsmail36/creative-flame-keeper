import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, ShoppingCart, Eye } from "lucide-react";

interface Invoice {
  id: string; invoice_number: number; supplier_id: string | null; supplier_name?: string;
  invoice_date: string; status: string; subtotal: number; discount: number; tax: number; total: number; paid_amount: number; notes: string | null;
}

export default function Purchases() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const canEdit = role === "admin" || role === "accountant";

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const { data } = await (supabase.from("purchase_invoices" as any) as any)
      .select("*, suppliers:supplier_id(name)").order("invoice_number", { ascending: false });
    setInvoices((data || []).map((inv: any) => ({ ...inv, supplier_name: inv.suppliers?.name })));
    setLoading(false);
  }

  const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل", cancelled: "ملغي" };
  const statusColors: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

  const filtered = invoices.filter(inv => {
    const matchSearch = !search || inv.supplier_name?.includes(search) || String(inv.invoice_number).includes(search);
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">فواتير الشراء</h1>
            <p className="text-sm text-muted-foreground">{invoices.length} فاتورة</p>
          </div>
        </div>
        {canEdit && <Button onClick={() => navigate("/purchases/new")} className="gap-2"><Plus className="h-4 w-4" />فاتورة جديدة</Button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "الكل", value: invoices.length, filter: "all" },
          { label: "مسودة", value: invoices.filter(i => i.status === "draft").length, filter: "draft" },
          { label: "مُرحّل", value: invoices.filter(i => i.status === "posted").length, filter: "posted" },
          { label: "إجمالي المشتريات", value: invoices.filter(i => i.status === "posted").reduce((s, i) => s + i.total, 0).toLocaleString("en-US", { minimumFractionDigits: 2 }) + " EGP", filter: "" },
        ].map(({ label, value, filter }) => (
          <button key={label} onClick={() => filter && setStatusFilter(filter)}
            className={`rounded-xl border p-3 text-right bg-card transition-all hover:shadow-md ${statusFilter === filter ? "ring-2 ring-primary" : ""}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold text-foreground mt-1">{value}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث برقم الفاتورة أو اسم المورد..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الفاتورة</TableHead>
                  <TableHead className="text-right">المورد</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right w-[80px]">عرض</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">لا توجد فواتير</TableCell></TableRow>
                ) : filtered.map(inv => (
                  <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/purchases/${inv.id}`)}>
                    <TableCell className="font-mono">#{inv.invoice_number}</TableCell>
                    <TableCell className="font-medium">{inv.supplier_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{inv.invoice_date}</TableCell>
                    <TableCell className="font-mono">{inv.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Badge variant={statusColors[inv.status] as any}>{statusLabels[inv.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); navigate(`/purchases/${inv.id}`); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
