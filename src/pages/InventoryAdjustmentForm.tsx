import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  createJournalEntry,
  createReverseJournalEntry,
} from "@/lib/journal-writer";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useNavigationGuard } from "@/hooks/use-navigation-guard";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
import { PageHeader } from "@/components/PageHeader";
import { PageSkeleton } from "@/components/PageSkeleton";
import { ExportMenu } from "@/components/ExportMenu";
import { SectionHeader } from "@/components/SectionHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CountingSheet } from "@/components/inventory-count/CountingSheet";
import { ReviewSheet } from "@/components/inventory-count/ReviewSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerInput } from "@/components/DatePickerInput";
import { notify } from "@/lib/notify";
import { ACCOUNT_CODES } from "@/lib/constants";
import {
  ProductWithBrand,
  formatProductDisplay,
  PRODUCT_SELECT_FIELDS,
} from "@/lib/product-utils";
import {
  CountLine,
  countProgress,
  detectStockDrift,
  DriftLine,
  isCounted,
  lineDifference,
  lineDifferenceValue,
  linesWithDifference,
  summarizeCount,
} from "@/lib/inventory-count";
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  ClipboardCheck,
  Loader2,
  PlayCircle,
  RotateCcw,
  Save,
  StickyNote,
  Trash2,
  Wand2,
} from "lucide-react";

type Product = ProductWithBrand & { quantity_on_hand: number };

const AUTOSAVE_MS = 700;

