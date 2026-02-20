import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Package,
  BarChart3,
  Users,
  Truck,
  BookOpen,
  Calculator,
  Settings,
  UserCog,
  RotateCcw,
  ClipboardCheck,
  CreditCard,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useSettings } from "@/contexts/SettingsContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";

type AppRole = "admin" | "accountant" | "sales";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
}

const mainItems: MenuItem[] = [
  { title: "لوحة التحكم", url: "/", icon: LayoutDashboard, roles: ["admin", "accountant", "sales"] },
];

const accountingItems: MenuItem[] = [
  { title: "شجرة الحسابات", url: "/accounts", icon: BookOpen, roles: ["admin", "accountant"] },
  { title: "القيود المحاسبية", url: "/journal", icon: FileText, roles: ["admin", "accountant"] },
  { title: "دفتر الأستاذ", url: "/ledger", icon: Calculator, roles: ["admin", "accountant"] },
  { title: "ميزان المراجعة", url: "/trial-balance", icon: BarChart3, roles: ["admin", "accountant"] },
];

const salesItems: MenuItem[] = [
  { title: "فواتير البيع", url: "/sales", icon: FileText, roles: ["admin", "accountant", "sales"] },
  { title: "مرتجعات البيع", url: "/sales-returns", icon: RotateCcw, roles: ["admin", "accountant", "sales"] },
  { title: "مدفوعات العملاء", url: "/customer-payments", icon: CreditCard, roles: ["admin", "accountant", "sales"] },
  { title: "العملاء", url: "/customers", icon: Users, roles: ["admin", "accountant", "sales"] },
];

const purchaseItems: MenuItem[] = [
  { title: "فواتير الشراء", url: "/purchases", icon: ShoppingCart, roles: ["admin", "accountant"] },
  { title: "مرتجعات الشراء", url: "/purchase-returns", icon: RotateCcw, roles: ["admin", "accountant"] },
  { title: "مدفوعات الموردين", url: "/supplier-payments", icon: CreditCard, roles: ["admin", "accountant"] },
  { title: "الموردين", url: "/suppliers", icon: Truck, roles: ["admin", "accountant"] },
];

const inventoryItems: MenuItem[] = [
  { title: "المنتجات", url: "/products", icon: Package, roles: ["admin", "accountant", "sales"] },
  { title: "تسوية المخزون", url: "/inventory-adjustments", icon: ClipboardCheck, roles: ["admin", "accountant"] },
  { title: "التصنيفات", url: "/inventory/categories", icon: Package, roles: ["admin", "accountant"] },
  { title: "وحدات القياس", url: "/inventory/units", icon: Package, roles: ["admin", "accountant"] },
  { title: "الماركات", url: "/inventory/brands", icon: Package, roles: ["admin", "accountant"] },
];

const reportItems: MenuItem[] = [
  { title: "قائمة الدخل", url: "/income-statement", icon: BarChart3, roles: ["admin", "accountant"] },
  { title: "الميزانية العمومية", url: "/balance-sheet", icon: BarChart3, roles: ["admin", "accountant"] },
  { title: "التقارير", url: "/reports", icon: BarChart3, roles: ["admin", "accountant"] },
  { title: "حركة المخزون", url: "/inventory-movements", icon: Package, roles: ["admin", "accountant"] },
];

const settingsItems: MenuItem[] = [
  { title: "إدارة المستخدمين", url: "/users", icon: UserCog, roles: ["admin"] },
  { title: "الإعدادات", url: "/settings", icon: Settings, roles: ["admin"] },
];

function SidebarMenuItems({ items }: { items: MenuItem[] }) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <RoleGuard key={item.title} allowedRoles={item.roles}>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink to={item.url} end={item.url === "/"} activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold">
                <item.icon className="w-4 h-4" />
                <span>{item.title}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </RoleGuard>
      ))}
    </SidebarMenu>
  );
}

export function AppSidebar() {
  const { settings } = useSettings();

  return (
    <Sidebar className="border-l-0 border-e" side="right">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {settings?.logo_url ? (
            <img
              src={settings.logo_url}
              alt={settings.company_name || "Logo"}
              className="w-9 h-9 rounded-lg object-contain"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <Calculator className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-sidebar-foreground truncate">
              {settings?.company_name || "النظام المحاسبي"}
            </h2>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {settings?.business_activity || "إدارة متكاملة"}
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenuItems items={mainItems} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs">المحاسبة</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenuItems items={accountingItems} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs">المبيعات</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenuItems items={salesItems} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs">المشتريات</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenuItems items={purchaseItems} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs">المخزون</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenuItems items={inventoryItems} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs">التقارير</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenuItems items={reportItems} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenuItems items={settingsItems} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
