import { useCallback, useEffect, useState } from "react";
import { useBlocker } from "react-router-dom";
import { useBeforeUnload } from "./use-before-unload";

/**
 * يعترض التنقل الداخلي (React Router) عند وجود تغييرات غير محفوظة،
 * ويُفعّل أيضاً تحذير المتصفح لحالات إغلاق التاب/التحديث.
 *
 * الاستخدام:
 * const guard = useNavigationGuard(isDirty);
 * <UnsavedChangesDialog open={guard.isBlocked} onStay={guard.cancel} onLeave={guard.confirm} />
 */
export function useNavigationGuard(isDirty: boolean) {
  // تحذير إغلاق التاب / إعادة التحميل
  useBeforeUnload(isDirty);

  // اعتراض التنقل الداخلي عبر React Router
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  const [saving, setSaving] = useState(false);

  // إذا اختفى isDirty أثناء وجود حظر نشط (مثلاً تم الحفظ)، نسمح بالمرور
  useEffect(() => {
    if (!isDirty && blocker.state === "blocked") {
      blocker.proceed();
    }
  }, [isDirty, blocker]);

  const cancel = useCallback(() => {
    if (blocker.state === "blocked") blocker.reset();
  }, [blocker]);

  const confirm = useCallback(() => {
    if (blocker.state === "blocked") blocker.proceed();
  }, [blocker]);

  const saveAndLeave = useCallback(
    async (saveFn: () => Promise<boolean | void> | boolean | void) => {
      setSaving(true);
      try {
        const result = await saveFn();
        if (result === false) {
          // فشل الحفظ - نبقي على الحظر
          return;
        }
        if (blocker.state === "blocked") blocker.proceed();
      } finally {
        setSaving(false);
      }
    },
    [blocker],
  );

  return {
    isBlocked: blocker.state === "blocked",
    cancel,
    confirm,
    saveAndLeave,
    saving,
  };
}
