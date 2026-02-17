import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown, FileSpreadsheet, Users, Truck } from "lucide-react";
import { exportToExcel } from "@/lib/excel-export";
import { exportReportPdf } from "@/lib/report-pdf";

type EntityType = "customer" | "supplier";

interface Entity {
  id: string;
  code: string;
  name: string;
  balance: number;
}

interface StatementLine {
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export default function AccountStatement() {
  const { formatCurrency, settings } = useSettings();
  const [entityType, setEntityType] = useState<EntityType>("customer");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [entityName, setEntityName] = useState("");

  // Load entities list
  useEffect(() => {
    const fetch = async () => {
      const table = entityType === "customer" ? "customers" : "suppliers";
      const { data } = await supabase
        .from(table)
        .select("id, code, name, balance")
        .eq("is_active", true)
        .order("code");
      setEntities((data || []) as Entity[]);
      setSelectedEntity("");
      setLines([]);
    };
    fetch();
  }, [entityType]);

  const fetchStatement = async () => {
    if (!selectedEntity) return;
    setLoading(true);

    const entity = entities.find(e => e.id === selectedEntity);
    setEntityName(entity?.name || "");

    const allLines: StatementLine[] = [];

    if (entityType === "customer") {
      // Sales invoices
      let q = supabase
        .from("sales_invoices")
        .select("invoice_number, invoice_date, total, status")
        .eq("customer_id", selectedEntity)
        .eq("status", "posted")
        .order("invoice_date");
      if (dateFrom) q = q.gte("invoice_date", dateFrom);
      if (dateTo) q = q.lte("invoice_date", dateTo);
      const { data: invoices } = await q;

      (invoices || []).forEach(inv => {
        allLines.push({
          date: inv.invoice_date,
          type: "فاتورة مبيعات",
          reference: `#${inv.invoice_number}`,
          description: "فاتورة مبيعات",
          debit: Number(inv.total),
          credit: 0,
          runningBalance: 0,
        });
      });

      // Sales returns
      let qr = supabase
        .from("sales_returns")
        .select("return_number, return_date, total, status")
        .eq("customer_id", selectedEntity)
        .eq("status", "posted")
        .order("return_date");
      if (dateFrom) qr = qr.gte("return_date", dateFrom);
      if (dateTo) qr = qr.lte("return_date", dateTo);
      const { data: returns } = await qr;

      (returns || []).forEach(ret => {
        allLines.push({
          date: ret.return_date,
          type: "مرتجع مبيعات",
          reference: `#${ret.return_number}`,
          description: "مرتجع مبيعات",
          debit: 0,
          credit: Number(ret.total),
          runningBalance: 0,
        });
      });

      // Customer payments
      let qp = supabase
        .from("customer_payments")
        .select("payment_number, payment_date, amount, status")
        .eq("customer_id", selectedEntity)
        .eq("status", "posted")
        .order("payment_date");
      if (dateFrom) qp = qp.gte("payment_date", dateFrom);
      if (dateTo) qp = qp.lte("payment_date", dateTo);
      const { data: payments } = await qp;

      (payments || []).forEach(pay => {
        allLines.push({
          date: pay.payment_date,
          type: "سند قبض",
          reference: `#${pay.payment_number}`,
          description: "تحصيل من العميل",
          debit: 0,
          credit: Number(pay.amount),
          runningBalance: 0,
        });
      });
    } else {
      // Purchase invoices
      let q = supabase
        .from("purchase_invoices")
        .select("invoice_number, invoice_date, total, status")
        .eq("supplier_id", selectedEntity)
        .eq("status", "posted")
        .order("invoice_date");
      if (dateFrom) q = q.gte("invoice_date", dateFrom);
      if (dateTo) q = q.lte("invoice_date", dateTo);
      const { data: invoices } = await q;

      (invoices || []).forEach(inv => {
        allLines.push({
          date: inv.invoice_date,
          type: "فاتورة مشتريات",
          reference: `#${inv.invoice_number}`,
          description: "فاتورة مشتريات",
          debit: 0,
          credit: Number(inv.total),
          runningBalance: 0,
        });
      });

      // Purchase returns
      let qr = supabase
        .from("purchase_returns")
        .select("return_number, return_date, total, status")
        .eq("supplier_id", selectedEntity)
        .eq("status", "posted")
        .order("return_date");
      if (dateFrom) qr = qr.gte("return_date", dateFrom);
      if (dateTo) qr = qr.lte("return_date", dateTo);
      const { data: returns } = await qr;

      (returns || []).forEach(ret => {
        allLines.push({
          date: ret.return_date,
          type: "مرتجع مشتريات",
          reference: `#${ret.return_number}`,
          description: "مرتجع مشتريات",
          debit: Number(ret.total),
          credit: 0,
          runningBalance: 0,
        });
      });

      // Supplier payments
      let qp = supabase
        .from("supplier_payments")
        .select("payment_number, payment_date, amount, status")
        .eq("supplier_id", selectedEntity)
        .eq("status", "posted")
        .order("payment_date");
      if (dateFrom) qp = qp.gte("payment_date", dateFrom);
      if (dateTo) qp = qp.lte("payment_date", dateTo);
      const { data: payments } = await qp;

      (payments || []).forEach(pay => {
        allLines.push({
          date: pay.payment_date,
          type: "سند صرف",
          reference: `#${pay.payment_number}`,
          description: "دفعة للمورد",
          debit: Number(pay.amount),
          credit: 0,
          runningBalance: 0,
        });
      });
    }

    // Sort by date
    allLines.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate running balance
    let balance = 0;
    allLines.forEach(line => {
      balance += line.debit - line.credit;
      line.runningBalance = balance;
    });

    setLines(allLines);
    setLoading(false);
  };

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const finalBalance = totalDebit - totalCredit;

  const handleExportExcel = () => {
    exportToExcel({
      filename: `كشف_حساب_${entityName}`,
      sheetName: "كشف حساب",
      headers: ["التاريخ", "النوع", "المرجع", "البيان", "مدين", "دائن", "الرصيد"],
      rows: lines.map(l => [
        l.date, l.type, l.reference, l.description,
        l.debit || "", l.credit || "", l.runningBalance,
      ]),
    });
  };

  const handleExportPdf = () => {
    exportReportPdf({
      title: `كشف حساب: ${entityName}`,
      settings,
      headers: ["التاريخ", "النوع", "المرجع", "البيان", "مدين", "دائن", "الرصيد"],
      rows: lines.map(l => [
        l.date, l.type, l.reference, l.description,
        l.debit ? formatCurrency(l.debit) : "-",
        l.credit ? formatCurrency(l.credit) : "-",
        formatCurrency(Math.abs(l.runningBalance)) + (l.runningBalance >= 0 ? " مدين" : " دائن"),
      ]),
      summaryCards: [
        { label: "إجمالي المدين", value: formatCurrency(totalDebit) },
        { label: "إجمالي الدائن", value: formatCurrency(totalCredit) },
        { label: "الرصيد النهائي", value: formatCurrency(Math.abs(finalBalance)) + (finalBalance >= 0 ? " مدين" : " دائن") },
      ],
      orientation: "landscape",
      filename: `كشف_حساب_${entityName}`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <Label className="text-xs">نوع الحساب</Label>
              <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer"><span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />عميل</span></SelectItem>
                  <SelectItem value="supplier"><span className="flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" />مورد</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{entityType === "customer" ? "العميل" : "المورد"}</Label>
              <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                <SelectContent>
                  {entities.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.code} - {e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">من تاريخ</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">إلى تاريخ</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <Button onClick={fetchStatement} disabled={!selectedEntity || loading}>
              {loading ? "جاري التحميل..." : "عرض الكشف"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {lines.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">إجمالي المدين</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(totalDebit)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">إجمالي الدائن</p>
                <p className="text-xl font-bold text-warning">{formatCurrency(totalCredit)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">الرصيد النهائي</p>
                <p className={`text-xl font-bold ${finalBalance >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(Math.abs(finalBalance))} {finalBalance >= 0 ? "مدين" : "دائن"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Export buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <FileSpreadsheet className="w-4 h-4 ml-1" />Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPdf}>
              <FileDown className="w-4 h-4 ml-1" />PDF
            </Button>
          </div>

          {/* Table */}
          <Card>
            <CardHeader className="py-3 border-b bg-muted/30">
              <CardTitle className="text-base">كشف حساب: {entityName}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">المرجع</TableHead>
                    <TableHead className="text-right">البيان</TableHead>
                    <TableHead className="text-right">مدين</TableHead>
                    <TableHead className="text-right">دائن</TableHead>
                    <TableHead className="text-right">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{line.date}</TableCell>
                      <TableCell className="text-sm">{line.type}</TableCell>
                      <TableCell className="text-sm font-mono">{line.reference}</TableCell>
                      <TableCell className="text-sm">{line.description}</TableCell>
                      <TableCell className="text-sm">{line.debit ? formatCurrency(line.debit) : "-"}</TableCell>
                      <TableCell className="text-sm">{line.credit ? formatCurrency(line.credit) : "-"}</TableCell>
                      <TableCell className={`text-sm font-bold ${line.runningBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(Math.abs(line.runningBalance))} {line.runningBalance >= 0 ? "مدين" : "دائن"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="bg-muted/30 font-bold">
                    <TableCell colSpan={4} className="text-sm">الإجمالي</TableCell>
                    <TableCell className="text-sm">{formatCurrency(totalDebit)}</TableCell>
                    <TableCell className="text-sm">{formatCurrency(totalCredit)}</TableCell>
                    <TableCell className={`text-sm ${finalBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(Math.abs(finalBalance))} {finalBalance >= 0 ? "مدين" : "دائن"}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {lines.length === 0 && selectedEntity && !loading && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            اضغط "عرض الكشف" لعرض حركات الحساب
          </CardContent>
        </Card>
      )}
    </div>
  );
}
