import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "get_sales_summary",
  title: "Sales summary for a period",
  description:
    "Aggregate posted sales invoices over a date range (count, gross total, net total, paid, outstanding).",
  inputSchema: {
    from_date: z.string().describe("YYYY-MM-DD lower bound (inclusive)."),
    to_date: z.string().describe("YYYY-MM-DD upper bound (inclusive)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("sales_invoices")
      .select("total, net_total, paid_amount, status")
      .eq("status", "posted")
      .gte("invoice_date", from_date)
      .lte("invoice_date", to_date);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const summary = rows.reduce(
      (acc, r: any) => {
        acc.count += 1;
        acc.total += Number(r.total ?? 0);
        acc.net_total += Number(r.net_total ?? 0);
        acc.paid += Number(r.paid_amount ?? 0);
        return acc;
      },
      { count: 0, total: 0, net_total: 0, paid: 0 },
    );
    const outstanding = summary.net_total - summary.paid;
    const result = { from_date, to_date, ...summary, outstanding };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});
