import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard, StatGrid } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";
import { ACCOUNT_CODES } from "@/lib/constants";
import {
  checkEntityBalances,
  checkInventoryValue,
  checkJournalBalance,
  checkOrphanEntries,
  checkPostedNumberSequence,
  checkProductQuantities,
  computeExpectedEntityBalances,
  summarizeChecks,
  type CheckResult,
} from "@/lib/reconciliation";

const num = (v: unknown) => Number(v ?? 0);

/** جلب كل الصفوف على دفعات (تجاوز حد 1000 صف) */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunk = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 60; page += 1) {
    const from = page * chunk;
    const { data, error } = await build(from, from + chunk - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < chunk) break;
  }
  return out;
}

export default function SystemHealthPage() {
  const { formatCurrency } = useSettings();
  const [loading, setLoading] = useState(true);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [inventoryValues, setInventoryValues] = useState({ ledger: 0, computed: 0 });
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        products,
        movements,
        entries,
        lines,
        customers,
        suppliers,
        salesInvoices,
        purchaseInvoices,
        salesReturns,
        purchaseReturns,
        customerPayments,
        supplierPayments,
        salesReturnAllocs,
        purchaseReturnAllocs,
        balancesRes,
      ] = await Promise.all([
        fetchAll<any>((f, t) =>
          supabase
            .from("products")
            .select("id, code, name, quantity_on_hand, purchase_price")
            .range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase
            .from("inventory_movements")
            .select("product_id, movement_type, quantity, total_cost, movement_date")
            .range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase
            .from("journal_entries")
            .select("id, entry_number, posted_number, total_debit, total_credit, status")
            .range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase
            .from("journal_entry_lines")
            .select("journal_entry_id, debit, credit")
            .range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase.from("customers").select("id, code, name, balance, opening_balance").range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase.from("suppliers").select("id, code, name, balance, opening_balance").range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase
            .from("sales_invoices")
            .select("id, customer_id, total, status, posted_number")
            .range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase
            .from("purchase_invoices")
            .select("id, supplier_id, total, status, posted_number")
            .range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase
            .from("sales_returns")
            .select("id, customer_id, total, status, posted_number")
            .range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase
            .from("purchase_returns")
            .select("id, supplier_id, total, status, posted_number")
            .range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase
            .from("customer_payments")
            .select("id, customer_id, amount, status, posted_number")
            .range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase
            .from("supplier_payments")
            .select("id, supplier_id, amount, status, posted_number")
            .range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase
            .from("sales_return_payment_allocations")
            .select("payment_id, allocated_amount")
            .range(f, t),
        ),
        fetchAll<any>((f, t) =>
          supabase
            .from("purchase_return_payment_allocations")
            .select("payment_id, allocated_amount")
            .range(f, t),
        ),
        (supabase.rpc as any)("get_account_balances", { p_only_with_activity: false }),
      ]);

      // رصيد حساب المخزون من دفتر الأستاذ
      const balanceRows: any[] = Array.isArray(balancesRes?.data)
        ? balancesRes.data
        : (balancesRes?.data?.accounts ?? []);
      const inventoryRow = balanceRows.find(
        (r: any) => String(r.code ?? r.account_code) === ACCOUNT_CODES.INVENTORY,
      );
      const ledgerInventory =
        num(inventoryRow?.balance) ||
        num(inventoryRow?.debit) - num(inventoryRow?.credit);

      const posted = (rows: any[]) => rows.filter((r) => r.status === "posted");

      const openingMap = (rows: any[]) =>
        new Map<string, number>(rows.map((r) => [r.id, num(r.opening_balance)]));

      const expectedCustomers = computeExpectedEntityBalances({
        openingBalances: openingMap(customers),
        invoices: posted(salesInvoices).map((r) => ({
          entity_id: r.customer_id,
          total: r.total,
        })),
        returns: posted(salesReturns).map((r) => ({
          entity_id: r.customer_id,
          total: r.total,
        })),
        payments: posted(customerPayments).map((r) => ({
          id: r.id,
          entity_id: r.customer_id,
          amount: r.amount,
        })),
        returnAllocations: salesReturnAllocs,
      });

      const expectedSuppliers = computeExpectedEntityBalances({
        openingBalances: openingMap(suppliers),
        invoices: posted(purchaseInvoices).map((r) => ({
          entity_id: r.supplier_id,
          total: r.total,
        })),
        returns: posted(purchaseReturns).map((r) => ({
          entity_id: r.supplier_id,
          total: r.total,
        })),
        payments: posted(supplierPayments).map((r) => ({
          id: r.id,
          entity_id: r.supplier_id,
          amount: r.amount,
        })),
        returnAllocations: purchaseReturnAllocs,
      });

      const inventoryCheck = checkInventoryValue(products, movements, ledgerInventory);
      setInventoryValues({
        ledger: inventoryCheck.ledgerValue,
        computed: inventoryCheck.computedValue,
      });

      setChecks([
        checkProductQuantities(products, movements),
        inventoryCheck,
        checkJournalBalance(entries, lines),
        checkOrphanEntries(entries, lines),
        checkEntityBalances(customers, expectedCustomers, "customer"),
        checkEntityBalances(suppliers, expectedSuppliers, "supplier"),
        checkPostedNumberSequence(posted(salesInvoices), "فواتير البيع"),
        checkPostedNumberSequence(posted(purchaseInvoices), "فواتير الشراء"),
        checkPostedNumberSequence(
          entries.filter((e) => e.status === "posted"),
          "القيود المنشورة",
        ),
      ]);
      setLastRun(new Date());
    } catch (error) {
      notify.fromError(error, "تعذّر تشغيل فحوص سلامة البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarizeChecks(checks), [checks]);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        icon={ShieldCheck}
        title="سلامة البيانات"
        description="فحوص تلقائية تكشف أي انحراف بين المستندات والأرصدة والمخزون"
        badge={
          lastRun ? (
            <Badge variant="outline" className="font-normal">
              آخر فحص {lastRun.toLocaleTimeString("ar-EG")}
            </Badge>
          ) : undefined
        }
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 ml-2", loading && "animate-spin")} />
            إعادة الفحص
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : checks.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="لم يتم تشغيل الفحوص"
          description="اضغط إعادة الفحص لبدء تحليل سلامة البيانات."
        />
      ) : (
        <>
          <StatGrid>
            <StatCard
              icon={summary.healthy ? CheckCircle2 : AlertTriangle}
              tone={summary.healthy ? "emerald" : summary.errors > 0 ? "red" : "amber"}
              label="الحالة العامة"
              value={
                summary.healthy
                  ? "سليم"
                  : summary.errors > 0
                    ? "يحتاج تصحيحًا"
                    : "ملاحظات"
              }
              sub={`${summary.passed} من ${summary.total} فحص ناجح`}
              hint="يظهر «سليم» فقط عند نجاح جميع الفحوص بلا تحذيرات."
            />
            <StatCard
              icon={XCircle}
              tone="red"
              label="انحرافات حرجة"
              value={summary.errors}
              sub={`${summary.totalIssues} سجل مسبّب`}
            />
            <StatCard
              icon={AlertTriangle}
              tone="amber"
              label="تحذيرات"
              value={summary.warnings}
              sub="فراغات أو تكرار في الترقيم"
            />
            <StatCard
              icon={Activity}
              tone="blue"
              label="قيمة المخزون"
              value={formatCurrency(inventoryValues.computed)}
              sub={`الدفتر: ${formatCurrency(inventoryValues.ledger)}`}
              hint="المحسوبة بمتوسط التكلفة المرجّح مقابل رصيد حساب المخزون."
            />
          </StatGrid>

          <div className="space-y-3">
            {checks.map((check) => (
              <CheckCard key={check.key} check={check} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CheckCard({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(check.severity === "error");
  const isOk = check.severity === "ok";
  const Icon = isOk ? CheckCircle2 : check.severity === "warning" ? AlertTriangle : XCircle;

  return (
    <Card
      className={cn(
        "rounded-xl overflow-hidden border",
        isOk
          ? "border-border"
          : check.severity === "warning"
            ? "border-amber-300 dark:border-amber-500/40"
            : "border-red-300 dark:border-red-500/40",
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-start gap-3 p-4 text-right hover:bg-muted/40 transition-colors"
            disabled={isOk}
          >
            <span
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                isOk
                  ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : check.severity === "warning"
                    ? "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400",
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground">{check.title}</span>
                <Badge variant={isOk ? "outline" : "destructive"} className="font-normal">
                  {isOk ? "مطابق" : `${check.issues.length} انحراف`}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  ({check.checked} سجل مفحوص)
                </span>
              </span>
              <span className="block text-sm text-muted-foreground mt-1 leading-relaxed">
                {check.meaning}
              </span>
            </span>
            {!isOk && (
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground shrink-0 mt-2 transition-transform",
                  open && "rotate-180",
                )}
              />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right">السجل</TableHead>
                    <TableHead className="text-right">المتوقع</TableHead>
                    <TableHead className="text-right">الفعلي</TableHead>
                    <TableHead className="text-right">الفرق</TableHead>
                    <TableHead className="text-right w-24">المستند</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {check.issues.slice(0, 100).map((issue, i) => (
                    <TableRow key={`${issue.id}-${i}`}>
                      <TableCell className="font-medium">{issue.label}</TableCell>
                      <TableCell className="tabular-nums">{issue.expected}</TableCell>
                      <TableCell className="tabular-nums">{issue.actual}</TableCell>
                      <TableCell
                        className={cn(
                          "tabular-nums font-semibold",
                          (issue.diff ?? 0) !== 0 && "text-red-600 dark:text-red-400",
                        )}
                      >
                        {issue.diff ?? "—"}
                      </TableCell>
                      <TableCell>
                        {issue.link ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link to={issue.link}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {check.issues.length > 100 && (
              <p className="text-xs text-muted-foreground mt-2">
                يتم عرض أول 100 سجل من {check.issues.length}.
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
