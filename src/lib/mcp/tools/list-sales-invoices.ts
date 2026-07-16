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
  name: "list_sales_invoices",
  title: "List sales invoices",
  description:
    "List recent sales invoices with totals and status. Filter by date range and/or status.",
  inputSchema: {
    from_date: z.string().optional().describe("YYYY-MM-DD lower bound (inclusive)."),
    to_date: z.string().optional().describe("YYYY-MM-DD upper bound (inclusive)."),
    status: z.enum(["draft", "posted", "cancelled"]).optional(),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date, status, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("sales_invoices")
      .select(
        "id, posted_number, invoice_date, customer_id, total, net_total, paid_amount, status",
      )
      .order("invoice_date", { ascending: false })
      .limit(limit);
    if (from_date) query = query.gte("invoice_date", from_date);
    if (to_date) query = query.lte("invoice_date", to_date);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { invoices: data ?? [] },
    };
  },
});
