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
  name: "list_products",
  title: "List products",
  description:
    "List products with stock and price. Optional search matches name, code, brand, or model.",
  inputSchema: {
    search: z.string().optional(),
    only_active: z.boolean().default(true),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, only_active, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("products")
      .select(
        "id, code, name, brand, model, selling_price, average_cost, available_quantity, is_active",
      )
      .order("name", { ascending: true })
      .limit(limit);
    if (only_active) query = query.eq("is_active", true);
    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      query = query.or(
        `name.ilike.${s},code.ilike.${s},brand.ilike.${s},model.ilike.${s}`,
      );
    }
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { products: data ?? [] },
    };
  },
});
