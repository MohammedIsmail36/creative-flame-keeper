import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppBreadcrumb } from "./AppBreadcrumb";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, User, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";

interface AppLayoutProps {
  children: React.ReactNode;
}

const roleLabels: Record<string, string> = {
  admin: "مدير",
  accountant: "محاسب",
  sales: "موظف مبيعات",
};

export function AppLayout({ children }: AppLayoutProps) {
  const { fullName, role, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b border-border/60 bg-card flex items-center px-4 gap-3 sticky top-0 z-50">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <AppBreadcrumb />
            <div className="flex-1" />
            {/* User */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/profile")}
                className="flex items-center gap-1.5 text-xs hover:text-primary transition-colors cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-medium hidden sm:inline">{fullName || "مستخدم"}</span>
              </button>
              <Button variant="ghost" size="icon" onClick={signOut} title="تسجيل الخروج" className="h-7 w-7">
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          </header>
          <main className="px-6 pb-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
