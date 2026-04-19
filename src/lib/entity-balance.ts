import { supabase } from "@/integrations/supabase/client";
import { round2 } from "@/lib/utils";

type EntityType = "customer" | "supplier";
type InvoiceType = "sales" | "purchase";

const toNumber = (value: unknown) => Number(value || 0);

export async function recalculateEntityBalance(
  entityType: EntityType,
  entityId: string,
): Promise<number> {
  const isCustomer = entityType === "customer";

  const invoiceTable = (
    isCustomer ? "sales_invoices" : "purchase_invoices"
  ) as const;
  const returnTable = (
    isCustomer ? "sales_returns" : "purchase_returns"
  ) as const;
  const paymentTable = (
    isCustomer ? "customer_payments" : "supplier_payments"
  ) as const;
  const returnPaymentAllocTable = (
    isCustomer
      ? "sales_return_payment_allocations"
      : "purchase_return_payment_allocations"
  ) as const;
  const entityTable = (isCustomer ? "customers" : "suppliers") as const;
  const entityIdCol = isCustomer ? "customer_id" : "supplier_id";

  const [{ data: invoices }, { data: returns }, { data: payments }] =
    await Promise.all([
      supabase
        .from(invoiceTable)
        .select("total")
        .eq(entityIdCol, entityId)
        .eq("status", "posted"),
      supabase
        .from(returnTable)
        .select("total")
        .eq(entityIdCol, entityId)
        .eq("status", "posted"),
      supabase
        .from(paymentTable)
        .select("id, amount")
        .eq(entityIdCol, entityId)
        .eq("status", "posted"),
    ]);

  const postedInvoiceTotal = (invoices || []).reduce(
    (sum: number, row: any) => sum + toNumber(row.total),
    0,
  );
  const postedReturnTotal = (returns || []).reduce(
    (sum: number, row: any) => sum + toNumber(row.total),
    0,
  );

  let normalPayments = 0;
  let refundPayments = 0;

  if (payments && payments.length > 0) {
    const paymentIds = payments.map((p: any) => p.id);
    const { data: returnAllocs } = await supabase
      .from(returnPaymentAllocTable)
      .select("payment_id, allocated_amount")
      .in("payment_id", paymentIds);

    const allocatedByPayment = new Map<string, number>();
    (returnAllocs || []).forEach((a: any) => {
      const paymentId = String(a.payment_id);
      allocatedByPayment.set(
        paymentId,
        (allocatedByPayment.get(paymentId) || 0) + toNumber(a.allocated_amount),
      );
    });

    for (const payment of payments) {
      const paymentId = String((payment as any).id);
      const amount = toNumber((payment as any).amount);
      const returnAllocated = Math.min(
        amount,
        Math.max(0, toNumber(allocatedByPayment.get(paymentId))),
      );
      normalPayments += amount - returnAllocated;
      refundPayments += returnAllocated;
    }
  }

  const calculatedBalance = round2(
    postedInvoiceTotal - postedReturnTotal - normalPayments + refundPayments,
  );

  await supabase
    .from(entityTable)
    .update({ balance: calculatedBalance })
    .eq("id", entityId);

  return calculatedBalance;
}

export async function recalculateInvoicePaidAmount(
  invoiceType: InvoiceType,
  invoiceId: string,
): Promise<number> {
  const isSales = invoiceType === "sales";
  const invoiceTable = (
    isSales ? "sales_invoices" : "purchase_invoices"
  ) as const;
  const paymentAllocTable = (
    isSales ? "customer_payment_allocations" : "supplier_payment_allocations"
  ) as const;
  const settlementTable = (
    isSales
      ? "sales_invoice_return_settlements"
      : "purchase_invoice_return_settlements"
  ) as const;

  const [{ data: paymentAllocs }, { data: settlements }] = await Promise.all([
    supabase
      .from(paymentAllocTable)
      .select("allocated_amount")
      .eq("invoice_id", invoiceId),
    supabase
      .from(settlementTable)
      .select("settled_amount")
      .eq("invoice_id", invoiceId),
  ]);

  const paymentTotal = (paymentAllocs || []).reduce(
    (sum: number, row: any) => sum + toNumber(row.allocated_amount),
    0,
  );
  const settlementTotal = (settlements || []).reduce(
    (sum: number, row: any) => sum + toNumber(row.settled_amount),
    0,
  );
  const paidAmount = round2(paymentTotal + settlementTotal);

  await supabase
    .from(invoiceTable)
    .update({ paid_amount: paidAmount })
    .eq("id", invoiceId);

  return paidAmount;
}
