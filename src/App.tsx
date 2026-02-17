import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Journal from "./pages/Journal";
import Ledger from "./pages/Ledger";
import Sales from "./pages/Sales";
import SalesInvoiceForm from "./pages/SalesInvoiceForm";
import Customers from "./pages/Customers";
import Purchases from "./pages/Purchases";
import PurchaseInvoiceForm from "./pages/PurchaseInvoiceForm";
import Suppliers from "./pages/Suppliers";
import Products from "./pages/Products";
import ProductForm from "./pages/ProductForm";
import ProductView from "./pages/ProductView";
import ProductImport from "./pages/ProductImport";
import LookupManagement from "./pages/LookupManagement";
import Reports from "./pages/Reports";
import TrialBalance from "./pages/TrialBalance";
import IncomeStatement from "./pages/IncomeStatement";
import BalanceSheet from "./pages/BalanceSheet";
import SettingsPage from "./pages/SettingsPage";
import UserManagement from "./pages/UserManagement";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
            <Route path="/accounts" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><Accounts /></AppLayout></ProtectedRoute>} />
            <Route path="/journal" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><Journal /></AppLayout></ProtectedRoute>} />
            <Route path="/ledger" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><Ledger /></AppLayout></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout><Sales /></AppLayout></ProtectedRoute>} />
            <Route path="/sales/new" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout><SalesInvoiceForm /></AppLayout></ProtectedRoute>} />
            <Route path="/sales/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout><SalesInvoiceForm /></AppLayout></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout><Customers /></AppLayout></ProtectedRoute>} />
            <Route path="/purchases" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><Purchases /></AppLayout></ProtectedRoute>} />
            <Route path="/purchases/new" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><PurchaseInvoiceForm /></AppLayout></ProtectedRoute>} />
            <Route path="/purchases/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><PurchaseInvoiceForm /></AppLayout></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><Suppliers /></AppLayout></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout><Products /></AppLayout></ProtectedRoute>} />
            <Route path="/products/new" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><ProductForm /></AppLayout></ProtectedRoute>} />
            <Route path="/products/import" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><ProductImport /></AppLayout></ProtectedRoute>} />
            <Route path="/products/:id" element={<ProtectedRoute allowedRoles={["admin", "accountant", "sales"]}><AppLayout><ProductView /></AppLayout></ProtectedRoute>} />
            <Route path="/products/:id/edit" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><ProductForm /></AppLayout></ProtectedRoute>} />
            <Route path="/inventory/:type" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><LookupManagement /></AppLayout></ProtectedRoute>} />
            <Route path="/trial-balance" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><TrialBalance /></AppLayout></ProtectedRoute>} />
            <Route path="/income-statement" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><IncomeStatement /></AppLayout></ProtectedRoute>} />
            <Route path="/balance-sheet" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><BalanceSheet /></AppLayout></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute allowedRoles={["admin", "accountant"]}><AppLayout><Reports /></AppLayout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin"]}><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute allowedRoles={["admin"]}><AppLayout><UserManagement /></AppLayout></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
