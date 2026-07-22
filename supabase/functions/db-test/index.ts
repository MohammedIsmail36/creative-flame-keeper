import postgres from "npm:postgres@3";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const dbUrl = Deno.env.get("SUPABASE_DB_URL") || Deno.env.get("DATABASE_URL") || "not-set";
    let result: any = {};

    if (dbUrl && dbUrl !== "not-set") {
      try {
        const sql = postgres(dbUrl);

        // Test multi-statement
        const multi = await sql.unsafe("SELECT 1 as a; SELECT 2 as b;");

        // Test copy from stdin
        let copyResult: any = null;
        let copyError: string | null = null;
        try {
          await sql`CREATE TEMP TABLE tmp_test (id int, name text)`;
          await sql.unsafe("COPY tmp_test FROM STDIN WITH (FORMAT text)");
          // postgres doesn't support stdin this way easily
          copyResult = "skipped-unsafe";
        } catch (e) {
          copyError = e.message;
        }

        await sql.end();

        result = {
          multi_statement: multi,
          copy_error: copyError,
          copy_result: copyResult,
        };
      } catch (e) {
        result = { error: e.message };
      }
    } else {
      result = { error: "DB URL not set" };
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
