/**
 * فلتر الفرع المشترك للتقارير.
 * الفرع النشط null = الشركة المجمّعة (كل الفروع).
 */
export function withBranchFilter<T>(query: T, branchId: string | null): T {
  if (!branchId) return query;
  return (query as any).eq("branch_id", branchId) as T;
}
