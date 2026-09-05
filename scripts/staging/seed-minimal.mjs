const EXPECTED_STAGING_URL = "https://dunzfxurefzlaamgghys.supabase.co";
const stagingUrl = process.env.STAGING_SUPABASE_URL;
const serviceRoleKey = process.env.STAGING_SERVICE_ROLE_KEY;

if (process.env.ALLOW_STAGING_SEED !== "yes") {
  throw new Error("Set ALLOW_STAGING_SEED=yes to confirm the Staging-only seed.");
}

if (stagingUrl !== EXPECTED_STAGING_URL) {
  throw new Error(`Refusing to seed unexpected project URL: ${stagingUrl || "missing"}`);
}

if (!serviceRoleKey) {
  throw new Error("STAGING_SERVICE_ROLE_KEY is required.");
}

const restUrl = `${stagingUrl}/rest/v1`;

async function request(table, { method = "GET", filters = {}, select, body } = {}) {
  const url = new URL(`${restUrl}/${table}`);
  if (select) url.searchParams.set("select", select);
  for (const [column, filter] of Object.entries(filters)) {
    url.searchParams.set(column, filter);
  }

  const response = await fetch(url, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${table} ${method} failed (${response.status}): ${await response.text()}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function oneBy(table, column, value, select = "*") {
  const rows = await request(table, {
    filters: { [column]: `eq.${value}`, limit: "1" },
    select,
  });
  return rows?.[0] ?? null;
}

async function ensureRow(table, column, value, payload, select = "*") {
  const existing = await oneBy(table, column, value, select);
  if (existing) return { row: existing, created: false };

  const rows = await request(table, { method: "POST", select, body: payload });
  return { row: rows[0], created: true };
}

const requiredAccountCodes = ["1101", "1102", "1103", "1104", "4101", "5101"];
const requiredAccounts = await request("accounts", {
  filters: { code: `in.(${requiredAccountCodes.join(",")})` },
  select: "code",
});

const foundCodes = new Set((requiredAccounts ?? []).map(({ code }) => code));
const missingCodes = requiredAccountCodes.filter((code) => !foundCodes.has(code));
if (missingCodes.length > 0) {
  throw new Error(`Required accounts are missing: ${missingCodes.join(", ")}`);
}

const settingsRows = await request("company_settings", {
  filters: { limit: "1" },
  select: "id",
});

const settingsPayload = {
  company_name: "شركة الاختبار — بيانات غير حقيقية",
  company_name_en: "Staging Test Company",
  enable_tax: false,
  show_tax_on_invoice: false,
  show_discount_on_invoice: true,
  stock_enforcement_enabled: true,
  enable_return_days_limit: false,
  monthly_sales_target: 0,
};

let settingsCreated = false;
if ((settingsRows ?? []).length === 0) {
  await request("company_settings", { method: "POST", body: settingsPayload });
  settingsCreated = true;
} else {
  await request("company_settings", {
    method: "PATCH",
    filters: { id: `eq.${settingsRows[0].id}` },
    body: settingsPayload,
  });
}

const category = await ensureRow(
  "product_categories",
  "name",
  "اختبارات Staging",
  { name: "اختبارات Staging", description: "بيانات مصطنعة للاختبار فقط" },
  "id,name",
);

const unit = await ensureRow(
  "product_units",
  "name",
  "قطعة اختبار",
  { name: "قطعة اختبار", symbol: "stg" },
  "id,name",
);

const customer = await ensureRow(
  "customers",
  "code",
  "STG-CUST-001",
  {
    code: "STG-CUST-001",
    name: "عميل اختبار — بيانات غير حقيقية",
    notes: "مخصص حصراً لاختبارات Staging",
    loyalty_enabled: false,
  },
  "id,code,name",
);

const productDefinitions = [
  {
    code: "STG-PROD-001",
    name: "منتج اختبار أ — غير حقيقي",
    model_number: "STG-A",
    purchase_price: 60,
    selling_price: 150,
    quantity_on_hand: 20,
    min_stock_level: 2,
  },
  {
    code: "STG-PROD-002",
    name: "منتج اختبار ب — غير حقيقي",
    model_number: "STG-B",
    purchase_price: 35,
    selling_price: 90,
    quantity_on_hand: 15,
    min_stock_level: 2,
  },
];

const products = [];
for (const definition of productDefinitions) {
  products.push(
    await ensureRow(
      "products",
      "code",
      definition.code,
      {
        ...definition,
        category_id: category.row.id,
        unit_id: unit.row.id,
        description: "بيانات مصطنعة للاختبار فقط",
      },
      "id,code,name,quantity_on_hand,purchase_price,selling_price",
    ),
  );
}

console.log(
  JSON.stringify(
    {
      project: "dunzfxurefzlaamgghys",
      settings: settingsCreated ? "created" : "updated",
      category: category.created ? "created" : "kept",
      unit: unit.created ? "created" : "kept",
      customer: customer.created ? "created" : "kept",
      products: products.map(({ row, created }) => ({
        code: row.code,
        quantity: row.quantity_on_hand,
        state: created ? "created" : "kept",
      })),
    },
    null,
    2,
  ),
);
