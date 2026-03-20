import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const results: string[] = [];

    // ── 1. إنشاء حساب المدير ──
    let adminId: string | null = null;
    const { data: existingUsers, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) {
      results.push(`❌ خطأ في جلب المستخدمين: ${listErr.message}`);
    } else {
      const existingAdmin = existingUsers?.users?.find((u: any) => u.email === DEFAULT_ADMIN_EMAIL);
      if (existingAdmin) {
        adminId = existingAdmin.id;
        results.push(`ℹ️ حساب المدير موجود مسبقاً`);
      } else {
        const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
          email: DEFAULT_ADMIN_EMAIL,
          password: DEFAULT_ADMIN_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: DEFAULT_ADMIN_NAME },
        });
        if (createErr) {
          results.push(`❌ خطأ في إنشاء حساب المدير: ${createErr.message}`);
        } else if (newUser?.user) {
          adminId = newUser.user.id;
          results.push(`✅ تم إنشاء حساب المدير: ${DEFAULT_ADMIN_EMAIL}`);
        }
      }
    }

    // إسناد الدور والملف الشخصي
    if (adminId) {
      const { error: roleErr } = await supabase.rpc("admin_insert_user_role", {
        p_user_id: adminId,
        p_role: "admin",
      });
      results.push(roleErr ? `❌ خطأ في إسناد الدور: ${roleErr.message}` : "✅ تم إسناد دور المدير");

      const { error: profErr } = await supabase.rpc("admin_insert_profile", {
        p_id: adminId,
        p_full_name: DEFAULT_ADMIN_NAME,
      });
      results.push(profErr ? `❌ خطأ في إنشاء الملف الشخصي: ${profErr.message}` : "✅ تم إنشاء الملف الشخصي");
    }

    // ── 2. شجرة الحسابات (تخطي الموجود) ──
    const { data: existingAccounts } = await supabase.from("accounts").select("code, id");
    const existingCodes = new Set((existingAccounts || []).map((a: any) => a.code));
    const codeToId: Record<string, string> = {};
    (existingAccounts || []).forEach((a: any) => { codeToId[a.code] = a.id; });

    let accountsAdded = 0;
    for (const acc of DEFAULT_ACCOUNTS) {
      if (existingCodes.has(acc.code)) continue;
      const parent_id = acc.parent_code ? codeToId[acc.parent_code] || null : null;
      const { data: inserted, error } = await supabase
        .from("accounts")
        .insert({
          code: acc.code,
          name: acc.name,
          account_type: acc.account_type,
          is_parent: acc.is_parent,
          is_system: SYSTEM_CODES.includes(acc.code),
          parent_id,
        })
        .select("id")
        .single();
      if (inserted) {
        codeToId[acc.code] = inserted.id;
        accountsAdded++;
      }
      if (error) results.push(`❌ خطأ في حساب ${acc.code}: ${error.message}`);
    }
    results.push(accountsAdded > 0 ? `✅ تم إضافة ${accountsAdded} حساب جديد` : "ℹ️ شجرة الحسابات موجودة مسبقاً");

    // ── 3. إعدادات الشركة (تخطي إذا موجودة) ──
    const { data: existingSettings } = await supabase.from("company_settings").select("id").limit(1);
    if (existingSettings && existingSettings.length > 0) {
      results.push("ℹ️ إعدادات الشركة موجودة مسبقاً");
    } else {
      const { error: settingsErr } = await supabase.from("company_settings").insert({ company_name: "شركتي" });
      results.push(settingsErr ? `❌ خطأ في إنشاء الإعدادات: ${settingsErr.message}` : "✅ تم إنشاء إعدادات الشركة");
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
