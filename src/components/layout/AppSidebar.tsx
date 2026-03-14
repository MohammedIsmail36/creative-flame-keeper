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
  TrendingUp,
  Landmark,
  ReceiptText,
  Boxes,
  ChartPie,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useSettings } from "@/contexts/SettingsContext";
import { useLocation } from "react-router-dom";
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
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

type AppRole = "admin" | "accountant" | "sales";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
}

interface MenuSection {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  colorVar: string;
  items: MenuItem[];
  defaultOpen?: boolean;
}

const sections: MenuSection[] = [
  {
    label: "المخزون",
    icon: Boxes,
    colorVar: "var(--cat-inventory)",
    items: [
      { title: "المنتجات", url: "/products", icon: Package, roles: ["admin", "accountant", "sales"] },
      { title: "الوحدات", url: "/inventory/units", icon: Package, roles: ["admin", "accountant"] },
      { title: "التصنيف", url: "/inventory/categories", icon: Package, roles: ["admin", "accountant"] },
      { title: "الماركة المصنعة", url: "/inventory/brands", icon: Package, roles: ["admin", "accountant"] },
    ],
  },
  {
    label: "الحسابات",
    icon: Landmark,
    colorVar: "var(--cat-accounting)",
    items: [
      { title: "شجرة الحسابات", url: "/accounts", icon: BookOpen, roles: ["admin", "accountant"] },
      { title: "قيود اليومية", url: "/journal", icon: FileText, roles: ["admin", "accountant"] },
      { title: "دفتر الأستاذ", url: "/ledger", icon: Calculator, roles: ["admin", "accountant"] },
    ],
  },
  {
    label: "المشتريات",
    icon: ShoppingCart,
    colorVar: "var(--cat-purchases)",
    items: [
      { title: "فاتورة مشتريات", url: "/purchases", icon: ReceiptText, roles: ["admin", "accountant"] },
      { title: "مرتجع مشتريات", url: "/purchase-returns", icon: RotateCcw, roles: ["admin", "accountant"] },
      { title: "مدفوعات موردين", url: "/supplier-payments", icon: CreditCard, roles: ["admin", "accountant"] },
      { title: "الموردين", url: "/suppliers", icon: Truck, roles: ["admin", "accountant"] },
    ],
  },
  {
    label: "المبيعات",
    icon: TrendingUp,
    colorVar: "var(--cat-sales)",
    items: [
      { title: "فاتورة مبيعات", url: "/sales", icon: ReceiptText, roles: ["admin", "accountant", "sales"] },
      { title: "مرتجع مبيعات", url: "/sales-returns", icon: RotateCcw, roles: ["admin", "accountant", "sales"] },
      { title: "مدفوعات عملاء", url: "/customer-payments", icon: CreditCard, roles: ["admin", "accountant", "sales"] },
      { title: "العملاء", url: "/customers", icon: Users, roles: ["admin", "accountant", "sales"] },
    ],
  },
  {
    label: "التقارير",
    icon: ChartPie,
    colorVar: "var(--cat-reports)",
    items: [
      { title: "ميزان المراجعة", url: "/trial-balance", icon: BarChart3, roles: ["admin", "accountant"] },
      { title: "قائمة الدخل", url: "/income-statement", icon: BarChart3, roles: ["admin", "accountant"] },
      { title: "الميزانية العمومية", url: "/balance-sheet", icon: BarChart3, roles: ["admin", "accountant"] },
      { title: "التقارير", url: "/reports", icon: BarChart3, roles: ["admin", "accountant"] },
      { title: "حركة المخزون", url: "/inventory-movements", icon: Package, roles: ["admin", "accountant"] },
      { title: "تسوية المخزون", url: "/inventory-adjustments", icon: ClipboardCheck, roles: ["admin", "accountant"] },
    ],
  },
];

const settingsItems: MenuItem[] = [
  { title: "إدارة المستخدمين", url: "/users", icon: UserCog, roles: ["admin"] },
  { title: "الإعدادات", url: "/settings", icon: Settings, roles: ["admin"] },
  { title: "إعداد النظام", url: "/system-setup", icon: Settings, roles: ["admin"] },
];

function CollapsibleSection({ section }: { section: MenuSection }) {
  const location = useLocation();
  const isActive = section.items.some(item => location.pathname === item.url || location.pathname.startsWith(item.url + "/"));
  const [open, setOpen] = useState(isActive);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup className="py-0">
        <CollapsibleTrigger className="w-full">
          <SidebarGroupLabel className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/50 rounded-md transition-colors text-foreground/80 text-sm font-semibold">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `hsl(${section.colorVar} / 0.12)`, color: `hsl(${section.colorVar})` }}
            >
              <section.icon className="w-4 h-4" />
            </div>
            <span className="flex-1 text-right">{section.label}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent className="pr-9 pt-0.5 pb-1">
            <SidebarMenu>
              {section.items.map((item) => (
                <RoleGuard key={item.title} allowedRoles={item.roles}>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="h-8">
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted/50 text-[13px]"
                        activeClassName="text-primary bg-accent font-semibold"
                      >
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </RoleGuard>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function AppSidebar() {
  const { settings } = useSettings();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar className="border-l-0 border-e border-border/60" side="right">
      <SidebarHeader className="p-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          {settings?.logo_url ? (
            <img
              src={settings.logo_url}
              alt={settings.company_name || "Logo"}
              className="w-9 h-9 rounded-xl object-contain"
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Calculator className="w-5 h-5 text-primary-foreground" />
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">
                {settings?.company_name || "النظام المحاسبي"}
              </h2>
              <p className="text-[11px] text-muted-foreground truncate">
                {settings?.business_activity || "نظام المحاسبة الذكي"}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {/* Dashboard */}
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="h-9">
                  <NavLink
                    to="/"
                    end
                    className="text-foreground/80 hover:bg-muted/50 font-medium"
                    activeClassName="text-primary bg-accent font-semibold"
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `hsl(var(--primary) / 0.12)` }}
                    >
                      <LayoutDashboard className="w-4 h-4 text-primary" />
                    </div>
                    <span>لوحة التحكم</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Collapsible sections */}
        {sections.map((section) => (
          <CollapsibleSection key={section.label} section={section} />
        ))}

        {/* Settings */}
        <SidebarGroup className="py-0 mt-2 border-t border-border/40 pt-2">
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <RoleGuard key={item.title} allowedRoles={item.roles}>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild className="h-8">
                      <NavLink
                        to={item.url}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted/50 text-[13px]"
                        activeClassName="text-primary bg-accent font-semibold"
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </RoleGuard>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
