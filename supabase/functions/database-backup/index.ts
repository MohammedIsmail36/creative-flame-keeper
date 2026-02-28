import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TABLES_ORDER = [
  "company_settings",
  "accounts",
  "product_categories",
  "product_brands",
  "product_units",
  "products",
  "product_images",
  "customers",
  "suppliers",
  "journal_entries",
  "journal_entry_lines",
  "sales_invoices",
  "sales_invoice_items",
  "sales_returns",
  "sales_return_items",
  "purchase_invoices",
  "purchase_invoice_items",
  "purchase_returns",
  "purchase_return_items",
  "customer_payments",
  "customer_payment_allocations",
  "supplier_payments",
  "supplier_payment_allocations",
  "inventory_movements",
  "inventory_adjustments",
  "inventory_adjustment_items",
];

// Tables to preserve during reset
const PRESERVE_TABLES = ["accounts", "company_settings"];

// Tables that hold transactional data to be cleared during reset
const RESET_ORDER = [
  "customer_payment_allocations",
  "supplier_payment_allocations",
  "inventory_adjustment_items",
  "inventory_movements",
  "sales_return_items",
  "purchase_return_items",
  "sales_invoice_items",
  "purchase_invoice_items",
  "customer_payments",
  "supplier_payments",
  "inventory_adjustments",
  "sales_returns",
  "purchase_returns",
  "sales_invoices",
  "purchase_invoices",
  "journal_entry_lines",
  "journal_entries",
  "product_images",
  "products",
  "customers",
  "suppliers",
  "product_categories",
  "product_brands",
  "product_units",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { action } = await req.json();

    if (action === "backup") {
      const backup: Record<string, any[]> = {};
      for (const table of TABLES_ORDER) {
        const { data, error } = await supabase.from(table).select("*");
        if (error) throw new Error(`Error reading ${table}: ${error.message}`);
        backup[table] = data || [];
      }

      // Include user_roles and profiles
      const { data: roles } = await supabase.from("user_roles").select("*");
      backup["user_roles"] = roles || [];
      const { data: profiles } = await supabase.from("profiles").select("*");
      backup["profiles"] = profiles || [];

      return new Response(JSON.stringify({
        success: true,
        backup,
        created_at: new Date().toISOString(),
        version: "1.0",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset") {
      const results: string[] = [];

      for (const table of RESET_ORDER) {
        const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) {
          results.push(`خطأ في تصفير ${table}: ${error.message}`);
        } else {
          results.push(`تم تصفير ${table}`);
        }
      }

      // Reset product quantities
      // Products are already deleted above

      results.push("تم الاحتفاظ بشجرة الحسابات وإعدادات الشركة والمستخدمين");

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "restore") {
      // Restore expects backup data in the request
      const { data: backupData } = await req.json().catch(() => ({ data: null }));
      // Actually re-parse since we already consumed the body
      return new Response(JSON.stringify({ success: false, error: "Use restore-with-data action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
