/**
 * Fetches all matching rows from a Supabase query in batches, reporting progress.
 *
 * Usage:
 *   const rows = await fetchAllPaged(
 *     () => supabase.from("expenses").select("*", { count: "exact" }).eq("status", "posted"),
 *     { batchSize: 500, onProgress: (loaded, total) => ... }
 *   );
 *
 * The `queryBuilder` is invoked once per batch so filters/order can be re-applied
 * (Supabase query builders are mutated by `.range()` so we rebuild for each call).
 */
export async function fetchAllPaged<T>(
  queryBuilder: () => any,
  opts: {
    batchSize?: number;
    onProgress?: (loaded: number, total: number) => void;
    maxRows?: number;
  } = {}
): Promise<T[]> {
  const batchSize = opts.batchSize ?? 500;
  const maxRows = opts.maxRows ?? 50000;

  // First batch: also retrieve exact count
  const first = await queryBuilder()
    .range(0, batchSize - 1)
    .order("created_at", { ascending: false } as any);

  // Some callers may pass a builder that already has its own ordering; if .order() throws
  // we fall back. But Supabase allows chaining multiple .order() calls safely.
  if (first.error) throw first.error;

  const total = Math.min(first.count ?? first.data?.length ?? 0, maxRows);
  let collected: T[] = (first.data ?? []) as T[];
  opts.onProgress?.(collected.length, total);

  while (collected.length < total) {
    const from = collected.length;
    const to = Math.min(from + batchSize, total) - 1;
    const next = await queryBuilder().range(from, to);
    if (next.error) throw next.error;
    collected = collected.concat((next.data ?? []) as T[]);
    opts.onProgress?.(collected.length, total);
    if (!next.data || next.data.length === 0) break;
  }

  return collected;
}
