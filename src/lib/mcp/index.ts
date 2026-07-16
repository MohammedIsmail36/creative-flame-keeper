import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCustomers from "./tools/list-customers";
import listSuppliers from "./tools/list-suppliers";
import listProducts from "./tools/list-products";
import listSalesInvoices from "./tools/list-sales-invoices";
import getSalesSummary from "./tools/get-sales-summary";

const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "accounting-system-mcp",
  title: "النظام المحاسبي — MCP",
  version: "0.1.0",
  instructions:
    "Read-only tools for this accounting system: list customers, suppliers, products, sales invoices, and get a sales summary for a date range. All queries respect the signed-in user's permissions (RLS).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listCustomers,
    listSuppliers,
    listProducts,
    listSalesInvoices,
    getSalesSummary,
  ],
});
