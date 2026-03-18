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

// All tables to truncate during full reset (reverse dependency order)
const ALL_TABLES_TRUNCATE = [
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
  "accounts",
  "company_settings",
];

const SYSTEM_CODES = ["1101", "1102", "1103", "1104", "2101", "3101", "3102", "4101", "5101"];

const DEFAULT_ACCOUNTS = [
  { code: "1", name: "الأصول", account_type: "asset", is_parent: true, parent_code: null },
  { code: "11", name: "الأصول المتداولة", account_type: "asset", is_parent: true, parent_code: "1" },
  { code: "1101", name: "الصندوق (النقدية)", account_type: "asset", is_parent: false, parent_code: "11" },
  { code: "1102", name: "البنك", account_type: "asset", is_parent: false, parent_code: "11" },
  { code: "1103", name: "العملاء (المدينون)", account_type: "asset", is_parent: false, parent_code: "11" },
  { code: "1104", name: "المخزون", account_type: "asset", is_parent: false, parent_code: "11" },
  { code: "12", name: "الأصول الثابتة", account_type: "asset", is_parent: true, parent_code: "1" },
  { code: "1201", name: "الأثاث والتجهيزات", account_type: "asset", is_parent: false, parent_code: "12" },
  { code: "1202", name: "المعدات", account_type: "asset", is_parent: false, parent_code: "12" },
  { code: "1203", name: "السيارات", account_type: "asset", is_parent: false, parent_code: "12" },
  { code: "2", name: "الخصوم", account_type: "liability", is_parent: true, parent_code: null },
  { code: "2101", name: "الموردون (الدائنون)", account_type: "liability", is_parent: false, parent_code: "2" },
  { code: "2102", name: "قروض قصيرة الأجل", account_type: "liability", is_parent: false, parent_code: "2" },
  { code: "2103", name: "قروض طويلة الأجل", account_type: "liability", is_parent: false, parent_code: "2" },
  { code: "3", name: "حقوق الملكية", account_type: "equity", is_parent: true, parent_code: null },
  { code: "3101", name: "رأس المال", account_type: "equity", is_parent: false, parent_code: "3" },
  { code: "3102", name: "الأرباح المحتجزة", account_type: "equity", is_parent: false, parent_code: "3" },
  { code: "4", name: "الإيرادات", account_type: "revenue", is_parent: true, parent_code: null },
  { code: "4101", name: "إيرادات المبيعات", account_type: "revenue", is_parent: false, parent_code: "4" },
  { code: "4102", name: "إيرادات الخدمات", account_type: "revenue", is_parent: false, parent_code: "4" },
  { code: "4103", name: "إيرادات أخرى", account_type: "revenue", is_parent: false, parent_code: "4" },
  { code: "5", name: "المصروفات", account_type: "expense", is_parent: true, parent_code: null },
  { code: "5101", name: "تكلفة البضاعة المباعة", account_type: "expense", is_parent: false, parent_code: "5" },
  { code: "5102", name: "رواتب وأجور", account_type: "expense", is_parent: false, parent_code: "5" },
  { code: "5103", name: "إيجار", account_type: "expense", is_parent: false, parent_code: "5" },
  { code: "5104", name: "مصاريف كهرباء وماء", account_type: "expense", is_parent: false, parent_code: "5" },
  { code: "5105", name: "مصاريف إدارية", account_type: "expense", is_parent: false, parent_code: "5" },
  { code: "5106", name: "مصاريف تسويق", account_type: "expense", is_parent: false, parent_code: "5" },
  { code: "5107", name: "إهلاك", account_type: "expense", is_parent: false, parent_code: "5" },
];

const DEFAULT_ADMIN_EMAIL = "admin@system.com";
const DEFAULT_ADMIN_PASSWORD = "admin123456";
const DEFAULT_ADMIN_NAME = "مدير النظام";

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

      // Step 1: Delete ALL data from all tables (reverse dependency order)
      for (const table of ALL_TABLES_TRUNCATE) {
        const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) {
          results.push(`خطأ في حذف بيانات ${table}: ${error.message}`);
        } else {
          results.push(`تم حذف بيانات ${table}`);
        }
      }

      // Step 2: Delete all user roles and profiles (but keep auth users)
      const { error: rolesErr } = await supabase.from("user_roles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (rolesErr) results.push(`خطأ في حذف الأدوار: ${rolesErr.message}`);
      else results.push("تم حذف أدوار المستخدمين");

      const { error: profilesErr } = await supabase.from("profiles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (profilesErr) results.push(`خطأ في حذف الملفات الشخصية: ${profilesErr.message}`);
      else results.push("تم حذف الملفات الشخصية");

      // Step 3: Delete all auth users
      const { data: allUsers } = await supabase.auth.admin.listUsers();
      if (allUsers?.users) {
        for (const user of allUsers.users) {
          const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
          if (delErr) results.push(`خطأ في حذف المستخدم ${user.email}: ${delErr.message}`);
        }
        results.push(`تم حذف ${allUsers.users.length} مستخدم`);
      }

      // Step 4: Re-create default admin
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: DEFAULT_ADMIN_NAME },
      });
      if (createErr) {
        results.push(`خطأ في إنشاء حساب المدير: ${createErr.message}`);
      } else {
        results.push(`تم إنشاء حساب المدير: ${DEFAULT_ADMIN_EMAIL}`);
      }

      // Step 5: Re-seed chart of accounts
      const codeToId: Record<string, string> = {};
      let accountsCount = 0;
      for (const acc of DEFAULT_ACCOUNTS) {
        const parent_id = acc.parent_code ? codeToId[acc.parent_code] || null : null;
        const { data: inserted, error } = await supabase
          .from("accounts")
          .insert({
            code: acc.code,
            name: acc.name,
            account_type: acc.account_type,
            is_parent: acc.is_parent,
            parent_id,
          })
          .select("id")
          .single();
        if (inserted) {
          codeToId[acc.code] = inserted.id;
          accountsCount++;
        }
        if (error) results.push(`خطأ في إضافة حساب ${acc.code}: ${error.message}`);
      }
      results.push(`تم إضافة ${accountsCount} حساب في شجرة الحسابات`);

      // Step 6: Re-seed company settings
      const { error: settingsErr } = await supabase.from("company_settings").insert({
        company_name: "شركتي",
      });
      if (settingsErr) {
        results.push(`خطأ في إنشاء إعدادات الشركة: ${settingsErr.message}`);
      } else {
        results.push("تم إنشاء إعدادات الشركة الافتراضية");
      }

      results.push("✅ تم تصفير قاعدة البيانات بالكامل وإعادة البناء بنجاح");

      return new Response(JSON.stringify({ success: true, results }), {
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
