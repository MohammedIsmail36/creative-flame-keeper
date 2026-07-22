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
        const sql = postgres(dbUrl, { max: 1, timeout: 5 });

        // Test multi-statement
        const multi = await sql.unsafe("SELECT 1 as a; SELECT 2 as b;");

        // Test simple CREATE TEMP + INSERT
        await sql`CREATE TEMP TABLE tmp_test2 (id int)`;
        await sql`INSERT INTO tmp_test2 VALUES (1), (2)`;
        const rows = await sql`SELECT * FROM tmp_test2`;

        await sql.end();

        result = {
          multi_statement: multi,
          temp_rows: rows,
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
