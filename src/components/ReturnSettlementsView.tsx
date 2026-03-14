import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Settlement {
  id: string;
  invoice_id: string;
  invoice_number: number;
  posted_number: number | null;
  invoice_date: string;
  invoice_total: number;
  settled_amount: number;
}

interface Props {
  type: "sales" | "purchase";
  returnId: string;
  returnTotal: number;
}

export default function ReturnSettlementsView({ type, returnId, returnTotal }: Props) {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [paymentAllocTotal, setPaymentAllocTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const isSales = type === "sales";
  const settlementTable = isSales ? "sales_invoice_return_settlements" : "purchase_invoice_return_settlements";
  const invoiceTable = isSales ? "sales_invoices" : "purchase_invoices";
  const payAllocTable = isSales ? "sales_return_payment_allocations" : "purchase_return_payment_allocations";
  const invoicePrefix = isSales ? "INV-" : "PINV-";
  const invoiceRoute = isSales ? "/sales" : "/purchases";

  useEffect(() => {
    fetchSettlements();
  }, [returnId]);

  async function fetchSettlements() {
    setLoading(true);

    // Fetch settlements and payment allocations in parallel
    const [{ data: settlementsData }, { data: payAllocs }] = await Promise.all([
      (supabase.from(settlementTable as any) as any)
        .select("id, invoice_id, settled_amount")
        .eq("return_id", returnId),
      (supabase.from(payAllocTable as any) as any)
        .select("allocated_amount")
        .eq("return_id", returnId),
    ]);

    const payTotal = (payAllocs || []).reduce((s: number, a: any) => s + Number(a.allocated_amount), 0);
    setPaymentAllocTotal(payTotal);

    if (!settlementsData || settlementsData.length === 0) {
      setSettlements([]);
      setLoading(false);
      return;
    }

    const invoiceIds = settlementsData.map((s: any) => s.invoice_id);
    const { data: invoices } = await (supabase.from(invoiceTable as any) as any)
      .select("id, invoice_number, posted_number, invoice_date, total")
      .in("id", invoiceIds);

    const invoiceMap = new Map((invoices || []).map((inv: any) => [inv.id, inv]));

    const enriched: Settlement[] = settlementsData.map((s: any) => {
      const inv = invoiceMap.get(s.invoice_id) || {} as any;
      return {
        id: s.id,
        invoice_id: s.invoice_id,
        invoice_number: inv.invoice_number || 0,
        posted_number: inv.posted_number || null,
        invoice_date: inv.invoice_date || "",
        invoice_total: inv.total || 0,
        settled_amount: s.settled_amount,
      };
    });

    setSettlements(enriched);
    setLoading(false);
  }

  if (loading) return null;
  if (settlements.length === 0) return null;

  const totalSettled = settlements.reduce((s, r) => s + r.settled_amount, 0);
  const totalCovered = totalSettled + paymentAllocTotal;
  const remaining = returnTotal - totalCovered;

  return (
    <Card className="border-dashed border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">تسويات مطبقة على فواتير</CardTitle>
          <Badge variant="secondary">مسوّى: {totalSettled.toFixed(2)}</Badge>
          {remaining <= 0.01 && (
            <Badge variant="default">مسوّى بالكامل</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {isSales
            ? "هذا المرتجع تم تطبيقه كتسوية على الفواتير التالية"
            : "هذا المرتجع تم تطبيقه كتسوية على الفواتير التالية"
          }
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الفاتورة</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">مبلغ الفاتورة</TableHead>
              <TableHead className="text-right">المبلغ المسوّى</TableHead>
              <TableHead className="text-right w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settlements.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-mono">
                  {invoicePrefix}{s.posted_number || s.invoice_number}
                </TableCell>
                <TableCell className="text-muted-foreground">{s.invoice_date}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{s.invoice_total.toFixed(2)}</TableCell>
                <TableCell className="font-mono font-semibold text-primary">{s.settled_amount.toFixed(2)}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => navigate(`${invoiceRoute}/${s.invoice_id}`)}
                  >
                    عرض الفاتورة
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Summary */}
        <div className="mt-3 flex items-center gap-4 text-sm border-t pt-3">
          <span className="text-muted-foreground">إجمالي المرتجع: <span className="font-mono font-medium text-foreground">{returnTotal.toFixed(2)}</span></span>
          <span className="text-muted-foreground">تسويات: <span className="font-mono font-medium text-primary">{totalSettled.toFixed(2)}</span></span>
          {paymentAllocTotal > 0 && (
            <span className="text-muted-foreground">مدفوعات: <span className="font-mono font-medium text-primary">{paymentAllocTotal.toFixed(2)}</span></span>
          )}
          <span className="text-muted-foreground">المتبقي: <span className="font-mono font-medium text-foreground">{Math.max(remaining, 0).toFixed(2)}</span></span>
        </div>
      </CardContent>
    </Card>
  );
}
