import postgres from "npm:postgres@3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const RESTORE_BUCKET = "restore-backups";
const RESTORE_FILE = "public_data_clean.sql";

interface FkConstraint {
  conname: string;
  table_name: string;
  def: string;
}

async function readSqlFromStorage(
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(RESTORE_BUCKET)
    .download(RESTORE_FILE);

  if (error) throw new Error(`Storage download failed: ${error.message}`);
  if (!data) throw new Error("Storage returned empty file");

  return await data.text();
}

async function getAllForeignKeys(sql: postgres.Sql): Promise<FkConstraint[]> {
  const rows = await sql<FkConstraint[]>`
    SELECT
      con.conname AS conname,
      con.conrelid::regclass::text AS table_name,
      pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    WHERE con.contype = 'f'
      AND con.connamespace = 'public'::regnamespace
    ORDER BY con.conrelid::regclass::text, con.conname;
  `;
  return rows;
}

async function executeCopyBlock(
  sql: postgres.Sql,
  copyLine: string,
  dataLines: string[]
): Promise<void> {
  // copyLine example: COPY public.accounts (id, ...) FROM stdin;
  const copySql = copyLine.replace(/FROM stdin;?\s*$/, "FROM STDIN");
  const writable = await sql.unsafe(copySql).writable();

  await new Promise<void>((resolve, reject) => {
    writable.on("error", reject);

    let pending = 0;
    let finished = false;
    const data = dataLines.join("");
    const chunkSize = 64 * 1024;

    const writeChunk = (start: number) => {
      if (start >= data.length) {
        if (pending === 0) {
          finished = true;
          writable.end(resolve);
        }
        return;
      }
      const end = Math.min(start + chunkSize, data.length);
      const chunk = data.slice(start, end);
      pending++;
      writable.write(chunk, (err: any) => {
        pending--;
        if (err) {
          reject(err);
          return;
        }
        writeChunk(end);
      });
    };

    writeChunk(0);
  });
}

async function parseAndExecuteSql(
  sql: postgres.Sql,
  sqlText: string,
  onProgress: (msg: string) => void
): Promise<void> {
  const lines = sqlText.split("\n");
  let normalBuffer: string[] = [];
  let copyLine: string | null = null;
  let copyDataLines: string[] = [];
  let inCopy = false;
  let copyCount = 0;
  let statementCount = 0;

  const flushNormal = async () => {
    if (normalBuffer.length === 0) return;
    const stmt = normalBuffer.join("\n").trim();
    normalBuffer = [];
    if (!stmt) return;
    try {
      await sql.unsafe(stmt);
      statementCount++;
    } catch (e: any) {
      throw new Error(`SQL execution failed at statement #${statementCount}: ${e.message}\n${stmt.slice(0, 200)}`);
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

    if (inCopy) {
      if (line === "\\.") {
        copyCount++;
        await executeCopyBlock(sql, copyLine!, copyDataLines);
        copyLine = null;
        copyDataLines = [];
        inCopy = false;
        onProgress(`Loaded ${copyCount} COPY blocks`);
      } else {
        copyDataLines.push(rawLine + "\n");
      }
      continue;
    }

    if (line.startsWith("COPY ")) {
      await flushNormal();
      copyLine = line;
      inCopy = true;
      continue;
    }

    normalBuffer.push(rawLine);
    if (line.trim().endsWith(";")) {
      await flushNormal();
    }
  }

  await flushNormal();
  onProgress(`Executed ${statementCount} statements and ${copyCount} COPY blocks`);
}

async function createAdminUser(
  supabase: ReturnType<typeof createClient>
): Promise<{ id: string; email: string }> {
  const password = Deno.env.get("DEFAULT_ADMIN_PASSWORD") || "ChangeMe123!";
  const email = "admin@system.com";
  const fullName = "مدير النظام";

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, email_verified: true },
    app_metadata: { provider: "email", providers: ["email"] },
  });

  if (error) throw new Error(`Failed to create admin user: ${error.message}`);
  if (!data.user) throw new Error("Admin user creation returned no user");

  const userId = data.user.id;

  // Create profile and role
  await supabase.from("profiles").upsert({
    id: userId,
    full_name: fullName,
  });

  await supabase.from("user_roles").upsert({
    user_id: userId,
    role: "admin",
  });

  return { id: userId, email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const dbUrl = Deno.env.get("SUPABASE_DB_URL") || Deno.env.get("DATABASE_URL");

    if (!supabaseUrl || !serviceRoleKey || !dbUrl) {
      throw new Error("Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    log("Downloading SQL backup from storage...");
    const sqlText = await readSqlFromStorage(supabase);
    log(`Downloaded ${sqlText.length} bytes`);

    const sql = postgres(dbUrl, {
      max: 1,
      timeout: 120,
      connect_timeout: 60,
    });

    try {
      await sql.begin(async (tx) => {
        // Disable triggers inside the transaction to avoid interference from app triggers
        await tx`SET session_replication_role = replica`;
        log("Disabled triggers (session_replication_role = replica)");

        // Find and drop all public FK constraints
        const fks = await getAllForeignKeys(tx);
        log(`Found ${fks.length} foreign keys to drop`);
        for (const fk of fks) {
          await tx`ALTER TABLE ${tx(fk.table_name)} DROP CONSTRAINT ${tx(fk.conname)}`;
        }
        log("Dropped foreign keys");

        // Truncate all public tables in reverse dependency order
        const tables = await tx<{ table_name: string }[]>`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `;
        const tableNames = tables.map((t) => t.table_name);
        // Attempt to truncate all tables. CASCADE handles residual references.
        await tx`TRUNCATE TABLE ${tx(tableNames)} CASCADE`;
        log(`Truncated ${tableNames.length} public tables`);

        // Reset sequences for id columns
        const sequences = await tx<{ seq: string; table_name: string; col: string }[]>`
          SELECT
            pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) AS seq,
            table_name,
            column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_default LIKE 'nextval%'
        `;
        for (const s of sequences) {
          if (s.seq) {
            await tx`SELECT setval(${s.seq}, 1, false)`;
          }
        }
        log(`Reset ${sequences.length} sequences`);

        // Execute the cleaned SQL dump
        log("Executing SQL dump...");
        await parseAndExecuteSql(tx, sqlText, log);

        // Clear all created_by references because auth users were not restored
        for (const t of tableNames) {
          const cols = await tx<{ column_name: string }[]>`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = ${t}
              AND column_name = 'created_by'
          `;
          if (cols.length > 0) {
            await tx`UPDATE ${tx(t)} SET created_by = NULL`;
          }
        }
        log("Cleared created_by references");

        // Re-add foreign keys
        for (const fk of fks) {
          await tx`ALTER TABLE ${tx(fk.table_name)} ADD CONSTRAINT ${tx(fk.conname)} ${tx.unsafe(fk.def)}`;
        }
        log("Re-added foreign keys");

        await tx`SET session_replication_role = origin`;
      });

      log("Database transaction committed successfully");
    } finally {
      await sql.end();
    }

    // Create admin user outside the DB transaction (uses auth API)
    log("Creating admin user...");
    const admin = await createAdminUser(supabase);
    log(`Created admin user ${admin.email} (${admin.id})`);

    return new Response(
      JSON.stringify({
        success: true,
        admin_email: admin.email,
        admin_id: admin.id,
        logs,
        note: "Auth users were not restored from the backup. A fresh admin user has been created. Other users can be recreated from the app.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
        logs,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
