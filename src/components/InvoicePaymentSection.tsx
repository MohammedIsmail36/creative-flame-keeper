import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { CreditCard, Plus, Link2, Unlink } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Allocation {
  id: string;
  payment_id: string;
  allocated_amount: number;
  payment_number: number;
  payment_date: string;
  payment_amount: number;
  payment_method: string;
  reference: string | null;
}

interface AvailablePayment {
  id: string;
  payment_number: number;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  total_allocated: number;
  remaining: number;
}

interface Props {
  type: "sales" | "purchase";
  invoiceId: string;
  entityId: string;
  entityName: string;
  invoiceTotal: number;
  invoiceNumber: number | null;
  onPaymentAdded: () => void;
}

const ACCOUNT_CODES = {
  CUSTOMERS: "1103",
  SUPPLIERS: "2101",
  CASH: "1101",
  BANK: "1102",
};

const methodLabels: Record<string, string> = { cash: "نقدي", bank: "تحويل بنكي", check: "شيك" };

export default function InvoicePaymentSection({ type, invoiceId, entityId, entityName, invoiceTotal, invoiceNumber, onPaymentAdded }: Props) {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [availablePayments, setAvailablePayments] = useState<AvailablePayment[]>([]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkAmounts, setLinkAmounts] = useState<Record<string, number>>({});

  // New payment form
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const isSales = type === "sales";
  const paymentTable = isSales ? "customer_payments" : "supplier_payments";
  const allocationTable = isSales ? "customer_payment_allocations" : "supplier_payment_allocations";
  const invoiceTable = isSales ? "sales_invoices" : "purchase_invoices";
  const entityIdCol = isSales ? "customer_id" : "supplier_id";
  const entityTable = isSales ? "customers" : "suppliers";

  useEffect(() => { fetchData(); }, [invoiceId, entityId]);

  async function fetchData() {
    setLoading(true);

    // 1. Fetch allocations for this invoice (with payment details)
    const { data: allocData } = await (supabase.from(allocationTable as any) as any)
      .select("id, payment_id, allocated_amount")
      .eq("invoice_id", invoiceId);

    let enrichedAllocations: Allocation[] = [];
    if (allocData && allocData.length > 0) {
      const paymentIds = allocData.map((a: any) => a.payment_id);
      const { data: payments } = await (supabase.from(paymentTable as any) as any)
        .select("id, payment_number, payment_date, amount, payment_method, reference")
        .in("id", paymentIds);

      const paymentMap = new Map((payments || []).map((p: any) => [p.id, p]));
      enrichedAllocations = allocData.map((a: any) => {
        const p = paymentMap.get(a.payment_id) || {};
        return {
          id: a.id,
          payment_id: a.payment_id,
          allocated_amount: a.allocated_amount,
          payment_number: (p as any).payment_number || 0,
          payment_date: (p as any).payment_date || "",
          payment_amount: (p as any).amount || 0,
          payment_method: (p as any).payment_method || "",
          reference: (p as any).reference || null,
        };
      });
    }

    // 2. Calculate paid amount from allocations
    const totalPaid = enrichedAllocations.reduce((s, a) => s + a.allocated_amount, 0);

    // 3. Fetch available payments (posted, same entity) with their remaining amounts
    const { data: entityPayments } = await (supabase.from(paymentTable as any) as any)
      .select("id, payment_number, payment_date, amount, payment_method, reference")
      .eq(entityIdCol, entityId)
      .eq("status", "posted")
      .order("payment_date");

    // Get all allocations for these payments to calculate remaining
    let available: AvailablePayment[] = [];
    if (entityPayments && entityPayments.length > 0) {
      const allPaymentIds = entityPayments.map((p: any) => p.id);
      const { data: allAllocs } = await (supabase.from(allocationTable as any) as any)
        .select("payment_id, allocated_amount")
        .in("payment_id", allPaymentIds);

      const allocByPayment = new Map<string, number>();
      (allAllocs || []).forEach((a: any) => {
        allocByPayment.set(a.payment_id, (allocByPayment.get(a.payment_id) || 0) + a.allocated_amount);
      });

      available = entityPayments
        .map((p: any) => {
          const totalAlloc = allocByPayment.get(p.id) || 0;
          return {
            ...p,
            total_allocated: totalAlloc,
            remaining: p.amount - totalAlloc,
          };
        })
        .filter((p: AvailablePayment) => p.remaining > 0);

      // Exclude payments already fully allocated to THIS invoice
      const thisInvoicePaymentIds = new Set(enrichedAllocations.map(a => a.payment_id));
      // Keep payments that either aren't allocated to this invoice, or have remaining
      available = available.filter(p => !thisInvoicePaymentIds.has(p.id) || p.remaining > 0);
      // Actually, if already allocated to this invoice, don't show again
      available = available.filter(p => !thisInvoicePaymentIds.has(p.id));
    }

    setAllocations(enrichedAllocations);
    setPaidAmount(totalPaid);
    setAvailablePayments(available);

    // Sync invoice paid_amount if it differs
    await (supabase.from(invoiceTable as any) as any)
      .update({ paid_amount: totalPaid })
      .eq("id", invoiceId);

    setLoading(false);
  }

  const remaining = invoiceTotal - paidAmount;

  // ========== Create new payment & allocate ==========
  async function handleNewPayment() {
    if (amount <= 0) {
      toast({ title: "تنبيه", description: "يرجى إدخال مبلغ صحيح", variant: "destructive" });
      return;
    }
    if (amount > remaining) {
      toast({ title: "تنبيه", description: "المبلغ أكبر من المتبقي على الفاتورة", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const entityAccCode = isSales ? ACCOUNT_CODES.CUSTOMERS : ACCOUNT_CODES.SUPPLIERS;
      const cashBankCode = paymentMethod === "cash" ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
      const { data: accounts } = await supabase.from("accounts").select("id, code").in("code", [entityAccCode, cashBankCode]);
      const entityAcc = accounts?.find(a => a.code === entityAccCode);
      const cashBankAcc = accounts?.find(a => a.code === cashBankCode);
      if (!entityAcc || !cashBankAcc) {
        toast({ title: "خطأ", description: "تأكد من وجود الحسابات المطلوبة في شجرة الحسابات", variant: "destructive" });
        setSaving(false);
        return;
      }

      const desc = isSales ? `تحصيل من عميل - فاتورة ${invoiceNumber}` : `سداد لمورد - فاتورة ${invoiceNumber}`;
      const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
        description: desc, entry_date: paymentDate,
        total_debit: amount, total_credit: amount, status: "posted",
      } as any).select("id").single();
      if (jeError) throw jeError;

      const lines = isSales
        ? [
            { journal_entry_id: je.id, account_id: cashBankAcc.id, debit: amount, credit: 0, description: desc },
            { journal_entry_id: je.id, account_id: entityAcc.id, debit: 0, credit: amount, description: `سداد ذمم عملاء` },
          ]
        : [
            { journal_entry_id: je.id, account_id: entityAcc.id, debit: amount, credit: 0, description: `سداد ذمم موردين` },
            { journal_entry_id: je.id, account_id: cashBankAcc.id, debit: 0, credit: amount, description: desc },
          ];
      await supabase.from("journal_entry_lines").insert(lines as any);

      // Insert payment
      const { data: newPayment } = await (supabase.from(paymentTable as any) as any).insert({
        [entityIdCol]: entityId,
        payment_date: paymentDate, amount,
        payment_method: paymentMethod,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        journal_entry_id: je.id, status: "posted",
      }).select("id").single();

      // Create allocation
      await (supabase.from(allocationTable as any) as any).insert({
        payment_id: newPayment.id,
        invoice_id: invoiceId,
        allocated_amount: amount,
      });

      // Update entity balance
      const { data: entity } = await (supabase.from(entityTable as any) as any).select("balance").eq("id", entityId).single();
      if (entity) {
        await (supabase.from(entityTable as any) as any).update({ balance: (entity.balance || 0) - amount }).eq("id", entityId);
      }

      toast({ title: "تم التسجيل", description: "تم تسجيل الدفعة وتخصيصها للفاتورة" });
      setDialogOpen(false);
      setAmount(0);
      setReference("");
      setNotes("");
      fetchData();
      onPaymentAdded();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  // ========== Link existing payment (create allocation) ==========
  async function linkPayment(payment: AvailablePayment, allocAmount: number) {
    const maxAlloc = Math.min(payment.remaining, remaining);
    if (allocAmount <= 0 || allocAmount > maxAlloc) {
      toast({ title: "تنبيه", description: `المبلغ يجب أن يكون بين 0.01 و ${maxAlloc.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, variant: "destructive" });
      return;
    }

    try {
      await (supabase.from(allocationTable as any) as any).insert({
        payment_id: payment.id,
        invoice_id: invoiceId,
        allocated_amount: allocAmount,
      });

      toast({
        title: "تم التخصيص",
        description: `تم تخصيص ${allocAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} من الدفعة #${payment.payment_number} للفاتورة`
      });
      setLinkAmounts({});
      fetchData();
      onPaymentAdded();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  // ========== Unlink (delete allocation) ==========
  async function unlinkAllocation(allocation: Allocation) {
    try {
      await (supabase.from(allocationTable as any) as any)
        .delete()
        .eq("id", allocation.id);

      toast({ title: "تم فك التخصيص", description: `تم فك تخصيص ${allocation.allocated_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} من الدفعة #${allocation.payment_number}` });
      fetchData();
      onPaymentAdded();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  if (loading) return null;

  const isPaid = remaining <= 0;
  const statusText = isPaid ? "مدفوعة بالكامل" : paidAmount > 0 ? "مسدد جزئياً" : "غير مدفوعة";
  const statusVariant = isPaid ? "default" : paidAmount > 0 ? "secondary" : "destructive";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">المدفوعات</CardTitle>
            <Badge variant={statusVariant as any}>{statusText}</Badge>
          </div>
          {!isPaid && (
            <div className="flex gap-2">
              {availablePayments.length > 0 && (
                <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1"><Link2 className="h-3.5 w-3.5" />تخصيص دفعة</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg" dir="rtl">
                    <DialogHeader><DialogTitle>تخصيص دفعات موجودة - {entityName}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm bg-muted/50 p-3 rounded-lg">
                        <span>إجمالي الفاتورة: <strong className="font-mono">{invoiceTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
                        <span>المتبقي: <strong className="font-mono text-destructive">{remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">#</TableHead>
                            <TableHead className="text-right">التاريخ</TableHead>
                            <TableHead className="text-right">المبلغ</TableHead>
                            <TableHead className="text-right">المتاح</TableHead>
                            <TableHead className="text-right">التخصيص</TableHead>
                            <TableHead className="text-right w-16"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {availablePayments.map(p => {
                            const maxAlloc = Math.min(p.remaining, remaining);
                            const currentVal = linkAmounts[p.id] ?? maxAlloc;
                            return (
                              <TableRow key={p.id}>
                                <TableCell className="font-mono">#{p.payment_number}</TableCell>
                                <TableCell className="text-muted-foreground text-xs">{p.payment_date}</TableCell>
                                <TableCell className="font-mono text-xs">{p.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="font-mono text-xs text-primary">{p.remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={0.01}
                                    max={maxAlloc}
                                    step="0.01"
                                    value={currentVal}
                                    onChange={e => setLinkAmounts({ ...linkAmounts, [p.id]: +e.target.value })}
                                    className="font-mono h-8 w-24"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Button size="sm" variant="outline" onClick={() => linkPayment(p, currentVal)} className="text-xs h-8">
                                    تخصيص
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1"><Plus className="h-3.5 w-3.5" />دفعة جديدة</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md" dir="rtl">
                  <DialogHeader><DialogTitle>تسجيل دفعة جديدة - {entityName}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="flex justify-between text-sm bg-muted/50 p-3 rounded-lg">
                      <span>إجمالي الفاتورة: <strong className="font-mono">{invoiceTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
                      <span>المتبقي: <strong className="font-mono text-destructive">{remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
                    </div>
                    <div className="space-y-2">
                      <Label>المبلغ *</Label>
                      <Input type="number" min="0" max={remaining} step="0.01" value={amount} onChange={e => setAmount(+e.target.value)} className="font-mono" />
                    </div>
                    <div className="space-y-2">
                      <Label>التاريخ</Label>
                      <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>طريقة الدفع</Label>
                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">نقدي</SelectItem>
                          <SelectItem value="bank">تحويل بنكي</SelectItem>
                          <SelectItem value="check">شيك</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>مرجع</Label>
                      <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="رقم إيصال أو شيك" />
                    </div>
                    <div className="space-y-2">
                      <Label>ملاحظات</Label>
                      <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
                    </div>
                    <Button onClick={handleNewPayment} disabled={saving} className="w-full">{saving ? "جاري الحفظ..." : "تسجيل الدفعة"}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payment summary bar */}
        <div className="flex items-center gap-3 text-sm">
          <span>المدفوع: <strong className="font-mono">{paidAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
          <span className="text-muted-foreground">من</span>
          <span><strong className="font-mono">{invoiceTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
          {!isPaid && <span className="text-destructive">المتبقي: <strong className="font-mono">{remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>}
        </div>
        {paidAmount > 0 && (
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${Math.min((paidAmount / invoiceTotal) * 100, 100)}%` }} />
          </div>
        )}

        {/* Allocations table */}
        {allocations.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الدفعة</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">مبلغ الدفعة</TableHead>
                <TableHead className="text-right">المخصص</TableHead>
                <TableHead className="text-right">الطريقة</TableHead>
                <TableHead className="text-right w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono">#{a.payment_number}</TableCell>
                  <TableCell className="text-muted-foreground">{a.payment_date}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{a.payment_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="font-mono font-semibold text-primary">{a.allocated_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell><Badge variant="outline">{methodLabels[a.payment_method] || a.payment_method}</Badge></TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="gap-1 text-xs text-destructive hover:text-destructive">
                          <Unlink className="h-3 w-3" />فك
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent dir="rtl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>فك تخصيص الدفعة</AlertDialogTitle>
                          <AlertDialogDescription>
                            هل تريد فك تخصيص {a.allocated_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} من الدفعة #{a.payment_number} من هذه الفاتورة؟
                            سيعود المبلغ متاحاً للتخصيص على فواتير أخرى. الدفعة الأصلية والقيد المحاسبي لن يتأثرا.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-row-reverse gap-2">
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction onClick={() => unlinkAllocation(a)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">فك التخصيص</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Available payments hint */}
        {!isPaid && availablePayments.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Link2 className="h-4 w-4" />
              يوجد {availablePayments.length} دفعة متاحة للتخصيص بإجمالي {availablePayments.reduce((s, p) => s + p.remaining, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}

        {allocations.length === 0 && availablePayments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">لا توجد دفعات مسجلة أو متاحة لهذه الفاتورة</p>
        )}
      </CardContent>
    </Card>
  );
}
