import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageSkeleton } from "@/components/PageSkeleton";

// Eager (small + first-paint critical)
import Auth from "./pages/Auth";
import MfaVerify from "./pages/MfaVerify";
import NotFound from "./pages/NotFound";

// Dashboard is heavy (recharts) — lazy load it
const Dashboard = lazy(() => import("./pages/Dashboard"));

// Lazy — list pages
const Accounts = lazy(() => import("./pages/Accounts"));
const Journal = lazy(() => import("./pages/Journal"));
const JournalEntryForm = lazy(() => import("./pages/JournalEntryForm"));
const Ledger = lazy(() => import("./pages/Ledger"));
const Sales = lazy(() => import("./pages/Sales"));
const SalesInvoiceForm = lazy(() => import("./pages/SalesInvoiceForm"));
const SalesReturns = lazy(() => import("./pages/SalesReturns"));
const SalesReturnForm = lazy(() => import("./pages/SalesReturnForm"));
const CustomerPayments = lazy(() => import("./pages/CustomerPayments"));
const Customers = lazy(() => import("./pages/Customers"));
const Purchases = lazy(() => import("./pages/Purchases"));
const PurchaseInvoiceForm = lazy(() => import("./pages/PurchaseInvoiceForm"));
const PurchaseReturns = lazy(() => import("./pages/PurchaseReturns"));
const PurchaseReturnForm = lazy(() => import("./pages/PurchaseReturnForm"));
const SupplierPayments = lazy(() => import("./pages/SupplierPayments"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Products = lazy(() => import("./pages/Products"));
const ProductForm = lazy(() => import("./pages/ProductForm"));
const ProductView = lazy(() => import("./pages/ProductView"));
const ProductImport = lazy(() => import("./pages/ProductImport"));
const LookupManagement = lazy(() => import("./pages/LookupManagement"));
const CategoryManagement = lazy(() => import("./pages/CategoryManagement"));
const InventoryMovements = lazy(() => import("./pages/InventoryMovements"));
const InventoryAdjustments = lazy(() => import("./pages/InventoryAdjustments"));
const InventoryAdjustmentForm = lazy(() => import("./pages/InventoryAdjustmentForm"));
const TrialBalance = lazy(() => import("./pages/TrialBalance"));
const IncomeStatement = lazy(() => import("./pages/IncomeStatement"));
const BalanceSheet = lazy(() => import("./pages/BalanceSheet"));
const CashFlowStatement = lazy(() => import("./pages/CashFlowStatement"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const Profile = lazy(() => import("./pages/Profile"));
const SystemSetup = lazy(() => import("./pages/SystemSetup"));
const CustomerStatement = lazy(() => import("./pages/CustomerStatement"));
const SupplierStatement = lazy(() => import("./pages/SupplierStatement"));
const FiscalYearClosing = lazy(() => import("./pages/FiscalYearClosing"));
const ExpenseTypes = lazy(() => import("./pages/ExpenseTypes"));
const Expenses = lazy(() => import("./pages/Expenses"));
const ExpenseForm = lazy(() => import("./pages/ExpenseForm"));

// Lazy — reports (heavy: recharts/jspdf/xlsx)
const SalesReportPage = lazy(() => import("./pages/reports/SalesReportPage"));
const PurchasesReportPage = lazy(() => import("./pages/reports/PurchasesReportPage"));
const InventoryReportPage = lazy(() => import("./pages/reports/InventoryReportPage"));
const DebtAgingReportPage = lazy(() => import("./pages/reports/DebtAgingReportPage"));
const GrowthAnalyticsPage = lazy(() => import("./pages/reports/GrowthAnalyticsPage"));
const ProductAnalyticsPage = lazy(() => import("./pages/reports/ProductAnalyticsPage"));
const AccountBalancesPage = lazy(() => import("./pages/reports/AccountBalancesPage"));
const ProfitLossPage = lazy(() => import("./pages/reports/ProfitLossPage"));
const TurnoverLayout = lazy(() => import("./pages/reports/inventory-turnover/TurnoverLayout"));
const TurnoverDashboardPage = lazy(() => import("./pages/reports/inventory-turnover/TurnoverDashboardPage"));
const UrgentActionsPage = lazy(() => import("./pages/reports/inventory-turnover/UrgentActionsPage"));
const PurchasePlanningPage = lazy(() => import("./pages/reports/inventory-turnover/PurchasePlanningPage"));
const DormantInventoryPage = lazy(() => import("./pages/reports/inventory-turnover/DormantInventoryPage"));
const SupplierReturnsPage = lazy(() => import("./pages/reports/inventory-turnover/SupplierReturnsPage"));
const NewProductsPage = lazy(() => import("./pages/reports/inventory-turnover/NewProductsPage"));
const UnlistedProductsPage = lazy(() => import("./pages/reports/inventory-turnover/UnlistedProductsPage"));
const FullAnalysisPage = lazy(() => import("./pages/reports/inventory-turnover/FullAnalysisPage"));
const ProductHealthPage = lazy(() => import("./pages/reports/inventory-turnover/ProductHealthPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const withSuspense = (node: React.ReactNode) => (
  <Suspense fallback={<PageSkeleton />}>{node}</Suspense>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SettingsProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/mfa" element={<MfaVerify />} />
            <Route path="/" element={<ProtectedRoute><AppLayout>{withSuspense(<Dashboard />)}</AppLayout></ProtectedRoute>} />
            <Route path="/accounts" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<Accounts />)}</AppLayout></ProtectedRoute>} />
            <Route path="/journal" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<Journal />)}</AppLayout></ProtectedRoute>} />
            <Route path="/journal/new" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<JournalEntryForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/journal/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<JournalEntryForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/ledger" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<Ledger />)}</AppLayout></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<Sales />)}</AppLayout></ProtectedRoute>} />
            <Route path="/sales/new" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<SalesInvoiceForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/sales/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<SalesInvoiceForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/sales-returns" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<SalesReturns />)}</AppLayout></ProtectedRoute>} />
            <Route path="/sales-returns/new" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<SalesReturnForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/sales-returns/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<SalesReturnForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/customer-payments" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<CustomerPayments />)}</AppLayout></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<Customers />)}</AppLayout></ProtectedRoute>} />
            <Route path="/customer-statement/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<CustomerStatement />)}</AppLayout></ProtectedRoute>} />
            <Route path="/purchases" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<Purchases />)}</AppLayout></ProtectedRoute>} />
            <Route path="/purchases/new" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<PurchaseInvoiceForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/purchases/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<PurchaseInvoiceForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/purchase-returns" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<PurchaseReturns />)}</AppLayout></ProtectedRoute>} />
            <Route path="/purchase-returns/new" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<PurchaseReturnForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/purchase-returns/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<PurchaseReturnForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/supplier-payments" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<SupplierPayments />)}</AppLayout></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<Suppliers />)}</AppLayout></ProtectedRoute>} />
            <Route path="/supplier-statement/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<SupplierStatement />)}</AppLayout></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<Products />)}</AppLayout></ProtectedRoute>} />
            <Route path="/products/new" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<ProductForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/products/import" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<ProductImport />)}</AppLayout></ProtectedRoute>} />
            <Route path="/products/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<ProductView />)}</AppLayout></ProtectedRoute>} />
            <Route path="/products/:id/edit" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<ProductForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/inventory/categories" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<CategoryManagement />)}</AppLayout></ProtectedRoute>} />
            <Route path="/inventory/:type" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<LookupManagement />)}</AppLayout></ProtectedRoute>} />
            <Route path="/trial-balance" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<TrialBalance />)}</AppLayout></ProtectedRoute>} />
            <Route path="/income-statement" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<IncomeStatement />)}</AppLayout></ProtectedRoute>} />
            <Route path="/balance-sheet" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<BalanceSheet />)}</AppLayout></ProtectedRoute>} />
            <Route path="/cash-flow" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<CashFlowStatement />)}</AppLayout></ProtectedRoute>} />
            <Route path="/reports/sales" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<SalesReportPage />)}</AppLayout></ProtectedRoute>} />
            <Route path="/reports/purchases" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<PurchasesReportPage />)}</AppLayout></ProtectedRoute>} />
            <Route path="/reports/inventory" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<InventoryReportPage />)}</AppLayout></ProtectedRoute>} />
            <Route path="/reports/aging" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<DebtAgingReportPage />)}</AppLayout></ProtectedRoute>} />
            <Route path="/reports/growth" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<GrowthAnalyticsPage />)}</AppLayout></ProtectedRoute>} />
            <Route path="/reports/products" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<ProductAnalyticsPage />)}</AppLayout></ProtectedRoute>} />
            <Route path="/reports/balances" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<AccountBalancesPage />)}</AppLayout></ProtectedRoute>} />
            <Route path="/reports/profit-loss" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<ProfitLossPage />)}</AppLayout></ProtectedRoute>} />
            <Route path="/customer-statement" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<CustomerStatement />)}</AppLayout></ProtectedRoute>} />
            <Route path="/supplier-statement" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<SupplierStatement />)}</AppLayout></ProtectedRoute>} />
            <Route path="/inventory-movements" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<InventoryMovements />)}</AppLayout></ProtectedRoute>} />
            <Route path="/reports/inventory-turnover" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<TurnoverLayout />)}</AppLayout></ProtectedRoute>}>
              <Route index element={withSuspense(<TurnoverDashboardPage />)} />
              <Route path="dashboard" element={withSuspense(<TurnoverDashboardPage />)} />
              <Route path="urgent-actions" element={withSuspense(<UrgentActionsPage />)} />
              <Route path="purchase-planning" element={withSuspense(<PurchasePlanningPage />)} />
              <Route path="dormant" element={withSuspense(<DormantInventoryPage />)} />
              <Route path="supplier-returns" element={withSuspense(<SupplierReturnsPage />)} />
              <Route path="new-products" element={withSuspense(<NewProductsPage />)} />
              <Route path="unlisted" element={withSuspense(<UnlistedProductsPage />)} />
              <Route path="analysis" element={withSuspense(<FullAnalysisPage />)} />
              <Route path="health" element={withSuspense(<ProductHealthPage />)} />
            </Route>
            <Route path="/inventory-adjustments" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<InventoryAdjustments />)}</AppLayout></ProtectedRoute>} />
            <Route path="/inventory-adjustments/new" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<InventoryAdjustmentForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/inventory-adjustments/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<InventoryAdjustmentForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin"]}><AppLayout>{withSuspense(<SettingsPage />)}</AppLayout></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute allowedRoles={["admin"]}><AppLayout>{withSuspense(<UserManagement />)}</AppLayout></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><AppLayout>{withSuspense(<Profile />)}</AppLayout></ProtectedRoute>} />
            <Route path="/system-setup" element={<ProtectedRoute allowedRoles={["admin"]}><AppLayout>{withSuspense(<SystemSetup />)}</AppLayout></ProtectedRoute>} />
            <Route path="/fiscal-year-closing" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<FiscalYearClosing />)}</AppLayout></ProtectedRoute>} />
            <Route path="/expense-types" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout>{withSuspense(<ExpenseTypes />)}</AppLayout></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<Expenses />)}</AppLayout></ProtectedRoute>} />
            <Route path="/expenses/new" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<ExpenseForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="/expenses/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout>{withSuspense(<ExpenseForm />)}</AppLayout></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </SettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
