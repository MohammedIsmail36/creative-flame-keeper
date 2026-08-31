import { round2 } from "@/lib/utils";
import { BALANCE_TOLERANCE } from "@/lib/constants";
import {
  summarizeMovements,
  weightedAverageCost,
  inventoryValue,
  type InventoryMovementRow,
} from "@/lib/inventory-metrics";

/**
 * ─────────────────────────────────────────────────────────────
 *  reconciliation.ts — قواعد صحّة البيانات (منطق نقي قابل للاختبار)
 * ─────────────────────────────────────────────────────────────
 *  كل قاعدة تُعيد نتيجة موحّدة: سليم / انحراف + الصفوف المسبّبة.
 *  الشاشة تعرض فقط — لا تحسب.
 */

export type CheckSeverity = "ok" | "warning" | "error";

export interface CheckIssue {
  /** معرّف السجل المسبّب (منتج، قيد، عميل...) */
  id: string;
  /** وصف قصير للسجل (كود + اسم / رقم القيد) */
  label: string;
  /** القيمة المتوقعة */
  expected: number | string;
  /** القيمة الفعلية */
  actual: number | string;
  /** الفرق (رقمي فقط) */
  diff?: number;
  /** مسار لفتح المستند المسبّب */
  link?: string;
}

export interface CheckResult {
  key: string;
  title: string;
  /** ما يعنيه الانحراف عمليًا */
  meaning: string;
  severity: CheckSeverity;
  /** عدد السجلات التي فُحصت */
  checked: number;
  issues: CheckIssue[];
}

const ok = (
  key: string,
  title: string,
  meaning: string,
  checked: number,
): CheckResult => ({ key, title, meaning, severity: "ok", checked, issues: [] });

const withIssues = (
  base: Omit<CheckResult, "severity" | "issues">,
  issues: CheckIssue[],
  severity: CheckSeverity = "error",
): CheckResult => ({
  ...base,
  severity: issues.length > 0 ? severity : "ok",
  issues,
});

/* ─── 1) كمية المنتج = مجموع حركات المخزون ─── */

export interface ProductQtyRow {
  id: string;
  code: string;
  name: string;
  quantity_on_hand: number | string | null;
  purchase_price?: number | string | null;
}

export function checkProductQuantities(
  products: ProductQtyRow[],
  movements: InventoryMovementRow[],
  tolerance = BALANCE_TOLERANCE,
): CheckResult {
  const summaries = summarizeMovements(movements);
  const issues: CheckIssue[] = [];

  for (const p of products) {
    const expected = round2(summaries.get(p.id)?.quantity ?? 0);
    const actual = round2(Number(p.quantity_on_hand ?? 0));
    const diff = round2(actual - expected);
    if (Math.abs(diff) > tolerance) {
      issues.push({
        id: p.id,
        label: `[${p.code}] ${p.name}`,
        expected,
        actual,
        diff,
        link: `/products/${p.id}`,
      });
    }
  }

  return withIssues(
    {
      key: "product_quantities",
      title: "كمية المنتجات مطابقة لحركات المخزون",
      meaning:
        "الكمية المتاحة في بطاقة المنتج يجب أن تساوي صافي حركات المخزون. أي فرق يعني كمية غير مبرّرة بمستند.",
      checked: products.length,
    },
    issues,
  );
}

/* ─── 2) قيمة المخزون الدفترية = مجموع (كمية × WAC) ─── */

export interface InventoryValueCheck extends CheckResult {
  ledgerValue: number;
  computedValue: number;
}

