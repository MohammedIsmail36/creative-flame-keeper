import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ReceiptText, Check, Unlink } from "lucide-react";

interface OutstandingReturn {
  id: string;
  return_number: number;
  posted_number: number | null;
  return_date: string;
  total: number;
  settled_total: number;
  remaining: number;
}

interface ExistingSettlement {
  id: string;
  return_id: string;
  return_number: number;
  posted_number: number | null;
  return_date: string;
  return_total: number;
  settled_amount: number;
}

interface Props {
  type: "sales" | "purchase";
  invoiceId: string;
  entityId: string;
  invoiceTotal: number;
  paidAmount: number;
  onSettlementChanged: () => void;
}

export default function OutstandingCreditsSection({ type, invoiceId, entityId, invoiceTotal, paidAmount, onSettlementChanged }: Props) {
  const [outstandingReturns, setOutstandingReturns] = useState<OutstandingReturn[]>([]);
  const [existingSettlements, setExistingSettlements] = useState<ExistingSettlement[]>([]);
  const [applyAmounts, setApplyAmounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [settlementTotal, setSettlementTotal] = useState(0);

  const isSales = type === "sales";
  const returnsTable = isSales ? "sales_returns" : "purchase_returns";
  const settlementTable = isSales ? "sales_invoice_return_settlements" : "purchase_invoice_return_settlements";
  const entityIdCol = isSales ? "customer_id" : "supplier_id";
  const invoiceRefCol = isSales ? "sales_invoice_id" : "purchase_invoice_id";
  const entityTable = isSales ? "customers" : "suppliers";

  useEffect(() => { fetchData(); }, [invoiceId, entityId]);

  async function fetchData() {
    setLoading(true);

    // 1. Get existing settlements for THIS invoice
    const { data: settlements } = await (supabase.from(settlementTable as any) as any)
      .select("id, return_id, settled_amount")
      .eq("invoice_id", invoiceId);

    let enrichedSettlements: ExistingSettlement[] = [];
    const settledReturnIds = new Set<string>();
    let totalSettled = 0;

    if (settlements && settlements.length > 0) {
      const returnIds = settlements.map((s: any) => s.return_id);
      const { data: returns } = await (supabase.from(returnsTable as any) as any)
        .select("id, return_number, posted_number, return_date, total")
        .in("id", returnIds);

      const returnMap = new Map((returns || []).map((r: any) => [r.id, r]));
      enrichedSettlements = settlements.map((s: any) => {
        const r = returnMap.get(s.return_id) || {};
        settledReturnIds.add(s.return_id);
        totalSettled += s.settled_amount;
        return {
          id: s.id,
          return_id: s.return_id,
          return_number: (r as any).return_number || 0,
          posted_number: (r as any).posted_number || null,
          return_date: (r as any).return_date || "",
          return_total: (r as any).total || 0,
          settled_amount: s.settled_amount,
        };
      });
    }

    setSettlementTotal(totalSettled);

    // 2. Get all posted returns for this entity
    const { data: allReturns } = await (supabase.from(returnsTable as any) as any)
      .select("id, return_number, posted_number, return_date, total")
      .eq(entityIdCol, entityId)
      .eq("status", "posted")
      .order("return_date");

    // 3. For each return, calculate how much has been settled across ALL invoices
    let outstanding: OutstandingReturn[] = [];
    if (allReturns && allReturns.length > 0) {
      const allReturnIds = allReturns.map((r: any) => r.id);
      const { data: allSettlements } = await (supabase.from(settlementTable as any) as any)
        .select("return_id, settled_amount")
        .in("return_id", allReturnIds);

      // Also check payment allocations for returns (from the payment system)
      const returnAllocTable = isSales ? "sales_return_payment_allocations" : "purchase_return_payment_allocations";
      const { data: returnPayAllocs } = await (supabase.from(returnAllocTable as any) as any)
        .select("return_id, allocated_amount")
        .in("return_id", allReturnIds);

      const settledByReturn = new Map<string, number>();
      (allSettlements || []).forEach((s: any) => {
        settledByReturn.set(s.return_id, (settledByReturn.get(s.return_id) || 0) + s.settled_amount);
      });
      // Also count payment allocations as settled
      (returnPayAllocs || []).forEach((a: any) => {
        settledByReturn.set(a.return_id, (settledByReturn.get(a.return_id) || 0) + a.allocated_amount);
      });

      outstanding = allReturns
        .map((r: any) => {
          const settledTotal = settledByReturn.get(r.id) || 0;
          return {
            id: r.id,
            return_number: r.return_number,
            posted_number: r.posted_number,
            return_date: r.return_date,
            total: r.total,
            settled_total: settledTotal,
            remaining: r.total - settledTotal,
          };
        })
        .filter((r: OutstandingReturn) => r.remaining > 0.01 && !settledReturnIds.has(r.id));
    }

    setExistingSettlements(enrichedSettlements);
    setOutstandingReturns(outstanding);
    setLoading(false);
  }

  const invoiceRemaining = invoiceTotal - paidAmount - settlementTotal;

  async function applyReturn(ret: OutstandingReturn) {
    const amount = applyAmounts[ret.id] ?? Math.min(ret.remaining, invoiceRemaining);
    const maxAmount = Math.min(ret.remaining, invoiceRemaining);

    if (amount <= 0 || amount > maxAmount + 0.01) {
      toast({ title: "تنبيه", description: `المبلغ يجب أن يكون بين 0.01 و ${maxAmount.toFixed(2)}`, variant: "destructive" });
      return;
    }

    try {
      // 1. Create settlement record
      await (supabase.from(settlementTable as any) as any).insert({
        invoice_id: invoiceId,
        return_id: ret.id,
        settled_amount: amount,
      });

      // 2. Update invoice paid_amount
      await (supabase.from(isSales ? "sales_invoices" : "purchase_invoices" as any) as any)
        .update({ paid_amount: paidAmount + settlementTotal + amount })
        .eq("id", invoiceId);

      toast({
        title: "تم التسوية",
        description: `تم تطبيق ${amount.toFixed(2)} من المرتجع #${ret.posted_number || ret.return_number} على الفاتورة`
      });
      setApplyAmounts({});
      fetchData();
      onSettlementChanged();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function removeSettlement(settlement: ExistingSettlement) {
    try {
      await (supabase.from(settlementTable as any) as any)
        .delete()
        .eq("id", settlement.id);

      // Update invoice paid_amount
      await (supabase.from(isSales ? "sales_invoices" : "purchase_invoices" as any) as any)
        .update({ paid_amount: paidAmount + settlementTotal - settlement.settled_amount })
        .eq("id", invoiceId);

      toast({ title: "تم إلغاء التسوية", description: `تم إلغاء تسوية المرتجع #${settlement.posted_number || settlement.return_number}` });
      fetchData();
      onSettlementChanged();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  if (loading) return null;
  if (outstandingReturns.length === 0 && existingSettlements.length === 0) return null;

  const sectionTitle = isSales ? "أرصدة دائنة معلقة (مرتجعات)" : "أرصدة مدينة معلقة (مرتجعات)";
  const prefix = isSales ? "SRN-" : "PRN-";

  return (
    <Card className="border-dashed border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">{sectionTitle}</CardTitle>
          {settlementTotal > 0 && (
            <Badge variant="secondary">مسوى: {settlementTotal.toFixed(2)}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {isSales
            ? "مرتجعات مبيعات لنفس العميل يمكن تطبيقها كتسوية على هذه الفاتورة بدلاً من إنشاء سند دفع منفصل"
            : "مرتجعات مشتريات لنفس المورد يمكن تطبيقها كتسوية على هذه الفاتورة بدلاً من إنشاء سند دفع منفصل"
          }
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing settlements */}
        {existingSettlements.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">التسويات المطبقة</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المرتجع</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">مبلغ المرتجع</TableHead>
                  <TableHead className="text-right">المبلغ المسوى</TableHead>
                  <TableHead className="text-right w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {existingSettlements.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono">
                      {prefix}{s.posted_number || s.return_number}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.return_date}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{s.return_total.toFixed(2)}</TableCell>
                    <TableCell className="font-mono font-semibold text-primary">{s.settled_amount.toFixed(2)}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="gap-1 text-xs text-destructive hover:text-destructive">
                            <Unlink className="h-3 w-3" />إلغاء
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent dir="rtl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>إلغاء تسوية المرتجع</AlertDialogTitle>
                            <AlertDialogDescription>
                              هل تريد إلغاء تسوية {s.settled_amount.toFixed(2)} من المرتجع #{s.posted_number || s.return_number} من هذه الفاتورة؟
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex-row-reverse gap-2">
                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeSettlement(s)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">إلغاء التسوية</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Outstanding returns available to apply */}
        {outstandingReturns.length > 0 && invoiceRemaining > 0.01 && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">مرتجعات متاحة للتسوية</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المرتجع</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">المبلغ الكلي</TableHead>
                  <TableHead className="text-right">المتاح</TableHead>
                  <TableHead className="text-right">مبلغ التسوية</TableHead>
                  <TableHead className="text-right w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstandingReturns.map(r => {
                  const maxAmount = Math.min(r.remaining, invoiceRemaining);
                  const currentVal = applyAmounts[r.id] ?? maxAmount;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">
                        {prefix}{r.posted_number || r.return_number}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{r.return_date}</TableCell>
                      <TableCell className="font-mono text-xs">{r.total.toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-xs text-primary">{r.remaining.toFixed(2)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0.01}
                          max={maxAmount}
                          step="0.01"
                          value={currentVal}
                          onChange={e => setApplyAmounts({ ...applyAmounts, [r.id]: +e.target.value })}
                          className="font-mono h-8 w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => applyReturn(r)} className="text-xs h-8 gap-1">
                          <Check className="h-3 w-3" />تطبيق
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
