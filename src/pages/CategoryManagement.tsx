import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowRight, ChevronDown, ChevronRight, FolderTree, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface TreeNode extends Category {
  children: TreeNode[];
}

function buildTree(items: Category[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  items.forEach(item => map.set(item.id, { ...item, children: [] }));
  items.forEach(item => {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function countDescendants(node: TreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function getFullPath(items: Category[], id: string): string {
  const map = new Map(items.map(i => [i.id, i]));
  const parts: string[] = [];
  let current = map.get(id);
  while (current) {
    parts.unshift(current.name);
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }
  return parts.join(" / ");
}

function CategoryTreeNode({
  node,
  level,
  allItems,
  onEdit,
  onDelete,
  onAddChild,
  onToggleActive,
}: {
  node: TreeNode;
  level: number;
  allItems: Category[];
  onEdit: (item: Category) => void;
  onDelete: (item: Category) => void;
  onAddChild: (parentId: string) => void;
  onToggleActive: (item: Category) => void;
}) {
  const [expanded, setExpanded] = useState(level < 1);
  const hasChildren = node.children.length > 0;
  const descendantCount = countDescendants(node);

  return (
    <div className={cn(level > 0 && "mr-4 border-r border-border/40")}>
      <div
        className={cn(
          "group flex items-center gap-3 py-2.5 px-3 rounded-md transition-all",
          "hover:bg-accent/50",
          !node.is_active && "opacity-40"
        )}
      >
        {/* Expand toggle */}
        <button
          onClick={() => hasChildren && setExpanded(!expanded)}
          className={cn(
            "flex items-center justify-center w-5 h-5 rounded-sm shrink-0",
            hasChildren ? "text-muted-foreground hover:text-foreground cursor-pointer" : "text-transparent"
          )}
        >
          {hasChildren && (expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
        </button>

        {/* Icon */}
        {hasChildren && expanded ? (
          <FolderOpen className="h-4 w-4 text-primary shrink-0" />
        ) : (
          <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        {/* Name & desc */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground">{node.name}</span>
          {node.description && (
            <span className="text-xs text-muted-foreground mr-2 hidden sm:inline"> — {node.description}</span>
          )}
        </div>

        {/* Count badge */}
        {hasChildren && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-normal">
            {descendantCount}
          </Badge>
        )}

        {/* Toggle */}
        <Switch
          checked={node.is_active}
          onCheckedChange={() => onToggleActive(node)}
          className="scale-75"
          onClick={e => e.stopPropagation()}
        />

        {/* Actions */}
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onAddChild(node.id)} title="إضافة فرعي">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(node)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete(node)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="mr-2">
          {node.children.map(child => (
            <CategoryTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              allItems={allItems}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onToggleActive={onToggleActive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryManagement() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Category | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase.from("product_categories") as any).select("*").order("name");
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const tree = buildTree(items);

  function openAdd(pId: string | null = null) {
    setEditItem(null); setParentId(pId); setFormName(""); setFormDesc(""); setDialogOpen(true);
  }

  function openEdit(item: Category) {
    setEditItem(item); setParentId(item.parent_id); setFormName(item.name); setFormDesc(item.description || ""); setDialogOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast({ title: "تنبيه", description: "يرجى إدخال الاسم", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = { name: formName.trim(), description: formDesc.trim() || null, parent_id: parentId || null };
    try {
      if (editItem) {
        if (parentId === editItem.id) {
          toast({ title: "خطأ", description: "لا يمكن تعيين التصنيف كأب لنفسه", variant: "destructive" });
          setSaving(false); return;
        }
        const { error } = await (supabase.from("product_categories") as any).update(payload).eq("id", editItem.id);
        if (error) throw error;
        toast({ title: "تم التحديث" });
      } else {
        const { error } = await (supabase.from("product_categories") as any).insert(payload);
        if (error) throw error;
        toast({ title: "تمت الإضافة" });
      }
      setDialogOpen(false); fetchItems();
    } catch (error: any) {
      const msg = error.message?.includes("duplicate") ? "الاسم موجود مسبقاً" : error.message;
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const childCount = items.filter(i => i.parent_id === deleteTarget.id).length;
      if (childCount > 0) {
        toast({ title: "لا يمكن الحذف", description: `يحتوي على ${childCount} تصنيف فرعي. احذفها أولاً.`, variant: "destructive" });
        setDeleteDialogOpen(false); return;
      }
      const { count } = await (supabase.from("products") as any).select("id", { count: "exact", head: true }).eq("category_id", deleteTarget.id);
      if (count && count > 0) {
        toast({ title: "لا يمكن الحذف", description: `مرتبط بـ ${count} منتج. قم بتعطيله بدلاً من حذفه.`, variant: "destructive" });
        setDeleteDialogOpen(false); return;
      }
      const { error } = await (supabase.from("product_categories") as any).delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "تم الحذف" }); setDeleteDialogOpen(false); fetchItems();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function toggleActive(item: Category) {
    await (supabase.from("product_categories") as any).update({ is_active: !item.is_active }).eq("id", item.id);
    fetchItems();
  }

  const parentOptions = items.filter(i => (editItem ? i.id !== editItem.id : true));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">إدارة التصنيفات</h1>
            <p className="text-xs text-muted-foreground">{items.length} تصنيف</p>
          </div>
        </div>
        <Button onClick={() => openAdd(null)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          تصنيف جديد
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">جاري التحميل...</div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
            <FolderTree className="h-10 w-10 opacity-30" />
            <p className="text-sm">لا توجد تصنيفات بعد</p>
            <Button variant="outline" size="sm" onClick={() => openAdd(null)}>
              <Plus className="h-4 w-4 ml-1" />
              أضف أول تصنيف
            </Button>
          </div>
        ) : (
          <div className="p-2">
            {tree.map(node => (
              <CategoryTreeNode
                key={node.id}
                node={node}
                level={0}
                allItems={items}
                onEdit={openEdit}
                onDelete={item => { setDeleteTarget(item); setDeleteDialogOpen(true); }}
                onAddChild={pid => openAdd(pid)}
                onToggleActive={toggleActive}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editItem ? "تعديل تصنيف" : "إضافة تصنيف"}</DialogTitle>
            <DialogDescription>
              {parentId ? `فرعي من: ${getFullPath(items, parentId)}` : "تصنيف رئيسي"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">الاسم *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="اسم التصنيف" onKeyDown={e => e.key === "Enter" && handleSave()} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">الوصف</Label>
              <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="اختياري" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">التصنيف الأب</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={parentId || ""}
                onChange={e => setParentId(e.target.value || null)}
              >
                <option value="">بدون (رئيسي)</option>
                {parentOptions.map(p => (
                  <option key={p.id} value={p.id}>{getFullPath(items, p.id)}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSave} disabled={saving} size="sm">{saving ? "جاري الحفظ..." : "حفظ"}</Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)} size="sm">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>حذف التصنيف</DialogTitle>
            <DialogDescription>سيتم حذف "{deleteTarget?.name}" نهائياً.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button variant="destructive" onClick={handleDelete} size="sm">حذف</Button>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} size="sm">تراجع</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
