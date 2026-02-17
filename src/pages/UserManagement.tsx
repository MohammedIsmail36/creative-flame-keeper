import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Users, Trash2, UserPlus, Search, Download, Filter, Shield, ShieldCheck, ShieldAlert } from "lucide-react";

type AppRole = "admin" | "accountant" | "sales";

interface UserWithRole {
  user_id: string;
  full_name: string;
  role: AppRole;
  created_at: string;
}

const roleLabels: Record<AppRole, string> = {
  admin: "مدير",
  accountant: "محاسب",
  sales: "موظف مبيعات",
};

const roleIcons: Record<AppRole, typeof Shield> = {
  admin: ShieldAlert,
  accountant: ShieldCheck,
  sales: Shield,
};

const roleColors: Record<AppRole, string> = {
  admin: "bg-primary/10 text-primary border-primary/20",
  accountant: "bg-accent text-accent-foreground border-accent-foreground/20",
  sales: "bg-muted text-muted-foreground border-border",
};

export default function UserManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");

  // Add user dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("sales");
  const [addLoading, setAddLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role, created_at");

    if (rolesError) {
      toast({ title: "خطأ", description: "فشل في جلب بيانات المستخدمين", variant: "destructive" });
      setLoading(false);
      return;
    }

    const userIds = roles.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name || "بدون اسم"]) ?? []);

    setUsers(
      roles.map((r) => ({
        user_id: r.user_id,
        full_name: profileMap.get(r.user_id) || "بدون اسم",
        role: r.role as AppRole,
        created_at: r.created_at,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch = u.full_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: users.length, admin: 0, accountant: 0, sales: 0 };
    users.forEach((u) => counts[u.role]++);
    return counts;
  }, [users]);

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    if (userId === user?.id) {
      toast({ title: "تنبيه", description: "لا يمكنك تغيير دورك بنفسك", variant: "destructive" });
      return;
    }

    const { error } = await supabase
      .from("user_roles")
      .update({ role: newRole })
      .eq("user_id", userId);

    if (error) {
      toast({ title: "خطأ", description: "فشل في تحديث الدور", variant: "destructive" });
      return;
    }

    toast({ title: "تم التحديث", description: "تم تغيير دور المستخدم بنجاح" });
    setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u)));
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === user?.id) {
      toast({ title: "تنبيه", description: "لا يمكنك حذف حسابك بنفسك", variant: "destructive" });
      return;
    }

    const { error: roleError } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (roleError) {
      toast({ title: "خطأ", description: "فشل في حذف دور المستخدم", variant: "destructive" });
      return;
    }

    const { error: profileError } = await supabase.from("profiles").delete().eq("id", userId);
    if (profileError) {
      console.error("Failed to delete profile:", profileError);
    }

    toast({ title: "تم الحذف", description: "تم حذف المستخدم بنجاح" });
    setUsers((prev) => prev.filter((u) => u.user_id !== userId));
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: newEmail,
        password: newPassword,
        options: {
          data: { full_name: newFullName },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      toast({
        title: "تم إنشاء الحساب",
        description: "تم إرسال رابط التأكيد إلى البريد الإلكتروني للمستخدم الجديد.",
      });
      setAddDialogOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewFullName("");
      setNewRole("sales");

      // Refresh after a short delay to allow trigger to run
      setTimeout(() => fetchUsers(), 1500);
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setAddLoading(false);
    }
  };

  const handleExport = () => {
    const headers = ["الاسم", "الدور", "تاريخ الإنشاء"];
    const rows = filteredUsers.map((u) => [
      u.full_name,
      roleLabels[u.role],
      new Date(u.created_at).toLocaleDateString("ar-SA"),
    ]);
    const csvContent = "\uFEFF" + [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "المستخدمين.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "تم التصدير", description: "تم تصدير قائمة المستخدمين بنجاح" });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">إدارة المستخدمين</h1>
            <p className="text-sm text-muted-foreground">{users.length} مستخدم مسجّل</p>
          </div>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              إضافة مستخدم
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة مستخدم جديد</DialogTitle>
              <DialogDescription>أدخل بيانات المستخدم الجديد لإنشاء حساب له</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newFullName">الاسم الكامل</Label>
                <Input id="newFullName" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} placeholder="أدخل الاسم الكامل" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newEmail">البريد الإلكتروني</Label>
                <Input id="newEmail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="example@mail.com" required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">كلمة المرور</Label>
                <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="6 أحرف على الأقل" required minLength={6} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>الدور</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">مدير</SelectItem>
                    <SelectItem value="accountant">محاسب</SelectItem>
                    <SelectItem value="sales">موظف مبيعات</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter className="flex-row-reverse gap-2 pt-2">
                <Button type="submit" disabled={addLoading} className="gap-2">
                  {addLoading ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "all" as const, label: "الكل", icon: Users, color: "bg-foreground/5 text-foreground" },
          { key: "admin" as const, label: "مدراء", icon: ShieldAlert, color: "bg-primary/10 text-primary" },
          { key: "accountant" as const, label: "محاسبين", icon: ShieldCheck, color: "bg-accent text-accent-foreground" },
          { key: "sales" as const, label: "مبيعات", icon: Shield, color: "bg-muted text-muted-foreground" },
        ].map(({ key, label, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => setRoleFilter(key === "all" ? "all" : key)}
            className={`rounded-xl border p-4 text-right transition-all hover:shadow-md ${
              roleFilter === key ? "ring-2 ring-primary border-primary" : "border-border"
            } bg-card`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-2xl font-bold text-foreground">{roleCounts[key]}</span>
            </div>
            <p className="text-sm text-muted-foreground">{label}</p>
          </button>
        ))}
      </div>

      {/* Search & Actions Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث بالاسم..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as AppRole | "all")}>
                <SelectTrigger className="w-40 gap-2">
                  <Filter className="h-4 w-4" />
                  <SelectValue placeholder="تصفية بالدور" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأدوار</SelectItem>
                  <SelectItem value="admin">مدير</SelectItem>
                  <SelectItem value="accountant">محاسب</SelectItem>
                  <SelectItem value="sales">موظف مبيعات</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleExport} className="gap-2">
                <Download className="h-4 w-4" />
                تصدير
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 py-4">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <span>قائمة المستخدمين</span>
            <Badge variant="secondary" className="font-normal">{filteredUsers.length} نتيجة</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Users className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <p className="text-muted-foreground">لا توجد نتائج مطابقة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="text-right font-semibold">المستخدم</TableHead>
                    <TableHead className="text-right font-semibold">الدور</TableHead>
                    <TableHead className="text-right font-semibold">تغيير الدور</TableHead>
                    <TableHead className="text-right font-semibold">تاريخ الانضمام</TableHead>
                    <TableHead className="text-center font-semibold w-24">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const RoleIcon = roleIcons[u.role];
                    return (
                      <TableRow key={u.user_id} className="group hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                              {u.full_name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">
                                {u.full_name}
                                {u.user_id === user?.id && (
                                  <Badge variant="outline" className="mr-2 text-xs align-middle">أنت</Badge>
                                )}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${roleColors[u.role]}`}>
                            <RoleIcon className="h-3 w-3" />
                            {roleLabels[u.role]}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={u.role}
                            onValueChange={(val) => handleRoleChange(u.user_id, val as AppRole)}
                            disabled={u.user_id === user?.id}
                          >
                            <SelectTrigger className="w-36 h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">مدير</SelectItem>
                              <SelectItem value="accountant">محاسب</SelectItem>
                              <SelectItem value="sales">موظف مبيعات</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(u.created_at).toLocaleDateString("ar-SA")}
                        </TableCell>
                        <TableCell className="text-center">
                          {u.user_id !== user?.id ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent dir="rtl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    هل أنت متأكد من حذف المستخدم "{u.full_name}"؟ لا يمكن التراجع عن هذا الإجراء.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="flex-row-reverse gap-2">
                                  <AlertDialogAction onClick={() => handleDeleteUser(u.user_id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    حذف
                                  </AlertDialogAction>
                                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
