import { useEffect } from "react";

/**
 * يعرض تحذير المتصفح عند محاولة مغادرة الصفحة مع تغييرات غير محفوظة.
 */
export function useBeforeUnload(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
