import { useCallback, useRef, useState } from "react";
import { ConfirmDialog, ConfirmDialogProps } from "@/components/ConfirmDialog";

type ConfirmOptions = Pick<
  ConfirmDialogProps,
  "title" | "description" | "confirmText" | "cancelText" | "destructive"
>;

/**
 * استدعاء إجرائي لحوار التأكيد بدون تعريف حالة داخل كل شاشة.
 *
 * const { confirm, confirmDialog } = useConfirm();
 * ...
 * if (await confirm({ title: "حذف العميل", destructive: true })) doDelete();
 * ...
 * return <>{confirmDialog}</>;
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ title: "" });
  const [loading, setLoading] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setOpen(false);
    setLoading(false);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const confirmDialog = (
    <ConfirmDialog
      {...opts}
      open={open}
      loading={loading}
      onOpenChange={(o) => {
        if (!o) settle(false);
      }}
      onConfirm={() => settle(true)}
    />
  );

  return { confirm, confirmDialog, setConfirmLoading: setLoading };
}