export function checkInventoryValue(
  products: ProductQtyRow[],
  movements: InventoryMovementRow[],
  ledgerInventoryBalance: number,
  tolerance = 1,
): InventoryValueCheck {
  const summaries = summarizeMovements(movements);
  let computed = 0;

  for (const p of products) {
    const s = summaries.get(p.id);
    const wac = weightedAverageCost(s, Number(p.purchase_price ?? 0));
    computed += inventoryValue(Number(p.quantity_on_hand ?? 0), wac);
  }

  computed = round2(computed);
  const ledger = round2(ledgerInventoryBalance);
  const diff = round2(ledger - computed);
  const issues: CheckIssue[] =
    Math.abs(diff) > tolerance
      ? [
          {
            id: "inventory_account",
            label: "حساب المخزون (1104)",
            expected: computed,
            actual: ledger,
            diff,
            link: "/reports/inventory-reconciliation",
          },
        ]
      : [];

  return {
    ...withIssues(
      {
        key: "inventory_value",
        title: "قيمة المخزون الدفترية مطابقة للتقييم بـ WAC",
        meaning:
          "رصيد حساب المخزون في دفتر الأستاذ يجب أن يساوي مجموع (الكمية × متوسط التكلفة المرجّح) لكل المنتجات.",
        checked: products.length,
      },
      issues,
    ),
    ledgerValue: ledger,
    computedValue: computed,
  };
}

/* ─── 3) توازن القيود (رأس القيد وسطوره) ─── */

export interface JournalEntryRow {
  id: string;
  entry_number: number | string | null;
  posted_number?: number | string | null;
  total_debit: number | string | null;
  total_credit: number | string | null;
  status?: string | null;
}

export interface JournalLineRow {
  journal_entry_id: string;
  debit: number | string | null;
  credit: number | string | null;
}

const entryLabel = (e: JournalEntryRow) =>
  `قيد #${e.posted_number ?? e.entry_number ?? "—"}`;

export function checkJournalBalance(
  entries: JournalEntryRow[],
  lines: JournalLineRow[],
  tolerance = BALANCE_TOLERANCE,
): CheckResult {
  const perEntry = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const cur = perEntry.get(l.journal_entry_id) ?? { debit: 0, credit: 0 };
    cur.debit += Number(l.debit ?? 0);
    cur.credit += Number(l.credit ?? 0);
    perEntry.set(l.journal_entry_id, cur);
  }

  const issues: CheckIssue[] = [];
  for (const e of entries) {
    const sums = perEntry.get(e.id) ?? { debit: 0, credit: 0 };
    const debit = round2(sums.debit);
    const credit = round2(sums.credit);
    const headDebit = round2(Number(e.total_debit ?? 0));
    const headCredit = round2(Number(e.total_credit ?? 0));

    // (أ) سطور غير متوازنة
    if (Math.abs(debit - credit) > tolerance) {
      issues.push({
        id: e.id,
        label: `${entryLabel(e)} — سطور غير متوازنة`,
        expected: debit,
        actual: credit,
        diff: round2(debit - credit),
        link: `/journal/${e.id}`,
      });
      continue;
    }

    // (ب) رأس القيد لا يطابق مجموع السطور
    if (
      Math.abs(headDebit - debit) > tolerance ||
      Math.abs(headCredit - credit) > tolerance
    ) {
      issues.push({
        id: e.id,
        label: `${entryLabel(e)} — الإجمالي لا يطابق السطور`,
        expected: debit,
        actual: headDebit,
        diff: round2(headDebit - debit),
        link: `/journal/${e.id}`,
      });
    }
  }

  return withIssues(
    {
      key: "journal_balance",
      title: "توازن القيود المحاسبية",
      meaning:
        "كل قيد يجب أن يكون مجموع مدينه = مجموع دائنه، وأن يطابق إجمالي الرأس مجموع السطور.",
      checked: entries.length,
    },
    issues,
  );
}

/* ─── 4) القيود بلا سطور ─── */

export function checkOrphanEntries(
  entries: JournalEntryRow[],
  lines: JournalLineRow[],
): CheckResult {
  const withLines = new Set(lines.map((l) => l.journal_entry_id));
  const issues: CheckIssue[] = entries
    .filter((e) => !withLines.has(e.id))
    .map((e) => ({
      id: e.id,
      label: entryLabel(e),
      expected: "سطر واحد على الأقل",
      actual: "لا سطور",
      link: `/journal/${e.id}`,
    }));

  return withIssues(
    {
      key: "orphan_entries",
      title: "لا توجد قيود بلا سطور",
      meaning: "قيد بلا سطور لا أثر له محاسبيًا ويجب حذفه أو استكماله.",
      checked: entries.length,
    },
    issues,
  );
}

