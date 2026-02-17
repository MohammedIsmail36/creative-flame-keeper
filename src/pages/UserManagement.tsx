import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Users, Trash2 } from "lucide-react";

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

const roleBadgeVariant: Record<AppRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  accountant: "secondary",
  sales: "outline",
};

export default function UserManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">إدارة المستخدمين</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">قائمة المستخدمين</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا يوجد مستخدمين</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">الدور الحالي</TableHead>
                  <TableHead className="text-right">تغيير الدور</TableHead>
                  <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">
                      {u.full_name}
                      {u.user_id === user?.id && (
                        <Badge variant="outline" className="mr-2 text-xs">أنت</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant[u.role]}>{roleLabels[u.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(val) => handleRoleChange(u.user_id, val as AppRole)}
                        disabled={u.user_id === user?.id}
                      >
                        <SelectTrigger className="w-40">
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
                    <TableCell>
                      {u.user_id !== user?.id ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon">
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
