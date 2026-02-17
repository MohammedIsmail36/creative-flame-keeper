import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LookupCombobox } from "@/components/LookupCombobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, CreditCard } from "lucide-react";

interface Customer { id: string; code: string; name: string; balance?: number; }
interface Payment {
  id: string; payment_number: number; customer_id: string; customer_name?: string;
  payment_date: string; amount: number; payment_method: string; reference: string | null;
  notes: string | null; status: string;
}

const ACCOUNT_CODES = { CUSTOMERS: "1103", CASH: "1101", BANK: "1102" };

export default function CustomerPayments() {
  const { role } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [custRes, payRes] = await Promise.all([
      (supabase.from("customers" as any) as any).select("id, code, name, balance").eq("is_active", true).order("name"),
      (supabase.from("customer_payments" as any) as any).select("*, customers:customer_id(name)").order("payment_number", { ascending: false }),
    ]);
    setCustomers(custRes.data || []);
    setPayments((payRes.data || []).map((p: any) => ({ ...p, customer_name: p.customers?.name })));
    setLoading(false);
  }

  async function handleSubmit() {
    if (!customerId || amount <= 0) {
      toast({ title: "تنبيه", description: "يرجى اختيار العميل وإدخال المبلغ", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Get accounts
      const accountCode = paymentMethod === "cash" ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
      const { data: accounts } = await supabase.from("accounts").select("id, code").in("code", [ACCOUNT_CODES.CUSTOMERS, accountCode]);
      const customersAcc = accounts?.find(a => a.code === ACCOUNT_CODES.CUSTOMERS);
      const cashBankAcc = accounts?.find(a => a.code === accountCode);
      if (!customersAcc || !cashBankAcc) {
        toast({ title: "خطأ", description: "تأكد من وجود حسابات العملاء والصندوق/البنك", variant: "destructive" });
        setSaving(false);
        return;
      }

      // Create journal entry: Debit Cash/Bank, Credit Customers
      const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
        description: `تحصيل من عميل`, entry_date: paymentDate,
        total_debit: amount, total_credit: amount, status: "posted",
      } as any).select("id").single();
      if (jeError) throw jeError;

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je.id, account_id: cashBankAcc.id, debit: amount, credit: 0, description: `تحصيل من عميل` },
        { journal_entry_id: je.id, account_id: customersAcc.id, debit: 0, credit: amount, description: `سداد ذمم عملاء` },
      ] as any);

      // Create payment record
      await (supabase.from("customer_payments" as any) as any).insert({
        customer_id: customerId, payment_date: paymentDate, amount,
        payment_method: paymentMethod, reference: reference.trim() || null,
        notes: notes.trim() || null, journal_entry_id: je.id, status: "posted",
      });

      // Update customer balance
      const cust = customers.find(c => c.id === customerId);
      if (cust) {
        await (supabase.from("customers" as any) as any).update({ balance: (cust.balance || 0) - amount }).eq("id", customerId);
      }

      toast({ title: "تم التسجيل", description: "تم تسجيل السداد بنجاح" });
      setDialogOpen(false);
      resetForm();
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  function resetForm() {
    setCustomerId(""); setAmount(0); setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("cash"); setReference(""); setNotes("");
  }

  const methodLabels: Record<string, string> = { cash: "نقدي", bank: "تحويل بنكي", check: "شيك" };

  const filtered = payments.filter(p =>
    !search || p.customer_name?.includes(search) || String(p.payment_number).includes(search)
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">مدفوعات العملاء</h1>
            <p className="text-sm text-muted-foreground">{payments.length} عملية</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" />تسجيل سداد</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>تسجيل سداد عميل</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>العميل *</Label>
                <LookupCombobox items={customers} value={customerId} onValueChange={setCustomerId} placeholder="اختر العميل" />
                {customerId && <p className="text-xs text-muted-foreground">الرصيد: {customers.find(c => c.id === customerId)?.balance?.toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP</p>}
              </div>
              <div className="space-y-2">
                <Label>المبلغ *</Label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(+e.target.value)} className="font-mono" />
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
              <Button onClick={handleSubmit} disabled={saving} className="w-full">{saving ? "جاري الحفظ..." : "تسجيل السداد"}</Button>
            </div>
          </DialogContent>
        </Dialog>
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
                  <TableHead className="text-right">#</TableHead>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">طريقة الدفع</TableHead>
                  <TableHead className="text-right">المرجع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">لا توجد مدفوعات</TableCell></TableRow>
                ) : filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">#{p.payment_number}</TableCell>
                    <TableCell className="font-medium">{p.customer_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.payment_date}</TableCell>
                    <TableCell className="font-mono font-semibold">{p.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell><Badge variant="outline">{methodLabels[p.payment_method] || p.payment_method}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{p.reference || "—"}</TableCell>
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
