import { supabase } from "@/integrations/supabase/client";

/**
 * طبقة مشتركة لعمليات المستندات (فواتير البيع/الشراء والمرتجعات).
 * لا تحتوي أي منطق محاسبي — فقط توحيد الاستدعاءات المتكررة حرفيًا في النماذج.
 */

/** هل التاريخ يقع داخل فترة مقفلة؟ (نفس المقارنة المستخدمة سابقًا في كل نموذج) */
export function isPeriodLocked(
  documentDate: string,
  lockedUntilDate?: string | null,
): boolean {
  return Boolean(lockedUntilDate) && documentDate <= (lockedUntilDate as string);
}

function errorMessage(err: unknown): string | undefined {
  return (err as { message?: string } | null)?.message;
}

export interface DocumentRpcResult {
  success: boolean;
  error?: string;
  /** true إذا كان الفشل خطأ اتصال/قاعدة بيانات وليس رفضًا منطقيًا من الدالة. */
  isException?: boolean;
  [key: string]: unknown;
}

/**
 * استدعاء دوال قاعدة البيانات التي تُعيد `{ success, error }`.
 * لا ترفع استثناءً: أي خطأ شبكة/قاعدة بيانات يُعاد كـ `{ success: false, isException: true }`.
 */
export async function invokeDocumentRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<DocumentRpcResult> {
  try {
    const { data, error } = await (supabase.rpc as any)(fn, args);
    if (error) return { success: false, error: errorMessage(error), isException: true };
    const res = data as DocumentRpcResult | null;
    if (!res?.success) return { success: false, error: res?.error };
    return { ...res, success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error), isException: true };
  }
}


export interface DeleteDraftOptions {
  /** جدول البنود (مثال: `sales_invoice_items`) */
  itemsTable: string;
  /** جدول المستند الأب (مثال: `sales_invoices`) */
  parentTable: string;
  /** عمود الربط في جدول البنود (`invoice_id` أو `return_id`) */
  parentKey: "invoice_id" | "return_id";
  /** معرّف المستند */
  id: string;
}

/** حفظ الرأس والبنود في معاملة واحدة؛ لا كتابة مباشرة من النموذج. */
type DocumentKind = "sales_invoice" | "purchase_invoice" | "sales_return" | "purchase_return";

async function persistDocument(
  rpc: string,
  kind: DocumentKind,
  id: string | null,
  document: Record<string, unknown>,
  items: Record<string, unknown>[],
): Promise<string> {
  const result = await invokeDocumentRpc(rpc, {
    p_kind: kind, p_id: id, p_document: document, p_items: items,
  });
  if (!result.success) throw new Error(result.error || "تعذر حفظ المسودة");
  if (typeof result.document_id !== "string") throw new Error("لم يتم إرجاع معرّف المستند");
  return result.document_id;
}

export const saveDocumentDraft = (kind: DocumentKind, id: string | null,
  document: Record<string, unknown>, items: Record<string, unknown>[]) =>
  persistDocument("save_document_draft", kind, id, document, items);

export const saveAndPostDocument = (kind: DocumentKind, id: string | null,
  document: Record<string, unknown>, items: Record<string, unknown>[]) =>
  persistDocument("save_and_post_document", kind, id, document, items);

/** القاعدة تتحقق من المسودة وتحذف الرأس والبنود معاً. */
export async function deleteDraftDocument({ parentTable, id }: DeleteDraftOptions): Promise<void> {
  const result = await invokeDocumentRpc("delete_document_draft", { p_table: parentTable, p_id: id });
  if (!result.success) throw new Error(result.error || "تعذر حذف المسودة");
}
