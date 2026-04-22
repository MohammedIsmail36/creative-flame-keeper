import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2 } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Unified Toaster — single source of truth for all notifications across the app.
 * - Position: top-center, RTL, system font (Tajawal/Inter via design tokens)
 * - Auto-dismiss: 3s (errors 4s)
 * - Vibrant semantic colors via index.css tokens (success / destructive / warning / primary)
 * - Custom icons + crisp typography + elegant shadow
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      duration={3000}
      dir="rtl"
      closeButton
      visibleToasts={3}
      gap={10}
      offset={20}
      icons={{
        success: <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />,
        error: <XCircle className="h-5 w-5" strokeWidth={2.5} />,
        warning: <AlertTriangle className="h-5 w-5" strokeWidth={2.5} />,
        info: <Info className="h-5 w-5" strokeWidth={2.5} />,
        loading: <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: [
            "group/toast pointer-events-auto relative flex w-full items-start gap-3",
            "rounded-xl border px-4 py-3.5 font-sans",
            "shadow-[0_10px_30px_-10px_hsl(220_20%_14%/0.18),0_4px_12px_-4px_hsl(220_20%_14%/0.08)]",
            "backdrop-blur-sm transition-all",
            "bg-card text-card-foreground border-border",
            "[&>button[data-close-button]]:absolute [&>button[data-close-button]]:top-1/2",
            "[&>button[data-close-button]]:-translate-y-1/2 [&>button[data-close-button]]:left-2",
            "[&>button[data-close-button]]:right-auto [&>button[data-close-button]]:h-6",
            "[&>button[data-close-button]]:w-6 [&>button[data-close-button]]:rounded-md",
            "[&>button[data-close-button]]:border-0 [&>button[data-close-button]]:bg-transparent",
            "[&>button[data-close-button]]:text-muted-foreground/60",
            "[&>button[data-close-button]]:hover:bg-muted [&>button[data-close-button]]:hover:text-foreground",
            "[&>button[data-close-button]]:transition-colors",
          ].join(" "),
          title: "text-sm font-bold leading-snug tracking-tight",
          description: "text-[13px] leading-relaxed text-muted-foreground mt-0.5 font-medium",
          icon: "flex shrink-0 items-center justify-center mt-0.5 [&>svg]:drop-shadow-sm",
          content: "flex flex-col gap-0.5 flex-1 min-w-0 pl-4",
          actionButton:
            "shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity",
          cancelButton:
            "shrink-0 rounded-md bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/70 transition-colors",
          // Semantic variants — vibrant left-border + tinted background
          success: [
            "!bg-[hsl(var(--success)/0.08)] !border-[hsl(var(--success)/0.25)]",
            "!border-r-4 !border-r-[hsl(var(--success))]",
            "[&>[data-icon]]:text-[hsl(var(--success))]",
            "[&_[data-title]]:text-[hsl(var(--success))]",
          ].join(" "),
          error: [
            "!bg-[hsl(var(--destructive)/0.08)] !border-[hsl(var(--destructive)/0.25)]",
            "!border-r-4 !border-r-[hsl(var(--destructive))]",
            "[&>[data-icon]]:text-[hsl(var(--destructive))]",
            "[&_[data-title]]:text-[hsl(var(--destructive))]",
          ].join(" "),
          warning: [
            "!bg-[hsl(var(--warning)/0.08)] !border-[hsl(var(--warning)/0.25)]",
            "!border-r-4 !border-r-[hsl(var(--warning))]",
            "[&>[data-icon]]:text-[hsl(var(--warning))]",
            "[&_[data-title]]:text-[hsl(var(--warning))]",
          ].join(" "),
          info: [
            "!bg-[hsl(var(--primary)/0.08)] !border-[hsl(var(--primary)/0.25)]",
            "!border-r-4 !border-r-[hsl(var(--primary))]",
            "[&>[data-icon]]:text-[hsl(var(--primary))]",
            "[&_[data-title]]:text-[hsl(var(--primary))]",
          ].join(" "),
          loading: [
            "!bg-card !border-border !border-r-4 !border-r-[hsl(var(--primary))]",
            "[&>[data-icon]]:text-[hsl(var(--primary))]",
          ].join(" "),
        },
      }}
      style={
        {
          fontFamily:
            "'Tajawal', 'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', sans-serif",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
export { toast } from "sonner";
