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
import { CreditCard, Plus, Link2 } from "lucide-react";

interface Payment {
  id: string;
  payment_number: number;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  notes: string | null;
}

interface UnlinkedPayment extends Payment {
  remaining?: number;
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
  const [linkedPayments, setLinkedPayments] = useState<Payment[]>([]);
  const [unlinkedPayments, setUnlinkedPayments] = useState<UnlinkedPayment[]>([]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // New payment form
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => { fetchPayments(); }, [invoiceId, entityId]);

  const isSales = type === "sales";
  const paymentTable = isSales ? "customer_payments" : "supplier_payments";
  const invoiceTable = isSales ? "sales_invoices" : "purchase_invoices";
  const invoiceIdCol = isSales ? "sales_invoice_id" : "purchase_invoice_id";
  const entityIdCol = isSales ? "customer_id" : "supplier_id";
  const entityTable = isSales ? "customers" : "suppliers";

  async function fetchPayments() {
    setLoading(true);
    // Fetch linked payments for this invoice
    const { data: linked } = await (supabase.from(paymentTable as any) as any)
      .select("id, payment_number, payment_date, amount, payment_method, reference, notes")
      .eq(invoiceIdCol, invoiceId)
      .order("payment_date");

    // Fetch unlinked payments for same entity (no invoice linked)
    const { data: unlinked } = await (supabase.from(paymentTable as any) as any)
      .select("id, payment_number, payment_date, amount, payment_method, reference, notes")
      .eq(entityIdCol, entityId)
      .is(invoiceIdCol, null)
      .eq("status", "posted")
      .order("payment_date");

    // Get current paid_amount from invoice
    const { data: inv } = await (supabase.from(invoiceTable as any) as any)
      .select("paid_amount")
      .eq("id", invoiceId)
      .single();

    setLinkedPayments(linked || []);
    setUnlinkedPayments(unlinked || []);
    setPaidAmount(inv?.paid_amount || 0);
    setLoading(false);
  }

  const remaining = invoiceTotal - paidAmount;

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

      // Insert payment linked to invoice
      await (supabase.from(paymentTable as any) as any).insert({
        [entityIdCol]: entityId,
        [invoiceIdCol]: invoiceId,
        payment_date: paymentDate, amount,
        payment_method: paymentMethod,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        journal_entry_id: je.id, status: "posted",
      });

      // Update invoice paid_amount
      const newPaid = paidAmount + amount;
      await (supabase.from(invoiceTable as any) as any).update({ paid_amount: newPaid }).eq("id", invoiceId);

      // Update entity balance
      const { data: entity } = await (supabase.from(entityTable as any) as any).select("balance").eq("id", entityId).single();
      if (entity) {
        await (supabase.from(entityTable as any) as any).update({ balance: (entity.balance || 0) - amount }).eq("id", entityId);
      }

      toast({ title: "تم التسجيل", description: "تم تسجيل الدفعة وربطها بالفاتورة" });
      setDialogOpen(false);
      setAmount(0);
      setReference("");
      setNotes("");
      fetchPayments();
      onPaymentAdded();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function linkExistingPayment(payment: UnlinkedPayment) {
    const linkAmount = Math.min(payment.amount, remaining);
    if (linkAmount <= 0) return;

    try {
      // Link the payment to this invoice
      await (supabase.from(paymentTable as any) as any)
        .update({ [invoiceIdCol]: invoiceId })
        .eq("id", payment.id);

      // Update invoice paid_amount
      const newPaid = paidAmount + linkAmount;
      await (supabase.from(invoiceTable as any) as any).update({ paid_amount: newPaid }).eq("id", invoiceId);

      toast({ title: "تم الربط", description: `تم ربط الدفعة #${payment.payment_number} بالفاتورة` });
      fetchPayments();
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
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1"><Plus className="h-3.5 w-3.5" />تسجيل دفعة</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md" dir="rtl">
                <DialogHeader><DialogTitle>تسجيل دفعة - {entityName}</DialogTitle></DialogHeader>
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

        {/* Linked payments table */}
        {linkedPayments.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">#</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">المبلغ</TableHead>
                <TableHead className="text-right">الطريقة</TableHead>
                <TableHead className="text-right">المرجع</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linkedPayments.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono">#{p.payment_number}</TableCell>
                  <TableCell className="text-muted-foreground">{p.payment_date}</TableCell>
                  <TableCell className="font-mono font-semibold">{p.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell><Badge variant="outline">{methodLabels[p.payment_method] || p.payment_method}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{p.reference || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Unlinked payments available for allocation */}
        {!isPaid && unlinkedPayments.length > 0 && (
          <div className="border-t pt-4 space-y-2">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Link2 className="h-4 w-4" />
              دفعات غير مرتبطة بفواتير ({isSales ? entityName : entityName})
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">#</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">الطريقة</TableHead>
                  <TableHead className="text-right w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unlinkedPayments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">#{p.payment_number}</TableCell>
                    <TableCell className="text-muted-foreground">{p.payment_date}</TableCell>
                    <TableCell className="font-mono font-semibold">{p.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell><Badge variant="outline">{methodLabels[p.payment_method] || p.payment_method}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => linkExistingPayment(p)} className="gap-1 text-xs">
                        <Link2 className="h-3 w-3" />ربط
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {linkedPayments.length === 0 && unlinkedPayments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">لا توجد دفعات مسجلة لهذه الفاتورة</p>
        )}
      </CardContent>
    </Card>
  );
}
