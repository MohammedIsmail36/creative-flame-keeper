import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  ShoppingCart,
  Users,
  FileText,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const salesData = [
  { name: "يناير", مبيعات: 12000, مشتريات: 8000 },
  { name: "فبراير", مبيعات: 15000, مشتريات: 9500 },
  { name: "مارس", مبيعات: 18000, مشتريات: 11000 },
  { name: "أبريل", مبيعات: 14000, مشتريات: 7500 },
  { name: "مايو", مبيعات: 22000, مشتريات: 13000 },
  { name: "يونيو", مبيعات: 19000, مشتريات: 10000 },
];

const profitData = [
  { name: "يناير", ربح: 4000 },
  { name: "فبراير", ربح: 5500 },
  { name: "مارس", ربح: 7000 },
  { name: "أبريل", ربح: 6500 },
  { name: "مايو", ربح: 9000 },
  { name: "يونيو", ربح: 9000 },
];

const summaryCards = [
  {
    title: "إجمالي المبيعات",
    value: "٩٨,٥٠٠ ر.س",
    change: "+١٢.٥%",
    trend: "up" as const,
    icon: DollarSign,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    title: "إجمالي المشتريات",
    value: "٥٩,٠٠٠ ر.س",
    change: "+٨.٣%",
    trend: "up" as const,
    icon: ShoppingCart,
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  {
    title: "صافي الربح",
    value: "٣٩,٥٠٠ ر.س",
    change: "+١٥.٢%",
    trend: "up" as const,
    icon: TrendingUp,
    color: "text-success",
    bgColor: "bg-success/10",
  },
  {
    title: "المنتجات في المخزون",
    value: "٢٤٨",
    change: "-٣ تنبيهات",
    trend: "down" as const,
    icon: Package,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
];

const recentInvoices = [
  { id: "INV-001", customer: "شركة النور", amount: "٥,٢٠٠ ر.س", status: "مدفوعة" },
  { id: "INV-002", customer: "مؤسسة الأمل", amount: "٣,٨٠٠ ر.س", status: "معلقة" },
  { id: "INV-003", customer: "شركة البناء", amount: "١٢,٠٠٠ ر.س", status: "مدفوعة" },
  { id: "INV-004", customer: "مكتبة المعرفة", amount: "١,٥٠٠ ر.س", status: "مسودة" },
];

const lowStockItems = [
  { name: "ورق طباعة A4", current: 15, min: 50 },
  { name: "حبر طابعة أسود", current: 3, min: 10 },
  { name: "أقلام حبر جاف", current: 20, min: 100 },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        <p className="text-muted-foreground text-sm mt-1">نظرة عامة على النشاط التجاري</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <div className="flex items-center gap-1 text-xs">
                    {card.trend === "up" ? (
                      <TrendingUp className="w-3 h-3 text-success" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-destructive" />
                    )}
                    <span className={card.trend === "up" ? "text-success" : "text-destructive"}>
                      {card.change}
                    </span>
                  </div>
                </div>
                <div className={`p-2.5 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">المبيعات والمشتريات</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="مبيعات" fill="hsl(217, 91%, 50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="مشتريات" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">صافي الربح</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={profitData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="ربح"
                  stroke="hsl(142, 71%, 45%)"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              آخر الفواتير
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{inv.customer}</p>
                    <p className="text-xs text-muted-foreground">{inv.id}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold">{inv.amount}</p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        inv.status === "مدفوعة"
                          ? "bg-success/10 text-success"
                          : inv.status === "معلقة"
                          ? "bg-warning/10 text-warning"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              تنبيهات المخزون
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowStockItems.map((item) => (
                <div key={item.name} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">الحد الأدنى: {item.min}</p>
                  </div>
                  <span className="text-sm font-bold text-destructive">{item.current}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
