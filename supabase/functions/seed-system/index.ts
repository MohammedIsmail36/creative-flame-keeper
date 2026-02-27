import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_ADMIN_EMAIL = "admin@system.com";
const DEFAULT_ADMIN_PASSWORD = "admin123456";
const DEFAULT_ADMIN_NAME = "مدير النظام";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const results: string[] = [];

    // 1. Seed default admin account
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const adminExists = existingUsers?.users?.some(u => u.email === DEFAULT_ADMIN_EMAIL);

    if (!adminExists) {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: DEFAULT_ADMIN_NAME },
      });

      if (createError) {
        results.push(`خطأ في إنشاء حساب الأدمن: ${createError.message}`);
      } else {
        results.push(`تم إنشاء حساب الأدمن: ${DEFAULT_ADMIN_EMAIL}`);
      }
    } else {
      results.push("حساب الأدمن موجود بالفعل");
    }

    // 2. Seed default accounts (chart of accounts)
    const { data: existingAccounts } = await supabase
      .from("accounts")
      .select("code")
      .limit(1);

    if (!existingAccounts || existingAccounts.length === 0) {
      // Build a code->id map for parent references
      const codeToId: Record<string, string> = {};

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
        }
        if (error) {
          results.push(`خطأ في إضافة حساب ${acc.code}: ${error.message}`);
        }
      }
      results.push(`تم إضافة ${DEFAULT_ACCOUNTS.length} حساب افتراضي لشجرة الحسابات`);
    } else {
      results.push("شجرة الحسابات موجودة بالفعل");
    }

    // 3. Seed default company settings
    const { data: existingSettings } = await supabase
      .from("company_settings")
      .select("id")
      .limit(1);

    if (!existingSettings || existingSettings.length === 0) {
      const { error } = await supabase.from("company_settings").insert({
        company_name: "شركتي",
      });
      if (error) {
        results.push(`خطأ في إنشاء إعدادات الشركة: ${error.message}`);
      } else {
        results.push("تم إنشاء إعدادات الشركة الافتراضية");
      }
    } else {
      results.push("إعدادات الشركة موجودة بالفعل");
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
