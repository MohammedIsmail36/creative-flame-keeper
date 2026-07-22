import postgres from "npm:postgres@3";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const dbUrl = Deno.env.get("SUPABASE_DB_URL") || Deno.env.get("DATABASE_URL") || "not-set";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "not-set";

    let connectionResult = "not-tested";
    let connectionUser = null;
    let connectionError = null;

    if (dbUrl && dbUrl !== "not-set") {
      try {
        const sql = postgres(dbUrl);
        const result = await sql`SELECT current_user as u, session_user as s`;
        connectionResult = "ok";
        connectionUser = result[0];
        await sql.end();
      } catch (e) {
        connectionResult = "error";
        connectionError = e.message;
      }
    }

    return new Response(
      JSON.stringify({
        db_url_set: dbUrl !== "not-set" ? "yes" : "no",
        service_role_set: serviceRoleKey !== "not-set" ? "yes" : "no",
        connection_result: connectionResult,
        connection_user: connectionUser,
        connection_error: connectionError,
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
