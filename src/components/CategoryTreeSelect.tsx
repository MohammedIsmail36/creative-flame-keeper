import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronLeft, Folder, FolderOpen, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryItem {
  id: string;
  name: string;
  parent_id?: string | null;
}

interface TreeNode extends CategoryItem {
  children: TreeNode[];
}

interface CategoryTreeSelectProps {
  categories: CategoryItem[];
  value: string;
  onValueChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}

function buildTree(items: CategoryItem[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  items.forEach(item => map.set(item.id, { ...item, children: [] }));
  const roots: TreeNode[] = [];
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

function getFullPath(id: string, items: CategoryItem[]): string {
  const map = new Map(items.map(i => [i.id, i]));
  const parts: string[] = [];
  let current = map.get(id);
  while (current) {
    parts.unshift(current.name);
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }
  return parts.join(" / ");
}

function TreeNodeItem({
  node,
  level,
  selectedId,
  onSelect,
}: {
  node: TreeNode;
  level: number;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedId;

  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex items-center gap-1.5 w-full text-right px-2 py-1.5 text-sm rounded-md transition-colors hover:bg-accent",
          isSelected && "bg-primary/10 text-primary font-medium"
        )}
        style={{ paddingRight: `${level * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <span
            className="shrink-0 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            <ChevronLeft className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "-rotate-90")} />
          </span>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {hasChildren ? (
          expanded ? <FolderOpen className="h-3.5 w-3.5 text-primary/70 shrink-0" /> : <Folder className="h-3.5 w-3.5 text-primary/70 shrink-0" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="flex-1 truncate">{node.name}</span>
        {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map(child => (
            <TreeNodeItem key={child.id} node={child} level={level + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryTreeSelect({ categories, value, onValueChange, placeholder = "اختر التصنيف", className }: CategoryTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const tree = useMemo(() => buildTree(categories), [categories]);
  const displayText = value ? getFullPath(value, categories) : placeholder;

  const handleSelect = (id: string) => {
    onValueChange(id === value ? "" : id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className={cn("justify-between font-normal", !value && "text-muted-foreground", className)}>
          <span className="truncate">{displayText}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1 max-h-64 overflow-y-auto" align="start" dir="rtl">
        {tree.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">لا توجد تصنيفات</p>
        ) : (
          tree.map(node => (
            <TreeNodeItem key={node.id} node={node} level={0} selectedId={value} onSelect={handleSelect} />
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
