import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Generic hook for server-side paginated lists with filters.
 * Returns { rows, totalCount, isLoading, isFetching, refetch }.
 */
export interface PagedQueryParams {
  pageIndex: number;
  pageSize: number;
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = (require("react") as typeof import("react"))
    .useState<T>(value);
  const React = require("react") as typeof import("react");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Wrapper around useQuery with sensible defaults for paged lists. */
export function usePagedQuery<TRow>(
  key: readonly unknown[],
  fetcher: () => Promise<{ rows: TRow[]; totalCount: number }>,
  options?: { enabled?: boolean; staleTime?: number },
) {
  return useQuery({
    queryKey: key,
    queryFn: fetcher,
    placeholderData: keepPreviousData,
    staleTime: options?.staleTime ?? 30_000,
    enabled: options?.enabled,
  });
}
