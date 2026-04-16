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
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";

const PageLoading = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <Skeleton className="h-8 w-48" />
  </div>
);

const Dashboard = lazy(() => import("./pages/Dashboard"));
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
const SalesReportPage = lazy(() => import("./pages/reports/SalesReportPage"));
const PurchasesReportPage = lazy(
  () => import("./pages/reports/PurchasesReportPage"),
);
const InventoryReportPage = lazy(
  () => import("./pages/reports/InventoryReportPage"),
);
const DebtAgingReportPage = lazy(
  () => import("./pages/reports/DebtAgingReportPage"),
);
const GrowthAnalyticsPage = lazy(
  () => import("./pages/reports/GrowthAnalyticsPage"),
);
const ProductAnalyticsPage = lazy(
  () => import("./pages/reports/ProductAnalyticsPage"),
);
const AccountBalancesPage = lazy(
  () => import("./pages/reports/AccountBalancesPage"),
);
const ProfitLossPage = lazy(() => import("./pages/reports/ProfitLossPage"));
const InventoryMovements = lazy(() => import("./pages/InventoryMovements"));
const TurnoverLayout = lazy(
  () => import("./pages/reports/inventory-turnover/TurnoverLayout"),
);
const TurnoverDashboardPage = lazy(
  () => import("./pages/reports/inventory-turnover/TurnoverDashboardPage"),
);
const UrgentActionsPage = lazy(
  () => import("./pages/reports/inventory-turnover/UrgentActionsPage"),
);
const PurchasePlanningPage = lazy(
  () => import("./pages/reports/inventory-turnover/PurchasePlanningPage"),
);
const DormantInventoryPage = lazy(
  () => import("./pages/reports/inventory-turnover/DormantInventoryPage"),
);
const SupplierReturnsPage = lazy(
  () => import("./pages/reports/inventory-turnover/SupplierReturnsPage"),
);
const NewProductsPage = lazy(
  () => import("./pages/reports/inventory-turnover/NewProductsPage"),
);
const FullAnalysisPage = lazy(
  () => import("./pages/reports/inventory-turnover/FullAnalysisPage"),
);
const UnlistedProductsPage = lazy(
  () => import("./pages/reports/inventory-turnover/UnlistedProductsPage"),
);
const InventoryAdjustments = lazy(() => import("./pages/InventoryAdjustments"));
const InventoryAdjustmentForm = lazy(
  () => import("./pages/InventoryAdjustmentForm"),
);
const TrialBalance = lazy(() => import("./pages/TrialBalance"));
const IncomeStatement = lazy(() => import("./pages/IncomeStatement"));
const BalanceSheet = lazy(() => import("./pages/BalanceSheet"));
const CashFlowStatement = lazy(() => import("./pages/CashFlowStatement"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const Auth = lazy(() => import("./pages/Auth"));
const MfaVerify = lazy(() => import("./pages/MfaVerify"));
const Profile = lazy(() => import("./pages/Profile"));
const SystemSetup = lazy(() => import("./pages/SystemSetup"));
const CustomerStatement = lazy(() => import("./pages/CustomerStatement"));
const SupplierStatement = lazy(() => import("./pages/SupplierStatement"));
const NotFound = lazy(() => import("./pages/NotFound"));
const FiscalYearClosing = lazy(() => import("./pages/FiscalYearClosing"));
const ExpenseTypes = lazy(() => import("./pages/ExpenseTypes"));
const Expenses = lazy(() => import("./pages/Expenses"));
const ExpenseForm = lazy(() => import("./pages/ExpenseForm"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SettingsProvider>
            <ErrorBoundary>
              <Suspense fallback={<PageLoading />}>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/auth/mfa" element={<MfaVerify />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <AppLayout>
                          <Dashboard />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/accounts"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <Accounts />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/journal"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <Journal />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/journal/new"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <JournalEntryForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/journal/:id"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <JournalEntryForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/ledger"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <Ledger />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/sales"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <Sales />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/sales/new"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <SalesInvoiceForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/sales/:id"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <SalesInvoiceForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/sales-returns"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <SalesReturns />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/sales-returns/new"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <SalesReturnForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/sales-returns/:id"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <SalesReturnForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/customer-payments"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <CustomerPayments />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/customers"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <Customers />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/customer-statement/:id"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <CustomerStatement />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/purchases"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <Purchases />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/purchases/new"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <PurchaseInvoiceForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/purchases/:id"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <PurchaseInvoiceForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/purchase-returns"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <PurchaseReturns />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/purchase-returns/new"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <PurchaseReturnForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/purchase-returns/:id"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <PurchaseReturnForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/supplier-payments"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <SupplierPayments />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/suppliers"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <Suppliers />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/supplier-statement/:id"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <SupplierStatement />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/products"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <Products />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/products/new"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <ProductForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/products/import"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <ProductImport />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/products/:id"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <ProductView />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/products/:id/edit"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <ProductForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory/categories"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <CategoryManagement />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory/:type"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <LookupManagement />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/trial-balance"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <TrialBalance />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/income-statement"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <IncomeStatement />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/balance-sheet"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <BalanceSheet />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cash-flow"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <CashFlowStatement />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/sales"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <SalesReportPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/purchases"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <PurchasesReportPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/inventory"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <InventoryReportPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/aging"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <DebtAgingReportPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/growth"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <GrowthAnalyticsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/products"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <ProductAnalyticsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/balances"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <AccountBalancesPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/profit-loss"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <ProfitLossPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/customer-statement"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <CustomerStatement />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/supplier-statement"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <SupplierStatement />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory-movements"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <InventoryMovements />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/inventory-turnover"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <TurnoverLayout />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<TurnoverDashboardPage />} />
                    <Route
                      path="urgent-actions"
                      element={<UrgentActionsPage />}
                    />
                    <Route
                      path="purchase-planning"
                      element={<PurchasePlanningPage />}
                    />
                    <Route path="dormant" element={<DormantInventoryPage />} />
                    <Route
                      path="supplier-returns"
                      element={<SupplierReturnsPage />}
                    />
                    <Route path="new-products" element={<NewProductsPage />} />
                    <Route path="unlisted" element={<UnlistedProductsPage />} />
                    <Route path="analysis" element={<FullAnalysisPage />} />
                  </Route>
                  <Route
                    path="/inventory-adjustments"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <InventoryAdjustments />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory-adjustments/new"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <InventoryAdjustmentForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventory-adjustments/:id"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <InventoryAdjustmentForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <AppLayout>
                          <SettingsPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/users"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <AppLayout>
                          <UserManagement />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <AppLayout>
                          <Profile />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/system-setup"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <AppLayout>
                          <SystemSetup />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/fiscal-year-closing"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <FiscalYearClosing />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/expense-types"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "accountant"]}>
                        <AppLayout>
                          <ExpenseTypes />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/expenses"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <Expenses />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/expenses/new"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <ExpenseForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/expenses/:id"
                    element={
                      <ProtectedRoute
                        allowedRoles={["admin", "accountant", "sales"]}
                      >
                        <AppLayout>
                          <ExpenseForm />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </SettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
