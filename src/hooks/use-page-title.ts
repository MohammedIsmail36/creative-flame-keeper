import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { APP_NAME, buildPageTitle } from "@/lib/route-labels";

/**
 * Updates document.title based on the current route so each browser tab
 * shows a distinct, meaningful name (e.g., "فواتير البيع • نظام الباقي").
 */
export function usePageTitle(): string {
  const location = useLocation();
  const pageTitle = buildPageTitle(location.pathname);
  const fullTitle = `${pageTitle} • ${APP_NAME}`;

  useEffect(() => {
    document.title = fullTitle;
  }, [fullTitle]);

  return fullTitle;
}
