import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Unified Toaster — single source of truth for all notifications.
 * - Position: top-center, RTL, system font (Tajawal)
 * - Auto-dismiss: 3s (errors 4s via use-toast shim)
 * - richColors: vibrant semantic colors with built-in icons
 * - Crisp typography, elegant shadow, themed via CSS vars
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
      richColors
      closeButton
      visibleToasts={3}
      gap={10}
      offset={20}
      toastOptions={{
        classNames: {
          toast: "toaster-toast",
          title: "toaster-title",
          description: "toaster-description",
          closeButton: "toaster-close",
        },
      }}
      style={
        {
          fontFamily:
            "'Tajawal', 'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', sans-serif",
          // Sonner CSS vars — override defaults for crisper look
          "--width": "380px",
          "--border-radius": "12px",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
export { toast } from "sonner";
