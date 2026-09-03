import { useMemo } from "react";
import {
  buildSalesCogsByInvoice,
  computeSalesReportMetrics,
} from "@/features/sales-report/domain/metrics";
import { computeInvoiceCoverage } from "@/features/sales-report/domain/collections";
import type { SalesReportServerSummary } from "@/features/sales-report/domain/server-summary";
import type { SalesReportStatusFilter } from "./use-sales-report-preferences";
import { buildSalesInvoiceScopes } from "@/features/sales-report/domain/document-scope";

interface UseSalesReportMetricsInput {
  invoices: any[];
  returns: any[];
  movements: any[];
  paymentAllocations: any[];
  returnSettlements: any[];
  statusFilter: SalesReportStatusFilter;
  serverSummary?: SalesReportServerSummary;
}

export function useSalesReportMetrics({
  invoices,
  returns,
  movements,
  paymentAllocations,
  returnSettlements,
  statusFilter,
  serverSummary,
}: UseSalesReportMetricsInput) {
  const { detailInvoices, financialInvoices } = useMemo(
    () => buildSalesInvoiceScopes(invoices, statusFilter),
    [invoices, statusFilter],
  );

  const invoiceCoverage = useMemo(
    () =>
      computeInvoiceCoverage(invoices, paymentAllocations, returnSettlements),
    [invoices, paymentAllocations, returnSettlements],
  );

  const kpi = useMemo(() => {
    const metrics = computeSalesReportMetrics({ invoices, returns, movements });

    return {
      count: metrics.invoiceCount,
      grossSales: metrics.salesRevenueExcludingTax,
      returnsTotal: metrics.returnRevenueExcludingTax,
      netSales: metrics.netSalesRevenue,
      grossProfit: metrics.grossProfit,
      grossMarginPercent: metrics.grossMarginPercent,
      invoiceGrossTotal: invoiceCoverage.invoiceGrossTotal,
      cashCollected: invoiceCoverage.cashCollected,
      returnSettled: invoiceCoverage.returnSettled,
      totalCovered: invoiceCoverage.totalCovered,
      cashCollectionRate: invoiceCoverage.cashCollectionRate,
      cogs: metrics.netCogs,
    };
  }, [invoices, returns, movements, invoiceCoverage]);

  const prevKpi = useMemo(
    () => ({
      count: serverSummary?.previous.invoiceCount ?? 0,
      grossSales: serverSummary?.previous.grossSales ?? 0,
      netSales: serverSummary?.previous.netSales ?? 0,
    }),
    [serverSummary],
  );

  const cogsByInvoice = useMemo(
    () => buildSalesCogsByInvoice(movements),
    [movements],
  );

  return {
    detailInvoices,
    financialInvoices,
    invoiceCoverage,
    kpi,
    prevKpi,
    cogsByInvoice,
  };
}
