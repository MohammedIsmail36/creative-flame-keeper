import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Pencil, Plus, Warehouse as WarehouseIcon, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notify } from "@/lib/notify";
import {
  useBranches,
  useWarehouses,
  useUserBranchAssignments,
  type Branch,
  type Warehouse,
} from "@/hooks/use-branches";
import type { ColumnDef } from "@tanstack/react-table";

// ────────────────────────── فروع ──────────────────────────

interface BranchFormState {
  id?: string;
  code: string;
  name: string;
  name_en: string;
  address: string;
  phone: string;
}

const emptyBranchForm: BranchFormState = { code: "", name: "", name_en: "", address: "", phone: "" };

function BranchDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: BranchFormState;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<BranchFormState>(initial);
  const [saving, setSaving] = useState(false);

  useMemo(() => setForm(initial), [initial]);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      notify.warning("أدخل كود الفرع واسمه");
      return;
    }
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      name_en: form.name_en.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
    };
    const { error } = form.id
      ? await supabase.from("branches").update(payload).eq("id", form.id)
      : await supabase.from("branches").insert(payload);
    setSaving(false);
    if (error) return notify.dbError("تعذّر حفظ الفرع", error);
    notify.success(form.id ? "تم تحديث الفرع" : "تمت إضافة الفرع");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{form.id ? "تعديل فرع" : "إضافة فرع جديد"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الكود</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="HQ" disabled={!!form.id} />
            </div>
            <div className="space-y-1.5">
              <Label>الهاتف</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>الاسم</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="فرع الرياض" />
          </div>
          <div className="space-y-1.5">
            <Label>الاسم بالإنجليزية (اختياري)</Label>
            <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>العنوان (اختياري)</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────── مخازن ──────────────────────────

interface WarehouseFormState {
  id?: string;
  branch_id: string;
  code: string;
  name: string;
}

function WarehouseDialog({
  open,
  onOpenChange,
  initial,
  branches,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: WarehouseFormState;
  branches: Branch[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState<WarehouseFormState>(initial);
  const [saving, setSaving] = useState(false);
  useMemo(() => setForm(initial), [initial]);

  const save = async () => {
    if (!form.branch_id || !form.code.trim() || !form.name.trim()) {
      notify.warning("اختر الفرع وأدخل كود المخزن واسمه");
      return;
    }
    setSaving(true);
    const payload = { branch_id: form.branch_id, code: form.code.trim(), name: form.name.trim() };
    const { error } = form.id
      ? await supabase.from("warehouses").update(payload).eq("id", form.id)
      : await supabase.from("warehouses").insert(payload);
    setSaving(false);
    if (error) return notify.dbError("تعذّر حفظ المخزن", error);
    notify.success(form.id ? "تم تحديث المخزن" : "تمت إضافة المخزن");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{form.id ? "تعديل مخزن" : "إضافة مخزن جديد"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label>الفرع</Label>
            <Select value={form.branch_id} onValueChange={(v) => setForm({ ...form, branch_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
              <SelectContent>
                {branches.filter((b) => b.is_active).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الكود</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MAIN" />
            </div>
            <div className="space-y-1.5">
              <Label>الاسم</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="المخزن الرئيسي" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────── صلاحيات المستخدمين ──────────────────────────

interface ProfileRow {
  id: string;
  full_name: string | null;
}

function UserBranchesDialog({
  open,
  onOpenChange,
  profile,
  branches,
  assignments,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: ProfileRow | null;
  branches: Branch[];
  assignments: { branch_id: string; is_default: boolean }[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [defaultBranch, setDefaultBranch] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    setSelected(new Set(assignments.map((a) => a.branch_id)));
    setDefaultBranch(assignments.find((a) => a.is_default)?.branch_id ?? "");
  }, [assignments, profile]);

  if (!profile) return null;

  const toggle = (branchId: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(branchId);
    else {
      next.delete(branchId);
      if (defaultBranch === branchId) setDefaultBranch("");
    }
    setSelected(next);
  };

  const save = async () => {
    setSaving(true);
    const { error: delError } = await supabase
      .from("user_branches")
      .delete()
      .eq("user_id", profile.id);
    if (delError) {
      setSaving(false);
      return notify.dbError("تعذّر تحديث صلاحيات الفروع", delError);
    }
    if (selected.size > 0) {
      const rows = [...selected].map((branchId) => ({
        user_id: profile.id,
        branch_id: branchId,
        is_default: branchId === defaultBranch,
      }));
      const { error } = await supabase.from("user_branches").insert(rows);
      if (error) {
        setSaving(false);
        return notify.dbError("تعذّر حفظ صلاحيات الفروع", error);
      }
    }
    setSaving(false);
    notify.success("تم تحديث صلاحيات الفروع");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>فروع المستخدم: {profile.full_name || "بدون اسم"}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          بدون أي تحديد يصل المستخدم إلى كل الفروع. عند تحديد فرع واحد على الأقل يقتصر وصوله على المحدد.
        </p>
        <div className="grid gap-2 py-2">
          {branches.filter((b) => b.is_active).map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.has(b.id)}
                  onCheckedChange={(c) => toggle(b.id, c === true)}
                />
                {b.name}
              </label>
              {selected.has(b.id) && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="radio"
                    name="default-branch"
                    checked={defaultBranch === b.id}
                    onChange={() => setDefaultBranch(b.id)}
                    className="accent-primary"
                  />
                  افتراضي
                </label>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────── الصفحة ──────────────────────────

export default function Branches() {
  const queryClient = useQueryClient();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const { data: warehouses = [], isLoading: warehousesLoading } = useWarehouses();
  const { data: allAssignments = [] } = useUserBranchAssignments();

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-branches"],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name");
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["branches"] });
    queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    queryClient.invalidateQueries({ queryKey: ["user_branches"] });
  };

  const [branchDialog, setBranchDialog] = useState(false);
  const [branchForm, setBranchForm] = useState<BranchFormState>(emptyBranchForm);
  const [warehouseDialog, setWarehouseDialog] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState<WarehouseFormState>({ branch_id: "", code: "", name: "" });
  const [userDialog, setUserDialog] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ProfileRow | null>(null);

  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);

  const toggleBranchActive = async (branch: Branch, active: boolean) => {
    if (branch.is_main && !active) return notify.warning("لا يمكن تعطيل الفرع الرئيسي");
    const { error } = await supabase.from("branches").update({ is_active: active }).eq("id", branch.id);
    if (error) return notify.dbError("تعذّر تحديث حالة الفرع", error);
    invalidate();
  };

  const toggleWarehouseActive = async (warehouse: Warehouse, active: boolean) => {
    const { error } = await supabase.from("warehouses").update({ is_active: active }).eq("id", warehouse.id);
    if (error) return notify.dbError("تعذّر تحديث حالة المخزن", error);
    invalidate();
  };

  const branchColumns: ColumnDef<Branch>[] = [
    { accessorKey: "code", header: "الكود", cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
    {
      accessorKey: "name", header: "الاسم",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.is_main && <Badge variant="secondary" className="text-[10px]">رئيسي</Badge>}
        </div>
      ),
    },
    { accessorKey: "phone", header: "الهاتف", cell: ({ row }) => row.original.phone || "—" },
    { accessorKey: "address", header: "العنوان", cell: ({ row }) => row.original.address || "—" },
    {
      accessorKey: "is_active", header: "نشط",
      cell: ({ row }) => (
        <Switch checked={row.original.is_active} onCheckedChange={(v) => toggleBranchActive(row.original, v)} />
      ),
    },
    {
      id: "actions", header: "",
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
          const b = row.original;
          setBranchForm({ id: b.id, code: b.code, name: b.name, name_en: b.name_en ?? "", address: b.address ?? "", phone: b.phone ?? "" });
          setBranchDialog(true);
        }}>
          <Pencil className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  const warehouseColumns: ColumnDef<Warehouse>[] = [
    { accessorKey: "code", header: "الكود", cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
    { accessorKey: "name", header: "الاسم", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "branch_id", header: "الفرع", cell: ({ row }) => branchById.get(row.original.branch_id)?.name ?? "—" },
    {
      accessorKey: "is_active", header: "نشط",
      cell: ({ row }) => (
        <Switch checked={row.original.is_active} onCheckedChange={(v) => toggleWarehouseActive(row.original, v)} />
      ),
    },
    {
      id: "actions", header: "",
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
          const w = row.original;
          setWarehouseForm({ id: w.id, branch_id: w.branch_id, code: w.code, name: w.name });
          setWarehouseDialog(true);
        }}>
          <Pencil className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  const userColumns: ColumnDef<ProfileRow>[] = [
    { accessorKey: "full_name", header: "المستخدم", cell: ({ row }) => <span className="font-medium">{row.original.full_name || "بدون اسم"}</span> },
    {
      id: "branches", header: "الفروع المسموح بها",
      cell: ({ row }) => {
        const rows = allAssignments.filter((a) => a.user_id === row.original.id);
        if (rows.length === 0) return <Badge variant="outline" className="text-[10px]">كل الفروع</Badge>;
        return (
          <div className="flex flex-wrap gap-1">
            {rows.map((a) => (
              <Badge key={a.branch_id} variant={a.is_default ? "default" : "secondary"} className="text-[10px]">
                {branchById.get(a.branch_id)?.name ?? "—"}
                {a.is_default ? " ★" : ""}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: "actions", header: "",
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" className="h-8" onClick={() => { setSelectedProfile(row.original); setUserDialog(true); }}>
          <Pencil className="w-4 h-4 ml-1" /> تحديد الفروع
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Building2}
        title="الفروع والمخازن"
        description="إدارة الهيكل التنظيمي: الفروع، مخازن كل فرع، وصلاحيات وصول المستخدمين"
      />

      <Tabs defaultValue="branches" dir="rtl">
        <TabsList>
          <TabsTrigger value="branches" className="gap-1.5"><Building2 className="w-3.5 h-3.5" /> الفروع</TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-1.5"><WarehouseIcon className="w-3.5 h-3.5" /> المخازن</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users className="w-3.5 h-3.5" /> صلاحيات المستخدمين</TabsTrigger>
        </TabsList>

        <TabsContent value="branches" className="space-y-3 pt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setBranchForm(emptyBranchForm); setBranchDialog(true); }}>
              <Plus className="w-4 h-4 ml-1" /> إضافة فرع
            </Button>
          </div>
          <DataTable columns={branchColumns} data={branches} isLoading={branchesLoading} showPagination={false} showSearch={false} />
        </TabsContent>

        <TabsContent value="warehouses" className="space-y-3 pt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setWarehouseForm({ branch_id: branches[0]?.id ?? "", code: "", name: "" }); setWarehouseDialog(true); }}>
              <Plus className="w-4 h-4 ml-1" /> إضافة مخزن
            </Button>
          </div>
          <DataTable columns={warehouseColumns} data={warehouses} isLoading={warehousesLoading} showPagination={false} showSearch={false} />
        </TabsContent>

        <TabsContent value="users" className="space-y-3 pt-3">
          <DataTable columns={userColumns} data={profiles} showPagination={false} showSearch={false} />
        </TabsContent>
      </Tabs>

      <BranchDialog open={branchDialog} onOpenChange={setBranchDialog} initial={branchForm} onSaved={invalidate} />
      <WarehouseDialog open={warehouseDialog} onOpenChange={setWarehouseDialog} initial={warehouseForm} branches={branches} onSaved={invalidate} />
      <UserBranchesDialog
        open={userDialog}
        onOpenChange={setUserDialog}
        profile={selectedProfile}
        branches={branches}
        assignments={selectedProfile ? allAssignments.filter((a) => a.user_id === selectedProfile.id) : []}
        onSaved={invalidate}
      />
    </div>
  );
}
