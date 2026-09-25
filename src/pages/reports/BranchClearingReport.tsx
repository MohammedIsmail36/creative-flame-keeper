import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeftRight, CheckCircle2, AlertTriangle, Building2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/ui/data-table";
import { DatePickerInput } from "@/components/DatePickerInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/LoadingState";
import { formatCurrency } from "@/lib/format";
import type { ColumnDef } from "@tanstack/react-table";

interface ClearingRow {
  branch_id: string | null;
  branch_code: string | null;
  branch_name: string | null;
  debit: number;
  credit: number;
  balance: number;
}

interface ClearingReport {
  rows: ClearingRow[];
  company_net: number;
  is_balanced: boolean;
}

export default function BranchClearingReport() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["branch-clearing-report", dateFrom, dateTo],
    queryFn: async (): Promise<ClearingReport> => {
      const { data, error } = await (supabase.rpc as any)("get_branch_clearing_report", {
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
      });
      if (error) throw error;
      return data as ClearingReport;
    },
  });

  const rows = useMemo(
    () =>
      (data?.rows ?? []).map((r) => ({
        ...r,
        debit: Number(r.debit),
        credit: Number(r.credit),
        balance: Number(r.balance),
      })),
    [data],
  );

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const net = Number(data?.company_net ?? 0);
  const balanced = data?.is_balanced ?? true;

  const columns: ColumnDef<ClearingRow>[] = [
    {
      accessorKey: "branch_name",
      header: "الفرع",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.branch_name ?? "بدون فرع"}</span>
          {row.original.branch_code && (
            <span className="font-mono text-xs text-muted-foreground">{row.original.branch_code}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "debit",
      header: "مدين",
      cell: ({ row }) => <span className="font-mono text-sm">{formatCurrency(row.original.debit)}</span>,
    },
    {
      accessorKey: "credit",
      header: "دائن",
      cell: ({ row }) => <span className="font-mono text-sm">{formatCurrency(row.original.credit)}</span>,
    },
    {
      accessorKey: "balance",
      header: "الرصيد",
      cell: ({ row }) => {
        const v = Number(row.original.balance);
        return (
          <span
            className={
              v > 0
                ? "font-mono text-sm font-semibold text-success"
                : v < 0
                  ? "font-mono text-sm font-semibold text-destructive"
                  : "font-mono text-sm"
            }
          >
            {formatCurrency(v)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        icon={ArrowLeftRight}
        title="تقرير التسوية بين الفروع"
        description="أرصدة حساب التسوية لكل فرع — يجب أن يكون صافي الشركة صفراً"
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-44 space-y-1.5">
            <span className="text-xs text-muted-foreground">من تاريخ</span>
            <DatePickerInput value={dateFrom} onChange={setDateFrom} />
          </div>
          <div className="w-44 space-y-1.5">
            <span className="text-xs text-muted-foreground">إلى تاريخ</span>
            <DatePickerInput value={dateTo} onChange={setDateTo} />
          </div>
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              مسح الفلاتر
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <Alert variant={balanced ? "default" : "destructive"}>
            {balanced ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertDescription>
              {balanced
                ? "حساب التسوية متوازن: صافي رصيده على مستوى الشركة صفر."
                : `تحذير: صافي حساب التسوية ${formatCurrency(net)} ولا يساوي صفراً — راجع القيود بين الفروع.`}
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard title="إجمالي المدين" value={formatCurrency(totalDebit)} icon={Building2} />
            <StatCard title="إجمالي الدائن" value={formatCurrency(totalCredit)} icon={Building2} />
            <StatCard title="صافي الشركة" value={formatCurrency(net)} icon={ArrowLeftRight} />
          </div>

          <DataTable columns={columns} data={rows} showPagination={false} showSearch={false} />
        </>
      )}
    </div>
  );
}
