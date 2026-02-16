import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b bg-card flex items-center px-4 gap-3">
            <SidebarTrigger />
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{fullName || "مستخدم"}</span>
                {role && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {roleLabels[role] || role}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={signOut} title="تسجيل الخروج">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
