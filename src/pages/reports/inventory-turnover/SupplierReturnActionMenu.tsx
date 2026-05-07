import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Undo2, Tag, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Props {
  productId: string;
}

export function SupplierReturnActionMenu({ productId }: Props) {
  const navigate = useNavigate();
  return (
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
        <DropdownMenuItem onClick={() => navigate(`/products/${productId}`)}>
          <Eye className="h-3.5 w-3.5 ml-2" />
          عرض المنتج
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(`/products/${productId}/edit`)}>
          <Tag className="h-3.5 w-3.5 ml-2" />
          تعديل السعر / المنتج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
