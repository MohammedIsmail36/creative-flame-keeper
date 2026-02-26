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
import { Plus, Pencil, Trash2, ArrowRight, ChevronDown, ChevronLeft, FolderTree } from "lucide-react";
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

// ─── Tree Node Component ───
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
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children.length > 0;
  const descendantCount = countDescendants(node);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 py-2 px-3 rounded-lg transition-colors hover:bg-muted/50",
          !node.is_active && "opacity-50"
        )}
        style={{ paddingRight: `${12 + level * 24}px` }}
      >
        {/* Expand/Collapse */}
        <button
          onClick={() => hasChildren && setExpanded(!expanded)}
          className={cn(
            "flex items-center justify-center w-6 h-6 rounded transition-colors",
            hasChildren ? "hover:bg-muted cursor-pointer" : "cursor-default"
          )}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <span className="w-4 h-4 flex items-center justify-center text-muted-foreground/40">•</span>
          )}
        </button>

        {/* Name */}
        <span className="font-medium text-foreground flex-1">{node.name}</span>

        {/* Description */}
        {node.description && (
          <span className="text-xs text-muted-foreground hidden sm:inline max-w-[200px] truncate">
            {node.description}
          </span>
        )}

        {/* Badges */}
        {hasChildren && (
          <Badge variant="outline" className="text-xs">
            {descendantCount} فرعي
          </Badge>
        )}

        {/* Status Toggle */}
        <div onClick={e => e.stopPropagation()}>
          <Switch
            checked={node.is_active}
            onCheckedChange={() => onToggleActive(node)}
            className="scale-90"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAddChild(node.id)} title="إضافة فرعي">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(node)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(node)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="border-r border-border/50 mr-6" style={{ marginRight: `${24 + level * 24}px` }}>
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

// ─── Main Page ───
export default function CategoryManagement() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Category | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete dialog
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
    setEditItem(null);
    setParentId(pId);
    setFormName("");
    setFormDesc("");
    setDialogOpen(true);
  }

  function openEdit(item: Category) {
    setEditItem(item);
    setParentId(item.parent_id);
    setFormName(item.name);
    setFormDesc(item.description || "");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast({ title: "تنبيه", description: "يرجى إدخال الاسم", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      name: formName.trim(),
      description: formDesc.trim() || null,
      parent_id: parentId || null,
    };

    try {
      if (editItem) {
        // Prevent setting parent to self or descendant
        if (parentId === editItem.id) {
          toast({ title: "خطأ", description: "لا يمكن تعيين التصنيف كأب لنفسه", variant: "destructive" });
          setSaving(false);
          return;
        }
        const { error } = await (supabase.from("product_categories") as any).update(payload).eq("id", editItem.id);
        if (error) throw error;
        toast({ title: "تم التحديث" });
      } else {
        const { error } = await (supabase.from("product_categories") as any).insert(payload);
        if (error) throw error;
        toast({ title: "تمت الإضافة" });
      }
      setDialogOpen(false);
      fetchItems();
    } catch (error: any) {
      const msg = error.message?.includes("duplicate") ? "الاسم موجود مسبقاً" : error.message;
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      // Check if has children
      const childCount = items.filter(i => i.parent_id === deleteTarget.id).length;
      if (childCount > 0) {
        toast({ title: "لا يمكن الحذف", description: `هذا التصنيف يحتوي على ${childCount} تصنيف فرعي. احذف الفرعيات أولاً أو انقلها.`, variant: "destructive" });
        setDeleteDialogOpen(false);
        return;
      }
      // Check if has products
      const { count } = await (supabase.from("products") as any).select("id", { count: "exact", head: true }).eq("category_id", deleteTarget.id);
      if (count && count > 0) {
        toast({ title: "لا يمكن الحذف", description: `هذا التصنيف مرتبط بـ ${count} منتج. قم بتعطيله بدلاً من حذفه.`, variant: "destructive" });
        setDeleteDialogOpen(false);
        return;
      }
      const { error } = await (supabase.from("product_categories") as any).delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "تم الحذف" });
      setDeleteDialogOpen(false);
      fetchItems();
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <FolderTree className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">إدارة التصنيفات</h1>
          <Badge variant="secondary">{items.length} تصنيف</Badge>
        </div>
        <Button onClick={() => openAdd(null)} className="gap-2">
          <Plus className="h-4 w-4" />
          تصنيف رئيسي جديد
        </Button>
      </div>

      {/* Tree */}
      <div className="rounded-lg border bg-card p-2 min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">جاري التحميل...</div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <FolderTree className="h-8 w-8" />
            <p>لا توجد تصنيفات بعد</p>
            <Button variant="outline" size="sm" onClick={() => openAdd(null)}>
              <Plus className="h-4 w-4 ml-1" />
              أضف أول تصنيف
            </Button>
          </div>
        ) : (
          tree.map(node => (
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
          ))
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editItem ? "تعديل تصنيف" : "إضافة تصنيف"}</DialogTitle>
            <DialogDescription>
              {parentId ? `فرعي من: ${getFullPath(items, parentId)}` : "تصنيف رئيسي (بدون أب)"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الاسم *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="اسم التصنيف" onKeyDown={e => e.key === "Enter" && handleSave()} />
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="وصف التصنيف (اختياري)" />
            </div>
            <div className="space-y-2">
              <Label>التصنيف الأب</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={parentId || ""}
                onChange={e => setParentId(e.target.value || null)}
              >
                <option value="">بدون (تصنيف رئيسي)</option>
                {parentOptions.map(p => (
                  <option key={p.id} value={p.id}>
                    {getFullPath(items, p.id)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSave} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ"}</Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>سيتم حذف "{deleteTarget?.name}" نهائياً. هل تريد المتابعة؟</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button variant="destructive" onClick={handleDelete}>حذف نهائي</Button>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>تراجع</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