/* ─── 5) تسلسل أرقام النشر (posted_number) ─── */

export interface PostedNumberRow {
  id: string;
  posted_number: number | string | null;
  status?: string | null;
}

export function checkPostedNumberSequence(
  rows: PostedNumberRow[],
  label: string,
): CheckResult {
  const numbers = rows
    .map((r) => ({ id: r.id, n: Number(r.posted_number ?? 0) }))
    .filter((r) => r.n > 0)
    .sort((a, b) => a.n - b.n);

  const issues: CheckIssue[] = [];
  const seen = new Map<number, string>();

  for (let i = 0; i < numbers.length; i += 1) {
    const { id, n } = numbers[i];

    // تكرار
    if (seen.has(n)) {
      issues.push({
        id,
        label: `${label} — رقم مكرر ${n}`,
        expected: "رقم فريد",
        actual: n,
      });
    } else {
      seen.set(n, id);
    }

    // فراغ
    if (i > 0) {
      const prev = numbers[i - 1].n;
      if (n > prev + 1) {
        issues.push({
          id,
          label: `${label} — فراغ في التسلسل`,
          expected: prev + 1,
          actual: n,
          diff: n - prev - 1,
        });
      }
    }
  }

  return withIssues(
    {
      key: `posted_sequence_${label}`,
      title: `تسلسل أرقام ${label}`,
      meaning:
        "أرقام المستندات المنشورة يجب أن تكون متسلسلة وفريدة — الفراغ أو التكرار يعني مستندًا محذوفًا أو ترقيمًا مزدوجًا.",
      checked: numbers.length,
    },
    issues,
    "warning",
  );
}

/* ─── 6) رصيد الجهة (عميل/مورد) = رصيده في دفتر الأستاذ ─── */

export interface EntityBalanceRow {
  id: string;
  code: string;
  name: string;
  balance: number | string | null;
}

export function checkEntityBalances(
  entities: EntityBalanceRow[],
  ledgerBalances: Map<string, number>,
  kind: "customer" | "supplier",
  tolerance = BALANCE_TOLERANCE,
): CheckResult {
  const issues: CheckIssue[] = [];
  const basePath = kind === "customer" ? "/customers" : "/suppliers";

  for (const e of entities) {
    const expected = round2(ledgerBalances.get(e.id) ?? 0);
    const actual = round2(Number(e.balance ?? 0));
    const diff = round2(actual - expected);
    if (Math.abs(diff) > tolerance) {
      issues.push({
        id: e.id,
        label: `[${e.code}] ${e.name}`,
        expected,
        actual,
        diff,
        link: basePath,
      });
    }
  }

  return withIssues(
    {
      key: `entity_balances_${kind}`,
      title:
        kind === "customer"
          ? "أرصدة العملاء مطابقة لدفتر الأستاذ"
          : "أرصدة الموردين مطابقة لدفتر الأستاذ",
      meaning:
        "الرصيد المخزّن في بطاقة الجهة يجب أن يساوي صافي حركتها في حساب الذمم — أي فرق يعني ترحيلًا ناقصًا.",
      checked: entities.length,
    },
    issues,
  );
}

/* ─── ملخّص عام ─── */

export interface ReconciliationSummary {
  total: number;
  passed: number;
  warnings: number;
  errors: number;
  totalIssues: number;
  /** سليم تمامًا؟ */
  healthy: boolean;
}

export function summarizeChecks(checks: CheckResult[]): ReconciliationSummary {
  const errors = checks.filter((c) => c.severity === "error").length;
  const warnings = checks.filter((c) => c.severity === "warning").length;
  return {
    total: checks.length,
    passed: checks.filter((c) => c.severity === "ok").length,
    warnings,
    errors,
    totalIssues: checks.reduce((s, c) => s + c.issues.length, 0),
    healthy: errors === 0 && warnings === 0,
  };
}
