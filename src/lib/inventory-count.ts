import { round2 } from "@/lib/utils";

/** سطر جرد واحد كما تعرضه الواجهة */
export interface CountLine {
  id: string;
  product_id: string;
  code: string;
  product_name: string;
  /** كمية النظام لحظة بدء الجرد (Snapshot) */
  system_quantity: number;
  /** null = لم يُجرد ، 0 = تم الجرد ولم يوجد فعليًا */
  counted_quantity: number | null;
  unit_cost: number;
  is_extra: boolean;
  notes: string;
}

/** حالات مستند الجرد */
export type CountStatus =
  | "draft"
  | "counting"
  | "review"
  | "approved"
  | "cancelled";

export function isCounted(line: CountLine): boolean {
  return line.counted_quantity !== null && line.counted_quantity !== undefined;
}

/** الفرق = الفعلي − النظام ، و null إذا لم يُجرد */
export function lineDifference(line: CountLine): number | null {
  if (!isCounted(line)) return null;
  return round2((line.counted_quantity as number) - line.system_quantity);
}

/** قيمة الفرق بالتكلفة (قيمة مطلقة) */
export function lineDifferenceValue(line: CountLine): number {
  const diff = lineDifference(line);
  if (diff === null) return 0;
  return round2(Math.abs(diff) * line.unit_cost);
}

export interface CountProgress {
  total: number;
  counted: number;
  remaining: number;
  percent: number;
}

export function countProgress(lines: CountLine[]): CountProgress {
  const total = lines.length;
  const counted = lines.filter(isCounted).length;
  const remaining = total - counted;
  return {
    total,
    counted,
    remaining,
    percent: total === 0 ? 0 : Math.round((counted / total) * 100),
  };
}

export interface CountSummary {
  totalGain: number;
  totalLoss: number;
  net: number;
  gainCount: number;
  lossCount: number;
  matchCount: number;
  uncountedCount: number;
}

export function summarizeCount(lines: CountLine[]): CountSummary {
  let totalGain = 0;
  let totalLoss = 0;
  let gainCount = 0;
  let lossCount = 0;
  let matchCount = 0;
  let uncountedCount = 0;

  for (const line of lines) {
    const diff = lineDifference(line);
    if (diff === null) {
      uncountedCount += 1;
      continue;
    }
    if (diff > 0) {
      gainCount += 1;
      totalGain += lineDifferenceValue(line);
    } else if (diff < 0) {
      lossCount += 1;
      totalLoss += lineDifferenceValue(line);
    } else {
      matchCount += 1;
    }
  }

  totalGain = round2(totalGain);
  totalLoss = round2(totalLoss);

  return {
    totalGain,
    totalLoss,
    net: round2(totalGain - totalLoss),
    gainCount,
    lossCount,
    matchCount,
    uncountedCount,
  };
}

export interface DriftLine {
  product_id: string;
  code: string;
  product_name: string;
  /** الكمية عند بدء الجرد */
  snapshot_quantity: number;
  /** الكمية الحالية في النظام */
  current_quantity: number;
}

/**
 * كشف الأصناف التي تغيّر رصيدها في النظام بين لحظة بدء الجرد ولحظة الاعتماد
 * (بيع أو شراء تم أثناء العد).
 */
export function detectStockDrift(
  lines: CountLine[],
  currentQuantities: Record<string, number>,
): DriftLine[] {
  const out: DriftLine[] = [];
  for (const line of lines) {
    const current = currentQuantities[line.product_id];
    if (current === undefined) continue;
    if (round2(current) !== round2(line.system_quantity)) {
      out.push({
        product_id: line.product_id,
        code: line.code,
        product_name: line.product_name,
        snapshot_quantity: line.system_quantity,
        current_quantity: current,
      });
    }
  }
  return out;
}

/** الأسطر التي ستُنشئ حركة مخزون فعلية عند الاعتماد */
export function linesWithDifference(lines: CountLine[]): CountLine[] {
  return lines.filter((l) => {
    const diff = lineDifference(l);
    return diff !== null && diff !== 0;
  });
}
