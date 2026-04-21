/**
 * Fetches all matching rows from a Supabase query in batches, reporting progress.
 *
 * The `queryBuilder` is invoked fresh for each batch (filters + ordering must be applied
 * inside the builder) — Supabase query objects are mutable and cannot be safely reused.
 *
 * The first call must select with `{ count: "exact" }` so the helper can determine the total.
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

  const first = await queryBuilder().range(0, batchSize - 1);
  if (first.error) throw first.error;

  const total = Math.min(first.count ?? first.data?.length ?? 0, maxRows);
  let collected: T[] = (first.data ?? []) as T[];
  opts.onProgress?.(collected.length, total);

  while (collected.length < total) {
    const from = collected.length;
    const to = Math.min(from + batchSize, total) - 1;
    const next = await queryBuilder().range(from, to);
    if (next.error) throw next.error;
    const batch = (next.data ?? []) as T[];
    if (batch.length === 0) break;
    collected = collected.concat(batch);
    opts.onProgress?.(collected.length, total);
  }

  return collected;
}
