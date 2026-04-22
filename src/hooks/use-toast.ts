import * as React from "react";
import { toast as sonnerToast } from "sonner";

// Compatibility shim: routes legacy useToast/toast API to Sonner.
// All notifications now display via the single Sonner instance configured in App.tsx
// (top-center, 3s auto-dismiss, RTL, rich colors).

type Variant = "default" | "destructive" | "success" | "warning" | "info";

type ToastInput = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: Variant;
  duration?: number;
  action?: any;
  // any other legacy props are ignored safely
  [key: string]: any;
};

function renderNode(node: React.ReactNode): string {
  if (node === null || node === undefined || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  // For complex ReactNodes, fallback to empty string; sonner accepts ReactNode for description directly,
  // but title is safer as string.
  try {
    return String(node as any);
  } catch {
    return "";
  }
}

function toast(props: ToastInput = {}) {
  const { title, description, variant = "default", duration, ...rest } = props;
  const titleStr = renderNode(title) || (typeof description === "string" ? description : "");
  const opts: any = {
    description: title ? description : undefined,
    duration,
    ...rest,
  };

  let id: string | number;
  switch (variant) {
    case "destructive":
      id = sonnerToast.error(titleStr, { duration: duration ?? 4000, ...opts });
      break;
    case "success":
      id = sonnerToast.success(titleStr, opts);
      break;
    case "warning":
      id = sonnerToast.warning(titleStr, opts);
      break;
    case "info":
      id = sonnerToast.info(titleStr, opts);
      break;
    default:
      id = sonnerToast(titleStr, opts);
  }

  return {
    id: String(id),
    dismiss: () => sonnerToast.dismiss(id),
    update: (next: ToastInput) => {
      sonnerToast.dismiss(id);
      toast(next);
    },
  };
}

function useToast() {
  return {
    toast,
    dismiss: (toastId?: string | number) => sonnerToast.dismiss(toastId),
    toasts: [] as any[],
  };
}

export { useToast, toast };