export default function InventoryAdjustmentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { settings, formatCurrency } = useSettings();
  const isNew = !id;
  const canEdit = role === "admin" || role === "accountant";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [adjustmentNumber, setAdjustmentNumber] = useState<number | null>(null);
  const [adjustmentDate, setAdjustmentDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [description, setDescription] = useState("");
  const [countedByName, setCountedByName] = useState("");
  const [status, setStatus] = useState("draft");
  const [lines, setLines] = useState<CountLine[]>([]);

  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmMatchRest, setConfirmMatchRest] = useState(false);
  const [drift, setDrift] = useState<DriftLine[]>([]);

  const navGuard = useNavigationGuard(isDirty);

  // ── مخزن التعديلات المؤجلة أثناء العد (حفظ تلقائي) ─────────────────────
  const pendingRef = useRef<
    Map<string, { counted_quantity: number | null; notes: string }>
  >(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autosaving, setAutosaving] = useState(false);

  const flushPending = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const entries = Array.from(pendingRef.current.entries());
    if (entries.length === 0) return;
    pendingRef.current.clear();
    setAutosaving(true);
    try {
      for (const [lineId, patch] of entries) {
        const { error } = await (
          supabase.from("inventory_adjustment_items") as any
        )
          .update({
            counted_quantity: patch.counted_quantity,
            notes: patch.notes || null,
            counted_at: patch.counted_quantity === null ? null : new Date().toISOString(),
          })
          .eq("id", lineId);
        if (error) throw error;
      }
      setIsDirty(false);
    } catch (e: any) {
      notify.error("تعذر حفظ العد", e.message);
    } finally {
      setAutosaving(false);
    }
  }, []);

  const queueSave = useCallback(
    (line: CountLine) => {
      pendingRef.current.set(line.id, {
        counted_quantity: line.counted_quantity,
        notes: line.notes,
      });
      setIsDirty(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flushPending(), AUTOSAVE_MS);
    },
    [flushPending],
  );

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function loadData() {
    const { data: prodData } = await supabase
      .from("products")
      .select(PRODUCT_SELECT_FIELDS)
      .eq("is_active", true)
      .order("name");
    setProducts((prodData as any) || []);

    if (!id) {
      setLoading(false);
      return;
    }

    const { data: adj } = await (supabase.from("inventory_adjustments") as any)
      .select("*")
      .eq("id", id)
      .single();

    if (adj) {
      setAdjustmentNumber(adj.adjustment_number);
      setAdjustmentDate(adj.adjustment_date);
      setDescription(adj.description || "");
      setCountedByName(adj.counted_by_name || "");
      setStatus(adj.status);

      const { data: adjItems } = await (
        supabase.from("inventory_adjustment_items") as any
      )
        .select("*, products(code, name, model_number, product_brands(name))")
        .eq("adjustment_id", id);

      const mapped: CountLine[] = (adjItems || []).map((it: any) => ({
        id: it.id,
        product_id: it.product_id,
        code: it.products?.code || "",
        product_name: it.products
          ? formatProductDisplay(
              it.products.name,
              it.products.product_brands?.name,
              it.products.model_number,
            )
          : "",
        system_quantity: Number(it.system_quantity),
        counted_quantity:
          it.counted_quantity === null || it.counted_quantity === undefined
            ? adj.status === "approved" || adj.status === "cancelled"
              ? Number(it.actual_quantity)
              : null
            : Number(it.counted_quantity),
        unit_cost: Number(it.unit_cost),
        is_extra: Boolean(it.is_extra),
        notes: it.notes || "",
      }));
      mapped.sort((a, b) => a.code.localeCompare(b.code, "en"));
      setLines(mapped);
    }
    setLoading(false);
  }

  const progress = countProgress(lines);
  const summary = summarizeCount(lines);
  const netDifference = summary.net;

  const isDraft = status === "draft";
  const isCounting = status === "counting";
  const isReview = status === "review";
  const isApproved = status === "approved";
  const isCancelled = status === "cancelled";

  // ── رأس المستند ────────────────────────────────────────────────────────
  async function saveHeader(): Promise<string | null> {
    if (isNew) {
      const { data, error } = await (
        supabase.from("inventory_adjustments") as any
      )
        .insert({
          adjustment_date: adjustmentDate,
          description,
          counted_by_name: countedByName || null,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data.id;
    }
    const { error } = await (supabase.from("inventory_adjustments") as any)
      .update({
        adjustment_date: adjustmentDate,
        description,
        counted_by_name: countedByName || null,
      })
      .eq("id", id);
    if (error) throw error;
    return id!;
  }

  async function handleSaveDraft() {
    if (saving) return;
    setSaving(true);
    try {
      const newId = await saveHeader();
      notify.success("تم حفظ مستند الجرد");
      setIsDirty(false);
      navGuard.allowNext();
      if (isNew && newId) navigate(`/inventory-adjustments/${newId}`);
    } catch (e: any) {
      notify.error("خطأ في الحفظ", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStartCount() {
    if (saving) return;
    setSaving(true);
    try {
      const targetId = await saveHeader();
      if (!targetId) throw new Error("تعذر حفظ رأس المستند");
      const { data, error } = await (supabase.rpc as any)(
        "start_inventory_count",
        { p_adjustment_id: targetId },
      );
      if (error) throw error;
      const count = Number(data || 0);
      if (count === 0) {
        notify.error(
          "لا توجد أصناف للجرد",
          "لا يوجد أي منتج نشط برصيد أكبر من صفر.",
        );
      } else {
        notify.success("بدأ الجرد", `تم توليد ${count} صنف للعد`);
      }
      setIsDirty(false);
      navGuard.allowNext();
      if (isNew) {
        navigate(`/inventory-adjustments/${targetId}`);
      } else {
        await loadData();
      }
    } catch (e: any) {
      notify.error("تعذر بدء الجرد", e.message);
    } finally {
      setSaving(false);
      setConfirmStart(false);
    }
  }

  // ── العد ───────────────────────────────────────────────────────────────
  function handleCountedChange(lineId: string, value: number | null) {
    setLines((prev) => {
      const next = prev.map((l) =>
        l.id === lineId ? { ...l, counted_quantity: value } : l,
      );
      const changed = next.find((l) => l.id === lineId);
      if (changed) queueSave(changed);
      return next;
    });
  }

  function handleNotesChange(lineId: string, value: string) {
    setLines((prev) => {
      const next = prev.map((l) =>
        l.id === lineId ? { ...l, notes: value } : l,
      );
      const changed = next.find((l) => l.id === lineId);
      if (changed) queueSave(changed);
      return next;
    });
  }

  async function handleAddExtraProduct(productId: string): Promise<string | null> {
    try {
      await flushPending();
      const { data, error } = await (supabase.rpc as any)(
        "add_inventory_count_extra_item",
        { p_adjustment_id: id, p_product_id: productId },
      );
      if (error) throw error;
      const newLineId = String(data);
      const product = products.find((p) => p.id === productId);
      setLines((prev) => {
        if (prev.some((l) => l.id === newLineId)) return prev;
        return [
          ...prev,
          {
            id: newLineId,
            product_id: productId,
            code: product?.code || "",
            product_name: product
              ? formatProductDisplay(
                  product.name,
                  product.product_brands?.name,
                  product.model_number,
                )
              : "",
            system_quantity: Number(product?.quantity_on_hand || 0),
            counted_quantity: null,
            unit_cost: Number((product as any)?.purchase_price || 0),
            is_extra: true,
            notes: "",
          },
        ];
      });
      notify.success("تمت إضافة الصنف إلى الجرد");
      return newLineId;
    } catch (e: any) {
      notify.error("تعذر إضافة الصنف", e.message);
      return null;
    }
  }

  async function handleFinishCount() {
    if (saving) return;
    setSaving(true);
    try {
      await flushPending();
      const { error } = await (supabase.rpc as any)("finish_inventory_count", {
        p_adjustment_id: id,
      });
      if (error) throw error;
      notify.success("انتهى العد", "راجع الفروق قبل اعتماد التسوية");
      await loadData();
    } catch (e: any) {
      notify.error("تعذر إنهاء العد", e.message);
    } finally {
      setSaving(false);
      setConfirmFinish(false);
    }
  }

  async function handleReopenCount() {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await (supabase.rpc as any)("reopen_inventory_count", {
        p_adjustment_id: id,
      });
      if (error) throw error;
      notify.success("تم الرجوع لمرحلة العد");
      await loadData();
    } catch (e: any) {
      notify.error("تعذر الرجوع للعد", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkRestAsMatching() {
    if (saving) return;
    setSaving(true);
    try {
      await flushPending();
      const { data, error } = await (supabase.rpc as any)(
        "mark_uncounted_as_matching",
        { p_adjustment_id: id },
      );
      if (error) throw error;
      notify.success(
        "تم اعتبار المتبقي مطابقاً",
        `تم تسجيل ${Number(data || 0)} صنف بكمية النظام`,
      );
      await loadData();
    } catch (e: any) {
      notify.error("تعذر تنفيذ الإجراء", e.message);
    } finally {
      setSaving(false);
      setConfirmMatchRest(false);
    }
  }

  // ── فحص تغيّر المخزون بين العد والاعتماد ───────────────────────────────
  async function openApproveDialog() {
    if (progress.remaining > 0) {
      notify.error(
        "لا يمكن اعتماد التسوية",
        `يوجد ${progress.remaining} صنف لم يُجرد. أكمل العد أو استخدم «اعتبار المتبقي مطابقاً للنظام».`,
      );
      return;
    }
    if (
      settings?.locked_until_date &&
      adjustmentDate <= settings.locked_until_date
    ) {
      notify.error(
        "الفترة مقفلة",
        `لا يمكن اعتماد تسوية بتاريخ ${adjustmentDate} — الفترة مقفلة حتى ${settings.locked_until_date}`,
      );
      return;
    }
    const ids = lines.map((l) => l.product_id);
    const current: Record<string, number> = {};
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase
        .from("products")
        .select("id, quantity_on_hand")
        .in("id", ids.slice(i, i + 200));
      (data || []).forEach((p: any) => {
        current[p.id] = Number(p.quantity_on_hand);
      });
    }
    setDrift(detectStockDrift(lines, current));
    setConfirmApprove(true);
  }

  // ── الاعتماد ───────────────────────────────────────────────────────────
  async function handleApprove() {
    if (!id || saving) return;
    setSaving(true);
    try {
      const effective = linesWithDifference(lines).map((l) => ({
        product_id: l.product_id,
        product_name: l.product_name,
        difference: lineDifference(l) as number,
        unit_cost: l.unit_cost,
        total_cost: lineDifferenceValue(l),
      }));

      const { data: invAccount } = await supabase
        .from("accounts")
        .select("id")
        .eq("code", ACCOUNT_CODES.INVENTORY)
        .single();
      if (!invAccount)
        throw new Error(
          "حساب المخزون غير موجود - تأكد من وجود حساب بكود " +
            ACCOUNT_CODES.INVENTORY,
        );

      const netAbs = Math.abs(netDifference);
      const jvLines: {
        account_id: string;
        debit: number;
        credit: number;
        description: string;
      }[] = [];

      if (netDifference < 0) {
        let lossAccount: { id: string } | null = null;
        const { data } = await supabase
          .from("accounts")
          .select("id")
          .eq("code", ACCOUNT_CODES.INVENTORY_ADJUSTMENT_LOSS)
          .single();
        lossAccount = data;
        if (!lossAccount) {
          const { data: created } = await supabase
            .from("accounts")
            .insert({
              code: ACCOUNT_CODES.INVENTORY_ADJUSTMENT_LOSS,
              name: "عجز المخزون",
              account_type: "expense",
              description: "خسائر ناتجة عن عجز الجرد",
            })
            .select()
            .single();
          lossAccount = created;
        }
        if (!lossAccount) throw new Error("تعذر إنشاء حساب عجز المخزون");
        jvLines.push({
          account_id: lossAccount.id,
          debit: netAbs,
          credit: 0,
          description: `تسوية مخزون ADJ-${adjustmentNumber} — صافي عجز`,
        });
        jvLines.push({
          account_id: invAccount.id,
          debit: 0,
          credit: netAbs,
          description: `تسوية مخزون ADJ-${adjustmentNumber} — تخفيض مخزون (صافي عجز)`,
        });
      } else if (netDifference > 0) {
        let gainAccount: { id: string } | null = null;
        const { data } = await supabase
          .from("accounts")
          .select("id")
          .eq("code", ACCOUNT_CODES.INVENTORY_ADJUSTMENT_GAIN)
          .single();
        gainAccount = data;
        if (!gainAccount) {
          const { data: created } = await supabase
            .from("accounts")
            .insert({
              code: ACCOUNT_CODES.INVENTORY_ADJUSTMENT_GAIN,
              name: "فائض المخزون",
              account_type: "revenue",
              description: "أرباح ناتجة عن فائض الجرد",
            })
            .select()
            .single();
          gainAccount = created;
        }
        if (!gainAccount) throw new Error("تعذر إنشاء حساب فائض المخزون");
        jvLines.push({
          account_id: invAccount.id,
          debit: netAbs,
          credit: 0,
          description: `تسوية مخزون ADJ-${adjustmentNumber} — زيادة مخزون (صافي فائض)`,
        });
        jvLines.push({
          account_id: gainAccount.id,
          debit: 0,
          credit: netAbs,
          description: `تسوية مخزون ADJ-${adjustmentNumber} — صافي فائض`,
        });
      }

      let journalEntryId: string | null = null;
      if (jvLines.length > 0) {
        journalEntryId = await createJournalEntry({
          entryDate: adjustmentDate,
          description: `تسوية مخزون - جرد رقم ADJ-${adjustmentNumber}`,
          status: "posted",
          lines: jvLines,
        });
      }

      // منع الكميات السالبة
      for (const item of effective) {
        if (item.difference < 0) {
          const { data: freshProd } = await supabase
            .from("products")
            .select("quantity_on_hand")
            .eq("id", item.product_id)
            .single();
          if (
            freshProd &&
            Number(freshProd.quantity_on_hand) + item.difference < 0
          ) {
            throw new Error(
              `الكمية بعد التسوية ستكون سالبة للمنتج: ${item.product_name}`,
            );
          }
        }
      }

      const adjustedProducts: { product_id: string; delta: number }[] = [];
      try {
        for (const item of effective) {
          const { error: qtyErr } = await (supabase.rpc as any)(
            "adjust_product_quantity",
            { p_product_id: item.product_id, p_delta: item.difference },
          );
          if (qtyErr) throw qtyErr;
          adjustedProducts.push({
            product_id: item.product_id,
            delta: item.difference,
          });

          const { error: movErr } = await (
            supabase.from("inventory_movements") as any
          ).insert({
            product_id: item.product_id,
            movement_type: "adjustment",
            quantity: item.difference,
            unit_cost: item.unit_cost,
            total_cost: item.total_cost,
            movement_date: adjustmentDate,
            reference_id: id,
            reference_type: "adjustment",
            notes: `تسوية جرد ADJ-${adjustmentNumber} - ${item.difference > 0 ? "فائض" : "عجز"}: ${Math.abs(item.difference)} وحدة`,
            created_by: user?.id,
          });
          if (movErr) throw movErr;
        }
      } catch (itemError) {
        let rollbackFailed = false;
        for (const adj of adjustedProducts) {
          try {
            const { error } = await (supabase.rpc as any)(
              "adjust_product_quantity",
              { p_product_id: adj.product_id, p_delta: -adj.delta },
            );
            if (error) throw error;
          } catch (e: any) {
            console.error("فشل التراجع عن كمية المنتج:", e);
            rollbackFailed = true;
          }
        }
        try {
          const { error } = await (supabase.from("inventory_movements") as any)
            .delete()
            .eq("reference_id", id)
            .eq("reference_type", "adjustment");
          if (error) throw error;
        } catch (e: any) {
          console.error("فشل حذف حركات المخزون:", e);
          rollbackFailed = true;
        }
        if (journalEntryId) {
          try {
            const { error } = await supabase
              .from("journal_entry_lines")
              .delete()
              .eq("journal_entry_id", journalEntryId);
            if (error) throw error;
          } catch (e: any) {
            console.error("فشل حذف سطور القيد:", e);
            rollbackFailed = true;
          }
          try {
            const { error } = await (supabase.from("journal_entries") as any)
              .delete()
              .eq("id", journalEntryId);
            if (error) throw error;
          } catch (e: any) {
            console.error("فشل حذف القيد:", e);
            rollbackFailed = true;
          }
        }
        if (rollbackFailed) {
          throw new Error(
            "فشل الاعتماد وفشل التراجع — يرجى مراجعة البيانات يدوياً",
          );
        }
        throw itemError;
      }

      await (supabase.from("inventory_adjustments") as any)
        .update({ status: "approved", journal_entry_id: journalEntryId })
        .eq("id", id);

      setStatus("approved");
      notify.success("تم اعتماد التسوية وتسجيل القيود بنجاح");
    } catch (e: any) {
      notify.error("خطأ في الاعتماد", e.message);
    } finally {
      setSaving(false);
      setConfirmApprove(false);
    }
  }

  async function handleCancelApproved() {
    if (!id) return;
    setSaving(true);
    try {
      for (const l of linesWithDifference(lines)) {
        const diff = lineDifference(l) as number;
        const { error: qtyErr } = await (supabase.rpc as any)(
          "adjust_product_quantity",
          { p_product_id: l.product_id, p_delta: -diff },
        );
        if (qtyErr) throw qtyErr;
      }

      const { error: delErr1 } = await (
        supabase.from("inventory_movements") as any
      )
        .delete()
        .eq("reference_id", id)
        .eq("reference_type", "adjustment");
      if (delErr1) console.warn("Delete adjustment movements error:", delErr1);

      const { error: delErr2 } = await (
        supabase.from("inventory_movements") as any
      )
        .delete()
        .eq("reference_id", id)
        .eq("reference_type", "inventory_adjustment");
      if (delErr2)
        console.warn("Delete inventory_adjustment movements error:", delErr2);

      const { data: adj } = await (supabase.from("inventory_adjustments") as any)
        .select("journal_entry_id")
        .eq("id", id)
        .single();

      if (adj?.journal_entry_id) {
        await createReverseJournalEntry({
          sourceEntryId: adj.journal_entry_id,
          entryDate: new Date().toISOString().split("T")[0],
          description: `عكس تسوية مخزون - جرد رقم ADJ-${adjustmentNumber}`,
        });
      }

      await (supabase.from("inventory_adjustments") as any)
        .update({ status: "cancelled" })
        .eq("id", id);

      setStatus("cancelled");
      notify.success(
        "تم إلغاء التسوية بنجاح",
        "تم استعادة كميات المخزون وتسجيل قيد عكسي",
      );
    } catch (e: any) {
      notify.error("خطأ في إلغاء التسوية", e.message);
    } finally {
      setSaving(false);
      setConfirmCancel(false);
    }
  }

  async function handleDeleteDraft() {
    if (!id || saving) return;
    setSaving(true);
    try {
      await (supabase.from("inventory_adjustment_items") as any)
        .delete()
        .eq("adjustment_id", id);
      await (supabase.from("inventory_adjustments") as any)
        .delete()
        .eq("id", id);
      notify.success("تم حذف مستند الجرد");
      setIsDirty(false);
      navGuard.allowNext();
      navigate("/inventory-adjustments");
    } catch {
      notify.error("خطأ في الحذف");
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  }

  const exportRows = useMemo(
    () =>
      lines.map((l, i) => {
        const diff = lineDifference(l);
        return [
          String(i + 1),
          l.code,
          l.product_name,
          String(l.system_quantity),
          isCounted(l) ? String(l.counted_quantity) : "لم يُجرد",
          diff === null ? "—" : String(diff),
          String(l.unit_cost),
          diff === null ? "0" : String(lineDifferenceValue(l)),
          l.notes || "",
        ];
      }),
    [lines],
  );

  if (loading) return <PageSkeleton variant="form" />;

  const headerEditable = canEdit && (isDraft || isCounting || isReview);

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={ClipboardCheck}
        title={isNew ? "جرد جديد" : "مستند جرد المخزون"}
        description="إثبات الواقع الفعلي للمخزون مقابل ما يتوقعه النظام، ثم اعتماد التسوية"
        badge={
          <>
            {!isNew && adjustmentNumber && (
              <span className="text-sm font-semibold text-muted-foreground border border-border px-3 py-1 rounded-lg bg-muted/50 font-mono tabular-nums">
                ADJ-{adjustmentNumber}
              </span>
            )}
            {!isNew && (
              <StatusBadge status={status} kind="adjustment" className="text-xs px-3 py-1" />
            )}
            {autosaving && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                جاري الحفظ…
              </span>
            )}
          </>
        }
        actions={
          <>
            {!isNew && lines.length > 0 && (
              <ExportMenu
                config={{
                  filenamePrefix: `inventory-count-ADJ-${adjustmentNumber ?? ""}`,
                  sheetName: `جرد ADJ-${adjustmentNumber ?? ""}`,
                  pdfTitle: `مستند جرد ADJ-${adjustmentNumber ?? ""}`,
                  pdfOrientation: "landscape",
                  headers: [
                    "#",
                    "كود المنتج",
                    "المنتج",
                    "كمية النظام",
                    "الكمية الفعلية",
                    "الفرق",
                    "تكلفة الوحدة",
                    "قيمة الفرق",
                    "ملاحظات",
                  ],
                  rows: exportRows,
                }}
              />
            )}

            {canEdit && isDraft && (
              <>
                <Button
                  variant="outline"
                  onClick={() => void handleSaveDraft()}
                  disabled={saving}
                  className="rounded-xl"
                >
                  <Save className="h-4 w-4 ml-1" />
                  حفظ المسودة
                </Button>
                <Button
                  onClick={() => setConfirmStart(true)}
                  disabled={saving}
                  className="rounded-xl"
                >
                  <PlayCircle className="h-4 w-4 ml-1" />
                  بدء الجرد
                </Button>
              </>
            )}

            {canEdit && isCounting && (
              <Button
                onClick={() => setConfirmFinish(true)}
                disabled={saving}
                className="rounded-xl"
              >
                <ClipboardCheck className="h-4 w-4 ml-1" />
                إنهاء العد والمراجعة
              </Button>
            )}

            {canEdit && isReview && (
              <>
                <Button
                  variant="outline"
                  onClick={() => void handleReopenCount()}
                  disabled={saving}
                  className="rounded-xl"
                >
                  <RotateCcw className="h-4 w-4 ml-1" />
                  العودة للعد
                </Button>
                {progress.remaining > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setConfirmMatchRest(true)}
                    disabled={saving}
                    className="rounded-xl"
                  >
                    <Wand2 className="h-4 w-4 ml-1" />
                    اعتبار المتبقي مطابقاً
                  </Button>
                )}
                <Button
                  onClick={() => void openApproveDialog()}
                  disabled={saving}
                  className="rounded-xl"
                >
                  <CheckCircle className="h-4 w-4 ml-1" />
                  اعتماد التسوية
                </Button>
              </>
            )}

            {canEdit && isApproved && (
              <Button
                variant="destructive"
                onClick={() => setConfirmCancel(true)}
                disabled={saving}
                className="rounded-xl"
              >
                <Ban className="h-4 w-4 ml-1" />
                إلغاء التسوية
              </Button>
            )}

            {role === "admin" && !isNew && (isDraft || isCounting) && (
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="rounded-xl text-destructive"
              >
                <Trash2 className="h-4 w-4 ml-1" />
                حذف
              </Button>
            )}
          </>
        }
      />

      {/* رأس المستند */}
      <div className="bg-card rounded-2xl border shadow-sm p-6 space-y-4">
        <SectionHeader icon={StickyNote} title="بيانات الجرد" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>تاريخ الجرد</Label>
            <DatePickerInput
              value={adjustmentDate}
              onChange={(v) => {
                setAdjustmentDate(v);
                setIsDirty(true);
              }}
              disabled={!headerEditable}
            />
          </div>
          <div className="space-y-2">
            <Label>المسؤول عن الجرد</Label>
            <Input
              value={countedByName}
              onChange={(e) => {
                setCountedByName(e.target.value);
                setIsDirty(true);
              }}
              placeholder="اسم القائم بالعد"
              disabled={!headerEditable}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>البيان / السبب</Label>
            <Input
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setIsDirty(true);
              }}
              placeholder="جرد دوري، جرد مفاجئ…"
              disabled={!headerEditable}
              className="rounded-xl"
            />
          </div>
        </div>

        {headerEditable && !isDraft && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSaveDraft()}
              disabled={saving}
              className="rounded-xl"
            >
              <Save className="h-4 w-4 ml-1" />
              حفظ بيانات الرأس
            </Button>
          </div>
        )}

        {isDraft && (
          <p className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-4 leading-relaxed">
            عند الضغط على <strong>بدء الجرد</strong> يقوم النظام بأخذ صورة لحظية
            للأصناف النشطة التي رصيدها أكبر من صفر، وينشئ قائمة العد تلقائياً.
            لن يظهر رصيد النظام أثناء العد حتى يكون العد فعلياً.
          </p>
        )}
      </div>

      {/* المحتوى حسب المرحلة */}
      {isCounting && (
        <CountingSheet
          lines={lines}
          products={products}
          readOnly={!canEdit}
          onCountedChange={handleCountedChange}
          onNotesChange={handleNotesChange}
          onAddExtraProduct={handleAddExtraProduct}
        />
      )}

      {(isReview || isApproved || isCancelled) && (
        <ReviewSheet lines={lines} formatCurrency={formatCurrency} />
      )}

      {isReview && progress.remaining > 0 && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            يوجد <strong>{progress.remaining}</strong> صنف لم يُجرد. لا يمكن
            اعتماد التسوية قبل حسمها — أكمل العد أو استخدم «اعتبار المتبقي
            مطابقاً» (يُسجَّل الإجراء على المستند).
          </div>
        </div>
      )}

      {/* حوارات التأكيد */}
      <ConfirmDialog
        open={confirmStart}
        onOpenChange={setConfirmStart}
        title="بدء الجرد"
        description="سيقوم النظام بتوليد قائمة العد من الأصناف النشطة التي رصيدها أكبر من صفر. أي عد سابق على هذا المستند سيُستبدل."
        confirmText="بدء الجرد"
        loading={saving}
        onConfirm={handleStartCount}
      />

      <ConfirmDialog
        open={confirmFinish}
        onOpenChange={setConfirmFinish}
        title="إنهاء العد والانتقال للمراجعة"
        description={
          progress.remaining > 0
            ? `يوجد ${progress.remaining} صنف لم يُجرد. يمكنك الانتقال للمراجعة، لكن الاعتماد سيبقى موقوفاً حتى تحسمها.`
            : "تم عدّ جميع الأصناف. سيتم إظهار كميات النظام والفروق في شاشة المراجعة."
        }
        confirmText="إنهاء العد"
        loading={saving}
        onConfirm={handleFinishCount}
      />

      <ConfirmDialog
        open={confirmMatchRest}
        onOpenChange={setConfirmMatchRest}
        title="اعتبار الأصناف المتبقية مطابقة للنظام"
        description={`سيتم تسجيل ${progress.remaining} صنف بكمية النظام نفسها (فرق صفر) دون عد فعلي. استخدم هذا الإجراء فقط عند التأكد.`}
        confirmText="تأكيد"
        loading={saving}
        onConfirm={handleMarkRestAsMatching}
      />

      <ConfirmDialog
        open={confirmApprove}
        onOpenChange={setConfirmApprove}
        title="اعتماد تسوية الجرد"
        description="سيتم تعديل كميات المخزون وتسجيل حركات مخزنية وقيد محاسبي بصافي الفرق."
        confirmText="اعتماد"
        loading={saving}
        onConfirm={handleApprove}
      >
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted/40 p-2">
              <div className="text-xs text-muted-foreground">فائض</div>
              <div className="font-semibold text-emerald-600 tabular-nums">
                {formatCurrency(summary.totalGain)}
              </div>
            </div>
            <div className="rounded-xl bg-muted/40 p-2">
              <div className="text-xs text-muted-foreground">عجز</div>
              <div className="font-semibold text-destructive tabular-nums">
                {formatCurrency(summary.totalLoss)}
              </div>
            </div>
            <div className="rounded-xl bg-muted/40 p-2">
              <div className="text-xs text-muted-foreground">الصافي</div>
              <div className="font-semibold tabular-nums">
                {formatCurrency(summary.net)}
              </div>
            </div>
          </div>
          {drift.length > 0 && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-3">
              <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200 mb-1">
                <AlertTriangle className="h-4 w-4" />
                تغيّر رصيد {drift.length} صنف في النظام بعد بدء الجرد
              </div>
              <ul className="text-xs text-amber-900/90 dark:text-amber-200/90 space-y-0.5 max-h-32 overflow-y-auto">
                {drift.slice(0, 12).map((d) => (
                  <li key={d.product_id} className="tabular-nums">
                    {d.code}: عند الجرد {d.snapshot_quantity} ← الآن{" "}
                    {d.current_quantity}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="إلغاء التسوية المعتمدة"
        description="سيتم استعادة كميات المخزون وحذف حركات الجرد وتسجيل قيد عكسي."
        confirmText="إلغاء التسوية"
        destructive
        loading={saving}
        onConfirm={handleCancelApproved}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="حذف مستند الجرد"
        description="سيتم حذف المستند وكل أسطر العد نهائياً."
        confirmText="حذف"
        destructive
        loading={saving}
        onConfirm={handleDeleteDraft}
      />

      <UnsavedChangesDialog
        open={navGuard.showDialog}
        onConfirm={navGuard.confirmNavigation}
        onCancel={navGuard.cancelNavigation}
      />
    </div>
  );
}
