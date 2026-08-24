import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Undo2, Tag, Archive, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { DormantEnriched } from "./dormant-utils";

interface Props {
  product: DormantEnriched;
  onIgnore: (productId: string) => void;
  onChanged: () => void;
}

export function DormantActionMenu({ product, onIgnore, onChanged }: Props) {
  const navigate = useNavigate();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDeactivate = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", product.productId);
    setBusy(false);
    setConfirmDeactivate(false);
    if (error) {
      notify.error("تعذّر تعطيل المنتج: " + error.message);
      return;
    }
    notify.success("تم تعطيل المنتج");
    onChanged();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => navigate("/purchase-returns/new")}>
            <Undo2 className="h-3.5 w-3.5 ml-2" />
            إنشاء مرتجع مشتريات
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => navigate(`/products/${product.productId}/edit`)}
          >
            <Tag className="h-3.5 w-3.5 ml-2" />
            تعديل السعر / المنتج
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setConfirmDeactivate(true)}>
            <Archive className="h-3.5 w-3.5 ml-2" />
            تعطيل المنتج (أرشفة)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onIgnore(product.productId)}>
            <EyeOff className="h-3.5 w-3.5 ml-2" />
            استبعاد من التقرير
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        title="تعطيل المنتج؟"
        description={`سيتم إخفاء المنتج «${product.productName}» من قوائم البيع والشراء. يمكنك إعادة تفعيله لاحقاً من شاشة المنتجات.`}
        confirmText="تأكيد التعطيل"
        destructive
        loading={busy}
        onConfirm={handleDeactivate}
      />

    </>
  );
}
