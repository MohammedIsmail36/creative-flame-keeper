import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbUrl = Deno.env.get("SUPABASE_DB_URL") || Deno.env.get("DATABASE_URL") || "not-set";

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await adminClient.rpc("pg_current_user");

    return new Response(
      JSON.stringify({
        db_url_set: dbUrl !== "not-set" ? "yes" : "no",
        current_user: data,
        error: error?.message || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
