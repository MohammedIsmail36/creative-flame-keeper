import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

const { isPeriodLocked, invokeDocumentRpc, deleteDraftDocument, saveDocumentDraft, saveAndPostDocument } = await import(
  "./document-actions"
);

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe("isPeriodLocked", () => {
  it("مقفلة إذا كان التاريخ يساوي أو يسبق تاريخ الإقفال", () => {
    expect(isPeriodLocked("2026-01-01", "2026-01-31")).toBe(true);
    expect(isPeriodLocked("2026-01-31", "2026-01-31")).toBe(true);
  });

  it("غير مقفلة بعد تاريخ الإقفال", () => {
    expect(isPeriodLocked("2026-02-01", "2026-01-31")).toBe(false);
  });

  it("غير مقفلة إذا لا يوجد تاريخ إقفال", () => {
    expect(isPeriodLocked("2020-01-01", null)).toBe(false);
    expect(isPeriodLocked("2020-01-01", undefined)).toBe(false);
    expect(isPeriodLocked("2020-01-01", "")).toBe(false);
  });
});

describe("invokeDocumentRpc", () => {
  it("ينجح عند success = true", async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    expect(await invokeDocumentRpc("post_sales_invoice", { p_invoice_id: "1" })).toEqual({
      success: true,
    });
    expect(rpc).toHaveBeenCalledWith("post_sales_invoice", { p_invoice_id: "1" });
  });

  it("يحافظ على بيانات النجاح التي تعيدها الدالة", async () => {
    rpc.mockResolvedValue({
      data: { success: true, invoice_id: "inv-1", invoice_number: 25 },
      error: null,
    });
    expect(await invokeDocumentRpc("save_sales_invoice_draft", {})).toEqual({
      success: true,
      invoice_id: "inv-1",
      invoice_number: 25,
    });
  });

  it("يعيد رفضًا منطقيًا مع رسالة الدالة دون isException", async () => {
    rpc.mockResolvedValue({ data: { success: false, error: "الفترة مقفلة" }, error: null });
    const r = await invokeDocumentRpc("unpost_sales_invoice", {});
    expect(r.success).toBe(false);
    expect(r.error).toBe("الفترة مقفلة");
    expect(r.isException).toBeUndefined();
  });

  it("يعلّم أخطاء قاعدة البيانات بـ isException", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const r = await invokeDocumentRpc("post_sales_invoice", {});
    expect(r).toEqual({ success: false, error: "permission denied", isException: true });
  });

  it("لا يرفع استثناءً عند فشل الشبكة", async () => {
    rpc.mockRejectedValue(new Error("Failed to fetch"));
    const r = await invokeDocumentRpc("post_sales_invoice", {});
    expect(r).toEqual({ success: false, error: "Failed to fetch", isException: true });
  });

  it("يتعامل مع data = null كرفض", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const r = await invokeDocumentRpc("post_sales_invoice", {});
    expect(r.success).toBe(false);
    expect(r.isException).toBeUndefined();
  });
});

describe("deleteDraftDocument", () => {
  it("يحذف المستند وبنوده بطلب ذري واحد", async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    await deleteDraftDocument({
      itemsTable: "sales_invoice_items",
      parentTable: "sales_invoices",
      parentKey: "invoice_id",
      id: "inv-1",
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("delete_document_draft", {
      p_table: "sales_invoices", p_id: "inv-1",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("يدعم مفتاح المرتجعات return_id", async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    await deleteDraftDocument({
      itemsTable: "sales_return_items",
      parentTable: "sales_returns",
      parentKey: "return_id",
      id: "ret-2",
    });
    expect(rpc).toHaveBeenCalledWith("delete_document_draft", {
      p_table: "sales_returns", p_id: "ret-2",
    });
  });

  it("يرفع خطأ المعاملة دون محاولة تعويض من الواجهة", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "fk violation" } });
    await expect(
      deleteDraftDocument({
        itemsTable: "sales_invoice_items",
        parentTable: "sales_invoices",
        parentKey: "invoice_id",
        id: "inv-1",
      }),
    ).rejects.toMatchObject({ message: "fk violation" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it("يرفع الخطأ إذا فشل حذف المستند نفسه", async () => {
    rpc.mockResolvedValue({ data: { success: false, error: "denied" }, error: null });
    await expect(
      deleteDraftDocument({
        itemsTable: "purchase_return_items",
        parentTable: "purchase_returns",
        parentKey: "return_id",
        id: "r1",
      }),
    ).rejects.toMatchObject({ message: "denied" });
  });
});

describe("saveDocumentDraft", () => {
  it("يرسل الرأس والبنود والمخزن معاً ويعيد المعرّف", async () => {
    rpc.mockResolvedValue({ data: { success: true, document_id: "draft-1" }, error: null });
    const header = { warehouse_id: "warehouse-2", total: 300 };
    const lines = [{ product_id: "product-1", quantity: 1, total: 300 }];
    expect(await saveDocumentDraft("sales_return", null, header, lines)).toBe("draft-1");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_document_draft", {
      p_kind: "sales_return", p_id: null, p_document: header, p_items: lines,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("لا يعدّ فشل إدراج البنود نجاحاً", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "line rejected" } });
    await expect(saveDocumentDraft("purchase_invoice", "draft-1", {}, []))
      .rejects.toThrow("line rejected");
  });
});

describe("saveAndPostDocument", () => {
  it("يحفظ التعديلات ويرحلها بطلب واحد دون حفظ منفصل", async () => {
    rpc.mockResolvedValue({ data: { success: true, document_id: "draft-1" }, error: null });
    const document = { warehouse_id: "warehouse-2", total: 300 };
    const items = [{ product_id: "product-1", quantity: 1, total: 300 }];
    expect(await saveAndPostDocument("purchase_invoice", "draft-1", document, items)).toBe("draft-1");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_and_post_document", {
      p_kind: "purchase_invoice", p_id: "draft-1", p_document: document, p_items: items,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("لا يؤكد نجاح الترحيل عند رفض المعاملة", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "insufficient stock" } });
    await expect(saveAndPostDocument("sales_invoice", "draft-1", {}, []))
      .rejects.toThrow("insufficient stock");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
