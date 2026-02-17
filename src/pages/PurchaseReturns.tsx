import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, RotateCcw, Eye } from "lucide-react";

interface Return {
  id: string; return_number: number; supplier_id: string | null; supplier_name?: string;
  return_date: string; status: string; total: number;
}

export default function PurchaseReturns() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const canEdit = role === "admin" || role === "accountant";

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const { data } = await (supabase.from("purchase_returns" as any) as any)
      .select("*, suppliers:supplier_id(name)").order("return_number", { ascending: false });
    setReturns((data || []).map((r: any) => ({ ...r, supplier_name: r.suppliers?.name })));
    setLoading(false);
  }

  const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل", cancelled: "ملغي" };
  const statusColors: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

  const filtered = returns.filter(r => {
    const matchSearch = !search || r.supplier_name?.includes(search) || String(r.return_number).includes(search);
    return matchSearch;
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <RotateCcw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">مرتجعات المشتريات</h1>
            <p className="text-sm text-muted-foreground">{returns.length} مرتجع</p>
          </div>
        </div>
        {canEdit && <Button onClick={() => navigate("/purchase-returns/new")} className="gap-2"><Plus className="h-4 w-4" />مرتجع جديد</Button>}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
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
                  <TableHead className="text-right">رقم المرتجع</TableHead>
                  <TableHead className="text-right">المورد</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right w-[80px]">عرض</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">لا توجد مرتجعات</TableCell></TableRow>
                ) : filtered.map(r => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/purchase-returns/${r.id}`)}>
                    <TableCell className="font-mono">#{r.return_number}</TableCell>
                    <TableCell className="font-medium">{r.supplier_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.return_date}</TableCell>
                    <TableCell className="font-mono">{r.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell><Badge variant={statusColors[r.status] as any}>{statusLabels[r.status]}</Badge></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); navigate(`/purchase-returns/${r.id}`); }}>
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
